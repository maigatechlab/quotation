// Server-only platform_settings accessors (story 7-12), kept separate so
// shared tenant configuration stays free of database dependencies.
import { getPlatformSettings } from "@/lib/data/platform-settings";
import type { TenantPlan } from "./tenant-config";

export async function getTrialDays(): Promise<number> {
  const s = await getPlatformSettings();
  return s.trialDays;
}

export async function getGracePeriodDays(): Promise<number> {
  const s = await getPlatformSettings();
  return s.gracePeriodDays;
}

export async function getPlanLimits(): Promise<Record<TenantPlan, { maxUsers: number }>> {
  const s = await getPlatformSettings();
  return {
    free: { maxUsers: s.maxUsersFree },
    pro: { maxUsers: s.maxUsersPro },
    enterprise: { maxUsers: s.maxUsersEnterprise },
  };
}

export async function getPlanPrices(): Promise<
  Record<TenantPlan, { monthly: number; annual: number }>
> {
  const s = await getPlatformSettings();
  return {
    free: { monthly: s.priceFreeMonthly, annual: s.priceFreeAnnual },
    pro: { monthly: s.priceProMonthly, annual: s.priceProAnnual },
    enterprise: { monthly: s.priceEnterpriseMonthly, annual: s.priceEnterpriseAnnual },
  };
}

export interface PlatformOwnerContact {
  email: string;
  whatsapp: string;
}

export async function getOwnerContact(): Promise<PlatformOwnerContact> {
  const s = await getPlatformSettings();
  return {
    email: s.suspendedContactEmail,
    whatsapp: s.suspendedContactWhatsapp,
  };
}

export type NotificationType =
  | "trialWelcome"
  | "reminderJ7"
  | "reminderJ3"
  | "reminderJ1"
  | "expiryNotification"
  | "suspensionNotification"
  | "reactivationNotification";

export async function getNotificationToggle(type: NotificationType): Promise<boolean> {
  const s = await getPlatformSettings();
  return Boolean(s.notifications[type]);
}

export async function getNotificationSenderAddress(): Promise<string> {
  const s = await getPlatformSettings();
  return s.notifications.senderAddress || process.env.EMAIL_FROM || "contact@maigatechlab.com";
}
