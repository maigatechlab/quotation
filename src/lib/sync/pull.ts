"use client";

import { localCrypto } from "@/lib/crypto/local-crypto";
import { db } from "@/lib/local-db";
import type {
  ClientLocal,
  QuoteLocal,
  QuoteLineLocal,
  ClauseLocal,
  TemplateLocal,
  CompanyLocal,
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
    company,
  } = data.entities;

  let updatedCount = 0;

  // P8: wrap all entity puts in a single transaction — atomic on interrupted pull
  await db.transaction(
    "rw",
    [db.clients, db.quotes, db.quoteLines, db.clauses, db.templates, db.company],
    async () => {
      for (const item of clients) {
        const encrypted = (await localCrypto.encrypt(item)) as ClientLocal;
        await db.clients.put(encrypted);
        updatedCount++;
      }

      for (const item of quotes) {
        const encrypted = (await localCrypto.encrypt(item)) as QuoteLocal;
        await db.quotes.put(encrypted);
        updatedCount++;
      }

      for (const item of quoteLines) {
        const encrypted = (await localCrypto.encrypt(item)) as QuoteLineLocal;
        await db.quoteLines.put(encrypted);
        updatedCount++;
      }

      for (const item of clauses) {
        const encrypted = (await localCrypto.encrypt(item)) as ClauseLocal;
        await db.clauses.put(encrypted);
        updatedCount++;
      }

      for (const item of templates) {
        if (item.deletedAt) {
          await db.templates.delete(item.id);
        } else {
          const encrypted = (await localCrypto.encrypt(item)) as TemplateLocal;
          await db.templates.put(encrypted);
        }
        updatedCount++;
      }

      if (company) {
        const encrypted = (await localCrypto.encrypt(company)) as CompanyLocal;
        await db.company.put(encrypted);
        updatedCount++;
      }
    }
  );

  if (typeof window !== "undefined") {
    localStorage.setItem("SYNC_CURSOR_global", data.cursor);
  }

  return { updatedCount, conflictsResolved: 0 };
}
