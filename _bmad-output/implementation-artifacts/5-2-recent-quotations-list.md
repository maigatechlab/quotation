---
story_key: 5-2-recent-quotations-list
epic_num: 5
story_num: 2
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 5.2 : Liste des devis récents (FR-41)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** voir mes devis les plus récents sur le tableau de bord,
**Afin que** j'accède rapidement à mon travail en cours depuis la page d'accueil.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage des 10 derniers devis**

```
GIVEN  le Dashboard `/` après la hero card (Story 5.1)
WHEN   la section "Devis récents" se rend
THEN   les 10 derniers devis sont affichés (triés par dateDevis DESC, fallback createdAt DESC)
AND    chaque ligne affiche : numéro, client, date, statut (badge), montant total
AND    les données viennent de db.quotes via liveQuery Dexie (offline-first, aucun appel API)
AND    le nom client est extrait de clientSnapshot?.companyName (snapshot figé)
       avec fallback "Client inconnu" si clientSnapshot absent
```

**AC2 — Navigation : tap → ouvre le devis**

```
GIVEN  une ligne de la liste des devis récents
WHEN   l'utilisateur tape dessus
THEN   il est redirigé vers /devis/[id] (page aperçu du devis)
AND    si la route /devis/[id] n'existe pas encore (Epic 4 non implémenté),
       la navigation vers /devis est acceptable en fallback
AND    la cible de tap est ≥ 44×44px (ligne complète est cliquable, UX-DR22)
```

**Note sur AC2 :** la route `/devis/[id]` sera créée en Epic 4. En attendant, le lien doit pointer vers `/devis/${quote.id}` — Next.js renverra une 404 acceptable jusqu'à Epic 4. **NE PAS** supprimer le lien ni rediriger vers `/devis` par défaut — laisser l'intention de navigation correcte.

**AC3 — Lien "Voir tout"**

```
GIVEN  la section "Devis récents"
WHEN   l'utilisateur tape "Voir tout"
THEN   il est redirigé vers /devis (liste complète des devis)
AND    le lien est accessible (texte descriptif, pas juste une icône)
```

**AC4 — État vide**

```
GIVEN  aucun devis en base Dexie locale
WHEN   la section "Devis récents" se rend
THEN   un message "Aucun devis créé" est affiché avec un lien/bouton "Créer un devis"
       qui pointe vers /devis/nouveau
AND    pas de liste vide ni d'erreur visuelle
```

**AC5 — État de chargement**

```
GIVEN  le premier rendu avant que liveQuery Dexie réponde
WHEN   isLoading est true
THEN   des skeleton rows (3 lignes minimum) s'affichent
AND    la transition skeleton → liste est fluide (pas de flash)
```

**AC6 — Badge statut conforme UX-DR8**

```
GIVEN  un devis avec un statut donné
WHEN   le badge statut s'affiche
THEN   il montre un dot coloré + label texte (jamais color-only, UX-DR23)
AND    les 6 statuts ont un dot + bg + texte distinctifs :
       - draft : gris (text-text-muted)
       - validated : bleu/navy (brand-navy)
       - sent : amber (brand-amber-deep sur tint)
       - accepted : vert
       - expired : orange/terracotta
       - cancelled : rouge
AND    le badge est un composant StatusBadge réutilisable si possible
```

**AC7 — Réactivité liveQuery**

```
GIVEN  la liste affiche 10 devis
WHEN   un nouveau devis est créé depuis le wizard
THEN   la liste se met à jour automatiquement (liveQuery Dexie réagit)
AND    aucun rechargement de page n'est nécessaire
```

**AC8 — Qualité**

```
GIVEN  les fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/dashboard/recent-quotes-list.tsx` — CRÉER : liste des 10 derniers devis avec badge statut
- `src/components/shared/status-badge.tsx` — CRÉER : composant StatusBadge réutilisable (dot + label)
- `src/app/(app)/page.tsx` — UPDATE : ajouter `<RecentQuotesList />` sous `<DashboardHero />` (Story 5.1)
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `dashboard.recentQuotes` + labels statuts si absents

**EXCLU (ne pas modifier) :**
- `src/lib/local-db.ts` — aucune modification, `db.quotes` + `QuoteLocal.clientSnapshot` déjà présents
- `src/hooks/use-live-quotes.ts` — peut être réutilisé ou un hook dédié `use-recent-quotes.ts` peut être créé
- `src/lib/money.ts` / `formatFcfa` — déjà implémenté, à importer directement
- Tout le moteur de sync — aucune modification
- `src/app/(app)/devis/[id]/` — route non créée (Epic 4), les liens pointent vers là sans bloquer

---

## Tâches / Sous-tâches

### T1 — Créer `src/components/shared/status-badge.tsx`

Ce composant sera réutilisé dans Epic 3 (liste devis), Epic 4 (aperçu), et ici. Le créer maintenant dans `shared/`.

- [x] `"use client"` première ligne (ou composant pur sans client-specific hooks — acceptable en SSR)
- [x] Imports :
  ```ts
  import { cn } from "@/lib/utils";
  ```
- [x] Type pour les statuts (import ou redéfinition locale) :
  ```ts
  export type QuoteStatus = "draft" | "validated" | "sent" | "accepted" | "expired" | "cancelled";
  ```
- [x] Config des statuts (dot couleur + bg tint + label) :
  ```ts
  const STATUS_CONFIG: Record<QuoteStatus, {
    dot: string;
    bg: string;
    text: string;
    label: string;
  }> = {
    draft:     { dot: "bg-text-muted",     bg: "bg-surface-alt",         text: "text-text-muted",     label: "Brouillon" },
    validated: { dot: "bg-brand-navy",     bg: "bg-brand-navy/10",       text: "text-brand-navy",     label: "Validé" },
    sent:      { dot: "bg-brand-amber",    bg: "bg-brand-amber/15",      text: "text-amber-deep",     label: "Envoyé" },
    accepted:  { dot: "bg-green-500",      bg: "bg-green-50",            text: "text-green-700",      label: "Accepté" },
    expired:   { dot: "bg-terracotta",     bg: "bg-terracotta/10",       text: "text-terracotta",     label: "Expiré" },
    cancelled: { dot: "bg-red-500",        bg: "bg-red-50",              text: "text-red-700",        label: "Annulé" },
  };
  ```
  **Note tokens :** utiliser les tokens CSS définis dans `globals.css` depuis Story 1.1. Si `bg-terracotta` n'existe pas comme classe utilitaire, utiliser `bg-[#b8502d]/10` et `text-[#b8502d]`. Vérifier dans `globals.css` les tokens disponibles.

- [x] Props :
  ```ts
  interface StatusBadgeProps {
    status: QuoteStatus;
    className?: string;
  }
  ```
- [x] Composant :
  ```tsx
  export function StatusBadge({ status, className }: StatusBadgeProps) {
    const config = STATUS_CONFIG[status];
    if (!config) return null;

    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
          config.bg,
          config.text,
          className
        )}
        aria-label={config.label}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} aria-hidden="true" />
        {config.label}
      </span>
    );
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/dashboard/recent-quotes-list.tsx`

- [x] `"use client"` première ligne
- [x] Imports :
  ```ts
  "use client";
  import { useState, useEffect } from "react";
  import { liveQuery } from "dexie";
  import Link from "next/link";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { QuoteLocal } from "@/lib/local-db";
  import { formatFcfa } from "@/lib/money";
  import { StatusBadge } from "@/components/shared/status-badge";
  import { cn } from "@/lib/utils";
  ```
- [x] Hook interne pour les 10 derniers devis :
  ```ts
  function useRecentQuotes() {
    const [quotes, setQuotes] = useState<QuoteLocal[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
      const subscription = liveQuery(async () => {
        // Trier par dateDevis DESC (fallback createdAt), prendre les 10 premiers
        const all = await db.quotes.orderBy("createdAt").reverse().toArray();
        // Tri secondaire : dateDevis si défini (plus récent en premier)
        all.sort((a, b) => {
          const da = a.dateDevis ?? a.createdAt;
          const db_ = b.dateDevis ?? b.createdAt;
          return da > db_ ? -1 : da < db_ ? 1 : 0;
        });
        return all.slice(0, 10);
      }).subscribe({
        next: (result) => {
          setQuotes(result);
          setIsLoading(false);
        },
        error: () => setIsLoading(false),
      });

      return () => subscription.unsubscribe();
    }, []);

    return { quotes, isLoading };
  }
  ```
  **Note:** éviter de nommer la variable de shadow `db_` si ce nom cause des conflits — utiliser `db2` ou `dB` à la place.

- [x] Fonction utilitaire pour le nom client depuis le snapshot :
  ```ts
  function getClientName(quote: QuoteLocal): string {
    if (!quote.clientSnapshot) return "Client inconnu";
    const snapshot = quote.clientSnapshot as { companyName?: string };
    return snapshot.companyName ?? "Client inconnu";
  }
  ```

- [x] Fonction utilitaire pour formater la date :
  ```ts
  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "—";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(dateStr));
  }
  ```

- [x] Composant principal avec skeleton, état vide, et liste
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/app/(app)/page.tsx`

Ajouter `<RecentQuotesList />` sous `<DashboardHero />` (l'import de DashboardHero a été ajouté en Story 5.1) :

- [x] Ajouter l'import :
  ```ts
  import { RecentQuotesList } from "@/components/dashboard/recent-quotes-list";
  ```
- [x] Ajouter le composant dans le JSX, après `<DashboardHero />` :
  ```tsx
  {/* Liste des devis récents (Story 5.2) */}
  <RecentQuotesList />
  ```
- [x] La structure de page.tsx après cette story intègre DashboardHero + RecentQuotesList
- [x] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/messages/fr-NE.json`

Ajouter sous la clé `"dashboard"` existante (créée en Story 5.1) :

- [x] Ajouter la sous-section `recentQuotes` :
  ```json
  "recentQuotes": {
    "sectionLabel": "Devis récents",
    "heading": "Devis récents",
    "viewAll": "Voir tout",
    "viewAllAriaLabel": "Voir tous les devis",
    "loading": "Chargement des devis récents…",
    "empty": "Aucun devis créé.",
    "createFirst": "Créer un devis",
    "quoteAriaLabel": "Devis {number} — {client}"
  }
  ```
- [x] Labels de statut : gérés en dur dans STATUS_CONFIG du StatusBadge (MVP — i18n possible en future itération)
- [x] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC8)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (pas de régression)
- [x] Dashboard affiche la section "Devis récents" sous la hero card ✓
- [x] 10 derniers devis listés (ou moins si <10 en base) ✓
- [x] Chaque ligne : numéro + client + date + badge statut + montant ✓
- [x] Badge statut : dot + texte (jamais color-only) ✓
- [x] Tap sur une ligne → navigation vers `/devis/{id}` ✓
- [x] "Voir tout" → navigation vers `/devis` ✓
- [x] Skeleton pendant le chargement initial ✓
- [x] Message vide + CTA si aucun devis ✓
- [x] liveQuery réactif : nouveau devis → liste mise à jour automatiquement ✓

---

## Dev Notes

### CRITIQUE — clientSnapshot est `unknown` dans QuoteLocal

```typescript
// src/lib/local-db.ts:31
clientSnapshot?: unknown;
```

Le snapshot est un objet `ClientLocal` sérialisé dans Dexie. Pour accéder au nom client :

```typescript
// CORRECT — cast sécurisé avec fallback
function getClientName(quote: QuoteLocal): string {
  if (!quote.clientSnapshot) return "Client inconnu";
  const snapshot = quote.clientSnapshot as { companyName?: string };
  return snapshot.companyName ?? "Client inconnu";
}

// INCORRECT — cast direct sans garde
const name = (quote.clientSnapshot as ClientLocal).companyName; // ← peut throw si undefined
```

**INTERDIT :** utiliser `quote.clientId` + lookup Dexie pour récupérer le client en live — le snapshot est précisément là pour ça. Un client peut avoir été modifié depuis la création du devis ; le snapshot capture l'état figé au moment du devis (FR-10, Story 2.8).

### CRITIQUE — Route /devis/[id] n'existe pas encore (Epic 4)

La route `/devis/[id]` sera créée en Epic 4 (Story 4.2 — aperçu avant génération). **En MVP-0 ici, les liens pointent vers `/devis/${quote.id}`** — Next.js renverra une 404 temporaire acceptable.

**Ne pas :**
- Rediriger vers `/devis` à la place
- Désactiver les liens
- Ajouter un `onClick` qui intercepte la navigation

**Le lien correct est :**
```tsx
<Link href={`/devis/${quote.id}`}>...</Link>
```
Epic 4 implémentera la page qui consommera ce paramètre.

### CRITIQUE — StatusBadge : tokens CSS disponibles

Le StatusBadge utilise des couleurs de la charte. Vérifier les tokens disponibles dans `globals.css` (créés en Story 1.1) avant de coder les classes :

Tokens certains (définis en Story 1.1) :
- `bg-brand-navy`, `text-brand-navy` — #1B3070
- `bg-brand-amber`, `text-brand-amber` — #F6A624
- `text-amber-deep` — #7d5600
- `bg-surface`, `bg-surface-alt`, `text-text-primary`, `text-text-muted`
- `border-border`

Tokens à vérifier :
- `bg-terracotta`, `text-terracotta` — #b8502d — peut ne pas exister comme utilitaire Tailwind si non déclaré dans le thème
- `bg-brand-navy-deep` — peut exister ou non

**Fallback sûr :** utiliser des valeurs hardcodées avec `[#...]` si un token n'est pas disponible :
```tsx
// Si bg-terracotta n'existe pas dans le thème
dot: "bg-[#b8502d]",
bg: "bg-[#b8502d]/10",
text: "text-[#b8502d]",
```

### CRITIQUE — Tri des 10 derniers devis

`db.quotes.orderBy("createdAt").reverse()` trie par `createdAt` (index Dexie). Mais le spec dit "10 derniers" qui devrait se baser sur `dateDevis` (la date saisie par le commercial). 

**Approche correcte : tri côté JS après récupération :**
```typescript
const all = await db.quotes.toArray();
all.sort((a, b) => {
  const da = a.dateDevis ?? a.createdAt;
  const db2 = b.dateDevis ?? b.createdAt;
  return da > db2 ? -1 : da < db2 ? 1 : 0;
});
return all.slice(0, 10);
```

**Pourquoi pas `orderBy("dateDevis")` :** `dateDevis` est indexé mais peut être `undefined` → les devis sans dateDevis seraient exclus ou mal triés par Dexie. Le tri JS avec fallback `createdAt` est plus robuste.

**Performance :** avec la base MVP (< 1000 devis), `toArray()` + tri JS est acceptable (<500ms offline — NFR-P5).

### CRITIQUE — liveQuery dans liveQuery — shadow variable `db`

Attention au shadow de variable si vous utilisez `liveQuery(() => { const all = await db.quotes... })` :

```typescript
// ATTENTION — ne pas utiliser 'db' comme nom de variable locale dans le callback
liveQuery(async () => {
  const all = await db.quotes.toArray(); // 'db' ici = import Dexie, pas un local
  all.sort((a, b) => {
    const da = a.dateDevis ?? a.createdAt;
    const db2 = b.dateDevis ?? b.createdAt; // ← nommer 'db2' pour éviter le shadow
    return da > db2 ? -1 : da < db2 ? 1 : 0;
  });
  return all.slice(0, 10);
})
```

### CRITIQUE — StatusBadge est un composant partagé (shared/)

Ce composant sera réutilisé dans Epic 3 (Story 3.9 — lifecycle status change, liste devis) et Epic 4. Le placer dans `src/components/shared/status-badge.tsx` (pas dans `dashboard/`).

Il ne doit pas dépendre du contexte Dashboard. Il prend juste `status: QuoteStatus`.

### CRITIQUE — `font-serif tabular-nums` sur les montants

```tsx
// CORRECT — montant en Spectral + tabular-nums (UX-DR2, D3)
<p className="font-serif text-xs font-semibold tabular-nums text-text-primary">
  {formatFcfa(quote.totalFcfa)}
</p>

// INCORRECT — sans font-serif
<p className="text-xs font-semibold tabular-nums">
  {formatFcfa(quote.totalFcfa)}
</p>
```

### CRITIQUE — `totalFcfa` peut être 0 pour les devis brouillons sans prestations

Un devis en cours de création (wizard non complété) peut avoir `totalFcfa: 0`. Ne pas masquer les montants nuls — afficher `formatFcfa(0)` = "0 F CFA" ou similaire. Ne pas mettre de condition `{quote.totalFcfa > 0 ? ... : "—"}` — afficher toujours le montant.

**Exception :** si le devis est en `status: "draft"` et `totalFcfa === 0`, afficher "—" est acceptable UX pour éviter "0 F CFA" trompeur. À la discrétion du dev agent, mais documenter le choix.

**Choix implémenté :** draft + totalFcfa === 0 → affiche "—" (UX plus propre, évite "0 F CFA" trompeur sur brouillons incomplets).

### CRITIQUE — Accessibilité de la liste (UX-DR22, UX-DR23)

Chaque ligne est un `<Link>` (= `<a>`) qui englobe tout le contenu de la row. Cela garantit :
- Cible de tap large (toute la ligne, min-h-[56px] → ≥44px) ✓
- Navigation clavier (Tab + Enter) ✓
- Aria-label descriptif sur le lien ✓

```tsx
// CORRECT — lien sur toute la ligne
<Link href={`/devis/${quote.id}`} aria-label={`Devis ${quote.number} — ${getClientName(quote)}`}>
  <div className="min-h-[56px] flex items-center ...">
    ...
  </div>
</Link>

// INCORRECT — onClick sur div
<div onClick={() => router.push(`/devis/${quote.id}`)}> // ← pas accessible keyboard
```

### Design tokens — liste de devis

```tsx
// Card de ligne standard
className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-alt transition-colors"

// Numéro du devis — Spectral + tabular-nums
className="font-serif text-sm font-semibold tabular-nums text-text-primary"

// Client name
className="text-xs text-text-muted truncate"

// Date
className="text-xs text-text-muted tabular-nums"

// Montant — Spectral + tabular-nums
className="font-serif text-xs font-semibold tabular-nums text-text-primary"

// En-tête section
className="font-serif text-lg font-semibold text-text-primary"

// Lien "Voir tout"
className="text-xs font-medium text-brand-navy hover:underline"
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `fetch("/api/v1/quotes")` pour récupérer les devis | `liveQuery(() => db.quotes.toArray())` |
| `clientId` + lookup Dexie pour le nom client | `clientSnapshot?.companyName` (snapshot figé) |
| `(quote.clientSnapshot as ClientLocal).companyName` sans garde | `(quote.clientSnapshot as {companyName?: string})?.companyName ?? "Client inconnu"` |
| `<div onClick={router.push(...)}>` | `<Link href={...}>` pour accessibilité keyboard |
| StatusBadge dans `dashboard/` | StatusBadge dans `shared/` pour réutilisation cross-stories |
| `orderBy("dateDevis")` Dexie (dateDevis peut être undefined) | `toArray()` + tri JS avec fallback `createdAt` |
| Lien vers `/devis` à la place de `/devis/${id}` | Lien vers `/devis/${quote.id}` (Epic 4 créera la page) |
| Oublier `return () => subscription.unsubscribe()` | Cleanup obligatoire dans useEffect |
| Hardcoder les strings UI | `useTranslations("dashboard.recentQuotes")` |
| `import { QuoteLocal } from "@/lib/local-db"` sans vérifier type | `import type { QuoteLocal }` (type-only import) |

### Héritage des stories précédentes

**Story 5.1 (dashboard-hero.tsx) — structure page.tsx :**
```tsx
// page.tsx après Story 5.1 — à modifier pour ajouter RecentQuotesList
<div className="flex flex-col gap-6 px-5 pt-8 pb-6">
  <div>...</div>     {/* Greeting — NE PAS MODIFIER */}
  <DashboardHero />  {/* Story 5.1 — NE PAS MODIFIER */}
  {/* Ajouter ici RecentQuotesList */}
</div>
```

**Story 2.8 (client snapshots) — pattern snapshot :**
- `clientSnapshot` = copie figée de `ClientLocal` au moment de la création du devis
- C'est un objet serialisé Dexie de type `unknown` → cast `as { companyName?: string }`
- Source de vérité pour le nom client sur le devis (pas `clientId` + re-lookup)

**Story 3.1 (création devis) — structure QuoteLocal :**
```typescript
// Champs disponibles sur chaque QuoteLocal :
quote.number          // TEMP-... ou DEV-YYYY-XXXX
quote.status          // "draft" | "validated" | "sent" | "accepted" | "expired" | "cancelled"
quote.clientSnapshot  // { companyName, phone, ... } - cast nécessaire
quote.dateDevis       // string ISO ou undefined
quote.createdAt       // string ISO (toujours défini)
quote.totalFcfa       // number (integer FCFA)
```

**use-live-quotes.ts — pattern à reproduire :**
```typescript
// src/hooks/use-live-quotes.ts — référence directe
const subscription = liveQuery(() =>
  db.quotes.orderBy("createdAt").reverse().toArray()
).subscribe({
  next: (result) => setQuotes(result),
  error: () => setQuotes([]),
});
return () => subscription.unsubscribe();
```

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration — agrégats Dexie uniquement
# Vérifier les tokens CSS disponibles dans globals.css pour StatusBadge
# grep -r "terracotta\|amber-deep\|surface-alt" src/app/globals.css

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 5.2] — FR-41 (liste devis récents, 10 derniers, colonnes numéro/client/date/statut/montant, tap → ouvre)
- [src/lib/local-db.ts:24-56] — `QuoteLocal` (clientSnapshot, status, totalFcfa, dateDevis, createdAt)
- [src/lib/local-db.ts:173] — index Dexie `quotes` (status, clientId, dateDevis indexés)
- [src/hooks/use-live-quotes.ts] — pattern liveQuery à reproduire (tri + subscribe)
- [src/lib/money.ts:11] — `formatFcfa(n: number): string` — à importer directement
- [src/app/(app)/page.tsx] — fichier à modifier (ajouter RecentQuotesList sous DashboardHero)
- [src/components/shared/sync-indicator.tsx] — exemple de composant dans `shared/`
- [UX-DR8] — Status badge : tinted bg + dot + text per lifecycle, 6 statuts
- [UX-DR22] — Cibles ≥44×44px (lignes de liste)
- [UX-DR23] — Jamais color-only — dot + texte toujours
- [EXPERIENCE.md §Flow 2] — "Dashboard → 'Devis récents' → 'Voir tout' → quote list"
- [DESIGN.md §Components] — Status badge : "tinted bg + dot + text per lifecycle table, radius badge"
- [Story 5.1] — `_bmad-output/implementation-artifacts/5-1-synthetic-activity-view.md` — structure page.tsx + pattern DashboardHero

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Vérifié globals.css : tokens CSS status lifecycle complets (`--status-brouillon-{suffix}`, `--status-valide-{suffix}`, etc.) → utilisés via `bg-[var(--status-brouillon-bg)]` etc. dans StatusBadge
- Story 5.1 déjà implémentée : `DashboardHero` existe dans `src/components/dashboard/dashboard-hero.tsx` et le linter a automatiquement ajouté son import dans page.tsx
- `fr-NE.json` avait déjà les clés `dashboard.*` de Story 5.1 → `recentQuotes` ajouté comme sous-section de `dashboard`
- Choix documenté : draft + totalFcfa === 0 → affiche "—" pour UX plus propre
- Revue finale : AC1 corrige avec date visible mobile + sm+, AC6 corrige avec expired=terracotta et cancelled=red.
- Verification finale : pnpm check vert (lint 0 erreur, typecheck, 206 tests) et pnpm build vert (migrate, compile, 27 pages).

### Completion Notes List

- T1 : `StatusBadge` créé dans `shared/` (SSR-compatible, pas de "use client"), utilise les CSS variables de status lifecycle définies en Story 1.1. Exporté `QuoteStatus` type pour réutilisation cross-stories.
- T2 : `RecentQuotesList` créé avec hook `useRecentQuotes` inline utilisant `liveQuery` Dexie. Tri JS par `dateDevis ?? createdAt` DESC, slice(0, 10). États skeleton (3 rows), vide (CTA), et liste implémentés. Liens pointent vers `/devis/${id}` (404 acceptable jusqu'à Epic 4). Aria-label sur chaque ligne.
- T3 : `page.tsx` mis à jour pour inclure `DashboardHero` (Story 5.1) + `RecentQuotesList`. Structure correcte avec gap-6 et pb-6.
- T4 : `fr-NE.json` mis à jour, `dashboard.recentQuotes` ajouté dans la clé `dashboard` existante de Story 5.1.
- T5 : pnpm check -> 0 erreurs, 206 tests passent, typecheck propre. pnpm build complet -> migration, compilation et 27 pages generees sans erreur.

### File List

- `src/components/shared/status-badge.tsx` (créé)
- `src/components/dashboard/recent-quotes-list.tsx` (créé)
- `src/app/(app)/page.tsx` (modifié)
- `src/messages/fr-NE.json` (modifié)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis a jour : review -> done)
- `_bmad-output/implementation-artifacts/5-2-recent-quotations-list.md` (ce fichier)

### Change Log

- 2026-06-26 : Implémentation Story 5.2 — Liste des devis récents. Créé `StatusBadge` (composant partagé réutilisable avec CSS lifecycle tokens), `RecentQuotesList` (liveQuery Dexie, tri par dateDevis DESC, skeleton/vide/liste), mis à jour `page.tsx` (DashboardHero + RecentQuotesList), ajouté `dashboard.recentQuotes` dans `fr-NE.json`. pnpm check : 0 erreurs, 206 tests ✓.
- 2026-06-26 : Revue finale appliquee - date visible sur mobile, mapping statut conforme AC6, pnpm check vert et pnpm build complet vert. Story passee a done.
