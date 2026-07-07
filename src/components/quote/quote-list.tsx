"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFailedSyncIds } from "@/hooks/use-failed-sync-ids";
import { useLiveQuotes } from "@/hooks/use-live-quotes";
import { duplicateQuoteLocal } from "@/lib/duplicate-quote-local";
import type { QuoteLocal } from "@/lib/local-db";
import { cn } from "@/lib/utils";
import { QuoteListItem } from "./quote-list-item";
import { StatusBadge } from "./status-badge";

type StatusFilter = QuoteLocal["status"] | "all";
type PeriodFilter = 7 | 30 | 90 | "all";
type SortKey = "number" | "client" | "total" | "date";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

interface QuoteListProps {
  userId: string;
}

function getClientName(quote: QuoteLocal): string {
  const name = (quote.clientSnapshot as Record<string, unknown>)?.companyName;
  return typeof name === "string" ? name : "";
}

function getQuoteDate(quote: QuoteLocal): string {
  return quote.dateDevis ?? quote.createdAt;
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

function formatRoute(quote: QuoteLocal): string {
  if (!quote.originCity || !quote.destinationCity) return "—";
  return `${quote.originCity} → ${quote.destinationCity}`;
}

function SortHeader({
  label,
  sort,
  sortKey,
  sortDir,
  onToggle,
  align = "left",
}: {
  label: string;
  sort: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(sort)}
      aria-sort={
        sortKey === sort ? (sortDir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-text-primary",
        align === "right" && "justify-end",
        sortKey === sort ? "text-brand-navy" : "text-text-muted",
      )}
    >
      {label}
      {sortKey === sort &&
        (sortDir === "asc" ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        ))}
    </button>
  );
}

export function QuoteList({ userId }: QuoteListProps) {
  const router = useRouter();
  const t = useTranslations("devis.list");
  const tStatus = useTranslations("devis.status");
  const tDevis = useTranslations("devis");

  const { quotes } = useLiveQuotes(userId);
  const failedSyncIds = useFailedSyncIds();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
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
        const clientName = getClientName(q);
        const inNumber = q.number.toLowerCase().includes(term);
        const inClient = clientName.toLowerCase().includes(term);
        const inRef = (q.reference ?? "").toLowerCase().includes(term);
        const inObjet = (q.objet ?? "").toLowerCase().includes(term);
        if (!inNumber && !inClient && !inRef && !inObjet) return false;
      }
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (periodMs) {
        const quoteTime = new Date(getQuoteDate(q)).getTime();
        if (!Number.isFinite(quoteTime) || now - quoteTime > periodMs) return false;
      }
      return true;
    });
  }, [quotes, search, statusFilter, periodFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "number":
          return dir * a.number.localeCompare(b.number, "fr");
        case "client":
          return dir * getClientName(a).localeCompare(getClientName(b), "fr");
        case "total":
          return dir * (a.totalFcfa - b.totalFcfa);
        case "date":
        default:
          return (
            dir *
            (new Date(getQuoteDate(a)).getTime() -
              new Date(getQuoteDate(b)).getTime())
          );
      }
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setPeriodFilter("all");
    setPage(1);
  }

  async function handleDuplicate(quoteId: string) {
    try {
      const newQuoteId = await duplicateQuoteLocal(quoteId, userId);
      toast.success(tDevis("duplicate.successToast"));
      router.push(`/devis/${newQuoteId}`);
    } catch {
      toast.error(tDevis("duplicate.errorGeneric"));
    }
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-0">
      {/* Toolbar — stacked on mobile, single row at lg+ */}
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3.5">
        {/* Search */}
        <div className="relative lg:w-64 lg:shrink-0">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-navy/30 lg:py-2"
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
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:gap-1.5 lg:overflow-visible lg:pb-0"
          role="group"
          aria-label="Filtrer par statut"
        >
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={statusFilter === opt.value}
              onClick={() => updateStatusFilter(opt.value)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors lg:h-auto lg:border lg:py-1.5",
                statusFilter === opt.value
                  ? "bg-brand-navy text-text-on-dark lg:border-brand-navy lg:font-semibold"
                  : "bg-surface-alt text-text-secondary hover:bg-border lg:border-border lg:bg-surface lg:hover:bg-surface lg:hover:text-text-primary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Period segmented control */}
        <div
          className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:ml-auto lg:gap-0.5 lg:overflow-visible lg:rounded-lg lg:border lg:border-border lg:bg-surface lg:p-[3px] lg:pb-[3px]"
          role="group"
          aria-label="Filtrer par période"
        >
          {periodOptions.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              aria-pressed={periodFilter === opt.value}
              onClick={() => updatePeriodFilter(opt.value)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors lg:h-auto lg:rounded-md lg:py-1",
                periodFilter === opt.value
                  ? "bg-brand-navy text-text-on-dark lg:font-semibold"
                  : "bg-surface-alt text-text-secondary hover:bg-border lg:bg-transparent lg:hover:bg-transparent lg:hover:text-text-primary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center lg:mt-4 lg:rounded-2xl lg:border lg:border-border lg:bg-surface">
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
                className="inline-flex items-center gap-2 rounded-xl bg-brand-amber px-4 py-2.5 text-sm font-semibold text-white lg:bg-brand-navy lg:text-text-on-dark lg:hover:bg-brand-navy-deep"
              >
                <Plus className="h-4 w-4" />
                {t("createFirst")}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: count + stacked cards + prev/next (untouched pattern) */}
          <div className="flex flex-col gap-4 lg:hidden">
            <p className="text-xs text-text-muted">
              {t("paginationCount", { count: sorted.length })}
              <span>
                {" · "}
                {t("pagination", { page: safePage, total: totalPages })}
              </span>
            </p>
            <div className="flex flex-col gap-3">
              {paginated.map((quote) => (
                <QuoteListItem
                  key={quote.id}
                  quote={quote}
                  onClick={() => router.push(`/devis/${quote.id}`)}
                />
              ))}
            </div>
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
          </div>

          {/* Desktop: dense table */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-surface lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="h-10 border-b border-border bg-surface-alt text-left">
                  <th scope="col" className="w-[148px] pl-5 font-normal">
                    <SortHeader label={t("colNumber")} sort="number" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th scope="col" className="font-normal">
                    <SortHeader label={t("colClient")} sort="client" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th
                    scope="col"
                    className="w-[196px] text-[11px] font-semibold uppercase tracking-wider text-text-muted"
                  >
                    {t("colRoute")}
                  </th>
                  <th scope="col" className="w-[148px] pr-4 text-right font-normal">
                    <SortHeader label={t("colAmount")} sort="total" align="right" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th
                    scope="col"
                    className="w-[122px] text-[11px] font-semibold uppercase tracking-wider text-text-muted"
                  >
                    {t("colStatus")}
                  </th>
                  <th scope="col" className="w-[108px] font-normal">
                    <SortHeader label={t("colDate")} sort="date" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                  <th scope="col" className="w-12 pr-5">
                    <span className="sr-only">{t("rowActions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((quote) => (
                  <tr
                    key={quote.id}
                    onClick={() => router.push(`/devis/${quote.id}`)}
                    className="h-[52px] cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-surface-alt"
                  >
                    <td className="pl-5">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "font-serif text-[14.5px] font-semibold tabular-nums",
                            quote.number.startsWith("TEMP-")
                              ? "text-text-secondary"
                              : "text-text-primary",
                          )}
                        >
                          {quote.number}
                        </span>
                        {failedSyncIds.has(quote.id) && (
                          <span
                            title={failedSyncIds.get(quote.id)}
                            className="inline-flex cursor-help text-status-envoye-dot"
                          >
                            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">{failedSyncIds.get(quote.id)}</span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="max-w-0 truncate pr-3 font-medium">
                      {getClientName(quote) || t("noClient")}
                    </td>
                    <td className="text-text-secondary">{formatRoute(quote)}</td>
                    <td className="pr-4 text-right font-serif text-[14.5px] font-semibold tabular-nums">
                      {formatAmount(quote.totalFcfa)} FCFA
                    </td>
                    <td>
                      <StatusBadge status={quote.status} />
                    </td>
                    <td className="text-[13px] text-text-secondary">
                      {formatDate(getQuoteDate(quote))}
                    </td>
                    <td className="pr-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t("rowActions")}
                            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-border/60 hover:text-text-primary"
                          >
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onSelect={() => router.push(`/devis/${quote.id}`)}
                          >
                            {t("actionOpen")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void handleDuplicate(quote.id)}
                          >
                            {t("actionDuplicate")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer: count + numbered pagination */}
            <div className="flex items-center justify-between border-t border-border bg-surface-alt px-5 py-2.5">
              <span className="text-xs text-text-muted">
                {t("paginationCount", { count: sorted.length })}
                {" · "}
                {t("pagination", { page: safePage, total: totalPages })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  aria-label={t("prevPage")}
                  className="flex items-center rounded-md border border-border p-1.5 text-text-secondary hover:bg-surface disabled:cursor-default disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-current={p === safePage ? "page" : undefined}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      p === safePage
                        ? "border-brand-navy bg-brand-navy font-semibold text-text-on-dark"
                        : "border-border text-text-secondary hover:bg-surface",
                    )}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                  aria-label={t("nextPage")}
                  className="flex items-center rounded-md border border-border p-1.5 text-text-secondary hover:bg-surface disabled:cursor-default disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* FAB - amber, fixed above bottom nav (UX-DR13) — mobile only */}
      <button
        type="button"
        onClick={() => router.push("/devis/nouveau")}
        aria-label="Créer un nouveau devis"
        className="fixed bottom-24 right-5 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand-amber text-white shadow-lg transition-transform hover:bg-brand-amber/90 active:scale-95 lg:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
