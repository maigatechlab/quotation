import { isTotalBlock } from "./tenant-access";
import type { TenantStatus } from "./tenant-config";

export type EnforcementDecision =
  | { action: "allow" }
  | { action: "allow-with-grace"; graceEndsAt: Date }
  | { action: "redirect"; redirectPath: "/subscription-expired" };

export async function enforceTenantAccess(
  tenant: {
    id: string;
    status: TenantStatus;
    subscriptionEnd: Date | null;
    gracePeriodEndsAt: Date | null;
  },
  now: Date = new Date()
): Promise<EnforcementDecision> {
  if (tenant.status === "cancelled") {
    return { action: "redirect", redirectPath: "/subscription-expired" };
  }

  const grace = tenant.gracePeriodEndsAt !== null ? new Date(tenant.gracePeriodEndsAt) : null;

  if (tenant.status === "suspended") {
    if (await isTotalBlock(tenant)) {
      return { action: "redirect", redirectPath: "/subscription-expired" };
    }
    if (grace !== null && grace > now) {
      return { action: "allow-with-grace", graceEndsAt: grace };
    }
    return { action: "allow" };
  }

  if (tenant.subscriptionEnd !== null) {
    const subEnd = new Date(tenant.subscriptionEnd);
    if (subEnd < now && grace !== null && grace > now) {
      return { action: "allow-with-grace", graceEndsAt: grace };
    }
    // status is still active/trial here; cron hasn't suspended yet. Automatic
    // suspension post-grace is deferred to the cron job (story 7-6).
  }

  return { action: "allow" };
}


