// Shared quota-rejection detection — no "use client", importable from both the
// window sync pipeline (push.ts) and the Service Worker (sw.ts).
//
// Quota/readonly rejections reuse the conflict response shape
// ({status:"conflict", entity:{error:"READONLY_MODE"|"QUOTA_EXCEEDED"}}) but
// `entity` has no `id` — it must be distinguished from a real LWW conflict
// entity before running conflict resolution. The two reasons below are the
// exact `QuotaCheckResult.reason` union values from quota-check.ts; a real
// conflict entity that happens to carry an `error` field (or a malformed
// server payload) must still go through LWW handling.
export const KNOWN_QUOTA_REJECTION_REASONS = new Set(["READONLY_MODE", "QUOTA_EXCEEDED"]);

export function getQuotaRejectionReason(entity: unknown): string | undefined {
  if (
    entity !== null &&
    typeof entity === "object" &&
    "error" in entity &&
    typeof (entity as { error: unknown }).error === "string" &&
    KNOWN_QUOTA_REJECTION_REASONS.has((entity as { error: string }).error)
  ) {
    return (entity as { error: string }).error;
  }
  return undefined;
}

export function getQuotaRejectionMessage(reason: string): string {
  if (reason === "READONLY_MODE") {
    return "Compte en lecture seule : mutation refusée à la synchronisation.";
  }
  return "Quota dépassé : mutation refusée à la synchronisation.";
}
