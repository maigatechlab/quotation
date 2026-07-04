import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractSlugFromHost,
  resolveTenantByHost,
  clearTenantCache,
  type TenantRow,
} from "./resolve-tenant";

const APEX = "quotation.com";

// ---------------------------------------------------------------------------
// extractSlugFromHost
// ---------------------------------------------------------------------------

describe("extractSlugFromHost", () => {
  it("extracts slug from {slug}.quotation.com", () => {
    expect(extractSlugFromHost("acme.quotation.com", APEX)).toBe("acme");
  });

  it("extracts slug from {slug}.quotation.com with port (ignored)", () => {
    expect(extractSlugFromHost("acme.quotation.com:3000", APEX)).toBe("acme");
  });

  it("extracts slug from {slug}.localhost (dev mode)", () => {
    expect(extractSlugFromHost("acme.localhost", APEX)).toBe("acme");
  });

  it("extracts slug from {slug}.localhost with port", () => {
    expect(extractSlugFromHost("acme.localhost:3000", APEX)).toBe("acme");
  });

  it("returns null for apex quotation.com", () => {
    expect(extractSlugFromHost("quotation.com", APEX)).toBeNull();
  });

  it("returns null for www.quotation.com", () => {
    expect(extractSlugFromHost("www.quotation.com", APEX)).toBeNull();
  });

  it("returns null for bare localhost", () => {
    expect(extractSlugFromHost("localhost", APEX)).toBeNull();
  });

  it("returns null for localhost:3000", () => {
    expect(extractSlugFromHost("localhost:3000", APEX)).toBeNull();
  });

  it("returns null for unrelated domain (no subdomain match)", () => {
    expect(extractSlugFromHost("evil.example.com", APEX)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveTenantByHost — cache behaviour
// ---------------------------------------------------------------------------

const mockTenant: TenantRow = {
  id: "tenant-uuid-1",
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  plan: "pro",
  subscriptionStart: null,
  subscriptionEnd: null,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  maxUsers: 5,
  notes: null,
  stripeCustomerId: null,
  stripeCheckoutSessionId: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function makeMockDb(tenant: TenantRow | null) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(tenant ? [tenant] : []),
        }),
      }),
    }),
  } as unknown as Parameters<typeof resolveTenantByHost>[1];
}

describe("resolveTenantByHost", () => {
  beforeEach(() => {
    clearTenantCache();
  });

  it("returns no-tenant for apex domain", async () => {
    const db = makeMockDb(mockTenant);
    const result = await resolveTenantByHost("quotation.com", db);
    expect(result.kind).toBe("no-tenant");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns tenant for valid slug", async () => {
    const db = makeMockDb(mockTenant);
    const result = await resolveTenantByHost("acme.quotation.com", db);
    expect(result.kind).toBe("tenant");
    if (result.kind === "tenant") expect(result.tenant.slug).toBe("acme");
  });

  it("returns not-found for unknown slug", async () => {
    const db = makeMockDb(null);
    const result = await resolveTenantByHost("unknown.quotation.com", db);
    expect(result.kind).toBe("not-found");
  });

  it("caches tenant result — DB called only once", async () => {
    const db = makeMockDb(mockTenant);
    await resolveTenantByHost("acme.quotation.com", db);
    await resolveTenantByHost("acme.quotation.com", db);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("null-caches not-found — DB called only once for unknown slug", async () => {
    const db = makeMockDb(null);
    await resolveTenantByHost("ghost.quotation.com", db);
    await resolveTenantByHost("ghost.quotation.com", db);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("clearTenantCache() forces fresh DB lookup", async () => {
    const db = makeMockDb(mockTenant);
    await resolveTenantByHost("acme.quotation.com", db);
    clearTenantCache();
    await resolveTenantByHost("acme.quotation.com", db);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("testSlug override bypasses host extraction", async () => {
    const db = makeMockDb(mockTenant);
    // host is apex but testSlug forces tenant lookup
    const result = await resolveTenantByHost("localhost:3000", db, "acme");
    expect(result.kind).toBe("tenant");
  });
});
