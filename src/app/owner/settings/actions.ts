"use server";

import { createAuditEvent, emitAuditEvent } from "@/lib/audit";
import { getPlatformSettings, upsertPlatformSettings } from "@/lib/data/platform-settings";
import { requireOwnerAuth } from "@/lib/session";
import { platformSettingsSchema, type PlatformSettingsInput } from "@/lib/validation/platform-settings";

export interface PlatformSettingsState {
  success: boolean;
  message?: string;
  errors?: Partial<Record<keyof PlatformSettingsInput | `notifications.${string}`, string>>;
  values?: Record<string, unknown>;
}

const NOTIFICATION_KEYS = [
  "senderAddress",
  "trialWelcome",
  "reminderJ7",
  "reminderJ3",
  "reminderJ1",
  "expiryNotification",
  "suspensionNotification",
  "reactivationNotification",
] as const;

const CHECKBOX_KEYS = [
  "trialWelcome",
  "reminderJ7",
  "reminderJ3",
  "reminderJ1",
  "expiryNotification",
  "suspensionNotification",
  "reactivationNotification",
] as const;

function buildRawInput(formData: FormData): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const key of [
    "priceFreeMonthly",
    "priceFreeAnnual",
    "priceProMonthly",
    "priceProAnnual",
    "priceEnterpriseMonthly",
    "priceEnterpriseAnnual",
    "maxUsersFree",
    "maxUsersPro",
    "maxUsersEnterprise",
    "trialDays",
    "gracePeriodDays",
    "suspendedContactEmail",
    "suspendedContactWhatsapp",
    "expiryMessage",
  ]) {
    raw[key] = formData.get(key) ?? "";
  }

  const notifications: Record<string, unknown> = {};
  for (const key of NOTIFICATION_KEYS) {
    if ((CHECKBOX_KEYS as readonly string[]).includes(key)) {
      // Unchecked checkboxes are absent from FormData â€” normalize before Zod.
      notifications[key] = formData.get(`notifications.${key}`) === "on";
    } else {
      notifications[key] = formData.get(`notifications.${key}`) ?? "";
    }
  }
  raw["notifications"] = notifications;

  return raw;
}

export async function savePlatformSettingsAction(
  _prev: PlatformSettingsState,
  formData: FormData
): Promise<PlatformSettingsState> {
  const session = await requireOwnerAuth();

  const raw = buildRawInput(formData);
  const parsed = platformSettingsSchema.safeParse(raw);

  if (!parsed.success) {
    const errors: PlatformSettingsState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path && !(path in errors)) {
        (errors as Record<string, string>)[path] = issue.message;
      }
    }
    return { success: false, errors, values: raw };
  }

  const before = await getPlatformSettings();
  const after = await upsertPlatformSettings(parsed.data);

  try {
    await emitAuditEvent(
      createAuditEvent({
        companyId: null,
        who: (session.user as Record<string, unknown>)["id"] as string,
        what: "platform.settings.updated",
        where: "/owner/settings",
        entity: { type: "platform_settings", id: "1" },
        before,
        after,
      })
    );
  } catch (err) {
    // Best-effort â€” audit failure must never block the save itself.
    console.error("platform.settings.updated audit failed", err);
  }

  console.warn("Parametres plateforme mis a jour");

  return { success: true, message: "Paramètres enregistrés." };
}
