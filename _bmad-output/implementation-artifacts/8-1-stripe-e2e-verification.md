# Story 8.1: Vérification bout-en-bout du paiement Stripe

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a opérateur de la plateforme,
I want que le flux Stripe (checkout trial→payant + webhook) soit vérifié avec de vraies clés de test,
so that les tenants peuvent réellement passer en payant sans intervention manuelle.

## Acceptance Criteria

1. **Given** `POST /api/v1/checkout/create-session` et `POST /api/webhooks/stripe` (Story 7-10, déjà codés) **When** je lance `stripe listen --forward-to localhost:3000/api/webhooks/stripe` avec des clés de test Stripe **Then** un checkout réel (carte de test Stripe) déclenche le webhook, met à jour `companySubscription`/`tenants` et enregistre un paiement dans `subscriptionPayments`.
2. **Given** l'idempotence attendue (table `stripeProcessedEvents`) **When** Stripe renvoie le même événement deux fois (retry réseau) **Then** le second traitement est un no-op (pas de double paiement enregistré, pas de doublon dans `subscriptionPayments`).
3. **Given** un paiement Stripe échoué ou une carte refusée **When** le webhook reçoit l'événement d'échec **Then** le tenant reste dans son état courant (pas de passage en payant), et l'échec est visible dans les logs/journal (pas de bris silencieux).

## Tasks / Subtasks

- [ ] Task 1 — Préparer l'environnement Stripe test (AC: #1)
  - [ ] Créer/récupérer un compte Stripe **test mode**, générer `STRIPE_SECRET_KEY` (sk_test_...) et configurer 4 Price IDs test (`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`, `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_ANNUAL`) — voir `env.example` lignes 46-55
  - [ ] Installer/lancer la Stripe CLI localement, exécuter `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, récupérer le `whsec_...` affiché et le poser dans `STRIPE_WEBHOOK_SECRET`
  - [ ] Démarrer l'app en local (`pnpm dev`) avec ces variables d'env chargées
- [ ] Task 2 — Vérifier le flux nominal checkout → webhook → provisioning (AC: #1)
  - [ ] Appeler `POST /api/v1/checkout/create-session` (`src/app/api/v1/checkout/create-session/route.ts`) avec un payload valide (`createCheckoutSessionSchema` — `src/lib/validation/checkout.ts`) pour un plan Pro et un plan Enterprise
  - [ ] Compléter le checkout Stripe hébergé avec une carte de test Stripe qui réussit (`4242 4242 4242 4242`, toute date future, tout CVC)
  - [ ] Confirmer que le webhook `checkout.session.completed` est reçu par `POST /api/webhooks/stripe` (`src/app/api/webhooks/stripe/route.ts`) et traité par `handleCheckoutCompleted` (`src/lib/stripe/handle-checkout-completed.ts`)
  - [ ] Vérifier en DB : une ligne insérée dans `tenants` (status=`active`, plan correct, `stripeCustomerId`/`stripeCheckoutSessionId` renseignés), une ligne dans `subscriptionPayments` (montant XOF correct, `paymentMethod`='stripe'), une ligne dans `stripeProcessedEvents` (eventId Stripe), et deux entrées `tenantEvents` (`created` + `payment_recorded`)
  - [ ] Vérifier que l'email de bienvenue (`buildWelcomeEmailHtml`/`buildWelcomeEmailText`) est bien envoyé/loggé (voir Story 8-2 pour la vérification email réelle — ici valider seulement que `sendEmail()` est appelé sans exception et que `emailSent` reflète le résultat)
  - [ ] Rejouer un checkout pour un tenant Stripe déjà existant (`stripeCustomerId` déjà en base) et vérifier le chemin `handleRenewal` : mise à jour `subscriptionEnd`, insertion `subscriptionPayments`, réactivation si le tenant était `suspended`/`cancelled` (voir `reactivateTenantWithPayment` dans `src/lib/tenants/reactivate.ts`)
- [ ] Task 3 — Vérifier l'idempotence sur retry Stripe (AC: #2)
  - [ ] Avec la Stripe CLI, renvoyer manuellement le même événement (`stripe events resend <event_id>` ou rejouer le même webhook payload deux fois côté CLI)
  - [ ] Confirmer que `handleCheckoutCompleted` détecte l'`eventId` déjà présent dans `stripeProcessedEvents` (voir la garde en tête de fonction, `src/lib/stripe/handle-checkout-completed.ts` lignes 431-443) et retourne un no-op sans nouvelle ligne `subscriptionPayments` ni nouveau `tenantEvents`
  - [ ] Vérifier en DB qu'il n'y a bien qu'une seule ligne payment/tenant_event pour cet event, pas de doublon
- [ ] Task 4 — Vérifier le comportement sur carte refusée / paiement échoué (AC: #3)
  - [ ] Déclencher un paiement avec une carte de test Stripe qui échoue (ex. `4000 0000 0000 0002` — refusée)
  - [ ] Confirmer qu'aucun événement `checkout.session.completed` n'est émis dans ce cas (Stripe n'envoie ce webhook qu'en cas de succès) — documenter ce comportement attendu
  - [ ] Vérifier qu'aucune ligne n'est créée/modifiée dans `tenants`/`subscriptionPayments` pour cette tentative échouée, et que l'échec Stripe (visible côté Dashboard Stripe test / logs Stripe CLI) est traçable
  - [ ] Si applicable, vérifier la gestion des erreurs de signature invalide (`getStripe().webhooks.constructEvent` throw → réponse 400 `VALIDATION_FAILED`, voir route.ts lignes 30-39) en envoyant volontairement un payload avec signature invalide
- [ ] Task 5 — Documenter les résultats (toutes AC)
  - [ ] Mettre à jour `Docs/testing/test-plan.md` section "Non couvert dans cette session" pour retirer/annoter la ligne Stripe (ligne 146) avec le résultat de cette vérification
  - [ ] Consigner tout bug trouvé et corrigé pendant la vérification (pattern déjà utilisé dans `test-plan.md` section "Bugs trouvés et corrigés")

## Dev Notes

- **Nature de la story : vérification manuelle/E2E, pas de nouvelle feature.** Le code Stripe (checkout + webhook + handlers) est déjà entièrement implémenté depuis la Story 7-10 et testé unitairement (`src/lib/stripe/*.test.ts`, `src/app/api/webhooks/stripe/route.test.ts`). Cette story ne doit PAS réimplémenter ou modifier cette logique sauf si un bug réel est découvert pendant la vérification — dans ce cas, corriger le bug précisément et documenter (pattern Epic 8 : "2 bugs cross-tenant trouvés et corrigés" pendant la passe de test E2E du 2026-07-06).
- **Ne pas réinventer :** toute la logique métier existe déjà : `createCheckoutSession` (`src/lib/stripe/create-checkout-session.ts`), `handleCheckoutCompleted`/`handleCreation`/`handleRenewal` (`src/lib/stripe/handle-checkout-completed.ts`), `parseSessionMetadata` (`src/lib/stripe/checkout-metadata.ts`), `getStripe()` singleton (`src/lib/stripe/client.ts`).
- **Mode Stripe = "payment" (pas "subscription")** : chaque checkout est un paiement ponctuel, la récurrence est gérée manuellement (rappels + renouvellement via nouveau checkout). `invoice.paid` est donc un no-op volontaire dans le webhook (route.ts lignes 62-68) — ne pas essayer de le "corriger", c'est le comportement attendu MVP.
- **Idempotence** repose sur `stripeProcessedEvents.eventId` (unique index `idx_stripe_events_event_id`, `src/lib/schema.ts` ligne ~554-563) vérifié en première ligne de `handleCheckoutCompleted` — c'est la seule garde, ne pas ajouter de logique redondante ailleurs.
- **Erreurs volontairement non-retry** : `StripeWebhookError` avec code `INVALID_METADATA` → 400 (Stripe ne retry pas un 400) ; toute autre erreur → 500 (Stripe retry, l'idempotence protège du double-traitement). Ce choix est documenté dans les commentaires de `route.ts` (lignes 52-59).
- **Rollback sur échec de provisioning** (`handleCreation`) : si `signUpEmail` réussit mais le lien user↔tenant échoue, ou si le provisioning échoue après l'insert Stripe, le code supprime explicitement `account`/`user`/`stripeProcessedEvents`/`subscriptionPayments`/`tenants` pour permettre un retry Stripe propre (FK `ON DELETE SET NULL`, pas `CASCADE` — voir commentaires lignes 165-184). Si un bug est trouvé ici pendant la vérification, c'est probablement le point le plus fragile du flux.
- **Runtime Node obligatoire** sur la route webhook (pas Edge) car Drizzle + Better Auth sont Node-only — ne pas ajouter `export const runtime = "edge"`.
- **Body brut requis** : `req.text()` avant `constructEvent`, jamais `req.json()` en premier (la signature Stripe est calculée sur les bytes exacts).
- **Ne jamais logger de PII brute** : `maskCustomerId`/`maskEmail` existent déjà dans `handle-checkout-completed.ts` — les réutiliser si des logs additionnels sont nécessaires pendant le debug.

### Variables d'environnement requises (`env.example` lignes 46-55)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...           # généré par `stripe listen`
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_ANNUAL=price_...
STRIPE_PRICE_ENTERPRISE_MONTHLY=price_...
STRIPE_PRICE_ENTERPRISE_ANNUAL=price_...
```

### Cartes de test Stripe utiles

- Succès : `4242 4242 4242 4242`
- Refusée (generic decline) : `4000 0000 0000 0002`
- Toute date d'expiration future, tout CVC 3 chiffres, tout code postal.

### Tables DB concernées (`src/lib/schema.ts`)

- `tenants` (ligne ~ ailleurs dans schema.ts — champs `status`, `plan`, `stripeCustomerId`, `stripeCheckoutSessionId`, `subscriptionStart/End`)
- `subscriptionPayments` (ligne 504) — un paiement par checkout traité
- `stripeProcessedEvents` (ligne 554) — clé d'idempotence, `uniqueIndex` sur `eventId`
- `tenantEvents` (ligne 530) — journal append-only (`created`, `payment_recorded`, `reactivated`, `checkout_email_mismatch`)
- `companySubscription` (ligne 454) — **non touché par ce flux Stripe/tenants** (c'est le système de quota par company MVP-1, distinct du système tenant SaaS Epic 7 — ne pas confondre les deux pendant la vérification)

### Fichiers pertinents (ne pas modifier sauf bug confirmé)

- `src/app/api/v1/checkout/create-session/route.ts` — création de session checkout (route publique, rate-limited par IP)
- `src/app/api/webhooks/stripe/route.ts` — réception webhook, vérification signature, dispatch par `event.type`
- `src/lib/stripe/client.ts` — singleton Stripe SDK (`getStripe()`, version API pinée `2026-06-24.dahlia`)
- `src/lib/stripe/create-checkout-session.ts`, `src/lib/stripe/checkout-metadata.ts`, `src/lib/stripe/handle-checkout-completed.ts` (479 lignes, cœur de la logique)
- `src/lib/stripe/checkout-rate-limit.ts`
- `src/lib/validation/checkout.ts` — schéma Zod `createCheckoutSessionSchema`
- `src/lib/tenants/reactivate.ts` — `reactivateTenantWithPayment` (chemin renouvellement avec tenant suspendu/annulé)
- `src/lib/tenants/welcome-email.ts`, `src/lib/tenants/payment-email.ts` — templates email (contenu réel vérifié en Story 8-2)
- Tests existants (référence, ne pas dupliquer) : `src/lib/stripe/*.test.ts`, `src/app/api/webhooks/stripe/route.test.ts`

### Project Structure Notes

- Aucun nouveau fichier de code attendu pour cette story — c'est une vérification manuelle documentée. Si un bug est corrigé, suivre l'organisation existante (`src/lib/stripe/`, `src/app/api/webhooks/stripe/`).
- La documentation de résultat va dans `Docs/testing/test-plan.md` (fichier déjà existant, section "Non couvert dans cette session").
- Package Stripe SDK : `stripe@^22.3.0` (`package.json` ligne 64) — ne pas changer de version sans raison documentée.

### Testing Standards Summary

- Cette story est elle-même un test manuel E2E — pas de nouveaux tests automatisés requis sauf si un bug est corrigé, auquel cas suivre les conventions Vitest existantes (`src/lib/stripe/*.test.ts` comme modèle) et ajouter un cas de régression.
- `pnpm check` (lint + typecheck + vitest) doit rester vert après toute correction de bug.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.1: Vérification bout-en-bout du paiement Stripe] (lignes 1078-1101)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8: Préparation Go-Live] (lignes 1078-1080, contexte déclencheur)
- [Source: Docs/testing/test-plan.md#Non couvert dans cette session] (ligne 146 — Stripe explicitement exclu de la passe E2E du 2026-07-06)
- [Source: src/app/api/webhooks/stripe/route.ts] — implémentation webhook (Story 7-10)
- [Source: src/app/api/v1/checkout/create-session/route.ts] — implémentation création session checkout
- [Source: src/lib/stripe/handle-checkout-completed.ts] — logique de provisioning/renouvellement/idempotence
- [Source: src/lib/schema.ts#stripeProcessedEvents,subscriptionPayments,tenants,tenantEvents] — schéma DB
- [Source: env.example] lignes 46-55 — variables Stripe requises
- [Source: _bmad-output/project-context.md] — règles projet transverses (API envelope, quota vs tenant distinct, testing standards)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **BLOQUÉ (2026-07-06) :** vérification live impossible. Stripe n'accepte pas les entités marchandes enregistrées au Niger/Mali/Burkina Faso (espace Sahel/AES) — hors liste pays supportés Stripe (UE, Amériques, quelques pays africains : Nigeria, Afrique du Sud, Kenya, Égypte, Maroc, Ghana). Aucune clé `sk_test_...` obtenable sans entité étrangère éligible. Tasks 1-4 (nécessitent compte Stripe test + Stripe CLI + checkout hébergé réel) non exécutables en l'état — non cochées volontairement (aucun faux positif). Task 5 documentation faite dans `Docs/testing/test-plan.md` section "Non couvert dans cette session". Décision utilisateur : ne pas bloquer sur cette story, traiter une autre story ready-for-dev de l'Epic 8. Story laissée non complétée ; à reprendre si une entité facturante éligible (UE/USA) est mise en place pour la plateforme.

### File List

- Docs/testing/test-plan.md (documentation du blocage, aucun code modifié)
