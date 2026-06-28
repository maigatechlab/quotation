import { test, expect } from "./fixtures";

test.describe("Devis — cycle de vie golden path", () => {
  test("liste devis accessible depuis /devis", async ({ authedPage: page }) => {
    await page.goto("/devis");
    await expect(page).toHaveURL("/devis");
    // Page title visible
    await expect(
      page.getByRole("heading", { name: /devis/i }).or(page.getByText(/devis/i).first())
    ).toBeVisible({ timeout: 8_000 });
  });

  test("bouton nouveau devis visible pour admin", async ({ authedPage: page }) => {
    await page.goto("/devis");
    // Admin voit le FAB ou le lien de création
    const createBtn = page
      .getByRole("link", { name: /nouveau|créer/i })
      .or(page.getByRole("button", { name: /nouveau|créer|\+/i }))
      .first();
    await expect(createBtn).toBeVisible({ timeout: 8_000 });
  });

  test("accès à /devis/nouveau sans erreur", async ({ authedPage: page }) => {
    await page.goto("/devis/nouveau");
    await expect(page).not.toHaveURL(/\/login/);
    // Wizard doit être chargé — cherche un step indicator ou le label "Trajet"
    await expect(
      page.getByText(/trajet|client|devis/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("barre de recherche visible sur /devis", async ({ authedPage: page }) => {
    await page.goto("/devis");
    const searchInput = page
      .getByRole("searchbox")
      .or(page.getByPlaceholder(/recherche|chercher/i))
      .first();
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
  });

  test("filtre par statut disponible", async ({ authedPage: page }) => {
    await page.goto("/devis");
    // Statuts Brouillon / Validé / Envoyé / etc.
    const statusFilter = page
      .getByRole("combobox")
      .or(page.getByText(/brouillon|statut/i).first());
    await expect(statusFilter).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Devis — navigation wizard", () => {
  test("wizard démarre sur step Trajet (step 1)", async ({ authedPage: page }) => {
    await page.goto("/devis/nouveau");
    // Premier step du wizard — "Trajet" ou équivalent
    await expect(page.getByText(/trajet/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("navigation retour depuis /devis/nouveau vers /devis", async ({ authedPage: page }) => {
    await page.goto("/devis/nouveau");
    await page.goBack();
    await expect(page).toHaveURL("/devis");
  });
});

test.describe("Clients — CRUD de base", () => {
  test("liste clients accessible depuis /clients", async ({ authedPage: page }) => {
    await page.goto("/clients");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/client/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("page nouveau client accessible", async ({ authedPage: page }) => {
    await page.goto("/clients/nouveau");
    await expect(page).not.toHaveURL(/\/login/);
    // Formulaire — champ nom obligatoire
    await expect(
      page.getByLabel(/nom|raison/i).first().or(page.locator("input").first())
    ).toBeVisible({ timeout: 8_000 });
  });
});

test.describe("Paramètres — accès admin", () => {
  test("/parametres accessible pour admin", async ({ authedPage: page }) => {
    await page.goto("/parametres");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/paramètre/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("section audit visible pour admin", async ({ authedPage: page }) => {
    await page.goto("/parametres");
    await expect(page.getByText(/audit/i).first()).toBeVisible({ timeout: 8_000 });
    // Boutons de téléchargement présents
    await expect(
      page.getByRole("button", { name: /json|csv|exporter/i }).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
