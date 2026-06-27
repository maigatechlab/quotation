"use client";

import { useState, useEffect } from "react";
import { CheckCircle, Upload, Loader2, WifiOff } from "lucide-react";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { cn } from "@/lib/utils";

export function SyncIndicator() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { pendingCount, isSyncing, isOnline } = useSyncStatus();

  if (!mounted) {
    return (
      <div
        className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-2 text-xs text-muted-foreground"
        aria-label="Chargement"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }

  // P14: show offline state instead of misleading "Synchronisé" when disconnected
  if (!isOnline) {
    return (
      <div
        className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-2 text-xs text-muted-foreground"
        aria-label="Hors ligne"
        role="status"
        aria-live="polite"
      >
        <WifiOff className="h-4 w-4" aria-hidden="true" />
        <span>Hors ligne</span>
      </div>
    );
  }

  if (isSyncing) {
    return (
      <div
        className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-2 text-xs text-muted-foreground"
        aria-label="Synchronisation en cours"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>Synchronisation...</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div
        className={cn(
          "flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-2 text-xs text-amber-600 dark:text-amber-400"
        )}
        aria-label={`${pendingCount} opération(s) en attente de synchronisation`}
        role="status"
        aria-live="polite"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        <span>{pendingCount} en attente</span>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 px-2 text-xs text-green-600 dark:text-green-400"
      aria-label="Synchronisé"
      role="status"
    >
      <CheckCircle className="h-4 w-4" aria-hidden="true" />
      <span>Synchronisé</span>
    </div>
  );
}
