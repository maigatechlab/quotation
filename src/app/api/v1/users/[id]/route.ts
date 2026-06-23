import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError, requirePermission, type Role } from "@/lib/permissions";
import { user as userTable } from "@/lib/schema";

const patchSchema = z.object({
  role: z.enum(["admin", "commercial", "operateur"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Non authentifié." } },
      { status: 401 }
    );
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;

  try {
    requirePermission(userRole, "user.manage");
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Action non autorisée." } },
        { status: 403 }
      );
    }
    throw err;
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Impossible de modifier son propre rôle." } },
      { status: 422 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Corps de requête JSON invalide." } },
      { status: 400 }
    );
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Données invalides.",
          fields: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 }
    );
  }

  const updated = await db
    .update(userTable)
    .set({ role: parsed.data.role })
    .where(eq(userTable.id, id))
    .returning({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
    });

  if (!updated[0]) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Utilisateur introuvable." } },
      { status: 404 }
    );
  }

  return NextResponse.json(updated[0]);
}
