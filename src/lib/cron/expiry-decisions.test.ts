import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const selectResult = vi.fn<() => unknown[]>(() => []);
  return { selectResult };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.selectResult()),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/schema", () => ({
  tenantEvents: {},
  subscriptionPayments: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => "eq",
  and: () => "and",
  gte: () => "gte",
  lte: () => "lte",
}));

import {
  autoSuspendedNote,
  calendarDaysBetween,
  computeReminderAction,
  graceExpiredNote,
  hasGraceExpiredEventBeenSent,
  hasPaymentCoverageSkipEventBeenSent,
  hasPaymentCoveringPeriod,
  hasReminderBeenSent,
  paymentCoverageSkipNote,
  reminderSentNote,
  stageForDaysRemaining,
  type TenantForDecision,
} from "./expiry-decisions";

function makeTenant(overrides: Partial<TenantForDecision> = {}): TenantForDecision {
  return {
    status: "active",
    plan: "pro",
    subscriptionEnd: null,
    gracePeriodEndsAt: null,
    ...overrides,
  };
}

describe("computeReminderAction", () => {
  const now = new Date("2026-07-01T12:00:00Z");

  it("J-7 → reminder first", () => {
    const sub = new Date("2026-07-08T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({
      kind: "reminder",
      stage: "first",
      daysRemaining: 7,
    });
  });

  it("J-3 → reminder second", () => {
    const sub = new Date("2026-07-04T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({
      kind: "reminder",
      stage: "second",
      daysRemaining: 3,
    });
  });

  it("J-1 → reminder urgent", () => {
    const sub = new Date("2026-07-02T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({
      kind: "reminder",
      stage: "urgent",
      daysRemaining: 1,
    });
  });

  it("J-8 → none (avant le premier seuil)", () => {
    const sub = new Date("2026-07-09T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({ kind: "none" });
  });

  it("J-6 → reminder first (catch-up: inside the ≤7 window, e.g. J-7 run missed)", () => {
    const sub = new Date("2026-07-07T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({
      kind: "reminder",
      stage: "first",
      daysRemaining: 6,
    });
  });

  it("J-2 → reminder second (catch-up: inside the ≤3 window, e.g. J-3 run missed)", () => {
    const sub = new Date("2026-07-03T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({
      kind: "reminder",
      stage: "second",
      daysRemaining: 2,
    });
  });

  it("J0 (subscriptionEnd == now) → expired", () => {
    const sub = new Date("2026-07-01T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({ kind: "expired" });
  });

  it("J+1 (subscriptionEnd dans le passé) → expired", () => {
    const sub = new Date("2026-06-30T00:00:00Z");
    expect(computeReminderAction(makeTenant({ subscriptionEnd: sub }), now)).toEqual({ kind: "expired" });
  });

  it("plan free → none (jamais de rappel)", () => {
    const sub = new Date("2026-07-08T00:00:00Z");
    expect(computeReminderAction(makeTenant({ plan: "free", subscriptionEnd: sub }), now)).toEqual({
      kind: "none",
    });
  });

  it("subscriptionEnd null → none", () => {
    expect(computeReminderAction(makeTenant({ subscriptionEnd: null }), now)).toEqual({ kind: "none" });
  });

  it("status suspended + grace future → none", () => {
    const sub = new Date("2026-06-01T00:00:00Z");
    const grace = new Date("2026-07-10T00:00:00Z");
    expect(
      computeReminderAction(makeTenant({ status: "suspended", subscriptionEnd: sub, gracePeriodEndsAt: grace }), now)
    ).toEqual({ kind: "none" });
  });

  it("status suspended + grace passée → grace-expired", () => {
    const sub = new Date("2026-06-01T00:00:00Z");
    const grace = new Date("2026-06-25T00:00:00Z");
    expect(
      computeReminderAction(makeTenant({ status: "suspended", subscriptionEnd: sub, gracePeriodEndsAt: grace }), now)
    ).toEqual({ kind: "grace-expired" });
  });

  it("status cancelled → none (guard défensif)", () => {
    const sub = new Date("2026-07-08T00:00:00Z");
    expect(computeReminderAction(makeTenant({ status: "cancelled", subscriptionEnd: sub }), now)).toEqual({
      kind: "none",
    });
  });
});

describe("stageForDaysRemaining (window-based catch-up)", () => {
  it("maps each window to its stage, boundaries inclusive on the upper edge", () => {
    expect(stageForDaysRemaining(7)).toBe("first");
    expect(stageForDaysRemaining(6)).toBe("first");
    expect(stageForDaysRemaining(4)).toBe("first");
    expect(stageForDaysRemaining(3)).toBe("second");
    expect(stageForDaysRemaining(2)).toBe("second");
    expect(stageForDaysRemaining(1)).toBe("urgent");
  });

  it("returns null outside every window", () => {
    expect(stageForDaysRemaining(8)).toBeNull();
    expect(stageForDaysRemaining(0)).toBeNull();
    expect(stageForDaysRemaining(-1)).toBeNull();
  });
});

describe("calendarDaysBetween", () => {
  it("same day → 0", () => {
    const d = new Date("2026-07-01T08:00:00Z");
    expect(calendarDaysBetween(d, new Date("2026-07-01T23:00:00Z"))).toBe(0);
  });

  it("next day → 1", () => {
    expect(calendarDaysBetween(new Date("2026-07-01T00:00:00Z"), new Date("2026-07-02T00:00:00Z"))).toBe(1);
  });

  it("crosses month boundary correctly", () => {
    expect(calendarDaysBetween(new Date("2026-06-29T00:00:00Z"), new Date("2026-07-02T00:00:00Z"))).toBe(3);
  });

  it("ignores time-of-day (minuit UTC à minuit UTC)", () => {
    const from = new Date("2026-07-01T23:59:00Z");
    const to = new Date("2026-07-02T00:01:00Z");
    expect(calendarDaysBetween(from, to)).toBe(1);
  });
});

describe("DB-backed helpers", () => {
  beforeEach(() => {
    h.selectResult.mockReturnValue([]);
  });
  afterEach(() => vi.clearAllMocks());

  it("hasReminderBeenSent → false when no matching event", async () => {
    h.selectResult.mockReturnValue([]);
    expect(await hasReminderBeenSent("tenant-1", "first", new Date("2026-07-08T00:00:00Z"))).toBe(false);
  });

  it("hasReminderBeenSent → true when a matching event exists", async () => {
    h.selectResult.mockReturnValue([{ id: "evt-1" }]);
    expect(await hasReminderBeenSent("tenant-1", "first", new Date("2026-07-08T00:00:00Z"))).toBe(true);
  });

  it("reminderSentNote → scopes the note to stage + subscriptionEnd, so a renewed period gets a fresh key", () => {
    const noteA = reminderSentNote("first", new Date("2026-07-08T00:00:00Z"));
    const noteB = reminderSentNote("first", new Date("2026-08-08T00:00:00Z"));
    expect(noteA).not.toBe(noteB);
  });

  it("hasPaymentCoveringPeriod → false when no covering payment", async () => {
    h.selectResult.mockReturnValue([]);
    expect(
      await hasPaymentCoveringPeriod({ id: "tenant-1", subscriptionEnd: new Date("2026-07-01T00:00:00Z") })
    ).toBe(false);
  });

  it("hasPaymentCoveringPeriod → true when a covering payment exists", async () => {
    h.selectResult.mockReturnValue([{ id: "pay-1" }]);
    expect(
      await hasPaymentCoveringPeriod({ id: "tenant-1", subscriptionEnd: new Date("2026-07-01T00:00:00Z") })
    ).toBe(true);
  });

  it("hasPaymentCoveringPeriod → false when subscriptionEnd is null", async () => {
    h.selectResult.mockReturnValue([{ id: "pay-1" }]);
    expect(await hasPaymentCoveringPeriod({ id: "tenant-1", subscriptionEnd: null })).toBe(false);
  });

  it("hasGraceExpiredEventBeenSent → false/true per DB result", async () => {
    const subEnd = new Date("2026-06-01T00:00:00Z");
    h.selectResult.mockReturnValue([]);
    expect(await hasGraceExpiredEventBeenSent("tenant-1", subEnd)).toBe(false);
    h.selectResult.mockReturnValue([{ id: "evt-2" }]);
    expect(await hasGraceExpiredEventBeenSent("tenant-1", subEnd)).toBe(true);
  });

  it("hasPaymentCoverageSkipEventBeenSent → false/true per DB result", async () => {
    const subEnd = new Date("2026-07-01T00:00:00Z");
    h.selectResult.mockReturnValue([]);
    expect(await hasPaymentCoverageSkipEventBeenSent("tenant-1", subEnd)).toBe(false);
    h.selectResult.mockReturnValue([{ id: "evt-3" }]);
    expect(await hasPaymentCoverageSkipEventBeenSent("tenant-1", subEnd)).toBe(true);
  });

  it("period-scoped notes → same base, different subscriptionEnd produces different key (reactivation-then-re-expiry doesn't collide)", () => {
    const subEndA = new Date("2026-06-01T00:00:00Z");
    const subEndB = new Date("2026-09-01T00:00:00Z");
    expect(autoSuspendedNote(subEndA)).not.toBe(autoSuspendedNote(subEndB));
    expect(graceExpiredNote(subEndA)).not.toBe(graceExpiredNote(subEndB));
    expect(paymentCoverageSkipNote(subEndA)).not.toBe(paymentCoverageSkipNote(subEndB));
  });
});
