import { and, count, eq, gte, isNotNull, lt, ne, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptionPayments, tenantEvents, tenants } from "@/lib/schema";
import { PLAN_PRICES_XOF } from "@/lib/tenants/tenant-config";

export const PAYMENTS_EXPORT_LIMIT = 10_000;

export interface DateRange {
  start: Date;
  end: Date; // exclusive (half-open range)
}

export type ValidateDateRangeResult =
  | { ok: true; range: DateRange }
  | { ok: false; error: "from-to-required" | "from-after-to" | "invalid-date" };

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Strict "YYYY-MM-DD" parse — rejects malformed input and JS Date's
// auto-rollover (e.g. "2026-02-30" silently becoming March 2).
function parseDateAtMidnight(iso: string): Date | null {
  if (!DATE_ONLY_RE.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year!, month! - 1, day!);
  if (d.getFullYear() !== year || d.getMonth() !== month! - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function isValidDateParam(value: string): boolean {
  return parseDateAtMidnight(value) !== null;
}

export function isValidMonthParam(value: string): boolean {
  return MONTH_RE.test(value);
}

export function validateDateRange(
  from: string | null,
  to: string | null
): ValidateDateRangeResult {
  if (!from || !to) {
    return { ok: false, error: "from-to-required" };
  }
  const fromDate = parseDateAtMidnight(from);
  const toDate = parseDateAtMidnight(to);
  if (!fromDate || !toDate) {
    return { ok: false, error: "invalid-date" };
  }
  if (fromDate >= toDate) {
    // Same-day range (from === to) is valid — only reject fromDate > toDate.
    if (fromDate.getTime() !== toDate.getTime()) {
      return { ok: false, error: "from-after-to" };
    }
  }
  return { ok: true, range: { start: fromDate, end: addDays(toDate, 1) } };
}

export interface RevenueByMethodRow {
  method: string;
  count: number;
  total: number;
}

export async function computeRevenueByMethod(range: DateRange): Promise<{
  byMethod: RevenueByMethodRow[];
  grandTotal: number;
  totalCount: number;
}> {
  const rows = await db
    .select({
      method: subscriptionPayments.paymentMethod,
      n: count(),
      total: sum(subscriptionPayments.amount),
    })
    .from(subscriptionPayments)
    .where(
      and(gte(subscriptionPayments.paidAt, range.start), lt(subscriptionPayments.paidAt, range.end))
    )
    .groupBy(subscriptionPayments.paymentMethod);

  const byMethod = rows.map((r) => ({
    method: r.method,
    count: r.n,
    total: Number(r.total ?? 0),
  }));
  const grandTotal = byMethod.reduce((acc, r) => acc + r.total, 0);
  const totalCount = byMethod.reduce((acc, r) => acc + r.count, 0);
  return { byMethod, grandTotal, totalCount };
}

export interface TenantKpi {
  newTenants: number;
  churn: number;
  activeNow: number;
}

export async function computeTenantKpi(range: DateRange): Promise<TenantKpi> {
  const [newRow] = await db
    .select({ n: count() })
    .from(tenants)
    .where(and(gte(tenants.createdAt, range.start), lt(tenants.createdAt, range.end)));

  const [churnRow] = await db
    .select({ n: count(sql`DISTINCT ${tenantEvents.tenantId}`) })
    .from(tenantEvents)
    .where(
      and(
        eq(tenantEvents.eventType, "cancelled"),
        gte(tenantEvents.createdAt, range.start),
        lt(tenantEvents.createdAt, range.end)
      )
    );

  const [activeRow] = await db
    .select({ n: count() })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  return {
    newTenants: newRow?.n ?? 0,
    churn: churnRow?.n ?? 0,
    activeNow: activeRow?.n ?? 0,
  };
}

export interface RenewalForecastRow {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "trial" | "suspended" | "cancelled";
  subscriptionEnd: Date | null;
  cycle: "monthly" | "annual";
  expectedAmount: number;
}

export async function computeRenewalForecast(monthStart: Date): Promise<{
  forecast: RenewalForecastRow[];
  totalExpected: number;
  count: number;
}> {
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const afterNextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 2, 1);

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      status: tenants.status,
      subscriptionEnd: tenants.subscriptionEnd,
      lastCycle: sql<"monthly" | "annual" | null>`(
        SELECT billing_cycle FROM subscription_payments
        WHERE tenant_id = ${tenants.id}
        ORDER BY paid_at DESC LIMIT 1
      )`,
    })
    .from(tenants)
    .where(
      and(
        isNotNull(tenants.subscriptionEnd),
        gte(tenants.subscriptionEnd, nextMonthStart),
        lt(tenants.subscriptionEnd, afterNextMonthStart),
        ne(tenants.status, "cancelled")
      )
    )
    .orderBy(tenants.name);

  const forecast = rows.map((r) => {
    const cycle = r.lastCycle ?? "monthly";
    const expectedAmount = PLAN_PRICES_XOF[r.plan][cycle];
    return { ...r, cycle, expectedAmount };
  });
  const totalExpected = forecast.reduce((acc, r) => acc + r.expectedAmount, 0);
  return { forecast, totalExpected, count: forecast.length };
}

export interface TenantSnapshotRow {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro" | "enterprise";
  status: "active" | "trial" | "suspended" | "cancelled";
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
  maxUsers: number;
}

export async function fetchTenantsSnapshot(
  page = 1,
  pageSize = 50
): Promise<{ rows: TenantSnapshotRow[]; total: number; totalPages: number }> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      status: tenants.status,
      subscriptionStart: tenants.subscriptionStart,
      subscriptionEnd: tenants.subscriptionEnd,
      maxUsers: tenants.maxUsers,
    })
    .from(tenants)
    .orderBy(tenants.name)
    .limit(pageSize)
    .offset((safePage - 1) * pageSize);

  const total = await db.$count(tenants);
  return { rows, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface PaymentExportRow {
  paidAt: Date;
  tenantName: string | null;
  tenantSlug: string | null;
  method: string;
  amount: number;
  currency: string;
  reference: string | null;
  periodStart: Date;
  periodEnd: Date;
  billingCycle: string;
  confirmedBy: string;
  notes: string | null;
}

export async function fetchPaymentsForExport(
  range: DateRange,
  limit = PAYMENTS_EXPORT_LIMIT
): Promise<PaymentExportRow[]> {
  return await db
    .select({
      paidAt: subscriptionPayments.paidAt,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      method: subscriptionPayments.paymentMethod,
      amount: subscriptionPayments.amount,
      currency: subscriptionPayments.currency,
      reference: subscriptionPayments.paymentReference,
      periodStart: subscriptionPayments.periodStart,
      periodEnd: subscriptionPayments.periodEnd,
      billingCycle: subscriptionPayments.billingCycle,
      confirmedBy: subscriptionPayments.confirmedBy,
      notes: subscriptionPayments.notes,
    })
    .from(subscriptionPayments)
    .leftJoin(tenants, eq(subscriptionPayments.tenantId, tenants.id))
    .where(
      and(gte(subscriptionPayments.paidAt, range.start), lt(subscriptionPayments.paidAt, range.end))
    )
    .orderBy(subscriptionPayments.paidAt)
    .limit(limit);
}
