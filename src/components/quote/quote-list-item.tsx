"use client";

import type { QuoteLocal } from "@/lib/local-db";
import { StatusBadge } from "./status-badge";

interface QuoteListItemProps {
  quote: QuoteLocal;
  onClick: () => void;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function QuoteListItem({ quote, onClick }: QuoteListItemProps) {
  const clientName =
    typeof (quote.clientSnapshot as Record<string, unknown>)?.companyName === "string"
      ? ((quote.clientSnapshot as Record<string, unknown>).companyName as string)
      : "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border bg-surface p-4 text-left hover:bg-surface-alt active:scale-[0.99] transition-transform min-h-[44px]"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-serif text-sm font-semibold tabular-nums text-text-primary">
          {quote.number}
        </span>
        <span className="text-sm text-text-secondary truncate">{clientName}</span>
        <span className="text-xs text-text-muted">{formatDate(quote.dateDevis ?? quote.createdAt)}</span>
      </div>
      <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
        <StatusBadge status={quote.status} />
        <span className="font-serif text-sm font-semibold tabular-nums text-text-primary">
          {formatAmount(quote.totalFcfa)} FCFA
        </span>
      </div>
    </button>
  );
}
