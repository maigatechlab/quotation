import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { session as sessionTable, tenantEvents, tenants, user as userTable } from "@/lib/schema";
import { TenantConflictError } from "@/lib/tenants/create-tenant";
import { generatePassword } from "@/lib/tenants/password";
import { buildTenantUrl } from "@/lib/tenants/tenant-config";
import { buildWelcomeEmailHtml, buildWelcomeEmailText } from "@/lib/tenants/welcome-email";
import type { CreateTenantUserInput } from "@/lib/validation/tenant-user";

export { TenantConflictError };

export class TenantQuotaError extends Error {
  readonly statusCode = 422;
  constructor(
    public readonly plan: string,
    public readonly maxUsers: number
  ) {
    super(`Quota d'utilisateurs atteint (maxUsers=${maxUsers} pour le plan ${plan})`);
    this.name = "TenantQuotaError";
  }
}

export class LastAdminError extends Error {
  readonly statusCode = 422;
  constructor() {
    super("Impossible de révoquer le dernier administrateur du tenant");
    this.name = "LastAdminError";
  }
}

export class TenantUserNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() {
    super("Utilisateur introuvable dans ce tenant");
    this.name = "TenantUserNotFoundError";
  }
}

function toLogMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// tx type extracted from db.transaction's callback param — lets helpers below
// accept either the plain `db` or a transaction handle (cf. reactivate.ts).
type TxLike = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | TxLike;

/**
 * Counts ACTIVE users only (disabledAt IS NULL) — this is the number that
 * counts against the tenant's maxUsers quota.
 */
export async function countActiveTenantUsers(
  tenantId: string,
  dbClient: DbOrTx = db
): Promise<number> {
  const [row] = await dbClient
    .select({ n: count() })
    .from(userTable)
    .where(and(eq(userTable.tenantId, tenantId), isNull(userTable.disabledAt)));
  return row?.n ?? 0;
}

export interface UserQuotaResult {
  allowed: boolean;
  active: number;
  maxUsers: number;
}

export async function checkUserQuota(
  tenantId: string,
  maxUsers: number,
  dbClient: DbOrTx = db
): Promise<UserQuotaResult> {
  const active = await countActiveTenantUsers(tenantId, dbClient);
  return { allowed: active < maxUsers, active, maxUsers };
}

export interface TenantUserWithLastSeen {
  id: string;
  name: string;
  email: string;
  role: string;
  disabledAt: Date | null;
  createdAt: Date;
  lastSeen: Date | null;
}

/**
 * Two separate queries (users, then last session per user) instead of a
 * single LEFT JOIN + GROUP BY — simpler, testable, and fine at this scale
 * (max 20 users/tenant, cf. Dev Notes story 7-9).
 */
export async function getTenantUsersWithLastSeen(
  tenantId: string,
  dbClient: typeof db = db
): Promise<TenantUserWithLastSeen[]> {
  const users = await dbClient
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      disabledAt: userTable.disabledAt,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(eq(userTable.tenantId, tenantId))
    .orderBy(asc(userTable.createdAt));

  const admins = users.filter((u) => u.role === "admin");
  const others = users.filter((u) => u.role !== "admin");
  const ordered = [...admins, ...others];

  if (ordered.length === 0) return [];

  const userIds = ordered.map((u) => u.id);
  const sessions = await dbClient
    .select({ userId: sessionTable.userId, lastSeen: sessionTable.updatedAt })
    .from(sessionTable)
    .where(inArray(sessionTable.userId, userIds));

  const lastSeenMap = new Map<string, Date>();
  for (const s of sessions) {
    const existing = lastSeenMap.get(s.userId);
    if (!existing || s.lastSeen > existing) lastSeenMap.set(s.userId, s.lastSeen);
  }

  return ordered.map((u) => ({ ...u, lastSeen: lastSeenMap.get(u.id) ?? null }));
}

export interface CreateUserInTenantParams {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  input: CreateTenantUserInput;
  /** Superadmin user id — recorded as the actor in tenant_events. */
  actorId: string;
  /** Superadmin email — used only for the audit note. */
  actorEmail: string;
}

export interface CreateUserInTenantResult {
  userId: string;
  email: string;
  role: string;
  /** Present only when passwordMode === "auto", so the owner can relay it. */
  generatedPassword?: string;
  emailSent: boolean;
}

/**
 * Provisions an additional user for an already-existing tenant. Reuses the
 * exact 7-3 pattern (signUpEmail + best-effort email/audit), with an
 * additional quota guard and a rollback direction inverted from 7-3 (here the
 * user is created first, then linked — so rollback deletes the user).
 *
 * The quota guard, email-uniqueness check, and signUpEmail + link all run
 * while holding a `SELECT ... FOR UPDATE` lock on the tenant row, so two
 * concurrent adds for the same tenant can't both observe "quota not yet
 * full" and both succeed (TOCTOU close, cf. code review finding).
 */
export async function createUserInTenant(
  params: CreateUserInTenantParams
): Promise<CreateUserInTenantResult> {
  const { input } = params;
  const password = input.passwordMode === "auto" ? generatePassword() : (input.manualPassword as string);

  let createdUserId: string | undefined;
  try {
    await db.transaction(async (tx) => {
      const [tenantRow] = await tx
        .select({ maxUsers: tenants.maxUsers, plan: tenants.plan })
        .from(tenants)
        .where(eq(tenants.id, params.tenantId))
        .for("update");
      if (!tenantRow) {
        throw new Error("Tenant introuvable");
      }

      // 1. QUOTA GUARD — atomic count under the tenant row lock, BEFORE any mutation.
      const active = await countActiveTenantUsers(params.tenantId, tx);
      if (active >= tenantRow.maxUsers) {
        throw new TenantQuotaError(tenantRow.plan, tenantRow.maxUsers);
      }

      // 2. Email uniqueness (any tenant) — reuse 7-3's TenantConflictError.
      const existingUser = await tx
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.email, input.email.toLowerCase()))
        .limit(1);
      if (existingUser[0]) {
        throw new TenantConflictError("email");
      }

      // 3-4. Create via Better Auth, then link to the tenant. signUpEmail is
      // an external call (its own connection/commit), so on link failure we
      // still need a manual rollback (delete) outside this transaction.
      const signUpResult = await auth.api.signUpEmail({
        body: { email: input.email, password, name: input.name },
      });
      if (!signUpResult?.user) {
        throw new Error("Better Auth signUpEmail returned no user");
      }
      createdUserId = signUpResult.user.id;

      // companyId mirrors tenantId (cf. create-tenant.ts) — many app/API paths
      // still key off session.user.companyId for tenant-scoped queries.
      await tx
        .update(userTable)
        .set({ tenantId: params.tenantId, companyId: params.tenantId, role: input.role })
        .where(eq(userTable.id, createdUserId));
    });
  } catch (err) {
    if (createdUserId) {
      await db.delete(userTable).where(eq(userTable.id, createdUserId));
    }
    throw err;
  }
  const userId = createdUserId as string;

  const subdomainUrl = buildTenantUrl(params.tenantSlug);

  // 6. Welcome email — best-effort
  let emailSent = false;
  if (input.sendWelcomeEmail) {
    try {
      const emailParams = {
        tenantName: params.tenantName,
        subdomainUrl,
        adminEmail: input.email,
        password,
        trialEndsAt: null,
      };
      await sendEmail({
        to: input.email,
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

  // 7. Audit event — best-effort (never includes the password)
  try {
    await db.insert(tenantEvents).values({
      tenantId: params.tenantId,
      eventType: "user_added",
      actorId: params.actorId,
      before: null,
      after: { userId, email: input.email, role: input.role },
      note: emailSent
        ? `Ajouté par ${params.actorEmail}`
        : `Ajouté par ${params.actorEmail} — email échoué`,
    });
  } catch (err) {
    console.error("tenant_events (user_added) insert failed", toLogMessage(err));
  }

  const result: CreateUserInTenantResult = {
    userId,
    email: input.email,
    role: input.role,
    emailSent,
  };
  if (input.passwordMode === "auto") {
    result.generatedPassword = password;
  }
  return result;
}

export interface RevokeUserInTenantParams {
  tenantId: string;
  userId: string;
  actorId: string;
  actorEmail: string;
}

export interface RevokeUserInTenantResult {
  userId: string;
  disabledAt: Date;
}

/**
 * The user lookup, last-admin-count guard, and soft-disable mutation all run
 * while holding a `SELECT ... FOR UPDATE` lock on the tenant row — this
 * serializes concurrent revoke/create/reactivate calls for the same tenant
 * so two simultaneous revokes can't both pass the "more than one active
 * admin" check and leave the tenant with zero admins (TOCTOU close, cf. code
 * review finding).
 */
export async function revokeUserInTenant(
  params: RevokeUserInTenantParams
): Promise<RevokeUserInTenantResult> {
  let result!: RevokeUserInTenantResult;
  let shouldAudit = false;
  const auditBefore = { userId: "", email: "", role: "" };

  await db.transaction(async (tx) => {
    const [tenantRow] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, params.tenantId))
      .for("update");
    if (!tenantRow) {
      throw new TenantUserNotFoundError();
    }

    const [existing] = await tx
      .select()
      .from(userTable)
      .where(and(eq(userTable.id, params.userId), eq(userTable.tenantId, params.tenantId)));
    if (!existing) {
      throw new TenantUserNotFoundError();
    }

    // Idempotent: already revoked, no new mutation/event.
    if (existing.disabledAt) {
      result = { userId: existing.id, disabledAt: existing.disabledAt };
      return;
    }

    if (existing.role === "admin") {
      const [adminRow] = await tx
        .select({ n: count() })
        .from(userTable)
        .where(
          and(
            eq(userTable.tenantId, params.tenantId),
            eq(userTable.role, "admin"),
            isNull(userTable.disabledAt)
          )
        );
      if ((adminRow?.n ?? 0) <= 1) {
        throw new LastAdminError();
      }
    }

    const disabledAt = new Date();
    await tx
      .update(userTable)
      .set({ disabledAt })
      .where(and(eq(userTable.id, params.userId), eq(userTable.tenantId, params.tenantId)));

    // Logout forced — the existing session must not remain valid.
    await tx.delete(sessionTable).where(eq(sessionTable.userId, params.userId));

    result = { userId: existing.id, disabledAt };
    auditBefore.userId = existing.id;
    auditBefore.email = existing.email;
    auditBefore.role = existing.role;
    shouldAudit = true;
  });

  if (shouldAudit) {
    try {
      await db.insert(tenantEvents).values({
        tenantId: params.tenantId,
        eventType: "user_removed",
        actorId: params.actorId,
        before: { ...auditBefore, disabledAt: null },
        after: { userId: result.userId, disabledAt: result.disabledAt.toISOString() },
        note: `Révoqué par ${params.actorEmail}`,
      });
    } catch (err) {
      console.error("tenant_events (user_removed) insert failed", toLogMessage(err));
    }
  }

  return result;
}

export interface DeleteUserInTenantParams {
  tenantId: string;
  userId: string;
  actorId: string;
  actorEmail: string;
}

export interface DeleteUserInTenantResult {
  userId: string;
  email: string;
}

/**
 * Permanently deletes a user account from a tenant. Unlike revoke (soft
 * disable), this removes the user row — sessions and auth accounts cascade
 * via FK ON DELETE CASCADE; quotes/clients they own keep their data
 * (owner_id SET NULL).
 *
 * Same locking strategy as {@link revokeUserInTenant}: the tenant row is
 * locked FOR UPDATE so a concurrent delete/revoke can't both pass the
 * last-admin guard and leave the tenant with zero active admins.
 */
export async function deleteUserInTenant(
  params: DeleteUserInTenantParams
): Promise<DeleteUserInTenantResult> {
  let result!: DeleteUserInTenantResult;
  const auditBefore = { userId: "", email: "", role: "", disabledAt: null as string | null };

  await db.transaction(async (tx) => {
    const [tenantRow] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, params.tenantId))
      .for("update");
    if (!tenantRow) {
      throw new TenantUserNotFoundError();
    }

    const [existing] = await tx
      .select()
      .from(userTable)
      .where(and(eq(userTable.id, params.userId), eq(userTable.tenantId, params.tenantId)));
    if (!existing) {
      throw new TenantUserNotFoundError();
    }

    // An active admin can only be deleted if another active admin remains.
    // (A revoked admin can always be deleted — it holds no quota seat.)
    if (existing.role === "admin" && !existing.disabledAt) {
      const [adminRow] = await tx
        .select({ n: count() })
        .from(userTable)
        .where(
          and(
            eq(userTable.tenantId, params.tenantId),
            eq(userTable.role, "admin"),
            isNull(userTable.disabledAt)
          )
        );
      if ((adminRow?.n ?? 0) <= 1) {
        throw new LastAdminError();
      }
    }

    // Sessions and auth accounts cascade via FK; explicit user delete only.
    await tx.delete(userTable).where(and(eq(userTable.id, params.userId), eq(userTable.tenantId, params.tenantId)));

    result = { userId: existing.id, email: existing.email };
    auditBefore.userId = existing.id;
    auditBefore.email = existing.email;
    auditBefore.role = existing.role;
    auditBefore.disabledAt = existing.disabledAt?.toISOString() ?? null;
  });

  try {
    await db.insert(tenantEvents).values({
      tenantId: params.tenantId,
      eventType: "user_deleted",
      actorId: params.actorId,
      before: auditBefore,
      after: null,
      note: `Supprimé par ${params.actorEmail}`,
    });
  } catch (err) {
    console.error("tenant_events (user_deleted) insert failed", toLogMessage(err));
  }

  return result;
}

export interface ReactivateUserInTenantParams {
  tenantId: string;
  userId: string;
  actorId: string;
  actorEmail: string;
}

export interface ReactivateUserInTenantResult {
  userId: string;
  disabledAt: null;
}

/**
 * Same locking strategy as {@link revokeUserInTenant}: the tenant row is
 * locked FOR UPDATE for the duration of the quota re-check + mutation, so a
 * concurrent create/reactivate for the same tenant can't both pass the quota
 * guard (TOCTOU close, cf. code review finding). The tenant's maxUsers/plan
 * are read fresh under the lock rather than trusted from the caller.
 */
export async function reactivateUserInTenant(
  params: ReactivateUserInTenantParams
): Promise<ReactivateUserInTenantResult> {
  let result!: ReactivateUserInTenantResult;
  let shouldAudit = false;
  const auditBefore = { userId: "", email: "", role: "", disabledAt: "" };

  await db.transaction(async (tx) => {
    const [tenantRow] = await tx
      .select({ maxUsers: tenants.maxUsers, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, params.tenantId))
      .for("update");
    if (!tenantRow) {
      throw new TenantUserNotFoundError();
    }

    const [existing] = await tx
      .select()
      .from(userTable)
      .where(and(eq(userTable.id, params.userId), eq(userTable.tenantId, params.tenantId)));
    if (!existing) {
      throw new TenantUserNotFoundError();
    }

    // Idempotent: already active, no mutation.
    if (!existing.disabledAt) {
      result = { userId: existing.id, disabledAt: null };
      return;
    }

    // Reactivating consumes a quota seat — same guard as creation.
    const active = await countActiveTenantUsers(params.tenantId, tx);
    if (active >= tenantRow.maxUsers) {
      throw new TenantQuotaError(tenantRow.plan, tenantRow.maxUsers);
    }

    await tx
      .update(userTable)
      .set({ disabledAt: null })
      .where(and(eq(userTable.id, params.userId), eq(userTable.tenantId, params.tenantId)));

    result = { userId: existing.id, disabledAt: null };
    auditBefore.userId = existing.id;
    auditBefore.email = existing.email;
    auditBefore.role = existing.role;
    auditBefore.disabledAt = existing.disabledAt.toISOString();
    shouldAudit = true;
  });

  if (shouldAudit) {
    try {
      await db.insert(tenantEvents).values({
        tenantId: params.tenantId,
        eventType: "user_reactivated",
        actorId: params.actorId,
        before: auditBefore,
        after: { userId: result.userId, disabledAt: null },
        note: `Réactivé par ${params.actorEmail}`,
      });
    } catch (err) {
      console.error("tenant_events (user_reactivated) insert failed", toLogMessage(err));
    }
  }

  return result;
}
