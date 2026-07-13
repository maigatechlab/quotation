import Link from "next/link";
import { formatFcfa } from "@/lib/money";
import { formatDateFr, formatDaysRemaining } from "@/lib/owner/format";
import type { TenantFilters, TenantRow } from "@/lib/owner/tenant-filters";
import { cn } from "@/lib/utils";
import { TenantActionsMenu } from "./tenant-actions-menu";
import { TenantPlanBadge } from "./tenant-plan-badge";
import { TenantStatusBadge } from "./tenant-status-badge";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  nitta: "Nitta",
  wave: "Wave",
  amana: "Amana",
  cash: "Cash",
  virement: "Virement",
};

function DaysRemainingCell({ subscriptionEnd }: { subscriptionEnd: Date | null }) {
  const { label, tone } = formatDaysRemaining(subscriptionEnd);
  if (!label) return <span className="text-text-muted text-xs">—</span>;

  const cls = cn(
    "rounded-full px-1.5 py-0.5 text-xs font-semibold",
    tone === "ok" ? "text-text-muted" :
    tone === "warn" ? "bg-status-envoye-bg text-status-envoye-text" :
    "bg-status-annule-bg text-status-annule-text",
  );
  return <span className={cls}>{label}</span>;
}


interface Props {
  rows: TenantRow[];
  filters: TenantFilters;
  totalPages: number;
  total: number;
}

export function TenantsTable({ rows, filters, totalPages, total }: Props) {
  const { page } = filters;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">{total} tenant{total !== 1 ? "s" : ""}</p>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Nom</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Plan</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Statut</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Expiration</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">
                Dernier paiement
              </th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Utilisateurs</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-text-muted"
                >
                  Aucun tenant
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">{r.name}</div>
                    <div className="text-xs text-text-muted">{r.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <TenantPlanBadge plan={r.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <TenantStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-text-secondary text-xs">
                        {r.subscriptionEnd ? formatDateFr(r.subscriptionEnd) : "—"}
                      </span>
                      <DaysRemainingCell subscriptionEnd={r.subscriptionEnd} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.lastPaymentAmount !== null ? (
                      <div>
                        <div className="font-medium text-text-primary">
                          {formatFcfa(r.lastPaymentAmount)}
                        </div>
                        <div className="text-xs text-text-muted">
                          {r.lastPaymentMethod
                            ? (PAYMENT_METHOD_LABELS[r.lastPaymentMethod] ?? r.lastPaymentMethod)
                            : ""}
                          {r.lastPaymentDate && ` · ${formatDateFr(r.lastPaymentDate)}`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-secondary">
                      {r.activeUsers} / {r.maxUsers}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TenantActionsMenu tenant={{ id: r.id, name: r.name, status: r.status }} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between">
          <Link
            href={`/owner/tenants?${buildPageParams(filters, page - 1)}`}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
              page <= 1
                ? "pointer-events-none text-text-muted opacity-40"
                : "hover:bg-surface-alt text-text-secondary",
            )}
            aria-disabled={page <= 1}
          >
            Précédent
          </Link>
          <span className="text-xs text-text-muted">
            Page {page} / {totalPages}
          </span>
          <Link
            href={`/owner/tenants?${buildPageParams(filters, page + 1)}`}
            className={cn(
              "rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors",
              page >= totalPages
                ? "pointer-events-none text-text-muted opacity-40"
                : "hover:bg-surface-alt text-text-secondary",
            )}
            aria-disabled={page >= totalPages}
          >
            Suivant
          </Link>
        </nav>
      )}
    </div>
  );
}

function buildPageParams(filters: TenantFilters, newPage: number): string {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.plan) p.set("plan", filters.plan);
  if (filters.expiry) p.set("expiry", filters.expiry);
  if (filters.paymentMethod) p.set("paymentMethod", filters.paymentMethod);
  if (filters.createdAfter) p.set("createdAfter", filters.createdAfter);
  if (filters.createdBefore) p.set("createdBefore", filters.createdBefore);
  if (filters.q) p.set("q", filters.q);
  p.set("page", String(newPage));
  return p.toString();
}
