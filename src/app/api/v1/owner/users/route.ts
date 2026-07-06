import { asc } from "drizzle-orm";
import { z } from "zod";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { requireOwnerSession } from "@/lib/session";
import { user as userTable, tenants } from "@/lib/schema";
import { buildWelcomeEmailHtml, buildWelcomeEmailText } from "@/lib/tenants/welcome-email";
import { eq } from "drizzle-orm";

function toLogMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET() {
  const guard = await requireOwnerSession();
  if (!guard.ok) return apiError(guard.code, "Accès refusé.", guard.status);

  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      tenantId: userTable.tenantId,
      tenantName: tenants.name,
      createdAt: userTable.createdAt,
      disabledAt: userTable.disabledAt,
    })
    .from(userTable)
    .leftJoin(tenants, eq(userTable.tenantId, tenants.id))
    .orderBy(asc(userTable.createdAt));

  return Response.json(rows, { status: HTTP_STATUS.OK });
}

const CreateOwnerUserSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe minimum 8 caractères"),
  role: z.enum(["admin", "commercial", "operateur", "superadmin"]).default("commercial"),
  sendWelcomeEmail: z.boolean().default(true),
});

export async function POST(req: Request) {
  const guard = await requireOwnerSession();
  if (!guard.ok) return apiError(guard.code, "Accès refusé.", guard.status);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const parsed = CreateOwnerUserSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (msgs?.[0]) fields[key] = msgs[0];
    }
    return apiError("VALIDATION_FAILED", "Validation échouée.", HTTP_STATUS.BAD_REQUEST, fields);
  }

  const { name, email, password, role, sendWelcomeEmail: shouldSendWelcomeEmail } = parsed.data;

  // Register via Better Auth (direct server-side call, not a self-fetch —
  // avoids depending on NEXT_PUBLIC_APP_URL matching the actual bound port).
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: { email, password, name },
    });
    if (!signUpResult?.user) {
      return apiError("INTERNAL_ERROR", "Erreur lors de la création du compte.", HTTP_STATUS.INTERNAL);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("already") || message.includes("exist")) {
      return apiError("CONFLICT", "Un utilisateur avec cet email existe déjà.", HTTP_STATUS.CONFLICT);
    }
    return apiError("INTERNAL_ERROR", "Erreur lors de la création du compte.", HTTP_STATUS.INTERNAL);
  }

  // Set requested role
  await db
    .update(userTable)
    .set({ role })
    .where(eq(userTable.email, email));

  const created = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  // Welcome email — best-effort, never blocks account creation on failure.
  let emailSent = false;
  if (shouldSendWelcomeEmail) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const loginUrl = `${appUrl}/owner/login`;
      const emailParams = {
        tenantName: "Owner Console",
        subdomainUrl: loginUrl,
        adminEmail: email,
        password,
        trialEndsAt: null,
      };
      await sendEmail({
        to: email,
        subject: "Bienvenue sur Quotation Logistique — vos identifiants",
        html: buildWelcomeEmailHtml(emailParams),
        text: buildWelcomeEmailText(emailParams),
      });
      emailSent = true;
    } catch (err) {
      // Never logs the password — only the error object from sendEmail.
      console.error("Welcome email failed", toLogMessage(err));
      emailSent = false;
    }
  }

  return Response.json({ ...created[0], emailSent }, { status: HTTP_STATUS.CREATED });
}
