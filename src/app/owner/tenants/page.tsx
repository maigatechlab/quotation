import Link from "next/link";
import { TenantsExportButton } from "@/components/owner/tenants-export-button";
import { TenantsFilters } from "@/components/owner/tenants-filters";
import { TenantsTable } from "@/components/owner/tenants-table";
import { fetchTenantsPage, parseTenantFilters } from "@/lib/owner/tenant-filters";

// Prevent stale searchParams with PPR in Next.js 16
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TenantsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseTenantFilters(sp);
  const { rows, totalPages, total } = await fetchTenantsPage(filters);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            OWNER CONSOLE
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">Tenants</h1>
        </div>
        <Link
          href="/owner/tenants/new"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep transition-colors"
        >
          + Nouveau tenant
        </Link>
      </div>

      <TenantsFilters current={filters} />
      <TenantsTable rows={rows} filters={filters} totalPages={totalPages} total={total} />
      <TenantsExportButton filters={filters} />
    </div>
  );
}
