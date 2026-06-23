---
story_key: 1-2-shared-business-foundations
epic_num: 1
story_num: 2
status: done
baseline_commit: c2da5be45de5dc1795c6fbc33c8e6e5f29995aa2
---

# Story 1.2 : Fondations mÃ©tier partagÃ©es

**Statut :** done

## Story

**En tant que** dÃ©veloppeur de l'Ã©quipe Maiga Tech Lab,
**Je veux** les primitives mÃ©tier pures (`money.ts`, `calc/`, `permissions.ts`, schÃ©mas Zod, enveloppe API, audit) avec leurs tests unitaires,
**Afin que** toutes les features rÃ©utilisent des calculs corrects, testÃ©s et autoritatifs cÃ´tÃ© serveur, sans jamais dupliquer ces formules.

---

## CritÃ¨res d'acceptation (BDD)

**AC1 â€” `money.ts` : FCFA entier, formatage et arrondi financier (ADD-4)**

```
GIVEN  XOF sans sous-unitÃ© (currency sans dÃ©cimale)
WHEN   j'implÃ©mente src/lib/money.ts
THEN   les montants sont des entiers bigint|number (jamais float)
AND    formatFcfa(n) retourne une chaÃ®ne via Intl.NumberFormat('fr-FR', { style:'currency', currency:'XOF', minimumFractionDigits:0, maximumFractionDigits:0 })
AND    roundFcfa(n) arrondit Ã  l'entier FCFA le plus proche (arrondi financier "half-up")
AND    toFcfa(amount, rate) convertit devise source â†’ entier FCFA via multiplication + arrondi
AND    toFcfa(amount, 1) = roundFcfa(amount) (FCFA â†’ FCFA, pas de conversion)
AND    aucune arithmÃ©tique flottante intermÃ©diaire n'est exposÃ©e dans les types retournÃ©s
AND    les tests unitaires Vitest couvrent : formatage fr-FR, arrondi half-up, conversion avec taux, edge cases (0, MAX_SAFE_INTEGER)
```

**AC2 â€” `lib/calc/` : moteur dÃ©terministe pur (ADD-5, FR-19, FR-20, FR-23)**

```
GIVEN  les formules mÃ©tier du PRD
WHEN   j'implÃ©mente src/lib/calc/camions.ts, valeur.ts, totaux.ts
THEN   computeCamions(tonnage, capacity) = Math.ceil(tonnage / capacity)
AND    les bornes MIN_TONNAGE=0.1, MAX_TONNAGE=10000, MIN_CAPACITY=1, MAX_CAPACITY=100 sont appliquÃ©es
AND    capacity=0 lance une erreur CalcError (jamais NaN/Infinity)
AND    computeValeurMarchandise(quantity, unitPrice, exchangeRate) = roundFcfa(quantity * unitPrice * exchangeRate)
AND    les bornes MIN_PRICE=0, MAX_PRICE=1e10, MIN_RATE=0.001, rate<0 lance une CalcError
AND    computeLineTotal(unitPrice, qty) = unitPrice * qty (entier FCFA)
AND    computeQuoteTotal(lines: { totalFcfa: number }[]) = somme de tous les totalFcfa
AND    toutes les fonctions sont pures (pas d'I/O, pas d'Ã©tat) et exportÃ©es comme fonctions nommÃ©es
AND    les tests couvrent : cas nominaux, bornes exactes, division par zÃ©ro, inputs invalides
```

**AC3 â€” `lib/permissions.ts` : matrice RBAC ownership-based (ADD-6, FR-3)**

```
GIVEN  les trois rÃ´les Admin / Commercial / OpÃ©rateur
WHEN   j'implÃ©mente src/lib/permissions.ts
THEN   can(role, action) retourne boolean sans effet de bord (UI gating)
AND    requirePermission(userRole, action, ownerId?, currentUserId?) lance PermissionError (HTTP 403) si non autorisÃ©
AND    la matrice encode : Admin = tout, Commercial = crÃ©er/modifier/lire ses propres devis+clients, OpÃ©rateur = lecture seule
AND    le modÃ¨le ownership : Commercial peut lire tout, mais update/delete uniquement sur ses propres ressources (ownerId === currentUserId)
AND    Admin override tous droits (pas de restriction ownership)
AND    les tests couvrent chaque cellule de la matrice (18+ cas)
```

**AC4 â€” Enveloppe API + audit (ADD-10, ADD-11)**

```
GIVEN  les conventions d'architecture
WHEN   j'implÃ©mente src/lib/api/envelope.ts et src/lib/audit.ts
THEN   successResponse(data) retourne { ...data } (ressource directe, pas de wrapper)
AND    errorResponse(code, message, fields?) retourne { error: { code, message, fields? } }
AND    apiError(code, message, status) retourne un NextResponse avec le bon statut HTTP
AND    AuditEvent = { who, what, when (ISO UTC), where, entity: { type, id }, before?, after? }
AND    emitAuditEvent(event) accepte l'event (storage rÃ©el en Story 1.3 via Drizzle â€” stubber avec console.log pour l'instant)
AND    le mapper snake_caseâ†”camelCase (src/lib/api/mapper.ts) est en place : toApiCase(obj), toDbCase(obj)
```

**AC5 â€” SchÃ©mas Zod partagÃ©s (ADD-3)**

```
GIVEN  la nÃ©cessitÃ© de valider identiquement cÃ´tÃ© client et serveur
WHEN   je dÃ©finis src/lib/validation/{quote,client,company,clause}.ts
THEN   chaque module exporte un schema Zod (z.object) pour l'entitÃ© correspondante
AND    les champs obligatoires (nom sociÃ©tÃ© + tÃ©lÃ©phone pour client, etc.) sont marquÃ©s .min(1) ou similaire
AND    les schemas sont importables cÃ´tÃ© client et cÃ´tÃ© serveur sans import de modules node
AND    les types TypeScript sont infÃ©rÃ©s via z.infer<typeof schema> et exportÃ©s
```

**AC6 â€” `lib/country-config.ts` (ADD-12, NFR-I4)**

```
GIVEN  l'exigence i18n multi-pays v2
WHEN   j'implÃ©mente src/lib/country-config.ts
THEN   COUNTRY_CONFIGS est un record keyed par code pays ('NE', 'ML', 'BF')
AND    chaque config inclut : locale, currency, dateFormat, countryName, majorCities[]
AND    getCountryConfig(code) retourne la config ou throw pour code inconnu
AND    getActiveConfig() retourne la config 'NE' (unique en MVP-0)
```

**AC7 â€” `pnpm check` et `pnpm test` passent**

```
GIVEN  tous les nouveaux fichiers crÃ©Ã©s
WHEN   je lance pnpm check
THEN   pnpm lint && pnpm typecheck && pnpm test rÃ©ussissent sans erreur
AND    tous les tests unitaires des modules (money, calc, permissions) passent
```

---

## PÃ©rimÃ¨tre de cette story

**INCLUS (ADD-3, ADD-4, ADD-5, ADD-6, ADD-10, ADD-11, ADD-12) :**
- `src/lib/money.ts` + `src/lib/money.test.ts`
- `src/lib/calc/camions.ts`, `valeur.ts`, `totaux.ts`, `index.ts` + `.test.ts` co-localisÃ©s
- `src/lib/permissions.ts` + `src/lib/permissions.test.ts`
- `src/lib/audit.ts` (type + stub â€” stockage rÃ©el en Story 1.3)
- `src/lib/api/envelope.ts` + `src/lib/api/mapper.ts`
- `src/lib/validation/quote.ts`, `client.ts`, `company.ts`, `clause.ts`
- `src/lib/country-config.ts`

**EXCLU (autres stories) :**
- Le store Dexie (`local-db.ts`) â†’ **Story 1.3**
- Le schÃ©ma Drizzle domaine (tables `quote`, `client`, etc.) â†’ **Story 1.3**
- Le seam `LocalCrypto` â†’ **Story 1.3**
- La connexion utilisateur â†’ **Story 1.4**
- Le shell applicatif â†’ **Story 1.5**
- Le wiring RBAC sur les vraies sessions Better Auth â†’ **Story 1.6**
- Le moteur de sync (outbox, push/pull) â†’ **Story 2.1**

---

## TÃ¢ches / Sous-tÃ¢ches

### T1 â€” `src/lib/country-config.ts` (ADD-12)

- [x] CrÃ©er le fichier avec `CountryConfig` interface et `COUNTRY_CONFIGS` constant
- [x] Exporter `getCountryConfig(code: string)` et `getActiveConfig()`
- [x] Configs MVP : `NE` (fr-NE, XOF, Niamey...), stubs `ML` / `BF` pour v2

### T2 â€” `src/lib/money.ts` + tests (ADD-4)

- [x] Exporter `formatFcfa(n: number): string` via `Intl.NumberFormat('fr-FR', { style:'currency', currency:'XOF', maximumFractionDigits:0 })`
- [x] Exporter `roundFcfa(n: number): number` â€” arrondi half-up `Math.round()`
- [x] Exporter `toFcfa(amount: number, exchangeRate: number): number` â€” `roundFcfa(amount * exchangeRate)`
- [x] Exporter constantes : `MAX_MONETARY_VALUE = 1e13`, `MIN_MONETARY_VALUE = 0`
- [x] CrÃ©er `src/lib/money.test.ts` : â‰¥10 tests (formatage sÃ©parateur milliers fr-FR, arrondi .5 â†’ entier supÃ©rieur, taux de change, zero, valeurs nÃ©gatives rejetÃ©es par les calcs)

### T3 â€” `src/lib/calc/` + tests (ADD-5)

- [x] CrÃ©er `src/lib/calc/camions.ts` : exporter `computeCamions(tonnage: number, capacity: number): number` avec bornes + guard division-zÃ©ro
- [x] CrÃ©er `src/lib/calc/valeur.ts` : exporter `computeValeurMarchandise(quantity: number, unitPrice: number, exchangeRate: number): number`
- [x] CrÃ©er `src/lib/calc/totaux.ts` : exporter `computeLineTotal(unitPrice: number, qty: number): number` et `computeQuoteTotal(lines: { totalFcfa: number }[]): number`
- [x] CrÃ©er `src/lib/calc/index.ts` : re-exporte tout + exporte `CalcError` class (via `error.ts` pour Ã©viter circulaire)
- [x] CrÃ©er `.test.ts` co-localisÃ© pour chaque module (â‰¥8 cas par fichier)

### T4 â€” `src/lib/permissions.ts` + tests (ADD-6)

- [x] DÃ©finir `Role = "admin" | "commercial" | "operateur"` et `Action` union type
- [x] Construire `PERMISSION_MATRIX: Record<Role, Record<Action, boolean | "own">>` (voir Dev Notes)
- [x] ImplÃ©menter `can(role: Role, action: Action): boolean` (ignores ownership â€” pour UI gating)
- [x] ImplÃ©menter `requirePermission(userRole: Role, action: Action, ownerId?: string, currentUserId?: string): void` â€” lance `PermissionError` (extends Error, code 403)
- [x] Exporter `PermissionError` class
- [x] CrÃ©er `src/lib/permissions.test.ts` : couvrir chaque cellule de la matrice pour les 3 rÃ´les

### T5 â€” `src/lib/audit.ts` (ADD-11)

- [x] DÃ©finir `AuditEvent` type (verbatim depuis l'architecture)
- [x] Exporter `emitAuditEvent(event: AuditEvent): void` â€” stub console.warn en MVP-0 (sera remplacÃ© en Story 1.3 par Ã©criture Drizzle)
- [x] Exporter `createAuditEvent(params): AuditEvent` helper pour construire l'event sans oublier de champs

### T6 â€” `src/lib/api/envelope.ts` + `mapper.ts` (ADD-10)

- [x] CrÃ©er `src/lib/api/envelope.ts` : exporter `apiError(code: ApiErrorCode, message: string, status: number, fields?: Record<string, string>): NextResponse`, `errorBody(...)`, constantes `HTTP_STATUS`
- [x] DÃ©finir `ApiErrorCode = "VALIDATION_FAILED" | "FORBIDDEN" | "QUOTA_EXCEEDED" | "CONFLICT" | "NOT_FOUND" | "UNAUTHORIZED" | "RATE_LIMITED"`
- [x] CrÃ©er `src/lib/api/mapper.ts` : exporter `toApiCase<T>(obj: T): CamelCase<T>` et `toDbCase<T>(obj: T): SnakeCase<T>` (conversion rÃ©cursive snake_case â†” camelCase)

### T7 â€” `src/lib/validation/` schÃ©mas Zod (ADD-3)

- [x] `quote.ts` : schÃ©ma de base pour un devis (rÃ©fÃ©rence, objet, validitÃ©, status, clientId, signataireNom, signatairefonction, conditions)
- [x] `client.ts` : schema client (companyName required, phone required, email optional pattern, country, city, address, notes)
- [x] `company.ts` : schema sociÃ©tÃ© (raison sociale, forme juridique, capital, RCCM required, NIF required, adresse, BP, phones, emails)
- [x] `clause.ts` : schema clause (titre required, contenu required max 2000 chars, catÃ©gorie)
- [x] Chaque fichier exporte le schema ET le type infÃ©rÃ© (`export type ClientInput = z.infer<typeof clientSchema>`)

### T8 â€” VÃ©rification finale

- [x] `pnpm typecheck` passe (TS strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
- [x] `pnpm test` passe (tous les nouveaux tests + le test smoke 1.1 toujours vert) â€” 87 tests
- [x] `pnpm lint` passe (0 erreurs, 0 warnings aprÃ¨s corrections)

### Review Findings

- [x] [Review][Patch] API envelope helpers required by AC4 are missing (`successResponse` and `errorResponse`) [src/lib/api/envelope.ts:35]
- [x] [Review][Patch] Country config does not export `COUNTRY_CONFIGS` and uses `name` instead of required `countryName` [src/lib/country-config.ts:1]
- [x] [Review][Patch] Numeric primitives can accept `NaN`/non-finite values and return invalid totals instead of throwing `CalcError` [src/lib/calc/camions.ts:8]
- [x] [Review][Patch] Quote total primitives do not enforce integer FCFA outputs, so fractional money can leak from `computeLineTotal`/`computeQuoteTotal` [src/lib/calc/totaux.ts:1]
- [x] [Review][Patch] Mapper exports runtime conversion only; AC4 requested typed `CamelCase<T>`/`SnakeCase<T>` return contracts [src/lib/api/mapper.ts:32]

---

## Notes dÃ©veloppeur

### RÃ¨gle absolue : money.ts

**JAMAIS de float monÃ©taire :**
```ts
// âŒ INTERDIT
const total = 1500.5 * 3;  // float intermediaire
const amount = price * qty; // peut donner 0.1 + 0.2 = 0.30000000000000004

// âœ… CORRECT
const total = roundFcfa(price * qty);         // conversion immÃ©diate aprÃ¨s chaque opÃ©ration
const amount = toFcfa(rawAmount, exchangeRate); // toFcfa appelle roundFcfa
```

**XOF n'a pas de sous-unitÃ©** : `maximumFractionDigits: 0` dans Intl.NumberFormat.

**`Intl.NumberFormat('fr-FR', { style:'currency', currency:'XOF', ... })`** produit par exemple `1 500 000 XOF`. C'est le format cible.

### Matrice RBAC Ã  implÃ©menter

```ts
// src/lib/permissions.ts

export type Role = "admin" | "commercial" | "operateur";

export type Action =
  | "quote.create" | "quote.read" | "quote.update" | "quote.delete"
  | "quote.change-status" | "quote.duplicate"
  | "client.create" | "client.read" | "client.update" | "client.delete"
  | "company.read" | "company.update"
  | "clause.create" | "clause.read" | "clause.update" | "clause.delete"
  | "template.create" | "template.read" | "template.update" | "template.delete"
  | "user.read" | "user.manage";

// "own" signifie : autorisÃ© seulement si ownerId === currentUserId
type Permission = boolean | "own";

const PERMISSION_MATRIX: Record<Role, Partial<Record<Action, Permission>>> = {
  admin: {
    // Admin = tout
    "quote.create": true, "quote.read": true, "quote.update": true,
    "quote.delete": true, "quote.change-status": true, "quote.duplicate": true,
    "client.create": true, "client.read": true, "client.update": true, "client.delete": true,
    "company.read": true, "company.update": true,
    "clause.create": true, "clause.read": true, "clause.update": true, "clause.delete": true,
    "template.create": true, "template.read": true, "template.update": true, "template.delete": true,
    "user.read": true, "user.manage": true,
  },
  commercial: {
    "quote.create": true, "quote.read": true, "quote.update": "own",
    "quote.delete": "own", "quote.change-status": "own", "quote.duplicate": true,
    "client.create": true, "client.read": true, "client.update": "own", "client.delete": false,
    "company.read": true, "company.update": false,
    "clause.read": true, "clause.create": false, "clause.update": false, "clause.delete": false,
    "template.read": true, "template.create": false, "template.update": false, "template.delete": false,
    "user.read": false, "user.manage": false,
  },
  operateur: {
    "quote.create": false, "quote.read": true, "quote.update": false,
    "quote.delete": false, "quote.change-status": false, "quote.duplicate": false,
    "client.create": false, "client.read": true, "client.update": false, "client.delete": false,
    "company.read": true, "company.update": false,
    "clause.read": true, "clause.create": false, "clause.update": false, "clause.delete": false,
    "template.read": true, "template.create": false, "template.update": false, "template.delete": false,
    "user.read": false, "user.manage": false,
  },
};

export class PermissionError extends Error {
  readonly statusCode = 403;
  constructor(action: Action) {
    super(`Forbidden: ${action}`);
    this.name = "PermissionError";
  }
}

export function can(role: Role, action: Action): boolean {
  const perm = PERMISSION_MATRIX[role]?.[action];
  // "own" â†’ can() retourne true (UI: peut voir le bouton, mais le serveur vÃ©rifiera l'ownership)
  return perm === true || perm === "own";
}

export function requirePermission(
  userRole: Role,
  action: Action,
  ownerId?: string,
  currentUserId?: string
): void {
  const perm = PERMISSION_MATRIX[userRole]?.[action];
  if (!perm) throw new PermissionError(action);
  if (perm === "own") {
    if (!ownerId || !currentUserId || ownerId !== currentUserId) {
      throw new PermissionError(action);
    }
  }
}
```

### CalcError â€” structure recommandÃ©e

```ts
// src/lib/calc/index.ts

export class CalcError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "CalcError";
  }
}
```

### Bornes et guards calc

```ts
// camions.ts
export const MIN_TONNAGE = 0.1;
export const MAX_TONNAGE = 10_000;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 100;

export function computeCamions(tonnage: number, capacity: number): number {
  if (capacity <= 0) throw new CalcError("La capacitÃ© doit Ãªtre > 0", "capacity");
  if (tonnage < MIN_TONNAGE || tonnage > MAX_TONNAGE) throw new CalcError("Tonnage hors bornes", "tonnage");
  if (capacity < MIN_CAPACITY || capacity > MAX_CAPACITY) throw new CalcError("CapacitÃ© hors bornes", "capacity");
  return Math.ceil(tonnage / capacity);
}
```

### AuditEvent â€” shape verbatim architecture

```ts
// src/lib/audit.ts
export interface AuditEvent {
  who: string;      // userId
  what: string;     // e.g. "quote.create", "quote.status_changed"
  when: string;     // ISO 8601 UTC : new Date().toISOString()
  where: string;    // device identifier ou IP (fourni par la route API)
  entity: { type: string; id: string };
  before?: unknown;
  after?: unknown;
}

// Stub MVP-0 â€” sera remplacÃ© par Ã©criture Drizzle en Story 1.3
export function emitAuditEvent(event: AuditEvent): void {
  if (process.env.NODE_ENV !== "production") {
    console.log("[AUDIT]", JSON.stringify(event));
  }
  // TODO Story 1.3: insert into audit_event table via Drizzle
}
```

### API Envelope â€” shape exacte

```ts
// src/lib/api/envelope.ts
// SUCCESS : retourner la ressource directement (pas de wrapper {data:...})
// ERREUR  : toujours { error: { code, message, fields? } }

export type ApiErrorCode =
  | "VALIDATION_FAILED" | "FORBIDDEN" | "QUOTA_EXCEEDED"
  | "CONFLICT" | "NOT_FOUND" | "UNAUTHORIZED" | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  fields?: Record<string, string>
): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message, ...( fields ? { fields } : {} ) } }, { status });
}
```

**Anti-pattern :** Ne JAMAIS retourner `{ data: {...}, error: null }` â€” uniquement la ressource directe en succÃ¨s.

### mapper.ts â€” snake_case â†” camelCase

Le mapper doit convertir rÃ©cursivement les clÃ©s d'un objet. Pour MVP-0, une implÃ©mentation simple suffit (regex sur les clÃ©s) :

```ts
// toApiCase : snake_case â†’ camelCase (pour les rÃ©ponses JSON)
// toDbCase  : camelCase â†’ snake_case (pour les requÃªtes Drizzle)
// Ne convertit pas les valeurs, uniquement les clÃ©s de premier niveau et nested objects
```

**Note TS strict :** avec `exactOptionalPropertyTypes`, Ã©viter `{ key: undefined }` sur les types retournÃ©s â€” utiliser des spread conditionnels.

### Zod 4 â€” rappels

Le projet utilise **Zod 4** (zod `^4.4.3`). L'API est quasi-identique Ã  Zod 3 pour les patterns utilisÃ©s ici :
- `z.string().min(1)` â†’ toujours valide
- `z.string().email()` â†’ toujours valide
- `z.number().min(0).max(1e10)` â†’ toujours valide
- `z.union([...])`, `z.enum([...])` â†’ identiques
- `z.infer<typeof schema>` â†’ identique
- `.safeParse()`, `.parse()` â†’ identiques

**Changement notable Zod 4 :** `z.object().strict()` â†’ `z.strictObject()`. PrÃ©fÃ©rer `z.object()` sans `.strict()` sur les schemas partagÃ©s (le serveur re-valide, le client peut avoir des champs supplÃ©mentaires UI).

### Country Config â€” structure

```ts
// src/lib/country-config.ts
export interface CountryConfig {
  code: string;
  name: string;
  locale: string;          // "fr-NE"
  currency: string;        // "XOF"
  dateFormat: string;      // "dd/MM/yyyy"
  majorCities: string[];
}

const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  NE: {
    code: "NE",
    name: "Niger",
    locale: "fr-NE",
    currency: "XOF",
    dateFormat: "dd/MM/yyyy",
    majorCities: ["Niamey", "Zinder", "Maradi", "Agadez", "Tahoua", "Dosso", "Diffa"],
  },
  ML: { code: "ML", name: "Mali", locale: "fr-ML", currency: "XOF", dateFormat: "dd/MM/yyyy", majorCities: ["Bamako"] },
  BF: { code: "BF", name: "Burkina Faso", locale: "fr-BF", currency: "XOF", dateFormat: "dd/MM/yyyy", majorCities: ["Ouagadougou"] },
};
```

### PiÃ¨ges & anti-patterns

| âŒ Ã€ Ã©viter | âœ… Ã€ faire |
|---|---|
| `amount * rate` sans roundFcfa | `toFcfa(amount, rate)` |
| Recalculer `ceil(a/b)` inline dans un composant | `computeCamions(a, b)` de `@/lib/calc` |
| `parseFloat` sur un montant | Entiers FCFA uniquement |
| `any` sur le payload des Zod schemas | `z.infer<typeof schema>` |
| `PERMISSION_MATRIX.admin.quote_create` (snake) | `PERMISSION_MATRIX.admin["quote.create"]` |
| `{ data: result }` dans une rÃ©ponse API | `return NextResponse.json(result)` directement |
| AuditEvent sans champ `when` | `when: new Date().toISOString()` obligatoire |
| Importer `next/server` dans `money.ts` ou `calc/` | Ces modules sont **purs** â€” zÃ©ro import Next.js |
| CrÃ©er un `tailwind.config.ts` | Tailwind v4 CSS-first uniquement |

### Intelligence Story 1.1

Story 1.1 (done) a posÃ© :
- Toutes les libs installÃ©es (Dexie, Vitest, Zod 4, etc.)
- `vitest.config.ts` + `playwright.config.ts` configurÃ©s
- Tests unitaires : `src/**/*.test.ts` â†’ inclus automatiquement
- `src/test/setup.ts` comme setup file (vide pour l'instant)
- `@/` alias vers `./src/*` fonctionnel
- TS strict complet activÃ© (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)

**Ne pas toucher :** `src/app/globals.css`, `src/app/layout.tsx`, `next.config.ts` â€” hors scope.

**Boilerplate Ã  ignorer** (laissÃ© en place jusqu'Ã  Story 1.5) : `src/app/{chat,profile,dashboard}`, `src/components/{site-header,site-footer}`. Ne pas supprimer.

### Analyse git

Un seul commit de base (`c2da5be` â€” initial from create-agentic-app). Cette story est la deuxiÃ¨me implÃ©mentation. Toutes les conventions de la story 1.1 s'appliquent.

### Structure des fichiers Ã  crÃ©er

```
src/lib/
â”œâ”€â”€ money.ts                       â† NEW
â”œâ”€â”€ money.test.ts                  â† NEW (co-localisÃ©)
â”œâ”€â”€ country-config.ts              â† NEW
â”œâ”€â”€ permissions.ts                 â† NEW
â”œâ”€â”€ permissions.test.ts            â† NEW
â”œâ”€â”€ audit.ts                       â† NEW
â”œâ”€â”€ calc/
â”‚   â”œâ”€â”€ index.ts                   â† NEW (exports + CalcError)
â”‚   â”œâ”€â”€ camions.ts                 â† NEW
â”‚   â”œâ”€â”€ camions.test.ts            â† NEW
â”‚   â”œâ”€â”€ valeur.ts                  â† NEW
â”‚   â”œâ”€â”€ valeur.test.ts             â† NEW
â”‚   â”œâ”€â”€ totaux.ts                  â† NEW
â”‚   â””â”€â”€ totaux.test.ts             â† NEW
â”œâ”€â”€ api/
â”‚   â”œâ”€â”€ envelope.ts                â† NEW
â”‚   â””â”€â”€ mapper.ts                  â† NEW
â””â”€â”€ validation/
    â”œâ”€â”€ quote.ts                   â† NEW
    â”œâ”€â”€ client.ts                  â† NEW
    â”œâ”€â”€ company.ts                 â† NEW
    â””â”€â”€ clause.ts                  â† NEW

# Fichiers existants â€” NE PAS MODIFIER dans cette story :
src/lib/schema.ts       # domaine tables â†’ Story 1.3
src/lib/db.ts           # Drizzle client
src/lib/auth.ts         # Better Auth
src/lib/auth-client.ts
src/lib/session.ts
src/lib/storage.ts
src/lib/utils.ts        # cn() uniquement
src/lib/utils.test.ts   # smoke test 1.1 â€” ne pas casser
src/lib/env.ts
```

### Imports attendus dans l'application

```ts
// Dans les composants UI (calc live) :
import { computeCamions, computeValeurMarchandise, computeQuoteTotal } from "@/lib/calc";
import { formatFcfa, toFcfa } from "@/lib/money";

// Dans les routes API :
import { requirePermission } from "@/lib/permissions";
import { emitAuditEvent } from "@/lib/audit";
import { apiError } from "@/lib/api/envelope";
import { toApiCase, toDbCase } from "@/lib/api/mapper";

// CÃ´tÃ© client ET serveur :
import { clientSchema } from "@/lib/validation/client";
```

---

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes

- **T1 `country-config.ts`** â€” CountryConfig interface + COUNTRY_CONFIGS (NE/ML/BF) + getCountryConfig/getActiveConfig
- **T2 `money.ts`** â€” formatFcfa (Intl.NumberFormat fr-FR XOF), roundFcfa (Math.round), toFcfa; 16 tests. Note : Intl produit "F CFA" en Node.js (pas "XOF") â€” test adaptÃ© avec regex `XOF|CFA`
- **T3 `calc/`** â€” CalcError dans `error.ts` sÃ©parÃ© (Ã©vite circulaire), camions/valeur/totaux avec bornes + guards; 31 tests
- **T4 `permissions.ts`** â€” matrice RBAC 22 actions Ã— 3 rÃ´les, can() + requirePermission() + PermissionError (statusCode 403); 30 tests
- **T5 `audit.ts`** â€” AuditEvent type + createAuditEvent + emitAuditEvent stub (console.warn dev)
- **T6 `api/envelope.ts` + `mapper.ts`** â€” ApiErrorCode union, errorBody, apiError (NextResponse), HTTP_STATUS; toApiCase/toDbCase conversion rÃ©cursive
- **T7 `validation/`** â€” 4 schemas Zod : client, company, clause, quote avec types infÃ©rÃ©s
- **T8 vÃ©rification** â€” pnpm check : lint âœ… typecheck âœ… 87 tests âœ…

### File List

**Nouveaux fichiers crÃ©Ã©s :**
- `src/lib/country-config.ts`
- `src/lib/money.ts`
- `src/lib/money.test.ts`
- `src/lib/calc/error.ts`
- `src/lib/calc/index.ts`
- `src/lib/calc/camions.ts`
- `src/lib/calc/camions.test.ts`
- `src/lib/calc/valeur.ts`
- `src/lib/calc/valeur.test.ts`
- `src/lib/calc/totaux.ts`
- `src/lib/calc/totaux.test.ts`
- `src/lib/permissions.ts`
- `src/lib/permissions.test.ts`
- `src/lib/audit.ts`
- `src/lib/api/envelope.ts`
- `src/lib/api/mapper.ts`
- `src/lib/validation/client.ts`
- `src/lib/validation/company.ts`
- `src/lib/validation/clause.ts`
- `src/lib/validation/quote.ts`

**Aucun fichier existant modifiÃ©.**

---

## RÃ©fÃ©rences

- [Architecture Â§Data Architecture] â€” ADD-4 money.ts, ADD-5 calc/, ADD-3 Zod shared
- [Architecture Â§Authentication & Security] â€” ADD-6 permissions.ts (RBAC double enforcement)
- [Architecture Â§API & Communication Patterns] â€” ADD-10 error envelope, ADD-11 audit.ts
- [Architecture Â§Implementation Patterns] â€” Naming, format patterns, enforcement guidelines
- [Architecture Â§Pattern Examples] â€” Good/anti-patterns verbatim
- [Epics.md Â§Story 1.2] â€” Acceptance criteria source
- [project-context.md Â§Critical Implementation Rules] â€” TS strict, Zod 4, naming conventions
- [DESIGN.md] â€” Hors scope de cette story (tokens, polices â†’ Story 1.1 done)


