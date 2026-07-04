"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  date: string; // "YYYY-MM-DD"
  month?: string; // preserved across navigation, if present
}

export function SnapshotDatePicker({ date, month }: Props) {
  const router = useRouter();
  const t = useTranslations("owner.reports.snapshot");

  function handleChange(value: string) {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    params.set("snapshotDate", value);
    params.set("snapshotPage", "1");
    router.push(`?${params.toString()}`);
  }

  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
      {t("dateLabel")}
      <input
        type="date"
        value={date}
        aria-label={t("dateLabel")}
        onChange={(e) => handleChange(e.target.value)}
        className="h-11 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
      />
    </label>
  );
}
