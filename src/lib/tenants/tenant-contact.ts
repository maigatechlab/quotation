import { eq, and, asc, isNull } from "drizzle-orm";
import { getPlatformSettings } from "@/lib/data/platform-settings";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/schema";

export async function getTenantAdminEmail(tenantId: string): Promise<string | null> {
  // Deterministic recipient for multi-admin tenants: the original admin (earliest
  // createdAt), matching record-payment.ts so both features email the same person.
  const rows = await db
    .select({ email: userTable.email })
    .from(userTable)
    .where(and(eq(userTable.tenantId, tenantId), eq(userTable.role, "admin"), isNull(userTable.disabledAt)))
    .orderBy(asc(userTable.createdAt))
    .limit(1);
  return rows[0]?.email ?? null;
}

export interface OwnerContact {
  whatsapp: string | null;
  email: string | null;
  displayWhatsapp: string;
  displayEmail: string;
}

export async function buildOwnerContact(): Promise<OwnerContact> {
  const settings = await getPlatformSettings();
  const whatsapp =
    settings.suspendedContactWhatsapp || process.env.OWNER_WHATSAPP || null;
  const email =
    settings.suspendedContactEmail ||
    process.env.OWNER_EMAIL ||
    process.env.EMAIL_FROM ||
    null;
  return {
    whatsapp,
    email,
    displayWhatsapp: whatsapp ?? "Contactez votre interlocuteur Maiga Tech Lab",
    displayEmail: email ?? "contact@maigatechlab.com",
  };
}
