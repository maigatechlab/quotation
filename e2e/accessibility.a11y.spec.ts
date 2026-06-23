import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home page has no critical accessibility violations", async ({ page }) => {
  await page.goto("/");

  const results = await new AxeBuilder({ page })
    .exclude("iframe")
    .disableRules([
      "landmark-main-is-top-level",
      "landmark-no-duplicate-main",
      "landmark-unique",
    ])
    .analyze();

  expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
});