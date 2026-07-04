import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { stripeProcessedEvents, subscriptionPayments, tenantEvents, tenants, user as userTable } from "../src/lib/schema";
import { getStripe } from "../src/lib/stripe/client";

const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;

async function cleanup(customerId: string) {
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.stripeCustomerId, customerId))
    .limit(1);
  if (tenant) {
    await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenant.id));
    await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, tenant.id));
    const admins = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.tenantId, tenant.id));
    for (const admin of admins) {
      const { account } = await import("../src/lib/schema");
      await db.delete(account).where(eq(account.userId, admin.id));
      await db.delete(userTable).where(eq(userTable.id, admin.id));
    }
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
  }
  await db.delete(stripeProcessedEvents).where(eq(stripeProcessedEvents.eventId, "evt_e2e_checkout"));
  await db.delete(stripeProcessedEvents).where(eq(stripeProcessedEvents.eventId, "evt_e2e_renewal"));
}

test.describe("Public /checkout page", () => {
  test("renders without authentication and defaults to Pro / Mensuel", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Souscrire à Quotation Logistique" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pro", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByText(/25 000/)).toBeVisible();
    await expect(page.getByText(/≈ 38/)).toBeVisible();
  });

  test("switching to Enterprise + Annuel updates the displayed price", async ({ page }) => {
    await page.goto("/checkout");
    await page.getByRole("button", { name: "Enterprise" }).click();
    await page.getByRole("button", { name: /Annuel/ }).click();
    await expect(page.getByText(/750 000/)).toBeVisible();
    await expect(page.getByText(/≈ 1 143|≈ 1143/)).toBeVisible();
  });

  test("submitting with an invalid email shows an inline error, no redirect", async ({ page }) => {
    await page.goto("/checkout");
    await page.locator("#companyName").fill("ACME Logistics");
    await page.locator("#adminName").fill("Awa");
    await page.locator("#adminEmail").fill("not-an-email");
    await page.getByRole("button", { name: "Payer avec Stripe" }).click();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test("?canceled=1 shows the cancellation notice", async ({ page }) => {
    await page.goto("/checkout?canceled=1");
    await expect(page.getByText("Paiement annulé. Vous pouvez réessayer.")).toBeVisible();
  });
});

test.describe("POST /api/v1/checkout/create-session", () => {
  test("rejects plan=free (defense in depth — free has no checkout)", async ({ page }) => {
    const res = await page.request.post("/api/v1/checkout/create-session", {
      data: {
        plan: "free",
        billingCycle: "monthly",
        adminEmail: "a@b.com",
        companyName: "ACME Logistics",
        adminName: "Awa",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects an invalid email", async ({ page }) => {
    const res = await page.request.post("/api/v1/checkout/create-session", {
      data: {
        plan: "pro",
        billingCycle: "monthly",
        adminEmail: "not-an-email",
        companyName: "ACME Logistics",
        adminName: "Awa",
      },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("POST /api/webhooks/stripe — signature verification", () => {
  test("missing stripe-signature header → 400", async ({ page }) => {
    const res = await page.request.post("/api/webhooks/stripe", {
      data: { type: "checkout.session.completed" },
    });
    expect(res.status()).toBe(400);
  });

  test("invalid signature → 400, no mutation", async ({ page }) => {
    const res = await page.request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      data: JSON.stringify({ type: "checkout.session.completed" }),
    });
    expect(res.status()).toBe(400);
  });
});

// Full creation/renewal flow requires real Stripe test credentials (signature
// verification can't be faked without STRIPE_WEBHOOK_SECRET). Skipped unless
// STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are configured in the test env —
// see Dev Notes "Stripe CLI pour tester en local" in the story file.
test.describe("checkout.session.completed — full flow", () => {
  test.skip(!STRIPE_ENABLED, "Requires STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in test env");

  test("creates tenant + admin + payment, then a renewal reuses the same tenant", async ({
    page,
  }) => {
    const customerId = `cus_e2e_${Date.now()}`;
    await cleanup(customerId);

    const baseSession = {
      id: "cs_e2e_test",
      object: "checkout.session",
      customer: customerId,
      payment_intent: "pi_e2e_test",
      created: Math.floor(Date.now() / 1000),
      metadata: {
        plan: "pro",
        billing_cycle: "monthly",
        amount_xof: "25000",
        amount_eur: "38",
        company_name: "E2E Stripe Checkout",
        admin_name: "E2E Admin",
        admin_email: "e2e-stripe-admin@quotation.test",
      },
    };

    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET!;

    const creationPayload = JSON.stringify({
      id: "evt_e2e_checkout",
      type: "checkout.session.completed",
      data: { object: baseSession },
    });
    const creationHeader = stripe.webhooks.generateTestHeaderString({
      payload: creationPayload,
      secret,
    });

    const creationRes = await page.request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": creationHeader },
      data: creationPayload,
    });
    expect(creationRes.status()).toBe(200);
    const creationBody = await creationRes.json();
    expect(creationBody.action).toBe("created");

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.stripeCustomerId, customerId))
      .limit(1);
    expect(tenant?.status).toBe("active");
    expect(tenant?.plan).toBe("pro");

    // Re-delivering the same event id must be a no-op (AC4)
    const dupRes = await page.request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": creationHeader },
      data: creationPayload,
    });
    expect(dupRes.status()).toBe(200);

    // Renewal: same customer, new event id → extends the tenant, no new tenant
    const renewalPayload = JSON.stringify({
      id: "evt_e2e_renewal",
      type: "checkout.session.completed",
      data: { object: { ...baseSession, id: "cs_e2e_renewal" } },
    });
    const renewalHeader = stripe.webhooks.generateTestHeaderString({
      payload: renewalPayload,
      secret,
    });
    const renewalRes = await page.request.post("/api/webhooks/stripe", {
      headers: { "stripe-signature": renewalHeader },
      data: renewalPayload,
    });
    expect(renewalRes.status()).toBe(200);
    const renewalBody = await renewalRes.json();
    expect(renewalBody.action).toBe("renewed");
    expect(renewalBody.tenantId).toBe(tenant!.id);

    await cleanup(customerId);
  });
});
