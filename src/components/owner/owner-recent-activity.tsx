import {
  ArrowUpDown,
  Ban,
  Banknote,
  Bell,
  CheckCircle,
  Plus,
  RefreshCw,
  UserPlus,
  XCircle,
} from "lucide-react";
import { formatRelativeDate } from "@/lib/owner/format";
import type { RecentActivityRow } from "@/lib/owner/metrics";

const EVENT_CONFIG: Record<string, { icon: React.ElementType; label: string }> = {
  created: { icon: Plus, label: "Tenant créé" },
  activated: { icon: CheckCircle, label: "Activé" },
  suspended: { icon: Ban, label: "Suspendu" },
  reactivated: { icon: RefreshCw, label: "Réactivé" },
  cancelled: { icon: XCircle, label: "Annulé" },
  payment_recorded: { icon: Banknote, label: "Paiement enregistré" },
  plan_changed: { icon: ArrowUpDown, label: "Plan modifié" },
  user_added: { icon: UserPlus, label: "Utilisateur ajouté" },
  reminder_sent: { icon: Bell, label: "Rappel envoyé" },
};

export function OwnerRecentActivity({ events }: { events: RecentActivityRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Activité récente
      </p>

      {events.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Aucune activité</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {events.map((ev, i) => {
            const config = EVENT_CONFIG[ev.eventType] ?? {
              icon: Plus,
              label: ev.eventType,
            };
            const Icon = config.icon;

            return (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt">
                  <Icon className="h-3 w-3 text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">
                    {config.label}
                    {ev.tenantName && (
                      <span className="ml-1 text-text-secondary">— {ev.tenantName}</span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatRelativeDate(new Date(ev.createdAt))}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
