"use client";

import { toast } from "sonner";
import { db } from "@/lib/local-db";
import type { SyncOp, SyncOpEntity } from "@/lib/local-db";
import type { EntityTable } from "dexie";

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

export async function handleConflict(op: SyncOp, serverEntity: unknown): Promise<void> {
  // LWW strict — server wins, no field-level merge.
  // Archive losing client payload to auditMirror (Dexie) — synced to audit_event later.
  await db.auditMirror.add({
    id: crypto.randomUUID(),
    who: op.createdBy ?? "unknown",
    what: "conflict.archived",
    when: new Date().toISOString(),
    where: "sync/push",
    entityType: op.entity,
    entityId: op.entityId,
    before: op.payload,
    after: serverEntity,
    createdAt: new Date().toISOString(),
    synced: false,
  });

  const table = getEntityTable(op.entity);
  await table.put(serverEntity as Record<string, unknown>);

  toast.warning("Conflit résolu : une version plus récente a été appliquée.");
}
