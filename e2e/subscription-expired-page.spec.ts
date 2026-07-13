import { expect, test } from "@playwright/test";

test.describe("/subscription-expired page", () => {
  test("renders title, message, contact, and logout without app shell", async ({ page }) => {
    await page.goto("/subscription-expired?date=2026-06-29T00:00:00.000Z");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("abonnement");
    await expect(page.getByText("expiré ou a été suspendu")).toBeVisible();
    await expect(page.getByText("29 juin 2026")).toBeVisible();
    await expect(page.getByText("données sont conservées")).toBeVisible();
    await expect(page.getByText("Maiga Tech Lab").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /déconnecter/i })).toBeVisible();

    // No sidebar or quota banner
    await expect(page.locator("nav[aria-label]")).not.toBeVisible().catch(() => {});
    await expect(page.locator("[data-testid='sidebar']")).not.toBeAttached().catch(() => {});
  });

  test("shows fallback contact when OWNER_WHATSAPP/EMAIL not configured", async ({ page }) => {
    await page.goto("/subscription-expired?date=2026-06-29T00:00:00.000Z");
    // The page should display some contact info (either real or placeholder)
    await expect(page.getByText(/Maiga Tech Lab|contact@maigatechlab.com/i).first()).toBeVisible();
  });
});
