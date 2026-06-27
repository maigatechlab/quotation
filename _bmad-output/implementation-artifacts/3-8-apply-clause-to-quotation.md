---
story_key: 3-8-apply-clause-to-quotation
epic_num: 3
story_num: 8
status: ready-for-dev
baseline_commit: ""
---

# Story 3.8 : Application de clauses & clause spécifique au devis (FR-27, FR-28)

**Statut :** ready-for-dev

## Story

**En tant que** commercial,
**Je veux** sélectionner des clauses standards et ajouter une clause spécifique à un devis,
**Afin que** le devis porte les conditions contractuelles adaptées à la situation.

---

## Critères d'acceptation (BDD)

**AC1 — Sélection de clauses standards dans l'étape Conditions (FR-27)**

```
GIVEN  le wizard étape 5 (Conditions) — WizardStepConditions (créé en Story 3.6)
WHEN   des clauses existent dans db.clauses (liveQuery)
THEN   une section "Clauses contractuelles" affiche les clauses disponibles en checkbox tiles (UX-DR11)
AND    chaque checkbox tile affiche : titre + extrait contenu (≤80 chars)
AND    les clauses sont groupées par catégorie
AND    multi-sélection possible (plusieurs clauses cochées simultanément)
```

**AC2 — Persistance des clauses sélectionnées**

```
GIVEN  des clauses cochées dans l'étape 5
WHEN   le commercial soumet (bouton "Terminer et sauvegarder")
THEN   pour chaque clause sélectionnée, un enregistrement QuoteClauseLocal est persisté :
         { id: crypto.randomUUID(), quoteId, clauseId, contenuOverride: null, ordre: idx, createdAt }
AND    les QuoteClauses sont persistées dans db.quoteClauses (Dexie) via une opération bulk
AND    l'ordre d'affichage = ordre de sélection (ordre croissant par idx)
AND    les clauses figées sur le devis sont indépendantes des modifications futures de la bibliothèque
```

**AC3 — Ajout d'une clause spécifique (texte libre) (FR-28)**

```
GIVEN  l'étape 5 Conditions
WHEN   le commercial saisit une clause spécifique (texte libre dans le champ dédié)
THEN   la clause spécifique est ajoutée après les clauses standards sélectionnées
AND    elle est persistée dans db.quoteClauses avec { clauseId: null, contenuOverride: texte, ordre: idx }

WHEN   le commercial coche "Enregistrer comme modèle dans la bibliothèque"
THEN   une nouvelle clause est créée dans db.clauses via applyLocalMutation("clause", ...)
AND    la clause spécifique est liée à cette nouvelle clause (clauseId renseigné)
```

**AC4 — Ordre ajustable des clauses**

```
GIVEN  plusieurs clauses sélectionnées (standards + spécifique)
WHEN   le commercial réordonne via les boutons haut/bas (MVP-0, pas de drag & drop ici)
THEN   l'ordre est mis à jour localement avant persistance
AND    l'ordre final est respecté dans le PDF
```

**AC5 — Aucune clause disponible**

```
GIVEN  db.clauses est vide et aucune clause spécifique saisie
WHEN   le commercial arrive à l'étape 5
THEN   la section clauses affiche "Aucune clause définie. Vous pouvez ajouter une clause spécifique ci-dessous."
AND    le devis est valide sans clause (clauses optionnelles)
```

**AC6 — Disponibilité offline**

```
GIVEN  une synchronisation précédente qui a ramené les clauses
WHEN   l'utilisateur est hors ligne
THEN   les clauses sont disponibles dans db.clauses pour sélection
AND    les QuoteClauses sont persistées localement (db.quoteClauses)
```

**AC7 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/quote/wizard-step-conditions.tsx` — UPDATE : ajouter sélection clauses + clause spécifique (complète l'étape 5 créée en Story 3.6)
- `src/lib/local-db.ts` — UPDATE : ajouter interface `QuoteClauseLocal` + table Dexie `quoteClauses`
- `src/hooks/use-live-clauses.ts` — déjà créé en Story 3.7 (NE PAS MODIFIER)
- `src/messages/fr-NE.json` — UPDATE : compléter keys `devis.wizard.conditions` pour clauses

**EXCLU :**
- `src/lib/schema.ts` — tables `quote_clause` et `clause` déjà définies
- `src/app/api/v1/sync/push/route.ts` — **`case "quoteClause"` N'EXISTE PAS encore** — voir note critique ci-dessous
- Aucune migration DB nécessaire pour Dexie (version bump via `this.version(3)`)

**NOTE IMPORTANTE — Sync des QuoteClauses :**
Les `QuoteClause` sont des données associées au devis. En MVP-0, elles sont stockées localement dans Dexie et incluses dans le payload `quote` lors du sync (comme `clientSnapshot`). Le serveur les reçoit dans `quote.clauseIds` (tableau d'IDs ordonnés) et crée les `quote_clause` côté PostgreSQL. Voir section Dev Notes pour le détail.

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `src/lib/local-db.ts` : ajouter QuoteClauseLocal + table Dexie

- [ ] Ajouter interface après `ClauseLocal` :
  ```ts
  export interface QuoteClauseLocal {
    id: string;
    quoteId: string;
    clauseId?: string;           // null si clause spécifique non enregistrée
    contenuOverride?: string;    // texte de la clause spécifique
    ordre: number;
    createdAt: string;
  }
  ```
- [ ] Ajouter à `LocalDatabase` :
  ```ts
  quoteClauses!: EntityTable<QuoteClauseLocal, "id">;
  ```
- [ ] Ajouter version 3 du schéma Dexie :
  ```ts
  this.version(3).stores({
    quoteClauses: "id, quoteId, clauseId, ordre",
  });
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `src/components/quote/wizard-step-conditions.tsx`

- [ ] Ajouter import `useLiveClauses` depuis `@/hooks/use-live-clauses`
- [ ] Ajouter import `QuoteClauseLocal` depuis `@/lib/local-db`
- [ ] Ajouter état local :
  ```ts
  const clauses = useLiveClauses();
  const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set());
  const [specificClause, setSpecificClause] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [clauseOrder, setClauseOrder] = useState<string[]>([]); // ordered list of clauseId or "__specific__"
  ```
- [ ] Fonction `toggleClause(clauseId: string)` : ajoute/retire de `selectedClauseIds` et met à jour `clauseOrder`
- [ ] Fonctions `moveUp(idx: number)` et `moveDown(idx: number)` sur `clauseOrder`
- [ ] Dans `handleFinish()` (existant depuis Story 3.6) : avant `resetWizard()`, persister les QuoteClauses :
  ```ts
  // 1. Si specificClause et saveAsTemplate → créer clause dans db.clauses via applyLocalMutation
  // 2. Bulk insert dans db.quoteClauses
  const quoteClauseRecords: QuoteClauseLocal[] = clauseOrder.map((key, idx) => {
    if (key === "__specific__") {
      return { id: crypto.randomUUID(), quoteId, clauseId: savedSpecificClauseId ?? undefined,
               contenuOverride: specificClause.trim(), ordre: idx, createdAt: now };
    }
    return { id: crypto.randomUUID(), quoteId, clauseId: key, ordre: idx, createdAt: now };
  });
  await db.quoteClauses.bulkPut(quoteClauseRecords);
  ```
- [ ] Rendu de la section clauses : groupement par catégorie, checkbox tiles (UX-DR11)
- [ ] Checkbox tile :
  ```tsx
  <button
    type="button"
    role="checkbox"
    aria-checked={selectedClauseIds.has(clause.id)}
    onClick={() => toggleClause(clause.id)}
    className={`w-full text-left rounded-xl border p-3 transition-colors ${
      selectedClauseIds.has(clause.id)
        ? "border-brand-navy bg-brand-navy/5"
        : "border-border bg-surface hover:bg-surface-alt"
    }`}
  >
    ...
  </button>
  ```
- [ ] Champ clause spécifique (textarea texte libre + checkbox "Enregistrer comme modèle")
- [ ] Liste réordonnée des clauses sélectionnées avec boutons ↑ ↓
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Compléter `devis.wizard.conditions` :
  ```json
  "clausesHeading": "Clauses contractuelles",
  "clausesEmpty": "Aucune clause définie. Vous pouvez ajouter une clause spécifique ci-dessous.",
  "clauseSelected": "{count, plural, one {# clause sélectionnée} other {# clauses sélectionnées}}",
  "specificClauseLabel": "Clause spécifique (texte libre)",
  "specificClausePlaceholder": "Rédigez une clause spécifique à ce devis…",
  "saveAsTemplate": "Enregistrer comme modèle dans la bibliothèque",
  "moveUp": "Déplacer vers le haut",
  "moveDown": "Déplacer vers le bas",
  "orderHeading": "Ordre des clauses sélectionnées"
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Vérification finale (AC7)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] Wizard étape 5 : section clauses visible si des clauses existent ✓
- [ ] Multi-sélection checkbox tiles fonctionne ✓
- [ ] Clause spécifique saisie et persistée dans db.quoteClauses ✓
- [ ] "Enregistrer comme modèle" : clause créée dans db.clauses ✓
- [ ] Réordonnancement ↑/↓ fonctionne ✓
- [ ] Terminer le wizard : QuoteClauses persistées dans Dexie ✓
- [ ] Aucune clause : devis valide sans clause ✓

---

## Dev Notes

### CRITIQUE — QuoteClauses : stockage local sans sync push dédié (MVP-0)

En MVP-0, `quoteClause` **n'est pas un `SyncOpEntity`**. Les clauses associées à un devis sont transmises via le payload `quote` lors du sync : le champ `quote.clauseIds` contient un tableau JSON ordonné `[{ clauseId, contenuOverride, ordre }]`.

**Stratégie MVP-0 :** stocker les QuoteClauses dans Dexie (pour affichage local et PDF) et les inclure dans le payload quote à chaque update du devis. Le serveur les écrit dans `quote_clause` via le handler `case "quote"` existant.

**IMPORTANT :** le handler `case "quote"` dans push/route.ts doit être augmenté pour traiter `payload.clausesData`. Cependant, pour MVP-0, si cette complexité est trop grande, les QuoteClauses restent **local-only** (Dexie) et sont incluses dans le rendu HTML/PDF côté client uniquement. Décision à prendre au démarrage de l'implémentation : si push/route.ts case "quote" ne gère pas les clauses, les QuoteClauses ne se synchronisent pas au serveur en MVP-0. C'est acceptable pour ce stade.

**Recommandation :** en MVP-0, garder les QuoteClauses **local-only dans Dexie**, les inclure dans le PDF côté client, et différer le sync serveur à une story ultérieure. Le champ `quoteClause` dans PostgreSQL sera peuplé lors du sync futur.

### CRITIQUE — Dexie version bump : ajouter version 3 sans casser version 1 et 2

```typescript
// Dans LocalDatabase constructor
// Version 1 et 2 restent INCHANGÉES (garder les stores existants)
this.version(3).stores({
  quoteClauses: "id, quoteId, clauseId, ordre",
});
// Ne PAS répéter tous les stores de v1/v2 dans v3 — Dexie merge automatiquement
```

### CRITIQUE — checkbox tile aria pattern (UX-DR11)

```tsx
<button
  type="button"
  role="checkbox"
  aria-checked={isSelected}
  aria-label={clause.titre}
  onClick={() => toggleClause(clause.id)}
  className={`...`}
>
  <div className="flex items-start gap-3">
    <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
      isSelected ? "border-brand-navy bg-brand-navy" : "border-border"
    }`}>
      {isSelected && <span className="text-white text-xs">✓</span>}
    </div>
    <div>
      <p className="text-sm font-semibold text-text-primary">{clause.titre}</p>
      <p className="text-xs text-text-muted line-clamp-2">{clause.contenu.slice(0, 80)}</p>
    </div>
  </div>
</button>
```

### CRITIQUE — exactOptionalPropertyTypes pour QuoteClauseLocal

```typescript
// CORRECT — clause standard
const record: QuoteClauseLocal = {
  id: crypto.randomUUID(),
  quoteId,
  clauseId: clause.id,
  ordre: idx,
  createdAt: now,
};

// CORRECT — clause spécifique sans enregistrement
const record: QuoteClauseLocal = {
  id: crypto.randomUUID(),
  quoteId,
  contenuOverride: specificClause.trim(),
  ordre: idx,
  createdAt: now,
};

// INCORRECT — champs optionnels undefined explicitement
const record = { ..., clauseId: undefined, contenuOverride: undefined };
```

### CRITIQUE — "Enregistrer comme modèle" : créer une clause via applyLocalMutation

Si `saveAsTemplate` est coché et `specificClause` non vide :

```typescript
const newClauseId = crypto.randomUUID();
const now = new Date().toISOString();
await applyLocalMutation(
  "clause", newClauseId, "create",
  { titre: "Clause spécifique", contenu: specificClause.trim(), pays: "NE", updatedAt: now, createdAt: now },
  0,
  async () => {
    await db.clauses.put({
      id: newClauseId,
      titre: "Clause spécifique",
      contenu: specificClause.trim(),
      pays: "NE",
      revision: 0,
      updatedAt: now,
      createdAt: now,
    });
  },
  userId
);
void triggerSync();
savedSpecificClauseId = newClauseId;
```

### CRITIQUE — ordre dans clauseOrder : "__specific__" comme sentinel

Utiliser la constante `"__specific__"` comme clé sentinel dans `clauseOrder` pour représenter la clause spécifique. Elle ne doit jamais être un `clauseId` réel (les IDs sont des UUIDs).

### Héritage des stories précédentes

- **Story 3.6 (wizard-step-conditions.tsx)** — base de l'étape 5 à augmenter
- **Story 3.7 (use-live-clauses.ts)** — hook déjà créé, importer directement
- **Story 3.5 (wizard-step-services.tsx)** — pattern checkbox tiles inspiré du picker template
- **Story 2.1 (local-db.ts)** — pattern version bump Dexie (v1 → v2 → v3)

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration DB nécessaire (Dexie gère sa propre migration côté client)
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.8] — FR-27 (application clauses, multi-sélection, ordre ajustable) + FR-28 (clause spécifique, option "enregistrer comme modèle")
- [src/lib/local-db.ts] — `ClauseLocal`, `QuoteLocal`, structure Dexie (v1, v2 à préserver)
- [src/lib/schema.ts:298-334] — tables `quote_clause` et `quote_status_log`
- [src/hooks/use-live-clauses.ts] — hook créé en Story 3.7
- [src/components/quote/wizard-step-conditions.tsx] — à augmenter (créé en Story 3.6)
- [src/lib/sync/outbox.ts] — `applyLocalMutation`, `triggerSync`
- [UX-DR11] — Checkbox tiles (multi-select)
- [Architecture §Data] — Dexie version upgrade pattern

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
