import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { createAuditEvent, emitAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError, requirePermission, type Role } from "@/lib/permissions";
import { company as companyTable } from "@/lib/schema";
import { upload } from "@/lib/storage";

export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  try {
    requirePermission(userRole, "company.update");
  } catch (err) {
    if (err instanceof PermissionError) return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    throw err;
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const companyId: string | null = typeof rawCid === "string" && rawCid !== "" ? rawCid : null;
  if (!companyId) return apiError("FORBIDDEN", "Aucune société associée à ce compte.", HTTP_STATUS.FORBIDDEN);
  const userId = (session.user as Record<string, unknown>).id as string;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const fileField = formData.get("logo");
  if (!fileField || !(fileField instanceof File)) {
    return apiError("VALIDATION_FAILED", "Fichier logo requis.", HTTP_STATUS.BAD_REQUEST, { logo: "Fichier logo requis." });
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png"];
  if (!ALLOWED_TYPES.includes(fileField.type)) {
    return apiError("VALIDATION_FAILED", "Format non supporté. PNG ou JPG uniquement.", HTTP_STATUS.BAD_REQUEST, { logo: "Format non supporté. PNG ou JPG uniquement." });
  }

  const MAX_SIZE = 2 * 1024 * 1024;
  if (fileField.size > MAX_SIZE) {
    return apiError("VALIDATION_FAILED", "Fichier trop volumineux (max 2 Mo).", HTTP_STATUS.BAD_REQUEST, { logo: "Fichier trop volumineux (max 2 Mo)." });
  }

  const ext = fileField.type === "image/png" ? "png" : "jpg";
  const filename = `logo-${companyId}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await fileField.arrayBuffer());

  const result = await upload(buffer, filename, "logos", {
    maxSize: MAX_SIZE,
    allowedTypes: ALLOWED_TYPES,
  });

  await db.update(companyTable)
    .set({ logoUrl: result.url, updatedAt: new Date() })
    .where(eq(companyTable.id, companyId));

  await emitAuditEvent(createAuditEvent({
    who: userId,
    what: "company.logo_updated",
    where: "api/v1/companies/logo",
    entity: { type: "company", id: companyId },
    after: { logoUrl: result.url },
  }));

  return NextResponse.json({ logoUrl: result.url }, { status: HTTP_STATUS.OK });
}
