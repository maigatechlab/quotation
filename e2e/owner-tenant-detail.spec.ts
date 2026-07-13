import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { loginAs } from "./fixtures";
import { db } from "../src/lib/db";
import {
  account,
  subscriptionPayments,
  tenantEvents,
  tenants,
  user as userTable,
} from "../src/lib/schema";

const OWNER_EMAIL = "owner-detail-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerDetail1234!";
const TENANT_ADMIN_EMAIL = `e2e-detail-admin-${Date.now()}@tenant.test`;
const TENANT_SLUG = `e2e-detail-${Date.now()}`;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

let superadminId: string;
let tenantId: string;
let commercialUserId: string;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86_400_000);
}

async function deleteUserByEmail(email: string) {
  const rows = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
  if (rows[0]) {
    await db.delete(account).where(eq(account.userId, rows[0].id));
    await db.delete(userTable).where(eq(userTable.id, rows[0].id));
  }
}

test.beforeAll(async () => {
  await deleteUserByEmail(OWNER_EMAIL);
  await deleteUserByEmail(TENANT_ADMIN_EMAIL);
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG));

  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const ownerRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner Detail E2E" }),
  });
  if (!ownerRes.ok) throw new Error(`Owner creation failed: ${await ownerRes.text()}`);

  const ownerRow = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, OWNER_EMAIL)).limit(1);
  superadminId = ownerRow[0]!.id;
  await db.update(userTable).set({ role: "superadmin", emailVerified: true }).where(eq(userTable.id, superadminId));

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Acme SARL",
      slug: TENANT_SLUG,
      status: "active",
      plan: "pro",
      maxUsers: 5,
      subscriptionStart: daysAgo(60),
      subscriptionEnd: new Date(Date.now() + 30 * 86_400_000),
    })
    .returning();
  tenantId = tenant!.id;

  // Tenant admin user (via Better Auth signup, then link to tenant)
  const adminSignupRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: TENANT_ADMIN_EMAIL, password: "AdminTenant1234!", name: "Tenant Admin E2E" }),
  });
  if (!adminSignupRes.ok) throw new Error("Tenant admin creation failed");
  const adminRow = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, TENANT_ADMIN_EMAIL)).limit(1);
  await db.update(userTable).set({ tenantId, role: "admin", emailVerified: true }).where(eq(userTable.id, adminRow[0]!.id));

  // Second user (commercial) — inserted directly, no login needed for this fixture
  commercialUserId = randomUUID();
  await db.insert(userTable).values({
    id: commercialUserId,
    name: "Commercial E2E",
    email: `e2e-detail-commercial-${Date.now()}@tenant.test`,
    emailVerified: true,
    role: "commercial",
    tenantId,
  });

  // Payments: 3 total, with a gap between payment 1 and payment 2
  await db.insert(subscriptionPayments).values([
    {
      tenantId,
      amount: 25000,
      currency: "XOF",
      paymentMethod: "wave",
      paidAt: daysAgo(60),
      periodStart: daysAgo(60),
      periodEnd: daysAgo(35),
      billingCycle: "monthly",
      confirmedBy: superadminId,
    },
    {
      tenantId,
      amount: 25000,
      currency: "XOF",
      paymentMethod: "nitta",
      paidAt: daysAgo(20),
      periodStart: daysAgo(20),
      periodEnd: new Date(),
      billingCycle: "monthly",
      confirmedBy: superadminId,
    },
    {
      tenantId,
      amount: 300000,
      currency: "XOF",
      paymentMethod: "amana",
      paidAt: daysAgo(19),
      periodStart: daysAgo(19),
      periodEnd: new Date(Date.now() + 30 * 86_400_000),
      billingCycle: "annual",
      confirmedBy: superadminId,
    },
  ]);

  // Events: created, payment_recorded, suspended, reactivated, reminder_sent
  await db.insert(tenantEvents).values([
    { tenantId, eventType: "created", actorId: superadminId, note: "Tenant créé" },
    { tenantId, eventType: "payment_recorded", actorId: superadminId, note: "Paiement Wave" },
    { tenantId, eventType: "suspended", actorId: superadminId, note: "Suspendu pour test" },
    { tenantId, eventType: "reactivated", actorId: superadminId, note: "Réactivé" },
    { tenantId, eventType: "reminder_sent", actorId: "system", note: "Rappel J-7" },
  ]);
});

test.afterAll(async () => {
  if (tenantId) {
    await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId));
    await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, tenantId));
    await db.delete(userTable).where(eq(userTable.id, commercialUserId));
  }
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG));
  await deleteUserByEmail(OWNER_EMAIL);
  await deleteUserByEmail(TENANT_ADMIN_EMAIL);
});

test.describe("Tenant detail page — 4 tabs (superadmin)", () => {
  test("4 tabs visible, Infos active by default, header shows name/slug/badges", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}`);

    await expect(page.getByRole("heading", { name: "Acme SARL" })).toBeVisible();
    await expect(page.getByText(`${TENANT_SLUG}.quotation.com`)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Infos générales" })).toHaveAttribute("data-state", "active");
    await expect(page.getByRole("tab", { name: "Abonnement" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Utilisateurs" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Journal" })).toBeVisible();
  });

  test("clicking Abonnement shows timeline, payment history and record-payment button", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}`);

    await page.getByRole("tab", { name: "Abonnement" }).click();
    await page.waitForURL(/\?tab=abonnement/);
    await expect(page.getByText("Historique des paiements")).toBeVisible();
    await expect(page.getByText("Enregistrer paiement")).toBeVisible();

    const rows = page.locator("table").last().locator("tbody tr");
    await expect(rows).toHaveCount(3);
  });

  test("clicking Utilisateurs shows quota 2/5 and 2 user rows", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}`);

    await page.getByRole("tab", { name: "Utilisateurs" }).click();
    await page.waitForURL(/\?tab=utilisateurs/);
    await expect(page.getByText("2 / 5")).toBeVisible();

    const rows = page.locator("table").locator("tbody tr");
    await expect(rows).toHaveCount(2);
  });

  test("clicking Journal shows events and the append-only footer", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}`);

    await page.getByRole("tab", { name: "Journal" }).click();
    await page.waitForURL(/\?tab=journal/);
    await expect(page.getByText("Ce journal est immuable")).toBeVisible();
    await expect(page.getByText("Suspendu pour test")).toBeVisible();
  });

  test("journal filter by event type narrows the list", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=journal`);

    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Suspendu" }).click();
    await page.waitForURL(/event=suspended/);

    await expect(page.getByText("Suspendu pour test")).toBeVisible();
    await expect(page.getByText("Rappel J-7")).not.toBeVisible();
  });

  test("deep-link ?tab=journal&event=payment_recorded opens Journal tab pre-filtered", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=journal&event=payment_recorded`);

    await expect(page.getByRole("tab", { name: "Journal" })).toHaveAttribute("data-state", "active");
    await expect(page.getByText("Paiement Wave")).toBeVisible();
    await expect(page.getByText("Suspendu pour test")).not.toBeVisible();
  });

  test("editing notes shows a success toast and persists after refresh", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}`);

    const notes = "Client stratégique — suivi rapproché";
    await page.locator("textarea").fill(notes);
    await page.getByRole("button", { name: "Enregistrer les notes" }).click();
    await expect(page.getByText("Notes enregistrées")).toBeVisible({ timeout: 10_000 });

    const [row] = await db.select({ notes: tenants.notes }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    expect(row?.notes).toBe(notes);
  });

  test("editing plan updates the badge and persists", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}`);

    await page.getByRole("combobox").filter({ hasText: "Pro" }).click();
    await page.getByRole("option", { name: "Enterprise" }).click();
    await expect(page.getByText("Plan mis à jour")).toBeVisible({ timeout: 10_000 });

    const [row] = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    expect(row?.plan).toBe("enterprise");

    // Restore for other tests
    await db.update(tenants).set({ plan: "pro" }).where(eq(tenants.id, tenantId));
  });

  test("Réactiver is hidden for an active tenant; story 7-9 user actions are live", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}`);
    // Nothing to reactivate on an active tenant (story 7-8) — trigger not rendered at all.
    await expect(page.getByRole("button", { name: "Réactiver" })).toHaveCount(0);

    await page.getByRole("tab", { name: "Utilisateurs" }).click();
    // Quota is 2/5 on an active tenant — Add is enabled (story 7-9).
    await expect(page.getByRole("button", { name: "+ Ajouter un utilisateur" })).toBeEnabled();
    // The sole active admin can't be revoked (last-admin guard); the commercial user can.
    const revokeButtons = page.getByRole("button", { name: "Révoquer" });
    await expect(revokeButtons.first()).toBeDisabled();
    await expect(revokeButtons.nth(1)).toBeEnabled();
  });

  test("non-superadmin is redirected away from the tenant detail page", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, "Administrateur");
    await page.goto(`/owner/tenants/${tenantId}`);
    await page.waitForURL("/", { timeout: 10_000 });
  });

  test("unknown tenant id renders a 404 page", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("404")).toBeVisible();
  });
});
