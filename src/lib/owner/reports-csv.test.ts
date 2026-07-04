import { describe, expect, it } from "vitest";
import { buildPaymentsCsv, buildTenantsSnapshotCsv } from "./reports-csv";
import type { PaymentExportRow, TenantSnapshotRow } from "./reports";

const SAMPLE_PAYMENT: PaymentExportRow = {
  paidAt: new Date("2026-06-15T14:30:00.000Z"),
  tenantName: "Acme SARL",
  tenantSlug: "acme",
  method: "wave",
  amount: 25000,
  currency: "XOF",
  reference: "TX-123",
  periodStart: new Date("2026-06-01"),
  periodEnd: new Date("2026-06-30"),
  billingCycle: "monthly",
  confirmedBy: "user-1",
  notes: null,
};

describe("buildPaymentsCsv", () => {
  it("starts with UTF-8 BOM (U+FEFF)", () => {
    const csv = buildPaymentsCsv([SAMPLE_PAYMENT]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("first line after BOM matches exact headers order", () => {
    const csv = buildPaymentsCsv([]);
    const firstLine = csv.slice(1).split("\r\n")[0]!;
    expect(firstLine).toBe(
      "date,tenant,slug,method,amount,currency,reference,periodStart,periodEnd,billingCycle,confirmedBy,notes"
    );
  });

  it("writes amount as integer string, never float", () => {
    const csv = buildPaymentsCsv([SAMPLE_PAYMENT]);
    expect(csv).toContain(",25000,");
    expect(csv).not.toContain("25000.00");
  });

  it("escapes commas in tenant name", () => {
    const csv = buildPaymentsCsv([{ ...SAMPLE_PAYMENT, tenantName: "Acme, SARL" }]);
    expect(csv).toContain('"Acme, SARL"');
  });

  it("escapes double quotes by doubling them", () => {
    const csv = buildPaymentsCsv([{ ...SAMPLE_PAYMENT, notes: 'Hello "world"' }]);
    expect(csv).toContain('"Hello ""world"""');
  });

  it("renders empty cell for null tenant name", () => {
    const csv = buildPaymentsCsv([{ ...SAMPLE_PAYMENT, tenantName: null, tenantSlug: null }]);
    const dataLine = csv.slice(1).split("\r\n")[1]!;
    expect(dataLine.split(",")[1]).toBe("");
    expect(dataLine.split(",")[2]).toBe("");
  });

  it("uses CRLF line endings", () => {
    const csv = buildPaymentsCsv([SAMPLE_PAYMENT, SAMPLE_PAYMENT]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it("emits BOM + headers only when there are no rows", () => {
    const csv = buildPaymentsCsv([]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(1);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

const SAMPLE_SNAPSHOT: TenantSnapshotRow = {
  id: "t1",
  name: "Acme SARL",
  slug: "acme",
  plan: "pro",
  status: "active",
  subscriptionStart: new Date("2026-01-01"),
  subscriptionEnd: new Date("2026-12-31"),
  maxUsers: 5,
};

describe("buildTenantsSnapshotCsv", () => {
  it("starts with BOM and has exact headers", () => {
    const csv = buildTenantsSnapshotCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const firstLine = csv.slice(1).split("\r\n")[0]!;
    expect(firstLine).toBe("name,slug,plan,status,subscriptionStart,subscriptionEnd,maxUsers");
  });

  it("emits one row per tenant", () => {
    const csv = buildTenantsSnapshotCsv([SAMPLE_SNAPSHOT, SAMPLE_SNAPSHOT]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3);
  });
});
