import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, subscriptionPayments, tenantEvents, user, session } from "@/lib/schema";

export async function getTenantById(id: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
  return tenant ?? null;
}

export async function getTenantPayments(tenantId: string) {
  return await db
    .select({
      id: subscriptionPayments.id,
      amount: subscriptionPayments.amount,
      currency: subscriptionPayments.currency,
      paymentMethod: subscriptionPayments.paymentMethod,
      paymentReference: subscriptionPayments.paymentReference,
      paidAt: subscriptionPayments.paidAt,
      periodStart: subscriptionPayments.periodStart,
      periodEnd: subscriptionPayments.periodEnd,
      billingCycle: subscriptionPayments.billingCycle,
      confirmedBy: subscriptionPayments.confirmedBy,
      confirmerEmail: user.email,
    })
    .from(subscriptionPayments)
    .leftJoin(user, eq(subscriptionPayments.confirmedBy, user.id))
    .where(eq(subscriptionPayments.tenantId, tenantId))
    .orderBy(desc(subscriptionPayments.paidAt));
}

export type TenantPaymentRow = Awaited<ReturnType<typeof getTenantPayments>>[number];

export function getCurrentPeriod(
  tenant: {
    subscriptionStart: Date | null;
    subscriptionEnd: Date | null;
    status: string;
    trialEndsAt: Date | null;
    gracePeriodEndsAt: Date | null;
  },
  payments: { billingCycle: "monthly" | "annual" }[]
) {
  const lastPayment = payments[0];
  return {
    start: tenant.subscriptionStart,
    end: tenant.subscriptionEnd,
    cycle: lastPayment?.billingCycle ?? null,
    trialEndsAt: tenant.trialEndsAt,
    gracePeriodEndsAt: tenant.gracePeriodEndsAt,
    status: tenant.status,
  };
}

export async function getTenantUsers(tenantId: string) {
  return await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      disabledAt: user.disabledAt,
      createdAt: user.createdAt,
      // session.updatedAt = last session activity; expiresAt would report a future date.
      // AC7 guard (lastSeen <= now) enforced in SQL to keep the render pure.
      lastSeen: sql<Date | null>`(SELECT MAX(${session.updatedAt}) FROM ${session} WHERE ${session.userId} = ${user.id} AND ${session.updatedAt} <= now())`,
    })
    .from(user)
    .where(eq(user.tenantId, tenantId))
    // Admins first (story 7-9 AC2), then createdAt ASC within each group.
    .orderBy(sql`CASE WHEN ${user.role} = 'admin' THEN 0 ELSE 1 END`, asc(user.createdAt));
}

export type TenantUserRow = Awaited<ReturnType<typeof getTenantUsers>>[number];

export function countActiveUsers(users: { disabledAt: Date | null }[]): number {
  return users.filter((u) => u.disabledAt === null).length;
}

export function computeUserQuota(
  tenant: { maxUsers: number },
  activeUsers: number
): { active: number; max: number; pct: number; tone: "ok" | "warn" | "full" | "exceeded" } {
  // Uses the tenant's own maxUsers column (source of truth enforced by the
  // API guard), NOT PLAN_LIMITS[plan] — the owner can override maxUsers per
  // tenant (e.g. enterprise), and the two can diverge from the plan default.
  const max = tenant.maxUsers;
  const pct = max === 0 ? 0 : Math.round((activeUsers / max) * 100);
  const tone = activeUsers > max ? "exceeded" : pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
  return { active: activeUsers, max, pct, tone };
}

export async function getTenantEvents(tenantId: string, eventType?: string) {
  const conditions = [eq(tenantEvents.tenantId, tenantId)];
  if (eventType && eventType !== "all") {
    conditions.push(eq(tenantEvents.eventType, eventType));
  }
  return await db
    .select({
      id: tenantEvents.id,
      eventType: tenantEvents.eventType,
      actorId: tenantEvents.actorId,
      before: tenantEvents.before,
      after: tenantEvents.after,
      note: tenantEvents.note,
      createdAt: tenantEvents.createdAt,
      actorEmail: user.email,
    })
    .from(tenantEvents)
    .leftJoin(user, eq(tenantEvents.actorId, user.id))
    .where(and(...conditions))
    .orderBy(desc(tenantEvents.createdAt))
    .limit(200);
}

export type TenantEventRow = Awaited<ReturnType<typeof getTenantEvents>>[number];
