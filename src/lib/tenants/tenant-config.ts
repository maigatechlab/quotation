/** @deprecated Fallback only — use getTrialDays() (story 7-12). */
export const DEFAULT_TRIAL_DAYS = 14;
/** @deprecated Fallback only — use getGracePeriodDays() (story 7-12). */
export const DEFAULT_GRACE_PERIOD_DAYS = 7;

export type TenantPlan = "free" | "pro" | "enterprise";
export type TenantStatus = "active" | "trial" | "suspended" | "cancelled";

/** @deprecated Fallback only — use getPlanLimits() (story 7-12). */
export const PLAN_LIMITS: Record<TenantPlan, { maxUsers: number }> = {
  free: { maxUsers: 1 },
  pro: { maxUsers: 5 },
  enterprise: { maxUsers: 20 },
};

export const APEX_DOMAIN = process.env.APEX_DOMAIN ?? "quotation.com";

/**
 * Builds the public URL for a tenant's subdomain.
 *
 * When the app runs on localhost (NEXT_PUBLIC_APP_URL host is `localhost`),
 * subdomains of APEX_DOMAIN don't resolve — the proxy instead accepts
 * `{slug}.localhost` (see extractSlugFromHost). Emails and UI must link there,
 * otherwise recipients get an unreachable `https://{slug}.quotation.com` URL.
 */
export function buildTenantUrl(slug: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    const parsed = new URL(appUrl);
    if (parsed.hostname === "localhost") {
      const port = parsed.port ? `:${parsed.port}` : "";
      return `${parsed.protocol}//${slug}.localhost${port}`;
    }
  } catch {
    // fall through to apex-domain URL
  }
  return `https://${slug}.${APEX_DOMAIN}`;
}

// FCFA reference prices per plan/cycle (Epic 7 §7). Stripe checkout (story 7-10)
// converts these to EUR at a fixed rate; mobile-money payments (7-4) use them
// as-is. `free` has no checkout — 0 XOF, never charged.
/** @deprecated Fallback only — use getPlanPrices() (story 7-12). */
export const PLAN_PRICES_XOF: Record<TenantPlan, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 25000, annual: 250000 },
  enterprise: { monthly: 75000, annual: 750000 },
};

// NOTE: the platform_settings async accessors (getTrialDays, getGracePeriodDays,
// getPlanLimits, getPlanPrices, getOwnerContact, getNotificationToggle,
// getNotificationSenderAddress — story 7-12) live in ./platform-config.ts, NOT
// here. This file is imported by the client component src/app/checkout/checkout-form.tsx
// (for PLAN_PRICES_XOF) — pulling in the DB-backed data layer here would drag
// `pg`/`postgres` Node builtins into the browser bundle.
