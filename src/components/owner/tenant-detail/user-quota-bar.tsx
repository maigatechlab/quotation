import { cn } from "@/lib/utils";

export interface UserQuota {
  active: number;
  max: number;
  pct: number;
  tone: "ok" | "warn" | "full" | "exceeded";
}

const TONE_BAR: Record<UserQuota["tone"], string> = {
  ok: "bg-status-accepte-bg",
  warn: "bg-status-valide-bg",
  full: "bg-status-annule-bg",
  exceeded: "bg-status-annule-bg",
};

export function UserQuotaBar({ quota, label }: { quota: UserQuota; label: string }) {
  const widthPct = Math.min(100, quota.pct);

  return (
    <div className="space-y-1">
      <p className="font-serif text-xl font-semibold tabular-nums text-text-primary">{label}</p>
      <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-alt">
        <div
          className={cn("h-full rounded-full transition-all", TONE_BAR[quota.tone])}
          style={{ width: `${widthPct}%` }}
          aria-label={`${quota.pct}%`}
        />
      </div>
    </div>
  );
}
