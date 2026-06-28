"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLiveQuotes } from "@/hooks/use-live-quotes";
import type { QuoteLocal } from "@/lib/local-db";
import { QuoteListItem } from "./quote-list-item";

type StatusFilter = QuoteLocal["status"] | "all";
type PeriodFilter = 7 | 30 | 90 | "all";

const PAGE_SIZE = 25;

interface QuoteListProps {
  userId: string;
}

export function QuoteList({ userId }: QuoteListProps) {
  const router = useRouter();
  const t = useTranslations("devis.list");
  const tStatus = useTranslations("devis.status");

  const { quotes } = useLiveQuotes(userId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [page, setPage] = useState(1);

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "draft", label: tStatus("draft") },
    { value: "validated", label: tStatus("validated") },
    { value: "sent", label: tStatus("sent") },
    { value: "accepted", label: tStatus("accepted") },
    { value: "expired", label: tStatus("expired") },
    { value: "cancelled", label: tStatus("cancelled") },
  ];

  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: 7, label: t("period7") },
    { value: 30, label: t("period30") },
    { value: 90, label: t("period90") },
    { value: "all", label: t("periodAll") },
  ];

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    // Capture current time outside of the filter closure to keep the memo stable.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const periodMs =
      periodFilter === "all" ? null : periodFilter * 24 * 60 * 60 * 1000;

    return quotes.filter((q) => {
      if (term) {
        const clientName =
          (q.clientSnapshot as Record<string, unknown>)?.companyName ?? "";
        const inNumber = q.number.toLowerCase().includes(term);
        const inClient = String(clientName).toLowerCase().includes(term);
        const inRef = (q.reference ?? "").toLowerCase().includes(term);
        const inObjet = (q.objet ?? "").toLowerCase().includes(term);
        if (!inNumber && !inClient && !inRef && !inObjet) return false;
      }
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (periodMs) {
        const quoteDate = q.dateDevis ?? q.createdAt;
        const quoteTime = new Date(quoteDate).getTime();
        if (!Number.isFinite(quoteTime) || now - quoteTime > periodMs) return false;
      }
      return true;
    });
  }, [quotes, search, statusFilter, periodFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "all" || periodFilter !== "all";

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatusFilter(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  function updatePeriodFilter(value: PeriodFilter) {
    setPeriodFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setPeriodFilter("all");
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
        />
        {search && (
          <button
            type="button"
            onClick={() => updateSearch("")}
            aria-label="Effacer la recherche"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Status chips */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        role="group"
        aria-label="Filtrer par statut"
      >
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={statusFilter === opt.value}
            onClick={() => updateStatusFilter(opt.value)}
            className={`h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? "bg-brand-navy text-text-on-dark"
                : "bg-surface-alt text-text-secondary hover:bg-border"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Period chips */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        role="group"
        aria-label="Filtrer par période"
      >
        {periodOptions.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={periodFilter === opt.value}
            onClick={() => updatePeriodFilter(opt.value)}
            className={`h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors ${
              periodFilter === opt.value
                ? "bg-brand-navy text-text-on-dark"
                : "bg-surface-alt text-text-secondary hover:bg-border"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          {hasActiveFilters ? (
            <>
              <p className="text-sm text-text-secondary">{t("emptyFiltered")}</p>
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-alt"
              >
                {t("clearFilters")}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">{t("empty")}</p>
              <button
                type="button"
                onClick={() => router.push("/devis/nouveau")}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                {t("createFirst")}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Count */}
          <p className="text-xs text-text-muted">
            {t("paginationCount", { count: filtered.length })}
            <span>
              {" · "}
              {t("pagination", { page: safePage, total: totalPages })}
            </span>
          </p>

          {/* List */}
          <div className="flex flex-col gap-3">
            {paginated.map((quote) => (
              <QuoteListItem
                key={quote.id}
                quote={quote}
                onClick={() => router.push(`/devis/${quote.id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                aria-label={t("prevPage")}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-alt disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                {t("prevPage")}
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                aria-label={t("nextPage")}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-primary hover:bg-surface-alt disabled:opacity-40"
              >
                {t("nextPage")}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* FAB - amber, fixed above bottom nav (UX-DR13) */}
      <button
        type="button"
        onClick={() => router.push("/devis/nouveau")}
        aria-label="Créer un nouveau devis"
        className="fixed bottom-24 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand-amber text-white shadow-lg transition-transform hover:bg-brand-amber/90 active:scale-95"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}