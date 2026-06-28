import { expect, test } from "@playwright/test";
import { loginAs, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./fixtures";

test.describe("Auth — connexion et déconnexion", () => {
  test("page login accessible à /login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  });

  test("redirect vers /login si non authentifié", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirect vers /login sur toute route protégée", async ({ page }) => {
    await page.goto("/devis");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login avec mauvais mot de passe affiche erreur", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Administrateur" }).click();
    await page.locator("#email").fill(TEST_ADMIN_EMAIL);
    await page.locator("#password").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.locator("[role='alert']#login-error")).toBeVisible({ timeout: 8_000 });
    await expect(page.locator("[role='alert']#login-error")).toContainText(
      /incorrect|verrouillé/i
    );
    // Doit rester sur la page login
    await expect(page).toHaveURL(/\/login/);
  });

  test("login admin réussi redirige vers /", async ({ page }) => {
    await loginAs(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, "Administrateur");
    await expect(page).toHaveURL("/");
  });

  test("dashboard visible après connexion admin", async ({ page }) => {
    await loginAs(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, "Administrateur");
    // Navigation bottom bar visible
    await expect(page.locator("nav")).toBeVisible();
    // Main content zone
    await expect(page.locator("#main-content")).toBeVisible();
  });

  test("déjà authentifié → redirect de /login vers /", async ({ page }) => {
    await loginAs(page, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, "Administrateur");
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });
});
