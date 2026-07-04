import { getTranslations } from "next-intl/server";
import { formatFcfa } from "@/lib/money";
import { computeRevenueByMethod, computeTenantKpi, type DateRange } from "@/lib/owner/reports";
import { MonthPicker } from "./month-picker";

interface Props {
  month: string; // "YYYY-MM"
}

function monthRange(month: string): DateRange {
  const [year, m] = month.split("-").map(Number);
  const start = new Date(year!, (m ?? 1) - 1, 1);
  const end = new Date(year!, m ?? 1, 1);
  return { start, end };
}

export async function MonthlyReportSection({ month }: Props) {
  const t = await getTranslations("owner.reports.monthly");
  const tMethod = await getTranslations("owner.badges.paymentMethod");
  const range = monthRange(month);

  const [revenue, kpi] = await Promise.all([
    computeRevenueByMethod(range),
    computeTenantKpi(range),
  ]);

  const kpiCards = [
    { key: "newTenants", label: t("kpi.newTenants"), value: kpi.newTenants },
    { key: "churn", label: t("kpi.churn"), value: kpi.churn },
    { key: "activeNow", label: t("kpi.activeNow"), value: kpi.activeNow },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-xl font-semibold text-text-primary">{t("title")}</h2>
        <MonthPicker month={month} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpiCards.map((c) => (
          <div key={c.key} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {c.label}
            </p>
            <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-text-primary">
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">{t("revenueByMethod")}</h3>
        {revenue.byMethod.length === 0 ? (
          <p className="text-sm text-text-muted">{t("noPayments")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("method")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("count")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {revenue.byMethod.map((r) => (
                  <tr key={r.method} className="border-t border-border">
                    <td className="px-4 py-3 text-text-primary">{tMethod(r.method)}</td>
                    <td className="px-4 py-3 tabular-nums text-text-secondary">{r.count}</td>
                    <td className="px-4 py-3 tabular-nums text-text-primary">
                      {formatFcfa(r.total)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border font-semibold">
                  <td className="px-4 py-3 text-text-primary">{t("grandTotal")}</td>
                  <td className="px-4 py-3 tabular-nums text-text-primary">
                    {revenue.totalCount}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-text-primary">
                    {formatFcfa(revenue.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
