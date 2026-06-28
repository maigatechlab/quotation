import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companySubscription, user as userTable } from "@/lib/schema";
import {
  TIER_QUOTAS,
  GRACE_PERIOD_DAYS,
  QUOTA_WARNING_THRESHOLD,
  nextResetDate,
  type Tier,
} from "./quota-config";

export type QuotaAction = "quote.create" | "user.create";

export type QuotaCheckResult =
  | { allowed: true; warn80pct: boolean; used: number; limit: number | null }
  | { allowed: false; reason: "QUOTA_EXCEEDED" | "READONLY_MODE"; message: string };

type CompanySubscriptionRow = typeof companySubscription.$inferSelect;

export async function getOrCreateSubscription(
  companyId: string,
  dbClient: typeof db
): Promise<CompanySubscriptionRow> {
  // ON CONFLICT DO NOTHING handles concurrent first-access race safely (P6)
  await dbClient
    .insert(companySubscription)
    .values({
      companyId,
      tier: "starter",
      quotaStatus: "ok",
      quotaUsedQuotes: 0,
      quotaUsedUsers: 0,
      quotaResetAt: nextResetDate(),
    })
    .onConflictDoNothing();

  const [row] = await dbClient
    .select()
    .from(companySubscription)
    .where(eq(companySubscription.companyId, companyId))
    .limit(1);

  if (!row) throw new Error("Failed to create or find company subscription");
  return row;
}

async function maybeResetQuota(
  sub: CompanySubscriptionRow,
  dbClient: typeof db
): Promise<CompanySubscriptionRow> {
  if (sub.quotaResetAt > new Date()) return sub;

  const [updated] = await dbClient
    .update(companySubscription)
    .set({
      quotaUsedQuotes: 0,
      notified80pct: false,
      quotaStatus: "ok",
      graceExpiresAt: null,
      exceededAt: null,
      quotaResetAt: nextResetDate(),
      updatedAt: new Date(),
    })
    .where(eq(companySubscription.companyId, sub.companyId))
    .returning();

  return updated ?? sub;
}

export async function checkQuota(
  companyId: string,
  action: QuotaAction,
  dbClient: typeof db
): Promise<QuotaCheckResult> {
  let sub = await getOrCreateSubscription(companyId, dbClient);
  sub = await maybeResetQuota(sub, dbClient);

  const tier = sub.tier as Tier;
  const quotaConfig = TIER_QUOTAS[tier];
  const now = new Date();

  // Transition exceeded → readonly when grace period expires
  if (
    sub.quotaStatus === "exceeded" &&
    sub.graceExpiresAt !== null &&
    sub.graceExpiresAt < now
  ) {
    // Guard: only transition if still "exceeded" to avoid clobbering a fresh reset (P7)
    await dbClient
      .update(companySubscription)
      .set({ quotaStatus: "readonly", updatedAt: now })
      .where(
        and(
          eq(companySubscription.companyId, companyId),
          eq(companySubscription.quotaStatus, "exceeded")
        )
      );
    return {
      allowed: false,
      reason: "READONLY_MODE",
      message: "Compte en mode lecture seule. Contactez l'administrateur.",
    };
  }

  if (sub.quotaStatus === "readonly") {
    return {
      allowed: false,
      reason: "READONLY_MODE",
      message: "Compte en mode lecture seule. Contactez l'administrateur.",
    };
  }

  if (action === "quote.create") {
    const limit = quotaConfig.quotesPerMonth;
    if (limit === null) {
      return { allowed: true, warn80pct: false, used: sub.quotaUsedQuotes, limit: null };
    }
    if (sub.quotaUsedQuotes >= limit) {
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: "Quota de devis atteint. Mettez votre compte à niveau pour continuer.",
      };
    }
    const warn80pct =
      !sub.notified80pct &&
      (sub.quotaUsedQuotes + 1) / limit >= QUOTA_WARNING_THRESHOLD;
    return { allowed: true, warn80pct, used: sub.quotaUsedQuotes, limit };
  }

  if (action === "user.create") {
    const limit = quotaConfig.usersMax;
    const [row] = await dbClient
      .select({ count: count() })
      .from(userTable)
      .where(eq(userTable.companyId, companyId));
    const usedUsers = row?.count ?? 0;
    if (usedUsers >= limit) {
      return {
        allowed: false,
        reason: "QUOTA_EXCEEDED",
        message: "Limite d'utilisateurs atteinte pour votre tier.",
      };
    }
    return { allowed: true, warn80pct: false, used: usedUsers, limit };
  }

  return { allowed: true, warn80pct: false, used: 0, limit: null };
}

export async function incrementQuotaUsed(
  companyId: string,
  action: QuotaAction,
  dbClient: typeof db
): Promise<void> {
  const now = new Date();

  if (action === "quote.create") {
    // Read tier for limit check (tier is stable, no race concern here)
    const sub = await getOrCreateSubscription(companyId, dbClient);
    const limit = TIER_QUOTAS[sub.tier as Tier].quotesPerMonth;

    // Atomic SQL increment avoids last-write-wins race under concurrency (P2)
    const [updated] = await dbClient
      .update(companySubscription)
      .set({ quotaUsedQuotes: sql`quota_used_quotes + 1`, updatedAt: now })
      .where(eq(companySubscription.companyId, companyId))
      .returning();

    if (!updated) return;

    const newUsed = updated.quotaUsedQuotes;
    // P3: >= (not >) so the exact-at-limit create triggers the grace period
    if (limit !== null && newUsed >= limit) {
      await dbClient
        .update(companySubscription)
        .set({
          quotaStatus: "exceeded",
          exceededAt: updated.exceededAt ?? now,
          graceExpiresAt: updated.exceededAt
            ? (updated.graceExpiresAt ?? undefined)
            : new Date(now.getTime() + GRACE_PERIOD_DAYS * 86_400_000),
          updatedAt: now,
        })
        .where(eq(companySubscription.companyId, companyId));
    }
  } else if (action === "user.create") {
    // Atomic SQL increment (P2)
    await dbClient
      .update(companySubscription)
      .set({ quotaUsedUsers: sql`quota_used_users + 1`, updatedAt: now })
      .where(eq(companySubscription.companyId, companyId));
  }
}
