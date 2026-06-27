import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { ClientLocal } from "@/lib/local-db";
import { applyLocalMutation } from "./outbox";

const now = "2026-06-23T00:00:00.000Z";

const testClient: ClientLocal = {
  id: "client-test-1",
  companyName: "Test SARL",
  phone: "+227000000",
  country: "NE",
  pays: "NE",
  revision: 0,
  updatedAt: now,
  createdAt: now,
};

describe("applyLocalMutation", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    db.close();
  });

  it("writes entity and enqueues SyncOp atomically", async () => {
    const op = await applyLocalMutation(
      "client",
      testClient.id,
      "create",
      { companyName: testClient.companyName },
      0,
      async () => {
        await db.clients.put(testClient);
      }
    );

    const storedClient = await db.clients.get(testClient.id);
    expect(storedClient).toBeDefined();
    expect(storedClient?.companyName).toBe("Test SARL");

    const storedOp = await db.syncQueue.get(op.opId);
    expect(storedOp).toBeDefined();
    expect(storedOp?.entity).toBe("client");
    expect(storedOp?.entityId).toBe(testClient.id);
    expect(storedOp?.type).toBe("create");
    expect(storedOp?.baseRevision).toBe(0);
    expect(storedOp?.failed).toBe(false);
    expect(storedOp?.retryCount).toBe(0);
  });

  it("rollback: if dexieWriteFn throws, SyncOp is NOT enqueued", async () => {
    await expect(
      applyLocalMutation(
        "client",
        "failing-id",
        "create",
        { companyName: "Fail" },
        0,
        async () => {
          throw new Error("simulated write failure");
        }
      )
    ).rejects.toThrow("simulated write failure");

    const queueCount = await db.syncQueue.count();
    expect(queueCount).toBe(0);
  });

  it("generates a unique opId per mutation", async () => {
    const op1 = await applyLocalMutation(
      "client",
      "id-1",
      "create",
      {},
      0,
      async () => {
        await db.clients.put({ ...testClient, id: "id-1" });
      }
    );
    const op2 = await applyLocalMutation(
      "client",
      "id-2",
      "create",
      {},
      0,
      async () => {
        await db.clients.put({ ...testClient, id: "id-2" });
      }
    );

    expect(op1.opId).not.toBe(op2.opId);
  });
});

describe("triggerSync", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.stubGlobal("navigator", { onLine: false });
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
  });

  it("does not process queue when offline", async () => {
    const { triggerSync } = await import("./outbox");
    await applyLocalMutation("client", "x", "create", {}, 0, async () => {
      await db.clients.put({ ...testClient, id: "x" });
    });

    // offline → triggerSync should exit early without calling processQueue
    await triggerSync();
    const queueCount = await db.syncQueue.count();
    // op still in queue (was not pushed)
    expect(queueCount).toBe(1);
  });
});
