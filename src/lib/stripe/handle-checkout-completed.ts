import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { auth } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  account,
  stripeProcessedEvents,
  subscriptionPayments,
  tenantEvents,
  tenants,
  user as userTable,
} from "@/lib/schema";
import { InvalidCheckoutMetadataError, parseSessionMetadata } from "@/lib/stripe/checkout-metadata";
import {
  buildPaymentConfirmationEmailHtml,
  buildPaymentConfirmationEmailText,
} from "@/lib/tenants/payment-email";
import { generatePassword } from "@/lib/tenants/password";
import { calculatePeriodFromCycle } from "@/lib/tenants/period";
import { reactivateTenantWithPayment } from "@/lib/tenants/reactivate";
import { generateSlug, validateSlug } from "@/lib/tenants/slug";
import { SYSTEM_ACTOR_ID } from "@/lib/tenants/system-actor";
import { buildTenantUrl, PLAN_LIMITS } from "@/lib/tenants/tenant-config";
import { buildWelcomeEmailHtml, buildWelcomeEmailText } from "@/lib/tenants/welcome-email";

export class StripeWebhookError extends Error {
  constructor(
    public readonly code: "INVALID_METADATA" | "SLUG_CONFLICT" | "SIGNUP_FAILED",
    message: string
  ) {
    super(message);
    this.name = "StripeWebhookError";
  }
}

export interface HandleCheckoutCompletedResult {
  tenantId: string;
  action: "created" | "renewed";
  reactivated: boolean;
  emailSent: boolean;
}

function toLogMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Never log raw customer ids / emails — defense in depth against leaking PII
// into log aggregators.
function maskCustomerId(id: string): string {
  return `cus_****${id.slice(-4)}`;
}
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${(local ?? "").slice(0, 1)}***@${domain ?? ""}`;
}

function getCustomerId(session: Stripe.Checkout.Session): string | null {
  const customer = session.customer;
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getPaymentReference(session: Stripe.Checkout.Session): string | null {
  const intent = session.payment_intent;
  if (!intent) return session.id;
  return typeof intent === "string" ? intent : intent.id;
}

async function generateUniqueTenantSlug(companyName: string): Promise<string> {
  const base = generateSlug(companyName);
  let candidate = base;
  let suffix = 2;
  // Bounded loop — a real collision storm this deep would indicate a bug elsewhere.
  for (let i = 0; i < 50; i++) {
    if (!validateSlug(candidate).valid) {
      candidate = `${base}-${suffix}`;
      suffix++;
      continue;
    }
    const existing = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, candidate))
      .limit(1);
    if (!existing[0]) return candidate;
    candidate = `${base}-${suffix}`;
    suffix++;
  }
  throw new StripeWebhookError("SLUG_CONFLICT", "Unable to generate a unique slug");
}

function formatTrialDate(): null {
  return null; // Stripe-provisioned tenants never have a trial (AC5 — status='active').
}

async function handleCreation(
  session: Stripe.Checkout.Session,
  eventId: string,
  meta: ReturnType<typeof parseSessionMetadata>,
  customerId: string
): Promise<HandleCheckoutCompletedResult> {
  const paidAt = new Date(session.created * 1000);
  const dates = calculatePeriodFromCycle({ cycle: meta.billingCycle, paidAt });
  const slug = await generateUniqueTenantSlug(meta.companyName);

  const tenant = await db.transaction(async (tx: Tx) => {
    const [inserted] = await tx
      .insert(tenants)
      .values({
        name: meta.companyName,
        slug,
        status: "active",
        plan: meta.plan,
        maxUsers: PLAN_LIMITS[meta.plan].maxUsers,
        subscriptionStart: dates.periodStart,
        subscriptionEnd: dates.periodEnd,
        trialEndsAt: null,
        stripeCustomerId: customerId,
        stripeCheckoutSessionId: session.id,
      })
      .returning();
    if (!inserted) throw new Error("Tenant insert returned no row");

    await tx.insert(stripeProcessedEvents).values({
      eventId,
      eventType: "checkout.session.completed",
      tenantId: inserted.id,
    });

    await tx.insert(subscriptionPayments).values({
      tenantId: inserted.id,
      amount: meta.amountXof,
      currency: "XOF",
      paymentMethod: "stripe",
      paymentReference: getPaymentReference(session),
      paidAt,
      periodStart: dates.periodStart,
      periodEnd: dates.periodEnd,
      billingCycle: meta.billingCycle,
      confirmedBy: SYSTEM_ACTOR_ID,
      notes: `Stripe checkout ${session.id}`,
    });

    return inserted;
  });

  const subdomainUrl = buildTenantUrl(slug);
  const password = generatePassword();

  let adminUserId: string | undefined;
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: { email: meta.adminEmail, password, name: meta.adminName },
    });
    if (!signUpResult?.user) {
      throw new StripeWebhookError("SIGNUP_FAILED", "Better Auth signUpEmail returned no user");
    }
    adminUserId = signUpResult.user.id;

    await db
      .update(userTable)
      .set({ tenantId: tenant.id, companyId: tenant.id, role: "admin" })
      .where(eq(userTable.id, adminUserId));
  } catch (err) {
    // If signUpEmail succeeded but the subsequent link (UPDATE user) failed,
    // the Better Auth user/account still exist. Leaving them around would
    // make a Stripe retry's signUpEmail fail on duplicate email and
    // permanently block provisioning for a customer who already paid — so
    // delete them too, not just the tenant/payment/event rows.
    if (adminUserId) {
      await db.delete(account).where(eq(account.userId, adminUserId));
      await db.delete(userTable).where(eq(userTable.id, adminUserId));
    }
    // FK is ON DELETE SET NULL (not CASCADE), so the tenant delete alone
    // would leave the event id "processed" and block a clean Stripe retry —
    // delete the payment/stripe-event rows explicitly first.
    await db.delete(stripeProcessedEvents).where(eq(stripeProcessedEvents.tenantId, tenant.id));
    await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenant.id));
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    throw err instanceof StripeWebhookError
      ? err
      : new StripeWebhookError("SIGNUP_FAILED", toLogMessage(err));
  }

  let emailSent = false;
  try {
    const emailParams = {
      tenantName: tenant.name,
      subdomainUrl,
      adminEmail: meta.adminEmail,
      password,
      trialEndsAt: formatTrialDate(),
    };
    await sendEmail({
      to: meta.adminEmail,
      subject: "Bienvenue sur Quotation Logistique — vos identifiants",
      html: buildWelcomeEmailHtml(emailParams),
      text: buildWelcomeEmailText(emailParams),
    });
    emailSent = true;
  } catch (err) {
    console.error("Stripe webhook: welcome email failed", toLogMessage(err));
  }

  try {
    await db.insert(tenantEvents).values({
      tenantId: tenant.id,
      eventType: "created",
      actorId: SYSTEM_ACTOR_ID,
      before: null,
      after: {
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
        subscriptionEnd: tenant.subscriptionEnd?.toISOString() ?? null,
        maxUsers: tenant.maxUsers,
      },
      note: emailSent
        ? `Auto-activé via Stripe checkout ${session.id} — email envoyé`
        : `Auto-activé via Stripe checkout ${session.id} — email échoué`,
    });
    await db.insert(tenantEvents).values({
      tenantId: tenant.id,
      eventType: "payment_recorded",
      actorId: SYSTEM_ACTOR_ID,
      before: null,
      after: {
        amount: meta.amountXof,
        currency: "XOF",
        paymentMethod: "stripe",
        paymentReference: getPaymentReference(session),
        periodStart: dates.periodStart.toISOString(),
        periodEnd: dates.periodEnd.toISOString(),
        billingCycle: meta.billingCycle,
      },
      note: `Paiement Stripe ${meta.amountXof} XOF confirmé automatiquement`,
    });
  } catch (err) {
    console.error("Stripe webhook: tenant_events insert failed", toLogMessage(err));
  }

  return { tenantId: tenant.id, action: "created", reactivated: false, emailSent };
}

async function handleRenewal(
  session: Stripe.Checkout.Session,
  eventId: string,
  meta: ReturnType<typeof parseSessionMetadata>,
  existingTenantId: string
): Promise<HandleCheckoutCompletedResult> {
  const paidAt = new Date(session.created * 1000);
  const dates = calculatePeriodFromCycle({ cycle: meta.billingCycle, paidAt });
  const paymentReference = getPaymentReference(session);

  let reactivated = false;
  let oldStatus = "";
  let oldSubscriptionEnd: Date | null = null;
  let paymentId = "";

  await db.transaction(async (tx: Tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, existingTenantId)).for("update");
    if (!tenant) throw new Error("Tenant introuvable pendant le renouvellement Stripe");

    await tx.insert(stripeProcessedEvents).values({
      eventId,
      eventType: "checkout.session.completed",
      tenantId: tenant.id,
    });

    const [payment] = await tx
      .insert(subscriptionPayments)
      .values({
        tenantId: tenant.id,
        amount: meta.amountXof,
        currency: "XOF",
        paymentMethod: "stripe",
        paymentReference,
        paidAt,
        periodStart: dates.periodStart,
        periodEnd: dates.periodEnd,
        billingCycle: meta.billingCycle,
        confirmedBy: SYSTEM_ACTOR_ID,
        notes: `Stripe checkout ${session.id} (renouvellement)`,
      })
      .returning();
    if (!payment) throw new Error("Payment insert returned no row");
    paymentId = payment.id;

    if (tenant.status === "suspended" || tenant.status === "cancelled") {
      oldStatus = tenant.status;
      oldSubscriptionEnd = tenant.subscriptionEnd;
      await reactivateTenantWithPayment({
        tx,
        tenantId: tenant.id,
        payment: {
          id: payment.id,
          periodStart: dates.periodStart,
          periodEnd: dates.periodEnd,
          paymentMethod: "stripe",
          amount: meta.amountXof,
          currency: "XOF",
          paymentReference,
        },
      });
      reactivated = true;
    } else {
      const currentEnd = tenant.subscriptionEnd;
      if (currentEnd === null || currentEnd < dates.periodEnd) {
        await tx
          .update(tenants)
          .set({
            subscriptionEnd: dates.periodEnd,
            ...(tenant.subscriptionStart === null
              ? { subscriptionStart: dates.periodStart }
              : {}),
          })
          .where(eq(tenants.id, tenant.id));
      }
    }
  });

  const [tenantRow] = await db
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, existingTenantId))
    .limit(1);

  const [adminUser] = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(eq(userTable.tenantId, existingTenantId))
    .limit(1);

  let emailSent = false;
  if (tenantRow) {
    try {
      if (adminUser?.email) {
        const subdomainUrl = buildTenantUrl(tenantRow.slug);
        const emailParams = {
          tenantName: tenantRow.name,
          subdomainUrl,
          amount: meta.amountXof,
          currency: "XOF",
          paymentMethod: "stripe",
          paymentReference,
          paidAt,
          periodStart: dates.periodStart,
          periodEnd: dates.periodEnd,
          billingCycle: meta.billingCycle,
          reactivated,
        };
        await sendEmail({
          to: adminUser.email,
          subject: reactivated
            ? `Compte réactivé — paiement Stripe reçu (${meta.amountXof} XOF)`
            : `Paiement Stripe reçu — ${meta.amountXof} XOF`,
          html: buildPaymentConfirmationEmailHtml(emailParams),
          text: buildPaymentConfirmationEmailText(emailParams),
        });
        emailSent = true;
      }
    } catch (err) {
      console.error("Stripe webhook: payment confirmation email failed", toLogMessage(err));
    }
  }

  try {
    await db.insert(tenantEvents).values({
      tenantId: existingTenantId,
      eventType: "payment_recorded",
      actorId: SYSTEM_ACTOR_ID,
      before: null,
      after: {
        amount: meta.amountXof,
        currency: "XOF",
        paymentMethod: "stripe",
        paymentReference,
        periodStart: dates.periodStart.toISOString(),
        periodEnd: dates.periodEnd.toISOString(),
        billingCycle: meta.billingCycle,
      },
      note: `Renouvellement Stripe ${meta.amountXof} XOF (paiement ${paymentId})`,
    });
    if (reactivated) {
      await db.insert(tenantEvents).values({
        tenantId: existingTenantId,
        eventType: "reactivated",
        actorId: SYSTEM_ACTOR_ID,
        before: {
          status: oldStatus,
          subscriptionEnd: oldSubscriptionEnd ? (oldSubscriptionEnd as Date).toISOString() : null,
        },
        after: {
          status: "active",
          subscriptionStart: dates.periodStart.toISOString(),
          subscriptionEnd: dates.periodEnd.toISOString(),
        },
        note: `Réactivé automatiquement via renouvellement Stripe`,
      });
    }
    if (meta.adminEmail && tenantRow && adminUser) {
      if (adminUser.email.toLowerCase() !== meta.adminEmail.toLowerCase()) {
        await db.insert(tenantEvents).values({
          tenantId: existingTenantId,
          eventType: "checkout_email_mismatch",
          actorId: SYSTEM_ACTOR_ID,
          before: null,
          after: null,
          note: `Email checkout (${maskEmail(meta.adminEmail)}) ≠ admin tenant actuel`,
        });
      }
    }
  } catch (err) {
    console.error("Stripe webhook: tenant_events insert failed", toLogMessage(err));
  }

  return { tenantId: existingTenantId, action: "renewed", reactivated, emailSent };
}

/**
 * Orchestrates checkout.session.completed: idempotent by Stripe event id
 * (AC4), then routes to tenant creation or renewal based on whether
 * stripeCustomerId already matches an existing tenant (AC5/AC6).
 */
export async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string
): Promise<HandleCheckoutCompletedResult> {
  const alreadyProcessed = await db
    .select({ tenantId: stripeProcessedEvents.tenantId })
    .from(stripeProcessedEvents)
    .where(eq(stripeProcessedEvents.eventId, eventId))
    .limit(1);
  if (alreadyProcessed[0]) {
    return {
      tenantId: alreadyProcessed[0].tenantId ?? "",
      action: "renewed",
      reactivated: false,
      emailSent: true,
    };
  }

  let meta;
  try {
    meta = parseSessionMetadata(session.metadata ?? null);
  } catch (err) {
    if (err instanceof InvalidCheckoutMetadataError) {
      throw new StripeWebhookError("INVALID_METADATA", err.message);
    }
    throw err;
  }

  const customerId = getCustomerId(session);
  console.warn("Stripe webhook: processing checkout.session.completed", {
    eventId,
    customer: customerId ? maskCustomerId(customerId) : null,
  });

  const existing = customerId
    ? await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.stripeCustomerId, customerId))
        .limit(1)
    : [];

  if (existing[0]) {
    return handleRenewal(session, eventId, meta, existing[0].id);
  }

  if (!customerId) {
    throw new StripeWebhookError("INVALID_METADATA", "Checkout session has no customer id");
  }

  return handleCreation(session, eventId, meta, customerId);
}
