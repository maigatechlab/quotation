"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TenantFilters } from "@/lib/owner/tenant-filters";

const ALL_VALUE = "__all__";

interface Props {
  current: TenantFilters;
}

export function TenantsFilters({ current }: Props) {
  const router = useRouter();

  const apply = (key: string, value: string | undefined) => {
    const p = new URLSearchParams();
    const next = { ...current, [key]: value, page: 1 };
    if (next.status) p.set("status", next.status);
    if (next.plan) p.set("plan", next.plan);
    if (next.expiry) p.set("expiry", next.expiry);
    if (next.paymentMethod) p.set("paymentMethod", next.paymentMethod);
    if (next.createdAfter) p.set("createdAfter", next.createdAfter);
    if (next.createdBefore) p.set("createdBefore", next.createdBefore);
    if (next.q) p.set("q", next.q);
    router.push(`/owner/tenants?${p.toString()}`);
  };

  const reset = () => router.push("/owner/tenants");

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-status">
          Statut
        </label>
        <Select
          value={current.status ?? ALL_VALUE}
          onValueChange={(v) => apply("status", v === ALL_VALUE ? undefined : v)}
        >
          <SelectTrigger id="filter-status" className="min-h-[44px] w-36">
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Tous</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="suspended">Suspendu</SelectItem>
            <SelectItem value="cancelled">Annulé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-plan">
          Plan
        </label>
        <Select
          value={current.plan ?? ALL_VALUE}
          onValueChange={(v) => apply("plan", v === ALL_VALUE ? undefined : v)}
        >
          <SelectTrigger id="filter-plan" className="min-h-[44px] w-32">
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Tous</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-expiry">
          Expiration
        </label>
        <Select
          value={current.expiry ?? ALL_VALUE}
          onValueChange={(v) => apply("expiry", v === ALL_VALUE ? undefined : v)}
        >
          <SelectTrigger id="filter-expiry" className="min-h-[44px] w-44">
            <SelectValue placeholder="Toutes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Toutes</SelectItem>
            <SelectItem value="expiring-7d">Expire dans 7 jours</SelectItem>
            <SelectItem value="in-grace">En période de grâce</SelectItem>
            <SelectItem value="overdue-30d">Retard {">"} 30 jours</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-method">
          Méthode paiement
        </label>
        <Select
          value={current.paymentMethod ?? ALL_VALUE}
          onValueChange={(v) => apply("paymentMethod", v === ALL_VALUE ? undefined : v)}
        >
          <SelectTrigger id="filter-method" className="min-h-[44px] w-36">
            <SelectValue placeholder="Toutes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Toutes</SelectItem>
            <SelectItem value="nitta">Nitta</SelectItem>
            <SelectItem value="wave">Wave</SelectItem>
            <SelectItem value="amana">Amana</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="virement">Virement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-after">
          Créé après
        </label>
        <input
          id="filter-after"
          type="date"
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
          value={current.createdAfter ?? ""}
          onChange={(e) => apply("createdAfter", e.target.value || undefined)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-text-muted" htmlFor="filter-before">
          Créé avant
        </label>
        <input
          id="filter-before"
          type="date"
          className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
          value={current.createdBefore ?? ""}
          onChange={(e) => apply("createdBefore", e.target.value || undefined)}
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
