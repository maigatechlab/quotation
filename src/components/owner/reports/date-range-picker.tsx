"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export function DateRangePicker() {
  const t = useTranslations("owner.reports.paymentsExport");
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());

  const isValid = from !== "" && to !== "" && from <= to;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!from || !to) {
      e.preventDefault();
      toast.error(t("errors.fromToRequired"));
      return;
    }
    if (from > to) {
      e.preventDefault();
      toast.error(t("errors.fromAfterTo"));
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
        {t("from")}
        <input
          type="date"
          value={from}
          aria-label={t("from")}
          onChange={(e) => setFrom(e.target.value)}
          className="h-11 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-text-muted">
        {t("to")}
        <input
          type="date"
          value={to}
          aria-label={t("to")}
          onChange={(e) => setTo(e.target.value)}
          className="h-11 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
        />
      </label>
      <a
        href={
          isValid
            ? `/api/v1/owner/reports/payments/export?from=${from}&to=${to}`
            : undefined
        }
        download
        onClick={handleClick}
        className="inline-flex h-11 items-center rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep"
      >
        {t("download")}
      </a>
    </div>
  );
}
