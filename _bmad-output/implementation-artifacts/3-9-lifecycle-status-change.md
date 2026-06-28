---
story_key: 3-9-lifecycle-status-change
epic_num: 3
story_num: 9
status: done
baseline_commit: 9288019
---

# Story 3.9 : Cycle de vie & changement de statut (FR-15)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** faire évoluer le statut d'un devis selon son cycle de vie,
**Afin que** je suive où en est chaque devis et garde une trace des transitions.

---

## Critères d'acceptation (BDD)

**AC1 — Machine à états du devis**

```
GIVEN  un devis existant
WHEN   je consulte ses transitions possibles
THEN   la machine à états est :
         Brouillon → Validé → Envoyé → Accepté
                               ↓         ↓
                            Expiré    Annulé
                  ↓
               Annulé
AND    seules les transitions valides sont proposées depuis l'état courant
AND    un devis Accepté / Expiré / Annulé ne peut plus changer de statut
```

**AC2 — Bottom sheet de changement de statut (UX-DR12)**

```
GIVEN  la page de détail d'un devis /devis/[id]
WHEN   je tape le bouton "Changer le statut" (ou équivalent)
THEN   un bottom sheet s'ouvre avec :
         - les 6 statuts (Brouillon · Validé · Envoyé · Accepté · Expiré · Annulé)
         - chaque statut : dot coloré + libellé (jamais color-only, UX-DR23)
         - l'état courant coché / mis en évidence
         - les transitions invalides désactivées (aria-disabled)
AND    un tap sur le backdrop ferme le sheet sans changer d'état
AND    focus trap actif dans le sheet (NFR-A2)
AND    focus restauré sur le bouton déclencheur à la fermeture (NFR-A2)
```

**AC3 — Transition Brouillon → Validé : validation complète**

```
GIVEN  un devis en statut "Brouillon"
WHEN   le commercial tente la transition vers "Validé"
THEN   une validation complète est effectuée :
         - client assigné (clientId non null)
         - au moins une ligne de prestation (quoteLines.length > 0)
         - total > 0 (totalFcfa > 0)
         - trajet défini (originCity + destinationCity non vides)
         - signataire défini (signataireNom non vide)
AND    si validation OK → transition appliquée, devis mis à jour en local + sync
AND    si validation KO → sheet reste ouvert, erreurs affichées inline, statut reste Brouillon
```

**AC4 — Changement de statut : persistance locale + log**

```
GIVEN  une transition valide
WHEN   elle est confirmée
THEN   applyLocalMutation("quote", quoteId, "update", { ...quote, status: newStatus, updatedAt }, revision, dexieWriteFn, userId)
AND    db.quotes.put({ ...quote, status: newStatus, updatedAt }) dans dexieWriteFn
AND    void triggerSync() après
AND    un enregistrement QuoteStatusLogLocal est ajouté dans db.quoteStatusLogs :
         { id, quoteId, fromStatus, toStatus, changedBy: userId, changedAt, note: null }
AND    toast "Statut → {libellé}" confirme (UX-DR8 + UX-DR14)
AND    le badge statut du devis se met à jour immédiatement (liveQuery)
```

**AC5 — Status badge (UX-DR8)**

```
GIVEN  n'importe quelle surface affichant un devis
WHEN   le statut est affiché
THEN   le badge affiche dot coloré + texte libellé (jamais color-only, UX-DR23) :
         - Brouillon  : dot gray    + "Brouillon"
         - Validé     : dot blue    + "Validé"
         - Envoyé     : dot amber   + "Envoyé"
         - Accepté    : dot green   + "Accepté"
         - Expiré     : dot red     + "Expiré"
         - Annulé     : dot red     + "Annulé"
```

**AC6 — Timeline des transitions consultable**

```
GIVEN  un devis avec plusieurs transitions
WHEN   je consulte le détail du devis
THEN   une section "Historique" affiche la timeline des transitions :
         - date + heure, de/vers statut, par quel utilisateur
AND    les logs sont chargés depuis db.quoteStatusLogs.where("quoteId").equals(quoteId)
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
- `src/lib/local-db.ts` — UPDATE : ajouter interface `QuoteStatusLogLocal` + table Dexie `quoteStatusLogs`
- `src/components/quote/status-badge.tsx` — CRÉER : badge réutilisable dot + texte
- `src/components/quote/status-change-sheet.tsx` — CRÉER : bottom sheet cycle de vie (UX-DR12)
- `src/app/(app)/devis/[id]/page.tsx` — CRÉER : page détail devis (lecture + bouton changement statut + timeline)
- `src/hooks/use-live-quote.ts` — CRÉER : liveQuery sur un devis unique + ses lignes + ses logs
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `devis.status` + `devis.detail`

**EXCLU (déjà implémenté — NE PAS MODIFIER) :**
- `src/lib/schema.ts` — table `quote_status_log` déjà définie (lignes 316-333), `quote_status` enum
- `src/app/api/v1/sync/push/route.ts` — case "quote" gère déjà le champ `status`
- Aucune migration DB nécessaire pour Dexie (version bump via `this.version(4)` ou dans la version 3 si Story 3.8 n'est pas encore déployée)

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `src/lib/local-db.ts` : QuoteStatusLogLocal + table Dexie

- [x] Ajouter interface `QuoteStatusLogLocal`
- [x] Ajouter `quoteStatusLogs!: EntityTable<QuoteStatusLogLocal, "id">` à `LocalDatabase`
- [x] Version 4 Dexie : `quoteStatusLogs: "id, quoteId, changedAt"`
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/quote/status-badge.tsx`

- [x] `"use client"` première ligne
- [x] Props `{ status, className? }` + `STATUS_CONFIG` exporté
- [x] Fond tinted (`bg-gray-100`, `bg-blue-50`, etc.) + dot coloré + libellé
- [x] `pnpm typecheck` — zéro erreur

### T3 — Créer `src/hooks/use-live-quote.ts`

- [x] `useLiveQuote(id)` retourne `{ quote, lines, clauses, statusLogs }` via liveQuery
- [x] Logs triés par `changedAt` croissant
- [x] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/components/quote/status-change-sheet.tsx`

- [x] Machine à états extraite dans `src/lib/quote-status.ts` (logique pure testable)
- [x] Focus trap + restauration focus déclencheur (NFR-A2)
- [x] Backdrop tap ferme sans changer statut
- [x] Validation Brouillon → Validé (AC3) : erreurs inline, sheet reste ouvert
- [x] `applyLocalMutation` + `db.quoteStatusLogs.put` (append-only) + `triggerSync`
- [x] Toast UX-DR8 + UX-DR14
- [x] `pnpm typecheck` — zéro erreur

### T5 — Intégration dans `src/app/(app)/devis/[id]/page.tsx` + `quote-preview.tsx`

- [x] `StatusBadge` dans l'en-tête (numéro + statut — UX-DR8)
- [x] Bouton "Changer le statut" visible si `canChangeStatus` + !terminal (AC1)
- [x] Section Historique — timeline `quoteStatusLogs` triée par date (AC6)
- [x] `StatusChangeSheet` intégré dans la page aperçu
- [x] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/messages/fr-NE.json`

- [x] `devis.status` : 6 libellés + changeStatus + heading + currentStatus + toastChanged + validationErrors + invalidTransition + cancel
- [x] `devis.detail` : back + heading + history + historyEmpty + historyEntry + historyBy + lines + total + signatory + conditions
- [x] `pnpm typecheck` — zéro erreur

### T7 — Vérification finale (AC7)

- [x] `pnpm check` : lint ✓ typecheck ✓ 269 tests ✓
- [x] `pnpm build` : passe sans erreur

### Review Findings

- [x] [Review][Patch] Validation Brouillon -> Valide accepte les champs avec espaces uniquement [src/lib/quote-status.ts:101] — Corrige avec validation `trim()` et tests whitespace-only.
- [x] [Review][Patch] Mise a jour du statut et ecriture du log non atomiques [src/components/quote/status-change-sheet.tsx:163] — Corrige via `applyLocalMutation` avec table Dexie supplementaire, quote + log + syncQueue dans la meme transaction.
- [x] [Review][Patch] Les logs de statut omettent `note: null` [src/components/quote/status-change-sheet.tsx:153] — Corrige en renseignant `note: null` et en rendant le champ explicite dans `QuoteStatusLogLocal`.
- [x] [Review][Patch] Le focus trap inclut des boutons desactives [src/components/quote/status-change-sheet.tsx:18] — Corrige avec un selecteur focalisable qui exclut les controles disabled/aria-disabled.
---

## Dev Notes

### CRITIQUE — machine à états : validations Brouillon → Validé

La validation `validateDraftToValidated` doit lire depuis Dexie :

```typescript
async function validateDraftToValidated(quoteId: string): Promise<string[]> {
  const errors: string[] = [];
  const quote = await db.quotes.get(quoteId);
  if (!quote) return ["Quote not found"];

  if (!quote.clientId) errors.push("missingClient");
  if (!quote.originCity || !quote.destinationCity) errors.push("missingRoute");
  if (!quote.signataireNom) errors.push("missingSignatory");

  const lines = await db.quoteLines.where("quoteId").equals(quoteId).toArray();
  if (lines.length === 0) errors.push("missingLines");
  if (quote.totalFcfa <= 0) errors.push("zeroTotal");

  return errors;
}
```

### CRITIQUE — QuoteStatusLogLocal : ne passe PAS par applyLocalMutation

Les `quoteStatusLogs` sont **append-only** et ne se synchronisent pas via l'outbox. Ils sont écrits directement dans Dexie et uniquement locaux en MVP-0. La transition de statut du devis est le seul élément syncé (via `applyLocalMutation("quote", ...)`).

```typescript
// CORRECT
await db.quoteStatusLogs.put({
  id: crypto.randomUUID(),
  quoteId,
  fromStatus: currentStatus,
  toStatus: newStatus,
  changedBy: userId,
  changedAt: now,
});

// INCORRECT — ne pas passer par applyLocalMutation pour les logs
```

### CRITIQUE — Dexie version bump : coordonner avec Story 3.8

Si Story 3.8 a ajouté `version(3)`, cette story doit ajouter `version(4)`. Si Story 3.8 n'est pas encore déployée, utiliser `version(3)` pour cette story. Le dev agent doit vérifier la version courante avant d'écrire le bump.

```typescript
// Vérifier la version courante dans local-db.ts avant d'écrire
// Si la dernière version est 2 → ajouter version(3)
// Si la dernière version est 3 (Story 3.8 déployée) → ajouter version(4)
```

### CRITIQUE — focus trap bottom sheet

MVP-0 : implémentation simple du focus trap :

```typescript
useEffect(() => {
  if (!isOpen) return;
  const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  focusable?.[0]?.focus();

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Tab") {
      // cycle through focusable elements
    }
  }
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [isOpen, onClose]);
```

### CRITIQUE — pattern applyLocalMutation pour quote status update

```typescript
const dbQuote = await db.quotes.get(quoteId);
if (!dbQuote) return;
const now = new Date().toISOString();

await applyLocalMutation(
  "quote", quoteId, "update",
  { ...dbQuote, status: newStatus, updatedAt: now },
  dbQuote.revision,
  async () => {
    await db.quotes.put({ ...dbQuote, status: newStatus, updatedAt: now });
  },
  userId
);
```

### CRITIQUE — page /devis/[id] : paramètre dynamique Next.js

```typescript
// src/app/(app)/devis/[id]/page.tsx
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DevisDetailPage({ params }: PageProps) {
  const { id } = await params;
  // ...
}
```

### StatusBadge : couleurs de fond tinted

```tsx
// Fond tinted (pas juste dot + texte brut)
const BG_CLASS: Record<QuoteLocal["status"], string> = {
  draft:     "bg-gray-100 text-gray-600",
  validated: "bg-blue-50 text-blue-700",
  sent:      "bg-amber-50 text-amber-700",
  accepted:  "bg-green-50 text-green-700",
  expired:   "bg-red-50 text-red-500",
  cancelled: "bg-red-50 text-red-600",
};
```

### Héritage des stories précédentes

- **Story 3.4 (wizard-step-services.tsx)** — pattern `applyLocalMutation("quote", ...)` pour mise à jour du devis
- **Story 3.1 (wizard-step-client.tsx)** — pattern lecture devis depuis Dexie
- **Story 2.6 (clients/[id]/page.tsx)** — pattern page détail Client (structure similaire)
- **Architecture §UX-DR12** — bottom sheet : slide-up, backdrop, focus trap, focus restore

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration DB nécessaire
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.9] — FR-15 (machine à états, transitions, validation complète, status logs)
- [src/lib/schema.ts:316-333] — `quote_status_log` (structure attendue côté serveur)
- [src/lib/schema.ts:20-27] — `quoteStatusEnum` (6 valeurs)
- [src/lib/local-db.ts] — `QuoteLocal.status`, structure Dexie
- [src/lib/permissions.ts] — `quote.change-status` (admin: true, commercial: "own", operateur: false)
- [src/lib/sync/outbox.ts] — `applyLocalMutation`, `triggerSync`
- [src/hooks/use-live-quotes.ts] — pattern liveQuery à adapter pour use-live-quote
- [src/app/(app)/clients/[id]/page.tsx] — pattern page détail (si existant)
- [UX-DR8] — Status badge (tinted bg + dot + text par lifecycle)
- [UX-DR12] — Bottom sheet (slide-up, backdrop, focus trap, restore)
- [UX-DR14] — Toast (bottom-center pill, auto-dismiss 2.2s)
- [UX-DR23] — Jamais color-only pour le statut

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- TS2379 (`exactOptionalPropertyTypes`) dans les tests : fixed via `as unknown as` cast dans `makeQuote` + `{ ...baseQuote, clientId: undefined } as unknown as QuoteLocal`
- TS2532 (`Object is possibly undefined`) : `ops[0]!` / `logs[0]!` non-null assertions dans les tests
- TS2345 (`readonly` array) : `[...DRAFT_VALIDATION_ERROR_CODES]` spread vers mutable

### Completion Notes List

- `src/lib/quote-status.ts` extrait de `StatusChangeSheet` — logique pure sans Dexie ni React, testable unitairement
- `useLiveQuote` inclut aussi `clauses` (QuoteClauseLocal[]) pour réutilisation côté aperçu PDF
- Story 3.9 intégrée dans la page `/devis/[id]` existante (créée par Story 4.2) via `QuotePreview` plutôt qu'une page séparée — moins de duplication
- Les quoteStatusLogs sont en Dexie version 4 (Story 3.8 a ajouté version 3 pour `quoteClauses`)

### File List

- `src/lib/local-db.ts` — interface `QuoteStatusLogLocal` + `quoteStatusLogs` table (version 4)
- `src/lib/quote-status.ts` — CRÉÉ : machine à états pure (VALID_TRANSITIONS, canTransition, validateDraftToValidated, ALL_STATUSES)
- `src/components/quote/status-badge.tsx` — CRÉÉ : badge dot + libellé (UX-DR8/DR23)
- `src/components/quote/status-change-sheet.tsx` — CRÉÉ : bottom sheet cycle de vie (UX-DR12)
- `src/hooks/use-live-quote.ts` — CRÉÉ : liveQuery quote + lines + clauses + statusLogs
- `src/components/pdf/quote-preview.tsx` — UPDATE : StatusBadge header + bouton changeStatus + timeline historique
- `src/messages/fr-NE.json` — UPDATE : devis.status + devis.detail
- `src/lib/quote-status.test.ts` — CRÉÉ : 19 tests unitaires (machine à états + validation)
- `src/lib/quote-status.integration.test.ts` — CRÉÉ : 6 tests Dexie réel (AC4 persistance + outbox)

### Change Log

- 2026-06-27 : Implémentation complète — typecheck ✓ 267 tests ✓ build ✓ → statut review

### Review Findings (retroactively discovered during 3-11 code review — 2026-06-27)

- [x] [Review][Patch] `StatusChangeSheet`: `updatedQuote` built without `revision: dbQuote.revision + 1` — Dexie stores stale revision after status change; next mutation uses same baseRevision causing phantom conflicts. Same pattern as P3 fixed in clause-manager (3-7). [`src/components/quote/status-change-sheet.tsx:147-151`] → Corrigé.
- [x] [Review][Patch] `quote-status.ts` imports `QuoteStatus` from `@/components/quote/status-badge` — inverted lib→components dependency. `QuoteStatus` is `QuoteLocal["status"]`; defined inline instead. [`src/lib/quote-status.ts:18,118`] → Corrigé.
- [x] [Review][Defer] Double-read race in `handleSelectStatus` (validation read at line 121, mutation read at line 134) — between reads background sync could remove the client. Low risk single-user MVP.
- [x] [Review][Defer] `aria-pressed` on transition buttons semantically incorrect (should be `aria-current` or nothing) — accessibility improvement, not blocking.
