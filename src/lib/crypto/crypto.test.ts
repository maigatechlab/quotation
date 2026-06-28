// Story 6.1 — at-rest encryption tests (NFR-S4).
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptRecord, encryptRecord } from "@/lib/crypto/entity-crypto";
import {
  AesGcmCrypto,
  deriveKey,
  getOrCreateDeviceSalt,
  isEncrypted,
  NoOpCrypto,
  setActiveCrypto,
} from "@/lib/crypto/local-crypto";
import { db } from "@/lib/local-db";
import type { ClientLocal, QuoteClauseLocal, QuoteLocal } from "@/lib/local-db";

async function makeCrypto(password = "correct horse battery", saltSeed = 1) {
  const salt = new Uint8Array(16).fill(saltSeed);
  const key = await deriveKey(password, salt);
  return new AesGcmCrypto(key);
}

function makeClient(overrides: Partial<ClientLocal> = {}): ClientLocal {
  return {
    id: "client-1",
    companyName: "Transit Sahel SARL",
    contactName: "Amina",
    phone: "+22790000000",
    email: "amina@sahel.ne",
    country: "NE",
    city: "Niamey",
    address: "Quartier Plateau",
    notes: "Client fidèle",
    pays: "NE",
    revision: 1,
    updatedAt: "2026-06-27T00:00:00.000Z",
    createdAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("AesGcmCrypto", () => {
  it("roundtrip: encrypt then decrypt returns the original value", async () => {
    const crypto = await makeCrypto();
    for (const value of ["hello", 42, { a: 1, b: [2, 3] }, ["x", "y"]]) {
      const sealed = await crypto.encrypt(value);
      expect(isEncrypted(sealed)).toBe(true);
      expect(await crypto.decrypt(sealed)).toEqual(value);
    }
  });

  it("produces an envelope with __encrypted=true, iv and ct", async () => {
    const crypto = await makeCrypto();
    const sealed = (await crypto.encrypt("secret")) as Record<string, unknown>;
    expect(sealed.__encrypted).toBe(true);
    expect(typeof sealed.iv).toBe("string");
    expect(typeof sealed.ct).toBe("string");
  });

  it("uses a fresh IV per call (ciphertext differs for equal plaintext)", async () => {
    const crypto = await makeCrypto();
    const a = (await crypto.encrypt("same")) as { ct: string; iv: string };
    const b = (await crypto.encrypt("same")) as { ct: string; iv: string };
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("passes null/undefined through unchanged", async () => {
    const crypto = await makeCrypto();
    expect(await crypto.encrypt(null)).toBeNull();
    expect(await crypto.encrypt(undefined)).toBeUndefined();
  });

  it("graceful fallback: decrypt of a plaintext value returns it unchanged (AC6)", async () => {
    const crypto = await makeCrypto();
    expect(await crypto.decrypt("plain-mvp0")).toBe("plain-mvp0");
    expect(await crypto.decrypt({ foo: "bar" })).toEqual({ foo: "bar" });
  });
});

describe("deriveKey (PBKDF2)", () => {
  it("is deterministic: same password+salt derive interoperable keys", async () => {
    const salt = new Uint8Array(16).fill(7);
    const k1 = new AesGcmCrypto(await deriveKey("pw", salt));
    const k2 = new AesGcmCrypto(await deriveKey("pw", salt));
    const sealed = await k1.encrypt("cross-key");
    // A key derived from the same password+salt must decrypt the other's output.
    expect(await k2.decrypt(sealed)).toBe("cross-key");
  });

  it("different password derives a key that cannot decrypt (auth tag fails)", async () => {
    const salt = new Uint8Array(16).fill(7);
    const good = new AesGcmCrypto(await deriveKey("pw", salt));
    const wrong = new AesGcmCrypto(await deriveKey("other", salt));
    const sealed = await good.encrypt("secret");
    await expect(wrong.decrypt(sealed)).rejects.toBeDefined();
  });
});

describe("getOrCreateDeviceSalt", () => {
  it("persists and reuses a stable 16-byte salt", () => {
    localStorage.removeItem("quotation-device-salt");
    const a = getOrCreateDeviceSalt();
    const b = getOrCreateDeviceSalt();
    expect(a.length).toBe(16);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe("NoOpCrypto", () => {
  it("is an identity transform", async () => {
    const crypto = new NoOpCrypto();
    expect(await crypto.encrypt({ x: 1 })).toEqual({ x: 1 });
    expect(await crypto.decrypt({ x: 1 })).toEqual({ x: 1 });
  });
});

describe("entity field encryption (selective, AC2)", () => {
  it("encrypts only classified fields, leaving index fields plaintext", async () => {
    const crypto = await makeCrypto();
    const enc = await encryptRecord("clients", makeClient(), crypto);
    // classified → enveloped
    expect(isEncrypted(enc.companyName)).toBe(true);
    expect(isEncrypted(enc.phone)).toBe(true);
    expect(isEncrypted(enc.notes)).toBe(true);
    // index/non-classified → untouched plaintext
    expect(enc.id).toBe("client-1");
    expect(enc.city).toBe("Niamey");
    expect(enc.revision).toBe(1);
  });

  it("roundtrips a record through encrypt → decrypt", async () => {
    const crypto = await makeCrypto();
    const original = makeClient();
    const enc = await encryptRecord("clients", original, crypto);
    const dec = await decryptRecord("clients", enc, crypto);
    expect(dec).toEqual(original);
  });

  it("is idempotent: re-encrypting an already-sealed record is a no-op", async () => {
    const crypto = await makeCrypto();
    const enc1 = await encryptRecord("clients", makeClient(), crypto);
    const enc2 = await encryptRecord("clients", enc1, crypto);
    expect(enc2.companyName).toEqual(enc1.companyName);
  });

  it("decrypt without a key coerces an envelope to undefined (no leak)", async () => {
    const crypto = await makeCrypto();
    const enc = await encryptRecord("clients", makeClient(), crypto);
    const locked = await decryptRecord("clients", enc, new NoOpCrypto());
    expect(locked.companyName).toBeUndefined();
    expect(locked.city).toBe("Niamey"); // index field still readable
  });
});

describe("transparent Dexie encryption layer", () => {
  beforeEach(async () => {
    await db.clients.clear();
    setActiveCrypto(new NoOpCrypto());
  });

  it("encrypts at rest: a locked read hides classified fields, keeps index fields", async () => {
    setActiveCrypto(await makeCrypto());
    await db.clients.put(makeClient({ id: "c-1" }));

    // Lock the session (drop key) and read back: classified fields unreadable,
    // proving they were stored encrypted, not plaintext.
    setActiveCrypto(new NoOpCrypto());
    const locked = await db.clients.get("c-1");
    expect(locked?.companyName).toBeUndefined();
    expect(locked?.city).toBe("Niamey");
  });

  it("roundtrips through put/get with the session key", async () => {
    setActiveCrypto(await makeCrypto());
    const original = makeClient({ id: "c-2" });
    await db.clients.put(original);
    const read = await db.clients.get("c-2");
    expect(read).toEqual(original);
  });

  it("decrypts collection reads (filter + toArray)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.clients.put(makeClient({ id: "c-3", companyName: "Alpha" }));
    await db.clients.put(makeClient({ id: "c-4", companyName: "Beta" }));
    const rows = await db.clients.filter((c) => !c.deletedAt).toArray();
    const names = rows.map((r) => r.companyName).sort();
    expect(names).toEqual(["Alpha", "Beta"]);
  });

  it("encrypts writes inside a transaction (mirrors the pull path)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.transaction("rw", db.clients, async () => {
      await db.clients.put(makeClient({ id: "tx-1", companyName: "InTx" }));
      await db.clients.put(makeClient({ id: "tx-2", companyName: "InTx2" }));
    });
    const read = await db.clients.get("tx-1");
    expect(read?.companyName).toBe("InTx");

    setActiveCrypto(new NoOpCrypto());
    const locked = await db.clients.get("tx-1");
    expect(locked?.companyName).toBeUndefined();
  });

  it("decrypts indexed sortBy reads on a classified table (quoteLines)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.quoteLines.clear();
    await db.quoteLines.bulkPut([
      { id: "l-2", quoteId: "q-1", designation: "Manutention", unitPrice: 5000, quantity: 1, totalFcfa: 5000, ordre: 2, pays: "NE", revision: 1, updatedAt: "x", createdAt: "x" },
      { id: "l-1", quoteId: "q-1", designation: "Transport", unitPrice: 100000, quantity: 1, totalFcfa: 100000, ordre: 1, pays: "NE", revision: 1, updatedAt: "x", createdAt: "x" },
    ]);
    const lines = await db.quoteLines.where("quoteId").equals("q-1").sortBy("ordre");
    expect(lines.map((l) => l.designation)).toEqual(["Transport", "Manutention"]);
    expect(lines.map((l) => l.totalFcfa)).toEqual([100000, 5000]);
  });

  it("decrypts toCollection().first() on a classified table (company)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.company.clear();
    await db.company.put({
      id: "co-1", raisonSociale: "Maiga Logistics", rccm: "RCCM1", nif: "NIF1",
      phones: ["+22790"], emails: ["a@b.ne"], signataireNom: "Issa",
      pays: "NE", revision: 1, updatedAt: "x", createdAt: "x",
    });
    const company = await db.company.toCollection().first();
    expect(company?.raisonSociale).toBe("Maiga Logistics");
    expect(company?.phones).toEqual(["+22790"]);
    expect(company?.signataireNom).toBe("Issa");
  });

  it("encrypts a classified field written via Table.update() (review L4)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.clients.put(makeClient({ id: "u-1", companyName: "Before" }));
    await db.clients.update("u-1", { companyName: "After" });
    expect((await db.clients.get("u-1"))?.companyName).toBe("After");
    setActiveCrypto(new NoOpCrypto());
    expect((await db.clients.get("u-1"))?.companyName).toBeUndefined();
  });

  it("encrypts classified fields written via Table.bulkUpdate() (review H2)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.clients.put(makeClient({ id: "bu-1", companyName: "X" }));
    await db.clients.bulkUpdate([{ key: "bu-1", changes: { companyName: "Y" } }]);
    expect((await db.clients.get("bu-1"))?.companyName).toBe("Y");
    setActiveCrypto(new NoOpCrypto());
    expect((await db.clients.get("bu-1"))?.companyName).toBeUndefined();
  });

  it("encrypts quotes.clientSnapshot embedded PII at rest (review M1)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.quotes.clear();
    const quote: QuoteLocal = {
      id: "q-9", number: "D-1", status: "draft", totalFcfa: 500000,
      clientSnapshot: { companyName: "Acme", phone: "+22791" },
      pays: "NE", revision: 1, updatedAt: "x", createdAt: "x",
    };
    await db.quotes.put(quote);
    const read = await db.quotes.get("q-9");
    expect(read?.clientSnapshot).toEqual({ companyName: "Acme", phone: "+22791" });
    expect(read?.totalFcfa).toBe(500000);

    setActiveCrypto(new NoOpCrypto());
    const locked = await db.quotes.get("q-9");
    expect(locked?.clientSnapshot).toBeUndefined();
    expect(locked?.totalFcfa).toBeUndefined();
    expect(locked?.number).toBe("D-1"); // index field stays plaintext
  });

  it("encrypts quoteClauses.contenu at rest (review M2)", async () => {
    setActiveCrypto(await makeCrypto());
    await db.quoteClauses.clear();
    const qc: QuoteClauseLocal = {
      id: "qc-1", quoteId: "q-1", contenu: "Paiement à 30 jours", ordre: 1,
      pays: "NE", revision: 1, updatedAt: "x", createdAt: "x",
    };
    await db.quoteClauses.put(qc);
    const rows = await db.quoteClauses.where("quoteId").equals("q-1").sortBy("ordre");
    expect(rows[0]?.contenu).toBe("Paiement à 30 jours");

    setActiveCrypto(new NoOpCrypto());
    expect((await db.quoteClauses.get("qc-1"))?.contenu).toBeUndefined();
  });

  it("reads MVP-0 plaintext records written before encryption (AC6)", async () => {
    // Write while locked (no-op crypto) → plaintext at rest.
    await db.clients.put(makeClient({ id: "legacy", companyName: "LegacyCo" }));
    // Now a key is loaded; the plaintext value still reads back fine.
    setActiveCrypto(await makeCrypto());
    const read = await db.clients.get("legacy");
    expect(read?.companyName).toBe("LegacyCo");
  });
});
