import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAL_DAYS } from "./tenant-config";
import { calculateTrialDates } from "./tenant-dates";

const NOW = new Date("2026-06-28T12:00:00Z");

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

describe("calculateTrialDates", () => {
  it("sets trialEndsAt to now + DEFAULT_TRIAL_DAYS", () => {
    const { trialEndsAt } = calculateTrialDates({ cycle: "monthly", now: NOW });
    expect(daysBetween(NOW, trialEndsAt)).toBe(DEFAULT_TRIAL_DAYS);
  });

  it("sets subscriptionStart to now", () => {
    const { subscriptionStart } = calculateTrialDates({ cycle: "monthly", now: NOW });
    expect(subscriptionStart.getTime()).toBe(NOW.getTime());
  });

  it("monthly → subscriptionEnd is now + 30 days", () => {
    const { subscriptionEnd } = calculateTrialDates({ cycle: "monthly", now: NOW });
    expect(daysBetween(NOW, subscriptionEnd)).toBe(30);
  });

  it("annual → subscriptionEnd is now + 365 days", () => {
    const { subscriptionEnd } = calculateTrialDates({ cycle: "annual", now: NOW });
    expect(daysBetween(NOW, subscriptionEnd)).toBe(365);
  });

  it("all returned dates are in the future relative to now", () => {
    const dates = calculateTrialDates({ cycle: "annual", now: NOW });
    expect(dates.subscriptionEnd.getTime()).toBeGreaterThan(NOW.getTime());
    expect(dates.trialEndsAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("defaults now to the current time when omitted", () => {
    const before = Date.now();
    const { subscriptionStart } = calculateTrialDates({ cycle: "monthly" });
    const after = Date.now();
    expect(subscriptionStart.getTime()).toBeGreaterThanOrEqual(before);
    expect(subscriptionStart.getTime()).toBeLessThanOrEqual(after);
  });
});
