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

const OWNER_EMAIL = "owner-reactivate-e2e@maigatechlab.test";
const OWNER_PASSWORD = "OwnerReact1234!";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

const SLUG_SUSPENDED_WITH_PAYMENT = "e2e-react-susp-pay";
const SLUG_SUSPENDED_NO_PAYMENT = "e2e-react-susp-nopay";
const SLUG_CANCELLED_WITH_PAYMENT = "e2e-react-cancelled";
const SLUG_ACTIVE = "e2e-react-active";

let superadminId: string;
let suspendedWithPaymentId: string;
let suspendedNoPaymentId: string;
let cancelledWithPaymentId: string;
let activeId: string;
let coveringPaymentEnd: Date;

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}

async function deleteUserByEmail(email: string) {
  const rows = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
  if (rows[0]) {
    await db.delete(account).where(eq(account.userId, rows[0].id));
    await db.delete(userTable).where(eq(userTable.id, rows[0].id));
  }
}

async function seedTenantAdmin(email: string, tenantId: string) {
  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password: "TenantAdmin1234!", name: "Tenant Admin E2E" }),
  });
  if (!res.ok) throw new Error(`Failed to create tenant admin ${email}: ${await res.text()}`);
  const [row] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
  await db.update(userTable).set({ tenantId, role: "admin", emailVerified: true }).where(eq(userTable.id, row!.id));
}

test.beforeAll(async () => {
  await deleteUserByEmail(OWNER_EMAIL);
  for (const slug of [
    SLUG_SUSPENDED_WITH_PAYMENT,
    SLUG_SUSPENDED_NO_PAYMENT,
    SLUG_CANCELLED_WITH_PAYMENT,
    SLUG_ACTIVE,
  ]) {
    await db.delete(tenants).where(eq(tenants.slug, slug));
  }

  const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const ownerRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, name: "Owner Reactivate E2E" }),
  });
  if (!ownerRes.ok) throw new Error(`Owner creation failed: ${await ownerRes.text()}`);
  const ownerRow = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, OWNER_EMAIL)).limit(1);
  superadminId = ownerRow[0]!.id;
  await db.update(userTable).set({ role: "superadmin", emailVerified: true }).where(eq(userTable.id, superadminId));

  const [susWithPay] = await db
    .insert(tenants)
    .values({ name: "Susp Avec Paiement", slug: SLUG_SUSPENDED_WITH_PAYMENT, status: "suspended", plan: "pro", maxUsers: 5 })
    .returning();
  suspendedWithPaymentId = susWithPay!.id;

  const [susNoPay] = await db
    .insert(tenants)
    .values({ name: "Susp Sans Paiement", slug: SLUG_SUSPENDED_NO_PAYMENT, status: "suspended", plan: "pro", maxUsers: 5 })
    .returning();
  suspendedNoPaymentId = susNoPay!.id;

  const [cancelled] = await db
    .insert(tenants)
    .values({ name: "Annulé Avec Paiement", slug: SLUG_CANCELLED_WITH_PAYMENT, status: "cancelled", plan: "pro", maxUsers: 5 })
    .returning();
  cancelledWithPaymentId = cancelled!.id;

  const [active] = await db
    .insert(tenants)
    .values({
      name: "Déjà Actif",
      slug: SLUG_ACTIVE,
      status: "active",
      plan: "pro",
      maxUsers: 5,
      subscriptionStart: new Date(),
      subscriptionEnd: daysFromNow(30),
    })
    .returning();
  activeId = active!.id;

  coveringPaymentEnd = daysFromNow(30);
  await db.insert(subscriptionPayments).values([
    {
      tenantId: suspendedWithPaymentId,
      amount: 25000,
      currency: "XOF",
      paymentMethod: "wave",
      paidAt: new Date(),
      // findCoveringPayments compares periodStart against today at UTC
      // midnight — start the period yesterday so the payment always covers.
      periodStart: daysFromNow(-1),
      periodEnd: coveringPaymentEnd,
      billingCycle: "monthly",
      confirmedBy: superadminId,
    },
    {
      tenantId: cancelledWithPaymentId,
      amount: 25000,
      currency: "XOF",
      paymentMethod: "nitta",
      paidAt: new Date(),
      // findCoveringPayments compares periodStart against today at UTC
      // midnight — start the period yesterday so the payment always covers.
      periodStart: daysFromNow(-1),
      periodEnd: coveringPaymentEnd,
      billingCycle: "monthly",
      confirmedBy: superadminId,
    },
  ]);

  await seedTenantAdmin(`e2e-react-admin-1-${Date.now()}@tenant.test`, suspendedWithPaymentId);
  await seedTenantAdmin(`e2e-react-admin-2-${Date.now()}@tenant.test`, cancelledWithPaymentId);
});

test.afterAll(async () => {
  for (const tenantId of [suspendedWithPaymentId, suspendedNoPaymentId, cancelledWithPaymentId, activeId]) {
    if (tenantId) {
      await db.delete(subscriptionPayments).where(eq(subscriptionPayments.tenantId, tenantId));
      await db.delete(tenantEvents).where(eq(tenantEvents.tenantId, tenantId));
      await db.delete(userTable).where(eq(userTable.tenantId, tenantId));
    }
  }
  for (const slug of [
    SLUG_SUSPENDED_WITH_PAYMENT,
    SLUG_SUSPENDED_NO_PAYMENT,
    SLUG_CANCELLED_WITH_PAYMENT,
    SLUG_ACTIVE,
  ]) {
    await db.delete(tenants).where(eq(tenants.slug, slug));
  }
  await deleteUserByEmail(OWNER_EMAIL);
});

test.describe("Reactivate tenant (superadmin)", () => {
  test("suspended tenant with a covering payment → dialog lists it, reactivation succeeds", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${suspendedWithPaymentId}`);

    await page.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // The dialog fetches covering payments on open — first hit on a cold dev
    // server can exceed the default expect timeout.
    await expect(page.getByText(/Wave/)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Confirmer la réactivation" }).click();
    await expect(page.getByText(/réactivé/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5_000 });

    const [row] = await db
      .select({ status: tenants.status, subscriptionEnd: tenants.subscriptionEnd, gracePeriodEndsAt: tenants.gracePeriodEndsAt })
      .from(tenants)
      .where(eq(tenants.id, suspendedWithPaymentId))
      .limit(1);
    expect(row?.status).toBe("active");
    expect(row?.gracePeriodEndsAt).toBeNull();
    // Reactivation normalizes the new subscriptionEnd to UTC midnight —
    // compare calendar days in UTC, not in the local timezone.
    expect(row?.subscriptionEnd?.toISOString().slice(0, 10)).toBe(
      coveringPaymentEnd.toISOString().slice(0, 10)
    );

    const events = await db
      .select()
      .from(tenantEvents)
      .where(eq(tenantEvents.tenantId, suspendedWithPaymentId));
    expect(events.some((e) => e.eventType === "reactivated")).toBe(true);
  });

  test("suspended tenant without a covering payment → warning shown, confirm hidden, record-payment link visible", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${suspendedNoPaymentId}`);

    await page.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/Aucun paiement ne couvre/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmer la réactivation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enregistrer un paiement" })).toBeVisible();
  });

  test("cancelled tenant with a covering payment → reactivation succeeds (cancelled → active)", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${cancelledWithPaymentId}`);

    await page.getByRole("button", { name: "Réactiver" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirmer la réactivation" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10_000 });

    const [row] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, cancelledWithPaymentId)).limit(1);
    expect(row?.status).toBe("active");
  });

  test("already-active tenant → Réactiver trigger not rendered", async ({ page }) => {
    await loginAs(page, OWNER_EMAIL, OWNER_PASSWORD, "Owner");
    await page.goto(`/owner/tenants/${activeId}`);
    await expect(page.getByRole("button", { name: "Réactiver" })).toHaveCount(0);
  });

  test("non-superadmin → 403 on POST /api/v1/owner/tenants/[id]/reactivate", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD, "Administrateur");
    const res = await page.request.post(`/api/v1/owner/tenants/${suspendedWithPaymentId}/reactivate`, {
      data: { coveringPaymentId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(403);
  });

  test("unauthenticated → 401 on POST /api/v1/owner/tenants/[id]/reactivate", async ({ page }) => {
    const res = await page.request.post(`/api/v1/owner/tenants/${suspendedWithPaymentId}/reactivate`, {
      data: { coveringPaymentId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(res.status()).toBe(401);
  });
});
