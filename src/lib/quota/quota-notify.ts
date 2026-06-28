import { and, eq } from "drizzle-orm";
import { createAuditEvent, emitAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { companySubscription, user as userTable } from "@/lib/schema";

export async function notifyQuota80Percent(
  companyId: string,
  used: number,
  limit: number,
  dbClient: typeof db
): Promise<void> {
  try {
    const admins = await dbClient
      .select({ email: userTable.email, name: userTable.name })
      .from(userTable)
      .where(and(eq(userTable.companyId, companyId), eq(userTable.role, "admin")))
      .limit(1);

    const admin = admins[0];
    if (admin) {
      await sendEmail({
        to: admin.email,
        subject: "Quota de devis à 80% — Quotation Logistique",
        html: buildQuota80Html(admin.name, used, limit),
        text: `Vous avez utilisé ${used}/${limit} devis ce mois. Passez à Pro pour continuer sans limite.`,
      });
    }

    await emitAuditEvent(
      createAuditEvent({
        who: "system",
        what: "quota.warning_80pct",
        where: "quota-notify",
        entity: { type: "company", id: companyId },
        after: { used, limit },
      })
    );

    await dbClient
      .update(companySubscription)
      .set({ notified80pct: true, updatedAt: new Date() })
      .where(eq(companySubscription.companyId, companyId));
    // Only upgrade to "warning" if still "ok" — never clobber "exceeded"/"readonly" (P4)
    await dbClient
      .update(companySubscription)
      .set({ quotaStatus: "warning" })
      .where(
        and(
          eq(companySubscription.companyId, companyId),
          eq(companySubscription.quotaStatus, "ok")
        )
      );
  } catch {
    // best-effort — do not fail the main mutation
  }
}

function buildQuota80Html(name: string, used: number, limit: number): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#1a2744">Quota de devis à 80%</h2>
      <p>Bonjour ${name},</p>
      <p>Vous avez utilisé <strong>${used}/${limit}</strong> devis ce mois (80% de votre quota).</p>
      <p>Passez au tier Pro pour continuer sans limite.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique — Ne pas répondre à cet email.</p>
    </div>
  `;
}
