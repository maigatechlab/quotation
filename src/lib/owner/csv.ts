import { formatDateFr } from "./format";
import type { TenantRow } from "./tenant-filters";

const HEADERS = [
  "name",
  "slug",
  "plan",
  "status",
  "subscriptionEnd",
  "daysRemaining",
  "lastPaymentAmount",
  "lastPaymentMethod",
  "lastPaymentDate",
  "activeUsers",
  "maxUsers",
  "createdAt",
];

function esc(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function buildTenantsCsv(rows: TenantRow[]): string {
  const lines = rows.map((r) =>
    [
      r.name,
      r.slug,
      r.plan,
      r.status,
      r.subscriptionEnd ? formatDateFr(r.subscriptionEnd) : "",
      r.daysRemaining !== null ? String(r.daysRemaining) : "",
      r.lastPaymentAmount !== null ? String(r.lastPaymentAmount) : "",
      r.lastPaymentMethod ?? "",
      r.lastPaymentDate ? formatDateFr(r.lastPaymentDate) : "",
      `${r.activeUsers}/${r.maxUsers}`,
      formatDateFr(r.createdAt),
    ]
      .map(esc)
      .join(","),
  );
  // UTF-8 BOM (U+FEFF) required for Excel in Niger/AES region
  return "﻿" + [HEADERS.join(","), ...lines].join("\r\n");
}
