import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function callArg(mock: ReturnType<typeof vi.fn>, callIdx = 0, argIdx = 0): Record<string, unknown> {
  return (mock.mock.calls as unknown[][])[callIdx]![argIdx] as Record<string, unknown>;
}

const h = vi.hoisted(() => {
  const tenantRow = {
    id: "tenant-1",
    name: "Trans Sahel",
    slug: "trans-sahel",
    status: "suspended" as "active" | "trial" | "suspended" | "cancelled",
    subscriptionStart: new Date("2026-05-01T00:00:00.000Z") as Date | null,
    subscriptionEnd: new Date("2026-06-01T00:00:00.000Z") as Date | null,
  };

  const paymentRow = {
    id: "payment-1",
    tenantId: "tenant-1",
    amount: 25000,
    currency: "XOF",
    paymentMethod: "wave",
    paymentReference: "WAVE-123",
    periodStart: new Date("2026-06-15T00:00:00.000Z"),
    periodEnd: new Date("2026-07-15T00:00:00.000Z"),
  };

  const txSelectResult = vi.fn<() => unknown[]>(() => [tenantRow]);
  const txUpdateWhere = vi.fn(() => Promise.resolve());
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));

  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve(txSelectResult()),
        }),
      }),
    }),
    update: () => ({ set: txUpdateSet }),
  };

  const outerSelectResult = vi.fn<() => unknown[]>(() => [{ name: tenantRow.name, slug: tenantRow.slug }]);
  const outerInsertValues = vi.fn(() => Promise.resolve());

  const sendEmail = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const getTenantAdminEmail = vi.fn<() => Promise<string | null>>(() => Promise.resolve("admin@tenant.ne"));
  const getPaymentForTenant = vi.fn<() => Promise<unknown>>(() => Promise.resolve(paymentRow));
  const isPaymentCovering = vi.fn<() => boolean>(() => true);

  return {
    tenantRow,
    paymentRow,
    txSelectResult,
    txUpdateWhere,
    txUpdateSet,
    tx,
    outerSelectResult,
    outerInsertValues,
    sendEmail,
    getTenantAdminEmail,
    getPaymentForTenant,
    isPaymentCovering,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(h.tx),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.outerSelectResult()),
        }),
      }),
    }),
    insert: () => ({ values: h.outerInsertValues }),
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => h.sendEmail(...(args as [])),
}));

vi.mock("@/lib/schema", () => ({
  tenants: {},
  tenantEvents: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => "eq",
}));

vi.mock("@/lib/tenants/tenant-config", () => ({
  APEX_DOMAIN: "quotation.com",
}));

vi.mock("@/lib/tenants/platform-config", () => ({
  getNotificationToggle: () => Promise.resolve(true),
  getNotificationSenderAddress: () => Promise.resolve("noreply@quotation.app"),
}));

vi.mock("@/lib/tenants/tenant-contact", () => ({
  getTenantAdminEmail: (...args: unknown[]) => h.getTenantAdminEmail(...(args as [])),
}));

vi.mock("@/lib/tenants/covering-payment", () => ({
  getPaymentForTenant: (...args: unknown[]) => h.getPaymentForTenant(...(args as [])),
  isPaymentCovering: (...args: unknown[]) => h.isPaymentCovering(...(args as [])),
}));

vi.mock("@/lib/tenants/reactivate-email", () => ({
  buildReactivationEmailHtml: () => "<html>mock</html>",
  buildReactivationEmailText: () => "mock text",
}));

import { reactivateTenant, reactivateTenantWithPayment, ReactivateError } from "./reactivate";

const PARAMS = { actorId: "superadmin-1", actorEmail: "owner@maigatechlab.test" };

beforeEach(() => {
  h.tenantRow.status = "suspended";
  h.tenantRow.subscriptionStart = new Date("2026-05-01T00:00:00.000Z");
  h.tenantRow.subscriptionEnd = new Date("2026-06-01T00:00:00.000Z");
  h.txSelectResult.mockImplementation(() => [h.tenantRow]);
  h.txUpdateWhere.mockResolvedValue(undefined);
  h.txUpdateSet.mockClear();
  h.outerSelectResult.mockImplementation(() => [{ name: h.tenantRow.name, slug: h.tenantRow.slug }]);
  h.outerInsertValues.mockResolvedValue(undefined);
  h.outerInsertValues.mockClear();
  h.sendEmail.mockResolvedValue(undefined);
  h.sendEmail.mockClear();
  h.getTenantAdminEmail.mockResolvedValue("admin@tenant.ne");
  h.getPaymentForTenant.mockResolvedValue(h.paymentRow);
  h.isPaymentCovering.mockReturnValue(true);
});

afterEach(() => vi.clearAllMocks());

describe("reactivateTenant", () => {
  it("nominal: suspended tenant + covering payment → active, event + email", async () => {
    const result = await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1" },
      ...PARAMS,
    });
    expect(result).toEqual({
      tenantId: "tenant-1",
      status: "active",
      subscriptionStart: h.paymentRow.periodStart,
      subscriptionEnd: h.paymentRow.periodEnd,
      coveringPaymentId: "payment-1",
      emailSent: true,
    });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.outerInsertValues).toHaveBeenCalledTimes(1);
  });

  it("UPDATE sets status=active, subscription from payment, gracePeriodEndsAt=null", async () => {
    await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1" },
      ...PARAMS,
    });
    const setArg = callArg(h.txUpdateSet, 0, 0);
    expect(setArg.status).toBe("active");
    expect(setArg.subscriptionStart).toEqual(h.paymentRow.periodStart);
    expect(setArg.subscriptionEnd).toEqual(h.paymentRow.periodEnd);
    expect(setArg.gracePeriodEndsAt).toBeNull();
  });

  it("event.after contains coveringPaymentId and never contains note", async () => {
    await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1", note: "note privée owner" },
      ...PARAMS,
    });
    const eventArg = callArg(h.outerInsertValues, 0, 0);
    const after = eventArg.after as Record<string, unknown>;
    expect(after.coveringPaymentId).toBe("payment-1");
    expect(after).not.toHaveProperty("note");
  });

  it("owner-supplied note is appended to the top-level event note (never in after)", async () => {
    await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1", note: "Régularisation manuelle" },
      ...PARAMS,
    });
    const eventArg = callArg(h.outerInsertValues, 0, 0);
    expect(eventArg.note).toContain("Régularisation manuelle");
  });

  it("omits the note suffix when no note is provided", async () => {
    await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1" },
      ...PARAMS,
    });
    const eventArg = callArg(h.outerInsertValues, 0, 0);
    expect(eventArg.note).not.toContain("Note:");
  });

  it("cancelled tenant + covering payment → active, event before.status=cancelled", async () => {
    h.tenantRow.status = "cancelled";
    await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1" },
      ...PARAMS,
    });
    const eventArg = callArg(h.outerInsertValues, 0, 0);
    const before = eventArg.before as Record<string, unknown>;
    expect(before.status).toBe("cancelled");
  });

  it("payment not found → NO_COVERING_PAYMENT, 0 update, 0 event", async () => {
    h.getPaymentForTenant.mockResolvedValue(null);
    await expect(
      reactivateTenant({ tenantId: "tenant-1", input: { coveringPaymentId: "missing" }, ...PARAMS })
    ).rejects.toMatchObject({ code: "NO_COVERING_PAYMENT" });
    expect(h.txUpdateSet).not.toHaveBeenCalled();
    expect(h.outerInsertValues).not.toHaveBeenCalled();
  });

  it("payment exists but does not cover today → NO_COVERING_PAYMENT, 0 update", async () => {
    h.isPaymentCovering.mockReturnValue(false);
    await expect(
      reactivateTenant({ tenantId: "tenant-1", input: { coveringPaymentId: "payment-1" }, ...PARAMS })
    ).rejects.toBeInstanceOf(ReactivateError);
    expect(h.txUpdateSet).not.toHaveBeenCalled();
  });

  it("tenant already active → CONFLICT, 0 update", async () => {
    h.tenantRow.status = "active";
    await expect(
      reactivateTenant({ tenantId: "tenant-1", input: { coveringPaymentId: "payment-1" }, ...PARAMS })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.txUpdateSet).not.toHaveBeenCalled();
  });

  it("tenant not found (SELECT FOR UPDATE empty) → NOT_FOUND", async () => {
    h.txSelectResult.mockImplementation(() => []);
    await expect(
      reactivateTenant({ tenantId: "missing", input: { coveringPaymentId: "payment-1" }, ...PARAMS })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("sendEmail fails → reactivation kept, emailSent=false, event note mentions failure", async () => {
    h.sendEmail.mockRejectedValue(new Error("Resend down"));
    const result = await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1" },
      ...PARAMS,
    });
    expect(result.status).toBe("active");
    expect(result.emailSent).toBe(false);
    const eventArg = callArg(h.outerInsertValues, 0, 0);
    expect(eventArg.note).toContain("email échoué");
  });

  it("no admin user → email skipped, emailSent=false", async () => {
    h.getTenantAdminEmail.mockResolvedValue(null);
    const result = await reactivateTenant({
      tenantId: "tenant-1",
      input: { coveringPaymentId: "payment-1" },
      ...PARAMS,
    });
    expect(result.emailSent).toBe(false);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});

describe("reactivateTenantWithPayment (shared helper)", () => {
  it("updates the tenant and returns oldStatus/oldSubscriptionEnd", async () => {
    const result = await reactivateTenantWithPayment({
      tx: h.tx as never,
      tenantId: "tenant-1",
      payment: {
        id: "payment-1",
        periodStart: h.paymentRow.periodStart,
        periodEnd: h.paymentRow.periodEnd,
        paymentMethod: "wave",
        amount: 25000,
        currency: "XOF",
        paymentReference: "WAVE-123",
      },
    });
    expect(result.oldStatus).toBe("suspended");
    expect(result.oldSubscriptionEnd).toEqual(h.tenantRow.subscriptionEnd);
    expect(h.txUpdateSet).toHaveBeenCalledTimes(1);
    const setArg = callArg(h.txUpdateSet, 0, 0);
    expect(setArg.status).toBe("active");
  });

  it("throws CONFLICT when tenant status is not suspended/cancelled", async () => {
    h.tenantRow.status = "active";
    await expect(
      reactivateTenantWithPayment({
        tx: h.tx as never,
        tenantId: "tenant-1",
        payment: {
          id: "payment-1",
          periodStart: h.paymentRow.periodStart,
          periodEnd: h.paymentRow.periodEnd,
          paymentMethod: "wave",
          amount: 25000,
          currency: "XOF",
          paymentReference: null,
        },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("throws NOT_FOUND when tenant does not exist", async () => {
    h.txSelectResult.mockImplementation(() => []);
    await expect(
      reactivateTenantWithPayment({
        tx: h.tx as never,
        tenantId: "missing",
        payment: {
          id: "payment-1",
          periodStart: h.paymentRow.periodStart,
          periodEnd: h.paymentRow.periodEnd,
          paymentMethod: "wave",
          amount: 25000,
          currency: "XOF",
          paymentReference: null,
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
