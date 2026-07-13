import { getTranslations } from "next-intl/server";
import { RecordPaymentTrigger } from "@/components/owner/record-payment-trigger";
import { Badge } from "@/components/ui/badge";
import { formatFcfa } from "@/lib/money";
import { formatDateFr, formatDaysRemaining } from "@/lib/owner/format";
import { getCurrentPeriod, type TenantPaymentRow } from "@/lib/owner/tenant-detail";
import type { tenants } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { SubscriptionTimeline } from "./subscription-timeline";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  nitta: "Nitta",
  wave: "Wave",
  amana: "Amana",
  cash: "Cash",
  virement: "Virement",
};

interface Props {
  tenant: typeof tenants.$inferSelect;
  payments: TenantPaymentRow[];
}

export async function SubscriptionTab({ tenant, payments }: Props) {
  const t = await getTranslations("owner.tenants.detail.abonnement");
  const tInfos = await getTranslations("owner.tenants.detail.infos");

  const period = getCurrentPeriod(tenant, payments);
  const daysRemaining = formatDaysRemaining(tenant.subscriptionEnd);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg font-semibold text-text-primary">{t("title")}</h3>
        <RecordPaymentTrigger
          tenant={{ id: tenant.id, name: tenant.name, status: tenant.status }}
          variant="button"
        />
      </div>

      <div className="rounded-xl border border-border p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("currentPeriodTitle")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span>
            {period.start ? formatDateFr(period.start) : "—"} →{" "}
            {period.end ? formatDateFr(period.end) : "—"}
          </span>
          <span className="text-text-muted">
            {period.cycle
              ? tInfos(period.cycle === "monthly" ? "cycleMonthly" : "cycleAnnual")
              : tInfos("noCycle")}
          </span>
          {daysRemaining.label && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                daysRemaining.tone === "ok"
                  ? "text-text-muted"
                  : daysRemaining.tone === "warn"
                    ? "bg-status-envoye-bg text-status-envoye-text"
                    : "bg-status-annule-bg text-status-annule-text"
              )}
            >
              {daysRemaining.label}
            </span>
          )}
          {tenant.gracePeriodEndsAt && (
            <Badge className="border-transparent bg-status-envoye-bg text-status-envoye-text">
              {tInfos("inGrace", { date: formatDateFr(tenant.gracePeriodEndsAt) })}
            </Badge>
          )}
          {tenant.status === "trial" && tenant.trialEndsAt && (
            <Badge className="border-transparent bg-status-valide-bg text-status-valide-text">
              {tInfos("inTrial", { date: formatDateFr(tenant.trialEndsAt) })}
            </Badge>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("timeline.title")}
        </p>
        <SubscriptionTimeline payments={payments} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("historyTitle")}
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text-muted">
                  {t("columns.date")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-muted">
                  {t("columns.method")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-muted">
                  {t("columns.amount")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-muted">
                  {t("columns.reference")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-muted">
                  {t("columns.period")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-muted">
                  {t("columns.cycle")}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-text-muted">
                  {t("columns.confirmedBy")}
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-3">{formatDateFr(p.paidAt)}</td>
                    <td className="px-4 py-3">
                      <Badge className="border-transparent bg-surface-alt text-text-secondary">
                        {PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {formatFcfa(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{p.paymentReference ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {formatDateFr(p.periodStart)} → {formatDateFr(p.periodEnd)}
                    </td>
                    <td className="px-4 py-3">
                      {tInfos(p.billingCycle === "monthly" ? "cycleMonthly" : "cycleAnnual")}
                    </td>
                    <td className="px-4 py-3 text-text-muted">{p.confirmerEmail ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
