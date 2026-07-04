import { describe, expect, it } from "vitest";
import { buildTenantsCsv } from "./csv";
import type { TenantRow } from "./tenant-filters";

const SAMPLE_ROW: TenantRow = {
  id: "abc-123",
  name: "Acme SARL",
  slug: "acme",
  plan: "pro",
  status: "active",
  subscriptionEnd: new Date("2026-12-31"),
  maxUsers: 5,
  createdAt: new Date("2026-01-01"),
  lastPaymentAmount: 25000,
  lastPaymentMethod: "wave",
  lastPaymentDate: new Date("2026-06-01"),
  activeUsers: 3,
  daysRemaining: 180,
};

const ROW_WITH_QUOTE: TenantRow = {
  ...SAMPLE_ROW,
  name: 'Name "with" quotes',
};

describe("buildTenantsCsv", () => {
  it("starts with UTF-8 BOM (U+FEFF)", () => {
    const csv = buildTenantsCsv([SAMPLE_ROW]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("first data line contains correct headers", () => {
    const csv = buildTenantsCsv([]);
    const firstLine = csv.slice(1).split("\r\n")[0]!;
    expect(firstLine).toBe(
      "name,slug,plan,status,subscriptionEnd,daysRemaining,lastPaymentAmount,lastPaymentMethod,lastPaymentDate,activeUsers,maxUsers,createdAt",
    );
  });

  it("uses CRLF line endings", () => {
    const csv = buildTenantsCsv([SAMPLE_ROW]);
    expect(csv).toContain("\r\n");
    expect(csv.split("\r\n").length).toBeGreaterThan(1);
  });

  it("writes amount as integer string (never float)", () => {
    const csv = buildTenantsCsv([SAMPLE_ROW]);
    expect(csv).toContain('"25000"');
    expect(csv).not.toContain("25000.00");
  });

  it("escapes double quotes by doubling them", () => {
    const csv = buildTenantsCsv([ROW_WITH_QUOTE]);
    expect(csv).toContain('"Name ""with"" quotes"');
  });

  it("handles null payment fields gracefully", () => {
    const row: TenantRow = {
      ...SAMPLE_ROW,
      lastPaymentAmount: null,
      lastPaymentMethod: null,
      lastPaymentDate: null,
    };
    const csv = buildTenantsCsv([row]);
    expect(csv).toBeDefined();
    expect(csv.includes("null")).toBe(false);
  });

  it("handles empty rows list", () => {
    const csv = buildTenantsCsv([]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(1); // only header
  });

  it("emits one data row per tenant", () => {
    const csv = buildTenantsCsv([SAMPLE_ROW, SAMPLE_ROW]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});
