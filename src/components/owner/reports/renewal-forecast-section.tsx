import { getTranslations } from "next-intl/server";
import { formatFcfa } from "@/lib/money";
import { formatDateFr } from "@/lib/owner/format";
import { computeRenewalForecast } from "@/lib/owner/reports";
import { TenantPlanBadge } from "../tenant-plan-badge";

interface Props {
  month: string; // "YYYY-MM"
}

export async function RenewalForecastSection({ month }: Props) {
  const t = await getTranslations("owner.reports.forecast");
  const [year, m] = month.split("-").map(Number);
  const monthStart = new Date(year!, (m ?? 1) - 1, 1);

  const { forecast, totalExpected, count } = await computeRenewalForecast(monthStart);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-serif text-xl font-semibold text-text-primary">{t("title")}</h2>
        <p className="mt-1 text-sm text-text-muted">{t("description")}</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-alt p-3 text-xs text-text-muted">
        {t("disclaimer")}
      </div>

      {forecast.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("columns.tenant")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("columns.plan")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("columns.subscriptionEnd")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("columns.cycle")}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-text-muted">
                    {t("columns.expected")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">{r.name}</div>
                      <div className="text-xs text-text-muted">{r.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <TenantPlanBadge plan={r.plan} />
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {r.subscriptionEnd ? formatDateFr(r.subscriptionEnd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.cycle}</td>
                    <td className="px-4 py-3 tabular-nums text-text-primary">
                      {formatFcfa(r.expectedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">{t("count", { count })}</span>
            <span className="font-serif font-semibold tabular-nums text-text-primary">
              {t("total")}: {formatFcfa(totalExpected)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
