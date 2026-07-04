import { NextResponse } from "next/server";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { requireOwnerSession } from "@/lib/session";
import { findCoveringPayments } from "@/lib/tenants/covering-payment";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { id } = await ctx.params;

  try {
    const payments = await findCoveringPayments(id);
    return NextResponse.json({ payments }, { status: HTTP_STATUS.OK });
  } catch (err) {
    console.error(
      "GET /api/v1/owner/tenants/[id]/payments/covering error:",
      err instanceof Error ? err.message : "unknown"
    );
    return apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL);
  }
}
