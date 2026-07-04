import { describe, expect, it } from "vitest";
import { generateSlug, validateSlug } from "./slug";

describe("generateSlug", () => {
  it("lowercases and hyphenates a multi-word name", () => {
    expect(generateSlug("Trans Sahel Logistics")).toBe("trans-sahel-logistics");
  });

  it("strips accents", () => {
    expect(generateSlug("Établissement Café")).toBe("etablissement-cafe");
  });

  it("collapses multiple spaces and hyphens", () => {
    expect(generateSlug("Foo   Bar")).toBe("foo-bar");
    expect(generateSlug("Foo -- Bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(generateSlug("  -Foo Bar-  ")).toBe("foo-bar");
  });

  it("removes special characters", () => {
    expect(generateSlug("Acme & Co. (Niger)!")).toBe("acme-co-niger");
  });

  it("keeps digits", () => {
    expect(generateSlug("Transit 226 SARL")).toBe("transit-226-sarl");
  });

  it("falls back to 'tenant' for an empty result", () => {
    expect(generateSlug("")).toBe("tenant");
    expect(generateSlug("!!!")).toBe("tenant");
    expect(generateSlug("---")).toBe("tenant");
  });
});

describe("validateSlug", () => {
  it("accepts a valid slug", () => {
    expect(validateSlug("trans-sahel")).toEqual({ valid: true });
  });

  it("rejects a too-short slug", () => {
    expect(validateSlug("ab")).toEqual({ valid: false, reason: "too_short" });
  });

  it("rejects a too-long slug", () => {
    expect(validateSlug("a".repeat(64))).toEqual({ valid: false, reason: "too_long" });
  });

  it("rejects uppercase", () => {
    expect(validateSlug("Trans-Sahel").valid).toBe(false);
  });

  it("rejects leading/trailing hyphen and double hyphen", () => {
    expect(validateSlug("-abc").valid).toBe(false);
    expect(validateSlug("abc-").valid).toBe(false);
    expect(validateSlug("a--b").valid).toBe(false);
  });

  it("rejects forbidden characters", () => {
    expect(validateSlug("abc_def").reason).toBe("invalid_chars");
    expect(validateSlug("abc def").reason).toBe("invalid_chars");
  });
});
