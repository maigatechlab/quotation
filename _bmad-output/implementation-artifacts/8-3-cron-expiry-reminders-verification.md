---
story_key: 8-3-cron-expiry-reminders-verification
epic_num: 8
story_num: 3
status: ready-for-dev
baseline_commit: "6d86a44"  # dernier commit master au moment de la création
depends_on:
  - "Story 7-6 (cron expiry-reminders + rappels J-7/J-3/J-1 + suspension auto) — déjà codé, jamais réellement planifié/déclenché en conditions réelles"
  - "Story 7-1 (schema tenants/tenant_events/subscription_payments + proxy enforceTenantAccess) — le cron pose le statut que le proxy lit"
  - "Story 7-12 (platform-config : getGracePeriodDays, getNotificationToggle, getNotificationSenderAddress) — le cron lit désormais ces valeurs dynamiques, pas les constantes DEFAULT_* dépréciées"
  - "Story 8.2 (vérification emails transactionnels) — a déjà couvert le contenu/réception des emails de rappel ; cette story couvre le SCHEDULING + l'idempotence + la suspension, pas le rendu email"
---

# Story 8.3 : Vérification du cron d'expiration et de rappels

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a opérateur de la plateforme,
I want que le cron `/api/cron/expiry-reminders` tourne réellement en production (planifié par Vercel Cron) et déclenche les bonnes actions (rappels, suspension, confirmation de grâce),
so that les tenants en fin de trial/grâce soient notifiés et suspendus automatiquement sans intervention manuelle du owner.

---

## Contexte — pourquoi cette story existe

La logique du cron (`src/lib/cron/expiry-job.ts`, `expiry-decisions.ts`, route `/api/cron/expiry-reminders`) est **déjà entièrement codée et testée unitairement** depuis la story 7-6 (mocks `db`/`sendEmail`). La passe de test E2E manuelle du 2026-07-06 (`Docs/testing/test-plan.md`, section "Non couvert dans cette session") liste explicitement : *"Cron `expiry-reminders` (rappels J-7/J-3, expiration trial, suspension auto) — non déclenché manuellement."* La story 8.2 a déjà vérifié le **contenu et la réception réelle** des emails de rappel/expiration (Resend). Ce qui reste non vérifié et que couvre CETTE story :

1. Le **scheduling réel** — `vercel.json` déclare `"17 3 * * *"` mais Vercel Cron ne s'exécute que sur le déploiement de **production** ; jamais vérifié qu'un vrai déploiement production le déclenche effectivement.
2. L'**idempotence en conditions réelles** — rejouer le cron plusieurs fois le même jour sur un vrai tenant ne doit pas dupliquer les rappels/événements.
3. La **suspension automatique à J0** — jamais observée en base sur un vrai tenant (seulement mockée en tests unitaires).
4. La **protection du endpoint** (`CRON_SECRET`) — vérifier qu'un appel non authentifié échoue bien en environnement cible, pas seulement en local.
5. Le comportement **post-Story 7-12** — le job utilise maintenant `getGracePeriodDays()`, `getNotificationToggle()`, `getNotificationSenderAddress()` (platform settings dynamiques) au lieu des constantes `DEFAULT_GRACE_PERIOD_DAYS`/`OWNER_CONTACT` évoquées dans le brief original de 7-6 — s'assurer que ces valeurs dynamiques sont bien lues en environnement réel et pas silencieusement remplacées par un fallback figé.

Cette story n'ajoute **aucune fonctionnalité nouvelle**. C'est un runbook de vérification manuelle en conditions réelles (staging ou production cible), avec correction ponctuelle si un bug est trouvé — pas un ticket de développement de feature.

---

## Acceptance Criteria

**AC1 — Le cron s'exécute et déclenche les bons rappels sans doublon**

```
GIVEN  le job cron (Story 7-6) et un tenant en trial/actif à J-7 ou J-3 de l'expiration (subscriptionEnd)
WHEN   le cron s'exécute (déclenché manuellement en staging via curl, ou par Vercel Cron en production réelle)
THEN   les emails de rappel appropriés partent (stage first/second/urgent selon le palier)
AND    si le cron est rejoué plusieurs fois le même jour sur le même tenant, aucun doublon n'est envoyé
       (idempotence via hasReminderBeenSent — un seul tenant_events eventType='reminder_sent' par stage)
```

**AC2 — Suspension automatique à J0 sans paiement**

```
GIVEN  un tenant dont le trial/grâce expire (subscriptionEnd <= now) sans paiement couvrant la période
WHEN   le cron s'exécute après la date d'expiration
THEN   le tenant passe automatiquement en status='suspended', avec gracePeriodEndsAt = now + getGracePeriodDays()
AND    un tenant_events eventType='suspended' note='auto-suspended (J0, no payment)' est inséré
AND    un tenant qui a un paiement couvrant la période (subscription_payments.periodEnd >= subscriptionEnd) N'EST PAS suspendu
       (event note='payment covers period, skipped suspension' à la place)
AND    l'enforcement effectif (redirection /subscription-expired) est observé côté proxy pour ce tenant une fois
       sa période de grâce expirée (pendant la grâce, le proxy renvoie allow-with-grace — comportement volontaire)
```

**AC3 — Endpoint protégé contre un déclenchement non autorisé**

```
GIVEN  l'environnement de production cible (ou staging équivalent)
WHEN   je configure le déclenchement du cron (Vercel Cron via vercel.json, déjà présent à la racine)
THEN   un appel SANS header Authorization, ou avec un secret incorrect, reçoit 401 UNAUTHORIZED
AND    si CRON_SECRET n'est pas configuré côté serveur → 500 INTERNAL_ERROR explicite (pas d'exécution silencieuse)
AND    CRON_SECRET est bien configuré dans les Environment Variables du projet Vercel cible (pas seulement en .env local)
AND    un appel avec le bon secret exécute runExpiryJob() exactement une fois et renvoie 200 avec le compteur
       { processed: { reminders, suspended, graceExpired, errors }, at }
```

---

## Périmètre de cette story

**INCLUS :**
- Déclenchement manuel du cron en staging (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/expiry-reminders`) sur des tenants de test préparés à J-7/J-3/J-1/J0/grace-expired (via mutation SQL directe de `subscriptionEnd`/`gracePeriodEndsAt` — aucune UI n'expose ces champs, cf. Dev Notes)
- Vérification de l'idempotence (rejouer le cron 2-3 fois le même jour sur les mêmes tenants de test, confirmer aucun doublon d'email ni de `tenant_events`)
- Vérification de la suspension auto à J0 (avec et sans paiement couvrant) et de l'event `grace-expired`
- Vérification que `CRON_SECRET` est bien positionné dans les variables d'environnement du déploiement cible (Vercel dashboard), et que `vercel.json` (déjà présent à la racine) est bien pris en compte au déploiement production
- Si possible : déclenchement réel par Vercel Cron sur un déploiement production (pas seulement `curl` manuel) — documenter si non réalisable dans cette passe (ex : pas encore de déploiement prod actif) et se limiter alors à la vérification manuelle + `vercel.json` validé
- Documentation des résultats dans `Docs/testing/` (nouveau fichier ou section ajoutée à `test-plan.md`, cohérent avec le pattern de la story 8.2)
- Nettoyage des tenants/événements de test créés pour cette vérification
- Si un bug est trouvé (idempotence cassée, suspension incorrecte, protection du endpoint défaillante) → correction dans le fichier concerné (`expiry-job.ts`, `expiry-decisions.ts`, `route.ts`) + mise à jour/ajout du test unitaire correspondant

**EXCLU (hors périmètre — ne pas modifier) :**
- Le contenu/rendu des emails de rappel/expiration (sujet, HTML, escaping) → **déjà vérifié story 8.2**, ne pas re-tester ici sauf régression détectée en cours de route
- Le flux Stripe (paiement réel + webhook) → **story 8.1**
- La logique métier du cron elle-même (`computeReminderAction`, seuils J-7/J-3/J-1, `calendarDaysBetween`) → **déjà implémentée et testée unitairement en story 7-6**, ne pas réécrire sauf bug avéré
- Les platform settings (`getGracePeriodDays`, `getNotificationToggle`, etc.) → **story 7-12**, déjà en place ; cette story les utilise/vérifie tel quel, ne les modifie pas
- `src/lib/env.ts` (validation Zod de `CRON_SECRET` au démarrage) → gap connu (même famille que le gap `RESEND_API_KEY` signalé en story 8.2), signaler dans Dev Notes pour **story 8.7** (nettoyage pré-prod), ne pas l'implémenter ici sauf trivial et sans risque
- Toute UI d'administration pour éditer manuellement `subscriptionEnd`/`gracePeriodEndsAt` d'un tenant — hors scope (utiliser une mutation SQL directe pour préparer les tenants de test, cf. Dev Notes)

---

## Tasks / Subtasks

- [x] **T1 — Préparer des tenants de test aux seuils clés** (AC1, AC2)
  - [x] Créer (ou réutiliser) 4-5 tenants de test via `/owner/tenants/new` avec `plan` ≠ `free` (pro ou enterprise)
  - [x] Ajuster `subscriptionEnd` par mutation SQL directe pour couvrir : J-7, J-3, J-1, J0 (expiré, sans paiement), J0 (expiré, avec un `subscription_payments.periodEnd` couvrant), et un tenant déjà `suspended` avec `gracePeriodEndsAt` dans le passé (grace-expired)
  - [x] Documenter les valeurs SQL utilisées (requêtes exactes) dans le rapport final (T6) pour reproductibilité

- [x] **T2 — Déclencher le cron manuellement et vérifier AC1 (rappels + idempotence)** (AC1)
  - [x] `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/expiry-reminders`
  - [x] Confirmer réception des emails de rappel (stage correct par tenant) — cf. story 8.2 pour le rendu, ici on vérifie juste que l'envoi est déclenché au bon moment
  - [x] Rejouer le cron 2-3 fois immédiatement après → confirmer qu'aucun email supplémentaire ne part et qu'aucun nouveau `tenant_events` (`reminder_sent`, même `note`/stage) n'est inséré
  - [x] Inspecter `tenant_events` en base (requête SQL) pour confirmer un seul event par stage et par tenant

- [x] **T3 — Vérifier la suspension automatique et le cas paiement couvrant** (AC2)
  - [x] Déclencher le cron sur le tenant J0 sans paiement → confirmer `status='suspended'`, `gracePeriodEndsAt` = now + valeur de `getGracePeriodDays()` (vérifier la valeur réellement configurée en platform_settings, pas supposer 7 jours en dur)
  - [x] Confirmer l'event `tenant_events` `suspended`/`auto-suspended (J0, no payment)`
  - [x] Déclencher le cron sur le tenant J0 avec paiement couvrant → confirmer AUCUNE suspension, event `note='payment covers period, skipped suspension'` — **bug d'idempotence trouvé et corrigé ici, voir Completion Notes**
  - [x] Sur le tenant déjà `suspended` avec grâce expirée → confirmer un event unique `grace-expired`/`suspended` (idempotent au rejeu)
  - [x] Vérifier l'enforcement effectif : se connecter (ou visiter le sous-domaine) du tenant suspendu → confirmer la redirection `/subscription-expired` via le proxy (`src/proxy.ts` / `enforceTenantAccess`, story 7-1) — **bug trouvé et corrigé (post-review) : `enforceTenantAccess` ne redirigeait que `cancelled` ; un `suspended` post-grâce restait `allow`. Corrigé pour rediriger `suspended` une fois la grâce expirée (voir Completion Notes / rapport). Le blocage d'écriture applicatif existait déjà (`assertSessionTenantWritable` sur `POST /api/v1/sync/push`), contrairement à ce que suggérait le constat initial.**

- [x] **T4 — Vérifier la protection du endpoint** (AC3)
  - [x] Appel sans header `Authorization` → confirmer 401
  - [x] Appel avec `Authorization: Bearer <mauvais-secret>` → confirmer 401
  - [x] Confirmer que `CRON_SECRET` est bien renseigné dans les Environment Variables du projet Vercel cible (dashboard, pas seulement `.env` local) — si pas encore configuré, le faire et documenter la valeur générée (`openssl rand -hex 32`), sans la committer nulle part — **DEFERRED : aucun déploiement Vercel production actif, documenté**
  - [x] Vérifier que `vercel.json` (déjà présent à la racine, schedule `"17 3 * * *"`) est bien reconnu par Vercel au déploiement — si un déploiement production existe déjà, vérifier l'onglet "Cron Jobs" du dashboard Vercel ; sinon documenter que cette vérification est DEFERRED au premier déploiement production réel — **fichier validé statiquement, déclenchement réel DEFERRED**

- [x] **T5 — Vérification finale qualité**
  - [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (aucune régression sur `expiry-decisions.test.ts`, `expiry-job.test.ts`, `route.test.ts`) — 867/867 tests
  - [x] `pnpm build` : passe sans erreur
  - [x] Si un bug a été corrigé, ajouter/mettre à jour le test unitaire correspondant reproduisant le cas trouvé

- [x] **T6 — Documenter les résultats et nettoyer** (AC1, AC2, AC3)
  - [x] Ajouter une section à `Docs/testing/test-plan.md` (ou nouveau fichier `Docs/testing/cron-expiry-verification.md`, cohérent avec le pattern déjà utilisé en story 8.2) : date, environnement testé (staging/prod), requêtes SQL de préparation, résultat par AC (✅/🐛), capture des lignes `tenant_events` observées
  - [x] Supprimer/neutraliser les tenants de test créés pour cette vérification (ne pas laisser de tenants `suspended` de test en base partagée — cf. story 8.7 pour le nettoyage systématique pré-prod)

---

## Dev Notes

### Ce qui existe déjà — ne PAS réinventer

- `src/app/api/cron/expiry-reminders/route.ts` — handler `GET` déjà codé : vérifie `Authorization: Bearer ${CRON_SECRET}`, 401 si absent/incorrect, 500 si `CRON_SECRET` non configuré côté serveur, sinon appelle `runExpiryJob()` et renvoie 200.
- `src/lib/cron/expiry-job.ts` — orchestration `runExpiryJob({ now? })` : sélectionne les tenants `status IN (active, trial, suspended) AND plan != 'free' AND subscriptionEnd NOT NULL`, dispatch par `computeReminderAction`, gère rappels/suspension/grace-expired avec isolation d'erreur par tenant (AC8 de la story 7-6).
- `src/lib/cron/expiry-decisions.ts` — `computeReminderAction` (pure), `REMINDER_THRESHOLDS_DAYS = [7,3,1]`, `hasReminderBeenSent`, `hasPaymentCoveringPeriod`, `hasGraceExpiredEventBeenSent`, `GRACE_EXPIRED_NOTE` — déjà testés unitairement en profondeur (story 7-6, `expiry-decisions.test.ts`).
- `vercel.json` (racine du repo) — **déjà présent**, déclare `{ "crons": [{ "path": "/api/cron/expiry-reminders", "schedule": "17 3 * * *" }] }`. Ne pas le recréer — vérifier seulement qu'il est bien pris en compte au déploiement.
- `env.example` — contient déjà `CRON_SECRET=` (ligne ~70) avec commentaire. **Aucune vraie valeur committée.**

**Aucune nouvelle dépendance, aucune nouvelle route, aucune nouvelle logique métier à créer.** Cette story est de la vérification en conditions réelles + correction ponctuelle si bug trouvé.

### IMPORTANT — Le code a évolué depuis la story 7-6 (platform settings dynamiques, story 7-12)

Le fichier `expiry-job.ts` actuel **diffère** du brief original de la story 7-6 sur plusieurs points (à connaître pour ne pas se tromper en vérifiant) :
- La signature est `runExpiryJob(opts: { now?: Date })` — **pas** de paramètre `db` injectable (contrairement au plan initial de 7-6). Impossible de mocker `db` depuis l'extérieur en dehors des tests unitaires qui utilisent `vi.mock("@/lib/db")`.
- La durée de grâce vient de `getGracePeriodDays()` (`src/lib/tenants/platform-config.ts`, story 7-12) — **pas** de la constante dépréciée `DEFAULT_GRACE_PERIOD_DAYS` (`src/lib/tenants/tenant-config.ts`, marquée `@deprecated Fallback only`). **Vérifier la valeur réellement configurée en `platform_settings`** avant de calculer manuellement la date de grâce attendue en T3 — ne pas supposer 7 jours par défaut sans le confirmer.
- L'envoi de rappels/expiration respecte désormais un **toggle par type de notification** (`getNotificationToggle("reminderJ7" | "reminderJ3" | "reminderJ1" | "expiryNotification")`, story 7-12) — si un toggle est désactivé en `platform_settings`, le rappel est **silencieusement skippé, aucun event loggé**. Si un rappel attendu ne part pas pendant T2/T3, vérifier ce toggle AVANT de conclure à un bug du cron.
- L'adresse d'envoi vient de `getNotificationSenderAddress()` et le contact owner de `buildOwnerContact()` (`src/lib/tenants/tenant-contact.ts`) — pas de `process.env.OWNER_CONTACT` statique comme évoqué dans le brief 7-6 original.
- La suspension (AC2/AC5 de 7-6) est maintenant faite dans une **transaction Drizzle** (`db.transaction`) avec un `UPDATE ... WHERE status IN ('active','trial')` guard atomique — plus robuste que le plan initial ; confirme qu'un tenant déjà suspendu entre deux exécutions concurrentes ne peut pas être re-suspendu en double.

### Aucune UI pour éditer `subscriptionEnd` — préparer les tenants de test par SQL

Le schema (`src/lib/schema.ts` lignes ~70-72) définit `subscriptionEnd`, `trialEndsAt`, `gracePeriodEndsAt` comme `date({ mode: "date" })` sur la table `tenants`, mais **aucune page owner n'expose leur édition directe** (recherché dans `src/app/owner/**` — aucun match). Pour préparer des tenants aux seuils J-7/J-3/J-1/J0, utiliser une mutation SQL directe (ex : `pnpm db:studio` ou un client Postgres) :
```sql
UPDATE tenants SET subscription_end = CURRENT_DATE + INTERVAL '7 days' WHERE id = '<tenant-test-id>';
```
Ne PAS créer de nouvelle UI pour cela dans le cadre de cette story (hors scope) — documenter les requêtes utilisées dans le rapport final (T6) pour que story 8.7 ou une future story puisse industrialiser ce test si besoin.

### CRON_SECRET — vérifier le dashboard Vercel, pas seulement `.env` local

`env.example` documente déjà `CRON_SECRET=` avec le commentaire "Générer avec : `openssl rand -hex 32`". Vercel envoie `Authorization: Bearer <CRON_SECRET>` uniquement si cette variable est configurée dans **Project Settings → Environment Variables** du déploiement cible sur Vercel — un `.env` local ne suffit pas pour un vrai run Vercel Cron. Si le projet n'est pas encore déployé sur Vercel (à vérifier), documenter cette limitation en T6 plutôt que de déclarer l'AC3 pleinement validée en conditions de production réelles ; dans ce cas, se limiter à la vérification manuelle via `curl` en local/staging.

### `src/lib/env.ts` ne valide pas `CRON_SECRET`

Même gap que celui signalé pour `RESEND_API_KEY` en story 8.2 : `serverEnvSchema` (Zod, `src/lib/env.ts`) ne référence pas `CRON_SECRET`. Le garde-fou n'existe qu'au niveau du handler (`route.ts`, throw 500 runtime si absent), pas au boot de l'application. Signaler ce gap dans le rapport (T6) pour la **story 8.7** ; ne pas l'implémenter ici sauf si trivial et sans risque de régression.

### Enforcement de la suspension — vérifier côté proxy, pas seulement en base

Le cron ne fait QUE poser `tenants.status = 'suspended'`. L'enforcement réel (redirection `/subscription-expired`) est appliqué par `src/proxy.ts` / `enforceTenantAccess` (`src/lib/tenants/tenant-enforcement.ts`, story 7-1), qui lit ce statut. Pour valider AC2 complètement, ne pas se contenter de vérifier la ligne en base — visiter réellement le sous-domaine du tenant suspendu (ou son URL) et confirmer la redirection effective.

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Réécrire `computeReminderAction`/`runExpiryJob` sans bug avéré | Vérifier le comportement existant, corriger uniquement si un écart réel est constaté |
| Supposer `DEFAULT_GRACE_PERIOD_DAYS = 7` en dur pour calculer la date de grâce attendue | Lire la valeur réelle via `getGracePeriodDays()` / `platform_settings` avant de comparer |
| Conclure à un bug "email non envoyé" sans vérifier le toggle `getNotificationToggle()` correspondant | Vérifier d'abord l'état du toggle en `platform_settings` |
| Créer une UI d'édition de `subscriptionEnd` pour ce test | Mutation SQL directe, documentée, tenants nettoyés après |
| Committer une vraie valeur de `CRON_SECRET` dans un fichier versionné | Uniquement en variable d'environnement (Vercel dashboard ou `.env` local gitignored) |
| Laisser des tenants de test `suspended`/expirés en base partagée après la vérification | Nettoyer (supprimer ou neutraliser) après la passe de test (T6) |
| Re-tester en profondeur le rendu/contenu des emails de rappel | Déjà couvert par la story 8.2 — se concentrer ici sur scheduling/idempotence/suspension |

### Commandes pour le dev agent

```bash
# 1. Préparer un tenant de test à J-7 (exemple SQL, adapter l'id)
# via pnpm db:studio ou un client Postgres direct
# UPDATE tenants SET subscription_end = CURRENT_DATE + INTERVAL '7 days' WHERE id = '<id>';

# 2. Déclencher le cron manuellement
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expiry-reminders
# Sans header → doit renvoyer 401
curl http://localhost:3000/api/cron/expiry-reminders

# 3. Rejouer immédiatement pour vérifier l'idempotence
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expiry-reminders

# 4. Inspecter les événements générés
pnpm db:studio   # ou requête SQL directe sur tenant_events / tenants

# 5. Qualité
pnpm check
pnpm build
```

### Project Structure Notes

- Aucun nouveau dossier/module attendu — vérification en conditions réelles + corrections ponctuelles dans les fichiers existants listés ci-dessus si un bug est trouvé.
- Rapport de vérification à ajouter sous `Docs/testing/` (cohérent avec `Docs/testing/test-plan.md` et le pattern de la story 8.2).

### References

- [Epic 8 spec] `_bmad-output/planning-artifacts/epics.md` — Story 8.3 (lignes ~1118-1136)
- [Docs/testing/test-plan.md] — section "Non couvert dans cette session", ligne cron
- [Story 7-6] `_bmad-output/implementation-artifacts/7-6-expiry-cron-automated-reminders.md` — spec/AC d'origine du cron
- [Story 8-2] `_bmad-output/implementation-artifacts/8-2-transactional-email-verification.md` — pattern de vérification manuelle + a déjà couvert le rendu email
- [src/app/api/cron/expiry-reminders/route.ts] — handler GET, auth CRON_SECRET
- [src/lib/cron/expiry-job.ts] — orchestration réelle (post story 7-12, diffère du brief 7-6 original — voir Dev Notes)
- [src/lib/cron/expiry-decisions.ts] — décisions pures + helpers DB
- [src/lib/tenants/platform-config.ts] — `getGracePeriodDays`, `getNotificationToggle`, `getNotificationSenderAddress` (story 7-12)
- [src/lib/tenants/tenant-config.ts] — constantes dépréciées (fallback uniquement), `APEX_DOMAIN`
- [src/proxy.ts] / [src/lib/tenants/tenant-enforcement.ts] — enforcement réel de la suspension (story 7-1)
- [vercel.json] — configuration cron déjà présente (racine du repo)
- [env.example] — `CRON_SECRET=` (ligne ~70)
- [project-context.md] — règles générales du projet (quota, audit, DB)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Vérification E2E locale réalisée le 2026-07-07** (`pnpm dev` + Postgres Docker local, `CRON_SECRET` déjà en `.env`). Tenants réels réutilisés (Gambvina inc, Maiga inc, Sahel Cargo Express) + 3 tenants de test créés pour les cas J0/grace-expired, tous nettoyés après la passe. Détail complet : `Docs/testing/cron-expiry-verification.md`.
- AC1 (rappels + idempotence) : ✅ confirmé — 1 run initial = 3 reminders/1 suspended/1 graceExpired, 3 rejeux immédiats = 0/0/0 à chaque fois, aucun doublon `tenant_events`. **Bug post-review corrigé** : la note stockée sur `reminder_sent` était le stage seul (`"first"`) — filtrée uniquement par `tenantId`+stage, un renouvellement (avance de `subscriptionEnd`) aurait supprimé les rappels de la nouvelle période. Notes maintenant scopées à la période via `reminderSentNote(stage, subscriptionEnd)` (ex. `"first@2026-07-08T00:00:00.000Z"`).
- AC2 (suspension J0) : ✅ confirmé, **3 bugs trouvés et corrigés** au total (1 en review initiale, 2 en review post-fix) :
  1. La branche "paiement couvre déjà la période" (`expiry-job.ts`) n'avait aucune garde d'idempotence et réinsérait un event `tenant_events` à chaque exécution du cron (4 lignes identiques observées après 1 run + 3 rejeux). Corrigé par `hasPaymentCoverageSkipEventBeenSent()`.
  2. L'enforcement proxy (`tenant-enforcement.ts`) ne redirigeait que `cancelled` vers `/subscription-expired` ; un tenant `suspended` avec grâce expirée restait `allow` indéfiniment (jamais redirigé). Corrigé : `suspended` redirige désormais dès que `gracePeriodEndsAt <= now` (reste `allow-with-grace` pendant la grâce). Le blocage d'écriture applicatif existait déjà (`assertSessionTenantWritable` / `assertTenantWritable` sur `POST /api/v1/sync/push`) — le constat initial affirmant l'inverse était erroné.
  3. Toutes les notes d'idempotence de cycle de vie (`auto-suspended (J0, no payment)`, `grace expired (read-only confirmed)`, `payment covers period, skipped suspension`) étaient des chaînes constantes par tenant : un tenant suspendu, réactivé, puis expirant à nouveau réutilisait la même note et se faisait bloquer par la garde d'idempotence (app + index DB), restant à tort `active`/`trial`. Corrigé : ces 3 notes sont maintenant scopées à `subscriptionEnd` via `autoSuspendedNote()`/`graceExpiredNote()`/`paymentCoverageSkipNote()`, même pattern que `reminderSentNote()`.
- AC3 (protection endpoint) : ✅ confirmé en local (401/401/200). Déclenchement réel par Vercel Cron en production et vérification du dashboard Environment Variables **DEFERRED** — aucun déploiement production actif pour ce projet à ce jour.
- Garde d'idempotence renforcée au niveau DB : index unique partiel `idx_tenant_events_cron_idempotent` sur `(tenant_id, event_type, note) WHERE actor_id = 'system'` (migration `drizzle/0020_outgoing_thunderbolts.sql`) — protège contre deux exécutions concurrentes du cron qui passeraient toutes deux le check applicatif avant que l'une des deux ne committe. `expiry-job.ts` intercepte `23505` (unique_violation) sur les 4 inserts concernés et traite le cas comme "déjà géré par une autre exécution".
- `pnpm check` : 870/870 tests verts (867 + 3 nouveaux tests de scoping par période), 0 erreur lint. `pnpm build` : OK (route manifest généré sans erreur).

### File List

- src/lib/cron/expiry-decisions.ts (`hasPaymentCoverageSkipEventBeenSent`, `PAYMENT_COVERS_PERIOD_NOTE` exportée ; notes de cycle de vie scopées par période via `periodScopedNote`/`reminderSentNote`/`autoSuspendedNote`/`graceExpiredNote`/`paymentCoverageSkipNote` ; `hasPaymentCoveringPeriod` vérifie désormais `periodStart <= subscriptionEnd`)
- src/lib/cron/expiry-job.ts (garde d'idempotence sur la branche "payment covers period" ; notes scopées par période ; capture `23505` sur les 4 inserts cron pour la garde DB)
- src/lib/cron/expiry-decisions.test.ts (tests `hasPaymentCoverageSkipEventBeenSent`, `reminderSentNote`/`autoSuspendedNote`/`graceExpiredNote`/`paymentCoverageSkipNote`)
- src/lib/cron/expiry-job.test.ts (mock + tests de non-régression idempotence, note scopée mise à jour)
- src/lib/tenants/tenant-enforcement.ts (redirection `suspended` après expiration de la grâce)
- src/lib/tenants/tenant-enforcement.test.ts (tests suspended : redirect sans grâce, allow-with-grace pendant la grâce, redirect grâce expirée)
- src/lib/schema.ts (index unique partiel `idx_tenant_events_cron_idempotent`)
- drizzle/0020_outgoing_thunderbolts.sql (migration générée pour l'index ci-dessus)
- Docs/testing/cron-expiry-verification.md (rapport de vérification complet + section corrections post-review)
- Docs/testing/test-plan.md (mise à jour section "Non couvert dans cette session")

## Change Log

- 2026-07-07 — Vérification E2E locale du cron `expiry-reminders` (AC1/AC2/AC3). Bug d'idempotence trouvé et corrigé (event "payment covers period, skipped suspension" dupliqué à chaque run) ; gap d'enforcement `suspended` documenté hors périmètre ; déclenchement Vercel Cron production DEFERRED (pas de déploiement actif). 867/867 tests, build OK.
- 2026-07-07 (post-review) — Corrections suite à revue de code : redirection proxy `suspended` post-grâce implémentée (gap précédemment documenté hors périmètre) ; idempotence des rappels scopée par période ; `hasPaymentCoveringPeriod` corrigé pour vérifier `periodStart` ; index unique DB ajouté pour l'idempotence cron.
- 2026-07-07 (post-review #2) — Toutes les notes d'idempotence de cycle de vie (suspend/grace-expired/payment-coverage-skip) scopées par période (`subscriptionEnd`) pour éviter qu'une réactivation suivie d'une nouvelle expiration ne soit bloquée par l'index unique DB ou la garde applicative sur la note constante de la période précédente. 870/870 tests, build OK.
