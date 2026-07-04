import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError, requirePermission, type Role } from "@/lib/permissions";
import { quote as quoteTable } from "@/lib/schema";
import { upload } from "@/lib/storage";
import { assertSessionTenantWritable } from "@/lib/tenants/request-guard";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  const userId = session.user.id;

  const tenantGuard = await assertSessionTenantWritable(session.user as Record<string, unknown>);
  if (tenantGuard) return tenantGuard;

  const { id: quoteId } = await params;

  const dbQuote = await db.query.quote.findFirst({
    where: eq(quoteTable.id, quoteId),
  });
  if (!dbQuote) {
    return apiError("NOT_FOUND", "Devis introuvable.", HTTP_STATUS.NOT_FOUND);
  }

  // Permission scoped to ownership: commercial = "own" requires owner match (else 403).
  try {
    requirePermission(userRole, "quote.update", dbQuote.ownerId ?? undefined, userId);
  } catch (err) {
    if (err instanceof PermissionError) {
      return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    }
    throw err;
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const fileField = formData.get("scan");
  if (!fileField || !(fileField instanceof File)) {
    return apiError(
      "VALIDATION_FAILED",
      "Fichier scan requis.",
      HTTP_STATUS.BAD_REQUEST,
      { scan: "Fichier scan requis." }
    );
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png"];
  if (!ALLOWED_TYPES.includes(fileField.type)) {
    return apiError(
      "VALIDATION_FAILED",
      "Format non supporté. PNG ou JPG uniquement.",
      HTTP_STATUS.BAD_REQUEST,
      { scan: "Format non supporté. PNG ou JPG uniquement." }
    );
  }

  const MAX_SIZE = 5 * 1024 * 1024;
  if (fileField.size > MAX_SIZE) {
    return apiError(
      "VALIDATION_FAILED",
      "Fichier trop volumineux (max 5 Mo).",
      HTTP_STATUS.BAD_REQUEST,
      { scan: "Fichier trop volumineux (max 5 Mo)." }
    );
  }

  const ext = fileField.type === "image/png" ? "png" : "jpg";
  const filename = `accord-scan-${quoteId}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await fileField.arrayBuffer());

  const result = await upload(buffer, filename, "signatures", {
    maxSize: MAX_SIZE,
    allowedTypes: ALLOWED_TYPES,
  });

  return NextResponse.json({ scanUrl: result.url }, { status: HTTP_STATUS.OK });
}
