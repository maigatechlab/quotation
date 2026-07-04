import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { tenants, tenantEvents } from "@/lib/schema";
import { getNotificationSenderAddress, getNotificationToggle } from "@/lib/tenants/platform-config";
import type { SuspendInput } from "@/lib/validation/tenant-lifecycle";
import { buildSuspendEmailHtml, buildSuspendEmailText } from "./suspend-email";
import { buildOwnerContact, getTenantAdminEmail } from "./tenant-contact";

export class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant not found: ${tenantId}`);
    this.name = "TenantNotFoundError";
  }
}

export class TenantStateConflictError extends Error {
  constructor(
    public readonly currentState: string,
    public readonly action: string
  ) {
    super(
      `Le tenant n'est pas dans un état permettant l'action "${action}" (état actuel: ${currentState})`
    );
    this.name = "TenantStateConflictError";
  }
}

export interface SuspendParams {
  tenantId: string;
  input: SuspendInput;
  actorId: string;
  actorEmail: string;
}

export interface SuspendResult {
  tenantId: string;
  status: "suspended";
  emailSent: boolean;
}

const REASON_LABELS: Record<SuspendInput["reason"], string> = {
  "non-paiement": "Non-paiement",
  fraude: "Fraude",
  "demande-client": "Demande client",
  autre: "Autre",
};

export async function applySuspension(params: SuspendParams): Promise<SuspendResult> {
  const { tenantId, input, actorId, actorEmail } = params;

  // 1. Load current tenant
  const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const existing = rows[0];
  if (!existing) throw new TenantNotFoundError(tenantId);

  // 2. Snapshot
  const before = { name: existing.name, slug: existing.slug, plan: existing.plan, status: existing.status };

  // 3. Atomic UPDATE with concurrency guard
  const updated = await db
    .update(tenants)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(and(eq(tenants.id, tenantId), inArray(tenants.status, ["active", "trial"])))
    .returning();
  if (!updated[0]) {
    throw new TenantStateConflictError(existing.status, "suspend");
  }

  // 4–5. Email (best-effort, gated by the platform "suspensionNotification" toggle)
  const reasonLabel = REASON_LABELS[input.reason];
  let emailSent = false;
  const notificationsEnabled = await getNotificationToggle("suspensionNotification");
  const adminEmail = notificationsEnabled ? await getTenantAdminEmail(tenantId) : null;
  if (adminEmail) {
    try {
      const contact = await buildOwnerContact();
      await sendEmail({
        to: adminEmail,
        from: await getNotificationSenderAddress(),
        subject: "Votre abonnement Quotation Logistique a été suspendu",
        html: buildSuspendEmailHtml({
          tenantName: existing.name,
          reasonLabel,
          effectiveDate: new Date(),
          ownerWhatsapp: contact.displayWhatsapp,
          ownerEmail: contact.displayEmail,
          note: input.note ?? null,
        }),
        text: buildSuspendEmailText({
          tenantName: existing.name,
          reasonLabel,
          effectiveDate: new Date(),
          ownerWhatsapp: contact.displayWhatsapp,
          ownerEmail: contact.displayEmail,
          note: input.note ?? null,
        }),
      });
      emailSent = true;
    } catch (err) {
      console.error("Suspend email failed", err);
      emailSent = false;
    }
  }

  // 6. Audit event (best-effort)
  try {
    await db.insert(tenantEvents).values({
      tenantId,
      eventType: "suspended",
      actorId,
      before,
      after: {
        status: "suspended",
        reason: input.reason,
        note: input.note ?? null,
        totalBlock: input.totalBlock,
      },
      note: emailSent
        ? `Suspendu par ${actorEmail}`
        : `Suspendu par ${actorEmail} — email suspension échoué`,
    });
  } catch (err) {
    console.error("tenant_events insert failed", err);
  }

  return { tenantId, status: "suspended", emailSent };
}
