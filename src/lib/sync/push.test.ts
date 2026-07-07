import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { SyncOp } from "@/lib/local-db";
import { pushOps } from "./push";

const handleConflictMock = vi.fn();
vi.mock("@/lib/sync/conflict", () => ({
  handleConflict: (...args: unknown[]) => handleConflictMock(...args),
}));

const now = "2026-07-07T00:00:00.000Z";

function makeOp(overrides: Partial<SyncOp> = {}): SyncOp {
  return {
    opId: "op-1",
    entity: "quote",
    entityId: "quote-1",
    type: "create",
    payload: { number: "TEMP-AAAA-0001" },
    baseRevision: 0,
    queuedAt: now,
    retryCount: 0,
    ...overrides,
  };
}

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => body,
    })
  );
}

describe("pushSingleOp — quota/readonly rejection vs LWW conflict", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    handleConflictMock.mockReset();
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  it("marks op failed with quota-specific message on QUOTA_EXCEEDED, without calling handleConflict", async () => {
    const op = makeOp();
    await db.syncQueue.add(op);
    mockFetchOnce(409, {
      results: [{ opId: op.opId, status: "conflict", entity: { error: "QUOTA_EXCEEDED" } }],
    });

    const { results } = await pushOps([op]);

    expect(results[0]).toEqual({ opId: op.opId, status: "failed" });
    expect(handleConflictMock).not.toHaveBeenCalled();
    const stored = await db.syncQueue.get(op.opId);
    expect(stored?.failed).toBe(true);
    expect(stored?.lastError).toBe("Quota dépassé : mutation refusée à la synchronisation.");
  });

  it("marks op failed with readonly-specific message on READONLY_MODE, without calling handleConflict", async () => {
    const op = makeOp({ opId: "op-2" });
    await db.syncQueue.add(op);
    mockFetchOnce(409, {
      results: [{ opId: op.opId, status: "conflict", entity: { error: "READONLY_MODE" } }],
    });

    const { results } = await pushOps([op]);

    expect(results[0]).toEqual({ opId: op.opId, status: "failed" });
    expect(handleConflictMock).not.toHaveBeenCalled();
    const stored = await db.syncQueue.get(op.opId);
    expect(stored?.failed).toBe(true);
    expect(stored?.lastError).toBe(
      "Compte en lecture seule : mutation refusée à la synchronisation."
    );
  });

  it("still routes a real LWW conflict (entity with id) to handleConflict", async () => {
    const op = makeOp({ opId: "op-3" });
    await db.syncQueue.add(op);
    const serverEntity = { id: "quote-1", revision: 3, number: "DEV-2026-0001" };
    mockFetchOnce(409, {
      results: [{ opId: op.opId, status: "conflict", entity: serverEntity }],
    });

    const { results } = await pushOps([op]);

    expect(results[0]).toEqual({ opId: op.opId, status: "conflict", entity: serverEntity });
    expect(handleConflictMock).toHaveBeenCalledWith(expect.objectContaining({ opId: op.opId }), serverEntity);
    const stored = await db.syncQueue.get(op.opId);
    expect(stored).toBeUndefined();
  });

  it("routes a conflict entity with an unrecognized `error` field to handleConflict (not quota)", async () => {
    // Guards against over-broad quota detection: only the server's known
    // READONLY_MODE/QUOTA_EXCEEDED reasons should bypass LWW conflict handling.
    const op = makeOp({ opId: "op-4" });
    await db.syncQueue.add(op);
    const serverEntity = { id: "quote-1", revision: 3, error: "some_unrelated_field" };
    mockFetchOnce(409, {
      results: [{ opId: op.opId, status: "conflict", entity: serverEntity }],
    });

    const { results } = await pushOps([op]);

    expect(results[0]).toEqual({ opId: op.opId, status: "conflict", entity: serverEntity });
    expect(handleConflictMock).toHaveBeenCalledWith(expect.objectContaining({ opId: op.opId }), serverEntity);
    const stored = await db.syncQueue.get(op.opId);
    expect(stored).toBeUndefined();
  });
});
