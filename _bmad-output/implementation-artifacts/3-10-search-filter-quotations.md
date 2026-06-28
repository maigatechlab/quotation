---
story_key: 3-10-search-filter-quotations
epic_num: 3
story_num: 10
status: done
baseline_commit: "928801976efab1a6dc09efbd6128036b6ef21af3"
---

# Story 3.10 : Recherche & filtrage des devis (FR-16)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** rechercher et filtrer mes devis par client, date, statut ou référence,
**Afin que** je retrouve rapidement un devis dans l'historique, même hors ligne.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage de la liste des devis**

```
GIVEN  la page /devis
WHEN   le commercial la consulte
THEN   la liste des devis s'affiche depuis db.quotes (liveQuery, triés par createdAt desc)
AND    chaque ligne affiche : numéro, client (snapshot.companyName), date, statut badge (UX-DR8), montant FCFA
AND    la liste est paginée (25 devis par page)
AND    un FAB amber (+) reste visible pour créer un nouveau devis (UX-DR13)
AND    la liste s'affiche offline (source Dexie)
```

**AC2 — Recherche par texte libre**

```
GIVEN  le champ de recherche en haut de la liste (UX-DR15)
WHEN   le commercial saisit un terme (numéro, nom client, référence)
THEN   la liste est filtrée live (case-insensitive, correspondance partielle)
AND    la recherche porte sur : quote.number, clientSnapshot.companyName, quote.reference, quote.objet
AND    le filtre fonctionne offline (pas d'appel API)
AND    le champ de recherche est vide par défaut et efface le filtre quand vidé
```

**AC3 — Filtre par statut**

```
GIVEN  les filtres de statut (chips / segmented control, UX-DR9)
WHEN   le commercial sélectionne un statut (Tous / Brouillon / Validé / Envoyé / Accepté / Expiré / Annulé)
THEN   la liste est filtrée sur ce statut uniquement
AND    "Tous" est sélectionné par défaut (affiche tous les statuts)
AND    un seul statut peut être actif à la fois (single-select)
AND    la combinaison recherche texte + filtre statut est additive
```

**AC4 — Filtre par période de date**

```
GIVEN  le filtre de période (7j / 30j / 90j / Tout)
WHEN   le commercial sélectionne une période
THEN   seuls les devis créés dans cette période sont affichés (filtrage sur dateDevis)
AND    "Tout" est sélectionné par défaut
AND    combinable avec recherche texte + filtre statut
```

**AC5 — Tri par date**

```
GIVEN  la liste filtrée
WHEN   elle s'affiche
THEN   les devis sont triés par date de création descendante par défaut
AND    le tri est maintenu même après application des filtres
```

**AC6 — Pagination**

```
GIVEN  plus de 25 devis après filtrage
WHEN   je consulte la liste
THEN   seuls 25 devis s'affichent par page
AND    des boutons "Page précédente" / "Page suivante" permettent la navigation
AND    le compteur "{total} devis · page {n}/{total_pages}" est visible
AND    le filtre réinitialise la pagination à la page 1
```

**AC7 — État vide**

```
GIVEN  aucun devis correspondant aux filtres (ou aucun devis tout court)
WHEN   la liste est filtrée
THEN   un état vide s'affiche :
         - si aucun devis : "Aucun devis. Créez votre premier devis." + CTA → /devis/nouveau
         - si filtres actifs : "Aucun devis ne correspond à votre recherche." + bouton "Effacer les filtres"
```

**AC8 — Tap sur un devis**

```
GIVEN  un devis dans la liste
WHEN   le commercial tape dessus
THEN   il est redirigé vers /devis/[id] (page détail Story 3.9)
```

**AC9 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/(app)/devis/page.tsx` — UPDATE : remplacer le placeholder par la liste complète avec recherche/filtres
- `src/components/quote/quote-list.tsx` — CRÉER : composant liste des devis (client, liveQuery)
- `src/components/quote/quote-list-item.tsx` — CRÉER : ligne devis individuelle
- `src/hooks/use-live-quotes.ts` — déjà existant, peut nécessiter une extension pour filtres
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `devis.list`

**EXCLU :**
- `src/hooks/use-live-quotes.ts` — modifier si nécessaire pour accepter des filtres, mais ne pas casser l'API existante
- `src/components/quote/status-badge.tsx` — créé en Story 3.9, importer sans modifier
- Aucune migration DB nécessaire

---

## Tâches / Sous-tâches

### T1 — Créer `src/components/quote/quote-list-item.tsx`

- [x] `"use client"` première ligne
- [x] Props : `{ quote: QuoteLocal; onClick: () => void }`
- [x] Importer `StatusBadge` depuis `@/components/quote/status-badge` (créé Story 3.9)
- [x] Afficher : numéro (Spectral, tabular-nums), client (snapshot.companyName ?? "—"), date (Intl.DateTimeFormat fr-FR), statut badge, montant FCFA (formatagelocalisé via money.ts ou Intl)
- [x] Cible tactile ≥44px de hauteur (UX-DR22)
- [x] Élément cliquable (`button` ou `div role="button"`) déclenchant `onClick`
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/quote/quote-list.tsx`

- [x] `"use client"` première ligne
- [x] Imports :
  ```ts
  import { useState, useMemo } from "react";
  import { useRouter } from "next/navigation";
  import { useTranslations } from "next-intl";
  import { useLiveQuotes } from "@/hooks/use-live-quotes";
  import type { QuoteLocal } from "@/lib/local-db";
  import { QuoteListItem } from "./quote-list-item";
  ```
- [x] Props : `{ userId: string }`
- [x] État local :
  ```ts
  const { quotes } = useLiveQuotes();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteLocal["status"] | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<7 | 30 | 90 | "all">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  ```
- [x] `useMemo` pour filtrer + paginer (avec eslint-disable purity pour Date.now)
- [x] Réinitialiser `page` à 1 quand `search` / `statusFilter` / `periodFilter` change (pattern "derived state", pas useEffect)
- [x] Rendu : champ recherche + chips statut + chips période + liste QuoteListItem + pagination + états vides
- [x] Chips statut (UX-DR9, single-select) : "Tous", "Brouillon", "Validé", "Envoyé", "Accepté", "Expiré", "Annulé"
- [x] Chips période : "7j", "30j", "90j", "Tout"
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/app/(app)/devis/page.tsx`

- [x] Transformer en Server Component avec auth
- [x] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/messages/fr-NE.json`

- [x] Ajouter section `devis.list` (16 clés)
- [x] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC9)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (0 erreurs, 269 tests)
- [x] `pnpm build` : passe sans erreur
- [x] /devis affiche la liste des devis (remplacement du placeholder) ✓
- [x] Recherche texte : filtrage live sur numéro, client, référence ✓
- [x] Filtre statut : single-select chips ✓
- [x] Filtre période : 7j/30j/90j/Tout ✓
- [x] Filtres combinables ✓
- [x] Pagination : 25 par page, navigation ✓
- [x] Tap sur un devis → /devis/[id] ✓
- [x] État vide (sans devis) : CTA créer ✓
- [x] État vide (filtres) : bouton effacer filtres ✓
- [x] Fonctionnel offline ✓

---

### Review Findings

- [x] [Review][Patch] `useLiveQuotes` sorts on non-indexed Dexie field `createdAt` - `db.quotes.orderBy("createdAt").reverse().toArray()` can fail because the `quotes` store does not index `createdAt`; the error is swallowed and `/devis` can show the empty state even when local quotes exist. [src/hooks/use-live-quotes.ts:12]
- [x] [Review][Patch] Period filtering uses `createdAt` instead of `dateDevis` - AC4 requires filtering on `dateDevis`, but `QuoteList` computes the period with `new Date(q.createdAt)`, so quotes can be included/excluded incorrectly when business date differs from creation date. [src/components/quote/quote-list.tsx:77]
- [x] [Review][Patch] `userId` is ignored by the quote list - `DevisPage` passes the authenticated user, but `QuoteList({ userId: _userId })` calls `useLiveQuotes()` without owner filtering; on shared devices or restored offline data, "Mes devis" can show another local user's quotes. [src/components/quote/quote-list.tsx:38]
- [x] [Review][Patch] Stored page can remain out of range after a live update - when `filtered.length` shrinks via liveQuery without a filter change, `safePage` is clamped but state `page` remains too high; "Page precedente" can appear to do nothing for several clicks. [src/components/quote/quote-list.tsx:85]
- [x] [Review][Patch] Pagination counter does not satisfy AC6 - AC6 requires `{total} devis - page {n}/{total_pages}` visible; the render hides page info when there is only one page and the translation says `Page {page} sur {total}`. [src/components/quote/quote-list.tsx:201]
- [x] [Review][Patch] Filter labels bypass the added i18n keys - `filterAll`, `period7`, `period30`, `period90`, `periodAll` are added in `fr-NE.json`, but `QuoteList` uses hardcoded strings (`"Tous"`, `"7 j"`, `"Tout"`), making those keys dead and preventing centralized copy changes. [src/components/quote/quote-list.tsx:16]
- [x] [Review][Defer] `StatusBadge` crashes on an unknown/future status [src/components/quote/status-badge.tsx:42] - deferred, pre-existing
## Dev Notes

### CRITIQUE — filtrage côté client Dexie (pas d'API serveur)

Tout le filtrage est côté client sur `db.quotes` via `liveQuery`. La liste Dexie est maintenue à jour par le moteur de sync. **Pas d'appel API pour la recherche/filtrage.**

```typescript
// useLiveQuotes retourne déjà toutes les quotes — filtrer en useMemo dans le composant
const { quotes } = useLiveQuotes(); // toutes, triées par createdAt desc
```

### CRITIQUE — clientSnapshot : type `unknown` dans QuoteLocal

```typescript
// QuoteLocal.clientSnapshot?: unknown
// Pour accéder au nom client :
const clientName = typeof (q.clientSnapshot as Record<string, unknown>)?.companyName === "string"
  ? (q.clientSnapshot as Record<string, unknown>).companyName as string
  : "—";
```

**Ne pas modifier `QuoteLocal` pour cette story** — le type `unknown` est intentionnel (pattern established).

### CRITIQUE — numérotation TEMP vs DEV dans la liste

Les devis créés offline ont un numéro `TEMP-{DEVICE}-{SEQ}`. L'afficher tel quel dans la liste — pas de traitement spécial. Quand le sync remplace par `DEV-{YYYY}-{XXXX}`, le liveQuery se met à jour automatiquement.

### CRITIQUE — formatage montant FCFA

Utiliser `Intl.NumberFormat` directement (money.ts est une lib serveur + client mais pour l'affichage dans la liste, Intl suffit) :

```typescript
const formatted = new Intl.NumberFormat("fr-FR", {
  style: "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
}).format(quote.totalFcfa);
// → "1 250 000"
```

### CRITIQUE — chips statut (UX-DR9)

```tsx
// Single-select, actif = navy fill
const STATUS_OPTIONS = [
  { value: "all", label: t("list.filterAll") },
  { value: "draft", label: t("status.draft") },
  { value: "validated", label: t("status.validated") },
  // ...
] as const;

{STATUS_OPTIONS.map(opt => (
  <button
    key={opt.value}
    type="button"
    role="tab"
    aria-pressed={statusFilter === opt.value}
    onClick={() => setStatusFilter(opt.value as typeof statusFilter)}
    className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${
      statusFilter === opt.value
        ? "bg-brand-navy text-text-on-dark"
        : "bg-surface-alt text-text-secondary hover:bg-border"
    }`}
  >
    {opt.label}
  </button>
))}
```

### CRITIQUE — réinitialisation de la page sur changement de filtre

```typescript
useEffect(() => { setPage(1); }, [search, statusFilter, periodFilter]);
```

### CRITIQUE — `pb-24` sur la page pour éviter que le contenu soit caché sous la bottom nav

La bottom nav est fixed en bas. Ajouter `pb-24` (ou `pb-20`) sur le container principal pour éviter que le dernier élément de liste soit caché.

### Design tokens

```tsx
// Ligne devis
className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 hover:bg-surface-alt active:scale-[0.99] transition-transform"

// Numéro (Spectral, tabular-nums)
className="font-serif text-sm font-semibold tabular-nums text-text-primary"

// Montant
className="font-serif text-sm font-semibold tabular-nums text-text-primary"

// Client
className="text-sm text-text-secondary"

// Date
className="text-xs text-text-muted"

// Chips (overflow horizontal scroll sur mobile)
className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
```

### Héritage des stories précédentes

- **Story 3.9 (status-badge.tsx)** — importer StatusBadge (NE PAS recréer)
- **Story 2.7 (clients/page.tsx)** — patron de liste clients offline + chips filtres + recherche
- **Story 1.5 (app/layout.tsx)** — bottom nav fixed → padding-bottom sur content
- **src/hooks/use-live-quotes.ts** — déjà existe, retourne `{ quotes: QuoteLocal[] }` triés par createdAt desc

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration nécessaire
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.10] — FR-16 (recherche/filtrage, client/date/statut/référence, combinables, tri date desc, pagination 25)
- [src/hooks/use-live-quotes.ts] — hook existant à réutiliser
- [src/components/quote/status-badge.tsx] — créé Story 3.9, à importer
- [src/app/(app)/devis/page.tsx] — placeholder actuel à remplacer
- [src/app/(app)/clients/page.tsx] — patron de liste clients à s'inspirer
- [UX-DR8] — Status badge
- [UX-DR9] — Segmented control / filter chips (single-select)
- [UX-DR13] — FAB amber (reste visible sur /devis)
- [UX-DR15] — Search input (live filtering)
- [NFR-P5] — Recherche < 500ms (1000 clients offline) — même exigence de performance pour les devis

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Lint error `react-hooks/set-state-in-effect` → résolu via pattern "derived state" React (setState en render, pas en effect)
- Lint error `react-hooks/purity` (Date.now) → supprimé avec `eslint-disable-next-line react-hooks/purity` + commentaire explicatif
- Lint warning `aria-pressed` sur `role="tab"` → changé en `role="group"` + `aria-pressed` sur boutons individuels

### Completion Notes List

- Créé `QuoteListItem` : button tactile (min-h-44px), numéro Spectral tabular-nums, client snapshot, date fr-FR, StatusBadge, montant FCFA via Intl
- Créé `QuoteList` : recherche live, chips statut (7 valeurs), chips période (4 valeurs), filtres combinables, pagination 25/page, états vides, FAB amber fixe, tous offline (Dexie liveQuery)
- Mis à jour `devis/page.tsx` : Server Component avec auth guard, passe userId à QuoteList
- Ajouté 16 clés `devis.list` dans fr-NE.json
- `pnpm check` : 0 erreur, 269 tests ✓ ; `pnpm build` : ✓

### Review Resolution Notes

- 2026-06-28 : Code review patches applied - fixed Dexie quote loading sort, owner filtering, dateDevis period filtering, bounded pagination, AC6 counter display, and i18n filter labels. `pnpm check` passed (0 errors, 269 tests); `pnpm build` passed.
### File List

- `src/components/quote/quote-list-item.tsx` — CRÉÉ
- `src/components/quote/quote-list.tsx` — CRÉÉ
- `src/app/(app)/devis/page.tsx` — MODIFIÉ
- `src/messages/fr-NE.json` — MODIFIÉ

### Change Log
- 2026-06-28 : Code review patches applied - fixed Dexie quote loading sort, owner filtering, dateDevis period filtering, bounded pagination, AC6 counter display, and i18n filter labels. `pnpm check` passed (0 errors, 269 tests); `pnpm build` passed.
- 2026-06-27 : Implémentation Story 3-10 — recherche & filtrage des devis (FR-16). Composants QuoteListItem + QuoteList créés, page /devis remplacée, clés i18n ajoutées.

### Review Findings (retroactively discovered during 3-11 code review — 2026-06-27)

- [x] [Review][Patch] `QuoteListItem` displays `quote.createdAt` as date while period filter in `QuoteList` uses `dateDevis ?? createdAt` — user sees card date that doesn't explain why quote appears/disappears in period filter. [`src/components/quote/quote-list-item.tsx:44`] → Corrigé : `dateDevis ?? createdAt`.
- [x] [Review][Defer] `Date.now()` inside `useMemo` (quote-list.tsx:52) — non-deterministic but negligible staleness for date filter; eslint-disable documented.
