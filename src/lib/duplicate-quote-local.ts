import { buildDuplicateQuoteData } from "@/lib/duplicate-quote";
import { db } from "@/lib/local-db";
import type { SyncOp, SyncOpEntity } from "@/lib/local-db";
import { registerBackgroundSync, triggerSync } from "@/lib/sync/outbox";

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

/**
 * Duplique un devis localement (Dexie) + enqueue les ops de sync.
 * Retourne l'id du nouveau devis. Lève si le devis source est introuvable.
 */
export async function duplicateQuoteLocal(
  quoteId: string,
  userId: string
): Promise<string> {
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

  return newQuoteId;
}
