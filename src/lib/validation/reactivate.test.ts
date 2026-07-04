import { describe, expect, it } from "vitest";
import { reactivateSchema } from "./reactivate";

describe("reactivateSchema", () => {
  it("rejects missing coveringPaymentId", () => {
    const result = reactivateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an invalid uuid", () => {
    const result = reactivateSchema.safeParse({ coveringPaymentId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a note longer than 2000 characters", () => {
    const result = reactivateSchema.safeParse({
      coveringPaymentId: "123e4567-e89b-12d3-a456-426614174000",
      note: "a".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid payload without note", () => {
    const result = reactivateSchema.safeParse({
      coveringPaymentId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid payload with note", () => {
    const result = reactivateSchema.safeParse({
      coveringPaymentId: "123e4567-e89b-12d3-a456-426614174000",
      note: "Régularisation manuelle",
    });
    expect(result.success).toBe(true);
  });
});
