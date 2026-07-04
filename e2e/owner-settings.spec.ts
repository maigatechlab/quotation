import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { loginAs, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./fixtures";
import { db } from "../src/lib/db";
import { account, platformSettings, user as userTable } from "../src/lib/schema";
import { getPlanPrices } from "../src/lib/tenants/platform-config";

const OWNER_EMAIL = "owner-settings-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerSettings1234!";
const COMMERCIAL_EMAIL = "owner-settings-commercial@maigatechlab.test";
const OPERATEUR_EMAIL = "owner-settings-operateur@maigatechlab.test";

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

async function createUserWithRole(email: string, role: "commercial" | "operateur") {
  await deleteUserByEmail(email);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: OWNER_PASSWORD, name: `Owner Settings ${role}` }),
  });
  if (!res.ok) throw new Error(`User creation failed: ${await res.text()}`);

  const row = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  await db
    .update(userTable)
    .set({ role, emailVerified: true })
    .where(eq(userTable.id, row[0]!.id));
}

test.beforeAll(async () => {
  await deleteUserByEmail(OWNER_EMAIL);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      name: "Owner Settings E2E",
    }),
  });
  if (!res.ok) throw new Error(`Owner creation failed: ${await res.text()}`);

  const row = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, OWNER_EMAIL))
    .limit(1);
  await db
    .update(userTable)
    .set({ role: "superadmin", emailVerified: true })
    .where(eq(userTable.id, row[0]!.id));

  await createUserWithRole(COMMERCIAL_EMAIL, "commercial");
  await createUserWithRole(OPERATEUR_EMAIL, "operateur");

  // Reset the singleton so each run starts from the known defaults.
  await db.delete(platformSettings).where(eq(platformSettings.id, 1));
});

test.afterAll(async () => {
  await db.delete(platformSettings).where(eq(platformSettings.id, 1));
  await deleteUserByEmail(OWNER_EMAIL);
  await deleteUserByEmail(COMMERCIAL_EMAIL);
  await deleteUserByEmail(OPERATEUR_EMAIL);
});

for (const userCase of [
  { email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD, label: "Administrateur" as const },
  { email: COMMERCIAL_EMAIL, password: OWNER_PASSWORD, label: "Commercial" as const },
  { email: OPERATEUR_EMAIL, password: OWNER_PASSWORD, label: "Opérateur" as const },
]) {
  test(`non-superadmin ${userCase.label} is redirected away from /owner/settings`, async ({ page }) => {
    await loginAs(page, userCase.email, userCase.password, userCase.label);
    await page.goto("/owner/settings");
    await page.waitForURL("/", { timeout: 10_000 });
  });
}

test("superadmin sees the 5 platform settings sections", async ({ page }) => {
  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto("/owner/settings");
  await expect(page.getByRole("heading", { name: "Paramètres plateforme" })).toBeVisible();
  await expect(page.getByText("Plans & tarifs")).toBeVisible();
  await expect(page.getByText("Quotas d'utilisateurs")).toBeVisible();
  await expect(page.getByText("Cycle de vie")).toBeVisible();
  await expect(page.getByText("Contenu affiché aux tenants")).toBeVisible();
  await expect(page.getByText("Notifications automatiques")).toBeVisible();
});

test("modifying a price persists and is reflected after reload", async ({ page }) => {
  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto("/owner/settings");

  const priceInput = page.locator("#priceProMonthly");
  await priceInput.fill("30000");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await expect(page.getByText("Paramètres plateforme enregistrÃ©s.")).toBeVisible({
    timeout: 10_000,
  });

  await page.reload();
  await expect(page.locator("#priceProMonthly")).toHaveValue("30000");

  const [row] = await db
    .select({ priceProMonthly: platformSettings.priceProMonthly })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);
  expect(row?.priceProMonthly).toBe(30000);
  await expect.poll(async () => (await getPlanPrices()).pro.monthly).toBe(30000);
});

test("invalid gracePeriodDays shows an inline error and does not save", async ({ page }) => {
  await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
  await page.goto("/owner/settings");

  await page.locator("#gracePeriodDays").fill("31");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await expect(page.getByText("La durée de grâce doit Ãªtre entre 0 et 30 jours.")).toBeVisible({
    timeout: 10_000,
  });

  const [row] = await db
    .select({ gracePeriodDays: platformSettings.gracePeriodDays })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);
  expect(row?.gracePeriodDays).not.toBe(31);
});