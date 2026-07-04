import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { tenants } from "../src/lib/schema";
import { clearTenantCache } from "../src/lib/tenants/resolve-tenant";

// These tests require SUBDOMAIN_DEV_MODE=1 in the running server.
// Tenant simulation: set x-test-tenant-slug header (Playwright extraHTTPHeaders).

const slugActive = "e2e-active";
const slugSuspended = "e2e-suspended";
const slugCancelled = "e2e-cancelled";

async function seedTenants() {
  await db.delete(tenants).where(eq(tenants.slug, slugActive)).execute();
  await db.delete(tenants).where(eq(tenants.slug, slugSuspended)).execute();
  await db.delete(tenants).where(eq(tenants.slug, slugCancelled)).execute();

  await db.insert(tenants).values([
    {
      name: "E2E Active Tenant",
      slug: slugActive,
      status: "active",
      plan: "pro",
      maxUsers: 5,
    },
    {
      name: "E2E Suspended Tenant",
      slug: slugSuspended,
      status: "suspended",
      plan: "free",
      maxUsers: 1,
    },
    {
      name: "E2E Cancelled Tenant",
      slug: slugCancelled,
      status: "cancelled",
      plan: "free",
      maxUsers: 1,
    },
  ]);
}

test.beforeAll(async () => {
  await seedTenants();
  clearTenantCache();
});

test.afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.slug, slugActive)).execute();
  await db.delete(tenants).where(eq(tenants.slug, slugSuspended)).execute();
  await db.delete(tenants).where(eq(tenants.slug, slugCancelled)).execute();
  clearTenantCache();
});

test.describe("Tenant subdomain routing (SUBDOMAIN_DEV_MODE=1)", () => {
  test("/subscription-expired accessible sans session", async ({ page }) => {
    await page.goto("/subscription-expired");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /abonnement expiré/i })).toBeVisible();
  });

  test("tenant actif sans session → redirect login (pas subscription-expired)", async ({ browser }) => {
    // Verifies the enforcement decision for an active tenant is "allow" (not redirect to subscription-expired).
    // x-tenant-id header propagation is validated at the unit level via proxy logic + enforceTenantAccess tests.
    const ctx = await browser.newContext({
      extraHTTPHeaders: { "x-test-tenant-slug": slugActive },
    });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/subscription-expired/);
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("tenant suspendu → redirect vers /subscription-expired", async ({ browser }) => {
    const ctx = await browser.newContext({
      extraHTTPHeaders: { "x-test-tenant-slug": slugSuspended },
    });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/subscription-expired/);
    await expect(page.getByRole("heading", { name: /abonnement expiré/i })).toBeVisible();
    await ctx.close();
  });

  test("tenant annulé → redirect vers /subscription-expired", async ({ browser }) => {
    const ctx = await browser.newContext({
      extraHTTPHeaders: { "x-test-tenant-slug": slugCancelled },
    });
    const page = await ctx.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/subscription-expired/);
    await ctx.close();
  });

  test("slug inexistant → pas de redirect subscription-expired (no-tenant flow)", async ({ browser }) => {
    const ctx = await browser.newContext({
      extraHTTPHeaders: { "x-test-tenant-slug": "slug-qui-nexiste-pas" },
    });
    const page = await ctx.newPage();
    await page.goto("/");
    // Should NOT redirect to subscription-expired (not-found → normal flow)
    await expect(page).not.toHaveURL(/subscription-expired/);
    await ctx.close();
  });
});
