"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";

function sortByCreatedAtDesc(a: QuoteLocal, b: QuoteLocal): number {
  return b.createdAt.localeCompare(a.createdAt);
}

export function useLiveQuotes(userId?: string): { quotes: QuoteLocal[] } {
  const [quotes, setQuotes] = useState<QuoteLocal[]>([]);

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const result = userId
        ? await db.quotes.where("ownerId").equals(userId).toArray()
        : await db.quotes.toArray();
      return result.sort(sortByCreatedAtDesc);
    }).subscribe({
      next: (result) => setQuotes(result),
      error: () => setQuotes([]),
    });
    return () => subscription.unsubscribe();
  }, [userId]);

  return { quotes };
}
