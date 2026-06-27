const DEVICE_ID_KEY = "QUOTATION_DEVICE_ID";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "SERVER";
  const stored = localStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getNextLocalSeq(deviceId: string): number {
  if (typeof window === "undefined") return 0;
  const key = `TEMP_SEQ_${deviceId}`;
  const current = parseInt(localStorage.getItem(key) ?? "0", 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return next;
}

export function generateTempNumber(deviceId: string, seq: number): string {
  return `TEMP-${deviceId.slice(0, 4).toUpperCase()}-${String(seq).padStart(4, "0")}`;
}

export function formatServerNumber(year: number, seq: number): string {
  return `DEV-${year}-${String(seq).padStart(4, "0")}`;
}
