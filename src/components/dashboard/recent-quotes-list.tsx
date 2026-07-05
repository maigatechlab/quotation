"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { liveQuery } from "dexie";
import { ChevronRight } from "lucide-react";
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
  const router = useRouter();
  const { quotes, isLoading } = useRecentQuotes();
  const t = useTranslations("dashboard.recentQuotes");

  function formatDateShort(dateStr: string | undefined): string {
    if (!dateStr) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(dateStr));
  }

  return (
    <section aria-label={t("sectionLabel")}>
      {/* En-tête section */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-serif text-lg font-semibold text-text-primary lg:text-[19px]">
          {t("heading")}
        </h2>
        <Link
          href="/devis"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy hover:underline lg:text-[13px] lg:font-semibold"
          aria-label={t("viewAllAriaLabel")}
        >
          {t("viewAll")}
          <ChevronRight className="hidden h-3.5 w-3.5 lg:block" aria-hidden="true" />
        </Link>
      </div>

      {/* État de chargement — skeleton aligné sur la géométrie (cards mobile / table desktop) */}
      {isLoading && (
        <div className="space-y-2" aria-label={t("loading")} role="status">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-surface-alt lg:h-12 lg:rounded-lg"
            />
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

      {/* Table compacte desktop — 5 lignes max, sans filtres (design brief §1) */}
      {!isLoading && quotes.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="h-[38px] border-b border-border bg-surface-alt text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <th scope="col" className="w-40 pl-5 font-semibold">
                  Numéro
                </th>
                <th scope="col" className="font-semibold">
                  Client
                </th>
                <th scope="col" className="w-[170px] pr-4 text-right font-semibold">
                  Montant
                </th>
                <th scope="col" className="w-[130px] font-semibold">
                  Statut
                </th>
                <th scope="col" className="w-[110px] pr-5 font-semibold">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {quotes.slice(0, 5).map((quote) => (
                <tr
                  key={quote.id}
                  onClick={() => router.push(`/devis/${quote.id}`)}
                  className="h-12 cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-alt"
                >
                  <td className="pl-5 font-serif text-[14.5px] font-semibold tabular-nums">
                    {quote.number}
                  </td>
                  <td className="max-w-0 truncate pr-3 font-medium">
                    {getClientName(quote)}
                  </td>
                  <td className="pr-4 text-right font-serif text-[14.5px] font-semibold tabular-nums">
                    {quote.status === "draft" && quote.totalFcfa === 0
                      ? "—"
                      : formatFcfa(quote.totalFcfa)}
                  </td>
                  <td>
                    <StatusBadge status={quote.status as QuoteStatus} />
                  </td>
                  <td className="pr-5 text-[13px] text-text-secondary">
                    {formatDateShort(quote.dateDevis ?? quote.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Liste mobile — cards empilées (hors scope, inchangé) */}
      {!isLoading && quotes.length > 0 && (
        <ul className="space-y-2 lg:hidden" role="list">
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
