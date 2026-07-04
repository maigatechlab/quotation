import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, user as userTable } from "@/lib/schema";
import { buildSessionMetadata, type CheckoutMetadata } from "@/lib/stripe/checkout-metadata";
import { getStripe } from "@/lib/stripe/client";
import { eurToCents, STRIPE_CURRENCY, xofToEur } from "@/lib/stripe/pricing";
import { PLAN_PRICES_XOF } from "@/lib/tenants/tenant-config";
import type { CreateCheckoutSessionInput } from "@/lib/validation/checkout";

/**
 * A returning customer going through /checkout again (renewal) would
 * otherwise get a brand-new Stripe customer id on every checkout, which
 * breaks the webhook's stripeCustomerId-based renewal lookup (AC6). Reusing
 * the existing tenant's stripeCustomerId — found via the admin's email —
 * makes Stripe attach the new session to the SAME customer, so the webhook
 * correctly detects a renewal instead of creating a duplicate tenant.
 */
async function findExistingStripeCustomerId(adminEmail: string): Promise<string | null> {
  const [admin] = await db
    .select({ tenantId: userTable.tenantId })
    .from(userTable)
    .where(eq(userTable.email, adminEmail.toLowerCase()))
    .limit(1);
  if (!admin?.tenantId) return null;

  const [tenant] = await db
    .select({ stripeCustomerId: tenants.stripeCustomerId })
    .from(tenants)
    .where(eq(tenants.id, admin.tenantId))
    .limit(1);
  return tenant?.stripeCustomerId ?? null;
}

export class CreateCheckoutSessionError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CreateCheckoutSessionError";
  }
}

export interface CreateCheckoutSessionResult {
  url: string;
  sessionId: string;
}

const CYCLE_LABELS = { monthly: "Mensuel", annual: "Annuel" } as const;

/**
 * Creates a hosted Stripe Checkout Session (mode "payment" — one-shot, no
 * Stripe subscription). Does NOT create a tenant — tenant provisioning only
 * happens once payment is confirmed, inside the webhook handler.
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResult> {
  const amountXof = PLAN_PRICES_XOF[input.plan][input.billingCycle];
  const amountEur = xofToEur(amountXof);
  const cents = eurToCents(amountEur);

  const metadata: CheckoutMetadata = {
    plan: input.plan,
    billingCycle: input.billingCycle,
    amountXof,
    amountEur,
    companyName: input.companyName,
    adminName: input.adminName,
    adminEmail: input.adminEmail,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new CreateCheckoutSessionError("MISSING_APP_URL", "NEXT_PUBLIC_APP_URL is required");
  }

  try {
    const stripe = getStripe();
    const existingCustomerId = await findExistingStripeCustomerId(input.adminEmail);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: STRIPE_CURRENCY,
      // Stripe rejects passing both `customer` and `customer_email` — reuse
      // the existing customer (renewal) when one is on file, otherwise let
      // Stripe create a fresh customer from the email (new signup).
      ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: input.adminEmail }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: cents,
            product_data: {
              name: `Quotation Logistique — ${input.plan} (${CYCLE_LABELS[input.billingCycle]})`,
            },
          },
        },
      ],
      metadata: buildSessionMetadata(metadata),
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout?canceled=1`,
    });

    if (!session.url) {
      throw new CreateCheckoutSessionError("NO_SESSION_URL", "Stripe session has no redirect URL");
    }

    return { url: session.url, sessionId: session.id };
  } catch (err) {
    if (err instanceof CreateCheckoutSessionError) throw err;
    throw new CreateCheckoutSessionError(
      "STRIPE_API_ERROR",
      err instanceof Error ? err.message : "Stripe API error"
    );
  }
}
