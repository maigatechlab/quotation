import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { loginAs } from "./fixtures";
import { db } from "../src/lib/db";
import { account, tenants, user as userTable } from "../src/lib/schema";

const OWNER_EMAIL = "owner-users-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerUsers1234!";
const TENANT_SLUG = `e2e-users-${Date.now()}`;
const TENANT_ADMIN_EMAIL = `e2e-users-admin-${Date.now()}@tenant.test`;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

let superadminId: string;
let tenantId: string;
let tenantAdminId: string;

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
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner Users E2E" }),
  });
  if (!ownerRes.ok) throw new Error(`Owner creation failed: ${await ownerRes.text()}`);
  const ownerRow = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, OWNER_EMAIL)).limit(1);
  superadminId = ownerRow[0]!.id;
  await db.update(userTable).set({ role: "superadmin", emailVerified: true }).where(eq(userTable.id, superadminId));

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Users E2E Co",
      slug: TENANT_SLUG,
      status: "active",
      plan: "pro",
      maxUsers: 3,
    })
    .returning();
  tenantId = tenant!.id;

  const tenantAdminRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: TENANT_ADMIN_EMAIL, password: "AdminTenant1234!", name: "Tenant Admin E2E" }),
  });
  if (!tenantAdminRes.ok) throw new Error("Tenant admin creation failed");
  const tenantAdminRow = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, TENANT_ADMIN_EMAIL)).limit(1);
  tenantAdminId = tenantAdminRow[0]!.id;
  await db.update(userTable).set({ tenantId, role: "admin", emailVerified: true }).where(eq(userTable.id, tenantAdminId));
});

test.afterAll(async () => {
  if (tenantId) {
    await db.delete(userTable).where(eq(userTable.tenantId, tenantId));
  }
  await db.delete(tenants).where(eq(tenants.slug, TENANT_SLUG));
  await deleteUserByEmail(OWNER_EMAIL);
  await deleteUserByEmail(TENANT_ADMIN_EMAIL);
});

// Serial: later tests build on mutations made by earlier ones (quota state,
// added/revoked users) within the same seeded tenant.
test.describe.serial("Owner — gestion des utilisateurs du tenant", () => {
  test("superadmin voit la liste et le quota 1/3", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    await expect(page.getByText("1 / 3")).toBeVisible();
    const rows = page.locator("table").locator("tbody tr");
    await expect(rows).toHaveCount(1);
  });

  test("non-superadmin redirigé, pas d'accès à la gestion des utilisateurs", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, "Administrateur");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    await page.waitForURL("/", { timeout: 10_000 });
  });

  test("le rôle superadmin n'est pas proposé dans le formulaire d'ajout", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    await page.getByRole("button", { name: "+ Ajouter un utilisateur" }).click();
    await page.getByRole("combobox").click();
    await expect(page.getByRole("option", { name: "Administrateur" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Commercial" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Opérateur" })).toBeVisible();
    await expect(page.getByRole("option", { name: "superadmin", exact: false })).toHaveCount(0);
  });

  test("ajout avec email déjà utilisé → erreur inline sur le champ email", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    await page.getByRole("button", { name: "+ Ajouter un utilisateur" }).click();
    await page.getByLabel("Nom *").fill("Dup User");
    await page.getByLabel("Email *").fill(TENANT_ADMIN_EMAIL);
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText("Un utilisateur avec cet email existe déjà")).toBeVisible();
  });

  test("ajout valide → toast succès, liste et quota mis à jour (2/3)", async ({ page }) => {
    const newEmail = `e2e-users-commercial-${Date.now()}@tenant.test`;
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    await page.getByRole("button", { name: "+ Ajouter un utilisateur" }).click();
    await page.getByLabel("Nom *").fill("Commercial E2E");
    await page.getByLabel("Email *").fill(newEmail);
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText(/ajouté/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("2 / 3")).toBeVisible();

    const rows = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, newEmail)).limit(1);
    expect(rows[0]).toBeTruthy();
  });

  test("quota plein (3/3) → bouton Ajouter désactivé", async ({ page }) => {
    const lastEmail = `e2e-users-operateur-${Date.now()}@tenant.test`;
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    await page.getByRole("button", { name: "+ Ajouter un utilisateur" }).click();
    await page.getByLabel("Nom *").fill("Operateur E2E");
    await page.getByLabel("Email *").fill(lastEmail);
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: "Opérateur" }).click();
    await page.getByRole("button", { name: "Ajouter", exact: true }).click();
    await expect(page.getByText(/ajouté/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("3 / 3")).toBeVisible();

    await expect(page.getByRole("button", { name: "+ Ajouter un utilisateur" })).toBeDisabled();
  });

  test("révoquer le seul admin actif → refusé (dernier admin)", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    const adminRow = page.locator("tbody tr", { hasText: TENANT_ADMIN_EMAIL });
    await expect(adminRow.getByRole("button", { name: "Révoquer" })).toBeDisabled();
  });

  test("révoquer un utilisateur commercial → toast + statut Désactivé + quota libéré (2/3)", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    const commercialRow = page.locator("tbody tr", { hasText: "Commercial E2E" });
    await commercialRow.getByRole("button", { name: "Révoquer" }).click();
    await page.getByRole("button", { name: "Confirmer la révocation" }).click();
    await expect(page.getByText(/révoqué/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("2 / 3")).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: "Commercial E2E" }).getByText("Désactivé")).toBeVisible();
  });

  test("réactiver l'utilisateur révoqué → statut Actif + quota remonte (3/3)", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${tenantId}?tab=utilisateurs`);
    const commercialRow = page.locator("tbody tr", { hasText: "Commercial E2E" });
    await commercialRow.getByRole("button", { name: "Réactiver" }).click();
    await page.getByRole("button", { name: "Confirmer la réactivation" }).click();
    await expect(page.getByText(/réactivé/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("3 / 3")).toBeVisible();
    await expect(page.locator("tbody tr", { hasText: "Commercial E2E" }).getByText("Actif")).toBeVisible();
  });
});
