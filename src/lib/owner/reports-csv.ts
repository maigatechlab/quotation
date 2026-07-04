import type { PaymentExportRow, TenantSnapshotRow } from "./reports";

const PAYMENTS_HEADERS = [
  "date",
  "tenant",
  "slug",
  "method",
  "amount",
  "currency",
  "reference",
  "periodStart",
  "periodEnd",
  "billingCycle",
  "confirmedBy",
  "notes",
];

const SNAPSHOT_HEADERS = ["name", "slug", "plan", "status", "subscriptionStart", "subscriptionEnd", "maxUsers"];

function escapeCsv(v: string | null | undefined): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toIsoDateOnly(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function buildPaymentsCsv(rows: PaymentExportRow[]): string {
  const lines = rows.map((r) =>
    [
      r.paidAt.toISOString(),
      r.tenantName ?? "",
      r.tenantSlug ?? "",
      r.method,
      String(r.amount),
      r.currency,
      r.reference ?? "",
      toIsoDateOnly(r.periodStart),
      toIsoDateOnly(r.periodEnd),
      r.billingCycle,
      r.confirmedBy,
      r.notes ?? "",
    ]
      .map(escapeCsv)
      .join(",")
  );
  // UTF-8 BOM (U+FEFF) required for Excel in Niger/AES region
  return "﻿" + [PAYMENTS_HEADERS.join(","), ...lines].join("\r\n");
}

export function buildTenantsSnapshotCsv(rows: TenantSnapshotRow[]): string {
  const lines = rows.map((r) =>
    [
      r.name,
      r.slug,
      r.plan,
      r.status,
      toIsoDateOnly(r.subscriptionStart),
      toIsoDateOnly(r.subscriptionEnd),
      String(r.maxUsers),
    ]
      .map(escapeCsv)
      .join(",")
  );
  return "﻿" + [SNAPSHOT_HEADERS.join(","), ...lines].join("\r\n");
}
