---
story_key: 3-7-standard-clauses-library
epic_num: 3
story_num: 7
status: ready-for-dev
baseline_commit: ""
---

# Story 3.7 : Bibliothèque de clauses standards (FR-26)

**Statut :** ready-for-dev

## Story

**En tant qu'** administrateur,
**Je veux** gérer une bibliothèque de clauses standards (CRUD),
**Afin que** les commerciaux réutilisent des clauses validées sur leurs devis.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage de la bibliothèque (Admin)**

```
GIVEN  la page /parametres (accès Admin, role = "admin")
WHEN   l'admin consulte la section "Bibliothèque de clauses"
THEN   ClauseManager s'affiche avec la liste des clauses depuis db.clauses (liveQuery)
AND    chaque clause affiche : titre + catégorie (si définie) + extrait du contenu (≤80 chars)
AND    un bouton "Ajouter une clause" est visible
AND    les clauses sont groupées par catégorie (Paiement, Responsabilité, Exclusions, Autres)
```

**AC2 — Créer une clause**

```
GIVEN  le formulaire de création de clause
WHEN   l'admin saisit titre, contenu (≤2000 caractères) et catégorie
THEN   titre et contenu sont obligatoires
AND    catégorie est optionnelle (valeurs : "Paiement" | "Responsabilité" | "Exclusions" | autre texte libre)
AND    contenu affiché avec compteur de caractères restants

WHEN   l'admin soumet
THEN   applyLocalMutation("clause", id, "create", payload, 0, dexieWriteFn, userId) appelé
AND    db.clauses.put({ id, titre, contenu, categorie, pays, revision: 0, updatedAt, createdAt }) dans dexieWriteFn
AND    void triggerSync() appelé après
AND    la nouvelle clause apparaît dans la liste (liveQuery)
AND    toast "Clause « {titre} » créée" confirme
```

**AC3 — Modifier une clause**

```
GIVEN  une clause existante
WHEN   l'admin clique "Modifier"
THEN   le formulaire est pré-rempli avec titre, contenu, catégorie existants

WHEN   l'admin soumet les modifications
THEN   dbClause = await db.clauses.get(id)
AND    applyLocalMutation("clause", id, "update", payload, dbClause.revision, dexieWriteFn, userId)
AND    db.clauses.put({ ...dbClause, titre, contenu, categorie, updatedAt }) dans dexieWriteFn
AND    void triggerSync() après
AND    toast "Clause mise à jour" confirme
```

**AC4 — Supprimer une clause**

```
GIVEN  une clause existante
WHEN   l'admin clique "Supprimer" et confirme
THEN   dbClause = await db.clauses.get(id)
AND    applyLocalMutation("clause", id, "delete", {}, dbClause.revision, dexieWriteFn, userId)
AND    db.clauses.delete(id) dans dexieWriteFn
AND    void triggerSync() après
AND    la clause disparaît de la liste (liveQuery)
```

**AC5 — Disponibilité offline**

```
GIVEN  une synchronisation précédente qui a ramené les clauses
WHEN   l'utilisateur est hors ligne
THEN   les clauses sont disponibles dans db.clauses (Dexie)
AND    l'Admin peut créer/modifier/supprimer (via outbox, sync au retour réseau)
```

**AC6 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/settings/clause-manager.tsx` — CRÉER : CRUD clauses (Admin)
- `src/hooks/use-live-clauses.ts` — CRÉER : liveQuery Dexie sur clauses
- `src/app/(app)/parametres/page.tsx` — UPDATE : importer ClauseManager (admin only)
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `parametres.clauses`

**EXCLU (déjà implémenté — NE PAS MODIFIER) :**
- `src/lib/schema.ts` — table `clause` déjà définie (id, titre, contenu, categorie, companyId, pays, revision, updatedAt, createdAt)
- `src/lib/local-db.ts` — `ClauseLocal` + `clauses` Dexie déjà présents
- `src/app/api/v1/sync/push/route.ts` — `case "clause"` opérationnel (lignes 345-364)
- `src/app/api/v1/sync/pull/route.ts` — clauses déjà retournées dans le delta
- `src/lib/sync/pull.ts` — clauses déjà hydratées dans Dexie
- `src/lib/permissions.ts` — `clause.create/read/update/delete` déjà définis
- Aucune migration DB nécessaire

---

## Tâches / Sous-tâches

### T1 — Créer `src/hooks/use-live-clauses.ts`

- [ ] Créer le fichier (pattern exact : `use-live-templates.ts`)
  ```ts
  "use client";

  import { useState, useEffect } from "react";
  import { liveQuery } from "dexie";
  import { db } from "@/lib/local-db";
  import type { ClauseLocal } from "@/lib/local-db";

  export function useLiveClauses(): ClauseLocal[] {
    const [clauses, setClauses] = useState<ClauseLocal[]>([]);

    useEffect(() => {
      const subscription = liveQuery(() =>
        db.clauses.toArray()
      ).subscribe({
        next: (items) => setClauses(items),
        error: () => setClauses([]),
      });

      return () => subscription.unsubscribe();
    }, []);

    return clauses;
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/settings/clause-manager.tsx`

- [ ] `"use client"` première ligne
- [ ] Imports :
  ```ts
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { ClauseLocal } from "@/lib/local-db";
  import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
  import { useLiveClauses } from "@/hooks/use-live-clauses";
  import { useToast } from "@/hooks/use-toast";
  ```
- [ ] Props :
  ```ts
  interface ClauseManagerProps {
    userId: string;
  }
  ```
- [ ] État local :
  ```ts
  const clauses = useLiveClauses();
  const t = useTranslations("parametres.clauses");
  const { toast } = useToast();
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingClause, setEditingClause] = useState<ClauseLocal | null>(null);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [categorie, setCategorie] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);
  ```
- [ ] Constante catégories prédéfinies : `["Paiement", "Responsabilité", "Exclusions"]`
- [ ] Fonctions `openCreate()`, `openEdit(clause: ClauseLocal)`, validation `validateForm()`, `handleSubmit()`, `handleDelete(clause: ClauseLocal)`
- [ ] `handleSubmit()` :
  - create → `applyLocalMutation("clause", crypto.randomUUID(), "create", { titre, contenu, categorie, pays: "NE", updatedAt, createdAt }, 0, dexieWriteFn, userId)` + `triggerSync()` + toast
  - edit → lire `dbClause.revision` avant, update, `triggerSync()` + toast
- [ ] `handleDelete()` : lire revision avant, delete, `triggerSync()`
- [ ] Rendu "list" : clauses groupées par catégorie, bouton "Ajouter une clause", cartes clause avec extrait contenu (80 chars), boutons Modifier/Supprimer
- [ ] Rendu "create"/"edit" : formulaire avec champs titre + textarea contenu (compteur ≤2000 chars) + select catégorie + actions Annuler/Enregistrer
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/app/(app)/parametres/page.tsx`

- [ ] Importer `ClauseManager` :
  ```ts
  import { ClauseManager } from "@/components/settings/clause-manager";
  ```
- [ ] Ajouter section ClauseManager (admin only, après TemplateManager) :
  ```tsx
  {can(role, "clause.create") && (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <ClauseManager userId={userId} />
    </div>
  )}
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter section `parametres.clauses` :
  ```json
  "clauses": {
    "heading": "Bibliothèque de clauses",
    "addClause": "Ajouter une clause",
    "createHeading": "Nouvelle clause",
    "editHeading": "Modifier la clause",
    "backToList": "Retour à la liste",
    "empty": "Aucune clause définie.",
    "titreLabel": "Titre",
    "titrePlaceholder": "Ex : Conditions de force majeure",
    "titreRequired": "Le titre est requis",
    "contenuLabel": "Contenu",
    "contenuPlaceholder": "Rédigez la clause ici…",
    "contenuRequired": "Le contenu est requis",
    "contenuMaxLength": "Le contenu ne peut pas dépasser 2000 caractères",
    "contenuCounter": "{count}/2000",
    "categorieLabel": "Catégorie",
    "categoriePlaceholder": "Sélectionner ou saisir une catégorie",
    "categorieOptions": {
      "paiement": "Paiement",
      "responsabilite": "Responsabilité",
      "exclusions": "Exclusions"
    },
    "categorieAutre": "Autre",
    "noCategory": "Sans catégorie",
    "edit": "Modifier",
    "delete": "Supprimer",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "saving": "Enregistrement…",
    "successCreated": "Clause « {titre} » créée",
    "successUpdated": "Clause mise à jour",
    "errorGeneric": "Une erreur est survenue. Veuillez réessayer."
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC6)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] Admin : page /parametres affiche section "Bibliothèque de clauses" ✓
- [ ] Admin : créer une clause avec titre + contenu + catégorie → apparaît dans la liste ✓
- [ ] Admin : modifier une clause → changements persistés ✓
- [ ] Admin : supprimer une clause → disparaît de la liste ✓
- [ ] Compteur de caractères visible et bloquant au-delà de 2000 ✓
- [ ] Clauses groupées par catégorie ✓
- [ ] Aucune régression sur les stories précédentes ✓

---

## Dev Notes

### CRITIQUE — ClauseLocal : structure Dexie existante

```typescript
// src/lib/local-db.ts
export interface ClauseLocal {
  id: string;
  titre: string;
  contenu: string;
  categorie?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}
```

`categorie` est optionnel — ne pas inclure si vide pour respecter `exactOptionalPropertyTypes`. Pattern :

```typescript
// CORRECT
const record: ClauseLocal = {
  id,
  titre: titre.trim(),
  contenu: contenu.trim(),
  ...(categorie.trim() ? { categorie: categorie.trim() } : {}),
  pays: "NE",
  revision: 0,
  updatedAt: now,
  createdAt: now,
};

// INCORRECT
const record = { ..., categorie: undefined };
```

### CRITIQUE — Pattern applyLocalMutation pour "clause"

`"clause"` est un `SyncOpEntity` valide. La logique push est déjà opérationnelle (push/route.ts lignes 345-364 : upsert avec titre, contenu, categorie, companyId, pays, revision).

```typescript
// CORRECT — créer une clause
await applyLocalMutation(
  "clause",
  id,           // crypto.randomUUID() pré-généré
  "create",
  { titre, contenu, categorie, pays: "NE", updatedAt: now, createdAt: now },
  0,            // baseRevision = 0 pour nouvelle entité
  async () => { await db.clauses.put(record); },
  userId
);

// CORRECT — supprimer (delete réel en Dexie, server fait delete SQL)
await applyLocalMutation(
  "clause",
  clause.id,
  "delete",
  {},                      // payload vide pour delete
  dbClause.revision,       // lu AVANT le call
  async () => { await db.clauses.delete(clause.id); },
  userId
);
```

**IMPORTANT :** contrairement aux templates (qui font un soft delete serveur via `deletedAt`), les clauses font un hard delete SQL côté serveur (`await db.delete(clauseTable).where(eq(clauseTable.id, op.entityId))`). Côté Dexie : `db.clauses.delete(id)` (hard delete local également — pas de `deletedAt` dans ClauseLocal).

### CRITIQUE — Groupement par catégorie

Pour grouper les clauses par catégorie dans le rendu list :

```typescript
const CATEGORIES = ["Paiement", "Responsabilité", "Exclusions"];

// Grouper
const grouped = clauses.reduce<Record<string, ClauseLocal[]>>((acc, clause) => {
  const cat = clause.categorie ?? "__none__";
  (acc[cat] ??= []).push(clause);
  return acc;
}, {});

// Ordre d'affichage
const orderedCategories = [
  ...CATEGORIES.filter(c => grouped[c]?.length),
  ...Object.keys(grouped).filter(k => !CATEGORIES.includes(k) && k !== "__none__"),
  ...(grouped["__none__"]?.length ? ["__none__"] : []),
];
```

### CRITIQUE — Compteur caractères textarea

```tsx
<textarea
  value={contenu}
  onChange={e => {
    if (e.target.value.length <= 2000) {
      setContenu(e.target.value);
    }
  }}
  maxLength={2000}
  // ...
/>
<p className={`text-xs ${contenu.length > 1900 ? "text-destructive" : "text-text-muted"}`}>
  {t("contenuCounter", { count: contenu.length })}
</p>
```

### CRITIQUE — Pattern liveQuery dans le hook

Reproduire exactement `use-live-templates.ts` — utiliser `liveQuery(...).subscribe(...)` natif Dexie, pas de wrapper tiers.

### Design tokens — cohérence

```tsx
// Card clause (liste)
className="rounded-xl border border-border bg-surface p-4"

// Extrait contenu
className="mt-1 text-xs text-text-muted line-clamp-2"

// Catégorie badge
className="inline-flex items-center rounded-full bg-surface-alt px-2 py-0.5 text-xs font-medium text-text-secondary"

// Textarea
className="min-h-[120px] w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none"

// Select catégorie
className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
```

### Héritage des stories précédentes

- **Story 3.5 (template-manager.tsx)** — patron direct : state machine list/create/edit, CRUD via applyLocalMutation, pattern liveQuery hook, design tokens
- **Story 2.3 (company-form.tsx)** — pattern `can(role, action)` dans Server Component pour cacher le composant Admin-only
- **Architecture §Data** — "unitPrice stored as integer FCFA" ne s'applique pas aux clauses (pas de montants)

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration nécessaire — table clause existe déjà dans schema.ts
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.7] — FR-26 (bibliothèque clauses, CRUD, titre+contenu, catégories)
- [src/lib/local-db.ts] — `ClauseLocal` (structure complète), `clauses` table Dexie
- [src/lib/schema.ts:278-295] — table Drizzle `clause`
- [src/app/api/v1/sync/push/route.ts:345-364] — `case "clause"` déjà opérationnel
- [src/app/api/v1/sync/pull/route.ts:79-80] — clauses dans le delta pull
- [src/lib/permissions.ts] — `clause.create/read/update/delete` déjà définis
- [src/lib/sync/outbox.ts] — `applyLocalMutation`, `triggerSync`
- [src/hooks/use-live-templates.ts] — pattern liveQuery à reproduire
- [src/components/settings/template-manager.tsx] — patron direct pour clause-manager
- [src/app/(app)/parametres/page.tsx] — à modifier pour ajouter ClauseManager

---

## Dev Agent Record

### Agent Model Used

_à remplir_

### Debug Log References

_à remplir_

### Completion Notes List

_à remplir_

### File List

_à remplir_

### Change Log

_à remplir_
