---
story_key: 2-3-company-info-config
epic_num: 2
story_num: 3
status: review
baseline_commit: 95c49335d0c4abaf532babe2b8d49643c32e7782
---

# Story 2.3 : Configuration des informations société (FR-5)

**Statut :** done

## Story

**En tant que** administrateur,
**Je veux** saisir et modifier les informations de ma société (raison sociale, RCCM, NIF, coordonnées),
**Afin que** ces informations apparaissent sur tous les devis et PDF générés.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage de la page et contrôle d'accès (FR-3)**

```
GIVEN  un utilisateur authentifié accède à /parametres
WHEN  la page se charge
THEN  la page affiche le formulaire infos société avec les données actuelles (pré-remplies depuis Dexie)
AND   un Admin voit le formulaire en mode édition (champs actifs, bouton "Enregistrer")
AND   un Commercial ou Opérateur voit les données en lecture seule (champs disabled ou texte statique)
AND   si aucune société n'existe encore, un Admin voit le formulaire vide en mode création
```

**AC2 — Champs et validation OHADA (FR-5)**

```
GIVEN  le formulaire infos société (mode création ou édition)
WHEN  l'Admin soumet le formulaire
THEN  raison sociale, RCCM et NIF sont requis — toute soumission sans eux affiche une erreur inline française
AND   RCCM est validé : format OHADA Niger = lettres-lettres-AAAA-X-N+ (ex: NE-NIA-2023-B-1234) — regex /^[A-Z]{2}-[A-Z]{2,4}-\d{4}-[A-Z]-\d+$/i
AND   NIF est validé : 8 à 12 chiffres — regex /^\d{8,12}$/
AND   les champs facultatifs (forme juridique, capital, adresse, BP, emails) n'ont pas de contrainte de format sauf email validé
AND   phones : au moins un téléphone requis (déjà dans companySchema), chacun min 1 caractère
AND   les messages d'erreur sont en français et positionnés sous chaque champ (react-hook-form setError)
```

**AC3 — Sauvegarde via applyLocalMutation (offline-capable)**

```
GIVEN  un Admin édite une société existante (companyId présent dans la session)
WHEN  il soumet le formulaire valide
THEN  la mutation passe par applyLocalMutation("company", company.id, "update", payload, company.revision, dexieWriteFn)
AND   l'écriture Dexie ET l'enqueue du SyncOp sont atomiques (une seule transaction Dexie)
AND   la modification s'affiche immédiatement dans le formulaire (liveQuery Dexie)
AND   un toast "Informations société enregistrées" s'affiche
AND   triggerSync() est appelé si navigator.onLine (sync auto)
```

**AC4 — Création initiale (bootstrap) — Admin sans companyId**

```
GIVEN  un Admin dont user.companyId est null accède à /parametres
WHEN  il remplit et soumet le formulaire de création
THEN  POST /api/v1/companies est appelé directement (pas via applyLocalMutation — sync bloqué sans companyId)
AND   le serveur crée le company (uuid PK) ET met à jour user.companyId atomiquement
AND   le company est upsert dans Dexie localement après la réponse serveur
AND   un toast "Société créée. Synchronisation en cours…" s'affiche
AND   triggerSync() est appelé pour seeder Dexie depuis le pull delta
```

**AC5 — Historique des modifications (O1 / FR-10)**

```
GIVEN  une modification d'infos société sauvegardée
WHEN  la mutation est traitée par POST /api/v1/sync/push
THEN  un AuditEvent est émis : who=userId, what="sync.update", entity={type:"company", id:companyId}, before=ancien état, after=nouveau payload
AND   l'historique est consultable dans audit_event (MVP-0 : pas d'UI dédiée, uniquement en base)
```

**AC6 — Qualité**

```
GIVEN  les fichiers modifiés/créés
WHEN  je lance pnpm check
THEN  lint ✓ + typecheck ✓ + tous les tests existants passent (201+ tests sans régression)
AND   pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/validation/company.ts` — UPDATE : ajouter regex RCCM/NIF OHADA
- `src/app/api/v1/companies/route.ts` — CRÉER : GET (lire société) + POST (bootstrap création + set companyId)
- `src/hooks/use-live-company.ts` — CRÉER : Dexie liveQuery sur `db.company`
- `src/components/settings/company-form.tsx` — CRÉER : formulaire client-side complet
- `src/app/(app)/parametres/page.tsx` — UPDATE : remplacer le stub par la page société complète
- `src/messages/fr-NE.json` — UPDATE : ajouter section `parametres.societe`

**EXCLU :**
- Upload logo société → Story 2.4
- Configuration signataire par défaut → Story 2.5 (les champs `signataireNom`/`signataireFonction` sont sur le même `company` record, mais leur UI dédiée est Story 2.5 — **INCLURE les champs dans le schema Zod/Dexie, ne pas afficher dans ce formulaire**)
- `conditionsPaiementDefaut` → Story 3.6
- Gestion des utilisateurs → déjà dans `parametres/utilisateurs/` (Story 1.6 — ne pas toucher)
- Chiffrement AES-GCM de `CompanyLocal` → Story 6.1 [MVP-1] (le seam LocalCrypto no-op est déjà en place)
- Tests Vitest pour le formulaire React → hors scope MVP-0 pour les composants client ; les tests AC6 = pnpm check + build

---

## Tâches / Sous-tâches

### T1 — Mettre à jour le schéma de validation société (AC2)

- [x] Ouvrir `src/lib/validation/company.ts`
- [x] Ajouter la validation regex RCCM :
  ```typescript
  rccm: z.string()
    .min(1, "Le RCCM est requis")
    .regex(/^[A-Z]{2}-[A-Z]{2,4}-\d{4}-[A-Z]-\d+$/i, "Format RCCM invalide (ex: NE-NIA-2023-B-1234)"),
  ```
- [x] Ajouter la validation regex NIF :
  ```typescript
  nif: z.string()
    .min(1, "Le NIF est requis")
    .regex(/^\d{8,12}$/, "Le NIF doit contenir 8 à 12 chiffres"),
  ```
- [x] S'assurer que les champs `signataireNom`, `signataireFonction`, `conditionsPaiementDefaut` restent en `optional()` dans le schéma (ils seront remplis par Stories 2.5 et 3.6)
- [x] Vérifier `pnpm typecheck` — aucune régression

### T2 — Créer la route API companies (AC1 GET, AC4 POST)

- [x] Créer `src/app/api/v1/companies/route.ts`
- [x] Implémenter `GET` — retourne la société du user courant (companyId depuis session, Drizzle query, retourne null si aucune)
- [x] Implémenter `POST` — bootstrap création initiale : Admin-only, 409 si companyId déjà défini, transaction Drizzle INSERT company + UPDATE user.companyId, AuditEvent, retourne 201

### T3 — Créer le hook useLiveCompany (AC3, AC4)

- [x] Créer `src/hooks/use-live-company.ts` — utilise `liveQuery` de `dexie` (pas `dexie-react-hooks`, non installé) + `useEffect`/`useState` pattern

### T4 — Créer le composant CompanyForm (AC1, AC2, AC3, AC4)

- [x] Créer `src/components/settings/company-form.tsx` (Client Component)
- [x] Props : `company`, `canEdit`, `userId`, `companyId`
- [x] Formulaire avec native React `useState` (react-hook-form non installé)
- [x] Tous champs scope 2.3 : raisonSociale, formeJuridique, capital, rccm, nif, adresse, bp, phones (dynamic), emails (dynamic)
- [x] Mode read-only pour non-Admin (ReadOnlyField)
- [x] Double chemin onSubmit : `applyLocalMutation` (update) ou `POST /api/v1/companies` (bootstrap)
- [x] `isPending` + toast via sonner

### T5 — Mettre à jour la page /parametres (AC1)

- [x] Ouvrir `src/app/(app)/parametres/page.tsx` (Server Component)
- [x] SSR seed via Drizzle query directe (pas de double fetch)
- [x] Titre H1 "Paramètres société", eyebrow "Paramètres", layout `px-5 pt-8`
- [x] Rend `<CompanyForm>` + lien utilisateurs pour Admin

### T6 — Ajouter les messages i18n (AC1–AC5)

- [x] Section `parametres.societe` ajoutée dans `src/messages/fr-NE.json`

### T7 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ (0 erreurs) typecheck ✓ (0 erreurs) 201 tests ✓
- [x] `pnpm build` : passe sans erreur (`/api/v1/companies` route ƒ visible)

---

## Dev Notes

### CRITIQUE — Problème de bootstrapping (companyId null)

**Situation :** Le moteur de sync (`processQueue` → `POST /api/v1/sync/push`) bloque **toute** mutation si `session.user.companyId` est null :
```typescript
if (!userCompanyId) {
  return apiError("FORBIDDEN", "Utilisateur non associé à une entreprise.", HTTP_STATUS.FORBIDDEN);
}
```

**Conséquence :** `applyLocalMutation` → sync push échoue pour un nouvel Admin sans companyId.

**Solution (cette story) :** Deux chemins distincts dans `CompanyForm.onSubmit` :
1. `company && companyId` → `applyLocalMutation` (chemin normal, sync-enabled)
2. `!companyId` → `POST /api/v1/companies` direct (bootstrap, set companyId sur le serveur)

**Route POST /api/v1/companies** doit :
- Être Admin-only (`requirePermission(userRole, "company.update")`)
- Rejeter si `session.user.companyId` déjà défini → `409 "Société déjà configurée"`
- Transaction Drizzle atomique :
  ```typescript
  await db.transaction(async (tx) => {
    const [newCompany] = await tx.insert(companyTable).values({ id: generateUUID(), ...values }).returning();
    await tx.update(user).set({ companyId: newCompany.id }).where(eq(user.id, userId));
  });
  ```
- Après INSERT, émettre AuditEvent (`what: "company.created"`)
- Retourner `201` + company créé (camelCase, mapped)

**Après bootstrap :** L'Admin doit recharger la session pour que `session.user.companyId` soit propagé. Options :
- `router.refresh()` (Server Component re-fetch) — **préféré**
- Ou appel `auth.api.getSession()` fraîchement côté client

---

### CRITIQUE — GET /api/v1/companies : logique de lecture

```typescript
export async function GET(_req: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return apiError("UNAUTHORIZED", "Non authentifié.", 401);

  const userRole = (session.user as Record<string, unknown>).role as Role;
  // company.read = admin, commercial, operateur — pas de requirePermission car tous peuvent lire
  if (!can(userRole, "company.read")) {
    return apiError("FORBIDDEN", "Accès refusé.", 403);
  }

  const companyId = (session.user as Record<string, unknown>).companyId as string | null;
  if (!companyId) return NextResponse.json(null, { status: 200 }); // Aucune société

  const rows = await db.select().from(companyTable).where(eq(companyTable.id, companyId)).limit(1);
  if (rows.length === 0) return NextResponse.json(null, { status: 200 });

  // Mapper snake_case → camelCase (déjà géré par Drizzle camelCase mode, mais vérifier)
  return NextResponse.json(rows[0], { status: 200 });
}
```

**Note :** Drizzle retourne déjà les colonnes en camelCase dans TypeScript (ex: `raisonSociale`, non `raison_sociale`). Vérifier avec `lib/api/mapper.ts` si nécessaire.

---

### CRITIQUE — applyLocalMutation pour la company

Signature de `applyLocalMutation` dans `src/lib/sync/outbox.ts` :
```typescript
export async function applyLocalMutation(
  entity: SyncOpEntity,
  entityId: string,
  type: "create" | "update" | "delete",
  payload: Record<string, unknown>,
  baseRevision: number,
  dexieWriteFn: () => Promise<void>,
  createdBy?: string,
): Promise<SyncMutationResult>
```

Usage pour update company :
```typescript
const payload: Record<string, unknown> = {
  raisonSociale: data.raisonSociale,
  formeJuridique: data.formeJuridique ?? null,
  capital: data.capital ?? null,
  rccm: data.rccm,
  nif: data.nif,
  adresse: data.adresse ?? null,
  bp: data.bp ?? null,
  phones: data.phones,
  emails: data.emails ?? [],
  // Préserver les champs gérés par d'autres stories
  logoUrl: company.logoUrl ?? null,
  signataireNom: company.signataireNom ?? null,
  signataireFonction: company.signataireFonction ?? null,
  conditionsPaiementDefaut: company.conditionsPaiementDefaut ?? null,
  companyId: company.companyId ?? null,
  pays: company.pays,
  updatedAt: new Date().toISOString(),
  createdAt: company.createdAt,
};

await applyLocalMutation(
  "company",
  company.id,
  "update",
  payload,
  company.revision,
  async () => {
    await db.company.put({
      ...company,
      raisonSociale: data.raisonSociale,
      formeJuridique: data.formeJuridique,
      capital: data.capital,
      rccm: data.rccm,
      nif: data.nif,
      adresse: data.adresse,
      bp: data.bp,
      phones: data.phones,
      emails: data.emails ?? [],
      updatedAt: new Date().toISOString(),
    });
  },
  userId,
);
```

**CRITIQUE :** La `dexieWriteFn` doit préserver les champs non-touchés par ce formulaire (`logoUrl`, `signataireNom`, `signataireFonction`, `conditionsPaiementDefaut`). Sinon Story 2.4 et Story 2.5 seront écrasées par une mise à jour société.

---

### CRITIQUE — companySchema existant à ne pas casser

`src/lib/validation/company.ts` est importé dans `src/app/api/v1/sync/push/route.ts` (indirectement via les types) et peut être utilisé dans des tests existants. Modifier uniquement en ajoutant des contraintes `.regex()` sur `rccm` et `nif` — pas de renommage de champs.

**État actuel :**
```typescript
rccm: z.string().min(1, "Le RCCM est requis"),
nif: z.string().min(1, "Le NIF est requis"),
```

**État après T1 :**
```typescript
rccm: z.string()
  .min(1, "Le RCCM est requis")
  .regex(/^[A-Z]{2}-[A-Z]{2,4}-\d{4}-[A-Z]-\d+$/i, "Format RCCM invalide (ex: NE-NIA-2023-B-1234)"),
nif: z.string()
  .min(1, "Le NIF est requis")
  .regex(/^\d{8,12}$/, "Le NIF doit contenir 8 à 12 chiffres"),
```

**Risque de régression :** Les tests existants qui créent des `company` avec des RCCM/NIF fictifs (ex: `"RCCM-1234"`) **échoueront** si les regex sont trop strictes. Vérifier `pnpm check` après T1 et ajuster si nécessaire.

---

### CRITIQUE — CompanyLocal dans Dexie : une seule entité

`db.company` est une `EntityTable<CompanyLocal, "id">`. Pour lire la société courante :
```typescript
// hooks/use-live-company.ts
const company = useLiveQuery(() => db.company.toCollection().first());
```
Retourne `undefined` (loading), `undefined/null` (vide), ou `CompanyLocal`.

`db.company.put(company)` sur un objet qui a le même `id` fait un upsert (overwrite). Pour le bootstrap, après réponse du `POST /api/v1/companies`, mapper le résultat vers `CompanyLocal` et faire `db.company.put(mapped)`.

---

### CRITIQUE — Page /parametres : hydratation SSR → CSR

La page `/parametres` est un Server Component. Pour éviter la double-fetch :
1. Le Server Component lit la société via Drizzle directement (pas `fetch /api/v1/companies`) :
   ```typescript
   // Dans parametres/page.tsx (Server Component)
   import { db as pgDb } from "@/lib/db";
   import { company as companyTable } from "@/lib/schema";
   import { eq } from "drizzle-orm";

   const companyRow = companyId
     ? await pgDb.select().from(companyTable).where(eq(companyTable.id, companyId)).limit(1).then(r => r[0] ?? null)
     : null;
   ```
2. Passe `initialCompany={companyRow}` à `<CompanyForm>`
3. `CompanyForm` utilise `useLiveCompany()` pour les mises à jour réactives, mais peut `useMemo` l'initialisation depuis `initialCompany` au premier render pour éviter le flash

Alternativement (plus simple) : ne pas faire de SSR hydratation — laisser `CompanyForm` se charger via `useLiveCompany()` uniquement (skeleton pendant le chargement Dexie initial). Acceptable pour MVP.

**Recommandation pour MVP :** Approche simple — Server Component passe `userId`, `role` et `companyId` (depuis session) ; `CompanyForm` lit via `useLiveCompany()` et affiche un skeleton tant que `undefined`.

---

### Héritage des stories précédentes

**Story 1.2 (permissions.ts) — utiliser :**
- `can(role, "company.update")` → true seulement pour Admin
- `can(role, "company.read")` → true pour tous les rôles
- `requirePermission(userRole, "company.update")` dans les route handlers mutants

**Story 1.3 (local-db.ts) — `CompanyLocal` déjà défini :**
```typescript
export interface CompanyLocal {
  id: string;
  raisonSociale: string;
  formeJuridique?: string;
  capital?: number;
  rccm: string;
  nif: string;
  adresse?: string;
  bp?: string;
  phones: string[];
  emails: string[];
  logoUrl?: string;
  signataireNom?: string;
  signataireFonction?: string;
  conditionsPaiementDefaut?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}
```
**Ne pas modifier `local-db.ts`** — le schéma est complet.

**Story 2.1 (outbox.ts) — `applyLocalMutation` disponible** pour entity="company".

**Story 2.2 (sw.ts) — GET /api/v1/companies sera cachée** via la règle NetworkFirst `/(clients|quotes|companies|templates|clauses|health)/` si elle est dans l'allowlist. Vérifier que `companies` est dans le matcher du SW. Si non, l'ajouter dans `sw.ts` (matcher mise à jour : `/(clients|quotes|companies|templates|clauses|health)/`).

**Sync push déjà câblé pour company :**
`src/app/api/v1/sync/push/route.ts` gère déjà `case "company"` avec upsert complet. Aucune modification de la route push.

**Sync pull déjà câblé pour company :**
`src/lib/sync/pull.ts` gère déjà `company` dans le delta. L'endpoint pull (`src/app/api/v1/sync/pull/route.ts`) doit inclure la société dans sa réponse — vérifier que c'est le cas.

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Écrire dans `db.company` sans `applyLocalMutation` (si companyId existe) | Toujours passer par `applyLocalMutation` pour les updates |
| Utiliser `applyLocalMutation` si `companyId` est null | `POST /api/v1/companies` direct pour le bootstrap |
| Écraser `logoUrl`, `signataireNom`, `signataireFonction` lors d'un update société | Préserver les champs non-touchés par ce formulaire |
| Stocker `capital` comme float | Entier FCFA (integer) — `Math.round(value)` si besoin |
| Afficher le bouton "Enregistrer" pour non-Admin | `canEdit = can(role, "company.update")` — bouton masqué si false |
| Modifier `src/lib/local-db.ts` ou `src/lib/schema.ts` | Ces fichiers sont complets pour cette story |
| Créer une nouvelle migration Drizzle | Aucune modification de schéma DB dans cette story |
| Appeler `POST /api/v1/companies` si user.companyId est déjà défini | Le endpoint rejette avec 409 — le UI ne doit jamais déclencher ce cas |
| Afficher signataireNom/Fonction dans ce formulaire | Hors scope Story 2.3 — déléguer à Story 2.5 |

---

### Fichiers à modifier/créer — récapitulatif

| Fichier | Action | Description |
|---|---|---|
| `src/lib/validation/company.ts` | UPDATE | Regex RCCM + NIF OHADA |
| `src/app/api/v1/companies/route.ts` | CRÉER | GET lecture + POST bootstrap |
| `src/hooks/use-live-company.ts` | CRÉER | Dexie liveQuery company |
| `src/components/settings/company-form.tsx` | CRÉER | Formulaire client-side complet |
| `src/app/(app)/parametres/page.tsx` | UPDATE | Remplacer stub par page société |
| `src/messages/fr-NE.json` | UPDATE | Section `parametres.societe` |

---

### Commandes pour le dev agent

```bash
# 1. Docker running (pnpm build exécute db:migrate)
docker compose up -d

# 2. Aucune migration nécessaire — schema DB déjà complet (company table en place depuis Story 1.3)

# 3. Vérification qualité
pnpm check        # lint ✓ typecheck ✓ 201+ tests ✓

# 4. Build
pnpm build        # doit passer sans erreur

# Note: Après T1 (ajout regex RCCM/NIF), vérifier si des tests existants échouent
# sur des données société factices. Si oui, mettre à jour les fixtures de test.
```

---

## Références

- [Epics §Story 2.3] — FR-5 : Configuration infos société
- [Architecture §Data Architecture] — `company` table : uuid PK, colonnes sync, seams companyId/pays
- [Architecture §API Patterns] — POST direct pour bootstrap ; sync push pour updates normaux
- [Architecture §Enforcement Guidelines] — "route every local write through `applyLocalMutation`"
- [Story 1.2 §Dev Notes] — `permissions.ts` : `can()` + `requirePermission()`
- [Story 1.3 §Dev Notes] — `local-db.ts` + `CompanyLocal` + seam LocalCrypto
- [Story 2.1 §Dev Notes] — `applyLocalMutation` signature + `processQueue`
- [Story 2.2 §Dev Notes] — SW matcher `/api/v1/` allowlist (vérifier `companies` inclus)
- [Schema §company table] — `src/lib/schema.ts` lignes 126-149
- [Validation §companySchema] — `src/lib/validation/company.ts`

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- **dexie-react-hooks non installé** : `useLiveQuery` impossible. Implémenté `useLiveCompany` avec `liveQuery` de `dexie` + `useEffect`/`useState` subscription pattern.
- **react-hook-form non installé** : formulaire avec native React `useState` + Zod `safeParse` manuel.
- **exactOptionalPropertyTypes strict** : tous les champs optionnels de `CompanyLocal` doivent être gérés avec conditional spreading (`...(val != null ? { key: val } : {})`), pas `key: val ?? undefined`. Concerne `db.company.put()`, la construction de `initialCompany` dans le Server Component, et les props de composant (`{ message: string | undefined }` au lieu de `{ message?: string }`).
- **Bootstrap bootstrap companyId** : `applyLocalMutation` inutilisable si `companyId` est null (sync push bloque). Route `POST /api/v1/companies` dédiée avec transaction atomique INSERT company + UPDATE user.companyId.
- **Import order ESLint** : `type { CompanyLocal }` doit venir avant `{ can }` dans `parametres/page.tsx`.
- **Champs préservés** : `logoUrl`, `signataireNom`, `signataireFonction`, `conditionsPaiementDefaut` copiés depuis `company` existant lors des updates pour ne pas écraser Stories 2.4/2.5/3.6.

### File List

- `src/lib/validation/company.ts` — UPDATE : regex RCCM + NIF OHADA
- `src/app/api/v1/companies/route.ts` — CRÉÉ : GET lecture + POST bootstrap
- `src/hooks/use-live-company.ts` — CRÉÉ : liveQuery Dexie via useEffect
- `src/components/settings/company-form.tsx` — CRÉÉ : formulaire complet
- `src/app/(app)/parametres/page.tsx` — UPDATE : page société complète avec SSR seed
- `src/messages/fr-NE.json` — UPDATE : section `parametres.societe`

### Change Log

- 2026-06-23 : Story 2.3 implémentée (T1–T7). `pnpm check` : lint ✓, typecheck ✓, 201 tests ✓. Statut : review.

### Review Findings

- [x] [Review][Decision] companyId dérivé depuis effectiveCompany.id après bootstrap — SSR prop stale corrigé [src/components/settings/company-form.tsx]
- [x] [Review][Patch] effectiveCompany null→SSR fallback — Dexie vide n'écrase plus prop SSR valide [src/components/settings/company-form.tsx]
- [x] [Review][Patch] Bootstrap 409 recovery UX — serveur déjà commité → refresh propre [src/components/settings/company-form.tsx]
- [x] [Review][Patch] revision+1 dans dexieWriteFn — optimistic increment évite conflict double-save [src/components/settings/company-form.tsx]
- [x] [Review][Defer] user.companyId sans FK constraint — hors scope Story 2-3 (migration dédiée) [src/lib/schema.ts]
- [x] [Review][Patch] RCCM regex /i retiré + .toUpperCase() côté form — enforce uppercase OHADA [src/lib/validation/company.ts + company-form.tsx]
- [x] [Review][Patch] Email error en français — "Format email invalide" [src/lib/validation/company.ts]
- [x] [Review][Patch] inserted vérification explicite avant affectation [src/app/api/v1/companies/route.ts]
- [x] [Review][Defer] userId cast unsafely depuis session — pattern pré-existant codebase [src/app/(app)/parametres/page.tsx] — deferred, pre-existing
- [x] [Review][Defer] liveQuery error handler silencieux sur Dexie.AbortError — pattern pré-existant — deferred, pre-existing
- [x] [Review][Defer] SyncOp.createdBy non indexé — Story 2-1 [src/lib/local-db.ts] — deferred, pre-existing
- [x] [Review][Defer] syncOpLog sans isolation tenant (userId/companyId) — Story 2-1 [src/lib/schema.ts] — deferred, pre-existing
- [x] [Review][Defer] sync.push/pull permissions non vérifiées per-entity dans push route — Story 2-1 design gap — deferred, pre-existing
- [x] [Review][Defer] emitAuditEvent hors transaction — pattern pré-existant codebase — deferred, pre-existing
- [x] [Review][Defer] AuditEvent UPDATE path via sync push — géré par push/route.ts Story 2-1, vérifier [src/app/api/v1/sync/push/route.ts] — deferred, pre-existing
- [x] [Review][Defer] triggerSync void swallows errors — by design offline-first — deferred, pre-existing
- [x] [Review][Defer] useLiveCompany non-déterministe si multi-company rows — théorique — deferred, pre-existing
- [x] [Review][Defer] triggerSync singleton module-level non partagé multi-tab — Story 2-1 design — deferred, pre-existing
