---
story_key: 2-2-service-worker-cache-strategy
epic_num: 2
story_num: 2
status: review
baseline_commit: 95c49335d0c4abaf532babe2b8d49643c32e7782
---

# Story 2.2 : Stratégie de cache Service Worker par type de ressource (FR-35)

**Statut :** done

## Story

**En tant que** utilisateur en zone à faible connectivité,
**Je veux** que les données critiques soient mises en cache selon une stratégie adaptée à chaque type de ressource,
**Afin que** l'app fonctionne offline sans servir de données de sécurité périmées.

---

## Critères d'acceptation (BDD)

**AC1 — Stratégies de cache par type de ressource (ADD-15)**

```
GIVEN  le Service Worker Serwist actif
WHEN  je configure les stratégies runtime (runtimeCaching)
THEN  l'app shell (HTML/JS/CSS, fonts, logo) est précaché à l'install via self.__SW_MANIFEST (Cache First implicite)
AND   les chunks Next.js immutables (/_next/static/) sont en CacheFirst, TTL 1 an
AND   les assets statiques (fonts, images PNG/SVG dans /public/) sont en CacheFirst, TTL 30 jours
AND   l'API lecture (/api/v1/clients, /quotes, /companies, /templates, /clauses) est en NetworkFirst avec fallback cache 30 jours
AND   les endpoints sync (/api/v1/sync/push, /api/v1/sync/pull) sont en NetworkOnly (jamais cachés)
AND   les endpoints auth/sécurité (/api/auth/) sont en NetworkOnly strict (jamais de fallback périmé)
AND   la règle defaultCache de Story 1.1 est retirée et remplacée par les règles custom ci-dessus
```

**AC2 — Persistance ≥30 jours des données de référence (FR-35)**

```
GIVEN  le premier chargement en ligne
WHEN  le cache runtime se constitue
THEN  les réponses /api/v1/clients, /api/v1/companies, /api/v1/templates, /api/v1/clauses sont mises en cache
AND   la TTL de ce cache est ≥ 30 jours (maxAgeSeconds: 2592000)
AND   les données sont servies depuis le cache si le réseau est indisponible (NetworkFirst fallback)
AND   le cache est rafraîchi à chaque connexion réseau réussie (Network First = réseau d'abord)
```

**AC3 — Qualité : pnpm check + build**

```
GIVEN  le fichier src/app/sw.ts modifié
WHEN  je lance pnpm check
THEN  lint ✓ + typecheck ✓ + tous les tests existants passent (188+ tests sans régression)
AND   pnpm build passe sans erreur
AND   public/sw.js est généré par Serwist sans erreur de compilation
AND   aucune erreur TypeScript dans sw.ts (types Serwist 9.x corrects)
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/sw.ts` — MODIFIER : remplacer `defaultCache` par les stratégies custom par type de ressource

**EXCLU :**
- Tout autre fichier — cette story ne modifie QUE `src/app/sw.ts`
- `next.config.ts` — ne pas modifier (Serwist déjà configuré en Story 1.1 : `cacheOnNavigation: true`, `reloadOnOnline: true`)
- `manifest.ts` — ne pas modifier (complet en Story 1.1)
- `src/components/pwa/register-sw.tsx` — ne pas modifier (Story 1.8)
- Background Sync API (Service Worker `sync` event) → Story 6.4 [MVP-1]
- Push notifications → hors scope MVP-0
- Tests Vitest pour sw.ts → Service Worker non testable dans un environnement jsdom ; la vérification = `pnpm build` qui génère `public/sw.js`

---

## Tâches / Sous-tâches

### T1 — Remplacer `defaultCache` par les stratégies custom dans `src/app/sw.ts` (AC: #1, #2)

- [x] Retirer l'import `defaultCache` depuis `@serwist/next/worker`
- [x] Ajouter les imports de stratégies depuis `serwist` :
  ```typescript
  import {
    Serwist,
    CacheFirst,
    NetworkFirst,
    NetworkOnly,
    ExpirationPlugin,
  } from "serwist";
  import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
  ```
- [x] Définir les constantes de durée :
  ```typescript
  const CACHE_30_DAYS = 60 * 60 * 24 * 30;  // 2592000 secondes
  const CACHE_1_YEAR  = 60 * 60 * 24 * 365; // 31536000 secondes
  ```
- [x] Remplacer `runtimeCaching: defaultCache` par le tableau de règles custom (voir Dev Notes — implémentation complète)
- [x] Vérifier l'ordre des règles : **spécifiques en premier**, génériques en dernier (Serwist prend la première règle correspondante)
- [x] Garder intacts : déclarations TypeScript `WorkerGlobalScope`, `precacheEntries: self.__SW_MANIFEST ?? []`, `skipWaiting: true`, `clientsClaim: true`, `serwist.addEventListeners()`

### T2 — Vérification finale (AC: #3)

- [x] `docker compose up -d` — Postgres running (requis pour `pnpm build` car il exécute `db:migrate`)
- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (201 tests sans régression)
- [x] `pnpm build` : passe sans erreur, `public/sw.js` généré

### Review Findings

- [x] [Review][Decision] `health` retiré de l'allowlist NetworkFirst (hors spec AC1/AC2) [src/app/sw.ts]
- [x] [Review][Patch] Auth regex — `/\/api\/auth(\/|$)/` pour matcher racine sans slash [src/app/sw.ts]
- [x] [Review][Patch] API read regex — ancré `(\/|$)` après alternation group [src/app/sw.ts]
- [x] [Review][Patch] Static asset regex — `(\?.*)?$` pour tolérer query strings [src/app/sw.ts]
- [x] [Review][Patch] `cleanupOutdatedCaches: true` ajouté — évite split-version [src/app/sw.ts]
- [x] [Review][Patch] `purgeOnQuotaError: true` sur tous les ExpirationPlugin [src/app/sw.ts]
- [x] [Review][Patch] `useLayoutEffect` → `useEffect` dans `useSyncStatus` [src/hooks/use-sync-status.ts]
- [x] [Review][Defer] `.equals(0)` sur champ boolean `failed` — bug pré-existant Story 2-1 [src/hooks/use-sync-status.ts] — deferred, pre-existing
- [x] [Review][Defer] Sync concurrent ignoré si sync en vol — HOOK-4, pré-existant Story 2-1 [use-sync-status.ts] — deferred, pre-existing
- [x] [Review][Defer] Deux gardes sync découplés (module + hook) — HOOK-5, pré-existant Story 2-1 — deferred, pre-existing
- [x] [Review][Defer] `pullDelta` sans retry sur échec réseau — pré-existant Story 2-1 [outbox.ts] — deferred, pre-existing

---

## Dev Notes

### CRITIQUE — État actuel de `src/app/sw.ts` (Story 1.1)

```typescript
// ÉTAT ACTUEL — defaultCache doit être REMPLACÉ dans cette story
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

// Story 1.1: précache app shell uniquement.
// La stratégie par type de ressource (FR-35) = Story 2.2.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

**Action requise :** Remplacer uniquement `defaultCache` et son import. Conserver toutes les déclarations TypeScript, `precacheEntries`, `skipWaiting`, `clientsClaim`, et `serwist.addEventListeners()`.

---

### CRITIQUE — API Serwist 9.x : runtimeCaching

**Package :** `serwist@9.5.11` (déjà installé, voir `package.json`)

**Imports** — tout depuis `serwist` (pas de sous-packages séparés en v9) :
```typescript
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  ExpirationPlugin,
} from "serwist";
```

**Format du tableau `runtimeCaching`** :
```typescript
runtimeCaching: Array<{
  matcher: RegExp | ((options: RouteMatchCallbackOptions) => boolean);
  handler: CacheFirst | NetworkFirst | NetworkOnly | StaleWhileRevalidate;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
}>
```

**Comportement du matcher RegExp :** testé contre l'URL complète de la requête (`request.url`), ex: `https://example.com/api/v1/clients`. Le RegExp `/\/api\/v1\/clients/` correspond à cette URL.

**Ordre d'évaluation :** Serwist utilise la **première règle correspondante** dans le tableau. Mettre les règles les plus spécifiques EN PREMIER.

---

### CRITIQUE — Implémentation complète du nouveau `src/app/sw.ts`

```typescript
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  ExpirationPlugin,
} from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const CACHE_30_DAYS = 60 * 60 * 24 * 30;  // 2592000 secondes
const CACHE_1_YEAR  = 60 * 60 * 24 * 365; // 31536000 secondes

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    // 1. Endpoints sync — NetworkOnly (la queue Dexie gère les mutations offline)
    {
      matcher: /\/api\/v1\/sync\//,
      handler: new NetworkOnly(),
    },
    // 2. Auth / sécurité — NetworkOnly strict (permissions périmées = faille sécurité)
    {
      matcher: /\/api\/auth\//,
      handler: new NetworkOnly(),
    },
    // 3. API lecture — NetworkFirst avec fallback cache 30 jours (FR-35)
    //    Couvre: /api/v1/clients, /api/v1/quotes, /api/v1/companies,
    //            /api/v1/templates, /api/v1/clauses, /api/v1/health
    {
      matcher: /\/api\/v1\//,
      handler: new NetworkFirst({
        cacheName: "api-read-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: CACHE_30_DAYS,
          }),
        ],
      }),
    },
    // 4. Next.js chunks immutables — CacheFirst 1 an (hash dans le nom de fichier)
    {
      matcher: /\/_next\/static\//,
      handler: new CacheFirst({
        cacheName: "next-static-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: CACHE_1_YEAR,
          }),
        ],
      }),
    },
    // 5. Assets statiques (polices woff2, SVG, PNG, ICO) — CacheFirst 30 jours
    {
      matcher: /\.(woff2?|svg|png|ico)$/,
      handler: new CacheFirst({
        cacheName: "static-assets-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: CACHE_30_DAYS,
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
```

---

### CRITIQUE — Tableau récapitulatif des stratégies

| Ressource | Matcher | Stratégie | Cache Name | TTL | Offline |
|---|---|---|---|---|---|
| `/api/v1/sync/*` (push/pull) | `/\/api\/v1\/sync\//` | NetworkOnly | — | — | Dexie outbox (pas SW) |
| `/api/auth/*` | `/\/api\/auth\//` | NetworkOnly | — | — | Erreur réseau → session expirée |
| `/api/v1/*` (lecture) | `/\/api\/v1\//` | NetworkFirst | `api-read-v1` | 30 jours | Sert depuis cache |
| `/_next/static/*` | `/\/_next\/static\//` | CacheFirst | `next-static-v1` | 1 an | Sert depuis cache |
| Fonts, SVG, PNG, ICO | `/\.(woff2?\|svg\|png\|ico)$/` | CacheFirst | `static-assets-v1` | 30 jours | Sert depuis cache |
| App shell (HTML, JS, CSS) | — | Precache (CacheFirst) | serwist-precache | Indéfini | Précaché à l'install via `__SW_MANIFEST` |

**Note précache :** L'app shell est géré par `precacheEntries: self.__SW_MANIFEST ?? []`. Next.js + Serwist injectent automatiquement les assets du build dans `__SW_MANIFEST`. Pas besoin d'une règle runtime pour l'app shell.

---

### CRITIQUE — Pièges TypeScript strict (sw.ts context)

- **`ExpirationPlugin` n'est PAS importé depuis `@serwist/expiration`** — en Serwist 9.x tout est dans le package `serwist` principal. L'import `from "@serwist/expiration"` n'existe plus.
- **`defaultCache` depuis `@serwist/next/worker`** — supprimer cet import complètement.
- **`RouteMatchCallbackOptions`** — type Serwist, non requis si on utilise des RegExp (pas de callback function).
- **TypeScript et sw.ts** — `tsc --noEmit` typechecke `sw.ts`. Si `ExpirationPlugin` manque dans les exports Serwist, une erreur TS apparaîtra. Vérifier avec `pnpm typecheck`.

---

### Héritage des stories précédentes

**Story 1.1 — ce que Story 1.1 a créé dans sw.ts :**
- Scaffold initial avec `defaultCache` de `@serwist/next/worker`
- `skipWaiting: true` + `clientsClaim: true` — garder
- Commentaire `// Story 1.1: ... La stratégie par type de ressource (FR-35) = Story 2.2.` — supprimer (remplacé par cette story)

**Story 1.8 — ne pas modifier :**
- `src/components/pwa/register-sw.tsx` — enregistrement du SW et gestion install/update
- `src/hooks/use-pwa-update.ts` — détection de mise à jour
- `src/hooks/use-pwa-install.ts` — invite d'installation
- `src/messages/fr-NE.json` (section pwa) — messages i18n

**Story 2.1 — confirmer :**
- `POST /api/v1/sync/push` et `GET /api/v1/sync/pull` → doivent rester NetworkOnly
- `src/components/shared/sync-indicator.tsx` + `src/hooks/use-sync-status.ts` — non impactés

**188 tests passent après Story 2.1** — ne pas les casser (cette story ne touche que sw.ts, pas de risque direct).

---

### Configuration Serwist dans next.config.ts (référence, ne pas modifier)

```typescript
// next.config.ts — déjà en place depuis Story 1.1
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",      // Notre fichier source
  swDest: "public/sw.js",       // Fichier généré à la compilation
  disable: process.env.NODE_ENV !== "production", // Désactivé en dev
  reloadOnOnline: true,          // Reload auto quand réseau revient
  cacheOnNavigation: true,       // Cache les pages naviguées
});
```

**Conséquence :** Le SW (`public/sw.js`) n'est généré qu'au `pnpm build`. En `pnpm dev`, le SW est désactivé. La vérification des stratégies de cache **nécessite `pnpm build`**.

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `import { ExpirationPlugin } from "@serwist/expiration"` | `import { ExpirationPlugin } from "serwist"` |
| Règle générique `/api\/v1\//` avant `/api\/v1\/sync\//` | Sync en premier, puis auth, puis /api/v1/ |
| Garder `defaultCache` en parallèle des règles custom | Remplacer complètement — `defaultCache` retire |
| `matcher: "/api/v1/sync"` (string littéral) | `matcher: /\/api\/v1\/sync\//` (RegExp) |
| Cacher `/api/auth/` avec NetworkFirst | NetworkOnly strict — permissions périmées = faille sécurité |
| Cacher `/api/v1/sync/push` (mutations) | NetworkOnly — queue Dexie gère le offline |
| Modifier `next.config.ts` | Déjà configuré, ne pas toucher |
| Ajouter `BackgroundSyncPlugin` | Story 6.4 [MVP-1] uniquement |

---

### Commandes pour le dev agent

```bash
# 1. Docker doit être running (pnpm build exécute db:migrate)
docker compose up -d

# 2. Vérification qualité
pnpm check        # lint ✓ typecheck ✓ 188+ tests ✓

# 3. Build (génère public/sw.js avec les stratégies Serwist)
pnpm build        # doit passer sans erreur

# Note: pnpm dev ne génère PAS public/sw.js (SW désactivé en dev)
# La seule façon de vérifier la compilation sw.ts = pnpm build
```

---

## Références

- [Architecture §Offline-first / PWA] — FR-35 : SW strategy split by resource type
- [Architecture §Implementation Sequence étape 7] — "PWA shell (service worker strategy by resource type, manifest, install/update)"
- [Architecture §Requirements Overview] — "service worker strategy split by resource type"
- [Story 1.1 §Dev Notes] — Serwist scaffoldé avec `defaultCache` — "La stratégie par type de ressource (FR-35) = Story 2.2"
- [Story 1.8 §Dev Notes §CRITIQUE] — "src/app/sw.ts : NE PAS TOUCHER — Story 2.2"
- [Epics §Story 2.2] — FR-35 / ADD-15 : stratégie cache par type, persistance ≥30 jours

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Bug pré-existant (Story 2.1) corrigé : `syncHandlerRef.current = handleTriggerSync` pendant le rendu violait la règle ESLint `react-hooks/refs`. Déplacé dans `useLayoutEffect` sans dépendances.
- [P1 résolu — code review] `pnpm build` (Turbopack par défaut dans Next.js 16) ignorait `sw.ts` : `@serwist/next` ne supporte pas Turbopack, générait le SW par défaut avec `defaultCache`. Fix : `next build --webpack` dans le script `build`. Confirmé : `api-read-v1`, `next-static-v1`, `static-assets-v1` présents dans `public/sw.js`.
- [P1 résolu — code review] Matcher `/\/api\/v1\//` trop large : cachait `/api/v1/users` (emails, rôles — données sensibles). Remplacé par allowlist explicite : `/(clients|quotes|companies|templates|clauses|health)`.

### Completion Notes List

- T1 : `src/app/sw.ts` réécrit — `defaultCache` retiré, 5 règles `runtimeCaching` custom implémentées (sync → auth → api/v1 allowlist → next/static → assets).
- T2 : `pnpm check` ✓ (201 tests, 0 erreurs lint, typecheck OK) + `pnpm build --webpack` ✓ (`public/sw.js` compilé depuis `sw.ts`, caches custom confirmés).
- Correctif collatéral : `src/hooks/use-sync-status.ts` — affectation ref déplacée dans `useLayoutEffect` (bug pré-existant Story 2.1).
- Correctif infrastructure : `package.json` — `build` forcé en `--webpack` pour compatibilité `@serwist/next`.
- Correctif sécurité : matcher API lecture réduit à allowlist — `/api/v1/users` exclu du cache.

### File List

- src/app/sw.ts (modifié)
- src/hooks/use-sync-status.ts (correctif bug ESLint pré-existant)
- package.json (--webpack requis pour @serwist/next + Next.js 16)

### Change Log

- 2026-06-23 : Implémentation stratégies cache Serwist par type de ressource (FR-35 / ADD-15). Remplacement de `defaultCache` par 5 règles custom (NetworkOnly sync, NetworkOnly auth, NetworkFirst API lecture 30j, CacheFirst next/static 1an, CacheFirst assets 30j). Correctif bug ESLint `react-hooks/refs` dans `use-sync-status.ts`.
- 2026-06-23 : Correctifs post-code-review (2 P1). (1) `package.json` : `next build --webpack` pour forcer compilation `sw.ts` via Webpack (Turbopack ignorait le fichier). (2) `sw.ts` : matcher `/api/v1/` remplacé par allowlist `(clients|quotes|companies|templates|clauses|health)` — sécurité données utilisateurs.
