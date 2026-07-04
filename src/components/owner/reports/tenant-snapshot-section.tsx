import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatDateFr, formatDaysRemaining } from "@/lib/owner/format";
import { fetchTenantsSnapshot, isValidDateParam } from "@/lib/owner/reports";
import { cn } from "@/lib/utils";
import { TenantPlanBadge } from "../tenant-plan-badge";
import { TenantStatusBadge } from "../tenant-status-badge";
import { SnapshotDatePicker } from "./snapshot-date-picker";

interface Props {
  searchParams: Record<string, string | string[] | undefined>;
}

function buildPageParams(sp: Props["searchParams"], newPage: number, snapshotDate: string): string {
  const p = new URLSearchParams();
  if (typeof sp.month === "string") p.set("month", sp.month);
  p.set("snapshotDate", snapshotDate);
  p.set("snapshotPage", String(newPage));
  return p.toString();
}

export async function TenantSnapshotSection({ searchParams }: Props) {
  const t = await getTranslations("owner.reports.snapshot");

  const today = new Date().toISOString().slice(0, 10);
  const snapshotDate =
    typeof searchParams.snapshotDate === "string" && isValidDateParam(searchParams.snapshotDate)
      ? searchParams.snapshotDate
      : today;

  const rawPage =
    typeof searchParams.snapshotPage === "string" ? Number(searchParams.snapshotPage) : 1;
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const { rows, totalPages } = await fetchTenantsSnapshot(page, 50);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl font-semibold text-text-primary">{t("title")}</h2>
          <p className="mt-1 text-sm text-text-muted">{t("description")}</p>
          <p className="mt-1 text-xs text-text-muted">
            {t("referenceDate", { date: formatDateFr(new Date(snapshotDate)) })}
          </p>
        </div>
        <div className="flex items-end gap-3">
          <SnapshotDatePicker
            date={snapshotDate}
            {...(typeof searchParams.month === "string" ? { month: searchParams.month } : {})}
          />
          <a
            href={`/api/v1/owner/reports/tenants/export?date=${snapshotDate}`}
            download
            className="inline-flex h-11 items-center rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep"
          >
            {t("download")}
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.name")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.plan")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.status")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.subscriptionStart")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.subscriptionEnd")}
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                {t("columns.maxUsers")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                  {t("empty")}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const { label: daysLabel } = formatDaysRemaining(r.subscriptionEnd);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{r.name}</div>
                      <div className="text-xs text-text-muted">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <TenantPlanBadge plan={r.plan} />
                    </td>
                    <td className="px-4 py-3">
                      <TenantStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {r.subscriptionStart ? formatDateFr(r.subscriptionStart) : "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {r.subscriptionEnd ? (
                        <>
                          {formatDateFr(r.subscriptionEnd)}
                          {daysLabel && <span className="ml-2 text-xs text-text-muted">{daysLabel}</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.maxUsers}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between">
          <Link
            href={`?${buildPageParams(searchParams, page - 1, snapshotDate)}`}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
              page <= 1
                ? "pointer-events-none text-text-muted opacity-40"
                : "hover:bg-surface-alt text-text-secondary"
            )}
            aria-disabled={page <= 1}
          >
            {t("pagination.previous")}
          </Link>
          <span className="text-xs text-text-muted">
            {t("pagination.page", { current: page, total: totalPages })}
          </span>
          <Link
            href={`?${buildPageParams(searchParams, page + 1, snapshotDate)}`}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
              page >= totalPages
                ? "pointer-events-none text-text-muted opacity-40"
                : "hover:bg-surface-alt text-text-secondary"
            )}
            aria-disabled={page >= totalPages}
          >
            {t("pagination.next")}
          </Link>
        </nav>
      )}
    </section>
  );
}
