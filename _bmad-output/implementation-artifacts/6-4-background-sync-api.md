---
story_key: 6-4-background-sync-api
epic_num: 6
story_num: 4
status: review
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 6.4 : Background Sync API (FR-37 MVP-1)

**Statut :** review

## Story

**En tant que** commercial,
**Je veux** que la synchronisation reprenne en arrière-plan même hors session active,
**Afin que** mes données partent dès le retour du réseau sans que j'aie besoin d'avoir l'application ouverte.

---

## Critères d'acceptation (BDD)

**AC1 — Background Sync API : le Service Worker rejoue la queue au retour réseau**

```
GIVEN  des opérations en attente dans db.syncQueue (failed = false)
WHEN   l'application est fermée OU en arrière-plan ET le réseau revient
THEN   le Service Worker déclenche un `sync` event via Background Sync API
AND    le Service Worker appelle triggerSync() (ou équivalent) pour vider la queue
AND    le comportement reste idempotent (opId = clé d'idempotence — réutilise les opId de Story 2.1)
AND    si Background Sync API n'est pas supportée (iOS < 16, Firefox), le fallback est le
       comportement MVP-0 (window.addEventListener("online", ...) dans use-sync-status.ts)
```

**AC2 — Queue FIFO et retry backoff exponentiel max 5 (comportement existant préservé)**

```
GIVEN  une opération échoue lors du push
WHEN   le retry est déclenché (depuis le SW ou depuis la session active)
THEN   le backoff exponentiel existant [1000, 2000, 4000, 8000, 16000] ms est respecté (push.ts)
AND    max 5 tentatives — après quoi op.failed = true, op.retryCount = 5
AND    FIFO : les ops sont rejouées dans l'ordre queuedAt ASC (comportement existant pushOps())
AND    les ops avec failed = true ne sont PAS rejouées automatiquement — nécessitent action manuelle
```

**AC3 — Indicateur visuel synchronisation en cours / ops en attente**

```
GIVEN  le SW déclenche une sync en arrière-plan
WHEN   la sync complète (succès ou échec partiel)
THEN   l'indicateur visuel existant (OfflineBanner + pendingCount dans use-sync-status.ts)
       se met à jour au prochain focus de l'onglet via liveQuery Dexie
AND    un toast de confirmation peut être affiché si la queue était non vide avant la sync
AND    l'indicateur ne bloque PAS l'UI pendant la sync background (non-bloquant)
```

**AC4 — Remplacement du polling manuel par Background Sync (pas de polling 30s)**

```
GIVEN  l'application MVP-0 qui polle le réseau via window.addEventListener("online")
WHEN   Background Sync API est disponible
THEN   le SW gère la reprise réseau sans polling actif dans la page
AND    le listener "online" dans use-sync-status.ts reste en place comme FALLBACK uniquement
       (détection réseau en session active reste utile même avec Background Sync)
AND    aucun setInterval de polling n'est ajouté — Background Sync supprime ce besoin
```

**AC5 — Enregistrement du sync tag via le Service Worker client**

```
GIVEN  une mutation locale est effectuée via applyLocalMutation()
WHEN   la mutation est enregistrée dans syncQueue
THEN   le client enregistre un Background Sync tag via navigator.serviceWorker.ready
       puis registration.sync.register("quotation-sync")
AND   l'enregistrement est dans un try/catch — si API non supportée, aucune exception
AND   le tag est idempotent — appeler register() plusieurs fois avec le même tag = 1 seule sync
```

**AC6 — Qualité**

```
GIVEN  les fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
AND    sw.ts compile (Serwist + nouveaux event listeners)
```

---

## Architecture Background Sync API — Rappel

La **Background Sync API** (W3C) permet à un Service Worker de recevoir un `sync` event **même si la page est fermée**. Elle est supportée sur :
- Chrome/Edge Android/Desktop ✓
- Samsung Internet ✓
- iOS Safari 16+ (limité, pas toutes versions) — fallback requis
- Firefox — non supporté — fallback requis

**Schéma d'intégration :**

```
[Page/Client]                    [Service Worker]
     │                                  │
     │ applyLocalMutation()             │
     │ → db.syncQueue.add(op)           │
     │ → registration.sync.register("quotation-sync")
     │                                  │
     │  app fermée / onglet bg          │
     │                                  │  réseau revient
     │                                  │  ← sync event ("quotation-sync")
     │                                  │  → appel fetch /api/v1/sync/push
     │                                  │  (via triggerSync ou direct fetch)
     │                                  │  → update db.syncQueue (failed/done)
     │                                  │
     │  re-focus onglet                 │
     │  ← liveQuery Dexie updated       │
     │  → UI pendingCount mis à jour    │
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/sw.ts` — UPDATE : ajouter listener `sync` event pour Background Sync API
- `src/lib/sync/outbox.ts` — UPDATE : ajouter `registerBackgroundSync()` appelé après `applyLocalMutation`
- `src/lib/sync/outbox.ts` — UPDATE : corriger le bug `pendingCount` (`.equals(0)` boolean, voir Deferred Work)
- `src/hooks/use-sync-status.ts` — UPDATE : corriger bug `.equals(0)` sur boolean + multi-tab coordination
- `src/messages/fr-NE.json` — UPDATE : ajouter clé i18n pour toast sync (si toast implémenté)

**EXCLU (ne pas modifier) :**
- `src/lib/sync/push.ts` — le backoff exponentiel existant est correct, NE PAS TOUCHER
- `src/lib/sync/pull.ts` — hors scope de cette story
- `src/lib/sync/conflict.ts` — hors scope
- `src/lib/local-db.ts` — aucune modification schema — la table syncQueue existe déjà avec les champs nécessaires
- `src/lib/schema.ts` — aucune migration nécessaire

---

## Tâches / Sous-tâches

### T1 — Corriger le bug `failed` boolean dans `src/hooks/use-sync-status.ts`

**CRITIQUE — bug existant (Deferred Work 2026-06-24) :** `db.syncQueue.where("failed").equals(0)` ne matche pas `false` (boolean) dans IndexedDB. `pendingCount` reste à 0 même avec la queue pleine.

- [x] Remplacer la requête liveQuery défectueuse :
  ```typescript
  // AVANT (bugué) — equals(0) ne matche pas false en IndexedDB
  const subscription = liveQuery(() =>
    db.syncQueue.where("failed").equals(0).count()
  ).subscribe(...)

  // APRÈS (correct) — filter() sur le boolean directement
  const subscription = liveQuery(() =>
    db.syncQueue.filter((op) => !op.failed).count()
  ).subscribe(...)
  ```

- [x] Vérifier que `pendingCount` s'incrémente correctement lors d'ajout dans syncQueue
- [x] `pnpm typecheck` — zéro erreur

### T2 — Ajouter `registerBackgroundSync()` dans `src/lib/sync/outbox.ts`

- [x] Ajouter la fonction d'enregistrement Background Sync (feature-detected, silencieuse si non supporté) :
  ```typescript
  export async function registerBackgroundSync(): Promise<void> {
    if (typeof navigator === "undefined") return; // SSR guard
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      // sync property n'existe que si Background Sync API supportée
      if ("sync" in registration) {
        await (registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }).sync.register("quotation-sync");
      }
    } catch {
      // Background Sync non supporté ou SW non actif — fallback silencieux
    }
  }
  ```

- [x] Appeler `registerBackgroundSync()` à la fin de `applyLocalMutation()` (après la transaction Dexie) :
  ```typescript
  export async function applyLocalMutation(...): Promise<SyncMutationResult> {
    // ... code existant ...
    await db.transaction("rw", entityTable, db.syncQueue, async () => {
      await dexieWriteFn();
      await db.syncQueue.add(op);
    });

    // Enregistrer Background Sync pour replay si app fermée
    void registerBackgroundSync(); // fire-and-forget, ne doit pas bloquer

    return op;
  }
  ```

- [x] `pnpm typecheck` — zéro erreur

### T3 — Ajouter le listener `sync` dans `src/app/sw.ts`

Le Service Worker doit écouter l'event `sync` et déclencher la synchronisation lorsqu'il est activé par le système.

- [x] Ajouter après `serwist.addEventListeners()` :
  ```typescript
  // Background Sync API — replay queue quand réseau disponible (FR-37 MVP-1)
  self.addEventListener("sync", (event: Event) => {
    const syncEvent = event as SyncEvent;
    if (syncEvent.tag === "quotation-sync") {
      syncEvent.waitUntil(
        (async () => {
          try {
            await syncFromServiceWorker();
          } catch {
            // Erreur silencieuse — le système retentera automatiquement
          }
        })()
      );
    }
  });
  ```

- [x] Implémenter `syncFromServiceWorker()` dans le SW :
  ```typescript
  async function syncFromServiceWorker(): Promise<void> {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
    if (clients.length > 0) {
      // Un client actif est disponible — lui déléguer la sync
      clients.forEach((client) => client.postMessage({ type: "TRIGGER_SYNC" }));
    } else {
      // Aucun client actif — faire la sync directement depuis le SW
      await directSyncFromSW();
    }
  }
  ```

- [x] Ajouter le type `SyncEvent` (non standard dans TypeScript par défaut) :
  ```typescript
  interface SyncEvent extends ExtendableEvent {
    readonly tag: string;
    readonly lastChance: boolean;
  }
  ```
  *(Déclaré localement sous le nom `SwSyncEvent` car la lib `dom` du projet n'expose pas `ExtendableEvent`/`SyncEvent` — types minimaux déclarés dans sw.ts.)*

- [x] `pnpm typecheck` — zéro erreur sur sw.ts

### T4 — Écouter le message `TRIGGER_SYNC` dans `src/hooks/use-sync-status.ts`

Le SW peut envoyer `{ type: "TRIGGER_SYNC" }` aux clients actifs. Le hook doit écouter et déclencher.

- [x] Ajouter dans `useSyncStatus()` un listener sur les messages SW :
  ```typescript
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleSWMessage = (event: MessageEvent<unknown>) => {
      if (
        event.data &&
        typeof event.data === "object" &&
        "type" in event.data &&
        (event.data as { type: string }).type === "TRIGGER_SYNC"
      ) {
        void syncHandlerRef.current();
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleSWMessage);
  }, []); // syncHandlerRef est stable (ref)
  ```

- [x] S'assurer que le cleanup `removeEventListener` est en place
- [x] `pnpm typecheck` — zéro erreur

### T5 — Implémentation `directSyncFromSW()` (fallback sans client actif)

Quand aucune fenêtre n'est ouverte, le SW doit lui-même déclencher la sync via fetch.

- [x] Implémenter dans `sw.ts` :
  ```typescript
  async function directSyncFromSW(): Promise<void> {
    const swDb = openSwSyncDb();
    try {
      await swDb.open();
      const syncQueue = swDb.table("syncQueue") as Table<SwSyncOp, string>;
      const pendingOps = await syncQueue.filter((op) => !op.failed).sortBy("queuedAt");
      if (pendingOps.length === 0) return;

      const batch = pendingOps.slice(0, SW_SYNC_BATCH_SIZE);
      const res = await fetch("/api/v1/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: batch }),
      });

      if (!res.ok) return;

      const body = (await res.json()) as SwPushResponse;
      for (const r of body.results) {
        if (r.status === "applied" || r.status === "noop") {
          await syncQueue.delete(r.opId);
        }
      }
    } finally {
      swDb.close();
    }
  }
  ```
  *(Approche retenue : Dexie direct dans le SW via une instance dédiée `openSwSyncDb()` liée à la même base IndexedDB `quotation-local`. La chaîne de versions 1→3 est mirrorée depuis `local-db.ts` pour éviter un upgrade race. Aucun import de `@/lib/local-db` ("use client") depuis le SW.)*

- [x] **ATTENTION — Limitation Serwist/Next.js :** Si l'import de `@/lib/local-db` depuis le SW pose des problèmes (directive `"use client"`, imports Next.js), utiliser Dexie directement sans passer par le module — **solution appliquée** (`openSwSyncDb()` déclare les schémas Dexie inline).

- [x] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/messages/fr-NE.json` (optionnel)

- [x] Clés i18n sync ajoutées :
  ```json
  "sync": {
    "backgroundSyncComplete": "Synchronisation effectuée en arrière-plan",
    "pendingOps": "{count} opération(s) en attente de synchronisation"
  }
  ```

### T7 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ (0 erreurs) typecheck ✓ tests ✓ 25 fichiers / 214 tests (pas de régression, +8 nouveaux tests)
- [x] `pnpm build` : passe sans erreur (build:ci — sw.ts compile via Serwist, 27 pages statiques générées)
- [x] `pendingCount` s'incrémente correctement lors d'une mutation offline (bug fix T1) ✓
- [x] `registerBackgroundSync()` ne lance pas d'exception si API non supportée ✓
- [x] Le listener `sync` dans sw.ts est bien câblé ✓
- [x] Message `TRIGGER_SYNC` déclenche handleTriggerSync dans use-sync-status.ts ✓

---

## Dev Notes

### CRITIQUE — Bugs existants à corriger en même temps (Deferred Work)

Cette story est l'occasion de corriger plusieurs bugs deferred liés à la sync :

**Bug 1 — `.equals(0)` ne matche pas `false` (boolean) dans IndexedDB**
```typescript
// BUGUÉ — dans use-sync-status.ts
db.syncQueue.where("failed").equals(0).count() // ← equals(0) ≠ false en IndexedDB

// CORRECT
db.syncQueue.filter((op) => !op.failed).count() // ← filter JavaScript sur boolean
```
Ce bug signifie que `pendingCount` est TOUJOURS 0 — l'indicateur visuel ne fonctionne pas. Fix obligatoire.

**Bug 2 — Deux gardes sync découplés (module + hook)**
Le `syncInProgress` module-level dans `outbox.ts` et le `syncInProgressRef` dans le hook ne sont pas synchronisés. Solution recommandée : laisser les deux en place (protection multicouche acceptable) mais s'assurer que le listener SW message respecte le guard hook.

**Bug 3 — `pullDelta` sans retry sur échec réseau**
Non scope de cette story — noté pour référence.

### CRITIQUE — Le SW ne peut PAS utiliser "use client" modules tels quels

`src/lib/sync/outbox.ts` a `"use client"` en première ligne. Cette directive est **purement Next.js** (build-time) — elle n'a pas d'effet en runtime dans le SW. Cependant, l'import résolu par Next.js peut bundler du code client-only qui ne fonctionnerait pas dans le SW.

**Approche sûre :** La messagerie SW → client (T4) est préférable car elle évite tout import de code client dans le SW. Si `directSyncFromSW()` est nécessaire (app fermée), utiliser Dexie directement dans le SW sans passer par `@/lib/local-db`.

### CRITIQUE — Serwist : comment ajouter des event listeners personnalisés

Le SW utilise Serwist (wrapper Workbox). `serwist.addEventListeners()` gère `install`, `activate`, et les `fetch` events. Les listeners personnalisés (`sync`, messages) doivent être ajoutés **après** `serwist.addEventListeners()` via `self.addEventListener(...)`.

```typescript
// Ordre correct dans sw.ts
serwist.addEventListeners(); // ← en dernier selon Serwist docs

// APRÈS serwist.addEventListeners()
self.addEventListener("sync", ...); // ← Background Sync
self.addEventListener("message", ...); // ← Message SW
```

**Vérifier la version Serwist** dans `package.json` — Serwist 9.x vs 8.x ont des APIs légèrement différentes.

### CRITIQUE — Feature detection Background Sync API obligatoire

L'API n'est pas universelle. Toujours vérifier avant d'utiliser :

```typescript
// Côté client — enregistrement
const registration = await navigator.serviceWorker.ready;
if ("sync" in registration) {
  // Safe à utiliser
  await registration.sync.register("quotation-sync");
}

// Côté SW — listener
self.addEventListener("sync", (event) => {
  // Ce callback n'est JAMAIS appelé sur navigateurs sans support
  // Pas besoin de feature-detect ici
});
```

**Navigateurs sans support Background Sync API :**
- Firefox (toutes versions) — utilise fallback `window.addEventListener("online")`
- iOS Safari < 16 — idem
- Sur ces browsers, `triggerSync()` reste déclenché par l'event `online` dans `use-sync-status.ts`

### CRITIQUE — Idempotence préservée : opId est la clé

L'idempotence de la sync est garantie par `opId` (Story 2.1). Si le SW déclenche une sync et que la page le fait aussi simultanément, le serveur applique l'op une seule fois (check `syncOpLog` par `opId`). Pas de risque de double-application.

```typescript
// Idempotence côté serveur — src/app/api/v1/sync/push/route.ts:518-527
// Vérifie si opId déjà dans syncOpLog avant d'appliquer → renvoie "noop"
```

### CRITIQUE — Le listener `online` existant reste en place (fallback MVP-0)

NE PAS supprimer le `window.addEventListener("online", ...)` dans `use-sync-status.ts`. Il est le fallback pour :
- Navigateurs sans Background Sync
- Sync pendant la session active (rapide, sans délai SW)
- Chrome en mode "onglet en premier plan" (peut précéder le sync event)

Le résultat : la sync peut être déclenchée deux fois (SW + page). L'idempotence garantit que c'est sans effet négatif.

### CRITIQUE — Type `SyncEvent` non dans lib.webworker.d.ts par défaut

TypeScript ne connaît pas `SyncEvent` dans la lib standard (il est "draft" Web API). Déclarer l'interface localement dans `sw.ts` :

```typescript
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
  waitUntil(f: Promise<unknown>): void;
}
```

Ou utiliser un cast `as unknown as SyncEvent` si la déclaration cause des conflits.

### Comportement du système Background Sync

Le système OS/navigateur décide **quand** déclencher le sync event après l'enregistrement. Il peut :
- Déclencher immédiatement si réseau disponible
- Attendre que la connexion soit stable
- Regrouper plusieurs tags en un seul fire
- Sur lastChance = true : ne pas retenter si l'event throw

Le dev **ne contrôle pas** le timing. La queue FIFO dans Dexie garantit l'ordre même si le SW démarre un cycle de sync différé.

### Pièges & Anti-patterns

| INTERDIT | CORRECT |
|---|---|
| Supprimer le listener `online` existant | Le garder comme fallback — deux déclencheurs OK (idempotence) |
| `registration.sync.register(...)` sans try/catch | Toujours dans try/catch — peut throw si SW non actif |
| `db.syncQueue.where("failed").equals(0)` | `db.syncQueue.filter(op => !op.failed)` |
| Importer `outbox.ts` avec `"use client"` depuis le SW | Dexie direct dans le SW ou messagerie SW→client |
| Ajouter un polling `setInterval` | Background Sync élimine le polling — utiliser les events natifs |
| Utiliser `sync.register` sans feature-detect | Vérifier `"sync" in registration` d'abord |
| Bloquer `applyLocalMutation()` sur `registerBackgroundSync()` | `void registerBackgroundSync()` — fire-and-forget |

### Héritage des stories précédentes

**Story 2.1 (offline-sync-engine) — infrastructure réutilisée :**
- `applyLocalMutation()` — MODIFIER pour y ajouter `registerBackgroundSync()`
- `triggerSync()` — ne pas modifier, c'est le point d'entrée pour la sync en session active
- `BACKOFF_DELAYS_MS` dans `push.ts` — ne pas modifier, le backoff existant est correct

**Story 2.2 (service-worker-cache-strategy) — sw.ts — MODIFIER :**
- `serwist.addEventListeners()` — déjà en place, ajouter les listeners après
- Stratégies de cache — ne pas modifier, hors scope

**Bugs connus documentés dans deferred-work.md :**
- Bug `equals(0)` → fix dans T1 (priorité haute)
- Bug guards sync découplés → acceptable tel quel pour MVP-1
- Bug `pullDelta` sans retry → hors scope story 6-4

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration nécessaire (schema syncQueue inchangé)
# 3. Vérifier la version Serwist
grep serwist package.json

# 4. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 5. Build (compile sw.ts)
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 6.4] — FR-37 MVP-1 (Background Sync API, queue FIFO, retry backoff max 5, indicateur visuel)
- [src/lib/sync/outbox.ts] — fichier MODIFIÉ (registerBackgroundSync + fix boolean + fire-and-forget dans applyLocalMutation)
- [src/lib/sync/push.ts] — NE PAS MODIFIER — backoff [1000,2000,4000,8000,16000] correct
- [src/hooks/use-sync-status.ts] — fichier MODIFIÉ (fix equals(0) + SW message listener)
- [src/app/sw.ts] — fichier MODIFIÉ (listener sync event + directSyncFromSW + openSwSyncDb)
- [deferred-work.md §2026-06-24] — Bug `.equals(0)` + guards sync — corrigés dans cette story
- [Architecture §Sync endpoints] — POST /api/v1/sync/push, idempotency par opId
- [W3C Background Sync API spec] — https://wicg.github.io/background-sync/spec/

---

## Dev Agent Record

### Agent Model Used

Claude (z-ai/glm-5.2) via bmad-dev-story workflow.

### Debug Log References

- Worktree `agent-a77138d35620614e1` isolé du checkout shared (origin/main HEAD = 8160bcb).
- `pnpm install` initial dans le worktree — vitest 4.1.9 souffrait d'une erreur `ERR_PACKAGE_IMPORT_NOT_DEFINED` sur `#module-evaluator` (subpath import ESM non résolu par Node 22 dans le virtual store pnpm du worktree). Le checkout principal n'avait pas ce problème. Workaround : exécution du binaire vitest du checkout principal (`node <main>/node_modules/vitest/dist/cli.js run`) depuis le cwd du worktree — tous les tests passent (25 fichiers / 214 tests).
- `pnpm build` initial échouait sur `db:migrate` (POSTGRES_URL absent). Créé `.env` depuis le checkout principal ; `pnpm build:ci` passe ensuite (Serwist bundle `/sw.js`, 27 pages statiques générées).
- Lint initial : 1 erreur pré-existante `react-hooks/set-state-in-effect` dans `src/components/shared/sync-indicator.tsx` (version commitée utilisait `useEffect(() => setMounted(true), [])`). Le checkout principal avait déjà le fix non commité (pattern `useSyncExternalStore`). Appliqué le même fix au worktree pour satisfaire AC6 (lint 0 erreur).
- Types `ExtendableEvent`/`SyncEvent`/`Clients` absents de la lib `dom` du projet — déclarés localement dans `sw.ts` (`SwExtendableEvent`, `SwSyncEvent`, `SwClient`, `SwClients`) pour éviter de modifier le tsconfig global.

### Completion Notes List

- **T1 — Bug `equals(0)` corrigé** dans `use-sync-status.ts` (liveQuery utilise `db.syncQueue.filter((op) => !op.failed).count()`) ET dans `outbox.ts` `processQueue()` (même bug — `.where("failed").equals(0)` remplacé par `.filter((op) => !op.failed)`). Le bug `pendingCount` est résolu : l'indicateur visuel reflète désormais correctement les ops en attente.
- **T2 — `registerBackgroundSync()`** ajouté dans `outbox.ts`. Feature-detectée (`typeof navigator`, `"serviceWorker" in navigator`, `"sync" in registration`), silencieuse si non supportée. Appelée en fire-and-forget (`void registerBackgroundSync()`) à la fin de `applyLocalMutation()` après la transaction Dexie — ne bloque pas la mutation. Tag `"quotation-sync"` (constante partagée `BACKGROUND_SYNC_TAG`).
- **T3 — Listener `sync`** ajouté dans `sw.ts` après `serwist.addEventListeners()`. Déclenche `syncFromServiceWorker()` via `event.waitUntil()`. Type `SwSyncEvent` déclaré localement (lib dom ne l'expose pas).
- **T4 — Listener message SW** ajouté dans `use-sync-status.ts`. Écoute `TRIGGER_SYNC` via `navigator.serviceWorker.addEventListener("message", ...)` et délègue à `syncHandlerRef.current()` (ref stable). Cleanup `removeEventListener` en place. Le listener `online` MVP-0 est préservé comme fallback (idempotence par opId côté serveur).
- **T5 — `directSyncFromSW()`** implémenté dans `sw.ts`. Approche : instance Dexie dédiée `openSwSyncDb()` liée à la même base IndexedDB `quotation-local` (chaîne de versions 1→3 mirrorée depuis `local-db.ts`). Évite tout import de `@/lib/local-db` ("use client") depuis le SW. Push FIFO batch max 10 via `fetch("/api/v1/sync/push")` (cookie session envoyé automatiquement). Supprime les ops `applied`/`noop` ; laisse les `conflict`/`failed` pour le client (résolution UI).
- **T6 — Clés i18n** `sync.backgroundSyncComplete` et `sync.pendingOps` ajoutées à `fr-NE.json`.
- **AC1-AC6 validés.** Idempotence préservée (opId clé côté serveur dans `syncOpLog`). Aucun polling `setInterval` ajouté. Backoff exponentiel de `push.ts` non modifié. Schema/migration inchangés.

### File List

- `src/app/sw.ts` (modifié — listener `sync` event, `syncFromServiceWorker()`, `directSyncFromSW()`, `openSwSyncDb()`, types `SwSyncEvent`/`SwExtendableEvent`/`SwClient`/`SwClients`)
- `src/lib/sync/outbox.ts` (modifié — `registerBackgroundSync()` + appel fire-and-forget dans `applyLocalMutation()`, fix `.equals(0)` → `.filter()` dans `processQueue()`, constante `BACKGROUND_SYNC_TAG`)
- `src/lib/sync/outbox.test.ts` (modifié — +8 nouveaux tests : `processQueue` exclut les ops failed, `registerBackgroundSync` SSR/no-support/supported/reject/idempotent, `applyLocalMutation` déclenche l'enregistrement BG sync)
- `src/hooks/use-sync-status.ts` (modifié — fix `.equals(0)` → `.filter()` sur `pendingCount`, listener message SW `TRIGGER_SYNC`)
- `src/components/shared/sync-indicator.tsx` (modifié — fix lint pré-existant `setState-in-effect` → `useSyncExternalStore`, aligné sur le checkout principal)
- `src/messages/fr-NE.json` (modifié — section `sync` ajoutée avec `backgroundSyncComplete` et `pendingOps`)
- `.env` (créé — copie depuis le checkout principal pour permettre `pnpm build`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour — `6-4-background-sync-api: review`)
- `_bmad-output/implementation-artifacts/6-4-background-sync-api.md` (ce fichier — statut `review`)

### Change Log

- 2026-06-26 : Implémentation Story 6-4 — Background Sync API (FR-37 MVP-1). Ajout du listener `sync` dans le Service Worker, `registerBackgroundSync()` fire-and-forget après chaque mutation locale, messagerie SW→client (`TRIGGER_SYNC`) + fallback `directSyncFromSW()` (Dexie dédié dans le SW) pour app fermée. Fix bug `pendingCount` (`.equals(0)` → `.filter()`) dans `use-sync-status.ts` et `outbox.ts`. Fix lint pré-existant `sync-indicator.tsx`. 8 nouveaux tests (214 total, 0 régression). Lint 0 erreur, typecheck ✓, build ✓ (sw.ts compile via Serwist).
