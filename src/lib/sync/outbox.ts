"use client";

import { db } from "@/lib/local-db";
import type { SyncOp, SyncOpEntity } from "@/lib/local-db";
import type { PushResult } from "@/lib/sync/push";
import type { EntityTable } from "dexie";

export type SyncMutationResult = SyncOp;

function getEntityTable(
  entity: SyncOpEntity
): EntityTable<Record<string, unknown>, string> {
  switch (entity) {
    case "client":
      return db.clients as unknown as EntityTable<Record<string, unknown>, string>;
    case "quote":
      return db.quotes as unknown as EntityTable<Record<string, unknown>, string>;
    case "quoteLine":
      return db.quoteLines as unknown as EntityTable<Record<string, unknown>, string>;
    case "clause":
      return db.clauses as unknown as EntityTable<Record<string, unknown>, string>;
    case "template":
      return db.templates as unknown as EntityTable<Record<string, unknown>, string>;
    case "company":
      return db.company as unknown as EntityTable<Record<string, unknown>, string>;
  }
}

export async function applyLocalMutation(
  entity: SyncOpEntity,
  entityId: string,
  type: "create" | "update" | "delete",
  payload: Record<string, unknown>,
  baseRevision: number,
  dexieWriteFn: () => Promise<void>,
  createdBy?: string,
): Promise<SyncMutationResult> {
  const op: SyncOp = {
    opId: crypto.randomUUID(),
    entity,
    entityId,
    type,
    payload,
    baseRevision,
    queuedAt: new Date().toISOString(),
    failed: false,
    retryCount: 0,
    // exactOptionalPropertyTypes: only include if defined
    ...(createdBy !== undefined && { createdBy }),
  };

  const entityTable = getEntityTable(entity);

  await db.transaction("rw", entityTable, db.syncQueue, async () => {
    await dexieWriteFn();
    await db.syncQueue.add(op);
  });

  return op;
}

// P9: guard covers the full push+pull cycle so concurrent triggerSync calls don't race
let syncInProgress = false;

export async function processQueue(): Promise<PushResult | null> {
  const { pushOps } = await import("@/lib/sync/push");
  const pendingOps = await db.syncQueue
    .where("failed")
    .equals(0)
    .sortBy("queuedAt");

  if (pendingOps.length === 0) return null;

  return pushOps(pendingOps);
}

export async function triggerSync(): Promise<PushResult | null> {
  if (syncInProgress) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;
  syncInProgress = true;
  try {
    const result = await processQueue();
    const { pullDelta } = await import("@/lib/sync/pull");
    const cursor = localStorage.getItem("SYNC_CURSOR_global") ?? new Date(0).toISOString();
    await pullDelta(cursor);
    return result;
  } finally {
    syncInProgress = false;
  }
}
