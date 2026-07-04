import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/schema", () => ({
  tenants: { id: "tenants.id" },
  subscriptionPayments: {
    id: "sp.id",
    amount: "sp.amount",
    currency: "sp.currency",
    paymentMethod: "sp.paymentMethod",
    paymentReference: "sp.paymentReference",
    paidAt: "sp.paidAt",
    periodStart: "sp.periodStart",
    periodEnd: "sp.periodEnd",
    billingCycle: "sp.billingCycle",
    confirmedBy: "sp.confirmedBy",
    tenantId: "sp.tenantId",
  },
  tenantEvents: {
    id: "te.id",
    eventType: "te.eventType",
    actorId: "te.actorId",
    before: "te.before",
    after: "te.after",
    note: "te.note",
    createdAt: "te.createdAt",
    tenantId: "te.tenantId",
  },
  user: { id: "user.id", email: "user.email", name: "user.name", role: "user.role", emailVerified: "user.emailVerified", createdAt: "user.createdAt", tenantId: "user.tenantId" },
  session: { userId: "session.userId", expiresAt: "session.expiresAt", updatedAt: "session.updatedAt" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ eq: [col, val] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  asc: vi.fn((col: unknown) => ({ asc: col })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

import { db } from "@/lib/db";
import {
  computeUserQuota,
  getCurrentPeriod,
  getTenantEvents,
  getTenantPayments,
  getTenantUsers,
} from "./tenant-detail";

function makeChain(res: unknown) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(res).then(resolve),
  };
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(Promise.resolve(res));
  return chain;
}

function mockSelect(result: unknown) {
  vi.mocked(db.select).mockReturnValue(makeChain(result) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTenantPayments", () => {
  it("returns payments sorted DESC with confirmerEmail resolved via LEFT JOIN", async () => {
    mockSelect([
      { id: "p1", confirmedBy: "u1", confirmerEmail: "admin@acme.ne", billingCycle: "monthly" },
    ]);
    const result = await getTenantPayments("tenant-1");
    expect(result).toHaveLength(1);
    expect(result[0]?.confirmerEmail).toBe("admin@acme.ne");
  });

  it("confirmedBy set but no matching user → confirmerEmail null", async () => {
    mockSelect([{ id: "p1", confirmedBy: "system", confirmerEmail: null, billingCycle: "monthly" }]);
    const result = await getTenantPayments("tenant-1");
    expect(result[0]?.confirmerEmail).toBeNull();
  });
});

describe("getCurrentPeriod", () => {
  const tenant = {
    subscriptionStart: new Date("2026-01-01"),
    subscriptionEnd: new Date("2026-02-01"),
    status: "active",
    trialEndsAt: null,
    gracePeriodEndsAt: null,
  };

  it("cycle = last payment billingCycle (payments already sorted DESC)", () => {
    const result = getCurrentPeriod(tenant, [{ billingCycle: "annual" }, { billingCycle: "monthly" }]);
    expect(result.cycle).toBe("annual");
  });

  it("cycle = null when there are zero payments", () => {
    const result = getCurrentPeriod(tenant, []);
    expect(result.cycle).toBeNull();
  });

  it("carries grace and trial dates through from the tenant", () => {
    const tenantInGrace = { ...tenant, gracePeriodEndsAt: new Date("2026-02-10") };
    const result = getCurrentPeriod(tenantInGrace, []);
    expect(result.gracePeriodEndsAt).toEqual(new Date("2026-02-10"));
  });
});

describe("getTenantUsers", () => {
  it("returns users sorted ASC with lastSeen resolved", async () => {
    mockSelect([{ id: "u1", lastSeen: new Date("2026-06-01") }]);
    const result = await getTenantUsers("tenant-1");
    expect(result[0]?.lastSeen).toEqual(new Date("2026-06-01"));
  });

  it("lastSeen is null when the user has no session", async () => {
    mockSelect([{ id: "u1", lastSeen: null }]);
    const result = await getTenantUsers("tenant-1");
    expect(result[0]?.lastSeen).toBeNull();
  });
});

describe("getTenantEvents", () => {
  it("filters by eventType when provided", async () => {
    mockSelect([{ id: "e1", eventType: "suspended", actorEmail: "owner@ml.com" }]);
    const result = await getTenantEvents("tenant-1", "suspended");
    expect(result).toHaveLength(1);
  });

  it("'all' behaves as no filter", async () => {
    mockSelect([{ id: "e1" }, { id: "e2" }]);
    const result = await getTenantEvents("tenant-1", "all");
    expect(result).toHaveLength(2);
  });

  it("actorEmail is null when actorId='system' (cron sentinel, LEFT JOIN miss)", async () => {
    mockSelect([{ id: "e1", eventType: "reminder_sent", actorId: "system", actorEmail: null }]);
    const result = await getTenantEvents("tenant-1");
    expect(result[0]?.actorEmail).toBeNull();
  });
});

describe("computeUserQuota", () => {
  it("uses tenant.maxUsers directly (free-plan default = 1)", () => {
    expect(computeUserQuota({ maxUsers: 1 }, 1)).toMatchObject({ active: 1, max: 1, tone: "full" });
  });

  it("pro-plan default max=5, tone ok under 80%", () => {
    expect(computeUserQuota({ maxUsers: 5 }, 2)).toMatchObject({ max: 5, tone: "ok" });
  });

  it("enterprise-plan default max=20", () => {
    expect(computeUserQuota({ maxUsers: 20 }, 20)).toMatchObject({ max: 20, tone: "full" });
  });

  it("warn tone at >= 80%", () => {
    expect(computeUserQuota({ maxUsers: 5 }, 4)).toMatchObject({ pct: 80, tone: "warn" });
  });

  it("exceeded tone when active > max (post-downgrade edge case)", () => {
    expect(computeUserQuota({ maxUsers: 5 }, 6)).toMatchObject({ tone: "exceeded" });
  });

  it("uses the tenant's overridden maxUsers, not the plan default (owner override, story 7-9 fix)", () => {
    // A "pro" tenant whose owner manually raised maxUsers to 8 — must NOT be
    // capped back down to PLAN_LIMITS.pro.maxUsers (5).
    expect(computeUserQuota({ maxUsers: 8 }, 6)).toMatchObject({ max: 8, tone: "ok" });
  });

  it("max=0 guard: pct stays 0 (no division by zero), any user counts as exceeded", () => {
    expect(computeUserQuota({ maxUsers: 0 }, 0)).toMatchObject({ max: 0, pct: 0, tone: "ok" });
    expect(computeUserQuota({ maxUsers: 0 }, 1)).toMatchObject({ tone: "exceeded" });
  });
});
