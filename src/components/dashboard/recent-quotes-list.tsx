"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { liveQuery } from "dexie";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/shared/status-badge";
import type { QuoteStatus } from "@/components/shared/status-badge";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";
import { formatFcfa } from "@/lib/money";
import { cn } from "@/lib/utils";

function useRecentQuotes() {
  const [quotes, setQuotes] = useState<QuoteLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const all = await db.quotes.toArray();
      all.sort((a, b) => {
        const da = a.dateDevis ?? a.createdAt;
        const db2 = b.dateDevis ?? b.createdAt;
        return da > db2 ? -1 : da < db2 ? 1 : 0;
      });
      return all.slice(0, 10);
    }).subscribe({
      next: (result) => {
        setQuotes(result);
        setIsLoading(false);
      },
      error: () => setIsLoading(false),
    });

    return () => subscription.unsubscribe();
  }, []);

  return { quotes, isLoading };
}

function getClientName(quote: QuoteLocal): string {
  if (!quote.clientSnapshot) return "Client inconnu";
  const snapshot = quote.clientSnapshot as { companyName?: string };
  return snapshot.companyName ?? "Client inconnu";
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function RecentQuotesList() {
  const { quotes, isLoading } = useRecentQuotes();
  const t = useTranslations("dashboard.recentQuotes");

  return (
    <section aria-label={t("sectionLabel")}>
      {/* En-tête section */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold text-text-primary">
          {t("heading")}
        </h2>
        <Link
          href="/devis"
          className="text-xs font-medium text-brand-navy hover:underline"
          aria-label={t("viewAllAriaLabel")}
        >
          {t("viewAll")}
        </Link>
      </div>

      {/* État de chargement */}
      {isLoading && (
        <div className="space-y-2" aria-label={t("loading")} role="status">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-alt" />
          ))}
        </div>
      )}

      {/* État vide */}
      {!isLoading && quotes.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-text-muted">{t("empty")}</p>
          <Link
            href="/devis/nouveau"
            className="mt-3 inline-flex h-9 items-center rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep"
          >
            {t("createFirst")}
          </Link>
        </div>
      )}

      {/* Liste des devis */}
      {!isLoading && quotes.length > 0 && (
        <ul className="space-y-2" role="list">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/devis/${quote.id}`}
                className={cn(
                  "flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3",
                  "transition-colors hover:bg-surface-alt",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                )}
                aria-label={t("quoteAriaLabel", {
                  number: quote.number,
                  client: getClientName(quote),
                })}
              >
                {/* Colonne gauche : numéro + client + date (mobile) */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-sm font-semibold tabular-nums text-text-primary">
                    {quote.number}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {getClientName(quote)}
                  </p>
                  {/* Date visible sur mobile (AC1) — masquée sm+ où elle passe en colonne centre */}
                  <p className="text-xs tabular-nums text-text-muted sm:hidden">
                    {formatDate(quote.dateDevis ?? quote.createdAt)}
                  </p>
                </div>

                {/* Colonne centre : date (sm+) */}
                <p className="hidden text-xs tabular-nums text-text-muted sm:block">
                  {formatDate(quote.dateDevis ?? quote.createdAt)}
                </p>

                {/* Colonne droite : badge statut + montant */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={quote.status as QuoteStatus} />
                  <p className="font-serif text-xs font-semibold tabular-nums text-text-primary">
                    {quote.status === "draft" && quote.totalFcfa === 0
                      ? "—"
                      : formatFcfa(quote.totalFcfa)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
