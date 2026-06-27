"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { QuoteLocal, QuoteLineLocal, QuoteClauseLocal } from "@/lib/local-db";

export function useLiveQuote(id: string): {
  quote: QuoteLocal | null | undefined;
  lines: QuoteLineLocal[];
  clauses: QuoteClauseLocal[];
} {
  const [quote, setQuote] = useState<QuoteLocal | null | undefined>(undefined);
  const [lines, setLines] = useState<QuoteLineLocal[]>([]);
  const [clauses, setClauses] = useState<QuoteClauseLocal[]>([]);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const q = await db.quotes.get(id);
      const l = await db.quoteLines.where("quoteId").equals(id).sortBy("ordre");
      const c = await db.quoteClauses.where("quoteId").equals(id).sortBy("ordre");
      return { quote: q ?? null, lines: l, clauses: c };
    }).subscribe({
      next: ({ quote: q, lines: l, clauses: c }) => { setQuote(q); setLines(l); setClauses(c); },
      error: () => { setQuote(null); setLines([]); setClauses([]); },
    });
    return () => sub.unsubscribe();
  }, [id]);

  return { quote, lines, clauses };
}
