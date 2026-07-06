import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformSettings, type PlatformSettings } from "@/lib/schema";

type SettingsInput = Partial<Omit<PlatformSettings, "id" | "updatedAt">>;

function plainEmail(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  const match = trimmed.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (match?.[1] ?? trimmed).toLowerCase();
}

function defaults(): Omit<PlatformSettings, "id" | "updatedAt"> {
  return {
    priceFreeMonthly: 0,
    priceFreeAnnual: 0,
    priceProMonthly: 25000,
    priceProAnnual: 250000,
    priceEnterpriseMonthly: 75000,
    priceEnterpriseAnnual: 750000,
    maxUsersFree: 1,
    maxUsersPro: 5,
    maxUsersEnterprise: 20,
    trialDays: 14,
    gracePeriodDays: 7,
    suspendedContactEmail:
      plainEmail(process.env.OWNER_EMAIL ?? process.env.EMAIL_FROM, "contact@maigatechlab.com"),
    suspendedContactWhatsapp: process.env.OWNER_WHATSAPP ?? "",
    expiryMessage: "",
    notifications: {
      // Left empty on purpose: getNotificationSenderAddress() falls back to the
      // live EMAIL_FROM env var when this is empty. Seeding it with a concrete
      // address here would freeze it at bootstrap time — a later EMAIL_FROM /
      // domain-verification change would then silently never take effect until
      // an admin manually re-saves /owner/settings (see story 8-2 Dev Notes).
      senderAddress: "",
      trialWelcome: true,
      reminderJ7: true,
      reminderJ3: true,
      reminderJ1: true,
      expiryNotification: true,
      suspensionNotification: true,
      reactivationNotification: true,
    },
  };
}

/**
 * Reads the platform_settings singleton, bootstrapping it with defaults on
 * first access. Not cached (MVP) â€” a single-row SELECT is cheap and consumers
 * are few (cron, page, tenant creation, email dispatch). See story 7-12 Dev
 * Notes for the V2 unstable_cache plan.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  if (rows[0]) return rows[0];

  // Bootstrap: race-safe via onConflictDoNothing (two concurrent first-reads).
  const created = await db
    .insert(platformSettings)
    .values({ id: 1, ...defaults() })
    .onConflictDoNothing({ target: platformSettings.id })
    .returning();
  if (created[0]) return created[0];

  // A concurrent request won the race â€” re-read.
  const retry = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  if (!retry[0]) throw new Error("platform_settings: bootstrap failed");
  return retry[0];
}

export async function upsertPlatformSettings(input: SettingsInput): Promise<PlatformSettings> {
  const row = await db
    .insert(platformSettings)
    .values({ id: 1, ...defaults(), ...input })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  if (!row[0]) throw new Error("platform_settings: upsert returned no row");
  return row[0];
}
