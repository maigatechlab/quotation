import { NextResponse } from "next/server";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { requireOwnerSession } from "@/lib/session";
import { applyTenantUpdate, TenantNotFoundError } from "@/lib/tenants/update-tenant";
import { updateTenantSchema } from "@/lib/validation/tenant-update";
import { isValidUuid } from "@/lib/validation/uuid";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return apiError("NOT_FOUND", "Tenant introuvable.", HTTP_STATUS.NOT_FOUND);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = updateTenantSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "_";
      if (!fields[path]) fields[path] = issue.message;
    }
    return apiError("VALIDATION_FAILED", "Validation échouée.", HTTP_STATUS.BAD_REQUEST, fields);
  }

  const actor = guard.session.user as Record<string, unknown>;

  try {
    const result = await applyTenantUpdate({
      tenantId: id,
      input: parsed.data,
      actorId: actor["id"] as string,
      actorEmail: actor["email"] as string,
    });
    return NextResponse.json(result, { status: HTTP_STATUS.OK });
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      return apiError("NOT_FOUND", "Tenant introuvable.", HTTP_STATUS.NOT_FOUND);
    }
    console.error(
      "PATCH /api/v1/owner/tenants/[id] error:",
      err instanceof Error ? err.message : "unknown"
    );
    return apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL);
  }
}
