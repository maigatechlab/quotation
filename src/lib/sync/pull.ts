"use client";

import { db } from "@/lib/local-db";
import type {
  ClientLocal,
  QuoteLocal,
  QuoteLineLocal,
  ClauseLocal,
  TemplateLocal,
  CompanyLocal,
  RouteTemplateLocal,
} from "@/lib/local-db";

export interface PullResult {
  updatedCount: number;
  conflictsResolved: number;
}

interface PullResponse {
  cursor: string;
  entities: {
    clients?: ClientLocal[];
    quotes?: QuoteLocal[];
    quoteLines?: QuoteLineLocal[];
    clauses?: ClauseLocal[];
    templates?: TemplateLocal[];
    routeTemplates?: RouteTemplateLocal[];
    company?: CompanyLocal | null;
  };
}

export async function pullDelta(cursor: string): Promise<PullResult> {
  const res = await fetch(
    `/api/v1/sync/pull?since=${encodeURIComponent(cursor)}`,
    { method: "GET" }
  );

  if (!res.ok) {
    throw new Error(`Pull failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as PullResponse;

  const {
    clients = [],
    quotes = [],
    quoteLines = [],
    clauses = [],
    templates = [],
    routeTemplates = [],
    company,
  } = data.entities;

  let updatedCount = 0;

  // P8: wrap all entity puts in a single transaction — atomic on interrupted pull
  await db.transaction(
    "rw",
    [db.clients, db.quotes, db.quoteLines, db.clauses, db.templates, db.routeTemplates, db.company],
    async () => {
      // At-rest encryption of classified fields is applied transparently by the
      // Dexie encryption layer (Story 6.1) on every put — no manual encrypt here.
      for (const item of clients) {
        await db.clients.put(item);
        updatedCount++;
      }

      for (const item of quotes) {
        await db.quotes.put(item);
        updatedCount++;
      }

      for (const item of quoteLines) {
        await db.quoteLines.put(item);
        updatedCount++;
      }

      for (const item of clauses) {
        await db.clauses.put(item);
        updatedCount++;
      }

      for (const item of templates) {
        if (item.deletedAt) {
          await db.templates.delete(item.id);
        } else {
          await db.templates.put(item);
        }
        updatedCount++;
      }

      for (const item of routeTemplates) {
        if (item.deletedAt) {
          await db.routeTemplates.delete(item.id);
        } else {
          await db.routeTemplates.put(item);
        }
        updatedCount++;
      }

      if (company) {
        await db.company.put(company);
        updatedCount++;
      }
    }
  );

  if (typeof window !== "undefined") {
    localStorage.setItem("SYNC_CURSOR_global", data.cursor);
  }

  return { updatedCount, conflictsResolved: 0 };
}
