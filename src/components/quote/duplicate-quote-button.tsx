"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { buildDuplicateQuoteData } from "@/lib/duplicate-quote";
import { db } from "@/lib/local-db";
import type { SyncOp, SyncOpEntity } from "@/lib/local-db";
import { registerBackgroundSync, triggerSync } from "@/lib/sync/outbox";

interface DuplicateQuoteButtonProps {
  quoteId: string;
  userId: string;
}

function makeSyncOp(
  entity: SyncOpEntity,
  entityId: string,
  payload: Record<string, unknown>,
  userId: string
): SyncOp {
  return {
    opId: crypto.randomUUID(),
    entity,
    entityId,
    type: "create",
    payload,
    baseRevision: 0,
    queuedAt: new Date().toISOString(),
    failed: false,
    retryCount: 0,
    createdBy: userId,
  };
}

export function DuplicateQuoteButton({ quoteId, userId }: DuplicateQuoteButtonProps) {
  const router = useRouter();
  const t = useTranslations("devis");
  const [isPending, setIsPending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleDuplicate() {
    setIsPending(true);
    try {
      const source = await db.quotes.get(quoteId);
      if (!source) throw new Error("quote_not_found");

      const [sourceLines, sourceClauses] = await Promise.all([
        db.quoteLines.where("quoteId").equals(quoteId).sortBy("ordre"),
        db.quoteClauses.where("quoteId").equals(quoteId).sortBy("ordre"),
      ]);

      const { newQuoteId, quoteRecord, lineRecords, clauseRecords } =
        buildDuplicateQuoteData(source, sourceLines, sourceClauses, userId);

      const quoteOp = makeSyncOp(
        "quote",
        newQuoteId,
        quoteRecord as unknown as Record<string, unknown>,
        userId
      );
      const lineOps = lineRecords.map((l) =>
        makeSyncOp("quoteLine", l.id, l as unknown as Record<string, unknown>, userId)
      );

      // Single atomic transaction — quote + lines + clauses + outbox ops
      await db.transaction(
        "rw",
        [db.quotes, db.quoteLines, db.quoteClauses, db.syncQueue],
        async () => {
          await db.quotes.put(quoteRecord);
          await db.syncQueue.add(quoteOp);
          for (const line of lineRecords) {
            await db.quoteLines.put(line);
          }
          if (lineOps.length > 0) await db.syncQueue.bulkAdd(lineOps);
          // quoteClauses are local-only — no server entity type, no sync op
          for (const clause of clauseRecords) {
            await db.quoteClauses.put(clause);
          }
        }
      );

      void registerBackgroundSync();
      void triggerSync();
      toast.success(t("duplicate.successToast"));
      router.push(`/devis/${newQuoteId}`);
    } catch {
      toast.error(t("duplicate.errorGeneric"));
    } finally {
      setIsPending(false);
      setShowConfirm(false);
    }
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        disabled={isPending}
        className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-text-secondary hover:bg-surface-alt"
      >
        {t("duplicate.button")}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <p className="text-sm font-semibold text-text-primary">{t("duplicate.confirmTitle")}</p>
      <p className="text-xs text-text-muted">{t("duplicate.confirmDescription")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
          disabled={isPending}
          className="h-9 flex-1 rounded-xl border border-border text-sm text-text-secondary"
        >
          {t("duplicate.cancel")}
        </button>
        <button
          type="button"
          onClick={handleDuplicate}
          disabled={isPending}
          className="h-9 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark disabled:opacity-60"
        >
          {isPending ? "…" : t("duplicate.confirmAction")}
        </button>
      </div>
    </div>
  );
}
