---
story_key: 3-9-lifecycle-status-change
epic_num: 3
story_num: 9
status: ready-for-dev
baseline_commit: ""
---

# Story 3.9 : Cycle de vie & changement de statut (FR-15)

**Statut :** ready-for-dev

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

- [ ] Ajouter interface :
  ```ts
  export interface QuoteStatusLogLocal {
    id: string;
    quoteId: string;
    fromStatus?: QuoteLocal["status"];
    toStatus: QuoteLocal["status"];
    changedBy?: string;
    changedAt: string;
    note?: string;
  }
  ```
- [ ] Ajouter à `LocalDatabase` :
  ```ts
  quoteStatusLogs!: EntityTable<QuoteStatusLogLocal, "id">;
  ```
- [ ] Ajouter prochaine version Dexie (version 3 si Story 3.8 non déployée, sinon version 4) :
  ```ts
  this.version(N).stores({
    quoteStatusLogs: "id, quoteId, changedAt",
  });
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/quote/status-badge.tsx`

- [ ] `"use client"` première ligne
- [ ] Props : `{ status: QuoteLocal["status"]; className?: string }`
- [ ] Map status → { dot color class, libellé fr } :
  ```ts
  const STATUS_CONFIG: Record<QuoteLocal["status"], { dot: string; label: string }> = {
    draft:     { dot: "bg-gray-400",    label: "Brouillon" },
    validated: { dot: "bg-blue-500",   label: "Validé" },
    sent:      { dot: "bg-amber-500",  label: "Envoyé" },
    accepted:  { dot: "bg-green-500",  label: "Accepté" },
    expired:   { dot: "bg-red-400",    label: "Expiré" },
    cancelled: { dot: "bg-red-500",    label: "Annulé" },
  };
  ```
- [ ] Rendu :
  ```tsx
  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${bgClass} ${className ?? ""}`}>
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
    {label}
  </span>
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Créer `src/hooks/use-live-quote.ts`

- [ ] Exporter `useLiveQuote(quoteId: string)` retournant `{ quote: QuoteLocal | null, lines: QuoteLineLocal[], statusLogs: QuoteStatusLogLocal[] }`
- [ ] liveQuery combiné sur `db.quotes.get(quoteId)` + `db.quoteLines.where("quoteId").equals(quoteId).sortBy("ordre")` + `db.quoteStatusLogs.where("quoteId").equals(quoteId).toArray()`
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/components/quote/status-change-sheet.tsx`

- [ ] `"use client"` première ligne
- [ ] Props :
  ```ts
  interface StatusChangeSheetProps {
    quoteId: string;
    currentStatus: QuoteLocal["status"];
    userId: string;
    onClose: () => void;
    isOpen: boolean;
  }
  ```
- [ ] Constante machine à états :
  ```ts
  const VALID_TRANSITIONS: Record<QuoteLocal["status"], QuoteLocal["status"][]> = {
    draft:     ["validated", "cancelled"],
    validated: ["sent", "cancelled"],
    sent:      ["accepted", "expired", "cancelled"],
    accepted:  [],
    expired:   [],
    cancelled: [],
  };
  ```
- [ ] Validation `validateDraftToValidated(quoteId: string)` (async, lit Dexie) : vérifie clientId, quoteLines.length > 0, totalFcfa > 0, originCity + destinationCity, signataireNom
- [ ] Fonction `handleStatusChange(newStatus)` :
  - Si Brouillon → Validé : appeler `validateDraftToValidated`, si KO → setErrors, return
  - `applyLocalMutation("quote", quoteId, "update", { ...dbQuote, status: newStatus, updatedAt }, dbQuote.revision, dexieWriteFn, userId)`
  - Écrire dans `db.quoteStatusLogs.put({ id: crypto.randomUUID(), quoteId, fromStatus: currentStatus, toStatus: newStatus, changedBy: userId, changedAt: now })`
  - `triggerSync()`
  - Toast + `onClose()`
- [ ] Focus trap : le sheet piège le focus quand `isOpen = true`, restaure sur déclencheur à la fermeture
- [ ] Backdrop tap ferme le sheet
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Créer `src/app/(app)/devis/[id]/page.tsx`

- [ ] Server Component, requiert session (`getSessionWithRole`)
- [ ] Importer `UseLiveQuote` via un Client Component dédié
- [ ] Afficher : header devis (numéro, date, statut badge), infos client (snapshot), trajet, marchandise, lignes prestations, total, clauses (si story 3.8 déployée), signataire, conditions de paiement
- [ ] Bouton "Changer le statut" → ouvre `StatusChangeSheet`
- [ ] Section "Historique" : timeline `quoteStatusLogs` triée par date
- [ ] Bouton retour → `/devis`
- [ ] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter `devis.status` :
  ```json
  "status": {
    "draft": "Brouillon",
    "validated": "Validé",
    "sent": "Envoyé",
    "accepted": "Accepté",
    "expired": "Expiré",
    "cancelled": "Annulé",
    "changeStatus": "Changer le statut",
    "heading": "Changer le statut du devis",
    "currentStatus": "Statut actuel",
    "toastChanged": "Statut → {status}",
    "validationErrors": {
      "missingClient": "Client requis",
      "missingLines": "Au moins une ligne de prestation est requise",
      "zeroTotal": "Le total doit être supérieur à 0",
      "missingRoute": "Trajet requis (ville de départ et d'arrivée)",
      "missingSignatory": "Signataire requis"
    },
    "invalidTransition": "Transition non autorisée"
  }
  ```
- [ ] Ajouter `devis.detail` :
  ```json
  "detail": {
    "back": "Mes devis",
    "heading": "Devis",
    "history": "Historique",
    "historyEmpty": "Aucune transition enregistrée.",
    "historyEntry": "De {from} vers {to}",
    "historyBy": "par {user}",
    "lines": "Lignes de prestation",
    "total": "Total devis",
    "signatory": "Signataire",
    "conditions": "Conditions de paiement"
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T7 — Vérification finale (AC7)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] Naviguer vers /devis/[id] → page détail s'affiche ✓
- [ ] Bouton "Changer le statut" → bottom sheet s'ouvre ✓
- [ ] Brouillon → Validé sans client : erreur affichée + reste Brouillon ✓
- [ ] Brouillon → Validé avec devis complet : transition appliquée ✓
- [ ] Validé → Envoyé : transition directe ✓
- [ ] Accepté → aucune transition disponible ✓
- [ ] Toast confirme chaque transition ✓
- [ ] StatusBadge : dot + texte (jamais color-only) ✓
- [ ] Timeline historique visible sur la page détail ✓

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

_à remplir_

### Debug Log References

_à remplir_

### Completion Notes List

_à remplir_

### File List

_à remplir_

### Change Log

_à remplir_
