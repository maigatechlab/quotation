import { describe, expect, it } from "vitest";
import { buildReactivationEmailHtml, buildReactivationEmailText } from "./reactivate-email";

function makeParams(overrides: Partial<Parameters<typeof buildReactivationEmailHtml>[0]> = {}) {
  return {
    tenantName: "Trans Sahel",
    subdomainUrl: "https://trans-sahel.quotation.com",
    periodStart: new Date("2026-06-15T00:00:00.000Z"),
    periodEnd: new Date("2026-07-15T00:00:00.000Z"),
    paymentMethod: "wave",
    paymentReference: "WAVE-123",
    paymentAmount: 25000,
    currency: "XOF",
    ...overrides,
  };
}

describe("buildReactivationEmailHtml", () => {
  it("escapes a malicious paymentReference", () => {
    const html = buildReactivationEmailHtml(
      makeParams({ paymentReference: '<script>alert(1)</script>"' })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&quot;");
  });

  it("escapes tenantName with special characters", () => {
    const html = buildReactivationEmailHtml(makeParams({ tenantName: `Société "Test" & Co` }));
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("mentions reactivation", () => {
    const html = buildReactivationEmailHtml(makeParams());
    expect(html).toContain("réactivé");
  });

  it("includes formatted period, amount, method, reference, and link", () => {
    const html = buildReactivationEmailHtml(makeParams());
    expect(html).toContain("15 juin 2026");
    expect(html).toContain("15 juillet 2026");
    expect(html).toMatch(/25\s000/);
    expect(html).toContain("Wave");
    expect(html).toContain("WAVE-123");
    expect(html).toContain("https://trans-sahel.quotation.com");
  });

  it("omits the reference row when paymentReference is null", () => {
    const html = buildReactivationEmailHtml(makeParams({ paymentReference: null }));
    expect(html).not.toContain("Référence");
  });
});

describe("buildReactivationEmailText", () => {
  it("contains all fields in plain text", () => {
    const text = buildReactivationEmailText(makeParams());
    expect(text).toContain("Trans Sahel");
    expect(text).toContain("réactivé");
    expect(text).toMatch(/25\s000/);
    expect(text).toContain("Wave");
    expect(text).toContain("WAVE-123");
    expect(text).toContain("https://trans-sahel.quotation.com");
  });

  it("omits reference line when null", () => {
    const text = buildReactivationEmailText(makeParams({ paymentReference: null }));
    expect(text).not.toContain("Référence");
  });
});
