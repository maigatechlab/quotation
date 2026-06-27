"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDashboardStats, type DashboardPeriod } from "@/hooks/use-dashboard-stats";
import { formatFcfa } from "@/lib/money";
import { cn } from "@/lib/utils";

const PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: "7j", label: "7j" },
  { key: "30j", label: "30j" },
  { key: "90j", label: "90j" },
  { key: "tout", label: "Tout" },
];

interface StatCounterProps {
  label: string;
  value: number;
  isLoading: boolean;
  dotClass: string;
}

function StatCounter({ label, value, isLoading, dotClass }: StatCounterProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden="true" />
        <span className="text-[10px] font-medium text-text-on-dark/70">{label}</span>
      </div>
      {isLoading ? (
        <div className="h-7 w-12 animate-pulse rounded bg-white/10" />
      ) : (
        <p className="font-serif text-2xl font-semibold tabular-nums">{value}</p>
      )}
    </div>
  );
}

export function DashboardHero() {
  const [period, setPeriod] = useState<DashboardPeriod>("30j");
  const stats = useDashboardStats(period);
  const t = useTranslations("dashboard");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-brand-navy px-5 py-6",
        "text-text-on-dark"
      )}
      aria-label={t("heroAriaLabel")}
    >
      {/* Filigrane Sahel — 4% opacity, statique (désactivé motion:reduce) */}
      {/* sahel-pattern.svg absent du build — filigrane CSS inline (acceptable MVP) */}
      {/* TODO: remplacer par public/sahel-pattern.svg quand disponible */}
      <div
        className="pointer-events-none absolute inset-0 motion-reduce:hidden"
        aria-hidden="true"
        style={{
          opacity: 0.04,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='20' cy='20' r='1.5' fill='%23ffffff'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow radial amber-terracotta top-right (breathing, désactivé motion:reduce via CSS) */}
      <div
        className="sahel-glow pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-20 motion-reduce:opacity-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(circle, #F6A624 0%, #b8502d 60%, transparent 100%)",
          animation: "breathe 4s ease-in-out infinite",
        }}
      />

      {/* Eyebrow */}
      <p className="relative z-10 text-[10px] font-semibold uppercase tracking-widest text-text-on-dark/70">
        {t("eyebrow", { period: period.toUpperCase() })}
      </p>

      {/* Compteur total principal — Spectral */}
      {stats.isLoading ? (
        <div className="relative z-10 mt-2 h-10 w-24 animate-pulse rounded-lg bg-white/10" />
      ) : (
        <p className="relative z-10 mt-2 font-serif text-4xl font-semibold tabular-nums">
          {stats.total}
        </p>
      )}
      <p className="relative z-10 text-xs text-text-on-dark/70">{t("totalLabel")}</p>

      {/* Segmented control — filtre période (UX-DR22: min-h-[44px], UX-DR23: aria-selected) */}
      <div
        className="relative z-10 mt-4 flex gap-1"
        role="tablist"
        aria-label={t("periodFilterLabel")}
      >
        {PERIODS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={period === key}
            onClick={() => setPeriod(key)}
            className={cn(
              "min-h-[44px] flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
              period === key
                ? "bg-white text-brand-navy"
                : "text-text-on-dark/80 hover:bg-white/10"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grille des compteurs par statut */}
      <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCounter
          label={t("statusDraft")}
          value={stats.draft}
          isLoading={stats.isLoading}
          dotClass="bg-text-on-dark/40"
        />
        <StatCounter
          label={t("statusSent")}
          value={stats.sent}
          isLoading={stats.isLoading}
          dotClass="bg-brand-amber"
        />
        <StatCounter
          label={t("statusAccepted")}
          value={stats.accepted}
          isLoading={stats.isLoading}
          dotClass="bg-green-400"
        />
        <StatCounter
          label={t("statusExpired")}
          value={stats.expired}
          isLoading={stats.isLoading}
          dotClass="bg-red-400"
        />
      </div>

      {/* Métrique montant — Acceptés + Envoyés (Story 5.3 / FR-42) */}
      <div className="relative z-10 mt-4 border-t border-white/10 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-on-dark/70">
          {t("amountLabel")}
        </p>
        {stats.isLoading ? (
          <div className="mt-1 h-7 w-40 animate-pulse rounded bg-white/10" />
        ) : (
          <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-text-on-dark">
            {formatFcfa(stats.amountTotal)}
          </p>
        )}
        <p className="mt-0.5 text-xs text-text-on-dark/60">{t("amountSublabel")}</p>
      </div>
    </div>
  );
}
