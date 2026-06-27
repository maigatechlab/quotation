import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { createAuditEvent, emitAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, PermissionError, requirePermission, type Role } from "@/lib/permissions";
import { company as companyTable, user as userTable } from "@/lib/schema";
import { companySchema } from "@/lib/validation/company";

export async function GET(_req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;

  if (!can(userRole, "company.read")) {
    return apiError("FORBIDDEN", "Accès refusé.", HTTP_STATUS.FORBIDDEN);
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const companyId: string | null =
    typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

  if (!companyId) {
    return NextResponse.json(null, { status: HTTP_STATUS.OK });
  }

  const rows = await db
    .select()
    .from(companyTable)
    .where(eq(companyTable.id, companyId))
    .limit(1);

  return NextResponse.json(rows[0] ?? null, { status: HTTP_STATUS.OK });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  const userId = (session.user as Record<string, unknown>).id as string;

  try {
    requirePermission(userRole, "company.update");
  } catch (err) {
    if (err instanceof PermissionError) {
      return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    }
    throw err;
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const existingCompanyId: string | null =
    typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

  if (existingCompanyId) {
    return apiError(
      "CONFLICT",
      "Société déjà configurée. Utilisez la synchronisation pour mettre à jour.",
      HTTP_STATUS.CONFLICT
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const bootstrapSchema = companySchema.extend({
    pays: z.string().optional(),
  });

  const parsed = bootstrapSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const fields: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(fieldErrors)) {
      if (msgs && msgs.length > 0) fields[key] = msgs[0]!;
    }
    return apiError(
      "VALIDATION_FAILED",
      "Données invalides.",
      HTTP_STATUS.BAD_REQUEST,
      fields
    );
  }

  const data = parsed.data;
  const now = new Date();
  const newId = crypto.randomUUID();

  // Custom error to signal race-condition within the transaction
  class AlreadyHasCompanyError extends Error {}

  let newCompany!: typeof companyTable.$inferSelect;
  try {
    const [inserted] = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(companyTable)
        .values({
          id: newId,
          raisonSociale: data.raisonSociale,
          formeJuridique: data.formeJuridique ?? null,
          capital: data.capital ?? null,
          rccm: data.rccm,
          nif: data.nif,
          adresse: data.adresse ?? null,
          bp: data.bp ?? null,
          phones: data.phones,
          emails: data.emails ?? [],
          pays: data.pays ?? "NE",
          revision: 1,
          updatedAt: now,
          createdAt: now,
        })
        .returning();

      // Guard: only update if companyId is still NULL in the DB.
      // Prevents orphan rows from a stale-session double-submit race.
      const updated = await tx
        .update(userTable)
        .set({ companyId: newId })
        .where(and(eq(userTable.id, userId), isNull(userTable.companyId)))
        .returning({ id: userTable.id });

      if (updated.length === 0) throw new AlreadyHasCompanyError();

      return rows;
    });
    if (!inserted) throw new Error("Insertion société échouée — aucune ligne retournée.");
    newCompany = inserted;
  } catch (err) {
    if (err instanceof AlreadyHasCompanyError) {
      return apiError(
        "CONFLICT",
        "Société déjà configurée. Utilisez la synchronisation pour mettre à jour.",
        HTTP_STATUS.CONFLICT
      );
    }
    throw err;
  }

  await emitAuditEvent(
    createAuditEvent({
      who: userId,
      what: "company.created",
      where: "api/v1/companies",
      entity: { type: "company", id: newId },
      after: newCompany,
    })
  );

  return NextResponse.json(newCompany, { status: HTTP_STATUS.CREATED });
}
