import { DEFAULT_TRIAL_DAYS } from "./tenant-config";

/**
 * Subscription / trial date computation for a freshly provisioned tenant.
 * Pure — `now` is injectable for deterministic tests.
 *
 * Date arithmetic uses calendar-day addition (setDate) rather than fixed ms,
 * so DST transitions never shift the day boundary. Monthly ≈ 30 days,
 * annual ≈ 365 days (business approximation — exact billing is handled when a
 * real payment is recorded in story 7-4).
 */

const MONTHLY_DAYS = 30;
const ANNUAL_DAYS = 365;

export interface TrialDates {
  subscriptionStart: Date;
  subscriptionEnd: Date;
  trialEndsAt: Date;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function calculateTrialDates(params: {
  cycle: "monthly" | "annual";
  now?: Date;
  /** Platform-configured trial length (story 7-12) — falls back to DEFAULT_TRIAL_DAYS. */
  trialDays?: number;
}): TrialDates {
  const now = params.now ?? new Date();
  const subscriptionDays = params.cycle === "annual" ? ANNUAL_DAYS : MONTHLY_DAYS;
  const trialDays = params.trialDays ?? DEFAULT_TRIAL_DAYS;

  return {
    subscriptionStart: new Date(now.getTime()),
    subscriptionEnd: addDays(now, subscriptionDays),
    trialEndsAt: addDays(now, trialDays),
  };
}
