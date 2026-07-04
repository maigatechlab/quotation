import { describe, expect, it } from "vitest";
import { updateTenantSchema } from "./tenant-update";

describe("updateTenantSchema", () => {
  it("accepts a valid plan-only update", () => {
    const result = updateTenantSchema.safeParse({ plan: "pro" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid plan", () => {
    const result = updateTenantSchema.safeParse({ plan: "gold" });
    expect(result.success).toBe(false);
  });

  it("accepts notes at the 5000 char limit", () => {
    const result = updateTenantSchema.safeParse({ notes: "a".repeat(5000) });
    expect(result.success).toBe(true);
  });

  it("rejects notes over 5000 chars", () => {
    const result = updateTenantSchema.safeParse({ notes: "a".repeat(5001) });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status", () => {
    const result = updateTenantSchema.safeParse({ status: "archived" });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields independently", () => {
    expect(updateTenantSchema.safeParse({ status: "suspended" }).success).toBe(true);
    expect(updateTenantSchema.safeParse({ notes: "hello" }).success).toBe(true);
  });

  it("rejects an empty body (superRefine — no field to update)", () => {
    const result = updateTenantSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
