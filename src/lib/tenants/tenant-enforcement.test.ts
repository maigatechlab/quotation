import { describe, it, expect } from "vitest";
import { enforceTenantAccess } from "./tenant-enforcement";

const NOW = new Date("2026-06-28T12:00:00Z");
const PAST = new Date("2026-06-01T00:00:00Z");
const FUTURE = new Date("2026-12-31T00:00:00Z");

function makeTenant(
  status: "active" | "trial" | "suspended" | "cancelled",
  subscriptionEnd: Date | null = null,
  gracePeriodEndsAt: Date | null = null
) {
  return { status, subscriptionEnd, gracePeriodEndsAt };
}

describe("enforceTenantAccess", () => {
  it("cancelled → redirect", () => {
    const decision = enforceTenantAccess(makeTenant("cancelled"), NOW);
    expect(decision.action).toBe("redirect");
    if (decision.action === "redirect") expect(decision.redirectPath).toBe("/subscription-expired");
  });

  it("suspended, no grace set → redirect", () => {
    const decision = enforceTenantAccess(makeTenant("suspended"), NOW);
    expect(decision.action).toBe("redirect");
    if (decision.action === "redirect") expect(decision.redirectPath).toBe("/subscription-expired");
  });

  it("suspended + grace active → allow-with-grace", () => {
    const decision = enforceTenantAccess(makeTenant("suspended", PAST, FUTURE), NOW);
    expect(decision.action).toBe("allow-with-grace");
    if (decision.action === "allow-with-grace") {
      expect(decision.graceEndsAt.toISOString()).toBe(FUTURE.toISOString());
    }
  });

  it("suspended + grace expired → redirect", () => {
    const expiredGrace = new Date("2026-06-10T00:00:00Z");
    const decision = enforceTenantAccess(makeTenant("suspended", PAST, expiredGrace), NOW);
    expect(decision.action).toBe("redirect");
    if (decision.action === "redirect") expect(decision.redirectPath).toBe("/subscription-expired");
  });

  it("active without subscriptionEnd → allow", () => {
    const decision = enforceTenantAccess(makeTenant("active", null, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("trial without subscriptionEnd → allow", () => {
    const decision = enforceTenantAccess(makeTenant("trial", null, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("active + subscriptionEnd in future → allow", () => {
    const decision = enforceTenantAccess(makeTenant("active", FUTURE, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("active + subscriptionEnd in past + grace active → allow-with-grace", () => {
    const decision = enforceTenantAccess(makeTenant("active", PAST, FUTURE), NOW);
    expect(decision.action).toBe("allow-with-grace");
    if (decision.action === "allow-with-grace") {
      expect(decision.graceEndsAt.toISOString()).toBe(FUTURE.toISOString());
    }
  });

  it("active + subscriptionEnd in past + grace expired → allow (cron deferred)", () => {
    // Post-grace suspension is handled by cron (story 7-6); proxy stays permissive
    const expiredGrace = new Date("2026-06-10T00:00:00Z");
    const decision = enforceTenantAccess(makeTenant("active", PAST, expiredGrace), NOW);
    expect(decision.action).toBe("allow");
  });

  it("active + subscriptionEnd in past + no grace → allow (cron deferred)", () => {
    const decision = enforceTenantAccess(makeTenant("active", PAST, null), NOW);
    expect(decision.action).toBe("allow");
  });

  it("trial + subscriptionEnd in past + grace active → allow-with-grace", () => {
    const decision = enforceTenantAccess(makeTenant("trial", PAST, FUTURE), NOW);
    expect(decision.action).toBe("allow-with-grace");
  });
});
