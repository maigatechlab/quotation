"use client";

import { useState, useEffect, useMemo } from "react";
import { liveQuery } from "dexie";
import type { ClientLocal } from "@/lib/local-db";
import { db } from "@/lib/local-db";

type FlexDocumentInstance = {
  add: (doc: unknown) => void;
  search: (query: string, opts?: unknown) => Array<{ field: string; result: unknown[] }>;
};
type FlexDocumentConstructor = new (opts: unknown) => FlexDocumentInstance;

// require avoids ESM/CJS interop issues with flexsearch in Next.js
const { Document: FlexDocument, Charset } = require("flexsearch") as {
  Document: FlexDocumentConstructor;
  Charset: Record<string, unknown>;
};

interface UseLiveClientsResult {
  clients: ClientLocal[];
  total: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export function useLiveClients(): UseLiveClientsResult {
  const [allClients, setAllClients] = useState<ClientLocal[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const subscription = liveQuery(() =>
      db.clients.filter((c) => !c.deletedAt).toArray()
    ).subscribe({
      next: (clients) => setAllClients(clients),
      error: () => setAllClients([]),
    });
    return () => subscription.unsubscribe();
  }, []);

  const index = useMemo(() => {
    if (allClients.length === 0) return null;

    const doc = new FlexDocument({
      tokenize: "forward",
      encoder: Charset.LatinExtra,
      document: {
        id: "id",
        index: ["companyName", "contactName", "phone", "city"],
      },
    });

    for (const client of allClients) {
      doc.add({
        id: client.id,
        companyName: client.companyName,
        contactName: client.contactName ?? "",
        phone: client.phone,
        city: client.city ?? "",
      });
    }

    return doc;
  }, [allClients]);

  const clients = useMemo(() => {
    const query = searchQuery.trim();
    if (!query || !index) return allClients;

    const results = index.search(query, { limit: 200, suggest: true });
    const idSet = new Set<string>(
      results.flatMap((r) => r.result as string[])
    );
    return allClients.filter((c) => idSet.has(c.id));
  }, [searchQuery, allClients, index]);

  return { clients, total: allClients.length, searchQuery, setSearchQuery };
}
