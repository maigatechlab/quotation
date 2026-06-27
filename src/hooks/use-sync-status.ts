"use client";

import { useState, useEffect, useRef } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import { triggerSync } from "@/lib/sync/outbox";

export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  // P10: ref tracks in-progress state so the online event handler is never stale
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    // Bug fix (Story 6-4 / Deferred Work 2026-06-24):
    // `.where("failed").equals(0)` does NOT match boolean `false` in IndexedDB —
    // pendingCount stayed at 0 even with a full queue. Use filter() on the boolean
    // directly so non-failed pending ops are counted correctly.
    const subscription = liveQuery(() =>
      db.syncQueue.filter((op) => !op.failed).count()
    ).subscribe({
      next: (count) => setPendingCount(count),
      error: () => setPendingCount(0),
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleTriggerSync = async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;
    setIsSyncing(true);
    try {
      await triggerSync();
    } finally {
      syncInProgressRef.current = false;
      setIsSyncing(false);
    }
  };

  // Stable ref so the online listener always calls the latest version of handleTriggerSync
  const syncHandlerRef = useRef(handleTriggerSync);
  useEffect(() => {
    syncHandlerRef.current = handleTriggerSync;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncHandlerRef.current();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Background Sync API (Story 6-4 / FR-37 MVP-1):
  // When the Service Worker replays the queue in the background, it posts a
  // TRIGGER_SYNC message to all active window clients. Listen for it and
  // delegate to the latest handleTriggerSync via the stable ref. This runs
  // alongside the `online` listener above — both may fire; idempotence is
  // guaranteed server-side by opId (syncOpLog check in /api/v1/sync/push).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handleSWMessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        data &&
        typeof data === "object" &&
        "type" in data &&
        (data as { type: string }).type === "TRIGGER_SYNC"
      ) {
        void syncHandlerRef.current();
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSWMessage);
    };
  }, []);

  return {
    isOnline,
    pendingCount,
    isSyncing,
    triggerSync: handleTriggerSync,
  };
}
