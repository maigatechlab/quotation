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

  if (tenant.subscriptionEnd !== null) {
    const subEnd = new Date(tenant.subscriptionEnd);
    const grace = tenant.gracePeriodEndsAt !== null ? new Date(tenant.gracePeriodEndsAt) : null;
    if (subEnd < now && grace !== null && grace > now) {
      return { action: "allow-with-grace", graceEndsAt: grace };
    }
    // Automatic suspension post-grace is DEFERRED to cron story 7-6
  }

  return { action: "allow" };
}
