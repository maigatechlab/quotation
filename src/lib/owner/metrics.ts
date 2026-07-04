import { count, sum, sql, and, eq, gte, lt, between, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, subscriptionPayments, tenantEvents } from "@/lib/schema";

export async function computeOwnerMetrics() {
  const rows = await db
    .select({ status: tenants.status, n: count() })
    .from(tenants)
    .groupBy(tenants.status);

  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const active = byStatus["active"] ?? 0;
  const trial = byStatus["trial"] ?? 0;
  const suspended = byStatus["suspended"] ?? 0;
  const cancelled = byStatus["cancelled"] ?? 0;
  return { active, trial, suspended, cancelled, total: active + trial + suspended + cancelled };
}

export async function computeRevenue() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setFullYear(now.getFullYear() - 1);

  const [monthlyRow] = await db
    .select({ total: sum(subscriptionPayments.amount) })
    .from(subscriptionPayments)
    .where(
      and(
        eq(subscriptionPayments.billingCycle, "monthly"),
        gte(subscriptionPayments.paidAt, startOfMonth),
      ),
    );

  const [annualRow] = await db
    .select({ total: sum(subscriptionPayments.amount) })
    .from(subscriptionPayments)
    .where(
      and(
        eq(subscriptionPayments.billingCycle, "annual"),
        gte(subscriptionPayments.paidAt, twelveMonthsAgo),
      ),
    );

  const [collectedRow] = await db
    .select({ total: sum(subscriptionPayments.amount) })
    .from(subscriptionPayments)
    .where(gte(subscriptionPayments.paidAt, startOfMonth));

  const monthlyThisMonth = Number(monthlyRow?.total ?? 0);
  const annual12m = Number(annualRow?.total ?? 0);
  const mrr = monthlyThisMonth + Math.round(annual12m / 12);
  const arr = mrr * 12;
  const collectedThisMonth = Number(collectedRow?.total ?? 0);

  return { mrr, arr, collectedThisMonth };
}

export async function getCriticalAlerts() {
  const now = new Date();
  const in7d = new Date(now);
  in7d.setDate(now.getDate() + 7);
  const overdue30 = new Date(now);
  overdue30.setDate(now.getDate() - 30);

  const expiringSoon = await db
    .select()
    .from(tenants)
    .where(
      and(
        sql`${tenants.status} IN ('active','trial')`,
        isNotNull(tenants.subscriptionEnd),
        between(tenants.subscriptionEnd, now, in7d),
      ),
    )
    .limit(10);

  const inGrace = await db
    .select()
    .from(tenants)
    .where(
      and(
        isNotNull(tenants.gracePeriodEndsAt),
        gte(tenants.gracePeriodEndsAt, now),
        isNotNull(tenants.subscriptionEnd),
        lt(tenants.subscriptionEnd, now),
      ),
    )
    .limit(10);

  const overdue = await db
    .select()
    .from(tenants)
    .where(
      and(
        sql`${tenants.status} IN ('active','trial')`,
        isNotNull(tenants.subscriptionEnd),
        lt(tenants.subscriptionEnd, overdue30),
        isNull(tenants.gracePeriodEndsAt),
      ),
    )
    .limit(10);

  return { expiringSoon, inGrace, overdue };
}

export type RecentActivityRow = {
  eventType: string;
  note: string | null;
  createdAt: Date;
  tenantName: string | null;
  tenantSlug: string | null;
};

export async function getRecentActivity(limit = 10): Promise<RecentActivityRow[]> {
  return await db
    .select({
      eventType: tenantEvents.eventType,
      note: tenantEvents.note,
      createdAt: tenantEvents.createdAt,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
    .from(tenantEvents)
    .leftJoin(tenants, eq(tenantEvents.tenantId, tenants.id))
    .orderBy(sql`${tenantEvents.createdAt} DESC`)
    .limit(limit);
}

export async function getHealthRatio() {
  const m = await computeOwnerMetrics();
  return {
    active: m.active,
    total: m.total,
    pct: m.total === 0 ? 0 : Math.round((m.active / m.total) * 100),
  };
}
