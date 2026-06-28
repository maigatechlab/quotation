"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type {
  QuoteLocal,
  QuoteLineLocal,
  QuoteClauseLocal,
  QuoteStatusLogLocal,
} from "@/lib/local-db";

export function useLiveQuote(id: string): {
  quote: QuoteLocal | null | undefined;
  lines: QuoteLineLocal[];
  clauses: QuoteClauseLocal[];
  statusLogs: QuoteStatusLogLocal[];
} {
  const [quote, setQuote] = useState<QuoteLocal | null | undefined>(undefined);
  const [lines, setLines] = useState<QuoteLineLocal[]>([]);
  const [clauses, setClauses] = useState<QuoteClauseLocal[]>([]);
  const [statusLogs, setStatusLogs] = useState<QuoteStatusLogLocal[]>([]);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const q = await db.quotes.get(id);
      const l = await db.quoteLines.where("quoteId").equals(id).sortBy("ordre");
      const c = await db.quoteClauses.where("quoteId").equals(id).sortBy("ordre");
      // Story 3.9 — timeline des transitions : triées par changedAt croissant
      // (ordre chronologique des événements du cycle de vie du devis).
      const logs = await db.quoteStatusLogs
        .where("quoteId")
        .equals(id)
        .sortBy("changedAt");
      return { quote: q ?? null, lines: l, clauses: c, statusLogs: logs };
    }).subscribe({
      next: ({ quote: q, lines: l, clauses: c, statusLogs: slogs }) => {
        setQuote(q);
        setLines(l);
        setClauses(c);
        setStatusLogs(slogs);
      },
      error: () => {
        setQuote(null);
        setLines([]);
        setClauses([]);
        setStatusLogs([]);
      },
    });
    return () => sub.unsubscribe();
  }, [id]);

  return { quote, lines, clauses, statusLogs };
}
