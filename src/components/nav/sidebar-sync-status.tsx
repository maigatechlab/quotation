"use client";

import { useSyncExternalStore } from "react";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};
const getMounted = () => true;

/**
 * Discreet sync state indicator for the desktop sidebar footer (dot + label).
 * Three states per design brief: synchronisé / hors ligne / N modifications
 * en attente. Mobile keeps its own banner + SyncIndicator.
 */
export function SidebarSyncStatus() {
  const mounted = useSyncExternalStore(emptySubscribe, getMounted, () => false);
  const { isOnline, isSyncing, pendingCount } = useSyncStatus();

  if (!mounted) return <div className="h-4" aria-hidden="true" />;

  let dotClass = "bg-status-accepte-dot";
  let label = "Synchronisé";
  if (!isOnline) {
    dotClass = "bg-status-brouillon-dot";
    label = "Hors ligne";
  } else if (isSyncing) {
    dotClass = "bg-status-envoye-dot animate-blink-dot";
    label = "Synchronisation…";
  } else if (pendingCount > 0) {
    dotClass = "bg-status-envoye-dot";
    label = `${pendingCount} modification${pendingCount > 1 ? "s" : ""} en attente`;
  }

  return (
    <div
      className="flex items-center gap-2 text-xs text-text-muted"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span
        className={cn("h-[7px] w-[7px] shrink-0 rounded-full", dotClass)}
        aria-hidden="true"
      />
      {label}
    </div>
  );
}
