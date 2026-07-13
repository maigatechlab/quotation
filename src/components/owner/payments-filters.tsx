"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PaymentFilters } from "@/lib/owner/payments";

const ALL_VALUE = "__all__";

interface Props {
  current: PaymentFilters;
}

export function PaymentsFilters({ current }: Props) {
  const router = useRouter();

  const apply = (key: string, value: string | undefined) => {
    const p = new URLSearchParams();
    const next = { ...current, [key]: value, page: 1 };
    if (next.method) p.set("method", next.method);
    if (next.cycle) p.set("cycle", next.cycle);
    if (next.from) p.set("from", next.from);
    if (next.to) p.set("to", next.to);
    if (next.q) p.set("q", next.q);
    router.push(`/owner/payments?${p.toString()}`);
  };

  const reset = () => router.push("/owner/payments");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-tenant">
          Tenant
        </label>
        <input
          id="filter-tenant"
          type="search"
          placeholder="Nom ou slug"
          defaultValue={current.q ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply("q", e.currentTarget.value || undefined);
          }}
          onBlur={(e) => {
            if ((e.target.value || undefined) !== current.q) {
              apply("q", e.target.value || undefined);
            }
          }}
          className="min-h-[44px] w-44 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-method">
          Méthode
        </label>
        <Select
          value={current.method ?? ALL_VALUE}
          onValueChange={(v) => apply("method", v === ALL_VALUE ? undefined : v)}
        >
          <SelectTrigger id="filter-method" className="min-h-[44px] w-36">
            <SelectValue placeholder="Toutes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Toutes</SelectItem>
            <SelectItem value="nitta">Nitta</SelectItem>
            <SelectItem value="wave">Wave</SelectItem>
            <SelectItem value="amana">Amana</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="virement">Virement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-cycle">
          Cycle
        </label>
        <Select
          value={current.cycle ?? ALL_VALUE}
          onValueChange={(v) => apply("cycle", v === ALL_VALUE ? undefined : v)}
        >
          <SelectTrigger id="filter-cycle" className="min-h-[44px] w-32">
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Tous</SelectItem>
            <SelectItem value="monthly">Mensuel</SelectItem>
            <SelectItem value="annual">Annuel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-from">
          Payé après
        </label>
        <input
          id="filter-from"
          type="date"
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
          value={current.from ?? ""}
          onChange={(e) => apply("from", e.target.value || undefined)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-to">
          Payé avant
        </label>
        <input
          id="filter-to"
          type="date"
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
          value={current.to ?? ""}
          onChange={(e) => apply("to", e.target.value || undefined)}
        />
      </div>

      <button
        onClick={reset}
        className="min-h-[44px] rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-alt transition-colors"
      >
        Réinitialiser
      </button>
    </div>
  );
}
