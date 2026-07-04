import Link from "next/link";
import { formatDaysRemaining } from "@/lib/owner/format";
import type { getCriticalAlerts } from "@/lib/owner/metrics";
import { cn } from "@/lib/utils";

type Alerts = Awaited<ReturnType<typeof getCriticalAlerts>>;
type Tenant = Alerts["expiringSoon"][number];

function AlertRow({ tenant }: { tenant: Tenant }) {
  const { label, tone } = formatDaysRemaining(tenant.subscriptionEnd);
  const badgeClass = cn(
    "ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold",
    tone === "danger" || tone === "expired"
      ? "bg-status-annule-bg text-status-annule-text"
      : "bg-status-envoye-bg text-status-envoye-text",
  );

  return (
    <Link
      href={`/owner/tenants?focus=${tenant.id}`}
      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-alt transition-colors"
    >
      <div>
        <span className="text-sm font-medium text-text-primary">{tenant.name}</span>
        <span className="ml-2 text-xs text-text-muted">{tenant.slug}</span>
      </div>
      {label && <span className={badgeClass}>{label}</span>}
    </Link>
  );
}

function AlertSection({
  title,
  tenants,
  badgeTone,
}: {
  title: string;
  tenants: Tenant[];
  badgeTone: "danger" | "warn";
}) {
  if (tenants.length === 0) return null;
  const sectionBadge = cn(
    "ml-2 rounded-full px-1.5 py-0.5 text-xs font-semibold",
    badgeTone === "danger"
      ? "bg-status-annule-bg text-status-annule-text"
      : "bg-status-envoye-bg text-status-envoye-text",
  );

  return (
    <div>
      <h3 className="flex items-center text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
        <span className={sectionBadge}>{tenants.length}</span>
      </h3>
      <div className="mt-1 space-y-0.5">
        {tenants.map((t) => (
          <AlertRow key={t.id} tenant={t} />
        ))}
      </div>
    </div>
  );
}

export function OwnerAlerts({ alerts }: { alerts: Alerts }) {
  const total = alerts.expiringSoon.length + alerts.inGrace.length + alerts.overdue.length;

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Alertes critiques
        </p>
        {total > 0 && (
          <span className="rounded-full bg-status-annule-bg px-2 py-0.5 text-xs font-semibold text-status-annule-text">
            {total} alerte{total > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Aucune alerte critique</p>
      ) : (
        <div className="mt-3 space-y-4">
          <AlertSection
            title="Expire dans ≤ 7 jours"
            tenants={alerts.expiringSoon}
            badgeTone="danger"
          />
          <AlertSection
            title="En période de grâce"
            tenants={alerts.inGrace}
            badgeTone="warn"
          />
          <AlertSection
            title="Retard > 30 jours"
            tenants={alerts.overdue}
            badgeTone="danger"
          />
        </div>
      )}
    </div>
  );
}
