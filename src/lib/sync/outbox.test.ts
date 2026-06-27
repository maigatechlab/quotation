import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { ClientLocal, SyncOp } from "@/lib/local-db";
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

// --- Story 6-4 : Background Sync API --------------------------------------

describe("processQueue — failed ops excluded (bug fix .equals(0) → filter)", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("excludes ops marked failed=true and pushes only non-failed ops (FIFO)", async () => {
    // Seed two ops directly in the queue: one failed, one pending.
    // The failed op has an EARLIER queuedAt to prove FIFO alone is not enough —
    // failed ops must be filtered out regardless of ordering.
    const failedOp: SyncOp = {
      opId: "op-failed",
      entity: "client",
      entityId: "client-A",
      type: "create",
      payload: { companyName: "A" },
      baseRevision: 0,
      queuedAt: "2026-06-23T00:00:00.000Z",
      failed: true,
      retryCount: 5,
      lastError: "permanently failed",
    };
    const pendingOp: SyncOp = {
      opId: "op-pending",
      entity: "client",
      entityId: "client-B",
      type: "create",
      payload: { companyName: "B" },
      baseRevision: 0,
      queuedAt: "2026-06-23T01:00:00.000Z",
      failed: false,
      retryCount: 0,
    };
    await db.syncQueue.bulkAdd([failedOp, pendingOp]);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ opId: "op-pending", status: "applied" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { processQueue } = await import("./outbox");
    const result = await processQueue();

    // Only the non-failed op should have been pushed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const pushedBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
      ops: SyncOp[];
    };
    expect(pushedBody.ops).toHaveLength(1);
    expect(pushedBody.ops[0]?.opId).toBe("op-pending");
    expect(result?.results).toHaveLength(1);
    expect(result?.results[0]?.opId).toBe("op-pending");
  });

  it("returns null when only failed ops remain in the queue", async () => {
    const failedOp: SyncOp = {
      opId: "op-only-failed",
      entity: "client",
      entityId: "client-C",
      type: "create",
      payload: {},
      baseRevision: 0,
      queuedAt: "2026-06-23T00:00:00.000Z",
      failed: true,
      retryCount: 5,
      lastError: "permanently failed",
    };
    await db.syncQueue.add(failedOp);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { processQueue } = await import("./outbox");
    const result = await processQueue();

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("registerBackgroundSync (Story 6-4 / FR-37 MVP-1)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("no-op on SSR (navigator undefined) without throwing", async () => {
    vi.stubGlobal("navigator", undefined);
    const { registerBackgroundSync } = await import("./outbox");
    await expect(registerBackgroundSync()).resolves.toBeUndefined();
  });

  it("no-op when serviceWorker is not supported", async () => {
    vi.stubGlobal("navigator", { onLine: true }); // no serviceWorker key
    const { registerBackgroundSync } = await import("./outbox");
    await expect(registerBackgroundSync()).resolves.toBeUndefined();
  });

  it("registers the quotation-sync tag when Background Sync API is supported", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const registration = { sync: { register } };
    const ready = Promise.resolve(registration);
    const sw = {
      ready,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: sw,
    });
    const { registerBackgroundSync } = await import("./outbox");
    await registerBackgroundSync();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("quotation-sync");
  });

  it("swallows errors when sync.register rejects (unsupported / SW inactive)", async () => {
    const register = vi.fn().mockRejectedValue(new Error("not supported"));
    const sw = {
      ready: Promise.resolve({ sync: { register } }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: sw,
    });
    const { registerBackgroundSync } = await import("./outbox");
    await expect(registerBackgroundSync()).resolves.toBeUndefined();
  });

  it("is idempotent — registering twice with the same tag coalesces", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const sw = {
      ready: Promise.resolve({ sync: { register } }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: sw,
    });
    const { registerBackgroundSync } = await import("./outbox");
    await Promise.all([registerBackgroundSync(), registerBackgroundSync()]);
    // The tag is identical — the platform coalesces; we simply forward both calls.
    expect(register).toHaveBeenCalledWith("quotation-sync");
    expect(register).toHaveBeenCalledTimes(2);
  });
});

describe("applyLocalMutation triggers Background Sync registration", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    const register = vi.fn().mockResolvedValue(undefined);
    const sw = {
      ready: Promise.resolve({ sync: { register } }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      onLine: true,
      serviceWorker: sw,
    });
    // Expose the register spy for assertions via a global marker.
    (globalThis as unknown as { __bgSyncRegisterSpy: typeof register }).__bgSyncRegisterSpy =
      register;
  });

  afterEach(() => {
    db.close();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("calls registerBackgroundSync() fire-and-forget after the Dexie transaction", async () => {
    const spy = (globalThis as unknown as { __bgSyncRegisterSpy: ReturnType<typeof vi.fn> })
      .__bgSyncRegisterSpy;

    await applyLocalMutation("client", "id-bg", "create", {}, 0, async () => {
      await db.clients.put({ ...testClient, id: "id-bg" });
    });

    // Fire-and-forget: allow the microtask to flush.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spy).toHaveBeenCalledWith("quotation-sync");
  });
});
