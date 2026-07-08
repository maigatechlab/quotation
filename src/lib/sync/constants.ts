// Shared sync constants — no "use client", importable from both page context and Service Worker.
export const BACKGROUND_SYNC_TAG = "quotation-sync";

// Web Locks name shared by the window sync pipeline (outbox.ts) and the SW's
// direct push (sw.ts) — both drain the same IndexedDB syncQueue, and the
// per-tab `syncInProgress` guard cannot see the other context.
export const SYNC_LOCK_NAME = "quotation-sync-push";
