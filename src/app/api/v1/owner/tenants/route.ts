import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { fetchTenantsPage, parseTenantFilters } from "@/lib/owner/tenant-filters";
import { requireOwnerSession } from "@/lib/session";
import { createTenantWithAdmin, TenantConflictError } from "@/lib/tenants/create-tenant";
import { createTenantSchema } from "@/lib/validation/tenant";

export async function GET(req: Request) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { searchParams } = new URL(req.url);
  const filters = parseTenantFilters(Object.fromEntries(searchParams));
  const data = await fetchTenantsPage(filters);
  return Response.json(data, { status: HTTP_STATUS.OK });
}

export async function POST(req: Request) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (msgs?.[0]) fields[key] = msgs[0];
    }
    return apiError(
      "VALIDATION_FAILED",
      "Validation échouée.",
      HTTP_STATUS.BAD_REQUEST,
      fields
    );
  }

  const actor = guard.session.user as Record<string, unknown>;

  try {
    const result = await createTenantWithAdmin({
      input: parsed.data,
      actorId: actor["id"] as string,
      actorEmail: actor["email"] as string,
    });
    return Response.json(result, { status: HTTP_STATUS.CREATED });
  } catch (err) {
    if (err instanceof TenantConflictError) {
      const message =
        err.field === "slug"
          ? "Ce sous-domaine est déjà utilisé"
          : "Un utilisateur avec cet email existe déjà";
      return apiError("CONFLICT", message, HTTP_STATUS.CONFLICT, {
        [err.field]: message,
      });
    }
    // Never log the request body (it may contain manualPassword).
    console.error("Tenant creation failed", err instanceof Error ? err.message : err);
    return apiError(
      "INTERNAL_ERROR",
      "Une erreur est survenue. Le tenant n'a pas été créé.",
      HTTP_STATUS.INTERNAL
    );
  }
}
