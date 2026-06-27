"use client";

import { db } from "@/lib/local-db";
import type { SyncOp, SyncOpEntity } from "@/lib/local-db";
import type { PushResult } from "@/lib/sync/push";
import type { EntityTable } from "dexie";

export type SyncMutationResult = SyncOp;

// Background Sync tag — must match the tag registered in sw.ts sync listener.
// Using a single tag is idempotent: register() called multiple times with the
// same tag results in at most one pending sync event (W3C Background Sync spec).
const BACKGROUND_SYNC_TAG = "quotation-sync";

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

/**
 * Register a Background Sync tag so the Service Worker replays the sync queue
 * when network returns — even if the app is closed or the tab is backgrounded.
 *
 * Feature-detected and silent: no-op when the Background Sync API is unsupported
 * (Firefox, iOS Safari < 16). On those browsers the existing `online` event
 * listener in use-sync-status.ts remains the active fallback (FR-37 MVP-1).
 *
 * Idempotent: registering the same tag multiple times coalesces into a single
 * pending sync event. Safe to call fire-and-forget after every local mutation.
 */
export async function registerBackgroundSync(): Promise<void> {
  // SSR guard — Background Sync is a browser-only API
  if (typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    // The `sync` property only exists when the Background Sync API is supported.
    if ("sync" in registration) {
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register(BACKGROUND_SYNC_TAG);
    }
  } catch {
    // Background Sync unsupported, SW not yet active, or permission denied —
    // fallback silently to the MVP-0 `online` event listener in use-sync-status.ts
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

  // Fire-and-forget Background Sync registration (FR-37 MVP-1).
  // Must NOT block the mutation — if it throws, the silent catch inside
  // registerBackgroundSync absorbs the error and the online-listener fallback
  // still ensures sync runs when the user returns to the app.
  void registerBackgroundSync();

  return op;
}

// P9: guard covers the full push+pull cycle so concurrent triggerSync calls don't race
let syncInProgress = false;

export async function processQueue(): Promise<PushResult | null> {
  const { pushOps } = await import("@/lib/sync/push");
  // Bug fix (Story 6-4 / Deferred Work 2026-06-24):
  // `.where("failed").equals(0)` did not match boolean `false` in IndexedDB —
  // ops with failed=true were replayed anyway. Use filter() on the boolean so
  // only non-failed ops are pushed, preserving FIFO order by queuedAt.
  const pendingOps = await db.syncQueue
    .filter((op) => !op.failed)
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
