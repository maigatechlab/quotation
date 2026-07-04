import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const activeTenant = {
    id: "tenant-1",
    name: "Trans Sahel",
    slug: "trans-sahel",
    status: "active" as "active" | "trial" | "suspended" | "cancelled",
    plan: "free" as const,
  };

  const selectResult = vi.fn<() => unknown[]>(() => [activeTenant]);
  const updateReturning = vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([{ ...activeTenant, status: "suspended" }]));
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
  const buildSuspendEmailHtml = vi.fn(() => "<html/>");
  const buildSuspendEmailText = vi.fn(() => "text");

  return {
    activeTenant,
    selectResult,
    updateReturning,
    updateWhere,
    updateSet,
    insertValues,
    sendEmail,
    getTenantAdminEmail,
    buildOwnerContact,
    buildSuspendEmailHtml,
    buildSuspendEmailText,
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
  inArray: () => "inArray",
  not: () => "not",
  desc: () => "desc",
}));

vi.mock("@/lib/tenants/tenant-contact", () => ({
  getTenantAdminEmail: (...args: unknown[]) => h.getTenantAdminEmail(...(args as [])),
  buildOwnerContact: () => Promise.resolve(h.buildOwnerContact()),
}));

vi.mock("@/lib/tenants/platform-config", () => ({
  getNotificationToggle: () => Promise.resolve(true),
  getNotificationSenderAddress: () => Promise.resolve("noreply@quotation.app"),
}));

vi.mock("@/lib/tenants/suspend-email", () => ({
  buildSuspendEmailHtml: (...args: unknown[]) => h.buildSuspendEmailHtml(...(args as [])),
  buildSuspendEmailText: (...args: unknown[]) => h.buildSuspendEmailText(...(args as [])),
}));

import type { SuspendInput } from "@/lib/validation/tenant-lifecycle";
import { applySuspension, TenantNotFoundError, TenantStateConflictError } from "./suspend";

const ACTOR = { actorId: "superadmin-1", actorEmail: "owner@maigatechlab.test" };

function makeInput(overrides: Partial<SuspendInput> = {}): SuspendInput {
  return { reason: "non-paiement", totalBlock: false, ...overrides };
}

beforeEach(() => {
  h.selectResult.mockImplementation(() => [{ ...h.activeTenant, status: "active" }]);
  h.updateReturning.mockResolvedValue([{ ...h.activeTenant, status: "suspended" }]);
  h.insertValues.mockResolvedValue(undefined);
  h.sendEmail.mockResolvedValue(undefined);
  h.getTenantAdminEmail.mockResolvedValue("admin@tenant.ne");
  h.updateSet.mockClear();
  h.updateWhere.mockClear();
  h.insertValues.mockClear();
  h.sendEmail.mockClear();
});

afterEach(() => vi.clearAllMocks());

describe("applySuspension", () => {
  it("nominal: active → suspended, event inserted, email sent", async () => {
    const result = await applySuspension({ tenantId: "tenant-1", input: makeInput(), ...ACTOR });
    expect(result).toEqual({ tenantId: "tenant-1", status: "suspended", emailSent: true });
    expect(h.sendEmail).toHaveBeenCalledOnce();
    expect(h.insertValues).toHaveBeenCalledOnce();
  });

  it("passes totalBlock=false in event after", async () => {
    await applySuspension({ tenantId: "tenant-1", input: makeInput({ totalBlock: false }), ...ACTOR });
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    const after = insertArg["after"] as Record<string, unknown>;
    expect(after["totalBlock"]).toBe(false);
  });

  it("passes totalBlock=true in event after when checked", async () => {
    await applySuspension({ tenantId: "tenant-1", input: makeInput({ totalBlock: true }), ...ACTOR });
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    const after = insertArg["after"] as Record<string, unknown>;
    expect(after["totalBlock"]).toBe(true);
  });

  it("maps reason enum to French label in email", async () => {
    const cases: Array<[SuspendInput["reason"], string]> = [
      ["non-paiement", "Non-paiement"],
      ["fraude", "Fraude"],
      ["demande-client", "Demande client"],
      ["autre", "Autre"],
    ];
    for (const [reason, expected] of cases) {
      h.buildSuspendEmailHtml.mockClear();
      await applySuspension({ tenantId: "tenant-1", input: makeInput({ reason }), ...ACTOR });
      const arg = (h.buildSuspendEmailHtml.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
      expect(arg["reasonLabel"]).toBe(expected);
    }
  });

  it("tenant not found → TenantNotFoundError", async () => {
    h.selectResult.mockImplementation(() => []);
    await expect(applySuspension({ tenantId: "missing", input: makeInput(), ...ACTOR })).rejects.toThrow(TenantNotFoundError);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("already suspended → TenantStateConflictError (0 rows updated)", async () => {
    h.selectResult.mockImplementation(() => [{ ...h.activeTenant, status: "suspended" }]);
    h.updateReturning.mockResolvedValue([]);
    await expect(applySuspension({ tenantId: "tenant-1", input: makeInput(), ...ACTOR })).rejects.toThrow(TenantStateConflictError);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("cancelled → TenantStateConflictError (0 rows updated)", async () => {
    h.selectResult.mockImplementation(() => [{ ...h.activeTenant, status: "cancelled" }]);
    h.updateReturning.mockResolvedValue([]);
    await expect(applySuspension({ tenantId: "tenant-1", input: makeInput(), ...ACTOR })).rejects.toThrow(TenantStateConflictError);
  });

  it("sendEmail fails → status stays suspended, emailSent=false, event still inserted", async () => {
    h.sendEmail.mockRejectedValue(new Error("Resend down"));
    const result = await applySuspension({ tenantId: "tenant-1", input: makeInput(), ...ACTOR });
    expect(result.emailSent).toBe(false);
    expect(h.insertValues).toHaveBeenCalledOnce();
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["note"]).toContain("email suspension échoué");
  });

  it("no admin found → no email, event still inserted, emailSent=false", async () => {
    h.getTenantAdminEmail.mockResolvedValue(null);
    const result = await applySuspension({ tenantId: "tenant-1", input: makeInput(), ...ACTOR });
    expect(result.emailSent).toBe(false);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.insertValues).toHaveBeenCalledOnce();
  });

  it("event note contains actor email on success", async () => {
    await applySuspension({ tenantId: "tenant-1", input: makeInput(), actorId: "a1", actorEmail: "boss@ml.com" });
    const insertArg = (h.insertValues.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(insertArg["note"]).toContain("boss@ml.com");
    expect(insertArg["note"]).not.toContain("échoué");
  });
});
