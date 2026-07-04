import Stripe from "stripe";

// Pinned explicitly — avoids Stripe SDK warnings and guarantees reproducible
// webhook payload shapes regardless of the account's dashboard-configured version.
export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

let cached: Stripe | null = null;

/**
 * Lazy singleton — evaluating STRIPE_SECRET_KEY at module load would throw in
 * any test/build context where the env var isn't set. Callers get the error
 * only when they actually try to use Stripe.
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }
  cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true });
  return cached;
}
