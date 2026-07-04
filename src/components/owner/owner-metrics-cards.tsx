import { formatFcfa } from "@/lib/money";
import type { computeOwnerMetrics, computeRevenue } from "@/lib/owner/metrics";
import { cn } from "@/lib/utils";

type Metrics = Awaited<ReturnType<typeof computeOwnerMetrics>>;
type Revenue = Awaited<ReturnType<typeof computeRevenue>>;

const STATUS_DOTS: Record<string, string> = {
  active: "bg-status-accepte-bg",
  trial: "bg-status-valide-bg",
  suspended: "bg-status-envoye-bg",
  cancelled: "bg-status-annule-bg",
};

interface Props {
  metrics: Metrics;
  revenue: Revenue;
}

export function OwnerMetricsCards({ metrics, revenue }: Props) {
  const statusCards = [
    { key: "active", label: "Actifs", value: metrics.active },
    { key: "trial", label: "En trial", value: metrics.trial },
    { key: "suspended", label: "Suspendus", value: metrics.suspended },
    { key: "cancelled", label: "Annulés", value: metrics.cancelled },
  ];

  const revenueCards = [
    { label: "MRR", value: formatFcfa(revenue.mrr) },
    { label: "ARR", value: formatFcfa(revenue.arr) },
    { label: "Encaissé ce mois", value: formatFcfa(revenue.collectedThisMonth) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {statusCards.map(({ key, label, value }) => (
          <div key={key} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOTS[key])} />
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                {label}
              </p>
            </div>
            <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-text-primary">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {revenueCards.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              {label}
            </p>
            <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-text-primary">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
