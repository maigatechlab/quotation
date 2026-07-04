"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  month: string;
}

export function MonthPicker({ month }: Props) {
  const router = useRouter();
  const t = useTranslations("owner.reports.monthly");

  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
      {t("monthLabel")}
      <input
        type="month"
        value={month}
        aria-label={t("monthLabel")}
        onChange={(e) => router.push(`?month=${e.target.value}`)}
        className="h-11 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
      />
    </label>
  );
}
