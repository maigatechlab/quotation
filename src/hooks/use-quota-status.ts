"use client";

import { useState, useEffect } from "react";

export interface QuotaStatus {
  tier: "starter" | "pro" | "entreprise";
  quotaStatus: "ok" | "warning" | "exceeded" | "readonly";
  quotas: {
    quotes: { limit: number | null; used: number; resetAt: string };
    users: { limit: number; used: number };
  };
  graceExpiresAt: string | null;
  daysRemaining: number | null;
}

export function useQuotaStatus(): QuotaStatus | null {
  const [status, setStatus] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    fetch("/api/v1/quota")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (data) setStatus(data as QuotaStatus);
      })
      .catch(() => {});
  }, []);

  return status;
}
