// LocalCrypto seam — Story 1.3 (no-op) → Story 6.1 (AES-GCM at rest, NFR-S4).
//
// The interface + NoOpCrypto are preserved for backward compatibility (MVP-0
// records written in plaintext). Story 6.1 adds AES-GCM 256-bit encryption via
// the Web Crypto API, a PBKDF2 key-derivation helper, a per-device salt, and a
// mutable "active crypto" singleton consumed by the Dexie encryption layer
// (src/lib/crypto/encryption-middleware.ts).

export interface LocalCrypto {
  encrypt(data: unknown): Promise<unknown>;
  decrypt(data: unknown): Promise<unknown>;
}

/** Sentinel shape produced by AesGcmCrypto.encrypt() for an encrypted value. */
export interface EncryptedEnvelope {
  __encrypted: true;
  iv: string;
  ct: string;
}

/** Type guard: is this value an encrypted envelope written by AesGcmCrypto? */
export function isEncrypted(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __encrypted?: unknown }).__encrypted === true
  );
}

// Web Crypto is available on `globalThis.crypto` in browsers (secure context:
// HTTPS or localhost) and in Node 20+/Vitest. Avoid `window` so the module is
// usable from non-window contexts (sync modules) and SSR-guarded callers.
function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error("Web Crypto (crypto.subtle) unavailable — secure context required");
  }
  return c.subtle;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class NoOpCrypto implements LocalCrypto {
  async encrypt(data: unknown): Promise<unknown> {
    return data;
  }

  async decrypt(data: unknown): Promise<unknown> {
    return data;
  }
}

export class AesGcmCrypto implements LocalCrypto {
  private readonly key: CryptoKey;

  constructor(key: CryptoKey) {
    this.key = key;
  }

  async encrypt(data: unknown): Promise<unknown> {
    // Preserve null/undefined so optional fields stay absent (exactOptionalPropertyTypes).
    if (data === null || data === undefined) return data;
    // Idempotent: never double-encrypt an already-sealed envelope.
    if (isEncrypted(data)) return data;

    const iv = randomBytes(12);
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await getSubtle().encrypt({ name: "AES-GCM", iv }, this.key, encoded);

    const envelope: EncryptedEnvelope = {
      __encrypted: true,
      iv: bytesToBase64(iv),
      ct: bytesToBase64(new Uint8Array(ciphertext)),
    };
    return envelope;
  }

  async decrypt(data: unknown): Promise<unknown> {
    // Graceful fallback: plaintext (MVP-0) records pass through unchanged (AC6).
    if (!isEncrypted(data)) return data;

    const ivBytes = base64ToBytes(data.iv);
    const ctBytes = base64ToBytes(data.ct);
    const plaintext = await getSubtle().decrypt(
      { name: "AES-GCM", iv: ivBytes },
      this.key,
      ctBytes
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  }
}

/**
 * Derive a non-extractable AES-GCM 256-bit key from the user's password and the
 * per-device salt using PBKDF2 (100k iterations, SHA-256). NFR-S4.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

const DEVICE_SALT_KEY = "quotation-device-salt";

/**
 * Return the device salt from localStorage, creating a fresh random 16-byte salt
 * on first use. The salt is not secret but is unique per device; it survives a
 * password reset so the new key derives from (newPassword + same salt) — AC4.
 */
export function getOrCreateDeviceSalt(): Uint8Array<ArrayBuffer> {
  const stored = localStorage.getItem(DEVICE_SALT_KEY);
  if (stored) return base64ToBytes(stored);
  const salt = randomBytes(16);
  localStorage.setItem(DEVICE_SALT_KEY, bytesToBase64(salt));
  return salt;
}

// --- Active crypto singleton -------------------------------------------------
// The Dexie encryption layer is plain (non-React) module code, so it reads the
// current crypto implementation through this mutable singleton rather than React
// context. CryptoProvider keeps it in sync with the session lifecycle. The key
// lives ONLY here in memory — never in localStorage/sessionStorage/IndexedDB.

let activeCrypto: LocalCrypto = new NoOpCrypto();

export function setActiveCrypto(crypto: LocalCrypto): void {
  activeCrypto = crypto;
}

export function getActiveCrypto(): LocalCrypto {
  return activeCrypto;
}

/** True once a real AES-GCM key is loaded for the session. */
export function isCryptoUnlocked(): boolean {
  return activeCrypto instanceof AesGcmCrypto;
}

// Backward-compatible export (Story 1.3). Kept as a no-op for any legacy import;
// at-rest encryption now flows through getActiveCrypto() + the Dexie layer.
export const localCrypto: LocalCrypto = new NoOpCrypto();
