import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const tenantRow = {
    id: "tenant-1",
    name: "Trans Sahel",
    slug: "trans-sahel",
    status: "active" as "active" | "trial" | "suspended" | "cancelled",
    plan: "free" as const,
  };

  const selectResult = vi.fn<() => unknown[]>(() => [tenantRow]);
  const updateReturning = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([{ ...tenantRow, status: "cancelled" }]));
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const insertValues = vi.fn(() => Promise.resolve());
  const sendEmail = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const getTenantAdminEmail = vi.fn<() => Promise<string | null>>(() => Promise.resolve("admin@tenant.ne"));
  const buildOwnerContact = vi.fn(() => ({
    whatsapp: "+227001",
    email: "owner@ml.com",
    displayWhatsapp: "+227001",
    displayEmail: "owner@ml.com",
  }));

  return {
    tenantRow,
    selectResult,
    updateReturning,
    updateWhere,
    updateSet,
    insertValues,
    sendEmail,
    getTenantAdminEmail,
    buildOwnerContact,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.selectResult()),
        }),
      }),
    }),
    update: () => ({ set: h.updateSet }),
    insert: () => ({ values: h.insertValues }),
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => h.sendEmail(...(args as [])),
}));

vi.mock("@/lib/schema", () => ({
  tenants: {},
  tenantEvents: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => "eq",
  and: () => "and",
  not: () => "not",
  inArray: () => "inArray",
  desc: () => "desc",
}));

vi.mock("@/lib/tenants/tenant-contact", () => ({
  getTenantAdminEmail: (...args: unknown[]) => h.getTenantAdminEmail(...(args as [])),
  buildOwnerContact: () => Promise.resolve(h.buildOwnerContact()),
}));

vi.mock("@/lib/tenants/cancel-email", () => ({
  buildCancelEmailHtml: () => "<html/>",
  buildCancelEmailText: () => "text",
}));

import { applyCancellation, CancelConfirmationError } from "./cancel";
import { TenantNotFoundError, TenantStateConflictError } from "./suspend";

const ACTOR = { actorId: "superadmin-1", actorEmail: "owner@maigatechlab.test" };

beforeEach(() => {
  h.selectResult.mockImplementation(() => [{ ...h.tenantRow, status: "active" }]);
  h.updateReturning.mockResolvedValue([{ ...h.tenantRow, status: "cancelled" }]);
  h.insertValues.mockResolvedValue(undefined);
  h.sendEmail.mockResolvedValue(undefined);
  h.getTenantAdminEmail.mockResolvedValue("admin@tenant.ne");
  h.updateSet.mockClear();
  h.insertValues.mockClear();
  h.sendEmail.mockClear();
});

afterEach(() => vi.clearAllMocks());

describe("applyCancellation", () => {
  it("nominal: → cancelled, event inserted, email sent", async () => {
    const result = await applyCancellation({
      tenantId: "tenant-1",
      input: { confirmSlug: "trans-sahel" },
      ...ACTOR,
    });
    expect(result).toEqual({ tenantId: "tenant-1", status: "cancelled", emailSent: true });
    expect(h.sendEmail).toHaveBeenCalledOnce();
    expect(h.insertValues).toHaveBeenCalledOnce();
  });

  it("slug mismatch → CancelConfirmationError, no update", async () => {
    await expect(
      applyCancellation({ tenantId: "tenant-1", input: { confirmSlug: "wrong-slug" }, ...ACTOR })
    ).rejects.toThrow(CancelConfirmationError);
    expect(h.updateSet).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("tenant not found → TenantNotFoundError", async () => {
    h.selectResult.mockImplementation(() => []);
    await expect(
      applyCancellation({ tenantId: "missing", input: { confirmSlug: "trans-sahel" }, ...ACTOR })
    ).rejects.toThrow(TenantNotFoundError);
  });

  it("already cancelled → TenantStateConflictError", async () => {
    h.selectResult.mockImplementation(() => [{ ...h.tenantRow, status: "cancelled" }]);
    h.updateReturning.mockResolvedValue([]);
    await expect(
      applyCancellation({ tenantId: "tenant-1", input: { confirmSlug: "trans-sahel" }, ...ACTOR })
    ).rejects.toThrow(TenantStateConflictError);
  });

  it("sendEmail fails → status remains cancelled, emailSent=false", async () => {
    h.sendEmail.mockRejectedValue(new Error("Resend down"));
    const result = await applyCancellation({
      tenantId: "tenant-1",
      input: { confirmSlug: "trans-sahel" },
      ...ACTOR,
    });
    expect(result.emailSent).toBe(false);
    expect(h.insertValues).toHaveBeenCalledOnce();
  });

  it("event type is 'cancelled'", async () => {
    await applyCancellation({ tenantId: "tenant-1", input: { confirmSlug: "trans-sahel" }, ...ACTOR });
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["eventType"]).toBe("cancelled");
  });
});
