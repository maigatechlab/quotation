import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/local-db";
import type { ClientLocal, SyncOp } from "@/lib/local-db";
import { handleConflict } from "./conflict";

vi.mock("sonner", () => ({
  toast: { warning: vi.fn() },
}));

const now = "2026-06-23T00:00:00.000Z";

const clientPayload = { companyName: "Old SARL", phone: "+227111" };
const serverEntity: ClientLocal = {
  id: "client-conflict-1",
  companyName: "New SARL",
  phone: "+227999",
  country: "NE",
  pays: "NE",
  revision: 5,
  updatedAt: now,
  createdAt: now,
};

const conflictOp: SyncOp = {
  opId: "op-conflict-1",
  entity: "client",
  entityId: "client-conflict-1",
  type: "update",
  payload: clientPayload,
  baseRevision: 3,
  queuedAt: now,
};

describe("handleConflict", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    db.close();
    vi.clearAllMocks();
  });

  it("upserts server entity (winning version) into Dexie", async () => {
    await handleConflict(conflictOp, serverEntity);

    const stored = await db.clients.get(serverEntity.id);
    expect(stored).toBeDefined();
    expect(stored?.companyName).toBe("New SARL");
    expect(stored?.revision).toBe(5);
  });

  it("archives losing payload (client) and winning entity (server) in auditMirror", async () => {
    await handleConflict(conflictOp, serverEntity);

    const auditRecords = await db.auditMirror.toArray();
    expect(auditRecords.length).toBe(1);
    const record = auditRecords[0];
    expect(record).toBeDefined();
    expect(record?.what).toBe("conflict.archived");
    expect(record?.entityType).toBe("client");
    expect(record?.entityId).toBe("client-conflict-1");
    expect(record?.before).toEqual(clientPayload);
    expect(record?.after).toEqual(serverEntity);
    expect(record?.synced).toBe(false);
  });

  it("displays French toast notification", async () => {
    const { toast } = await import("sonner");
    await handleConflict(conflictOp, serverEntity);

    expect(toast.warning).toHaveBeenCalledWith(
      "Conflit résolu : une version plus récente a été appliquée."
    );
  });
});
