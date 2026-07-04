import { describe, expect, it } from "vitest";
import { buildWelcomeEmailHtml, buildWelcomeEmailText } from "./welcome-email";

const baseParams = {
  tenantName: "Trans Sahel",
  subdomainUrl: "https://trans-sahel.quotation.com",
  adminEmail: "admin@trans-sahel.ne",
  password: "Abc-2345xyzQRST!",
  trialEndsAt: "12/07/2026",
};

describe("buildWelcomeEmailHtml", () => {
  it("includes the URL, email, password and trial date", () => {
    const html = buildWelcomeEmailHtml(baseParams);
    expect(html).toContain("https://trans-sahel.quotation.com");
    expect(html).toContain("admin@trans-sahel.ne");
    expect(html).toContain("Abc-2345xyzQRST!");
    expect(html).toContain("12/07/2026");
    expect(html).toContain("Trans Sahel");
  });

  it("escapes a password containing HTML-significant characters", () => {
    const html = buildWelcomeEmailHtml({
      ...baseParams,
      password: `<script>alert(1)</script>"'`,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
  });

  it("escapes the tenant name", () => {
    const html = buildWelcomeEmailHtml({ ...baseParams, tenantName: "A & <b>B</b>" });
    expect(html).toContain("A &amp; &lt;b&gt;B&lt;/b&gt;");
  });

  it("omits the trial line when trialEndsAt is null", () => {
    const html = buildWelcomeEmailHtml({ ...baseParams, trialEndsAt: null });
    expect(html).not.toContain("période d'essai");
  });
});

describe("buildWelcomeEmailText", () => {
  it("includes credentials in plain text", () => {
    const text = buildWelcomeEmailText(baseParams);
    expect(text).toContain("https://trans-sahel.quotation.com");
    expect(text).toContain("admin@trans-sahel.ne");
    expect(text).toContain("Abc-2345xyzQRST!");
  });
});
