// Per-record field encryption/decryption — Story 6.1 (NFR-S4).
//
// Operates generically on a Dexie record keyed by table name: only the
// classified fields (field-classification.ts) are transformed; index fields
// pass through untouched so Dexie indexing keeps working.
//
// These helpers are driven by the active crypto singleton and are consumed by
// the transparent Dexie encryption layer (encryption-middleware.ts). They are
// idempotent and crash-safe:
//   - encrypt skips values already sealed in an envelope.
//   - decrypt passes plaintext through (graceful fallback, AC6) and returns
//     `undefined` for an envelope it cannot open (no key / wrong key after a
//     password change, AC4) instead of leaking the raw envelope into the UI.

import { classifiedFieldsFor } from "@/lib/crypto/field-classification";
import {
  getActiveCrypto,
  isEncrypted,
  type LocalCrypto,
} from "@/lib/crypto/local-crypto";

type AnyRecord = Record<string, unknown>;

/**
 * Encrypt the classified fields of a record before it is written to Dexie.
 * Returns a shallow copy; the original is not mutated. When the active crypto is
 * the no-op (pre-login), values are returned unchanged (plaintext at rest).
 */
export async function encryptRecord<T>(
  tableName: string,
  record: T,
  crypto: LocalCrypto = getActiveCrypto()
): Promise<T> {
  const fields = classifiedFieldsFor(tableName);
  if (fields.length === 0 || record === null || typeof record !== "object") {
    return record;
  }

  const source = record as AnyRecord;
  const out: AnyRecord = { ...source };
  for (const field of fields) {
    const value = source[field];
    if (value === undefined || isEncrypted(value)) continue;
    out[field] = await crypto.encrypt(value);
  }
  return out as T;
}

/**
 * Decrypt the classified fields of a record read from Dexie. Returns a shallow
 * copy. Plaintext (MVP-0) values pass through. An envelope that cannot be opened
 * (missing/wrong key) is coerced to `undefined` so the UI degrades to an empty
 * field rather than rendering a raw envelope object.
 */
export async function decryptRecord<T>(
  tableName: string,
  record: T,
  crypto: LocalCrypto = getActiveCrypto()
): Promise<T> {
  const fields = classifiedFieldsFor(tableName);
  if (fields.length === 0 || record === null || typeof record !== "object") {
    return record;
  }

  const source = record as AnyRecord;
  const out: AnyRecord = { ...source };
  for (const field of fields) {
    const value = source[field];
    if (!isEncrypted(value)) continue;
    try {
      const decrypted = await crypto.decrypt(value);
      // NoOpCrypto returns the envelope unchanged; never surface that.
      out[field] = isEncrypted(decrypted) ? undefined : decrypted;
    } catch {
      out[field] = undefined;
    }
  }
  return out as T;
}

/** Decrypt every record in an array (skips null/undefined holes from bulkGet). */
export async function decryptRecords<T>(
  tableName: string,
  records: readonly T[],
  crypto: LocalCrypto = getActiveCrypto()
): Promise<T[]> {
  return Promise.all(
    records.map((r) =>
      r === undefined || r === null ? r : decryptRecord(tableName, r, crypto)
    )
  );
}
