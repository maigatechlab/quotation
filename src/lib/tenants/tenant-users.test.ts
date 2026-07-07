import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  deleteTable: vi.fn(),
  deleteWhere: vi.fn(),
  signUpEmail: vi.fn(),
  sendEmail: vi.fn(),
}));

function makeSelectChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "for"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain["then"] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function makeMockDb() {
  const mockDb = {
    select: vi.fn(() => makeSelectChain(h.selectQueue.shift() ?? [])),
    insert: vi.fn((table: unknown) => ({
      values: (vals: unknown) => {
        h.insertValues({ table, vals });
        return Promise.resolve(undefined);
      },
    })),
    update: vi.fn(() => ({
      set: (s: unknown) => {
        h.updateSet(s);
        return {
          where: (...args: unknown[]) => {
            h.updateWhere(...args);
            return Promise.resolve();
          },
        };
      },
    })),
    delete: vi.fn((table: unknown) => ({
      where: (...args: unknown[]) => {
        h.deleteTable(table);
        h.deleteWhere(...args);
        return Promise.resolve();
      },
    })),
    transaction: vi.fn(),
  };
  // The transaction callback receives the same mock (select/update/delete
  // behave identically via `tx` as via `db` — same shared spies/queue), so
  // existing assertions keep working whether code runs through `db` or `tx`.
  mockDb.transaction.mockImplementation((cb: (tx: typeof mockDb) => Promise<unknown>) => cb(mockDb));
  return mockDb;
}

vi.mock("@/lib/db", () => ({
  db: makeMockDb(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { signUpEmail: (...args: unknown[]) => h.signUpEmail(...args) } },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => h.sendEmail(...args),
}));

vi.mock("@/lib/schema", () => ({
  user: { id: "user.id", email: "user.email", role: "user.role", tenantId: "user.tenantId", disabledAt: "user.disabledAt", createdAt: "user.createdAt" },
  session: { userId: "session.userId", updatedAt: "session.updatedAt" },
  tenants: { id: "tenants.id", plan: "tenants.plan", maxUsers: "tenants.maxUsers" },
  tenantEvents: { id: "te.id" },
}));

import type { CreateTenantUserInput } from "@/lib/validation/tenant-user";
import { TenantConflictError } from "./create-tenant";
import {
  checkUserQuota,
  countActiveTenantUsers,
  createUserInTenant,
  deleteUserInTenant,
  getTenantUsersWithLastSeen,
  LastAdminError,
  reactivateUserInTenant,
  revokeUserInTenant,
  TenantQuotaError,
  TenantUserNotFoundError,
} from "./tenant-users";

function makeCreateInput(overrides: Partial<CreateTenantUserInput> = {}): CreateTenantUserInput {
  return {
    name: "New User",
    email: "new-user@trans-sahel.ne",
    passwordMode: "auto",
    role: "commercial",
    sendWelcomeEmail: true,
    ...overrides,
  };
}

const CREATE_PARAMS = {
  tenantId: "tenant-1",
  tenantSlug: "trans-sahel",
  tenantName: "Trans Sahel",
  actorId: "superadmin-1",
  actorEmail: "owner@maigatechlab.test",
};

const TENANT_ROW = { maxUsers: 5, plan: "pro" as const };

beforeEach(() => {
  h.selectQueue = [];
  h.insertValues.mockClear();
  h.updateSet.mockClear();
  h.updateWhere.mockClear();
  h.deleteTable.mockClear();
  h.deleteWhere.mockClear();
  h.signUpEmail.mockReset();
  h.sendEmail.mockReset();
  h.signUpEmail.mockResolvedValue({ user: { id: "new-user-id" } });
  h.sendEmail.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("countActiveTenantUsers", () => {
  it("returns the count row", async () => {
    h.selectQueue = [[{ n: 3 }]];
    const result = await countActiveTenantUsers("tenant-1");
    expect(result).toBe(3);
  });

  it("returns 0 when no row (empty tenant)", async () => {
    h.selectQueue = [[]];
    const result = await countActiveTenantUsers("tenant-1");
    expect(result).toBe(0);
  });
});

describe("checkUserQuota", () => {
  it("active < max → allowed", async () => {
    h.selectQueue = [[{ n: 2 }]];
    const result = await checkUserQuota("tenant-1", 5);
    expect(result).toMatchObject({ allowed: true, active: 2, maxUsers: 5 });
  });

  it("active === max → not allowed", async () => {
    h.selectQueue = [[{ n: 5 }]];
    const result = await checkUserQuota("tenant-1", 5);
    expect(result.allowed).toBe(false);
  });

  it("active > max → not allowed (post-downgrade edge case)", async () => {
    h.selectQueue = [[{ n: 6 }]];
    const result = await checkUserQuota("tenant-1", 5);
    expect(result.allowed).toBe(false);
  });
});

describe("getTenantUsersWithLastSeen", () => {
  it("returns users with lastSeen resolved from sessions", async () => {
    h.selectQueue = [
      [
        { id: "u1", name: "Admin", email: "a@x.test", role: "admin", disabledAt: null, createdAt: new Date("2026-01-01") },
        { id: "u2", name: "Comm", email: "c@x.test", role: "commercial", disabledAt: null, createdAt: new Date("2026-01-02") },
      ],
      [{ userId: "u2", lastSeen: new Date("2026-06-01") }],
    ];
    const result = await getTenantUsersWithLastSeen("tenant-1");
    expect(result[0]?.id).toBe("u1");
    expect(result[0]?.lastSeen).toBeNull();
    expect(result[1]?.lastSeen).toEqual(new Date("2026-06-01"));
  });

  it("admins are ordered first regardless of createdAt", async () => {
    h.selectQueue = [
      [
        { id: "u1", name: "Commercial First", email: "c@x.test", role: "commercial", disabledAt: null, createdAt: new Date("2026-01-01") },
        { id: "u2", name: "Admin Second", email: "a@x.test", role: "admin", disabledAt: null, createdAt: new Date("2026-01-02") },
      ],
      [],
    ];
    const result = await getTenantUsersWithLastSeen("tenant-1");
    expect(result[0]?.id).toBe("u2");
    expect(result[1]?.id).toBe("u1");
  });

  it("empty tenant → empty array, no session query", async () => {
    h.selectQueue = [[]];
    const result = await getTenantUsersWithLastSeen("tenant-1");
    expect(result).toEqual([]);
  });
});

describe("createUserInTenant", () => {
  it("nominal: quota OK, email unique → signUp + link + email + event; generatedPassword present", async () => {
    h.selectQueue = [[TENANT_ROW], [{ n: 2 }], []];

    const result = await createUserInTenant({ ...CREATE_PARAMS, input: makeCreateInput() });

    expect(result.userId).toBe("new-user-id");
    expect(result.generatedPassword).toBeTypeOf("string");
    expect(result.emailSent).toBe(true);
    expect(h.signUpEmail).toHaveBeenCalledTimes(1);
    expect(h.updateSet).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      companyId: "tenant-1",
      role: "commercial",
    });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.insertValues).toHaveBeenCalledTimes(1);
    expect(h.deleteTable).not.toHaveBeenCalled();
  });

  it("quota full (fresh count under the tenant row lock) → TenantQuotaError, no signUp, no event", async () => {
    h.selectQueue = [[{ maxUsers: 5, plan: "pro" }], [{ n: 5 }]];

    const err = await createUserInTenant({ ...CREATE_PARAMS, input: makeCreateInput() }).catch(
      (e) => e
    );

    expect(err).toBeInstanceOf(TenantQuotaError);
    expect(h.signUpEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("duplicate email → TenantConflictError('email'), no signUp", async () => {
    h.selectQueue = [[TENANT_ROW], [{ n: 2 }], [{ id: "existing" }]];

    const err = await createUserInTenant({ ...CREATE_PARAMS, input: makeCreateInput() }).catch(
      (e) => e
    );

    expect(err).toBeInstanceOf(TenantConflictError);
    expect(h.signUpEmail).not.toHaveBeenCalled();
  });

  it("signUp succeeds but UPDATE fails → rollback deletes the user, error propagated", async () => {
    h.selectQueue = [[TENANT_ROW], [{ n: 2 }], []];
    h.updateSet.mockImplementationOnce(() => {
      throw new Error("update boom");
    });

    await expect(
      createUserInTenant({ ...CREATE_PARAMS, input: makeCreateInput() })
    ).rejects.toThrow("update boom");

    expect(h.deleteTable).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("sendEmail fails → user kept, emailSent=false, event logged with failure note", async () => {
    h.selectQueue = [[TENANT_ROW], [{ n: 2 }], []];
    h.sendEmail.mockRejectedValue(new Error("resend down"));

    const result = await createUserInTenant({ ...CREATE_PARAMS, input: makeCreateInput() });

    expect(result.emailSent).toBe(false);
    expect(h.deleteTable).not.toHaveBeenCalled();
    expect(h.insertValues).toHaveBeenCalledTimes(1);
    const call = h.insertValues.mock.calls[0]?.[0] as { vals: { note: string } };
    expect(call.vals.note).toContain("échoué");
  });

  it("sendWelcomeEmail=false → no email sent, generatedPassword still returned", async () => {
    h.selectQueue = [[TENANT_ROW], [{ n: 2 }], []];

    const result = await createUserInTenant({
      ...CREATE_PARAMS,
      input: makeCreateInput({ sendWelcomeEmail: false }),
    });

    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
    expect(result.generatedPassword).toBeTypeOf("string");
  });

  it("manual password mode → no generatedPassword in result", async () => {
    h.selectQueue = [[TENANT_ROW], [{ n: 2 }], []];

    const result = await createUserInTenant({
      ...CREATE_PARAMS,
      input: makeCreateInput({ passwordMode: "manual", manualPassword: "manualPass1234" }),
    });

    expect(result.generatedPassword).toBeUndefined();
  });
});

describe("revokeUserInTenant", () => {
  const PARAMS = { tenantId: "tenant-1", userId: "u1", actorId: "superadmin-1", actorEmail: "owner@x.test" };

  it("success: soft-disables, deletes sessions, logs event", async () => {
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "u1@x.test", role: "commercial", disabledAt: null }],
    ];

    const result = await revokeUserInTenant(PARAMS);

    expect(result.userId).toBe("u1");
    expect(result.disabledAt).toBeInstanceOf(Date);
    expect(h.updateSet).toHaveBeenCalledTimes(1);
    expect(h.deleteWhere).toHaveBeenCalledTimes(1);
    expect(h.insertValues).toHaveBeenCalledTimes(1);
  });

  it("tenant not found → TenantUserNotFoundError, no mutation", async () => {
    h.selectQueue = [[]];

    const err = await revokeUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(TenantUserNotFoundError);
    expect(h.updateSet).not.toHaveBeenCalled();
  });

  it("user not found cross-tenant → TenantUserNotFoundError, no mutation", async () => {
    h.selectQueue = [[{ id: "tenant-1" }], []];

    const err = await revokeUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(TenantUserNotFoundError);
    expect(h.updateSet).not.toHaveBeenCalled();
  });

  it("last active admin → LastAdminError, no mutation", async () => {
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "admin@x.test", role: "admin", disabledAt: null }],
      [{ n: 1 }],
    ];

    const err = await revokeUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(LastAdminError);
    expect(h.updateSet).not.toHaveBeenCalled();
  });

  it("admin revoke allowed when another active admin remains", async () => {
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "admin@x.test", role: "admin", disabledAt: null }],
      [{ n: 2 }],
    ];

    const result = await revokeUserInTenant(PARAMS);
    expect(result.userId).toBe("u1");
    expect(h.updateSet).toHaveBeenCalledTimes(1);
  });

  it("already disabled → idempotent, no new mutation/event", async () => {
    const existingDate = new Date("2026-01-01");
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "u1@x.test", role: "commercial", disabledAt: existingDate }],
    ];

    const result = await revokeUserInTenant(PARAMS);

    expect(result.disabledAt).toBe(existingDate);
    expect(h.updateSet).not.toHaveBeenCalled();
    expect(h.deleteWhere).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });
});

describe("deleteUserInTenant", () => {
  const PARAMS = { tenantId: "tenant-1", userId: "u1", actorId: "superadmin-1", actorEmail: "owner@x.test" };

  it("success: hard-deletes user, logs user_deleted event", async () => {
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "u1@x.test", role: "commercial", disabledAt: null }],
    ];

    const result = await deleteUserInTenant(PARAMS);

    expect(result).toEqual({ userId: "u1", email: "u1@x.test" });
    expect(h.deleteWhere).toHaveBeenCalledTimes(1);
    expect(h.insertValues).toHaveBeenCalledTimes(1);
    const event = h.insertValues.mock.calls[0]?.[0] as { vals: { eventType: string; after: unknown } };
    expect(event.vals.eventType).toBe("user_deleted");
    expect(event.vals.after).toBeNull();
  });

  it("tenant not found → TenantUserNotFoundError, no mutation", async () => {
    h.selectQueue = [[]];

    const err = await deleteUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(TenantUserNotFoundError);
    expect(h.deleteWhere).not.toHaveBeenCalled();
  });

  it("user not found cross-tenant → TenantUserNotFoundError, no mutation", async () => {
    h.selectQueue = [[{ id: "tenant-1" }], []];

    const err = await deleteUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(TenantUserNotFoundError);
    expect(h.deleteWhere).not.toHaveBeenCalled();
  });

  it("last active admin → LastAdminError, no mutation", async () => {
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "admin@x.test", role: "admin", disabledAt: null }],
      [{ n: 1 }],
    ];

    const err = await deleteUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(LastAdminError);
    expect(h.deleteWhere).not.toHaveBeenCalled();
  });

  it("active admin delete allowed when another active admin remains", async () => {
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "admin@x.test", role: "admin", disabledAt: null }],
      [{ n: 2 }],
    ];

    const result = await deleteUserInTenant(PARAMS);
    expect(result.userId).toBe("u1");
    expect(h.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it("revoked admin delete skips last-admin count", async () => {
    h.selectQueue = [
      [{ id: "tenant-1" }],
      [{ id: "u1", email: "admin@x.test", role: "admin", disabledAt: new Date("2026-01-01") }],
    ];

    const result = await deleteUserInTenant(PARAMS);
    expect(result.userId).toBe("u1");
    expect(h.deleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe("reactivateUserInTenant", () => {
  const PARAMS = {
    tenantId: "tenant-1",
    userId: "u1",
    actorId: "superadmin-1",
    actorEmail: "owner@x.test",
  };

  it("success: clears disabledAt, logs event", async () => {
    h.selectQueue = [
      [TENANT_ROW],
      [{ id: "u1", email: "u1@x.test", role: "commercial", disabledAt: new Date("2026-01-01") }],
      [{ n: 2 }],
    ];

    const result = await reactivateUserInTenant(PARAMS);

    expect(result.disabledAt).toBeNull();
    expect(h.updateSet).toHaveBeenCalledWith({ disabledAt: null });
    expect(h.insertValues).toHaveBeenCalledTimes(1);
  });

  it("already active → idempotent, no mutation", async () => {
    h.selectQueue = [
      [TENANT_ROW],
      [{ id: "u1", email: "u1@x.test", role: "commercial", disabledAt: null }],
    ];

    const result = await reactivateUserInTenant(PARAMS);

    expect(result.disabledAt).toBeNull();
    expect(h.updateSet).not.toHaveBeenCalled();
  });

  it("quota full (fresh count under lock) → TenantQuotaError, no mutation", async () => {
    h.selectQueue = [
      [{ maxUsers: 5, plan: "pro" }],
      [{ id: "u1", email: "u1@x.test", role: "commercial", disabledAt: new Date("2026-01-01") }],
      [{ n: 5 }],
    ];

    const err = await reactivateUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(TenantQuotaError);
    expect(h.updateSet).not.toHaveBeenCalled();
  });

  it("tenant not found → TenantUserNotFoundError", async () => {
    h.selectQueue = [[]];

    const err = await reactivateUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(TenantUserNotFoundError);
  });

  it("user not found cross-tenant → TenantUserNotFoundError", async () => {
    h.selectQueue = [[TENANT_ROW], []];

    const err = await reactivateUserInTenant(PARAMS).catch((e) => e);

    expect(err).toBeInstanceOf(TenantUserNotFoundError);
  });
});
