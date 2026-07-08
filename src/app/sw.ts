import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  ExpirationPlugin,
} from "serwist";
import { BACKGROUND_SYNC_TAG, SYNC_LOCK_NAME } from "../lib/sync/constants";
import {
  getQuotaRejectionMessage,
  getQuotaRejectionReason,
} from "../lib/sync/quota-rejection";
import { openSwSyncDb } from "../lib/sync/sw-db";
import type { Table } from "dexie";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// Background Sync API types — `SyncEvent`, `ExtendableEvent` and `Clients` are
// draft Web APIs not present in TypeScript's `dom` lib (the project uses
// `lib: ["dom","dom.iterable","esnext"]`). Declare the minimal shapes we rely
// on locally so sw.ts type-checks without changing the global tsconfig
// (Story 6-4 / FR-37 MVP-1).
interface SwExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface SwSyncEvent extends SwExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

interface SwClient {
  postMessage(message: unknown): void;
}

interface SwClients {
  matchAll(options?: {
    type?: "window" | "worker" | "sharedworker" | "all";
    includeUncontrolled?: boolean;
  }): Promise<SwClient[]>;
}

// Minimal SW-side shape of a queued sync op (mirror of SyncOp in local-db.ts).
// Kept local to avoid importing the "use client" module from the Service Worker.
interface SwSyncOp {
  opId: string;
  entity: string;
  entityId: string;
  type: "create" | "update" | "delete";
  payload: unknown;
  baseRevision: number;
  queuedAt: string;
  failed?: boolean;
  retryCount?: number;
  lastError?: string;
  createdBy?: string;
  conflictEntity?: unknown;
}

// Minimal SW-side result shape from /api/v1/sync/push (mirror of PushOpResult).
interface SwPushOpResult {
  opId: string;
  status: "applied" | "conflict" | "noop" | "failed";
  entity?: unknown;
}

interface SwPushResponse {
  results: SwPushOpResult[];
}

// Max ops pushed per SW-initiated batch to keep the fetch payload bounded.
const SW_SYNC_BATCH_SIZE = 10;

declare const self: WorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  clients: SwClients;
  addEventListener(
    type: "sync",
    listener: (event: SwSyncEvent) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
};

const CACHE_30_DAYS = 60 * 60 * 24 * 30;  // 2592000 secondes
const CACHE_1_YEAR  = 60 * 60 * 24 * 365; // 31536000 secondes

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    // 1. Endpoints sync — NetworkOnly (la queue Dexie gère les mutations offline)
    {
      matcher: /\/api\/v1\/sync\//,
      handler: new NetworkOnly(),
    },
    // 2. Auth / sécurité — NetworkOnly strict (permissions périmées = faille sécurité)
    {
      matcher: /\/api\/auth(\/|$)/,
      handler: new NetworkOnly(),
    },
    // 3. API lecture — NetworkFirst avec fallback cache 30 jours (FR-35)
    //    Allowlist explicite: clients, quotes, companies, templates, clauses
    //    Exclut: /api/v1/users (données sensibles — rôles/emails)
    {
      matcher: /\/api\/v1\/(clients|quotes|companies|templates|clauses)(\/|$)/,
      handler: new NetworkFirst({
        cacheName: "api-read-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: CACHE_30_DAYS,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // 4. Next.js chunks immutables — CacheFirst 1 an (hash dans le nom de fichier)
    {
      matcher: /\/_next\/static\//,
      handler: new CacheFirst({
        cacheName: "next-static-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: CACHE_1_YEAR,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // 5. Assets statiques (polices woff2, SVG, PNG, ICO) — CacheFirst 30 jours
    {
      matcher: /\.(woff2?|svg|png|ico)(\?.*)?$/,
      handler: new CacheFirst({
        cacheName: "static-assets-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: CACHE_30_DAYS,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();

// --- Background Sync API (Story 6-4 / FR-37 MVP-1) ---------------------------
// The OS/browser fires a `sync` event when the network returns, even if no app
// tab is open. We replay the pending sync queue at that point. If a window
// client is active we delegate via postMessage (preferred — avoids importing
// client-only code in the SW); otherwise we run the push directly from the SW
// via a dedicated Dexie instance bound to the same IndexedDB database.

/**
 * Push the pending sync queue directly from the Service Worker via fetch.
 * The session cookie (Better Auth) is sent automatically with same-origin
 * requests, so authenticated pushes work even with no page open.
 *
 * P2: parses the response body even on non-2xx — a 409 conflict response may
 * identify ops to skip. Throws only when no usable results are available so
 * that waitUntil rejects and the platform schedules a retry.
 *
 * P4: loops until the pending queue is drained (original code processed one
 * batch of SW_SYNC_BATCH_SIZE ops only).
 */
async function directSyncFromSW(): Promise<void> {
  const swDb = openSwSyncDb();
  try {
    await swDb.open();
    const syncQueue = swDb.table("syncQueue") as Table<SwSyncOp, string>;

    while (true) {
      // Only ops not marked permanently failed — FIFO by queuedAt.
      const pendingOps = await syncQueue.filter((op) => !op.failed).sortBy("queuedAt");
      if (pendingOps.length === 0) break;

      const batch = pendingOps.slice(0, SW_SYNC_BATCH_SIZE);
      const res = await fetch("/api/v1/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: batch }),
      });

      // P2: attempt to parse results even on non-OK responses (e.g. 409 conflict).
      let body: SwPushResponse | null = null;
      try {
        body = (await res.json()) as SwPushResponse;
      } catch {
        // Non-JSON or already-consumed body
      }

      // Progress = ops removed from the pending set this round (deleted OR
      // dead-lettered/deferred with failed:true — the batch filter excludes
      // them next round, so counting them cannot loop indefinitely).
      let progressCount = 0;
      if (body?.results) {
        for (const r of body.results) {
          if (r.status === "applied" || r.status === "noop") {
            await syncQueue.delete(r.opId);
            progressCount++;
            continue;
          }

          if (r.status === "conflict") {
            const quotaReason = getQuotaRejectionReason(r.entity);
            if (quotaReason) {
              // Quota/readonly rejection — not an editing conflict. Mark failed
              // in place so a later window retry doesn't re-send it and get a
              // bare "noop" from the server's opId dedupe (losing this outcome).
              await syncQueue.update(r.opId, {
                failed: true,
                lastError: getQuotaRejectionMessage(quotaReason),
              });
            } else if (r.entity !== undefined) {
              // Real LWW conflict. The SW must NOT resolve it itself: its Dexie
              // handle has no encryption layer (classified fields would land in
              // IndexedDB as plaintext) and no toast. Store the server outcome
              // on the op — failed:true excludes it from future push batches
              // (the server already logged this opId and would answer "noop") —
              // and let the window resolve it via handleConflict (encryption,
              // auditMirror, toast) on the next sync trigger.
              await syncQueue.update(r.opId, {
                failed: true,
                conflictEntity: r.entity,
                lastError:
                  "Conflit détecté : résolution à la prochaine ouverture de l'application.",
              });
            } else {
              // No usable entity to resolve with — mark failed rather than
              // leaving it silently retryable into a future "noop".
              await syncQueue.update(r.opId, {
                failed: true,
                lastError: "Réponse de synchronisation invalide : conflit non résolu.",
              });
            }
            progressCount++;
            continue;
          }

          if (r.status === "failed") {
            // Server-reported failure is not a conflict — never apply r.entity
            // locally. Dead-letter with a clear message.
            await syncQueue.update(r.opId, {
              failed: true,
              lastError: "Mutation rejetée par le serveur à la synchronisation.",
            });
            progressCount++;
          }
        }
      }

      if (!res.ok && !body?.results) {
        if (res.status >= 400 && res.status < 500) {
          // Fatal 4xx without per-op results (apiError envelope: 403/422…).
          // Mirrors push.ts's FatalHttpError: dead-letter the first op instead
          // of throwing — a throw would make the platform replay the exact same
          // batch until lastChance, blocking the whole queue behind one bad op.
          const first = batch[0];
          if (first) {
            await syncQueue.update(first.opId, {
              failed: true,
              lastError: `Mutation rejetée par le serveur (HTTP ${res.status}).`,
            });
            continue;
          }
        }
        // Genuine server/network failure with no usable results.
        // Throw so waitUntil rejects and the platform schedules a retry.
        throw new Error(`SW sync push failed: HTTP ${res.status}`);
      }

      // Stop if queue is drained or no progress was made this round —
      // continuing without progress would loop indefinitely.
      if (pendingOps.length <= SW_SYNC_BATCH_SIZE || progressCount === 0) break;
    }
  } finally {
    swDb.close();
  }
}

/**
 * Coordinate the background sync replay.
 *
 * P3: delegates to the FIRST active window client only (original code broadcast
 * to all N clients, causing N concurrent pushes on the same outbox).
 */
async function syncFromServiceWorker(): Promise<void> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: false,
  });
  // P3: send to first active client only — it has the full sync pipeline available.
  // Sending to all N clients triggers N concurrent pushes (each tab has its own guard).
  const primaryClient = clients[0];
  if (primaryClient) {
    primaryClient.postMessage({ type: "TRIGGER_SYNC" });
    return;
  }
  // No active client — run the push directly from the SW, under the shared
  // cross-context Web Lock so a window opening mid-sync can't drain the same
  // queue concurrently (the per-tab syncInProgress guard can't see the SW).
  const locks = (self as unknown as { navigator?: { locks?: LockManager } }).navigator
    ?.locks;
  if (locks) {
    await locks.request(SYNC_LOCK_NAME, () => directSyncFromSW());
  } else {
    await directSyncFromSW();
  }
}

self.addEventListener("sync", (event: SwSyncEvent) => {
  if (event.tag !== BACKGROUND_SYNC_TAG) return;
  // P1: waitUntil() receives the promise directly — no inner try/catch.
  // If syncFromServiceWorker() rejects, waitUntil rejects and the platform
  // retries the sync event (up to lastChance). Idempotence by opId guarantees
  // no double-application when the retry eventually succeeds.
  event.waitUntil(syncFromServiceWorker());
});
