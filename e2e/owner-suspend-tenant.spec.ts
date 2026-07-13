import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { loginAs } from "./fixtures";
import { db } from "../src/lib/db";
import { account, tenants, tenantEvents, user as userTable } from "../src/lib/schema";

const OWNER_EMAIL = "owner-suspend-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerSuspend1234!";
const TENANT_SLUG = `e2e-suspend-${Date.now()}`;
const TENANT_ADMIN_EMAIL = `e2e-tenant-admin-${Date.now()}@tenant.test`;

let superadminId: string;
let tenantId: string;

async function deleteUserByEmail(email: string) {
  const rows = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (rows[0]) {
    await db.delete(account).where(eq(account.userId, rows[0].id));
    await db.delete(userTable).where(eq(userTable.id, rows[0].id));
  }
}

test.beforeAll(async () => {
  // Clean up previous runs
  await deleteUserByEmail(OWNER_EMAIL);
  await deleteUserByEmail(TENANT_ADMIN_EMAIL);
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG));

  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Create superadmin
  const ownerRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner Suspend E2E" }),
  });
  if (!ownerRes.ok) throw new Error(`Owner creation failed: ${await ownerRes.text()}`);

  const ownerRow = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, OWNER_EMAIL))
    .limit(1);
  superadminId = ownerRow[0]!.id;
  await db.update(userTable).set({ role: "superadmin", emailVerified: true }).where(eq(userTable.id, superadminId));

  // Create tenant admin user
  const tenantAdminRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: TENANT_ADMIN_EMAIL, password: "AdminTenant1234!", name: "Tenant Admin E2E" }),
  });
  if (!tenantAdminRes.ok) throw new Error(`Tenant admin creation failed`);

  const tenantAdminRow = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, TENANT_ADMIN_EMAIL))
    .limit(1);

  // Seed tenant
  const [tenant] = await db.insert(tenants).values({
    name: "E2E Suspend Co",
    slug: TENANT_SLUG,
    status: "active",
    plan: "free",
    maxUsers: 3,
  }).returning();
  tenantId = tenant!.id;

  // Link tenant admin to tenant
  await db.update(userTable).set({ tenantId, role: "admin" }).where(eq(userTable.id, tenantAdminRow[0]!.id));
});

test.afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG));
  await deleteUserByEmail(OWNER_EMAIL);
  await deleteUserByEmail(TENANT_ADMIN_EMAIL);
});

test("superadmin can access tenant detail page", async ({ page }) => {
  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto(`/owner/tenants/${tenantId}`);
  await expect(page.getByRole("heading", { name: "E2E Suspend Co" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspendre" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Annuler définitivement/i })).toBeEnabled();
});

test("suspend without reason shows inline error", async ({ page }) => {
  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto(`/owner/tenants/${tenantId}`);
  await page.getByRole("button", { name: "Suspendre" }).click();
  await page.getByRole("button", { name: "Confirmer la suspension" }).click();
  await expect(page.getByText("motif de suspension est requis")).toBeVisible();
});

test("suspend with reason succeeds and updates status", async ({ page }) => {
  // Ensure tenant is active
  await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenantId));
  // Clear any prior events
  await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, tenantId));

  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto(`/owner/tenants/${tenantId}`);
  await page.getByRole("button", { name: "Suspendre" }).click();

  // Select reason
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Non-paiement" }).click();

  await page.getByRole("button", { name: "Confirmer la suspension" }).click();

  // Toast success and page refresh (badge + toast both match — take first)
  await expect(page.getByText(/suspendu/i).first()).toBeVisible({ timeout: 10_000 });

  // Verify DB state
  const [row] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  expect(row?.status).toBe("suspended");

  // Verify event inserted
  const events = await db.select().from(tenantEvents).where(eq(tenantEvents.tenantId, tenantId)).limit(1);
  expect(events[0]?.eventType).toBe("suspended");
});

test("suspend already-suspended tenant shows conflict toast", async ({ page }) => {
  await db.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, tenantId));

  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto(`/owner/tenants/${tenantId}`);

  // Suspend button should be disabled for suspended tenant
  await expect(page.getByRole("button", { name: "Suspendre" })).toBeDisabled();
});

test("cancel: slug-check blocks until correct slug entered", async ({ page }) => {
  await db.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenantId));

  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto(`/owner/tenants/${tenantId}`);

  await page.getByRole("button", { name: /Annuler définitivement/i }).click();

  // Confirm button should be disabled initially
  await expect(page.getByRole("button", { name: "Confirmer l'annulation" })).toBeDisabled();

  // Type wrong slug
  await page.locator("#cancel-slug-confirm").fill("wrong-slug");
  await expect(page.getByRole("button", { name: "Confirmer l'annulation" })).toBeDisabled();

  // Type correct slug
  await page.locator("#cancel-slug-confirm").fill(TENANT_SLUG);
  await expect(page.getByRole("button", { name: "Confirmer l'annulation" })).toBeEnabled();

  await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
  await expect(page.getByText(/annulé définitivement/i)).toBeVisible({ timeout: 10_000 });

  const [row] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  expect(row?.status).toBe("cancelled");
});
