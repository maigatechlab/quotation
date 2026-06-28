"use client";

// Session key lifecycle — Story 6.1 (NFR-S4, AC3).
//
// Holds the derived AES-GCM key in memory only and keeps the active-crypto
// singleton (consumed by the Dexie encryption layer) in sync with the auth
// session. The key is NEVER persisted to localStorage / sessionStorage /
// IndexedDB. On logout (or a hard refresh, which drops this React state) the key
// is gone and at-rest data stays encrypted until the next login re-derives it.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  AesGcmCrypto,
  deriveKey,
  getOrCreateDeviceSalt,
  NoOpCrypto,
  setActiveCrypto,
} from "@/lib/crypto/local-crypto";

interface CryptoCtx {
  /** Derive the session key from the password and unlock at-rest crypto. */
  initCrypto: (password: string) => Promise<void>;
  /** Drop the in-memory key (logout / failed login). */
  clearCrypto: () => void;
  /** True once a key is loaded for this session. */
  isUnlocked: boolean;
}

const CryptoContext = createContext<CryptoCtx>({
  initCrypto: async () => {},
  clearCrypto: () => {},
  isUnlocked: false,
});

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);

  const initCrypto = useCallback(async (password: string) => {
    const salt = getOrCreateDeviceSalt();
    const key = await deriveKey(password, salt);
    setActiveCrypto(new AesGcmCrypto(key));
    setIsUnlocked(true);
  }, []);

  const clearCrypto = useCallback(() => {
    setActiveCrypto(new NoOpCrypto());
    setIsUnlocked(false);
  }, []);

  const value = useMemo<CryptoCtx>(
    () => ({ initCrypto, clearCrypto, isUnlocked }),
    [initCrypto, clearCrypto, isUnlocked]
  );

  return <CryptoContext.Provider value={value}>{children}</CryptoContext.Provider>;
}

export function useCrypto(): CryptoCtx {
  return useContext(CryptoContext);
}
