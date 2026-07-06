import { beforeEach, describe, expect, it, vi } from "vitest";

const ROW = {
  id: 1,
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
  suspendedContactEmail: "contact@maigatechlab.com",
  suspendedContactWhatsapp: "",
  expiryMessage: "",
  notifications: {
    senderAddress: "",
    trialWelcome: true,
    reminderJ7: true,
    reminderJ3: true,
    reminderJ1: true,
    expiryNotification: true,
    suspensionNotification: true,
    reactivationNotification: true,
  },
  updatedAt: new Date("2026-07-01T00:00:00Z"),
};

const h = vi.hoisted(() => ({
  selectResult: vi.fn<() => unknown[]>(() => []),
  insertReturning: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  upsertReturning: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  valuesArg: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.selectResult()),
        }),
      }),
    }),
    insert: () => ({
      values: (arg: unknown) => {
        h.valuesArg(arg);
        return {
          onConflictDoNothing: () => ({
            returning: () => h.insertReturning(),
          }),
          onConflictDoUpdate: () => ({
            returning: () => h.upsertReturning(),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/lib/schema", () => ({
  platformSettings: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({ eq: () => "eq" }));

import { getPlatformSettings, upsertPlatformSettings } from "./platform-settings";

describe("getPlatformSettings", () => {
  beforeEach(() => {
    h.selectResult.mockReset().mockReturnValue([]);
    h.insertReturning.mockReset().mockResolvedValue([]);
    h.upsertReturning.mockReset().mockResolvedValue([]);
    h.valuesArg.mockClear();
  });

  it("returns the existing row without bootstrapping when present", async () => {
    h.selectResult.mockReturnValue([ROW]);
    const result = await getPlatformSettings();
    expect(result).toEqual(ROW);
    expect(h.insertReturning).not.toHaveBeenCalled();
  });

  it("bootstraps the singleton row with defaults when the table is empty", async () => {
    h.selectResult.mockReturnValue([]);
    h.insertReturning.mockResolvedValue([ROW]);
    const result = await getPlatformSettings();
    expect(result).toEqual(ROW);
  });

  it("normalizes EMAIL_FROM display-name default for suspendedContactEmail, but leaves notifications.senderAddress empty (story 8-2 — live env fallback, not a bootstrap snapshot)", async () => {
    const originalEmailFrom = process.env.EMAIL_FROM;
    const originalOwnerEmail = process.env.OWNER_EMAIL;
    delete process.env.OWNER_EMAIL;
    process.env.EMAIL_FROM = "Quotation Logistique <noreply@example.com>";
    h.selectResult.mockReturnValue([]);
    h.insertReturning.mockResolvedValue([ROW]);

    await getPlatformSettings();

    const values = h.valuesArg.mock.calls[0]?.[0] as typeof ROW;
    expect(values.suspendedContactEmail).toBe("noreply@example.com");
    // senderAddress stays empty at bootstrap so getNotificationSenderAddress()
    // always falls back to the *current* EMAIL_FROM instead of freezing whatever
    // value was active the moment the row was first created.
    expect(values.notifications.senderAddress).toBe("");

    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
    if (originalOwnerEmail === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = originalOwnerEmail;
  });

  it("re-reads the row when a concurrent request wins the bootstrap race (onConflictDoNothing)", async () => {
    // First select: empty. Insert loses the race (onConflictDoNothing -> no row returned).
    // Second select (retry): the concurrent insert's row is now visible.
    h.selectResult.mockReturnValueOnce([]).mockReturnValueOnce([ROW]);
    h.insertReturning.mockResolvedValue([]);
    const result = await getPlatformSettings();
    expect(result).toEqual(ROW);
  });

  it("throws if the bootstrap race retry still finds no row", async () => {
    h.selectResult.mockReturnValue([]);
    h.insertReturning.mockResolvedValue([]);
    await expect(getPlatformSettings()).rejects.toThrow("bootstrap failed");
  });
});

describe("upsertPlatformSettings", () => {
  beforeEach(() => {
    h.upsertReturning.mockReset();
  });

  it("updates the singleton row and returns it", async () => {
    const updated = { ...ROW, gracePeriodDays: 10 };
    h.upsertReturning.mockResolvedValue([updated]);
    const result = await upsertPlatformSettings({ gracePeriodDays: 10 });
    expect(result.gracePeriodDays).toBe(10);
  });

  it("throws if the upsert returns no row", async () => {
    h.upsertReturning.mockResolvedValue([]);
    await expect(upsertPlatformSettings({ gracePeriodDays: 10 })).rejects.toThrow(
      "upsert returned no row"
    );
  });
});