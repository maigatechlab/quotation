import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { fetchPaymentsForExport, validateDateRange } from "@/lib/owner/reports";
import { buildPaymentsCsv } from "@/lib/owner/reports-csv";
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
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const validation = validateDateRange(from, to);
  if (!validation.ok) {
    const message =
      validation.error === "from-to-required"
        ? "Les dates from et to sont requises."
        : validation.error === "invalid-date"
          ? "Format de date invalide (attendu : YYYY-MM-DD)."
          : "La date de début doit précéder la date de fin.";
    return apiError("VALIDATION_FAILED", message, HTTP_STATUS.BAD_REQUEST, {
      from: "invalid",
      to: "invalid",
    });
  }

  const rows = await fetchPaymentsForExport(validation.range);
  if (rows.length >= 10_000) {
    console.warn(`[reports/payments/export] plage atteint la limite 10 000 (from=${from}, to=${to})`);
  }
  const csv = buildPaymentsCsv(rows);
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paiements-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
