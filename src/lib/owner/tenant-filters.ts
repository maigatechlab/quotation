import { and, count, eq, gte, ilike, isNotNull, isNull, lt, lte, or, sql, SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";

export interface TenantFilters {
  status?: "active" | "trial" | "suspended" | "cancelled";
  plan?: "free" | "pro" | "enterprise";
  expiry?: "expiring-7d" | "in-grace" | "overdue-30d";
  paymentMethod?: "nitta" | "wave" | "amana" | "stripe" | "cash" | "virement";
  createdAfter?: string;
  createdBefore?: string;
  q?: string;
  page: number;
}

export const TENANTS_PAGE_SIZE = 25;

const VALID_STATUSES = new Set(["active", "trial", "suspended", "cancelled"]);
const VALID_PLANS = new Set(["free", "pro", "enterprise"]);
const VALID_EXPIRY = new Set(["expiring-7d", "in-grace", "overdue-30d"]);
const VALID_PAYMENT_METHODS = new Set(["nitta", "wave", "amana", "stripe", "cash", "virement"]);

export function parseTenantFilters(
  sp: Record<string, string | string[] | undefined>,
): TenantFilters {
  const str = (key: string) => {
    const v = sp[key];
    return typeof v === "string" ? v : undefined;
  };

  const statusRaw = str("status");
  const planRaw = str("plan");
  const expiryRaw = str("expiry");
  const paymentMethodRaw = str("paymentMethod");

  const page = Math.max(1, Number(str("page")) || 1);

  const validStatus =
    statusRaw && VALID_STATUSES.has(statusRaw)
      ? (statusRaw as NonNullable<TenantFilters["status"]>)
      : undefined;
  const validPlan =
    planRaw && VALID_PLANS.has(planRaw)
      ? (planRaw as NonNullable<TenantFilters["plan"]>)
      : undefined;
  const validExpiry =
    expiryRaw && VALID_EXPIRY.has(expiryRaw)
      ? (expiryRaw as NonNullable<TenantFilters["expiry"]>)
      : undefined;
  const validPaymentMethod =
    paymentMethodRaw && VALID_PAYMENT_METHODS.has(paymentMethodRaw)
      ? (paymentMethodRaw as NonNullable<TenantFilters["paymentMethod"]>)
      : undefined;

  const createdAfter = str("createdAfter");
  const createdBefore = str("createdBefore");
  const q = str("q");

  const filters: TenantFilters = { page };
  if (validStatus !== undefined) filters.status = validStatus;
  if (validPlan !== undefined) filters.plan = validPlan;
  if (validExpiry !== undefined) filters.expiry = validExpiry;
  if (validPaymentMethod !== undefined) filters.paymentMethod = validPaymentMethod;
  if (createdAfter) filters.createdAfter = createdAfter;
  if (createdBefore) filters.createdBefore = createdBefore;
  if (q) filters.q = q;

  return filters;
}

export function buildTenantWhere(filters: TenantFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(tenants.status, filters.status));
  }

  if (filters.plan) {
    conditions.push(eq(tenants.plan, filters.plan));
  }

  if (filters.expiry) {
    const now = new Date();
    if (filters.expiry === "expiring-7d") {
      const in7d = new Date(now);
      in7d.setDate(now.getDate() + 7);
      conditions.push(
        sql`${tenants.status} IN ('active','trial')`,
        isNotNull(tenants.subscriptionEnd),
        sql`${tenants.subscriptionEnd} BETWEEN ${now} AND ${in7d}`,
      );
    } else if (filters.expiry === "in-grace") {
      conditions.push(
        isNotNull(tenants.gracePeriodEndsAt),
        gte(tenants.gracePeriodEndsAt, now),
        isNotNull(tenants.subscriptionEnd),
        lt(tenants.subscriptionEnd, now),
      );
    } else if (filters.expiry === "overdue-30d") {
      const overdue30 = new Date(now);
      overdue30.setDate(now.getDate() - 30);
      conditions.push(
        sql`${tenants.status} IN ('active','trial')`,
        isNotNull(tenants.subscriptionEnd),
        lt(tenants.subscriptionEnd, overdue30),
        isNull(tenants.gracePeriodEndsAt),
      );
    }
  }

  if (filters.paymentMethod) {
    const method = filters.paymentMethod;
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM subscription_payments sp
        WHERE sp.tenant_id = ${tenants.id}
          AND sp.payment_method = ${method}
        ORDER BY sp.paid_at DESC
        LIMIT 1
      )`,
    );
  }

  if (filters.createdAfter) {
    conditions.push(gte(tenants.createdAt, new Date(filters.createdAfter)));
  }
  if (filters.createdBefore) {
    conditions.push(lte(tenants.createdAt, new Date(filters.createdBefore + "T23:59:59Z")));
  }

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(or(ilike(tenants.name, pattern), ilike(tenants.slug, pattern)) as SQL);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  subscriptionEnd: Date | null;
  maxUsers: number;
  createdAt: Date;
  lastPaymentAmount: number | null;
  lastPaymentMethod: string | null;
  lastPaymentDate: Date | null;
  activeUsers: number;
  daysRemaining: number | null;
};

export async function fetchTenantsPage(
  filters: TenantFilters,
  pageSizeOverride?: number,
): Promise<{ rows: TenantRow[]; totalPages: number; total: number }> {
  const where = buildTenantWhere(filters);
  const pageSize = pageSizeOverride ?? TENANTS_PAGE_SIZE;
  const offset = (filters.page - 1) * pageSize;

  const [totalRow] = await db
    .select({ n: count() })
    .from(tenants)
    .where(where);

  const total = totalRow?.n ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      status: tenants.status,
      subscriptionEnd: tenants.subscriptionEnd,
      maxUsers: tenants.maxUsers,
      createdAt: tenants.createdAt,
      lastPaymentAmount: sql<number | null>`(
        SELECT amount FROM subscription_payments
        WHERE tenant_id = "tenants"."id"
        ORDER BY paid_at DESC, id DESC LIMIT 1
      )`,
      lastPaymentMethod: sql<string | null>`(
        SELECT payment_method FROM subscription_payments
        WHERE tenant_id = "tenants"."id"
        ORDER BY paid_at DESC, id DESC LIMIT 1
      )`,
      lastPaymentDate: sql<Date | null>`(
        SELECT paid_at FROM subscription_payments
        WHERE tenant_id = "tenants"."id"
        ORDER BY paid_at DESC, id DESC LIMIT 1
      )`,
      activeUsers: sql<number>`(
        SELECT COUNT(*)::int FROM "user"
        WHERE tenant_id = "tenants"."id"
      )`,
    })
    .from(tenants)
    .where(where)
    .orderBy(sql`${tenants.createdAt} DESC`)
    .limit(pageSize)
    .offset(offset);

  const now = new Date();
  const result: TenantRow[] = rows.map((r) => {
    let daysRemaining: number | null = null;
    if (r.subscriptionEnd) {
      const diffMs = new Date(r.subscriptionEnd).getTime() - now.getTime();
      daysRemaining = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
    return { ...r, daysRemaining };
  });

  return { rows: result, totalPages, total };
}
