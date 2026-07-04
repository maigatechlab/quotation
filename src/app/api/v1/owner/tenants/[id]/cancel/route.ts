import { NextResponse } from "next/server";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { requireOwnerSession } from "@/lib/session";
import {
  applyCancellation,
  CancelConfirmationError,
} from "@/lib/tenants/cancel";
import {
  TenantNotFoundError,
  TenantStateConflictError,
} from "@/lib/tenants/suspend";
import { cancelSchema } from "@/lib/validation/tenant-lifecycle";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (msgs?.[0]) fields[key] = msgs[0];
    }
    return apiError("VALIDATION_FAILED", "Validation échouée.", HTTP_STATUS.BAD_REQUEST, fields);
  }

  const actor = guard.session.user as Record<string, unknown>;

  try {
    const result = await applyCancellation({
      tenantId: id,
      input: parsed.data,
      actorId: actor["id"] as string,
      actorEmail: actor["email"] as string,
    });
    return NextResponse.json(result, { status: HTTP_STATUS.OK });
  } catch (err) {
    if (err instanceof CancelConfirmationError) {
      return apiError(
        "VALIDATION_FAILED",
        err.message,
        HTTP_STATUS.BAD_REQUEST,
        { confirmSlug: err.message }
      );
    }
    if (err instanceof TenantNotFoundError) {
      return apiError("NOT_FOUND", "Tenant introuvable.", HTTP_STATUS.NOT_FOUND);
    }
    if (err instanceof TenantStateConflictError) {
      return apiError("CONFLICT", err.message, HTTP_STATUS.CONFLICT);
    }
    console.error("Tenant cancellation failed", err instanceof Error ? err.message : err);
    return apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL);
  }
}
