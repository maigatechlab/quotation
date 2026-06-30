import { NextResponse } from "next/server";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { requireOwnerSession } from "@/lib/session";
import { recordPaymentSchema } from "@/lib/validation/payment";
import { recordPayment, RecordPaymentError } from "@/lib/tenants/record-payment";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès non autorisé.", guard.status);
  }

  const { id } = await ctx.params;
  const actorId = guard.session.user.id;
  const actorEmail = guard.session.user.email;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête JSON invalide.", HTTP_STATUS.BAD_REQUEST);
  }
  const parsed = recordPaymentSchema.safeParse(body);

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path) fields[path] = issue.message;
    }
    return apiError(
      "VALIDATION_FAILED",
      "Données invalides.",
      HTTP_STATUS.BAD_REQUEST,
      fields
    );
  }

  try {
    const result = await recordPayment({
      tenantId: id,
      input: parsed.data,
      actorId,
      actorEmail,
    });
    return NextResponse.json(result, { status: HTTP_STATUS.CREATED });
  } catch (err) {
    if (err instanceof RecordPaymentError) {
      if (err.code === "NOT_FOUND") {
        return apiError("NOT_FOUND", err.message, HTTP_STATUS.NOT_FOUND);
      }
      if (err.code === "CONFLICT") {
        return apiError("CONFLICT", err.message, HTTP_STATUS.CONFLICT);
      }
    }
    // eslint-disable-next-line no-console
    console.error("POST /api/v1/owner/tenants/[id]/payments error:", err instanceof Error ? err.message : "unknown");
    return apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL);
  }
}
