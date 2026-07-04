export interface PeriodParams {
  cycle: "monthly" | "annual";
  paidAt: Date;
}

export interface PeriodResult {
  periodStart: Date;
  periodEnd: Date;
}

/**
 * annual = +1 calendar year (same day/month next year), not +365 days.
 * More intuitive commercially: "annual subscription renews same date".
 */
export function calculatePeriodFromCycle({ cycle, paidAt }: PeriodParams): PeriodResult {
  const periodStart = new Date(paidAt);
  const periodEnd = new Date(paidAt);

  if (cycle === "monthly") {
    periodEnd.setDate(periodEnd.getDate() + 30);
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  return { periodStart, periodEnd };
}
