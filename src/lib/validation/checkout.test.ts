import { describe, expect, it } from "vitest";
import { checkoutMetadataSchema, createCheckoutSessionSchema } from "./checkout";

describe("createCheckoutSessionSchema", () => {
  const valid = {
    plan: "pro",
    billingCycle: "monthly",
    adminEmail: "a@b.com",
    companyName: "ACME Logistics",
    adminName: "Awa",
  };

  it("accepts a valid payload", () => {
    expect(createCheckoutSessionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects plan='free'", () => {
    const result = createCheckoutSessionSchema.safeParse({ ...valid, plan: "free" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = createCheckoutSessionSchema.safeParse({ ...valid, adminEmail: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a company name that's too short", () => {
    const result = createCheckoutSessionSchema.safeParse({ ...valid, companyName: "A" });
    expect(result.success).toBe(false);
  });

  it("lowercases the admin email", () => {
    const result = createCheckoutSessionSchema.safeParse({ ...valid, adminEmail: "A@B.COM" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.adminEmail).toBe("a@b.com");
  });
});

describe("checkoutMetadataSchema", () => {
  const valid = {
    plan: "pro",
    billingCycle: "monthly",
    amountXof: "25000",
    amountEur: "38",
    companyName: "ACME Logistics",
    adminName: "Awa",
    adminEmail: "a@b.com",
  };

  it("accepts valid stringified metadata (Stripe metadata is always strings)", () => {
    expect(checkoutMetadataSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects plan='free'", () => {
    expect(checkoutMetadataSchema.safeParse({ ...valid, plan: "free" }).success).toBe(false);
  });

  it("rejects amountXof <= 0", () => {
    expect(checkoutMetadataSchema.safeParse({ ...valid, amountXof: "0" }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    const { companyName: _drop, ...rest } = valid;
    expect(checkoutMetadataSchema.safeParse(rest).success).toBe(false);
  });
});
