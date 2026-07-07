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
      const ops = await db.syncQueue.filter((op) => op.failed === true).toArray();
      const byEntity = new Map<string, string>();
      for (const op of ops) {
        byEntity.set(op.entityId, op.lastError ?? "Échec de synchronisation");
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
