---
story_key: 5-1-synthetic-activity-view
epic_num: 5
story_num: 1
status: review
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 5.1 : Vue synthétique de l'activité (FR-40)

**Statut :** ready-for-dev

## Story

**En tant que** gérant,
**Je veux** voir les compteurs de devis par statut sur une période choisie,
**Afin que** je saisisse l'état de mon activité d'un coup d'œil depuis le tableau de bord.

---

## Critères d'acceptation (BDD)

**AC1 — Hero card affiche les compteurs par statut**

```
GIVEN  le Dashboard `/` (page.tsx dans src/app/(app)/)
WHEN   la page se charge
THEN   un composant DashboardHero (client) s'affiche avec la hero card navy (UX-DR6)
AND    les compteurs suivants sont affichés : Total, Brouillons, Envoyés, Acceptés, Expirés
AND    les compteurs sont calculés via liveQuery Dexie sur db.quotes (agrégats locaux, FR-40)
AND    les devis supprimés (cancelled + deletedAt si applicable) ne comptent pas dans "Total"
       (Total = somme de tous statuts non annulés, ou total brut — voir note métier ci-dessous)
```

**AC2 — Filtre par période (7j / 30j / 90j / tout)**

```
GIVEN  la hero card du Dashboard
WHEN   je sélectionne une période (segmented control : 7j, 30j, 90j, Tout)
THEN   les compteurs se recalculent immédiatement pour ne compter que les devis
       dont dateDevis (ou createdAt si dateDevis absent) est dans la fenêtre temporelle
AND    la période "30j" est active par défaut
AND    le segmented control expose aria-pressed / role="tab" + aria-selected (UX-DR23)
AND    les cibles de tap sont ≥ 44×44px (UX-DR22)
```

**AC3 — Refresh automatique toutes les 30 secondes**

```
GIVEN  le Dashboard est affiché
WHEN   30 secondes s'écoulent sans interaction
THEN   les compteurs se recalculent automatiquement (refresh passif via liveQuery Dexie)
AND    en pratique : liveQuery Dexie se met à jour à chaque mutation locale, donc le
       refresh explicite 30s est un setInterval secondaire pour forcer un re-render
       si aucune mutation n'est intervenue
AND    le refresh ne cause pas de flash/skeleton — mise à jour silencieuse
```

**AC4 — Chargement < 2 secondes offline**

```
GIVEN  l'utilisateur est hors ligne
WHEN   il ouvre le Dashboard
THEN   les compteurs s'affichent en < 2 secondes (données depuis Dexie local, pas d'appel réseau)
AND    un skeleton s'affiche pendant le premier rendu (état loading avant que liveQuery réponde)
```

**AC5 — Design hero card conforme à UX-DR6**

```
GIVEN  la hero card
WHEN   elle est rendue
THEN   fond navy (bg-brand-navy), radius rounded-2xl (dark-block)
AND    filigrane Sahel 4% opacity statique (désactivé sous prefers-reduced-motion)
AND    glow radial amber-terracotta top-right (breathing animation, désactivée sous prefers-reduced-motion)
AND    eyebrow "ACTIVITÉ · {période}" en uppercase Hanken 10–11px text-text-on-dark/70
AND    compteurs en Spectral avec tabular-nums text-text-on-dark
AND    les labels de statut en Hanken text-text-on-dark/70 sous chaque chiffre
```

**AC6 — Qualité**

```
GIVEN  les fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Note métier — Définition du "Total"

Le PRD FR-40 dit "compteurs par statut". Les statuts dans `QuoteLocal.status` sont :
- `"draft"` → Brouillon
- `"validated"` → Validé
- `"sent"` → Envoyé
- `"accepted"` → Accepté
- `"expired"` → Expiré
- `"cancelled"` → Annulé

**Recommandation d'implémentation :** Afficher un compteur par statut (sauf cancelled qui est exclu des métriques principales selon FR-42), plus un "Total" = somme de tous statuts non annulés. Les Annulés peuvent être affichés séparément ou omis. Voir Story 5.3 pour les métriques montants qui excluent explicitement Draft + Cancelled.

---

## Périmètre de cette story

**INCLUS :**
- `src/app/(app)/page.tsx` — UPDATE : remplacer le placeholder par le composant DashboardHero (Server Component → importe DashboardHero client)
- `src/components/dashboard/dashboard-hero.tsx` — CRÉER : hero card avec compteurs + filtre période
- `src/hooks/use-dashboard-stats.ts` — CRÉER : hook liveQuery Dexie calculant les agrégats par statut + période
- `src/messages/fr-NE.json` — UPDATE : ajouter section `dashboard`

**EXCLU (ne pas modifier) :**
- `src/lib/local-db.ts` — aucune modification — `db.quotes` est la source (index `status` déjà défini ligne 173)
- `src/lib/schema.ts` — aucune migration nécessaire
- Tout le moteur de sync — les agrégats sont purement locaux (Dexie)
- Stories 5.2 et 5.3 — hors périmètre de cette story

---

## Tâches / Sous-tâches

### T1 — Créer `src/hooks/use-dashboard-stats.ts`

- [ ] `"use client"` première ligne
- [ ] Imports :
  ```ts
  "use client";
  import { useState, useEffect, useCallback } from "react";
  import { liveQuery } from "dexie";
  import { db } from "@/lib/local-db";
  import type { QuoteLocal } from "@/lib/local-db";
  ```
- [ ] Type pour la période :
  ```ts
  export type DashboardPeriod = "7j" | "30j" | "90j" | "tout";
  ```
- [ ] Interface résultat :
  ```ts
  export interface DashboardStats {
    total: number;        // tous statuts non annulés
    draft: number;        // "draft"
    validated: number;    // "validated"
    sent: number;         // "sent"
    accepted: number;     // "accepted"
    expired: number;      // "expired"
    cancelled: number;    // "cancelled" (pour info, exclu du Total)
    isLoading: boolean;
  }
  ```
- [ ] Fonction utilitaire pour calculer la date de coupure :
  ```ts
  function getCutoffDate(period: DashboardPeriod): Date | null {
    if (period === "tout") return null;
    const days = period === "7j" ? 7 : period === "30j" ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }
  ```
- [ ] Fonction d'agrégat (pure, testable) :
  ```ts
  export function computeStats(quotes: QuoteLocal[], period: DashboardPeriod): Omit<DashboardStats, "isLoading"> {
    const cutoff = getCutoffDate(period);
    const filtered = cutoff
      ? quotes.filter((q) => {
          const dateStr = q.dateDevis ?? q.createdAt;
          return dateStr ? new Date(dateStr) >= cutoff : false;
        })
      : quotes;

    const counts = { draft: 0, validated: 0, sent: 0, accepted: 0, expired: 0, cancelled: 0 };
    for (const q of filtered) {
      if (q.status in counts) counts[q.status as keyof typeof counts]++;
    }
    const total = counts.draft + counts.validated + counts.sent + counts.accepted + counts.expired;
    return { total, ...counts };
  }
  ```
- [ ] Hook principal :
  ```ts
  export function useDashboardStats(period: DashboardPeriod): DashboardStats {
    const [allQuotes, setAllQuotes] = useState<QuoteLocal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tick, setTick] = useState(0); // pour le refresh 30s

    // liveQuery réagit à chaque mutation Dexie
    useEffect(() => {
      const subscription = liveQuery(() => db.quotes.toArray()).subscribe({
        next: (quotes) => {
          setAllQuotes(quotes);
          setIsLoading(false);
        },
        error: () => {
          setIsLoading(false);
        },
      });
      return () => subscription.unsubscribe();
    }, []);

    // Refresh passif toutes les 30 secondes (FR-40)
    useEffect(() => {
      const interval = setInterval(() => setTick((t) => t + 1), 30_000);
      return () => clearInterval(interval);
    }, []);

    // tick déclenche un re-calcul même sans mutation Dexie
    const stats = computeStats(allQuotes, period);
    return { ...stats, isLoading };
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/dashboard/dashboard-hero.tsx`

- [ ] `"use client"` première ligne
- [ ] Imports :
  ```ts
  "use client";
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { useDashboardStats, type DashboardPeriod } from "@/hooks/use-dashboard-stats";
  import { cn } from "@/lib/utils";
  ```
- [ ] Créer le répertoire `src/components/dashboard/` (nouveau dossier)
- [ ] Constante des périodes :
  ```ts
  const PERIODS: { key: DashboardPeriod; label: string }[] = [
    { key: "7j",   label: "7j" },
    { key: "30j",  label: "30j" },
    { key: "90j",  label: "90j" },
    { key: "tout", label: "Tout" },
  ];
  ```
- [ ] Composant principal :
  ```tsx
  export function DashboardHero() {
    const [period, setPeriod] = useState<DashboardPeriod>("30j");
    const stats = useDashboardStats(period);
    const t = useTranslations("dashboard");

    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-brand-navy px-5 py-6",
          "text-text-on-dark"
        )}
        aria-label={t("heroAriaLabel")}
      >
        {/* Filigrane Sahel — 4% opacity, static (désactivé motion:reduce) */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04] motion-reduce:hidden"
          aria-hidden="true"
          style={{
            backgroundImage: "url('/sahel-pattern.svg')",
            backgroundRepeat: "repeat",
            backgroundSize: "80px 80px",
          }}
        />

        {/* Glow radial amber-terracotta top-right */}
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full opacity-20 motion-reduce:opacity-0"
          aria-hidden="true"
          style={{
            background: "radial-gradient(circle, #F6A624 0%, #b8502d 60%, transparent 100%)",
            animation: "breathe 4s ease-in-out infinite",
          }}
        />

        {/* Eyebrow */}
        <p className="relative z-10 text-[10px] font-semibold uppercase tracking-widest text-text-on-dark/70">
          {t("eyebrow", { period: period.toUpperCase() })}
        </p>

        {/* Compteur total principal — Spectral */}
        {stats.isLoading ? (
          <div className="relative z-10 mt-2 h-10 w-24 animate-pulse rounded-lg bg-white/10" />
        ) : (
          <p className="relative z-10 mt-2 font-serif text-4xl font-semibold tabular-nums">
            {stats.total}
          </p>
        )}
        <p className="relative z-10 text-xs text-text-on-dark/70">{t("totalLabel")}</p>

        {/* Segmented control — filtre période */}
        <div
          className="relative z-10 mt-4 flex gap-1"
          role="tablist"
          aria-label={t("periodFilterLabel")}
        >
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              aria-pressed={period === key}
              onClick={() => setPeriod(key)}
              className={cn(
                "min-h-[44px] flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                period === key
                  ? "bg-white text-brand-navy"
                  : "text-text-on-dark/80 hover:bg-white/10"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Grille des compteurs par statut */}
        <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCounter
            label={t("statusDraft")}
            value={stats.draft}
            isLoading={stats.isLoading}
            dotClass="bg-text-on-dark/40"
          />
          <StatCounter
            label={t("statusSent")}
            value={stats.sent}
            isLoading={stats.isLoading}
            dotClass="bg-brand-amber"
          />
          <StatCounter
            label={t("statusAccepted")}
            value={stats.accepted}
            isLoading={stats.isLoading}
            dotClass="bg-green-400"
          />
          <StatCounter
            label={t("statusExpired")}
            value={stats.expired}
            isLoading={stats.isLoading}
            dotClass="bg-red-400"
          />
        </div>
      </div>
    );
  }
  ```
- [ ] Sous-composant `StatCounter` :
  ```tsx
  interface StatCounterProps {
    label: string;
    value: number;
    isLoading: boolean;
    dotClass: string;
  }

  function StatCounter({ label, value, isLoading, dotClass }: StatCounterProps) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden="true" />
          <span className="text-[10px] font-medium text-text-on-dark/70">{label}</span>
        </div>
        {isLoading ? (
          <div className="h-7 w-12 animate-pulse rounded bg-white/10" />
        ) : (
          <p className="font-serif text-2xl font-semibold tabular-nums">{value}</p>
        )}
      </div>
    );
  }
  ```
- [ ] Ajouter l'animation `breathe` dans `globals.css` si absente :
  ```css
  @keyframes breathe {
    0%, 100% { transform: scale(1); opacity: 0.20; }
    50% { transform: scale(1.15); opacity: 0.30; }
  }
  ```
  **OU** utiliser Tailwind `animate-pulse` si l'animation custom pose problème — acceptable.
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/app/(app)/page.tsx`

- [ ] Transformer en Server Component qui importe DashboardHero :
  ```tsx
  import { headers } from "next/headers";
  import { auth } from "@/lib/auth";
  import { DashboardHero } from "@/components/dashboard/dashboard-hero";

  export default async function DashboardPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    const name = session?.user.name ?? session?.user.email ?? "vous";

    return (
      <div className="flex flex-col gap-6 px-5 pt-8 pb-6">
        {/* Greeting */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Tableau de bord
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
            Bonjour, {name}
          </h1>
        </div>

        {/* Hero — vue synthétique activité (Story 5.1) */}
        <DashboardHero />

        {/* Placeholder Stories 5.2 et 5.3 — à implémenter dans les stories suivantes */}
      </div>
    );
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter section `dashboard` (avant ou après `"parametres"`) :
  ```json
  "dashboard": {
    "heroAriaLabel": "Vue synthétique de l'activité",
    "eyebrow": "ACTIVITÉ · {period}",
    "totalLabel": "devis actifs",
    "periodFilterLabel": "Filtrer par période",
    "statusDraft": "Brouillons",
    "statusValidated": "Validés",
    "statusSent": "Envoyés",
    "statusAccepted": "Acceptés",
    "statusExpired": "Expirés",
    "statusCancelled": "Annulés",
    "loadingStats": "Calcul des statistiques…"
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC6)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (pas de régression)
- [ ] `pnpm build` : passe sans erreur
- [ ] Dashboard `/` affiche la hero card navy ✓
- [ ] Compteurs s'affichent depuis Dexie local ✓
- [ ] Filtre 7j/30j/90j/Tout change les compteurs ✓
- [ ] Skeleton visible pendant le chargement initial ✓
- [ ] Page fonctionne offline (aucun appel réseau pour les compteurs) ✓
- [ ] `prefers-reduced-motion` : filigrane et glow masqués ✓

---

## Dev Notes

### CRITIQUE — Architecture Dashboard : Server Component + Client Component

`src/app/(app)/page.tsx` est actuellement un Server Component (pas de `"use client"`). La hero card avec liveQuery Dexie **doit** être un Client Component.

**Pattern correct :**
- `page.tsx` = Server Component : récupère session, passe `name`, importe `DashboardHero`
- `DashboardHero` = Client Component (`"use client"`) : liveQuery Dexie + état période

**INTERDIT :** Mettre `"use client"` sur `page.tsx` — cela briserait la récupération session côté serveur.

### CRITIQUE — liveQuery Dexie est la source de vérité, pas un fetch API

Toutes les données du dashboard viennent de **Dexie local** (`db.quotes`), jamais d'un appel API. C'est le principe offline-first. Le même pattern est utilisé dans :
- `src/hooks/use-live-quotes.ts` — `liveQuery(() => db.quotes.orderBy("createdAt").reverse().toArray())`
- `src/hooks/use-live-clients.ts` — `liveQuery(() => db.clients.filter(...).toArray())`

```typescript
// CORRECT — agrégats locaux
const subscription = liveQuery(() => db.quotes.toArray()).subscribe({
  next: (quotes) => setAllQuotes(quotes),
  error: () => setIsLoading(false),
});

// INCORRECT — ne pas appeler /api/v1/quotes ou similaire
const res = await fetch("/api/v1/quotes"); // ← INTERDIT pour les compteurs dashboard
```

### CRITIQUE — Interface QuoteLocal.status : valeurs anglaises lowercase

```typescript
// src/lib/local-db.ts:29
status: "draft" | "validated" | "sent" | "accepted" | "expired" | "cancelled";
```

**Les comparaisons doivent utiliser les valeurs anglaises lowercase**, pas les labels français UI.

```typescript
// CORRECT
if (q.status === "draft") counts.draft++;

// INCORRECT
if (q.status === "Brouillon") ...  // ← string UI, pas la valeur DB
```

### CRITIQUE — dateDevis peut être absent sur des devis anciens

```typescript
// CORRECT — fallback sur createdAt si dateDevis absent
const dateStr = q.dateDevis ?? q.createdAt;
return dateStr ? new Date(dateStr) >= cutoff : false;

// INCORRECT — dateDevis seul peut être undefined
const dateStr = q.dateDevis; // ← peut être undefined → devis ignoré
```

### CRITIQUE — Refresh 30s : liveQuery vs setInterval

liveQuery Dexie réagit automatiquement à chaque écriture locale (via `applyLocalMutation`). Le `setInterval` de 30s est un **filet de sécurité** pour le cas où aucune mutation n'intervient mais où le temps passe (période "7j" qui change de jour, par exemple).

Le `tick` dans le hook force un re-calcul de `computeStats` sans re-subscribe à liveQuery :
```typescript
// tick ne déclenche pas un nouveau liveQuery — il force juste un re-render
// qui recalcule computeStats(allQuotes, period) avec les données déjà en mémoire
const [tick, setTick] = useState(0);
useEffect(() => {
  const interval = setInterval(() => setTick((t) => t + 1), 30_000);
  return () => clearInterval(interval);
}, []);
// tick est utilisé dans computeStats via dépendance implicite via re-render
```

**Alternative acceptable :** forcer le recalcul en passant `tick` comme paramètre à `computeStats` ou simplement le laisser comme dépendance de `useMemo`.

### CRITIQUE — Segmented control : accessibilité obligatoire (UX-DR22, UX-DR23)

Les boutons de période doivent avoir :
- `role="tab"` et `aria-selected={period === key}` (ou `aria-pressed` pour toggle buttons)
- Hauteur min 44px (`min-h-[44px]`) — cibles tactiles (UX-DR22)
- État visuel ET aria (pas color-only) — UX-DR23

```tsx
// CORRECT
<button
  role="tab"
  aria-selected={period === key}
  aria-pressed={period === key}
  className={cn("min-h-[44px] ...", period === key ? "bg-white text-brand-navy" : "...")}
>

// INCORRECT — seulement couleur, pas d'aria
<button className={period === key ? "bg-white" : ""}>
```

### CRITIQUE — Filigrane Sahel : désactivé sous prefers-reduced-motion

Le filigrane et le glow doivent être **statiques** (UX-DR6 : "static under prefers-reduced-motion"). L'animation breathing du glow doit s'arrêter. Utiliser la classe Tailwind `motion-reduce:hidden` ou `motion-reduce:opacity-0` sur les éléments animés.

```tsx
// Filigrane — statique toujours, mais caché si motion-reduce pour simplifier
<div className="... motion-reduce:hidden" />

// Glow — animation disabled
<div className="... motion-reduce:opacity-0" style={{ animation: "breathe 4s ease-in-out infinite" }} />
```

**Alternative complète :** CSS media query dans le style inline :
```css
@media (prefers-reduced-motion: reduce) {
  .sahel-glow { animation: none; opacity: 0; }
}
```

### CRITIQUE — Skeleton pendant le chargement initial

Le premier render avec `isLoading: true` affiche des skeletons à la place des chiffres. Utiliser `animate-pulse` + `rounded` + fond `bg-white/10` (sur fond navy) pour rester cohérent avec la charte.

### Design tokens — hero card navy (UX-DR6)

```tsx
// Hero card base
className="relative overflow-hidden rounded-2xl bg-brand-navy px-5 py-6 text-text-on-dark"
// Eyebrow
className="text-[10px] font-semibold uppercase tracking-widest text-text-on-dark/70"
// Grand chiffre total — Spectral
className="font-serif text-4xl font-semibold tabular-nums"
// Chiffres statuts — Spectral 2xl
className="font-serif text-2xl font-semibold tabular-nums"
// Segmented active
className="bg-white text-brand-navy"
// Segmented inactive
className="text-text-on-dark/80 hover:bg-white/10"
```

### CRITIQUE — Sahel pattern SVG

Le `public/sahel-pattern.svg` doit exister (créé dans Epic 1 Story 1). Si absent, remplacer par un pattern CSS ou omettre le filigrane (acceptable MVP). **NE PAS bloquer la story sur ce point** — vérifier d'abord :

```bash
ls public/sahel-pattern.svg  # ou équivalent
```

Si absent : utiliser un pattern CSS inline comme fallback :
```tsx
style={{
  backgroundImage: `url("data:image/svg+xml,<svg .../>")`,  // SVG inline minimal
}}
```

Ou simplement commenter le filigrane avec un TODO (la hero card navy fonctionne sans).

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `"use client"` sur page.tsx | page.tsx Server Component, DashboardHero Client Component |
| Appel fetch API pour les compteurs | liveQuery Dexie db.quotes.toArray() |
| Comparer `q.status === "Brouillon"` | Comparer `q.status === "draft"` (valeur DB anglaise) |
| Oublier le cleanup `subscription.unsubscribe()` | `return () => subscription.unsubscribe()` dans useEffect |
| Segmented control sans aria | `role="tab"` + `aria-selected` + min-h-[44px] |
| Refresh 30s avec un re-fetch API | setInterval → setTick → re-render → recompute local |
| Pas de skeleton | isLoading: true → skeleton animate-pulse pendant premier chargement |

### Héritage des stories précédentes

**Story 1.5 (app shell) — page.tsx actuelle :**
```tsx
// src/app/(app)/page.tsx — état actuel à REMPLACER
<p className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
  Le tableau de bord sera disponible dans les prochaines stories.
</p>
```
Ce placeholder est la seule chose à remplacer — le reste du layout (auth check dans layout.tsx, BottomNav, OfflineBanner) reste intact.

**Pattern liveQuery des stories 2.x (use-live-clients.ts, use-live-quotes.ts) :**
- Toujours `liveQuery(...).subscribe({ next, error })` natif Dexie
- Toujours cleanup `return () => subscription.unsubscribe()`
- Jamais `useLiveQuery` wrapper tiers

**Story 1.1 (design system) — tokens à réutiliser :**
- `bg-brand-navy` = `#1B3070`
- `text-text-on-dark` = blanc ou presque blanc sur fond navy
- `bg-brand-amber` = `#F6A624`
- `font-serif` = Spectral
- `tabular-nums` obligatoire sur tous les montants/chiffres

### Commandes pour le dev agent

```bash
# 1. Docker en cours (pour pnpm check + build)
docker compose up -d

# 2. Aucune migration nécessaire
# Aucune modification db schema — agrégats Dexie uniquement

# 3. Créer le répertoire dashboard
mkdir -p src/components/dashboard

# 4. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 5. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 5.1] — FR-40 (vue synthétique activité, compteurs par statut, filtre période 7/30/90j/tout, refresh 30s)
- [src/lib/local-db.ts:24-56] — `QuoteLocal` (interface complète avec status enum)
- [src/lib/local-db.ts:173] — index Dexie sur `quotes` (status indexé)
- [src/hooks/use-live-quotes.ts] — pattern liveQuery à reproduire
- [src/app/(app)/page.tsx] — fichier à mettre à jour (placeholder actuel)
- [src/app/(app)/layout.tsx] — layout shell (NE PAS MODIFIER)
- [UX-DR6] — Hero card spec (navy, filigrane 4%, glow radial, eyebrow + Spectral 36 montant)
- [UX-DR22] — Cibles ≥44×44px (segmented control)
- [UX-DR23] — Accessible names, aria-pressed/aria-selected, jamais color-only
- [UX-DR21] — prefers-reduced-motion : désactiver ambient + entrance
- [EXPERIENCE.md §Flow 1] — "Dashboard greets 'Bonjour, Amadou' over the navy hero with its warm sunset glow"
- [EXPERIENCE.md §Component Patterns] — "Segmented control: default period = 30j"
- [DESIGN.md §Components] — Hero card : "sunset radial glow top-right (amber → terracotta, low opacity, breathing)"

---

## Dev Agent Record

### Agent Model Used

_À remplir par le dev agent_

### Debug Log References

_À remplir par le dev agent_

### Completion Notes List

_À remplir par le dev agent_

### File List

- `src/hooks/use-dashboard-stats.ts` (à créer)
- `src/components/dashboard/dashboard-hero.tsx` (à créer)
- `src/app/(app)/page.tsx` (à modifier)
- `src/messages/fr-NE.json` (à modifier)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/5-1-synthetic-activity-view.md` (ce fichier)

### Change Log

_À remplir par le dev agent_
