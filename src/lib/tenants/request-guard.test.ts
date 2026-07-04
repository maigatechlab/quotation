import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { assertSessionTenantWritable } from "./request-guard";

function mockSelectOnce(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValueOnce({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  } as never);
}

describe("assertSessionTenantWritable", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows requests without tenant scope", async () => {
    await expect(assertSessionTenantWritable({ id: "u1" })).resolves.toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("allows legacy company-only scopes", async () => {
    await expect(assertSessionTenantWritable({ id: "u1", companyId: "company-1" })).resolves.toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("allows active tenants", async () => {
    mockSelectOnce([{ id: "tenant-1", status: "active" }]);
    await expect(assertSessionTenantWritable({ id: "u1", tenantId: "tenant-1" })).resolves.toBeNull();
  });

  it("blocks suspended non-payment tenants as read-only", async () => {
    mockSelectOnce([{ id: "tenant-1", status: "suspended" }]);
    mockSelectOnce([{ after: { totalBlock: false } }]);

    const response = await assertSessionTenantWritable({ id: "u1", tenantId: "tenant-1" });

    expect(response?.status).toBe(403);
    const body = await response!.json() as { error: { code: string } };
    expect(body.error.code).toBe("TENANT_READONLY");
  });

  it("blocks suspended total-block tenants", async () => {
    mockSelectOnce([{ id: "tenant-1", status: "suspended" }]);
    mockSelectOnce([{ after: { totalBlock: true } }]);

    const response = await assertSessionTenantWritable({ id: "u1", tenantId: "tenant-1" });

    expect(response?.status).toBe(403);
    const body = await response!.json() as { error: { code: string } };
    expect(body.error.code).toBe("TENANT_BLOCKED");
  });

  it("blocks cancelled tenants", async () => {
    mockSelectOnce([{ id: "tenant-1", status: "cancelled" }]);

    const response = await assertSessionTenantWritable({ id: "u1", tenantId: "tenant-1" });

    expect(response?.status).toBe(403);
    const body = await response!.json() as { error: { code: string } };
    expect(body.error.code).toBe("TENANT_CANCELLED");
  });
});