import { describe, expect, it } from "vitest";
import { platformSettingsSchema } from "./platform-settings";

const PRICE_MESSAGE = "Le prix doit Ãªtre un entier positif (FCFA).";
const MAX_USERS_MESSAGE = "Le nombre d'utilisateurs doit Ãªtre â‰¥ 1.";

function validInput(overrides: Record<string, unknown> = {}) {
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
    suspendedContactEmail: "owner@maigatechlab.com",
    suspendedContactWhatsapp: "+22796000000",
    expiryMessage: "",
    notifications: {
      senderAddress: "noreply@quotation.app",
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

function messagesFor(input: Record<string, unknown>): string[] {
  const result = platformSettingsSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

describe("platformSettingsSchema", () => {
  it("accepts a fully valid payload", () => {
    const result = platformSettingsSchema.safeParse(validInput());
    expect(result.success).toBe(true);
  });

  it("rejects a negative price with the required French message", () => {
    expect(messagesFor(validInput({ priceProMonthly: -5000 }))).toContain(PRICE_MESSAGE);
  });

  it("rejects a decimal price with the required French message", () => {
    expect(messagesFor(validInput({ priceProMonthly: 25000.5 }))).toContain(PRICE_MESSAGE);
  });

  it("rejects a price larger than PostgreSQL integer", () => {
    expect(messagesFor(validInput({ priceProMonthly: 2_147_483_648 }))).toContain(PRICE_MESSAGE);
  });

  it("rejects gracePeriodDays > 30", () => {
    const result = platformSettingsSchema.safeParse(validInput({ gracePeriodDays: 31 }));
    expect(result.success).toBe(false);
  });

  it("rejects trialDays = 0", () => {
    const result = platformSettingsSchema.safeParse(validInput({ trialDays: 0 }));
    expect(result.success).toBe(false);
  });

  it("rejects trialDays > 60", () => {
    const result = platformSettingsSchema.safeParse(validInput({ trialDays: 61 }));
    expect(result.success).toBe(false);
  });

  it("rejects maxUsersPro = 0", () => {
    expect(messagesFor(validInput({ maxUsersPro: 0 }))).toContain(MAX_USERS_MESSAGE);
  });

  it("rejects maxUsers larger than PostgreSQL integer", () => {
    expect(messagesFor(validInput({ maxUsersPro: 2_147_483_648 }))).toContain(MAX_USERS_MESSAGE);
  });

  it("rejects an invalid contact email", () => {
    const result = platformSettingsSchema.safeParse(
      validInput({ suspendedContactEmail: "not-an-email" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects an invalid notifications sender email", () => {
    const input = validInput();
    input.notifications = { ...input.notifications, senderAddress: "not-an-email" };
    const result = platformSettingsSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});