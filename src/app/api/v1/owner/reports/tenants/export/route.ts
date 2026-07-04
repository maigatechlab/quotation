import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { fetchTenantsSnapshot, isValidDateParam } from "@/lib/owner/reports";
import { buildTenantsSnapshotCsv } from "@/lib/owner/reports-csv";
import { requireOwnerSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return guard.code === "UNAUTHORIZED"
      ? apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED)
      : apiError("FORBIDDEN", "Réservé au superadmin.", HTTP_STATUS.FORBIDDEN);
  }

  const { searchParams } = new URL(req.url);
  const rawDate = searchParams.get("date");
  const today = new Date().toISOString().slice(0, 10);
  // MVP: the reference date is a label + filename only — no AS-OF filtering
  // (cf. story 7-11 AC6). Invalid/missing values fall back to today.
  const referenceDate = rawDate && isValidDateParam(rawDate) ? rawDate : today;

  const { rows } = await fetchTenantsSnapshot(1, 10_000);
  const csv = buildTenantsSnapshotCsv(rows);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tenants-snapshot-${referenceDate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
