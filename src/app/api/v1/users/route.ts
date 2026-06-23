import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError, requirePermission, type Role } from "@/lib/permissions";
import { user as userTable } from "@/lib/schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Non authentifié." } },
      { status: 401 }
    );
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;

  try {
    requirePermission(userRole, "user.read");
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Action non autorisée." } },
        { status: 403 }
      );
    }
    throw err;
  }

  const users = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .orderBy(asc(userTable.createdAt));

  return NextResponse.json(users);
}
