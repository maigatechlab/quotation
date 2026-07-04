import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function callArg(mock: ReturnType<typeof vi.fn>, callIdx = 0, argIdx = 0): Record<string, unknown> {
  return (mock.mock.calls as unknown[][])[callIdx]![argIdx] as Record<string, unknown>;
}

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  // Ordered queue consumed by every outer db.select(...).limit(1) call, in
  // call order. Each test pushes exactly the rows it expects each select to
  // resolve to.
  const selectQueue: unknown[][] = [];
  function pushSelect(rows: unknown[]) {
    selectQueue.push(rows);
  }
  function nextSelect(): unknown[] {
    return selectQueue.shift() ?? [];
  }

  const insertValues = vi.fn(() => Promise.resolve());
  const deleteWhere = vi.fn(() => Promise.resolve());
  const updateWhere = vi.fn(() => Promise.resolve());
  const updateSet = vi.fn(() => ({ where: updateWhere }));

  // tx mock — separate call tracking for transaction-scoped ops
  const txTenantRow = {
    id: "tenant-1",
    name: "ACME Logistics",
    slug: "acme-logistics",
    status: "active" as "active" | "trial" | "suspended" | "cancelled",
    subscriptionStart: null as Date | null,
    subscriptionEnd: null as Date | null,
  };
  const txSelectForUpdate = vi.fn(() => Promise.resolve([txTenantRow]));
  const txInsertedTenant = {
    id: "tenant-1",
    name: "ACME Logistics",
    slug: "acme-logistics",
    status: "active",
    plan: "pro",
    subscriptionStart: new Date("2026-07-03T00:00:00.000Z"),
    subscriptionEnd: new Date("2026-08-02T00:00:00.000Z"),
    trialEndsAt: null,
  };
  const txInsertedPayment = { id: "payment-1" };
  const txInsertReturning = vi.fn<() => Promise<unknown[]>>(() =>
    Promise.resolve([txInsertedTenant])
  );
  const txInsertValues = vi.fn(() => ({
    returning: txInsertReturning,
  }));
  const txInsertNoReturn = vi.fn(() => Promise.resolve());
  const txUpdateWhere = vi.fn(() => Promise.resolve());
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));

  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({ for: () => txSelectForUpdate() }),
      }),
    }),
    insert: () => ({ values: h.currentTxInsertValues }),
    update: () => ({ set: txUpdateSet }),
  };

  const signUpEmail = vi.fn(() =>
    Promise.resolve({ user: { id: "user-1" } } as { user: { id: string } } | null)
  );
  const sendEmail = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const reactivateTenantWithPayment = vi.fn(() =>
    Promise.resolve({ oldStatus: "suspended", oldSubscriptionEnd: null as Date | null })
  );

  return {
    selectQueue,
    pushSelect,
    nextSelect,
    insertValues,
    deleteWhere,
    updateWhere,
    updateSet,
    txTenantRow,
    txSelectForUpdate,
    txInsertedTenant,
    txInsertedPayment,
    txInsertReturning,
    txInsertValues,
    txInsertNoReturn,
    txUpdateWhere,
    txUpdateSet,
    tx,
    signUpEmail,
    sendEmail,
    reactivateTenantWithPayment,
    // set per-test to route tx.insert(...).values() to the right mock
    currentTxInsertValues: txInsertValues as unknown as (...args: unknown[]) => unknown,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (cb: (tx: unknown) => Promise<unknown>) => cb(h.tx),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.nextSelect()),
        }),
      }),
    }),
    insert: () => ({ values: h.insertValues }),
    delete: () => ({ where: h.deleteWhere }),
    update: () => ({ set: h.updateSet }),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { signUpEmail: (...args: unknown[]) => h.signUpEmail(...(args as [])) } },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => h.sendEmail(...(args as [])),
}));

vi.mock("@/lib/schema", () => ({
  tenants: { id: "tenants.id", slug: "tenants.slug", stripeCustomerId: "tenants.stripeCustomerId" },
  stripeProcessedEvents: { eventId: "sep.eventId", tenantId: "sep.tenantId" },
  subscriptionPayments: { tenantId: "sp.tenantId" },
  tenantEvents: {},
  user: { id: "user.id", tenantId: "user.tenantId", email: "user.email" },
  account: { userId: "account.userId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));

vi.mock("@/lib/tenants/period", () => ({
  calculatePeriodFromCycle: ({ paidAt }: { cycle: string; paidAt: Date }) => ({
    periodStart: paidAt,
    periodEnd: new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000),
  }),
}));

vi.mock("@/lib/tenants/password", () => ({
  generatePassword: () => "Gener4ted!Pass",
}));

vi.mock("@/lib/tenants/reactivate", () => ({
  reactivateTenantWithPayment: (...args: unknown[]) =>
    h.reactivateTenantWithPayment(...(args as [])),
}));

vi.mock("@/lib/tenants/slug", () => ({
  generateSlug: (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  validateSlug: () => ({ valid: true }),
}));

vi.mock("@/lib/tenants/system-actor", () => ({
  SYSTEM_ACTOR_ID: "system-stripe-webhook",
}));

vi.mock("@/lib/tenants/tenant-config", () => ({
  APEX_DOMAIN: "quotation.com",
  PLAN_LIMITS: { free: { maxUsers: 1 }, pro: { maxUsers: 5 }, enterprise: { maxUsers: 20 } },
}));

vi.mock("@/lib/tenants/welcome-email", () => ({
  buildWelcomeEmailHtml: () => "<html>welcome</html>",
  buildWelcomeEmailText: () => "welcome text",
}));

vi.mock("@/lib/tenants/payment-email", () => ({
  buildPaymentConfirmationEmailHtml: () => "<html>payment</html>",
  buildPaymentConfirmationEmailText: () => "payment text",
}));

import {
  handleCheckoutCompleted,
  StripeWebhookError,
} from "./handle-checkout-completed";

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_123",
    created: Math.floor(new Date("2026-07-03T00:00:00.000Z").getTime() / 1000),
    customer: "cus_abc123",
    payment_intent: "pi_abc123",
    metadata: {
      plan: "pro",
      billing_cycle: "monthly",
      amount_xof: "25000",
      amount_eur: "38",
      company_name: "ACME Logistics",
      admin_name: "Awa",
      admin_email: "awa@acme.test",
    },
    ...overrides,
  } as never;
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.currentTxInsertValues = h.txInsertValues as unknown as (...args: unknown[]) => unknown;
  h.txTenantRow.status = "active";
  h.txTenantRow.subscriptionEnd = null;
  h.txSelectForUpdate.mockImplementation(() => Promise.resolve([h.txTenantRow]));
  h.txInsertReturning.mockResolvedValue([h.txInsertedTenant]);
  h.txInsertValues.mockClear();
  h.txUpdateSet.mockClear();
  h.insertValues.mockClear();
  h.deleteWhere.mockClear();
  h.updateSet.mockClear();
  h.updateWhere.mockClear();
  h.updateWhere.mockResolvedValue(undefined);
  h.signUpEmail.mockClear();
  h.signUpEmail.mockResolvedValue({ user: { id: "user-1" } });
  h.sendEmail.mockClear();
  h.sendEmail.mockResolvedValue(undefined);
  h.reactivateTenantWithPayment.mockClear();
  h.reactivateTenantWithPayment.mockResolvedValue({ oldStatus: "suspended", oldSubscriptionEnd: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("handleCheckoutCompleted — idempotence (AC4)", () => {
  it("returns immediately when event id was already processed", async () => {
    h.pushSelect([{ tenantId: "tenant-99" }]); // alreadyProcessed lookup

    const result = await handleCheckoutCompleted(makeSession(), "evt_dup");

    expect(result).toEqual({
      tenantId: "tenant-99",
      action: "renewed",
      reactivated: false,
      emailSent: true,
    });
    expect(h.insertValues).not.toHaveBeenCalled();
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});

describe("handleCheckoutCompleted — creation flow (AC5)", () => {
  it("creates tenant, admin, payment and sends welcome email", async () => {
    h.pushSelect([]); // alreadyProcessed
    h.pushSelect([]); // existing tenant by stripeCustomerId
    h.pushSelect([]); // slug uniqueness check

    const result = await handleCheckoutCompleted(makeSession(), "evt_new");

    expect(result.action).toBe("created");
    expect(result.reactivated).toBe(false);
    expect(result.emailSent).toBe(true);
    expect(h.txInsertValues).toHaveBeenCalledTimes(3); // tenant + stripeProcessedEvents + subscriptionPayments
    expect(h.signUpEmail).toHaveBeenCalledTimes(1);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    // tenant_events: created + payment_recorded
    expect(h.insertValues).toHaveBeenCalledTimes(2);
  });

  it("tenant is inserted with status active and trialEndsAt null", async () => {
    h.pushSelect([]);
    h.pushSelect([]);
    h.pushSelect([]);

    await handleCheckoutCompleted(makeSession(), "evt_new2");

    const insertArg = callArg(h.txInsertValues, 0, 0);
    expect(insertArg.status).toBe("active");
    expect(insertArg.trialEndsAt).toBeNull();
    expect(insertArg.stripeCustomerId).toBe("cus_abc123");
  });

  it("signUp failure rolls back and throws StripeWebhookError", async () => {
    h.pushSelect([]);
    h.pushSelect([]);
    h.pushSelect([]);
    h.signUpEmail.mockResolvedValueOnce(null);

    await expect(handleCheckoutCompleted(makeSession(), "evt_fail")).rejects.toThrow(
      StripeWebhookError
    );
    expect(h.deleteWhere).toHaveBeenCalled();
  });

  it("user-link failure after successful signup rolls back the Better Auth user/account too", async () => {
    h.pushSelect([]);
    h.pushSelect([]);
    h.pushSelect([]);
    h.signUpEmail.mockResolvedValueOnce({ user: { id: "user-orphan" } });
    h.updateWhere.mockRejectedValueOnce(new Error("update failed"));

    await expect(handleCheckoutCompleted(makeSession(), "evt_link_fail")).rejects.toThrow(
      StripeWebhookError
    );

    // account + user + stripeProcessedEvents + subscriptionPayments + tenants
    expect(h.deleteWhere).toHaveBeenCalledTimes(5);
  });

  it("sendEmail failure still returns the tenant with emailSent=false", async () => {
    h.pushSelect([]);
    h.pushSelect([]);
    h.pushSelect([]);
    h.sendEmail.mockRejectedValueOnce(new Error("Resend down"));

    const result = await handleCheckoutCompleted(makeSession(), "evt_email_fail");
    expect(result.action).toBe("created");
    expect(result.emailSent).toBe(false);
  });

  it("invalid metadata (plan=free) throws StripeWebhookError before any mutation", async () => {
    h.pushSelect([]); // alreadyProcessed

    const session = makeSession({
      metadata: { ...(makeSession() as { metadata: Record<string, string> }).metadata, plan: "free" },
    });
    await expect(handleCheckoutCompleted(session, "evt_bad_meta")).rejects.toThrow(
      StripeWebhookError
    );
    expect(h.txInsertValues).not.toHaveBeenCalled();
  });

  it("slug collision appends a numeric suffix", async () => {
    h.pushSelect([]); // alreadyProcessed
    h.pushSelect([]); // existing tenant
    h.pushSelect([{ id: "other-tenant" }]); // slug collision on first attempt
    h.pushSelect([]); // slug free on second attempt

    await handleCheckoutCompleted(makeSession(), "evt_slug_collision");

    const insertArg = callArg(h.txInsertValues, 0, 0);
    expect(insertArg.slug).toBe("acme-logistics-2");
  });
});

describe("handleCheckoutCompleted — renewal flow (AC6)", () => {
  beforeEach(() => {
    h.currentTxInsertValues = (() => ({
      returning: h.txInsertReturning,
    })) as unknown as (...args: unknown[]) => unknown;
    h.txInsertReturning.mockResolvedValue([h.txInsertedPayment]);
  });

  it("does not create a new tenant when stripeCustomerId matches", async () => {
    h.pushSelect([]); // alreadyProcessed
    h.pushSelect([{ id: "tenant-1" }]); // existing tenant found
    h.pushSelect([{ name: "ACME Logistics", slug: "acme-logistics" }]); // tenantRow
    h.pushSelect([{ email: "admin@acme.test" }]); // adminUser

    const result = await handleCheckoutCompleted(makeSession(), "evt_renew");

    expect(result.action).toBe("renewed");
    expect(result.tenantId).toBe("tenant-1");
    expect(h.signUpEmail).not.toHaveBeenCalled();
  });

  it("suspended tenant → reactivated=true via shared helper", async () => {
    h.txTenantRow.status = "suspended";
    h.pushSelect([]);
    h.pushSelect([{ id: "tenant-1" }]);
    h.pushSelect([{ name: "ACME Logistics", slug: "acme-logistics" }]);
    h.pushSelect([{ email: "admin@acme.test" }]);

    const result = await handleCheckoutCompleted(makeSession(), "evt_renew_reactivate");

    expect(result.reactivated).toBe(true);
    expect(h.reactivateTenantWithPayment).toHaveBeenCalledTimes(1);
  });

  it("sends payment confirmation email, not welcome email", async () => {
    h.pushSelect([]);
    h.pushSelect([{ id: "tenant-1" }]);
    h.pushSelect([{ name: "ACME Logistics", slug: "acme-logistics" }]);
    h.pushSelect([{ email: "admin@acme.test" }]);

    const result = await handleCheckoutCompleted(makeSession(), "evt_renew_email");

    expect(result.emailSent).toBe(true);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const emailArg = callArg(h.sendEmail, 0, 0);
    expect(emailArg.subject).not.toContain("Bienvenue");
  });
});
