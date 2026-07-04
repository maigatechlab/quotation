import { getTranslations } from "next-intl/server";
import { DateRangePicker } from "./date-range-picker";

export async function PaymentsExportSection() {
  const t = await getTranslations("owner.reports.paymentsExport");

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-serif text-xl font-semibold text-text-primary">{t("title")}</h2>
        <p className="mt-1 text-sm text-text-muted">{t("description")}</p>
      </div>
      <DateRangePicker />
      <p className="text-xs text-text-muted">{t("limit")}</p>
    </section>
  );
}
