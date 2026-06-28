"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function AuditExport() {
  const t = useTranslations("parametres.audit");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [isPending, setIsPending] = useState(false);

  async function handleExport(format: "json" | "csv") {
    setIsPending(true);
    try {
      const params = new URLSearchParams({ format, ...(from ? { from } : {}), to });
      const res = await fetch(`/api/v1/audit/export?${params}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const ext = format === "csv" ? "csv" : "json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${today}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("exported"), { duration: 2200 });
    } catch {
      toast.error(t("errorExport"), { duration: 3000 });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">{t("heading")}</h2>
      <p className="text-xs text-text-muted">{t("description")}</p>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-text-muted">{t("from")}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 h-9 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs font-semibold text-text-muted">{t("to")}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 h-9 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
          />
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => handleExport("json")}
          disabled={isPending}
          className="h-9 rounded-xl border border-border px-4 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
        >
          {t("downloadJson")}
        </button>
        <button
          type="button"
          onClick={() => handleExport("csv")}
          disabled={isPending}
          className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
        >
          {t("downloadCsv")}
        </button>
      </div>
      {isPending && <p className="text-xs text-text-muted">{t("exporting")}</p>}
    </div>
  );
}
