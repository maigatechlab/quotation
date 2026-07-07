import Link from "next/link";
import { formatFcfa } from "@/lib/money";
import { formatDateFr } from "@/lib/owner/format";
import type { PaymentFilters, PaymentRow } from "@/lib/owner/payments";
import { cn } from "@/lib/utils";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  nitta: "Nitta",
  wave: "Wave",
  amana: "Amana",
  stripe: "Stripe",
  cash: "Cash",
  virement: "Virement",
};

const CYCLE_LABELS: Record<string, string> = {
  monthly: "Mensuel",
  annual: "Annuel",
};

interface Props {
  rows: PaymentRow[];
  filters: PaymentFilters;
  totalPages: number;
  total: number;
  totalAmount: number;
}

export function PaymentsTable({ rows, filters, totalPages, total, totalAmount }: Props) {
  const { page } = filters;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">
        {total} paiement{total !== 1 ? "s" : ""} · Total {formatFcfa(totalAmount)}
      </p>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Tenant</th>
              <th className="px-4 py-3 text-right font-semibold text-text-muted">Montant</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Méthode</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Cycle</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Période couverte</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Référence</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-text-muted">
                  Aucun paiement
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 text-text-secondary">{formatDateFr(r.paidAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/owner/tenants/${r.tenantId}`}
                      className="font-medium text-text-primary hover:underline"
                    >
                      {r.tenantName ?? "—"}
                    </Link>
                    <div className="text-xs text-text-muted">{r.tenantSlug ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text-primary">
                    {formatFcfa(r.amount)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {PAYMENT_METHOD_LABELS[r.method] ?? r.method}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {CYCLE_LABELS[r.billingCycle] ?? r.billingCycle}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {formatDateFr(r.periodStart)} → {formatDateFr(r.periodEnd)}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">{r.reference ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between">
          <Link
            href={`/owner/payments?${buildPageParams(filters, page - 1)}`}
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
            href={`/owner/payments?${buildPageParams(filters, page + 1)}`}
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

function buildPageParams(filters: PaymentFilters, newPage: number): string {
  const p = new URLSearchParams();
  if (filters.method) p.set("method", filters.method);
  if (filters.cycle) p.set("cycle", filters.cycle);
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  if (filters.q) p.set("q", filters.q);
  p.set("page", String(newPage));
  return p.toString();
}
