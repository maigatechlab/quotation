import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { tenantEvents, tenants, user as userTable } from "@/lib/schema";
import type { CreateTenantInput } from "@/lib/validation/tenant";
import { generatePassword } from "./password";
import {
  getNotificationSenderAddress,
  getNotificationToggle,
  getPlanLimits,
  getTrialDays,
} from "./platform-config";
import { APEX_DOMAIN } from "./tenant-config";
import { calculateTrialDates } from "./tenant-dates";
import { buildWelcomeEmailHtml, buildWelcomeEmailText } from "./welcome-email";

/**
 * Raised when a slug or admin email already exists. The `field` lets the API
 * route map the conflict to the correct form field (409).
 */
export class TenantConflictError extends Error {
  readonly field: "slug" | "email";

  constructor(field: "slug" | "email") {
    super(`Tenant conflict on field: ${field}`);
    this.name = "TenantConflictError";
    this.field = field;
  }
}

export interface CreateTenantParams {
  input: CreateTenantInput;
  /** Superadmin user id — recorded as the actor in tenant_events. */
  actorId: string;
  /** Superadmin email — used only for the audit note. */
  actorEmail: string;
}

export interface CreateTenantResult {
  tenantId: string;
  slug: string;
  subdomainUrl: string;
  adminUserId: string;
  /** Present only when passwordMode === "auto", so the owner can relay it. */
  generatedPassword?: string;
  emailSent: boolean;
}

function formatTrialDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Provisions a tenant and its admin account.
 *
 * Transactionality: the Drizzle tenant INSERT and the Better Auth signUp do NOT
 * share a native SQL transaction, so a manual rollback (DELETE the tenant — its
 * tenant_events cascade via FK ON DELETE CASCADE) is performed if account
 * creation or linking fails. Tenant is created first so the user can be linked
 * to it; rolling back a tenant is trivial compared to unwinding a Better Auth
 * user + account.
 *
 * Email delivery and the audit event are best-effort and never fail the request.
 */
export async function createTenantWithAdmin(
  params: CreateTenantParams
): Promise<CreateTenantResult> {
  const { input } = params;

  // 1. Slug uniqueness
  const existingSlug = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, input.slug))
    .limit(1);
  if (existingSlug[0]) {
    throw new TenantConflictError("slug");
  }

  // 2. Email uniqueness — normalise to lowercase to match Better Auth behaviour
  const existingUser = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, input.adminEmail.toLowerCase()))
    .limit(1);
  if (existingUser[0]) {
    throw new TenantConflictError("email");
  }

  // 3. Dates — trial length is platform-configured (story 7-12)
  const trialDays = await getTrialDays();
  const dates = calculateTrialDates({ cycle: input.cycle, trialDays });

  // 4. Password
  const password =
    input.passwordMode === "auto"
      ? generatePassword()
      : (input.manualPassword as string);

  // 5. Insert tenant — maxUsers is platform-configured per plan (story 7-12)
  const planLimits = await getPlanLimits();
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: input.companyName,
      slug: input.slug,
      status: "trial",
      plan: input.plan,
      maxUsers: planLimits[input.plan].maxUsers,
      subscriptionStart: dates.subscriptionStart,
      subscriptionEnd: dates.subscriptionEnd,
      trialEndsAt: dates.trialEndsAt,
      notes: input.notes ?? null,
    })
    .returning();

  if (!tenant) {
    throw new Error("Tenant insert returned no row");
  }

  let adminUserId: string;

  // 6-7. Create admin account + link to tenant — rollback tenant on failure
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: input.adminEmail,
        password,
        name: input.adminName,
      },
    });

    if (!signUpResult?.user) {
      throw new Error("Better Auth signUpEmail returned no user");
    }
    adminUserId = signUpResult.user.id;

    await db
      .update(userTable)
      .set({ tenantId: tenant.id, companyId: tenant.id, role: "admin" })
      .where(eq(userTable.id, adminUserId));
  } catch (err) {
    // Rollback: deleting the tenant cascades its tenant_events.
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    throw err;
  }

  const subdomainUrl = `https://${input.slug}.${APEX_DOMAIN}`;

  // 8. Welcome email — best-effort, gated by the platform "trialWelcome" toggle
  let emailSent = false;
  if (input.sendWelcomeEmail && (await getNotificationToggle("trialWelcome"))) {
    try {
      const emailParams = {
        tenantName: tenant.name,
        subdomainUrl,
        adminEmail: input.adminEmail,
        password,
        trialEndsAt: formatTrialDate(tenant.trialEndsAt),
      };
      await sendEmail({
        to: input.adminEmail,
        from: await getNotificationSenderAddress(),
        subject: "Bienvenue sur Quotation Logistique — vos identifiants",
        html: buildWelcomeEmailHtml(emailParams),
        text: buildWelcomeEmailText(emailParams),
      });
      emailSent = true;
    } catch (err) {
      // Never logs the password — only the error object from sendEmail.
      console.error("Welcome email failed", err);
      emailSent = false;
    }
  }

  // 9. Audit event — best-effort (no credentials in `after`)
  try {
    await db.insert(tenantEvents).values({
      tenantId: tenant.id,
      eventType: "created",
      actorId: params.actorId,
      before: null,
      after: {
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
        trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
        maxUsers: tenant.maxUsers,
      },
      note: emailSent
        ? `Créé par ${params.actorEmail}`
        : `Créé par ${params.actorEmail} — email bienvenue échoué`,
    });
  } catch (err) {
    console.error("tenant_events insert failed", err);
  }

  // 10. Result
  const result: CreateTenantResult = {
    tenantId: tenant.id,
    slug: tenant.slug,
    subdomainUrl,
    adminUserId,
    emailSent,
  };
  if (input.passwordMode === "auto") {
    result.generatedPassword = password;
  }
  return result;
}
