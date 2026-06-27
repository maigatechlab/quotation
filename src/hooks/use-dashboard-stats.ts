"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";

export type DashboardPeriod = "7j" | "30j" | "90j" | "tout";

export interface DashboardStats {
  total: number; // tous statuts non annulés
  draft: number; // "draft"
  validated: number; // "validated"
  sent: number; // "sent"
  accepted: number; // "accepted"
  expired: number; // "expired"
  cancelled: number; // "cancelled" (pour info, exclu du Total)
  amountTotal: number; // somme totalFcfa des statuts "accepted" + "sent" (FR-42)
  isLoading: boolean;
}

function getCutoffDate(period: DashboardPeriod): Date | null {
  if (period === "tout") return null;
  const days = period === "7j" ? 7 : period === "30j" ? 30 : 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff;
}

export function computeStats(
  quotes: QuoteLocal[],
  period: DashboardPeriod
): Omit<DashboardStats, "isLoading"> {
  const cutoff = getCutoffDate(period);
  const filtered = cutoff
    ? quotes.filter((q) => {
        const dateStr = q.dateDevis ?? q.createdAt;
        return dateStr ? new Date(dateStr) >= cutoff : false;
      })
    : quotes;

  const counts = {
    draft: 0,
    validated: 0,
    sent: 0,
    accepted: 0,
    expired: 0,
    cancelled: 0,
  };
  let amountTotal = 0;
  for (const q of filtered) {
    if (q.status in counts) counts[q.status as keyof typeof counts]++;
    if (q.status === "accepted" || q.status === "sent") {
      amountTotal += q.totalFcfa;
    }
  }
  const total =
    counts.draft +
    counts.validated +
    counts.sent +
    counts.accepted +
    counts.expired;
  return { total, ...counts, amountTotal };
}

export function useDashboardStats(period: DashboardPeriod): DashboardStats {
  const [allQuotes, setAllQuotes] = useState<QuoteLocal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // tick forces re-render every 30s for passive refresh (FR-40)
  // even when no Dexie mutation occurs (e.g. when the period window shifts at midnight)
  const [_tick, setTick] = useState(0);

  // liveQuery réagit à chaque mutation Dexie
  useEffect(() => {
    const subscription = liveQuery(() => db.quotes.toArray()).subscribe({
      next: (quotes) => {
        setAllQuotes(quotes);
        setIsLoading(false);
      },
      error: () => {
        setIsLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, []);

  // Refresh passif toutes les 30 secondes (FR-40)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const stats = computeStats(allQuotes, period);
  return { ...stats, isLoading };
}
