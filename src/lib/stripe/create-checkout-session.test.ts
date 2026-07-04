import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function callArg(mock: ReturnType<typeof vi.fn>, callIdx = 0, argIdx = 0): Record<string, unknown> {
  return (mock.mock.calls as unknown[][])[callIdx]![argIdx] as Record<string, unknown>;
}

const h = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const sessionsCreate = vi.fn(() =>
    Promise.resolve({ url: "https://checkout.stripe.com/test-session", id: "cs_test_123" })
  );

  return {
    selectQueue,
    pushSelect: (rows: unknown[]) => selectQueue.push(rows),
    sessionsCreate,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(h.selectQueue.shift() ?? []),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/schema", () => ({
  tenants: { id: "tenants.id", stripeCustomerId: "tenants.stripeCustomerId" },
  user: { email: "user.email", tenantId: "user.tenantId" },
}));

vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => ({ a, b }) }));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ checkout: { sessions: { create: h.sessionsCreate } } }),
}));

vi.mock("@/lib/tenants/tenant-config", () => ({
  PLAN_PRICES_XOF: {
    free: { monthly: 0, annual: 0 },
    pro: { monthly: 25000, annual: 250000 },
    enterprise: { monthly: 75000, annual: 750000 },
  },
}));

import { createCheckoutSession } from "./create-checkout-session";

const INPUT = {
  plan: "pro" as const,
  billingCycle: "monthly" as const,
  adminEmail: "awa@acme.test",
  companyName: "ACME Logistics",
  adminName: "Awa",
};

beforeEach(() => {
  h.selectQueue.length = 0;
  h.sessionsCreate.mockClear();
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("createCheckoutSession — new customer", () => {
  it("uses customer_email when no existing tenant matches the admin email", async () => {
    h.pushSelect([]); // no admin user found

    await createCheckoutSession(INPUT);

    const arg = callArg(h.sessionsCreate);
    expect(arg.customer_email).toBe("awa@acme.test");
    expect(arg.customer).toBeUndefined();
  });
});

describe("createCheckoutSession — renewal (AC6)", () => {
  it("reuses the existing Stripe customer id instead of customer_email", async () => {
    h.pushSelect([{ tenantId: "tenant-1" }]); // admin user found
    h.pushSelect([{ stripeCustomerId: "cus_existing_123" }]); // tenant has a stripe customer

    await createCheckoutSession(INPUT);

    const arg = callArg(h.sessionsCreate);
    expect(arg.customer).toBe("cus_existing_123");
    expect(arg.customer_email).toBeUndefined();
  });

  it("falls back to customer_email when the tenant has no stripeCustomerId yet", async () => {
    h.pushSelect([{ tenantId: "tenant-1" }]);
    h.pushSelect([{ stripeCustomerId: null }]);

    await createCheckoutSession(INPUT);

    const arg = callArg(h.sessionsCreate);
    expect(arg.customer_email).toBe("awa@acme.test");
    expect(arg.customer).toBeUndefined();
  });
});
