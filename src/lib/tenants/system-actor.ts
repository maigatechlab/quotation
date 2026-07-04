/**
 * Sentinel actor id for mutations performed by a system process (no user
 * session) — e.g. the Stripe webhook. `subscription_payments.confirmedBy` and
 * `tenant_events.actorId` are plain `text` columns with no FK to `user.id`,
 * so this string is safe to store directly.
 */
export const SYSTEM_ACTOR_ID = "system-stripe-webhook" as const;
export const SYSTEM_ACTOR_EMAIL = "system@stripe-webhook" as const;
