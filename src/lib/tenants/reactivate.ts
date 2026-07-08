import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { tenants, tenantEvents } from "@/lib/schema";
import {
  getPaymentForTenant,
  isPaymentCovering,
  type CoveringPayment,
} from "@/lib/tenants/covering-payment";
import {
  getNotificationSenderAddress,
  getNotificationToggle,
} from "@/lib/tenants/platform-config";
import {
  buildReactivationEmailHtml,
  buildReactivationEmailText,
} from "@/lib/tenants/reactivate-email";
import { buildTenantUrl } from "@/lib/tenants/tenant-config";
import { getTenantAdminEmail } from "@/lib/tenants/tenant-contact";
import type { ReactivateInput } from "@/lib/validation/reactivate";

// tx type extracted from db.transaction's callback param — avoids importing Drizzle's
// internal transaction types directly.
type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ReactivateError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "NO_COVERING_PAYMENT" | "CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "ReactivateError";
  }
}

function toLogMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type ReactivationEmailStatus = "sent" | "failed" | "skipped";

/**
 * Shared "reactivated" tenant_events note builder — used by both 7-8 (explicit
 * reactivation) and 7-4 (record payment + "reactivate if suspended" checkbox)
 * so the audit trail reads consistently regardless of entry point.
 */
export function buildReactivationNote(params: {
  actorEmail: string;
  paymentMethod: string;
  amount: number;
  emailStatus: ReactivationEmailStatus;
  note?: string;
}): string {
  const emailSuffix =
    params.emailStatus === "sent"
      ? "email envoyé"
      : params.emailStatus === "failed"
        ? "email échoué"
        : "aucun email admin trouvé";
  return `Réactivé par ${params.actorEmail} — paiement ${params.paymentMethod} ${params.amount} XOF — ${emailSuffix}${params.note ? ` — Note: ${params.note}` : ""}`;
}

export interface ReactivateParams {
  tenantId: string;
  input: ReactivateInput;
  actorId: string;
  actorEmail: string;
}

export interface ReactivateResult {
  tenantId: string;
  status: "active";
  subscriptionStart: Date;
  subscriptionEnd: Date;
  coveringPaymentId: string;
  emailSent: boolean;
}

export interface ReactivateWithPaymentParams {
  tx: TxLike;
  tenantId: string;
  payment: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    paymentMethod: string;
    amount: number;
    currency: string;
    paymentReference: string | null;
  };
}

/**
 * Shared mutation core (SELECT FOR UPDATE + UPDATE) used by both 7-8 (explicit
 * reactivation of an existing payment) and 7-4 (record payment + "reactivate if
 * suspended" checkbox). Does NOT emit the tenant_events entry or the email —
 * that's the caller's responsibility, after COMMIT (best-effort).
 */
export async function reactivateTenantWithPayment(
  params: ReactivateWithPaymentParams
): Promise<{ oldStatus: string; oldSubscriptionEnd: Date | null }> {
  const { tx, tenantId, payment } = params;

  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).for("update");
  if (!tenant) {
    throw new ReactivateError("NOT_FOUND", "Tenant introuvable");
  }
  if (tenant.status !== "suspended" && tenant.status !== "cancelled") {
    throw new ReactivateError(
      "CONFLICT",
      "Le tenant est déjà actif ou en essai — rien à réactiver"
    );
  }

  const oldStatus = tenant.status;
  const oldSubscriptionEnd = tenant.subscriptionEnd;

  await tx
    .update(tenants)
    .set({
      status: "active",
      subscriptionStart: payment.periodStart,
      subscriptionEnd: payment.periodEnd,
      gracePeriodEndsAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  return { oldStatus, oldSubscriptionEnd };
}

async function getTenantBasic(tenantId: string): Promise<{ name: string; slug: string } | null> {
  const [row] = await db
    .select({ name: tenants.name, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row ?? null;
}

export async function reactivateTenant(params: ReactivateParams): Promise<ReactivateResult> {
  const { tenantId, input, actorId, actorEmail } = params;

  // Payment coverage is re-checked inside the transaction (via tx, before the
  // mutation) so a concurrent payment update/delete can't reactivate from
  // stale coverage data — see story 7-8 AC3.
  let oldStatus = "";
  let oldSubscriptionEnd: Date | null = null;
  let payment: CoveringPayment | undefined;

  await db.transaction(async (tx) => {
    const candidate = await getPaymentForTenant(tenantId, input.coveringPaymentId, tx);
    if (!candidate) {
      throw new ReactivateError("NO_COVERING_PAYMENT", "Paiement introuvable ou invalide");
    }
    if (!isPaymentCovering(candidate)) {
      throw new ReactivateError(
        "NO_COVERING_PAYMENT",
        "Ce paiement ne couvre pas la période de réactivation"
      );
    }

    const snapshot = await reactivateTenantWithPayment({
      tx,
      tenantId,
      payment: {
        id: candidate.id,
        periodStart: candidate.periodStart,
        periodEnd: candidate.periodEnd,
        paymentMethod: candidate.paymentMethod,
        amount: candidate.amount,
        currency: candidate.currency,
        paymentReference: candidate.paymentReference,
      },
    });
    oldStatus = snapshot.oldStatus;
    oldSubscriptionEnd = snapshot.oldSubscriptionEnd;
    payment = candidate;
  });

  if (!payment) {
    throw new ReactivateError("NO_COVERING_PAYMENT", "Paiement introuvable");
  }

  // Email — best-effort, outside transaction, gated by the platform
  // "reactivationNotification" toggle
  let emailStatus: ReactivationEmailStatus = "skipped";
  try {
    const notificationsEnabled = await getNotificationToggle("reactivationNotification");
    const adminEmail = notificationsEnabled ? await getTenantAdminEmail(tenantId) : null;
    if (adminEmail) {
      const tenantRow = await getTenantBasic(tenantId);
      if (tenantRow) {
        const subdomainUrl = buildTenantUrl(tenantRow.slug);
        const emailParams = {
          tenantName: tenantRow.name,
          subdomainUrl,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
          paymentMethod: payment.paymentMethod,
          paymentReference: payment.paymentReference ?? null,
          paymentAmount: payment.amount,
          currency: payment.currency,
        };
        await sendEmail({
          to: adminEmail,
          from: await getNotificationSenderAddress(),
          subject: "Votre compte Quotation Logistique a été réactivé",
          html: buildReactivationEmailHtml(emailParams),
          text: buildReactivationEmailText(emailParams),
        });
        emailStatus = "sent";
      }
    }
  } catch (err) {
    console.error("Reactivation email failed", toLogMessage(err));
    emailStatus = "failed";
  }
  const emailSent = emailStatus === "sent";

  // Audit event — best-effort, outside transaction
  try {
    await db.insert(tenantEvents).values({
      tenantId,
      eventType: "reactivated",
      actorId,
      before: {
        status: oldStatus,
        subscriptionEnd: oldSubscriptionEnd ? (oldSubscriptionEnd as Date).toISOString() : null,
      },
      after: {
        status: "active",
        subscriptionStart: payment.periodStart.toISOString(),
        subscriptionEnd: payment.periodEnd.toISOString(),
        coveringPaymentId: payment.id,
        // NEVER include note here — private owner data (AC9), it goes in the
        // top-level `note` field below instead
      },
      note: buildReactivationNote({
        actorEmail,
        paymentMethod: payment.paymentMethod,
        amount: payment.amount,
        emailStatus,
        ...(input.note != null ? { note: input.note } : {}),
      }),
    });
  } catch (err) {
    console.error("tenant_events (reactivated) insert failed", toLogMessage(err));
  }

  return {
    tenantId,
    status: "active",
    subscriptionStart: payment.periodStart,
    subscriptionEnd: payment.periodEnd,
    coveringPaymentId: payment.id,
    emailSent,
  };
}
