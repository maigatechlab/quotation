import { asc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  tenants,
  subscriptionPayments,
  tenantEvents,
  user,
} from "@/lib/schema";
import {
  buildPaymentConfirmationEmailHtml,
  buildPaymentConfirmationEmailText,
} from "@/lib/tenants/payment-email";
import {
  buildReactivationNote,
  reactivateTenantWithPayment,
  type ReactivationEmailStatus,
} from "@/lib/tenants/reactivate";
import { APEX_DOMAIN } from "@/lib/tenants/tenant-config";
import type { RecordPaymentInput } from "@/lib/validation/payment";

export class RecordPaymentError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION",
    message: string
  ) {
    super(message);
    this.name = "RecordPaymentError";
  }
}

function toLogMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface RecordPaymentParams {
  tenantId: string;
  input: RecordPaymentInput;
  actorId: string;
  actorEmail: string;
}

export interface RecordPaymentResult {
  paymentId: string;
  tenantId: string;
  amount: number;
  periodStart: Date;
  periodEnd: Date;
  reactivated: boolean;
  subscriptionExtended: boolean;
  /** True when the payment promoted a trial tenant to active. */
  activated: boolean;
  emailSent: boolean;
}

export async function recordPayment(params: RecordPaymentParams): Promise<RecordPaymentResult> {
  let payment: typeof subscriptionPayments.$inferSelect;
  let reactivated = false;
  let subscriptionExtended = false;
  let activated = false;
  let tenantSnapshot: typeof tenants.$inferSelect;

  // Transaction wraps: lock + insert payment + update tenant
  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, params.tenantId))
      .for("update");

    if (!tenant) {
      throw new RecordPaymentError("NOT_FOUND", "Tenant introuvable");
    }

    if (tenant.status === "cancelled") {
      throw new RecordPaymentError(
        "CONFLICT",
        "Impossible d'enregistrer un paiement pour un tenant annulé"
      );
    }

    tenantSnapshot = tenant;

    const shouldReactivate =
      params.input.reactivateIfSuspended && tenant.status === "suspended";

    const [inserted] = await tx
      .insert(subscriptionPayments)
      .values({
        tenantId: tenant.id,
        amount: params.input.amount,
        currency: "XOF",
        paymentMethod: params.input.paymentMethod,
        paymentReference: params.input.paymentReference ?? null,
        paidAt: new Date(params.input.paidAt),
        periodStart: new Date(params.input.periodStart),
        periodEnd: new Date(params.input.periodEnd),
        billingCycle: params.input.billingCycle,
        confirmedBy: params.actorId,
        notes: params.input.notes ?? null,
      })
      .returning();

    if (!inserted) throw new Error("Payment insert returned no row");
    payment = inserted;

    if (shouldReactivate) {
      const reactivationEnd = new Date(params.input.periodEnd);
      if (reactivationEnd < new Date()) {
        throw new RecordPaymentError(
          "VALIDATION",
          "Impossible de réactiver avec une période déjà expirée."
        );
      }
      // Shared mutation core with story 7-8 (explicit reactivation) — avoids
      // duplicating the SELECT FOR UPDATE + UPDATE logic in two places.
      await reactivateTenantWithPayment({
        tx,
        tenantId: tenant.id,
        payment: {
          id: inserted.id,
          periodStart: new Date(params.input.periodStart),
          periodEnd: new Date(params.input.periodEnd),
          paymentMethod: inserted.paymentMethod,
          amount: inserted.amount,
          currency: inserted.currency,
          paymentReference: inserted.paymentReference,
        },
      });
      reactivated = true;
    } else if (tenant.status !== "suspended") {
      // Extend subscriptionEnd only for active/trial tenants.
      // Suspended tenants with unchecked "reactivate" stay suspended — no point updating end date.
      const currentEnd = tenant.subscriptionEnd;
      const newEnd = new Date(params.input.periodEnd);
      const extendEnd = currentEnd === null || currentEnd < newEnd;
      // A paid trial becomes a paying customer — mirrors the Stripe checkout
      // path (status "active", trialEndsAt cleared).
      const promoteFromTrial = tenant.status === "trial";
      if (extendEnd || promoteFromTrial) {
        await tx
          .update(tenants)
          .set({
            ...(extendEnd ? { subscriptionEnd: newEnd } : {}),
            ...(tenant.subscriptionStart === null
              ? { subscriptionStart: new Date(params.input.periodStart) }
              : {}),
            ...(promoteFromTrial ? { status: "active" as const, trialEndsAt: null } : {}),
          })
          .where(eq(tenants.id, tenant.id));
        subscriptionExtended = extendEnd;
        activated = promoteFromTrial;
      }
    }
  });

  // Email — best-effort, outside transaction
  let emailStatus: ReactivationEmailStatus = "skipped";
  try {
    const [adminUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(and(eq(user.tenantId, tenantSnapshot!.id), eq(user.role, "admin")))
      .orderBy(asc(user.createdAt))
      .limit(1);

    if (adminUser?.email) {
      const subdomainUrl = `https://${tenantSnapshot!.slug}.${APEX_DOMAIN}`;
      const emailParams = {
        tenantName: tenantSnapshot!.name,
        subdomainUrl,
        amount: payment!.amount,
        currency: payment!.currency,
        paymentMethod: payment!.paymentMethod,
        paymentReference: payment!.paymentReference ?? null,
        paidAt: payment!.paidAt,
        periodStart: payment!.periodStart,
        periodEnd: payment!.periodEnd,
        billingCycle: payment!.billingCycle,
        reactivated,
      };

      await sendEmail({
        to: adminUser.email,
        subject: reactivated
          ? `Compte réactivé — paiement reçu (${payment!.amount} XOF)`
          : `Paiement reçu — ${payment!.amount} XOF`,
        html: buildPaymentConfirmationEmailHtml(emailParams),
        text: buildPaymentConfirmationEmailText(emailParams),
      });
      emailStatus = "sent";
    }
  } catch (err) {
    console.error("Payment confirmation email failed:", toLogMessage(err));
    emailStatus = "failed";
  }
  const emailSent = emailStatus === "sent";

  // Audit event: payment_recorded — best-effort, outside transaction
  try {
    await db.insert(tenantEvents).values({
      tenantId: tenantSnapshot!.id,
      eventType: "payment_recorded",
      actorId: params.actorId,
      before: null,
      after: {
        amount: payment!.amount,
        currency: payment!.currency,
        paymentMethod: payment!.paymentMethod,
        paymentReference: payment!.paymentReference,
        paidAt: payment!.paidAt.toISOString(),
        periodStart: payment!.periodStart.toISOString(),
        periodEnd: payment!.periodEnd.toISOString(),
        billingCycle: payment!.billingCycle,
        // NEVER include notes — private owner data
      },
      note: `Paiement ${payment!.paymentMethod} ${payment!.amount} XOF confirmé par ${params.actorEmail}${emailSent ? " — email envoyé" : " — email échoué"}`,
    });
  } catch (err) {
    console.error("tenant_events (payment_recorded) insert failed:", toLogMessage(err));
  }

  // Audit event: activated (trial → active promotion) — best-effort
  if (activated) {
    try {
      await db.insert(tenantEvents).values({
        tenantId: tenantSnapshot!.id,
        eventType: "activated",
        actorId: params.actorId,
        before: {
          status: tenantSnapshot!.status,
          trialEndsAt: tenantSnapshot!.trialEndsAt ? tenantSnapshot!.trialEndsAt.toISOString() : null,
        },
        after: {
          status: "active",
          subscriptionEnd: payment!.periodEnd.toISOString(),
          coveringPaymentId: payment!.id,
        },
        note: `Essai converti en abonnement actif — paiement ${payment!.paymentMethod} ${payment!.amount} XOF confirmé par ${params.actorEmail}`,
      });
    } catch (err) {
      console.error("tenant_events (activated) insert failed:", toLogMessage(err));
    }
  }

  // Audit event: reactivated — best-effort. Uses the same note builder as
  // story 7-8's explicit reactivation so journal/accounting exports read
  // consistently regardless of entry point.
  if (reactivated) {
    try {
      await db.insert(tenantEvents).values({
        tenantId: tenantSnapshot!.id,
        eventType: "reactivated",
        actorId: params.actorId,
        before: {
          status: tenantSnapshot!.status,
          subscriptionEnd: tenantSnapshot!.subscriptionEnd
            ? tenantSnapshot!.subscriptionEnd.toISOString()
            : null,
        },
        after: {
          status: "active",
          subscriptionStart: payment!.periodStart.toISOString(),
          subscriptionEnd: payment!.periodEnd.toISOString(),
          coveringPaymentId: payment!.id,
        },
        note: buildReactivationNote({
          actorEmail: params.actorEmail,
          paymentMethod: payment!.paymentMethod,
          amount: payment!.amount,
          emailStatus,
        }),
      });
    } catch (err) {
      console.error("tenant_events (reactivated) insert failed:", toLogMessage(err));
    }
  }

  return {
    paymentId: payment!.id,
    tenantId: tenantSnapshot!.id,
    amount: payment!.amount,
    periodStart: payment!.periodStart,
    periodEnd: payment!.periodEnd,
    reactivated,
    subscriptionExtended,
    activated,
    emailSent,
  };
}
