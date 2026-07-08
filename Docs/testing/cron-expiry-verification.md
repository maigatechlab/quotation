# Vérification du cron d'expiration et de rappels (Story 8.3)

**Date :** 2026-07-07
**Environnement :** local (`pnpm dev` sur `http://localhost:3000`, Postgres Docker `quotation-postgres-1`)
**Périmètre :** scheduling + idempotence + suspension automatique du cron `/api/cron/expiry-reminders` (Story 7-6, post platform-settings dynamiques Story 7-12). Le contenu/rendu des emails est déjà couvert par la Story 8-2 — non re-testé ici.

## Préparation des tenants de test (T1)

Tenants existants réutilisés (mutation SQL directe de `subscription_end`, aucune UI n'expose ce champ) :

```sql
-- J-7
UPDATE tenants SET subscription_end = CURRENT_DATE + INTERVAL '7 days' WHERE id = '1d89a49b-429b-454a-a648-872d8ae9298e'; -- Gambvina inc (pro, active)
-- J-3
UPDATE tenants SET subscription_end = CURRENT_DATE + INTERVAL '3 days' WHERE id = '3f32f7fe-0c3b-4a5a-a7fc-eb328b8c3d0c'; -- Maiga inc (enterprise, trial)
-- J-1
UPDATE tenants SET subscription_end = CURRENT_DATE + INTERVAL '1 day' WHERE id = 'a49fdf34-9e17-4df2-98e8-422eb92b5f9f'; -- Sahel Cargo Express (pro, trial)
```

Tenants créés pour les cas J0 non couverts par les tenants existants :

```sql
-- J0 sans paiement couvrant -> suspension attendue
INSERT INTO tenants (id, name, slug, status, plan, subscription_end, max_users)
VALUES ('11111111-0000-0000-0000-000000000001', 'Story8-3 J0 NoPayment', 'story83-j0-nopay', 'active', 'pro', CURRENT_DATE, 5);

-- J0 avec paiement couvrant -> pas de suspension
INSERT INTO tenants (id, name, slug, status, plan, subscription_end, max_users)
VALUES ('11111111-0000-0000-0000-000000000002', 'Story8-3 J0 WithPayment', 'story83-j0-paid', 'active', 'pro', CURRENT_DATE, 5);
INSERT INTO subscription_payments (tenant_id, amount, currency, payment_method, paid_at, period_start, period_end, billing_cycle, confirmed_by, notes)
VALUES ('11111111-0000-0000-0000-000000000002', 25000, 'XOF', 'cash', now(), CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '5 days', 'monthly', '<admin-user-id>', 'story 8-3 test payment');

-- Déjà suspendu, grâce expirée -> event grace-expired idempotent
INSERT INTO tenants (id, name, slug, status, plan, subscription_end, grace_period_ends_at, max_users)
VALUES ('11111111-0000-0000-0000-000000000003', 'Story8-3 GraceExpired', 'story83-grace-expired', 'suspended', 'enterprise', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '2 days', 5);
```

`platform_settings` observé : `grace_period_days = 7`, tous les toggles de notification (`reminderJ7/J3/J1`, `expiryNotification`) = `true`.

## AC1 — Rappels + idempotence ✅ (scheduling/idempotence), ⚠️ delivery non confirmée en réel

**`RESEND_API_KEY` non configuré dans cet environnement local** (`.env` — mode dev intentionnel, voir `src/lib/email.ts`) : `sendEmail` ne fait donc aucun appel réseau vers Resend, il se contente d'un `console.log` du contenu. Les compteurs `processed.reminders` et les lignes `tenant_events` ci-dessous confirment que le job **déclenche** l'envoi et **journalise** correctement, mais **ne prouvent pas la livraison réelle** (API Resend, boîte mail destinataire). Livraison réelle déjà vérifiée séparément pour le template d'email (Story 8-2, `docs/testing/...` — contenu/rendu) via le mode test Resend (n'envoie qu'à l'adresse validée du compte). **Action de suivi recommandée avant mise en prod** : rejouer ce scénario avec `RESEND_API_KEY` configuré (clé de test ou compte sandbox) et confirmer réception dans la boîte mail destinataire.

Déclenchement : `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expiry-reminders`

Premier run : `{"processed":{"reminders":3,"suspended":1,"graceExpired":1,"errors":0}}`.

`tenant_events` observés (un par tenant/stage), **avant le correctif de scoping par période décrit ci-dessous** — le format de note d'origine était le stage seul :
- Gambvina inc → `reminder_sent` / note `first` (J-7)
- Maiga inc → `reminder_sent` / note `second` (J-3)
- Sahel Cargo Express → `reminder_sent` / note `urgent` (J-1)

Depuis le correctif post-review, le format de note est `"<stage>@<subscriptionEnd ISO>"` (ex. `"first@2026-07-08T00:00:00.000Z"`) — voir section suivante. Comportement de scheduling/idempotence inchangé, seul le format de la note diffère.

Rejeu immédiat 3 fois de suite : `{"reminders":0,"suspended":0,"graceExpired":0,"errors":0}` à chaque fois. Aucun email supplémentaire, aucune ligne `tenant_events` dupliquée (vérifié par requête SQL groupée par tenant/event_type/note) — **idempotence confirmée** via `hasReminderBeenSent`.

### 🐛 Bug corrigé (post-review) — idempotence des rappels non scopée à la période d'abonnement

**Fichier :** `src/lib/cron/expiry-decisions.ts` (`hasReminderBeenSent`), `src/lib/cron/expiry-job.ts`
**Symptôme :** la note stockée sur l'event `reminder_sent` était juste le nom du stage (`"first"`/`"second"`/`"urgent"`), et `hasReminderBeenSent` filtrait uniquement par `tenantId` + stage. Après un renouvellement (avance de `subscriptionEnd`), les events de la période précédente restaient en base avec le même stage et supprimaient donc les rappels de la nouvelle période.
**Correction :** nouvelle fonction `reminderSentNote(stage, subscriptionEnd)` encodant `subscriptionEnd` dans la note (`"first@2026-07-08T00:00:00.000Z"`), utilisée à l'écriture et à la lecture — un renouvellement change `subscriptionEnd` donc génère une clé différente, plus de suppression cross-période.

### 🐛 Bug corrigé (post-review) — `hasPaymentCoveringPeriod` ne vérifiait pas `periodStart`

**Fichier :** `src/lib/cron/expiry-decisions.ts`
**Symptôme :** la requête ne filtrait que sur `periodEnd >= subscriptionEnd`, sans borne basse. Un paiement futur (`periodStart` après la période expirée en cours) pouvait donc être compté comme couvrant la période courante et empêcher à tort la suspension.
**Correction :** ajout de `periodStart <= subscriptionEnd` dans la clause `WHERE`.

### 🔒 Renforcement (post-review) — garde d'idempotence au niveau DB

**Fichier :** `src/lib/schema.ts` (migration `drizzle/0020_outgoing_thunderbolts.sql`)
**Contexte :** les gardes d'idempotence (`hasReminderBeenSent`, `hasGraceExpiredEventBeenSent`, `hasPaymentCoverageSkipEventBeenSent`) sont du check-then-insert applicatif — deux exécutions concurrentes du cron peuvent toutes deux passer le check avant que l'une des deux ne committe son insert, produisant un doublon (email compris, car l'email part avant l'insert de l'event pour la branche `reminder`).
**Correction :** index unique partiel `idx_tenant_events_cron_idempotent` sur `(tenant_id, event_type, note) WHERE actor_id = 'system'` — scopé aux seules lignes générées par le cron (sentinel `CRON_SYSTEM_ACTOR_ID`) pour ne jamais entrer en collision avec les actions admin répétables (suspend/reactivate/cancel manuels, qui réutilisent parfois la même note). `expiry-job.ts` intercepte désormais l'erreur `23505` (unique_violation) sur chacun des 4 inserts concernés et traite le cas comme "déjà traité par une autre exécution" (pas d'erreur remontée, pas de double comptage).

## AC2 — Suspension automatique J0 ✅ (2 bugs trouvés et corrigés)

- **J0 sans paiement** : après le cron, `status='suspended'`, `grace_period_ends_at` = J+7 (= `getGracePeriodDays()` réellement lu, pas la constante dépréciée `DEFAULT_GRACE_PERIOD_DAYS`). Event `tenant_events` `suspended`/`auto-suspended (J0, no payment)` inséré une seule fois.
- **J0 avec paiement couvrant** : tenant reste `active`, aucune suspension. Event `reminder_sent`/`payment covers period, skipped suspension` inséré.
- **Grâce déjà expirée (tenant déjà suspendu)** : un seul event `suspended`/`grace expired (read-only confirmed)` inséré, idempotent au rejeu.

### 🐛 Bug trouvé et corrigé — duplication de l'event "payment covers period, skipped suspension"

**Fichier :** `src/lib/cron/expiry-job.ts` (branche `decision.kind === "expired"` + `hasPaymentCoveringPeriod`)
**Symptôme :** contrairement aux branches `reminder` (`hasReminderBeenSent`) et `grace-expired` (`hasGraceExpiredEventBeenSent`), la branche "paiement couvre déjà la période" n'avait **aucune garde d'idempotence** — chaque exécution du cron réinsérait une nouvelle ligne `tenant_events` (`reminder_sent`/`payment covers period, skipped suspension`) pour le même tenant. Observé en conditions réelles : 3 rejeux immédiats du cron ont produit 4 lignes identiques en base pour le tenant de test `Story8-3 J0 WithPayment` (une par exécution, dont l'exécution initiale). Cela viole l'attente d'idempotence de l'AC1/AC2 (« aucun doublon n'est envoyé/enregistré ») et aurait causé une croissance illimitée de `tenant_events` pour tout tenant réel resté dans cet état plusieurs jours (ex. `subscription_end` non avancé après un paiement, cas limite car le flux normal `record-payment.ts` avance normalement `subscriptionEnd` avec le paiement).
**Correction :** ajout de `hasPaymentCoverageSkipEventBeenSent(tenantId, subscriptionEnd)` dans `src/lib/cron/expiry-decisions.ts` (pas de query jsonb sur `after`), branchée dans `expiry-job.ts` avant l'insertion. Vérifié en local : 3 rejeux après correction → une seule ligne en base (contre 4 avant). *(Signature révisée en 2ᵉ passe de review — voir bug de scoping par période ci-dessous : la garde initiale était globale par tenant, pas scopée à `subscriptionEnd`.)*
**Tests ajoutés :** `src/lib/cron/expiry-decisions.test.ts` (`hasPaymentCoverageSkipEventBeenSent`), `src/lib/cron/expiry-job.test.ts` (« covering payment idempotent : second run does not re-log the event »). Suite complète : 867/867 tests verts après correction.

### 🐛 Bug corrigé (post-review #2) — notes d'idempotence de cycle de vie non scopées à la période, collision avec l'index unique DB en cas de réactivation

**Fichiers :** `src/lib/cron/expiry-decisions.ts`, `src/lib/cron/expiry-job.ts`
**Symptôme :** les 3 notes utilisées comme clé d'idempotence pour `auto-suspended (J0, no payment)`, `grace expired (read-only confirmed)` et `payment covers period, skipped suspension` étaient des chaînes constantes par tenant (pas scopées à `subscriptionEnd`). Un tenant suspendu, réactivé (`reactivate.ts`), puis expirant à nouveau plus tard réutiliserait la même note pour son second cycle de suspension/grâce/paiement — la garde applicative (`hasGraceExpiredEventBeenSent`, `hasPaymentCoverageSkipEventBeenSent`) et surtout l'**index unique DB `idx_tenant_events_cron_idempotent`** (introduit en 1ʳᵉ passe de review, voir plus haut) traiteraient ce second cycle comme un doublon du premier : `expiry-job.ts` intercepterait `23505` et traiterait la transaction comme "déjà gérée", laissant le tenant à tort `active`/`trial` au lieu de le suspendre.
**Correction :** les 3 notes sont maintenant scopées à `subscriptionEnd` via `autoSuspendedNote()`/`graceExpiredNote()`/`paymentCoverageSkipNote()` (même pattern que `reminderSentNote()` — `${base}@${subscriptionEnd.toISOString()}`). Un nouveau cycle de vie (nouvelle valeur de `subscriptionEnd` après réactivation) génère donc une clé différente, plus de collision avec l'index unique ni avec la garde applicative.
**Tests ajoutés :** `src/lib/cron/expiry-decisions.test.ts` — vérifie que `autoSuspendedNote`/`graceExpiredNote`/`paymentCoverageSkipNote` produisent des clés différentes pour des `subscriptionEnd` différents.

### 🐛 Bug corrigé (post-review) — enforcement proxy des tenants `suspended` après expiration de la grâce

**Fichier :** `src/lib/tenants/tenant-enforcement.ts`
**Symptôme :** `enforceTenantAccess` ne redirigeait que le statut `cancelled` vers `/subscription-expired`. Un tenant `suspended` par le cron (J0) restait `allow-with-grace` pendant la période de grâce (correct), mais une fois la grâce expirée (`gracePeriodEndsAt <= now`), la fonction retombait sur `allow` — aucune redirection, contrairement à la formulation de l'AC2. Corrigé : le statut `suspended` est maintenant traité explicitement — `allow-with-grace` tant que la grâce est active, `redirect` vers `/subscription-expired` sinon (grâce expirée ou absente).
**Correction :** `src/lib/tenants/tenant-enforcement.ts`. Tests mis à jour/ajoutés dans `tenant-enforcement.test.ts` (suspended sans grâce → redirect ; suspended + grâce active → allow-with-grace ; suspended + grâce expirée → redirect).

Note (déjà correct, contrairement à ce que suggérait la formulation initiale de ce constat) : le blocage d'écriture au niveau API existe bien — `src/lib/tenants/request-guard.ts` (`assertSessionTenantWritable`) + `src/lib/tenants/tenant-access.ts` (`assertTenantWritable`), branché dans `POST /api/v1/sync/push` (le seul point d'écriture applicatif de ce projet local-first). Un tenant `suspended` en lecture seule reçoit `TENANT_READONLY` sur toute mutation.

## AC3 — Protection de l'endpoint ✅ (local), ⏳ (production différée)

```
curl (sans header Authorization)                          → 401
curl -H "Authorization: Bearer <mauvais-secret>"           → 401
curl -H "Authorization: Bearer $CRON_SECRET" (bon secret)  → 200 {"processed":{...},"at":"..."}
```

`CRON_SECRET` configuré en `.env` local (`story-8-2-local-cron-secret`, différent par environnement). Le cas « `CRON_SECRET` non configuré côté serveur → 500 » est déjà couvert par `src/app/api/cron/expiry-reminders/route.test.ts` (test unitaire, non re-testé manuellement pour ne pas redémarrer le serveur sans variable).

**Non vérifiable dans cette session :** aucun déploiement Vercel production actif pour ce projet — impossible de confirmer que Vercel Cron déclenche réellement `vercel.json` (`"17 3 * * *"`) ni que `CRON_SECRET` est bien positionné dans les Environment Variables du dashboard Vercel cible. `vercel.json` est présent et syntaxiquement correct à la racine ; cette vérification est **DEFERRED** au premier déploiement production réel (à couvrir par Story 8-7 ou au moment du déploiement).

## Nettoyage

Tous les tenants/paiements/événements de test créés pour cette vérification (`11111111-0000-0000-0000-00000000000{1,2,3}`) ont été supprimés après la passe. Les `subscription_end` des tenants réels réutilisés (Gambvina inc, Maiga inc, Sahel Cargo Express) ont été restaurés à leurs valeurs d'origine. Les événements `reminder_sent` de test (`first`/`second`/`urgent`) créés sur ces tenants ont été supprimés de `tenant_events`.

## Qualité (T5)

- `pnpm check` (lint + typecheck + vitest) : 867/867 tests verts, 0 erreur lint (45 warnings pré-existants `import/order`, non liés à cette story).
- `pnpm build` : voir Dev Agent Record de la story pour le résultat.
## Revue de code 8-3 � corrections suppl�mentaires

La revue BMAD de Story 8-3 a ferm� trois d�fauts de code suppl�mentaires :

- `hasPaymentCoveringPeriod` utilise d�sormais une borne de fin semi-ouverte (`period_end > subscriptionEnd`) pour �viter qu'un paiement qui se termine exactement � `subscriptionEnd` emp�che ind�finiment la suspension.
- Les rappels email sont d�sormais prot�g�s contre deux ex�cutions concurrentes du cron : le job revendique d'abord la cl� d'idempotence `tenant_events`, puis envoie l'email uniquement si l'insert a gagn�. En cas d'�chec d'envoi, la revendication est supprim�e pour permettre un retry.
- `enforceTenantAccess` respecte � nouveau la distinction produit Story 7-5/7-6 : suspension non-paiement = lecture seule (navigation autoris�e, mutations bloqu�es par `assertTenantWritable`), suspension `totalBlock=true` ou `cancelled` = redirect `/subscription-expired`. La formulation Story 8-3 qui demandait une redirection proxy pour tout `suspended` post-gr�ce est donc � traiter comme un �cart d'AC/documentation, pas comme la r�gle produit finale.

Gaps d'acceptance restant ouverts : d�clenchement Vercel Cron production + `CRON_SECRET` dashboard non v�rifi�s faute de d�ploiement actif ; livraison r�elle depuis le chemin cron non prouv�e dans cette passe locale sans `RESEND_API_KEY`.

