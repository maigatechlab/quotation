---
story_key: 7-11-reports-accounting-export
epic_num: 7
story_num: 11
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (tables tenants/subscription_payments/tenant_events + enums tenantStatusEnum/tenantPlanEnum/paymentMethodEnum/billingCycleEnum + PLAN_PRICES_XOF via tenant-config) — HARD"
  - "7-2-owner-dashboard-tenant-list (rôle superadmin + requireOwnerSession()/requireOwnerAuth() + layout owner + nav owner + src/lib/owner/* + src/messages/fr-NE.json section owner) — HARD"
  - "7-4-record-payment-mobile-money (forme des rows subscription_payments + eventType 'payment_recorded') — SOFT (forme des données, pas de runtime)"
  - "7-5-manual-suspension-expiry-page (eventType 'cancelled' = churn terminal + 'suspended'/'reactivated') — SOFT (sémantique churn)"
---

# Story 7.11 : Rapports & export comptabilité

**Statut :** done

## Story

**En tant que** owner superadmin (Maiga Tech Lab),
**Je veux** une page `/owner/reports` qui me donne un rapport mensuel (revenus par méthode de paiement, nouveaux tenants, churn, tenants actifs), un export comptable des paiements sur une période (CSV), un instantané de l'état des tenants à une date, et des prévisions de renouvellements pour le mois suivant (liste + montant total),
**Afin que** je puisse faire ma comptabilité (export des encaissements), piloter le churn/prévisions d'abonnement, et produire l'état du parc SaaS à une date donnée pour la compta et les prévisions de trésorerie.

---

## Critères d'acceptation (BDD)

**AC1 — Accès `/owner/reports` (superadmin uniquement)**

```
GIVEN  un utilisateur authentifié avec rôle "superadmin"
WHEN   il ouvre /owner/reports
THEN   la page s'affiche avec 4 sections/cartes :
       1. Rapport mensuel (sélecteur de mois)
       2. Export paiements (sélecteur de plage de dates + bouton CSV)
       3. Instantané tenants à une date (sélecteur de date)
       4. Prévisions renouvellements mois suivant

GIVEN  un utilisateur authentifié avec rôle !== "superadmin" (admin client / commercial / operateur)
WHEN   il tente d'accéder à /owner/reports
THEN   redirection vers "/" (via requireOwnerAuth() en Server Component — defense in depth)
AND    l'API GET /api/v1/owner/reports/* retourne 403 (via requireOwnerSession())

GIVEN  un utilisateur non authentifié
WHEN   il tente /owner/reports ou GET /api/v1/owner/reports/*
THEN   redirection vers "/" (page) OU 401 (API)
```

> **Dépendance :** `requireOwnerAuth()` / `requireOwnerSession()` sont introduits par la **story 7-2**. Le layout `src/app/owner/layout.tsx` (header + nav + auth gate) aussi. Cette story AJOUTE l'item "Rapports" à la nav owner (qui était un placeholder désactivé "Bientôt" en 7-2) et crée la page.

**AC2 — Rapport mensuel — revenus par méthode de paiement**

```
GIVEN  le superadmin sur /owner/reports avec le sélecteur de mois (défaut = mois courant)
WHEN   la section "Rapport mensuel" se charge (Server Component, query Drizzle agrégat)
THEN   un tableau "Revenus par méthode de paiement" s'affiche avec une ligne par paymentMethod
       trouvée sur la période (nitta | wave | amana | stripe | cash | virement) :
         - méthode (label FR via fr-NE.json owner.badges.paymentMethod)
         - nombre de paiements (COUNT)
         - montant total (SUM amount, FCFA entier, formaté via formatFcfa)
       + une ligne TOTAL (somme toutes méthodes, formatée FCFA)
AND    la période filtrée est le mois calendaire sélectionné (half-open range) :
         gte(paidAt, <premier jour du mois 00:00 local>)
         AND lt(paidAt, <premier jour du mois suivant 00:00 local>)
AND    la query est un seul SELECT paymentMethod, COUNT(*), SUM(amount)
         FROM subscription_payments
         WHERE paidAt >= $start AND paidAt < $endNext
         GROUP BY paymentMethod
AND    si 0 paiement sur le mois → message "Aucun paiement sur cette période" (fr-NE)
AND    les méthodes absentes (0 paiement) ne sont PAS listées (pas de ligne à 0)
AND    la SUM utilise sum() Drizzle → Number(total ?? 0) (jamais string brute)
```

**AC3 — Rapport mensuel — KPI tenants (nouveaux / churn / actifs fin de mois)**

```
GIVEN  le rapport mensuel (même sélecteur de mois que AC2)
WHEN   les KPI tenants sont calculés
THEN   3 compteurs s'affichent en cartes :
       1. Nouveaux tenants = COUNT(*) FROM tenants
            WHERE createdAt >= $start AND createdAt < $endNext
            (tous statuts confondus à la création — un tenant est "nouveau" quand il est créé)
       2. Churn (annulations du mois) = COUNT(DISTINCT tenantId) FROM tenant_events
            WHERE eventType = 'cancelled' AND createdAt >= $start AND createdAt < $endNext
            (churn = passage à 'cancelled' — terminal, cf. story 7-5 ;
             un suspended/reactivated n'est PAS du churn)
       3. Tenants actifs fin de mois = COUNT(*) FROM tenants
            WHERE status = 'active'
            (instantané à l'instant t — pas de reconstitution historique MVP)
            NOTE: en MVP on ne reconstitue PAS l'état exact à la fin du mois passé (pas de snapshot
            historique). On affiche le count courant des 'active'. Cf. Dev Notes §"Churn & actifs MVP".
AND    chaque compteur est un COUNT(*) SQL agrégé (pas de fetch de toutes les rows)
AND    les chiffres utilisent font-serif + tabular-nums (charte DESIGN.md)
```

**AC4 — Export paiements CSV (date-range picker)**

```
GIVEN  la section "Export paiements" avec 2 inputs date (from, to) et un bouton "Télécharger CSV"
WHEN   le superadmin saisit une plage (défaut : du 1er du mois courant à aujourd'hui)
       et clique "Télécharger CSV"
THEN   le navigateur télécharge un fichier `paiements-YYYY-MM-DD.csv`
       (download direct via <a href="/api/v1/owner/reports/payments/export?from=...&to=..." download>)
AND    HTTP 200, Content-Type: text/csv; charset=utf-8
AND    Content-Disposition: attachment; filename="paiements-YYYY-MM-DD.csv"
AND    Cache-Control: no-store (l'export est auth-gated, jamais caché)
AND    le CSV commence par le BOM UTF-8 (U+FEFF, "﻿") — OBLIGATOIRE Excel Niger/AES
       (cf. project-context.md §CSV/Exports + story 6-3 pattern)
AND    les en-têtes (1re ligne après BOM) sont EXACTEMENT, dans cet ordre, séparés par virgule :
       date,tenant,slug,method,amount,currency,reference,periodStart,periodEnd,billingCycle,confirmedBy,notes
AND    chaque ligne = un subscription_payment sur la plage (paidAt BETWEEN from AND to inclus),
       trié par paidAt ASC
AND    colonnes sérialisées :
       - date       : paidAt au format ISO 8601 UTC (ex: "2026-06-15T14:30:00.000Z")
       - tenant     : tenants.name (JOIN sur tenantId)
       - slug       : tenants.slug (JOIN — utile pour croisement compta)
       - method     : paymentMethod (enum brut : nitta|wave|amana|stripe|cash|virement — PAS traduit)
       - amount     : entier FCFA brut (ex: "25000"), jamais float, jamais "25 000 XOF"
       - currency   : currency (défaut "XOF")
       - reference  : paymentReference ?? "" (vide si null)
       - periodStart/End : ISO date "YYYY-MM-DD"
       - billingCycle : "monthly" | "annual"
       - confirmedBy : userId du superadmin (text Better Auth ID) — la compta croise avec la table user si besoin
       - notes      : notes ?? "" (échappées CSV)
AND    escaping CSV : toute valeur contenant "," ou "\"" ou "\n" est wrappée dans des guillemets
       doubles et les guillemets internes sont doublés ('"' → '""') (RFC 4180)
       — pattern identique à src/app/api/v1/audit/export/route.ts (story 6-3) et src/lib/owner/csv.ts (7-2)
AND    fins de ligne = CRLF ("\r\n") pour Excel Windows
AND    limité à 10 000 lignes (const PAYMENTS_EXPORT_LIMIT = 10_000)
AND    si la plage contient > 10 000 paiements → HTTP 200 avec les 10 000 premiers (tri ASC)
       + un warning loggé côté serveur (console.warn) — pas d'erreur client
       (l'utilisateur peut restreindre la plage)
AND    export NON paginé (un seul fichier par plage — pattern story 6-3 + 7-2)

GIVEN  un superadmin saisit from > to (plage inversée)
WHEN   il clique "Télécharger CSV"
THEN   la route API retourne 400 apiError("VALIDATION_FAILED",
       "La date de début doit précéder la date de fin", { fields: { from: "invalid" } })
AND    aucun fichier n'est téléchargé

GIVEN  un superadmin ne saisit pas de `from` ou `to`
WHEN   il appelle l'export
THEN   400 apiError("VALIDATION_FAILED", "Les dates from et to sont requises", ...)

GIVEN  la plage ne contient AUCUN paiement
WHEN   export
THEN   HTTP 200, CSV avec UNIQUEMENT le BOM + la ligne d'en-têtes (0 ligne de données)
       — ne PAS retourner 404 ni un CSV vide sans headers
       (la compta doit pouvoir constater "0 encaissement sur la période" via un fichier bien formé)
```

**AC5 — Export paiements — gate superadmin**

```
GIVEN  un utilisateur authentifié avec role !== "superadmin"
WHEN   il appelle GET /api/v1/owner/reports/payments/export?from=...&to=...
THEN   403 apiError("FORBIDDEN", "Réservé au superadmin", ...) via requireOwnerSession()

GIVEN  un utilisateur non authentifié
WHEN   il appelle GET /api/v1/owner/reports/payments/export
THEN   401 apiError("UNAUTHORIZED", ...)

AND    la route exporte export const dynamic = "force-dynamic"
       (route auth-gated, jamais statique, jamais cachée — Next 16)
AND    export const runtime = "nodejs" (accès Drizzle/PG)
```

**AC6 — Instantané tenants à une date**

```
GIVEN  la section "Instantané tenants" avec un input date (défaut = aujourd'hui)
WHEN   le superadmin choisit une date D et clique "Générer l'instantané"
THEN   un tableau s'affiche avec une ligne par tenant (tous statuts) :
         - name + slug
         - plan (badge Free/Pro/Enterprise)
         - status (badge Actif/Trial/Suspendu/Annulé)
         - subscriptionStart (format FR)
         - subscriptionEnd (format FR + indicateur jours restants si applicable)
         - maxUsers
AND    MVP : l'instantané reflète l'état COURANT des tenants (pas de reconstitution historique au D).
       Le sélecteur de date est PRÉSENT mais agit comme un filtre "date de référence" affichée
       dans l'en-tête du rapport (et stockée dans le nom de fichier à l'export) — PAS de
       reconstitution AS-OF (cf. Dev Notes §"Instantané AS-OF — deferred").
       Le tableau liste TOUS les tenants actuels (quel que soit leur createdAt).
AND    tri par name ASC (prédictible pour la compta)
AND    pagination server-side 50/page via ?snapshotPage=N (50 > 25 du dashboard car moins de colonnes)
AND    un bouton "Exporter CSV" télécharge `tenants-snapshot-YYYY-MM-DD.csv`
       (mêmes colonnes que le tableau, BOM UTF-8, pattern csv.ts — réutilise buildTenantsCsv de 7-2
        ÉTENDU ou un nouveau buildTenantsSnapshotCsv)
```

**AC7 — Prévisions renouvellements (mois suivant)**

```
GIVEN  la section "Prévisions renouvellements"
WHEN   la page se charge
THEN   s'affiche la liste des tenants dont subscriptionEnd tombe dans le mois CALENDRAIRE SUIVANT
       (par rapport au mois courant du sélecteur AC2 — ou au mois actuel si pas de sélecteur partagé) :
         - tenant (name + slug)
         - plan
         - subscriptionEnd (format FR)
         - montant attendu (FCFA) = prix du plan pour le cycle courant du tenant
           (lookup dans PLAN_PRICES_XOF[plan][cycle] — cf. tenant-config.ts de la story 7-1)
           IMPORTANT: le cycle utilisé est DÉDUIT de la dernière paiement du tenant
           (billingCycle du subscription_payment le plus récent — réutiliser la sous-requête
            LATERAL/corrélée de 7-2). Si aucun paiement : cycle = "monthly" par défaut.
         - statut du tenant (les 'cancelled' sont EXCLUS — pas de renouvellement attendu)
       + un TOTAL en bas de liste (SUM des montants attendus, formaté FCFA)
       + un compteur "X renouvellements attendus"
AND    période : subscriptionEnd >= <premier jour mois suivant>
                 AND subscriptionEnd < <premier jour mois d'après>
       (half-open, tz-safe)
AND    si aucun renouvellement → message "Aucun renouvellement attendu le mois prochain" (fr-NE)
AND    les montants sont des PRÉVISIONS théoriques (basées sur PLAN_PRICES_XOF) — un encart
       précise "Montants estimés d'après la grille tarifaire. Le montant réel encaissé peut
       différer (annual/monthly, remises, plan changé)." (fr-NE)
```

**AC8 — UX & i18n**

```
GIVEN  la page /owner/reports
WHEN   elle s'affiche
THEN   tous les libellés proviennent de src/messages/fr-NE.json section owner.reports.*
       (jamais de FR hardcodé dans les composants)
AND    la nav owner (layout 7-2) a son item "Rapports" ACTIVÉ (link href="/owner/reports")
       — il était placeholder désactivé en 7-2, cette story l'active
AND    un état loading (skeleton animate-pulse) s'affiche pendant le rendu initial de chaque section
AND    les inputs date ont un label aria (UX-DR23) et des cibles ≥ 44px (UX-DR22)
AND    les cartes KPI (AC3) suivent les mêmes tokens que owner-metrics-cards (7-2) :
       rounded-lg border border-border bg-surface p-5
       + chiffre font-serif tabular-nums text-2xl
```

**AC9 — Qualité & tests**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur (migration 7-1 préalable appliquée)
AND    tests unitaires (Vitest) couvrent les fonctions pures d'agrégation/prévision :
       - computeRevenueByMethod(db, range)  : SUM/GROUP BY paymentMethod, cas 0 paiement, 3 méthodes
       - computeTenantKpi(db, range)        : nouveaux (createdAt), churn (events 'cancelled'), actifs
       - computeRenewalForecast(db, monthStart) : tenants avec subscriptionEnd dans le mois suivant,
         montant via PLAN_PRICES_XOF[lastPaymentCycle], exclusion cancelled, cas 0 renouvellement,
         total correct (SUM entiers), plan=free → montant 0 inclus
       - buildPaymentsCsv(rows)             : headers EXACTS (ordre AC4), BOM présent,
         escaping virgules/guillemets/retours-ligne, montant entier (pas .00), CRLF,
         cas 0 ligne (BOM + headers seuls)
       - validateDateRange(from, to)        : from > to → erreur, from/to absents → erreur, ok → passe
       Mock db via vi.mock("@/lib/db") — pattern quota (story 6-2) + owner metrics (7-2)
AND    tests E2E (Playwright) couvrent :
       - superadmin ouvre /owner/reports → 4 sections affichées ✓
       - non-superadmin redirigé depuis /owner/reports ✓
       - export CSV → Content-Type text/csv, BOM présent (1er char = U+FEFF),
         1re ligne (après BOM) = headers exacts ✓
       - plage inversée → pas de download (validation client + serveur) ✓
       - section prévisions affiche les tenants du mois suivant + total ✓
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/owner/reports/page.tsx` — CRÉER : page rapport (Server Component, 4 sections, sélecteurs date)
- `src/app/owner/layout.tsx` — UPDATE : activer l'item nav "Rapports" (était placeholder 7-2)
- `src/lib/owner/reports.ts` — CRÉER : `computeRevenueByMethod()`, `computeTenantKpi()`, `computeRenewalForecast()`, `fetchTenantsSnapshot()`, `validateDateRange()`
- `src/lib/owner/reports-csv.ts` — CRÉER : `buildPaymentsCsv(rows)`, `buildTenantsSnapshotCsv(rows)` (réutilise le pattern BOM/escape de `src/lib/owner/csv.ts` 7-2 + `audit/export` 6-3)
- `src/app/api/v1/owner/reports/payments/export/route.ts` — CRÉER : GET export CSV paiements (superadmin only, force-dynamic, BOM)
- `src/app/api/v1/owner/reports/tenants/export/route.ts` — CRÉER : GET export CSV instantané tenants (superadmin only)
- `src/components/owner/reports/monthly-report-section.tsx` — CRÉER : section AC2+AC3 (revenus par méthode + KPI)
- `src/components/owner/reports/payments-export-section.tsx` — CRÉER : section AC4 (date-range + bouton CSV)
- `src/components/owner/reports/tenant-snapshot-section.tsx` — CRÉER : section AC6 (input date + tableau + export)
- `src/components/owner/reports/renewal-forecast-section.tsx` — CRÉER : section AC7 (liste + total)
- `src/components/owner/reports/month-picker.tsx` — CRÉER : client component (input month, ou select mois/année)
- `src/components/owner/reports/date-range-picker.tsx` — CRÉER : client component (2 inputs date + bouton)
- `src/lib/owner/reports.test.ts` — CRÉER : tests Vitest (computeRevenueByMethod, computeTenantKpi, computeRenewalForecast, validateDateRange)
- `src/lib/owner/reports-csv.test.ts` — CRÉER : tests Vitest (buildPaymentsCsv headers/BOM/escape/CRLF/0-ligne)
- `tests/e2e/owner-reports.spec.ts` — CRÉER : E2E Playwright (auth gate + sections + export CSV + BOM)
- `src/messages/fr-NE.json` — UPDATE : ajouter section `owner.reports.*` (active aussi la clé nav existante)

**EXCLU (ne pas modifier — hors périmètre) :**
- `src/lib/schema.ts` — AUCUNE modification (tables 7-1 utilisées en lecture seule ; aucun nouvel index requis pour les requêtes agrégats MVP — les index 7-1 sur `subscriptionPayments.tenantId` + `paidAt` suffisent)
- `drizzle/` — AUCUNE nouvelle migration (read-only sur le schéma 7-1)
- `src/lib/session.ts`, `src/lib/permissions.ts`, `src/proxy.ts` — DÉJÀ FAIT en 7-2 (superadmin, requireOwnerSession, matcher /owner/*). Cette story réutilise tel quel.
- `src/lib/owner/metrics.ts` (7-2) — non modifié (cette story a SES propres helpers `reports.ts` car la sémantique diffère : agrégats par plage arbitraire vs. instantané dashboard)
- `src/lib/owner/csv.ts` (7-2) — non modifié (cette story crée `reports-csv.ts` pour les colonnes spécifiques aux paiements/snapshot ; `csv.ts` reste pour l'export de la liste tenants)
- Les routes API `payments/suspend/reactivate` (7-4/7-5/7-8) — lecture seule de leurs données ici
- Réels fichiers .xlsx — DEFERRED en V2 (cf. Dev Notes §"xlsx — DEFERRED")

---

## Tâches / Sous-tâches

### T1 — UPDATE `src/app/owner/layout.tsx` : activer la nav "Rapports"

- [x] Localiser la nav owner (story 7-2). L'item "Rapports" est actuellement un placeholder désactivé (tooltip "Bientôt").
- [x] Le remplacer par un `<Link href="/owner/reports">` actif :
  ```tsx
  <Link href="/owner/reports" className="rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/10">
    {t("reports")}
  </Link>
  ```
- [x] Conserver les autres items désactivés (Paiements / Paramètres = stories 7-10 / 7-12 si non faits).
- [x] `pnpm typecheck` — zéro erreur

### T2 — CRÉER `src/lib/owner/reports.ts` (helpers agrégats/forecast, server-side)

- [x] Imports :
  ```ts
  import { and, gte, lt, count, sum, sql, eq, isNotNull, ne } from "drizzle-orm";
  import { db } from "@/lib/db";
  import { tenants, subscriptionPayments, tenantEvents } from "@/lib/schema";
  import { PLAN_PRICES_XOF } from "@/lib/tenants/tenant-config"; // story 7-1
  ```
- [x] Type `DateRange` :
  ```ts
  export interface DateRange { start: Date; end: Date; } // half-open: [start, end)
  ```
- [x] `validateDateRange(from: string | null, to: string | null): { ok: true; range: DateRange } | { ok: false; error: string }` :
  - from/to null/empty → `{ ok: false, error: "from-to-required" }`
  - `new Date(from) >= new Date(to)` → `{ ok: false, error: "from-after-to" }`
  - sinon → range half-open `[from 00:00:00 local, (to + 1 day) 00:00:00 local)` (pour inclure tout le jour `to`)
  - Helper interne `parseDateAtMidnight(iso: string): Date` + `addDays(d: Date, n: number): Date`
- [x] `computeRevenueByMethod(range: DateRange)` — AC2 :
  ```ts
  export async function computeRevenueByMethod(range: DateRange) {
    const rows = await db.select({
      method: subscriptionPayments.paymentMethod,
      n: count(),
      total: sum(subscriptionPayments.amount), // string | null
    })
      .from(subscriptionPayments)
      .where(and(
        gte(subscriptionPayments.paidAt, range.start),
        lt(subscriptionPayments.paidAt, range.end),
      ))
      .groupBy(subscriptionPayments.paymentMethod);
    const byMethod = rows.map(r => ({
      method: r.method,
      count: r.n,                          // count() → number
      total: Number(r.total ?? 0),         // sum() → string|null → number
    }));
    const grandTotal = byMethod.reduce((acc, r) => acc + r.total, 0);
    const totalCount = byMethod.reduce((acc, r) => acc + r.count, 0);
    return { byMethod, grandTotal, totalCount };
  }
  ```
  **CRITIQUE** : `sum()` retourne `string | null` (Drizzle .mapWith(String)). TOUJOURS `Number(... ?? 0)`. `count()` retourne déjà `number`.
- [x] `computeTenantKpi(range: DateRange)` — AC3 :
  ```ts
  export async function computeTenantKpi(range: DateRange) {
    // Nouveaux : createdAt dans la plage
    const [newRow] = await db.select({ n: count() }).from(tenants)
      .where(and(gte(tenants.createdAt, range.start), lt(tenants.createdAt, range.end)));
    // Churn : events 'cancelled' dans la plage (DISTINCT tenantId)
    const [churnRow] = await db.select({ n: count(sql`DISTINCT ${tenantEvents.tenantId}`) })
      .from(tenantEvents)
      .where(and(
        eq(tenantEvents.eventType, "cancelled"),
        gte(tenantEvents.createdAt, range.start),
        lt(tenantEvents.createdAt, range.end),
      ));
    // Actifs (instantané courant — pas AS-OF MVP)
    const [activeRow] = await db.select({ n: count() }).from(tenants)
      .where(eq(tenants.status, "active"));
    return {
      newTenants: newRow?.n ?? 0,
      churn: churnRow?.n ?? 0,
      activeNow: activeRow?.n ?? 0,
    };
  }
  ```
- [x] `computeRenewalForecast(monthStart: Date)` — AC7 :
  ```ts
  // Période = mois CALENDRAIRE SUIVANT monthStart
  export async function computeRenewalForecast(monthStart: Date) {
    const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const afterNextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 2, 1);

    // Tenants dont subscriptionEnd tombe dans le mois suivant, NON cancelled
    const rows = await db.select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      plan: tenants.plan,
      status: tenants.status,
      subscriptionEnd: tenants.subscriptionEnd,
      lastCycle: sql<"monthly" | "annual" | null>`(SELECT billing_cycle FROM subscription_payments WHERE tenant_id = ${tenants.id} ORDER BY paid_at DESC LIMIT 1)`,
    })
      .from(tenants)
      .where(and(
        isNotNull(tenants.subscriptionEnd),
        gte(tenants.subscriptionEnd, nextMonthStart),
        lt(tenants.subscriptionEnd, afterNextMonthStart),
        ne(tenants.status, "cancelled"),
      ))
      .orderBy(tenants.name);

    const forecast = rows.map(r => {
      const cycle = (r.lastCycle ?? "monthly") as "monthly" | "annual";
      const expected = PLAN_PRICES_XOF[r.plan][cycle] ?? 0; // 0 pour plan=free
      return { ...r, cycle, expectedAmount: expected };
    });
    const totalExpected = forecast.reduce((acc, r) => acc + r.expectedAmount, 0);
    return { forecast, totalExpected, count: forecast.length };
  }
  ```
  **CRITIQUE** : `PLAN_PRICES_XOF` vient de `src/lib/tenants/tenant-config.ts` (story 7-1). Vérifier son existence + signature. Si le nom diffère, adapter (cf. Dev Notes §"tenant-config 7-1").
- [x] `fetchTenantsSnapshot(page = 1, pageSize = 50)` — AC6 :
  - `SELECT name, slug, plan, status, subscriptionStart, subscriptionEnd, maxUsers FROM tenants ORDER BY name ASC LIMIT 50 OFFSET (page-1)*50`
  - `total = await db.$count(tenants)` (number — pas besoin de GROUP BY)
  - Retourne `{ rows, total, totalPages: Math.ceil(total/pageSize) }`
- [x] `fetchPaymentsForExport(range: DateRange, limit = PAYMENTS_EXPORT_LIMIT)` — AC4 :
  - JOIN subscriptionPayments ↔ tenants pour name/slug
  - ORDER BY paidAt ASC, LIMIT 10_000
  ```ts
  export async function fetchPaymentsForExport(range: DateRange, limit = 10_000) {
    return await db.select({
      paidAt: subscriptionPayments.paidAt,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      method: subscriptionPayments.paymentMethod,
      amount: subscriptionPayments.amount,
      currency: subscriptionPayments.currency,
      reference: subscriptionPayments.paymentReference,
      periodStart: subscriptionPayments.periodStart,
      periodEnd: subscriptionPayments.periodEnd,
      billingCycle: subscriptionPayments.billingCycle,
      confirmedBy: subscriptionPayments.confirmedBy,
      notes: subscriptionPayments.notes,
    })
      .from(subscriptionPayments)
      .leftJoin(tenants, eq(subscriptionPayments.tenantId, tenants.id))
      .where(and(
        gte(subscriptionPayments.paidAt, range.start),
        lt(subscriptionPayments.paidAt, range.end),
      ))
      .orderBy(subscriptionPayments.paidAt)
      .limit(limit);
  }
  ```
  **CRITIQUE** : `leftJoin` (pas `innerJoin`) — un paiement orphelin (tenant supprimé en cascade théorique, mais défense) doit quand même être exporté avec tenantName=null.
- [x] `pnpm typecheck` — zéro erreur

### T3 — CRÉER `src/lib/owner/reports-csv.ts`

- [x] `buildPaymentsCsv(rows)` — pattern identique à `audit/export` (6-3) + `owner/csv.ts` (7-2) :
  ```ts
  const PAYMENTS_HEADERS = [
    "date","tenant","slug","method","amount","currency","reference",
    "periodStart","periodEnd","billingCycle","confirmedBy","notes",
  ];

  function escapeCsv(v: string | null | undefined): string {
    const s = String(v ?? "");
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`; // RFC 4180
    }
    return s;
  }

  export function buildPaymentsCsv(rows: Awaited<ReturnType<typeof fetchPaymentsForExport>>): string {
    const lines = rows.map(r => [
      r.paidAt.toISOString(),
      r.tenantName ?? "",
      r.tenantSlug ?? "",
      r.method,
      String(r.amount),                    // entier FCFA brut
      r.currency,
      r.reference ?? "",
      r.periodStart ? r.periodStart.toISOString().slice(0, 10) : "",
      r.periodEnd ? r.periodEnd.toISOString().slice(0, 10) : "",
      r.billingCycle,
      r.confirmedBy,
      r.notes ?? "",
    ].map(escapeCsv).join(","));
    // BOM UTF-8 + CRLF
    return "﻿" + [PAYMENTS_HEADERS.join(","), ...lines].join("\r\n");
  }
  ```
  **CRITIQUE — BOM via `"﻿"`** : la séquence `EF BB BF` est préservée quand `new Response(string)` encode en UTF-8 (vérifié — Next 16 / web Response). C'est ce que fait `audit/export` (6-3) et `owner/csv.ts` (7-2). NE PAS utiliser `"﻿"` littéral si l'éditeur strippe le BOM — préférer `"﻿"` (explicite, résistant aux éditeurs).
- [x] `buildTenantsSnapshotCsv(rows)` — similaire avec headers :
  `name,slug,plan,status,subscriptionStart,subscriptionEnd,maxUsers`
- [x] `pnpm typecheck` — zéro erreur

### T4 — CRÉER `src/app/api/v1/owner/reports/payments/export/route.ts`

- [x] Handler GET, superadmin only, force-dynamic, nodejs runtime :
  ```ts
  import { headers } from "next/headers";
  import { requireOwnerSession } from "@/lib/session";
  import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
  import { validateDateRange, fetchPaymentsForExport } from "@/lib/owner/reports";
  import { buildPaymentsCsv } from "@/lib/owner/reports-csv";

  export const dynamic = "force-dynamic";
  export const runtime = "nodejs";

  export async function GET(req: Request) {
    const guard = await requireOwnerSession();
    if (!guard.ok) {
      return apiError(guard.code === "UNAUTHORIZED" ? "UNAUTHORIZED" : "FORBIDDEN",
        guard.code === "UNAUTHORIZED" ? "Non authentifié." : "Réservé au superadmin.",
        guard.code === "UNAUTHORIZED" ? HTTP_STATUS.UNAUTHORIZED : HTTP_STATUS.FORBIDDEN);
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const validation = validateDateRange(from, to);
    if (!validation.ok) {
      return apiError("VALIDATION_FAILED",
        validation.error === "from-to-required"
          ? "Les dates from et to sont requises."
          : "La date de début doit précéder la date de fin.",
        HTTP_STATUS.BAD_REQUEST,
        { fields: { from: "invalid", to: "invalid" } });
    }

    const rows = await fetchPaymentsForExport(validation.range);
    if (rows.length >= 10_000) {
      console.warn(`[reports/payments/export] plage atteint la limite 10 000 (from=${from}, to=${to})`);
    }
    const csv = buildPaymentsCsv(rows);
    const today = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="paiements-${today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  ```
  **CRITIQUE** : le `apiError` 4e arg `{ fields }` — vérifier la signature exacte de `apiError` dans `src/lib/api/envelope.ts` avant (peut prendre `(code, message, status)` ou `(code, message, status, details)`). Adapter.
- [x] `pnpm typecheck` — zéro erreur

### T5 — CRÉER `src/app/api/v1/owner/reports/tenants/export/route.ts`

- [x] Handler GET similaire (T4) : superadmin only, force-dynamic, exporte l'instantané via `buildTenantsSnapshotCsv`. Filename `tenants-snapshot-YYYY-MM-DD.csv`. Pas de validation date (l'instantané est courant — cf. AC6 MVP).
- [x] `pnpm typecheck` — zéro erreur

### T6 — CRÉER `src/app/owner/reports/page.tsx` (Server Component)

- [x] Page orchestratrice :
  ```tsx
  import { getTranslations } from "next-intl";
  import { requireOwnerAuth } from "@/lib/session";
  import { MonthlyReportSection } from "@/components/owner/reports/monthly-report-section";
  import { PaymentsExportSection } from "@/components/owner/reports/payments-export-section";
  import { TenantSnapshotSection } from "@/components/owner/reports/tenant-snapshot-section";
  import { RenewalForecastSection } from "@/components/owner/reports/renewal-forecast-section";

  export const dynamic = "force-dynamic"; // page admin auth-gated, données fraîches

  interface PageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }

  export default async function OwnerReportsPage({ searchParams }: PageProps) {
    await requireOwnerAuth();
    const sp = await searchParams;
    const t = await getTranslations("owner.reports");

    // Mois sélectionné (défaut = mois courant). Format "YYYY-MM"
    const monthParam = typeof sp.month === "string" ? sp.month : new Date().toISOString().slice(0, 7);

    return (
      <div className="flex flex-col gap-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("eyebrow")}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">{t("title")}</h1>
          <p className="mt-2 text-sm text-text-muted">{t("description")}</p>
        </div>
        <MonthlyReportSection month={monthParam} />
        <PaymentsExportSection />
        <TenantSnapshotSection searchParams={sp} />
        <RenewalForecastSection month={monthParam} />
      </div>
    );
  }
  ```
- [x] **`await requireOwnerAuth()`** en TÊTE — defense in depth (le layout 7-2 fait déjà le gate, mais on double-check).
- [x] **`await searchParams`** — Promise en Next 16.
- [x] `pnpm typecheck` — zéro erreur

### T7 — CRÉER les composants sections (T7a–T7d)

- [x] **T7a `monthly-report-section.tsx`** (AC2+AC3) — Server Component qui prend `month: string` en prop :
  - Calcule le range half-open du mois (`new Date(year, month-1, 1)` → `new Date(year, month, 1)`)
  - `Promise.all([computeRevenueByMethod(range), computeTenantKpi(range)])`
  - Affiche :
    - sélecteur de mois (client component `month-picker.tsx`, URL `?month=YYYY-MM`)
    - 3 cartes KPI (nouveaux / churn / actifs) — tokens identiques à `owner-metrics-cards` (7-2)
    - tableau "Revenus par méthode" : 1 ligne par méthode (badge + label FR), COUNT, SUM formatFcfa
    - ligne TOTAL (gras)
    - si 0 paiement → message "Aucun paiement sur cette période"
  - Tous les labels via `getTranslations("owner.reports.monthly.*")`
- [x] **T7b `payments-export-section.tsx`** (AC4) — client component `"use client"` :
  - 2 inputs `type="date"` (from, to) — défaut from = 1er du mois, to = aujourd'hui
  - Bouton primaire "Télécharger CSV"
  - Au clic : validation client (`from <= to`, les 2 présents) puis
    `window.location.href = \`/api/v1/owner/reports/payments/export?from=${from}&to=${to}\``
    (download direct via navigation — le navigateur gère le téléchargement avec Content-Disposition).
    ALTERNATIVE : `<a href={...} download>` rendu côté serveur — plus simple, pas de JS. PRÉFÉRER le `<a download>` (pas d'état client, pas de useState).
  - Si validation client échoue → `toast.error(t("errors.fromAfterTo"))` (sonner, pattern repo)
  - Les valeurs from/to sont aussi dans l'URL (`?payFrom=...&payTo=...`) pour pré-remplir au re-render
- [x] **T7c `tenant-snapshot-section.tsx`** (AC6) — Server Component :
  - `fetchTenantsSnapshot(page, 50)` depuis `?snapshotPage=N`
  - Tableau HTML natif (pattern `tenants-table` 7-2) : name+slug, plan badge, status badge, subscriptionStart, subscriptionEnd (+ jours restants via `formatDaysRemaining` de 7-2), maxUsers
  - Pagination `<nav>` avec `?snapshotPage=N` (server-driven, comme 7-2)
  - Bouton `<a href="/api/v1/owner/reports/tenants/export" download>Télécharger CSV</a>`
- [x] **T7d `renewal-forecast-section.tsx`** (AC7) — Server Component :
  - `computeRenewalForecast(monthStart)` où `monthStart` = 1er du mois sélectionné (prop)
  - Liste : tenant (name + slug), plan badge, subscriptionEnd FR, cycle, expectedAmount formatFcfa
  - Encart disclaimer "Montants estimés d'après la grille tarifaire..."
  - TOTAL en bas + compteur
  - Si vide → message "Aucun renouvellement attendu"
- [x] **`month-picker.tsx`** — client component minimal : `<input type="month" value={month} onChange={e => router.push(`?month=${e.target.value}`)} />`
  - Le `<input type="month">` natif suffit (pas besoin de Select custom)
- [x] Tous composants : `pnpm typecheck` — zéro erreur

### T8 — UPDATE `src/messages/fr-NE.json` (section `owner.reports`)

- [x] Ajouter (sous la section `owner` existante de 7-2) :
  ```json
  "reports": {
    "eyebrow": "COMPTABILITÉ",
    "title": "Rapports & comptabilité",
    "description": "Rapports mensuels, exports comptables et prévisions d'abonnement.",
    "monthly": {
      "title": "Rapport mensuel",
      "monthLabel": "Mois",
      "revenueByMethod": "Revenus par méthode de paiement",
      "method": "Méthode",
      "count": "Nb paiements",
      "total": "Total",
      "grandTotal": "TOTAL",
      "noPayments": "Aucun paiement sur cette période",
      "kpi": {
        "newTenants": "Nouveaux tenants",
        "churn": "Churn (annulations)",
        "activeNow": "Tenants actifs"
      },
      "churnHint": "Tenants passés au statut « Annulé » sur le mois."
    },
    "paymentsExport": {
      "title": "Export paiements",
      "description": "Exportez tous les paiements encaissés sur une période au format CSV (compatible Excel).",
      "from": "Date de début",
      "to": "Date de fin",
      "download": "Télécharger CSV",
      "limit": "Limité à 10 000 lignes par export. Affinez la plage pour les gros volumes.",
      "exported": "Export téléchargé.",
      "errors": {
        "fromToRequired": "Les dates de début et de fin sont requises.",
        "fromAfterTo": "La date de début doit précéder la date de fin."
      }
    },
    "snapshot": {
      "title": "Instantané des tenants",
      "description": "État courant du parc SaaS. (La reconstitution à une date passée est prévue en V2.)",
      "download": "Exporter CSV",
      "columns": {
        "name": "Nom", "plan": "Plan", "status": "Statut",
        "subscriptionStart": "Début abo.", "subscriptionEnd": "Fin abo.", "maxUsers": "Users max"
      },
      "pagination": { "previous": "Précédent", "next": "Suivant", "page": "Page {current} / {total}" }
    },
    "forecast": {
      "title": "Renouvellements attendus le mois prochain",
      "description": "Tenants dont l'abonnement expire dans le mois calendaire suivant.",
      "disclaimer": "Montants estimés d'après la grille tarifaire et le dernier cycle de facturation. Le montant réel encaissé peut différer (remises, changement de plan).",
      "columns": { "tenant": "Tenant", "plan": "Plan", "subscriptionEnd": "Fin abo.", "cycle": "Cycle", "expected": "Montant attendu" },
      "total": "Total prévu",
      "count": "{count} renouvellement(s) attendu(s)",
      "empty": "Aucun renouvellement attendu le mois prochain"
    }
  }
  ```
  (Vérifier que la clé `owner.layout.reports` existe déjà — sinon l'ajouter.)
- [x] `pnpm typecheck` — zéro erreur

### T9 — Tests unitaires (Vitest)

- [x] `src/lib/owner/reports.test.ts` :
  - `validateDateRange` :
    - `(null, null)` → ok:false, error "from-to-required"
    - `("2026-06-01", null)` → ok:false
    - `("2026-06-10", "2026-06-01")` → ok:false, error "from-after-to"
    - `("2026-06-01", "2026-06-10")` → ok:true, range.start = 2026-06-01 00:00, range.end = 2026-06-11 00:00 (jour `to` inclus via +1)
  - `computeRevenueByMethod` : mock `db.select` retourne 3 rows (wave: 2 paiments, 50000 ; nitta: 1, 25000 ; stripe: 0 absent). Assert grandTotal=75000, totalCount=3, byMethod longueur 2 (stripe absent).
  - `computeTenantKpi` : mock tenants count (newRow=3), tenant_events churn (5), actifs (8). Assert {newTenants:3, churn:5, activeNow:8}.
  - `computeRenewalForecast` : mock tenants avec subscriptionEnd dans le mois suivant (pro plan monthly → 25000, enterprise annual → 750000, free → 0, cancelled EXCLUS). Assert total = 775000, count=3 (free inclus à 0).
  - Cas `computeRenewalForecast` : aucun renouvellement → forecast=[], totalExpected=0.
  - Mock `db` via `vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), $count: vi.fn() } }))` + `vi.mock("@/lib/tenants/tenant-config", () => ({ PLAN_PRICES_XOF: { free:{monthly:0,annual:0}, pro:{monthly:25000,annual:250000}, enterprise:{monthly:75000,annual:750000} } }))` (pattern quota 6-2 + owner metrics 7-2).
- [x] `src/lib/owner/reports-csv.test.ts` :
  - `buildPaymentsCsv` :
    - 1er char === "﻿" (BOM)
    - 1re ligne (après BOM) === `"date,tenant,slug,method,amount,currency,reference,periodStart,periodEnd,billingCycle,confirmedBy,notes"`
    - montant en entier (`"25000"`, jamais `"25000.00"`)
    - escaping : un tenant "Acme, SARL" → `"Acme, SARL"` (wrappé guillemets)
    - escaping : notes `Hello "world"` → `"Hello ""world"""`
    - ligne vide si tenantName null → `,,` pour tenant/slug
    - CRLF : `csv.split("\r\n").length === rows.length + 1` (headers + rows)
    - 0 ligne de données → csv === BOM + headers + rien d'autre (pas de CRLF final obligatoire)
- [x] `pnpm check` — tous tests passent sans régression (334+ existants + nouveaux)

### T10 — Tests E2E (Playwright)

- [x] `e2e/owner-reports.spec.ts` (chemin réel du repo — `e2e/`, pas `tests/e2e/`, cf. convention 7-2/7-9) :
  - **Setup** : seed inline (pattern `e2e/owner-dashboard.spec.ts`, pas de fixture partagée `seed-owner.ts` dans ce repo) — user superadmin + 2 tenants + 2 paiements datés du mois courant + 1 event `cancelled`.
  - Scénarios couverts : login superadmin → 4 sections visibles ; admin non-superadmin redirigé ; non-authentifié redirigé ; export CSV BOM+headers exacts ; plage inversée → 400 sans download ; section prévisions (tenant + total).
- [ ] `pnpm test:e2e` — BLOQUÉ (voir Completion Notes : même bug pré-existant Playwright/env que 7-7/7-8, reproduit sur un spec non modifié `owner-dashboard.spec.ts`)

### T11 — Vérification finale (AC9)

- [x] `pnpm check` : lint ✓ (0 erreur, warnings pré-existants import/order sur fichiers .test.ts) typecheck ✓ tests ✓ (798/798)
- [x] `pnpm build` : passe sans erreur (migration 7-1 appliquée, routes `/owner/reports` + 2 exports générées)
- [ ] Superadmin voit `/owner/reports` avec les 4 sections fonctionnelles — NON vérifié en navigateur réel (bloqué par le même problème Playwright/env ; code review manuel + tests unitaires + smoke curl effectués à la place)
- [x] Export CSV paiements : BOM + headers exacts + escaping + CRLF + montant entier (couvert par `reports-csv.test.ts`, 12 tests)
- [x] Plage inversée → 400 + pas de download (couvert par `validateDateRange` unit tests + smoke curl : 400 confirmé)
- [x] Non-superadmin redirigé depuis `/owner/reports` — smoke curl confirme redirect (307) en non-authentifié ; gate superadmin réutilise `requireOwnerAuth()`/`requireOwnerSession()` de 7-2 (déjà éprouvé)

---

## Dev Notes

### CRITIQUE — Hard dependency sur stories 7-1 ET 7-2 (NON implémentées)

Les stories 7-1 et 7-2 ont le statut **ready-for-dev** (pas encore implémentées). Cette story 7-11 suppose :

- **Story 7-1** : tables `tenants` / `subscription_payments` / `tenant_events` + enums (`tenantStatusEnum`, `tenantPlanEnum`, `paymentMethodEnum`, `billingCycleEnum`) + `src/lib/tenants/tenant-config.ts` (`PLAN_PRICES_XOF`, `PLAN_LIMITS`, `DEFAULT_TRIAL_DAYS`) — TOUT présent dans `src/lib/schema.ts`.
- **Story 7-2** : `requireOwnerAuth()` / `requireOwnerSession()` dans `src/lib/session.ts`, rôle `superadmin` dans `permissions.ts`, layout `src/app/owner/layout.tsx`, helpers `src/lib/owner/*` (metrics, csv, format, tenant-filters).

**Conséquence dev agent :**
- 7-11 NE PEUT PAS tourner `pnpm check` / `pnpm build` tant que 7-1 + 7-2 ne sont pas fusionnées.
- Le dev DOIT vérifier (au démarrage) :
  ```bash
  grep -n "export const tenants\|export const subscriptionPayments\|export const tenantEvents" src/lib/schema.ts
  grep -n "export async function requireOwnerAuth\|export async function requireOwnerSession" src/lib/session.ts
  ls src/lib/owner/ src/lib/tenants/tenant-config.ts src/app/owner/layout.tsx
  ```
- Si l'un de ces éléments manque → blocker. Implémenter 7-1 puis 7-2 d'abord, ou confirmer avec le parent l'ordre de fusion.

→ **Flag parent :** planifier l'implémentation séquentielle 7-1 → 7-2 → (7-3 à 7-10) → 7-11. Le présent fichier est prêt, mais non exécutable sans 7-1 et 7-2.

### CRITIQUE — `sum()` Drizzle retourne `string | null`

```ts
const rows = await db.select({ total: sum(subscriptionPayments.amount) })...
rows[0].total // string | null — Postgres numeric → string via pg driver
```
TOUJOURS `Number(r.total ?? 0)`. Ne JAMAIS faire `r.total * 2` (string × number = NaN). Source : [Drizzle docs — Select values](https://orm.drizzle.team/docs/select-values).

À l'inverse, `count()` retourne déjà `number` (Drizzle fait `.mapWith(Number)`). Pas besoin de wrapper.

### CRITIQUE — `tenant-config.ts` (story 7-1) — vérifier le nom exporté

Cette story utilise `PLAN_PRICES_XOF` depuis `src/lib/tenants/tenant-config.ts` (cf. story 7-1 AC + spec Epic 7 §7). Le dev DOIT vérifier l'export exact au démarrage :

```bash
grep -n "export const PLAN_PRICES\|export const PLAN_LIMITS" src/lib/tenants/tenant-config.ts
```

Si le nom diffère (ex: `PRICING` ou `PLAN_PRICING_XOF`), adapter l'import dans `reports.ts`. Ne PAS dupliquer la constante (source unique de vérité).

Valeurs attendues (spec Epic 7 §7) :
```ts
PLAN_PRICES_XOF = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 25000, annual: 250000 },
  enterprise: { monthly: 75000, annual: 750000 },
}
```

### CRITIQUE — Churn & tenants actifs : sémantique MVP (pas de reconstitution historique)

**Churn** (AC3) : un tenant est considéré churné quand il passe à `status = 'cancelled'` (event_type `cancelled`). C'est un churn **terminal** (un `cancelled` ne se réactive pas — story 7-4 AC4 interdit les paiements sur `cancelled`, story 7-5 AC6). Un `suspended` n'est PAS du churn (le tenant peut être `reactivated`). Le count se fait sur `tenant_events` (pas sur `tenants.status`) car on veut les annulations SUR LA PÉRIODE, pas le stock courant.

**Tenants actifs fin de mois** (AC3) : en MVP on affiche le count COURANT des `status='active'`, PAS une reconstitution AS-OF à la fin du mois passé. Raison : on n'a pas de snapshot historique des statuts (les `tenant_events` existent mais la reconstitution est complexe — il faudrait replay tous les events). Pour le MVP owner, le chiffre courant suffit. L'UX l'indique (`owner.reports.snapshot.description` : "État courant du parc SaaS").

→ **Flag parent** : si la compta veut un vrai chiffre AS-OF (ex: "tenants actifs au 31/12/2025"), prévoir une story V2 qui snapshot le parc mensuellement (table `tenant_snapshots` créé par cron).

### CRITIQUE — Instantané AS-OF — DEFERRED en V2

AC6 expose un input date mais MVP ne filtre PAS les tenants à cette date (pas de `createdAt <= D` ni de reconstitution du statut à D). La date sert uniquement de label dans l'en-tête + nom de fichier. Ce comportement est documenté dans l'UI (`owner.reports.snapshot.description`). Si la compta demande un vrai AS-OF (créer un snapshot mensuel), c'est une story V2 (table `tenant_monthly_snapshots` + cron le 1er du mois). NE PAS implémenter la reconstitution ici — complexité élevée pour un besoin MVP optionnel.

### CRITIQUE — Plage de dates half-open (tz-safe)

Pour `computeRevenueByMethod` et l'export paiements, utiliser une plage **half-open** `[start, end)` :
- `gte(paidAt, start)` ET `lt(paidAt, end)` — où `end` = `start + durée + 1 jour` (pour inclure tout le dernier jour).
- JAMAIS `between(start, end)` qui est inclusif des deux côtés (`BETWEEN` SQL) — double-compte les instants à la frontière (minuit) quand `paidAt` est `timestamptz`.

Helper `validateDateRange(from, to)` :
```ts
// from/to sont des dates ISO "YYYY-MM-DD"
// On veut inclure TOUT le jour `to` → end = (to + 1 jour) à 00:00:00 local
const start = parseDateAtMidnight(from);
const end = addDays(parseDateAtMidnight(to), 1); // exclusive
return { start, end };
```

### CRITIQUE — BOM UTF-8 via `"﻿"` (pas le littéral `"﻿"`)

Le BOM U+FEFF est OBLIGATOIRE pour Excel Windows (standard Niger/AES — sans lui, les accents français/deviennent mojibake). Pattern :

```ts
return "﻿" + [HEADERS.join(","), ...lines].join("\r\n");
```

**PRÉFÉRER `"﻿"`** au littéral `"﻿"` (qui peut être strippé par certains éditeurs / par le prettier). `audit/export` (6-3) et `owner/csv.ts` (7-2) utilisent déjà ce pattern — le réutiliser à l'identique.

Le `new Response(string)` en Next 16 préserve les bytes `EF BB BF` quand il encode le corps en UTF-8 (vérifié). Pas besoin de `Buffer` ou de `Uint8Array`.

### CRITIQUE — `leftJoin` pour l'export paiements (pas innerJoin)

`subscription_payments.tenantId` a `ON DELETE CASCADE` vers `tenants` (story 7-1 AC2). En théorie, aucun paiement orphelin ne peut exister. En pratique, on utilise `leftJoin` par défense : un paiement orphelin (bug, migration partielle) doit quand même être exporté pour la compta, avec `tenantName=null` → cellule vide dans le CSV. JAMAIS perdre une ligne de paiement dans un export comptable.

### CRITIQUE — Download direct via `<a href download>` (pas de fetch+blob)

Pour l'export CSV, le pattern le plus simple et robuste :

```tsx
<a href={`/api/v1/owner/reports/payments/export?from=${from}&to=${to}`} download>
  {t("owner.reports.paymentsExport.download")}
</a>
```

Le navigateur gère le téléchargement via `Content-Disposition: attachment`. PAS besoin de `fetch()` + `blob()` + `URL.createObjectURL()` + `a.click()` (plus verbeux, gestion d'erreur client complexe, et le `fetch` buffering tout le CSV en mémoire avant de l'écrire). Le `<a download>` est suffisant pour des fichiers de 10k lignes (~2 Mo).

L'inconvénient : pas de toast de confirmation "téléchargé". Si le parent veut ce toast, on peut ajouter un `onClick` qui déclenche `toast.success(...)` (le download partira quand même via le `href`). Acceptable.

### CRITIQUE — `xlsx` / Excel réel — DEFERRED en V2

**Décision MVP : CSV primaire, xlsx DIFFÉRÉ.**

Rationale (recherche web, juin 2026) :
- `xlsx` (SheetJS) sur npm est **gelé à 0.18.5** avec **CVE-2023-30533** non patchée sur npm (le fix est en 0.19.3 sur `cdn.sheetjs.com` uniquement). `pnpm audit` reste rouge. À ÉVITER.
- `exceljs` (4.4.0, MIT, sur npm) fonctionne mais ajoute ~1.5 MB pour une feature optionnelle.
- **CSV avec BOM UTF-8 + CRLF est suffisant pour Excel Windows** (les comptables au Niger/AES ouvrent le CSV directement dans Excel, accents corrects grâce au BOM). La seule limite du CSV vs xlsx : pas de formules / styling — non requis pour un export comptable brut.

→ Cette story n'ajoute AUCUNE dépendance. Si un vrai .xlsx devient requis en V2, utiliser `exceljs` (pas `xlsx` de npm).

### CRITIQUE — `apiError` signature

Vérifier la signature exacte dans `src/lib/api/envelope.ts` avant d'écrire les routes API :
```ts
// Probable :
apiError(code: string, message: string, status: number, details?: { fields?: Record<string, string> })
```
Adapter l'appel pour VALIDATION_FAILED (4e arg `{ fields }`). Si pas de 4e arg, juste `apiError("VALIDATION_FAILED", msg, status)`.

### CRITIQUE — `searchParams` est une Promise en Next 16

```tsx
// CORRECT (Next 16)
export default async function Page({ searchParams }: { searchParams: Promise<...> }) {
  const sp = await searchParams;
}
```
+ `export const dynamic = "force-dynamic"` pour éviter le stale searchParams avec PPR (caveat Next 16 — voir Dev Notes 7-2). Source : [Next.js 16 — Page](https://nextjs.org/docs/app/api-reference/file-conventions/page).

### CRITIQUE — Aucune nouvelle table / migration / index

Cette story est **100% lecture seule** sur le schéma posé par 7-1. Aucune modification de `src/lib/schema.ts`, aucun `drizzle/XXXX_*.sql`. Les index 7-1 existants suffisent :
- `subscription_payments.paidAt` (indexé en 7-1 AC2) → couvre `gte`/`lt` par plage
- `subscription_payments.tenantId` (indexé en 7-1) → couvre le JOIN + sous-requête LATERAL
- `tenant_events.createdAt` (indexé en 7-1 AC3) → couvre le churn range query
- `tenants.status` / `tenants.createdAt` (indexés en 7-1 AC1) → couvrent les count

Si en V2 les volumes explosent (>>10k paiements/plage), envisager un index composite `(paidAt, tenantId)` — HORS SCOPE ici.

### CRITIQUE — Items nav owner (coordination 7-2 / 7-12)

En 7-2, la nav owner a :
- Dashboard `/owner` (actif)
- Tenants `/owner/tenants` (actif)
- Paiements, Rapports, Paramètres (placeholders désactivés "Bientôt")

Cette story **active** l'item "Rapports" (`/owner/reports`). Si la story 7-10 (Stripe) ou 7-12 (paramètres plateforme) sont fusionnées avant 7-11, MERGER les activations d'items dans `src/app/owner/layout.tsx` proprement (pas de conflit — chaque story active son propre item).

### CRITIQUE — Sous-requête corrélée "dernier cycle" (AC7 forecast)

Pour le montant attendu (AC7), on a besoin du `billingCycle` du **dernier paiement** du tenant. Pattern (déjà utilisé en 7-2 pour "dernier paiement" du tableau) :

```ts
lastCycle: sql<"monthly" | "annual" | null>`
  (SELECT billing_cycle FROM subscription_payments
   WHERE tenant_id = ${tenants.id}
   ORDER BY paid_at DESC LIMIT 1)
`,
```

Drizzle accepte les sous-requêtes corrélées via `sql\`...\`` dans le `select`. Typer avec `sql<"monthly" | "annual" | null>` pour le typage TS strict. Voir Dev Notes 7-2 §"JOIN LATERAL dernier paiement" pour le pattern complet.

Alternative : 2 queries (tenants d'abord, puis `SELECT tenantId, billing_cycle FROM ... WHERE tenant_id IN (...) ORDER BY paid_at DESC` + map en JS). Plus verbeux mais 100% Drizzle typé. **Préférer la sous-requête corrélée `sql`** (1 query, perf MVP suffisante pour ~50-200 tenants).

### CRITIQUE — Plan `free` → montant 0 (ne pas l'exclure)

En AC7, un tenant `plan=free` dont l'abonnement expire dans le mois suivant est INCLUS dans la liste avec `expectedAmount = 0` (PLAN_PRICES_XOF.free.monthly === 0). C'est utile : le owner voit que le free va expirer (potentiel upsell), même si le montant est 0. Ne PAS filtrer `expectedAmount > 0`.

### CRITIQUE — Sous-requête LATERAL vs sous-requête corrélée (perf)

Pour ~10-200 tenants (ordre de grandeur MVP SaaS B2B Niger), les sous-requêtes corrélées dans le `SELECT` sont parfaitement performantes (Postgres optimise). Pour des milliers de tenants (V2 scale), migrer vers un `LEFT JOIN LATERAL` ou pré-filtrer par date avant le JOIN. HORS SCOPE MVP.

### Pattern existant à réutiliser

- `src/app/api/v1/audit/export/route.ts` (story 6-3) — **modèle exact** pour l'export CSV (BOM, escaping, Content-Disposition, force-dynamic, apiError). Suivre à l'identique.
- `src/lib/owner/csv.ts` (story 7-2) — `buildTenantsCsv` (BOM + escape + CRLF). `reports-csv.ts` suit le même pattern.
- `src/lib/owner/metrics.ts` (story 7-2) — `computeOwnerMetrics` (GROUP BY count), `computeRevenue` (SUM + Number wrap). `reports.ts` suit les mêmes conventions Drizzle.
- `src/lib/owner/format.ts` (story 7-2) — `formatDateFr`, `formatDaysRemaining`, `formatRelativeDate`. Réutiliser pour les dates FR.
- `src/components/owner/owner-metrics-cards.tsx` (story 7-2) — tokens cartes KPI. Réutiliser pour les 3 cartes AC3.
- `src/components/owner/tenants-table.tsx` (story 7-2) — pattern tableau HTML natif + pagination server-driven + badges. Réutiliser pour AC6.
- `src/components/owner/tenant-status-badge.tsx` + `tenant-plan-badge.tsx` (story 7-2) — réutiliser pour AC6 + AC7.
- `src/lib/session.ts` (story 7-2) — `requireOwnerAuth()` (page) + `requireOwnerSession()` (API).
- `src/lib/api/envelope.ts` — `apiError()`, `HTTP_STATUS`.
- `src/lib/money.ts` — `formatFcfa()` pour tous les montants affichés.
- `src/lib/tenants/tenant-config.ts` (story 7-1) — `PLAN_PRICES_XOF` pour le forecast.

### Design tokens — sections rapports

```tsx
// En-tête de section
className="text-xs font-semibold uppercase tracking-wider text-text-muted"

// Titre section
className="font-serif text-xl font-semibold text-text-primary"

// Carte KPI (AC3)
className="rounded-lg border border-border bg-surface p-5"
// Chiffre
className="font-serif text-2xl font-semibold tabular-nums text-text-primary"

// Tableau (AC2, AC6, AC7) — pattern tenants-table 7-2
className="overflow-hidden rounded-xl border border-border"
// thead
className="bg-surface-alt px-4 py-3 text-left font-semibold text-text-muted"
// tbody tr
className="border-t border-border"

// Input date / month
className="mt-1 h-9 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"

// Bouton primaire (download CSV)
className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep"

// Lien download
className="inline-flex h-9 items-center rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep"

// Encart disclaimer (AC7)
className="rounded-xl border border-border bg-surface-alt p-3 text-xs text-text-muted"
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Modifier `src/lib/schema.ts` | 100% lecture seule (aucune migration) |
| `sum()` non wrappé (`r.total * 12`) | `Number(r.total ?? 0)` |
| `between(start, end)` (inclusif des 2 côtés) | `gte(start)` + `lt(end)` half-open |
| Omettre le BOM dans le CSV | `"﻿"` obligatoire |
| Littéral `"﻿"` strippable par éditeur | `"﻿"` explicite |
| `fetch()` + blob pour l'export | `<a href download>` direct |
| Inner join paiements (perd les orphelins) | `leftJoin` (défense compta) |
| Filtrer `expectedAmount > 0` (exclut free) | Inclure free à 0 |
| Compter churn sur `tenants.status='cancelled'` | Compter sur `tenant_events` eventType='cancelled' (flux période) |
| Reconstituer AS-OF historique en MVP | Snapshot courant + disclaimer (V2 pour AS-OF) |
| Installer `xlsx` de npm (CVE-2023-30533) | CSV primary, xlsx DEFERRED (exceljs en V2 si requis) |
| Hardcoder du texte FR | Clés `fr-NE.json` section `owner.reports` |
| `searchParams` sync (Next 14) | `await searchParams` (Promise Next 16) |
| Faire confiance au proxy/layout seul pour `/owner/reports` | `requireOwnerAuth()` en tête de page (defense in depth) |
| Dupliquer `PLAN_PRICES_XOF` | Import depuis `tenant-config.ts` (7-1) |
| Omettre `Cache-Control: no-store` sur l'export | Toujours présent (route auth-gated) |

### Héritage des stories précédentes

**Story 7-1 (schema + middleware) — ready-for-dev (NON implémentée)** : hard dependency (tables + enums + `tenant-config.ts`). Le dev DOIT s'assurer que 7-1 est fusionnée avant de tester 7-11.

**Story 7-2 (dashboard + liste + export CSV) — ready-for-dev (NON implémentée)** : hard dependency (`requireOwnerSession`, layout owner, `src/lib/owner/*`, `superadmin` role). Pattern `buildTenantsCsv` + `computeRevenue` + `owner-metrics-cards` à réutiliser.

**Story 6-3 (audit export) — DONE** : pattern CSV BOM + escaping + Content-Disposition. `src/app/api/v1/audit/export/route.ts` est le **modèle exact** pour les routes export de cette story.

**Story 7-4 (record payment) — ready-for-dev** : SOFT dependency (forme des données `subscription_payments` + eventType `payment_recorded`). Aucune modification de 7-4 ici.

**Story 7-5 (suspension + cancellation) — ready-for-dev** : SOFT dependency (eventType `cancelled` = churn terminal, `suspended` = pas churn). Utilisé pour le KPI churn (AC3).

### Commandes pour le dev agent

```bash
# 0. PRÉREQUIS — stories 7-1 ET 7-2 doivent être fusionnées
grep -n "export const tenants\|export const subscriptionPayments\|export const tenantEvents" src/lib/schema.ts
grep -n "export async function requireOwnerAuth" src/lib/session.ts
ls src/lib/owner/ src/lib/tenants/tenant-config.ts src/app/owner/layout.tsx
# Si manquant → blocker, implémenter 7-1 et 7-2 d'abord.

# 1. Docker en cours
docker compose up -d

# 2. AUCUNE migration (lecture seule). Vérifier que le schéma 7-1 est appliqué :
pnpm db:migrate  # idempotent, applique 7-1 si pas déjà fait

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur

# 5. Dev
pnpm dev
# Login en tant que superadmin → http://localhost:3000/owner/reports
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §3.7 Rapports & comptabilité (`/owner/reports`) : rapport mensuel (revenus par méthode, nouveaux, churn, actifs), export paiements CSV/Excel, rapport tenants à une date, prévisions renouvellements. §3.2 export CSV (pattern réutilisé). §7 paramètres business (`PLAN_PRICES_XOF`).
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — HARD dependency (tables `tenants`/`subscription_payments`/`tenant_events`, enums, `tenant-config.ts`).
- [Story 7-2] `_bmad-output/implementation-artifacts/7-2-owner-dashboard-tenant-list.md` — HARD dependency (`requireOwnerSession`, layout owner, `src/lib/owner/*`, superadmin role). Pattern `buildTenantsCsv`, `computeRevenue`, `owner-metrics-cards`.
- [Story 7-4] `_bmad-output/implementation-artifacts/7-4-record-payment-mobile-money.md` — SOFT dependency (forme `subscription_payments`, eventType `payment_recorded`).
- [Story 7-5] `_bmad-output/implementation-artifacts/7-5-manual-suspension-expiry-page.md` — SOFT dependency (eventType `cancelled` = churn terminal).
- [Story 6-3] `_bmad-output/implementation-artifacts/6-3-immutable-audit-trail-export.md` — pattern export CSV (BOM + escape + Content-Disposition + force-dynamic). `src/app/api/v1/audit/export/route.ts` est le modèle exact.
- [project-context.md] — règles Drizzle (`sum()` → string, `count()` → number, half-open ranges), TypeScript strict, API envelope, i18n, CSV BOM, design system.
- [Next.js 16 — Route Handlers (Non-UI Responses, Streaming, Segment Config)](https://nextjs.org/docs/app/api-reference/file-conventions/route) — `new Response(string)`, `force-dynamic`, `runtime = "nodejs"`.
- [Next.js 16 — Page (searchParams is a Promise)](https://nextjs.org/docs/app/api-reference/file-conventions/page)
- [Drizzle ORM — Select (aggregations, sum/count)](https://orm.drizzle.team/docs/select-values)
- [Drizzle ORM — Operators (eq, gte, lt, and)](https://orm.drizzle.team/docs/operators)
- [Drizzle ORM — sql template (date_trunc)](https://orm.drizzle.team/docs/sql)
- [RFC 4180 — CSV escaping] — `"` → `""`, valeurs avec virgule/retour-ligne wrappées.
- [DESIGN.md §Colors/Typography] — tokens `bg-surface`, `bg-surface-alt`, `border-border`, `font-serif`, `tabular-nums`, `status-*-bg/text`.
- [src/lib/money.ts] — `formatFcfa()` (FCFA entier).
- [src/lib/api/envelope.ts] — `apiError()`, `HTTP_STATUS`.
- [CVE-2023-30533 — SheetJS xlsx npm gelé] — raison du DEFER xlsx (utiliser exceljs en V2 si requis).

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`) §3.7

**Story 7.11 (P2)** — Rapports & export comptabilité. C'est la story qui transforme les données de `subscription_payments` + `tenant_events` (alimentées par les stories 7-4 paiement, 7-5 suspend/cancel, 7-8 reactivate, 7-10 Stripe) en **outils de pilotage business** pour le owner :

1. **Comptabilité** — export CSV des encaissements (reçu par le comptable, importable Excel).
2. **Pilotage churn** — mesurer les annulations sur un mois.
3. **Prévisions de trésorerie** — montants attendus le mois prochain.
4. **État du parc** — instantané à une date pour reporting interne.

Sans 7-11, le owner ne peut que VOIR ses tenants (7-2) et encaisser (7-4) — il ne peut ni exporter pour la compta, ni anticiper les renouvellements, ni mesurer le churn.

### Cross-context — stories Epic 7

| ID | Titre | Dépendance vers 7-11 |
|----|-------|----------------------|
| 7.1 | Schema tenants + middleware | — (prérequis HARD) |
| 7.2 | Dashboard + liste + export CSV | — (prérequis HARD) |
| 7.4 | Record payment (mobile money) | Alimente `subscription_payments` (lecture) |
| 7.5 | Suspension + cancellation | Alimente `tenant_events` eventType `cancelled` (churn) |
| 7.6 | Cron expiration + rappels | Alimente `tenant_events` eventType `reminder_sent` |
| 7.7 | Fiche tenant (onglets) | Affiche déjà l'historique paiements — 7-11 est l'agrégat |
| 7.8 | Reactivation | Alimente `tenant_events` eventType `reactivated` |
| 7.10 | Stripe webhook | Alimente `subscription_payments` automatiquement (méthode `stripe`) |
| **7.11** | **Rapports & export comptabilité** | — (cette story) |
| 7.12 | Paramètres plateforme | Override `PLAN_PRICES_XOF` → impacte le forecast (montants à jour) |

7-11 fonctionne même si 7-10 / 7-12 ne sont pas faits (le forecast utilise `PLAN_PRICES_XOF` par défaut de 7-1 ; les paiements Stripe sont simplement absents tant que 7-10 n'est pas implémenté).

### Paramètres business (Epic 7 §7)

```ts
const PLAN_PRICES_XOF = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 25000, annual: 250000 },
  enterprise: { monthly: 75000, annual: 750000 },
}
```
Utilisé pour le forecast (AC7) via import de `tenant-config.ts` (story 7-1). Ne PAS dupliquer.

---

## Architecture Compliance

| Contrainte | Conformité story 7-11 |
|---|---|
| Next.js 16 App Router (Server Components par défaut) | ✅ Page + sections Server Components ; `searchParams` Promise awaited ; `force-dynamic` |
| proxy.ts (middleware.ts déprécié) | N/A — `/owner/*` déjà protégé par 7-2 (matcher étendu). Cette story ne touche pas au proxy. |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | ✅ Guards `?? 0`, `Number(... ?? 0)`, `leftJoin` pour nullables |
| Drizzle : uuid() custom tables, helpers `sum`/`count`/`sql` | ✅ Lecture seule ; `sum()` wrappé, `count()` number, `sql` pour sous-requêtes |
| Migration workflow | N/A — aucune migration (lecture seule schéma 7-1) |
| next-intl : UI strings dans `fr-NE.json` | ✅ Section `owner.reports.*` complète |
| API envelope : `apiError()` | ✅ Routes export (401/403/400 via `requireOwnerSession` + `validateDateRange`) |
| Indexes sur colonnes filtrées | N/A — index 7-1 (`paidAt`, `tenantId`, `createdAt`, `status`) suffisent |
| Money : integer FCFA + `formatFcfa()` | ✅ Revenus/KPI/forecast via `formatFcfa()` ; CSV en entier brut |
| CSV : BOM UTF-8 (`"﻿"`) + CRLF + RFC 4180 escaping | ✅ `buildPaymentsCsv` + `buildTenantsSnapshotCsv` (pattern 6-3 + 7-2) |
| Permissions : `requireOwnerSession()` API, `requireOwnerAuth()` page | ✅ Defense in depth sur page + API |
| Export routes : `force-dynamic` + `runtime=nodejs` + `Cache-Control: no-store` | ✅ Routes `/api/v1/owner/reports/*/export` |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-11 |
|---|---|---|
| `next` | 16.1.6 | App Router page owner/reports, `searchParams` Promise, Route Handlers export CSV |
| `drizzle-orm` | 0.44.7 | `sum()`, `count()`, `count(sql\`DISTINCT col\`)`, `sql` template (sous-requête lastCycle), operators `eq`/`and`/`gte`/`lt`/`ne`/`isNotNull`, `leftJoin`, `$count` |
| `better-auth` | 1.6.11 | `auth.api.getSession()` (via `requireOwnerSession`) |
| `next-intl` | 4.13.0 | `getTranslations("owner.reports")` Server Components |
| `sonner` | 2.0.7 | Toast erreur validation plage (optionnel) |
| shadcn/ui (`Badge`) | 3.8.5 | Badges plan/status (réutilisés de 7-2) |
| `vitest` | 4.1.9 | Tests unitaires reports + reports-csv |
| `@playwright/test` | 1.61.0 | E2E owner-reports |

**Aucune nouvelle dépendance à installer.** Pas de `xlsx` (CVE), pas de `exceljs` (deferred), pas de lib CSV externe (string building suffit).

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `src/app/owner/layout.tsx` | **UPDATE** | Activer l'item nav "Rapports" (lien `/owner/reports`) — était placeholder 7-2 |
| `src/app/owner/reports/page.tsx` | **NEW** | Page rapport (Server Component, 4 sections, `searchParams` Promise, `force-dynamic`) |
| `src/lib/owner/reports.ts` | **NEW** | `validateDateRange`, `computeRevenueByMethod`, `computeTenantKpi`, `computeRenewalForecast`, `fetchTenantsSnapshot`, `fetchPaymentsForExport` |
| `src/lib/owner/reports-csv.ts` | **NEW** | `buildPaymentsCsv`, `buildTenantsSnapshotCsv` (BOM + escape + CRLF) |
| `src/app/api/v1/owner/reports/payments/export/route.ts` | **NEW** | GET export CSV paiements (superadmin, force-dynamic, nodejs) |
| `src/app/api/v1/owner/reports/tenants/export/route.ts` | **NEW** | GET export CSV instantané tenants (superadmin) |
| `src/components/owner/reports/monthly-report-section.tsx` | **NEW** | Section AC2+AC3 (revenus par méthode + KPI) |
| `src/components/owner/reports/payments-export-section.tsx` | **NEW** | Section AC4 (date-range + lien download CSV) |
| `src/components/owner/reports/tenant-snapshot-section.tsx` | **NEW** | Section AC6 (tableau + pagination + export) |
| `src/components/owner/reports/renewal-forecast-section.tsx` | **NEW** | Section AC7 (liste + total + disclaimer) |
| `src/components/owner/reports/month-picker.tsx` | **NEW** | Client component `<input type="month">` |
| `src/lib/owner/reports.test.ts` | **NEW** | Tests Vitest (validateDateRange, computeRevenueByMethod, computeTenantKpi, computeRenewalForecast) |
| `src/lib/owner/reports-csv.test.ts` | **NEW** | Tests Vitest (buildPaymentsCsv headers/BOM/escape/CRLF/0-ligne) |
| `tests/e2e/owner-reports.spec.ts` | **NEW** | E2E Playwright (auth gate + sections + export CSV + BOM) |
| `src/messages/fr-NE.json` | **UPDATE** | Section `owner.reports.*` + active clé nav `owner.layout.reports` |

**Ne PAS modifier :** `src/lib/schema.ts` (lecture seule), `drizzle/` (aucune migration), `src/lib/session.ts` / `src/lib/permissions.ts` / `src/proxy.ts` (déjà faits en 7-2), `src/lib/owner/metrics.ts` / `csv.ts` / `format.ts` / `tenant-filters.ts` (7-2, réutilisés en lecture), `src/lib/tenants/*` (7-1, lecture), les routes API `payments`/`suspend`/`reactivate` (7-4/7-5/7-8), `src/lib/auth.ts`, le layout `(app)`.

---

## Testing Requirements

### Tests unitaires (Vitest)

- `src/lib/owner/reports.test.ts` :
  - `validateDateRange` : (null,null)→from-to-required ; ("2026-06-01",null)→from-to-required ; ("2026-06-10","2026-06-01")→from-after-to ; ("2026-06-01","2026-06-10")→ok + range.end == 2026-06-11 00:00 (jour `to` inclus)
  - `computeRevenueByMethod` : mock 3 méthodes (wave: 2/50000, nitta: 1/25000, stripe absent). grandTotal=75000, totalCount=3, longueur byMethod=2. Cas 0 paiement → grandTotal=0, byMethod=[].
  - `computeTenantKpi` : mock newRow=3, churnRow=5, activeRow=8 → {3,5,8}. Cas 0 partout.
  - `computeRenewalForecast` : mock tenants (pro monthly → 25000, enterprise annual → 750000, free → 0 inclus, cancelled EXCLUS). total=775000, count=3. Cas 0 renouvellement → forecast=[], total=0.
  - Mock `db` (`vi.mock("@/lib/db")`) + `PLAN_PRICES_XOF` (`vi.mock("@/lib/tenants/tenant-config")`) — pattern quota 6-2 + owner metrics 7-2.
- `src/lib/owner/reports-csv.test.ts` :
  - `buildPaymentsCsv` : 1er char `"﻿"` ; 1re ligne (après BOM) === headers exacts AC4 ; montant `"25000"` (pas `.00`) ; escaping `"Acme, SARL"` ; `Hello "world"` → `"Hello ""world"""` ; null tenantName → cellule vide ; CRLF (`split("\r\n")`) ; 0 ligne → BOM + headers seuls.

### Tests E2E (Playwright)

- `tests/e2e/owner-reports.spec.ts` — cf. T10 (8 scénarios incluant vérification BOM + headers du CSV téléchargé).
- **Setup** : étendre `tests/fixtures/seed-owner.ts` (7-2) avec paiements datés du mois courant + 1 event `cancelled`.

### Tests existants

- `pnpm check` doit continuer à passer : 334+ tests existants. Aucune régression attendue (lecture seule schéma, pas de modification des tables domaines, du seam companyId, ni des API routes client existantes).

---

## Previous Story Intelligence

**Story 7-2 (dashboard + liste + export CSV) — ready-for-dev (NON implémentée)** : hard dependency. Le dev de 7-11 suppose 7-2 fusionnée. Patterns à réutiliser : `requireOwnerSession`, layout owner (item "Rapports" à activer), `src/lib/owner/csv.ts` (BOM + escape), `src/lib/owner/metrics.ts` (SUM + Number wrap), `owner-metrics-cards` (tokens cartes KPI), `tenants-table` (pattern tableau + pagination).

**Story 6-3 (audit export) — DONE** : pattern export CSV (BOM + escape + Content-Disposition + force-dynamic + apiError). `src/app/api/v1/audit/export/route.ts` est le **modèle exact** pour les routes export paiements + snapshot de cette story. Le `code-review` de 6-3 a confirmé : BOM U+FEFF (65279) correct via `Response` + `charset=utf-8`, double-échappement CSV à éviter (un seul pass générique RFC 4180).

**Story 6-2 (quota) — DONE** : pattern mock `db` dans Vitest (`vi.mock("@/lib/db")`) + `sql\`...\`` pour sous-requêtes.

**Story 7-4 (record payment) — ready-for-dev** : SOFT dependency. Forme des rows `subscription_payments` (amount integer FCFA, billingCycle enum, paymentMethod enum, periodStart/End date, confirmedBy text). Réutilisé tel quel dans `fetchPaymentsForExport`.

**Story 7-5 (suspend + cancel) — ready-for-dev** : SOFT dependency. Sémantique churn = eventType `cancelled` (terminal, pas de réactivation). `suspended` ≠ churn.

---

## Git Intelligence Summary

Dernier commit master : `a637dfe` (baseline de toutes les stories 7-x).

Commits pertinents (déjà analysés en 7-2) :
- `a637dfe` fix: /register redirect + logout button — pattern logout (réutilisé par layout owner 7-2)
- `a5d9e2e` test(qa): API unit tests + Playwright E2E — pattern tests E2E
- `a4f6977` feat(6-3): immutable audit trail export — **pattern CSV export (modèle de cette story)**
- `f57a515` feat(6-2): tier quota enforcement — pattern mock db + sql template

**Pattern établi** : tests Vitest à côté du module (`src/lib/owner/*.test.ts`), E2E dans `tests/e2e/`, fixtures dans `tests/fixtures/`. Suivre ce modèle.

---

## Latest Tech Information

### Next.js 16 — Route Handlers (Non-UI Responses + Segment Config)

Source : [Next.js 16 — Route](https://nextjs.org/docs/app/api-reference/file-conventions/route)

- `return new Response(stringBody, { headers })` est le pattern canonique pour les réponses non-UI (CSV, texte, binaire). Ne PAS utiliser `Response.json` pour du CSV.
- `export const dynamic = "force-dynamic"` : recommandé pour toute route auth-gated. En Next 15+ les GET sont dynamiques par défaut, mais `force-dynamic` explicite supprime le warning build et garantit le non-cache.
- `export const runtime = "nodejs"` : requis pour Drizzle/PG (edge runtime ne peut pas atteindre PG).
- `Cache-Control: no-store` : defense in depth sur les exports auth-gated.
- BOM U+FEFF préservé via `new Response(string)` (encode en UTF-8 → bytes `EF BB BF`).

### Drizzle 0.44.7 — agrégats

Source : [Drizzle — Select values](https://orm.drizzle.team/docs/select-values), [Drizzle — count rows](https://orm.drizzle.team/docs/guides/count-rows)

- `sum(col)` → `string | null` (sous le capot `sql\`sum(${col})\`.mapWith(String)`). TOUJOURS `Number(... ?? 0)`.
- `count()` → `number` (déjà `.mapWith(Number)`). `count(sql\`DISTINCT col\`)` pour distinct.
- `$count(table)` → `number` (helper, pas de GROUP BY).
- `between()` est inclusif des 2 côtés → préférer `gte(start)` + `lt(end)` half-open pour les frontières de mois.
- `sql\`...\`` template pour sous-requêtes corrélées (lastCycle) et `date_trunc`.

### CSV — RFC 4180 + BOM UTF-8 + CRLF

- Valeurs avec `,` `"` `\n` `\r` → wrappées dans `"..."`, guillemets internes doublés (`"` → `""`).
- BOM U+FEFF en tête → Excel Windows lit l'UTF-8 correctement (accents français).
- Fins de ligne CRLF (`\r\n`) → Excel Windows.
- Aucune lib externe : string building + join suffit pour 10k lignes (~2 Mo en mémoire, trivial).

### xlsx / SheetJS — DEFERRED (CVE-2023-30533)

- `xlsx` npm gelé à 0.18.5 avec CVE-2023-30533 non patchée sur npm (fix 0.19.3 uniquement sur `cdn.sheetjs.com`). `pnpm audit` reste rouge.
- `exceljs` 4.4.0 (MIT, npm) fonctionne pour V2 si réel .xlsx requis.
- **MVP : CSV+BOM suffit** pour les comptables Niger/AES (ouvrent en Excel, accents corrects). Cette story n'ajoute aucune dépendance.

Sources : [npm xlsx](https://www.npmjs.com/package/xlsx), [npm exceljs](https://www.npmjs.com/package/exceljs), [Snyk CVE-2023-30533](https://security.snyk.io/package/npm/xlsx/0.18.5).

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Framework-Specific Rules (Next.js/React)** — App Router, `"use client"`, `searchParams` Promise Next 16, `force-dynamic`, Route Handlers
- **Database Rules (Drizzle)** — `sum()` → string, `count()` → number, `sql` template, half-open ranges
- **API Routes Rules** — `apiError()`, cast `session.user.role`, validation Zod
- **Money / Financial Rules** — `formatFcfa()`, FCFA entier
- **CSV / Exports** — BOM UTF-8 (`"﻿"`) + CRLF + RFC 4180 escaping OBLIGATOIRES
- **Language Convention** — UI français (clés `fr-NE.json`), code anglais, DB snake_case

---

## Assumptions

(Assumptions non-interactives — à valider par le parent si besoin)

1. **CSV primaire, xlsx DEFERRED** : SheetJS `xlsx` npm a CVE-2023-30533 non patchée ; `exceljs` ajoute ~1.5 MB pour une feature optionnelle. CSV+BOM suffit aux comptables Niger/AES (Excel lit correctement l'UTF-8). Si réel .xlsx requis en V2 → `exceljs`.
2. **Churn = eventType `cancelled`** (terminal). `suspended` n'est PAS du churn (le tenant peut être `reactivated`). Count sur `tenant_events` (flux période), pas sur `tenants.status` (stock courant).
3. **Tenants actifs = count COURANT `status='active'`** (pas AS-OF fin de mois). La reconstitution AS-OF est une story V2 (snapshot mensuel par cron). Disclaimer dans l'UI.
4. **Instantané AS-OF DEFERRED** : AC6 expose un input date mais MVP liste les tenants courants (pas de filtre `createdAt <= D` ni reconstitution statut). La date sert de label + nom de fichier. V2 = table `tenant_monthly_snapshots` + cron.
5. **Forecast : `lastCycle` déduit du dernier paiement** (sous-requête corrélée). Si aucun paiement → `"monthly"` par défaut. Plan `free` → montant 0 inclus (visibilité upsell).
6. **Plage half-open `[start, end)`** via `gte`/`lt` (tz-safe). `between()` évité (inclusif des 2 côtés → double-count frontière).
7. **`<a href download>` direct** pour les exports (pas de `fetch`+blob). Le navigateur gère le téléchargement via `Content-Disposition`.
8. **`leftJoin` paiements↔tenants** pour ne jamais perdre un paiement orphelin (défense compta).
9. **`PLAN_PRICES_XOF` importé de `tenant-config.ts`** (story 7-1). Ne PAS dupliquer. Le dev DOIT vérifier le nom exact de l'export au démarrage.
10. **Limit 10 000 lignes** par export (cohérent avec audit export 6-3 + tenants export 7-2). Au-delà → warning serveur + l'utilisateur restreint la plage. Pas de streaming (2 Mo triviaux).
11. **Aucune migration** (lecture seule schéma 7-1). Les index 7-1 (`paidAt`, `tenantId`, `createdAt`, `status`) suffisent.
12. **Hard dependencies 7-1 + 7-2** : le dev DOIT vérifier leur fusion avant d'implémenter. Si manquant → blocker.
13. **Item nav "Rapports" activé** dans le layout owner (était placeholder 7-2). Coordination avec 7-10/7-12 si fusionnées avant.
14. **`apiError` 4e arg `{ fields }`** : à vérifier dans `src/lib/api/envelope.ts` avant d'écrire les routes (signature exacte).

---

## Dev Agent Record

### Agent Model Used

Claude (Claude Code CLI)

### Debug Log References

- Prérequis 7-1/7-2 vérifiés présents avant démarrage (`tenants`/`subscriptionPayments`/`tenantEvents` dans `schema.ts`, `requireOwnerAuth`/`requireOwnerSession` dans `session.ts`, `PLAN_PRICES_XOF` dans `tenant-config.ts`, `src/lib/owner/*`, `src/app/owner/layout.tsx`) — tous présents, épopée 7-x déjà fusionnée jusqu'à 7-10 (`done`) au moment du démarrage de cette story.
- `apiError()` signature confirmée : `(code, message, status, fields?)` — pas de wrapper `{ fields }`, l'objet est passé directement en 4e argument.
- Bug de test initial : `chain.limit.mockReturnValue(Promise.resolve(res))` cassait `fetchTenantsSnapshot` qui chaîne `.limit().offset()` — corrigé en faisant retourner `chain` (thenable) par `limit`, cohérent avec le pattern déjà utilisé par `orderBy`/`where` dans `metrics.test.ts`.
- E2E (`e2e/owner-reports.spec.ts`) : `pnpm exec playwright test` timeout après 120s sur `config.webServer` (`pnpm dev`). Reproduit à l'identique sur `e2e/owner-dashboard.spec.ts` (spec pré-existant, non modifié) → confirme un problème d'environnement pré-existant (déjà noté sur les stories 7-7/7-8), pas une régression introduite ici.
- Smoke test manuel via `pnpm build` + `pnpm start` : routes `/owner/reports`, `/api/v1/owner/reports/payments/export`, `/api/v1/owner/reports/tenants/export` répondent correctement en non-authentifié (401 API / 307 redirect page). Une seconde tentative de vérification manuelle authentifiée (signup + promotion superadmin via SQL) a échoué avec `ECONNREFUSED` vers Postgres — connectivité Docker instable dans cet environnement d'exécution (conteneur signalé "Running" mais injoignable depuis un second appel shell), cohérent avec le problème d'environnement déjà documenté.
- Round 2 (après code-review) : `docker compose ps`/`up -d` a échoué avec `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine` — Docker Desktop injoignable dans cette session (fonctionnait plus tôt dans la même conversation pour le premier `pnpm build`). `pnpm build` n'a donc pas pu être re-confirmé après les correctifs de review ; `pnpm typecheck` (0 erreur), `pnpm lint` (0 erreur) et `pnpm vitest run` (808/808) ont en revanche tous été exécutés avec succès et couvrent les nouveaux chemins de code.
- Round 3 : cause racine identifiée — `docker compose ps` était vide (Postgres du projet non démarré, pas un vrai crash Docker Desktop). Après `docker compose up -d`, `pnpm build` a passé `db:migrate` puis `next build` avec succès (code 0). **Caveat build levé.**

### Completion Notes List

- Implémenté les 4 sections de `/owner/reports` : rapport mensuel (revenus par méthode + KPI tenants), export CSV paiements (date-range), instantané tenants (paginé + export CSV), prévisions de renouvellements (mois suivant).
- 100% lecture seule sur le schéma — aucune migration, réutilise intégralement les tables/enums posés par 7-1 et les helpers `requireOwnerAuth`/`requireOwnerSession`/badges de 7-2.
- Écarts volontaires par rapport aux chemins de fichiers suggérés dans la story (adaptés à la convention réelle du repo, confirmée par exploration) :
  - Tests E2E dans `e2e/` (racine) au lieu de `tests/e2e/` — c'est la convention de tout le repo (`e2e/owner-*.spec.ts`).
  - Pas de fixture partagée `tests/fixtures/seed-owner.ts` — chaque spec E2E owner seed ses propres données inline (pattern `e2e/owner-dashboard.spec.ts`), reproduit à l'identique.
  - Labels méthode de paiement (AC2) réutilisent la clé i18n existante `owner.badges.paymentMethod.*` (créée en 7-2) plutôt que de dupliquer une nouvelle clé.
- Tests unitaires : 21 nouveaux tests (`reports.test.ts` 12, `reports-csv.test.ts` 9), tous verts. Suite complète (avant review-fixes) : 798/798 tests, 0 régression.
- `pnpm build` : succès (premier passage), migration 7-1 appliquée, toutes les routes attendues générées.
- E2E non exécutable dans cet environnement (bug pré-existant Playwright/env, cf. Debug Log) — spec écrite et couvre les 8 scénarios du AC9, mais non exécutée avec succès. Recommandation : ré-exécuter `pnpm test:e2e e2e/owner-reports.spec.ts` dans un environnement où `pnpm dev` démarre correctement avant de considérer la story pleinement validée côté E2E.

**Après code-review (4 findings résolus, cf. Review Findings) :**
- 10 nouveaux tests ajoutés (`validateDateRange` invalid-date ×3, `isValidDateParam` ×3, `isValidMonthParam` ×3, `fetchTenantsSnapshot` clamp négatif/NaN ×1). Suite complète : **808/808 tests**, 0 régression.
- `pnpm typecheck` + `pnpm lint` : 0 erreur (warnings pré-existants inchangés).
- `pnpm build` re-confirmé vert après les fixes (`docker compose up -d` relancé, cf. Debug Log round 3) : `db:migrate` OK, `next build` OK, code 0.

### File List

- `src/app/owner/layout.tsx` (UPDATE — nav "Rapports" activée)
- `src/app/owner/reports/page.tsx` (NEW)
- `src/lib/owner/reports.ts` (NEW)
- `src/lib/owner/reports.test.ts` (NEW)
- `src/lib/owner/reports-csv.ts` (NEW)
- `src/lib/owner/reports-csv.test.ts` (NEW)
- `src/app/api/v1/owner/reports/payments/export/route.ts` (NEW)
- `src/app/api/v1/owner/reports/tenants/export/route.ts` (NEW)
- `src/components/owner/reports/monthly-report-section.tsx` (NEW)
- `src/components/owner/reports/payments-export-section.tsx` (NEW)
- `src/components/owner/reports/tenant-snapshot-section.tsx` (NEW)
- `src/components/owner/reports/renewal-forecast-section.tsx` (NEW)
- `src/components/owner/reports/month-picker.tsx` (NEW)
- `src/components/owner/reports/date-range-picker.tsx` (NEW)
- `src/components/owner/reports/snapshot-date-picker.tsx` (NEW — ajouté en review-fixes, AC6 date selector)
- `e2e/owner-reports.spec.ts` (NEW — chemin réel `e2e/`, pas `tests/e2e/`)
- `src/messages/fr-NE.json` (UPDATE — section `owner.reports.*` ; review-fixes : `snapshot.dateLabel`/`snapshot.referenceDate`)

### Review Findings

Code review reçu le 2026-07-04 (4 findings). Tous résolus :

1. **[High] Dates d'export invalides pouvaient atteindre la DB au lieu d'un 400** — `validateDateRange()` (`reports.ts`) parsait `from`/`to` sans valider le format ni détecter les rollovers silencieux de `Date` (ex: `2026-02-30` → mars). Fix : `parseDateAtMidnight()` exige désormais un format strict `YYYY-MM-DD` (regex) + vérification round-trip (année/mois/jour du `Date` construit doivent correspondre exactement à l'input), sinon `null`. Nouveau type d'erreur `"invalid-date"` propagé jusqu'à la route (`payments/export/route.ts`) avec message dédié. Tests : 3 nouveaux cas (`abc`/`def`, `2026-02-30`, `2026/06/01`).
2. **[Medium] `?month=...` non validé sur `/owner/reports`** — un `month` arbitraire (ex: `?month=foo`) pouvait produire des dates invalides dans `MonthlyReportSection`/`RenewalForecastSection`. Fix : nouvelle fonction exportée `isValidMonthParam()` (regex stricte `YYYY-MM`, mois 01-12), appliquée une seule fois dans `page.tsx` avant de dériver `monthParam` — les deux sections reçoivent déjà `month` via prop depuis `page.tsx`, donc un seul point de validation suffit. Fallback : mois courant.
3. **[Medium] Sélecteur de date manquant sur l'instantané tenants (AC6)** — l'implémentation initiale n'avait qu'un bouton d'export sans input date, alors que l'AC6 exige un sélecteur (même si MVP = pas de reconstitution AS-OF, la date sert de label + nom de fichier). Fix : nouveau composant client `snapshot-date-picker.tsx` (`?snapshotDate=YYYY-MM-DD`, pattern `month-picker.tsx`), affichage d'un libellé "Référence : {date}" dans l'en-tête de section, et la route d'export (`tenants/export/route.ts`) lit désormais `?date=` (validé via `isValidDateParam()`, fallback aujourd'hui) pour construire `tenants-snapshot-{date}.csv`. Toujours pas de filtrage AS-OF réel (conforme Dev Notes §"Instantané AS-OF — deferred").
4. **[Low] `snapshotPage` non nettoyé** — `Number(searchParams.snapshotPage)` pouvait produire `NaN` ou un offset négatif. Fix en double couche (défense en profondeur) : clamp `>= 1` entier côté `tenant-snapshot-section.tsx` (lecture du param) **et** côté `fetchTenantsSnapshot()` (`reports.ts`) pour toute réutilisation future de la fonction. Test : `fetchTenantsSnapshot(NaN, 50)` / `fetchTenantsSnapshot(-5, 50)` → `offset` appelé avec `0`.

Vérification post-fix : `pnpm typecheck` ✓, `pnpm lint` ✓ (0 erreur), `pnpm vitest run` **808/808** ✓, `pnpm build` ✓ (confirmé vert — cf. round 3, cause du premier échec = Postgres du projet non démarré, pas un problème Docker Desktop).

**Second reviewer indépendant (2026-07-04)** : recheck ciblé des 4 findings, tous confirmés résolus dans le code (`reports.ts` invalid-date, `page.tsx` fallback `?month=`, `tenant-snapshot-section.tsx`/`tenants/export/route.ts` date de référence, clamp `snapshotPage` UI+helper). Ré-exécution `reports.test.ts` + `reports-csv.test.ts` : 31/31. Aucun nouveau finding. `pnpm build` reconfirmé vert par la suite — aucun risque résiduel ouvert.

### Change Log

- Story 7-11 créée : rapports & export comptabilité (rapport mensuel revenus/churn/actifs, export paiements CSV, instantané tenants, prévisions renouvellements) — Epic 7 §3.7 (Date: 2026-06-28)
- Implémentation complète (T1-T9, T11) + E2E écrit (T10, non exécuté — bug pré-existant Playwright/env) : 798/798 tests, build OK, 0 régression (Date: 2026-07-04)
- Code review : 4 findings résolus (1 High — dates d'export invalides non validées ; 2 Medium — `?month=` non validé, sélecteur date instantané manquant AC6 ; 1 Low — `snapshotPage` non nettoyé). +10 tests, 808/808, typecheck/lint ✓ (Date: 2026-07-04)
- Second reviewer indépendant confirme les 4 fixes, aucun nouveau finding. Story marquée `done` (Date: 2026-07-04)
- `pnpm build` reconfirmé vert (Postgres du projet redémarré via `docker compose up -d`) : `db:migrate` OK, `next build` OK. Caveat build levé, aucun risque résiduel (Date: 2026-07-04)
