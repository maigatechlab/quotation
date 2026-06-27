"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";

export function useLiveQuotes(): { quotes: QuoteLocal[] } {
  const [quotes, setQuotes] = useState<QuoteLocal[]>([]);

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.quotes.orderBy("createdAt").reverse().toArray()
    ).subscribe({
      next: (result) => setQuotes(result),
      error: () => setQuotes([]),
    });
    return () => subscription.unsubscribe();
  }, []);

  return { quotes };
}
