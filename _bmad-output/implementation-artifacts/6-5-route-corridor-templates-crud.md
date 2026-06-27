---
story_key: 6-5-route-corridor-templates-crud
epic_num: 6
story_num: 5
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 6.5 : CRUD Modèles de Routes/Corridors (FR-NEW-ROUTES)

**Statut :** done

## Story

**En tant que** commercial (tier Pro),
**Je veux** créer et gérer des modèles de routes/corridors avec tarifs prédéfinis,
**Afin que** j'applique un corridor tarifé en un geste lors de la saisie du trajet, au lieu de remplir manuellement chaque champ à chaque fois.

---

## Critères d'acceptation (BDD)

**AC1 — Page CRUD `/parametres/modeles` — gaté tier Pro**

```
GIVEN  l'utilisateur navigue vers /parametres/modeles
WHEN   la page se charge
THEN   si le tier = Pro ou Entreprise (ou admin) → affiche la liste des modèles de routes
       si le tier = Starter (ou pas Pro) → affiche un message "Fonctionnalité Pro" avec
       un CTA d'upgrade (pas de 403, juste un message UI)
AND    la page est une route sous src/app/(app)/parametres/modeles/page.tsx
AND    uniquement Admin peut créer/modifier/supprimer (template.create / template.update / template.delete)
AND    Commercial peut lire (template.read) mais NE peut pas créer/modifier/supprimer
```

**AC2 — Création d'un modèle de route (Admin uniquement)**

```
GIVEN  la page /parametres/modeles et le rôle Admin (tier Pro)
WHEN   j'ouvre le formulaire de création
THEN   les champs suivants sont disponibles :
       - Nom du corridor (texte, obligatoire, ex: "Niamey → Zinder")
       - Pays/ville départ (sélection pays + texte ville, obligatoire)
       - Pays/ville arrivée (sélection pays + texte ville, obligatoire)
       - Distance km (nombre décimal optionnel)
       - Tarif prédéfini FCFA (entier, optionnel — pré-remplit unitPrice dans le devis)
WHEN   je soumets le formulaire
THEN   le modèle est créé en local (Dexie) + sync queue (applyLocalMutation)
AND    la liste se rafraîchit immédiatement (liveQuery Dexie)
AND    le modèle est accessible offline
```

**AC3 — Modification d'un modèle de route (Admin uniquement)**

```
GIVEN  un modèle de route existant
WHEN   j'ouvre son formulaire d'édition
THEN   les champs sont pré-remplis avec les valeurs actuelles
WHEN   je modifie et soumets
THEN   le modèle est mis à jour en local (Dexie) + sync queue
AND    les devis existants ayant utilisé ce modèle NE sont PAS modifiés
       (le corridor est appliqué par copie des valeurs, pas par référence)
```

**AC4 — Suppression d'un modèle de route (Admin uniquement)**

```
GIVEN  un modèle de route existant
WHEN   l'Admin clique "Supprimer" et confirme
THEN   le modèle est marqué deletedAt (soft delete, même pattern que template ligne)
AND    il disparaît de la liste
AND    un devis en cours de création avec ce modèle n'est pas affecté
       (les valeurs sont copiées, pas référencées)
```

**AC5 — Application du modèle au wizard devis (Step Trajet)**

```
GIVEN  la page de saisie du trajet dans le wizard (/devis/nouveau, step Trajet)
WHEN   des modèles de routes sont disponibles (tier Pro + modèles créés)
THEN   des chips de sélection rapide s'affichent au-dessus des champs Trajet
       (style similaire aux chips corridor UX-DR20 actuels)
AND    un tap sur un chip pré-remplit originCountry, originCity, destinationCountry,
       destinationCity, et unitPrice (si défini dans le modèle)
AND    les champs restent modifiables après pré-remplissage (pas de lock)
AND    si aucun modèle disponible (tier Starter ou aucun modèle créé), les chips
       ne s'affichent pas (fallback : presets codés en dur si encore présents,
       sinon les champs sont vides comme MVP-0)
```

**AC6 — Sync serveur : nouveau endpoint `/api/v1/route-templates`**

```
GIVEN  un modèle de route créé/modifié/supprimé en local
WHEN   la sync se déclenche (online)
THEN   la mutation est poussée via POST /api/v1/sync/push (entity = "routeTemplate")
AND    côté serveur, la table `route_template` PostgreSQL stocke les modèles
AND   l'idempotence est garantie via opId (réutilise le mécanisme syncOpLog existant)
AND   la permission serveur vérifie template.create / template.update / template.delete
```

**AC7 — Disponibilité offline**

```
GIVEN  l'utilisateur est hors ligne
WHEN   il accède à /parametres/modeles ou au wizard
THEN   les modèles de routes sont disponibles depuis Dexie local (db.routeTemplates)
AND   les mutations (create/update/delete) sont enqueued et syncées au retour réseau
```

**AC8 — Qualité**

```
GIVEN  les fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
AND    pnpm db:generate + pnpm db:migrate : migration propre pour route_template
```

---

## Modèle de données — Table `route_template`

### Drizzle schema (à ajouter dans `src/lib/schema.ts`)

```typescript
export const routeTemplate = pgTable(
  "route_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nom: text("nom").notNull(),                          // ex: "Niamey → Zinder"
    originCountry: text("origin_country").notNull(),     // ex: "NE"
    originCity: text("origin_city").notNull(),           // ex: "Niamey"
    destinationCountry: text("destination_country").notNull(),
    destinationCity: text("destination_city").notNull(),
    distanceKm: real("distance_km"),                     // optionnel
    tarifFcfa: integer("tarif_fcfa"),                    // entier FCFA, optionnel
    deletedAt: timestamp("deleted_at"),                  // soft delete
    companyId: uuid("company_id"),                       // tenant seam
    pays: text("pays").default("NE"),                    // i18n seam
    revision: integer("revision").notNull().default(0),  // sync seam
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_route_template_company_id").on(t.companyId),
    index("idx_route_template_deleted_at").on(t.deletedAt),
  ]
);
```

### Interface Dexie (à ajouter dans `src/lib/local-db.ts`)

```typescript
export interface RouteTemplateLocal {
  id: string;
  nom: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  distanceKm?: number;
  tarifFcfa?: number;
  deletedAt?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}
```

### Dexie version 3 (LocalDatabase)

Ajouter la table `routeTemplates` dans `LocalDatabase.constructor()` :

```typescript
// Version 3 — ajout routeTemplates (Story 6-5)
this.version(3).stores({
  routeTemplates: "id, nom, companyId, pays, deletedAt, revision",
});
```

Et déclarer la propriété :

```typescript
routeTemplates!: EntityTable<RouteTemplateLocal, "id">;
```

---

## Périmètre de cette story

**CRÉER :**
- `src/app/(app)/parametres/modeles/page.tsx` — page CRUD (Server Component wrapper + Client Component)
- `src/components/settings/route-template-manager.tsx` — liste + formulaire CRUD (Client Component)
- `src/hooks/use-live-route-templates.ts` — liveQuery Dexie sur db.routeTemplates
- `src/lib/validation/route-template.ts` — schéma Zod partagé client/serveur
- `drizzle/XXXX_route_template.sql` — migration générée par pnpm db:generate

**MODIFIER :**
- `src/lib/schema.ts` — ajouter table `routeTemplate`
- `src/lib/local-db.ts` — ajouter interface `RouteTemplateLocal` + version 3 Dexie + propriété `routeTemplates`
- `src/lib/permissions.ts` — ajouter actions `route-template.create/read/update/delete`
- `src/lib/sync/outbox.ts` — ajouter `"routeTemplate"` à `SyncOpEntity` + `getEntityTable()` switch
- `src/app/api/v1/sync/push/route.ts` — ajouter handler pour entity = `"routeTemplate"`
- `src/components/quote/wizard-step-route.tsx` — ajouter chips de sélection modèles (si modèles disponibles)
- `src/messages/fr-NE.json` — ajouter section `routeTemplates`

**EXCLU :**
- Logique de tarification automatique (le tarifFcfa pré-remplit unitPrice, l'utilisateur peut modifier)
- Gating dur basé sur un vrai système de tiers (MVP-1 = gating UI simple, pas de DB tier)
- Analytics ou recommandation de corridors

---

## Tâches / Sous-tâches

### T1 — Schema Drizzle + migration

- [x] Ajouter `routeTemplate` dans `src/lib/schema.ts` (voir définition ci-dessus)
- [x] `pnpm db:generate` — génère migration dans `drizzle/`
- [x] `pnpm db:migrate` — applique la migration
- [x] `pnpm typecheck` — zéro erreur

### T2 — Schema Dexie + interface locale

- [x] Ajouter `RouteTemplateLocal` à `src/lib/local-db.ts`
- [x] Ajouter `routeTemplates!: EntityTable<RouteTemplateLocal, "id">` à `LocalDatabase`
- [x] Ajouter version 5 dans le constructeur (version 3 et 4 déjà prises)
- [x] Mettre à jour `SyncOpEntity` dans `src/lib/local-db.ts` pour inclure `"routeTemplate"`
- [x] `pnpm typecheck` — zéro erreur

### T3 — Validation Zod partagée

- [x] Créer `src/lib/validation/route-template.ts`
- [x] `pnpm typecheck` — zéro erreur

### T4 — Permissions

- [x] Ajouter dans `src/lib/permissions.ts` les nouvelles actions
- [x] Ajouter dans `PERMISSION_MATRIX` pour admin/commercial/operateur
- [x] `pnpm typecheck` — zéro erreur

### T5 — Sync outbox : ajouter entity "routeTemplate"

- [x] `SyncOpEntity` mis à jour (inclus dans T2)
- [x] `src/lib/sync/outbox.ts` : case `"routeTemplate"` dans `getEntityTable()`
- [x] `src/lib/sync/conflict.ts` : case `"routeTemplate"` ajouté (requis car SyncOpEntity étendu)
- [x] `pnpm typecheck` — zéro erreur

### T6 — API server : handler sync push pour routeTemplate

- [x] `"routeTemplate"` ajouté à l'enum `entity` du `SyncOpSchema`
- [x] Import `routeTemplate as routeTemplateTable` + `routeTemplateSchema`
- [x] `resolveEntityAction` : mapping explicite `routeTemplate` → `route-template.*`
- [x] `fetchCurrentEntity` : case `"routeTemplate"`
- [x] `persistEntityMutation` : case `"routeTemplate"` (soft delete + upsert)
- [x] Handler d'erreur `route_template_payload_invalid` dans POST
- [x] `pnpm typecheck` — zéro erreur

### T7 — Hook liveQuery

- [x] Créer `src/hooks/use-live-route-templates.ts` (pattern identique à `use-live-templates.ts`)
- [x] `pnpm typecheck` — zéro erreur

### T8 — Composant RouteTemplateManager

- [x] Créer `src/components/settings/route-template-manager.tsx`
- [x] Liste avec skeleton, état vide, CRUD complet
- [x] `canManage` prop : si false → message proGate au lieu des boutons d'édition
- [x] Soft delete via applyLocalMutation update + deletedAt
- [x] `pnpm typecheck` — zéro erreur

### T9 — Page `/parametres/modeles`

- [x] Créer `src/app/(app)/parametres/modeles/page.tsx`
- [x] SSR auth + role check + prop `canManage` + `userId`
- [x] `pnpm typecheck` — zéro erreur

### T10 — Intégration wizard : chips de sélection (wizard-step-route.tsx)

- [x] Import `useLiveRouteTemplates` + `RouteTemplateLocal`
- [x] `showDynamicChips = templates.length > 0` : chips dynamiques si modèles Dexie, sinon CORRIDORS statiques (fallback MVP-0 préservé)
- [x] `applyTemplate()` : remplit originCountry/City, destinationCountry/City + `templateUnitPrice`
- [x] `handleNext` : inclut `unitPrice: templateUnitPrice` dans le payload si template sélectionné
- [x] `src/components/quote/wizard-step-goods.tsx` : `useEffect` seed `unitPrice` depuis Dexie au montage
- [x] `pnpm typecheck` — zéro erreur

### T11 — i18n

- [x] Section `"routeTemplates"` ajoutée dans `src/messages/fr-NE.json`

### T12 — Vérification finale (AC8)

- [x] `pnpm check` : lint 0 erreur, typecheck ✓, 215 tests passent sans régression
- [x] `pnpm build` : passe sans erreur — `/parametres/modeles` dans les routes
- [x] `pnpm db:generate` + `pnpm db:migrate` : migration `drizzle/0010_chilly_iron_man.sql` appliquée proprement
- [x] `src/lib/sync/sw-db.ts` : version 5 ajoutée (concordance sw-db ↔ local-db test passe)

---

## Dev Notes

### CRITIQUE — Nouveau entity "routeTemplate" dans SyncOpEntity

`SyncOpEntity` dans `src/lib/local-db.ts` doit inclure `"routeTemplate"`. `getEntityTable()` dans `outbox.ts` doit avoir le case correspondant. Le handler sync push côté serveur doit accepter `entity = "routeTemplate"` dans l'enum Zod.

```typescript
// src/lib/local-db.ts — MODIFIER
export type SyncOpEntity =
  | "client"
  | "quote"
  | "quoteLine"
  | "clause"
  | "company"
  | "template"
  | "routeTemplate";  // ← AJOUTER

// src/lib/sync/outbox.ts — MODIFIER getEntityTable()
case "routeTemplate":
  return db.routeTemplates as unknown as EntityTable<Record<string, unknown>, string>;
```

### CRITIQUE — Migration Drizzle obligatoire (ne pas utiliser db:push)

```bash
# CORRECT
pnpm db:generate   # crée drizzle/XXXX_route_template.sql
pnpm db:migrate    # applique en base

# INTERDIT
pnpm db:push       # jamais en production
```

### CRITIQUE — Dexie version 3 : upgrade path préservé

Les versions Dexie sont cumulatives. NE PAS modifier les versions 1 et 2 existantes :

```typescript
constructor() {
  super("quotation-local");

  // Version 1 — NE PAS MODIFIER
  this.version(1).stores({ ... });

  // Version 2 — NE PAS MODIFIER
  this.version(2).stores({ ... });

  // Version 3 — NOUVELLE
  this.version(3).stores({
    routeTemplates: "id, nom, companyId, pays, deletedAt, revision",
  });
}
```

### CRITIQUE — Gating tier Pro en MVP-1

En MVP-1, le gating est simplifié : seul le rôle Admin peut créer des modèles (permission matrix). La vérification de tier réel (Starter / Pro / Entreprise) sera implémentée en Story 6-2. Pour MVP-1 :
- **UI** : La section CRUD est affichée uniquement si `can(role, "route-template.create")` → Admin
- **Server** : `requirePermission(role, "route-template.create")` → 403 si pas Admin
- Un message "Fonctionnalité Pro" peut être affiché pour les non-Admin comme indice UX

### CRITIQUE — Application au devis : copie de valeurs, PAS de référence

Quand un modèle est appliqué dans le wizard, les valeurs sont **copiées** dans les champs du devis. Le devis ne stocke PAS l'ID du modèle de route. Cela garantit que :
- La modification d'un modèle ne modifie pas les devis existants
- La suppression d'un modèle n'affecte pas les devis existants

```typescript
// CORRECT — copie des valeurs dans le formulaire react-hook-form
function applyTemplate(t: RouteTemplateLocal) {
  setValue("originCountry", t.originCountry);
  setValue("originCity", t.originCity);
  setValue("destinationCountry", t.destinationCountry);
  setValue("destinationCity", t.destinationCity);
  if (t.tarifFcfa !== undefined) {
    setValue("unitPrice", t.tarifFcfa); // pré-remplit le tarif
  }
}

// INCORRECT — stocker l'ID du modèle dans le devis
setValue("routeTemplateId", t.id); // ← INTERDIT, crée dépendance
```

### CRITIQUE — tarifFcfa est un entier FCFA

Le champ `tarifFcfa` est un entier (XOF sans sous-unité). Dans le formulaire :
- Input de type number avec step="1" (pas de décimales)
- Validation Zod `z.number().int().nonnegative()`
- En JSON via sync : entier (pas de float)

### CRITIQUE — Pattern applyLocalMutation pour routeTemplate

```typescript
// CREATE
await applyLocalMutation(
  "routeTemplate",
  newId,
  "create",
  { id: newId, nom, originCountry, originCity, destinationCountry, destinationCity,
    distanceKm, tarifFcfa, deletedAt: undefined, companyId, pays: "NE",
    revision: 0, updatedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
  0, // baseRevision
  async () => {
    await db.routeTemplates.add({ id: newId, ... });
  },
  userId, // createdBy
);

// DELETE (soft delete)
await applyLocalMutation(
  "routeTemplate",
  template.id,
  "update",
  { ...template, deletedAt: new Date().toISOString() },
  template.revision,
  async () => {
    await db.routeTemplates.update(template.id, { deletedAt: new Date().toISOString() });
  },
);
```

### CRITIQUE — Presets codés en dur (UX-DR20) et relation avec Story 3-2

Story 3-2 (route-entry) a implémenté des chips de corridor pré-définis (presets codés en dur). En MVP-1 :
- Si des modèles de routes Dexie existent → afficher les chips dynamiques (depuis db.routeTemplates)
- Si aucun modèle Dexie → afficher les presets statiques MVP-0 (fallback, ne pas casser)
- **NE PAS supprimer les presets MVP-0** — ils restent comme fallback

```typescript
// wizard-step-route.tsx
const { templates } = useLiveRouteTemplates();

// Si templates disponibles → chips dynamiques
// Sinon → presets statiques existants (MVP-0 fallback)
const showDynamicChips = templates.length > 0;
```

### Pièges & Anti-patterns

| INTERDIT | CORRECT |
|---|---|
| `pnpm db:push` pour la migration | `pnpm db:generate` → `pnpm db:migrate` |
| Modifier versions 1 ou 2 de Dexie | Ajouter version 3 seulement |
| Stocker `routeTemplateId` sur le devis | Copier les valeurs dans les champs du wizard |
| `tarifFcfa` float | `tarifFcfa` entier int FCFA |
| Supprimer les presets MVP-0 du wizard | Les garder comme fallback si aucun modèle Dexie |
| CRUD sans vérification permission côté serveur | `requirePermission(role, "route-template.create")` sur chaque mutation API |
| Hard-delete des modèles | Soft delete via `deletedAt` (même pattern que template ligne) |

### Héritage des stories précédentes

**Story 3-2 (route-entry) — wizard-step-route.tsx à MODIFIER :**
- Les chips de corridor existants (presets statiques) doivent rester comme fallback
- Ajouter le hook `useLiveRouteTemplates()` + affichage conditionnel des chips dynamiques

**Story 3-5 (reusable-line-templates) — pattern à REPRODUIRE :**
- `TemplateManager` dans `src/components/settings/` → `RouteTemplateManager` même structure
- `useLiveTemplates()` (ou similaire) → `useLiveRouteTemplates()` même pattern liveQuery
- `applyLocalMutation` pour les mutations → même pattern

**Story 2-6 (create-client) et story 2-3 (company-info) — pattern Server Component page :**
- `parametres/page.tsx` → même structure SSR seed + `getSessionWithRole()` + redirect

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Schema + migration
# → Editer src/lib/schema.ts
# → Editer src/lib/local-db.ts
pnpm db:generate   # crée le fichier migration
pnpm db:migrate    # applique

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build
```

---

## Références

- [Epics §Story 6.5] — FR-NEW-ROUTES (CRUD routes/corridors, départ/arrivée, distance, tarif, applic devis, tier Pro §12)
- [UX-DR20] — Wizard 5 étapes, presets corridors chips dans step Trajet
- [src/lib/schema.ts] — modèle à suivre pour la table (company, client, template)
- [src/lib/local-db.ts] — interface Dexie + version upgrade pattern
- [src/lib/permissions.ts] — matrice RBAC à MODIFIER
- [src/lib/sync/outbox.ts] — `getEntityTable()` + `SyncOpEntity` à MODIFIER
- [src/app/api/v1/sync/push/route.ts] — handler entity routeTemplate à AJOUTER
- [src/components/settings/template-manager.tsx] — pattern CRUD à reproduire
- [src/components/quote/wizard-step-route.tsx] — à MODIFIER pour chips dynamiques
- [src/lib/validation/clause.ts] — pattern Zod à reproduire pour route-template.ts
- [Architecture §Pattern: route every local write through applyLocalMutation]
- [Architecture §Naming: Table route_template, colonnes snake_case, index idx_route_template_*]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Dexie déjà à version 4 (story spec disait version 3) → ajout version 5
- `conflict.ts` avait le même `getEntityTable` sans `"routeTemplate"` → switch non-exhaustif → ajouté
- `resolveEntityAction` : `"routeTemplate"` (camelCase) → `"route-template.*"` (kebab) → mapping explicite requis
- `exactOptionalPropertyTypes` : reconstruction explicite de `RouteTemplateLocal` sans spread d'undefined
- `wizard-step-goods.tsx` : `useEffect` seed depuis Dexie pour récupérer `unitPrice` pré-rempli par le template

### Completion Notes List

- T1 ✅ Table `route_template` ajoutée, migration `drizzle/0010_chilly_iron_man.sql` appliquée
- T2 ✅ `RouteTemplateLocal` + version 5 Dexie + `SyncOpEntity` étendu
- T3 ✅ `src/lib/validation/route-template.ts` créé
- T4 ✅ 4 actions `route-template.*` dans permissions.ts + PERMISSION_MATRIX
- T5 ✅ outbox.ts + conflict.ts mis à jour
- T6 ✅ push/route.ts : enum, imports, resolveEntityAction, fetchCurrentEntity, persistEntityMutation, error handler
- T7 ✅ `use-live-route-templates.ts` créé (pattern identique à use-live-templates)
- T8 ✅ `RouteTemplateManager` : CRUD inline (list/create/edit), soft delete, `canManage` prop
- T9 ✅ `/parametres/modeles` page créée
- T10 ✅ chips dynamiques wizard (fallback presets MVP-0 préservé) + pre-fill unitPrice cross-step via Dexie seed
- T11 ✅ section `routeTemplates` i18n ajoutée
- T12 ✅ 215 tests ✓, typecheck ✓, build ✓, migration ✓

### File List

- `src/lib/schema.ts` (modifié — table routeTemplate ajoutée)
- `src/lib/local-db.ts` (modifié — RouteTemplateLocal + version 5 + SyncOpEntity)
- `src/lib/permissions.ts` (modifié — actions route-template.*)
- `src/lib/validation/route-template.ts` (créé)
- `src/lib/sync/outbox.ts` (modifié — case routeTemplate dans getEntityTable)
- `src/lib/sync/conflict.ts` (modifié — case routeTemplate pour exhaustivité switch)
- `src/lib/sync/sw-db.ts` (modifié — version 5 pour concordance avec local-db)
- `src/app/api/v1/sync/push/route.ts` (modifié — entity routeTemplate complet)
- `src/hooks/use-live-route-templates.ts` (créé)
- `src/components/settings/route-template-manager.tsx` (créé)
- `src/app/(app)/parametres/modeles/page.tsx` (créé)
- `src/components/quote/wizard-step-route.tsx` (modifié — chips dynamiques + pre-fill)
- `src/components/quote/wizard-step-goods.tsx` (modifié — seed unitPrice depuis Dexie)
- `src/messages/fr-NE.json` (modifié — section routeTemplates)
- `drizzle/0010_chilly_iron_man.sql` (généré par db:generate)
- `drizzle/meta/0010_snapshot.json` (généré par db:generate)
- `drizzle/meta/_journal.json` (mis à jour par db:generate)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour — review)
- `_bmad-output/implementation-artifacts/6-5-route-corridor-templates-crud.md` (ce fichier)

### Review Findings

- [x] [Review][Patch] Commercial voit bannière "Fonctionnalité Pro" malgré accès read légitime [`src/components/settings/route-template-manager.tsx` + `src/app/(app)/parametres/modeles/page.tsx`] — `canManage = can(role, "route-template.create")` est `false` pour commercial, ce qui déclenche `{!canManage && <p>{t("proGate")}</p>}`. Mais commercial a `route-template.read = true` et voit déjà la liste. La bannière "upgrade" s'affiche pour un utilisateur qui n'a pas besoin d'upgrader. Fix : ajouter prop `canRead` dérivée de `can(role, "route-template.read")` et conditionner la bannière sur `!canRead`.
- [x] [Review][Defer] Contraintes DB manquantes sur `route_template` (pas de FK, `company_id` nullable, `pays` nullable) [`drizzle/0010_chilly_iron_man.sql`] — deferred, pattern pré-existant sur toutes les tables tenant-scoped du projet
- [x] [Review][Defer] `wizard-step-goods.tsx` useEffect([], []) ne re-seed pas `unitPrice` si user revient à l'étape route et change de template (ou si `tarifFcfa=0`) [`src/components/quote/wizard-step-goods.tsx:50`] — deferred, dépend du cycle de vie du composant wizard (remount vs stay-mounted) ; vérifier empiriquement
- [x] [Review][Defer] `useLiveRouteTemplates` absorbe silencieusement toutes les erreurs Dexie — état "pas de templates" indiscernable d'une erreur DB [`src/hooks/use-live-route-templates.ts:26`] — deferred, pattern pré-existant (`use-live-company.ts`, etc.)
- [x] [Review][Defer] Cast `as unknown as EntityTable` dans `conflict.ts` et `outbox.ts` contourne le système de types pour `routeTemplate` [`src/lib/sync/conflict.ts:23`, `src/lib/sync/outbox.ts:26`] — deferred, pattern pré-existant sur toutes les entités
- [x] [Review][Defer] Delete op sur entité inexistante → Drizzle update no-op, enregistré "applied" dans syncOpLog sans lignes affectées [`src/app/api/v1/sync/push/route.ts`] — deferred, pattern pré-existant sur toutes les entités (client, template, etc.)
- [x] [Review][Defer] Pull transaction + `localCrypto.encrypt` async peut avorter la transaction IDB sur appareils lents [`src/lib/sync/pull.ts:57`] — deferred, pré-existant (affecte toutes les entités dans la même transaction)
- [x] [Review][Defer] delete+create du même template dans un même batch → 409 sur le create (delete bumpe la revision, create avec baseRevision périmée) [`src/app/api/v1/sync/push/route.ts`] — deferred, faible probabilité MVP-1
- [x] [Review][Defer] Chips statiques → dynamiques au chargement Dexie : sélection de chip statique avant load disparaît visuellement sans affecter les champs [`src/components/quote/wizard-step-route.tsx`] — deferred, UX jank non-bloquant
- [x] [Review][Defer] Curseur pull utilise `gt` (strict) au lieu de `gte` — race pré-existante : enregistrement updatedAt == cursor exclus du pull suivant [`src/app/api/v1/sync/pull/route.ts:85`] — deferred, pré-existant sur toutes les entités
- [x] [Review][Defer] `useLiveRouteTemplates` utilise `.filter()` (scan complet) au lieu de l'index `deletedAt` — performance sur grand volume de tombstones [`src/hooks/use-live-route-templates.ts:19`] — deferred, performance, négligeable MVP-1

### Change Log

- 2026-06-29 : Implémentation complète Story 6.5 — CRUD modèles de routes/corridors, sync serveur, chips wizard, migration Drizzle, Dexie v5
- 2026-06-27 : Code review — 1 patch, 10 deferred, 18 dismissed
