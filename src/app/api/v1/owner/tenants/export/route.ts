import { apiError } from "@/lib/api/envelope";
import { buildTenantsCsv } from "@/lib/owner/csv";
import { fetchTenantsPage, parseTenantFilters } from "@/lib/owner/tenant-filters";
import { requireOwnerSession } from "@/lib/session";

const EXPORT_MAX = 10_000;

export async function GET(req: Request) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { searchParams } = new URL(req.url);
  const filters = parseTenantFilters(Object.fromEntries(searchParams));
  const { rows } = await fetchTenantsPage(filters, EXPORT_MAX);
  const csv = buildTenantsCsv(rows);
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tenants-${today}.csv"`,
    },
  });
}
