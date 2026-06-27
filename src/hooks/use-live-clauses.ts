"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { ClauseLocal } from "@/lib/local-db";

/**
 * Live subscription on the local `clauses` Dexie store.
 *
 * Mirrors the `useLiveTemplates` pattern but returns the raw array — clause
 * management does not need a soft-delete filter (`ClauseLocal` has no
 * `deletedAt`; clauses are hard-deleted locally and on the server).
 */
export function useLiveClauses(): ClauseLocal[] {
  const [clauses, setClauses] = useState<ClauseLocal[]>([]);

  useEffect(() => {
    const subscription = liveQuery(() => db.clauses.toArray()).subscribe({
      next: (items) => setClauses(items),
      error: () => setClauses([]),
    });

    return () => subscription.unsubscribe();
  }, []);

  return clauses;
}
