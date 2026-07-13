import { expect, test } from "@playwright/test";
import { eq, and } from "drizzle-orm";
import { loginAs } from "./fixtures";
import { db } from "../src/lib/db";
import { subscriptionPayments, tenantEvents, tenants, user as userTable } from "../src/lib/schema";


const OWNER_EMAIL = "owner-pay-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerPay1234!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

const TENANT_SLUG_ACTIVE = "e2e-pay-active";
const TENANT_SLUG_SUSPENDED = "e2e-pay-suspended";

let superadminId: string;
let activeTenantId: string;
let suspendedTenantId: string;

async function seedData() {
  // Clean previous runs
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
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_SUSPENDED));

  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const signupRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner Pay E2E" }),
  });
  if (!signupRes.ok) throw new Error(`Failed to create owner: ${await signupRes.text()}`);

  const [created] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, OWNER_EMAIL))
    .limit(1);

  superadminId = created!.id;
  await db
    .update(userTable)
    .set({ role: "superadmin", emailVerified: true })
    .where(eq(userTable.id, superadminId));

  // Create active tenant
  const [at] = await db
    .insert(tenants)
    .values({ name: "Acme Pay E2E", slug: TENANT_SLUG_ACTIVE, status: "active", plan: "pro", maxUsers: 5 })
    .returning({ id: tenants.id });
  activeTenantId = at!.id;

  // Create suspended tenant
  const [st] = await db
    .insert(tenants)
    .values({ name: "Suspended Pay E2E", slug: TENANT_SLUG_SUSPENDED, status: "suspended", plan: "pro", maxUsers: 5 })
    .returning({ id: tenants.id });
  suspendedTenantId = st!.id;

  // Create admin user for active tenant via Better Auth
  const adminSignupRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({
      email: "tenant-admin-pay@quotation.test",
      password: "Tenant1234!",
      name: "Tenant Admin Pay",
    }),
  });
  if (adminSignupRes.ok) {
    const [adminUser] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, "tenant-admin-pay@quotation.test"))
      .limit(1);
    if (adminUser) {
      await db
        .update(userTable)
        .set({ role: "admin", tenantId: activeTenantId, emailVerified: true })
        .where(eq(userTable.id, adminUser.id));
    }
  }
}

async function cleanupData() {
  if (activeTenantId) {
    await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, activeTenantId));
    await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, activeTenantId));
  }
  if (suspendedTenantId) {
    await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, suspendedTenantId));
    await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, suspendedTenantId));
  }

  const tenantAdmin = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, "tenant-admin-pay@quotation.test"))
    .limit(1);
  if (tenantAdmin[0]) {
    const { account } = await import("../src/lib/schema");
    await db.delete(account).where(eq(account.userId, tenantAdmin[0].id));
    await db.delete(userTable).where(eq(userTable.id, tenantAdmin[0].id));
  }

  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_ACTIVE));
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG_SUSPENDED));

  if (superadminId) {
    const { account } = await import("../src/lib/schema");
    await db.delete(account).where(eq(account.userId, superadminId));
    await db.delete(userTable).where(eq(userTable.id, superadminId));
  }
}

test.beforeAll(async () => {
  await seedData();
});

test.afterAll(async () => {
  await cleanupData();
});

test.describe("Record Payment Modal (superadmin)", () => {
  test("superadmin ouvre le modal depuis /owner/tenants", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants");
    await expect(page.getByText("Acme Pay E2E")).toBeVisible();

    // Open actions dropdown for this tenant row
    const row = page.locator("tr", { hasText: "Acme Pay E2E" });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByText("Enregistrer paiement").click();

    // Modal should open with tenant name
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Enregistrer un paiement")).toBeVisible();
    await expect(page.getByText("Tenant : Acme Pay E2E")).toBeVisible();
  });

  test("soumission sans méthode → erreur en ligne, pas de fetch", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants");

    const row = page.locator("tr", { hasText: "Acme Pay E2E" });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByText("Enregistrer paiement").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Fill amount only, leave method empty
    await page.locator("#amount").fill("25000");
    await page.getByRole("button", { name: "Enregistrer le paiement" }).click();

    // Validation error visible, no navigation/close
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("montant décimal → erreur en ligne", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants");

    const row = page.locator("tr", { hasText: "Acme Pay E2E" });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByText("Enregistrer paiement").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Select method
    await page.locator("#paymentMethod").click();
    await page.getByRole("option", { name: "Wave" }).click();

    // Enter decimal amount
    await page.locator("#amount").fill("25000.50");
    await page.getByRole("button", { name: "Enregistrer le paiement" }).click();

    // The amount input carries step="1", so native form validation blocks the
    // submit on a decimal value before the Zod message can render.
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect
      .poll(async () =>
        page.locator("#amount").evaluate((el) => (el as HTMLInputElement).validity.stepMismatch)
      )
      .toBe(true);
  });

  test("soumission valide → toast success + modal fermé + page refresh", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants");

    const row = page.locator("tr", { hasText: "Acme Pay E2E" });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByText("Enregistrer paiement").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Fill form
    await page.locator("#paymentMethod").click();
    await page.getByRole("option", { name: "Wave" }).click();
    await page.locator("#amount").fill("25000");
    // paidAt defaults to today

    await page.getByRole("button", { name: "Enregistrer le paiement" }).click();

    // Toast success — fr-FR grouping uses a narrow no-break space (U+202F).
    await expect(page.locator("[data-sonner-toast]").getByText(/25[\s  ]000/)).toBeVisible({ timeout: 10_000 });

    // Modal closed
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });
  });

  test("paiement inséré en base après soumission valide", async ({ page }) => {
    // Verify via DB that payment exists (seeded in previous test or new one)
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants");

    const row = page.locator("tr", { hasText: "Acme Pay E2E" });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByText("Enregistrer paiement").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.locator("#paymentMethod").click();
    await page.getByRole("option", { name: "Nitta" }).click();
    await page.locator("#amount").fill("10000");
    await page.getByRole("button", { name: "Enregistrer le paiement" }).click();

    // Wait for modal to close
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    // Verify in DB
    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(
        and(
          eq(subscriptionPayments.tenantId, activeTenantId),
          eq(subscriptionPayments.paymentMethod, "nitta")
        )
      )
      .limit(1);
    expect(payments.length).toBe(1);
    expect(payments[0]!.amount).toBe(10000);
  });

  test("tenant suspendu + checkbox réactiver → statut passe à actif", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants");

    const row = page.locator("tr", { hasText: "Suspended Pay E2E" });
    await row.getByRole("button", { name: "Actions" }).click();
    await page.getByText("Enregistrer paiement").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Checkbox "Réactiver" visible but unchecked by default (AC2)
    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    await page.locator("#paymentMethod").click();
    await page.getByRole("option", { name: "Wave" }).click();
    await page.locator("#amount").fill("25000");

    await checkbox.check();

    await page.getByRole("button", { name: "Enregistrer le paiement" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    // Verify tenant status changed to active in DB
    const [updatedTenant] = await db
      .select({ status: tenants.status })
      .from(tenants)
      .where(eq(tenants.id, suspendedTenantId))
      .limit(1);
    expect(updatedTenant?.status).toBe("active");
  });

  test("non-superadmin → 403 sur POST /api/v1/owner/tenants/[id]/payments", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, "Administrateur");

    const res = await page.request.post(
      `/api/v1/owner/tenants/${activeTenantId}/payments`,
      {
        data: {
          paymentMethod: "wave",
          amount: 25000,
          paidAt: new Date().toISOString(),
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
          billingCycle: "monthly",
          reactivateIfSuspended: false,
        },
      }
    );
    expect(res.status()).toBe(403);
  });

  test("utilisateur non authentifié → 401 sur POST /api/v1/owner/tenants/[id]/payments", async ({
    page,
  }) => {
    const res = await page.request.post(
      `/api/v1/owner/tenants/${activeTenantId}/payments`,
      {
        data: {
          paymentMethod: "wave",
          amount: 25000,
          paidAt: new Date().toISOString(),
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
          billingCycle: "monthly",
          reactivateIfSuspended: false,
        },
      }
    );
    expect(res.status()).toBe(401);
  });
});
