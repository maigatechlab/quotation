import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const eventRows = vi.fn<() => unknown[]>(() => []);

  return { eventRows };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => Promise.resolve(h.eventRows()),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/schema", () => ({
  tenantEvents: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => "eq",
  and: () => "and",
  desc: () => "desc",
}));

import { isTotalBlock, assertTenantWritable, TenantBlockError } from "./tenant-access";

beforeEach(() => {
  h.eventRows.mockImplementation(() => []);
});

afterEach(() => vi.clearAllMocks());

describe("isTotalBlock", () => {
  it("cancelled → true (always)", async () => {
    const result = await isTotalBlock({ id: "t1", status: "cancelled" });
    expect(result).toBe(true);
    expect(h.eventRows).not.toHaveBeenCalled();
  });

  it("active → false", async () => {
    const result = await isTotalBlock({ id: "t1", status: "active" });
    expect(result).toBe(false);
  });

  it("trial → false", async () => {
    const result = await isTotalBlock({ id: "t1", status: "trial" });
    expect(result).toBe(false);
  });

  it("suspended + last event totalBlock=true → true", async () => {
    h.eventRows.mockImplementation(() => [{ after: { totalBlock: true } }]);
    const result = await isTotalBlock({ id: "t1", status: "suspended" });
    expect(result).toBe(true);
  });

  it("suspended + last event totalBlock=false → false", async () => {
    h.eventRows.mockImplementation(() => [{ after: { totalBlock: false } }]);
    const result = await isTotalBlock({ id: "t1", status: "suspended" });
    expect(result).toBe(false);
  });

  it("suspended + no event rows → false", async () => {
    h.eventRows.mockImplementation(() => []);
    const result = await isTotalBlock({ id: "t1", status: "suspended" });
    expect(result).toBe(false);
  });

  it("suspended + event after=null → false", async () => {
    h.eventRows.mockImplementation(() => [{ after: null }]);
    const result = await isTotalBlock({ id: "t1", status: "suspended" });
    expect(result).toBe(false);
  });
});

describe("assertTenantWritable", () => {
  it("active → resolves without throwing", async () => {
    await expect(assertTenantWritable({ id: "t1", status: "active" })).resolves.toBeUndefined();
  });

  it("trial → resolves without throwing", async () => {
    await expect(assertTenantWritable({ id: "t1", status: "trial" })).resolves.toBeUndefined();
  });

  it("cancelled → throws TENANT_CANCELLED", async () => {
    await expect(assertTenantWritable({ id: "t1", status: "cancelled" })).rejects.toThrow(TenantBlockError);
    try {
      await assertTenantWritable({ id: "t1", status: "cancelled" });
    } catch (e) {
      expect((e as TenantBlockError).code).toBe("TENANT_CANCELLED");
    }
  });

  it("suspended + non-paiement (totalBlock=false) → throws TENANT_READONLY", async () => {
    h.eventRows.mockImplementation(() => [{ after: { totalBlock: false } }]);
    try {
      await assertTenantWritable({ id: "t1", status: "suspended" });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TenantBlockError).code).toBe("TENANT_READONLY");
    }
  });

  it("suspended + fraude (totalBlock=true) → throws TENANT_BLOCKED", async () => {
    h.eventRows.mockImplementation(() => [{ after: { totalBlock: true } }]);
    try {
      await assertTenantWritable({ id: "t1", status: "suspended" });
      expect.fail("should have thrown");
    } catch (e) {
      expect((e as TenantBlockError).code).toBe("TENANT_BLOCKED");
    }
  });
});
