import { cn } from "@/lib/utils";

interface Props {
  health: { active: number; total: number; pct: number };
}

export function OwnerHealthCard({ health }: Props) {
  const barColor =
    health.pct >= 80
      ? "bg-status-accepte-bg"
      : health.pct >= 50
        ? "bg-status-envoye-bg"
        : "bg-status-annule-bg";

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Santé plateforme
      </p>

      <p className="mt-3 font-serif text-2xl font-semibold tabular-nums text-text-primary">
        {health.active} / {health.total}
        <span className="ml-2 text-base font-normal text-text-muted">actifs</span>
      </p>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-alt">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${health.pct}%` }}
          aria-label={`${health.pct}% actifs`}
        />
      </div>

      <p
        className={cn(
          "mt-1 text-right text-xs font-semibold",
          health.pct >= 80
            ? "text-status-accepte-text"
            : health.pct >= 50
              ? "text-status-envoye-text"
              : "text-status-annule-text",
        )}
      >
        {health.pct} %
      </p>
    </div>
  );
}
