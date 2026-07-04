import { describe, it, expect } from "vitest";
import { calculatePeriodFromCycle } from "./period";

describe("calculatePeriodFromCycle", () => {
  it("monthly: periodStart equals paidAt", () => {
    const paidAt = new Date("2026-06-15T00:00:00.000Z");
    const { periodStart } = calculatePeriodFromCycle({ cycle: "monthly", paidAt });
    expect(periodStart.toISOString()).toBe(paidAt.toISOString());
  });

  it("monthly: periodEnd is +30 days", () => {
    const paidAt = new Date("2026-06-15T00:00:00.000Z");
    const { periodEnd } = calculatePeriodFromCycle({ cycle: "monthly", paidAt });
    const expected = new Date("2026-07-15T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe(expected.toISOString());
  });

  it("annual: periodEnd is +1 calendar year (same day/month)", () => {
    const paidAt = new Date("2026-06-15T00:00:00.000Z");
    const { periodEnd } = calculatePeriodFromCycle({ cycle: "annual", paidAt });
    const expected = new Date("2027-06-15T00:00:00.000Z");
    expect(periodEnd.toISOString()).toBe(expected.toISOString());
  });

  it("annual: periodStart equals paidAt", () => {
    const paidAt = new Date("2026-06-15T00:00:00.000Z");
    const { periodStart } = calculatePeriodFromCycle({ cycle: "annual", paidAt });
    expect(periodStart.toISOString()).toBe(paidAt.toISOString());
  });

  it("does not mutate the input paidAt", () => {
    const paidAt = new Date("2026-06-15T00:00:00.000Z");
    const original = paidAt.toISOString();
    calculatePeriodFromCycle({ cycle: "monthly", paidAt });
    expect(paidAt.toISOString()).toBe(original);
  });

  it("does not mutate the input paidAt (annual)", () => {
    const paidAt = new Date("2026-06-15T00:00:00.000Z");
    const original = paidAt.toISOString();
    calculatePeriodFromCycle({ cycle: "annual", paidAt });
    expect(paidAt.toISOString()).toBe(original);
  });

  it("monthly edge: Jan 31 + 30 days = March 2 (not end-of-month)", () => {
    // +30 days from Jan 31 = March 2 (31 Jan + 30 = March 2 in non-leap, March 2 in leap)
    const paidAt = new Date("2026-01-31T00:00:00.000Z");
    const { periodEnd } = calculatePeriodFromCycle({ cycle: "monthly", paidAt });
    // 31 + 30 = day 61 of year = March 2 (non-leap 2026)
    expect(periodEnd.getUTCMonth()).toBe(2); // March
    expect(periodEnd.getUTCDate()).toBe(2);
  });
});
