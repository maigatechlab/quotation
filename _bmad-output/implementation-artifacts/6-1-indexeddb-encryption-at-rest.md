---
story_key: 6-1-indexeddb-encryption-at-rest
epic_num: 6
story_num: 1
status: ready-for-dev
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 6.1 : Chiffrement de l'IndexedDB au repos (NFR-S4)

**Statut :** ready-for-dev

## Story

**En tant que** responsable sécurité,
**Je veux** que les données locales sensibles soient chiffrées au repos dans IndexedDB,
**Afin que** les PII, montants et données commerciales soient protégés sur l'appareil (NFR-S4).

---

## Critères d'acceptation (BDD)

**AC1 — Implémentation AES-GCM via Web Crypto**

```
GIVEN  le seam LocalCrypto actuellement no-op (src/lib/crypto/local-crypto.ts)
WHEN  j'implémente AesGcmCrypto MVP-1
THEN  chaque appel encrypt(data) chiffre les champs classifiés (PII, financier, commercial)
      en AES-GCM 256-bit via window.crypto.subtle
AND   chaque appel decrypt(data) déchiffre et retourne le plaintext
AND   la clé est dérivée du mot de passe (PBKDF2, 100k iterations, SHA-256, sel unique par appareil)
AND   sel (16 bytes), IV (12 bytes par opération) générés via window.crypto.getRandomValues()
AND   le résultat encrypt() est une string JSON sérialisable (base64 ou objet { ciphertext, iv })
```

**AC2 — Champs classifiés pour le chiffrement**

```
GIVEN  les entités Dexie : clients, quotes, quoteLines, clauses, templates, company
WHEN  un champ est classifié PII / financier / commercial
THEN  il est chiffré au repos et déchiffré au vol

PII (clients) : companyName, contactName, phone, email, address, notes
PII (company) : raisonSociale, adresse, phones, emails, signataireNom, signataireFonction
Financier (quotes) : totalFcfa, goodsValueFcfa, unitPrice
Commercial (clauses) : contenu
Commercial (quoteLines) : designation, unitPrice, totalFcfa
Champs NON chiffrés (index Dexie requis) : id, companyId, ownerId, revision, updatedAt, createdAt,
  deletedAt, status, clientId, pays, dateDevis, dateValidite, opId, entity, entityId, queuedAt
```

**AC3 — Dérivation de clé PBKDF2 et gestion de session**

```
GIVEN  un utilisateur qui se connecte avec son mot de passe
WHEN  la session s'ouvre
THEN  la clé AES-GCM est dérivée via PBKDF2(password, salt, 100000, 256) + stockée en mémoire uniquement
AND   la clé N'EST PAS stockée dans IndexedDB, localStorage, ni sessionStorage
AND   le sel (deviceSalt) est stocké dans localStorage (non secret, mais unique par appareil)

WHEN  la session expire ou l'utilisateur se déconnecte
THEN  la clé en mémoire est détruite (référence nullifiée)
AND   les données restent chiffrées en repos dans IndexedDB
```

**AC4 — Reset mot de passe → purge + re-sync**

```
GIVEN  un utilisateur qui réinitialise son mot de passe (FR-4 / Story 1.7)
WHEN  le nouveau mot de passe est validé
THEN  localDb.delete() est appelé (purge totale IndexedDB "quotation-local")
AND   un re-sync complet depuis le serveur est déclenché
AND   la nouvelle clé PBKDF2 (nouveau mot de passe + même deviceSalt) est utilisée
      pour re-chiffrer les données à la prochaine écriture
AND   un toast notifie "Données locales réinitialisées et re-synchronisées"
```

**AC5 — Reconstruction index FlexSearch après déverrouillage**

```
GIVEN  une session qui s'ouvre (déchiffrement disponible)
WHEN  les hooks useLiveClients et useLiveQuotes se montent
THEN  l'index FlexSearch in-memory est (re)construit depuis les données déchiffrées
AND   la recherche client offline (FR-9, Story 2.7) fonctionne normalement
AND   l'index est détruit à la déconnexion (nettoyage mémoire)
```

**AC6 — Rétrocompatibilité : données no-op existantes**

```
GIVEN  des données écrites en MVP-0 (non chiffrées, plaintext dans IndexedDB)
WHEN  l'utilisateur met à jour vers MVP-1 et ouvre une session
THEN  decrypt(plaintext) retourne le plaintext tel quel (graceful fallback)
AND   à la prochaine écriture de chaque record, il est chiffré (migration lazy write)
AND   aucun crash sur les records mixtes (chiffrés et non-chiffrés)
```

**AC7 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN  pnpm check
THEN  lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND   pnpm build passe sans erreur
AND   tests unitaires : encrypt→decrypt roundtrip ✓, PBKDF2 déterministe (même pass+salt → même clé) ✓,
      graceful fallback plaintext ✓
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/crypto/local-crypto.ts` — UPDATE : ajouter `AesGcmCrypto` classe + helper `deriveKey`, exporter `initCrypto(password: string): Promise<void>`
- `src/lib/crypto/crypto-context.tsx` — CRÉER : React context `CryptoContext` qui détient la clé en mémoire, expose `encrypt/decrypt`, initialise à la connexion
- `src/lib/local-db.ts` — UPDATE : wraper les writes Dexie pour chiffrer les champs classifiés, wraper les reads pour déchiffrer (via `localCrypto` singleton ou context)
- `src/lib/auth-client.ts` ou `src/app/(auth)/login/page.tsx` — UPDATE : appeler `initCrypto(password)` au login pour dériver et stocker la clé en mémoire
- `src/app/(auth)/reset-password/` — UPDATE : déclencher la purge IndexedDB + re-sync après reset de mot de passe
- `src/lib/sync/pull.ts` — UPDATE : vérifier que l'hydratation Dexie passe bien par les wrappers chiffrés
- `src/messages/fr-NE.json` — UPDATE : ajouter clés toast reset
- `src/lib/crypto/crypto.test.ts` — CRÉER : tests unitaires Vitest (roundtrip, PBKDF2, fallback)

**EXCLU (ne pas modifier) :**
- `src/lib/sync/push.ts` / `src/app/api/v1/sync/push/route.ts` — les données sont chiffrées côté client uniquement ; le serveur reçoit toujours du plaintext JSON
- `src/lib/schema.ts` / migrations Drizzle — le chiffrement est client-only (IndexedDB), pas côté PostgreSQL
- `src/lib/sync/outbox.ts` (`applyLocalMutation`) — l'outbox SyncOp stocke le payload plaintext pour le push ; chiffrement appliqué uniquement sur les entités métier (clients, quotes, etc.)
- Aucune migration DB Neon requise

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `src/lib/crypto/local-crypto.ts`

- [ ] Garder l'interface `LocalCrypto` + `NoOpCrypto` tels quels (rétrocompat)
- [ ] Ajouter la classe `AesGcmCrypto` :
  ```ts
  export class AesGcmCrypto implements LocalCrypto {
    private key: CryptoKey;
    constructor(key: CryptoKey) { this.key = key; }

    async encrypt(data: unknown): Promise<unknown> {
      if (data === null || data === undefined) return data;
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(data));
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, this.key, encoded
      );
      return {
        __encrypted: true,
        iv: btoa(String.fromCharCode(...iv)),
        ct: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
      };
    }

    async decrypt(data: unknown): Promise<unknown> {
      if (!data || typeof data !== "object" || !("__encrypted" in (data as object))) {
        return data; // graceful fallback plaintext (MVP-0 records)
      }
      const { iv, ct } = data as { iv: string; ct: string };
      const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
      const ctBytes = Uint8Array.from(atob(ct), c => c.charCodeAt(0));
      const plaintext = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes }, this.key, ctBytes
      );
      return JSON.parse(new TextDecoder().decode(plaintext));
    }
  }
  ```
- [ ] Ajouter `deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>` :
  ```ts
  export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await window.crypto.subtle.importKey(
      "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  ```
- [ ] Ajouter `getOrCreateDeviceSalt(): Uint8Array` (localStorage key `quotation-device-salt`) :
  ```ts
  export function getOrCreateDeviceSalt(): Uint8Array {
    const stored = localStorage.getItem("quotation-device-salt");
    if (stored) return Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem("quotation-device-salt", btoa(String.fromCharCode(...salt)));
    return salt;
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/lib/crypto/crypto-context.tsx`

- [ ] `"use client"` première ligne
- [ ] Context React qui détient l'instance `localCrypto` courante :
  ```tsx
  import { createContext, useContext, useState, useCallback } from "react";
  import { AesGcmCrypto, NoOpCrypto, deriveKey, getOrCreateDeviceSalt, type LocalCrypto } from "./local-crypto";

  interface CryptoCtx {
    crypto: LocalCrypto;
    initCrypto: (password: string) => Promise<void>;
    clearCrypto: () => void;
  }

  const CryptoContext = createContext<CryptoCtx>({
    crypto: new NoOpCrypto(),
    initCrypto: async () => {},
    clearCrypto: () => {},
  });

  export function CryptoProvider({ children }: { children: React.ReactNode }) {
    const [crypto, setCrypto] = useState<LocalCrypto>(new NoOpCrypto());

    const initCrypto = useCallback(async (password: string) => {
      const salt = getOrCreateDeviceSalt();
      const key = await deriveKey(password, salt);
      setCrypto(new AesGcmCrypto(key));
    }, []);

    const clearCrypto = useCallback(() => {
      setCrypto(new NoOpCrypto());
    }, []);

    return (
      <CryptoContext.Provider value={{ crypto, initCrypto, clearCrypto }}>
        {children}
      </CryptoContext.Provider>
    );
  }

  export function useCrypto() { return useContext(CryptoContext); }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/lib/local-db.ts`

- [ ] Ajouter champ sentinel `__encrypted?: true` dans les interfaces où des champs sont chiffrés (commentaire seulement, pas de changement de type — les champs restent `string | number` ; le chiffrement retourne `unknown` remplacé au runtime)

**NOTE ARCHITECTURE CRITIQUE :** Le chiffrement sélectif par champ avec Dexie nécessite d'intercepter les reads/writes. L'approche retenue (architecture §168) est de wrapper les champs classifiés dans les fonctions métier qui écrivent/lisent Dexie, plutôt que de modifier les types Dexie (ce qui casserait les index). Concrètement :

- [ ] Ajouter des helpers de chiffrement/déchiffrement par entité dans un nouveau fichier `src/lib/crypto/entity-crypto.ts` :
  ```ts
  // Chiffre les champs classifiés d'un ClientLocal avant put()
  export async function encryptClient(client: ClientLocal, crypto: LocalCrypto): Promise<ClientLocal>
  // Déchiffre les champs d'un ClientLocal après get()
  export async function decryptClient(client: ClientLocal, crypto: LocalCrypto): Promise<ClientLocal>
  // Idem pour QuoteLocal, ClauseLocal, CompanyLocal, QuoteLineLocal
  ```
- [ ] Les fonctions encryptXxx/decryptXxx traitent uniquement les champs classifiés, passent les champs d'index (id, status, etc.) tels quels
- [ ] **NE PAS modifier** la structure des stores Dexie (schemas, index, version) — uniquement les helpers de transformation
- [ ] Ajouter version 3 dans `LocalDatabase.constructor()` uniquement si un index doit changer (non attendu pour ce story)

**CRITIQUE — Les hooks liveQuery existants :** Les hooks `useLiveClients`, `useLiveQuotes`, `useLiveCompany` récupèrent des records Dexie. Ils doivent passer par le déchiffrement. Deux approches :
1. Modifier les hooks pour appeler `decryptClient(record, crypto)` sur chaque record (préféré)
2. Wraper `db.clients.hook("reading", ...)` — plus complexe, non retenu

Pour MVP-1, **approche 1** : modifier les hooks liveQuery pour décrypter après chaque lecture.

### T4 — Mettre à jour les hooks liveQuery existants

- [ ] `src/hooks/use-live-clients.ts` — UPDATE : importer `useCrypto()`, décrypter chaque ClientLocal après `db.clients.toArray()`
  ```ts
  const { crypto } = useCrypto();
  useEffect(() => {
    const sub = liveQuery(() => db.clients.toArray()).subscribe({
      next: async (items) => {
        const decrypted = await Promise.all(items.map(c => decryptClient(c, crypto)));
        setClients(decrypted);
      },
      error: () => setClients([]),
    });
    return () => sub.unsubscribe();
  }, [crypto]); // re-run quand la clé change (connexion/déconnexion)
  ```
- [ ] Même pattern pour `use-live-quotes.ts` (decryptQuote), `use-live-company.ts` (decryptCompany)
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Intégration login/logout

- [ ] `src/app/(auth)/login/page.tsx` (ou composant LoginForm) — UPDATE :
  - Après succès auth Better Auth, appeler `initCrypto(password)` (le password est disponible dans le formulaire avant reset)
  - **ATTENTION :** Better Auth ne retourne pas le mot de passe après la réponse auth ; le `initCrypto` doit être appelé AVANT l'appel `signIn`, avec le password du formulaire
  ```ts
  const { initCrypto } = useCrypto();
  // Dans handleSubmit, avant ou juste après signIn.email():
  await initCrypto(password); // dérive la clé en mémoire
  await signIn.email({ email, password, ... });
  ```
- [ ] `src/app/(app)/layout.tsx` ou `src/components/auth/` — UPDATE : appeler `clearCrypto()` au logout
- [ ] `CryptoProvider` doit envelopper le layout app dans `src/app/(app)/layout.tsx` ou `src/app/layout.tsx`
- [ ] `pnpm typecheck` — zéro erreur

### T6 — Purge + re-sync au reset de mot de passe

- [ ] Localiser le flow reset password (Story 1.7, `src/app/(auth)/reset-password/`)
- [ ] Après validation du nouveau mot de passe, ajouter :
  ```ts
  // 1. Purge totale IndexedDB
  await db.delete(); // Dexie: supprime la DB "quotation-local"
  // 2. Re-init crypto avec nouveau mot de passe
  await initCrypto(newPassword);
  // 3. Re-sync depuis serveur (appel triggerSync ou redirect vers page qui force pull)
  await triggerSync();
  // 4. Toast notification
  ```
- [ ] Ajouter clés i18n dans `src/messages/fr-NE.json` :
  ```json
  "auth": {
    "resetPasswordSuccess": "Mot de passe réinitialisé. Données locales re-synchronisées."
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T7 — Appliquer le chiffrement aux writes via applyLocalMutation

- [ ] `src/lib/sync/outbox.ts` — Le `dexieWriteFn` est fourni par l'appelant (composant). Le composant doit encrypter AVANT le put Dexie. Documenter le contrat : "les composants appelant `applyLocalMutation` doivent passer un `dexieWriteFn` qui appelle `encryptClient/encryptQuote/...` avant `db.entity.put()`"
- [ ] Vérifier que `src/lib/sync/pull.ts` chiffre les records lors de l'hydratation Dexie (pull vient du serveur en plaintext → doit être chiffré avant put Dexie)
  ```ts
  // src/lib/sync/pull.ts — pour chaque entité hydratée
  const encrypted = await encryptClient(clientRecord, localCrypto);
  await db.clients.put(encrypted);
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T8 — Créer `src/lib/crypto/crypto.test.ts`

- [ ] Tests Vitest :
  ```ts
  describe("AesGcmCrypto", () => {
    it("roundtrip: encrypt then decrypt returns original", async () => { ... });
    it("PBKDF2: same password+salt produces same key behavior", async () => { ... });
    it("graceful fallback: decrypt(plaintext) returns plaintext", async () => { ... });
    it("encrypt returns object with __encrypted=true, iv, ct", async () => { ... });
    it("null/undefined passthrough", async () => { ... });
  });
  ```
- [ ] Note : Web Crypto est disponible dans Vitest via `globalThis.crypto` (jsdom ou node 18+)
- [ ] `pnpm check` — tous tests passent

### T9 — Reconstruire index FlexSearch à la connexion

- [ ] Localiser où l'index FlexSearch est construit (Story 2.7 `use-live-clients.ts` ou hook dédié)
- [ ] S'assurer que l'index est construit APRÈS le déchiffrement (après `initCrypto` + premier emit liveQuery décrypté)
- [ ] À la déconnexion (`clearCrypto()`), vider l'index : `index.remove(...)` ou reset
- [ ] `pnpm typecheck` — zéro erreur

### T10 — Vérification finale (AC7)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (pas de régression)
- [ ] `pnpm build` : passe sans erreur
- [ ] Login → données visibles normalement dans l'app ✓
- [ ] Inspector IndexedDB (Chrome DevTools → Application → IndexedDB) : champs PII apparaissent comme `{__encrypted: true, iv: "...", ct: "..."}` ✓
- [ ] Logout → login → données encore lisibles (re-dérivation de clé) ✓
- [ ] Reset password → données purgées et re-syncées ✓
- [ ] Recherche client offline fonctionne ✓

---

## Dev Notes

### CRITIQUE — Architecture du seam LocalCrypto

Le seam `LocalCrypto` existe depuis Story 1.3 (`src/lib/crypto/local-crypto.ts`) — **interface + NoOpCrypto uniquement**. Le singleton `localCrypto = new NoOpCrypto()` est exporté. **Cette story remplace le singleton** par un pattern Context React qui détient la clé en mémoire de session.

```typescript
// État actuel (MVP-0) — NE PAS supprimer, utiliser comme base
export interface LocalCrypto {
  encrypt(data: unknown): Promise<unknown>;
  decrypt(data: unknown): Promise<unknown>;
}
export class NoOpCrypto implements LocalCrypto { ... }
export const localCrypto: LocalCrypto = new NoOpCrypto();
```

Le singleton `localCrypto` peut rester (utilisé dans `pull.ts` côté client) mais doit être remplaçable. L'approche Context (CryptoProvider) gère la durée de vie de la clé en React.

### CRITIQUE — Web Crypto est disponible uniquement en contexte sécurisé

`window.crypto.subtle` requiert HTTPS ou `localhost`. En développement local (`http://localhost:3000`), c'est disponible. En production sur Vercel (HTTPS), aucun problème. **NE PAS** utiliser de polyfill crypto.

### CRITIQUE — Chiffrer les champs, pas les records entiers

Chiffrer le record entier (toutes colonnes en un blob) casserait les index Dexie (`companyName`, `phone`, `status`, `clientId`, etc.) qui sont nécessaires pour les queries et le liveQuery. **Le chiffrement est sélectif sur les champs classifiés uniquement.**

```typescript
// CORRECT — chiffrement sélectif
async function encryptClient(client: ClientLocal, crypto: LocalCrypto): Promise<ClientLocal> {
  return {
    ...client,  // champs d'index conservés en plaintext
    companyName: await crypto.encrypt(client.companyName) as string,
    contactName: client.contactName !== undefined
      ? await crypto.encrypt(client.contactName) as string
      : undefined,
    phone: await crypto.encrypt(client.phone) as string,
    email: client.email !== undefined
      ? await crypto.encrypt(client.email) as string
      : undefined,
    address: client.address !== undefined
      ? await crypto.encrypt(client.address) as string
      : undefined,
    notes: client.notes !== undefined
      ? await crypto.encrypt(client.notes) as string
      : undefined,
  };
}

// INCORRECT — ne pas faire ça
async function encryptClient(client: ClientLocal, crypto: LocalCrypto) {
  return { id: client.id, data: await crypto.encrypt(client) }; // casse les index !
}
```

### CRITIQUE — exactOptionalPropertyTypes TS 5.9.3

Avec `exactOptionalPropertyTypes: true`, les champs optionnels doivent être gérés explicitement :

```typescript
// CORRECT
contactName: client.contactName !== undefined
  ? await crypto.encrypt(client.contactName) as string
  : undefined,

// INCORRECT (échouera avec exactOptionalPropertyTypes)
contactName: await crypto.encrypt(client.contactName) as string | undefined,
```

### CRITIQUE — Le password n'est pas disponible après l'auth Better Auth

Better Auth `signIn.email()` ne retourne pas le mot de passe dans la réponse. Le seul moment où le mot de passe plaintext est disponible est DANS le formulaire de login, avant/pendant l'envoi. Appeler `initCrypto(password)` AVANT ou SIMULTANÉMENT à `signIn.email()`.

```typescript
// Dans handleSubmit du formulaire login
async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  setIsPending(true);
  try {
    // 1. Dériver la clé en mémoire AVANT l'appel auth (password encore disponible)
    await initCrypto(password);
    // 2. Auth
    const result = await authClient.signIn.email({ email, password, ... });
    if (result.error) {
      clearCrypto(); // en cas d'échec auth, annuler la clé dérivée
      setError(result.error.message);
    }
  } finally {
    setIsPending(false);
  }
}
```

### CRITIQUE — Gestion de la Dexie DB après `db.delete()`

```typescript
// Après db.delete() (purge reset password), la connexion Dexie est fermée.
// Il faut ré-ouvrir : créer une nouvelle instance LocalDatabase ou appeler db.open()
await db.delete();
// Option A : relocaliser le singleton
const newDb = new LocalDatabase();
// Option B : window.location.reload() après le re-sync (plus simple)
```

L'option B (reload après purge) est acceptable pour MVP-1.

### CRITIQUE — `pull.ts` doit chiffrer avant put Dexie

Le pull serveur retourne du plaintext JSON. Au moment de l'hydratation Dexie, les records doivent être chiffrés :

```typescript
// src/lib/sync/pull.ts — import le localCrypto depuis le context ou le singleton
// Problème : pull.ts est un module côté client mais pas un composant React
// → utiliser un getter global ou un singleton mutable

// Option retenue : singleton mutable dans local-crypto.ts
let activeCrypto: LocalCrypto = new NoOpCrypto();
export function setActiveCrypto(c: LocalCrypto) { activeCrypto = c; }
export function getActiveCrypto(): LocalCrypto { return activeCrypto; }

// Dans CryptoProvider.initCrypto(), après setCrypto(new AesGcmCrypto(key)) :
setActiveCrypto(new AesGcmCrypto(key));
// Dans CryptoProvider.clearCrypto() :
setActiveCrypto(new NoOpCrypto());
```

### CRITIQUE — SyncOp.payload reste plaintext

La queue de sync (`syncQueue` Dexie) contient les payloads à envoyer au serveur. **Ces payloads doivent rester en plaintext** (le serveur attend du JSON lisible). Ne PAS chiffrer `SyncOp.payload`. Le chiffrement s'applique uniquement aux entités métier (clients, quotes, company, clauses, quoteLines, templates).

### CRITIQUE — `auditMirror` non chiffré

L'`auditMirror` contient des champs `before/after` (unknown) qui pourraient inclure des PII. Pour MVP-1, **ne pas chiffrer auditMirror** — la story 6.3 (audit trail immutable) traitera le sujet. Documenter ce gap.

### Design tokens — aucun changement UI

Cette story est entièrement infrastructure. Aucun composant UI visible n'est créé. L'indicateur visuel de chiffrement actif (si souhaité) peut être ajouté en v2.

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Stocker la clé CryptoKey dans localStorage/IndexedDB | Mémoire React state uniquement (CryptoProvider) |
| Chiffrer le record entier (toutes colonnes) | Chiffrement sélectif sur champs classifiés |
| Chiffrer les champs utilisés comme index Dexie | Ces champs restent plaintext |
| Chiffrer `SyncOp.payload` | L'outbox reste plaintext pour le serveur |
| Utiliser AES-CBC ou DES | AES-GCM 256-bit uniquement (authentifié) |
| `Math.random()` pour IV ou sel | `window.crypto.getRandomValues()` uniquement |
| `iterations: 1000` pour PBKDF2 | `iterations: 100_000` minimum (NFR-S4) |
| Modifier le schéma Drizzle/Neon | Chiffrement client-only (IndexedDB uniquement) |
| `new LocalDatabase()` après `db.delete()` sans gestion | Soit reload, soit gérer le re-open proprement |

### Héritage des stories précédentes

**Story 1.3 (local-data-layer-crypto-seam) — fondation directe :**
- `src/lib/crypto/local-crypto.ts` : interface + NoOpCrypto déjà créés
- Seam prévu pour cette upgrade exacte

**Story 2.1 (offline-sync-engine) — interaction :**
- `applyLocalMutation` dans `src/lib/sync/outbox.ts` — le `dexieWriteFn` doit chiffrer avant put
- `SyncOp.payload` reste plaintext

**Story 2.7 (offline-client-search) — interaction :**
- Index FlexSearch construit sur PII — doit être reconstruit après déchiffrement
- `use-live-clients.ts` à mettre à jour pour décrypter

**Architecture §Gap Analysis (ligne 556-557) :**
- "FlexSearch ↔ encrypted IndexedDB (MVP-1): in-memory plaintext index rebuilt on session unlock"
- "Password reset invalidates local encryption key: purge local store + re-sync from server"
- Ces deux gaps sont résolus par cette story

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration Drizzle — chiffrement client-only
# pnpm db:migrate  # non requis

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur

# 5. Tests unitaires crypto
pnpm vitest run src/lib/crypto/crypto.test.ts
```

---

## Références

- [NFR-S4] — IndexedDB chiffré au repos AES-GCM (clé PBKDF2 du mot de passe, PII/financier/commercial classifiés) `[MVP-1]`
- [Architecture §168] — Offline encryption seam : LocalCrypto interface, MVP-0 passthrough → MVP-1 AES-GCM
- [Architecture §214] — "LocalCrypto seam must exist before Dexie writes ship, even as no-op"
- [Architecture §425] — `src/lib/crypto/` dans la structure de fichiers
- [Architecture §556-557] — Gap Analysis : FlexSearch + reset password
- [src/lib/crypto/local-crypto.ts] — Interface + NoOpCrypto existants (seam MVP-0)
- [src/lib/local-db.ts:1-189] — Schéma Dexie complet (toutes entités, index, version 1+2)
- [src/lib/sync/outbox.ts] — applyLocalMutation + dexieWriteFn pattern
- [src/lib/sync/pull.ts] — hydratation Dexie depuis pull serveur
- [src/hooks/use-live-clients.ts] — pattern liveQuery à modifier
- [src/hooks/use-live-company.ts] — pattern liveQuery à modifier
- [src/hooks/use-live-quotes.ts] — pattern liveQuery à modifier
- [src/app/(auth)/login/page.tsx] — point d'entrée initCrypto
- [src/app/(auth)/reset-password/] — point de purge + re-sync
- [PRD §12] — aucun impact sur le chiffrement (quotas = story 6.2)
- [Web Crypto API] — `window.crypto.subtle` (AES-GCM, PBKDF2, importKey, deriveKey)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_À remplir par le dev agent lors de l'implémentation._

### Completion Notes List

_À remplir par le dev agent lors de l'implémentation._

### File List

- `src/lib/crypto/local-crypto.ts` (à modifier)
- `src/lib/crypto/crypto-context.tsx` (à créer)
- `src/lib/crypto/entity-crypto.ts` (à créer)
- `src/lib/crypto/crypto.test.ts` (à créer)
- `src/lib/local-db.ts` (à modifier — version Dexie si besoin)
- `src/lib/sync/pull.ts` (à modifier — chiffrement avant put)
- `src/hooks/use-live-clients.ts` (à modifier — decrypt après liveQuery)
- `src/hooks/use-live-quotes.ts` (à modifier — decrypt après liveQuery)
- `src/hooks/use-live-company.ts` (à modifier — decrypt après liveQuery)
- `src/app/(app)/layout.tsx` (à modifier — CryptoProvider wrapping)
- `src/app/(auth)/login/page.tsx` (à modifier — initCrypto au login)
- `src/app/(auth)/reset-password/` (à modifier — purge + re-sync)
- `src/messages/fr-NE.json` (à modifier — clés toast)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/6-1-indexeddb-encryption-at-rest.md` (ce fichier)

### Change Log

- Story 6-1 créée : chiffrement IndexedDB au repos AES-GCM — seam LocalCrypto no-op → AES-GCM MVP-1 (Date: 2026-06-25)
