---
story_key: 5-3-amount-metrics
epic_num: 5
story_num: 3
status: review
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 5.3 : Métriques de montants (FR-42)

**Statut :** ready-for-dev

## Story

**En tant que** gérant,
**Je veux** voir le total des montants devisés sur la période,
**Afin que** je mesure la valeur commerciale en cours depuis le tableau de bord.

---

## Critères d'acceptation (BDD)

**AC1 — Métrique montant : somme Acceptés + Envoyés uniquement**

```
GIVEN  le hero card du Dashboard (section ajoutée après les compteurs de Story 5.1)
WHEN   je consulte la métrique montant
THEN   la somme des `totalFcfa` des devis dont status = "accepted" OU status = "sent"
       est calculée via agrégats Dexie locaux (offline-first, aucun appel API)
AND    Brouillons ("draft"), Annulés ("cancelled"), Validés ("validated"), Expirés ("expired")
       sont exclus de cette somme (FR-42)
AND    le résultat est affiché en FCFA via formatFcfa() de @/lib/money.ts
       (ex : "1 250 000 XOF" — séparateur milliers fr-FR, Intl.NumberFormat)
AND    la valeur est rendue en Spectral avec tabular-nums (UX-DR2, UX-DR6)
```

**AC2 — Filtre par période partagé avec Story 5.1**

```
GIVEN  le segmented control de période (7j / 30j / 90j / Tout) de Story 5.1
WHEN   l'utilisateur change la période
THEN   la métrique montant se recalcule immédiatement pour ne sommer que les devis
       dans la fenêtre temporelle sélectionnée
AND    la période partagée est celle de DashboardHero (state hissé ou prop transmise)
AND    aucun state dupliqué pour la période — une seule source de vérité (Story 5.1)
```

**AC3 — Intégration dans le hero card navy (UX-DR6)**

```
GIVEN  le hero card navy de DashboardHero (src/components/dashboard/dashboard-hero.tsx)
WHEN   la section montant est rendue
THEN   elle s'affiche dans la hero card existante, en dessous des compteurs par statut
AND    eyebrow éditorial : "TOTAL DEVISÉ" (ou "VALEUR EN COURS") en uppercase Hanken 10–11px
       text-text-on-dark/70
AND    le montant formaté s'affiche en Spectral, tabular-nums, text-2xl font-semibold
       text-text-on-dark
AND    un sous-label "Acceptés + Envoyés" en text-xs text-text-on-dark/60
AND    aucun appel API — données depuis db.quotes via liveQuery Dexie (offline-first)
```

**AC4 — État zéro (aucun devis éligible)**

```
GIVEN  aucun devis avec status "accepted" ou "sent" dans la période sélectionnée
WHEN   la métrique montant se rend
THEN   elle affiche "0 XOF" (ou "— XOF") avec formatFcfa(0)
AND    pas d'erreur JS, pas de NaN, pas de crash
```

**AC5 — liveQuery : mise à jour réactive**

```
GIVEN  un devis passe de "sent" à "accepted" ou est créé en statut "sent"
WHEN   la mutation locale est appliquée dans Dexie
THEN   la métrique montant se recalcule automatiquement via liveQuery (même réactivité que Story 5.1)
AND    aucun refresh manuel n'est nécessaire
```

**AC6 — Qualité**

```
GIVEN  les fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Règle métier — Statuts inclus / exclus

| Status DB (anglais) | Label FR | Inclus dans métrique montant ? |
|---|---|---|
| `"accepted"` | Accepté | **OUI** |
| `"sent"` | Envoyé | **OUI** |
| `"draft"` | Brouillon | **NON** |
| `"cancelled"` | Annulé | **NON** |
| `"validated"` | Validé | **NON** |
| `"expired"` | Expiré | **NON** |

**Justification métier (FR-42) :** La métrique reflète la "valeur commerciale active" — les devis en cours de traitement côté client (envoyés, en attente de réponse) et ceux gagnés (acceptés). Les brouillons sont des travaux non finalisés ; les annulés et expirés sont hors jeu.

---

## Périmètre de cette story

**INCLUS :**
- `src/hooks/use-dashboard-stats.ts` — UPDATE : ajouter `amountTotal` (somme totalFcfa accepted + sent) à l'interface `DashboardStats` et à `computeStats()`
- `src/components/dashboard/dashboard-hero.tsx` — UPDATE : ajouter la section métrique montant dans le hero card
- `src/messages/fr-NE.json` — UPDATE : ajouter clés i18n montant dans section `dashboard`

**EXCLU (ne pas modifier) :**
- `src/lib/local-db.ts` — aucune modification — `db.quotes.totalFcfa` est déjà disponible
- `src/lib/schema.ts` — aucune migration nécessaire
- `src/lib/money.ts` — utiliser tel quel (`formatFcfa()` existe déjà)
- Tout le moteur de sync — agrégats purement locaux (Dexie)
- `src/app/(app)/page.tsx` — pas de modification nécessaire si DashboardHero est déjà importé

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `src/hooks/use-dashboard-stats.ts`

- [ ] Ajouter `amountTotal: number` à l'interface `DashboardStats` :
  ```ts
  export interface DashboardStats {
    total: number;
    draft: number;
    validated: number;
    sent: number;
    accepted: number;
    expired: number;
    cancelled: number;
    amountTotal: number;   // ← NOUVEAU : somme totalFcfa des statuts "accepted" + "sent"
    isLoading: boolean;
  }
  ```

- [ ] Mettre à jour `computeStats()` pour calculer `amountTotal` :
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
    let amountTotal = 0;
    for (const q of filtered) {
      if (q.status in counts) counts[q.status as keyof typeof counts]++;
      // Inclure uniquement accepted + sent dans la métrique montant
      if (q.status === "accepted" || q.status === "sent") {
        amountTotal += q.totalFcfa;
      }
    }
    const total = counts.draft + counts.validated + counts.sent + counts.accepted + counts.expired;
    return { total, ...counts, amountTotal };
  }
  ```

- [ ] Vérifier que `useDashboardStats()` retourne correctement `amountTotal` (propagation automatique via spread)
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `src/components/dashboard/dashboard-hero.tsx`

- [ ] Ajouter l'import de `formatFcfa` :
  ```ts
  import { formatFcfa } from "@/lib/money";
  ```

- [ ] Dans le composant `DashboardHero`, après la grille des compteurs par statut, ajouter la section montant :
  ```tsx
  {/* Métrique montant — Acceptés + Envoyés (Story 5.3) */}
  <div className="relative z-10 mt-4 border-t border-white/10 pt-4">
    <p className="text-[10px] font-semibold uppercase tracking-widest text-text-on-dark/70">
      {t("amountLabel")}
    </p>
    {stats.isLoading ? (
      <div className="mt-1 h-7 w-40 animate-pulse rounded bg-white/10" />
    ) : (
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-text-on-dark">
        {formatFcfa(stats.amountTotal)}
      </p>
    )}
    <p className="mt-0.5 text-xs text-text-on-dark/60">{t("amountSublabel")}</p>
  </div>
  ```

- [ ] Ne pas modifier le segmented control ni le hook — la période est déjà partagée via `useDashboardStats(period)` (period vient du state de DashboardHero)
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter dans la section `"dashboard"` (déjà créée par Story 5.1) :
  ```json
  "amountLabel": "TOTAL DEVISÉ",
  "amountSublabel": "Acceptés + Envoyés"
  ```

- [ ] Section `dashboard` complète après cet ajout :
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
    "loadingStats": "Calcul des statistiques…",
    "amountLabel": "TOTAL DEVISÉ",
    "amountSublabel": "Acceptés + Envoyés"
  }
  ```

- [ ] `pnpm typecheck` — zéro erreur

### T4 — Vérification finale (AC6)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (pas de régression)
- [ ] `pnpm build` : passe sans erreur
- [ ] Montant s'affiche en FCFA avec séparateur milliers (ex : "1 250 000 XOF") ✓
- [ ] 0 XOF affiché quand aucun devis "accepted" ou "sent" ✓
- [ ] La métrique suit le filtre de période (7j / 30j / 90j / Tout) ✓
- [ ] Skeleton pendant chargement initial ✓
- [ ] `amountTotal` = 0 si only "draft"/"cancelled"/"expired" devis ✓

---

## Dev Notes

### CRITIQUE — Réutiliser `formatFcfa()` de `@/lib/money.ts`, ne JAMAIS recréer

```typescript
// CORRECT — formatFcfa() est déjà implémenté dans src/lib/money.ts
import { formatFcfa } from "@/lib/money";
const display = formatFcfa(stats.amountTotal); // "1 250 000 XOF"

// INCORRECT — recréer le formatter manuellement
const display = new Intl.NumberFormat("fr-FR").format(stats.amountTotal) + " FCFA"; // ← INTERDIT
```

`formatFcfa()` utilise `Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", minimumFractionDigits: 0 })` — format officiel XOF sans centimes.

### CRITIQUE — `totalFcfa` est un entier, pas un float

`QuoteLocal.totalFcfa` est défini comme `number` mais **est toujours un entier FCFA** (XOF sans sous-unité). L'addition est sûre (`amountTotal += q.totalFcfa`) sans `roundFcfa()` si les valeurs sont correctement stockées. Ne jamais faire de division ou multiplication sur ce champ sans `roundFcfa()`.

### CRITIQUE — La période est déjà gérée par Story 5.1, ne pas dupliquer le state

Le state `period` vit dans `DashboardHero` et est passé à `useDashboardStats(period)`. `computeStats()` filtre à la fois les compteurs ET le montant sur la même fenêtre temporelle. Il n'y a **aucune logique de période supplémentaire** à implémenter dans la story 5.3 — tout est automatique via le hook partagé.

```typescript
// CORRECT — même hook, même période, amountTotal calculé en même temps
const stats = useDashboardStats(period); // stats.amountTotal est déjà filtré par période

// INCORRECT — créer un hook séparé ou un useEffect supplémentaire
const amountStats = useAmountStats(period); // ← INTERDIT, duplication
```

### CRITIQUE — `computeStats()` : mettre à jour la fonction pure existante, ne pas dupliquer

La fonction `computeStats` dans `use-dashboard-stats.ts` est **testable et pure**. La modifier directement (ajouter `amountTotal` dans la boucle) est la bonne approche. Ne pas créer de fonction utilitaire séparée pour l'agrégat montant.

### CRITIQUE — Valeurs anglaises lowercase pour les statuts

```typescript
// CORRECT
if (q.status === "accepted" || q.status === "sent") {
  amountTotal += q.totalFcfa;
}

// INCORRECT
if (q.status === "Accepté" || q.status === "Envoyé") { // ← JAMAIS les labels UI
```

### Design tokens — Intégration dans hero card navy (UX-DR6)

La section montant s'insère **dans la hero card existante** (fond navy), pas en dehors.

```tsx
// Séparateur visuel — bordure subtile
className="border-t border-white/10 pt-4"

// Eyebrow montant — même style que l'eyebrow principal
className="text-[10px] font-semibold uppercase tracking-widest text-text-on-dark/70"

// Montant principal — Spectral + tabular-nums (UX-DR2 : tabular-nums obligatoire sur montants)
className="font-serif text-2xl font-semibold tabular-nums text-text-on-dark"

// Sous-label — grisé discret
className="text-xs text-text-on-dark/60"
```

### Pièges & Anti-patterns

| INTERDIT | CORRECT |
|---|---|
| Recréer `Intl.NumberFormat` manuellement | `import { formatFcfa } from "@/lib/money"` |
| Comparer `q.status === "Accepté"` | `q.status === "accepted"` (valeurs DB anglaises) |
| Créer un hook séparé pour `amountTotal` | Ajouter `amountTotal` à `computeStats()` existant |
| Dupliquer le state `period` | Réutiliser `stats.amountTotal` du hook partagé |
| Afficher `NaN` ou `undefined` si aucun devis | `amountTotal` initialisé à `0`, `formatFcfa(0)` = "0 XOF" |
| Appel API pour les montants | Agrégat Dexie local uniquement (`db.quotes.toArray()`) |
| Float arithmétique sur totalFcfa | Entiers FCFA seulement, addition directe |

### Héritage des stories précédentes

**Story 5.1 (use-dashboard-stats.ts, DashboardHero) — fichiers à MODIFIER (pas créer) :**
- `src/hooks/use-dashboard-stats.ts` : déjà créé avec `DashboardStats`, `computeStats()`, `useDashboardStats()`
- `src/components/dashboard/dashboard-hero.tsx` : déjà créé avec hero card navy + segmented control + StatCounter
- `src/messages/fr-NE.json` : section `dashboard` déjà ajoutée — ne créer que les nouvelles clés

**Pattern liveQuery (Stories 2.x, 5.1) :**
- `liveQuery(() => db.quotes.toArray()).subscribe({ next, error })` — déjà câblé dans le hook
- L'ajout de `amountTotal` ne nécessite aucun changement dans le subscribe — il suffit de mettre à jour `computeStats()`

**money.ts (ajouté en Epic 1/2) :**
- `formatFcfa()` est stable et testé (`src/lib/money.test.ts`)
- `roundFcfa()` disponible si besoin mais pas nécessaire pour la somme

### Commandes pour le dev agent

```bash
# 1. Docker en cours (pour pnpm check + build)
docker compose up -d

# 2. Aucune migration nécessaire
# Aucune modification db schema — totalFcfa est déjà dans QuoteLocal

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 5.3] — FR-42 (somme Acceptés+Envoyés, exclusion Brouillons/Annulés, FCFA)
- [src/lib/money.ts] — `formatFcfa()`, `roundFcfa()` — UTILISER sans réimplémenter
- [src/lib/local-db.ts:49] — `QuoteLocal.totalFcfa: number` — champ source
- [src/hooks/use-dashboard-stats.ts] — fichier à MODIFIER (ajout amountTotal)
- [src/components/dashboard/dashboard-hero.tsx] — fichier à MODIFIER (ajout section montant)
- [src/messages/fr-NE.json] — section `dashboard` à compléter
- [UX-DR2] — `tabular-nums` obligatoire sur tous les montants, Spectral pour numéraux
- [UX-DR6] — Hero card navy — intégrer dans la card existante

---

## Dev Agent Record

### Agent Model Used

_À remplir par le dev agent_

### Debug Log References

_À remplir par le dev agent_

### Completion Notes List

_À remplir par le dev agent_

### File List

- `src/hooks/use-dashboard-stats.ts` (à modifier — ajouter amountTotal)
- `src/components/dashboard/dashboard-hero.tsx` (à modifier — ajouter section montant)
- `src/messages/fr-NE.json` (à modifier — ajouter clés amountLabel + amountSublabel)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/5-3-amount-metrics.md` (ce fichier)

### Change Log

_À remplir par le dev agent_
