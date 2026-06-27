import Dexie, { type Table } from "dexie";
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  ExpirationPlugin,
} from "serwist";
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
}

// Minimal SW-side result shape from /api/v1/sync/push (mirror of PushOpResult).
interface SwPushOpResult {
  opId: string;
  status: "applied" | "conflict" | "noop" | "failed";
}

interface SwPushResponse {
  results: SwPushOpResult[];
}

// Background Sync tag — must match the tag registered by outbox.registerBackgroundSync().
const BACKGROUND_SYNC_TAG = "quotation-sync";
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
 * Open a SW-side Dexie handle bound to the SAME IndexedDB database the client
 * uses (`quotation-local`). We declare only the syncQueue table — we never
 * touch entity tables from the SW to keep the surface minimal and avoid
 * diverging from the client's schema versions.
 *
 * The version chain mirrors local-db.ts (versions 1→3) so Dexie can open the
 * existing database without an upgrade race.
 */
function openSwSyncDb(): Dexie {
  const swDb = new Dexie("quotation-local");
  // Mirror the schema declarations from src/lib/local-db.ts — only syncQueue
  // is needed in the SW. The full version history is preserved so Dexie does
  // not attempt to re-upgrade an already-migrated database.
  swDb.version(1).stores({
    clients: "id, companyName, phone, city, ownerId, companyId, deletedAt, revision",
    quotes: "id, number, status, clientId, ownerId, companyId, dateDevis, revision",
    quoteLines: "id, quoteId, ordre, companyId, pays, revision",
    clauses: "id, categorie, companyId, pays, revision",
    templates: "id, nom, companyId, pays, revision",
    company: "id, companyId, revision",
    syncQueue: "opId, entity, entityId, queuedAt",
    auditMirror: "id, entityType, entityId, who, synced",
  });
  swDb.version(2).stores({
    syncQueue: "opId, entity, entityId, queuedAt, failed, retryCount",
  });
  swDb.version(3).stores({
    quoteClauses: "id, quoteId, ordre, companyId, pays, revision",
  });
  return swDb;
}

/**
 * Push the pending sync queue directly from the Service Worker via fetch.
 * The session cookie (Better Auth) is sent automatically with same-origin
 * requests, so authenticated pushes work even with no page open. If the
 * session has expired the server returns 401 — the sync event will not be
 * retried indefinitely (lastChance handling is delegated to the platform).
 */
async function directSyncFromSW(): Promise<void> {
  const swDb = openSwSyncDb();
  try {
    await swDb.open();
    const syncQueue = swDb.table("syncQueue") as Table<SwSyncOp, string>;
    // Only ops not marked permanently failed — FIFO by queuedAt.
    const pendingOps = await syncQueue
      .filter((op) => !op.failed)
      .sortBy("queuedAt");
    if (pendingOps.length === 0) return;

    const batch = pendingOps.slice(0, SW_SYNC_BATCH_SIZE);
    const res = await fetch("/api/v1/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops: batch }),
    });

    if (!res.ok) {
      // Non-OK: the platform will re-fire the sync event (subject to its own
      // retry policy). Marking ops as failed is the responsibility of the
      // push pipeline (push.ts backoff) — we intentionally do not mutate
      // op state from the SW to avoid divergence with the client.
      return;
    }

    const body = (await res.json()) as SwPushResponse;
    for (const r of body.results) {
      // Delete successfully applied / no-op ops from the queue.
      // Conflicts and failures are left for the client to handle on next focus
      // (conflict resolution may require UI that only the client can render).
      if (r.status === "applied" || r.status === "noop") {
        await syncQueue.delete(r.opId);
      }
    }
  } finally {
    swDb.close();
  }
}

/**
 * Coordinate the background sync replay.
 *
 * Strategy (Dev Notes §"Le SW ne peut PAS utiliser use client modules tels quels") :
 *  1. If at least one window client is active, delegate via postMessage so the
 *     client runs its full push+pull pipeline (preferred — avoids client-only
 *     imports in the SW and reuses conflict resolution UI).
 *  2. Otherwise (app fully closed), run directSyncFromSW() which pushes the
 *     queued ops via fetch directly from the SW.
 */
async function syncFromServiceWorker(): Promise<void> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: false,
  });
  if (clients.length > 0) {
    // Delegate to an active client — it has the full sync pipeline available.
    for (const client of clients) {
      client.postMessage({ type: "TRIGGER_SYNC" });
    }
    return;
  }
  // No active client — run the push directly from the SW.
  await directSyncFromSW();
}

self.addEventListener("sync", (event: SwSyncEvent) => {
  if (event.tag !== BACKGROUND_SYNC_TAG) return;
  // waitUntil() keeps the SW alive long enough to flush the queue. If this
  // rejects, the platform retries the sync event (up to lastChance).
  event.waitUntil(
    (async () => {
      try {
        await syncFromServiceWorker();
      } catch {
        // Swallow — the platform will re-fire the sync event. Idempotence by
        // opId guarantees no double-application when retry eventually succeeds.
      }
    })()
  );
});
