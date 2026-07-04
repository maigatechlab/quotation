export interface TimelineSegment {
  kind: "paid" | "gap";
  start: Date;
  end: Date;
  amount?: number;
  paymentMethod?: string;
  paymentReference?: string | null;
  durationDays?: number;
}

export interface SubscriptionTimeline {
  segments: TimelineSegment[];
  axisStart: Date | null;
  axisEnd: Date | null;
  totalPaidDays: number;
  totalGapDays: number;
}

export interface TimelinePaymentInput {
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  paymentMethod: string;
  paymentReference: string | null;
}

function diffDays(start: Date, end: Date): number {
  // clamped: inverted periods (periodEnd < periodStart) must not produce negative durations
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export function buildSubscriptionTimeline(
  payments: TimelinePaymentInput[],
  now: Date = new Date()
): SubscriptionTimeline {
  if (payments.length === 0) {
    return { segments: [], axisStart: null, axisEnd: null, totalPaidDays: 0, totalGapDays: 0 };
  }

  const sorted = [...payments].sort(
    (a, b) => a.periodStart.getTime() - b.periodStart.getTime()
  );

  const segments: TimelineSegment[] = [];
  let totalPaidDays = 0;
  let totalGapDays = 0;

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (!p) continue;
    const start = new Date(p.periodStart);
    const end = new Date(p.periodEnd);
    segments.push({
      kind: "paid",
      start,
      end,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      paymentReference: p.paymentReference,
    });
    totalPaidDays += diffDays(start, end);

    const next = sorted[i + 1];
    if (next && next.periodStart.getTime() > p.periodEnd.getTime()) {
      const gapStart = new Date(p.periodEnd);
      const gapEnd = new Date(next.periodStart);
      const durationDays = diffDays(gapStart, gapEnd);
      segments.push({ kind: "gap", start: gapStart, end: gapEnd, durationDays });
      totalGapDays += durationDays;
    }
  }

  const firstPayment = sorted[0];
  const axisStart = firstPayment ? new Date(firstPayment.periodStart) : null;
  // the latest periodEnd across all payments (last by periodStart may not have the max end)
  const maxEndMs = sorted.reduce((acc, p) => Math.max(acc, p.periodEnd.getTime()), 0);
  const lastEnd = maxEndMs > 0 ? new Date(maxEndMs) : null;
  const axisEnd = lastEnd ? (lastEnd.getTime() > now.getTime() ? lastEnd : new Date(now)) : null;

  // terminal gap: subscription expired before now → show the unpaid tail in red
  if (lastEnd && lastEnd.getTime() < now.getTime()) {
    const durationDays = diffDays(lastEnd, now);
    if (durationDays > 0) {
      segments.push({ kind: "gap", start: new Date(lastEnd), end: new Date(now), durationDays });
      totalGapDays += durationDays;
    }
  }

  return { segments, axisStart, axisEnd, totalPaidDays, totalGapDays };
}
