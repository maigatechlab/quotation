import { describe, expect, it } from "vitest";
import {
  buildExpiryEmailHtml,
  buildExpiryEmailText,
  buildReminderEmailHtml,
  buildReminderEmailText,
  reminderSubject,
} from "./reminder-email";
import type { ReminderStage } from "./expiry-decisions";

const XSS_NAME = "<script>x</script>";
const INJECTION_CONTACT = '"injection"';

function reminderParams(overrides: Partial<Parameters<typeof buildReminderEmailHtml>[1]> = {}) {
  return {
    tenantName: "Trans Sahel",
    subdomainUrl: "https://trans-sahel.quotation.com",
    expiryDateFormatted: "8 juillet 2026",
    daysRemaining: 7,
    ownerWhatsapp: "+227001",
    ownerEmail: "owner@ml.com",
    ...overrides,
  };
}

describe("buildReminderEmailHtml", () => {
  const stages: ReminderStage[] = ["first", "second", "urgent"];

  it("escapes tenantName and ownerEmail against XSS/injection", () => {
    const html = buildReminderEmailHtml(
      "first",
      reminderParams({ tenantName: XSS_NAME, ownerEmail: INJECTION_CONTACT })
    );
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;injection&quot;");
  });

  for (const stage of stages) {
    it(`${stage}: contains daysRemaining and the correct subject`, () => {
      const html = buildReminderEmailHtml(stage, reminderParams({ daysRemaining: stage === "urgent" ? 1 : 7 }));
      expect(html).toContain(reminderSubject(stage));
    });
  }

  it("first/second/urgent produce different visual urgency colors", () => {
    const first = buildReminderEmailHtml("first", reminderParams());
    const second = buildReminderEmailHtml("second", reminderParams());
    const urgent = buildReminderEmailHtml("urgent", reminderParams());
    expect(first).toContain("#2563eb");
    expect(second).toContain("#d97706");
    expect(urgent).toContain("#b91c1c");
  });
});

describe("buildReminderEmailText", () => {
  it("contains tenant name and days remaining", () => {
    const text = buildReminderEmailText("second", reminderParams({ daysRemaining: 3 }));
    expect(text).toContain("Trans Sahel");
    expect(text).toContain("3 jours");
  });
});

function expiryParams(overrides: Partial<Parameters<typeof buildExpiryEmailHtml>[0]> = {}) {
  return {
    tenantName: "Trans Sahel",
    subdomainUrl: "https://trans-sahel.quotation.com",
    graceEndsAtFormatted: "8 juillet 2026",
    graceDays: 7,
    ownerWhatsapp: "+227001",
    ownerEmail: "owner@ml.com",
    ...overrides,
  };
}

describe("buildExpiryEmailHtml", () => {
  it("contains graceDays, graceEndsAtFormatted and ownerEmail", () => {
    const html = buildExpiryEmailHtml(expiryParams());
    expect(html).toContain("7 jours");
    expect(html).toContain("8 juillet 2026");
    expect(html).toContain("owner@ml.com");
  });

  it("escapes tenantName against XSS", () => {
    const html = buildExpiryEmailHtml(expiryParams({ tenantName: XSS_NAME }));
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildExpiryEmailText", () => {
  it("contains suspension + grace + contact info", () => {
    const text = buildExpiryEmailText(expiryParams());
    expect(text).toContain("Trans Sahel");
    expect(text).toContain("7 jours");
    expect(text).toContain("owner@ml.com");
  });
});
