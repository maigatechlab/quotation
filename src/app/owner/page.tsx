import { OwnerAlerts } from "@/components/owner/owner-alerts";
import { OwnerHealthCard } from "@/components/owner/owner-health-card";
import { OwnerMetricsCards } from "@/components/owner/owner-metrics-cards";
import { OwnerRecentActivity } from "@/components/owner/owner-recent-activity";
import {
  computeOwnerMetrics,
  computeRevenue,
  getCriticalAlerts,
  getHealthRatio,
  getRecentActivity,
} from "@/lib/owner/metrics";

export default async function OwnerDashboardPage() {
  const [metrics, revenue, alerts, activity, health] = await Promise.all([
    computeOwnerMetrics(),
    computeRevenue(),
    getCriticalAlerts(),
    getRecentActivity(10),
    getHealthRatio(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          OWNER CONSOLE
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
          Vue d&apos;ensemble
        </h1>
      </div>

      <OwnerMetricsCards metrics={metrics} revenue={revenue} />
      <OwnerAlerts alerts={alerts} />

      <div className="grid gap-6 md:grid-cols-2">
        <OwnerRecentActivity events={activity} />
        <OwnerHealthCard health={health} />
      </div>
    </div>
  );
}
