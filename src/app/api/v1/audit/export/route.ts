import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditEvent } from "@/lib/schema";

const EXPORT_LIMIT = 10_000;

type AuditRow = typeof auditEvent.$inferSelect;

function buildCsv(events: AuditRow[]): string {
  const HEADERS = [
    "id",
    "who",
    "what",
    "when",
    "where",
    "entityType",
    "entityId",
    "before",
    "after",
    "createdAt",
  ];
  const rows = events.map((e) =>
    [
      e.id,
      e.who,
      e.what,
      e.when.toISOString(),
      e.where,
      e.entityType,
      e.entityId,
      JSON.stringify(e.before ?? null),
      JSON.stringify(e.after ?? null),
      e.createdAt.toISOString(),
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  // UTF-8 BOM (U+FEFF) for Excel compatibility (standard in Niger/AES region)
  return "﻿" + [HEADERS.join(","), ...rows].join("\r\n");
}

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }
  if ((session.user as Record<string, unknown>).role !== "admin") {
    return apiError("FORBIDDEN", "Réservé aux administrateurs.", HTTP_STATUS.FORBIDDEN);
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const companyId = typeof rawCid === "string" && rawCid !== "" ? rawCid : null;
  if (!companyId) {
    return apiError(
      "FORBIDDEN",
      "Utilisateur non associé à une entreprise.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";
  const from = searchParams.get("from");
  const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

  // Filter directly by companyId written at event creation time — immutable tenant scope.
  const conditions = [eq(auditEvent.companyId, companyId)];
  if (from) conditions.push(gte(auditEvent.when, new Date(from)));
  conditions.push(lte(auditEvent.when, new Date(to + "T23:59:59Z")));

  const events = await db
    .select()
    .from(auditEvent)
    .where(and(...conditions))
    .orderBy(auditEvent.when)
    .limit(EXPORT_LIMIT);

  if (format === "csv") {
    const today = new Date().toISOString().slice(0, 10);
    return new Response(buildCsv(events), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${companyId}-${today}.csv"`,
      },
    });
  }

  return NextResponse.json(events);
}
