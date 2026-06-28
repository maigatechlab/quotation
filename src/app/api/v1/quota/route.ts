import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrCreateSubscription } from "@/lib/quota/quota-check";
import { TIER_QUOTAS, type Tier } from "@/lib/quota/quota-config";
import { user as userTable } from "@/lib/schema";

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const companyId: string | null =
    typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

  if (!companyId) {
    return apiError("FORBIDDEN", "Utilisateur non associé à une entreprise.", HTTP_STATUS.FORBIDDEN);
  }

  const sub = await getOrCreateSubscription(companyId, db);
  const tier = sub.tier as Tier;
  const quota = TIER_QUOTAS[tier];
  const now = new Date();
  const daysRemaining = sub.graceExpiresAt
    ? Math.max(0, Math.ceil((sub.graceExpiresAt.getTime() - now.getTime()) / 86_400_000))
    : null;

  // Live user count — matches enforcement logic; stored counter drifts on deletion (P5)
  const [userCountRow] = await db
    .select({ count: count() })
    .from(userTable)
    .where(eq(userTable.companyId, companyId));
  const liveUserCount = userCountRow?.count ?? 0;

  return NextResponse.json({
    tier,
    quotaStatus: sub.quotaStatus,
    quotas: {
      quotes: {
        limit: quota.quotesPerMonth,
        used: sub.quotaUsedQuotes,
        resetAt: sub.quotaResetAt.toISOString(),
      },
      users: {
        limit: quota.usersMax,
        used: liveUserCount,
      },
    },
    graceExpiresAt: sub.graceExpiresAt?.toISOString() ?? null,
    daysRemaining,
  });
}
