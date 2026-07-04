import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    $count: vi.fn(),
  },
}));

vi.mock("@/lib/schema", () => ({
  tenants: {
    id: "id",
    name: "name",
    slug: "slug",
    plan: "plan",
    status: "status",
    createdAt: "createdAt",
    subscriptionStart: "subscriptionStart",
    subscriptionEnd: "subscriptionEnd",
    maxUsers: "maxUsers",
  },
  subscriptionPayments: {
    tenantId: "tenantId",
    paymentMethod: "paymentMethod",
    amount: "amount",
    currency: "currency",
    paymentReference: "paymentReference",
    paidAt: "paidAt",
    periodStart: "periodStart",
    periodEnd: "periodEnd",
    billingCycle: "billingCycle",
    confirmedBy: "confirmedBy",
    notes: "notes",
  },
  tenantEvents: { eventType: "eventType", createdAt: "createdAt", tenantId: "tenantId" },
}));

vi.mock("@/lib/tenants/tenant-config", () => ({
  PLAN_PRICES_XOF: {
    free: { monthly: 0, annual: 0 },
    pro: { monthly: 25000, annual: 250000 },
    enterprise: { monthly: 75000, annual: 750000 },
  },
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "COUNT(*)"),
  sum: vi.fn(() => "SUM(amount)"),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  ne: vi.fn((col: unknown, val: unknown) => ({ ne: [col, val] })),
  gte: vi.fn((col: unknown, val: unknown) => ({ gte: [col, val] })),
  lt: vi.fn((col: unknown, val: unknown) => ({ lt: [col, val] })),
  isNotNull: vi.fn((col: unknown) => ({ isNotNull: col })),
}));

import { db } from "@/lib/db";
import {
  computeRenewalForecast,
  computeRevenueByMethod,
  computeTenantKpi,
  fetchTenantsSnapshot,
  isValidDateParam,
  isValidMonthParam,
  validateDateRange,
} from "./reports";

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
  chain.limit.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.offset.mockReturnValue(Promise.resolve(res));
  return chain;
}

function mockSelectChain(result: unknown) {
  const chain = makeChain(result);
  vi.mocked(db.select).mockReturnValue(chain as never);
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

describe("validateDateRange", () => {
  it("rejects when both from/to are missing", () => {
    const result = validateDateRange(null, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("from-to-required");
  });

  it("rejects when only from is provided", () => {
    const result = validateDateRange("2026-06-01", null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("from-to-required");
  });

  it("rejects when from is after to", () => {
    const result = validateDateRange("2026-06-10", "2026-06-01");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("from-after-to");
  });

  it("accepts a valid range and includes the full `to` day", () => {
    const result = validateDateRange("2026-06-01", "2026-06-10");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.range.start).toEqual(new Date(2026, 5, 1));
      expect(result.range.end).toEqual(new Date(2026, 5, 11));
    }
  });

  it("rejects non-date strings instead of letting them reach the DB", () => {
    const result = validateDateRange("abc", "def");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid-date");
  });

  it("rejects a calendar-overflow date (no silent JS Date rollover)", () => {
    const result = validateDateRange("2026-02-30", "2026-06-10");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid-date");
  });

  it("rejects malformed format even if numeric", () => {
    const result = validateDateRange("2026/06/01", "2026-06-10");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid-date");
  });
});

describe("isValidDateParam", () => {
  it("accepts a well-formed calendar date", () => {
    expect(isValidDateParam("2026-06-15")).toBe(true);
  });

  it("rejects garbage input", () => {
    expect(isValidDateParam("not-a-date")).toBe(false);
  });

  it("rejects overflowed day-of-month", () => {
    expect(isValidDateParam("2026-04-31")).toBe(false);
  });
});

describe("isValidMonthParam", () => {
  it("accepts a well-formed YYYY-MM", () => {
    expect(isValidMonthParam("2026-06")).toBe(true);
  });

  it("rejects garbage input", () => {
    expect(isValidMonthParam("foo")).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidMonthParam("2026-13")).toBe(false);
    expect(isValidMonthParam("2026-00")).toBe(false);
  });
});

describe("computeRevenueByMethod", () => {
  const range = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) };

  it("sums amounts per method and computes grand total", async () => {
    mockSelectChain([
      { method: "wave", n: 2, total: "50000" },
      { method: "nitta", n: 1, total: "25000" },
    ]);

    const result = await computeRevenueByMethod(range);
    expect(result.byMethod).toHaveLength(2);
    expect(result.grandTotal).toBe(75000);
    expect(result.totalCount).toBe(3);
  });

  it("handles zero payments", async () => {
    mockSelectChain([]);
    const result = await computeRevenueByMethod(range);
    expect(result.byMethod).toEqual([]);
    expect(result.grandTotal).toBe(0);
    expect(result.totalCount).toBe(0);
  });
});

describe("computeTenantKpi", () => {
  const range = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) };

  it("returns newTenants, churn and activeNow", async () => {
    mockSelectMultiple([[{ n: 3 }], [{ n: 5 }], [{ n: 8 }]]);
    const result = await computeTenantKpi(range);
    expect(result).toEqual({ newTenants: 3, churn: 5, activeNow: 8 });
  });

  it("defaults to 0 when no rows returned", async () => {
    mockSelectMultiple([[], [], []]);
    const result = await computeTenantKpi(range);
    expect(result).toEqual({ newTenants: 0, churn: 0, activeNow: 0 });
  });
});

describe("computeRenewalForecast", () => {
  const monthStart = new Date(2026, 5, 1);

  it("computes expected amounts per plan/cycle, includes free at 0", async () => {
    mockSelectChain([
      {
        id: "t1",
        name: "Pro Co",
        slug: "pro-co",
        plan: "pro",
        status: "active",
        subscriptionEnd: new Date(2026, 6, 15),
        lastCycle: "monthly",
      },
      {
        id: "t2",
        name: "Enterprise Co",
        slug: "ent-co",
        plan: "enterprise",
        status: "active",
        subscriptionEnd: new Date(2026, 6, 20),
        lastCycle: "annual",
      },
      {
        id: "t3",
        name: "Free Co",
        slug: "free-co",
        plan: "free",
        status: "trial",
        subscriptionEnd: new Date(2026, 6, 5),
        lastCycle: null,
      },
    ]);

    const result = await computeRenewalForecast(monthStart);
    expect(result.count).toBe(3);
    expect(result.totalExpected).toBe(25000 + 750000 + 0);
    const free = result.forecast.find((r) => r.plan === "free");
    expect(free?.expectedAmount).toBe(0);
    expect(free?.cycle).toBe("monthly");
  });

  it("returns empty forecast when nothing renews next month", async () => {
    mockSelectChain([]);
    const result = await computeRenewalForecast(monthStart);
    expect(result.forecast).toEqual([]);
    expect(result.totalExpected).toBe(0);
    expect(result.count).toBe(0);
  });
});

describe("fetchTenantsSnapshot", () => {
  it("returns rows, total and totalPages", async () => {
    mockSelectChain([{ id: "t1", name: "Acme", slug: "acme", plan: "pro", status: "active", subscriptionStart: null, subscriptionEnd: null, maxUsers: 5 }]);
    vi.mocked(db.$count).mockResolvedValue(120);

    const result = await fetchTenantsSnapshot(1, 50);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(120);
    expect(result.totalPages).toBe(3);
  });

  it("clamps a negative or NaN page to 1 (never produces a negative offset)", async () => {
    const chain = mockSelectChain([]);
    vi.mocked(db.$count).mockResolvedValue(0);

    await fetchTenantsSnapshot(Number.NaN, 50);
    expect(chain.offset).toHaveBeenCalledWith(0);

    await fetchTenantsSnapshot(-5, 50);
    expect(chain.offset).toHaveBeenCalledWith(0);
  });
});
