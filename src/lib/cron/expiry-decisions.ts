import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantEvents, subscriptionPayments } from "@/lib/schema";
import type { TenantPlan, TenantStatus } from "@/lib/tenants/tenant-config";

export const REMINDER_THRESHOLDS_DAYS = [7, 3, 1] as const;

export type ReminderStage = "first" | "second" | "urgent";

/**
 * Maps a positive days-remaining count to the reminder stage whose *window* it
 * falls in — NOT an exact-day match. Using windows (≤7 → first, ≤3 → second,
 * ≤1 → urgent) means a single missed cron run still fires the correct-urgency
 * reminder while the tenant is inside that window; the per-stage idempotence
 * guard (`hasReminderBeenSent`) keeps it to one email per window.
 * Returns null when daysRemaining is outside every reminder window (> 7).
 */
export function stageForDaysRemaining(daysRemaining: number): ReminderStage | null {
  if (daysRemaining <= 0) return null;
  if (daysRemaining <= 1) return "urgent";
  if (daysRemaining <= 3) return "second";
  if (daysRemaining <= 7) return "first";
  return null;
}

export type ReminderDecision =
  | { kind: "none" }
  | { kind: "reminder"; stage: ReminderStage; daysRemaining: number }
  | { kind: "expired" }
  | { kind: "grace-expired" };

export interface TenantForDecision {
  status: TenantStatus;
  plan: TenantPlan;
  subscriptionEnd: Date | null;
  gracePeriodEndsAt: Date | null;
}

/**
 * Calendar-day difference between two dates, counted from UTC midnight to UTC
 * midnight (not `Math.floor(ms/86400000)`, which drifts on DST/rounding).
 * Positive when `to` is in the future relative to `from`.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const fromUtcMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUtcMidnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((toUtcMidnight - fromUtcMidnight) / MS_PER_DAY);
}

export function computeReminderAction(tenant: TenantForDecision, now: Date): ReminderDecision {
  // Defensive guard — cancelled tenants are filtered out upstream (AC7) but never processed here.
  if (tenant.status === "cancelled") return { kind: "none" };
  // Free tenants never expire (Epic 7 §7 — free for life).
  if (tenant.plan === "free") return { kind: "none" };
  if (!tenant.subscriptionEnd) return { kind: "none" };

  const daysRemaining = calendarDaysBetween(now, tenant.subscriptionEnd);

  if (tenant.status === "suspended") {
    if (tenant.gracePeriodEndsAt && tenant.gracePeriodEndsAt <= now) {
      return { kind: "grace-expired" };
    }
    return { kind: "none" };
  }

  if (daysRemaining <= 0) {
    return { kind: "expired" };
  }

  const stage = stageForDaysRemaining(daysRemaining);
  if (stage) {
    return { kind: "reminder", stage, daysRemaining };
  }

  return { kind: "none" };
}

/**
 * Appends subscriptionEnd to a lifecycle-event note so per-tenant idempotence
 * guards are scoped to *this* billing period. Without it, a tenant that gets
 * reactivated and later expires again would hit the same constant note as its
 * previous suspension/grace-expiry/payment-coverage-skip — the app-level
 * check-then-insert guard (and the DB unique index on (tenantId, eventType,
 * note)) would then treat the new lifecycle event as already handled and
 * silently skip it.
 */
function periodScopedNote(base: string, subscriptionEnd: Date): string {
  return `${base}@${subscriptionEnd.toISOString()}`;
}

export function reminderSentNote(stage: ReminderStage, subscriptionEnd: Date): string {
  return periodScopedNote(stage, subscriptionEnd);
}

export async function hasReminderBeenSent(
  tenantId: string,
  stage: ReminderStage,
  subscriptionEnd: Date
): Promise<boolean> {
  const existing = await db
    .select({ id: tenantEvents.id })
    .from(tenantEvents)
    .where(
      and(
        eq(tenantEvents.tenantId, tenantId),
        eq(tenantEvents.eventType, "reminder_sent"),
        eq(tenantEvents.note, reminderSentNote(stage, subscriptionEnd))
      )
    )
    .limit(1);
  return existing.length > 0;
}

export async function hasPaymentCoveringPeriod(tenant: {
  id: string;
  subscriptionEnd: Date | null;
}): Promise<boolean> {
  if (!tenant.subscriptionEnd) return false;
  // "Covering" = a payment whose interval brackets subscriptionEnd
  // (periodStart <= subscriptionEnd <= periodEnd). Both bounds matter:
  //   - gte(periodEnd, subscriptionEnd): paid at least through the expiry point.
  //   - lte(periodStart, subscriptionEnd): the payment period actually contains
  //     the expiry point — this rejects a DISJOINT future-period payment
  //     (e.g. periodStart = subscriptionEnd + 30d) that would leave a coverage
  //     gap at expiry. AC2 quotes only `periodEnd >= subscriptionEnd`; the
  //     periodStart bound is an intentional tightening (that looser form would
  //     wrongly treat a future prepayment with a gap as covering, skipping a
  //     suspension the tenant should get).
  const covering = await db
    .select({ id: subscriptionPayments.id })
    .from(subscriptionPayments)
    .where(
      and(
        eq(subscriptionPayments.tenantId, tenant.id),
        lte(subscriptionPayments.periodStart, tenant.subscriptionEnd),
        gte(subscriptionPayments.periodEnd, tenant.subscriptionEnd)
      )
    )
    .limit(1);
  return covering.length > 0;
}

const AUTO_SUSPENDED_NOTE = "auto-suspended (J0, no payment)";

export function autoSuspendedNote(subscriptionEnd: Date): string {
  return periodScopedNote(AUTO_SUSPENDED_NOTE, subscriptionEnd);
}

const GRACE_EXPIRED_NOTE = "grace expired (read-only confirmed)";

export function graceExpiredNote(subscriptionEnd: Date): string {
  return periodScopedNote(GRACE_EXPIRED_NOTE, subscriptionEnd);
}

export async function hasGraceExpiredEventBeenSent(
  tenantId: string,
  subscriptionEnd: Date
): Promise<boolean> {
  const existing = await db
    .select({ id: tenantEvents.id })
    .from(tenantEvents)
    .where(
      and(
        eq(tenantEvents.tenantId, tenantId),
        eq(tenantEvents.eventType, "suspended"),
        eq(tenantEvents.note, graceExpiredNote(subscriptionEnd))
      )
    )
    .limit(1);
  return existing.length > 0;
}

export { GRACE_EXPIRED_NOTE };

const PAYMENT_COVERS_PERIOD_NOTE = "payment covers period, skipped suspension";

export function paymentCoverageSkipNote(subscriptionEnd: Date): string {
  return periodScopedNote(PAYMENT_COVERS_PERIOD_NOTE, subscriptionEnd);
}

/**
 * Idempotence guard for the "expired but a payment already covers the period" branch.
 * Scoped to subscriptionEnd (billing period): if the tenant is reactivated and later
 * expires again, that's a new period and must be re-evaluated, not silently skipped
 * because a past period logged this same note.
 */
export async function hasPaymentCoverageSkipEventBeenSent(
  tenantId: string,
  subscriptionEnd: Date
): Promise<boolean> {
  const existing = await db
    .select({ id: tenantEvents.id })
    .from(tenantEvents)
    .where(
      and(
        eq(tenantEvents.tenantId, tenantId),
        eq(tenantEvents.eventType, "reminder_sent"),
        eq(tenantEvents.note, paymentCoverageSkipNote(subscriptionEnd))
      )
    )
    .limit(1);
  return existing.length > 0;
}

export { PAYMENT_COVERS_PERIOD_NOTE };
