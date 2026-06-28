// Transparent Dexie encryption layer — Story 6.1 (NFR-S4).
//
// WHY THIS LAYER (and not a raw DBCore middleware):
// AC1 mandates AES-GCM via the async Web Crypto API. DBCore cursor reads expose
// records through a SYNCHRONOUS `cursor.value` getter, so async decryption can't
// run there; and encrypting inside a user `db.transaction()` callback would
// detach from the IndexedDB transaction. We therefore intercept one level up —
// at Dexie's async `Table`/`Collection` methods — and use `Dexie.waitFor()` to
// keep any in-flight transaction alive across the async crypto. This is fully
// transparent: every existing `db.<table>.get/put/toArray/...` call site keeps
// working unchanged, classified fields are encrypted at rest, and index fields
// stay plaintext.
//
// Idempotency (envelope sentinel) makes the interception safe even when a Dexie
// primitive internally delegates between Table and Collection methods.

import Dexie from "dexie";
import { decryptRecord, decryptRecords, encryptRecord } from "@/lib/crypto/entity-crypto";
import { hasClassifiedFields } from "@/lib/crypto/field-classification";

type AnyFn = (...args: unknown[]) => unknown;

interface DexieClasses {
  Table: { prototype: Record<string, unknown> };
  Collection: { prototype: Record<string, unknown> };
}

const INSTALLED = Symbol.for("quotation.encryptionLayerInstalled");

/** Resolve the table name backing a Dexie Collection via its internal context. */
function collectionTableName(collection: unknown): string | undefined {
  const ctx = (collection as { _ctx?: { table?: { name?: string } } })._ctx;
  return ctx?.table?.name;
}

/**
 * Install the at-rest encryption layer on a Dexie database instance. Idempotent:
 * calling it more than once is a no-op. Must run before any read/write so every
 * access flows through the crypto transforms.
 */
export function installEncryptionLayer(db: Dexie): void {
  const flagged = db as unknown as Record<symbol, boolean>;
  if (flagged[INSTALLED]) return;
  flagged[INSTALLED] = true;

  const classes = db as unknown as DexieClasses;
  const tableProto = classes.Table.prototype;
  const collectionProto = classes.Collection.prototype;

  // --- Writes (encrypt classified fields before hitting IndexedDB) ---

  const wrapSingleWrite = (name: string) => {
    const original = tableProto[name] as AnyFn;
    tableProto[name] = function (this: { name: string }, item: unknown, ...rest: unknown[]) {
      if (!hasClassifiedFields(this.name)) return original.call(this, item, ...rest);
      return Dexie.waitFor(encryptRecord(this.name, item)).then((enc) =>
        original.call(this, enc, ...rest)
      );
    };
  };

  const wrapBulkWrite = (name: string) => {
    const original = tableProto[name] as AnyFn;
    tableProto[name] = function (this: { name: string }, items: unknown[], ...rest: unknown[]) {
      if (!hasClassifiedFields(this.name) || !Array.isArray(items)) {
        return original.call(this, items, ...rest);
      }
      return Dexie.waitFor(
        Promise.all(items.map((it) => encryptRecord(this.name, it)))
      ).then((enc) => original.call(this, enc, ...rest));
    };
  };

  wrapSingleWrite("put");
  wrapSingleWrite("add");
  wrapSingleWrite("upsert"); // Dexie 4 — put-like full write
  wrapBulkWrite("bulkPut");
  wrapBulkWrite("bulkAdd");

  // update(key, changes): encrypt classified fields present in the partial.
  const originalUpdate = tableProto["update"] as AnyFn;
  tableProto["update"] = function (this: { name: string }, key: unknown, changes: unknown, ...rest: unknown[]) {
    if (!hasClassifiedFields(this.name) || changes === null || typeof changes !== "object") {
      return originalUpdate.call(this, key, changes, ...rest);
    }
    return Dexie.waitFor(encryptRecord(this.name, changes)).then((enc) =>
      originalUpdate.call(this, key, enc, ...rest)
    );
  };

  // bulkUpdate([{ key, changes }]): encrypt classified fields in each partial.
  const originalBulkUpdate = tableProto["bulkUpdate"] as AnyFn;
  tableProto["bulkUpdate"] = function (this: { name: string }, operations: unknown, ...rest: unknown[]) {
    if (!hasClassifiedFields(this.name) || !Array.isArray(operations)) {
      return originalBulkUpdate.call(this, operations, ...rest);
    }
    return Dexie.waitFor(
      Promise.all(
        operations.map(async (op) => {
          if (op !== null && typeof op === "object" && "changes" in op) {
            const o = op as { changes: unknown };
            return { ...o, changes: await encryptRecord(this.name, o.changes) };
          }
          return op;
        })
      )
    ).then((enc) => originalBulkUpdate.call(this, enc, ...rest));
  };

  // --- Reads (decrypt classified fields after IndexedDB returns) ---

  const wrapSingleRead = (proto: Record<string, unknown>, name: string, getName: (self: unknown) => string | undefined) => {
    const original = proto[name] as AnyFn;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      const tableName = getName(this);
      const result = original.apply(this, args) as Promise<unknown>;
      if (!tableName || !hasClassifiedFields(tableName)) return result;
      return result.then((rec) =>
        rec === undefined || rec === null ? rec : Dexie.waitFor(decryptRecord(tableName, rec))
      );
    };
  };

  const wrapArrayRead = (proto: Record<string, unknown>, name: string, getName: (self: unknown) => string | undefined) => {
    const original = proto[name] as AnyFn;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      const tableName = getName(this);
      const result = original.apply(this, args) as Promise<unknown>;
      if (!tableName || !hasClassifiedFields(tableName)) return result;
      return result.then((arr) =>
        Array.isArray(arr) ? Dexie.waitFor(decryptRecords(tableName, arr)) : arr
      );
    };
  };

  const tableName = (self: unknown) => (self as { name?: string }).name;

  wrapSingleRead(tableProto, "get", tableName);
  wrapArrayRead(tableProto, "toArray", tableName);
  wrapArrayRead(tableProto, "bulkGet", tableName);

  wrapArrayRead(collectionProto, "toArray", collectionTableName);
  wrapArrayRead(collectionProto, "sortBy", collectionTableName);
  wrapSingleRead(collectionProto, "first", collectionTableName);
  wrapSingleRead(collectionProto, "last", collectionTableName);
}
