import { getTranslations } from "next-intl/server";
import { MonthlyReportSection } from "@/components/owner/reports/monthly-report-section";
import { PaymentsExportSection } from "@/components/owner/reports/payments-export-section";
import { RenewalForecastSection } from "@/components/owner/reports/renewal-forecast-section";
import { TenantSnapshotSection } from "@/components/owner/reports/tenant-snapshot-section";
import { isValidMonthParam } from "@/lib/owner/reports";
import { requireOwnerAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OwnerReportsPage({ searchParams }: PageProps) {
  await requireOwnerAuth();
  const sp = await searchParams;
  const t = await getTranslations("owner.reports");

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthParam =
    typeof sp.month === "string" && isValidMonthParam(sp.month) ? sp.month : currentMonth;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("eyebrow")}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">{t("title")}</h1>
        <p className="mt-2 text-sm text-text-muted">{t("description")}</p>
      </div>
      <MonthlyReportSection month={monthParam} />
      <PaymentsExportSection />
      <TenantSnapshotSection searchParams={sp} />
      <RenewalForecastSection month={monthParam} />
    </div>
  );
}
