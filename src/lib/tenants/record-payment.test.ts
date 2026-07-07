import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Helper: get first argument of the Nth mock call (bypasses strict tuple typing)
function callArg(mock: ReturnType<typeof vi.fn>, callIdx = 0, argIdx = 0): Record<string, unknown> {
  return (mock.mock.calls as unknown[][])[callIdx]![argIdx] as Record<string, unknown>;
}

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const tenantRow = {
    id: "tenant-1",
    name: "Trans Sahel",
    slug: "trans-sahel",
    status: "active" as "active" | "trial" | "suspended" | "cancelled",
    subscriptionStart: null as Date | null,
    subscriptionEnd: null as Date | null,
    gracePeriodEndsAt: null as Date | null,
  };

  const paymentRow = {
    id: "payment-uuid-1",
    tenantId: "tenant-1",
    amount: 25000,
    currency: "XOF",
    paymentMethod: "wave" as const,
    paymentReference: "WAVE-123",
    paidAt: new Date("2026-06-15T00:00:00.000Z"),
    periodStart: new Date("2026-06-15T00:00:00.000Z"),
    periodEnd: new Date("2026-07-15T00:00:00.000Z"),
    billingCycle: "monthly" as const,
  };

  const txSelectResult = vi.fn<() => unknown[]>(() => [tenantRow]);
  const txInsertReturning = vi.fn(() => Promise.resolve([paymentRow]));
  const txInsertValues = vi.fn(() => ({ returning: txInsertReturning }));
  const txUpdateWhere = vi.fn(() => Promise.resolve());
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));

  // tx mock (inside transaction)
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Promise.resolve(txSelectResult()),
        }),
      }),
    }),
    insert: () => ({ values: txInsertValues }),
    update: () => ({ set: txUpdateSet }),
  };

  // outside-tx: select (for admin user lookup)
  const outerSelectResult = vi.fn<() => unknown[]>(() => [{ email: "admin@tenant.ne" }]);
  // outside-tx: insert (for events)
  const outerInsertValues = vi.fn(() => Promise.resolve());

  const sendEmail = vi.fn<() => Promise<void>>(() => Promise.resolve());

  return {
    tenantRow,
    paymentRow,
    txSelectResult,
    txInsertReturning,
    txInsertValues,
    txUpdateWhere,
    txUpdateSet,
    tx,
    outerSelectResult,
    outerInsertValues,
    sendEmail,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(h.tx),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(h.outerSelectResult()),
          }),
        }),
      }),
    }),
    insert: () => ({ values: h.outerInsertValues }),
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => h.sendEmail(...(args as [])),
}));

// Mock schema re-exports (Drizzle table refs used for eq/and chaining)
vi.mock("@/lib/schema", () => ({
  tenants: {},
  subscriptionPayments: {},
  tenantEvents: {},
  user: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => "eq",
  and: () => "and",
  asc: () => "asc",
}));

vi.mock("@/lib/tenants/tenant-config", () => ({
  APEX_DOMAIN: "quotation.com",
}));

vi.mock("@/lib/tenants/payment-email", () => ({
  buildPaymentConfirmationEmailHtml: () => "<html>mock</html>",
  buildPaymentConfirmationEmailText: () => "mock text",
}));

import type { RecordPaymentInput } from "@/lib/validation/payment";
import { recordPayment, RecordPaymentError } from "./record-payment";

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeInput(overrides: Partial<RecordPaymentInput> = {}): RecordPaymentInput {
  return {
    paymentMethod: "wave",
    paymentReference: "WAVE-123",
    amount: 25000,
    paidAt: "2026-06-15T00:00:00.000Z",
    periodStart: "2026-06-15T00:00:00.000Z",
    periodEnd: "2026-07-15T00:00:00.000Z",
    billingCycle: "monthly",
    reactivateIfSuspended: false,
    ...overrides,
  };
}

const PARAMS = { actorId: "superadmin-1", actorEmail: "owner@maigatechlab.test" };

beforeEach(() => {
  h.tenantRow.status = "active";
  h.tenantRow.subscriptionStart = null;
  h.tenantRow.subscriptionEnd = null;
  h.tenantRow.gracePeriodEndsAt = null;
  h.txSelectResult.mockImplementation(() => [h.tenantRow]);
  h.txInsertReturning.mockResolvedValue([h.paymentRow]);
  h.txUpdateWhere.mockResolvedValue(undefined);
  h.outerSelectResult.mockImplementation(() => [{ email: "admin@tenant.ne" }]);
  h.outerInsertValues.mockResolvedValue(undefined);
  h.sendEmail.mockResolvedValue(undefined);
  h.txInsertValues.mockClear();
  h.txUpdateSet.mockClear();
  h.outerInsertValues.mockClear();
  h.sendEmail.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────
describe("recordPayment", () => {
  describe("nominal case (active tenant)", () => {
    it("returns correct result shape", async () => {
      const result = await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(result.paymentId).toBe("payment-uuid-1");
      expect(result.tenantId).toBe("tenant-1");
      expect(result.amount).toBe(25000);
      expect(result.reactivated).toBe(false);
      expect(result.emailSent).toBe(true);
    });

    it("calls sendEmail once", async () => {
      await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(h.sendEmail).toHaveBeenCalledTimes(1);
    });

    it("inserts payment inside transaction", async () => {
      await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(h.txInsertValues).toHaveBeenCalledTimes(1);
      const insertArg = callArg(h.txInsertValues, 0, 0);
      expect(insertArg.amount).toBe(25000);
      expect(insertArg.currency).toBe("XOF");
    });

    it("inserts payment_recorded event (best-effort)", async () => {
      await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(h.outerInsertValues).toHaveBeenCalledTimes(1);
      const eventArg = callArg(h.outerInsertValues, 0, 0);
      expect(eventArg.eventType).toBe("payment_recorded");
    });

    it("payment_recorded event.after never contains notes", async () => {
      await recordPayment({
        tenantId: "tenant-1",
        input: makeInput({ notes: "secret note" }),
        ...PARAMS,
      });
      const eventArg = callArg(h.outerInsertValues, 0, 0);
      const after = eventArg.after as Record<string, unknown>;
      expect(after).not.toHaveProperty("notes");
    });

    it("active + subscriptionEnd < periodEnd → updates subscriptionEnd", async () => {
      h.tenantRow.subscriptionEnd = new Date("2026-06-20T00:00:00.000Z"); // before periodEnd
      await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(h.txUpdateSet).toHaveBeenCalledTimes(1);
      const setArg = callArg(h.txUpdateSet, 0, 0);
      expect(setArg.subscriptionEnd).toBeInstanceOf(Date);
    });

    it("active + subscriptionEnd > periodEnd → no update to tenant", async () => {
      h.tenantRow.subscriptionEnd = new Date("2026-12-31T00:00:00.000Z"); // after periodEnd
      const result = await recordPayment({
        tenantId: "tenant-1",
        input: makeInput(),
        ...PARAMS,
      });
      expect(h.txUpdateSet).not.toHaveBeenCalled();
      expect(result.subscriptionExtended).toBe(false);
    });
  });

  describe("trial tenant", () => {
    beforeEach(() => {
      h.tenantRow.status = "trial";
      h.tenantRow.subscriptionEnd = new Date("2026-06-20T00:00:00.000Z"); // before periodEnd
    });

    it("promotes to active and clears trialEndsAt", async () => {
      const result = await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(result.activated).toBe(true);
      expect(h.txUpdateSet).toHaveBeenCalledTimes(1);
      const setArg = callArg(h.txUpdateSet, 0, 0);
      expect(setArg.status).toBe("active");
      expect(setArg.trialEndsAt).toBeNull();
      expect(setArg.subscriptionEnd).toBeInstanceOf(Date);
    });

    it("promotes even when subscriptionEnd already covers the period", async () => {
      h.tenantRow.subscriptionEnd = new Date("2026-12-31T00:00:00.000Z"); // after periodEnd
      const result = await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(result.activated).toBe(true);
      expect(result.subscriptionExtended).toBe(false);
      const setArg = callArg(h.txUpdateSet, 0, 0);
      expect(setArg.status).toBe("active");
      expect(setArg).not.toHaveProperty("subscriptionEnd");
    });

    it("inserts payment_recorded and activated events", async () => {
      await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(h.outerInsertValues).toHaveBeenCalledTimes(2);
      const activatedEvent = callArg(h.outerInsertValues, 1, 0);
      expect(activatedEvent.eventType).toBe("activated");
      const after = activatedEvent.after as Record<string, unknown>;
      expect(after.status).toBe("active");
    });

    it("active tenant is never promoted (no activated event)", async () => {
      h.tenantRow.status = "active";
      const result = await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      expect(result.activated).toBe(false);
      const setArg = callArg(h.txUpdateSet, 0, 0);
      expect(setArg).not.toHaveProperty("status");
      expect(h.outerInsertValues).toHaveBeenCalledTimes(1);
    });
  });

  describe("suspended tenant + reactivateIfSuspended=true", () => {
    beforeEach(() => {
      h.tenantRow.status = "suspended";
    });

    it("reactivated=true in result", async () => {
      const result = await recordPayment({
        tenantId: "tenant-1",
        input: makeInput({ reactivateIfSuspended: true }),
        ...PARAMS,
      });
      expect(result.reactivated).toBe(true);
    });

    it("updates tenant status to active", async () => {
      await recordPayment({
        tenantId: "tenant-1",
        input: makeInput({ reactivateIfSuspended: true }),
        ...PARAMS,
      });
      expect(h.txUpdateSet).toHaveBeenCalledTimes(1);
      const setArg = callArg(h.txUpdateSet, 0, 0);
      expect(setArg.status).toBe("active");
      expect(setArg.gracePeriodEndsAt).toBeNull();
    });

    it("inserts both payment_recorded and reactivated events", async () => {
      await recordPayment({
        tenantId: "tenant-1",
        input: makeInput({ reactivateIfSuspended: true }),
        ...PARAMS,
      });
      expect(h.outerInsertValues).toHaveBeenCalledTimes(2);
      const eventTypes = (h.outerInsertValues.mock.calls as unknown[][]).map(
        (c) => (c[0] as Record<string, unknown>).eventType
      );
      expect(eventTypes).toContain("payment_recorded");
      expect(eventTypes).toContain("reactivated");
    });

    it("reactivated event has correct before/after", async () => {
      await recordPayment({
        tenantId: "tenant-1",
        input: makeInput({ reactivateIfSuspended: true }),
        ...PARAMS,
      });
      const reactivatedEvent = (h.outerInsertValues.mock.calls as unknown[][])
        .map((c) => c[0] as Record<string, unknown>)
        .find((e) => e.eventType === "reactivated");
      expect((reactivatedEvent?.before as Record<string, unknown>)?.status).toBe("suspended");
      expect((reactivatedEvent?.after as Record<string, unknown>)?.status).toBe("active");
    });
  });

  describe("suspended tenant + reactivateIfSuspended=false", () => {
    beforeEach(() => {
      h.tenantRow.status = "suspended";
    });

    it("reactivated=false in result", async () => {
      const result = await recordPayment({
        tenantId: "tenant-1",
        input: makeInput({ reactivateIfSuspended: false }),
        ...PARAMS,
      });
      expect(result.reactivated).toBe(false);
    });

    it("does NOT update tenant status", async () => {
      await recordPayment({
        tenantId: "tenant-1",
        input: makeInput({ reactivateIfSuspended: false }),
        ...PARAMS,
      });
      expect(h.txUpdateSet).not.toHaveBeenCalled();
    });
  });

  describe("cancelled tenant", () => {
    beforeEach(() => {
      h.tenantRow.status = "cancelled";
    });

    it("throws RecordPaymentError with CONFLICT code", async () => {
      await expect(
        recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS })
      ).rejects.toThrow(RecordPaymentError);
    });

    it("throws with CONFLICT code specifically", async () => {
      await expect(
        recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("makes no inserts", async () => {
      await expect(
        recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS })
      ).rejects.toThrow();
      expect(h.outerInsertValues).not.toHaveBeenCalled();
    });
  });

  describe("tenant not found", () => {
    beforeEach(() => {
      h.txSelectResult.mockImplementation(() => []);
    });

    it("throws RecordPaymentError with NOT_FOUND code", async () => {
      await expect(
        recordPayment({ tenantId: "unknown", input: makeInput(), ...PARAMS })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("makes no inserts", async () => {
      await expect(
        recordPayment({ tenantId: "unknown", input: makeInput(), ...PARAMS })
      ).rejects.toThrow();
      expect(h.outerInsertValues).not.toHaveBeenCalled();
    });
  });

  describe("sendEmail failure", () => {
    beforeEach(() => {
      h.sendEmail.mockRejectedValue(new Error("Resend down"));
    });

    it("payment is still inserted (no rollback)", async () => {
      const result = await recordPayment({
        tenantId: "tenant-1",
        input: makeInput(),
        ...PARAMS,
      });
      expect(h.txInsertValues).toHaveBeenCalledTimes(1);
      expect(result.paymentId).toBe("payment-uuid-1");
    });

    it("emailSent is false", async () => {
      const result = await recordPayment({
        tenantId: "tenant-1",
        input: makeInput(),
        ...PARAMS,
      });
      expect(result.emailSent).toBe(false);
    });

    it("event note contains 'email échoué'", async () => {
      await recordPayment({ tenantId: "tenant-1", input: makeInput(), ...PARAMS });
      const eventArg = callArg(h.outerInsertValues, 0, 0);
      expect(eventArg.note).toContain("email échoué");
    });
  });

  describe("no admin user for tenant", () => {
    beforeEach(() => {
      h.outerSelectResult.mockImplementation(() => []);
    });

    it("emailSent is false", async () => {
      const result = await recordPayment({
        tenantId: "tenant-1",
        input: makeInput(),
        ...PARAMS,
      });
      expect(result.emailSent).toBe(false);
      expect(h.sendEmail).not.toHaveBeenCalled();
    });

    it("payment is still recorded", async () => {
      const result = await recordPayment({
        tenantId: "tenant-1",
        input: makeInput(),
        ...PARAMS,
      });
      expect(result.paymentId).toBe("payment-uuid-1");
    });
  });
});
