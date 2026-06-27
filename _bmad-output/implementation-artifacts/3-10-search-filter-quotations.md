---
story_key: 3-10-search-filter-quotations
epic_num: 3
story_num: 10
status: ready-for-dev
baseline_commit: ""
---

# Story 3.10 : Recherche & filtrage des devis (FR-16)

**Statut :** ready-for-dev

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

- [ ] `"use client"` première ligne
- [ ] Props : `{ quote: QuoteLocal; onClick: () => void }`
- [ ] Importer `StatusBadge` depuis `@/components/quote/status-badge` (créé Story 3.9)
- [ ] Afficher : numéro (Spectral, tabular-nums), client (snapshot.companyName ?? "—"), date (Intl.DateTimeFormat fr-FR), statut badge, montant FCFA (formatagelocalisé via money.ts ou Intl)
- [ ] Cible tactile ≥44px de hauteur (UX-DR22)
- [ ] Élément cliquable (`button` ou `div role="button"`) déclenchant `onClick`
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/quote/quote-list.tsx`

- [ ] `"use client"` première ligne
- [ ] Imports :
  ```ts
  import { useState, useMemo } from "react";
  import { useRouter } from "next/navigation";
  import { useTranslations } from "next-intl";
  import { useLiveQuotes } from "@/hooks/use-live-quotes";
  import type { QuoteLocal } from "@/lib/local-db";
  import { QuoteListItem } from "./quote-list-item";
  ```
- [ ] Props : `{ userId: string }`
- [ ] État local :
  ```ts
  const { quotes } = useLiveQuotes();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteLocal["status"] | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<7 | 30 | 90 | "all">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  ```
- [ ] `useMemo` pour filtrer + paginer :
  ```ts
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const now = Date.now();
    const periodMs = periodFilter === "all" ? null : periodFilter * 24 * 60 * 60 * 1000;

    return quotes.filter(q => {
      // Texte
      if (term) {
        const clientName = (q.clientSnapshot as Record<string, unknown>)?.companyName ?? "";
        const inNumber = q.number.toLowerCase().includes(term);
        const inClient = String(clientName).toLowerCase().includes(term);
        const inRef = (q.reference ?? "").toLowerCase().includes(term);
        const inObjet = (q.objet ?? "").toLowerCase().includes(term);
        if (!inNumber && !inClient && !inRef && !inObjet) return false;
      }
      // Statut
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      // Période
      if (periodMs) {
        const created = new Date(q.createdAt).getTime();
        if (now - created > periodMs) return false;
      }
      return true;
    });
  }, [quotes, search, statusFilter, periodFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  ```
- [ ] Réinitialiser `page` à 1 quand `search` / `statusFilter` / `periodFilter` change (useEffect)
- [ ] Rendu : champ recherche + chips statut + chips période + liste QuoteListItem + pagination + états vides
- [ ] Chips statut (UX-DR9, single-select) : "Tous", "Brouillon", "Validé", "Envoyé", "Accepté", "Expiré", "Annulé"
- [ ] Chips période : "7j", "30j", "90j", "Tout"
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/app/(app)/devis/page.tsx`

- [ ] Transformer en Server Component avec auth :
  ```ts
  import { redirect } from "next/navigation";
  import { getSessionWithRole } from "@/lib/session";
  import { QuoteList } from "@/components/quote/quote-list";

  export default async function DevisPage() {
    const result = await getSessionWithRole();
    if (!result) redirect("/login");
    const { session } = result;
    const userId = (session.user as Record<string, unknown>).id as string;

    return (
      <div className="flex flex-col px-5 pt-8 pb-24">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Devis</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">Mes devis</h1>
        <div className="mt-6">
          <QuoteList userId={userId} />
        </div>
      </div>
    );
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter section `devis.list` :
  ```json
  "list": {
    "empty": "Aucun devis. Créez votre premier devis.",
    "emptyFiltered": "Aucun devis ne correspond à votre recherche.",
    "clearFilters": "Effacer les filtres",
    "createFirst": "Créer un devis",
    "searchPlaceholder": "Numéro, client, référence…",
    "filterAll": "Tous",
    "period7": "7 jours",
    "period30": "30 jours",
    "period90": "90 jours",
    "periodAll": "Tout",
    "pagination": "Page {page} sur {total}",
    "paginationCount": "{count, plural, one {# devis} other {# devis}}",
    "prevPage": "Page précédente",
    "nextPage": "Page suivante",
    "amount": "{amount} FCFA",
    "noClient": "Client non assigné"
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC9)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] /devis affiche la liste des devis (remplacement du placeholder) ✓
- [ ] Recherche texte : filtrage live sur numéro, client, référence ✓
- [ ] Filtre statut : single-select chips ✓
- [ ] Filtre période : 7j/30j/90j/Tout ✓
- [ ] Filtres combinables ✓
- [ ] Pagination : 25 par page, navigation ✓
- [ ] Tap sur un devis → /devis/[id] ✓
- [ ] État vide (sans devis) : CTA créer ✓
- [ ] État vide (filtres) : bouton effacer filtres ✓
- [ ] Fonctionnel offline ✓

---

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

_à remplir_

### Debug Log References

_à remplir_

### Completion Notes List

_à remplir_

### File List

_à remplir_

### Change Log

_à remplir_
