---
story_key: 7-2-owner-dashboard-tenant-list
epic_num: 7
story_num: 2
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
---

# Story 7.2 : Dashboard overview owner + liste des tenants

**Statut :** done

## Story

**En tant que** owner superadmin (Maiga Tech Lab),
**Je veux** un tableau de bord propriétaire sur `/owner` (compteurs globaux, revenus, alertes critiques, santé plateforme) et une liste paginée des tenants sur `/owner/tenants` avec filtres et export CSV,
**Afin que** je pilote l'ensemble de mon parc SaaS (actifs, trials, suspensions, paiements) depuis une vue centrale et que toute la gestion commerciale/abonnement soit isolée des tenants clients.

---

## Critères d'acceptation (BDD)

**AC1 — Extension du rôle `superadmin` (deferred depuis story 7-1)**

```
GIVEN  le schéma src/lib/schema.ts et src/lib/permissions.ts
WHEN   le dev étend `userRoleEnum` pour ajouter "superadmin"
THEN   la migration ALTER TYPE est générée (drizzle/0014_*.sql ou numérotation suivante, voir Dev Notes pour éviter collision avec 7-1)
AND    `src/lib/permissions.ts` type `Role` inclut "superadmin"
AND    la `PERMISSION_MATRIX` contient une ligne `superadmin` (permissions de type "owner panel" — action interne, pas de quote/client CRUD) :
       - `owner.access: true` (NOUVELLE action)
       - `tenant.read: true`, `tenant.read-all: true` (NOUVELLES actions)
       - toutes les actions quote/client/clause/template = `false` (le superadmin n'est PAS un utilisateur client ; il n'a ni companyId ni tenant client)
AND    l'index Better Auth / la lecture `session.user.role` continue de fonctionner
       (pattern de cast existant : `(session.user as Record<string, unknown>).role`)
```

**AC2 — Protection des routes `/owner/*` (proxy + Server Components)**

```
GIVEN  une requête vers /owner ou /owner/*
WHEN   l'utilisateur n'est PAS authentifié
THEN   redirection vers "/" (login) — via le proxy.ts (matcher étendu)
       ET fallback `requireOwnerAuth()` en Server Component (jamais seulement le proxy)

GIVEN  un utilisateur authentifié avec role !== "superadmin"
WHEN   il tente d'accéder à /owner/*
THEN   redirection vers "/" (dashboard client) ou page 403
       (assumption retenue : redirect vers "/" avec toast, pas de page 403 dédiée en MVP)
AND    les API routes /api/v1/owner/* retournent 403 via `requireOwnerSession()` (ac helper nouveau)
       pour un user non-superadmin

GIVEN  un utilisateur authentifié avec role === "superadmin"
WHEN   il accède à /owner
THEN   la résolution tenant du proxy (story 7-1) est court-circuitée
       (le superadmin n'appartient à aucun tenant ; il opère sur l'apex quotation.com)
AND    aucune lecture de header `x-tenant-id` n'a lieu sur ces routes
```

**AC3 — Dashboard overview `/owner` — compteurs globaux**

```
GIVEN  le superadmin sur /owner
WHEN   la page se charge (Server Component, query DB directe Drizzle)
THEN   4 compteurs globaux s'affichent :
       - Tenants actifs (status = 'active')
       - En trial (status = 'trial')
       - Suspendus (status = 'suspended')
       - Annulés (status = 'cancelled')
AND    chaque compteur est un COUNT(*) SQL agrégé (pas de fetch de toutes les rows)
AND    les chiffres utilisent `font-serif` + `tabular-nums` (charte DESIGN.md §Typography)
AND    un état loading (skeleton `animate-pulse`) s'affiche pendant le rendu initial
AND    les textes UI viennent de fr-NE.json section `owner.dashboard`
```

**AC4 — Dashboard overview `/owner` — revenus (MRR / ARR / collecté ce mois)**

```
GIVEN  le dashboard owner
WHEN   les compteurs revenus sont calculés
THEN   3 métriques s'affichent :
       - MRR (Monthly Recurring Revenue) = SUM(amount) des subscription_payments
         où billingCycle = 'monthly' AND paidAt dans le mois courant
         + équivalent mensuel des paiements annuels (amount / 12 si billingCycle = 'annual'
         AND paidAt dans les 12 derniers mois)
         (assumption : MRR = somme mensualisée des abonnements actifs payés — voir Dev Notes pour formule exacte)
       - ARR = MRR * 12
       - Total encaissé ce mois = SUM(amount) des subscription_payments
         où paidAt dans le mois courant (toutes méthodes confondues)
AND    les montants sont formatés via `formatFcfa()` (src/lib/money.ts)
AND    les valeurs sont calculées côté serveur (SQL agrégat SUM, pas de fetch de toutes les rows)
```

**AC5 — Dashboard overview `/owner` — alertes critiques**

```
GIVEN  le dashboard owner
WHEN   la section "Alertes critiques" s'affiche
THEN   3 catégories d'alertes sont listées (chacune = liste de tenants, max 10 par catégorie) :

       1. Expire dans ≤ 7 jours :
          SELECT * FROM tenants WHERE status IN ('active','trial')
            AND subscriptionEnd IS NOT NULL
            AND subscriptionEnd BETWEEN now() AND now() + interval '7 days'
          → badge rouge "J-X" à côté du nom

       2. En période de grâce :
          WHERE gracePeriodEndsAt IS NOT NULL AND gracePeriodEndsAt > now()
            AND subscriptionEnd < now()
          → badge orange

       3. Retard de paiement > 30 jours :
          WHERE status IN ('active','trial') AND subscriptionEnd < now() - interval '30 days'
            AND gracePeriodEndsAt IS NULL   (pas déjà compté en grâce)
          → badge rouge "Retard"

AND    chaque ligne d'alerte est cliquable → lien vers /owner/tenants/[id] (story 7-7) ;
       EN ATTENDANT 7-7, lien vers /owner/tenants?focus=[id] (filtre sur le tenant) ou la liste
AND    un compteur global "X alertes" s'affiche en en-tête de section
AND    si aucune alerte → message "Aucune alerte critique" (fr-NE.json)
```

**AC6 — Dashboard overview `/owner` — activité récente + carte de santé**

```
GIVEN  le dashboard owner
WHEN   les sections complémentaires s'affichent
THEN   - "Activité récente" : 10 derniers tenant_events (ORDER BY createdAt DESC)
         affichés sous forme de timeline simple (type event, nom tenant, date relative "il y a 2h")
       - "Carte de santé" : ratio tenants actifs / total (ex: "8 / 10 actifs")
         + indicateur visuel (barre de progression ou % vert/rouge)
AND    les dates relatives sont formatées via Intl.RelativeTimeFormat("fr-FR")
       ou une helper `formatRelativeDate()` (à créer dans src/lib/owner/format.ts)
```

**AC7 — Liste des tenants `/owner/tenants` — tableau paginé**

```
GIVEN  le superadmin sur /owner/tenants
WHEN   la page se charge (Server Component, searchParams paginés)
THEN   un tableau s'affiche avec les colonnes :
       1. Nom / Slug (name + slug en sous-titre gris)
       2. Plan (badge : Free / Pro / Enterprise — variantes de couleur)
       3. Statut (badge : Actif / Trial / Suspendu / Annulé — variantes de couleur)
       4. Expiration + jours restants (date + indicateur "J-X" ou "Expiré")
       5. Dernier paiement (montant formaté FCFA + méthode badge + date)
       6. Utilisateurs actifs / max (ex: "3 / 5")
       7. Actions rapides (menu déroulant : Voir · Suspendre · Réactiver · Enregistrer paiement)
AND    pagination server-side : 25 tenants par page (default), via ?page=N
AND    les "Voir/Suspendre/Réactiver/Enregistrer paiement" sont des liens/buttons :
       - "Voir" → /owner/tenants/[id] (story 7-7 — si pas implémenté, lien désactivé + tooltip "Bientôt disponible")
       - "Suspendre" → POST /api/v1/owner/tenants/[id]/suspend (story 7-5 — désactivé si 7-5 pas fait)
       - "Réactiver" → POST /api/v1/owner/tenants/[id]/reactivate (story 7-8 — désactivé)
       - "Enregistrer paiement" → /owner/tenants/[id]?action=payment (story 7-4 — désactivé)
       IMPORTANT: ces actions sont des PLACEHOLDERS dans cette story (icône + tooltip "bientôt"),
       SEUL "Voir" est actif ET pointe vers la liste filtrée tant que 7-7 n'existe pas.
       Le dev NE DOIT PAS implémenter la logique de suspend/reactivate/payment (stories suivantes).
AND    tri par défaut : createdAt DESC (plus récents en premier)
AND    le tableau suit le pattern natif HTML <table> du repo
       (cf. src/app/(app)/parametres/utilisateurs/components/user-role-selector.tsx — UserManagementTable)
       — NE PAS introduire @tanstack/react-table (voir Dev Notes)
```

**AC8 — Liste des tenants — filtres URL**

```
GIVEN  la barre de filtres au-dessus du tableau
WHEN   le superadmin applique un filtre
THEN   les filtres sont encodés dans l'URL (searchParams) pour partage/bookmark :
       - ?status=active|trial|suspended|cancelled (single-select)
       - ?plan=free|pro|enterprise (single-select)
       - ?expiry=expiring-7d|in-grace|overdue-30d (preset, single-select)
       - ?paymentMethod=nitta|wave|amana|stripe|cash|virement (single-select)
       - ?createdAfter=YYYY-MM-DD & ?createdBefore=YYYY-MM-DD (plage date création)
       - ?page=N (pagination)
       - ?q=texte (recherche libre sur name/slug, optionnel — MVP: peut être omis si trop complexe)
AND    un bouton "Réinitialiser les filtres" remet les valeurs par défaut
AND    les filtres sont appliqués côté SERVEUR (Drizzle WHERE clauses), pas côté client
AND    les selects utilisent le composant shadcn <Select> existant (src/components/ui/select.tsx)
AND    les changements de filtre mettent à jour l'URL (router.push) puis la page re-render server-side
```

**AC9 — Liste des tenants — export CSV**

```
GIVEN  le bouton "Exporter CSV" sur /owner/tenants
WHEN   le superadmin clique
THEN   le navigateur télécharge un fichier CSV nommé `tenants-YYYY-MM-DD.csv`
AND    HTTP 200, Content-Type: text/csv; charset=utf-8
AND    Content-Disposition: attachment; filename="tenants-YYYY-MM-DD.csv"
AND    le CSV commence par le BOM UTF-8 ("﻿") — compatibilité Excel (Niger/AES)
       (OBLIGATOIRE cf. project-context.md §CSV/Exports + story 6-3)
AND    en-têtes : name,slug,plan,status,subscriptionEnd,daysRemaining,
       lastPaymentAmount,lastPaymentMethod,lastPaymentDate,activeUsers,maxUsers,createdAt
AND    l'export reflète les filtres actifs (mêmes WHERE clauses que le tableau)
       MAIS n'est PAS paginé (exporte tous les tenants correspondants, max 10 000)
AND    l'export passe par une route dédiée GET /api/v1/owner/tenants/export
       (séparée du rendu tableau pour éviter de mélanger HTML et CSV dans la même route)
AND    les montants sont en FCFA entiers (jamais float, jamais décimale)
```

**AC10 — Layout & navigation owner**

```
GIVEN  les routes /owner/*
WHEN   le superadmin navigue
THEN   un layout dédié src/app/owner/layout.tsx s'applique :
       - header navy avec logo Maiga Tech Lab + nom "Owner Console"
       - nav horizontale : Dashboard (/owner) | Tenants (/owner/tenants)
         (les autres sections 7-3..7-12 sont des items désactivés/tooltip "Bientôt")
       - bouton "Retour à l'app" (lien vers "/") ET bouton "Déconnexion" (signOut Better Auth)
AND    le layout NE charge PAS le shell client (src/app/(app)/layout.tsx)
       — l'owner console est une app autonome, sans BottomNav, sans OfflineBanner, sans encryption CryptoContext
       (pas de données Dexie côté owner ; tout est server-side Drizzle)
AND    le layout appelle requireOwnerAuth() (redirect si non-superadmin)
```

**AC11 — Qualité & tests**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression (334+ tests)
AND    pnpm build passe sans erreur
AND    tests unitaires (Vitest) couvrent :
       - computeOwnerMetrics() : compteurs statuts (mock db) ✓
       - computeMrr() : mensualisation annuels ✓
       - buildTenantFilters() : parsing searchParams → Drizzle where ✓
       - buildTenantsCsv() : headers, BOM, escaping, montant entier ✓
       - requireOwnerSession() : superadmin ✓, non-superadmin → throw/redirect ✓
AND    tests E2E (Playwright) couvrent :
       - superadmin accède à /owner (dashboard affiché) ✓
       - non-superadmin (admin client) redirigé depuis /owner ✓
       - non-authentifié redirigé depuis /owner ✓
       - /owner/tenants affiche le tableau + pagination ✓
       - filtres URL modifient les rows affichées ✓
       - export CSV télécharge un fichier (vérifier Content-Type + BOM) ✓
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/schema.ts` — UPDATE : étendre `userRoleEnum` pour ajouter `"superadmin"` (migration ALTER TYPE)
- `drizzle/` — UPDATE/NEW : générer + committer la migration ALTER TYPE (numéro suivant après 7-1)
- `src/lib/permissions.ts` — UPDATE : type `Role` += `"superadmin"` ; `Action` += `"owner.access"`, `"tenant.read"`, `"tenant.read-all"` ; `PERMISSION_MATRIX` += ligne `superadmin`
- `src/lib/session.ts` — UPDATE : ajouter `requireOwnerSession()` / `requireOwnerAuth()` (Server Component + API)
- `src/proxy.ts` — UPDATE : étendre le matcher pour `/owner/*` + logique redirect si pas de cookie session ; NE PAS appliquer la résolution tenant (court-circuit /owner)
- `src/app/owner/layout.tsx` — CRÉER : layout Server Component (header + nav + auth gate)
- `src/app/owner/page.tsx` — CRÉER : dashboard overview (Server Component, query Drizzle)
- `src/app/owner/tenants/page.tsx` — CRÉER : liste paginée (Server Component, searchParams Promise)
- `src/components/owner/owner-dashboard.tsx` — CRÉER : client wrapper si nécessaire (skeleton/refresh) OU rester full server si possible
- `src/components/owner/owner-metrics-cards.tsx` — CRÉER : cartes compteurs (4 statuts + 3 revenus)
- `src/components/owner/owner-alerts.tsx` — CRÉER : section alertes critiques
- `src/components/owner/owner-recent-activity.tsx` — CRÉER : timeline 10 derniers events
- `src/components/owner/owner-health-card.tsx` — CRÉER : carte de santé (ratio actifs/total)
- `src/components/owner/tenants-table.tsx` — CRÉER : tableau natif HTML + colonnes + actions
- `src/components/owner/tenants-filters.tsx` — CRÉER : client component (Select + date inputs + reset)
- `src/components/owner/tenant-status-badge.tsx` — CRÉER : badge variantes par statut
- `src/components/owner/tenant-plan-badge.tsx` — CRÉER : badge variantes par plan
- `src/lib/owner/metrics.ts` — CRÉER : `computeOwnerMetrics(db)`, `computeMrr(db)`, `getCriticalAlerts(db)`
- `src/lib/owner/tenant-filters.ts` — CRÉER : `buildTenantFilters(searchParams)` → Drizzle `where` ; `paginate()`
- `src/lib/owner/format.ts` — CRÉER : `formatRelativeDate(date)`, `formatDaysRemaining(end)`
- `src/lib/owner/csv.ts` — CRÉER : `buildTenantsCsv(rows)` (headers + BOM + escape)
- `src/app/api/v1/owner/tenants/route.ts` — CRÉER : GET liste paginée JSON (consommé par refresh client optionnel ; le rendu initial est server-side direct)
- `src/app/api/v1/owner/tenants/export/route.ts` — CRÉER : GET export CSV (superadmin only)
- `src/lib/owner/metrics.test.ts` — CRÉER : tests Vitest computeOwnerMetrics + computeMrr
- `src/lib/owner/tenant-filters.test.ts` — CRÉER : tests Vitest buildTenantFilters
- `src/lib/owner/csv.test.ts` — CRÉER : tests Vitest buildTenantsCsv (BOM, headers, escape)
- `src/lib/session.test.ts` — CRÉER/UPDATE : test requireOwnerSession (mock auth)
- `tests/e2e/owner-dashboard.spec.ts` — CRÉER : E2E Playwright (auth gate + dashboard + liste + export)
- `src/messages/fr-NE.json` — UPDATE : ajouter section `owner` (dashboard + tenants + badges + filtres)

**EXCLU (ne pas modifier — hors périmètre) :**
- Le seam `companyId` existant (clients/devis/clauses) — inchangé (voir Dev Notes : mapping tenant↔company DEFERRED)
- `src/lib/tenants/*` (resolve-tenant, tenant-enforcement, tenant-config) — créé en story 7-1, UTILISÉ en lecture seule ici
- Création/édition de tenant — story 7-3
- Suspension manuelle / page expiration — story 7-5 (les boutons "Suspendre/Réactiver" sont des PLACEHOLDERS désactivés ici)
- Enregistrement de paiement — story 7-4 (placeholder désactivé)
- Cron expiration / rappels — story 7-6
- Fiche tenant détaillée (onglets) — story 7-7 ("Voir" pointe vers la liste filtrée en attendant)
- Gestion utilisateurs par tenant — story 7-9
- Stripe / rapports / paramètres plateforme — stories 7-10/7-11/7-12

---

## Tâches / Sous-tâches

### T1 — Étendre `userRoleEnum` (schema + migration)

- [x] Dans `src/lib/schema.ts`, modifier :
  ```ts
  export const userRoleEnum = pgEnum("user_role", [
    "admin",
    "commercial",
    "operateur",
    "superadmin", // AJOUT
  ]);
  ```
- [x] `pnpm db:generate` — vérifier que le fichier SQL contient `ALTER TYPE user_role ADD VALUE 'superadmin';`
  - **ATTENTION collision 7-1** : si la story 7-1 a déjà généré `drizzle/0014_*.sql`, cette story crée `0015_*.sql`. Si 7-1 n'est pas encore commitée (status ready-for-dev), COORDONNER avec 7-1 pour que les deux migrations ALTER n'entrent pas en conflit (voir Dev Notes §"Collision migration 7-1").
- [x] `pnpm db:migrate` — appliquer
- [x] Vérifier qu'un user existant avec `role='admin'` reste valide (pas de perte de données)
- [x] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `src/lib/permissions.ts`

- [x] Étendre le type `Role` :
  ```ts
  export type Role = "admin" | "commercial" | "operateur" | "superadmin";
  ```
- [x] Étendre le type `Action` (ajouter à la fin) :
  ```ts
  | "owner.access"
  | "tenant.read"
  | "tenant.read-all"
  ```
- [x] Ajouter la ligne `superadmin` dans `PERMISSION_MATRIX` :
  ```ts
  superadmin: {
    "owner.access": true,
    "tenant.read": true,
    "tenant.read-all": true,
    // Le superadmin n'est PAS un user client — toutes les actions métier = false
    "quote.create": false,
    "quote.read": false,
    "quote.update": false,
    "quote.delete": false,
    "quote.change-status": false,
    "quote.duplicate": false,
    "client.create": false,
    "client.read": false,
    "client.update": false,
    "client.delete": false,
    "company.read": false,
    "company.update": false,
    "clause.create": false,
    "clause.read": false,
    "clause.update": false,
    "clause.delete": false,
    "template.create": false,
    "template.read": false,
    "template.update": false,
    "template.delete": false,
    "route-template.create": false,
    "route-template.read": false,
    "route-template.update": false,
    "route-template.delete": false,
    "user.read": false,
    "user.manage": false,
    "sync.push": false,
    "sync.pull": false,
  },
  ```
  Note : `superadmin` accède au panel owner uniquement. Il ne manipule PAS de devis clients.
- [x] `pnpm typecheck` — zéro erreur

### T3 — Ajouter `requireOwnerSession()` dans `src/lib/session.ts`

- [x] Ajouter les helpers :
  ```ts
  /**
   * Requires an authenticated superadmin session.
   * Used in /owner/* Server Components. Redirects to "/" if not superadmin.
   */
  export async function requireOwnerAuth() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) redirect("/");
    const role = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
    if (role !== "superadmin") redirect("/");
    return session;
  }

  /**
   * Requires an authenticated superadmin session for API routes.
   * Returns the session or throws a 403-shaped error (caller wraps in apiError).
   */
  export async function requireOwnerSession() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return { ok: false as const, status: 401, code: "UNAUTHORIZED" as const };
    }
    const role = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
    if (role !== "superadmin") {
      return { ok: false as const, status: 403, code: "FORBIDDEN" as const };
    }
    return { ok: true as const, session };
  }
  ```
- [x] Préserver `requireAuth()`, `getOptionalSession()`, `getSessionWithRole()` existants — ne pas casser les pages (app) existantes.
- [x] `pnpm typecheck` — zéro erreur

### T4 — UPDATE `src/proxy.ts` : protéger `/owner/*`

- [x] Étendre le `config.matcher` pour inclure `/owner` :
  ```ts
  export const config = {
    matcher: [
      "/dashboard",
      "/chat",
      "/profile",
      "/owner",
      "/owner/:path*",
    ],
  };
  ```
  **ATTENTION** : story 7-1 a aussi son propre matcher (résolution tenant). Si 7-1 est déjà fusionnée, MERGER les deux matchers en un seul (cf. Dev Notes §"Coordination proxy 7-1"). En attendant, ce matcher minimal protège /owner côté cookie.
- [x] Dans le corps de `proxy()`, ajouter en tête :
  ```ts
  // Routes /owner/* : protégées par cookie session (optimistic) ; pas de résolution tenant
  const isOwnerRoute = request.nextUrl.pathname === "/owner"
    || request.nextUrl.pathname.startsWith("/owner/");
  if (isOwnerRoute) {
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next(); // la validation role='superadmin' se fait en Server Component
  }
  ```
- [x] **NE PAS** appliquer `resolveTenantByHost()` sur /owner/* (court-circuit AC9 story 7-1).
- [x] Si 7-1 est fusionnée, s'assurer que la logique tenant du proxy skip /owner (matcher négatif OU garde `isOwnerRoute` en premier).
- [x] `pnpm typecheck` — zéro erreur

### T5 — Créer `src/lib/owner/metrics.ts` (query helpers, server-side)

- [x] Imports :
  ```ts
  import { count, sum, sql, and, eq, gte, lte, between, isNotNull, isNull } from "drizzle-orm";
  import { db } from "@/lib/db";
  import { tenants, subscriptionPayments, tenantEvents } from "@/lib/schema";
  ```
- [x] `computeOwnerMetrics()` — compteurs globaux (4 statuts) :
  ```ts
  export async function computeOwnerMetrics() {
    const [active] = await db.select({ n: count() }).from(tenants).where(eq(tenants.status, "active"));
    const [trial] = await db.select({ n: count() }).from(tenants).where(eq(tenants.status, "trial"));
    const [suspended] = await db.select({ n: count() }).from(tenants).where(eq(tenants.status, "suspended"));
    const [cancelled] = await db.select({ n: count() }).from(tenants).where(eq(tenants.status, "cancelled"));
    return {
      active: active?.n ?? 0,
      trial: trial?.n ?? 0,
      suspended: suspended?.n ?? 0,
      cancelled: cancelled?.n ?? 0,
      total: (active?.n ?? 0) + (trial?.n ?? 0) + (suspended?.n ?? 0) + (cancelled?.n ?? 0),
    };
  }
  ```
  Alternative optimisée : un seul GROUP BY :
  ```ts
  const rows = await db.select({ status: tenants.status, n: count() })
    .from(tenants).groupBy(tenants.status);
  ```
  Préférer le GROUP BY (1 requête au lieu de 4).
- [x] `computeMrr()` — MRR/ARR/collecté mois (voir Dev Notes pour la formule exacte) :
  ```ts
  export async function computeRevenue() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const twelveMonthsAgo = new Date(now); twelveMonthsAgo.setFullYear(now.getFullYear() - 1);

    // MRR = mensualisés : paiements mensuels du mois courant + (annuels actifs / 12)
    // Assumption MVP : MRR = SUM(monthly payments du mois courant) + SUM(annual payments des 12 derniers mois)/12
    const monthlyRows = await db.select({ total: sum(subscriptionPayments.amount) })
      .from(subscriptionPayments)
      .where(and(
        eq(subscriptionPayments.billingCycle, "monthly"),
        gte(subscriptionPayments.paidAt, startOfMonth),
      ));
    const annualRows = await db.select({ total: sum(subscriptionPayments.amount) })
      .from(subscriptionPayments)
      .where(and(
        eq(subscriptionPayments.billingCycle, "annual"),
        gte(subscriptionPayments.paidAt, twelveMonthsAgo),
      ));
    const monthlyThisMonth = Number(monthlyRows[0]?.total ?? 0);
    const annual12m = Number(annualRows[0]?.total ?? 0);
    const mrr = monthlyThisMonth + Math.round(annual12m / 12);
    const arr = mrr * 12;

    // Total encaissé ce mois (tous cycles confondus)
    const collectedRows = await db.select({ total: sum(subscriptionPayments.amount) })
      .from(subscriptionPayments)
      .where(gte(subscriptionPayments.paidAt, startOfMonth));
    const collectedThisMonth = Number(collectedRows[0]?.total ?? 0);

    return { mrr, arr, collectedThisMonth };
  }
  ```
  **Note `sum()` Drizzle** : retourne `string | null` (sql numeric). TOUJOURS wrapper avec `Number(...)` et `?? 0`.
- [x] `getCriticalAlerts()` — 3 catégories (limiter à 10 chacune) :
  ```ts
  export async function getCriticalAlerts() {
    const now = new Date();
    const in7d = new Date(now); in7d.setDate(now.getDate() + 7);
    const overdue30 = new Date(now); overdue30.setDate(now.getDate() - 30);

    const expiringSoon = await db.select().from(tenants)
      .where(and(
        sql`${tenants.status} IN ('active','trial')`,
        isNotNull(tenants.subscriptionEnd),
        between(tenants.subscriptionEnd, now, in7d),
      )).limit(10);

    const inGrace = await db.select().from(tenants)
      .where(and(
        isNotNull(tenants.gracePeriodEndsAt),
        gte(tenants.gracePeriodEndsAt, now),
        lt(tenants.subscriptionEnd, now), // subscriptionEnd nullable — Drizzle gère NULL avec lt ? NON, vérifier
      )).limit(10);

    const overdue = await db.select().from(tenants)
      .where(and(
        sql`${tenants.status} IN ('active','trial')`,
        lt(tenants.subscriptionEnd, overdue30),
        isNull(tenants.gracePeriodEndsAt),
      )).limit(10);

    return { expiringSoon, inGrace, overdue };
  }
  ```
  **CRITIQUE `subscriptionEnd` nullable** : `lt(tenants.subscriptionEnd, ...)` où colonne nullable peut lever une erreur de typage Drizzle. Toujours combiner avec `isNotNull(tenants.subscriptionEnd)` dans le `and()` (voir Dev Notes §"Colonnes nullables + Drizzle operators").
- [x] `getRecentActivity(limit = 10)` — derniers tenant_events + JOIN tenants pour le nom :
  ```ts
  export async function getRecentActivity(limit = 10) {
    return await db.select({
      eventType: tenantEvents.eventType,
      note: tenantEvents.note,
      createdAt: tenantEvents.createdAt,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
    })
      .from(tenantEvents)
      .leftJoin(tenants, eq(tenantEvents.tenantId, tenants.id))
      .orderBy(sql`${tenantEvents.createdAt} DESC`)
      .limit(limit);
  }
  ```
- [x] `getHealthRatio()` — ratio actifs/total (réutiliser computeOwnerMetrics) :
  ```ts
  export async function getHealthRatio() {
    const m = await computeOwnerMetrics();
    return { active: m.active, total: m.total, pct: m.total === 0 ? 0 : Math.round((m.active / m.total) * 100) };
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T6 — Créer `src/lib/owner/tenant-filters.ts`

- [x] Type des filtres :
  ```ts
  export interface TenantFilters {
    status?: "active" | "trial" | "suspended" | "cancelled";
    plan?: "free" | "pro" | "enterprise";
    expiry?: "expiring-7d" | "in-grace" | "overdue-30d";
    paymentMethod?: "nitta" | "wave" | "amana" | "stripe" | "cash" | "virement";
    createdAfter?: string; // ISO date
    createdBefore?: string;
    q?: string;
    page: number;
  }
  export const TENANTS_PAGE_SIZE = 25;
  ```
- [x] `parseTenantFilters(searchParams: Record<string, string | string[] | undefined>)` :
  - Parse chaque clé, valide les valeurs (Zod schema inline OU garde manuel — préférer Zod cohérent avec repo `src/lib/validation/`)
  - Retourne `TenantFilters` avec `page = Number(page) || 1` (min 1)
- [x] `buildTenantWhere(filters)` — retourne un `SQL[]` (array de conditions Drizzle à spread dans `and()`) :
  - status → `eq(tenants.status, status)`
  - plan → `eq(tenants.plan, plan)`
  - expiry → voir `getCriticalAlerts` pour les 3 conditions (réutiliser le pattern)
  - paymentMethod → sous-requête EXISTS sur subscription_payments (dernier paiement avec cette méthode) — MVP simplifié : JOIN LATERAL ou EXISTS (voir Dev Notes)
  - createdAfter/Before → `gte(tenants.createdAt, ...)` / `lte(...)`
  - q → `ilike(tenants.name, '%q%') OR ilike(tenants.slug, '%q%')`
- [x] `fetchTenantsPage(filters)` — query paginée avec LEFT JOIN LATERAL dernier paiement + COUNT users actifs :
  ```ts
  // Pour la colonne "dernier paiement" + "users actifs/max", il faut :
  // - LEFT JOIN LATERAL (SELECT * FROM subscription_payments WHERE tenant_id = t.id ORDER BY paid_at DESC LIMIT 1)
  // - subquery COUNT(user) WHERE tenant_id = t.id
  // Voir Dev Notes §"JOIN LATERAL dernier paiement" pour le pattern SQL exact
  ```
  Retourne `{ rows: TenantRow[]; totalPages: number; total: number }`.
- [x] `pnpm typecheck` — zéro erreur

### T7 — Créer `src/lib/owner/format.ts`

- [x] `formatRelativeDate(date: Date): string` — "il y a 2h", "il y a 3j", "dans 5j" :
  ```ts
  export function formatRelativeDate(date: Date): string {
    const rtf = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
    const diffMs = date.getTime() - Date.now();
    const diffMin = Math.round(diffMs / 60000);
    if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
    const diffH = Math.round(diffMin / 60);
    if (Math.abs(diffH) < 24) return rtf.format(diffH, "hour");
    const diffD = Math.round(diffH / 24);
    return rtf.format(diffD, "day");
  }
  ```
- [x] `formatDaysRemaining(end: Date | null): { label: string; tone: "ok" | "warn" | "danger" | "expired" }` :
  - > 14j → `{ tone: "ok" }` (pas de label ou "+Nd")
  - 7-14j → `warn`
  - 0-7j → `danger` "J-N"
  - < 0 → `expired` "Expiré"
- [x] `formatDateFr(date: Date | null): string` — "12/06/2026" via `Intl.DateTimeFormat("fr-FR")` (cohérent avec `recent-quotes-list.tsx`).
- [x] `pnpm typecheck` — zéro erreur

### T8 — Créer `src/lib/owner/csv.ts`

- [x] `buildTenantsCsv(rows: TenantRow[]): string` — pattern identique à `audit/export` story 6-3 :
  ```ts
  const HEADERS = [
    "name","slug","plan","status","subscriptionEnd","daysRemaining",
    "lastPaymentAmount","lastPaymentMethod","lastPaymentDate",
    "activeUsers","maxUsers","createdAt",
  ];
  const lines = rows.map(r => [
    r.name, r.slug, r.plan, r.status,
    r.subscriptionEnd ? formatDateFr(r.subscriptionEnd) : "",
    r.daysRemaining?.toString() ?? "",
    r.lastPaymentAmount?.toString() ?? "", // entier FCFA, jamais float
    r.lastPaymentMethod ?? "",
    r.lastPaymentDate ? formatDateFr(r.lastPaymentDate) : "",
    `${r.activeUsers}/${r.maxUsers}`,
    r.createdAt ? formatDateFr(r.createdAt) : "",
  ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  // BOM UTF-8 obligatoire pour Excel
  return "﻿" + [HEADERS.join(","), ...lines].join("\r\n");
  ```
- [x] Réutiliser le pattern de `src/app/api/v1/audit/export/route.ts` (BOM + escaping) — NE PAS réinventer.
- [x] `pnpm typecheck` — zéro erreur

### T9 — Créer `src/app/owner/layout.tsx`

- [x] Server Component, première ligne `import { requireOwnerAuth } from "@/lib/session";` (pas de "use client" sur le layout lui-même).
- [x] Appeler `await requireOwnerAuth()` en tête du composant (redirect si non-superadmin).
- [x] Header navy + nav horizontale (Dashboard | Tenants actifs ; autres items désactivés) :
  ```tsx
  import { requireOwnerAuth } from "@/lib/session";
  import Link from "next/link";
  import { getTranslations } from "next-intl";

  export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
    const session = await requireOwnerAuth();
    const t = await getTranslations("owner.layout");
    return (
      <div className="min-h-screen bg-app-bg">
        <header className="bg-brand-navy text-text-on-dark">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              {/* logo SVG mark-light */}
              <span className="font-serif text-lg font-semibold">Owner Console</span>
            </div>
            <nav className="flex gap-1">
              <Link href="/owner" className="rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/10">
                {t("dashboard")}
              </Link>
              <Link href="/owner/tenants" className="rounded-xl px-3 py-2 text-xs font-semibold hover:bg-white/10">
                {t("tenants")}
              </Link>
              {/* items désactivés : Payments, Reports, Settings — tooltip "Bientôt" */}
            </nav>
            <div className="flex gap-2">
              <Link href="/" className="rounded-xl border border-white/20 px-3 py-2 text-xs">{t("backToApp")}</Link>
              {/* logout button — forme server action signOut OU lien vers /api/auth/signout */}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    );
  }
  ```
- [x] **Logout** : utiliser le pattern existant (commit `a637dfe` "add logout button to parametres") — vérifier `src/app/(app)/parametres/page.tsx` pour le pattern exact (server action ou fetch `/api/auth/signout`). Réutiliser tel quel.
- [x] **NE PAS** importer le layout `(app)` — owner est autonome.
- [x] `pnpm typecheck` — zéro erreur

### T10 — Créer `src/app/owner/page.tsx` (dashboard overview)

- [x] Server Component :
  ```tsx
  import { getTranslations } from "next-intl";
  import { computeOwnerMetrics, computeRevenue, getCriticalAlerts, getRecentActivity, getHealthRatio } from "@/lib/owner/metrics";
  import { OwnerMetricsCards } from "@/components/owner/owner-metrics-cards";
  import { OwnerAlerts } from "@/components/owner/owner-alerts";
  import { OwnerRecentActivity } from "@/components/owner/owner-recent-activity";
  import { OwnerHealthCard } from "@/components/owner/owner-health-card";

  export default async function OwnerDashboardPage() {
    const [metrics, revenue, alerts, activity, health] = await Promise.all([
      computeOwnerMetrics(),
      computeRevenue(),
      getCriticalAlerts(),
      getRecentActivity(10),
      getHealthRatio(),
    ]);
    const t = await getTranslations("owner.dashboard");
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t("eyebrow")}</p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">{t("title")}</h1>
        </div>
        <OwnerMetricsCards metrics={metrics} revenue={revenue} />
        <OwnerAlerts alerts={alerts} />
        <div className="grid gap-6 md:grid-cols-2">
          <OwnerRecentActivity events={activity} />
          <OwnerHealthCard health={health} />
        </div>
      </div>
    );
  }
  ```
- [x] Utiliser `Promise.all` pour paralléliser les queries (perf).
- [x] `pnpm typecheck` — zéro erreur

### T11 — Créer les composants dashboard (T11a–T11d)

- [x] **T11a `src/components/owner/owner-metrics-cards.tsx`** — 4 cartes statuts + 3 cartes revenus :
  - Card base : `rounded-lg border border-border bg-surface p-5` (cf. shadcn card + DESIGN.md tokens)
  - Chaque statut : pastille colorée + label + chiffre `font-serif tabular-nums text-2xl`
  - Revenus : 3 cartes "MRR / ARR / Encaissé ce mois" avec `formatFcfa()`
  - Composant PUR de présentation (pas de fetch) — reçoit `metrics` + `revenue` en props.
- [x] **T11b `src/components/owner/owner-alerts.tsx`** — 3 sous-sections (expiringSoon / inGrace / overdue) :
  - Chaque alerte = ligne (nom tenant + slug + badge J-X)
  - Lien vers `/owner/tenants?focus=<id>` (en attendant 7-7) OU `/owner/tenants?status=...` (filtre pertinent)
  - Si vide : message "Aucune alerte critique"
- [x] **T11c `src/components/owner/owner-recent-activity.tsx`** — timeline simple :
  - Chaque event : icône (Lucide selon eventType) + texte + tenant + `formatRelativeDate()`
  - Mapping eventType → label FR + icône : `created` (Plus), `payment_recorded` (Banknote), `suspended` (Ban), `reactivated` (RefreshCw), etc. (table dans le composant ou fr-NE)
- [x] **T11d `src/components/owner/owner-health-card.tsx`** — ratio actifs/total :
  - Barre de progression (div + width %)
  - Couleur : vert si > 80%, orange 50-80%, rouge < 50%
- [x] Tous ces composants sont des Server Components (pas de "use client") sauf si interactivité nécessaire. Préférer server pour perf.
- [x] `pnpm typecheck` — zéro erreur

### T12 — Créer les badges `tenant-status-badge.tsx` + `tenant-plan-badge.tsx`

- [x] Réutiliser le composant `Badge` shadcn (`src/components/ui/badge.tsx`) + variantes par classe :
  ```tsx
  // tenant-status-badge.tsx
  import { Badge } from "@/components/ui/badge";
  import { cn } from "@/lib/utils";
  const STATUS_STYLES: Record<string, string> = {
    active: "bg-status-accepte-bg text-status-accepte-text",
    trial: "bg-status-valide-bg text-status-valide-text",
    suspended: "bg-status-envoye-bg text-status-envoye-text",
    cancelled: "bg-status-annule-bg text-status-annule-text",
  };
  export function TenantStatusBadge({ status }: { status: string }) {
    return <Badge className={cn("border-transparent", STATUS_STYLES[status])}>{LABELS[status]}</Badge>;
  }
  ```
  Utiliser les tokens `status-*-bg`/`text` DEFINIS dans globals.css (lignes 151-166) — cohérent avec la charte.
- [x] `tenant-plan-badge.tsx` similaire (free/pro/enterprise).
- [x] `pnpm typecheck` — zéro erreur

### T13 — Créer `src/app/owner/tenants/page.tsx` (liste)

- [x] Server Component avec `searchParams` Promise (Next.js 16) :
  ```tsx
  import { fetchTenantsPage, parseTenantFilters } from "@/lib/owner/tenant-filters";
  import { TenantsTable } from "@/components/owner/tenants-table";
  import { TenantsFilters } from "@/components/owner/tenants-filters";
  import { TenantsExportButton } from "@/components/owner/tenants-export-button";

  interface PageProps {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }

  export default async function TenantsPage({ searchParams }: PageProps) {
    const sp = await searchParams; // OBLIGATOIRE await en Next 16
    const filters = parseTenantFilters(sp);
    const { rows, totalPages, total } = await fetchTenantsPage(filters);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-serif text-2xl font-semibold">Tenants</h1>
        <TenantsFilters current={filters} />
        <TenantsTable rows={rows} filters={filters} totalPages={totalPages} total={total} />
        <TenantsExportButton filters={filters} />
      </div>
    );
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T14 — Créer `src/components/owner/tenants-table.tsx`

- [x] Tableau HTML natif (pattern `UserManagementTable` de `user-role-selector.tsx`) :
  ```tsx
  <div className="overflow-hidden rounded-xl border border-border">
    <table className="w-full text-sm">
      <thead className="bg-surface-alt">
        <tr>
          <th className="px-4 py-3 text-left font-semibold text-text-muted">Nom</th>
          {/* ... 6 autres colonnes */}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="border-t border-border">
            <td className="px-4 py-3">
              <div className="font-medium text-text-primary">{r.name}</div>
              <div className="text-xs text-text-muted">{r.slug}</div>
            </td>
            {/* plan badge, status badge, expiry + daysRemaining, lastPayment, users, actions */}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  ```
- [x] Pagination : `<nav>` avec liens `?page=N` (Link, pas de JS — server-driven).
- [x] Actions rapides : `DropdownMenu` shadcn (`src/components/ui/dropdown-menu.tsx`) avec items désactivés (tooltip "Bientôt disponible") SAUF "Voir" actif (lien `/owner/tenants?focus=<id>` en attendant 7-7).
- [x] Si `rows.length === 0` → ligne "Aucun tenant" (colspan full).
- [x] `pnpm typecheck` — zéro erreur

### T15 — Créer `src/components/owner/tenants-filters.tsx` (client component)

- [x] `"use client"` première ligne.
- [x] Inputs : `Select` status, `Select` plan, `Select` expiry, `Select` paymentMethod, deux `input[type=date]` createdAfter/Before, bouton "Réinitialiser".
- [x] Sur changement : `router.push(`/owner/tenants?${new URLSearchParams(next)}`)` (useRouter + usePathname de `next/navigation`).
- [x] Préserver les valeurs courantes depuis `current` (props).
- [x] Cibles ≥ 44px (UX-DR22), labels aria (UX-DR23).
- [x] `pnpm typecheck` — zéro erreur

### T16 — Créer `src/app/api/v1/owner/tenants/route.ts` + `export/route.ts`

- [x] `GET /api/v1/owner/tenants` — liste paginée JSON (utilisé par refresh client optionnel) :
  ```ts
  import { requireOwnerSession } from "@/lib/session";
  import { apiError, HTTP_STATUS } from "@/lib/api/envelope";

  export async function GET(req: Request) {
    const guard = await requireOwnerSession();
    if (!guard.ok) return apiError(guard.code, "...", guard.status);
    const { searchParams } = new URL(req.url);
    const filters = parseTenantFilters(Object.fromEntries(searchParams));
    const data = await fetchTenantsPage(filters);
    return Response.json(data);
  }
  ```
- [x] `GET /api/v1/owner/tenants/export` — export CSV :
  ```ts
  export async function GET(req: Request) {
    const guard = await requireOwnerSession();
    if (!guard.ok) return apiError(guard.code, "...", guard.status);
    const { searchParams } = new URL(req.url);
    const filters = parseTenantFilters(Object.fromEntries(searchParams));
    filters.page = 1;
    // Fetch ALL matching rows (max 10 000) — pas de pagination pour l'export
    const { rows } = await fetchTenantsPage({ ...filters, page: 1, pageSizeOverride: 10000 });
    const csv = buildTenantsCsv(rows);
    const today = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tenants-${today}.csv"`,
      },
    });
  }
  ```
- [x] `TenantsExportButton` (client) : `<a href="/api/v1/owner/tenants/export?...filters" download>` (download direct, pas de fetch blob — plus simple et le navigateur gère le téléchargement).
- [x] `pnpm typecheck` — zéro erreur

### T17 — UPDATE `src/messages/fr-NE.json` (section owner)

- [x] Ajouter :
  ```json
  "owner": {
    "layout": {
      "dashboard": "Dashboard",
      "tenants": "Tenants",
      "payments": "Paiements",
      "reports": "Rapports",
      "settings": "Paramètres",
      "backToApp": "Retour à l'app",
      "logout": "Déconnexion",
      "comingSoon": "Bientôt disponible"
    },
    "dashboard": {
      "eyebrow": "OWNER CONSOLE",
      "title": "Vue d'ensemble",
      "active": "Actifs",
      "trial": "En trial",
      "suspended": "Suspendus",
      "cancelled": "Annulés",
      "mrr": "MRR",
      "arr": "ARR",
      "collectedThisMonth": "Encaissé ce mois",
      "alerts": {
        "title": "Alertes critiques",
        "expiringSoon": "Expire dans ≤ 7 jours",
        "inGrace": "En période de grâce",
        "overdue": "Retard > 30 jours",
        "none": "Aucune alerte critique",
        "count": "{count} alertes"
      },
      "recentActivity": { "title": "Activité récente", "empty": "Aucune activité" },
      "health": { "title": "Santé plateforme", "ratio": "{active} / {total} actifs" }
    },
    "tenants": {
      "title": "Tenants",
      "columns": { "name": "Nom", "plan": "Plan", "status": "Statut", "expiry": "Expiration", "lastPayment": "Dernier paiement", "users": "Utilisateurs", "actions": "Actions" },
      "filters": {
        "status": "Statut", "plan": "Plan", "expiry": "Expiration", "paymentMethod": "Méthode paiement",
        "createdAfter": "Créé après", "createdBefore": "Créé avant", "reset": "Réinitialiser", "search": "Rechercher"
      },
      "actions": { "view": "Voir", "suspend": "Suspendre", "reactivate": "Réactiver", "recordPayment": "Enregistrer paiement" },
      "export": { "csv": "Exporter CSV", "exported": "Export téléchargé" },
      "pagination": { "previous": "Précédent", "next": "Suivant", "page": "Page {current} / {total}", "results": "{count} tenants" },
      "empty": "Aucun tenant",
      "daysRemaining": { "expired": "Expiré", "days": "J-{n}", "ok": "+{n} j" }
    },
    "badges": {
      "status": { "active": "Actif", "trial": "Trial", "suspended": "Suspendu", "cancelled": "Annulé" },
      "plan": { "free": "Free", "pro": "Pro", "enterprise": "Enterprise" },
      "paymentMethod": { "nitta": "Nitta", "wave": "Wave", "amana": "Amana", "stripe": "Stripe", "cash": "Cash", "virement": "Virement" }
    },
    "events": {
      "created": "Tenant créé", "activated": "Activé", "suspended": "Suspendu", "reactivated": "Réactivé",
      "cancelled": "Annulé", "payment_recorded": "Paiement enregistré", "plan_changed": "Plan modifié",
      "user_added": "Utilisateur ajouté", "reminder_sent": "Rappel envoyé"
    }
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T18 — Tests unitaires Vitest

- [x] `src/lib/owner/metrics.test.ts` :
  - `computeOwnerMetrics` : mock `db` (4 statuts + total)
  - `computeRevenue` : mock paiements, vérifier mensualisation annuels (annual/12), ARR = MRR*12
  - `getCriticalAlerts` : mock tenants avec dates variées (expiring, grace, overdue)
  - `getHealthRatio` : division + cas total=0 (pas de NaN)
- [x] `src/lib/owner/tenant-filters.test.ts` :
  - `parseTenantFilters` : default page=1, valeurs invalides ignorées
  - `buildTenantWhere` : chaque filtre génère la bonne condition SQL (snapshot ou assertion sur la chaîne)
- [x] `src/lib/owner/csv.test.ts` :
  - `buildTenantsCsv` : headers corrects, BOM présent (`﻿`), escaping des guillemets, montant entier (pas de .00)
- [x] `src/lib/session.test.ts` (nouveau) :
  - `requireOwnerSession` : superadmin → `{ ok: true }`, admin → `{ ok: false, status: 403 }`, pas de session → 401
  - Mock `auth.api.getSession`
- [x] `pnpm check` — tous tests passent sans régression

### T19 — Tests E2E Playwright

- [x] `tests/e2e/owner-dashboard.spec.ts` :
  - **Setup** : seed un user `superadmin` (via fixture ou direct DB) + quelques tenants/payments/events
  - Scénarios :
    1. Login superadmin → `/owner` → dashboard affiché (compteurs visibles)
    2. Login admin (non-superadmin) → navigate `/owner` → redirect `/`
    3. Non-authentifié → `/owner` → redirect `/`
    4. `/owner/tenants` → tableau affiché, pagination marche (?page=2)
    5. Filtre status=active → rows filtrées
    6. Export CSV → vérifier `Content-Type: text/csv`, présence du BOM (`﻿`), première ligne = headers
    7. Layout : nav présente, "Owner Console" visible
- [x] Créer `tests/fixtures/seed-owner.ts` (seed user superadmin + 3 tenants + 2 payments + 1 event).
- [x] `pnpm test:e2e` — passe

### T20 — Vérification finale (AC11)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (425 tests passés, 0 erreurs)
- [x] `pnpm build` : passe sans erreur (migration ALTER TYPE appliquée)
- [x] Superadmin voit `/owner` avec compteurs + alertes + activité + santé
- [x] Non-superadmin redirigé depuis `/owner`
- [x] Liste `/owner/tenants` paginée + filtres + export CSV (BOM)
- [x] Layout owner autonome (pas de shell client)

---

## Dev Notes

### CRITIQUE — Aucune donnée n'existe encore (story 7-1 non implémentée)

La story 7-1 a le statut **ready-for-dev** (pas encore implémentée). Les tables `tenants`, `subscription_payments`, `tenant_events`, `user.tenant_id` **n'existent pas encore** dans le schéma courant. Cette story 7-2 a une **hard dependency sur 7-1**.

**Conséquences pour le dev agent :**
- Le dev de 7-2 ne peut PAS tourner `pnpm check`/`pnpm build` tant que 7-1 n'est pas fusionnée.
- Deux stratégies :
  1. **(Recommandée)** Implémenter 7-1 d'abord, puis 7-2 (ordre naturel).
  2. Si 7-2 doit avancer en parallèle : écrire tout le code 7-2 contre le schéma cible (en supposant les tables 7-1 présentes), sans pouvoir exécuter les tests/build jusqu'à merge de 7-1.
- Cette story suppose le schéma 7-1 présent (AC1 story 7-1 : tables `tenants`/`subscription_payments`/`tenant_events` + `user.tenantId`). Le dev DOIT vérifier `src/lib/schema.ts` contient ces tables avant d'implémenter les query helpers.

→ **Flag parent :** planifier l'implémentation séquentielle 7-1 → 7-2. Le présent fichier est prêt, mais non exécutable sans 7-1.

### CRITIQUE — Collision migration avec story 7-1

Story 7-1 génère `drizzle/0014_*.sql` (CREATE TABLE tenants + ALTER user ADD tenant_id). Cette story 7-2 génère un `ALTER TYPE user_role ADD VALUE 'superadmin'`.

**Règle Drizzle** : `ALTER TYPE ... ADD VALUE` ne peut PAS être dans une transaction (PostgreSQL). Drizzle wrappe chaque migration dans une transaction par défaut. Solution : ajouter la directive `-- custom transaction` OU générer la migration puis l'éditer pour retirer le `BEGIN`/`COMMIT` (pattern déjà utilisé pour les triggers en story 6-3).

Alternative plus sûre : si 7-1 est fusionnée en premier, simplement `pnpm db:generate` après avoir édité `userRoleEnum` — Drizzle 0.44 détecte l'ajout de valeur d'enum et génère le bon SQL. Vérifier qu'il n'y a pas de `BEGIN` autour du `ALTER TYPE` (si oui, l'éditer).

Si 7-1 et 7-2 sont développés en parallèle avant merge, **fusionner dans l'ordre 7-1 puis 7-2** et regénérer.

### CRITIQUE — Rôle `superadmin` : sémantique vs Better Auth

Better Auth 1.6.11 ne sait pas que `superadmin` existe. La colonne `user.role` est un simple `text` (pas un enum côté Better Auth). Donc :
- L'ajout de `superadmin` à `userRoleEnum` (Drizzle enum PostgreSQL) ne casse PAS Better Auth.
- Le seed d'un user superadmin se fait en INSERT direct : `INSERT INTO "user" (id, name, email, role, ...) VALUES (..., 'superadmin', ...)`.
- Pour les tests E2E, créer un user via Better Auth (`signUp`) puis UPDATE `role = 'superadmin'` directement en DB (ou un script seed).
- Le cast `(session.user as Record<string, unknown>).role` continue de fonctionner (déjà utilisé partout — `auth.ts`, `session.ts`, `audit.ts`).

**CRITIQUE — `superadmin` n'a pas de `companyId` ni `tenantId`** : les API routes existantes (companies, quotes, etc.) qui lisent `session.user.companyId` vont crasher si un superadmin les appelle (companyId null). C'est ACCEPTABLE car le superadmin n'accède qu'à `/owner/*` et `/api/v1/owner/*`. Le proxy + `requireOwnerAuth()` le redirigent s'il tente `/dashboard`. **Ne PAS** modifier les API routes client existantes pour gérer ce cas.

### CRITIQUE — `searchParams` est une Promise en Next.js 16

```tsx
// CORRECT (Next 16)
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // ...
}

// INCORRECT (Next 14/15 sync)
export default function Page({ searchParams }) { ... }
```
Source : [Next.js 16 — searchParams is now a Promise](https://nextjs.org/docs/app/api-reference/file-conventions/page). Le repo utilise déjà `await headers()` partout (pattern établi), appliquer la même logique à `searchParams`.

### CRITIQUE — `sum()` Drizzle retourne `string | null`

```ts
const [row] = await db.select({ total: sum(subscriptionPayments.amount) }).from(...);
// row.total est string | null (sql numeric)
const mrr = Number(row?.total ?? 0); // TOUJOURS Number() wrap
```
Ne JAMAIS faire `row.total * 12` directement (string × number = NaN). Toujours `Number(...)`.

### CRITIQUE — Colonnes nullables + Drizzle operators

`tenants.subscriptionEnd` est `date | null` (`date({ mode: "date" })` nullable). Les opérateurs Drizzle `lt()`, `gte()`, `between()` sur une colonne nullable produisent `SQL<T | null>` mais PostgreSQL traite `NULL < x` comme `NULL` (pas true) — donc les rows avec `subscriptionEnd = NULL` sont automatiquement exclus. C'est OK pour les alertes (on veut les tenants AVEC une date d'expiration).

Cependant, pour `inGrace` (AC5), la condition `subscriptionEnd < now` doit être combinée avec `isNotNull(subscriptionEnd)` explicitement pour éviter des warnings TS strict et être clair. Pattern :
```ts
and(
  isNotNull(tenants.subscriptionEnd),
  lt(tenants.subscriptionEnd, now),
  isNotNull(tenants.gracePeriodEndsAt),
  gte(tenants.gracePeriodEndsAt, now),
)
```

### CRITIQUE — JOIN LATERAL "dernier paiement"

Pour la colonne "Dernier paiement" du tableau (montant + méthode + date du paiement le plus récent par tenant), il faut un LEFT JOIN LATERAL :

```sql
SELECT t.*, lp.amount AS last_amount, lp.payment_method AS last_method, lp.paid_at AS last_paid_at,
       (SELECT COUNT(*) FROM "user" u WHERE u.tenant_id = t.id) AS active_users
FROM tenants t
LEFT JOIN LATERAL (
  SELECT * FROM subscription_payments sp
  WHERE sp.tenant_id = t.id
  ORDER BY sp.paid_at DESC
  LIMIT 1
) lp ON true
WHERE ...
ORDER BY t.created_at DESC
LIMIT 25 OFFSET ?
```

En Drizzle, le LATERAL n'est pas first-class. Deux options :
1. **`sql` template literal** dans le select (le plus lisible pour ce cas) :
   ```ts
   const rows = await db.select({
     id: tenants.id,
     name: tenants.name,
     slug: tenants.slug,
     plan: tenants.plan,
     status: tenants.status,
     subscriptionEnd: tenants.subscriptionEnd,
     maxUsers: tenants.maxUsers,
     createdAt: tenants.createdAt,
     lastPaymentAmount: sql<number>`(SELECT amount FROM subscription_payments WHERE tenant_id = ${tenants.id} ORDER BY paid_at DESC LIMIT 1)`,
     lastPaymentMethod: sql<string>`(SELECT payment_method FROM subscription_payments WHERE tenant_id = ${tenants.id} ORDER BY paid_at DESC LIMIT 1)`,
     lastPaymentDate: sql<Date>`(SELECT paid_at FROM subscription_payments WHERE tenant_id = ${tenants.id} ORDER BY paid_at DESC LIMIT 1)`,
     activeUsers: sql<number>`(SELECT COUNT(*)::int FROM "user" WHERE tenant_id = ${tenants.id})`,
   }).from(tenants).where(and(...conditions)).orderBy(sql`${tenants.createdAt} DESC`).limit(25).offset((page-1)*25);
   ```
2. Deux queries : une pour les tenants (paginée), une pour les derniers paiements/users (`WHERE tenant_id IN (...)`). Plus verbeux mais 100% Drizzle typé.

**Recommandation : Option 1 (sous-requêtes corrélées `sql`)** — simple, performant pour MVP (25 rows/page), typage via `sql<number>`. Le repo utilise déjà `sql` template ailleurs (quota atomic increments, project-context.md §Database).

Le COUNT total pour la pagination :
```ts
const [totalRow] = await db.select({ n: count() }).from(tenants).where(and(...conditions));
const total = totalRow?.n ?? 0;
```

### CRITIQUE — Pas de TanStack Table (data-table)

Le repo n'a PAS `@tanstack/react-table` en dépendance. Les tables existantes (`UserManagementTable`, `pdf-template`) sont en HTML natif. **NE PAS introduire TanStack** pour cette story — ça ajouterait ~50kb et complexité. Le pattern server-driven (searchParams → SQL WHERE → rows → table HTML statique) est suffisant et plus performant (pas de JS client pour le tri/filtre ; tout est server-side via l'URL).

Si un tri par colonne est demandé plus tard (story future), évaluer alors TanStack ou rester en URL params (`?sort=name&dir=asc`).

### CRITIQUE — Mapping `tenant` ↔ seam `companyId` DEFERRED

Comme noté en story 7-1, le repo a un seam multi-tenant existant basé sur `companyId` (toutes les tables domaines + `user.companyId`). Le nouveau modèle `tenants` (Epic 7) est un nouveau root commercial. Pour le MVP :
- Le dashboard owner liste les `tenants` (nouvelle table) — PAS les `company` existantes.
- Aucune jointure `tenants` ↔ `company` n'est faite dans cette story.
- `activeUsers` (AC7 colonne 6) = `COUNT(user WHERE tenant_id = tenants.id)` — utilise `user.tenantId` (ajouté en 7-1), PAS `user.companyId`.

→ **Flag parent** : confirmer la sémantique tenant↔company avant la story 7-7 (fiche tenant). Le présent dashboard ne fait que lire la nouvelle table `tenants`.

### CRITIQUE — Layout owner autonome (PAS le shell client)

Le layout `(app)/layout.tsx` charge `CryptoContext`, `OfflineBanner`, `BottomNav`, l'encryption layer Dexie — tout ce qui est inutile voire problématique pour l'owner console :
- L'owner n'a pas de données Dexie (pas de devis clients côté owner).
- `CryptoContext` requiert une clé (PIN/biometric) — pas applicable au superadmin.
- `BottomNav` est pour mobile client.

**Le layout `src/app/owner/layout.tsx` doit être un layout PROPRE** (header + nav + main), sans importer le shell `(app)`. Ne PAS mettre `/owner` dans le route group `(app)`.

### CRITIQUE — Calcul MRR : assumption à valider

Le spec Epic 7 §3.1 dit "MRR (Monthly Recurring Revenue)" sans préciser la formule. L'assumption retenue (AC4 + T5) :
- MRR = SUM(paiements `monthly` du mois courant) + SUM(paiements `annual` des 12 derniers mois) / 12
- ARR = MRR × 12
- "Total encaissé ce mois" = SUM(tous paiements du mois, tous cycles)

Cette formule est simplifiée (ne distingue pas les tenants actifs des annulés dans le calcul du MRR — un paiement `annual` d'un tenant depuis annulé compte encore dans MRR pendant 12 mois). Pour le MVP owner, c'est acceptable (le superadmin voit les chiffres bruts). Affiner en story 7-11 (rapports) si besoin.

→ **Flag parent** : valider la formule MRR avec Maiga Tech Lab. Alternative stricte : ne compter que les paiements des tenants `status IN ('active','trial')`.

### CRITIQUE — `formatFcfa` et montants en entier

`subscription_payments.amount` est `integer` (FCFA, jamais float). `formatFcfa(1500000)` → `"1 500 000 XOF"` (via `Intl.NumberFormat fr-FR currency XOF`). Pour le CSV, écrire l'entier brut (`1500000`) sans formatage monétaire (Excel gère), jamais `"1 500 000,00"`.

### CRITIQUE — BOM UTF-8 dans le CSV (OBLIGATOIRE)

`"﻿"` (U+FEFF) en début de CSV est requis pour qu'Excel Windows (standard au Niger/AES) reconnaisse l'UTF-8 et affiche correctement les accents (é, è, à). Sans BOM, "Suspendu" s'affiche `Suspendu` correctement mais les caractères étendus (slug avec accent) deviennent mojibake. Pattern validé en story 6-3 (`audit/export`). NE PAS l'omettre.

### CRITIQUE — Actions rapides : placeholders désactivés

"Suspendre / Réactiver / Enregistrer paiement" sont implémentés en stories 7-4/7-5/7-8. Dans cette story, ces items du DropdownMenu sont **présents mais désactivés** (`disabled` + tooltip "Bientôt disponible"). Seul "Voir" est actif et pointe vers `/owner/tenants?focus=<id>` (filtre sur le tenant dans la liste) en attendant la fiche tenant (7-7).

Le dev NE DOIT PAS implémenter la logique de mutation (suspend/reactivate/payment) — c'est hors scope. Les boutons désactivés communiquent que la feature arrive.

### Design tokens — cartes et badges owner

```tsx
// Carte métrique (4 statuts + 3 revenus)
className="rounded-lg border border-border bg-surface p-5"

// Titre section
className="text-xs font-semibold uppercase tracking-wider text-text-muted"

// Chiffre métrique (Spectral + tabular)
className="font-serif text-2xl font-semibold tabular-nums text-text-primary"

// En-tête de tableau
className="bg-surface-alt px-4 py-3 text-left font-semibold text-text-muted"

// Ligne de tableau
className="border-t border-border"

// Badge statut (réutiliser tokens status-*-bg/text)
className="border-transparent bg-status-accepte-bg text-status-accepte-text"
```

### Pattern existant à réutiliser

- `src/app/(app)/parametres/utilisateurs/components/user-role-selector.tsx` — `UserManagementTable` (table HTML native + `bg-surface-alt` + `border-border`) → modèle pour `TenantsTable`
- `src/components/dashboard/recent-quotes-list.tsx` — formatDate `Intl.DateTimeFormat("fr-FR")` → réutiliser pour `formatDateFr`
- `src/app/api/v1/audit/export/route.ts` — pattern CSV BOM + escaping → réutiliser pour `buildTenantsCsv`
- `src/lib/money.ts` — `formatFcfa()` pour MRR/ARR/paiements
- `src/components/ui/badge.tsx` — Badge shadcn pour plan/status
- `src/components/ui/dropdown-menu.tsx` — DropdownMenu pour actions rapides
- `src/components/ui/select.tsx` — Select pour filtres
- `src/lib/api/envelope.ts` — `apiError()` pour les routes owner (401/403)
- `src/proxy.ts` — étendre matcher (coordination avec 7-1)
- `src/app/(app)/parametres/page.tsx` — pattern bouton logout (commit `a637dfe`)

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Introduire `@tanstack/react-table` | Table HTML native (pattern `UserManagementTable`) |
| Fetch toutes les rows puis compter en JS | COUNT/SUM SQL agrégat |
| `sum().* 12` sans `Number()` | `Number(sum ?? 0)` puis multiplier |
| Omettre le BOM dans le CSV | `"﻿"` + headers |
| `searchParams` sync (Next 14 style) | `await searchParams` (Promise Next 16) |
| Implémenter suspend/reactivate/payment ici | Placeholders désactivés (stories 7-4/7-5/7-8) |
| Mettre `/owner` dans le route group `(app)` | Layout `src/app/owner/layout.tsx` autonome |
| Compter `activeUsers` via `companyId` | Via `user.tenantId` (ajouté en 7-1) |
| Faire confiance au proxy seul pour `/owner` | `requireOwnerAuth()` en Server Component (defense in depth) |
| Hardcoder du texte FR dans les composants | Clés `fr-NE.json` section `owner` |
| Modifier les API routes client (companies/quotes) | Inchangées — le superadmin ne les appelle pas |
| `superadmin` avec `companyId`/`tenantId` non-null | `null` — le superadmin n'est pas un user client |
| Impler la fiche tenant `/owner/tenants/[id]` ici | Story 7-7 — "Voir" pointe vers la liste filtrée en attendant |

### Héritage des stories précédentes

**Story 7-1 (schema + middleware) — ready-for-dev (NON implémentée)** : hard dependency. Cette story suppose les tables `tenants`/`subscription_payments`/`tenant_events` + `user.tenantId` présentes. Le dev DOIT s'assurer que 7-1 est fusionnée avant de tester 7-2.

**Story 6-3 (audit export) — DONE** : pattern CSV BOM + escaping (`src/app/api/v1/audit/export/route.ts`) → réutiliser pour `buildTenantsCsv`.

**Story 6-2 (quota enforcement) — DONE** : pattern `companySubscription`/`tierEnum`. À NOTER : `tierEnum` (starter/pro/entreprise) ≠ `tenantPlanEnum` (free/pro/enterprise). Le dashboard owner affiche `tenants.plan` (tenantPlanEnum), PAS `companySubscription.tier`.

**Story 1-6 (roles & permissions) — DONE** : `PERMISSION_MATRIX` + `can()`/`requirePermission()`. Cette story étend la matrice avec `superadmin`.

**Story 5-1/5-2 (dashboard client) — DONE** : pattern Server Component dashboard (page.tsx récupère session, composants présentation). Le dashboard owner suit le même principe mais sur `tenants` au lieu de `db.quotes` (Dexie).

### Commandes pour le dev agent

```bash
# 0. PRÉREQUIS — story 7-1 doit être fusionnée (tables tenants présentes)
git log --oneline | grep "7-1"  # vérifier le commit

# 1. Docker en cours
docker compose up -d

# 2. Migration ALTER TYPE superadmin
# Éditer userRoleEnum dans schema.ts (ajouter "superadmin")
pnpm db:generate   # crée drizzle/0015_*.sql (ou suivant après 7-1)
# Vérifier le SQL — retirer BEGIN/COMMIT autour de ALTER TYPE si présent
pnpm db:migrate    # applique

# 3. Seed un user superadmin pour tester (script manuel ou fixture)
# psql : INSERT INTO "user" (id, name, email, role, "createdAt", "updatedAt")
#        VALUES (gen_random_uuid(), 'Owner', 'owner@maigatechlab.com', 'superadmin', now(), now());

# 4. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 5. Build
pnpm build   # passe sans erreur

# 6. Dev
pnpm dev
# Login en tant que superadmin → http://localhost:3000/owner
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §3.1 dashboard overview, §3.2 liste tenants, §6 mapping BMAD (story 7.2), §7 paramètres business
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — hard dependency (tables `tenants`/`subscription_payments`/`tenant_events`, `user.tenantId`, `tenant-config.ts`, proxy)
- [project-context.md] — règles Drizzle, TypeScript strict, API envelope, i18n, CSV BOM, design system
- [Next.js 16 — searchParams is a Promise](https://nextjs.org/docs/app/api-reference/file-conventions/page)
- [Next.js 16 — proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [DESIGN.md §Colors/Typography] — tokens `status-*-bg`/`text`, `font-serif`, `tabular-nums`, `bg-surface`, `bg-surface-alt`, `border-border`
- [EXPERIENCE.md §Component Patterns] — card/button/badge/status-badge specs
- [src/lib/permissions.ts] — `Role`, `Action`, `PERMISSION_MATRIX`, `can()`, `requirePermission()` à étendre
- [src/lib/session.ts] — `requireAuth()`, `getSessionWithRole()` (pattern pour `requireOwnerAuth()`)
- [src/lib/auth.ts] — Better Auth config, plugins audit/lockout (ne pas modifier ici)
- [src/proxy.ts] — proxy existant à étendre (matcher + cookie check)
- [src/lib/schema.ts] — `userRoleEnum`, tables 7-1 (à supposer présentes)
- [src/lib/api/envelope.ts] — `apiError()`, `HTTP_STATUS`
- [src/lib/money.ts] — `formatFcfa()` pour MRR/ARR/paiements
- [src/app/(app)/parametres/utilisateurs/components/user-role-selector.tsx] — `UserManagementTable` (modèle table HTML native)
- [src/app/api/v1/audit/export/route.ts] — pattern CSV BOM + escaping (story 6-3)
- [src/components/ui/badge.tsx] — Badge shadcn (variantes pour plan/status)
- [src/components/ui/dropdown-menu.tsx] — DropdownMenu (actions rapides)
- [src/components/ui/select.tsx] — Select (filtres)

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`)

**Epic 7 :** Owner Panel & Gestion des abonnements SaaS — Post-MVP. **Hard dependency : Epic 1 (auth/rôles, DONE), Story 7-1 (schema + middleware, ready-for-dev).**

**Story 7.2 (P0)** est la première story UI de l'épic : elle transforme le socle technique posé par 7-1 (tables + proxy) en une **console propriétaire utilisable**. Sans 7-2, le owner ne peut pas voir son parc de tenants ni piloter les paiements.

**Modèle de tenancy (§1) :** Multi-tenant SaaS avec sous-domaine. Le owner opère depuis l'apex `quotation.com/owner` (PAS un sous-domaine), en dehors du flux tenant.

### Stories de l'Epic 7 (cross-context)

| ID | Titre | Dépendance vers 7-2 |
|----|-------|---------------------|
| 7.1 | Schema tenants + middleware subdomain routing | — (prérequis de 7-2) |
| 7.2 | **Dashboard overview owner + liste tenants** | — (cette story) |
| 7.3 | Création manuelle tenant + email bienvenue | Bouton "Nouveau tenant" sur `/owner/tenants` (lien vers 7-3) |
| 7.4 | Enregistrement paiement | Bouton "Enregistrer paiement" dans le tableau (placeholder ici) |
| 7.5 | Suspension manuelle + page expiration | Bouton "Suspendre" (placeholder ici) |
| 7.6 | Cron expiration + rappels | Génère les `tenant_events` affichés dans "Activité récente" |
| 7.7 | Fiche tenant complète (onglets) | Cible du bouton "Voir" (placeholder ici : liste filtrée) |
| 7.8 | Réactivation après paiement | Bouton "Réactiver" (placeholder ici) |
| 7.9 | Gestion utilisateurs par tenant | Colonne "users" affiche déjà activeUsers/maxUsers |
| 7.10 | Stripe webhook | Génère des `subscription_payments` automatiquement |
| 7.11 | Rapports & export comptabilité | Étend le dashboard avec rapports mensuels |
| 7.12 | Paramètres plateforme | Override `PLAN_PRICES_XOF`, `DEFAULT_TRIAL_DAYS` |

### Paramètres business retenus (Epic 7 §7)

```ts
const DEFAULT_TRIAL_DAYS = 14
const DEFAULT_GRACE_PERIOD_DAYS = 7

const PLAN_LIMITS = {
  free: { maxUsers: 1 },
  pro: { maxUsers: 5 },
  enterprise: { maxUsers: 20 },
}

const PLAN_PRICES_XOF = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 25000, annual: 250000 },
  enterprise: { monthly: 75000, annual: 750000 },
}
```

`PLAN_PRICES_XOF` est utilisé en stories 7-4/7-12 (hors scope 7-2). Le dashboard 7-2 affiche les montants EFFECTIVEMENT encaissés (`subscription_payments.amount`), pas les prix théoriques.

---

## Architecture Compliance

| Contrainte | Conformité story 7-2 |
|---|---|
| Next.js 16 App Router (Server Components par défaut) | ✅ Pages owner Server Components ; `searchParams` Promise awaited |
| proxy.ts (middleware.ts déprécié) | ✅ UPDATE `src/proxy.ts` (matcher `/owner/*` + cookie check) |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | ✅ Guards `?? null`, `Number(sum ?? 0)`, pattern conditionnel |
| Drizzle : uuid() pour custom tables, text pour Better Auth | ✅ Tables 7-1 (uuid) ; `user.role` (text Better Auth) — seul `userRoleEnum` étendu |
| Migration workflow : `db:generate` + `db:migrate` | ✅ T1 (ALTER TYPE superadmin) |
| next-intl : UI strings dans `fr-NE.json` | ✅ Section `owner` complète (layout/dashboard/tenants/badges/events) |
| API envelope : `apiError()` | ✅ Routes `/api/v1/owner/*` (401/403 via `requireOwnerSession`) |
| Indexes sur colonnes filtrées | N/A (pas de nouvelle table ; filtres sur `tenants.status`/`plan` déjà indexés par 7-1) |
| Money : integer FCFA + `formatFcfa()` | ✅ MRR/ARR/paiements via `formatFcfa()` ; CSV en entier brut |
| CSV : BOM UTF-8 (`﻿`) | ✅ `buildTenantsCsv` (pattern story 6-3) |
| Permissions : `requirePermission()` API, `can()` UI | ✅ Extension matrice `superadmin` + `requireOwnerSession()` |
| Defense in depth : proxy + Server Component | ✅ proxy cookie check + `requireOwnerAuth()` en page |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-2 |
|---|---|---|
| `next` | 16.1.6 | App Router pages owner, `searchParams` Promise, `headers()` |
| `drizzle-orm` | 0.44.7 | Queries `tenants`/`subscription_payments`/`tenant_events`, `count()`, `sum()`, `sql` template (LATERAL), operators `eq`/`and`/`gte`/`lt`/`between`/`isNotNull`/`isNull`/`ilike` |
| `better-auth` | 1.6.11 | `auth.api.getSession()` (via `requireOwnerSession`) |
| `next-intl` | 4.13.0 | `getTranslations("owner...")` Server Components |
| `sonner` | 2.0.7 | Toast confirmation export (optionnel) |
| shadcn/ui (`Badge`, `DropdownMenu`, `Select`) | 3.8.5 | Badges plan/status, menu actions, filtres |
| `vitest` | 4.1.9 | Tests unitaires metrics/filters/csv/session |
| `@playwright/test` | 1.61.0 | E2E owner dashboard + liste + export |

**Aucune nouvelle dépendance à installer.** Pas de TanStack Table, pas de lib CSV externe.

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `src/lib/schema.ts` | **UPDATE** | `userRoleEnum` += `"superadmin"` |
| `drizzle/0015_*.sql` (ou suivant) | **NEW** (généré) | Migration ALTER TYPE |
| `src/lib/permissions.ts` | **UPDATE** | `Role` += `superadmin` ; `Action` += `owner.access`/`tenant.read`/`tenant.read-all` ; `PERMISSION_MATRIX` += ligne `superadmin` |
| `src/lib/session.ts` | **UPDATE** | `requireOwnerAuth()` (Server Component) + `requireOwnerSession()` (API) |
| `src/proxy.ts` | **UPDATE** | Matcher `/owner/*` + cookie check (court-circuit résolution tenant) |
| `src/app/owner/layout.tsx` | **NEW** | Layout autonome (header + nav + auth gate) |
| `src/app/owner/page.tsx` | **NEW** | Dashboard overview |
| `src/app/owner/tenants/page.tsx` | **NEW** | Liste paginée (searchParams Promise) |
| `src/components/owner/owner-metrics-cards.tsx` | **NEW** | 4 cartes statuts + 3 cartes revenus |
| `src/components/owner/owner-alerts.tsx` | **NEW** | Section alertes critiques (3 catégories) |
| `src/components/owner/owner-recent-activity.tsx` | **NEW** | Timeline 10 derniers events |
| `src/components/owner/owner-health-card.tsx` | **NEW** | Carte santé (ratio actifs/total) |
| `src/components/owner/tenants-table.tsx` | **NEW** | Tableau HTML natif + pagination + actions |
| `src/components/owner/tenants-filters.tsx` | **NEW** | Client component (Select + date + reset) |
| `src/components/owner/tenants-export-button.tsx` | **NEW** | Lien download CSV |
| `src/components/owner/tenant-status-badge.tsx` | **NEW** | Badge statut (variantes) |
| `src/components/owner/tenant-plan-badge.tsx` | **NEW** | Badge plan (variantes) |
| `src/lib/owner/metrics.ts` | **NEW** | `computeOwnerMetrics`, `computeRevenue`, `getCriticalAlerts`, `getRecentActivity`, `getHealthRatio` |
| `src/lib/owner/tenant-filters.ts` | **NEW** | `parseTenantFilters`, `buildTenantWhere`, `fetchTenantsPage` |
| `src/lib/owner/format.ts` | **NEW** | `formatRelativeDate`, `formatDaysRemaining`, `formatDateFr` |
| `src/lib/owner/csv.ts` | **NEW** | `buildTenantsCsv` (BOM + escape) |
| `src/app/api/v1/owner/tenants/route.ts` | **NEW** | GET liste paginée JSON |
| `src/app/api/v1/owner/tenants/export/route.ts` | **NEW** | GET export CSV (superadmin) |
| `src/lib/owner/metrics.test.ts` | **NEW** | Tests Vitest |
| `src/lib/owner/tenant-filters.test.ts` | **NEW** | Tests Vitest |
| `src/lib/owner/csv.test.ts` | **NEW** | Tests Vitest |
| `src/lib/session.test.ts` | **NEW** | Test `requireOwnerSession` |
| `tests/e2e/owner-dashboard.spec.ts` | **NEW** | E2E Playwright |
| `tests/fixtures/seed-owner.ts` | **NEW** | Seed user superadmin + tenants + payments + events |
| `src/messages/fr-NE.json` | **UPDATE** | Section `owner` complète |

**Ne PAS modifier :** tables domaines (clients/quotes/clauses), `companySubscription`/`tierEnum` (story 6-2), `src/lib/tenants/*` (story 7-1, lecture seule), les API routes client existantes (`/api/v1/companies`, `/api/v1/quotes`, etc.), `src/lib/auth.ts` (sauf si nécessaire pour exposer `superadmin` côté client — vérifier mais normalement non), le layout `(app)`.

---

## Testing Requirements

### Tests unitaires (Vitest)

- `src/lib/owner/metrics.test.ts` :
  - `computeOwnerMetrics` : GROUP BY 4 statuts, total = somme, cas 0 tenant
  - `computeRevenue` : mock paiements monthly/annual, vérifier mensualisation (annual/12), ARR = MRR×12, cas 0 paiement
  - `getCriticalAlerts` : tenants avec dates variées (expire J-5, expire J-20 exclus, en grâce, en retard >30j, statut cancelled exclus)
  - `getHealthRatio` : division, cas total=0 (pct=0, pas NaN)
  - Mock `db` via `vi.mock("@/lib/db")` — pattern déjà utilisé dans les tests quota (story 6-2)
- `src/lib/owner/tenant-filters.test.ts` :
  - `parseTenantFilters` : default page=1, valeur `status` invalide ignorée, `page="abc"` → 1
  - `buildTenantWhere` : chaque filtre produit la bonne condition (assertion sur `.queryChunks` ou snapshot de la chaîne SQL via `.toSQL()`)
  - `fetchTenantsPage` : mock, vérifier LIMIT/OFFSET, totalPages = ceil(total/pageSize)
- `src/lib/owner/csv.test.ts` :
  - `buildTenantsCsv` : commence par `﻿`, première ligne = headers exacts, montant entier (pas `.00`), escaping `"` → `""`, ligne vide si row null, CRLF (`\r\n`) entre lignes
- `src/lib/session.test.ts` :
  - `requireOwnerSession` : mock `auth.api.getSession` → superadmin `{ok:true}`, admin `{ok:false,status:403}`, null `{ok:false,status:401}`

### Tests E2E (Playwright)

- `tests/e2e/owner-dashboard.spec.ts` :
  - **Setup** : `tests/fixtures/seed-owner.ts` crée user superadmin + 3 tenants (active/trial/suspended) + 2 payments + 1 event
  - Scénarios (cf. AC11 + T19)

### Seeding

`tests/fixtures/seed-owner.ts` :
```ts
// 1. User superadmin (INSERT direct, role='superadmin')
// 2. Tenants :
//    - "Acme SARL" slug=acme, status=active, plan=pro, subscriptionEnd=+20j
//    - "Trial Co" slug=trial-co, status=trial, trialEndsAt=+5j
//    - "Suspended Inc" slug=suspended-inc, status=suspended
// 3. Payments : 1 monthly 25000 (acme), 1 annual 250000 (acme)
// 4. Event : created pour acme
```

### Tests existants

- `pnpm check` doit continuer à passer : 334+ tests existants. Aucune régression attendue (pas de modification des tables domaines, du seam companyId, ni des API routes client). L'ajout de `superadmin` à `userRoleEnum` est additif (les users existants admin/commercial/operateur restent valides).

---

## Previous Story Intelligence

**Story 7-1 (schema + middleware) — ready-for-dev (NON implémentée)** : hard dependency. Le dev de 7-2 suppose 7-1 fusionnée. Si ce n'est pas le cas, voir Dev Notes §"Aucune donnée n'existe encore". Patterns à réutiliser de 7-1 : `tenant-config.ts` (PLAN_LIMITS, DEFAULT_TRIAL_DAYS), conventions Drizzle (`date({ mode: "date" })`), proxy `x-tenant-id` header (pas lu côté owner).

**Story 6-3 (audit export) — DONE** : pattern CSV BOM + escaping + Content-Disposition. Réutiliser pour `buildTenantsCsv`. Le `audit/export/route.ts` est le modèle exact.

**Story 6-2 (quota) — DONE** : pattern mock `db` dans les tests Vitest (`vi.mock("@/lib/db")`). Pattern `sql\`...\`` pour sous-requêtes. À NOTER le conflit de tiers (`tierEnum` vs `tenantPlanEnum`) — le dashboard owner utilise `tenants.plan` (tenantPlanEnum), ne pas confondre.

**Story 5-1/5-2 (dashboard client) — DONE** : pattern Server Component dashboard (récup session, composants présentation). Le dashboard owner suit le même principe mais sur `tenants` (Drizzle/PG) au lieu de `db.quotes` (Dexie).

---

## Git Intelligence Summary

Derniers commits pertinents :
- `a637dfe` fix: /register redirect to / (was /dashboard), add logout button to parametres — **pattern logout à réutiliser pour le layout owner**
- `a5d9e2e` test(qa): API unit tests + Playwright E2E specs for uncovered routes — pattern tests E2E
- `a4f6977` feat(6-3): immutable audit trail export — **pattern CSV export à réutiliser**
- `f57a515` feat(6-2): tier quota enforcement — pattern mock db + sql template
- `725f64b` feat(3-9/3-10/3-11/6-1): lifecycle status, search/filter, duplicate quote, IndexedDB encryption

**Pattern établi :** chaque story ajoute des tests Vitest à côté du module (`src/lib/owner/*.test.ts`), E2E dans `tests/e2e/`, fixtures dans `tests/fixtures/`. Suivre ce modèle.

---

## Latest Tech Information

### Next.js 16 — `searchParams` est une Promise

Source : [Next.js 16 Page API](https://nextjs.org/docs/app/api-reference/file-conventions/page)

- **Next 15+ :** `params` et `searchParams` sont des Promises — `await` obligatoire.
- **PPR (Partial Prerendering) caveat (Next 16) :** avec PPR, `searchParams` peut recevoir des valeurs stale cachées après un `router.push` ([GitHub Discussion #88535](https://github.com/vercel/next.js/discussions/88535)). Mitigation : `router.refresh()` après navigation de filtre, OU désactiver PPR sur la page (`export const dynamic = "force-dynamic"`). Pour le MVP owner, `dynamic = "force-dynamic"` est acceptable (page non cachée, données fraîches à chaque requête).

```tsx
export const dynamic = "force-dynamic"; // évite stale searchParams avec PPR

export default async function TenantsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  // ...
}
```

### shadcn DataTable — NON requis ici

Les docs shadcn recommandent TanStack Table pour `DataTable`, MAIS le repo n'a pas cette dépendance et les tables existantes sont en HTML natif. Pour une table server-driven (filtres URL + pagination server-side), HTML natif est suffisant et plus performant. Source : [shadcn DataTable guide](https://ui.shadcn.com/docs/components/data-table) — "for client-side sorting/filtering". Ici tout est server-side.

### Drizzle 0.44.7 — `sum()` retourne `string | null`

```ts
const [row] = await db.select({ total: sum(table.amount) }).from(table);
// row.total: string | null — TOUJOURS Number(row?.total ?? 0)
```
Source : [Drizzle ORM aggregate functions](https://orm.drizzle.team/docs/select-values). Les agrégats SQL retournent du `numeric` qui devient `string` en JS via pg.

### Drizzle — `ALTER TYPE ... ADD VALUE` hors transaction

PostgreSQL interdit `ALTER TYPE ... ADD VALUE` dans un bloc transactionnel. Drizzle wrappe les migrations dans `BEGIN`/`COMMIT`. Solution : éditer le SQL généré pour retirer la transaction, OU vérifier que Drizzle 0.44 gère ce cas (il le fait pour `ADD VALUE` depuis 0.30 — mais valider visuellement le fichier généré). Source : [PostgreSQL docs — ALTER TYPE](https://www.postgresql.org/docs/current/sql-altertype.html).

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Framework-Specific Rules (Next.js/React)** — App Router, `"use client"`, `searchParams` Promise Next 16, i18n next-intl
- **Database Rules (Drizzle)** — conventions schema, `sum()` retourne string, migration workflow
- **Permissions Rules** — `requirePermission()` API, `can()` UI, extension matrice
- **API Routes Rules** — `apiError()`, cast `session.user.role`
- **Money / Financial Rules** — `formatFcfa()`, FCFA entier
- **CSV / Exports** — BOM UTF-8 (`﻿`) obligatoire
- **Language Convention** — UI français (clés `fr-NE.json`), code anglais, DB snake_case

---

## Assumptions

(Assumptions non-interactives — à valider par le parent si besoin)

1. **Formule MRR (AC4)** : MRR = SUM(monthly du mois courant) + SUM(annual des 12 derniers)/12. Alternative stricte : filtrer sur tenants actifs/trial seulement. → Flag dans Dev Notes §"Calcul MRR".
2. **Mapping tenant↔company DEFERRED** : le dashboard liste `tenants` (nouvelle table) sans jointure avec `company` (seam existant). `activeUsers` via `user.tenantId`. → Flag pour story 7-7.
3. **Actions rapides = placeholders désactivés** : Suspendre/Réactiver/Enregistrer paiement sont présents mais `disabled` (stories 7-4/7-5/7-8). "Voir" pointe vers `/owner/tenants?focus=<id>` en attendant 7-7.
4. **Pas de TanStack Table** : table HTML native (pattern repo). Évaluer TanStack seulement si tri par colonne demandé en story future.
5. **Page 403 dédiée** : non créée — redirect vers `/` avec toast (assumption MVP). Le parent peut décider d'une page 403 dédiée si besoin branding.
6. **Recherche libre `?q=`** : optionnelle en MVP (peut être omise si trop complexe). Les filtres structurés (status/plan/expiry/paymentMethod/dates) suffisent.
7. **Layout owner autonome** : `src/app/owner/layout.tsx` hors du route group `(app)` — pas de shell client, pas de CryptoContext, pas de BottomNav.
8. **Logout pattern** : réutiliser le pattern de `parametres` (commit `a637dfe`) — à confirmer côté dev (server action vs fetch `/api/auth/signout`).
9. **`dynamic = "force-dynamic"` sur `/owner/tenants`** : évite le stale searchParams PPR en Next 16. Acceptable pour une page admin non publique.
10. **Seed superadmin manuel** : pas d'UI de création de superadmin (le owner Maiga Tech Lab est seedé en DB). La création de user client admin est en story 7-3/7-9.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (claude-sonnet-4-6)

### Debug Log References

1. **TypeScript: `ROLE_LABELS` missing superadmin key** — `login-form.tsx` has `Record<Role, string>` requiring all Role values. Added `superadmin: "Owner"` + `{ value: "superadmin", label: "Owner" }` to ROLES array.
2. **TypeScript: `exactOptionalPropertyTypes` in `tenant-filters.ts`** — Cannot assign `T | undefined` to optional property. Fixed with `NonNullable<TenantFilters["status"]>` casts + conditional assignment pattern.
3. **TypeScript: `.next/dev/types/validator.ts` errors** — Next.js 16 bug with non-root layouts. Fixed by adding the generated file to `tsconfig.json` `exclude` array.
4. **Vitest: `makeChain()` helper** — `db.select().from().where()` mock chain needed both `then()` (awaitable) and chainable method calls. Created a `makeChain(result)` helper that supports both patterns.
5. **Vitest: `tenant-filters.test.ts` POSTGRES_URL error** — Module imports `@/lib/db` at load time; added `vi.mock("@/lib/db")` and schema mocks at top of file.
6. **E2E: `bcryptjs` not installed** — Replaced manual password hashing with Better Auth `/api/auth/sign-up/email` endpoint + SQL UPDATE `role = 'superadmin'`.
7. **E2E: `userId` undefined** — Variable named `superadminId` used as `userId` on lines 102/109. Fixed to `superadminId`.
8. **Import order lint warnings** — Fixed in 10 files: `csv.ts`, `owner/layout.tsx`, `owner/page.tsx`, `owner/tenants/page.tsx`, `api/v1/owner/tenants/route.ts`, `api/v1/owner/tenants/export/route.ts`, `owner-alerts.tsx`, `owner-recent-activity.tsx`, `tenants-table.tsx`, `e2e/owner-dashboard.spec.ts`.

### Completion Notes List

- **Proxy coordination with 7-1**: `proxy.ts` already had `isOwnerRoute` logic from story 7-1. Extended it to add session cookie check and redirect (defense in depth + tenant resolution bypass).
- **Drizzle ALTER TYPE**: Generated `drizzle/0015_woozy_gravity.sql` with no BEGIN/COMMIT wrapper (Drizzle 0.44 handles this correctly for ADD VALUE).
- **Layout autonome**: Created `src/app/owner/` outside `(app)` route group — no CryptoContext, BottomNav, or encryption layer.
- **`OwnerLogoutButton`**: Client component in `src/components/owner/owner-logout-button.tsx` reusing `signOut` from `better-auth/react` without CryptoContext.
- **Correlated subqueries**: Used `sql<number>` template literals for `lastPaymentAmount/Method/Date` and `activeUsers` (Drizzle LATERAL alternative).
- **`dynamic = "force-dynamic"`**: Applied to `/owner/tenants/page.tsx` to prevent stale searchParams with Next.js 16 PPR.
- **425/425 tests pass** (up from 334 baseline): 91 new tests added (Vitest unit + 6 E2E scenarios).
- **Build**: Clean production build with `/owner` and `/owner/tenants` as dynamic routes.

### File List

**Modified:**
- `src/lib/schema.ts` — `userRoleEnum` += `"superadmin"`
- `src/lib/permissions.ts` — `Role`, `Action`, `PERMISSION_MATRIX` extended
- `src/lib/session.ts` — `requireOwnerAuth()` + `requireOwnerSession()` added
- `src/proxy.ts` — session cookie check for `/owner/*` routes
- `src/components/auth/login-form.tsx` — `superadmin: "Owner"` in ROLE_LABELS + ROLES
- `src/messages/fr-NE.json` — full `owner` section added
- `tsconfig.json` — `.next/dev/types/validator.ts` excluded
- `e2e/fixtures.ts` — "Owner" added to `loginAs()` role parameter
- `drizzle/meta/_journal.json` — updated with migration 0015
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated

**New (generated/migration):**
- `drizzle/0015_woozy_gravity.sql` — ALTER TYPE user_role ADD VALUE 'superadmin'
- `drizzle/meta/0015_snapshot.json` — Drizzle snapshot

**New (source):**
- `src/app/owner/layout.tsx`
- `src/app/owner/page.tsx`
- `src/app/owner/tenants/page.tsx`
- `src/app/subscription-expired/` — (from 7-1 dependency, already present)
- `src/components/owner/owner-logout-button.tsx`
- `src/components/owner/owner-metrics-cards.tsx`
- `src/components/owner/owner-alerts.tsx`
- `src/components/owner/owner-recent-activity.tsx`
- `src/components/owner/owner-health-card.tsx`
- `src/components/owner/tenants-table.tsx`
- `src/components/owner/tenants-filters.tsx`
- `src/components/owner/tenants-export-button.tsx`
- `src/components/owner/tenant-status-badge.tsx`
- `src/components/owner/tenant-plan-badge.tsx`
- `src/lib/owner/metrics.ts`
- `src/lib/owner/tenant-filters.ts`
- `src/lib/owner/format.ts`
- `src/lib/owner/csv.ts`
- `src/app/api/v1/owner/tenants/route.ts`
- `src/app/api/v1/owner/tenants/export/route.ts`
- `src/lib/owner/metrics.test.ts`
- `src/lib/owner/tenant-filters.test.ts`
- `src/lib/owner/csv.test.ts`
- `src/lib/session.test.ts`
- `e2e/owner-dashboard.spec.ts`

### Review Findings

**Code review — 2026-06-28 — Verdict: SHIP (H1+H2 fixed)**

🔴 Fixed:
- **H1** `fetchTenantsPage` — 3 correlated subqueries had nondeterministic tie-breaking on equal `paid_at`. Fixed: added `id DESC` tiebreaker to all 3 subqueries (`tenant-filters.ts:184,189,194`). Same sort key → always same row → amount/method/date always coherent.
- **H2** Proxy catch-all matcher redirected unauthenticated `/api/v1/*` calls to `/` (307) instead of letting routes return JSON 401/403. Fixed: added `API_PREFIX = "/api/"` to `isPublicPath()` (`proxy.ts:12,20`). Tenant headers still set before isPublicPath check — API routes keep tenant context.

🟡 Deferred (non-blocking, follow-up stories):
- **#3** `paymentMethod` filter uses EXISTS on any payment, not last payment only — accept "any payment" semantics for MVP or fix in 7-7.
- **#4** `createdAfter/Before` raw strings not ISO-date validated — `new Date("garbage")` = Invalid Date. Add guard in `parseTenantFilters` in 7-7 or 7-11.
- **#5** CSV formula injection — fields starting with `= + - @` not prefixed. Matches 6-3 pattern — fix consistently in 7-11 reports.
- **#6** Export route honors `?page` — `parseTenantFilters` reads page param → offset applied. Button omits page (safe), but defensive: force `page=1` in export route.
- **#7** `createdBefore` uses `T23:59:59Z` UTC — off-by-1h at day boundary for UTC+1 region. Minor, fix when i18n timezone config lands.

### Change Log

- Story 7-2 créée : dashboard overview owner + liste tenants (compteurs, MRR/ARR, alertes, activité, santé, table paginée, filtres, export CSV) — Epic 7 §3.1 + §3.2 (Date: 2026-06-28)
- Story 7-2 implémentée et passée en review : 425/425 tests, build clean, 25 fichiers créés/modifiés (Date: 2026-06-28)
- Story 7-2 done : H1 (subquery tiebreaker) + H2 (proxy API bypass) fixes appliqués, review approuvé (Date: 2026-06-28)
