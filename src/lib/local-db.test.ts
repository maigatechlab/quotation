import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localCrypto } from "./crypto/local-crypto";
import { LocalDatabase, db } from "./local-db";
import type { SyncOp } from "./local-db";

const now = "2026-06-22T00:00:00.000Z";

describe("LocalDatabase", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(() => {
    db.close();
  });

  it("instantiates without error", () => {
    const instance = new LocalDatabase();
    expect(instance).toBeInstanceOf(LocalDatabase);
    instance.close();
  });

  it("exposes expected tables", () => {
    expect(db.clients).toBeDefined();
    expect(db.quotes).toBeDefined();
    expect(db.quoteLines).toBeDefined();
    expect(db.clauses).toBeDefined();
    expect(db.templates).toBeDefined();
    expect(db.company).toBeDefined();
    expect(db.syncQueue).toBeDefined();
    expect(db.auditMirror).toBeDefined();
  });

  it("persists sync fields for quote lines, clauses, and templates", async () => {
    await db.templates.put({
      id: "template-1",
      nom: "Transport standard",
      lines: [{ designation: "Fret", unitPrice: 50000, quantity: 1 }],
      companyId: "company-1",
      pays: "NE",
      revision: 0,
      updatedAt: now,
      createdAt: now,
    });

    await db.quoteLines.put({
      id: "line-1",
      quoteId: "quote-1",
      designation: "Fret Niamey-Maradi",
      unitPrice: 50000,
      quantity: 2,
      totalFcfa: 100000,
      ordre: 1,
      templateId: "template-1",
      companyId: "company-1",
      pays: "NE",
      revision: 0,
      updatedAt: now,
      createdAt: now,
    });

    await db.clauses.put({
      id: "clause-1",
      titre: "Paiement",
      contenu: "Paiement a reception de facture.",
      categorie: "paiement",
      companyId: "company-1",
      pays: "NE",
      revision: 0,
      updatedAt: now,
      createdAt: now,
    });

    await expect(db.templates.where("pays").equals("NE").first()).resolves.toMatchObject({
      id: "template-1",
      pays: "NE",
    });
    await expect(db.quoteLines.where("pays").equals("NE").first()).resolves.toMatchObject({
      id: "line-1",
      pays: "NE",
      templateId: "template-1",
    });
    await expect(db.clauses.where("pays").equals("NE").first()).resolves.toMatchObject({
      id: "clause-1",
      pays: "NE",
    });
  });
});

describe("SyncOp type", () => {
  it("accepts a valid SyncOp shape", () => {
    const op: SyncOp = {
      opId: "op-uuid-1",
      entity: "client",
      entityId: "entity-uuid-1",
      type: "create",
      payload: { companyName: "Test" },
      baseRevision: 0,
      queuedAt: new Date().toISOString(),
    };
    expect(op.opId).toBe("op-uuid-1");
    expect(op.entity).toBe("client");
    expect(op.entityId).toBe("entity-uuid-1");
    expect(op.type).toBe("create");
    expect(op.baseRevision).toBe(0);
    expect(op.queuedAt).toBeDefined();
  });
});

describe("LocalCrypto no-op", () => {
  it("encrypt returns data unchanged", async () => {
    const data = { foo: "bar", n: 42 };
    const result = await localCrypto.encrypt(data);
    expect(result).toBe(data);
  });

  it("decrypt returns data unchanged", async () => {
    const data = { foo: "bar", n: 42 };
    const result = await localCrypto.decrypt(data);
    expect(result).toBe(data);
  });

  it("encrypt handles primitives", async () => {
    expect(await localCrypto.encrypt(42)).toBe(42);
    expect(await localCrypto.encrypt("hello")).toBe("hello");
    expect(await localCrypto.encrypt(null)).toBe(null);
  });

  it("decrypt handles primitives", async () => {
    expect(await localCrypto.decrypt(42)).toBe(42);
    expect(await localCrypto.decrypt("hello")).toBe("hello");
    expect(await localCrypto.decrypt(null)).toBe(null);
  });
});