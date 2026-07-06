# Vérification de la livraison des emails transactionnels (Story 8.2)

**Date :** 2026-07-06
**Compte Resend utilisé :** compte de test, domaine `nigerverde.com` (déjà vérifié, SPF/DKIM OK)
**Domaine `quotationlogistique.com` :** ajouté au compte Resend mais **non vérifié** (DNS non configuré) — non utilisé pour cette vérification, à faire pour la mise en prod finale.
**Boîte de réception de contrôle :** `easyopsai@gmail.com` (alias `+xxx` par flux, tous délivrés dans la même boîte)

---

## AC1 — Les 5 emails transactionnels

| # | Email | Déclenchement | `emailSent` | Reçu | Résultat |
|---|-------|----------------|:---:|:---:|---|
| 1 | Bienvenue tenant | `POST /api/v1/owner/tenants` (sendWelcomeEmail=true) | ✅ | ✅ | ✅ Sujet, URL sous-domaine, mot de passe corrects, pas d'échappement brut |
| 2 | Invitation utilisateur | `POST /api/v1/owner/tenants/[id]/users` | ✅ | ✅ | ✅ Même template que #1, rôle/identifiants corrects |
| 3 | Mot de passe oublié | `POST /api/auth/request-password-reset` | ✅ (best-effort, pas de statut renvoyé) | ✅ | ✅ Lien de reset valide 24h, `/reset-password` fonctionne bout-en-bout |
| 4 | Rappel J-7 / J-3 | `GET /api/cron/expiry-reminders` (Bearer CRON_SECRET) | ✅ (1 reminder / run) | ✅ | ✅ Sujet/urgence corrects par palier (`first` J-7, `second` J-3). Idempotence vérifiée : rejouer le cron le même jour → 0 email supplémentaire |
| 5 | Confirmation de paiement | `POST /api/v1/owner/tenants/[id]/payments` | ✅ | ✅ | ✅ Montant (25 000 XOF), méthode (virement), période corrects |

**Toutes les AC1 sont validées**, avec un domaine réellement vérifié (`nigerverde.com`), donc sans la restriction "sandbox → maigatechlab@gmail.com uniquement" (cette restriction ne s'applique qu'à l'adresse `onboarding@resend.dev` non vérifiée).

### Bug trouvé et corrigé pendant cette vérification

`platform_settings.notifications.senderAddress` en base contenait une valeur figée (`contact@maigatechlab.com`) capturée avant la vérification du domaine d'envoi. `getNotificationSenderAddress()` (`src/lib/tenants/platform-config.ts`) lit cette valeur en priorité sur `EMAIL_FROM`, donc **tant que ce champ n'est pas mis à jour via `/owner/settings` (ou en base), tous les emails "notification" (bienvenue, invitation, rappel, paiement) échouent silencieusement** (`emailSent: false`), même avec une `RESEND_API_KEY` et un `EMAIL_FROM` valides — parce que Resend refuse d'envoyer depuis un domaine non vérifié.

**Root cause (durable bug, corrigé dans le code, pas seulement en base) :** `src/lib/data/platform-settings.ts` seedait `notifications.senderAddress` avec la valeur de `EMAIL_FROM` **au moment du tout premier accès** (bootstrap du singleton `platform_settings`). Une fois la ligne créée, ce champ ne suit plus jamais `EMAIL_FROM` — si le domaine de production change ou est re-vérifié plus tard, la BDD garde l'ancienne adresse pour toujours, jusqu'à une correction manuelle via `/owner/settings`. C'est ce qui a fait échouer silencieusement (`emailSent: false`) les 3 premiers essais de cette vérification, malgré une `RESEND_API_KEY` et un `EMAIL_FROM` valides.

**Corrections apportées (source-controlled, pas seulement une correction ponctuelle en base) :**
1. `src/lib/data/platform-settings.ts` + `src/lib/schema.ts` — `notifications.senderAddress` bootstrappe désormais à `""` (vide) au lieu d'une adresse figée. `getNotificationSenderAddress()` (`src/lib/tenants/platform-config.ts:65`) faisait déjà `senderAddress || EMAIL_FROM || fallback` — en le laissant vide par défaut, le champ suit maintenant **toujours** l'`EMAIL_FROM` courant tant qu'un admin ne l'a pas explicitement personnalisé via `/owner/settings`.
2. Migration `drizzle/0019_rapid_darwin.sql` — corrige le défaut de colonne **et** repasse à `""` toute ligne existante (dans n'importe quel environnement, y compris staging/prod) dont `senderAddress` vaut encore l'ancienne valeur littérale figée `contact@maigatechlab.com`. Idempotente, n'affecte pas une adresse explicitement personnalisée par un admin. S'applique automatiquement via `pnpm build` (`db:migrate && next build`) au prochain déploiement — aucune étape manuelle requise pour les environnements existants.
3. Tests unitaires (`src/lib/data/platform-settings.test.ts`) mis à jour pour refléter le nouveau comportement de bootstrap.

Avec ce fix, le scénario "domaine change après coup, plus personne n'y pense" ne peut plus se reproduire silencieusement : le champ suit l'env tant qu'il n'est pas explicitement surchargé.

**Correction de suivi (trouvée en code review) :** `src/lib/validation/platform-settings.ts` exigeait un email valide non-vide pour `notifications.senderAddress`, ce qui rendait `/owner/settings` impossible à sauvegarder dès que le défaut est devenu `""` — un owner qui laisse le champ vide (pour utiliser le fallback `EMAIL_FROM`) recevait "Adresse email expéditeur invalide" et ne pouvait plus enregistrer ses réglages. Corrigé : le schema accepte désormais `""` (= utiliser le fallback env) en plus d'un email bien formé. Test ajouté, placeholder UI ajouté pour clarifier le comportement.

---

## AC2 — Garde-fou "clé absente en production"

**Statut : partiellement validé — vérification en environnement de production cible réel NON effectuée.** L'AC2 demande explicitement une vérification "pas seulement en local avec NODE_ENV forcé" ; ce qui suit couvre uniquement le local.

- **Test unitaire existant** (`src/lib/email.test.ts`) : `NODE_ENV=production` + `RESEND_API_KEY=""` (mocké) → `sendEmail()` lève `"RESEND_API_KEY is required for production email delivery"`. ✅ Passe.
- **Test manuel en process réel (non mocké)** : `NODE_ENV=production RESEND_API_KEY= pnpm exec tsx <script appelant sendEmail directement>` → erreur bien levée avec le même message. ✅ Confirmé hors du test unitaire, mais toujours en local.
- **NON fait — bloquant pour considérer AC2 pleinement validé :** vérification dans l'environnement de production cible réel (ex. Vercel prod). Aucun accès à un déploiement prod pendant cette story. **Cette vérification reste à faire avant de considérer AC2 comme définitivement acquis** — à traiter explicitement lors du premier déploiement réel (story de déploiement / 8.7), pas supposée implicitement couverte par les tests locaux.
- **Call-sites best-effort :** confirmé par lecture de code que les 5 call-sites (`create-tenant.ts`, `tenant-users.ts`, `auth.ts` reset password, `expiry-job.ts`, `record-payment.ts`) catchent l'erreur et continuent — **comportement voulu**, pas un bug. Le garde-fou lève bien l'erreur (log serveur `console.error`), mais ne bloque jamais l'opération métier associée.

---

## Gap signalé (hors périmètre de cette story)

`src/lib/env.ts` (`serverEnvSchema`) ne valide ni `RESEND_API_KEY` ni `EMAIL_FROM` — le garde-fou de `sendEmail` ne se déclenche qu'au premier envoi d'email en prod, pas au démarrage de l'app. Un `pnpm env:check` fiable pré-déploiement nécessiterait d'ajouter ces variables au schema Zod serveur. **Scope : story 8.7** (nettoyage pré-prod).

---

## Nettoyage post-vérification

Toutes les données créées pour cette vérification ont été supprimées après confirmation de réception :
- 2 tenants de test (`story-8-2-test-*`)
- Compte owner de test (`story-8-2-owner@quotation.test`)
- 4 comptes utilisateurs de test (`easyopsai+story82*@gmail.com`)
- Événements tenant + paiement associés

Aucune donnée de test laissée en base partagée.

---

## Conclusion

**AC1 : validé** (5/5 emails envoyés et reçus, contenu correct, domaine réellement vérifié). Bug de configuration trouvé (senderAddress figé) corrigé de façon durable (code + migration), pas seulement en base locale.

**AC2 : PARTIELLEMENT validé.** Le garde-fou est confirmé en local (test unitaire + process réel non mocké). La vérification en environnement de production cible réel — explicitement demandée par l'AC — **n'a pas été effectuée** (pas d'accès déploiement). **À ne pas considérer comme acquis avant ce test réel** ; à planifier explicitement au premier déploiement prod (story 8.7 ou story de déploiement dédiée), pas à supposer implicitement couvert.
