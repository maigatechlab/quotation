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
    const subscription = liveQuery(() =>
      db.syncQueue.where("failed").equals(0).count()
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

  return {
    isOnline,
    pendingCount,
    isSyncing,
    triggerSync: handleTriggerSync,
  };
}
