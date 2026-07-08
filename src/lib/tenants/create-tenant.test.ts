import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  insertValues: vi.fn(),
  deleteWhere: vi.fn(() => Promise.resolve()),
  updateSet: vi.fn(),
  signUpEmail: vi.fn(),
  sendEmail: vi.fn(),
  tenantRow: {
    id: "tenant-1",
    name: "Trans Sahel",
    slug: "trans-sahel",
    plan: "pro" as const,
    status: "trial" as const,
    trialEndsAt: new Date("2026-07-12T00:00:00Z"),
    maxUsers: 5,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(h.selectQueue.shift() ?? []) }),
      }),
    }),
    insert: () => ({
      values: (vals: unknown) => {
        h.insertValues(vals);
        return Object.assign(Promise.resolve(undefined), {
          returning: () => Promise.resolve([h.tenantRow]),
        });
      },
    }),
    update: () => ({
      set: (s: unknown) => {
        h.updateSet(s);
        return { where: () => Promise.resolve() };
      },
    }),
    delete: () => ({ where: () => h.deleteWhere() }),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { signUpEmail: (...args: unknown[]) => h.signUpEmail(...args) } },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => h.sendEmail(...args),
}));

vi.mock("@/lib/tenants/tenant-config", () => ({
  APEX_DOMAIN: "quotation.com",
  buildTenantUrl: (slug: string) => `https://${slug}.quotation.com`,
  DEFAULT_TRIAL_DAYS: 14,
}));

vi.mock("@/lib/tenants/platform-config", () => ({
  getTrialDays: () => Promise.resolve(14),
  getPlanLimits: () =>
    Promise.resolve({
      free: { maxUsers: 1 },
      pro: { maxUsers: 5 },
      enterprise: { maxUsers: 20 },
    }),
  getNotificationToggle: () => Promise.resolve(true),
  getNotificationSenderAddress: () => Promise.resolve("noreply@quotation.app"),
}));

import type { CreateTenantInput } from "@/lib/validation/tenant";
import { createTenantWithAdmin, TenantConflictError } from "./create-tenant";

function makeInput(overrides: Partial<CreateTenantInput> = {}): CreateTenantInput {
  return {
    companyName: "Trans Sahel",
    slug: "trans-sahel",
    plan: "pro",
    cycle: "monthly",
    adminName: "Admin Test",
    adminEmail: "admin@trans-sahel.ne",
    passwordMode: "auto",
    sendWelcomeEmail: true,
    ...overrides,
  };
}

const PARAMS = { actorId: "superadmin-1", actorEmail: "owner@maigatechlab.test" };

beforeEach(() => {
  h.selectQueue = [];
  h.insertValues.mockClear();
  h.deleteWhere.mockClear();
  h.updateSet.mockClear();
  h.signUpEmail.mockReset();
  h.sendEmail.mockReset();
  h.signUpEmail.mockResolvedValue({ user: { id: "user-1" } });
  h.sendEmail.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTenantWithAdmin", () => {
  it("nominal: creates tenant + admin, links role, sends email, logs event", async () => {
    h.selectQueue = [[], []]; // slug free, email free

    const result = await createTenantWithAdmin({ input: makeInput(), ...PARAMS });

    expect(result.tenantId).toBe("tenant-1");
    expect(result.slug).toBe("trans-sahel");
    expect(result.adminUserId).toBe("user-1");
    expect(result.subdomainUrl).toBe("https://trans-sahel.quotation.com");
    expect(result.generatedPassword).toBeTypeOf("string");
    expect(result.emailSent).toBe(true);

    expect(h.signUpEmail).toHaveBeenCalledTimes(1);
    expect(h.updateSet).toHaveBeenCalledWith({ tenantId: "tenant-1", companyId: "tenant-1", role: "admin" });
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    // tenant insert + event insert
    expect(h.insertValues).toHaveBeenCalledTimes(2);
    expect(h.deleteWhere).not.toHaveBeenCalled();
  });

  it("duplicate slug → TenantConflictError('slug'), no insert", async () => {
    h.selectQueue = [[{ id: "existing" }]];

    const err = await createTenantWithAdmin({ input: makeInput(), ...PARAMS }).catch((e) => e);
    expect(err).toBeInstanceOf(TenantConflictError);
    expect((err as TenantConflictError).field).toBe("slug");
    expect(h.insertValues).not.toHaveBeenCalled();
    expect(h.signUpEmail).not.toHaveBeenCalled();
  });

  it("duplicate email → TenantConflictError('email'), no insert", async () => {
    h.selectQueue = [[], [{ id: "existing" }]];

    const err = await createTenantWithAdmin({ input: makeInput(), ...PARAMS }).catch((e) => e);
    expect(err).toBeInstanceOf(TenantConflictError);
    expect((err as TenantConflictError).field).toBe("email");
    expect(h.insertValues).not.toHaveBeenCalled();
  });

  it("signUp failure → tenant rollback (delete) and error propagated", async () => {
    h.selectQueue = [[], []];
    h.signUpEmail.mockRejectedValue(new Error("signup boom"));

    await expect(createTenantWithAdmin({ input: makeInput(), ...PARAMS })).rejects.toThrow(
      "signup boom"
    );
    // tenant inserted once, then rolled back
    expect(h.insertValues).toHaveBeenCalledTimes(1);
    expect(h.deleteWhere).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("email failure → tenant + user kept, emailSent false, event still logged", async () => {
    h.selectQueue = [[], []];
    h.sendEmail.mockRejectedValue(new Error("resend down"));

    const result = await createTenantWithAdmin({ input: makeInput(), ...PARAMS });

    expect(result.emailSent).toBe(false);
    expect(h.deleteWhere).not.toHaveBeenCalled();
    // tenant insert + event insert
    expect(h.insertValues).toHaveBeenCalledTimes(2);
  });

  it("sendWelcomeEmail=false → no email, generatedPassword returned", async () => {
    h.selectQueue = [[], []];

    const result = await createTenantWithAdmin({
      input: makeInput({ sendWelcomeEmail: false }),
      ...PARAMS,
    });

    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
    expect(result.generatedPassword).toBeTypeOf("string");
  });

  it("manual password mode → no generatedPassword in result", async () => {
    h.selectQueue = [[], []];

    const result = await createTenantWithAdmin({
      input: makeInput({ passwordMode: "manual", manualPassword: "manualPass1234" }),
      ...PARAMS,
    });

    expect(result.generatedPassword).toBeUndefined();
  });
});
