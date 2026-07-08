import { describe, it, expect, vi, beforeEach } from "vitest";
import { enforceTenantAccess } from "./tenant-enforcement";

const h = vi.hoisted(() => ({
  isTotalBlock: vi.fn<() => Promise<boolean>>(() => Promise.resolve(false)),
}));

vi.mock("./tenant-access", () => ({
  isTotalBlock: (...args: unknown[]) => h.isTotalBlock(...(args as [])),
}));

const NOW = new Date("2026-06-28T12:00:00Z");
const PAST = new Date("2026-06-01T00:00:00Z");
const FUTURE = new Date("2026-12-31T00:00:00Z");

function makeTenant(
  status: "active" | "trial" | "suspended" | "cancelled",
  subscriptionEnd: Date | null = null,
  gracePeriodEndsAt: Date | null = null
) {
  return { id: "tenant-1", status, subscriptionEnd, gracePeriodEndsAt };
}

beforeEach(() => {
  h.isTotalBlock.mockResolvedValue(false);
});

describe("enforceTenantAccess", () => {
  it("cancelled -> redirect", async () => {
    const decision = await enforceTenantAccess(makeTenant("cancelled"), NOW);
    expect(decision.action).toBe("redirect");
    if (decision.action === "redirect") expect(decision.redirectPath).toBe("/subscription-expired");
  });

  it("suspended, totalBlock -> redirect", async () => {
    h.isTotalBlock.mockResolvedValueOnce(true);
    const decision = await enforceTenantAccess(makeTenant("suspended"), NOW);
    expect(decision.action).toBe("redirect");
    if (decision.action === "redirect") expect(decision.redirectPath).toBe("/subscription-expired");
  });

  it("suspended, no grace, read-only -> allow", async () => {
    const decision = await enforceTenantAccess(makeTenant("suspended"), NOW);
    expect(decision.action).toBe("allow");
  });

  it("suspended + grace active, read-only -> allow-with-grace", async () => {
    const decision = await enforceTenantAccess(makeTenant("suspended", PAST, FUTURE), NOW);
    expect(decision.action).toBe("allow-with-grace");
    if (decision.action === "allow-with-grace") {
      expect(decision.graceEndsAt.toISOString()).toBe(FUTURE.toISOString());
    }
  });

  it("suspended + grace expired, read-only -> allow", async () => {
    const expiredGrace = new Date("2026-06-10T00:00:00Z");
    const decision = await enforceTenantAccess(makeTenant("suspended", PAST, expiredGrace), NOW);
    expect(decision.action).toBe("allow");
  });

  it("active without subscriptionEnd -> allow", async () => {
    const decision = await enforceTenantAccess(makeTenant("active", null, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("trial without subscriptionEnd -> allow", async () => {
    const decision = await enforceTenantAccess(makeTenant("trial", null, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("active + subscriptionEnd in future -> allow", async () => {
    const decision = await enforceTenantAccess(makeTenant("active", FUTURE, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("active + subscriptionEnd in past + grace active -> allow-with-grace", async () => {
    const decision = await enforceTenantAccess(makeTenant("active", PAST, FUTURE), NOW);
    expect(decision.action).toBe("allow-with-grace");
    if (decision.action === "allow-with-grace") {
      expect(decision.graceEndsAt.toISOString()).toBe(FUTURE.toISOString());
    }
  });

  it("active + subscriptionEnd in past + grace expired -> allow (cron deferred)", async () => {
    const expiredGrace = new Date("2026-06-10T00:00:00Z");
    const decision = await enforceTenantAccess(makeTenant("active", PAST, expiredGrace), NOW);
    expect(decision.action).toBe("allow");
  });

  it("active + subscriptionEnd in past + no grace -> allow (cron deferred)", async () => {
    const decision = await enforceTenantAccess(makeTenant("active", PAST, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("trial + subscriptionEnd in past + grace active -> allow-with-grace", async () => {
    const decision = await enforceTenantAccess(makeTenant("trial", PAST, FUTURE), NOW);
    expect(decision.action).toBe("allow-with-grace");
  });
});
