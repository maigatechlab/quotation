import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/schema", () => ({
  tenants: { status: "status", id: "id", subscriptionEnd: "subscriptionEnd", gracePeriodEndsAt: "gracePeriodEndsAt" },
  subscriptionPayments: { amount: "amount", billingCycle: "billingCycle", paidAt: "paidAt", tenantId: "tenantId" },
  tenantEvents: { eventType: "eventType", note: "note", createdAt: "createdAt", tenantId: "tenantId" },
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "COUNT(*)"),
  sum: vi.fn(() => "SUM(amount)"),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  gte: vi.fn((col: unknown, val: unknown) => ({ gte: [col, val] })),
  lt: vi.fn((col: unknown, val: unknown) => ({ lt: [col, val] })),
  between: vi.fn((col: unknown, a: unknown, b: unknown) => ({ between: [col, a, b] })),
  isNotNull: vi.fn((col: unknown) => ({ isNotNull: col })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
}));

import { db } from "@/lib/db";
import {
  computeOwnerMetrics,
  computeRevenue,
  getHealthRatio,
} from "./metrics";

function mockSelectChain(result: unknown) {
  vi.mocked(db.select).mockReturnValue(makeChain(result) as never);
}

function makeChain(res: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    leftJoin: vi.fn(),
    offset: vi.fn(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(res).then(resolve),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.groupBy.mockReturnValue(Promise.resolve(res));
  chain.limit.mockReturnValue(Promise.resolve(res));
  chain.orderBy.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.offset.mockReturnValue(Promise.resolve(res));
  return chain;
}

function mockSelectMultiple(results: unknown[]) {
  let callCount = 0;
  vi.mocked(db.select).mockImplementation(() => {
    const res = results[callCount] ?? results[results.length - 1];
    callCount++;
    return makeChain(res) as never;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeOwnerMetrics", () => {
  it("counts tenants by status and sums total", async () => {
    mockSelectChain([
      { status: "active", n: 3 },
      { status: "trial", n: 2 },
      { status: "suspended", n: 1 },
      { status: "cancelled", n: 0 },
    ]);

    const result = await computeOwnerMetrics();
    expect(result.active).toBe(3);
    expect(result.trial).toBe(2);
    expect(result.suspended).toBe(1);
    expect(result.cancelled).toBe(0);
    expect(result.total).toBe(6);
  });

  it("handles zero tenants", async () => {
    mockSelectChain([]);
    const result = await computeOwnerMetrics();
    expect(result.active).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("computeRevenue", () => {
  it("computes MRR, ARR, and collected this month", async () => {
    // monthly=25000, annual=300000 (=> 300000/12=25000), collected=50000
    mockSelectMultiple([
      [{ total: "25000" }],   // monthly this month
      [{ total: "300000" }],  // annual 12m
      [{ total: "50000" }],   // collected this month
    ]);

    const result = await computeRevenue();
    expect(result.mrr).toBe(25000 + 25000); // 25000 + 300000/12
    expect(result.arr).toBe(result.mrr * 12);
    expect(result.collectedThisMonth).toBe(50000);
  });

  it("handles null sums (no payments)", async () => {
    mockSelectMultiple([
      [{ total: null }],
      [{ total: null }],
      [{ total: null }],
    ]);

    const result = await computeRevenue();
    expect(result.mrr).toBe(0);
    expect(result.arr).toBe(0);
    expect(result.collectedThisMonth).toBe(0);
  });

  it("ARR = MRR * 12", async () => {
    mockSelectMultiple([
      [{ total: "12000" }],
      [{ total: "0" }],
      [{ total: "12000" }],
    ]);

    const result = await computeRevenue();
    expect(result.arr).toBe(result.mrr * 12);
  });
});

describe("getHealthRatio", () => {
  it("returns pct=0 when total is zero (no NaN)", async () => {
    mockSelectChain([]);
    const result = await getHealthRatio();
    expect(result.pct).toBe(0);
    expect(Number.isNaN(result.pct)).toBe(false);
  });

  it("computes correct ratio", async () => {
    mockSelectChain([
      { status: "active", n: 8 },
      { status: "trial", n: 2 },
    ]);

    const result = await getHealthRatio();
    expect(result.active).toBe(8);
    expect(result.total).toBe(10);
    expect(result.pct).toBe(80);
  });
});
