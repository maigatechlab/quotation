import { describe, expect, it } from "vitest";
import {
  buildSessionMetadata,
  extractStripeEventId,
  InvalidCheckoutMetadataError,
  parseSessionMetadata,
  type CheckoutMetadata,
} from "./checkout-metadata";

const META: CheckoutMetadata = {
  plan: "pro",
  billingCycle: "monthly",
  amountXof: 25000,
  amountEur: 38,
  companyName: "ACME Logistics",
  adminName: "Awa",
  adminEmail: "a@b.com",
};

describe("buildSessionMetadata / parseSessionMetadata round-trip", () => {
  it("round-trips a valid CheckoutMetadata", () => {
    const raw = buildSessionMetadata(META) as Record<string, string>;
    const parsed = parseSessionMetadata(raw);
    expect(parsed).toEqual(META);
  });

  it("flattens to string values (Stripe metadata contract)", () => {
    const raw = buildSessionMetadata(META) as Record<string, string>;
    expect(raw.amount_xof).toBe("25000");
    expect(raw.billing_cycle).toBe("monthly");
  });
});

describe("parseSessionMetadata", () => {
  it("throws InvalidCheckoutMetadataError when metadata is null", () => {
    expect(() => parseSessionMetadata(null)).toThrow(InvalidCheckoutMetadataError);
  });

  it("rejects plan='free'", () => {
    const raw = buildSessionMetadata(META) as Record<string, string>;
    raw.plan = "free";
    expect(() => parseSessionMetadata(raw)).toThrow(InvalidCheckoutMetadataError);
  });

  it("rejects missing fields", () => {
    const raw = buildSessionMetadata(META) as Record<string, string>;
    delete raw.company_name;
    expect(() => parseSessionMetadata(raw)).toThrow(InvalidCheckoutMetadataError);
  });
});

describe("extractStripeEventId", () => {
  it("returns event.id", () => {
    expect(extractStripeEventId({ id: "evt_123" } as never)).toBe("evt_123");
  });
});
