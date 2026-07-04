import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { requireOwnerSession } from "@/lib/session";
import {
  checkUserQuota,
  createUserInTenant,
  getTenantUsersWithLastSeen,
  TenantConflictError,
  TenantQuotaError,
} from "@/lib/tenants/tenant-users";
import { createTenantUserSchema, tenantIdParamSchema } from "@/lib/validation/tenant-user";

async function loadTenant(id: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
  return tenant ?? null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { id } = await ctx.params;
  const parsedId = tenantIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return apiError("VALIDATION_FAILED", "Identifiant de tenant invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const tenant = await loadTenant(id);
  if (!tenant) {
    return apiError("NOT_FOUND", "Tenant introuvable.", HTTP_STATUS.NOT_FOUND);
  }

  const users = await getTenantUsersWithLastSeen(id);
  const quota = await checkUserQuota(id, tenant.maxUsers);

  return NextResponse.json({
    users,
    quota: { active: quota.active, maxUsers: quota.maxUsers },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { id } = await ctx.params;
  const parsedId = tenantIdParamSchema.safeParse({ id });
  if (!parsedId.success) {
    return apiError("VALIDATION_FAILED", "Identifiant de tenant invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const tenant = await loadTenant(id);
  if (!tenant) {
    return apiError("NOT_FOUND", "Tenant introuvable.", HTTP_STATUS.NOT_FOUND);
  }

  if (tenant.status === "cancelled" || tenant.status === "suspended") {
    return apiError(
      "TENANT_BLOCKED",
      `Impossible d'ajouter un utilisateur à un tenant ${tenant.status}.`,
      HTTP_STATUS.UNPROCESSABLE
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête JSON invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = createTenantUserSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path) fields[path] = issue.message;
    }
    return apiError("VALIDATION_FAILED", "Données invalides.", HTTP_STATUS.BAD_REQUEST, fields);
  }

  const actorId = guard.session.user.id;
  const actorEmail = guard.session.user.email;

  try {
    const result = await createUserInTenant({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      input: parsed.data,
      actorId,
      actorEmail,
    });
    return NextResponse.json(result, { status: HTTP_STATUS.CREATED });
  } catch (err) {
    if (err instanceof TenantQuotaError) {
      return apiError("QUOTA_EXCEEDED", err.message, HTTP_STATUS.UNPROCESSABLE);
    }
    if (err instanceof TenantConflictError) {
      return apiError("CONFLICT", "Un utilisateur avec cet email existe déjà.", HTTP_STATUS.CONFLICT, {
        email: "Un utilisateur avec cet email existe déjà",
      });
    }
    console.error(
      "POST /api/v1/owner/tenants/[id]/users error:",
      err instanceof Error ? err.message : "unknown"
    );
    return apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL);
  }
}
