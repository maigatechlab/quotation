import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const existingTenant = {
    id: "tenant-1",
    name: "Trans Sahel",
    slug: "trans-sahel",
    plan: "free" as const,
    notes: null as string | null,
    status: "active" as const,
  };

  const selectResult = vi.fn<() => unknown[]>(() => [existingTenant]);
  const updateReturning = vi.fn<() => Promise<unknown[]>>(() =>
    Promise.resolve([{ ...existingTenant, plan: "pro" }])
  );
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const insertValues = vi.fn(() => Promise.resolve());
  const getPlanLimits = vi.fn(() =>
    Promise.resolve({ free: { maxUsers: 1 }, pro: { maxUsers: 8 }, enterprise: { maxUsers: 20 } })
  );

  return { existingTenant, selectResult, updateReturning, updateWhere, updateSet, insertValues, getPlanLimits };
});

vi.mock("@/lib/db", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: () => Promise.resolve(h.selectResult()),
              }),
            }),
          }),
        }),
        update: () => ({ set: h.updateSet }),
      }),
    insert: () => ({ values: h.insertValues }),
  },
}));

vi.mock("@/lib/schema", () => ({
  tenants: {},
  tenantEvents: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => "eq",
}));

vi.mock("@/lib/tenants/platform-config", () => ({
  getPlanLimits: h.getPlanLimits,
}));

vi.mock("@/lib/tenants/suspend", () => ({
  TenantNotFoundError: class TenantNotFoundError extends Error {
    constructor(tenantId: string) {
      super(`Tenant not found: ${tenantId}`);
      this.name = "TenantNotFoundError";
    }
  },
}));

import { applyTenantUpdate, TenantNotFoundError } from "./update-tenant";

const ACTOR = { actorId: "superadmin-1", actorEmail: "owner@maigatechlab.test" };

beforeEach(() => {
  h.selectResult.mockImplementation(() => [h.existingTenant]);
  h.updateReturning.mockResolvedValue([{ ...h.existingTenant, plan: "pro" }]);
  h.insertValues.mockResolvedValue(undefined);
  h.updateSet.mockClear();
  h.updateWhere.mockClear();
  h.insertValues.mockClear();
  h.getPlanLimits.mockClear();
});

afterEach(() => vi.clearAllMocks());

describe("applyTenantUpdate", () => {
  it("nominal: update plan â†’ UPDATE + event plan_changed, changes=['plan']", async () => {
    const result = await applyTenantUpdate({
      tenantId: "tenant-1",
      input: { plan: "pro" },
      ...ACTOR,
    });
    expect(result.changes).toEqual(["plan"]);
    expect(result.tenant.plan).toBe("pro");
    expect(h.insertValues).toHaveBeenCalledOnce();
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["eventType"]).toBe("plan_changed");
  });

  it("update notes â†’ event 'updated', changes=['notes']", async () => {
    h.updateReturning.mockResolvedValue([{ ...h.existingTenant, notes: "hello" }]);
    const result = await applyTenantUpdate({
      tenantId: "tenant-1",
      input: { notes: "hello" },
      ...ACTOR,
    });
    expect(result.changes).toEqual(["notes"]);
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["eventType"]).toBe("updated");
  });

  it("update status â†’ event 'updated', changes=['status']", async () => {
    h.updateReturning.mockResolvedValue([{ ...h.existingTenant, status: "suspended" }]);
    const result = await applyTenantUpdate({
      tenantId: "tenant-1",
      input: { status: "suspended" },
      ...ACTOR,
    });
    expect(result.changes).toEqual(["status"]);
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["eventType"]).toBe("updated");
  });

  it("update plan + notes â†’ event 'plan_changed' takes priority, changes=['plan','notes']", async () => {
    h.updateReturning.mockResolvedValue([{ ...h.existingTenant, plan: "enterprise", notes: "hi" }]);
    const result = await applyTenantUpdate({
      tenantId: "tenant-1",
      input: { plan: "enterprise", notes: "hi" },
      ...ACTOR,
    });
    expect(result.changes).toEqual(["plan", "notes"]);
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["eventType"]).toBe("plan_changed");
  });

  it("tenant not found (select returns empty) â†’ TenantNotFoundError", async () => {
    h.selectResult.mockImplementation(() => []);
    await expect(
      applyTenantUpdate({ tenantId: "missing", input: { plan: "pro" }, ...ACTOR })
    ).rejects.toThrow(TenantNotFoundError);
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("update returns no row (concurrent delete) â†’ TenantNotFoundError", async () => {
    h.updateReturning.mockResolvedValue([]);
    await expect(
      applyTenantUpdate({ tenantId: "tenant-1", input: { plan: "pro" }, ...ACTOR })
    ).rejects.toThrow(TenantNotFoundError);
  });

  it("event insert fails â†’ update result still returned (best-effort)", async () => {
    h.insertValues.mockRejectedValue(new Error("db down"));
    const result = await applyTenantUpdate({
      tenantId: "tenant-1",
      input: { plan: "pro" },
      ...ACTOR,
    });
    expect(result.tenant.plan).toBe("pro");
  });

  it("plan change syncs tenants.maxUsers from platform settings", async () => {
    await applyTenantUpdate({ tenantId: "tenant-1", input: { plan: "pro" }, ...ACTOR });
    const setArg = (h.updateSet.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(setArg["plan"]).toBe("pro");
    expect(setArg["maxUsers"]).toBe(8);
    expect(h.getPlanLimits).toHaveBeenCalledOnce();
  });

  it("notes '' with existing text â†’ cleared to NULL, changes=['notes']", async () => {
    h.selectResult.mockImplementation(() => [{ ...h.existingTenant, notes: "old note" }]);
    h.updateReturning.mockResolvedValue([{ ...h.existingTenant, notes: null }]);
    const result = await applyTenantUpdate({
      tenantId: "tenant-1",
      input: { notes: "" },
      ...ACTOR,
    });
    expect(result.changes).toEqual(["notes"]);
    const setArg = (h.updateSet.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(setArg["notes"]).toBeNull();
  });

  it("notes '' with existing NULL â†’ no change, no event", async () => {
    h.updateReturning.mockResolvedValue([{ ...h.existingTenant }]);
    const result = await applyTenantUpdate({
      tenantId: "tenant-1",
      input: { notes: "" },
      ...ACTOR,
    });
    expect(result.changes).toEqual([]);
    expect(h.insertValues).not.toHaveBeenCalled();
  });
});
