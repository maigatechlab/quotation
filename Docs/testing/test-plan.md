# Plan de test — Quotation Logistique (E2E)

> Exécuté le 2026-07-06 contre l'environnement local (`pnpm dev`, Postgres Docker `quotation-postgres-1`, port 5434). Couvre l'intégralité des fonctionnalités du MVP : owner console (plateforme) + application tenant. Chaque section liste les cas testés, le résultat, et renvoie vers le tutoriel pas-à-pas (`tutorial-e2e-walkthrough.md`) pour les captures d'écran / étapes détaillées.

## Légende
- ✅ Testé et conforme
- 🐛 Bug trouvé — **corrigé** pendant cette session (voir section Bugs)
- ⚠️ Testé — comportement à surveiller (non bloquant)

---

## 1. Authentification

| Cas | Résultat |
|---|---|
| Login tenant (`/login`) avec sélecteur de rôle (Admin/Commercial/Opérateur) | ✅ |
| Rejet si rôle sélectionné ≠ rôle réel du compte (message "Rôle incorrect") | ✅ |
| Login owner séparé (`/owner/login`), aucun rôle non-owner ne peut s'y connecter | ✅ |
| Déconnexion (tenant + owner) | ✅ |
| Garde serveur : accès direct à une route protégée sans session → redirection `/login` | ✅ |

## 2. Owner Console — Gestion des tenants

| Cas | Résultat |
|---|---|
| Dashboard owner : métriques (actifs/trial/suspendus/annulés), MRR/ARR, alertes critiques, activité récente, santé plateforme | ✅ |
| Création tenant (`/owner/tenants/new`) : nom, slug, plan, cycle, admin (nom/email), mot de passe auto ou manuel, email de bienvenue | ✅ |
| Tenant créé avec statut `trial`, admin par défaut créé et lié | ✅ |
| Liste des tenants avec filtres et pagination | ✅ |
| Détail tenant — 4 onglets : Infos générales / Abonnement / Utilisateurs / Journal | ✅ |
| Suspension (motif + note interne + case "blocage total") | ✅ |
| Réactivation — bloquée tant qu'aucun paiement ne couvre la période, dialogue "Enregistrer un paiement" intégré | ✅ |
| Enregistrement paiement (6 méthodes : Nitta/Wave/Amana/Stripe/Cash/Virement), auto-réactivation à la confirmation | ✅ |
| Annulation définitive — confirmation par saisie du slug exact | ✅ |
| Journal : chaque transition (créé/suspendu/réactivé/paiement/annulé) horodatée avec acteur | ✅ |

## 3. Owner Console — Utilisateurs du tenant

| Cas | Résultat |
|---|---|
| Onglet Utilisateurs : quota affiché (ex. `1 / 5 utilisateurs`), bouton "Ajouter" désactivé si quota atteint | ✅ |
| Ajout utilisateur (nom, email, rôle, mot de passe auto/manuel, email de bienvenue) | ✅ |
| Révocation (soft-disable) — statut passe à "Désactivé", ligne du journal `user_removed` | ✅ (i18n corrigé, voir Bugs) |
| Réactivation d'un utilisateur révoqué | ✅ |
| Suppression définitive — confirmation par saisie de l'email exact, quotes/clients conservés | ✅ |
| Impossible de révoquer/supprimer le dernier admin actif (boutons désactivés) | ✅ |

## 4. Owner Console — Paiements & Paramètres plateforme

| Cas | Résultat |
|---|---|
| `/owner/payments` : historique tous tenants, filtres (tenant/méthode/cycle/dates), total agrégé | ✅ |
| `/owner/settings` : tarifs par plan/cycle, quotas utilisateurs par plan, durée essai/grâce, contenu affiché aux tenants suspendus, notifications | ✅ |
| Sauvegarde des paramètres plateforme et persistance après rechargement | ✅ |
| `/owner/users` (utilisateurs owner globaux) | ✅ (accès confirmé, superadmin) |

## 5. Paramètres société (tenant)

| Cas | Résultat |
|---|---|
| Formulaire société (raison sociale, forme juridique, capital, RCCM, NIF, adresse, BP, téléphones, emails) | ✅ (bootstrap corrigé, voir Bugs) |
| Persistance après rechargement / vérification DB | ✅ |
| Upload logo société | ✅ |
| Signataire par défaut (nom/fonction), pré-rempli automatiquement dans le wizard de devis | ✅ |
| Rôle `commercial`/`opérateur` : onglet Société en lecture seule, onglets Modèles/Conformité/Utilisateurs masqués | ✅ |

## 6. Rôles & accès (admin / commercial / opérateur)

| Cas | Résultat |
|---|---|
| Admin : accès complet (société, modèles, conformité, utilisateurs) | ✅ |
| Commercial : peut créer client/devis, paramètres limités en lecture seule | ✅ |
| Opérateur : lecture seule, pas de bouton "Nouveau client"/"Nouveau devis" | ✅ |
| Garde serveur sur `/parametres/utilisateurs` (redirige `/` si rôle non autorisé) | ✅ |
| Garde serveur sur `/clients/nouveau` (redirige `/clients` pour opérateur) | ✅ |
| **Sécurité** : `/parametres/utilisateurs` ne montre que les utilisateurs du tenant courant | 🐛 **corrigé** (voir Bugs — fuite cross-tenant) |
| **Sécurité** : changement de rôle (`PATCH /api/v1/users/[id]`) restreint au tenant de l'acteur | 🐛 **corrigé** (voir Bugs — IDOR cross-tenant) |

## 7. Clients (CRUD)

| Cas | Résultat |
|---|---|
| Création client (société, contact, téléphone, email, ville, adresse, notes) | ✅ |
| Modification client | ✅ |
| Suppression client sans devis associé | ✅ |
| Liste avec recherche | ✅ |
| ⚠️ Garde de suppression si client a des devis — non re-testée dans cette session (le client utilisé pour le devis n'a pas été supprimé volontairement) ; logique présente dans le code (`client-form`/`client-edit-form`) | ⚠️ à re-vérifier en régression |

## 8. Modèles de routes & bibliothèque de clauses

| Cas | Résultat |
|---|---|
| `/parametres/modeles` : création modèle de route (corridor, pays/ville départ-arrivée, distance, tarif) | ✅ |
| Modèle de route apparaît en raccourci ("corridor fréquent") dans l'étape Trajet du wizard, pré-remplit villes + tarif | ✅ |
| Modèles de prestations (lignes) : gérés en ligne dans l'étape Prestations du wizard (pas de page dédiée) | ✅ |
| Clauses contractuelles : ajout d'une clause spécifique + option "Enregistrer comme modèle dans la bibliothèque" dans l'étape Conditions | ✅ |

## 9. Devis — Wizard 5 étapes + PDF

| Cas | Résultat |
|---|---|
| Étape 1 (Client) : sélection client existant, objet, référence, dates, signataire pré-rempli | ✅ |
| Étape 2 (Trajet) : sélection pays/villes, raccourci corridor fréquent | ✅ |
| Étape 3 (Marchandise) : nature, tonnage, capacité camion → nombre de camions auto-calculé (`⌈tonnage / capacité⌉`), prix unitaire pré-rempli depuis le modèle de route, valeur marchandise auto-calculée | ✅ |
| Étape 4 (Prestations) : lignes avec désignation/prix/quantité, total ligne + total devis calculés en temps réel | ✅ |
| Étape 5 (Conditions) : conditions de paiement, clauses (sélection + spécifique), signature | ✅ |
| Sauvegarde finale → création devis en local (numéro `TEMP-xxxx`) puis synchronisation serveur (UUID réel) | ✅ |
| Détail devis : aperçu complet type PDF (en-tête société+logo, client, trajet, marchandise, prestations, totaux, conditions, clauses, signatures société+client) | ✅ |
| Génération PDF (`Générer le PDF`) — téléchargement, 2 pages, contenu conforme à l'aperçu | ✅ |
| Transitions de statut : Brouillon → Validé → Envoyé → Accepté, avec historique horodaté par acteur | ✅ |
| Contrôle des transitions valides (boutons désactivés pour transitions non autorisées) | ✅ |
| Actions : Modifier, Dupliquer, Partager | ⚠️ boutons présents, non testés en profondeur (Partager nécessite intégration externe) |

---

## Bugs trouvés et corrigés pendant cette session

### 1. 🔴 Critique (sécurité) — Fuite cross-tenant sur la liste des utilisateurs
**Fichiers :** `src/app/(app)/parametres/utilisateurs/page.tsx`, `src/app/api/v1/users/route.ts`
**Symptôme :** `/parametres/utilisateurs` et `GET /api/v1/users` retournaient TOUS les utilisateurs de la plateforme (tous tenants confondus), pas seulement ceux du tenant courant. N'importe quel admin tenant pouvait voir les emails de tous les autres tenants.
**Correction :** ajout d'un filtre `WHERE company_id = <companyId de l'acteur>` sur les deux requêtes.

### 2. 🔴 Critique (sécurité) — IDOR cross-tenant sur le changement de rôle
**Fichier :** `src/app/api/v1/users/[id]/route.ts`
**Symptôme :** `PATCH /api/v1/users/[id]` modifiait le rôle de n'importe quel utilisateur par son id, sans vérifier qu'il appartient au même tenant que l'acteur. Combiné au bug n°1, un admin tenant pouvait changer le rôle d'utilisateurs d'autres tenants.
**Correction :** la clause `WHERE` de l'update inclut désormais `AND company_id = <companyId de l'acteur>`.

### 3. 🟠 Majeur — Bootstrap société bloqué pour tout nouveau tenant
**Fichier :** `src/app/api/v1/companies/route.ts`
**Symptôme :** à la création d'un tenant, l'admin reçoit un `companyId` placeholder (= `tenant.id`, utilisé pour scoper clients/devis dès la création). Le endpoint de bootstrap société traitait tout `companyId` non-null comme "société déjà configurée" → 409 permanent, empêchant tout nouveau tenant de jamais enregistrer ses informations société.
**Correction :** le bootstrap vérifie maintenant qu'une ligne `company` existe réellement à cet id avant de renvoyer 409 ; sinon il crée la ligne en réutilisant l'id placeholder (préserve le scoping existant des autres entités).

### 4. 🟡 Mineur — Clé de traduction manquante
**Fichier :** `src/messages/fr-NE.json`
**Symptôme :** `MISSING_MESSAGE` pour `owner.events.user_removed` (et `user_deleted`, `user_reactivated` absents également) lors de l'affichage du journal après révocation/suppression/réactivation d'un utilisateur tenant.
**Correction :** ajout des 3 clés manquantes.

### 5. 🟢 Note — Historique de statut devis affiche l'id utilisateur brut
**Fichier :** historique des transitions de statut devis (`De Brouillon vers Validé par <userId>`)
**Constat :** l'acteur est affiché par son id technique plutôt que son nom/email. Non bloquant, cosmétique. Non corrigé dans cette session — à considérer pour une prochaine itération.

### 6. 🟠 Majeur — Rejet quota/readonly à la synchronisation traité comme un conflit générique (story 8-4, 2026-07-07)
**Fichier :** `src/lib/sync/push.ts` (`pushSingleOp`)
**Symptôme :** quand une mutation hors-ligne est rejetée à la sync pour cause de quota dépassé ou mode lecture-seule, le serveur renvoie 409 avec `entity:{error:"READONLY_MODE"|"QUOTA_EXCEEDED"}` (même forme que la réponse de conflit LWW). Le client traitait cette réponse comme un vrai conflit d'édition : `handleConflict` tentait `table.put({error:...})` (pas d'`id` valide) → échec Dexie absorbé silencieusement → op marquée `failed:true` avec un message générique et trompeur (`"malformed or unresolvable conflict response"`). L'utilisateur ne comprenait jamais pourquoi sa mutation n'était jamais synchronisée.
**Correction :** `pushSingleOp` détecte maintenant si `result.entity` est un objet `{error: string}` (rejet quota) avant d'appeler `handleConflict`, et marque l'op `failed:true` avec un message français explicite ("Quota dépassé..." / "Compte en lecture seule..."). 3 tests de régression ajoutés (`src/lib/sync/push.test.ts`).

### 7. 🟠 Majeur — Désalignement colonnes/données dans l'export CSV tenants filtré (story 8-5, 2026-07-07)
**Fichier :** `src/lib/owner/csv.ts` (`buildTenantsCsv`)
**Symptôme :** l'en-tête CSV déclarait 12 colonnes (`...,activeUsers,maxUsers,createdAt`) mais chaque ligne de données n'en produisait que 11 — `activeUsers` et `maxUsers` étaient fusionnés dans une seule cellule (`"3/5"`), comme affiché à l'écran (`tenants-table.tsx`, colonne "Utilisateurs"). Résultat : toutes les colonnes après `lastPaymentDate` étaient décalées d'une position à l'ouverture dans Excel/LibreOffice — `createdAt` apparaissait sous l'en-tête `maxUsers`, et l'en-tête `createdAt` n'avait aucune donnée en face.
**Correction :** l'en-tête a été aligné sur les données réelles (une seule colonne `activeUsers/maxUsers`, cohérente avec ce qui est affiché à l'écran). Test de régression ajouté (`src/lib/owner/csv.test.ts`) qui vérifie que le nombre de colonnes de l'en-tête correspond au nombre de champs de la ligne de données.

---

## Non couvert dans cette session (hors périmètre convenu)

- Paiement Stripe réel (checkout + webhook) — **story 8-1 tentée le 2026-07-06, bloquée : Stripe non disponible pour entité enregistrée au Niger/Mali/Burkina Faso (Sahel/AES).** Liste pays supportés Stripe (marchands) couvre UE, Amériques, et quelques pays africains (Nigeria, Afrique du Sud, Kenya, Égypte, Maroc, Ghana) — le Niger et l'espace AES en sont absents. Impossible de créer un compte Stripe test-mode rattaché à une société nigérienne sans entité étrangère (Stripe Atlas ou équivalent), hors périmètre MVP. Vérification E2E live non réalisable en l'état ; la logique code (checkout/webhook/idempotence/rollback, Story 7-10) reste couverte uniquement par les tests unitaires existants (`src/lib/stripe/*.test.ts`, `src/app/api/webhooks/stripe/route.test.ts`). Mobile money (Story 7-4) reste le rail de paiement réel pour les tenants Niger/AES ; Stripe à ré-évaluer si une entité facturante éligible (ex. UE, USA) est mise en place pour la plateforme.
- Cron `expiry-reminders` (rappels J-7/J-3, expiration trial, suspension auto) — **story 8-3 vérifiée le 2026-07-07, voir section dédiée ci-dessous.** Point restant : déclenchement réel par Vercel Cron en production non vérifiable (pas encore de déploiement production actif) — `vercel.json` validé statiquement seulement.
- Mode hors-ligne réel (coupure réseau + sync au retour en ligne) — **story 8-4 vérifiée le 2026-07-07, voir section dédiée ci-dessous.** Vérification par trace de code exhaustive, pas d'exécution navigateur réelle (`npx playwright test` bloqué par le bug pré-existant `TypeError: context.conditions?.includes is not a function`, reproduit sur une spec non modifiée — même bug que stories 7-8 à 7-12/8-3). Un bug de traitement du rejet quota à la sync a été trouvé et corrigé (voir Bug n°6) ; un gap de renumérotation TEMP→définitif a été confirmé et signalé pour arbitrage produit.
- Export CSV/Excel (rapports owner, paiements, audit) — **story 8-5 vérifiée le 2026-07-07, voir section dédiée ci-dessous.** Un bug de désalignement colonnes/données trouvé et corrigé.
- Chat IA (`/api/chat`, OpenRouter) — hors périmètre demandé.

## Story 8-4 — Cas limites de synchronisation offline/reconnexion (2026-07-07)

**Méthode :** trace de code exhaustive côté client et serveur (pas d'exécution E2E réelle — Playwright bloqué, voir ci-dessus). Chaque comportement listé a été confirmé en lisant le code source exact référencé, pas supposé.

| Cas | Résultat |
|---|---|
| Mutation locale mise en `syncQueue` avec `opId`/`baseRevision`/`queuedAt`, écriture atomique (rollback si échec) | ✅ (`outbox.ts`, `applyLocalMutation`, couvert par `outbox.test.ts`) |
| Déclenchement sync au retour réseau (Background Sync API `sync` event + fallback `online` event) | ✅ (`sw.ts:243`, `use-sync-status.ts`) |
| Idempotence : rejeu d'un `opId` déjà traité renvoie `{status:"noop"}` sans réappliquer | ✅ (`push/route.ts:550-556`, couvert par `push/route.test.ts`) |
| Conflit LWW entre deux appareils : `serverRevision > baseRevision` → 409 + `audit_event conflict.archived` (companyId renseigné) + `syncOpLog` | ✅ (`push/route.ts:578-599`) |
| Côté client : conflit archivé dans `auditMirror` (avant/après complets), version serveur appliquée, toast FR | ✅ (`conflict.ts`, couvert par `conflict.test.ts`) |
| Rejet quota/readonly à la sync — traitement dédié distinct du conflit LWW | 🐛 **corrigé** — voir Bug n°6 |
| Renumérotation `TEMP-xxxx` → `DEV-YYYY-NNNN` au push serveur | ⚠️ **gap confirmé, non traité** — `formatServerNumber` n'a aucun appelant hors test unitaire ; le serveur persiste `p.number` tel que fourni par le client. Le numéro TEMP reste donc affiché en permanence après synchronisation. Décision produit à prendre : soit implémenter la conversion serveur, soit accepter le numéro TEMP comme numéro définitif (et adapter la documentation/UX en conséquence). Candidat pour une nouvelle story. |

## Story 8-5 — Vérification des exports (rapports, paiements, audit) (2026-07-07)

**Méthode :** trace de code exhaustive des 4 endpoints d'export + relecture des composants UI qui les déclenchent, exécution des builders CSV avec données réelles accentuées (`npx tsx`, sortie inspectée octet par octet pour le BOM et l'alignement colonnes/données), exécution de la suite Vitest existante. Pas d'exécution navigateur réelle ni d'ouverture Excel/LibreOffice (Playwright bloqué par le bug pré-existant déjà documenté ci-dessus, même limitation que 8-3/8-4) — compensé par l'inspection directe des octets produits par les fonctions de construction CSV.

| Export | Résultat |
|---|---|
| `GET /api/v1/owner/reports/tenants/export` (snapshot non filtré) — colonnes, BOM, dates `YYYY-MM-DD` | ✅ (`reports-csv.ts`, `SNAPSHOT_HEADERS` alignés avec les 7 champs de la ligne) |
| `GET /api/v1/owner/reports/payments/export` — colonnes, BOM, filtre plage de dates, erreurs `VALIDATION_FAILED` sur dates manquantes/invalides | ✅ (`validateDateRange`, UI `DateRangePicker` bloque l'appel côté client avec toast d'erreur avant même la requête réseau) |
| `GET /api/v1/owner/tenants/export` (liste filtrée) — filtres `TenantFilters` propagés, colonnes alignées avec les données | 🐛 **corrigé** — voir Bug n°7 |
| `GET /api/v1/audit/export` (JSON + CSV) — cohérence JSON/CSV, isolation `companyId`, BOM | ✅ (filtre `eq(auditEvent.companyId, companyId)` dérivé de la session serveur, non falsifiable via query params ; JSON et CSV partagent la même requête `events`) |
| Limite 10 000 lignes (les 4 endpoints) | ⚠️ **non testable en conditions réelles** — aucun jeu de données de test n'atteint ce volume ; comportement de troncature silencieuse confirmé par lecture de code (`route.ts` snapshot/payments : `console.warn` serveur uniquement, rien côté utilisateur), limite MVP documentée plutôt que corrigée (hors scope, cf. Dev Notes story 8-5) |
| Mention "rétention 7 ans" (`parametres.audit.description`) | ℹ️ **clarifié, pas un bug** — `auditEvent` est une table append-only sans job de purge ni colonne d'expiration (schema.ts) ; le texte est une promesse de non-suppression, aucun mécanisme actif à vérifier |

## Environnement de test

- App : `pnpm dev` sur `http://localhost:3000` (Next.js 16, Turbopack)
- DB : Postgres Docker `quotation-postgres-1`, port 5434
- Comptes de test créés :
  - Owner/superadmin : `qa-owner@maigatechlab.test`
  - Tenant "QA Transit SARL" (Free) — cycle complet créé → suspendu → réactivé → **annulé** (test terminal)
  - Tenant "Sahel Cargo Express SARL" (Pro) — laissé actif, admin `sahel-admin@maigatechlab.test`, utilisateurs `kadi.commercial@…` (commercial) et `moussa.operateur@…` (opérateur)

## Checklist de nettoyage pré-bascule production (Story 8.7)

Cette checklist doit être suivie avant la mise en production réelle (premier client réel), pour garantir qu'aucune trace de la phase de développement/QA ne subsiste.

### 1. Comptes et tenants QA à ne PAS retrouver en base de production

- Owner/superadmin QA : `qa-owner@maigatechlab.test`
- Admin tenant QA : `sahel-admin@maigatechlab.test`
- Utilisateurs tenant QA : `kadi.commercial@…` (commercial), `moussa.operateur@…` (opérateur)
- Tenant "QA Transit SARL" (Free — cycle complet créé → suspendu → réactivé → annulé)
- Tenant "Sahel Cargo Express SARL" (Pro — actif)

**Décision retenue :** la base de production est une **base neuve** (migrations appliquées via `pnpm db:migrate` sur une instance PostgreSQL vierge) — jamais un dump/clone de la base de dev/QA. C'est la voie la plus sûre pour garantir qu'aucun des comptes/tenants ci-dessus n'existe en prod, sans risque d'oubli d'un enregistrement de test. Ces identifiants n'apparaissent dans aucun script de seed committé (créés manuellement via l'UI pendant la passe de test E2E) — une base neuve élimine le risque par construction plutôt que par nettoyage a posteriori.

Si une base partagée dev/QA/prod devait exister un jour (non le cas actuellement), filet de sécurité : requête de suppression ciblée des tenants par `id`/`slug` connus, avec cascade sur les tables `user`, `company`, `clients`, `quotes`, etc. — à ne considérer qu'en dernier recours, la base neuve restant la recommandation.

### 2. Variables d'environnement de production requises (AC#2)

Toutes vérifiées via `pnpm env:check:production` avant bascule (`src/lib/env.ts` → `checkEnv()`, bloquant en production depuis Story 8.7 pour `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`).

**Important :** utiliser `pnpm env:check:production` (et non le simple `pnpm env:check`) pour la vérification pré-bascule. `pnpm env:check` seul ne force pas `NODE_ENV=production` — si le fichier `.env` de prod ne définit pas explicitement `NODE_ENV` (ce que `env.example` ne fait pas), les clés obligatoires en production (`RESEND_API_KEY`, `CRON_SECRET`, `STRIPE_*`) seraient silencieusement ignorées. `env:check:production` force ce mode via `scripts/env-check.ts --production`, garantissant que ces clés sont bien exigées indépendamment de la valeur de `NODE_ENV` dans le fichier `.env` chargé.

| Variable | Source | Notes |
|---|---|---|
| `POSTGRES_URL` | Instance PostgreSQL de production (ex. Neon) | Jamais l'URL de dev/QA |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` | Valeur unique de prod, distincte de dev |
| `RESEND_API_KEY` | Dashboard Resend (domaine vérifié) | Voir mémoire "email-delivery-setup" — vérifier le domaine avant activation |
| `EMAIL_FROM` | Domaine vérifié Resend | Ex. `Quotation Logistique <noreply@votre-domaine.com>` |
| `CRON_SECRET` | `openssl rand -hex 32` | Doit correspondre à l'en-tête `Authorization: Bearer` envoyé par Vercel Cron |
| `NEXT_PUBLIC_SENTRY_DSN` | Dashboard Sentry → Settings → Projects | Optionnel mais recommandé pour le monitoring d'erreurs |
| `STRIPE_SECRET_KEY` | Stripe Dashboard (mode live) | Jamais la clé test/sandbox |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks (endpoint de production) | Distincte du secret local (`stripe listen`) |

### 3. Création du superadmin de production (AC#3)

Procédure retenue : le script existant `scripts/create-superadmin.ts` (interactif, `pnpm superadmin`) est jugé suffisant pour une création manuelle unique en production — pas de sur-ingénierie pour un cas d'usage one-shot.

Commande à exécuter, depuis un poste sécurisé, avec `.env` pointant vers le `POSTGRES_URL` de production :

```bash
pnpm superadmin
```

**Ne jamais** exécuter cette commande via un pipeline CI qui loggerait la sortie (le mot de passe est saisi de façon masquée en interactif, mais un contexte CI non interactif exposerait le flux). Le mot de passe doit être fort et dédié, distinct de tout compte QA (`qa-owner@maigatechlab.test`).
