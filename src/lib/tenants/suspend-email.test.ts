import { describe, expect, it } from "vitest";
import { buildSuspendEmailHtml, buildSuspendEmailText } from "./suspend-email";

const base = {
  tenantName: "Trans Sahel",
  reasonLabel: "Non-paiement",
  effectiveDate: new Date("2026-06-29T10:00:00Z"),
  ownerWhatsapp: "+22796000001",
  ownerEmail: "contact@maigatechlab.com",
};

describe("buildSuspendEmailHtml", () => {
  it("includes tenant name, reason, and contact", () => {
    const html = buildSuspendEmailHtml(base);
    expect(html).toContain("Trans Sahel");
    expect(html).toContain("Non-paiement");
    expect(html).toContain("contact@maigatechlab.com");
    expect(html).toContain("+22796000001");
    expect(html).toContain("données sont conservées");
  });

  it("includes a WhatsApp link for valid phone", () => {
    const html = buildSuspendEmailHtml(base);
    expect(html).toContain("wa.me/22796000001");
  });

  it("includes mailto link", () => {
    const html = buildSuspendEmailHtml(base);
    expect(html).toContain("mailto:contact@maigatechlab.com");
  });

  it("escapes HTML in tenant name", () => {
    const html = buildSuspendEmailHtml({ ...base, tenantName: "<script>xss</script>" });
    expect(html).not.toContain("<script>xss</script>");
    expect(html).toContain("&lt;script&gt;xss&lt;/script&gt;");
  });

  it("escapes HTML in reason label", () => {
    const html = buildSuspendEmailHtml({ ...base, reasonLabel: 'R&D <b>test</b> "quote"' });
    expect(html).toContain("R&amp;D &lt;b&gt;test&lt;/b&gt; &quot;quote&quot;");
  });

  it("escapes HTML in note when provided", () => {
    const html = buildSuspendEmailHtml({ ...base, note: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("omits note section when note is null", () => {
    const html = buildSuspendEmailHtml({ ...base, note: null });
    expect(html).not.toContain("Note :");
  });

  it("includes note when provided", () => {
    const html = buildSuspendEmailHtml({ ...base, note: "Facture en attente" });
    expect(html).toContain("Facture en attente");
    expect(html).toContain("Note :");
  });

  it("falls back to span when whatsapp has no digits", () => {
    const html = buildSuspendEmailHtml({ ...base, ownerWhatsapp: "Contactez Maiga Tech Lab" });
    expect(html).not.toContain("wa.me/");
  });

  it("links to /subscription-expired", () => {
    const html = buildSuspendEmailHtml(base);
    expect(html).toContain("/subscription-expired");
  });
});

describe("buildSuspendEmailText", () => {
  it("includes all key info", () => {
    const text = buildSuspendEmailText(base);
    expect(text).toContain("Trans Sahel");
    expect(text).toContain("Non-paiement");
    expect(text).toContain("contact@maigatechlab.com");
    expect(text).toContain("+22796000001");
    expect(text).toContain("données sont conservées");
  });

  it("includes note in text when provided", () => {
    const text = buildSuspendEmailText({ ...base, note: "Motif interne" });
    expect(text).toContain("Motif interne");
  });

  it("excludes note line when not provided", () => {
    const text = buildSuspendEmailText(base);
    expect(text).not.toContain("Note :");
  });
});
