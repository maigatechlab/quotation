import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getPlatformSettings: vi.fn<() => Promise<{ suspendedContactEmail: string; suspendedContactWhatsapp: string }>>(),
  adminRows: vi.fn<() => { email: string }[]>(() => []),
  whereArg: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (arg: unknown) => {
          h.whereArg(arg);
          return {
            orderBy: () => ({
              limit: () => Promise.resolve(h.adminRows()),
            }),
          };
        },
      }),
    }),
  },
}));

vi.mock("@/lib/schema", () => ({
  user: {
    tenantId: "tenantId",
    role: "role",
    disabledAt: "disabledAt",
    email: "email",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...args: unknown[]) => ({ op: "eq", args }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  asc: (...args: unknown[]) => ({ op: "asc", args }),
  isNull: (...args: unknown[]) => ({ op: "isNull", args }),
}));

vi.mock("@/lib/data/platform-settings", () => ({
  getPlatformSettings: h.getPlatformSettings,
}));

import { buildOwnerContact, getTenantAdminEmail } from "./tenant-contact";

describe("getTenantAdminEmail", () => {
  beforeEach(() => {
    h.adminRows.mockReset().mockReturnValue([]);
    h.whereArg.mockClear();
  });

  it("returns the earliest active admin email and filters disabled users", async () => {
    h.adminRows.mockReturnValue([{ email: "admin@example.com" }]);
    await expect(getTenantAdminEmail("tenant-1")).resolves.toBe("admin@example.com");
    expect(h.whereArg).toHaveBeenCalledWith({
      op: "and",
      args: [
        { op: "eq", args: ["tenantId", "tenant-1"] },
        { op: "eq", args: ["role", "admin"] },
        { op: "isNull", args: ["disabledAt"] },
      ],
    });
  });
});

describe("buildOwnerContact", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("uses platform_settings contact fields when set", async () => {
    h.getPlatformSettings.mockResolvedValue({
      suspendedContactEmail: "owner@example.com",
      suspendedContactWhatsapp: "+22796000001",
    });
    const c = await buildOwnerContact();
    expect(c.whatsapp).toBe("+22796000001");
    expect(c.email).toBe("owner@example.com");
    expect(c.displayWhatsapp).toBe("+22796000001");
    expect(c.displayEmail).toBe("owner@example.com");
  });

  it("falls back to env vars when platform_settings fields are empty", async () => {
    h.getPlatformSettings.mockResolvedValue({
      suspendedContactEmail: "",
      suspendedContactWhatsapp: "",
    });
    delete process.env.OWNER_WHATSAPP;
    process.env.OWNER_EMAIL = "owner@example.com";
    const c = await buildOwnerContact();
    expect(c.email).toBe("owner@example.com");
  });

  it("falls back to EMAIL_FROM when platform_settings and OWNER_EMAIL are empty", async () => {
    h.getPlatformSettings.mockResolvedValue({
      suspendedContactEmail: "",
      suspendedContactWhatsapp: "",
    });
    delete process.env.OWNER_WHATSAPP;
    delete process.env.OWNER_EMAIL;
    process.env.EMAIL_FROM = "noreply@quotation.app";
    const c = await buildOwnerContact();
    expect(c.email).toBe("noreply@quotation.app");
  });

  it("uses placeholder displayWhatsapp when nothing is set", async () => {
    h.getPlatformSettings.mockResolvedValue({
      suspendedContactEmail: "",
      suspendedContactWhatsapp: "",
    });
    delete process.env.OWNER_WHATSAPP;
    delete process.env.OWNER_EMAIL;
    delete process.env.EMAIL_FROM;
    const c = await buildOwnerContact();
    expect(c.whatsapp).toBeNull();
    expect(c.displayWhatsapp).toBe("Contactez votre interlocuteur Maiga Tech Lab");
    expect(c.displayEmail).toBe("contact@maigatechlab.com");
  });

  it("returns null for whatsapp and email when nothing is set anywhere", async () => {
    h.getPlatformSettings.mockResolvedValue({
      suspendedContactEmail: "",
      suspendedContactWhatsapp: "",
    });
    delete process.env.OWNER_WHATSAPP;
    delete process.env.OWNER_EMAIL;
    delete process.env.EMAIL_FROM;
    const c = await buildOwnerContact();
    expect(c.whatsapp).toBeNull();
    expect(c.email).toBeNull();
  });
});