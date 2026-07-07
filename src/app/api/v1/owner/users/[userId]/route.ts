import { NextResponse } from "next/server";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/schema";
import { requireOwnerSession } from "@/lib/session";
import { deleteUserInTenant, LastAdminError, TenantUserNotFoundError } from "@/lib/tenants/tenant-users";

/**
 * Global account deletion (owner console — Utilisateurs page).
 * Tenant-linked users are delegated to deleteUserInTenant (tenant lock +
 * last-admin guard + tenant_events audit). Tenantless accounts (owner-console
 * / superadmin) are deleted directly with self-delete and last-superadmin
 * guards; no tenant_events entry is possible without a tenant.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const guard = await requireOwnerSession();
  if (!guard.ok) {
    return apiError(guard.code, "Accès refusé.", guard.status);
  }

  const { userId } = await ctx.params;
  if (!userId) {
    return apiError("VALIDATION_FAILED", "Identifiant invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  if (userId === guard.session.user.id) {
    return apiError(
      "SELF_DELETE",
      "Vous ne pouvez pas supprimer votre propre compte.",
      HTTP_STATUS.UNPROCESSABLE
    );
  }

  const [target] = await db
    .select({ id: userTable.id, email: userTable.email, role: userTable.role, tenantId: userTable.tenantId })
    .from(userTable)
    .where(eq(userTable.id, userId));
  if (!target) {
    return apiError("NOT_FOUND", "Utilisateur introuvable.", HTTP_STATUS.NOT_FOUND);
  }

  try {
    if (target.tenantId) {
      const result = await deleteUserInTenant({
        tenantId: target.tenantId,
        userId,
        actorId: guard.session.user.id,
        actorEmail: guard.session.user.email,
      });
      return NextResponse.json(result, { status: HTTP_STATUS.OK });
    }

    if (target.role === "superadmin") {
      const [row] = await db
        .select({ n: count() })
        .from(userTable)
        .where(
          and(eq(userTable.role, "superadmin"), isNull(userTable.disabledAt), ne(userTable.id, userId))
        );
      if ((row?.n ?? 0) < 1) {
        return apiError(
          "LAST_SUPERADMIN",
          "Dernier compte superadmin — ne peut pas être supprimé.",
          HTTP_STATUS.UNPROCESSABLE
        );
      }
    }

    // Sessions and auth accounts cascade via FK ON DELETE CASCADE.
    await db.delete(userTable).where(eq(userTable.id, userId));
    return NextResponse.json({ userId, email: target.email }, { status: HTTP_STATUS.OK });
  } catch (err) {
    if (err instanceof TenantUserNotFoundError) {
      return apiError("NOT_FOUND", err.message, HTTP_STATUS.NOT_FOUND);
    }
    if (err instanceof LastAdminError) {
      return apiError("FORBIDDEN", err.message, HTTP_STATUS.UNPROCESSABLE);
    }
    console.error(
      "DELETE /api/v1/owner/users/[userId] error:",
      err instanceof Error ? err.message : "unknown"
    );
    return apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL);
  }
}
