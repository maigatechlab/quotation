import { checkoutMetadataSchema } from "@/lib/validation/checkout";
import type Stripe from "stripe";

export interface CheckoutMetadata {
  plan: "pro" | "enterprise";
  billingCycle: "monthly" | "annual";
  amountXof: number;
  amountEur: number;
  companyName: string;
  adminName: string;
  adminEmail: string;
}

/** Stripe metadata is always Record<string, string> — flatten every field. */
export function buildSessionMetadata(m: CheckoutMetadata): Stripe.MetadataParam {
  return {
    plan: m.plan,
    billing_cycle: m.billingCycle,
    amount_xof: String(m.amountXof),
    amount_eur: String(m.amountEur),
    company_name: m.companyName,
    admin_name: m.adminName,
    admin_email: m.adminEmail,
  };
}

export class InvalidCheckoutMetadataError extends Error {
  constructor() {
    super("Invalid or missing Stripe checkout session metadata");
    this.name = "InvalidCheckoutMetadataError";
  }
}

/** Parses + validates the raw Stripe session metadata back into CheckoutMetadata. */
export function parseSessionMetadata(raw: Record<string, string> | null): CheckoutMetadata {
  if (!raw) throw new InvalidCheckoutMetadataError();

  const parsed = checkoutMetadataSchema.safeParse({
    plan: raw.plan,
    billingCycle: raw.billing_cycle,
    amountXof: raw.amount_xof,
    amountEur: raw.amount_eur,
    companyName: raw.company_name,
    adminName: raw.admin_name,
    adminEmail: raw.admin_email,
  });

  if (!parsed.success) throw new InvalidCheckoutMetadataError();

  return parsed.data;
}

export function extractStripeEventId(event: Stripe.Event): string {
  return event.id;
}
