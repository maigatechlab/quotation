---
story_key: 6-5-route-corridor-templates-crud
epic_num: 6
story_num: 5
status: ready-for-dev
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 6.5 : CRUD Modèles de Routes/Corridors (FR-NEW-ROUTES)

**Statut :** ready-for-dev

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

- [ ] Ajouter `routeTemplate` dans `src/lib/schema.ts` (voir définition ci-dessus)
- [ ] `pnpm db:generate` — génère migration dans `drizzle/`
- [ ] `pnpm db:migrate` — applique la migration
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Schema Dexie + interface locale

- [ ] Ajouter `RouteTemplateLocal` à `src/lib/local-db.ts`
- [ ] Ajouter `routeTemplates!: EntityTable<RouteTemplateLocal, "id">` à `LocalDatabase`
- [ ] Ajouter version 3 dans le constructeur
- [ ] Mettre à jour `SyncOpEntity` dans `src/lib/local-db.ts` pour inclure `"routeTemplate"`
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Validation Zod partagée

- [ ] Créer `src/lib/validation/route-template.ts` :
  ```typescript
  import { z } from "zod";

  export const routeTemplateSchema = z.object({
    nom: z.string().min(1, "Le nom est requis").max(100, "Nom trop long"),
    originCountry: z.string().min(1, "Le pays de départ est requis"),
    originCity: z.string().min(1, "La ville de départ est requise"),
    destinationCountry: z.string().min(1, "Le pays d'arrivée est requis"),
    destinationCity: z.string().min(1, "La ville d'arrivée est requise"),
    distanceKm: z.number().positive().optional(),
    tarifFcfa: z.number().int().nonnegative().optional(), // entier FCFA, jamais négatif
  });

  export type RouteTemplateInput = z.infer<typeof routeTemplateSchema>;
  ```

- [ ] `pnpm typecheck` — zéro erreur

### T4 — Permissions

- [ ] Ajouter dans `src/lib/permissions.ts` les nouvelles actions :
  ```typescript
  // Dans le type Action :
  | "route-template.create"
  | "route-template.read"
  | "route-template.update"
  | "route-template.delete"
  ```

- [ ] Ajouter dans `PERMISSION_MATRIX` :
  ```typescript
  admin: {
    // ... existant ...
    "route-template.create": true,
    "route-template.read": true,
    "route-template.update": true,
    "route-template.delete": true,
  },
  commercial: {
    // ... existant ...
    "route-template.create": false,  // lecture seule
    "route-template.read": true,
    "route-template.update": false,
    "route-template.delete": false,
  },
  operateur: {
    // ... existant ...
    "route-template.create": false,
    "route-template.read": true,
    "route-template.update": false,
    "route-template.delete": false,
  },
  ```

- [ ] `pnpm typecheck` — zéro erreur

### T5 — Sync outbox : ajouter entity "routeTemplate"

- [ ] Dans `src/lib/local-db.ts` : ajouter `"routeTemplate"` à `SyncOpEntity`
- [ ] Dans `src/lib/sync/outbox.ts` : ajouter le case dans `getEntityTable()` :
  ```typescript
  case "routeTemplate":
    return db.routeTemplates as unknown as EntityTable<Record<string, unknown>, string>;
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T6 — API server : handler sync push pour routeTemplate

- [ ] Dans `src/app/api/v1/sync/push/route.ts` :
  - Ajouter `"routeTemplate"` à l'enum `entity` du `SyncOpSchema`
  - Ajouter `routeTemplate as routeTemplateTable` dans les imports schema
  - Ajouter le handler dans le `switch (op.entity)` (ou table map) pour entity `"routeTemplate"`
  - Le handler doit : vérifier permission (`route-template.create/update/delete`), valider avec `routeTemplateSchema`, upsert dans PostgreSQL
- [ ] `pnpm typecheck` — zéro erreur

### T7 — Hook liveQuery

- [ ] Créer `src/hooks/use-live-route-templates.ts` :
  ```typescript
  "use client";

  import { useState, useEffect } from "react";
  import { liveQuery } from "dexie";
  import { db } from "@/lib/local-db";
  import type { RouteTemplateLocal } from "@/lib/local-db";

  export function useLiveRouteTemplates(): {
    templates: RouteTemplateLocal[];
    isLoading: boolean;
  } {
    const [templates, setTemplates] = useState<RouteTemplateLocal[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      const subscription = liveQuery(() =>
        db.routeTemplates
          .filter((t) => !t.deletedAt)
          .toArray()
      ).subscribe({
        next: (rows) => {
          setTemplates(rows);
          setIsLoading(false);
        },
        error: () => setIsLoading(false),
      });
      return () => subscription.unsubscribe();
    }, []);

    return { templates, isLoading };
  }
  ```

- [ ] `pnpm typecheck` — zéro erreur

### T8 — Composant RouteTemplateManager

- [ ] Créer `src/components/settings/route-template-manager.tsx` (Client Component) :
  - Liste des modèles avec nom + corridor + tarif
  - Bouton "Ajouter un modèle" → ouvre Sheet/Dialog avec formulaire
  - Formulaire avec les champs de `routeTemplateSchema`
  - Actions Modifier / Supprimer par ligne (admin uniquement)
  - Appel `applyLocalMutation` pour create/update/delete
  - Skeleton pendant `isLoading`
  - État vide avec message + CTA si aucun modèle
  - Gating tier Pro : si pas Pro, afficher message upgrade au lieu du formulaire
- [ ] Pattern gating tier Pro (simple pour MVP-1) :
  ```typescript
  // Le tier n'est pas en DB pour MVP-1 — utiliser un flag ou env var
  // Option pragmatique : le gating Admin seul suffit en MVP-1
  // (seul Admin peut créer = control de facto, le tier sera enforced en 6-2)
  // UI : afficher la section uniquement si role = "admin"
  ```

- [ ] `pnpm typecheck` — zéro erreur

### T9 — Page `/parametres/modeles`

- [ ] Créer `src/app/(app)/parametres/modeles/page.tsx` :
  ```tsx
  import { redirect } from "next/navigation";
  import { RouteTemplateManager } from "@/components/settings/route-template-manager";
  import { can } from "@/lib/permissions";
  import { getSessionWithRole } from "@/lib/session";

  export default async function ModelesPage() {
    const result = await getSessionWithRole();
    if (!result) redirect("/login");

    const { role } = result;
    const canManage = can(role, "route-template.create");

    return (
      <div className="flex flex-col gap-6 px-5 pt-8 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Paramètres
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
            Modèles de routes
          </h1>
        </div>
        <RouteTemplateManager canManage={canManage} />
      </div>
    );
  }
  ```

- [ ] `pnpm typecheck` — zéro erreur

### T10 — Intégration wizard : chips de sélection (wizard-step-route.tsx)

- [ ] Dans `src/components/quote/wizard-step-route.tsx` :
  - Importer `useLiveRouteTemplates`
  - Si `templates.length > 0`, afficher des chips avant les champs Trajet :
    ```tsx
    {templates.length > 0 && (
      <div className="flex flex-wrap gap-2 mb-4">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => applyTemplate(t)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-hover"
          >
            {t.nom}
          </button>
        ))}
      </div>
    )}
    ```
  - Fonction `applyTemplate(t: RouteTemplateLocal)` remplit les champs du formulaire :
    - `originCountry`, `originCity`, `destinationCountry`, `destinationCity`
    - `unitPrice` si `t.tarifFcfa` défini (via `setValue` react-hook-form)
  - Les champs restent modifiables (pas de disable)
- [ ] Ne pas modifier la logique de validation/calcul du wizard
- [ ] `pnpm typecheck` — zéro erreur

### T11 — i18n

- [ ] Ajouter dans `src/messages/fr-NE.json` :
  ```json
  "routeTemplates": {
    "pageTitle": "Modèles de routes",
    "addButton": "Ajouter un modèle",
    "editButton": "Modifier",
    "deleteButton": "Supprimer",
    "deleteConfirm": "Supprimer ce modèle de route ?",
    "emptyState": "Aucun modèle de route. Créez-en un pour accélérer la saisie de vos devis.",
    "proGate": "Fonctionnalité disponible en tier Pro. Contactez-nous pour upgrader.",
    "formNom": "Nom du corridor",
    "formOriginCountry": "Pays de départ",
    "formOriginCity": "Ville de départ",
    "formDestinationCountry": "Pays d'arrivée",
    "formDestinationCity": "Ville d'arrivée",
    "formDistanceKm": "Distance (km)",
    "formTarifFcfa": "Tarif prédéfini (FCFA)",
    "saveButton": "Enregistrer",
    "cancelButton": "Annuler"
  }
  ```

### T12 — Vérification finale (AC8)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] `pnpm db:generate` + `pnpm db:migrate` : migration propre
- [ ] CRUD complet fonctionne depuis /parametres/modeles ✓
- [ ] Les modèles créés apparaissent en chips dans le wizard Trajet ✓
- [ ] Tap sur chip pré-remplit les champs ✓
- [ ] Mutations enqueued dans syncQueue ✓

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

_À remplir par le dev agent_

### Debug Log References

_À remplir par le dev agent_

### Completion Notes List

_À remplir par le dev agent_

### File List

- `src/lib/schema.ts` (à modifier — table routeTemplate)
- `src/lib/local-db.ts` (à modifier — RouteTemplateLocal + version 3 + SyncOpEntity)
- `src/lib/permissions.ts` (à modifier — actions route-template.*)
- `src/lib/validation/route-template.ts` (à créer)
- `src/lib/sync/outbox.ts` (à modifier — case routeTemplate dans getEntityTable)
- `src/app/api/v1/sync/push/route.ts` (à modifier — entity routeTemplate)
- `src/hooks/use-live-route-templates.ts` (à créer)
- `src/components/settings/route-template-manager.tsx` (à créer)
- `src/app/(app)/parametres/modeles/page.tsx` (à créer)
- `src/components/quote/wizard-step-route.tsx` (à modifier — chips dynamiques)
- `src/messages/fr-NE.json` (à modifier — section routeTemplates)
- `drizzle/XXXX_route_template.sql` (généré par db:generate)
- `drizzle/meta/XXXX_snapshot.json` (généré par db:generate)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/6-5-route-corridor-templates-crud.md` (ce fichier)

### Change Log

_À remplir par le dev agent_
