export function formatRelativeDate(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return rtf.format(diffH, "hour");
  const diffD = Math.round(diffH / 24);
  return rtf.format(diffD, "day");
}

export function formatDaysRemaining(end: Date | null): {
  label: string;
  tone: "ok" | "warn" | "danger" | "expired";
} {
  if (!end) return { label: "", tone: "ok" };
  const diffMs = new Date(end).getTime() - Date.now();
  const diffD = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffD < 0) return { label: "Expiré", tone: "expired" };
  if (diffD <= 7) return { label: `J-${diffD}`, tone: "danger" };
  if (diffD <= 14) return { label: `J-${diffD}`, tone: "warn" };
  return { label: `+${diffD} j`, tone: "ok" };
}

const DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateFr(date: Date | string | null): string {
  if (!date) return "";
  return DATE_FORMATTER.format(new Date(date));
}
