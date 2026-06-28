import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { QuoteLocal, QuoteLineLocal } from "@/lib/local-db";
import { canTransition, validateDraftToValidated } from "@/lib/quote-status";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import type { EntityTable } from "dexie";

// On mocke triggerSync pour éviter tout appel réseau réel pendant les tests.
vi.mock("@/lib/sync/outbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/outbox")>();
  return {
    ...actual,
    triggerSync: vi.fn().mockResolvedValue(null),
  };
});

const now = "2026-06-27T10:00:00.000Z";
const userId = "user-1";

const baseQuote: QuoteLocal = {
  id: "quote-1",
  number: "DEV-2026-001",
  status: "draft",
  clientId: "client-1",
  ownerId: "user-1",
  originCity: "Niamey",
  destinationCity: "Ouagadougou",
  signataireNom: "Amadou Maiga",
  totalFcfa: 1_500_000,
  pays: "NE",
  revision: 0,
  updatedAt: now,
  createdAt: now,
};

const baseLine: QuoteLineLocal = {
  id: "line-1",
  quoteId: "quote-1",
  designation: "Transport Niamey-Ouagadougou",
  unitPrice: 1_500_000,
  quantity: 1,
  totalFcfa: 1_500_000,
  ordre: 0,
  pays: "NE",
  revision: 0,
  updatedAt: now,
  createdAt: now,
};

/**
 * Reproduit fidèlement le flow de StatusChangeSheet.handleSelectStatus pour une
 * transition donnée — sans dépendre de React. Valide AC4 (persistance locale
 * + log append-only + triggerSync) de bout en bout sur Dexie réel.
 */
async function applyStatusTransition(
  quoteId: string,
  fromStatus: QuoteLocal["status"],
  toStatus: QuoteLocal["status"]
): Promise<void> {
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error("invalid transition");
  }

  // Validation Brouillon → Validé (AC3)
  if (fromStatus === "draft" && toStatus === "validated") {
    const q = await db.quotes.get(quoteId);
    const l = await db.quoteLines.where("quoteId").equals(quoteId).toArray();
    const errors = validateDraftToValidated(q, l);
    if (errors.length > 0) throw new Error(`validation failed: ${errors.join(",")}`);
  }

  const dbQuote = await db.quotes.get(quoteId);
  if (!dbQuote) throw new Error("quote not found");

  const updatedQuote: QuoteLocal = {
    ...dbQuote,
    status: toStatus,
    updatedAt: now,
  };

  // AC4 — applyLocalMutation pour le devis (syncé via outbox)
  const statusLog = {
    id: "log-test-1",
    quoteId,
    fromStatus: dbQuote.status,
    toStatus,
    changedBy: userId,
    changedAt: now,
    note: null,
  };

  // AC4 — applyLocalMutation pour le devis (syncé via outbox), avec log atomique.
  await applyLocalMutation(
    "quote",
    quoteId,
    "update",
    updatedQuote as unknown as Record<string, unknown>,
    dbQuote.revision,
    async () => {
      await db.quotes.put(updatedQuote);
      await db.quoteStatusLogs.put(statusLog);
    },
    userId,
    [db.quoteStatusLogs as unknown as EntityTable<Record<string, unknown>, string>]
  );

  void triggerSync();
}

describe("applyStatusTransition — persistance locale + log (AC4)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.quotes.put(baseQuote);
    await db.quoteLines.put(baseLine);
  });

  afterEach(() => {
    db.close();
    vi.mocked(triggerSync).mockClear();
  });

  it("applique la transition Brouillon → Validé et enregistre le log", async () => {
    await applyStatusTransition("quote-1", "draft", "validated");

    const quote = await db.quotes.get("quote-1");
    expect(quote?.status).toBe("validated");

    const logs = await db.quoteStatusLogs.where("quoteId").equals("quote-1").toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      quoteId: "quote-1",
      fromStatus: "draft",
      toStatus: "validated",
      changedBy: userId,
      note: null,
    });

    // AC4 — triggerSync appelé après la transition
    expect(triggerSync).toHaveBeenCalledTimes(1);
  });

  it("enfile un SyncOp quote/update dans la syncQueue (sync via outbox)", async () => {
    await applyStatusTransition("quote-1", "draft", "validated");

    const ops = await db.syncQueue.where("entity").equals("quote").toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("update");
    expect((ops[0]!.payload as { status?: string }).status).toBe("validated");
  });

  it("refuse la transition Brouillon → Validé si le devis est incomplet (AC3)", async () => {
    // Retire le client → validation doit échouer, statut inchangé, aucun log.
    await db.quotes.put({ ...baseQuote, clientId: undefined } as unknown as QuoteLocal);

    await expect(
      applyStatusTransition("quote-1", "draft", "validated")
    ).rejects.toThrow("validation failed");

    const quote = await db.quotes.get("quote-1");
    expect(quote?.status).toBe("draft");

    const logs = await db.quoteStatusLogs.where("quoteId").equals("quote-1").toArray();
    expect(logs).toHaveLength(0);
    expect(triggerSync).not.toHaveBeenCalled();
  });

  it("applique la transition Validé → Envoyé (validation non requise)", async () => {
    await db.quotes.put({ ...baseQuote, status: "validated" });

    await applyStatusTransition("quote-1", "validated", "sent");

    const quote = await db.quotes.get("quote-1");
    expect(quote?.status).toBe("sent");
    const logs = await db.quoteStatusLogs.where("quoteId").equals("quote-1").toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.fromStatus).toBe("validated");
    expect(logs[0]!.toStatus).toBe("sent");
  });

  it("refuse une transition non autorisée par la machine à états (AC1)", async () => {
    await expect(
      applyStatusTransition("quote-1", "draft", "accepted")
    ).rejects.toThrow("invalid transition");

    const quote = await db.quotes.get("quote-1");
    expect(quote?.status).toBe("draft");
  });

  it("les quoteStatusLogs sont accumulés (append-only) sur transitions multiples", async () => {
    await applyStatusTransition("quote-1", "draft", "validated");
    await db.quotes.put({ ...(await db.quotes.get("quote-1"))!, status: "validated" });
    // Deuxième transition avec un nouvel id de log
    await applyStatusTransitionWithLogId("quote-1", "validated", "sent", "log-test-2");

    const logs = await db.quoteStatusLogs.where("quoteId").equals("quote-1").toArray();
    expect(logs).toHaveLength(2);
    expect(logs.map((l) => l.toStatus)).toEqual(["validated", "sent"]);
  });
});

// Variante de applyStatusTransition permettant de forcer l'id du log pour
// tester l'accumulation sans collision de clés primaire.
async function applyStatusTransitionWithLogId(
  quoteId: string,
  fromStatus: QuoteLocal["status"],
  toStatus: QuoteLocal["status"],
  logId: string
): Promise<void> {
  if (!canTransition(fromStatus, toStatus)) {
    throw new Error("invalid transition");
  }
  const dbQuote = await db.quotes.get(quoteId);
  if (!dbQuote) throw new Error("quote not found");
  const updatedQuote: QuoteLocal = { ...dbQuote, status: toStatus, updatedAt: now };
  const statusLog = {
    id: logId,
    quoteId,
    fromStatus: dbQuote.status,
    toStatus,
    changedBy: userId,
    changedAt: now,
    note: null,
  };

  // AC4 — applyLocalMutation pour le devis (syncé via outbox), avec log atomique.
  await applyLocalMutation(
    "quote",
    quoteId,
    "update",
    updatedQuote as unknown as Record<string, unknown>,
    dbQuote.revision,
    async () => {
      await db.quotes.put(updatedQuote);
      await db.quoteStatusLogs.put(statusLog);
    },
    userId,
    [db.quoteStatusLogs as unknown as EntityTable<Record<string, unknown>, string>]
  );

  void triggerSync();
}
