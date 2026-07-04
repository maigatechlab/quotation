import { describe, it, expect } from "vitest";
import {
  buildPaymentConfirmationEmailHtml,
  buildPaymentConfirmationEmailText,
  type PaymentConfirmationEmailParams,
} from "./payment-email";

const baseParams: PaymentConfirmationEmailParams = {
  tenantName: "Transport Sahel",
  subdomainUrl: "https://sahel.quotation.com",
  amount: 25000,
  currency: "XOF",
  paymentMethod: "wave",
  paymentReference: "WAVE-12345",
  paidAt: new Date("2026-06-15T00:00:00.000Z"),
  periodStart: new Date("2026-06-15T00:00:00.000Z"),
  periodEnd: new Date("2026-07-15T00:00:00.000Z"),
  billingCycle: "monthly",
  reactivated: false,
};

describe("buildPaymentConfirmationEmailHtml", () => {
  it("escapes paymentReference containing <script>", () => {
    const html = buildPaymentConfirmationEmailHtml({
      ...baseParams,
      paymentReference: '<script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes paymentReference containing double quotes", () => {
    const html = buildPaymentConfirmationEmailHtml({
      ...baseParams,
      paymentReference: 'REF "quoted"',
    });
    expect(html).not.toContain('"quoted"');
    expect(html).toContain("&quot;quoted&quot;");
  });

  it("escapes tenantName with ampersand", () => {
    const html = buildPaymentConfirmationEmailHtml({
      ...baseParams,
      tenantName: "Maiga & Frères",
    });
    expect(html).toContain("Maiga &amp; Frères");
    expect(html).not.toMatch(/Maiga & Frères/);
  });

  it("contains formatted amount", () => {
    const html = buildPaymentConfirmationEmailHtml(baseParams);
    expect(html).toContain("25");
    expect(html).toContain("XOF");
  });

  it("contains payment method label", () => {
    const html = buildPaymentConfirmationEmailHtml(baseParams);
    expect(html).toContain("Wave");
  });

  it("contains paymentReference when provided", () => {
    const html = buildPaymentConfirmationEmailHtml(baseParams);
    expect(html).toContain("WAVE-12345");
  });

  it("omits reference row when paymentReference is null", () => {
    const html = buildPaymentConfirmationEmailHtml({
      ...baseParams,
      paymentReference: null,
    });
    expect(html).not.toContain("Référence");
  });

  it("contains subdomain link", () => {
    const html = buildPaymentConfirmationEmailHtml(baseParams);
    expect(html).toContain("https://sahel.quotation.com");
  });

  it("does NOT include reactivation block when reactivated=false", () => {
    const html = buildPaymentConfirmationEmailHtml({ ...baseParams, reactivated: false });
    expect(html).not.toContain("réactivé");
  });

  it("includes reactivation block when reactivated=true", () => {
    const html = buildPaymentConfirmationEmailHtml({ ...baseParams, reactivated: true });
    expect(html.toLowerCase()).toContain("réactivé");
  });

  it("shows reactivated title when reactivated=true", () => {
    const html = buildPaymentConfirmationEmailHtml({ ...baseParams, reactivated: true });
    expect(html).toContain("Compte réactivé");
  });
});

describe("buildPaymentConfirmationEmailText", () => {
  it("contains tenant name", () => {
    const text = buildPaymentConfirmationEmailText(baseParams);
    expect(text).toContain("Transport Sahel");
  });

  it("contains raw amount", () => {
    const text = buildPaymentConfirmationEmailText(baseParams);
    expect(text).toContain("25000");
    expect(text).toContain("XOF");
  });

  it("contains payment method", () => {
    const text = buildPaymentConfirmationEmailText(baseParams);
    expect(text).toContain("Wave");
  });

  it("contains reference when provided", () => {
    const text = buildPaymentConfirmationEmailText(baseParams);
    expect(text).toContain("WAVE-12345");
  });

  it("contains subdomain URL", () => {
    const text = buildPaymentConfirmationEmailText(baseParams);
    expect(text).toContain("https://sahel.quotation.com");
  });

  it("contains reactivation note when reactivated=true", () => {
    const text = buildPaymentConfirmationEmailText({ ...baseParams, reactivated: true });
    expect(text.toLowerCase()).toContain("réactivé");
  });

  it("omits reactivation note when reactivated=false", () => {
    const text = buildPaymentConfirmationEmailText({ ...baseParams, reactivated: false });
    expect(text).not.toContain("réactivé");
  });
});
