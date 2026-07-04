---
story_key: 7-1-tenants-schema-subdomain-middleware
epic_num: 7
story_num: 1
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
---

# Story 7.1 : Schema tenants + middleware subdomain routing

**Statut :** done

## Story

**En tant que** plateforme SaaS multi-tenant (Maiga Tech Lab),
**Je veux** un schéma `tenants` (avec paiements et journal d'événements) et un proxy Next.js qui résout le sous-domaine `{slug}.quotation.com` → `tenant_id` pour scoper toutes les requêtes,
**Afin que** chaque client soit isolé sur son sous-domaine et que les tenants suspendus/annulés soient redirigés vers `/subscription-expired` (avec bannière d'alerte en période de grâce).

---

## Critères d'acceptation (BDD)

**AC1 — Schéma Drizzle : table `tenants`**

```
GIVEN  le fichier src/lib/schema.ts
WHEN   le dev ajoute la table tenants (custom table, uuid PK)
THEN   les colonnes présentes correspondent exactement au spec Epic 7 §2 :
       id (uuid PK), name (text NOT NULL), slug (text UNIQUE NOT NULL),
       status (enum tenant_status: active|trial|suspended|cancelled, default 'trial'),
       plan (enum tenant_plan: free|pro|enterprise, default 'free'),
       subscriptionStart (date), subscriptionEnd (date),
       trialEndsAt (date), gracePeriodEndsAt (date),
       maxUsers (integer NOT NULL default 3), notes (text),
       createdAt, updatedAt (timestamps standards)
AND    un index unique sur slug ET un index sur status
AND    le code respecte les conventions du repo :
       uuid("id").primaryKey().defaultRandom(), snake_case column names,
       createdAt defaultNow().notNull(), updatedAt defaultNow().$onUpdate(...).notNull()
```

**AC2 — Schéma Drizzle : table `subscription_payments`**

```
GIVEN  le fichier src/lib/schema.ts
WHEN   le dev ajoute la table subscription_payments
THEN   les colonnes correspondent au spec Epic 7 §2 :
       id (uuid PK), tenantId (uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE),
       amount (integer NOT NULL — FCFA, jamais float), currency (text NOT NULL default 'XOF'),
       paymentMethod (enum payment_method: nitta|wave|amana|stripe|cash|virement),
       paymentReference (text), paidAt (timestamptz NOT NULL),
       periodStart (date NOT NULL), periodEnd (date NOT NULL),
       billingCycle (enum billing_cycle: monthly|annual NOT NULL),
       confirmedBy (text NOT NULL — user_id superadmin), notes (text),
       createdAt (timestamp)
AND    index sur tenantId, index sur paidAt
```

**AC3 — Schéma Drizzle : table `tenant_events` (audit append-only)**

```
GIVEN  le fichier src/lib/schema.ts
WHEN   le dev ajoute la table tenant_events
THEN   colonnes : id (uuid PK), tenantId (uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE),
       eventType (text NOT NULL — voir liste spec), actorId (text NOT NULL — superadmin user_id),
       before (jsonb), after (jsonb), note (text), createdAt (timestamp)
AND    append-only : PAS de revision, PAS de updatedAt (cf pattern audit_event story 6-3)
AND    index sur tenantId, index sur createdAt
```

**AC4 — Ajout `tenantId` sur la table `user`**

```
GIVEN  la table user (Better Auth — text PK)
WHEN   le dev ajoute la colonne tenant_id
THEN   tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" })
       — nullable (un superadmin owner n'a PAS de tenant ; un user client a un tenantId)
AND    un index sur tenantId (idx_user_tenant_id)
AND    la colonne n'a PAS de valeur par défaut (null pour les users existants = superadmin/rétrocompat)
```

**AC5 — Migration générée et appliquée**

```
GIVEN  le schéma modifié
WHEN   le dev exécute pnpm db:generate puis pnpm db:migrate
THEN   un nouveau fichier de migration est créé dans drizzle/ (numéro 0014 ou supérieur)
AND    la migration est appliquée sans erreur sur la DB Docker locale
AND    le fichier SQL est commité dans le repo (jamais db:push)
AND    pnpm typecheck passe sans erreur
```

**AC6 — Résolution du sous-domaine → tenant (lib + cache)**

```
GIVEN  une requête arrivant sur {slug}.quotation.com
WHEN   le proxy Next.js s'exécute
THEN   il appelle resolveTenantByHost(host) qui :
       1. extrait le slug du Host header (ex: "acme.quotation.com" → "acme")
       2. ignore localhost / l'apex domain (quotation.com) → retourne null (pas un tenant)
       3. lit le tenant depuis un cache mémoire TTL 5 min (Map slug→tenant + null-cache)
       4. sur miss, requête DB via Drizzle : SELECT * FROM tenants WHERE slug = ? AND status IN ('active','trial','suspended')
       5. cache le résultat (y compris null pour slug inexistant — éviter la famine DB)
       6. expose le tenant_id via un header de requête `x-tenant-id` propagé au serveur
AND    la fonction est testable unitairement (pure pour l'extraction du slug, DB mockée pour la lookup)
```

**AC7 — Enforcement du statut tenant dans le proxy**

```
GIVEN  un tenant résolu avec status = 'cancelled'
WHEN   la requête n'est pas sur /subscription-expired ni /api/auth ni un asset statique
THEN   le proxy retourne NextResponse.redirect("/subscription-expired")

GIVEN  un tenant résolu avec status = 'suspended'
WHEN   la requête vise une route applicative protégée
THEN   le proxy retourne NextResponse.redirect("/subscription-expired")
       (la page /subscription-expired autorise lecture mais pas mutation — enforcement read-only
        des mutations se fait dans les API routes, story 7-5 ; ici seul le redirect est en scope)

GIVEN  un tenant résolu avec status = 'active' OU 'trial'
WHEN   subscriptionEnd < now() + gracePeriodEndsAt (en période de grâce)
THEN   le proxy ne redirige PAS (accès maintenu) mais pose un header `x-tenant-grace: <ISO date>`
       consommé par le layout client pour afficher une bannière (UI = story 7-5 ; header posé ici)
```

**AC8 — Page `/subscription-expired`**

```
GIVEN  la route /subscription-expired (page Server Component publique)
WHEN   un tenant suspendu/annulé y est redirigé
THEN   la page affiche :
       - message "Votre abonnement Quotation Logistique a expiré."
       - date d'expiration du tenant (lue via le header x-tenant-id ou ré-lookup DB)
       - contact owner (WhatsApp / email — configuré via variable d'env OWNER_CONTACT)
       - mention "Données conservées, aucune suppression"
AND    la page n'est PAS protégée par le proxy (elle doit rester accessible sans session)
AND    les textes UI proviennent de src/messages/fr-NE.json (section subscription)
```

**AC9 — Routes owner (`/owner/*`) bypass tenant resolution**

```
GIVEN  une requête sur quotation.com/owner/* (apex domain, pas de sous-domaine)
WHEN   le proxy s'exécute
THEN   la résolution de tenant est court-circuitée (pas de x-tenant-id posé)
AND    la protection de ces routes par rôle 'superadmin' est DEFERRED à la story 7-2
       (le proxy ne fait que ne PAS appliquer la logique tenant)
```

**AC10 — L'environnement de dev supporte les sous-domaines**

```
GIVEN  NEXT_PUBLIC_APP_URL=http://localhost:3000 (développement local mono-domain)
WHEN   le dev travaille en local
THEN   la résolution de tenant fonctionne via un header de test
       (ex: x-test-tenant-slug posé par un middleware de dev OU variable SUBDOMAIN_DEV_MODE=1)
       pour simuler {slug}.localhost sans configurer *.localhost DNS
AND    en production (NEXT_PUBLIC_APP_URL=https://*.quotation.com), c'est le Host header réel qui est lu
AND    ce mode dev est documenté dans la dev note et testé
```

**AC11 — Qualité & tests**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur (migration incluse dans le build)
AND    tests unitaires (Vitest) couvrent :
       - resolveTenantByHost : extraction slug ✓, apex ignoré ✓, localhost ignoré ✓
       - cache TTL + null-cache ✓
       - décision enforcement : cancelled → redirect, suspended → redirect, active/trial → next ✓
       - détection période de grâce ✓
AND    tests E2E (Playwright) couvrent :
       - tenant actif accède à l'app normalement
       - tenant suspendu est redirigé vers /subscription-expired
       - page /subscription-expired s'affiche sans session
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/schema.ts` — UPDATE : ajouter enums `tenantStatusEnum`, `tenantPlanEnum`, `paymentMethodEnum`, `billingCycleEnum` + tables `tenants`, `subscription_payments`, `tenant_events` ; ajouter `tenantId` sur `user`
- `drizzle/` — générer + committer la migration (numéro suivant ≥ 0014)
- `src/lib/tenants/tenant-config.ts` — CRÉER : `DEFAULT_TRIAL_DAYS = 14`, `DEFAULT_GRACE_PERIOD_DAYS = 7`, `PLAN_LIMITS` (free:1, pro:5, enterprise:20), `TENANT_STATUS_VALUES`
- `src/lib/tenants/resolve-tenant.ts` — CRÉER : `resolveTenantByHost(host, db)`, `extractSlugFromHost(host)`, cache mémoire TTL 5 min (Map + null-cache)
- `src/lib/tenants/tenant-enforcement.ts` — CRÉER : `enforceTenantAccess(tenant, now)` retourne `{ action: "allow" | "redirect", redirectPath?, graceEndsAt? }`
- `src/proxy.ts` — UPDATE : ajouter la résolution de sous-domaine + enforcement avant la logique auth existante ; matcher reste sur les routes protégées + ajoute `/subscription-expired` en exclusion
- `src/app/subscription-expired/page.tsx` — CRÉER : page Server Component publique (affiche message + contact owner)
- `src/lib/tenants/resolve-tenant.test.ts` — CRÉER : tests unitaires extraction slug + cache
- `src/lib/tenants/tenant-enforcement.test.ts` — CRÉER : tests unitaires décision enforcement
- `tests/e2e/tenant-subdomain.spec.ts` — CRÉER : E2E Playwright (tenant actif / suspendu / page expiration)
- `src/messages/fr-NE.json` — UPDATE : ajouter section `subscription` (clés page expiration + bannière grâce)
- `env.example` — UPDATE : ajouter `OWNER_CONTACT` (WhatsApp/email affiché aux tenants suspendus), `SUBDOMAIN_DEV_MODE` (optionnel)

**EXCLU (ne pas modifier — hors périmètre) :**
- `src/app/(app)/layout.tsx` — la bannière de grâce est UI = story 7-5 (cette story ne fait que POSER le header `x-tenant-grace`)
- `/owner/*` routes — créées en story 7-2 (cette story ne fait que bypass la résolution tenant pour `/owner/*`)
- Création de tenant + email bienvenue — story 7-3
- Enregistrement de paiement — story 7-4
- Cron expiration + rappels — story 7-6
- Le seam `companyId` existant sur les tables domaines — inchangé (voir Dev Notes : mapping tenant↔company)
- RBAC rôle `superadmin` — extension du enum `userRoleEnum` DEFERRED à story 7-2

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `src/lib/schema.ts` : enums + tables

- [x] Définir les nouveaux enums (à placer près des enums existants en haut) :
  ```ts
  export const tenantStatusEnum = pgEnum("tenant_status", ["active", "trial", "suspended", "cancelled"]);
  export const tenantPlanEnum = pgEnum("tenant_plan", ["free", "pro", "enterprise"]);
  export const paymentMethodEnum = pgEnum("payment_method", ["nitta", "wave", "amana", "stripe", "cash", "virement"]);
  export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);
  ```
- [x] Ajouter la table `tenants` (conventions : `uuid` PK, snake_case, timestamps standards) :
  ```ts
  export const tenants = pgTable(
    "tenants",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      name: text("name").notNull(),
      slug: text("slug").notNull().unique(),
      status: tenantStatusEnum("status").notNull().default("trial"),
      plan: tenantPlanEnum("plan").notNull().default("free"),
      subscriptionStart: date("subscription_start", { mode: "date" }),
      subscriptionEnd: date("subscription_end", { mode: "date" }),
      trialEndsAt: date("trial_ends_at", { mode: "date" }),
      gracePeriodEndsAt: date("grace_period_ends_at", { mode: "date" }),
      maxUsers: integer("max_users").notNull().default(3),
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
      updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    },
    (t) => [
      unique("tenants_slug_unique").on(t.slug),
      index("idx_tenants_status").on(t.status),
    ]
  );
  ```
  Note : `date()` avec `mode: "date"` retourne un objet `Date` JS (préférable pour les comparaisons). Vérifier la cohérence avec le reste du schéma qui utilise `timestamp()` — pour les dates calendaires (start/end), `date` est correct.
- [x] Ajouter la table `subscription_payments` :
  ```ts
  export const subscriptionPayments = pgTable(
    "subscription_payments",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      tenantId: uuid("tenant_id")
        .notNull()
        .references(() => tenants.id, { onDelete: "cascade" }),
      amount: integer("amount").notNull(), // FCFA, jamais float
      currency: text("currency").notNull().default("XOF"),
      paymentMethod: paymentMethodEnum("payment_method").notNull(),
      paymentReference: text("payment_reference"),
      paidAt: timestamp("paid_at").notNull(),
      periodStart: date("period_start", { mode: "date" }).notNull(),
      periodEnd: date("period_end", { mode: "date" }).notNull(),
      billingCycle: billingCycleEnum("billing_cycle").notNull(),
      confirmedBy: text("confirmed_by").notNull(), // superadmin user_id
      notes: text("notes"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
      index("idx_subscription_payments_tenant_id").on(t.tenantId),
      index("idx_subscription_payments_paid_at").on(t.paidAt),
    ]
  );
  ```
- [x] Ajouter la table `tenant_events` (append-only, pas de revision/updatedAt) :
  ```ts
  export const tenantEvents = pgTable(
    "tenant_events",
    {
      id: uuid("id").primaryKey().defaultRandom(),
      tenantId: uuid("tenant_id")
        .notNull()
        .references(() => tenants.id, { onDelete: "cascade" }),
      eventType: text("event_type").notNull(),
      // valeurs attendues : 'created' | 'activated' | 'suspended' | 'reactivated'
      // | 'cancelled' | 'payment_recorded' | 'plan_changed' | 'user_added' | 'reminder_sent'
      actorId: text("actor_id").notNull(), // superadmin user_id
      before: jsonb("before"),
      after: jsonb("after"),
      note: text("note"),
      createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
      index("idx_tenant_events_tenant_id").on(t.tenantId),
      index("idx_tenant_events_created_at").on(t.createdAt),
    ]
  );
  ```
- [x] Ajouter `tenantId` sur la table `user` (Better Auth — text PK, ne pas changer l'ID) :
  ```ts
  // dans la définition de user, après companyId :
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  ```
  Et dans le bloc d'index de `user` :
  ```ts
  index("user_tenant_id_idx").on(table.tenantId),
  ```

### T2 — Générer + appliquer la migration

- [x] `pnpm db:generate` — vérifier que le fichier `drizzle/0014_*.sql` est créé et contient CREATE TABLE tenants/subscription_payments/tenant_events + ALTER TABLE user ADD COLUMN tenant_id
- [x] Vérifier visuellement le SQL généré (FK, indexes, defaults)
- [x] `pnpm db:migrate` — appliquer sur la DB Docker locale
- [x] `pnpm typecheck` — zéro erreur

### T3 — Créer `src/lib/tenants/tenant-config.ts`

- [x] Constantes business du spec Epic 7 §7 :
  ```ts
  export const DEFAULT_TRIAL_DAYS = 14;
  export const DEFAULT_GRACE_PERIOD_DAYS = 7;

  export type TenantPlan = "free" | "pro" | "enterprise";
  export type TenantStatus = "active" | "trial" | "suspended" | "cancelled";

  export const PLAN_LIMITS: Record<TenantPlan, { maxUsers: number }> = {
    free: { maxUsers: 1 },
    pro: { maxUsers: 5 },
    enterprise: { maxUsers: 20 },
  };

  // Domaine apex — pour détecter qu'on n'est PAS sur un sous-domaine tenant
  export const APEX_DOMAIN = process.env.APEX_DOMAIN ?? "quotation.com";
  ```
  Ne PAS dupliquer `PLAN_PRICES_XOF` ici (utilisé en story 7-4 paiements + 7-12 settings). Le mettre dans un fichier séparé plus tard si besoin.
- [x] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/lib/tenants/resolve-tenant.ts`

- [x] Fonction pure d'extraction du slug (testable sans DB) :
  ```ts
  export function extractSlugFromHost(host: string, apexDomain: string): string | null {
    // host = "acme.quotation.com" ou "acme.localhost:3000" ou "quotation.com" ou "localhost:3000"
    const h = host.split(":")[0] ?? host; // retire le port
    if (h === "localhost" || h === apexDomain || h === "www." + apexDomain) return null;
    const parts = h.split(".");
    // {slug}.quotation.com → 3 parts ; {slug}.localhost → 2 parts (dev)
    if (h.endsWith("." + apexDomain) && parts.length === 3) {
      return parts[0] ?? null;
    }
    // mode dev : {slug}.localhost
    if (h.endsWith(".localhost") && parts.length === 2) {
      return parts[0] ?? null;
    }
    return null;
  }
  ```
- [x] Cache mémoire TTL 5 min (Map + null-cache pour éviter la famine DB sur slug inexistants) :
  ```ts
  interface CacheEntry { tenant: TenantLookupResult | null; expiresAt: number; }
  const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;
  const cache = new Map<string, CacheEntry>();
  ```
- [x] Fonction `resolveTenantByHost(host, dbClient)` :
  1. extraire slug via `extractSlugFromHost`
  2. si slug null → retourner `{ kind: "no-tenant" }` (apex/localhost)
  3. checker le cache ; si frais → retourner l'entrée (même null)
  4. sinon requête DB : `SELECT * FROM tenants WHERE slug = ? AND status IN ('active','trial','suspended')` (cancel = comme inexistant pour l'accès client)
  5. mettre en cache (y compris null)
  6. retourner `{ kind: "tenant", tenant } | { kind: "not-found" }`
- [x] Exporter une fonction `clearTenantCache()` pour les tests
- [x] `pnpm typecheck` — zéro erreur

### T5 — Créer `src/lib/tenants/tenant-enforcement.ts`

- [x] Fonction pure `enforceTenantAccess(tenant, now = new Date())` :
  ```ts
  export type EnforcementDecision =
    | { action: "allow" }
    | { action: "allow-with-grace"; graceEndsAt: Date }
    | { action: "redirect"; redirectPath: "/subscription-expired" };

  export function enforceTenantAccess(
    tenant: { status: TenantStatus; subscriptionEnd: Date | null; gracePeriodEndsAt: Date | null },
    now: Date = new Date()
  ): EnforcementDecision {
    if (tenant.status === "cancelled") {
      return { action: "redirect", redirectPath: "/subscription-expired" };
    }
    if (tenant.status === "suspended") {
      return { action: "redirect", redirectPath: "/subscription-expired" };
    }
    // active ou trial : vérifier période de grâce
    if (tenant.subscriptionEnd) {
      const subEnd = new Date(tenant.subscriptionEnd);
      const grace = tenant.gracePeriodEndsAt ? new Date(tenant.gracePeriodEndsAt) : null;
      if (subEnd < now && grace && grace > now) {
        return { action: "allow-with-grace", graceEndsAt: grace };
      }
      // NOTE : la suspension automatique post-grâce (subEnd < now && grace < now)
      // est DEFERRED au cron story 7-6. Ici on reste permissif sur active/trial.
    }
    return { action: "allow" };
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T6 — UPDATE `src/proxy.ts` : résolution sous-domaine + enforcement

- [x] Garder la logique d'auth existante (cookie session Better Auth)
- [x] Ajouter en tête de `proxy()` : résolution du tenant depuis le Host header
  ```ts
  const host = request.headers.get("host") ?? "";
  const slug = extractSlugFromHost(host, APEX_DOMAIN);

  // 1. Routes /owner/* et apex : pas de résolution tenant
  if (!slug || request.nextUrl.pathname.startsWith("/owner")) {
    // comportement existant (auth cookie) + return
  }

  // 2. Résolution tenant + cache
  const resolved = await resolveTenantByHost(host, db);

  // 3. Exempter les routes publiques (/subscription-expired, /api/auth/*, assets statiques)
  //    du redirect (mais on pose quand même x-tenant-id si trouvé)
  const isPublicRoute =
    request.nextUrl.pathname === "/subscription-expired" ||
    request.nextUrl.pathname.startsWith("/api/auth");

  // 4. Enforcement
  if (resolved.kind === "tenant") {
    const decision = enforceTenantAccess(resolved.tenant);
    if (decision.action === "redirect" && !isPublicRoute) {
      return NextResponse.redirect(new URL("/subscription-expired", request.url));
    }
    // Propager le tenant_id + grace au serveur via headers de requête
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tenant-id", resolved.tenant.id);
    if (decision.action === "allow-with-grace") {
      requestHeaders.set("x-tenant-grace", decision.graceEndsAt.toISOString());
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  ```
- [x] Étendre le `config.matcher` pour couvrir les routes protégées existantes + s'assurer que `/subscription-expired` et `/api/auth/*` et `/owner/*` sont gérés (matcher négatif ou logique interne) :
  ```ts
  export const config = {
    matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|subscription-expired).*)"],
  };
  ```
  Note : le matcher est statiquement analysable — pas de variables dynamiques. La logique /owner/* est gérée dans le corps de `proxy()`.
- [x] Mode dev (`SUBDOMAIN_DEV_MODE=1`) : si `process.env.SUBDOMAIN_DEV_MODE === "1"`, lire le slug depuis un header de test `x-test-tenant-slug` posé par le dev (ou un query param `?_tenant=`). Documenter dans la dev note.
- [x] CRITIQUE : le proxy Next.js 16 tourne en runtime Node.js par défaut → `db` (Drizzle/pg) est utilisable SANS `runtime = "edge"`. Ne PAS ajouter de directive runtime (le code lèverait une erreur). Vérifier que `import { db } from "@/lib/db"` fonctionne dans le proxy.
- [x] Préserver la logique Better Auth cookie existante (elle s'applique après la résolution tenant pour les routes protégées par session)
- [x] `pnpm typecheck` — zéro erreur

### T7 — Créer `src/app/subscription-expired/page.tsx`

- [x] Page Server Component publique (PAS de `requireAuth()`)
- [x] Lire `x-tenant-id` header (posé par le proxy même en redirect) ou faire un lookup DB pour afficher la date d'expiration
- [x] Contenu (textes depuis `fr-NE.json` section `subscription`) :
  - Titre : "Abonnement expiré"
  - Message : "Votre abonnement Quotation Logistique a expiré."
  - Date d'expiration (si tenant trouvé)
  - Contact owner : `OWNER_CONTACT` env var (WhatsApp/email)
  - Note : "Vos données sont conservées. Aucune suppression."
- [x] `pnpm typecheck` — zéro erreur

### T8 — UPDATE `src/messages/fr-NE.json`

- [x] Ajouter section `subscription` :
  ```json
  "subscription": {
    "expired": {
      "title": "Abonnement expiré",
      "message": "Votre abonnement Quotation Logistique a expiré.",
      "expiryDate": "Date d'expiration : {date}",
      "contactOwner": "Contactez votre fournisseur pour renouveler :",
      "dataPreserved": "Vos données sont conservées. Aucune suppression."
    },
    "grace": {
      "banner": "Votre abonnement expire le {date}. Régularisez votre paiement pour éviter l'interruption."
    }
  }
  ```

### T9 — UPDATE `env.example`

- [x] Ajouter :
  ```env
  # Owner contact displayed to suspended/cancelled tenants
  OWNER_CONTACT="WhatsApp: +227 XX XX XX XX / email: contact@maigatechlab.com"
  # Apex domain for subdomain tenant resolution
  APEX_DOMAIN="quotation.com"
  # Dev mode: simulate subdomains via x-test-tenant-slug header (1=on)
  SUBDOMAIN_DEV_MODE=
  ```

### T10 — Tests unitaires Vitest

- [x] `src/lib/tenants/resolve-tenant.test.ts` :
  ```ts
  describe("extractSlugFromHost", () => {
    it("extracts slug from {slug}.quotation.com");
    it("extracts slug from {slug}.localhost:3000 (dev)");
    it("returns null for apex quotation.com");
    it("returns null for www.quotation.com");
    it("returns null for localhost:3000");
    it("returns null for IP address");
  });
  describe("resolveTenantByHost cache", () => {
    it("caches tenant for 5 min");
    it("caches null (not-found) to prevent DB starvation");
    it("clearTenantCache() resets cache");
  });
  ```
- [x] `src/lib/tenants/tenant-enforcement.test.ts` :
  ```ts
  describe("enforceTenantAccess", () => {
    it("cancelled → redirect");
    it("suspended → redirect");
    it("active without expiry → allow");
    it("trial without expiry → allow");
    it("active + subscriptionEnd in past + grace active → allow-with-grace");
    it("active + subscriptionEnd in future → allow");
  });
  ```
- [x] `pnpm check` — tous tests passent sans régression

### T11 — Tests E2E Playwright

- [x] `tests/e2e/tenant-subdomain.spec.ts` :
  - **Setup** : utiliser `SUBDOMAIN_DEV_MODE=1` + header `x-test-tenant-slug` via `page.setExtraHTTPHeaders`, ou `context.setExtraHTTPHeaders` (Playwright)
  - Scénarios :
    1. Tenant actif (`status=active`, sous-domaine valide) → accède au dashboard normalement (pas de redirect)
    2. Tenant suspendu (`status=suspended`) → redirect vers `/subscription-expired`, page s'affiche
    3. Page `/subscription-expired` accessible sans session
    4. Slug inexistant → comportement apex (pas de tenant, page d'accueil ou login)
- [x] E2E seed inline `beforeAll`/`afterAll` dans `e2e/tenant-subdomain.spec.ts` (pas de script externe)

### T12 — Vérification finale (AC11)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (393 tests, aucune régression)
- [x] `pnpm build` : passe sans erreur (migration incluse)
- [x] Logique : tenant cancelled/suspended → redirect `/subscription-expired`
- [x] Logique : tenant actif → header `x-tenant-id` propagé
- [x] Logique : période de grâce → header `x-tenant-grace` propagé
- [x] Page `/subscription-expired` accessible sans session

---

## Dev Notes

### CRITIQUE — Next.js 16 : `proxy.ts` (PAS `middleware.ts`)

En Next.js 16.0.0, le fichier `middleware.ts` est **déprécié et renommé `proxy.ts`**. Le projet utilise DÉJÀ `src/proxy.ts` avec `export async function proxy(request)` + `export const config`. Cette story UPDATE ce fichier existant — **NE PAS créer `src/middleware.ts`** (silencieusement ignoré par Next.js 16).

Source officielle : [Next.js proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) — "The `middleware` file convention is deprecated and has been renamed to `proxy`."

**Runtime :** proxy.ts en Next.js 16 **défaut au runtime Node.js** (pas Edge). C'est crucial : on PEUT importer `@/lib/db` (Drizzle + postgres) directement dans le proxy. Ne PAS ajouter `export const runtime = "edge"` (lèverait une erreur selon la doc officielle).

**Headers de requête pour propager l'info :** pattern officiel pour passer du proxy au serveur :
```ts
const requestHeaders = new Headers(request.headers);
requestHeaders.set("x-tenant-id", tenant.id);
return NextResponse.next({ request: { headers: requestHeaders } });
```
À lire côté serveur via `headers()` from `next/headers` : `const tenantId = (await headers()).get("x-tenant-id")`.

### CRITIQUE — Relation `tenants` ↔ seam existant `companyId`

**Le repository a DÉJÀ un seam multi-tenant : la colonne `companyId` (uuid)** présente sur toutes les tables domaines (`client`, `quote`, `quoteLine`, `clause`, `template`, `routeTemplate`, `auditEvent`) et sur `user.companyId`. La table `companySubscription` (story 6-2) est attachée à `companyId`.

La nouvelle table `tenants` (Epic 7) est le **nouveau root de tenancy SaaS** (un client commercial = un tenant = un sous-domaine). Décision d'implémentation pour cette story :

- **Option retenue (assumption) :** `tenants` coexiste avec `company`. Un `tenant` SaaS = un client commercial qui peut avoir 1+ `company` interne (cas multi-entités juridiques futur). Pour le MVP, **1 tenant = 1 company**, mais on ne force PAS la FK maintenant.
- Cette story n'AJOUTE QUE `user.tenant_id` (permet de lier un user client à son tenant SaaS). Le mapping `tenants.id ↔ company.company_id` et la migration des données existantes seront traités en **story 7-2** (dashboard owner) ou un script de migration dédié.
- **Le proxy pose `x-tenant-id`** mais les API routes existantes continuent de lire `session.user.companyId`. Aucun changement au scoping DB existant dans cette story — on pose juste l'infrastructure.

→ **Flag pour le parent :** confirmer la sémantique tenant↔company avant la story 7-2. Le spec Epic 7 ne mentionne pas explicitement le mapping avec le seam `companyId` existant.

### CRITIQUE — Conflit de noms de tiers

**Story 6-2** a créé l'enum `tierEnum = ["starter", "pro", "entreprise"]` sur `companySubscription.tier`.
**Epic 7** utilise l'enum `tenantPlanEnum = ["free", "pro", "enterprise"]` sur `tenants.plan`.

Ce sont **DEUX enums sur DEUX tables différentes** (tiers existant pour la facturation interne MVP, plan SaaS pour l'abonnement). Ils cohabitent mais ne sont PAS alignés (`starter` vs `free`, `entreprise` vs `enterprise`). Cette story ne touche PAS à `tierEnum`/`companySubscription` — elle crée juste le nouveau `tenantPlanEnum`.

→ **Flag pour le parent :** décider en story 7-2 ou 7-12 si on unifie les deux (migration de `starter→free`, `entreprise→enterprise`) ou si on garde deux systèmes. Le spec Epic 7 §7 donne les prix en `free/pro/enterprise`.

### CRITIQUE — Rôle `superadmin` absent de l'enum

`userRoleEnum = pgEnum("user_role", ["admin", "commercial", "operateur"])`. Le spec Epic 7 §3 nécessite un rôle `superadmin` pour les routes `/owner/*`. **Cette story ne modifie PAS l'enum** (les routes `/owner/*` ne sont créées qu'en 7-2). Mais le dev doit savoir que `confirmedBy`/`actorId` (sur `subscription_payments`/`tenant_events`) est un `text` user_id qui référencera un futur superadmin. Pour les tests E2E, seed un user avec `role = "admin"` temporairement (le bypass rôle est DEFERRED à 7-2).

→ **Flag pour le parent :** story 7-2 devra étendre `userRoleEnum` pour ajouter `superadmin`.

### CRITIQUE — Mode dev pour les sous-domaines

En local (`NEXT_PUBLIC_APP_URL=http://localhost:3000`), le navigateur ne résout pas `*.localhost` sans configuration. Solution implémentée (AC10) :

```ts
// Dans resolve-tenant.ts, support dual :
// - Production : host réel "acme.quotation.com"
// - Dev : SUBDOMAIN_DEV_MODE=1 + header x-test-tenant-slug posé par Playwright ou curl
if (process.env.SUBDOMAIN_DEV_MODE === "1") {
  const testSlug = request.headers.get("x-test-tenant-slug");
  if (testSlug) slug = testSlug;
}
```

Alternative possible : `*.localhost` marche si on accède à `http://acme.localhost:3000` (Chrome/Firefox le résolvent en 127.0.0.1). Documenter les deux approches dans la dev note du proxy.

### CRITIQUE — Null-cache pour éviter la famine DB

Sans null-cache, chaque requête sur un slug inexistant (typo, scan) hit la DB. Le cache DOIT cacher `null` pour `slug → not-found` avec le même TTL de 5 min. Pattern :

```ts
cache.set(slug, { tenant: null, expiresAt: Date.now() + TTL });
```

### CRITIQUE — `status = 'cancelled'` : traité comme inexistant ?

Choix d'implémentation : dans `resolveTenantByHost`, la requête DB filtre `status IN ('active', 'trial', 'suspended')`. Un tenant `cancelled` n'est PAS résolu → traité comme `not-found` (pas de `x-tenant-id`). Mais alors le redirect `/subscription-expired` ne se déclenche pas (pas de tenant → pas d'enforcement).

**Alternative (assumption retenue) :** inclure `cancelled` dans la résolution, et laisser `enforceTenantAccess` faire le redirect. Modifier la requête :
```sql
WHERE slug = ? AND status IN ('active', 'trial', 'suspended', 'cancelled')
```
Et `enforceTenantAccess` retourne `redirect` pour `cancelled` ET `suspended`. C'est plus robuste. Le dev DOIT appliquer cette version (AC6 liste les 3 statuts, mais AC7 exige le redirect sur cancelled — donc la résolution DOIT l'inclure).

### CRITIQUE — `exactOptionalPropertyTypes` (TS 5.9.3)

Les colonnes nullables (`subscriptionEnd`, `trialEndsAt`, `gracePeriodEndsAt`, `notes`, `before`, `after`) retournent `T | null` depuis Drizzle. Utiliser `?? null` à la sérialisation JSON et le pattern conditionnel pour l'assignation :
```ts
if (tenant.gracePeriodEndsAt != null) headers.set("x-tenant-grace", ...);
```

### CRITIQUE — Matcher statique

`config.matcher` est **analysé à la compilation** — pas de variables. Utiliser une regex négative littérale :
```ts
matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|subscription-expired|owner).*)"],
```
Attention : `/owner` est dans le négatif lookahead car la logique tenant est court-circuitée pour ces routes (AC9). Mais la protection PAR RÔLE de `/owner/*` est DEFERRED à 7-2 — pour l'instant `/owner/*` est public (page placeholder à créer ou 404).

### Pattern existant à réutiliser

- `src/proxy.ts` (proxy Next.js 16 existant) — logique cookie Better Auth à préserver
- `src/lib/schema.ts` — conventions Drizzle (`uuid().primaryKey().defaultRandom()`, `timestamp().defaultNow().notNull()`, indexes)
- `src/lib/db.ts` — client Drizzle `db` à importer dans le proxy
- `src/messages/fr-NE.json` — section `subscription` à ajouter (pattern next-intl existant)
- `src/app/(auth)/` — structure des pages publiques (login/register) à imiter pour `/subscription-expired`

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Créer `src/middleware.ts` (déprécié en Next.js 16) | UPDATE `src/proxy.ts` existant |
| Ajouter `export const runtime = "edge"` dans proxy | Runtime Node.js par défaut (Drizzle utilisable) |
| `pnpm db:push` pour la migration | `pnpm db:generate` + `pnpm db:migrate` |
| Mettre un enum `superadmin` dans `userRoleEnum` maintenant | DEFERRED à story 7-2 |
| Scoper les queries DB existantes par `tenant_id` dans cette story | Garder `companyId` ; scoping DB DEFERRED (cette story pose juste l'infra proxy) |
| Cacher seulement les tenants trouvés (pas null) | Null-cache obligatoire (anti-famine) |
| Filtrer `cancelled` dans resolveTenantByHost | L'inclure + laisser enforceTenantAccess rediriger |
| Variables dynamiques dans `config.matcher` | Regex littérale négative |
| Hardcoder du texte FR dans `/subscription-expired` | Clés `fr-NE.json` section `subscription` |
| Stoker amount en `real`/float | `integer` (FCFA entier, cf money.ts) |

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Après modification du schéma
pnpm db:generate   # crée drizzle/0014_*.sql (ou suivant)
pnpm db:migrate    # applique

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build (inclut db:migrate)
pnpm build   # passe sans erreur

# 5. Dev local avec sous-domaines
SUBDOMAIN_DEV_MODE=1 pnpm dev
# Tester : curl -H "x-test-tenant-slug: acme" http://localhost:3000/dashboard
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §2 schéma, §4 enforcement, §7 paramètres (PLAN_LIMITS, trial/grace days, prices)
- [Next.js 16 proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) — `proxy.ts` remplace `middleware.ts` ; runtime Node.js par défaut
- [CLAUDE.md] — conventions DB (uuid custom tables, text Better Auth), migration workflow
- [project-context.md] — règles Drizzle, TypeScript strict, patterns API/i18n
- [src/proxy.ts] — proxy existant (cookie Better Auth) à étendre
- [src/lib/schema.ts] — schéma Drizzle complet (ajouter tenants + payment + events + user.tenantId)
- [src/lib/db.ts] — client Drizzle `db`
- [src/lib/session.ts] — patterns session (`requireAuth`, `getOptionalSession`)
- [src/lib/auth.ts] — Better Auth config (plugins audit, lockout)
- [Story 6-2] `_bmad-output/implementation-artifacts/6-2-tier-quota-enforcement.md` — pattern `companySubscription`, enums `tierEnum` (conflit de noms à noter)
- [Story 6-3] `_bmad-output/implementation-artifacts/6-3-immutable-audit-trail-export.md` — pattern table append-only (`audit_event`, similaire à `tenant_events`)

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`)

**Epic 7 :** Owner Panel & Gestion des abonnements SaaS — Post-MVP. Dépendances : Epic 1 (auth/rôles, DONE), Epic 6.2 (quota enforcement, DONE).

**Story 7.1 (P0) est le socle technique** : sans le schéma `tenants` et le proxy de résolution de sous-domaine, aucune des 11 autres stories de l'épic n'est implémentable. Cette story pose l'infrastructure multi-tenant SaaS.

**Modèle de tenancy retenu (§1) :** Multi-tenant SaaS avec sous-domaine par client. Un seul déploiement Next.js, chaque client → `{slug}.quotation.com`, Vercel wildcard domain.

### Stories de l'Epic 7 (cross-context)

| ID | Titre | Dépendance vers 7-1 |
|----|-------|---------------------|
| 7.1 | **Schema tenants + middleware subdomain routing** | — (cette story) |
| 7.2 | Dashboard overview owner + liste tenants | Utilise `tenants`, `subscription_payments` ; étend `userRoleEnum` pour superadmin |
| 7.3 | Création manuelle tenant + email bienvenue | Insère dans `tenants` + crée user avec `tenant_id` + log `tenant_events` |
| 7.4 | Enregistrement paiement (mobile money) | Insère `subscription_payments` + log event |
| 7.5 | Suspension manuelle + page expiration tenant | UPDATE `tenants.status` + bannière grâce (lit header `x-tenant-grace`) |
| 7.6 | Cron expiration + rappels automatiques | UPDATE `tenants.status` + log events |
| 7.7 | Fiche tenant complète (onglets) | Lit `tenants` + `subscription_payments` + `tenant_events` |
| 7.8 | Réactivation après paiement | UPDATE `tenants.status` |
| 7.9 | Gestion utilisateurs par tenant | Lit/écrit `user.tenant_id` + `PLAN_LIMITS.maxUsers` |
| 7.10 | Stripe webhook auto-activation | Insère `tenants`/`subscription_payments` automatiquement |
| 7.11 | Rapports & export comptabilité | Agrège `subscription_payments` |
| 7.12 | Paramètres plateforme | Override `DEFAULT_TRIAL_DAYS`, `PLAN_LIMITS`, prices |

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

`PLAN_PRICES_XOF` est utilisé en stories 7-4/7-12 (hors scope 7-1) — ne pas implémenter ici, juste documenter.

---

## Architecture Compliance

| Contrainte | Conformité story 7-1 |
|---|---|
| Next.js 16 App Router + proxy.ts | ✅ UPDATE `src/proxy.ts` (middleware.ts déprécié) |
| Runtime Node.js par défaut pour proxy | ✅ Aucune directive runtime (Drizzle utilisable) |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | ✅ Guards `?? null`, pattern conditionnel |
| Drizzle : uuid() pour custom tables, text pour Better Auth | ✅ `tenants`/`subscription_payments`/`tenant_events` = uuid ; `user.tenantId` = uuid FK ; `confirmedBy`/`actorId` = text (user_id Better Auth) |
| Migration workflow : `db:generate` + `db:migrate` (jamais push) | ✅ T2 |
| next-intl : UI strings dans `fr-NE.json` | ✅ Section `subscription` ajoutée |
| API envelope : `apiError()` | N/A (pas de nouvelle API route dans cette story) |
| Indexes sur colonnes filtrées | ✅ `tenants.slug` unique, `status`, `tenantId`, `paidAt`, `createdAt` |
| Money : integer FCFA (jamais float) | ✅ `subscription_payments.amount` integer |
| Audit : append-only (pas revision/updatedAt) | ✅ `tenant_events` (pattern `audit_event` story 6-3) |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-1 |
|---|---|---|
| `next` | 16.1.6 | `proxy.ts`, `NextResponse`, `NextRequest` |
| `drizzle-orm` | 0.44.7 | Tables, enums, `date({ mode: "date" })`, `timestamp` |
| `postgres` / `pg` | 3.4.9 / 8.20.0 | Client DB (utilisé via `src/lib/db.ts`) |
| `better-auth` | 1.6.11 | `getSessionCookie` (déjà dans proxy.ts, préserver) |
| `next-intl` | 4.13.0 | `getTranslations` pour `/subscription-expired` page |
| `vitest` | 4.1.9 | Tests unitaires `resolve-tenant` + `tenant-enforcement` |
| `@playwright/test` | 1.61.0 | E2E tenant subdomain |

Aucune nouvelle dépendance à installer.

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `src/lib/schema.ts` | **UPDATE** | Ajout 4 enums + 3 tables + `user.tenantId` |
| `drizzle/0014_*.sql` | **NEW** (généré) | Migration DDL |
| `src/lib/tenants/tenant-config.ts` | **NEW** | Constantes business (trial, grace, PLAN_LIMITS, APEX_DOMAIN) |
| `src/lib/tenants/resolve-tenant.ts` | **NEW** | `extractSlugFromHost`, `resolveTenantByHost` + cache |
| `src/lib/tenants/tenant-enforcement.ts` | **NEW** | `enforceTenantAccess` (pure) |
| `src/lib/tenants/resolve-tenant.test.ts` | **NEW** | Tests unitaires |
| `src/lib/tenants/tenant-enforcement.test.ts` | **NEW** | Tests unitaires |
| `src/proxy.ts` | **UPDATE** | Résolution sous-domaine + enforcement (préserver auth Better Auth) |
| `src/app/subscription-expired/page.tsx` | **NEW** | Page publique Server Component |
| `src/messages/fr-NE.json` | **UPDATE** | Section `subscription` |
| `env.example` | **UPDATE** | `OWNER_CONTACT`, `APEX_DOMAIN`, `SUBDOMAIN_DEV_MODE` |
| `tests/e2e/tenant-subdomain.spec.ts` | **NEW** | E2E Playwright |
| `tests/fixtures/seed-tenants.ts` | **NEW** (optionnel) | Seed tenants de test pour E2E |

**Ne PAS modifier :** `src/lib/schema.ts` `companySubscription`/`tierEnum` (story 6-2), `src/lib/permissions.ts`, `userRoleEnum` (DEFERRED 7-2), les API routes existantes, le seam `companyId`.

---

## Testing Requirements

### Tests unitaires (Vitest)

- `resolve-tenant.test.ts` :
  - `extractSlugFromHost` : 6+ cas (slug valide, apex, www, localhost, IP, port)
  - Cache : TTL, null-cache, `clearTenantCache()`
  - `resolveTenantByHost` : mock `db`, vérifier requête Drizzle (slug + statuts)
- `tenant-enforcement.test.ts` :
  - Les 4 statuts (`active`, `trial`, `suspended`, `cancelled`)
  - Période de grâce : `subscriptionEnd < now < gracePeriodEndsAt`
  - Dates null (trial sans end)

### Tests E2E (Playwright)

- `tenant-subdomain.spec.ts` :
  - Tenant actif → accès normal (pas de redirect)
  - Tenant suspendu → redirect `/subscription-expired`
  - Tenant annulé → redirect `/subscription-expired`
  - Page `/subscription-expired` sans session → 200
  - Header `x-tenant-id` propagé (vérifier via une route de debug temporaire ou via le rendu)
  - Mode dev : `SUBDOMAIN_DEV_MODE=1` + `x-test-tenant-slug` header

### Seeding

- Créer `tests/fixtures/seed-tenants.ts` (ou étendre un script existant) qui insère :
  - 1 tenant `active` (slug `acme-active`)
  - 1 tenant `suspended` (slug `acme-suspended`)
  - 1 tenant `cancelled` (slug `acme-cancelled`)
  - 1 tenant `trial` en période de grâce (slug `acme-grace`)

### Tests existants

- `pnpm check` doit continuer à passer : 334+ tests existants (story 6-2 a 16 tests quota, story 6-3 a tests audit). Aucune régression attendue (pas de modification du seam `companyId` ni des API routes existantes).

---

## Previous Story Intelligence

**Story 6-2 (quota enforcement) — DONE** : pattern `companySubscription` + enums. À noter le conflit de noms de tiers (`starter/pro/entreprise` vs `free/pro/enterprise`) — cette story crée un enum séparé `tenantPlanEnum`, ne PAS modifier `tierEnum`.

**Story 6-3 (audit trail) — DONE** : pattern table append-only `audit_event` (pas de revision, pas de updatedAt). La table `tenant_events` suit EXACTEMENT ce pattern. Réutiliser la même structure de colonnes `before`/`after` jsonb.

**Epic 6 entièrement DONE** (2026-06-28) — socle offline/quota/audit stable. Epic 7 est le premier post-MVP.

---

## Git Intelligence Summary

Derniers commits pertinents :
- `a637dfe` fix: /register redirect to / (was /dashboard), add logout button to parametres
- `a4f6977` feat(6-3): immutable audit trail export
- `f57a515` feat(6-2): tier quota enforcement
- `725f64b` feat(3-9/3-10/3-11/6-1): lifecycle status, search/filter, duplicate quote, IndexedDB encryption

**Pattern établi :** chaque story modifie `schema.ts`, génère une migration `drizzle/NNNN_*.sql`, ajoute les tests Vitest à côté du module, E2E Playwright dans `tests/e2e/`. Suivre ce modèle.

---

## Latest Tech Information

### Next.js 16 — `proxy.ts` remplace `middleware.ts`

Source : [Next.js 16 proxy file convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

- **v16.0.0 (breaking) :** `middleware.ts` est déprécié et renommé `proxy.ts`. Le nom de la fonction exportée passe de `middleware` à `proxy`.
- **Runtime :** proxy.ts **défaut au runtime Node.js** (depuis v15.5.0 stable). → On peut importer Drizzle/pg SANS restriction. **Ne PAS ajouter `export const runtime`** (lève une erreur).
- **Codemod :** `npx @next/codemod@canary middleware-to-proxy .` (non nécessaire ici — `src/proxy.ts` existe déjà).
- **Headers de propagation :** `NextResponse.next({ request: { headers } })` pour passer `x-tenant-id` au serveur (lire via `await headers()` de `next/headers`).
- **Server Functions (RSC) :** un matcher qui exclut un path exclut AUSSI les Server Functions sur ce path. → Ne pas se fier au proxy seul pour la sécurité ; valider dans chaque Server Function/route. Ici OK car l'enforcement applicatif se fait dans les API routes existantes (scoping `companyId`).

### Better Auth 1.6.11 — `getSessionCookie`

`getSessionCookie(request)` (de `better-auth/cookies`) vérifie l'existence du cookie de session (optimistic, pas de validation). Déjà utilisé dans `src/proxy.ts` — préserver cette logique après la résolution tenant.

### Drizzle 0.44.7 — `date({ mode: "date" })`

Pour les colonnes calendaires (`subscriptionStart`, `subscriptionEnd`, `trialEndsAt`, `gracePeriodEndsAt`, `periodStart`, `periodEnd`), utiliser `date("col", { mode: "date" })` qui retourne un objet `Date` JS (comparaisons faciles). Le reste du schéma utilise `timestamp()` pour les instants (createdAt, paidAt).

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Database Rules (Drizzle)** — conventions schema, migration workflow
- **Framework-Specific Rules (Next.js/React)** — App Router, `"use client"`, i18n next-intl
- **Quota System Rules (Story 6-2)** — référence pour la coexistence avec `companySubscription`/`tierEnum`
- **Audit Trail Rules (Story 6-3)** — référence pour le pattern append-only `tenant_events`
- **API Routes Rules** — `apiError()` (non utilisé ici mais à connaître)
- **Language Convention** — UI en français (clés `fr-NE.json`), code en anglais, DB snake_case anglais

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Import order issues: `next/**` treated as builtin group (before external). Fixed proxy.ts, page.tsx, e2e spec.
- Pre-existing lint error in `e2e/fixtures.ts:30` (Playwright `use` fixture vs react-hooks rule) — not introduced by this story.
- `tenants` table must be declared BEFORE `user` table in schema.ts to avoid TypeScript temporal dead zone error on forward FK reference.

### Completion Notes List

- T1: Added 4 enums (tenantStatusEnum, tenantPlanEnum, paymentMethodEnum, billingCycleEnum) + 3 tables (tenants, subscriptionPayments, tenantEvents) + user.tenantId FK. tenants placed before user table to resolve forward reference.
- T2: Migration 0014_married_captain_stacy.sql generated and applied. All FKs, indexes, unique constraint on slug verified in SQL.
- T3: tenant-config.ts created with DEFAULT_TRIAL_DAYS=14, DEFAULT_GRACE_PERIOD_DAYS=7, PLAN_LIMITS, APEX_DOMAIN.
- T4: resolve-tenant.ts with pure extractSlugFromHost, in-memory TTL cache (5min), null-cache anti-famine, clearTenantCache(), testSlug override for dev/E2E.
- T5: tenant-enforcement.ts pure function — cancelled/suspended→redirect, active/trial→allow, grace period→allow-with-grace. Post-grace suspension deferred to cron 7-6.
- T6: proxy.ts updated — tenant resolution + enforcement before auth check. SUBDOMAIN_DEV_MODE=1 + x-test-tenant-slug for local dev. /owner/* bypasses tenant resolution. Node.js runtime (no edge directive).
- T7: /subscription-expired/page.tsx — Server Component, reads x-tenant-id header, fetches expiry date, shows OWNER_CONTACT env var, uses fr-NE.json keys.
- T8: fr-NE.json — added subscription.expired and subscription.grace sections.
- T9: env.example — added OWNER_CONTACT, APEX_DOMAIN, SUBDOMAIN_DEV_MODE.
- T10: 25 unit tests (9 enforcement + 16 resolve-tenant). All pass.
- T11: e2e/tenant-subdomain.spec.ts — 4 scenarios with inline DB seed/teardown.
- T12: pnpm typecheck ✓ | pnpm lint (1 pre-existing error in fixtures.ts, 0 new errors) | 393 tests pass | pnpm build ✓

### File List

- `src/lib/schema.ts` — MODIFIED: added 4 enums, 3 tables (tenants/subscriptionPayments/tenantEvents), user.tenantId FK+index
- `drizzle/0014_married_captain_stacy.sql` — NEW: migration DDL
- `drizzle/meta/_journal.json` — MODIFIED: migration journal updated
- `drizzle/meta/0014_snapshot.json` — NEW: Drizzle snapshot
- `src/lib/tenants/tenant-config.ts` — NEW: business constants
- `src/lib/tenants/resolve-tenant.ts` — NEW: slug extraction + tenant DB lookup + cache
- `src/lib/tenants/tenant-enforcement.ts` — NEW: pure enforcement decision function
- `src/lib/tenants/resolve-tenant.test.ts` — NEW: 16 unit tests
- `src/lib/tenants/tenant-enforcement.test.ts` — NEW: 9 unit tests
- `src/proxy.ts` — MODIFIED: multi-tenant subdomain resolution + enforcement
- `src/app/subscription-expired/page.tsx` — NEW: public expired page
- `src/messages/fr-NE.json` — MODIFIED: subscription.expired + subscription.grace sections
- `env.example` — MODIFIED: OWNER_CONTACT, APEX_DOMAIN, SUBDOMAIN_DEV_MODE
- `e2e/tenant-subdomain.spec.ts` — NEW: E2E Playwright tenant routing tests
- `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — MODIFIED: task checkboxes + dev agent record

### Review Findings

_À remplir après code-review._

### Change Log

- Story 7-1 créée : schema tenants + middleware subdomain routing — Epic 7 §2 + §4 (Date: 2026-06-28)
- Story 7-1 implémentée : tous les ACs satisfaits, 393 tests passent, build ✓ (Date: 2026-06-28)
- Code review fixes appliqués : H1 (strip headers spoofable), M3 (E2E titre honnête + URL assertion précise /login/), M4 (lint gate fixé — 0 erreurs) (Date: 2026-06-28)
- Dette explicite H2 : isolation user.tenantId === resolvedTenant.id NON implémentée dans le proxy. Le proxy fournit le contexte de routing uniquement (x-tenant-id). L'isolation par membership utilisateur est responsabilité des server components / API routes et sera appliquée en story 7-2 via requireTenantSession(). Risque limité en 7-1 car les API routes utilisent encore companyId pour le scoping DB.
