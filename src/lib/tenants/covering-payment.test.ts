import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const orderByResult = vi.fn<() => unknown[]>(() => []);
  const limitResult = vi.fn<() => unknown[]>(() => []);
  const whereArgs = vi.fn();

  return { orderByResult, limitResult, whereArgs };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => {
          h.whereArgs(...args);
          return {
            orderBy: () => Promise.resolve(h.orderByResult()),
            limit: () => Promise.resolve(h.limitResult()),
          };
        },
      }),
    }),
  },
}));

vi.mock("@/lib/schema", () => ({
  subscriptionPayments: {
    tenantId: "tenantId",
    periodStart: "periodStart",
    periodEnd: "periodEnd",
    paidAt: "paidAt",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ["and", ...args],
  eq: (...args: unknown[]) => ["eq", ...args],
  lte: (...args: unknown[]) => ["lte", ...args],
  gt: (...args: unknown[]) => ["gt", ...args],
  desc: (...args: unknown[]) => ["desc", ...args],
}));

import { findCoveringPayments, getPaymentForTenant, isPaymentCovering } from "./covering-payment";

beforeEach(() => {
  h.orderByResult.mockReset().mockImplementation(() => []);
  h.limitResult.mockReset().mockImplementation(() => []);
  h.whereArgs.mockClear();
});

afterEach(() => vi.clearAllMocks());

describe("isPaymentCovering", () => {
  const today = new Date("2026-06-20T00:00:00.000Z");

  it("covers when periodStart <= today < periodEnd", () => {
    const payment = {
      periodStart: new Date("2026-06-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-01T00:00:00.000Z"),
    };
    expect(isPaymentCovering(payment, today)).toBe(true);
  });

  it("does not cover when expired (periodEnd < today)", () => {
    const payment = {
      periodStart: new Date("2026-05-01T00:00:00.000Z"),
      periodEnd: new Date("2026-06-01T00:00:00.000Z"),
    };
    expect(isPaymentCovering(payment, today)).toBe(false);
  });

  it("does not cover when future (periodStart > today)", () => {
    const payment = {
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    };
    expect(isPaymentCovering(payment, today)).toBe(false);
  });

  it("edge: periodStart === today → covers (inclusive)", () => {
    const payment = {
      periodStart: new Date("2026-06-20T00:00:00.000Z"),
      periodEnd: new Date("2026-07-20T00:00:00.000Z"),
    };
    expect(isPaymentCovering(payment, today)).toBe(true);
  });

  it("edge: periodEnd === today → does NOT cover (exclusive)", () => {
    const payment = {
      periodStart: new Date("2026-05-20T00:00:00.000Z"),
      periodEnd: new Date("2026-06-20T00:00:00.000Z"),
    };
    expect(isPaymentCovering(payment, today)).toBe(false);
  });
});

describe("findCoveringPayments", () => {
  it("returns rows from db, filtered by tenant and period via where clause", async () => {
    const rows = [{ id: "p1", tenantId: "tenant-1" }];
    h.orderByResult.mockImplementation(() => rows);
    const result = await findCoveringPayments("tenant-1", new Date("2026-06-20"));
    expect(result).toEqual(rows);
    expect(h.whereArgs).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no covering payment", async () => {
    h.orderByResult.mockImplementation(() => []);
    const result = await findCoveringPayments("tenant-1");
    expect(result).toEqual([]);
  });
});

describe("getPaymentForTenant", () => {
  it("returns the payment when it belongs to the tenant", async () => {
    const payment = { id: "p1", tenantId: "tenant-1" };
    h.limitResult.mockImplementation(() => [payment]);
    const result = await getPaymentForTenant("tenant-1", "p1");
    expect(result).toEqual(payment);
  });

  it("returns null when paymentId does not exist", async () => {
    h.limitResult.mockImplementation(() => []);
    const result = await getPaymentForTenant("tenant-1", "missing");
    expect(result).toBeNull();
  });

  it("returns null when payment does not belong to the tenant", async () => {
    h.limitResult.mockImplementation(() => []);
    const result = await getPaymentForTenant("other-tenant", "p1");
    expect(result).toBeNull();
  });
});
