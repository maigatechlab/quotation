import { test as base, expect, type Page } from "@playwright/test";

// Credentials from env (set in .env.test or CI secrets)
export const TEST_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
export const TEST_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

export async function loginAs(
  page: Page,
  email: string,
  password: string,
  role: "Administrateur" | "Commercial" | "Opérateur" | "Owner" = "Administrateur"
) {
  // Superadmins sign in on the Owner Console (/owner/login, no role selector)
  // and land on /owner; tenant roles pick their role on /login and land on /.
  if (role === "Owner") {
    await page.goto("/owner/login");
  } else {
    await page.goto("/login");
    await page.getByRole("button", { name: role }).click();
  }
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  // Wait for redirect to the role's home page
  await page.waitForURL(role === "Owner" ? "/owner" : "/", { timeout: 30_000 });
}

// Fixture: authenticated admin page
type AuthFixtures = {
  authedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await loginAs(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, "Administrateur");
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture `use` is not a React hook
    await use(page);
  },
});

export { expect };
