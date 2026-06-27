import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError, requirePermission, type Role } from "@/lib/permissions";
import {
  client as clientTable,
  quote as quoteTable,
  quoteLine as quoteLineTable,
  clause as clauseTable,
  template as templateTable,
  company as companyTable,
} from "@/lib/schema";

const EMPTY_PAYLOAD = {
  clients: [],
  quotes: [],
  quoteLines: [],
  clauses: [],
  templates: [],
  company: null,
} as const;

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;

  try {
    requirePermission(userRole, "sync.pull");
  } catch (err) {
    if (err instanceof PermissionError) {
      return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    }
    throw err;
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const userCompanyId: string | null =
    typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

  // Fail closed: unprovisioned users receive no data rather than leaking unscoped rows.
  if (!userCompanyId) {
    return NextResponse.json({ cursor: new Date().toISOString(), entities: EMPTY_PAYLOAD });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(0);

  // P4: reject invalid dates to prevent full-table scans
  if (isNaN(since.getTime())) {
    return apiError("VALIDATION_FAILED", "Paramètre since invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const [clients, quotes, quoteLines, clauses, templates, companies] = await Promise.all([
    db
      .select()
      .from(clientTable)
      .where(and(gt(clientTable.updatedAt, since), eq(clientTable.companyId, userCompanyId))),
    db
      .select()
      .from(quoteTable)
      .where(and(gt(quoteTable.updatedAt, since), eq(quoteTable.companyId, userCompanyId))),
    db
      .select()
      .from(quoteLineTable)
      .where(
        and(gt(quoteLineTable.updatedAt, since), eq(quoteLineTable.companyId, userCompanyId))
      ),
    db
      .select()
      .from(clauseTable)
      .where(and(gt(clauseTable.updatedAt, since), eq(clauseTable.companyId, userCompanyId))),
    db
      .select()
      .from(templateTable)
      .where(
        and(gt(templateTable.updatedAt, since), eq(templateTable.companyId, userCompanyId))
      ),
    db
      .select()
      .from(companyTable)
      .where(and(eq(companyTable.id, userCompanyId), gt(companyTable.updatedAt, since))),
  ]);

  const cursor = new Date().toISOString();

  return NextResponse.json({
    cursor,
    entities: {
      clients,
      quotes,
      quoteLines,
      clauses,
      templates,
      company: companies[0] ?? null,
    },
  });
}
