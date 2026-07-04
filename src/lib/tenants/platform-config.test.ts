import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getPlatformSettings: vi.fn(),
}));

vi.mock("@/lib/data/platform-settings", () => ({
  getPlatformSettings: h.getPlatformSettings,
}));

import {
  getGracePeriodDays,
  getNotificationSenderAddress,
  getNotificationToggle,
  getOwnerContact,
  getPlanLimits,
  getPlanPrices,
  getTrialDays,
} from "./platform-config";

function settings(overrides: Record<string, unknown> = {}) {
  return {
    trialDays: 14,
    gracePeriodDays: 7,
    maxUsersFree: 1,
    maxUsersPro: 5,
    maxUsersEnterprise: 20,
    priceFreeMonthly: 0,
    priceFreeAnnual: 0,
    priceProMonthly: 25000,
    priceProAnnual: 250000,
    priceEnterpriseMonthly: 75000,
    priceEnterpriseAnnual: 750000,
    suspendedContactEmail: "contact@maigatechlab.com",
    suspendedContactWhatsapp: "",
    notifications: {
      senderAddress: "contact@maigatechlab.com",
      trialWelcome: true,
      reminderJ7: true,
      reminderJ3: true,
      reminderJ1: true,
      expiryNotification: true,
      suspensionNotification: true,
      reactivationNotification: true,
    },
    ...overrides,
  };
}

describe("platform-config async accessors", () => {
  it("getTrialDays returns the platform_settings value", async () => {
    h.getPlatformSettings.mockResolvedValue(settings({ trialDays: 21 }));
    expect(await getTrialDays()).toBe(21);
  });

  it("getGracePeriodDays returns the platform_settings value", async () => {
    h.getPlatformSettings.mockResolvedValue(settings({ gracePeriodDays: 10 }));
    expect(await getGracePeriodDays()).toBe(10);
  });

  it("getPlanLimits maps DB columns to the per-plan shape", async () => {
    h.getPlatformSettings.mockResolvedValue(
      settings({ maxUsersFree: 2, maxUsersPro: 8, maxUsersEnterprise: 30 })
    );
    expect(await getPlanLimits()).toEqual({
      free: { maxUsers: 2 },
      pro: { maxUsers: 8 },
      enterprise: { maxUsers: 30 },
    });
  });

  it("getPlanPrices maps DB columns to the per-plan shape", async () => {
    h.getPlatformSettings.mockResolvedValue(settings());
    expect(await getPlanPrices()).toEqual({
      free: { monthly: 0, annual: 0 },
      pro: { monthly: 25000, annual: 250000 },
      enterprise: { monthly: 75000, annual: 750000 },
    });
  });

  it("getNotificationToggle returns false when disabled", async () => {
    h.getPlatformSettings.mockResolvedValue(
      settings({ notifications: { ...settings().notifications, reminderJ7: false } })
    );
    expect(await getNotificationToggle("reminderJ7")).toBe(false);
  });

  it("getNotificationToggle returns true when enabled", async () => {
    h.getPlatformSettings.mockResolvedValue(settings());
    expect(await getNotificationToggle("reminderJ7")).toBe(true);
  });

  it("getNotificationSenderAddress returns the configured address", async () => {
    h.getPlatformSettings.mockResolvedValue(
      settings({ notifications: { ...settings().notifications, senderAddress: "owner@x.com" } })
    );
    expect(await getNotificationSenderAddress()).toBe("owner@x.com");
  });

  it("getOwnerContact returns the platform_settings contact fields", async () => {
    h.getPlatformSettings.mockResolvedValue(
      settings({ suspendedContactEmail: "a@b.com", suspendedContactWhatsapp: "+227123" })
    );
    expect(await getOwnerContact()).toEqual({ email: "a@b.com", whatsapp: "+227123" });
  });
});
