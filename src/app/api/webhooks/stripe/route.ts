import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { getStripe } from "@/lib/stripe/client";
import { handleCheckoutCompleted, StripeWebhookError } from "@/lib/stripe/handle-checkout-completed";

// Webhook = system actor, not versioned under /api/v1 (Stripe calls this
// URL directly — never the browser). Runtime stays Node (default) since
// Drizzle + Better Auth are Node-only; do NOT add `export const runtime = "edge"`.
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return apiError("INTERNAL_ERROR", "Webhook not configured.", HTTP_STATUS.INTERNAL);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return apiError(
      "VALIDATION_FAILED",
      "Missing stripe-signature header.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Raw body — required by Stripe, the signature is computed over the exact
  // bytes sent. Never call req.json() before constructEvent.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error(
      "Stripe signature verification failed",
      err instanceof Error ? err.message : String(err)
    );
    return apiError("VALIDATION_FAILED", "Invalid signature.", HTTP_STATUS.BAD_REQUEST);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      try {
        const result = await handleCheckoutCompleted(session, event.id);
        return NextResponse.json({ received: true, ...result });
      } catch (err) {
        console.error(
          "handleCheckoutCompleted failed",
          err instanceof Error ? err.message : String(err)
        );
        // INVALID_METADATA is a defensive rejection (e.g. plan=free slipping
        // through) — a genuine bad request, not a transient failure worth a
        // Stripe retry (AC5). Everything else is 500 so Stripe retries;
        // AC4 idempotence prevents double-processing on that retry.
        if (err instanceof StripeWebhookError && err.code === "INVALID_METADATA") {
          return apiError("VALIDATION_FAILED", "Invalid checkout metadata.", HTTP_STATUS.BAD_REQUEST);
        }
        return apiError("INTERNAL_ERROR", "Webhook processing failed.", HTTP_STATUS.INTERNAL);
      }
    }
    case "invoice.paid": {
      // No-op MVP — Stripe is used in mode "payment", not "subscription", so
      // invoice.paid isn't expected. Logged defensively; prepares the ground
      // for a future mode="subscription" migration (AC7).
      console.warn("invoice.paid received (no-op MVP — mode payment)", { eventId: event.id });
      return NextResponse.json({ received: true, action: "noop" });
    }
    default: {
      console.warn("Unhandled Stripe event", { type: event.type, eventId: event.id });
      return NextResponse.json({ received: true, action: "ignored" });
    }
  }
}
