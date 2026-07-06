---
story_key: 8-2-transactional-email-verification
epic_num: 8
story_num: 2
status: review
baseline_commit: "6d86a44"  # dernier commit master au moment de la création
depends_on:
  - "Story 7-3 (bienvenue tenant) — email déjà codé, jamais envoyé réellement"
  - "Story 7-6 (rappels J-7/J-3 + cron) — email déjà codé, jamais envoyé réellement"
  - "Story 7-9 (invitation utilisateur tenant) — email déjà codé, jamais envoyé réellement"
  - "Story 7-4 (confirmation de paiement) — email déjà codé, jamais envoyé réellement"
---

# Story 8.2 : Vérification de la livraison des emails transactionnels

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a admin plateforme,
I want que tous les emails transactionnels partent réellement en production (avec une vraie clé Resend + un domaine vérifié),
so that les utilisateurs reçoivent bien leurs identifiants, rappels et confirmations plutôt qu'un simple `console.log` de dev.

---

## Contexte — pourquoi cette story existe

`src/lib/email.ts` (`sendEmail`) est **déjà entièrement codé** et utilisé par 5 flux différents (bienvenue tenant, invitation utilisateur, mot de passe oublié, rappel expiration, confirmation paiement). Mais **aucun de ces emails n'a jamais réellement transité par Resend** : en dev, `RESEND_API_KEY` est vide donc `sendEmail` fait un `console.log` et ne touche jamais le réseau (voir memory `email-delivery-setup` : "RESEND_API_KEY empty on purpose (dev mode)"). La passe de test E2E du 2026-07-06 (`Docs/testing/test-plan.md`, section "Non couvert dans cette session") a explicitement exclu la vérification réelle des emails de son périmètre.

Cette story n'ajoute **aucune fonctionnalité utilisateur nouvelle**. Elle consiste à : (1) configurer une vraie clé Resend de test + un domaine vérifié, (2) déclencher chacun des 5 flux d'email dans l'app, (3) confirmer la réception réelle, (4) vérifier que le garde-fou "RESEND_API_KEY absent en prod = crash au démarrage" fonctionne bien, (5) documenter les résultats. C'est un runbook de vérification manuelle, pas un ticket de développement de feature.

---

## Acceptance Criteria

**AC1 — Les 5 emails transactionnels partent réellement et sont reçus**

```
GIVEN  RESEND_API_KEY vide en dev (fallback console.log, src/lib/email.ts)
WHEN   je configure une clé Resend de test + un domaine vérifié (RESEND_API_KEY + EMAIL_FROM avec ce domaine)
THEN   les 5 emails suivants sont envoyés via l'API Resend et réellement reçus dans une boîte mail réelle :
         1. Bienvenue tenant (Story 7-3 — création tenant depuis /owner/tenants/new)
         2. Invitation utilisateur (Story 7-9 — ajout d'un user tenant depuis /parametres/utilisateurs ou /owner/tenants/[id] onglet Utilisateurs)
         3. Mot de passe oublié (Better Auth sendResetPassword, src/lib/auth.ts — flux /forgot-password)
         4. Rappel J-7/J-3 (Story 7-6 — /api/cron/expiry-reminders)
         5. Confirmation de paiement (Story 7-4 — enregistrement d'un paiement dans /owner/tenants/[id])
AND    pour chaque email : sujet correct, contenu HTML rendu correctement (pas de balises cassées),
       tous les champs dynamiques (mot de passe, montant, dates, URL) affichés sans échappement visible
       (pas de &amp; ou de &lt; brut dans le corps affiché)
```

**AC2 — Le garde-fou "clé absente en production" est actif**

```
GIVEN  un domaine d'envoi non vérifié / RESEND_API_KEY absent
WHEN   NODE_ENV=production et un email est envoyé sans RESEND_API_KEY configuré
THEN   sendEmail() lève l'erreur "RESEND_API_KEY is required for production email delivery"
       (comportement déjà codé dans src/lib/email.ts:31-33) — à vérifier explicitement dans
       l'environnement de prod cible (pas seulement en local avec NODE_ENV forcé)

GIVEN  ce garde-fou testé en local avec NODE_ENV=production forcé
WHEN   RESEND_API_KEY est vide
THEN   l'erreur est bien levée (et non silencieusement avalée par un des 5 call-sites de sendEmail,
       qui sont tous best-effort try/catch — voir Dev Notes)
```

---

## Périmètre de cette story

**INCLUS :**
- Configuration d'un compte Resend de test (ou sandbox) + `RESEND_API_KEY` + `EMAIL_FROM` avec domaine vérifié
- Déclenchement manuel (ou scripté) des 5 flux d'email listés en AC1, dans l'environnement de dev/staging avec la vraie clé
- Vérification de réception réelle (boîte mail) pour chacun
- Vérification du garde-fou de production (AC2) — test manuel + éventuellement un test automatisé si absent
- Documentation des résultats dans `Docs/testing/` (nouveau fichier ou section ajoutée à `test-plan.md`)
- Mise à jour de `_bmad-output/planning-artifacts/epics.md` / `sprint-status.yaml` si des écarts sont trouvés (bug à créer en story de suivi, pas à corriger ici sauf trivial)
- Si un bug de rendu HTML/texte est trouvé (échappement, lien cassé, sujet incorrect) → correction dans le template concerné (`src/lib/email.ts`, `src/lib/tenants/welcome-email.ts`, `src/lib/cron/reminder-email.ts`, ou l'email de confirmation de paiement dans `src/lib/tenants/record-payment.ts`)

**EXCLU (hors périmètre — ne pas modifier) :**
- Le flux Stripe (paiement réel + webhook) → **story 8.1**
- Le cron réel en production (Vercel Cron scheduling) → **story 8.3** (ici on ne fait que déclencher `/api/cron/expiry-reminders` manuellement pour vérifier l'email, pas le scheduling)
- Toute nouvelle fonctionnalité d'email (ex : email de bienvenue pour un nouveau produit) — hors scope
- Remplacement de Resend par un autre provider — hors scope
- `src/lib/env.ts` (validation Zod des env vars serveur) — ne référence PAS `RESEND_API_KEY` aujourd'hui ; signaler ce gap dans Dev Notes mais le corriger relève de la **story 8.7** (nettoyage pré-prod / `env:check`), sauf si trivial et sans risque de régression

---

## Tasks / Subtasks

- [x] **T1 — Configurer l'environnement d'envoi réel** (AC1)
  - [x] Compte Resend de test utilisé, domaine `nigerverde.com` déjà vérifié dans ce compte (SPF/DKIM OK) — `quotationlogistique.com` ajouté mais non vérifié (DNS non fait), non utilisé pour cette vérification
  - [x] `RESEND_API_KEY` + `EMAIL_FROM="Quotation Logistique <noreply@nigerverde.com>"` configurés dans `.env` local (jamais commité)
  - [x] Domaine vérifié confirmé via `GET https://api.resend.com/domains` (status `verified`)
  - [x] `isEmailDeliveryConfigured()` retourne `true`

- [x] **T2 — Vérifier l'email de bienvenue tenant** (AC1.1)
  - [x] Tenant de test créé via `POST /api/v1/owner/tenants` (sendWelcomeEmail=true), déclenché comme le ferait le formulaire `/owner/tenants/new`
  - [x] Réception réelle confirmée par l'utilisateur : sujet, URL sous-domaine, email/mot de passe affichés sans échappement
  - [x] Tenant de test + comptes nettoyés après vérification (script ponctuel, supprimé)

- [x] **T3 — Vérifier l'email d'invitation utilisateur** (AC1.2)
  - [x] Utilisateur ajouté à un tenant de test via `POST /api/v1/owner/tenants/[id]/users`
  - [x] Réception réelle confirmée par l'utilisateur (même template `buildWelcomeEmailHtml`)

- [x] **T4 — Vérifier l'email de mot de passe oublié** (AC1.3)
  - [x] Flux déclenché via `POST /api/auth/request-password-reset` sur un compte de test réel
  - [x] Réception confirmée par l'utilisateur ; lien de reset cliqué, `/reset-password` fonctionne bout-en-bout

- [x] **T5 — Vérifier les emails de rappel J-7/J-3** (AC1.4)
  - [x] Tenant de test adapté (plan pro, `subscriptionEnd` à J-7 puis J-3), `GET /api/cron/expiry-reminders` déclenché manuellement (Bearer `CRON_SECRET` local)
  - [x] Réception confirmée par l'utilisateur pour les deux paliers (`first` J-7, `second` J-3), sujets/urgence corrects
  - [x] Non-duplication vérifiée : rejeu du cron le même jour pour le palier J-7 → 0 reminder additionnel (`processed.reminders: 0`)

- [x] **T6 — Vérifier l'email de confirmation de paiement** (AC1.5)
  - [x] Paiement de test enregistré via `POST /api/v1/owner/tenants/[id]/payments`
  - [x] Réception confirmée par l'utilisateur : montant (25 000 XOF), méthode (virement), période corrects

- [x] **T7 — Vérifier le garde-fou de production** (AC2)
  - [x] Test unitaire existant (`src/lib/email.test.ts`) : passe. Test en process réel non mocké (`NODE_ENV=production RESEND_API_KEY=`) : `sendEmail` lève bien `"RESEND_API_KEY is required for production email delivery"`. Vérification en environnement de production cible réel **non effectuée** (pas d'accès déploiement prod) — documentée comme limitation dans le rapport
  - [x] Confirmé par lecture de code : les 5 call-sites sont `try/catch` best-effort par design — comportement voulu, pas un bug
  - [x] `src/lib/env.ts` ne valide pas `RESEND_API_KEY`/`EMAIL_FROM` — gap documenté dans le rapport pour story 8.7, non implémenté ici

- [x] **T8 — Documenter les résultats** (AC1, AC2)
  - [x] `Docs/testing/email-delivery-verification.md` créé : date, compte Resend, domaine vérifié, résultat par email, bug de configuration trouvé + corrigé
  - [x] Aucun bug de rendu HTML/échappement/sujet/lien trouvé dans les templates — rien à corriger côté templates ni tests unitaires associés

- [x] **T9 — Vérification finale**
  - [x] `pnpm check` : lint ✓ (0 erreur, warnings pré-existants non liés) typecheck ✓ tests ✓ (862/862, aucune régression)
  - [x] `pnpm build` : passe sans erreur
  - [x] Toutes les données de test (2 tenants, 5 comptes utilisateurs, événements, paiement) supprimées après vérification — confirmé par requête de contrôle (0 résultat restant)

---

## Dev Notes

### Ce qui existe déjà — ne PAS réinventer

- `src/lib/email.ts` — `sendEmail()` (Resend, best-effort en dev via `console.log`, throw en prod si clé absente), `isEmailDeliveryConfigured()`, `escapeHtml`/`escapeAttribute`, `buildResetPasswordHtml()`.
- `src/lib/tenants/welcome-email.ts` — `buildWelcomeEmailHtml/Text()` — réutilisé par la fois **bienvenue tenant** (story 7-3, `create-tenant.ts`) ET **invitation utilisateur** (story 7-9, `tenant-users.ts`). Un seul template, deux call-sites.
- `src/lib/cron/reminder-email.ts` — `buildReminderEmailHtml/Text()` (rappel J-7/J-3, 3 stages `first|second|urgent`) et `buildExpiryEmailHtml/Text()` (suspension après expiration de grâce).
- `src/lib/tenants/record-payment.ts` (lignes ~160-196) — `buildPaymentConfirmationEmailHtml/Text()` appelé après un `INSERT` de paiement réussi ; email envoyé au premier admin du tenant (`ORDER BY createdAt ASC LIMIT 1`).
- `src/lib/auth.ts` (lignes 182-198) — `emailAndPassword.sendResetPassword` (Better Auth hook), `resetPasswordTokenExpiresIn: 86400` (24h).

**Aucune nouvelle dépendance, aucun nouveau template à créer.** Cette story est de la vérification + corrections ponctuelles si un bug de rendu est trouvé — pas du développement de feature.

### Tous les call-sites de sendEmail sont best-effort (try/catch) — c'est voulu

Les 5 flux catchent l'échec d'envoi et continuent (le tenant/user/paiement est créé même si l'email échoue) :
- `create-tenant.ts` (bienvenue)
- `tenant-users.ts` (invitation)
- `auth.ts` (reset password — ne loggue même pas l'échec à l'utilisateur, pour ne pas révéler si l'email existe)
- `expiry-job.ts` / cron (rappels)
- `record-payment.ts` (confirmation paiement, `emailStatus` renvoyé au caller)

**Ne PAS changer ce comportement.** L'objectif de cette story est de vérifier que l'envoi RÉUSSIT en conditions réelles, pas de rendre l'échec bloquant.

### Contrainte connue — Resend en mode test/sandbox

Mémoire projet (`email-delivery-setup`) : en mode test Resend, les emails ne partent réellement que vers l'adresse `maigatechlab@gmail.com` (restriction du compte sandbox tant que le domaine n'est pas pleinement vérifié pour l'envoi à des tiers). **Vérifier le domaine avant de considérer l'AC1 comme validé pour des destinataires autres que cette adresse.** Si seul le sandbox est disponible, documenter cette limitation dans le rapport (T8) plutôt que de déclarer l'AC pleinement validée.

### `src/lib/env.ts` ne valide pas `RESEND_API_KEY`

Le schema Zod serveur (`serverEnvSchema`) ne référence pas `RESEND_API_KEY` ni `EMAIL_FROM` aujourd'hui — seul `src/lib/email.ts` fait le check runtime (throw si absent en prod, à l'appel de `sendEmail`, pas au démarrage de l'app). Cela signifie que le garde-fou n'est déclenché qu'au premier envoi d'email en prod, pas au boot. C'est un gap potentiel pour un `pnpm env:check` fiable pré-déploiement (scope de la **story 8.7**). Le signaler dans le rapport (T8) ; ne pas l'implémenter dans cette story sauf si trivial et sans risque.

### Cron : idempotence des rappels

`src/lib/cron/expiry-job.ts` + `expiry-decisions.ts` gèrent la logique "un seul rappel par palier par jour" — à revérifier en rejouant le cron manuellement plusieurs fois le même jour (T5). Ne pas confondre avec le scheduling réel du cron (Vercel Cron), qui est le périmètre de la **story 8.3**.

### Sécurité — ne jamais logger le mot de passe ni les vraies clés API

Comme pour `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, etc. : ne jamais commiter de vraie clé dans `.env` versionné, ne jamais logger de mot de passe généré. Utiliser des comptes/tenants de test dédiés à cette vérification, pas des comptes de production réels.

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Créer un nouveau système d'email / provider | Réutiliser `sendEmail` (Resend) tel quel |
| Rendre `sendEmail` bloquant côté appelants (retirer les try/catch) | Garder le pattern best-effort existant |
| Committer une vraie `RESEND_API_KEY` dans `.env.example` ou le repo | Clé uniquement en local `.env` (gitignored) |
| Considérer l'AC1 validé en mode sandbox restreint sans le documenter | Documenter explicitement la limitation "test-mode only sends to X" |
| Laisser les tenants/users/paiements de test créés pour cette vérification en base partagée | Nettoyer après vérification (cf. story 8.7 pour le nettoyage systématique pré-prod) |
| Modifier `src/lib/env.ts` pour ajouter `RESEND_API_KEY` sans coordination avec story 8.7 | Documenter le gap, laisser 8.7 le traiter (sauf ajustement trivial validé) |

### Commandes pour le dev agent

```bash
# 1. Configurer .env local (jamais commité)
RESEND_API_KEY=<clé de test Resend>
EMAIL_FROM="Quotation Logistique <noreply@<domaine-vérifié>>"

# 2. Lancer l'app
docker compose up -d   # si utilisé localement — sinon DB déjà provisionnée
pnpm dev

# 3. Déclencher chaque flux depuis l'UI (voir T2-T6) et vérifier la boîte mail réelle

# 4. Tester le garde-fou de prod (T7) — dans un terminal séparé, NODE_ENV forcé
NODE_ENV=production RESEND_API_KEY= pnpm dev   # ou un script ad hoc appelant sendEmail directement

# 5. Qualité
pnpm check
pnpm build
```

### Project Structure Notes

- Aucun nouveau dossier/module attendu — vérification + corrections ponctuelles dans les fichiers existants listés ci-dessus.
- Rapport de vérification à ajouter sous `Docs/testing/` (cohérent avec `Docs/testing/test-plan.md` déjà présent).

### References

- [Epic 8 spec] `_bmad-output/planning-artifacts/epics.md` — Story 8.2 (lignes ~1102-1116)
- [Docs/testing/test-plan.md] — section "Non couvert dans cette session" (déclencheur de l'epic 8)
- [src/lib/email.ts] — `sendEmail`, `isEmailDeliveryConfigured`, `buildResetPasswordHtml`
- [src/lib/tenants/welcome-email.ts] — template bienvenue/invitation
- [src/lib/cron/reminder-email.ts] — templates rappel/expiration
- [src/lib/tenants/record-payment.ts] — email confirmation paiement (lignes ~160-196)
- [src/lib/auth.ts] — `sendResetPassword` hook Better Auth (lignes 182-198)
- [env.example] — `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_WHATSAPP`, `OWNER_EMAIL`
- [Story 7-3] `_bmad-output/implementation-artifacts/7-3-create-tenant-welcome-email.md` — pattern email bienvenue + escaping
- [Story 7-6] `_bmad-output/implementation-artifacts/7-6-expiry-cron-automated-reminders.md` — cron + rappels
- [project-context.md] — règles générales du projet (i18n, TS strict, testing)
- Memory : `email-delivery-setup` — RESEND_API_KEY vide en dev intentionnel ; Resend test-mode limité à `maigatechlab@gmail.com` ; vérifier le domaine avant de restaurer la clé

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (claude-sonnet-5)

### Debug Log References

- `platform_settings.notifications.senderAddress` was stale (`contact@maigatechlab.com`, an unverified domain) — caused `emailSent: false` on the first 2 tenant-creation attempts even with a valid `RESEND_API_KEY`. Root-caused via Resend API error path (silent catch in `create-tenant.ts`), fixed by updating the DB row to the verified domain (`noreply@nigerverde.com`). Documented in `Docs/testing/email-delivery-verification.md`.
- Dev server needed a restart after `.env` edits (`RESEND_API_KEY`, `CRON_SECRET`) — Next.js dev process caches `process.env` at boot.
- Free-plan tenant (`maxUsers: 1`) blocked the invitation-flow test (`QUOTA_EXCEEDED`) — bumped test tenant's `maxUsers` directly for verification purposes only (test data, since deleted).
- Expiry reminders key off `tenants.subscriptionEnd` (not `trialEndsAt`) and require `plan != "free"` — adjusted test tenant accordingly.

### Completion Notes List

- All 5 transactional email flows (bienvenue tenant, invitation utilisateur, mot de passe oublié, rappel J-7/J-3, confirmation paiement) triggered against the real Resend API with a verified sending domain (`nigerverde.com`) and confirmed received by the user in a real inbox, content correct — **AC1: full pass**.
- Idempotence of the expiry-reminder cron confirmed: re-running the same day after a J-7 reminder sent produces 0 additional reminders.
- **AC2: PARTIAL pass only.** Production guard-rail confirmed locally via existing unit test (`src/lib/email.test.ts`, mocked env) and a real, unmocked process run (`NODE_ENV=production RESEND_API_KEY=` → throws). Verification against an actual deployed production environment — explicitly required by AC2's wording ("pas seulement en local") — was **not performed** (no deploy access this session). Do not treat AC2 as fully satisfied until that check is done; tracked as a follow-up for the deployment story (8.7 or dedicated).
- No template/rendering bugs found (escaping, links, subjects all correct) — no changes needed to the 5 email templates themselves.
- **Durable bug found and fixed (source-controlled, not just a local DB patch):** `platform_settings.notifications.senderAddress` was bootstrapped once with a concrete address derived from `EMAIL_FROM` at first read, then never re-synced — a later domain/env change would silently never take effect. Fixed by changing the bootstrap default to `""` in `src/lib/data/platform-settings.ts` + `src/lib/schema.ts` (so `getNotificationSenderAddress()`'s existing `senderAddress || EMAIL_FROM` fallback always applies until an admin explicitly overrides it), plus migration `drizzle/0019_rapid_darwin.sql` which backfills any existing row (any environment, including prod) still holding the old literal default back to `""`, applied automatically via `pnpm build` (`db:migrate && next build`) — no manual per-environment step required. Unit test `src/lib/data/platform-settings.test.ts` updated accordingly.
- `src/lib/env.ts` gap (no `RESEND_API_KEY`/`EMAIL_FROM` validation) confirmed and documented for story 8.7, not implemented here per story scope.
- All test data (2 tenants, 5 test user accounts, tenant events, 1 test payment) created during verification were deleted afterward; confirmed via a follow-up query (0 remaining).
- `pnpm check` (lint/typecheck/862 tests) and `pnpm build` both pass with no regressions after the platform-settings fix.

### File List

- `Docs/testing/email-delivery-verification.md` (new) — verification report for this story
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status update for `8-2-transactional-email-verification`
- `src/lib/data/platform-settings.ts` — `notifications.senderAddress` bootstrap default changed from a concrete address to `""` (live env fallback instead of a frozen snapshot)
- `src/lib/schema.ts` — `platformSettings.notifications` column default updated to match
- `src/lib/data/platform-settings.test.ts` — updated assertions for the new bootstrap default
- `drizzle/0019_rapid_darwin.sql` (new) — column default migration + idempotent data backfill for existing rows still holding the stale literal default
- `src/lib/validation/platform-settings.ts` — `notifications.senderAddress` now accepts `""` (means "use `EMAIL_FROM`") in addition to a well-formed email; previously required a valid email unconditionally, which made `/owner/settings` reject the new empty bootstrap default
- `src/lib/validation/platform-settings.test.ts` — added coverage for the empty-string case
- `src/app/owner/settings/_components/platform-settings-form.tsx` — added a placeholder on the sender-address field clarifying that empty means "use `EMAIL_FROM`"
- `src/messages/fr-NE.json` — added `owner.settings.fields.senderAddressPlaceholder` i18n key
- `.env` (local, gitignored, not committed) — `RESEND_API_KEY`, `EMAIL_FROM` set to verified domain; `CRON_SECRET` added for local cron testing

## Change Log

- 2026-07-06 — Story 8.2 verification executed: all 5 transactional emails confirmed delivered via real Resend API with verified domain (AC1 full pass). Production guard-rail (AC2) confirmed locally only — real production-target verification not performed, flagged as outstanding, not to be assumed complete. Found + durably fixed a config-drift bug where `platform_settings.notifications.senderAddress` froze at bootstrap and never followed later `EMAIL_FROM`/domain changes (code fix + migration `0019`, not just a local DB patch). Report added; all test data cleaned up; `pnpm check` + `pnpm build` pass. Status → review.
- 2026-07-06 — Code review follow-up (round 1): addressed High (senderAddress fix made durable via code + migration instead of DB-only patch) and Medium (AC2 explicitly downgraded to partial in report/notes; production-target check documented as outstanding, not implied done) findings.
- 2026-07-06 — Code review follow-up (round 2): fixed regression introduced by round 1 — `platformSettingsSchema` still required `notifications.senderAddress` to be a non-empty valid email, so `/owner/settings` could no longer be saved once the field's default became `""`. Schema now accepts `""` (env fallback) or a well-formed email; added test + form placeholder.
