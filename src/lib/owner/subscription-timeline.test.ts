import { describe, expect, it } from "vitest";
import { buildSubscriptionTimeline, type TimelinePaymentInput } from "./subscription-timeline";

function payment(overrides: Partial<TimelinePaymentInput> = {}): TimelinePaymentInput {
  return {
    periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2026-02-01"),
    amount: 25000,
    paymentMethod: "wave",
    paymentReference: null,
    ...overrides,
  };
}

describe("buildSubscriptionTimeline", () => {
  it("0 payment → empty segments, null axis, zero totals", () => {
    const result = buildSubscriptionTimeline([]);
    expect(result.segments).toEqual([]);
    expect(result.axisStart).toBeNull();
    expect(result.axisEnd).toBeNull();
    expect(result.totalPaidDays).toBe(0);
    expect(result.totalGapDays).toBe(0);
  });

  it("1 payment → 1 paid segment, no gap", () => {
    const result = buildSubscriptionTimeline([payment()], new Date("2026-02-01"));
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]?.kind).toBe("paid");
    expect(result.totalPaidDays).toBe(31);
    expect(result.totalGapDays).toBe(0);
  });

  it("2 payments with a gap → 2 paid segments + 1 gap segment", () => {
    const p1 = payment({ periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-01") });
    const p2 = payment({ periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-04-01") });
    const result = buildSubscriptionTimeline([p1, p2], new Date("2026-04-01"));
    expect(result.segments).toHaveLength(3);
    expect(result.segments.map((s) => s.kind)).toEqual(["paid", "gap", "paid"]);
    expect(result.totalGapDays).toBeGreaterThan(0);
  });

  it("2 overlapping payments → no negative gap, 2 paid segments juxtaposed", () => {
    const p1 = payment({ periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-15") });
    const p2 = payment({ periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-03-01") });
    const result = buildSubscriptionTimeline([p1, p2], new Date("2026-03-01"));
    expect(result.segments.filter((s) => s.kind === "gap")).toHaveLength(0);
    expect(result.segments.filter((s) => s.kind === "paid")).toHaveLength(2);
    expect(result.totalGapDays).toBe(0);
  });

  it("expired subscription → terminal red gap between last periodEnd and now", () => {
    const result = buildSubscriptionTimeline([payment()], new Date("2026-03-01"));
    expect(result.segments.map((s) => s.kind)).toEqual(["paid", "gap"]);
    const gap = result.segments[1];
    expect(gap?.durationDays).toBe(28);
    expect(result.totalGapDays).toBe(28);
    expect(result.axisEnd).toEqual(new Date("2026-03-01"));
  });

  it("axisEnd stays at last periodEnd when the subscription is still running", () => {
    const result = buildSubscriptionTimeline([payment()], new Date("2026-01-15"));
    expect(result.axisEnd).toEqual(new Date("2026-02-01"));
    expect(result.segments.filter((s) => s.kind === "gap")).toHaveLength(0);
  });

  it("inverted period (periodEnd < periodStart) → duration clamped to 0, no negative totals", () => {
    const p = payment({ periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-01-01") });
    const result = buildSubscriptionTimeline([p], new Date("2026-02-01"));
    expect(result.totalPaidDays).toBe(0);
    expect(result.totalGapDays).toBeGreaterThanOrEqual(0);
  });

  it("sorts input chronologically by periodStart", () => {
    const p1 = payment({ periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-04-01") });
    const p2 = payment({ periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-01") });
    const result = buildSubscriptionTimeline([p1, p2]);
    const paidSegments = result.segments.filter((s) => s.kind === "paid");
    expect(paidSegments[0]?.start.getTime()).toBe(p2.periodStart.getTime());
    expect(paidSegments[1]?.start.getTime()).toBe(p1.periodStart.getTime());
  });

  it("does not mutate the input array", () => {
    const p1 = payment({ periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-04-01") });
    const p2 = payment({ periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-02-01") });
    const input = [p1, p2];
    const snapshot = JSON.parse(JSON.stringify(input));
    buildSubscriptionTimeline(input);
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });

  it("computes totalPaidDays as the sum of paid segment durations", () => {
    const p1 = payment({ periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-11") }); // 10 days
    const p2 = payment({ periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-06") }); // 5 days
    const result = buildSubscriptionTimeline([p1, p2], new Date("2026-02-06"));
    expect(result.totalPaidDays).toBe(15);
  });
});
