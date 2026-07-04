import { describe, expect, it } from "vitest";
import { buildCancelEmailHtml, buildCancelEmailText } from "./cancel-email";

const base = {
  tenantName: "Trans Sahel",
  effectiveDate: new Date("2026-06-29T10:00:00Z"),
  ownerWhatsapp: "+22796000001",
  ownerEmail: "contact@maigatechlab.com",
};

describe("buildCancelEmailHtml", () => {
  it("includes tenant name and contact info", () => {
    const html = buildCancelEmailHtml(base);
    expect(html).toContain("Trans Sahel");
    expect(html).toContain("contact@maigatechlab.com");
    expect(html).toContain("+22796000001");
  });

  it("mentions IRRÉVERSIBLE", () => {
    const html = buildCancelEmailHtml(base);
    expect(html).toContain("IRRÉVERSIBLE");
  });

  it("mentions data preserved", () => {
    const html = buildCancelEmailHtml(base);
    expect(html).toContain("données sont conservées");
  });

  it("mentions manual reactivation", () => {
    const html = buildCancelEmailHtml(base);
    expect(html).toContain("réactivation nécessite un contact manuel");
  });

  it("includes WhatsApp link", () => {
    const html = buildCancelEmailHtml(base);
    expect(html).toContain("wa.me/22796000001");
  });

  it("includes mailto link", () => {
    const html = buildCancelEmailHtml(base);
    expect(html).toContain("mailto:contact@maigatechlab.com");
  });

  it("escapes HTML in tenant name", () => {
    const html = buildCancelEmailHtml({ ...base, tenantName: "<b>XSS</b> & Co" });
    expect(html).not.toContain("<b>XSS</b>");
    expect(html).toContain("&lt;b&gt;XSS&lt;/b&gt; &amp; Co");
  });

  it("escapes HTML in email address", () => {
    const html = buildCancelEmailHtml({ ...base, ownerEmail: '"attack@x.com' });
    expect(html).toContain("&quot;attack@x.com");
  });

  it("falls back to span when no digit in whatsapp", () => {
    const html = buildCancelEmailHtml({ ...base, ownerWhatsapp: "Contactez Maiga Tech Lab" });
    expect(html).not.toContain("wa.me/");
  });
});

describe("buildCancelEmailText", () => {
  it("includes all key info", () => {
    const text = buildCancelEmailText(base);
    expect(text).toContain("Trans Sahel");
    expect(text).toContain("contact@maigatechlab.com");
    expect(text).toContain("+22796000001");
    expect(text).toContain("IRRÉVERSIBLE");
    expect(text).toContain("données sont conservées");
  });
});
