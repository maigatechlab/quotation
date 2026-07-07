import type { TenantStatus } from "./tenant-config";

export type EnforcementDecision =
  | { action: "allow" }
  | { action: "allow-with-grace"; graceEndsAt: Date }
  | { action: "redirect"; redirectPath: "/subscription-expired" };

export function enforceTenantAccess(
  tenant: {
    status: TenantStatus;
    subscriptionEnd: Date | null;
    gracePeriodEndsAt: Date | null;
  },
  now: Date = new Date()
): EnforcementDecision {
  if (tenant.status === "cancelled") {
    return { action: "redirect", redirectPath: "/subscription-expired" };
  }

  const grace = tenant.gracePeriodEndsAt !== null ? new Date(tenant.gracePeriodEndsAt) : null;

  // Cron (story 7-6) sets status=suspended once subscriptionEnd passes. Grace window
  // still lets the tenant in; past the grace window (or with no grace at all — e.g. a
  // fraud/manual total-block suspension) the tenant must be redirected out of the app.
  if (tenant.status === "suspended") {
    if (grace !== null && grace > now) {
      return { action: "allow-with-grace", graceEndsAt: grace };
    }
    return { action: "redirect", redirectPath: "/subscription-expired" };
  }

  if (tenant.subscriptionEnd !== null) {
    const subEnd = new Date(tenant.subscriptionEnd);
    if (subEnd < now && grace !== null && grace > now) {
      return { action: "allow-with-grace", graceEndsAt: grace };
    }
    // status is still active/trial here — cron hasn't suspended yet. Automatic
    // suspension post-grace is DEFERRED to the cron job (story 7-6).
  }

  return { action: "allow" };
}
