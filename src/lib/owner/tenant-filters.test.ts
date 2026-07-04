import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/schema", () => ({
  tenants: { status: "status", plan: "plan", id: "id", slug: "slug", name: "name", subscriptionEnd: "subscriptionEnd", gracePeriodEndsAt: "gracePeriodEndsAt", createdAt: "createdAt", maxUsers: "maxUsers" },
}));

vi.mock("drizzle-orm", () => ({
  count: vi.fn(() => "COUNT(*)"),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  lte: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  ilike: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

import { parseTenantFilters } from "./tenant-filters";

describe("parseTenantFilters", () => {
  it("defaults to page 1 with no params", () => {
    const result = parseTenantFilters({});
    expect(result.page).toBe(1);
    expect(result.status).toBeUndefined();
    expect(result.plan).toBeUndefined();
  });

  it("parses page from searchParams", () => {
    const result = parseTenantFilters({ page: "3" });
    expect(result.page).toBe(3);
  });

  it("defaults to page 1 for invalid page value", () => {
    expect(parseTenantFilters({ page: "abc" }).page).toBe(1);
    expect(parseTenantFilters({ page: "0" }).page).toBe(1);
    expect(parseTenantFilters({ page: "-5" }).page).toBe(1);
  });

  it("parses valid status", () => {
    expect(parseTenantFilters({ status: "active" }).status).toBe("active");
    expect(parseTenantFilters({ status: "trial" }).status).toBe("trial");
    expect(parseTenantFilters({ status: "suspended" }).status).toBe("suspended");
    expect(parseTenantFilters({ status: "cancelled" }).status).toBe("cancelled");
  });

  it("ignores invalid status", () => {
    expect(parseTenantFilters({ status: "unknown" }).status).toBeUndefined();
    expect(parseTenantFilters({ status: "ACTIVE" }).status).toBeUndefined();
  });

  it("parses valid plan", () => {
    expect(parseTenantFilters({ plan: "free" }).plan).toBe("free");
    expect(parseTenantFilters({ plan: "pro" }).plan).toBe("pro");
    expect(parseTenantFilters({ plan: "enterprise" }).plan).toBe("enterprise");
  });

  it("ignores invalid plan", () => {
    expect(parseTenantFilters({ plan: "premium" }).plan).toBeUndefined();
  });

  it("parses valid expiry", () => {
    expect(parseTenantFilters({ expiry: "expiring-7d" }).expiry).toBe("expiring-7d");
    expect(parseTenantFilters({ expiry: "in-grace" }).expiry).toBe("in-grace");
    expect(parseTenantFilters({ expiry: "overdue-30d" }).expiry).toBe("overdue-30d");
  });

  it("ignores invalid expiry", () => {
    expect(parseTenantFilters({ expiry: "soon" }).expiry).toBeUndefined();
  });

  it("parses valid paymentMethod", () => {
    expect(parseTenantFilters({ paymentMethod: "wave" }).paymentMethod).toBe("wave");
    expect(parseTenantFilters({ paymentMethod: "nitta" }).paymentMethod).toBe("nitta");
  });

  it("parses optional date range fields", () => {
    const result = parseTenantFilters({
      createdAfter: "2026-01-01",
      createdBefore: "2026-06-30",
    });
    expect(result.createdAfter).toBe("2026-01-01");
    expect(result.createdBefore).toBe("2026-06-30");
  });

  it("parses search query", () => {
    expect(parseTenantFilters({ q: "acme" }).q).toBe("acme");
  });

  it("ignores array values (multi-value params)", () => {
    const result = parseTenantFilters({ status: ["active", "trial"] });
    expect(result.status).toBeUndefined();
  });
});
