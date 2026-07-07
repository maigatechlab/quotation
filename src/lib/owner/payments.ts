import { and, count, eq, gte, ilike, lt, or, sql, sum, SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptionPayments, tenants } from "@/lib/schema";

export interface PaymentFilters {
  method?: "nitta" | "wave" | "amana" | "stripe" | "cash" | "virement";
  cycle?: "monthly" | "annual";
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  q?: string; // tenant name or slug
  page: number;
}

export interface PaymentRow {
  id: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  paidAt: Date;
  periodStart: Date;
  periodEnd: Date;
  billingCycle: "monthly" | "annual";
  notes: string | null;
}

export const PAYMENTS_PAGE_SIZE = 25;

const VALID_METHODS = new Set(["nitta", "wave", "amana", "stripe", "cash", "virement"]);
const VALID_CYCLES = new Set(["monthly", "annual"]);
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parsePaymentFilters(
  sp: Record<string, string | string[] | undefined>,
): PaymentFilters {
  const str = (key: string) => {
    const v = sp[key];
    return typeof v === "string" ? v : undefined;
  };

  const methodRaw = str("method");
  const cycleRaw = str("cycle");
  const from = str("from");
  const to = str("to");
  const q = str("q");
  const page = Math.max(1, Number(str("page")) || 1);

  const filters: PaymentFilters = { page };
  if (methodRaw && VALID_METHODS.has(methodRaw)) {
    filters.method = methodRaw as NonNullable<PaymentFilters["method"]>;
  }
  if (cycleRaw && VALID_CYCLES.has(cycleRaw)) {
    filters.cycle = cycleRaw as NonNullable<PaymentFilters["cycle"]>;
  }
  if (from && DATE_ONLY_RE.test(from)) filters.from = from;
  if (to && DATE_ONLY_RE.test(to)) filters.to = to;
  if (q) filters.q = q;

  return filters;
}

function buildPaymentWhere(filters: PaymentFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.method) {
    conditions.push(eq(subscriptionPayments.paymentMethod, filters.method));
  }
  if (filters.cycle) {
    conditions.push(eq(subscriptionPayments.billingCycle, filters.cycle));
  }
  if (filters.from) {
    conditions.push(gte(subscriptionPayments.paidAt, new Date(filters.from + "T00:00:00")));
  }
  if (filters.to) {
    // inclusive end of day → strict lt next midnight
    const end = new Date(filters.to + "T00:00:00");
    end.setDate(end.getDate() + 1);
    conditions.push(lt(subscriptionPayments.paidAt, end));
  }
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(or(ilike(tenants.name, pattern), ilike(tenants.slug, pattern)) as SQL);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function fetchPaymentsPage(filters: PaymentFilters): Promise<{
  rows: PaymentRow[];
  total: number;
  totalPages: number;
  totalAmount: number;
}> {
  const where = buildPaymentWhere(filters);
  const pageSize = PAYMENTS_PAGE_SIZE;

  const [totals] = await db
    .select({ n: count(), totalAmount: sum(subscriptionPayments.amount) })
    .from(subscriptionPayments)
    .leftJoin(tenants, eq(subscriptionPayments.tenantId, tenants.id))
    .where(where);

  const total = totals?.n ?? 0;
  const totalAmount = Number(totals?.totalAmount ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.page, totalPages);
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select({
      id: subscriptionPayments.id,
      tenantId: subscriptionPayments.tenantId,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      amount: subscriptionPayments.amount,
      currency: subscriptionPayments.currency,
      method: subscriptionPayments.paymentMethod,
      reference: subscriptionPayments.paymentReference,
      paidAt: subscriptionPayments.paidAt,
      periodStart: subscriptionPayments.periodStart,
      periodEnd: subscriptionPayments.periodEnd,
      billingCycle: subscriptionPayments.billingCycle,
      notes: subscriptionPayments.notes,
    })
    .from(subscriptionPayments)
    .leftJoin(tenants, eq(subscriptionPayments.tenantId, tenants.id))
    .where(where)
    .orderBy(sql`${subscriptionPayments.paidAt} DESC`, sql`${subscriptionPayments.id} DESC`)
    .limit(pageSize)
    .offset(offset);

  return { rows, total, totalPages, totalAmount };
}
