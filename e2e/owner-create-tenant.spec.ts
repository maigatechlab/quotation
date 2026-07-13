import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { loginAs } from "./fixtures";
import { db } from "../src/lib/db";
import { account, tenants, user as userTable } from "../src/lib/schema";

const OWNER_EMAIL = "owner-create-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerTest1234!";

const EXISTING_SLUG = "e2e-create-existing";
const NEW_SLUG = `e2e-create-new-${Date.now()}`;
const NEW_ADMIN_EMAIL = `e2e-admin-${Date.now()}@trans-sahel.test`;

let superadminId: string;

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
  await deleteUserByEmail(OWNER_EMAIL);
  await deleteUserByEmail(NEW_ADMIN_EMAIL);
  await db.delete(tenants).where(eq(tenants.slug, EXISTING_SLUG));
  await db.delete(tenants).where(eq(tenants.slug, NEW_SLUG));

  // Superadmin via Better Auth sign-up endpoint (correct password hashing)
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner Create E2E" }),
  });
  if (!res.ok) throw new Error(`Failed to create owner: ${await res.text()}`);

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

  // Pre-seed a tenant to test slug conflict
  await db.insert(tenants).values({
    name: "Existing Co",
    slug: EXISTING_SLUG,
    status: "trial",
    plan: "free",
    maxUsers: 1,
  });
});

test.afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.slug, EXISTING_SLUG));
  await db.delete(tenants).where(eq(tenants.slug, NEW_SLUG));
  await deleteUserByEmail(NEW_ADMIN_EMAIL);
  if (superadminId) {
    await db.delete(account).where(eq(account.userId, superadminId));
    await db.delete(userTable).where(eq(userTable.id, superadminId));
  }
});

test.describe("Owner — création de tenant", () => {
  test("superadmin voit le formulaire de création", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants/new");
    await expect(page).toHaveURL("/owner/tenants/new");
    await expect(page.getByLabel("Nom de la société *")).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer le tenant" })).toBeVisible();
  });

  test("le slug s'auto-génère depuis le nom de la société", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants/new");
    await page.getByLabel("Nom de la société *").fill("Trans Sahel Logistics");
    await expect(page.locator("#slug")).toHaveValue("trans-sahel-logistics");
  });

  test("soumission sans nom → erreur en ligne, pas de redirection", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants/new");
    // Clear the auto-derived slug requirement by leaving name empty
    await page.getByRole("button", { name: "Créer le tenant" }).click();
    await expect(page).toHaveURL("/owner/tenants/new");
    await expect(page.getByText("Le nom de la société est requis")).toBeVisible();
  });

  test("slug déjà utilisé → erreur 409 en ligne", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants/new");
    await page.getByLabel("Nom de la société *").fill("Existing Dup");
    await page.locator("#slug").fill(EXISTING_SLUG);
    await page.getByLabel("Nom de l'administrateur *").fill("Dup Admin");
    await page.getByLabel("Email de l'administrateur *").fill(`dup-${Date.now()}@x.test`);
    await page.getByRole("button", { name: "Créer le tenant" }).click();
    await expect(page.getByText("Ce sous-domaine est déjà utilisé")).toBeVisible();
  });

  test("soumission valide → toast succès + tenant créé", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto("/owner/tenants/new");
    await page.getByLabel("Nom de la société *").fill("Nouveau Tenant E2E");
    await page.locator("#slug").fill(NEW_SLUG);
    await page.getByLabel("Nom de l'administrateur *").fill("Admin E2E");
    await page.getByLabel("Email de l'administrateur *").fill(NEW_ADMIN_EMAIL);
    await page.getByRole("button", { name: "Créer le tenant" }).click();

    await expect(page.getByText(/créé/)).toBeVisible({ timeout: 15_000 });

    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, NEW_SLUG))
      .limit(1);
    expect(rows[0]).toBeTruthy();
  });
});
