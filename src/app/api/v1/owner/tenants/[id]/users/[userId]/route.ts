import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { db } from "@/lib/db";
import { tenants } from "@/lib/schema";
import { requireOwnerSession } from "@/lib/session";
import { deleteUserInTenant, LastAdminError, TenantUserNotFoundError } from "@/lib/tenants/tenant-users";
import { userIdParamSchema } from "@/lib/validation/tenant-user";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; userId: string }> }
) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { id, userId } = await ctx.params;
  const parsed = userIdParamSchema.safeParse({ id, userId });
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "Identifiants invalides.", HTTP_STATUS.BAD_REQUEST);
  }

  const [tenant] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, id));
  if (!tenant) {
    return apiError("NOT_FOUND", "Tenant introuvable.", HTTP_STATUS.NOT_FOUND);
  }

  const actorId = guard.session.user.id;
  const actorEmail = guard.session.user.email;

  try {
    const result = await deleteUserInTenant({ tenantId: id, userId, actorId, actorEmail });
    return NextResponse.json(result, { status: HTTP_STATUS.OK });
  } catch (err) {
    if (err instanceof TenantUserNotFoundError) {
      return apiError("NOT_FOUND", err.message, HTTP_STATUS.NOT_FOUND);
    }
    if (err instanceof LastAdminError) {
      return apiError("FORBIDDEN", err.message, HTTP_STATUS.UNPROCESSABLE);
    }
    console.error(
      "DELETE /api/v1/owner/tenants/[id]/users/[userId] error:",
      err instanceof Error ? err.message : "unknown"
    );
    return apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL);
  }
}
