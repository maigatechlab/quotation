import { and, eq, not } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { tenants, tenantEvents } from "@/lib/schema";
import type { CancelInput } from "@/lib/validation/tenant-lifecycle";
import { buildCancelEmailHtml, buildCancelEmailText } from "./cancel-email";
import { TenantNotFoundError, TenantStateConflictError } from "./suspend";
import { buildOwnerContact, getTenantAdminEmail } from "./tenant-contact";

export class CancelConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancelConfirmationError";
  }
}

export interface CancelParams {
  tenantId: string;
  input: CancelInput;
  actorId: string;
  actorEmail: string;
}

export interface CancelResult {
  tenantId: string;
  status: "cancelled";
  emailSent: boolean;
}

export async function applyCancellation(params: CancelParams): Promise<CancelResult> {
  const { tenantId, input, actorId, actorEmail } = params;

  // 1. Load current tenant
  const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const existing = rows[0];
  if (!existing) throw new TenantNotFoundError(tenantId);

  // 2. Slug confirmation check (anti-misclick)
  if (input.confirmSlug !== existing.slug) {
    throw new CancelConfirmationError("Le slug saisi ne correspond pas au tenant");
  }

  // 3. Snapshot
  const before = { name: existing.name, slug: existing.slug, plan: existing.plan, status: existing.status };

  // 4. Atomic UPDATE — idempotency guard
  const updated = await db
    .update(tenants)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(tenants.id, tenantId), not(eq(tenants.status, "cancelled"))))
    .returning();
  if (!updated[0]) {
    throw new TenantStateConflictError(existing.status, "cancel");
  }

  // 5. Email (best-effort)
  let emailSent = false;
  const adminEmail = await getTenantAdminEmail(tenantId);
  if (adminEmail) {
    try {
      const contact = await buildOwnerContact();
      await sendEmail({
        to: adminEmail,
        subject: "Votre abonnement Quotation Logistique a été annulé définitivement",
        html: buildCancelEmailHtml({
          tenantName: existing.name,
          effectiveDate: new Date(),
          ownerWhatsapp: contact.displayWhatsapp,
          ownerEmail: contact.displayEmail,
        }),
        text: buildCancelEmailText({
          tenantName: existing.name,
          effectiveDate: new Date(),
          ownerWhatsapp: contact.displayWhatsapp,
          ownerEmail: contact.displayEmail,
        }),
      });
      emailSent = true;
    } catch (err) {
      console.error("Cancel email failed", err);
      emailSent = false;
    }
  }

  // 6. Audit event (best-effort)
  try {
    await db.insert(tenantEvents).values({
      tenantId,
      eventType: "cancelled",
      actorId,
      before,
      after: { status: "cancelled" },
      note: emailSent
        ? `Annulé par ${actorEmail}`
        : `Annulé par ${actorEmail} — email annulation échoué`,
    });
  } catch (err) {
    console.error("tenant_events insert failed", err);
  }

  return { tenantId, status: "cancelled", emailSent };
}
