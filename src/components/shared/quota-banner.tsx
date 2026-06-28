"use client";

import { useTranslations } from "next-intl";
import { useQuotaStatus } from "@/hooks/use-quota-status";

export function QuotaBanner() {
  const t = useTranslations("quota");
  const quota = useQuotaStatus();

  if (!quota || quota.quotaStatus === "ok") return null;

  if (quota.quotaStatus === "warning") {
    const used = quota.quotas.quotes.used;
    const limit = quota.quotas.quotes.limit ?? "∞";
    return (
      <div
        role="alert"
        className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center"
      >
        {t("warning", { used, limit })}
        {" — "}
        <a href="/parametres" className="underline font-semibold">
          {t("upgrade")}
        </a>
      </div>
    );
  }

  if (quota.quotaStatus === "exceeded" || quota.quotaStatus === "readonly") {
    const days = quota.daysRemaining ?? 0;
    return (
      <div role="alert" className="bg-red-600 px-4 py-2 text-xs text-white text-center">
        {quota.quotaStatus === "readonly"
          ? t("readonly")
          : t("exceeded", { days })}
        {" — "}
        <a href="/parametres" className="underline font-semibold">
          {t("upgradeNow")}
        </a>
      </div>
    );
  }

  return null;
}
