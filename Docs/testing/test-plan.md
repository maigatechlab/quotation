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

---

## Non couvert dans cette session (hors périmètre convenu)

- Paiement Stripe réel (checkout + webhook) — **story 8-1 tentée le 2026-07-06, bloquée : Stripe non disponible pour entité enregistrée au Niger/Mali/Burkina Faso (Sahel/AES).** Liste pays supportés Stripe (marchands) couvre UE, Amériques, et quelques pays africains (Nigeria, Afrique du Sud, Kenya, Égypte, Maroc, Ghana) — le Niger et l'espace AES en sont absents. Impossible de créer un compte Stripe test-mode rattaché à une société nigérienne sans entité étrangère (Stripe Atlas ou équivalent), hors périmètre MVP. Vérification E2E live non réalisable en l'état ; la logique code (checkout/webhook/idempotence/rollback, Story 7-10) reste couverte uniquement par les tests unitaires existants (`src/lib/stripe/*.test.ts`, `src/app/api/webhooks/stripe/route.test.ts`). Mobile money (Story 7-4) reste le rail de paiement réel pour les tenants Niger/AES ; Stripe à ré-évaluer si une entité facturante éligible (ex. UE, USA) est mise en place pour la plateforme.
- Cron `expiry-reminders` (rappels J-7/J-3, expiration trial, suspension auto) — **story 8-3 vérifiée le 2026-07-07, voir section dédiée ci-dessous.** Point restant : déclenchement réel par Vercel Cron en production non vérifiable (pas encore de déploiement production actif) — `vercel.json` validé statiquement seulement.
- Mode hors-ligne réel (coupure réseau + sync au retour en ligne) — testé uniquement le flux local-first "happy path" (TEMP-xxxx → sync).
- Export CSV/Excel (rapports owner, paiements, audit) — boutons présents, téléchargement non vérifié fichier par fichier.
- Chat IA (`/api/chat`, OpenRouter) — hors périmètre demandé.

## Environnement de test

- App : `pnpm dev` sur `http://localhost:3000` (Next.js 16, Turbopack)
- DB : Postgres Docker `quotation-postgres-1`, port 5434
- Comptes de test créés :
  - Owner/superadmin : `qa-owner@maigatechlab.test`
  - Tenant "QA Transit SARL" (Free) — cycle complet créé → suspendu → réactivé → **annulé** (test terminal)
  - Tenant "Sahel Cargo Express SARL" (Pro) — laissé actif, admin `sahel-admin@maigatechlab.test`, utilisateurs `kadi.commercial@…` (commercial) et `moussa.operateur@…` (opérateur)
