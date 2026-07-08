"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";

/**
 * Ids d'entités dont au moins une opération de sync a échoué (dead-letter),
 * mappés à `lastError` de la plus récente pour affichage (icône warning +
 * tooltip avec le message réel — quota/lecture-seule/conflit — plutôt qu'un
 * message générique).
 */
export function useFailedSyncIds(): Map<string, string> {
  const [failedIds, setFailedIds] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const subscription = liveQuery(async () => {
      // sortBy(queuedAt) so the Map really keeps the most recent op's message
      // per entity (toArray() iterates in primary-key order — random UUIDs).
      const ops = await db.syncQueue.filter((op) => op.failed === true).sortBy("queuedAt");
      const byEntity = new Map<string, string>();
      for (const op of ops) {
        // `||` not `??` — an empty lastError must still fall back (empty
        // tooltip + empty sr-only = icon without accessible name).
        byEntity.set(op.entityId, op.lastError || "Échec de synchronisation");
      }
      return byEntity;
    }).subscribe({
      next: (ids) => setFailedIds(ids),
      error: () => setFailedIds(new Map()),
    });
    return () => subscription.unsubscribe();
  }, []);

  return failedIds;
}
