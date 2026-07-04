import { Download } from "lucide-react";
import type { TenantFilters } from "@/lib/owner/tenant-filters";

interface Props {
  filters: TenantFilters;
}

export function TenantsExportButton({ filters }: Props) {
  const p = new URLSearchParams();
  if (filters.status) p.set("status", filters.status);
  if (filters.plan) p.set("plan", filters.plan);
  if (filters.expiry) p.set("expiry", filters.expiry);
  if (filters.paymentMethod) p.set("paymentMethod", filters.paymentMethod);
  if (filters.createdAfter) p.set("createdAfter", filters.createdAfter);
  if (filters.createdBefore) p.set("createdBefore", filters.createdBefore);
  if (filters.q) p.set("q", filters.q);

  const href = `/api/v1/owner/tenants/export?${p.toString()}`;

  return (
    <a
      href={href}
      download
      className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-alt transition-colors"
    >
      <Download className="h-4 w-4" />
      Exporter CSV
    </a>
  );
}
