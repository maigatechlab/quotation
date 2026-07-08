import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const candidates = vi.fn<() => unknown[]>(() => []);
  const updateReturning = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([{ id: "tenant-1", status: "suspended" }]));
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const insertValues = vi.fn(() => Promise.resolve());
  const deleteWhere = vi.fn(() => Promise.resolve());
  const sendEmail = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const getTenantAdminEmail = vi.fn<() => Promise<string | null>>(() => Promise.resolve("admin@tenant.ne"));
  const buildOwnerContact = vi.fn(() => ({
    whatsapp: "+227001",
    email: "owner@ml.com",
    displayWhatsapp: "+227001",
    displayEmail: "owner@ml.com",
  }));
  const hasReminderBeenSent = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
  const hasPaymentCoveringPeriod = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
  const hasPaymentCoverageSkipEventBeenSent = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
  const hasGraceExpiredEventBeenSent = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));

  return {
    candidates,
    updateReturning,
    updateWhere,
    updateSet,
    insertValues,
    deleteWhere,
    sendEmail,
    getTenantAdminEmail,
    buildOwnerContact,
    hasReminderBeenSent,
    hasPaymentCoveringPeriod,
    hasPaymentCoverageSkipEventBeenSent,
    hasGraceExpiredEventBeenSent,
  };
});

vi.mock("@/lib/db", () => {
  const ops = {
    update: () => ({ set: h.updateSet }),
    insert: () => ({ values: h.insertValues }),
    delete: () => ({ where: h.deleteWhere }),
  };
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(h.candidates()),
        }),
      }),
      ...ops,
      // Atomic suspension: run the callback with a tx exposing the same update/insert ops.
      transaction: (fn: (tx: typeof ops) => Promise<unknown>) => fn(ops),
    },
  };
});

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => h.sendEmail(...(args as [])),
  escapeHtml: (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;"),
  escapeAttribute: (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("`", "&#96;"),
}));

vi.mock("@/lib/schema", () => ({
  tenants: {},
  tenantEvents: {},
}));

vi.mock("drizzle-orm", () => ({
  and: () => "and",
  eq: () => "eq",
  inArray: () => "inArray",
  isNotNull: () => "isNotNull",
  ne: () => "ne",
}));

vi.mock("@/lib/tenants/tenant-config", () => ({
  APEX_DOMAIN: "quotation.com",
  buildTenantUrl: (slug: string) => `https://${slug}.quotation.com`,
  DEFAULT_GRACE_PERIOD_DAYS: 7,
}));

vi.mock("@/lib/tenants/platform-config", () => ({
  getGracePeriodDays: () => Promise.resolve(7),
  getNotificationToggle: () => Promise.resolve(true),
  getNotificationSenderAddress: () => Promise.resolve("noreply@quotation.app"),
}));

vi.mock("@/lib/tenants/tenant-contact", () => ({
  getTenantAdminEmail: (...args: unknown[]) => h.getTenantAdminEmail(...(args as [])),
  buildOwnerContact: () => Promise.resolve(h.buildOwnerContact()),
}));

vi.mock("./expiry-decisions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./expiry-decisions")>();
  return {
    ...actual,
    hasReminderBeenSent: (...args: unknown[]) => h.hasReminderBeenSent(...(args as [])),
    hasPaymentCoveringPeriod: (...args: unknown[]) => h.hasPaymentCoveringPeriod(...(args as [])),
    hasPaymentCoverageSkipEventBeenSent: (...args: unknown[]) =>
      h.hasPaymentCoverageSkipEventBeenSent(...(args as [])),
    hasGraceExpiredEventBeenSent: (...args: unknown[]) => h.hasGraceExpiredEventBeenSent(...(args as [])),
  };
});

import { runExpiryJob } from "./expiry-job";

const NOW = new Date("2026-07-01T12:00:00Z");

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant-1",
    name: "Trans Sahel",
    slug: "trans-sahel",
    status: "active",
    plan: "pro",
    subscriptionEnd: new Date("2026-07-08T00:00:00Z"), // J-7
    gracePeriodEndsAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.candidates.mockReturnValue([]);
  h.updateReturning.mockResolvedValue([{ id: "tenant-1", status: "suspended" }]);
  h.insertValues.mockResolvedValue(undefined);
  h.deleteWhere.mockResolvedValue(undefined);
  h.sendEmail.mockResolvedValue(undefined);
  h.getTenantAdminEmail.mockResolvedValue("admin@tenant.ne");
  h.hasReminderBeenSent.mockResolvedValue(false);
  h.hasPaymentCoveringPeriod.mockResolvedValue(false);
  h.hasPaymentCoverageSkipEventBeenSent.mockResolvedValue(false);
  h.hasGraceExpiredEventBeenSent.mockResolvedValue(false);
});

afterEach(() => vi.clearAllMocks());

describe("runExpiryJob", () => {
  it("nominal reminder J-7: sends email, inserts reminder_sent event, reminders=1", async () => {
    h.candidates.mockReturnValue([tenant()]);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.reminders).toBe(1);
    expect(h.sendEmail).toHaveBeenCalledOnce();
    expect(h.insertValues).toHaveBeenCalledOnce();
  });

  it("idempotence: reminder already sent → no email, no insert", async () => {
    h.candidates.mockReturnValue([tenant()]);
    h.hasReminderBeenSent.mockResolvedValue(true);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.reminders).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("concurrent reminder race: unique violation claim means no duplicate email", async () => {
    h.candidates.mockReturnValue([tenant()]);
    h.insertValues.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" }));
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.reminders).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("reminder send failure removes the claim so a later cron can retry", async () => {
    h.candidates.mockReturnValue([tenant()]);
    h.sendEmail.mockRejectedValueOnce(new Error("Resend down"));
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.errors).toBe(1);
    expect(h.deleteWhere).toHaveBeenCalledOnce();
  });
  it("suspension J0 without covering payment: updates tenant, sends expiry email, inserts suspended event", async () => {
    h.candidates.mockReturnValue([tenant({ subscriptionEnd: new Date("2026-07-01T00:00:00Z") })]);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.suspended).toBe(1);
    expect(h.updateSet).toHaveBeenCalledOnce();
    const setArg = (h.updateSet.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(setArg["status"]).toBe("suspended");
    const gracePeriodEndsAt = setArg["gracePeriodEndsAt"] as Date;
    const expectedGrace = new Date(NOW);
    expectedGrace.setDate(expectedGrace.getDate() + 7);
    expect(gracePeriodEndsAt.toISOString().slice(0, 10)).toBe(expectedGrace.toISOString().slice(0, 10));
    expect(h.sendEmail).toHaveBeenCalledOnce();
    expect(h.insertValues).toHaveBeenCalledOnce();
  });

  it("suspension J0 with covering payment: no update, no email, logs 'payment covers period'", async () => {
    h.candidates.mockReturnValue([tenant({ subscriptionEnd: new Date("2026-07-01T00:00:00Z") })]);
    h.hasPaymentCoveringPeriod.mockResolvedValue(true);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.suspended).toBe(0);
    expect(h.updateSet).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).toHaveBeenCalledOnce();
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["note"]).toBe("payment covers period, skipped suspension@2026-07-01T00:00:00.000Z");
  });

  it("covering payment idempotent: second run does not re-log 'payment covers period' event", async () => {
    h.candidates.mockReturnValue([tenant({ subscriptionEnd: new Date("2026-07-01T00:00:00Z") })]);
    h.hasPaymentCoveringPeriod.mockResolvedValue(true);
    h.hasPaymentCoverageSkipEventBeenSent.mockResolvedValue(true);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.suspended).toBe(0);
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("grace-expired idempotent: second run does not re-log the event", async () => {
    h.candidates.mockReturnValue([
      tenant({
        status: "suspended",
        subscriptionEnd: new Date("2026-06-01T00:00:00Z"),
        gracePeriodEndsAt: new Date("2026-06-25T00:00:00Z"),
      }),
    ]);
    h.hasGraceExpiredEventBeenSent.mockResolvedValue(true);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.graceExpired).toBe(0);
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("grace-expired first time: logs the event once", async () => {
    h.candidates.mockReturnValue([
      tenant({
        status: "suspended",
        subscriptionEnd: new Date("2026-06-01T00:00:00Z"),
        gracePeriodEndsAt: new Date("2026-06-25T00:00:00Z"),
      }),
    ]);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.graceExpired).toBe(1);
    expect(h.insertValues).toHaveBeenCalledOnce();
  });

  it("skip: no admin user found → console.warn, no email, no event", async () => {
    h.candidates.mockReturnValue([tenant()]);
    h.getTenantAdminEmail.mockResolvedValue(null);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.reminders).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("decision 'none' (out-of-threshold days): tenant skipped, no side effects", async () => {
    h.candidates.mockReturnValue([tenant({ subscriptionEnd: new Date("2026-07-15T00:00:00Z") })]);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.reminders).toBe(0);
    expect(result.processed.suspended).toBe(0);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("isolation: one tenant's sendEmail throws, others still processed, errors=1", async () => {
    h.candidates.mockReturnValue([
      tenant({ id: "tenant-bad", subscriptionEnd: new Date("2026-07-08T00:00:00Z") }),
      tenant({ id: "tenant-good", subscriptionEnd: new Date("2026-07-04T00:00:00Z") }),
    ]);
    h.sendEmail.mockImplementationOnce(() => Promise.reject(new Error("Resend down")));
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed.errors).toBe(1);
    expect(result.errorTenantIds).toEqual(["tenant-bad"]);
    expect(result.processed.reminders).toBe(1);
  });

  it("now is deterministic and reflected in the result timestamp", async () => {
    const result = await runExpiryJob({ now: NOW });
    expect(result.at).toBe(NOW.toISOString());
  });

  // AC7 / T10 — job-level exclusions. The SELECT WHERE is mocked, so these assert the
  // in-loop decision layer drops the tenant with no side effects even if it slips through.
  it("skip free plan: no email, no event", async () => {
    h.candidates.mockReturnValue([tenant({ plan: "free" })]);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed).toEqual({ reminders: 0, suspended: 0, graceExpired: 0, errors: 0 });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("skip cancelled: no email, no event", async () => {
    h.candidates.mockReturnValue([tenant({ status: "cancelled" })]);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed).toEqual({ reminders: 0, suspended: 0, graceExpired: 0, errors: 0 });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("skip null subscriptionEnd: no email, no event", async () => {
    h.candidates.mockReturnValue([tenant({ subscriptionEnd: null })]);
    const result = await runExpiryJob({ now: NOW });
    expect(result.processed).toEqual({ reminders: 0, suspended: 0, graceExpired: 0, errors: 0 });
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });
});

