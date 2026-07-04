import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  class StripeWebhookError extends Error {
    constructor(
      public readonly code: string,
      message: string
    ) {
      super(message);
      this.name = "StripeWebhookError";
    }
  }
  return {
    constructEvent: vi.fn(),
    handleCheckoutCompleted: vi.fn(),
    StripeWebhookError,
  };
});

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ webhooks: { constructEvent: h.constructEvent } }),
}));

vi.mock("@/lib/stripe/handle-checkout-completed", () => ({
  handleCheckoutCompleted: (...args: unknown[]) => h.handleCheckoutCompleted(...(args as [])),
  StripeWebhookError: h.StripeWebhookError,
}));

import { POST } from "./route";

const ORIGINAL_ENV = process.env;

function makeRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = {};
  if (signature) headers["stripe-signature"] = signature;
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers,
    body,
  });
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, STRIPE_WEBHOOK_SECRET: "whsec_test" };
  h.constructEvent.mockClear();
  h.handleCheckoutCompleted.mockClear();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.clearAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  it("500 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    process.env = { ...ORIGINAL_ENV, STRIPE_WEBHOOK_SECRET: "" };
    const res = await POST(makeRequest("{}", "sig"));
    expect(res.status).toBe(500);
  });

  it("400 when stripe-signature header is missing", async () => {
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
  });

  it("400 when signature verification fails", async () => {
    h.constructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    const res = await POST(makeRequest("{}", "bad-sig"));
    expect(res.status).toBe(400);
  });

  it("400 when handleCheckoutCompleted rejects with INVALID_METADATA (AC5 defensive rejection)", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    h.handleCheckoutCompleted.mockRejectedValue(
      new h.StripeWebhookError("INVALID_METADATA", "bad metadata")
    );

    const res = await POST(makeRequest("{}", "sig"));
    expect(res.status).toBe(400);
  });

  it("500 on other processing failures (Stripe should retry)", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    h.handleCheckoutCompleted.mockRejectedValue(new Error("db down"));

    const res = await POST(makeRequest("{}", "sig"));
    expect(res.status).toBe(500);
  });

  it("200 on success", async () => {
    h.constructEvent.mockReturnValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: {} },
    });
    h.handleCheckoutCompleted.mockResolvedValue({
      tenantId: "tenant-1",
      action: "created",
      reactivated: false,
      emailSent: true,
    });

    const res = await POST(makeRequest("{}", "sig"));
    expect(res.status).toBe(200);
  });

  it("200 no-op for invoice.paid", async () => {
    h.constructEvent.mockReturnValue({ id: "evt_2", type: "invoice.paid", data: { object: {} } });
    const res = await POST(makeRequest("{}", "sig"));
    expect(res.status).toBe(200);
    expect(h.handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("200 ignored for unhandled event types", async () => {
    h.constructEvent.mockReturnValue({ id: "evt_3", type: "customer.created", data: { object: {} } });
    const res = await POST(makeRequest("{}", "sig"));
    expect(res.status).toBe(200);
  });
});
