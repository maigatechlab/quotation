import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { loginAs } from "./fixtures";
import { db } from "../src/lib/db";
import { subscriptionPayments, tenantEvents, tenants, user as userTable } from "../src/lib/schema";

const OWNER_EMAIL = "owner-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerTest1234!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

const TENANT_SLUG_1 = "e2e-owner-acme";
const TENANT_SLUG_2 = "e2e-owner-trial";

let superadminId: string;
let tenantId1: string;

async function seedOwnerData() {
  // Clean up if re-running
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

  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_1));
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_2));

  // Create superadmin via Better Auth signUp API (so password is hashed correctly)
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signupRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner E2E" }),
  });

  if (!signupRes.ok) {
    const text = await signupRes.text();
    throw new Error(`Failed to create owner user: ${text}`);
  }

  // Get the created user id and update role to superadmin
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

  // Seed tenants
  const now = new Date();
  const subscriptionEnd = new Date(now);
  subscriptionEnd.setDate(subscriptionEnd.getDate() + 20);

  const [tenant1] = await db
    .insert(tenants)
    .values({
      name: "Acme SARL E2E",
      slug: TENANT_SLUG_1,
      status: "active",
      plan: "pro",
      maxUsers: 5,
      subscriptionEnd,
    })
    .returning();

  tenantId1 = tenant1!.id;

  await db.insert(tenants).values({
    name: "Trial Co E2E",
    slug: TENANT_SLUG_2,
    status: "trial",
    plan: "free",
    maxUsers: 1,
  });

  // Seed payment
  const paidAt = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  await db.insert(subscriptionPayments).values({
    tenantId: tenantId1,
    amount: 25000,
    currency: "XOF",
    paymentMethod: "wave",
    paidAt,
    periodStart,
    periodEnd,
    billingCycle: "monthly",
    confirmedBy: superadminId,
  });

  // Seed event
  await db.insert(tenantEvents).values({
    tenantId: tenantId1,
    eventType: "created",
    actorId: superadminId,
    note: "E2E seed",
  });
}

async function cleanupOwnerData() {
  if (tenantId1) {
    await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId1));
    await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, tenantId1));
  }
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_1));
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_2));
  if (superadminId) {
    const { account } = await import("../src/lib/schema");
    await db.delete(account).where(eq(account.userId, superadminId));
    await db.delete(userTable).where(eq(userTable.id, superadminId));
  }
}

test.beforeAll(async () => {
  await seedOwnerData();
});

test.afterAll(async () => {
  await cleanupOwnerData();
});

test.describe("Owner Dashboard (superadmin access)", () => {
  test("superadmin se connecte et voit /owner dashboard", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner");
    await expect(page).toHaveURL("/owner");
    await expect(page.getByText("Owner Console")).toBeVisible();
    await expect(page.getByText("Vue d'ensemble")).toBeVisible();
  });

  test("admin non-superadmin est redirigé depuis /owner", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, "Administrateur");
    await page.goto("/owner");
    // Should be redirected to "/" (not owner console)
    await expect(page).not.toHaveURL("/owner");
  });

  test("non-authentifié est redirigé depuis /owner", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).not.toHaveURL("/owner");
  });

  test("/owner/tenants affiche tableau + pagination", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants");
    await expect(page).toHaveURL("/owner/tenants");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Acme SARL E2E")).toBeVisible();
  });

  test("filtre status=active filtre les rows", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants?status=active");
    await expect(page.getByRole("table")).toBeVisible();
    // Active tenant visible, trial tenant not
    await expect(page.getByText("Acme SARL E2E")).toBeVisible();
    await expect(page.getByText("Trial Co E2E")).not.toBeVisible();
  });

  test("export CSV retourne Content-Type text/csv avec BOM", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/v1/owner/tenants/export")),
      page.goto("/api/v1/owner/tenants/export"),
    ]);

    expect(response.headers()["content-type"]).toContain("text/csv");
    const body = await response.body();
    // BOM = 0xEF 0xBB 0xBF in UTF-8
    expect(body[0]).toBe(0xef);
    expect(body[1]).toBe(0xbb);
    expect(body[2]).toBe(0xbf);
  });

  test("layout owner : nav présente, Owner Console visible", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner");
    await expect(page.getByText("Owner Console")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tenants" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à l'app" })).toBeVisible();
  });
});
