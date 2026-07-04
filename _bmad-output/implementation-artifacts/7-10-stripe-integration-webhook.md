---
story_key: 7-10-stripe-integration-webhook
epic_num: 7
story_num: 10
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (schema tenants/subscription_payments/tenant_events + user.tenantId + enums tenant_plan/payment_method/billing_cycle + tenant-config.ts PLAN_PRICES_XOF/PLAN_LIMITS/APEX_DOMAIN) — HARD"
  - "7-3-create-tenant-welcome-email (helpers generatePassword/buildWelcomeEmailHtml/Text + createTenantWithAdmin pattern signUp + rollback + TenantConflictError) — HARD (REUSE direct)"
  - "7-4-record-payment-mobile-money (helpers calculatePeriodFromCycle + recordPayment pattern db.transaction FOR UPDATE + payment_recorded event) — HARD (REUSE direct)"
  - "7-8-reactivation-after-payment (helper reactivateTenantWithPayment + covering-payment guard) — HARD (REUSE pour renewal)"
---

# Story 7.10 : Intégration Stripe (webhook auto-activation)

**Statut :** done

## Story

**En tant que** client international souhaitant souscrire à Quotation Logistique en autonomie,
**Je veux** choisir un plan (`pro` ou `enterprise`) et un cycle (`monthly`/`annual`) sur une page publique `/checkout`, payer par carte/SEPA via Stripe (en EUR), puis que mon tenant + compte admin soient **créés et activés automatiquement** par un webhook Stripe — sans intervention manuelle du owner,
**Afin que** l'auto-activation post-Stripe (Epic 7 §5, §3.4 Phase 2) délivre une expérience self-service immédiate : tenant actif, admin provisionné, email de bienvenue envoyé, paiement encaissé tracé en FCFA, et que les **renouvellements** ré-activent/prolongent le tenant existant au lieu de le dupliquer.

> **Source autoritaire :** `Docs/business/owner-subscription-management.md` — §5 « Flux Stripe (international) », §2 `payment_method` enum inclut `'stripe'`, §7 (Stripe EUR = devise principale ; prix XOF = référence commerciale ; `PLAN_PRICES_XOF` free/pro/enterprise monthly/annual), §3.4 provisioning Phase 2 = cette story.
>
> **Note Epic 7 :** Epic 7 n'est **pas** dans `_bmad-output/planning-artifacts/epics.md`. Le brainstorming `Docs/business/owner-subscription-management.md` est la source épique. **Pas de superadmin** ici : le webhook est un acteur **système** (pas de session propriétaire).

---

## Critères d'acceptation (BDD)

**AC1 — Page publique `/checkout` (plan + cycle + EUR)**

```
GIVEN  un visiteur non authentifié sur /checkout (page PUBLIQUE, hors /owner)
THEN   la page affiche :
       - Un sélecteur de plan : "Pro" (25 000 XOF/mois | 250 000 XOF/an) OU "Enterprise" (75 000 XOF/mois | 750 000 XOF/an)
       - Le plan "Free" N'EST PAS proposé (pas de checkout pour free — 0 XOF)
       - Un sélecteur de cycle : "Mensuel" | "Annuel" (remise ~2 mois offerts affichée)
       - Pour chaque (plan, cycle) : le prix affiché EN EUR (conversion XOF→EUR depuis une constante de référence) ET le prix de référence XOF
       - Champs collectés : Email admin, Nom de la société (→ raison sociale + base du slug), Nom complet admin
       - Un bouton "Payer avec Stripe" qui crée une Checkout Session et redirige vers Stripe
AND    la page est rendue en Server Component (FR labels via getTranslations("checkout")), formulaire contrôlé en Client Component

GIVEN  un visiteur soumet le formulaire /checkout avec plan="free"
THEN   la validation refuse (Zod enum ["pro","enterprise"]) — Free n'a pas de checkout
AND    aucun appel Stripe n'est effectué

GIVEN  un visiteur soumet sans email valide ou sans nom de société
THEN   erreurs FR en ligne, aucune création de Checkout Session
```

**AC2 — Création de la Stripe Checkout Session (server-side, EUR, metadata riche)**

```
GIVEN  un visiteur soumet /checkout avec plan="pro", cycle="monthly", email="a@b.com", company="ACME Logistics", name="Awa"
WHEN   l'API POST /api/v1/checkout/create-session exécute createCheckoutSession()
THEN   une Stripe Checkout Session est créée via l'API Stripe (stripe.checkout.sessions.create) avec :
       - mode: "payment" (paiement unique — MVP ; subscriptions Stripe = hors scope, cf. Dev Notes)
       - currency: "eur"
       - line_items: 1 ligne (prix EUR calculé depuis PLAN_PRICES_XOF × XOF_TO_EUR_RATE, arrondi)
       - customer_email: "a@b.com"
       - metadata (CRUCIAL — porté jusqu'au webhook) :
           * plan: "pro"
           * billing_cycle: "monthly"
           * amount_xof: "25000"        (entier FCFA — valeur stockée au paiement)
           * amount_eur: "38"           (entier EUR — pour audit)
           * company_name: "ACME Logistics"
           * admin_name: "Awa"
           * admin_email: "a@b.com"
       - success_url: "{APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}"
       - cancel_url:  "{APP_URL}/checkout?canceled=1"
AND    l'API retourne 200 { url: session.url } et le client redirige vers Stripe (window.location = url)
AND    AUCUN tenant n'est créé à ce stade (création = webhook uniquement)
```

> **Décision assumée :** mode `payment` (paiement unique) plutôt que mode `subscription` Stripe. Le cycle monthly/annual est géré applicativement (cron 7-6 rappelle le client avant expiration ; le client repasse /checkout pour renouveler). Le webhook gère les renouvellements comme de nouveaux paiements couvrants (AC6). Voir Dev Notes — Décisions.

**AC3 — Webhook `/api/webhooks/stripe` — signature verification + raw body**

```
GIVEN  Stripe envoie un événement POST /api/webhooks/stripe
THEN   le handler récupère le RAW body via `await req.text()` (PAS req.json() — signature calculée sur bytes bruts)
AND    récupère le header `stripe-signature`
AND    appelle stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
       (lève StripeSignatureVerificationError si signature invalide)

GIVEN  un POST /api/webhooks/stripe sans header stripe-signature OU avec signature invalide
WHEN   constructEvent lève
THEN   le handler retourne 400 BAD_REQUEST { error: "Invalid signature" }
AND    AUCUNE mutation DB n'est effectuée
AND    l'erreur est loggée (console.error — sans le raw body)

GIVEN  STRIPE_WEBHOOK_SECRET n'est pas configuré (env manquant)
THEN   le handler retourne 500 INTERNAL_ERROR au démarrage du traitement (fail-fast — ne jamais accepter un webhook sans secret configuré)
```

> **CRITIQUE Next 16 :** le handler DOIT lire `await req.text()`. **NE PAS** déclarer `export const runtime`/`bodyParser` (Pages API). App Router `route.ts` donne déjà le `Request` brut — `req.text()` suffit. Ne PAS appeler `req.json()` avant `constructEvent` (verrait la signature échouer). Cf. Dev Notes — Raw body.

**AC4 — Idempotence par Stripe event id (anti re-livraison)**

```
GIVEN  Stripe livre un événement evt_A (checkout.session.completed)
WHEN   le webhook le traite pour la 1ère fois
THEN   il vérifie en DB si un tenant_events (OU une table dédiée stripe_processed_events) existe avec stripeEventId = "evt_A"
AND    si NON → traite l'événement puis persiste l'event id (dans la même transaction Drizzle que les mutations métier)
AND    si OUI (re-livraison Stripe) → retourne 200 OK SANS re-traiter (idempotent)

GIVEN  Stripe re-livre evt_A (retry réseau)
WHEN   le webhook le reçoit
THEN   il détecte evt_A déjà traité → retourne 200 immédiatement
AND    AUCUNE duplication de tenant, paiement, ou email n'est effectuée
```

> **Décision de stockage :** utiliser une **table dédiée** `stripe_processed_events(id uuid PK, eventId text UNIQUE NOT NULL, eventType text, processedAt timestamptz, tenantId uuid NULL)` — plus simple qu'une surcharge de `tenant_events` (qui est scoped-tenant, or l'idempotence doit être vérifiée AVANT de connaître le tenant). Cf. Dev Notes — Idempotence.

**AC5 — `checkout.session.completed` → création auto tenant + admin + paiement + activation + email**

```
GIVEN  un événement checkout.session.completed avec metadata.plan ∈ {pro, enterprise}, metadata.billing_cycle ∈ {monthly, annual},
       metadata.amount_xof (integer), metadata.company_name, metadata.admin_email, metadata.admin_name,
       session.customer (créé par Stripe), session.amount_total (en centimes EUR)
WHEN   le webhook exécute handleCheckoutCompleted(event)
THEN   il effectue ATOMIQUEMENT (orchestration transactionnelle type 7-3 + 7-4) :
       1. Vérifier idempotence (AC4)
       2. SELECT tenant WHERE stripe_customer_id = session.customer (idempotence business — AC6)
          → si absent : flux CRÉATION (étapes 3a-7a)
          → si présent : flux RENOUVELLEMENT (AC6)
       3a. [CRÉATION] slug depuis company_name (slugify, unicité, suffixe si collision)
       3b. INSERT tenants (status='active' — PAS 'trial', Stripe = paiement confirmé ;
             plan=metadata.plan, maxUsers=PLAN_LIMITS[plan].maxUsers,
             subscriptionStart=now, subscriptionEnd=now+cycle, trialEndsAt=NULL,
             stripeCustomerId=session.customer, stripeCheckoutSessionId=session.id)
       4a. auth.api.signUp({ body: { email: metadata.admin_email, password: generatePassword(),
             name: metadata.admin_name } }) → crée user + account (scrypt)
       5a. UPDATE user SET tenantId = <tenant.id>, role = 'admin'
       6a. INSERT subscription_payments (tenantId, amount=metadata.amount_xof, currency='XOF',
             paymentMethod='stripe', paymentReference=session.payment_intent ?? session.id,
             paidAt=now, periodStart=now, periodEnd=now+cycle, billingCycle=metadata.billing_cycle,
             confirmedBy=SYSTEM_ACTOR_ID, notes='Stripe checkout {session.id}')
       7a. (best-effort) INSERT tenant_events eventType='created' actorId=SYSTEM_ACTOR_ID
             + eventType='payment_recorded' (montant XOF, méthode stripe)
       8a. (best-effort) sendEmail(buildWelcomeEmailHtml/Text) → email de bienvenue avec URL {slug}.quotation.com + mot de passe généré
AND    si signUp échoue → rollback tenant (db.delete cascade, cf. 7-3) + marquer event id NON persisté (pour retry Stripe)
AND    si sendEmail échoue → tenant + paiement CONSERVÉS (best-effort), event inséré avec note "email échoué", emailSent=false
AND    le handler retourne 200 OK { tenantId, action: 'created', emailSent }

GIVEN  le plan est 'free' dans metadata (ne devrait pas arriver — AC1 bloque)
THEN   le webhook rejette (400) — défense en profondeur
```

> **CRITIQUE `status='active'` PAS `'trial'` :** contrairement à 7-3 (création manuelle → `trial`), ici le paiement Stripe est **déjà confirmé** → le tenant démarre **actif**, `subscriptionEnd = now + cycle`. Aucune période d'essai. Cf. Dev Notes — Status.

> **`SYSTEM_ACTOR_ID` :** le webhook n'a pas de session utilisateur. Définir une constante `SYSTEM_ACTOR_ID = "system-stripe-webhook"` (text, NON FK vers user — utiliser une valeur sentinelle). `subscription_payments.confirmedBy` et `tenant_events.actorId` reçoivent cette constante. Cf. Dev Notes — Acteur système + flag FK.

**AC6 — Renouvellement (tenant déjà existant pour ce Stripe customer) → étendre, pas dupliquer**

```
GIVEN  un événement checkout.session.completed dont session.customer correspond à un tenant EXISTANT T (stripe_customer_id match)
       (cas : client existant qui repasse /checkout pour renouveler après expiration)
WHEN   le webhook exécute handleCheckoutCompleted(event)
THEN   il NE crée PAS de nouveau tenant (idempotence business)
AND    il NE crée PAS de nouveau admin (l'admin existe déjà)
AND    il insère un nouveau subscription_payments (AC5 étape 6a — nouveau paiement pour la nouvelle période)
AND    il REACTIVATE/PROLONGE T via le helper PARTAGÉ reactivateTenantWithPayment() de 7-8 :
       - si T.status ∈ {suspended, cancelled} → status='active', subscriptionEnd=nouveau periodEnd, gracePeriodEndsAt=NULL, event 'reactivated'
       - si T.status ∈ {active, trial} → si nouveau periodEnd > T.subscriptionEnd → subscriptionEnd = nouveau periodEnd (prolongation)
AND    il logge event 'payment_recorded' pour le nouveau paiement
AND    il envoie un email de confirmation de paiement (PAS l'email de bienvenue — déjà envoyé à la création)
       via buildPaymentConfirmationEmailHtml (helper 7-4 réutilisé)
AND    le handler retourne 200 OK { tenantId, action: 'renewed', reactivated: <bool>, emailSent }

GIVEN  session.customer correspond à un tenant existant MAIS metadata.admin_email diffère de l'admin actuel
THEN   le webhook NE change PAS l'admin (le tenant appartient au client d'origine)
AND    logge un avertissement (event note) "email checkout ≠ admin tenant"
```

**AC7 — `invoice.paid` (optionnel, renouvellements automatiques — DÉSACTIVÉ MVP)**

```
GIVEN  le mode Stripe est "payment" (AC2) — pas de subscription Stripe
THEN   l'événement invoice.paid N'EST PAS attendu (pas d'abonnement Stripe)
AND    le handler gère invoice.paid de manière défensive (log + 200 OK) SANS mutation
       (prépare le terrain pour une V2 mode subscription, mais n'implémente PAS la logique maintenant)
```

> **Décision MVP :** `invoice.paid` est un **no-op loggé**. Le renouvellement passe par `/checkout` (AC6). Si une V2 migre en mode Stripe subscription, ce handler deviendra actif. Cf. Dev Notes — Décisions.

**AC8 — Conversion XOF → EUR (constante de référence)**

```
GIVEN  PLAN_PRICES_XOF.pro.monthly = 25000 ET XOF_TO_EUR_RATE = 1/655.957 (taux fixe Euro franc CFA)
WHEN   createCheckoutSession calcule le montant EUR
THEN   amount_eur = roundFcfa(25000 / 655.957) = round(38.11) = 38 EUR
AND    metadata.amount_xof reste "25000" (entier FCFA, valeur de vérité stockée)
AND    metadata.amount_eur = "38" (audit)
AND    Stripe charge réellement 38.00 EUR (3820 centimes)
AND    le subscription_payments.amount stocké = 25000 (FCFA, JAMAIS float, JAMAIS EUR)

GIVEN  la page /checkout affiche les prix
THEN   elle affiche "≈ 38 €/mois" à côté de "25 000 XOF/mois" (référence commerciale XOF, prix facturé EUR)
```

> **Taux :** le franc CFA est arrimé à l'euro à taux fixe (1 EUR = 655.957 XOF). Définir `XOF_TO_EUR_RATE = 1 / 655.957` comme **constante** dans `src/lib/stripe/pricing.ts` (Epic 7 §7 — EUR devise principale Stripe). NE PAS appeler une API FX (Epic 7 §7 — USD/EUR fixes). Cf. Dev Notes — Conversion.

**AC9 — Sécurité & secrets (env vars)**

```
GIVEN  l'environnement de production
THEN   les variables suivantes SONT définies (vérifiées au boot) :
       - STRIPE_SECRET_KEY (sk_live_...)
       - STRIPE_WEBHOOK_SECRET (whsec_...)
       - NEXT_PUBLIC_APP_URL (pour success/cancel URLs)
       - (optionnel) STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_ANNUAL, STRIPE_PRICE_ENTERPRISE_MONTHLY, STRIPE_PRICE_ENTERPRISE_ANNUAL
         (price IDs réutilisables — cf. Dev Notes — Price IDs)
AND    STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET ne SONT JAMAIS exposés côté client (PAS de NEXT_PUBLIC_ prefix)
AND    le /checkout page Client Component n'a accès QU'À l'URL de redirection (jamais la secret key)

GIVEN  STRIPE_SECRET_KEY absent en production
THEN   createCheckoutSession lève une erreur explicite (fail-fast) et l'API retourne 500
```

**AC10 — Local testing via Stripe CLI**

```
GIVEN  un développeur en local
THEN   la story documente (Dev Notes) la procédure :
       1. stripe login
       2. stripe listen --forward-to localhost:3000/api/webhooks/stripe
          → affiche whsec_... (STRIPE_WEBHOOK_SECRET local)
       3. stripe trigger checkout.session.completed (ou trigger custom avec metadata)
       → le webhook reçoit l'événement et exécute le flux
AND    les tests E2E Playwright mockent l'appel Stripe (intercept createCheckoutSession + simulent le webhook via fetch direct vers /api/webhooks/stripe avec un event signé de test)
```

---

## Tasks / Subtasks

### T1 — INSTALLER la dépendance `stripe` + typer le client

- [x] `pnpm add stripe` (dernière stable — vérifier `pnpm info stripe version` ; ≈ v22.x, API version `2026-05-27.dahlia` ou la dernière stable au moment du dev)
- [x] **NE PAS** installer `@stripe/stripe-js` / `@stripe/react-stripe-js` (on utilise Stripe **Checkout** hosted page — redirection, pas Elements embarqués). Le client n'a besoin que de l'URL de redirection.
- [x] `pnpm typecheck` — zéro erreur

### T2 — CRÉER `src/lib/stripe/client.ts` (singleton Stripe, AC9)

- [x] Exporter `getStripe(): Stripe` (lazy singleton — évite d'instancier au module load si secret absent en test) :
  ```ts
  import Stripe from "stripe"
  export function getStripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error("STRIPE_SECRET_KEY is required")
    return new Stripe(key, { apiVersion: "<dernière stable pin>", typescript: true })
  }
  ```
- [x] **Pinned apiVersion** — choisir la dernière stable au moment du dev (ex `"2026-05-27.dahlia"`), la figer explicitement (évite les warnings Stripe et garantit la reproductibilité). Documenter le pin dans une constante `STRIPE_API_VERSION`.

### T3 — CRÉER `src/lib/stripe/pricing.ts` (AC8, pure, testable)

- [x] `export const XOF_TO_EUR_RATE = 1 / 655.957` (franc CFA arrimé à l'euro — Epic 7 §7)
- [x] `export const STRIPE_CURRENCY = "eur" as const`
- [x] `export function xofToEur(amountXof: number): number` → `Math.round(amountXof * XOF_TO_EUR_RATE)` (entier EUR)
- [x] `export function eurToCents(eur: number): number` → `Math.round(eur * 100)` (Stripe utilise les centimes)
- [x] Importer `PLAN_PRICES_XOF` depuis `src/lib/tenants/tenant-config.ts` (story 7-1) pour les montants source
- [x] **NE PAS** appeler d'API FX externe (Epic 7 §7 — EUR/XOF fixes)
- [x] Tests unitaires : `pricing.test.ts` (25 000 XOF → 38 EUR, 75 000 → 114 EUR, 250 000 → 381 EUR, 750 000 → 1143 EUR — vérifier bornes)

### T4 — CRÉER `src/lib/stripe/checkout-metadata.ts` (AC2, typage metadata)

- [x] Type `CheckoutMetadata = { plan: "pro" | "enterprise"; billingCycle: "monthly" | "annual"; amountXof: number; amountEur: number; companyName: string; adminName: string; adminEmail: string }`
- [x] Helper `buildSessionMetadata(m: CheckoutMetadata): Stripe.MetadataParam` (flat key-value string — Stripe metadata est `Record<string,string>`)
- [x] Helper `parseSessionMetadata(raw: Record<string,string> | null): CheckoutMetadata` (validation + Zod `checkoutMetadataSchema` — rejette plan='free', cycle invalide, amountXof ≤ 0)
- [x] Helper `extractStripeEventId(event: Stripe.Event): string` (event.id — `evt_...`)
- [x] Tests unitaires : `checkout-metadata.test.ts` (round-trip build/parse, rejet plan='free', missing fields)

### T5 — CRÉER `src/lib/validation/checkout.ts` (AC1, AC2)

- [x] `createCheckoutSessionSchema = z.object({ plan: z.enum(["pro", "enterprise"]), billingCycle: z.enum(["monthly", "annual"]), adminEmail: z.string().email(), companyName: z.string().min(2).max(120), adminName: z.string().min(2).max(120) })`
  - **PAS de `free`** dans le enum plan — défense en profondeur
- [x] Exporter `CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionSchema>`
- [x] Tests unitaires : rejet plan='free', email invalide, company trop court

### T6 — CRÉER `src/lib/stripe/create-checkout-session.ts` (AC2)

- [x] `export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string; sessionId: string }>` :
  1. Calculer `amountXof = PLAN_PRICES_XOF[input.plan][input.billingCycle]` (depuis tenant-config.ts 7-1)
  2. Calculer `amountEur = xofToEur(amountXof)`, `cents = eurToCents(amountEur)`
  3. Construire metadata via `buildSessionMetadata({ plan, billingCycle: input.billingCycle, amountXof, amountEur, companyName: input.companyName, adminName: input.adminName, adminEmail: input.adminEmail })`
  4. `const stripe = getStripe()`
  5. `const session = await stripe.checkout.sessions.create({ mode: "payment", currency: STRIPE_CURRENCY, customer_email: input.adminEmail, line_items: [{ quantity: 1, price_data: { currency: STRIPE_CURRENCY, unit_amount: cents, product_data: { name: \`Quotation Logistique — ${input.plan} (${input.billingCycle === "monthly" ? "Mensuel" : "Annuel"})\` } } }], metadata, success_url: \`${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}\`, cancel_url: \`${process.env.NEXT_PUBLIC_APP_URL}/checkout?canceled=1\` })`
     - **Note price_data inline** plutôt que `price` ID (évite de pré-créer des Price objects Stripe — cf. Dev Notes — Price IDs). Si `STRIPE_PRICE_*` env sont fournis (optionnel), les utiliser via `line_items: [{ price: priceId, quantity: 1 }]` à la place.
  6. Retourner `{ url: session.url!, sessionId: session.id }`
- [x] Gestion d'erreur : wrapper dans try/catch → lever `CreateCheckoutSessionError` avec code Stripe (ex `STRIPE_API_ERROR`)
- [x] **NE PAS créer de tenant ici** (création = webhook uniquement)

### T7 — CRÉER `src/app/api/v1/checkout/create-session/route.ts` (AC1, AC2)

- [x] `export async function POST(req: Request)` :
  1. `const parsed = createCheckoutSessionSchema.safeParse(await req.json())` → si `!parsed.success` → 400 `apiError("VALIDATION_FAILED", "Données invalides.", HTTP_STATUS.BAD_REQUEST, fields)`
  2. `try { const result = await createCheckoutSession(parsed.data); return NextResponse.json(result, { status: 200 }) }`
  3. `catch (err)` → 500 `apiError("INTERNAL_ERROR", "Impossible de créer la session de paiement.", HTTP_STATUS.INTERNAL)`
- [x] **Route PUBLIQUE** — ne PAS appeler `requireOwnerSession` ni `auth.api.getSession` (le visiteur n'est pas authentifié). Mais AJOUTER un rate-limit basic (ex `headers().get("x-forwarded-for")` + map en mémoire OU réutiliser le pattern rate-limit de `src/lib/lockout.ts`/`password-reset-rate-limit.ts`) pour éviter l'abus de création de sessions.
- [x] Importer `apiError`, `HTTP_STATUS` depuis `src/lib/api/envelope`

### T8 — CRÉER `src/lib/schema.ts` — UPDATE : ajouter `stripe_customer_id` + `stripe_checkout_session_id` sur `tenants` + nouvelle table `stripe_processed_events` (AC4, AC5)

- [x] **UPDATE `tenants`** (déjà créé par 7-1) : ajouter 2 colonnes nullable :
  ```ts
  stripeCustomerId: text("stripe_customer_id"),         // NULL si pas de Stripe (mobile money)
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  ```
  - **NE PAS** ajouter `stripeSubscriptionId` (mode payment, pas subscription — cf. AC7)
  - Index unique sur `stripe_customer_id` (pour la lookup idempotence AC6 — `WHERE stripe_customer_id = ?`) : `idx_tenants_stripe_customer_id` (UNIQUE, partial WHERE NOT NULL pour autoriser plusieurs NULL en Postgres)
  - **`pnpm db:generate`** + **`pnpm db:migrate`** (JAMAIS db:push)
- [x] **NEW table `stripe_processed_events`** (AC4 — idempotence par event id, AVANT de connaître le tenant) :
  ```ts
  export const stripeProcessedEvents = pgTable("stripe_processed_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull().unique(),     // evt_... — clé d'idempotence
    eventType: text("event_type").notNull(),           // checkout.session.completed | invoice.paid | ...
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),  // NULL si pas de tenant concerné
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  }, (t) => ({
    eventIdIdx: uniqueIndex("idx_stripe_events_event_id").on(t.eventId),
  }))
  ```
  - PAS de `updatedAt` (append-only comme `tenant_events`)
- [x] **CONSTANTE acteur système** : `src/lib/tenants/system-actor.ts` → `export const SYSTEM_ACTOR_ID = "system-stripe-webhook" as const` (text, valeur sentinelle — cf. Dev Notes — Acteur système)

### T9 — CRÉER `src/lib/stripe/handle-checkout-completed.ts` — orchestration transactionnelle (AC5, AC6)

- [x] Signature : `export async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string): Promise<{ tenantId: string; action: "created" | "renewed"; reactivated: boolean; emailSent: boolean }>`
- [x] **Étape 1 — Idempotence event id (AC4) :**
  - `const existing = await db.select().from(stripeProcessedEvents).where(eq(stripeProcessedEvents.eventId, eventId)).limit(1)`
  - si `existing.length > 0` → retourner `{ tenantId: existing[0]!.tenantId ?? "", action: "renewed", reactivated: false, emailSent: true }` (déjà traité — no-op)
- [x] **Étape 2 — Parse metadata (AC5) :**
  - `const meta = parseSessionMetadata(session.metadata)` → lève si invalide (plan=free, etc.)
- [x] **Étape 3 — Lookup tenant existant (AC6 idempotence business) :**
  - `const existing = await db.select().from(tenants).where(eq(tenants.stripeCustomerId, session.customer ?? "")).limit(1)`
- [x] **Étape 4a — FLUX CRÉATION (si pas de tenant) :**
  1. `slug = await generateUniqueSlug(meta.companyName)` (réutiliser `slugify` + check unicité de 7-3 `src/lib/tenants/slug.ts` ; suffixe `-2`, `-3` si collision)
  2. `dates = calculateSubscriptionDates({ cycle: meta.billingCycle, now: new Date() })` → `{ subscriptionStart, subscriptionEnd }` (réutiliser `calculatePeriodFromCycle` de 7-4 `src/lib/tenants/period.ts` — monthly +30j, annual +365j)
  3. `db.transaction(async (tx) => {`
       - `INSERT tenants` (status=**`'active'`**, plan=meta.plan, maxUsers=PLAN_LIMITS[meta.plan].maxUsers, subscriptionStart, subscriptionEnd, trialEndsAt=**null**, stripeCustomerId=session.customer, stripeCheckoutSessionId=session.id)
       - `INSERT stripe_processed_events` (eventId, eventType='checkout.session.completed', tenantId) ← **dans la même tx** (atomicité idempotence)
       - `INSERT subscription_payments` (tenantId, amount=meta.amountXof, currency='XOF', paymentMethod='stripe', paymentReference=session.payment_intent ?? session.id, paidAt=new Date(session.created * 1000), periodStart=dates.subscriptionStart, periodEnd=dates.subscriptionEnd, billingCycle=meta.billingCycle, confirmedBy=SYSTEM_ACTOR_ID, notes=`Stripe checkout ${session.id}`)
     `})`
  4. **Création admin via `auth.api.signUp`** (REUSE 7-3 EXACT) — HORS transaction (Better Auth ≠ Drizzle) :
     - `const password = generatePassword()` (7-3 `src/lib/tenants/password.ts`)
     - `const signUpResult = await auth.api.signUp({ body: { email: meta.adminEmail, password, name: meta.adminName } })`
     - si `!signUpResult?.user` → **rollback** : `db.delete(tenants).where(eq(tenants.id, tenant.id))` (cascade stripe_processed_events + subscription_payments via FK) puis throw
     - `db.update(userTable).set({ tenantId: tenant.id, role: "admin" }).where(eq(userTable.id, signUpResult.user.id))`
     - si update échoue → rollback (`db.delete(userTable)` cascade account) puis throw
  5. **Events audit (best-effort, hors tx)** : `INSERT tenant_events` eventType='created' actorId=SYSTEM_ACTOR_ID after={name, slug, plan, status, subscriptionEnd, maxUsers} + eventType='payment_recorded' after={amount, currency, paymentMethod, paymentReference, periodStart, periodEnd, billingCycle}
  6. **Email bienvenue (best-effort)** : `sendEmail(buildWelcomeEmailHtml({ tenantName, subdomainUrl: \`https://${slug}.${APEX_DOMAIN}\`, adminEmail, password, trialEndsAt: null }))` (REUSE 7-3 `src/lib/tenants/welcome-email.ts`) — wrap try/catch, `emailSent=false` si échec, note event "email échoué"
  7. Retourner `{ tenantId: tenant.id, action: "created", reactivated: false, emailSent }`
- [x] **Étape 4b — FLUX RENOUVELLEMENT (si tenant existe, AC6) :**
  1. `dates = calculatePeriodFromCycle({ cycle: meta.billingCycle, paidAt: new Date(session.created * 1000) })`
  2. `db.transaction(async (tx) => {`
       - `INSERT stripe_processed_events` (eventId, tenantId=existing.id)
       - `INSERT subscription_payments` (comme 4a.3 mais tenantId=existing.id)
     `})`
  3. **Réactiver/prolonger via helper 7-8** : `const { oldStatus } = await reactivateTenantWithPayment({ tenant: existing, payment: { id, periodStart: dates.periodStart, periodEnd: dates.periodEnd, paymentMethod: 'stripe', amount: meta.amountXof, currency: 'XOF', paymentReference: session.id }, tx?: ... })` (REUSE `src/lib/tenants/reactivate.ts` 7-8 — `reactivated = oldStatus === 'suspended' || oldStatus === 'cancelled'`)
     - **Note :** 7-8's `reactivateTenantWithPayment` doit accepter d'être appelée soit dans sa propre tx (7-8 standalone) soit en share de la tx webhook — vérifier la signature à l'implémentation. Si pas compatible, appeler `recordPayment` (7-4) qui déclenche déjà la prolongation/réactivation. **Flag parent :** aligner les signatures helpers 7-4/7-8/7-10.
  4. **Event 'payment_recorded'** (best-effort)
  5. **Email confirmation paiement (PAS bienvenue)** : `sendEmail(buildPaymentConfirmationEmailHtml({ tenantName, subdomainUrl, amount: meta.amountXof, currency: 'XOF', paymentMethod: 'stripe', paymentReference: session.id, paidAt, periodStart, periodEnd, billingCycle, reactivated }))` (REUSE 7-4 `src/lib/tenants/payment-email.ts`)
  6. Retourner `{ tenantId: existing.id, action: "renewed", reactivated, emailSent }`
- [x] **Helper `StripeWebhookError`** : classe custom avec code (`"INVALID_METADATA" | "SLUG_CONFLICT" | "SIGNUP_FAILED"`) pour logging structuré
- [x] **NE JAMAIS logger** : mot de passe généré, `session.customer` brut (masquer `cus_****`), email admin dans les console.error (masquer `a***@b.com`) — defense-in-depth
- [x] `exactOptionalPropertyTypes` : `trialEndsAt: null` (explicite null, pas undefined), `paymentReference: session.payment_intent ?? null`
- [x] `noUncheckedIndexedAccess` : `existing[0]` → guard `if (existing[0])` ou `existing[0]!` après `.length > 0` check
- [x] `pnpm typecheck` — zéro erreur

### T10 — CRÉER `src/app/api/webhooks/stripe/route.ts` (AC3, AC4, AC5, AC7)

- [x] `export async function POST(req: Request)` :
  1. `const secret = process.env.STRIPE_WEBHOOK_SECRET`
     - si `!secret` → `console.error("STRIPE_WEBHOOK_SECRET not configured")` ; 500 `apiError("INTERNAL_ERROR", "Webhook not configured.", HTTP_STATUS.INTERNAL)`
  2. `const signature = req.headers.get("stripe-signature")`
     - si `!signature` → 400 `apiError("VALIDATION_FAILED", "Missing stripe-signature header.", HTTP_STATUS.BAD_REQUEST)`
  3. `const rawBody = await req.text()` ← **RAW BODY** (AC3 — PAS req.json())
  4. `let event: Stripe.Event`
     `try { event = getStripe().webhooks.constructEvent(rawBody, signature, secret) }`
     `catch (err) { console.error("Stripe signature verification failed", err instanceof Error ? err.message : String(err)); return apiError("VALIDATION_FAILED", "Invalid signature.", HTTP_STATUS.BAD_REQUEST) }`
  5. **Switch event.type :**
     - `case "checkout.session.completed"` : `const session = event.data.object as Stripe.Checkout.Session; try { const result = await handleCheckoutCompleted(session, event.id); return NextResponse.json({ received: true, ...result }) } catch (err) { console.error("handleCheckoutCompleted failed", err); return apiError("INTERNAL_ERROR", "Webhook processing failed.", HTTP_STATUS.INTERNAL) }` (500 → Stripe retry — l'idempotence AC4 empêchera le double-traitement à la retry)
     - `case "invoice.paid"` : `console.log("invoice.paid received (no-op MVP — mode payment)", { eventId: event.id }); return NextResponse.json({ received: true, action: "noop" })` (AC7)
     - `default` : `console.log("Unhandled Stripe event", { type: event.type, eventId: event.id }); return NextResponse.json({ received: true, action: "ignored" })`
- [x] **NE PAS** appeler `requireOwnerSession`/`auth.api.getSession` (webhook = acteur système, pas de session)
- [x] **NE PAS** déclarer `export const runtime = "edge"` (Better Auth/Drizzle = Node runtime ; reste en runtime Node par défaut)
- [x] Réponse **rapide** pour les cas connus (2xx) — évite les retries Stripe inutiles
- [x] `pnpm typecheck` — zéro erreur

### T11 — CRÉER `src/app/checkout/page.tsx` (AC1) + `checkout-form.tsx` (Client Component)

- [x] `src/app/checkout/page.tsx` — Server Component :
  - `export default async function CheckoutPage()` — pas de garde auth (PUBLIC)
  - `const t = await getTranslations("checkout")`
  - Rendre `<CheckoutForm />` avec labels depuis `t`
  - Récupérer `?canceled=1` query → afficher toast/avis "Paiement annulé"
- [x] `src/app/checkout/checkout-form.tsx` — Client Component :
  - `"use client"` première ligne, double quotes
  - États : `isPending`, `errors` (par champ), `globalError`
  - Champs contrôlés : plan (SegmentedControl Pro/Enterprise — PAS Free), billingCycle (SegmentedControl Mensuel/Annuel), adminEmail (Input email), companyName (Input), adminName (Input)
  - **Affichage prix dynamique** : selon (plan, cycle) → afficher `formatFcfa(amountXof)` (référence) + `≈ ${xofToEur(amountXof)} €` (prix facturé) depuis `PLAN_PRICES_XOF` + `xofToEur` (importer les helpers — côté client, ce sont des pures fonctions)
  - **Bouton "Payer avec Stripe"** : `handleSubmit` → `fetch("/api/v1/checkout/create-session", { method: "POST", body: JSON.stringify(form) })` → si 200 `const { url } = await res.json(); window.location.href = url` (redirection vers Stripe Checkout hosted) ; sinon `setGlobalError`
  - Validation client : `createCheckoutSessionSchema.safeParse` avant fetch
  - Tous les labels depuis `useTranslations("checkout")` — JAMAIS de texte FR hardcodé

### T12 — CRÉER `src/app/checkout/success/page.tsx` (AC2)

- [x] Server Component : `?session_id=` query → message "Paiement confirmé. Votre tenant est en cours d'activation. Vous recevrez un email avec vos identifiants."
- [x] **NE PAS** créer le tenant ici (le webhook le fait asynchronously — la success page est purement informative). L'email de bienvenue arrivera dans les secondes qui suivent.
- [x] Lien "Retour à l'accueil"

### T13 — UPDATE `src/proxy.ts` (AC3 — exempter le webhook de toute auth)

- [x] Le matcher actuel `["/dashboard", "/chat", "/profile"]` ne couvre pas `/api/webhooks/stripe` ni `/checkout` → **normalement inchangé**.
- [x] **VÉRIFIER :** si 7-1 a étendu le matcher pour couvrir `/owner/*` ou les sous-domaines tenant, s'assurer que `/api/webhooks/stripe` et `/checkout` restent PUBLICS (pas de redirect cookie). Ajouter un comment dans proxy.ts : `// /api/webhooks/stripe and /checkout MUST stay public — Stripe webhook + public checkout page`
- [x] Si une exclusion explicite est nécessaire : utiliser `matcher` avec negative lookahead ou un `if (pathname.startsWith("/api/webhooks/")) return NextResponse.next()` en tête de `proxy()`

### T14 — UPDATE `src/messages/fr-NE.json` (AC1, AC9)

- [x] Ajouter section `checkout` :
  ```json
  "checkout": {
    "title": "Souscrire à Quotation Logistique",
    "plan": { "label": "Choisissez votre plan", "pro": "Pro", "enterprise": "Enterprise", "freeHint": "(Le plan Free est disponible sur demande — contactez-nous)" },
    "cycle": { "label": "Cycle de facturation", "monthly": "Mensuel", "annual": "Annuel", "annualBadge": "2 mois offerts" },
    "fields": { "adminEmail": "Email administrateur", "companyName": "Nom de la société", "adminName": "Nom complet" },
    "price": { "xofPerMonth": "{amount}/mois", "xofPerYear": "{amount}/an", "eurApprox": "≈ {amount} €" },
    "submit": "Payer avec Stripe",
    "canceled": "Paiement annulé. Vous pouvez réessayer.",
    "errors": { "planFree": "Le plan Free n'est pas disponible au checkout", "validation": "Vérifiez les champs du formulaire", "stripe": "Impossible de démarrer le paiement. Réessayez." },
    "success": { "title": "Paiement confirmé", "body": "Votre espace est en cours d'activation. Vous recevrez un email avec vos identifiants de connexion dans quelques instants.", "home": "Retour à l'accueil" }
  }
  ```

### T15 — Tests unitaires Vitest

- [x] `src/lib/stripe/pricing.test.ts` : XOF→EUR (25000→38, 75000→114, 250000→381, 750000→1143), eurToCents, bornes
- [x] `src/lib/stripe/checkout-metadata.test.ts` : build/parse round-trip, rejet plan='free', cycle invalide, amountXof ≤ 0
- [x] `src/lib/stripe/handle-checkout-completed.test.ts` (mock `getStripe`, `db.transaction/select/insert/update`, `auth.api.signUp`, `sendEmail`, `generatePassword`, `calculatePeriodFromCycle`, `reactivateTenantWithPayment`) :
  - **Cas création nominal** : event id nouveau, pas de tenant existant → 1 insert tenant (status=active), 1 signUp, 1 update user, 1 insert subscription_payments (amount=metadata.amountXof), 1 insert stripe_processed_events, 2 inserts tenant_events (created + payment_recorded), 1 sendEmail (welcome), résultat `{ action: "created", reactivated: false, emailSent: true }`
  - **Cas renouvellement** : event id nouveau, tenant existant (stripe_customer_id match) → 0 insert tenant, 0 signUp, 1 insert subscription_payments, appel `reactivateTenantWithPayment`, 1 sendEmail (payment confirmation, PAS welcome), résultat `{ action: "renewed" }`
  - **Idempotence event id** : event id déjà dans stripe_processed_events → retour immédiat, 0 mutation, 0 sendEmail
  - **signUp échoue** → 1 delete tenant (rollback), stripe_processed_events NON persisté (pour retry Stripe), erreur propagée
  - **sendEmail échoue** → tenant + paiement + user conservés, `emailSent=false`, event note "email échoué"
  - **metadata invalide (plan=free)** → StripeWebhookError "INVALID_METADATA", 0 mutation
  - **slug collision** → suffixe -2 généré, tenant créé avec slug unique
- [x] `src/lib/validation/checkout.test.ts` : rejet plan='free', email invalide, company trop court

### T16 — Tests E2E Playwright

- [x] `tests/e2e/checkout-flow.spec.ts` :
  - **Setup** : `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` en env de test (clés test Stripe `sk_test_`/`whsec_`), `RESEND_API_KEY` absent (email en console.log dev mode)
  - Scénario **création** :
    1. Visiter `/checkout` (non authentifié) → page visible
    2. Sélectionner Pro + Mensuel → prix affiché "25 000 XOF/mois ≈ 38 €/mois"
    3. Remplir email/company/name → cliquer "Payer avec Stripe"
    4. Intercept `**/api/v1/checkout/create-session` → mock retourne `{ url: "https://checkout.stripe.com/test-...", sessionId: "cs_test_..." }`
    5. **Simuler le webhook** : `await fetch("/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": "<sig>" }, body: <raw event signé via stripe.webhooks.generateTestHeaderString ou mock constructEvent> })`
       - Note : en test, mocker `getStripe().webhooks.constructEvent` pour retourner un event synthétique (ou utiliser le helper Stripe `Stripe.webhooks.generateTestHeaderString` avec le secret test)
    6. Vérifier en DB : tenant créé (status=active), admin user créé, subscription_payments inséré, tenant_events (created + payment_recorded)
    7. Vérifier email (console.log spy) : contenu welcome avec URL sous-domaine
  - Scénario **idempotence** : re-livrer le même event id → 200 OK, 0 nouvelle mutation
  - Scénario **signature invalide** : POST avec signature corrompue → 400, 0 mutation
  - Scénario **renouvellement** : seed tenant existant avec stripe_customer_id → livrer event checkout.session.completed même customer → vérifier 0 nouveau tenant, paiement inséré, subscriptionEnd prolongé

### T17 — Vérification finale (AC1-AC10)

- [x] `pnpm check` (lint + typecheck + vitest) — tout vert
- [x] `pnpm build` — succès (migrations incluses)
- [ ] `stripe listen --forward-to localhost:3000/api/webhooks/stripe` + `stripe trigger checkout.session.completed` (manuel, documenté) → webhook traite, tenant créé

---

## Dev Notes

### CRITIQUE — Dépendances HARD sur stories 7-1, 7-3, 7-4, 7-8

- **Story 7-1 (HARD) :** fournit `tenants`/`subscription_payments`/`tenant_events`/`user.tenantId`, les enums `tenant_plan`/`payment_method`/`billing_cycle`, et `src/lib/tenants/tenant-config.ts` (`PLAN_PRICES_XOF`, `PLAN_LIMITS`, `APEX_DOMAIN`, `DEFAULT_TRIAL_DAYS`). **Sans 7-1, rien ne compile.**
- **Story 7-3 (HARD — REUSE direct) :** fournit `generatePassword()`, `buildWelcomeEmailHtml/Text()`, `slugify()` + `generateUniqueSlug()`, `createTenantWithAdmin` pattern (`auth.api.signUp` + rollback), `TenantConflictError`. **Importer TELS QUELS** depuis `src/lib/tenants/{password,welcome-email,slug,create-tenant}.ts`. NE PAS recréer.
- **Story 7-4 (HARD — REUSE direct) :** fournit `calculatePeriodFromCycle()`, `recordPayment()` pattern, `buildPaymentConfirmationEmailHtml/Text()`, `RecordPaymentError`. Importer depuis `src/lib/tenants/{period,record-payment,payment-email}.ts`.
- **Story 7-8 (HARD — REUSE direct) :** fournit `reactivateTenantWithPayment()` (helper partagé 7-4/7-8). Le flux RENOUVELLEMENT (AC6) l'appelle. **Flag parent :** aligner la signature de `reactivateTenantWithPayment` pour qu'elle puisse être appelée depuis le webhook (soit standalone tx, soit en share de tx webhook).

**Mode dégradé (si 7-1/7-3/7-4/7-8 absents) :** cette story NE PEUT PAS être implémentée en mode dégradé — les helpers sont des dépendances runtime, pas seulement des patterns. **Bloquer le dev jusqu'à implémentation des prérequis.**

### CRITIQUE — Pas de superadmin : le webhook est un acteur SYSTÈME

Contrairement à 7-3/7-4/7-7/7-8/7-9 (où l'acteur est un `superadmin` authentifié via `requireOwnerSession`), **le webhook Stripe n'a pas de session utilisateur**. C'est Stripe qui appelle `/api/webhooks/stripe`.

**Décision :** `confirmedBy` (subscription_payments) et `actorId` (tenant_events) reçoivent la **constante sentinelle** `SYSTEM_ACTOR_ID = "system-stripe-webhook"` (text, défini dans `src/lib/tenants/system-actor.ts`).

**⚠️ FLAG PARENT (contrainte FK) :** `subscription_payments.confirmedBy` (spec 7-1 AC2) et `tenant_events.actorId` (spec 7-1 AC3) sont typés `text NOT NULL` mais **probablement FK vers `user.id`** dans le schéma 7-1. Une valeur sentinelle `"system-stripe-webhook"` violerait la FK. **Deux options :**
1. **(Recommandé MVP)** 7-1 définit ces colonnes comme `text NOT NULL` SANS FK (juste un contrat applicatif). Le STORY 7-1 AC2 dit `confirmedBy text NOT NULL — user_id superadmin` — suggère FK. **Le parent doit confirmer :** si FK, créer un user système `system-stripe-webhook` au seed (mais Better Auth signUp exige un email/password → user fantôme). Si pas de FK, la constante sentinelle fonctionne.
2. Créer un user système dédié au boot (id fixe `system-stripe-webhook`, email `system@quotation.app`, sans credential account) via un seed de migration.

**Assumption pour cette story :** adopter l'option 1 (pas de FK, constante sentinelle). Le parent doit valider/coordonner avec 7-1. Documenter le `SYSTEM_ACTOR_ID` dans `tenant-config.ts` pour cohérence cross-story.

### CRITIQUE — Raw body Next 16 (signature verification)

Next.js 16 App Router `route.ts` fournit un objet `Request` standard. **Pour Stripe, lire `await req.text()`** (le raw body string) et le passer à `stripe.webhooks.constructEvent(rawBody, signature, secret)`.

- **NE PAS** appeler `await req.json()` avant — la signature est calculée sur les **bytes bruts** ; un parse/re-serialize casserait la signature.
- **NE PAS** configurer `bodyParser: false` (concept Pages API `/pages/api`, N'existe PAS en App Router).
- **NE PAS** déclarer `export const runtime = "edge"` — la route utilise Drizzle + Better Auth (Node-only) ; reste en runtime Node par défaut (App Router default).
- Si Next parse le body avant (rare en App Router), utiliser `await req.text()` qui reconstruit le body textuel depuis le stream — fonctionnera.

Source : [Next.js 16 webhook handler pattern](https://dev.to/huangyongshan46a11y/nextjs-16-webhook-handler-pattern-stripe-github-and-more-2bgh), [Stripe signature verification docs](https://docs.stripe.com/webhooks/signature?lang=node).

### CRITIQUE — Idempotence : table dédiée `stripe_processed_events`

**Pourquoi une table dédiée (pas `tenant_events`) ?**
- L'idempotence doit être vérifiée **AVANT** de connaître le tenant (le lookup event id précède le lookup tenant).
- `tenant_events` est scoped `tenantId NOT NULL` (FK) — ne peut pas stocker un event pré-tenant.
- `tenant_events` est un journal métier (audit), pas un dédoublonneur technique.

**Pattern idempotent (atomic) :**
```ts
await db.transaction(async (tx) => {
  // INSERT stripe_processed_events — UNIQUE(eventId) lève si déjà présent
  await tx.insert(stripeProcessedEvents).values({ eventId, eventType, tenantId }).onConflictDoNothing()
  // ... mutations métier ...
})
```
L'`onConflictDoNothing` sur la UNIQUE index + le check `existing.length > 0` en étape 1 (AC4) garantissent l'idempotence même sous concurrence (deux retries Stripe simultanés).

Source : [Stripe webhooks — handle duplicate events](https://docs.stripe.com/webhooks).

### CRITIQUE — `status='active'` PAS `'trial'` (différence avec 7-3)

- **7-3 (création manuelle) :** tenant créé en `status='trial'` car aucun paiement n'est exigé à la création ; l'owner active après.
- **7-10 (Stripe webhook) :** le paiement est **déjà confirmé** par Stripe avant l'event `checkout.session.completed`. Le tenant démarre donc **`status='active'`**, `subscriptionStart=now`, `subscriptionEnd=now+cycle`, `trialEndsAt=null` (pas d'essai).

Ne **PAS** réutiliser `calculateTrialDates` (7-3) — utiliser `calculatePeriodFromCycle` (7-4) qui retourne `{ periodStart, periodEnd }` sans notion de trial.

### CRITIQUE — Décisions assumées (à valider parent)

| Décision | Choix MVP | Rationale | Flag |
|----------|-----------|-----------|------|
| Stripe mode | **`payment`** (one-shot) | Simplicité : pas de gestion de subscription Stripe, webhooks `invoice.*` limités. Le cycle monthly/annual est applicatif (cron 7-6 rappelle ; client repasse /checkout pour renouveler). | V2 : migrer vers mode `subscription` Stripe pour auto-renew. |
| Stripe currency | **EUR** (Epic 7 §7) | FCFA arrimé à l'euro ; EUR lisible pour clients internationaux. | — |
| FX rate | **Constante fixe** `1/655.957` | Franc CFA arrimé à l'euro. Pas d'API FX (Epic 7 §7). | — |
| Price objects Stripe | **`price_data` inline** (pas de Price IDs pré-créés) | Évite de configurer 4 Price objects dans le dashboard Stripe. | Si volume élevé : pré-créer Price IDs, utiliser `STRIPE_PRICE_*` env. |
| Admin password | **Auto-généré** (`generatePassword()`) + email bienvenue | Le client ne choisit pas son mot de passe au checkout (UX simple) ; il le reset après 1ère connexion. | Option : ajouter un champ "choisir mon mot de passe" au checkout. |
| `invoice.paid` | **No-op loggé** (AC7) | Mode payment → pas d'invoice récurrente. Prépare la V2 subscription. | — |
| Slug depuis company | **slugify(companyName) + suffixe si collision** | Automatique, éditable plus tard par le owner (7-7). | Si collision fréquente : demander le slug au checkout. |

### CRITIQUE — Transactionnalité : hybride 7-3 (rollback manuel) + 7-4 (db.transaction natif)

Le flux CRÉATION mélange :
- Mutations **Drizzle** (tenant, subscription_payments, stripe_processed_events) → `db.transaction()` natif (AC4 atomicité idempotence + tenant + paiement).
- Appel **Better Auth** (`auth.api.signUp`) → HORS transaction (Better Auth ≠ Drizzle), suivi d'un `UPDATE user` Drizzle.

**Stratégie (cf. 7-3) :**
1. `db.transaction()` insère tenant + paiement + event id (atomic).
2. `auth.api.signUp` crée user + account (transaction interne Better Auth).
3. `db.update(user).set({ tenantId, role })` lie le user.
4. **Rollback manuel** si étape 2 ou 3 échoue : `db.delete(tenants).where(...)` (cascade via FK ON DELETE CASCADE supprime subscription_payments + stripe_processed_events + tenant_events liés — vérifier le schéma 7-1).
5. **⚠️ Sur rollback, l'event id Stripe est aussi supprimé** (cascade) → Stripe retryera l'event → nouvelle tentative propre. **C'est le comportement souhaité.**

Les events audit (`tenant_events`) et l'email restent **hors transaction, best-effort** (try/catch, ne bloquent pas).

### CRITIQUE — `confirmedBy`/`actorId` système + FK (cf. plus haut)

Voir section « Pas de superadmin ». La constante `SYSTEM_ACTOR_ID` peut violer une FK si 7-1 l'a définie. **Flag parent obligatoire.**

### CRITIQUE — `exactOptionalPropertyTypes` (TS 5.9.3)

- `trialEndsAt: null` (explicite, pas `undefined`) — le tenant Stripe n'a pas de trial.
- `paymentReference: session.payment_intent ?? null` (Stripe peut ne pas exposer payment_intent sur tous les modes).
- `stripeCustomerId: session.customer ?? null` (idem).

### CRITIQUE — `noUncheckedIndexedAccess`

- `existing[0]` après `db.select().limit(1)` → `Tenant | undefined` → guard `if (existing[0])` ou destructurer `const [tenant] = existing; if (tenant) { ... }`.
- `session.metadata?.plan` → `string | undefined` → valider via `parseSessionMetadata` (Zod) qui rejette undefined.

### CRITIQUE — Ne JAMAIS logger de données sensibles

- **Mot de passe généré** : jamais en log. Si `sendEmail` échoue, le password est perdu → le client devra reset (email reset existe via `buildResetPasswordHtml`).
- **`session.customer`** (`cus_...`) : masquer `cus_****` dans les logs.
- **Email admin** : masquer `a***@b.com`.
- **Card info** : Stripe ne l'envoie jamais dans le webhook (PCI) — non concerné.

### CRITIQUE — Conversion XOF → EUR (taux fixe)

Le franc CFA (XOF) est arrimé à l'euro : **1 EUR = 655.957 XOF** (taux fixe depuis 1999). Donc `XOF_TO_EUR_RATE = 1 / 655.957 ≈ 0.001524`.

- 25 000 XOF → 38.11 → **38 EUR** (arrondi `Math.round`)
- 75 000 XOF → 114.34 → **114 EUR**
- 250 000 XOF → 381.12 → **381 EUR**
- 750 000 XOF → 1143.36 → **1143 EUR**

Stripe facture en **centimes** : `eurToCents(38) = 3800`. **Toujours stocker `amount_xof` (FCFA integer) en DB** — l'EUR n'est que le prix de facturation Stripe. `subscription_payments.amount` est TOUJOURS en FCFA (Epic 7 §2 — `amount integer NOT NULL — Montant en FCFA`).

### CRITIQUE — Stripe CLI pour tester en local

```bash
# 1. Installer Stripe CLI (https://stripe.com/docs/stripe-cli)
stripe login

# 2. Forwarder les webhooks vers le dev server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# → Affiche: > Ready! Your webhook signing secret is whsec_xxxxxxxx
# → Copier dans .env: STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx

# 3. Déclencher un event test
stripe trigger checkout.session.completed
# (metadata vide par défaut — pour tester avec metadata, utiliser un custom event ou l'API)

# 4. Pour un event avec metadata custom :
stripe events resend evt_...  # ou créer une session test via /checkout puis payer avec carte test 4242 4242 4242 4242
```

**Cartes test Stripe :** `4242 4242 4242 4242` (visa, success), `4000 0027 6000 3184` (3DS), `4000 0000 0000 9995` (decline).

### CRITIQUE — Aucune donnée n'existe encore (7-1/7-3/7-4/7-8 non implémentées)

Comme pour les stories 7-2 à 7-9, **les tables `tenants`/`subscription_payments`/`tenant_events` ne sont PAS encore dans `src/lib/schema.ts`** (uniquement `tierEnum`/`companySubscription`/etc. legacy). Cette story AJOUTE `stripe_customer_id`/`stripe_checkout_session_id` + la table `stripe_processed_events`, **en supposant que 7-1 a déjà créé le socle**. Si 7-1 n'est pas implémenté au démarrage du dev, **bloquer** (pas de mode dégradé possible — dépendances runtime).

### Pattern existant à réutiliser

- `src/lib/email.ts` — `sendEmail` (Resend), pattern `buildResetPasswordHtml` (modèle template HTML)
- `src/lib/tenants/welcome-email.ts` (7-3) — `buildWelcomeEmailHtml/Text`
- `src/lib/tenants/password.ts` (7-3) — `generatePassword`
- `src/lib/tenants/slug.ts` (7-3) — `slugify`, `generateUniqueSlug`
- `src/lib/tenants/period.ts` (7-4) — `calculatePeriodFromCycle`
- `src/lib/tenants/payment-email.ts` (7-4) — `buildPaymentConfirmationEmailHtml/Text`
- `src/lib/tenants/reactivate.ts` (7-8) — `reactivateTenantWithPayment`
- `src/lib/tenants/tenant-config.ts` (7-1) — `PLAN_PRICES_XOF`, `PLAN_LIMITS`, `APEX_DOMAIN`
- `src/lib/api/envelope.ts` — `apiError`, `HTTP_STATUS`
- `src/lib/auth.ts` — `auth.api.signUp` (server-side, cf. 7-3 decision)
- `src/lib/money.ts` — `formatFcfa`, `roundFcfa`
- `src/app/api/v1/owner/tenants/route.ts` (7-3) — pattern POST création transactionnelle + Zod + apiError
- `src/app/api/v1/owner/tenants/[id]/payments/route.ts` (7-4) — pattern POST paiement transactionnel

### Pièges & Anti-patterns

| Anti-pattern | Bonne pratique |
|--------------|----------------|
| `await req.json()` avant `constructEvent` | `await req.text()` (raw body) |
| Mettre `STRIPE_SECRET_KEY` dans `NEXT_PUBLIC_*` | Server-only (jamais exposé client) |
| Créer le tenant dans `createCheckoutSession` (avant paiement) | Créer UNIQUEMENT dans le webhook (post-paiement confirmé) |
| Créer le tenant à chaque retry Stripe (pas d'idempotence) | Table `stripe_processed_events` (UNIQUE event id) |
| Créer un nouveau tenant si le Stripe customer existe déjà (AC6) | Lookup `stripe_customer_id` → flux renouvellement |
| Mode `subscription` Stripe (complexité MVP) | Mode `payment` + cycle applicatif |
| Créer des Price objects Stripe manuellement | `price_data` inline (ou `STRIPE_PRICE_*` env optionnels) |
| Utiliser `calculateTrialDates` (7-3) | `calculatePeriodFromCycle` (7-4) — pas de trial pour Stripe |
| Mettre `status='trial'` au tenant Stripe | `status='active'` (paiement confirmé) |
| Utiliser `requireOwnerSession` sur le webhook | Webhook = acteur système, pas de session |
| FK `confirmedBy`/`actorId` vers user avec valeur sentinelle | Constante `SYSTEM_ACTOR_ID` + valider contrainte FK avec 7-1 |
| Logger le mot de passe généré / email / customer id | Masquer dans tous les logs |
| Appeler une API FX pour XOF→EUR | Constante fixe `1/655.957` (franc CFA arrimé) |
| `export const runtime = "edge"` sur le webhook | Runtime Node par défaut (Drizzle + Better Auth) |
| `db.insert(userTable)` direct (legacy users/route.ts) | `auth.api.signUp` crée user + account scrypt atomiquement |

### Commandes pour le dev agent

```bash
pnpm add stripe                                           # installer la dépendance
pnpm db:generate && pnpm db:migrate                       # après UPDATE schema.ts (stripe_customer_id + stripe_processed_events)
pnpm check                                                # lint + typecheck + vitest
pnpm build                                                # build complet (migrations incluses)
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # tester le webhook en local
stripe trigger checkout.session.completed                 # déclencher un event test
```

---

## Project Structure Notes

- **Alignement structure unifiée :**
  - API routes versionnées `/api/v1/` : `/api/v1/checkout/create-session` (mais le webhook est à `/api/webhooks/stripe` — **NON versionné** car appelé par Stripe, pas par le client ; convention webhooks).
  - Lib domain-scoped : `src/lib/stripe/` (nouveau module — `client.ts`, `pricing.ts`, `checkout-metadata.ts`, `create-checkout-session.ts`, `handle-checkout-completed.ts`).
  - Pages publiques : `src/app/checkout/` (PAS sous `/owner` — publique).
  - Validation : `src/lib/validation/checkout.ts` (Zod).
  - Tests co-localisés : `*.test.ts` à côté des modules.
  - E2E : `tests/e2e/checkout-flow.spec.ts`.
  - i18n : section `checkout` dans `src/messages/fr-NE.json`.
- **Conflit/variance détecté :** aucun. La structure suit les conventions du repo (project-context.md).
- **FK system actor (flag parent) :** cf. « Pas de superadmin » — valider avec 7-1 que `confirmedBy`/`actorId` ne sont pas FK, ou créer un user système au seed.

---

## References

- [Source: Docs/business/owner-subscription-management.md#5-flux-de-paiement-détaillé] — Flux Stripe (international) — page publique `/checkout` → webhook `/api/webhooks/stripe` → auto-activation
- [Source: Docs/business/owner-subscription-management.md#2-schéma-de-données] — `subscription_payments.payment_method` enum inclut `'stripe'`
- [Source: Docs/business/owner-subscription-management.md#7-décisions-recommandées] — Stripe EUR devise principale ; prix XOF référence commerciale ; `PLAN_PRICES_XOF` free/pro/enterprise monthly/annual
- [Source: Docs/business/owner-subscription-management.md#34-provisioning-des-comptes] — Phase 2 = auto-activation post-Stripe (cette story)
- [Source: _bmad-output/implementation-artifacts/7-3-create-tenant-welcome-email.md] — pattern `auth.api.signUp` + rollback transactionnel + `buildWelcomeEmailHtml` + `generatePassword` + `slugify`
- [Source: _bmad-output/implementation-artifacts/7-4-record-payment-mobile-money.md] — pattern `db.transaction()` + `calculatePeriodFromCycle` + `buildPaymentConfirmationEmailHtml` + event `payment_recorded`
- [Source: _bmad-output/implementation-artifacts/7-8-reactivation-after-payment.md] — helper partagé `reactivateTenantWithPayment` (REUSE pour renouvellement AC6)
- [Source: _bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md] — enums `tenant_plan`/`payment_method`/`billing_cycle` + tables `tenants`/`subscription_payments`/`tenant_events` + `tenant-config.ts`
- [Source: _bmad-output/project-context.md] — TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), FCFA integer, Drizzle `db.transaction`, `apiError`/`HTTP_STATUS`, Next 16 App Router, Resend email
- [Next.js 16 webhook handler pattern — Stripe, GitHub](https://dev.to/huangyongshan46a11y/nextjs-16-webhook-handler-pattern-stripe-github-and-more-2bgh) — raw body `await req.text()` + `constructEvent`
- [Stripe Webhooks — Handle duplicate events](https://docs.stripe.com/webhooks) — idempotence par event id
- [Stripe Signature Verification](https://docs.stripe.com/webhooks/signature?lang=node) — `constructEvent(rawBody, sig, secret)`
- [Stripe Checkout Sessions Create](https://docs.stripe.com/api/checkout/sessions/create) — `mode`, `currency`, `line_items`, `metadata`, `success_url`, `cancel_url`
- [Stripe Node.js SDK (stripe-node)](https://github.com/stripe/stripe-node) — dernière stable (v22.x), pinné `apiVersion`
- [Stripe CLI — Test webhooks locally](https://docs.stripe.com/stripe-cli) — `stripe listen --forward-to`

---

## Epic 7 — Cross-story context

| Story | Titre | Lien avec 7-10 |
|-------|-------|----------------|
| 7.1 | Schema tenants + middleware | **HARD** — fournit tables/enums/tenant-config |
| 7.2 | Dashboard owner + liste tenants | Owner voit les tenants créés par Stripe (status active) |
| 7.3 | Création manuelle tenant + email bienvenue | **HARD** — REUSE helpers (signUp, welcome email, slug, password, rollback) |
| 7.4 | Enregistrement paiement (mobile money) | **HARD** — REUSE helpers (period, payment email, db.transaction) |
| 7.5 | Suspension manuelle + page expiration | Tenant Stripe peut être suspendu plus tard par le cron 7-6 |
| 7.6 | Cron expiration + rappels | Rappelle le tenant Stripe avant expiration → il repasse /checkout (renouvellement AC6) |
| 7.7 | Fiche tenant complète (onglets) | Owner voit le paiement Stripe + le flag "auto-activé" (actorId=system) |
| 7.8 | Réactivation après paiement | **HARD** — REUSE `reactivateTenantWithPayment` (renouvellement AC6) |
| 7.9 | Gestion utilisateurs par tenant | Le webhook crée le 1er admin (rôle `admin`, pas `superadmin`) |
| **7.10** | **Intégration Stripe (webhook auto-activation)** | **Cette story** |
| 7.11 | Rapports & export comptabilité | Paiements Stripe visibles dans les exports (method='stripe') |
| 7.12 | Paramètres plateforme | Prix plans (sources de `PLAN_PRICES_XOF`) |

### Paramètres business retenus (Epic 7 §7)

```ts
const PLAN_PRICES_XOF = {          // dans src/lib/tenants/tenant-config.ts (7-1)
  free:      { monthly: 0,     annual: 0 },
  pro:       { monthly: 25000, annual: 250000 },
  enterprise:{ monthly: 75000, annual: 750000 },
}
const PLAN_LIMITS = { free: { maxUsers: 1 }, pro: { maxUsers: 5 }, enterprise: { maxUsers: 20 } }
// Stripe (7-10) :
const XOF_TO_EUR_RATE = 1 / 655.957   // franc CFA arrimé à l'euro (fixe)
const STRIPE_CURRENCY = "eur"
```

---

## Latest Tech Information (web research, juin 2026)

### Stripe Node.js SDK

- **Dernière stable :** `stripe` v22.x (vérifier `pnpm info stripe version` au moment du dev).
- **API version recommandée :** `2026-05-27.dahlia` (dernière stable au 2026-06). **Pinner explicitement** dans le constructeur `new Stripe(key, { apiVersion: "..." })` pour éviter les warnings et garantir la reproductibilité.
- **TypeScript :** `types: true` activé par défaut — types complets pour `Stripe.Event`, `Stripe.Checkout.Session`, etc.
- **Pas besoin de `@stripe/stripe-js`** pour Checkout hosted (redirection) — uniquement si on embarque Elements.

### Next.js 16 — Webhook raw body

- App Router `route.ts` : `await req.text()` donne le raw body string. **NE PAS** utiliser `req.json()` avant `constructEvent`.
- **Pas de config `bodyParser`** (concept Pages API, n'existe pas en App Router).
- Runtime Node par défaut (Drizzle + Better Auth incompatibles edge).

Source : [Next.js 16 webhook handler pattern](https://dev.to/huangyongshan46a11y/nextjs-16-webhook-handler-pattern-stripe-github-and-more-2bgh), [Stripe docs](https://docs.stripe.com/webhooks/signature?lang=node).

### Idempotence Stripe (best practice officielle)

- **Logger les event ids traités** (table dédiée `stripe_processed_events`) → refuser les re-livraisons.
- **Retourner 2xx rapidement** pour éviter les retries Stripe.
- **Rendre la logique métier idempotrente** (lookup `stripe_customer_id` en plus de l'event id — double défense).

Source : [Stripe webhooks — handle duplicate events](https://docs.stripe.com/webhooks), [Best practices Stripe webhooks](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks).

---

## Compliance Matrix

| Règle project-context | Statut | Détail |
|-----------------------|--------|--------|
| TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | ✅ | guards `existing[0]`, `?? null` pour nullables |
| `apiError` + `HTTP_STATUS` pour erreurs API | ✅ | webhook + create-session |
| Zod validation dans `src/lib/validation/` | ✅ | `createCheckoutSessionSchema`, `checkoutMetadataSchema` |
| FCFA integer (jamais float) | ✅ | `amount_xof` integer ; EUR = prix facturation uniquement |
| `formatFcfa` / `roundFcfa` | ✅ | affichage prix checkout |
| `db.transaction()` Drizzle pour atomicité multi-mutations | ✅ | tenant + paiement + event id atomiques |
| Drizzle : `uuid()` custom tables, FK `onDelete` | ✅ | `stripe_processed_events` uuid PK ; cascade tenant |
| `db:generate` + `db:migrate` (jamais `db:push`) | ✅ | pour ajout colonnes tenants + nouvelle table |
| Migration workflow | ✅ | T8 generate + migrate |
| `auth.api.signUp` server-side (cf. 7-3) | ✅ | REUSE — ne pas utiliser plugin admin ni insert direct |
| `sendEmail` de `src/lib/email.ts` (Resend) | ✅ | REUSE tel quel — pas de nouvelle lib email |
| Best-effort audit (`tenant_events`) — try/catch hors tx | ✅ | events created/payment_recorded/reactivated |
| Email utility non modifiée | ✅ | `src/lib/email.ts` inchangé |
| `"use client"` première ligne, double quotes | ✅ | checkout-form.tsx |
| `next/navigation` (pas `next/router`) | ✅ | si navigation client |
| UI strings dans `src/messages/fr-NE.json` (next-intl) | ✅ | section `checkout` |
| `@/` alias pour imports | ✅ | tous les imports internes |
| Server Components par défaut, `"use client"` si besoin | ✅ | page server, form client |
| Aucune donnée sensible loggée | ✅ | password/customer/email masqués |
| Runtime Node (pas edge) pour DB/Auth | ✅ | webhook en runtime Node |

### Versions critiques

| Package | Version | Rôle dans cette story |
|---------|---------|------------------------|
| `stripe` | **à installer** (dernière stable v22.x) | client Stripe, `checkout.sessions.create`, `webhooks.constructEvent` |
| `drizzle-orm` | 0.44.7 | `db.transaction`, `.for("update")`, `onConflictDoNothing` |
| `better-auth` | 1.6.11 | `auth.api.signUp` (création user + account scrypt) |
| `zod` | 4.4.3 | `createCheckoutSessionSchema`, `checkoutMetadataSchema` |
| `next` | 16.1.6 | App Router, `route.ts`, `req.text()` raw body |

---

## Files List

| Fichier | Statut | Rôle |
|---------|--------|------|
| `package.json` | **UPDATE** | Ajouter dépendance `stripe` |
| `src/lib/stripe/client.ts` | **NEW** | Singleton `getStripe()` (lazy, apiVersion pinné) |
| `src/lib/stripe/pricing.ts` | **NEW** | `XOF_TO_EUR_RATE`, `xofToEur`, `eurToCents` (pures) |
| `src/lib/stripe/checkout-metadata.ts` | **NEW** | Type `CheckoutMetadata`, `buildSessionMetadata`, `parseSessionMetadata`, `extractStripeEventId` |
| `src/lib/stripe/create-checkout-session.ts` | **NEW** | `createCheckoutSession(input)` (crée la Checkout Session Stripe) |
| `src/lib/stripe/handle-checkout-completed.ts` | **NEW** | `handleCheckoutCompleted(session, eventId)` — orchestration transactionnelle (création OU renouvellement) |
| `src/lib/tenants/system-actor.ts` | **NEW** | `SYSTEM_ACTOR_ID = "system-stripe-webhook"` |
| `src/lib/validation/checkout.ts` | **NEW** | `createCheckoutSessionSchema`, `checkoutMetadataSchema` |
| `src/lib/schema.ts` | **UPDATE** | Ajouter `stripeCustomerId`/`stripeCheckoutSessionId` sur `tenants` (index unique partial) + nouvelle table `stripe_processed_events` |
| `drizzle/` | **NEW migration** | Généré par `pnpm db:generate` |
| `src/app/api/v1/checkout/create-session/route.ts` | **NEW** | POST publique — crée la Checkout Session |
| `src/app/api/webhooks/stripe/route.ts` | **NEW** | POST — signature verification + dispatch (checkout.session.completed / invoice.paid noop) |
| `src/app/checkout/page.tsx` | **NEW** | Server Component publique — rend le formulaire |
| `src/app/checkout/checkout-form.tsx` | **NEW** | Client Component — plan/cycle/email/company/name → redirect Stripe |
| `src/app/checkout/success/page.tsx` | **NEW** | Server Component — confirmation post-paiement (informer, ne crée rien) |
| `src/proxy.ts` | **UPDATE** | S'assurer que `/checkout` et `/api/webhooks/stripe` restent publics (matcher / exclusion) |
| `src/messages/fr-NE.json` | **UPDATE** | Section `checkout` (labels FR) |
| `src/lib/stripe/pricing.test.ts` | **NEW** | Tests unitaires conversion XOF→EUR |
| `src/lib/stripe/checkout-metadata.test.ts` | **NEW** | Tests unitaires metadata build/parse |
| `src/lib/stripe/handle-checkout-completed.test.ts` | **NEW** | Tests unitaires orchestration (mock stripe/db/signUp/sendEmail/reactivate) |
| `src/lib/validation/checkout.test.ts` | **NEW** | Tests unitaires Zod |
| `tests/e2e/checkout-flow.spec.ts` | **NEW** | E2E Playwright (création + idempotence + signature invalide + renouvellement) |
| `env.example` | **UPDATE** | Documenter `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (optionnels) |

**Fichiers réutilisés TELS QUELS (ne pas modifier) :**
- `src/lib/email.ts` (`sendEmail`, `buildResetPasswordHtml`)
- `src/lib/tenants/welcome-email.ts` (7-3) — `buildWelcomeEmailHtml/Text`
- `src/lib/tenants/password.ts` (7-3) — `generatePassword`
- `src/lib/tenants/slug.ts` (7-3) — `slugify`, `generateUniqueSlug`
- `src/lib/tenants/period.ts` (7-4) — `calculatePeriodFromCycle`
- `src/lib/tenants/payment-email.ts` (7-4) — `buildPaymentConfirmationEmailHtml/Text`
- `src/lib/tenants/reactivate.ts` (7-8) — `reactivateTenantWithPayment`
- `src/lib/tenants/tenant-config.ts` (7-1) — `PLAN_PRICES_XOF`, `PLAN_LIMITS`, `APEX_DOMAIN`
- `src/lib/api/envelope.ts` — `apiError`, `HTTP_STATUS`
- `src/lib/auth.ts` — `auth.api.signUp`
- `src/lib/money.ts` — `formatFcfa`

---

## Open Decisions (carry-forward)

### ⚠️ Décision ouverte : unification de l'enum tier (free/pro/enterprise vs starter/pro/entreprise)

**Contexte :** le schéma actuel contient `tierEnum = pgEnum("tier", ["starter", "pro", "entreprise"])` (story 6-2, quotas), mais Epic 7 utilise `tenant_plan: free|pro|enterprise` (anglais, pas d'accent). **Deux enums cohabitent** pour le même concept métier (niveau d'abonnement).

**Impact sur 7-10 :** Stripe mappe vers `tenant_plan` (`free|pro|enterprise`). Les prix `PLAN_PRICES_XOF` utilisent `free/pro/enterprise`. Les `metadata.plan` Stripe sont `pro|enterprise`.

**Recommandation (flag parent) :** unifier sur `tenant_plan` (anglais, cohérent avec Epic 7 et Stripe). Déprécier/migrer `tierEnum` (`starter`→`free`, `entreprise`→`enterprise`). Cette story suppose `tenant_plan` correct (cohérent avec 7-1 à 7-9). Ne PAS introduire de mapping runtime.

### ⚠️ Décision ouverte : FK sur `confirmedBy`/`actorId` (cf. « Pas de superadmin »)

Si 7-1 a défini `subscription_payments.confirmedBy` et `tenant_events.actorId` comme FK vers `user.id`, la constante sentinelle `SYSTEM_ACTOR_ID` violerait la contrainte. **Le parent doit trancher :**
- (A) Pas de FK (contrat applicatif) — `SYSTEM_ACTOR_ID` fonctionne.
- (B) FK — créer un user système `system-stripe-webhook` au seed (sans credential account, ou avec email `system@quotation.app`).

Cette story assume (A). À coordonner avec 7-1.

### Décision assumée : mode `payment` vs `subscription` Stripe

Mode `payment` (one-shot) retenu pour MVP. Le cycle monthly/annual est applicatif (cron 7-6 rappelle, client repasse /checkout). **V2 :** migrer vers mode `subscription` Stripe pour auto-renew + activer `invoice.paid` handler (AC7 currently no-op).

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (bmad-dev-story workflow)

### Debug Log References

- `pnpm db:generate` → `drizzle/0017_vengeful_wind_dancer.sql` (tenants.stripe_customer_id/stripe_checkout_session_id + stripe_processed_events table + partial unique index)
- `pnpm db:migrate` — applied cleanly against local Postgres (docker compose)
- `pnpm check` — 0 lint errors (32 pre-existing/consistent import-order warnings across the repo, none new-breaking), typecheck clean, 765/765 vitest tests passing
- `pnpm build` — succeeded; `/checkout`, `/checkout/success`, `/api/v1/checkout/create-session`, `/api/webhooks/stripe` all present in the route manifest

### Completion Notes List

- Implemented full Stripe Checkout (mode `payment`, EUR) + webhook auto-activation per AC1–AC10.
- `PLAN_PRICES_XOF` did not exist yet in `tenant-config.ts` (7-1/7-12 hadn't added it) — added it there as the minimal missing piece this story depends on; 7-12 (platform settings) can later make it dynamic.
- FK flag resolved: confirmed `subscription_payments.confirmedBy` / `tenant_events.actorId` are plain `text` (no FK) in the actual 7-1 schema, so the `SYSTEM_ACTOR_ID` sentinel (option A from Dev Notes) works with no schema change.
- Reused 7-3/7-4/7-8 helpers as instructed: `generatePassword`, `buildWelcomeEmailHtml/Text`, `calculatePeriodFromCycle`, `buildPaymentConfirmationEmailHtml/Text`, `reactivateTenantWithPayment`. Auth signup uses `auth.api.signUpEmail` (the actual exported method name in this codebase; the story text said `signUp`).
- `reactivateTenantWithPayment` only handles suspended/cancelled → active; the active/trial "extend if new period is later" branch in the renewal flow was written by hand, mirroring the equivalent logic already in `record-payment.ts` (7-4).
- Rollback on signup failure explicitly deletes `stripe_processed_events` and `subscription_payments` rows before deleting the tenant, because the actual FK is `ON DELETE SET NULL` (not CASCADE as the story's Dev Notes assumed) — needed so a Stripe retry of the same event id isn't silently swallowed as "already processed".
- Slug uniqueness: `tenant-config`/`slug.ts` only exposes a pure `generateSlug`/`validateSlug` (no DB-aware `generateUniqueSlug` helper existed) — added a local `generateUniqueTenantSlug` in `handle-checkout-completed.ts` with a bounded collision-suffix loop, consistent with `createTenantWithAdmin`'s uniqueness check pattern.
- E2E spec written at `e2e/checkout-flow.spec.ts` (the project's actual e2e root per `playwright.config.ts`, not `tests/e2e/` as the story text assumed). Page-level and validation/signature-verification scenarios run unconditionally; the full creation→renewal webhook flow (using `stripe.webhooks.generateTestHeaderString`) is gated behind `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` being present in the test env and `test.skip`s otherwise — no Stripe test account is configured in this environment, consistent with how prior Epic 7 stories (7-7, 7-8, 7-9) handled Playwright/env gaps.
- T17's manual `stripe listen` + `stripe trigger checkout.session.completed` verification was **not** run (no Stripe CLI/account available in this sandbox) — left unchecked; developer should run it locally before this reaches production, per the story's own Dev Notes instructions.

### File List

**New:**
- `src/lib/stripe/client.ts`
- `src/lib/stripe/pricing.ts` + `pricing.test.ts`
- `src/lib/stripe/checkout-metadata.ts` + `checkout-metadata.test.ts`
- `src/lib/stripe/checkout-rate-limit.ts` (not in original Files List — public endpoint IP rate limit, mirrors `password-reset-rate-limit.ts`)
- `src/lib/stripe/create-checkout-session.ts`
- `src/lib/stripe/handle-checkout-completed.ts` + `handle-checkout-completed.test.ts`
- `src/lib/tenants/system-actor.ts`
- `src/lib/validation/checkout.ts` + `checkout.test.ts`
- `src/app/api/v1/checkout/create-session/route.ts`
- `src/app/api/webhooks/stripe/route.ts`
- `src/app/checkout/page.tsx`
- `src/app/checkout/checkout-form.tsx`
- `src/app/checkout/success/page.tsx`
- `e2e/checkout-flow.spec.ts`
- `drizzle/0017_vengeful_wind_dancer.sql` + `drizzle/meta/0017_snapshot.json`
- `src/lib/stripe/create-checkout-session.test.ts` (added during review fixes)
- `src/app/api/webhooks/stripe/route.test.ts` (added during review fixes)

**Updated:**
- `package.json` / `pnpm-lock.yaml` — added `stripe` (^22.3.0)
- `src/lib/schema.ts` — `tenants.stripeCustomerId`/`stripeCheckoutSessionId` + partial unique index + new `stripeProcessedEvents` table
- `src/lib/tenants/tenant-config.ts` — added `PLAN_PRICES_XOF`
- `src/proxy.ts` — `/checkout` added to public paths (webhook already public via `/api/` prefix)
- `src/messages/fr-NE.json` — `checkout` i18n section
- `env.example` — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
- `src/lib/tenants/resolve-tenant.test.ts` — added `stripeCustomerId`/`stripeCheckoutSessionId: null` to the mock tenant row (schema change fallout, unrelated pre-existing test)
- `drizzle/meta/_journal.json`
- `src/lib/stripe/create-checkout-session.ts` — reuse existing Stripe customer for renewals (review fix)
- `src/lib/stripe/handle-checkout-completed.ts` — rollback also deletes orphaned Better Auth user/account (review fix)
- `src/app/api/webhooks/stripe/route.ts` — INVALID_METADATA → 400 instead of 500 (review fix)

### Review Findings

**Round 1 (independent reviewer) — 2 High, 1 Medium, all fixed:**

1. **High — renewals via `/checkout` created duplicate tenants instead of renewing.** `createCheckoutSession` only passed `customer_email`, so every checkout got a fresh Stripe customer id, and the webhook's renewal detection keys off `stripeCustomerId`. Fixed: `createCheckoutSession` now looks up the admin's existing tenant (by email → `user.tenantId` → `tenants.stripeCustomerId`) and passes `customer: <existing id>` when found, so Stripe attaches the new session to the same customer and the webhook correctly detects a renewal. Covered by `create-checkout-session.test.ts` (3 tests: new customer, renewal reuse, tenant-with-no-stripe-customer-yet fallback).

2. **High — signup/link failure after Better Auth user creation could permanently block Stripe retries.** If `signUpEmail` succeeded but the subsequent `UPDATE user` (tenant link) failed, the rollback deleted the tenant/payment/event rows but left the orphaned Better Auth user + account behind — a Stripe retry's `signUpEmail` would then fail on duplicate email forever. Fixed: rollback now also deletes the `account` and `user` rows when a user was created before the failure. Covered by a new test in `handle-checkout-completed.test.ts` asserting 5 deletes (account, user, stripeProcessedEvents, subscriptionPayments, tenants) on this path.

3. **Medium — invalid webhook metadata returned 500 instead of 400.** `StripeWebhookError("INVALID_METADATA")` was caught by the route's generic catch-all and returned 500 (triggering pointless Stripe retries for a permanently-invalid payload). Fixed: the route now checks for `err.code === "INVALID_METADATA"` and returns 400/VALIDATION_FAILED; all other errors still return 500 so Stripe retries transient failures. Covered by new `route.test.ts` (8 tests: missing secret, missing signature, bad signature, INVALID_METADATA→400, other errors→500, success, invoice.paid no-op, unhandled event ignored).

After fixes: 777/777 tests passing (was 765 — +12 new tests), `pnpm check` clean, `pnpm build` succeeds.

### Change Log

- 2026-07-03 — Story implemented end-to-end: public `/checkout` (EUR pricing, plan/cycle selector), `POST /api/v1/checkout/create-session`, `POST /api/webhooks/stripe` (signature verification, idempotent by event id, creation + renewal flows), schema migration, i18n, E2E scaffold. 765/765 unit/integration tests passing, `pnpm check` clean, `pnpm build` succeeds. Status → review.
- 2026-07-03 — Code review round 1: fixed 2 High (renewal customer-id reuse; rollback also deletes orphaned Better Auth user/account) + 1 Medium (INVALID_METADATA → 400 not 500). +12 tests (777/777 total). `pnpm check` clean, `pnpm build` succeeds.
