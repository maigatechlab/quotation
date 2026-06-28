import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError, requirePermission, type Role } from "@/lib/permissions";
import { checkQuota, incrementQuotaUsed } from "@/lib/quota/quota-check";
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

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "commercial", "operateur"]).optional().default("commercial"),
});

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;

  try {
    requirePermission(userRole, "user.manage");
  } catch (err) {
    if (err instanceof PermissionError) {
      return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    }
    throw err;
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const tenantId: string | null =
    typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

  if (!tenantId) {
    return apiError("FORBIDDEN", "Utilisateur non associé à une entreprise.", HTTP_STATUS.FORBIDDEN);
  }

  const quotaResult = await checkQuota(tenantId, "user.create", db);
  if (!quotaResult.allowed) {
    return apiError(
      "QUOTA_EXCEEDED",
      quotaResult.message,
      HTTP_STATUS.RATE_LIMITED
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_FAILED",
      "Données invalides.",
      HTTP_STATUS.BAD_REQUEST,
      parsed.error.flatten().fieldErrors as Record<string, string>
    );
  }

  const { name, email, role } = parsed.data;

  let created: { id: string; name: string; email: string; role: string | null } | undefined;
  try {
    [created] = await db
      .insert(userTable)
      .values({
        id: crypto.randomUUID(),
        name,
        email,
        emailVerified: false,
        role,
        companyId: tenantId,
      })
      .returning({ id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role });
  } catch (err) {
    // Postgres unique constraint violation — email already exists (P8)
    if (typeof err === "object" && err !== null && "code" in err && (err as Record<string, unknown>).code === "23505") {
      return apiError("CONFLICT", "Un utilisateur avec cet email existe déjà.", HTTP_STATUS.CONFLICT);
    }
    throw err;
  }

  await incrementQuotaUsed(tenantId, "user.create", db);

  // Send invitation email so the new user can set their password (D1 — option b)
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password` },
      headers: await headers(),
    });
  } catch {
    // best-effort — user created; they can use the "Mot de passe oublié" flow
  }

  return NextResponse.json(created, { status: HTTP_STATUS.CREATED });
}
