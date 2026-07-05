"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";

/**
 * Ids d'entités dont au moins une opération de sync a échoué (dead-letter).
 * Sert à afficher une affordance d'erreur non bloquante sur la ligne
 * concernée (icône warning + tooltip) au lieu d'un toast/modal.
 */
export function useFailedSyncIds(): Set<string> {
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const ops = await db.syncQueue.filter((op) => op.failed === true).toArray();
      return new Set(ops.map((op) => op.entityId));
    }).subscribe({
      next: (ids) => setFailedIds(ids),
      error: () => setFailedIds(new Set()),
    });
    return () => subscription.unsubscribe();
  }, []);

  return failedIds;
}
