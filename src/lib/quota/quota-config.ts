export type Tier = "starter" | "pro" | "entreprise";

export interface TierQuota {
  quotesPerMonth: number | null;
  usersMax: number;
  routeTemplatesAllowed: boolean;
}

export const TIER_QUOTAS: Record<Tier, TierQuota> = {
  starter: {
    quotesPerMonth: 50,
    usersMax: 1,
    routeTemplatesAllowed: false,
  },
  pro: {
    quotesPerMonth: null,
    usersMax: 3,
    routeTemplatesAllowed: true,
  },
  entreprise: {
    quotesPerMonth: null,
    usersMax: 10,
    routeTemplatesAllowed: true,
  },
};

export const GRACE_PERIOD_DAYS = 7;
export const QUOTA_WARNING_THRESHOLD = 0.8;

export function nextResetDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}
