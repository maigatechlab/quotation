// The West African CFA franc (XOF) is pegged to the euro at a fixed rate
// (1 EUR = 655.957 XOF) — no FX API call needed (Epic 7 §7).
export const XOF_TO_EUR_RATE = 1 / 655.957;
export const STRIPE_CURRENCY = "eur" as const;

/** FCFA reference amount → whole EUR amount actually charged by Stripe. */
export function xofToEur(amountXof: number): number {
  return Math.round(amountXof * XOF_TO_EUR_RATE);
}

/** Stripe `unit_amount` is expressed in the smallest currency unit (cents). */
export function eurToCents(eur: number): number {
  return Math.round(eur * 100);
}
