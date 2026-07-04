import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { subscriptionPayments } from "@/lib/schema";

export type CoveringPayment = typeof subscriptionPayments.$inferSelect;

/** Normalizes a date to UTC midnight so period-coverage checks compare calendar days, not instants. */
function toUtcMidnight(date: Date): Date {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
}

/**
 * Semi-open interval [periodStart, periodEnd): periodStart===today covers,
 * periodEnd===today does NOT (period already expired that day).
 */
export function isPaymentCovering(
  payment: { periodStart: Date; periodEnd: Date },
  today: Date = new Date()
): boolean {
  const start = new Date(payment.periodStart);
  const end = new Date(payment.periodEnd);
  const normalizedToday = toUtcMidnight(today);
  return start <= normalizedToday && normalizedToday < end;
}

export async function findCoveringPayments(
  tenantId: string,
  today: Date = new Date()
): Promise<CoveringPayment[]> {
  const normalizedToday = toUtcMidnight(today);
  return await db
    .select()
    .from(subscriptionPayments)
    .where(
      and(
        eq(subscriptionPayments.tenantId, tenantId),
        lte(subscriptionPayments.periodStart, normalizedToday),
        gt(subscriptionPayments.periodEnd, normalizedToday)
      )
    )
    .orderBy(desc(subscriptionPayments.periodEnd), desc(subscriptionPayments.paidAt));
}

export async function getPaymentForTenant(
  tenantId: string,
  paymentId: string,
  executor: typeof db | Tx = db
): Promise<CoveringPayment | null> {
  const [row] = await executor
    .select()
    .from(subscriptionPayments)
    .where(and(eq(subscriptionPayments.id, paymentId), eq(subscriptionPayments.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}
