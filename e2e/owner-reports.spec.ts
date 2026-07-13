import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { loginAs } from "./fixtures";
import { db } from "../src/lib/db";
import { subscriptionPayments, tenantEvents, tenants, user as userTable } from "../src/lib/schema";

const OWNER_EMAIL = "owner-reports-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerTest1234!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

const TENANT_SLUG_ACTIVE = "e2e-reports-active";
const TENANT_SLUG_RENEWAL = "e2e-reports-renewal";

let superadminId: string;
let tenantIdActive: string;
let tenantIdRenewal: string;

async function seedReportsData() {
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, OWNER_EMAIL))
    .limit(1);

  if (existing[0]) {
    const { account } = await import("../src/lib/schema");
    await db.delete(account).where(eq(account.userId, existing[0].id));
    await db.delete(userTable).where(eq(userTable.id, existing[0].id));
  }

  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_ACTIVE));
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_RENEWAL));

  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signupRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner Reports E2E" }),
  });
  if (!signupRes.ok) {
    const text = await signupRes.text();
    throw new Error(`Failed to create owner user: ${text}`);
  }

  const created = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, OWNER_EMAIL))
    .limit(1);
  superadminId = created[0]!.id;
  await db
    .update(userTable)
    .set({ role: "superadmin", emailVerified: true })
    .where(eq(userTable.id, superadminId));

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [tenantActive] = await db
    .insert(tenants)
    .values({
      name: "Reports Active Co E2E",
      slug: TENANT_SLUG_ACTIVE,
      status: "active",
      plan: "pro",
      maxUsers: 5,
      subscriptionEnd: new Date(now.getFullYear(), now.getMonth() + 2, 15),
    })
    .returning();
  tenantIdActive = tenantActive!.id;

  // Renewal-forecast target: subscriptionEnd falls in the calendar month *after* the current one.
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 10);
  const [tenantRenewal] = await db
    .insert(tenants)
    .values({
      name: "Reports Renewal Co E2E",
      slug: TENANT_SLUG_RENEWAL,
      status: "active",
      plan: "pro",
      maxUsers: 5,
      subscriptionEnd: nextMonthEnd,
    })
    .returning();
  tenantIdRenewal = tenantRenewal!.id;

  await db.insert(subscriptionPayments).values([
    {
      tenantId: tenantIdActive,
      amount: 25000,
      currency: "XOF",
      paymentMethod: "wave",
      paidAt: now,
      periodStart,
      periodEnd,
      billingCycle: "monthly",
      confirmedBy: superadminId,
    },
    {
      tenantId: tenantIdRenewal,
      amount: 25000,
      currency: "XOF",
      paymentMethod: "nitta",
      paidAt: now,
      periodStart,
      periodEnd,
      billingCycle: "monthly",
      confirmedBy: superadminId,
    },
  ]);

  await db.insert(tenantEvents).values({
    tenantId: tenantIdActive,
    eventType: "cancelled",
    actorId: superadminId,
    note: "E2E churn seed",
  });
}

async function cleanupReportsData() {
  for (const tenantId of [tenantIdActive, tenantIdRenewal]) {
    if (tenantId) {
      await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId));
      await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, tenantId));
    }
  }
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_ACTIVE));
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_RENEWAL));
  if (superadminId) {
    const { account } = await import("../src/lib/schema");
    await db.delete(account).where(eq(account.userId, superadminId));
    await db.delete(userTable).where(eq(userTable.id, superadminId));
  }
}

test.beforeAll(async () => {
  await seedReportsData();
});

test.afterAll(async () => {
  await cleanupReportsData();
});

test.describe("Owner Reports (/owner/reports)", () => {
  test("superadmin voit les 4 sections du rapport", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/reports");
    await expect(page).toHaveURL("/owner/reports");
    await expect(page.getByText("Rapport mensuel")).toBeVisible();
    await expect(page.getByText("Export paiements")).toBeVisible();
    await expect(page.getByText("Instantané des tenants")).toBeVisible();
    await expect(page.getByText("Renouvellements attendus le mois prochain")).toBeVisible();
  });

  test("admin non-superadmin est redirigé depuis /owner/reports", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, "Administrateur");
    await page.goto("/owner/reports");
    await expect(page).not.toHaveURL("/owner/reports");
  });

  test("non-authentifié est redirigé depuis /owner/reports", async ({ page }) => {
    await page.goto("/owner/reports");
    await expect(page).not.toHaveURL("/owner/reports");
  });

  test("export paiements retourne un CSV avec BOM et headers exacts", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    const from = new Date();
    from.setDate(1);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = new Date().toISOString().slice(0, 10);

    // page.goto aborts on downloads — fetch through the page's request context
    // instead (same cookies, no navigation).
    const response = await page.request.get(
      `/api/v1/owner/reports/payments/export?from=${fromStr}&to=${toStr}`
    );

    expect(response.headers()["content-type"]).toContain("text/csv");
    const body = await response.body();
    expect(body[0]).toBe(0xef);
    expect(body[1]).toBe(0xbb);
    expect(body[2]).toBe(0xbf);
    const text = body.toString("utf-8");
    const firstLine = text.slice(1).split("\r\n")[0];
    expect(firstLine).toBe(
      "date,tenant,slug,method,amount,currency,reference,periodStart,periodEnd,billingCycle,confirmedBy,notes"
    );
  });

  test("plage inversée retourne 400 sans téléchargement", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    const response = await page.request.get(
      "/api/v1/owner/reports/payments/export?from=2026-06-10&to=2026-06-01"
    );
    expect(response.status()).toBe(400);
  });

  test("section prévisions affiche le tenant du mois suivant et un total", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/reports");
    await expect(page.getByText("Reports Renewal Co E2E")).toBeVisible();
    await expect(page.getByText("Total prévu")).toBeVisible();
  });
});
