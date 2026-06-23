---
title: "PRD — Quotation Logistique"
status: revised
created: 2026-06-21
updated: 2026-06-21
revision: 3
project: quotation
---

# PRD — Quotation Logistique

## 0. Document Purpose

Ce PRD s'adresse à : Maiga Tech Lab (équipe produit, dev), parties prenantes projet.

**Structure :** Glossaire ancré, features groupées avec FRs imbriquées, `[ASSUMPTION]` taggés inline.

**Inputs existants :**
- Cahier des charges MVP (`Docs/cahier-des-charges-mvp-quotation-logistique.md`)
- Recherche marché/terrain Niger/AES (magasinées dans ce PRD)
- `project-context.md` (stack technique)

---

## 1. Vision

Quotation Logistique est une Progressive Web App (PWA) offline-first conçue pour les transporteurs, transitaires et commissionnaires du Niger, puis étendue à l'espace AES (Mali, Burkina Faso).

**Le problème :** Aujourd'hui, les professionnels créent leurs devis manuellement sur Excel/Word — calculs complexes, erreurs fréquentes, pas de format professionnel, historique difficile. Le processus typique prend 20 minutes par devis et génère des erreurs de facturation qui impactent les marges.

**La solution :** Une application mobile-first qui automatise les calculs (tonnage, valeur marchandise, prestations), génère des PDF professionnels, et conserve un historique exploitable. Fonctionne offline avec sync automatique — critical pour les zones à faible connectivité du Sahel.

**L'impact :**
- Réduire le temps de création de devis **de 20 minutes à 3 minutes** (85% plus rapide)
- Réduire les erreurs de calcul et de facturation **de 80%**
- Produire des documents professionnels conformes aux standards locaux (RCCM, NIF)
- Préparer l'extension multi-pays AES sans refonte majeure

---

## 2. Target Users

### 2.1 Jobs To Be Done

**Utilisateurs principaux :** Transporteurs, transitaires, commissionnaires, négociants, équipes commerciales.

- **Créer un devis rapidement** — Quand le client appelle, produire un devis professionnel immédiatement
- **Calculer correctement** — Zéro erreur sur tonnage, devises, montants, lignes de prestations
- **Envoyer au client** — PDF propre prêt pour email/WhatsApp
- **Retrouver l'historique** — "Le devis du trimestre dernier pour ce client"
- **Dupliquer un devis existant** — Nouvelle commande même client → copier/modifier
- **Suivre les statuts** — Brouillon → Validé → Envoyé → Accepté/Expiré
- **Gérer les modèles de clauses** — Bibliothèque réutilisable (conditions, exclusions)
- **Gérer les modèles de routes** — Corridors logistiques avec tarifs prédéfinis
- **Visualiser l'activité** — Tableau bord : devis en brouillon, envoyés, acceptés, montants

### 2.2 Non-Users (v1)

**Explicitement hors scope MVP :**
- **Multi-sociétés** — v2 (une seule société émettrice par instance)
- **Multi-pays** — v2 (optimisé Niger, extensible Mali/Burkina Faso).
- **Grands transporteurs avec TMS complexe** —déjà équipés.
- **Clients finaux** — Ils reçoivent les devis, ne créent pas (interface lecture seule v1).

### 2.3 Key User Journeys

*Note : Scope allégé pour B2B/interne — UJ essentiels pour couvrir le workflow.*

- **UJ-1. Amadou crée un devis complet en 3 minutes.**
  - **Persona + context :** Amadou, transitaire à Niamey, client urgent au téléphone.
  - **Entry state :** Authentifié, mobile, écran liste des devis.
  - **Path :** Tap + → sélection client → saisie trajet/marchandise → ajout lignes prestations (modèles) → validation.
  - **Climax :** PDF généré, prêt envoi.
  - **Resolution :** Devis sauvegardé, statut "Brouillon", partage disponible.
  - **Edge case :** Offline → sync automatique quand connexion.

- **UJ-2. Fatou retrouve et duplique un ancien devis.**
  - **Persona + context :** Fatou, commerciale, client récurrent appelle.
  - **Entry state :** Authentifiée, écran recherche.
  - **Path :** Filtre par client/date → tap sur devis → "Dupliquer" → ajuste montants → valide.
  - **Climax :** Nouveau devis créé en 30 secondes.
  - **Resolution :** Devis prêt envoi.

- **UJ-3. Ibrahim suit l'évolution d'un devis envoyé.**
  - **Persona + context :** Ibrahim, gérant, veut savoir quels devis sont en attente.
  - **Entry state :** Authentifié, tableau bord.
  - **Path :** Vue "Devis envoyés" → tap sur devis → voit statut → met à jour si client a répondu.
  - **Climax :** Statut passé à "Accepté".
  - **Resolution :** Devis accepté, prêt facturation.

- **UJ-4. Aïcha configure les paramètres société.**
  - **Persona + context :** Aïcha, admin, première configuration.
  - **Entry state :** Authentifiée, écran paramètres.
  - **Path :** Saisie infos société (raison sociale, RCCM, NIF) → upload logo → définit signataire.
  - **Climax :** Aperçu PDF avec en-tête personnalisé.
  - **Resolution :** Tous les futurs devis affichent l'en-tête société.

---

## 3. Glossaire

*Termes exacts pour FRs, UJs, et équipe. Pas de synonymes dans le document.*

- **Devis** — Document commercial détaillant prestations logistiques et montants. Contient en-tête société, client, trajet, marchandise, lignes prestations, clauses.
- **Client** — Société destinataire du devis. Données : nom, contact, téléphone, email, pays, ville, adresse.
- **Prestation** — Ligne de frais du devis (transport, carnet transit, droits douane, frais phytosanitaires, etc.). Chaque ligne : désignation, prix unitaire, quantité, total.
- **Clause** — Condition juridique/contractuelle (paiement, exclusions, mentions). Peut être standard (bibliothèque) ou spécifique au devis.
- **Route / Corridor** — Trajet logistique : pays/ville départ → pays/ville arrivée. Peut être enregistrée comme modèle avec tarifs associés.
- **Statut** — État du devis dans son cycle de vie : `Brouillon` → `Validé` → `Envoyé` → `Accepté` / `Expiré` / `Annulé`.
- **FCFA** — Devise XOF (Franc CFA Afrique de l'Ouest), devise principale Niger/AES.
- **RCCM** — Registre du Commerce et du Crédit Mobilier, numéro d'entreprise OHADA affiché sur documents officiels.
- **NIF** — Numéro d'Identification Fiscale, identifiant fiscal affiché sur documents.
- **Offline-first** — Application fonctionne sans connexion internet ; synchronisation automatique quand connexion disponible.
- **PWA** — Progressive Web App, application web installable sur mobile/desktop, fonctionne offline.
- **Tonnage** — Poids de la marchandise en tonnes. Utilisé pour calculer nombre de camions.
- **Capacité camion** — Charge utile d'un camion en tonnes. Pour calcul : `nombre_camions = ceil(tonnage / capacité_camion)`.
- **Devise** — Monnaie : FCFA (XOF), EUR, USD. Conversion via taux de change.
- **Taux de change** — Taux de conversion entre devises (ex: 1 EUR = X FCFA). Appliqué pour calculs valeur marchandise.
- **Commercial** — Rôle utilisateur pouvant créer/ modifier devis.
- **Signataire** — Personne autorisée à signer documents (physiquement ou digitalement).
- **Opérateur** — Rôle utilisateur avec droits limités (lecture, saisie basique).
- **Administrateur** — Rôle utilisateur avec tous les droits (config, utilisateurs, paramètres).
- **Modèle** — Template réutilisable : modèle de clauses, modèle de route avec tarifs, modèle de devis.

---

## 4. Features

### 4.1 Authentification et accès

**Description :** Gestion des identités et permissions. Les utilisateurs se connectent via email/mot de passe. Le système attribue des rôles (Administrateur, Commercial, Opérateur) qui déterminent les droits. Fonctionne offline avec sync des credentials. Réalise UJ-1, UJ-2, UJ-3.

**Functional Requirements :**

#### FR-1: Connexion utilisateur

Un utilisateur peut se connecter avec email et mot de passe. Le système maintient la session offline et synchronise dès que connexion disponible.

**Consequences (testable) :**
- Système retourne HTTP 401 si credentials invalides.
- Session persiste offline maximum 7 jours.
- Après connexion réussie, utilisateur accède à son dashboard.
- **Révocation (C5 résolu) :** Au reconnect, check révocation serveur. Si compte révoqué/bloqué → session terminée, données locales purgées.
- **Politique d'expiration offline (D-OFFLINE résolu) :** la session offline (≤ 7 jours, FR-1) gouverne l'accès, **pas** la durée du cache (30 j, FR-35). À J+7 sans reconnexion :
  - L'app se **verrouille** : écran de connexion, **re-authentification en ligne obligatoire** (cohérent avec S4 — la clé de déchiffrement IndexedDB est dérivée du mot de passe, donc les données locales chiffrées sont **illisibles sans login**).
  - Aucune lecture, création ni sync avant re-auth. Les données locales chiffrées **ne sont pas détruites** (re-login les redéchiffre) — sauf remote wipe (S7) qui purge.
  - Le cache 30 j (FR-35) concerne la **fraîcheur** des données de référence quand la session est valide, pas une fenêtre d'accès au-delà de l'expiration de session.
- **Token refresh :** Au reconnect, refresh token + validation statut utilisateur.

#### FR-2: Gestion des rôles

Le système attribue un rôle à chaque utilisateur : Administrateur (tous droits), Commercial (CRUD devis, clients), Opérateur (lecture et saisie basique).

**Consequences (testable) :**
- Opérateur ne peut pas supprimer de devis.
- Administrateur seul peut accéder Paramètres société.
- Commercial peut créer/modifier ses propres devis.

#### FR-3: Permission par fonctionnalité

Le système vérifie les permissions avant chaque action critique selon la matrice ci-dessous.

**Consequences (testable) :**
- Système retourne HTTP 403 si action non autorisée.
- Interface masque les boutons d'actions non permises.

**Matrice de permissions (H2/M3 résolu) :**

| Action | Admin | Commercial | Opérateur |
|--------|-------|------------|-----------|
| Créer devis | ✓ | ✓ | ✗ |
| Modifier propre devis | ✓ | ✓ | ✗ |
| Modifier devis autre commercial | ✓ | ✗ | ✗ |
| Valider/envoyer devis | ✓ | ✓ (propre) | ✗ |
| Supprimer devis | ✓ | ✗ | ✗ |
| Dupliquer devis | ✓ | ✓ | ✗ |
| Créer/modifier client | ✓ | ✓ | ✗ |
| Supprimer client | ✓ | ✗ | ✗ |
| Paramètres société | ✓ | ✗ | ✗ |
| Gérer utilisateurs | ✓ | ✗ | ✗ |
| Gérer bibliothèque clauses | ✓ | ✓ | Lecture |
| Gérer modèles routes/lignes | ✓ | ✓ | Lecture |
| Tableau bord | ✓ | ✓ (propre) | Lecture |

**Modèle collaboration (H2 résolu) :** Ownership-based. Chaque devis assigné à un Commercial (owner). Autres Commerciaux ne peuvent que consulter. Admin override tous droits. Pas de locking pessimistic MVP (conflits gérés via FR-37a).

#### FR-4: Réinitialisation mot de passe

Un utilisateur peut demander un lien de réinitialisation par email.

**Consequences (testable) :**
- Email envoyé avec lien sécurisé (token valide 24h).
- Token unique, consommé après utilisation.

**Feature-specific NFRs :**
- **Sécurité :** Mots de passe hashés (bcrypt/argon2), jamais stockés en clair.
- **Offline :** Credentials mis en cache sécurisé pour auth offline.

**Notes :**
- `[ASSUMPTION]` Email/mot de passe par défaut, pas OAuth pour MVP.
- `[NOTE FOR PM]` Envisager Mobile Money (Orange Money) comme 2FA v2.

---

### 4.2 Paramètres société

**Description :** Configuration des informations de la société émettrice (raison sociale, RCCM, NIF, logo, signataire). Ces informations apparaissent sur tous les PDFs générés. Réalise UJ-4.

**Functional Requirements :**

#### FR-5: Configuration infos société

Un Administrateur peut saisir/modifier les informations société : raison sociale, forme juridique, capital, adresse, BP, RCCM, NIF, téléphones, emails.

**Consequences (testable) :**
- Champs RCCM et NIF obligatoires.
- Modifications appliquées immédiatement aux nouveaux devis.
- Historique des modifications conservé.

#### FR-6: Upload logo société

Un Administrateur peut uploader un logo (PNG/JPG, max 2MB).

**Consequences (testable) :**
- Logo redimensionné automatiquement (max 300px largeur).
- Image optimisée pour PDF.
- Erreur si format invalide ou taille dépassée.

#### FR-7: Configuration signataire par défaut

Un Administrateur peut définir le signataire par défaut : nom, fonction.

**Consequences (testable) :**
- Signataire pré-rempli sur chaque nouveau devis.
- Modifiable par devis au moment de création.

**Feature-specific NFRs :**
- **Stockage :** Logo stocké dans Blob Storage (local offline, cloud sync).
- **Validation :** RCCM/NIF format validé (regex OHADA).

**Notes :**
- `[ASSUMPTION]` Une seule société par instance MVP.
- `[NOTE FOR PM]` Multi-sociétés v2 nécessite FR-5.1-5.3 par société.

---

### 4.3 Gestion des clients

**Description :** CRUD des fiches clients. Un commercial peut créer, modifier, rechercher des clients. Les données sont réutilisées lors de la création de devis. Réalise UJ-1, UJ-2.

**Functional Requirements :**

#### FR-8: Création fiche client

Un Commercial peut créer une fiche client : nom société, contact, téléphone, email, pays, ville, adresse, notes internes.

**Consequences (testable) :**
- Nom société et téléphone obligatoires.
- Email validé (format).
- Client créé accessible immédiatement pour devis.

#### FR-9: Recherche client

Un Commercial peut rechercher un client par nom, téléphone, ou ville.

**Consequences (testable) :**
- Recherche texte partiel (ex: "maiga" trouve "Maiga Tech Lab").
- Résultats filtrés par pays si spécifié.
- Recherche fonctionne offline.
- **Indexing (M6 résolu) :** FlexSearch (full-text in-memory), champs indexés : nom société, contact, téléphone, ville. Fuzzy matching (tolérance 1 typo). Normalisation accents (é→e) pour matching insensible aux accents.

#### FR-10: Modification client

Un Commercial peut modifier les informations d'un client existant.

**Consequences (testable) :**
- Modifications ne changent pas les devis historiques (snapshot client figé au devis).
- **Historique (M7 résolu) :** Event log (voir O1) — chaque modification tracée (champ, avant/après, user, timestamp). Vue timeline accessible. Pas de restauration version antérieure MVP.

#### FR-11: Suppression client

Un Administrateur peut supprimer un client (soft delete).

**Consequences (testable) :**
- Suppression impossible si client associé à des devis existants.
- Données masquées mais conservées pour audit.

**Feature-specific NFRs :**
- **Performance :** Recherche < 500ms sur 1000 clients offline.
- **Offline :** Index clients mis en cache local pour recherche offline.

**Notes :**
- `[ASSUMPTION]` Pays limité à Niger MVP, extensible AES v2.

---

### 4.4 Gestion des devis

**Description :** Cœur du produit — création, modification, duplication des devis. Chaque devis a un numéro automatique, date, validité, client, commercial, statut. Le système suit le cycle de vie (brouillon → envoyé → accepté). Réalise UJ-1, UJ-2, UJ-3.

**Functional Requirements :**

#### FR-12: Création nouveau devis

Un Commercial peut créer un nouveau devis : sélection client, saisie référence/objet, attribution commercial.

**Consequences (testable) :**
- Numéro de devis généré automatiquement (format séquentiel).
- Date du devis = date du jour (modifiable).
- Date de validité = date du jour + 30 jours (modifiable).
- Statut initial = "Brouillon".

#### FR-13: Numérotation automatique

Le système génère un numéro de devis unique. Format final attribué côté serveur : `DEV-{YYYY}-{XXXX}` (ex: DEV-2026-0001). En mode offline, un numéro temporaire local est attribué (`TEMP-{DEVICE}-{SEQ}`) et remplacé par le numéro final définitif lors de la synchro.

**Consequences (testable) :**
- Format temporaire offline : `TEMP-{DEVICE}-{SEQ}` (ex: TEMP-A1B2-0003).
- Format final (post-sync) : `DEV-{YYYY}-{XXXX}`.
- Attribution numéro définitif au serveur → garantie unicité.
- Notification utilisateur au remplacement du numéro temporaire.
- Séquence serveur réinitialisée chaque année.
- Gaps acceptables si devis supprimés avant sync (documenté comportement attendu).

#### FR-14: Duplication de devis

Un Commercial peut dupliquer un devis existant pour créer une nouvelle version.

**Consequences (testable) :**
- Nouveau numéro généré.
- Date et validité mises à jour.
- Client, trajet, prestations copiés.
- Montants recalculés si nécessaire.

#### FR-15: Modification de statut

Un Commercial peut changer le statut d'un devis : Brouillon → Validé → Envoyé → Accepté / Expiré / Annulé.

**Consequences (testable) :**
- Transition "Validé → Envoyé" enregistre timestamp.
- "Envoyé → Accepté" enregistre date d'acceptation.
- "Brouillon → Envoyé" impossible sans validation.
- **Définition "Validé" (L3 résolu) :** Transition Brouillon → Validé = action utilisateur explicite (bouton "Valider"). Déclenche validation complète (tous champs requis remplis, total > 0, client assigné). Si validation échoue → reste Brouillon + erreurs affichées.
- **Historique statut (M7 résolu) :** `quotation_status_logs` — chaque transition avec user, timestamp, ancien/nouveau statut. Vue timeline accessible. Retrait immédiat impossible (audit immutable).

#### FR-16: Recherche et filtrage devis

Un Commercial peut rechercher des devis par client, date, statut, référence.

**Consequences (testable) :**
- Filtres combinables (ex: client X + statut "Envoyé").
- Tri par date (descendant par défaut).
- Résultats paginés (25 par page).

**Feature-specific NFRs :**
- **Performance :** Création de devis < 3 secondes offline.
- **Offline :** Index local pour recherche/filtrage offline.
- **Sync :** Conflits de sync résolus (last-write-wins avec alerte).

**Notes :**
- `[ASSUMPTION]` Numérotation par instance, pas par agence MVP.
- `[NOTE FOR PM]` Multi-pays v2 nécessite prefixe par pays (NE-DEV-YYYY-XXXX).

---

### 4.5 Détails opérationnels

**Description :** Informations logistiques du devis : trajet (pays/ville départ/arrivée), marchandise (nature, tonnage), calculs automatiques (nombre camions, valeur marchandise). Réalise UJ-1.

**Functional Requirements :**

#### FR-17: Saisie trajet

Un Commercial peut saisir le trajet : pays et ville de départ, pays et ville d'arrivée.

**Consequences (testable) :**
- Liste déroulante des pays (Niger par défaut MVP).
- Autocomplete villes (limité aux villes majeures).
- Trajet affiché sous forme "Ville Départ → Ville Arrivée".

#### FR-18: Saisie marchandise

Un Commercial peut saisir les détails marchandise : nature, quantité (tonnes), capacité camion (tonnes), prix unitaire, devise source, taux de change.

**Consequences (testable) :**
- Quantité et capacité obligatoires.
- Devise source = FCFA par défaut (modifiable).
- Taux de change = 1 si devise = FCFA.

#### FR-19: Calcul automatique nombre de camions

Le système calcule automatiquement le nombre de camions : `nombre_camions = ceil(quantité / capacité_camion)`.

**Consequences (testable) :**
- Calcul réel (arrondi supérieur).
- Affichage résultat + formule utilisée.
- Surcharge possible par l'utilisateur.
- Validation : `MIN_TONNAGE = 0.1`, `MAX_TONNAGE = 10,000` tonnes.
- Validation : `MIN_CAPACITE = 1`, `MAX_CAPACITE = 100` tonnes.
- Protection division par zéro : si `capacité_camion = 0`, calcul bloqué + erreur utilisateur.

#### FR-20: Calcul automatique valeur marchandise

Le système calcule la valeur marchandise : `valeur = quantité × prix_unitaire × taux_change`.

**Consequences (testable) :**
- Calcul en FCFA si devise source ≠ FCFA.
- Affichage : montant devise source + montant FCFA.
- Recalcul automatique si taux change modifié.
- Validation : `MIN_PRIX = 0`, `MAX_PRIX = 10,000,000,000` FCFA.
- Validation : `MIN_TAUX = 0.001`, taux négatif bloqué.
- Précision : 2 décimales (arrondi financier, pas floating point).

**Feature-specific NFRs :**
- **Précision :** Calculs monétaires avec 2 décimales (arrondi financier).
- **Validation :** Tonnage minimum 0.1, capacité camion minimum 1.

**Notes :**
- `[ASSUMPTION]` Pas de gestion multi-escale MVP (trajet simple A → B).
- `[ASSUMPTION]` Taux de change saisi manuellement MVP, pas d'API taux v2.

---

### 4.6 Prestations et frais

**Description :** Lignes de prestations du devis (transport, douane, frais divers). Chaque ligne : désignation, prix unitaire, quantité, total. Le système calcule le total devis. Supporte les modèles de lignes réutilisables. Réalise UJ-1, UJ-2.

**Functional Requirements :**

#### FR-21: Ajout ligne prestation

Un Commercial peut ajouter une ligne de prestation : désignation, prix unitaire, quantité.

**Consequences (testable) :**
- Désignation et prix obligatoires.
- Quantité défaut = 1 (modifiable).
- Total ligne calculé : `prix_unitaire × quantité`.

#### FR-22: Modification/suppression ligne

Un Commercial peut modifier ou supprimer une ligne existante.

**Consequences (testable) :**
- Modification met à jour total ligne et total devis.
- Suppression dernière ligne impossible si au moins une ligne requise.
- Ordre des lignes ajustable (drag & drop).

#### FR-23: Calcul total devis

Le système calcule le total du devis : somme de toutes les lignes.

**Consequences (testable) :**
- Recalcul automatique après chaque modification.
- Affichage : sous-total lignes + total général.
- Format monétaire FCFA (séparateur milliers).

#### FR-24: Modèles de lignes

Un Commercial peut réutiliser des lignes standards depuis un modèle (ex: "Transport Niger-Burkina", "Carnet transit").

**Consequences (testable) :**
- Modèle applique toutes les lignes définies.
- Lignes importées modifiables individuellement.
- Modèles définis par Administrateur.

**Feature-specific NFRs :**
- **Performance :** Recalcul total < 100ms pour 20 lignes.
- **Offline :** Modèles de lignes disponibles offline.

**Notes :**
- `[ASSUMPTION]` Pas de TVA MVP (régime simplifié).
- `[NOTE FOR PM]` TVA v2 si client le demande.

---

### 4.7 Conditions et clauses

**Description :** Gestion des conditions de paiement et clauses contractuelles. Bibliothèque de clauses standards réutilisables + possibilité de clauses spécifiques par devis. Réalise UJ-1.

**Functional Requirements :**

#### FR-25: Configuration conditions de paiement

Un Administrateur peut définir les conditions de paiement par défaut : délai (jours), modalités.

**Consequences (testable) :**
- Texte libre (ex: "Paiement à 30 jours fin de mois").
- Appliqué par défaut à chaque nouveau devis.
- Modifiable par devis.

#### FR-26: Bibliothèque de clauses standards

Un Administrateur peut gérer une bibliothèque de clauses standards : terme, contenu.

**Consequences (testable) :**
- CRUD sur clauses.
- Chaque clause a un titre et un contenu.
- Clauses organisées par catégorie (ex: "Paiement", "Responsabilité", "Exclusions").

#### FR-27: Application de clauses au devis

Un Commercial peut sélectionner des clauses standards à appliquer à un devis.

**Consequences (testable) :**
- Multi-sélection possible.
- Clauses affichées en bas du PDF.
- Ordre des clauses ajustable.

#### FR-28: Clause spécifique par devis

Un Commercial peut ajouter une clause spécifique à un devis (hors bibliothèque).

**Consequences (testable) :**
- Texte libre.
- Ajoutée aux clauses standards sélectionnées.
- Option "enregistrer comme modèle" pour bibliothèque future.

**Feature-specific NFRs :**
- **Validation :** Longueur max clause = 2000 caractères.
- **Offline :** Bibliothèque clauses disponible offline.

**Notes :**
- `[ASSUMPTION]` Clauses standards fournies avec MVP (templates OHADA).

---

### 4.8 Validation client

**Description :** Zone d'accord client sur le PDF — nom du signataire, fonction, date, signature, cachet. Préparée pour signature physique ou électronique future. Réalise UJ-3.

**Functional Requirements :**

#### FR-29: Zone signature client

Le PDF inclut une zone dédiée à la signature client : nom signataire, fonction, date, signature, cachet.

**Consequences (testable) :**
- Zone clairement délimitée visuellement.
- Champs : nom, fonction, date (pré-remplis si connus).
- Espace signature (50mm × 20mm) + espace cachet (30mm × 30mm).

#### FR-30: Enregistrement accord client (option)

Un Commercial peut enregistrer les données d'accord client après signature reçue.

**Consequences (testable) :**
- Champs nom, fonction, date modifiables.
- Upload scan signature possible (v1: référence fichier).
- Statut devis passe à "Accepté" si accord enregistré.

**Feature-specific NFRs :**
- **PDF :** Zone signature positionnée de manière précise (coordonnées fixées).
- **Validation :** Date accord ≤ date du jour + 7 jours.

**Notes :**
- `[ASSUMPTION]` Signature électronique (digitale) pas dispo MVP.
- `[NOTE FOR PM]` Signature électronique (Yousign/DocuSign) v2 si demandé.

---

### 4.9 PDF et impression

**Description :** Génération du PDF professionnel du devis. En-tête avec infos société + logo, corps avec détails devis, pied de page, zone signature client. Export et partage. Réalise UJ-1, UJ-3.

**Functional Requirements :**

#### FR-31: Génération PDF

Le système génère un PDF du devis conforme aux standards professionnels.

**Consequences (testable) :**
- En-tête : logo, raison sociale, RCCM, NIF, coordonnées.
- Corps : numéro devis, date, validité, client, trajet, marchandise, lignes prestations, clauses.
- Pied de page : "Document généré par Quotation Logistique".
- Format A4, orientation portrait.

#### FR-32: Aperçu avant génération

Le système propose un aperçu du devis avant génération PDF finale.

**Consequences (testable) :**
- Rendu HTML fidèle au PDF.
- Scroll complet document.
- Boutons "Modifier" / "Générer PDF".

#### FR-33: Export et partage `[RÉVISÉ — réalisme technique navigateur]`

Un Commercial peut exporter le PDF et le partager via les canaux réellement supportés par le navigateur.

**Consequences (testable) :**
- **Téléchargement** fichier local (toujours disponible, fallback universel). Nom : `Devis-{Numéro}-{Client}.pdf`.
- **Partage natif** via **Web Share API niveau 2** (`navigator.share({ files: [...] })`) si supporté (Android Chrome, Safari iOS récents) → ouvre la feuille de partage OS (WhatsApp, email, etc. avec le PDF en pièce jointe).
- **Fallback si Web Share fichiers indisponible :** PDF téléchargé + message guidé "PDF enregistré — joignez-le depuis WhatsApp/votre email" (avec détection plateforme).
- **Pas de `mailto:` avec pièce jointe** (non supporté par les navigateurs — retiré). `mailto:` peut au plus pré-remplir un corps texte avec un lien, pas attacher le fichier.

**Notes :**
- `[DÉCISION]` Pas d'upload serveur du PDF en MVP (offline-first, génération client-side). **Lien de partage hébergé** (URL de téléchargement) → **v2**, conditionné à un store serveur.

#### FR-34: Mise en page professionnelle

Le PDF utilise une mise en page propre et professionnelle.

**Consequences (testable) :**
- Tableaux lignes prestations avec bordures.
- Zéro élément mal aligné (marges 15mm).
- Polices lisibles (10pt minimum corps texte).
- Contraste suffisant pour impression.

**Feature-specific NFRs :**
- **Performance :** Génération PDF < 5 secondes (mobile低端 inclus).
- **Qualité :** PDF compatible Adobe Reader 11+, impression correcte.
- **Offline :** Génération possible offline (client-side obligatoire).
- **Bundle :** Librairie PDF lazy-loaded (code splitting) pour ne pas impacter first load.

**Notes :**
- **Décision C6 (résolu) :** Génération PDF **client-side** (jsPDF + html2canvas) pour préserver offline-first. Templates HTML/CSS rendus côté client. Tests cross-browser requis (Chrome, Safari mobile, Firefox). Tolérance visuelle définie (≤ 2% différence layout vs mockup). Server-side (Puppeteer) reporté v2 si problèmes de stabilité.

---

### 4.10 Offline-first / PWA

**Description :** Application fonctionne sans connexion internet. Les données sont mises en cache local et synchronisées quand connexion disponible. PWA installable sur mobile/desktop. Réalise tous les UJs (offline).

**Functional Requirements :**

#### FR-35: Cache des données critiques

Le système met en cache les données nécessaires pour fonctionnement offline : clients, modèles, paramètres société.

**Consequences (testable) :**
- Cache initial au premier chargement.
- Cache persiste minimum 30 jours offline.
- Cache mis à jour à chaque connexion.

#### FR-36: Création/modification offline

Un Commercial peut créer et modifier des devis sans connexion internet.

**Consequences (testable) :**
- Opérations possibles offline.
- Données stockées localement (IndexedDB).
- Marquage "hors synchro" visible.

#### FR-37: Synchronisation automatique

Le système synchronise automatiquement les données locales quand connexion devient disponible.

**Consequences (testable) :**
- Synchro déclenchée dès connexion détectée.
- Indicateur visuel de synchro en cours.
- Queue offline : opérations ordonnées (FIFO), retry avec backoff exponentiel (max 5 tentatives).

#### FR-37a: Résolution de conflits (offline sync) — `[DÉCISION D-SYNC, MVP-0]`

Le système utilise **Last-Write-Wins (LWW)** arbitré par l'horloge serveur, avec notification de conflit. Stratégie unique du MVP (cohérente avec §15.1). Le merge field-level / version vectors est **déféré v2** (utile seulement en multi-utilisateur concurrent réel — hors tiers 1–3 users MVP).

**Consequences (testable) :**
- Chaque entité (client, devis, ligne) porte un `updatedAt` serveur + un `revision` monotone.
- Au sync, si la révision serveur ≠ révision base du client → conflit détecté à l'échelle de l'entité (pas du champ).
- **Résolution :** le dernier write (horodatage serveur) gagne ; la version perdante est **archivée** (non détruite) et l'utilisateur reçoit une **notification de conflit** ("Ce devis a été modifié ailleurs — votre version est sauvegardée dans l'historique").
- Aucun merge automatique champ-par-champ en MVP.
- Audit trail des conflits (qui, quelle version a gagné/été archivée, quand) — `[MVP-1: audit immutable complet]`.
- Idempotence : opérations rejouables sans double-application (clé d'opération côté queue).

**Out of Scope MVP :**
- Merge field-level / version vectors → v2 (`[DEFERRED v2]`).
- Real-time collaboration (live editing simultané) → v2.

#### FR-38: Installation PWA

Un utilisateur peut installer l'application sur son appareil (mobile ou desktop).

**Consequences (testable) :**
- Invite installation affichée au premier chargement (sur critères browser).
- Icône d'installation disponible.
- App installée lance en plein écran (sans barre URL).

#### FR-39: Mise à jour PWA

Le système propose les mises à jour de l'application.

**Consequences (testable) :**
- Nouvelle version détectée au chargement.
- Notification "Mise à jour disponible".
- Rechargement au prochain lancement.

**Feature-specific NFRs :**
- **Performance :** Premier affichage < 5 secondes (3G).
- **Stockage :** IndexedDB, quota minimum 50MB.
- **Compatibilité :** Support Chrome, Edge, Firefox, Safari mobile.

**Notes :**
- `[DÉCISION — SW par type de ressource]` Une seule stratégie globale "Cache First" sert des données périmées (permissions, quotas, taux, modèles, statuts). Le Service Worker découpe par type :
  - **App shell** (HTML/JS/CSS, fonts auto-hébergées, logo) → **Cache First** (précaché à l'install, mis à jour au déploiement).
  - **API lecture** (clients, devis, paramètres, modèles, taux) → **Network First** avec fallback cache, ou **Stale-While-Revalidate** pour les données peu volatiles.
  - **API mutations** (création/édition devis, transitions statut) → **jamais cache** : queue offline (FR-37) uniquement.
  - **Permissions / quotas / révocation** → **Network First strict** (pas de fallback périmé sur décisions de sécurité ; offline = dernière valeur connue marquée "non vérifiée").
  - **Assets PDF (librairie lazy)** → précachés si génération PDF offline requise (FR-31/FR-33).
- `[ASSUMPTION]` Pas de Background Sync API en MVP-0 (sync au retour réseau pendant session active) ; Background Sync → MVP-1.

---

### 4.11 Tableau bord

**Description :** Vue d'ensemble de l'activité : nombre de devis par statut, montants totaux, devis récents. Permet une visualisation rapide de l'activité. Réalise UJ-3.

**Functional Requirements :**

#### FR-40: Vue synthétique activité

Le tableau bord affiche les métriques clés : total devis, brouillons, envoyés, acceptés, expirés.

**Consequences (testable) :**
- Compteurs par statut (temps réel).
- Filtre par période (7j, 30j, 90j, tout).
- Rafraîchissement automatique (toutes les 30s).

#### FR-41: Liste devis récents

Le tableau bord affiche la liste des N devis les plus récents.

**Consequences (testable) :**
- 10 derniers devis par défaut.
- Colonnes : numéro, client, date, statut, montant.
- Tap sur ligne → ouvre devis.

#### FR-42: Métriques montants

Le tableau bord affiche le total des montants devisés sur la période sélectionnée.

**Consequences (testable) :**
- Somme des devis "Acceptés" et "Envoyés".
- Exclusion des "Brouillons" et "Annulés".
- Affichage en FCFA avec séparateur milliers.

**Feature-specific NFRs :**
- **Performance :** Chargement tableau bord < 2 secondes offline.
- **Offline :** Donnes agrégées calculées localement.

**Notes :**
- `[ASSUMPTION]` Pas de graphiques complexes MVP (compteurs suffisent).
- `[NOTE FOR PM]` Graphiques v2 si demandé (Chart.js/Recharts).

---

## 5. Non-Goals (Explicit)

**Ce que ce produit n'est pas et ne fera pas en v1 :**

- **TMS complet** — Pas de suivi flotte, GPS, tracking véhicules.
- **Facturation** — Pas de création factures depuis devis (v2).
- **Comptabilité** — Pas d'intégration comptable (v2).
- **Multi-devises temps réel** — Taux change saisi manuellement, pas d'API.
- **Signature électronique** — Signature physique imprimée, pas digitale.
- **Multi-entités** — Une seule société par instance (v2).
- **Multi-pays** — Optimisé Niger, extension Mali/Burkina v2.
- **Portail client** — Clients ne créent pas de demandes de devis (v2).
- **Mobile natif** — PWA, pas d'app iOS/Android natif.
- **Marketplace** — Pas de mise en relation transporteurs-chargeurs.

---

## 6. MVP Scope

> **Découpage MVP-0 / MVP-1 (D-SCOPE résolu, review Codex 2026-06-21).** Le périmètre initial (42 FR + RBAC + IndexedDB chiffré + sync conflictuelle + quotas + audit immutable + backup/PITR) constitue une **v1 complète**, pas un MVP livrable rapidement. Il est scindé :
>
> - **MVP-0 (ship d'abord, vertical fonctionnel testable) :** Auth simple, Paramètres société, Clients, Devis, Détails opérationnels, Prestations, Clauses, Validation client (zone PDF), PDF, **offline basique** (IndexedDB non chiffré, queue FIFO, sync LWW), Tableau bord.
> - **MVP-1 (durcissement, même v1, juste après) :** chiffrement IndexedDB au repos (S4), enforcement des quotas (§12), audit trail immutable complet (O1), backup/PITR géo-répliqué (§15.4), Background Sync API, **CRUD modèles de routes/corridors**.
> - **v2 :** merge sync field-level/version vectors, multi-société, multi-pays, signature électronique, API taux change, hébergement/partage PDF serveur.
>
> **Implication architecture :** concevoir dès MVP-0 les coutures d'extension (interface de chiffrement enfichable sur le store local, hook quota avant mutation, event log dès le départ même si non-immutable, champ `pays` présent). Voir handoff vers `bmad-create-architecture`.
>
> Les FR ci-dessous restent la spécification de référence ; le tag `[MVP-1]` / `[v2]` indique le palier de livraison.

### 6.1 In Scope (v1 — paliers MVP-0 / MVP-1)

**Module 1 — Authentification**
- Connexion email/mot de passe
- Rôles : Administrateur, Commercial, Opérateur
- Permissions par rôle
- Réinitialisation mot de passe

**Module 2 — Paramètres société**
- Configuration infos société (raison sociale, RCCM, NIF, coordonnées)
- Upload logo
- Signataire par défaut

**Module 3 — Clients**
- CRUD clients
- Recherche par nom/téléphone/ville
- Liste clients avec filtres

**Module 4 — Devis**
- Création nouveau devis
- Numérotation automatique
- Duplication devis
- Gestion statuts (Brouillon → Validé → Envoyé → Accepté/Expiré/Annulé)
- Recherche et filtrage

**Module 5 — Détails opérationnels**
- Saisie trajet (pays/ville départ/arrivée)
- Saisie marchandise (nature, tonnage, capacité camion)
- Calcul automatique nombre camions
- Calcul automatique valeur marchandise (avec taux change)

**Module 6 — Prestations**
- Ajout/modification/suppression lignes
- Calcul automatique total ligne et total devis
- Modèles de lignes réutilisables

**Module 7 — Clauses**
- Bibliothèque clauses standards
- Application clauses au devis
- Clause spécifique par devis

**Module 8 — Validation client**
- Zone signature PDF (nom, fonction, date, signature, cachet)
- Enregistrement accord client

**Module 9 — PDF**
- Génération PDF professionnel
- Aperçu avant génération
- Export/téléchargement/partage

**Module 10 — Offline-first / PWA**
- Cache données critiques (SW par type de ressource)
- Création/modification offline (IndexedDB **non chiffré en MVP-0** ; chiffrement S4 → `[MVP-1]`)
- Synchro automatique (queue FIFO + LWW, FR-37/FR-37a)
- Installation PWA
- Mise à jour PWA
- `[MVP-1]` Chiffrement IndexedDB au repos (S4), Background Sync API

**Détails opérationnels — modèles de routes (D-ROUTES résolu)**
- **MVP-0 :** corridors fréquents = **presets codés en dur** (chips wizard : Niamey→Ouagadougou, Cotonou→Niamey, etc. — déjà dans le design UX), sans persistance ni CRUD.
- `[MVP-1]` **CRUD modèles de routes/corridors** : champs (départ/arrivée, distance, tarif prédéfini), application au devis, gaté tier Pro (§12). Nécessite un FR dédié à rédiger en MVP-1.

**Module 11 — Tableau bord**
- Vue synthétique (compteurs par statut)
- Liste devis récents
- Métriques montants

### 6.2 Out of Scope

**Déférés MVP-1 (même v1, palier durcissement) :**
- Chiffrement IndexedDB au repos (S4)
- Enforcement des quotas + grace period (§12)
- Audit trail immutable complet (O1) — un event log basique existe dès MVP-0
- Backup/PITR géo-répliqué (§15.4)
- Background Sync API
- CRUD modèles de routes/corridors (presets figés en MVP-0)

**Déférés v2 :**
- Multi-sociétés / Multi-agences `[NOTE FOR PM]` — préparer architecture extensible
- Multi-pays AES (Mali, Burkina Faso) `[NOTE FOR PM]` — préparer champs pays
- Facturation depuis devis
- Intégration comptabilité
- Signature électronique (Yousign/DocuSign)
- API taux change temps réel
- Portail client (auto-demande devis)
- Graphiques avancés tableau bord
- Notifications push
- Mobile natif (iOS/Android)
- Merge sync field-level / version vectors (collab concurrente réelle)
- Hébergement/partage PDF serveur (lien de téléchargement)

**Hors scope produit :**
- GPS tracking flotte
- Marketplace transporteurs-chargeurs
- Gestion warehouse/dépot
- CRM complet (limité à fiche client basique)

---

## 7. Success Metrics

**Primary**

- **SM-1**: Temps de création de devis — **Seuil d'acceptation : médiane ≤ 5 minutes** ; **cible (vision §1) : 3 minutes** (contre 20 minutes actuels). Le test d'acceptation valide le seuil 5 min ; 3 min est l'objectif marketing/produit. Valide FR-12, FR-17, FR-18, FR-21, FR-31.
- **SM-2**: Taux d'erreur sur devis — **Objectif : < 5%** (contre ~20% estimés). Valide FR-19, FR-20, FR-23.
- **SM-3**: Adoption offline — **Objectif : 40%+ des devis créés offline**. Valide FR-36, FR-37.

**Secondary**

- **SM-4**: Satisfaction utilisateur — **Objectif : NPS ≥ 40** (après 3 mois d'utilisation). Valide tous FRs.
- **SM-5**: Temps de génération PDF — **Seuil d'acceptation : < 5 secondes** (mobile bas de gamme, aligné NFR P4/FR-31) ; **cible : < 3 secondes** (mobile récent). Valide FR-31, FR-32.
- **SM-6**: Taux de complétion devis — **Objectif : ≥ 80%** (devis créés vs envoyés). Valide FR-15.

**Counter-metrics (do not optimize)**

- **SM-C1**: Nombre de champs par formulaire — Optimiser réduit utilité. Contre-balance SM-1.
- **SM-C2**: Taille bundle PWA — Optimiser excessivement dégrade fonctionnalités offline. Contre-balance FR-35, FR-36.

---

## 8. Open Questions

1. **Modèle de monétisation** — Abonnement mensuel ? Par utilisateur ? Par devis ? Fixe + usage ? `[CRITICAL v1]`
2. **Taux de change source** — Saisi manuellement (MVP) ou API (v2, ex: fixer.io) ? `[NON-BLOCKER v1]`
3. **Signature électronique** — Partenaire v2 (Yousign, DocuSign, Uniform) ? `[DEFERRED v2]`

**Résolues (nettoyées au review Codex 2026-06-21) :**
- ~~TVA~~ → **tranchée hors MVP** (régime simplifié, voir Assumption FR-23) ; réintroduction OHADA = v2.
- ~~Hébergement PDF~~ → **tranché client-side** (jsPDF + html2canvas, Décision C6, FR-31/FR-33). Server-side = v2 si instabilité.
- ~~Durée offline sans sync~~ → **tranchée** : session 7 j gouverne l'accès, re-auth obligatoire ensuite (D-OFFLINE, voir FR-1).

---

## 9. Assumptions Index

- `[ASSUMPTION]` Email/mot de passe par défaut, pas OAuth pour MVP (FR-1)
- `[ASSUMPTION]` Une seule société par instance MVP (FR-5, FR-7)
- `[ASSUMPTION]` Pays limité à Niger MVP, extensible AES v2 (FR-11, FR-17)
- `[ASSUMPTION]` Pas de TVA MVP (régime simplifié) (FR-23)
- `[ASSUMPTION]` Pas de gestion multi-escale MVP (trajet simple A → B) (FR-17)
- `[ASSUMPTION]` Taux de change saisi manuellement MVP, pas d'API taux v2 (FR-20)
- `[ASSUMPTION]` Numérotation par instance, pas par agence MVP (FR-13)
- `[ASSUMPTION]` Clauses standards fournies avec MVP (templates OHADA) (FR-26)
- `[ASSUMPTION]` Signature électronique pas dispo MVP (FR-29)
- `[DÉCISION]` Génération PDF client-side (jsPDF) — C6 résolu (FR-33)
- `[DÉCISION]` Service Worker à stratégie **découpée par type de ressource** (app shell cache-first, API lecture network-first/SWR, mutations queue-only, sécurité network-first strict) — voir FR-35
- `[ASSUMPTION]` Pas de background sync MVP (nécessite connexion) (FR-37)
- `[ASSUMPTION]` Pas de graphiques complexes MVP (compteurs suffisent) (FR-40)

---

## 10. Cross-Cutting NFRs

### 10.1 Performance (M1 résolu — cibles réalistes Sahel)

Tests requis sur **2G/Edge réels** (50-200 Kbps, latence 300-1000ms), pas seulement 3G.

- **P1 — First Contentful Paint :** < 5 secondes (2G), < 3 secondes (3G)
- **P2 — Time to Interactive :** < 8 secondes (2G), < 5 secondes (3G)
- **P3 — Création de devis offline :** < 3 secondes
- **P4 — Génération PDF :** < 5 secondes (mobile bas de gamme)
- **P5 — Recherche clients :** < 500ms (1000 clients offline)
- **P6 — Synchro données :** < 30 secondes après connexion (delta sync, pas full)
- **P7 — Progressive enhancement :** Fonctionnalités core (création devis) utilisables même si assets lourds (PDF lib) pas chargés
- **P8 — Performance budgets :** Bundle JS < 300KB initial (gzip), lazy-load routes + PDF lib
- **P9 — Tests devices cibles :** Android bas de gamme (1-2GB RAM, Android 8+), validation obligatoire avant release

### 10.1b Accessibility (M9 résolu)

- **A1 — Standard :** WCAG 2.1 AA minimum
- **A2 — Navigation clavier :** Toutes actions atteignables au clavier (tab order logique)
- **A3 — Screen reader :** ARIA labels, landmarks, live regions pour updates dynamiques
- **A4 — Contraste :** Ratio 4.5:1 minimum (texte normal), 3:1 (grand texte)
- **A5 — Font scaling :** Support zoom 200% sans cassure layout
- **A6 — Tests :** Audit a11y (axe-core) dans CI, tests utilisateurs si possible

### 10.1c Internationalization (M2 résolu)

Foundation i18n dès MVP pour préparer extension AES :
- **I1 — Librairie :** next-intl (App Router compatible), tous UI strings externalisés
- **I2 — Locale v1 :** `fr-NE` (français Niger). Structure prête `fr-ML`, `fr-BF` v2
- **I3 — Formats :** Date/number/currency localisés (Intl API), pas de hardcoding
- **I4 — Configuration pays :** Data structure `countryConfig` (devises, formats, exigences légales) extensible
- **I5 — Unicode :** UTF-8 partout, gestion accents (é, è, à, ç), noms régionaux

### 10.1d Error Handling (M4 résolu)

- **E1 — Catégorisation :** Erreurs transient (réseau, sync) vs permanent (validation, permission)
- **E2 — Messages :** User-friendly, actionables, en français. Jamais stack trace côté user
- **E3 — Recovery :** Retry auto pour transient (backoff exponentiel, max 5). Action manuelle proposée pour permanent
- **E4 — Offline errors :** Opérations échouées mises en queue, notifiées au user, retry au reconnect
- **E5 — Sync errors :** Si sync rejette donnée client (validation serveur), notification + rollback local + archivage version rejetée
- **E6 — Error boundaries :** React error boundaries par section (une erreur n'effondre pas toute l'app)
- **E7 — Reporting :** Erreurs reportées serveur (avec consent, PII scrubbed)

### 10.2 Security

- **S1 — Auth :** Mots de passe hashés (bcrypt/argon2), jamais en clair
- **S2 — TLS :** HTTPS obligatoire en production
- **S3 — Session :** Token JWT avec expiration 7 jours
- **S4 — Offline encryption (C3 résolu) :** IndexedDB chiffré au repos via Web Crypto API (AES-GCM). Clé dérivée du mot de passe utilisateur (PBKDF2, 100k iterations, salt unique). Données classifiées :
  - **PII** (noms, emails, téléphones clients) → chiffrées
  - **Financier** (montants devis) → chiffrées
  - **Commercial** (clauses, paramètres société) → chiffrées
  - Cache déchiffré en mémoire uniquement pendant session active
- **S5 — Validation (H3 résolu) :** Schéma validation partagé client/serveur (Zod). Serveur = source de vérité authoritative. Au sync, serveur re-valide ; si rejet, notification client + rollback local.
- **S6 — Rate limiting (H5 résolu) :**
  - Auth : 10 tentatives/min par IP
  - Login : lockout compte après 5 échecs (unlock admin)
  - Création devis : 60/min par utilisateur
  - Password reset : 3/hour par email
- **S7 — Remote wipe :** Option purge données locales (admin peut déclencher via console)

### 10.3 Reliability

- **R1 — Uptime :** 99.5% mensuel (hors maintenances planifiées)
- **R2 — Sync :** Taux d'échec synchro < 1%
- **R3 — Backup :** Backup quotidien, rétention 30 jours
- **R4 — RTO :** < 4 heures (reprise après incident)
- **R5 — RPO :** < 1 heure (PITR continu, aligné §15.4 Backup & Recovery — anciennement < 24h, harmonisé au review Codex 2026-06-21)

### 10.4 Observability

- **O1 — Audit trail (H1 résolu) :** Append-only event log par entité. Chaque entrée : `who` (user ID), `what` (action), `when` (timestamp UTC ISO 8601), `where` (device/IP), `entity` (type+ID), `before`/`after` (field diff). Immutable une fois écrit. Syncé serveur (source de vérité). Exportable (JSON/CSV) pour compliance.
  - **Actions tracées :** création devis, modification champ, transition statut, génération PDF, suppression, login/logout, conflit résolu.
- **O2 — Errors :** Erreurs client et serveur capturées (Sentry ou équivalent), stack trace + contexte utilisateur.
- **O3 — Metrics :** Métriques utilisation (devis créés, utilisateurs actifs, offline ratio) via analytics self-hosted.
- **O4 — Health check :** Endpoint health pour monitoring (`/api/v1/health` → DB, storage, sync status) _(harmonisé à `/api/v1/health` au review Codex 2026-06-21 pour cohérence avec le versioning `/api/v1/`)_.

---

## 11. Platform

**Form-factor :** PWA (Progressive Web App)

- **Mobile-first** — Optimisé pour smartphones Android/iOS
- **Desktop compatible** — Fonctionne sur PC/Mac (Chrome, Edge, Firefox, Safari)
- **Installable** — Ajout à home screen, lancement plein écran
- **Offline-first** — Fonctionne sans connexion, sync auto

**Compatibilité :**
- Browsers : Chrome 90+, Edge 90+, Firefox 88+, Safari 14+
- OS : Android 8+, iOS 12+, Windows 10+, macOS 11+
- PWA features : Service Worker, IndexedDB, Web App Manifest

---

## 12. Monetization

**Modèle proposé (à confirmer) :** Abonnement mensuel par tier avec quotas.

**Matrice features/quotas par tier (H7 résolu) :**

| Feature | Starter | Pro | Entreprise |
|---------|---------|-----|------------|
| **Prix/mois** | 25,000 FCFA | 75,000 FCFA | 200,000 FCFA |
| **Utilisateurs** | 1 | 3 | 10 |
| **Devis/mois** | 50 | Illimité | Illimité |
| **Clients** | Illimité | Illimité | Illimité |
| **Création devis** | ✓ | ✓ | ✓ |
| **Génération PDF** | ✓ | ✓ | ✓ |
| **Offline-first** | ✓ | ✓ | ✓ |
| **Modèles clauses** | Basiques | ✓ | ✓ + custom |
| **Modèles routes/lignes** | ✗ | ✓ | ✓ |
| **Tableau bord** | Basique | ✓ | ✓ + exports |
| **Support** | Email (48h) | Email (24h) + WhatsApp | Prioritaire (4h) |
| **Branding PDF** | "Quotation Logistique" footer | Logo société | Logo + custom template |
| **Backup/SLO** | Standard | Standard | Enhanced (RTO 1h) |

**Quota enforcement :**
- Avant création devis, check quota restant. Si dépassé → blocage + proposition upgrade.
- Avant ajout utilisateur, check limite tier.
- Notification à 80% quota (email + in-app).
- Grace period 7 jours après dépassement (mode lecture seule après).

**À décider :** Pricing FCFA final ajusté au marché Niger/AES ? Free trial (14 jours) ? `[OPEN QUESTION 1]`

---

## 13. Operational Requirements

### 13.1 SLA

- **Disponibilité :** 99.5% mensuel (hors maintenances)
- **Temps de réponse support :** < 24 heures (email)
- **Résolution incidents :** 80% résolus en < 48 heures

### 13.2 Support

- **Canaux :** Email, WhatsApp (premium)
- **Heures :** Lundi-Vendredi 8h-18h (heure Niger)
- **Langues :** Français

### 13.3 Maintenance

- **Fenêtre maintenance :** Dimanche 2h-6h (heure Niger)
- **Préavis :** 48 heures (sauf urgent)

---

## 14. Integration and Dependencies

### 14.1 v1 (Minimal)

- **Email :** SMTP pour envoi (réinitialisation mot de passe, notifications)
- **Storage :** Blob storage pour logos et fichiers

### 14.2 v2 (Futur)

- **Mobile Money :** Orange Money, Moov Money (paiements abonnement)
- **Taux change :** API (fixer.io, exchangerate-api)
- **Signature électronique :** Yousign, DocuSign, Uniform
- **Comptabilité :** Export vers comptabilité locale

---

## 15. Data Governance

### 15.1 Offline Sync

- **Stratégie (MVP-0) :** **Last-Write-Wins** arbitré par l'horloge serveur, avec notification de conflit. Stratégie unique — voir FR-37a (source de vérité du comportement de sync). Merge field-level / version vectors → **v2**.
- **Conflits :** Détectés à l'échelle de l'entité, résolus côté serveur, version perdante archivée, client notifié.
- **Purge :** Données locales non synchronisées purgées après 90 jours.

### 15.2 Data Retention

- **Devis :** Conservés 7 ans (obligation fiscale)
- **Clients :** Conservés 7 ans après dernier devis
- **Logs (audit trail) :** Conservés 7 ans (aligné obligation fiscale devis)
- **Logs (erreurs/app) :** 90 jours
- **Backups :** Rétention 30 jours

### 15.3 Data Migration & Versioning (H4 résolu)

- **API versioning :** Préfixe `/api/v1/`, dépréciation annoncée 6 mois avant sunset.
- **Schema versioning :** Version DB trackée. Migrations Drizzle ordonnées, rollback documenté.
- **Client compatibility :** Au startup, client envoie version app. Serveur vérifie compatibilité. Si incompatibility (breaking change) → UI "Mise à jour requise" + blocage sync (sans perte données locales).
- **Migration offline :** Si user offline > release breaking change, données locales conservées jusqu'à upgrade. Pas de perte.
- **Force upgrade :** Pour breaking changes critiques, blocage app après 30 jours post-release.

### 15.4 Backup & Recovery (H6 résolu)

- **Scope :** DB (PostgreSQL) + Blob storage (logos, signatures) + config app.
- **Fréquence :** Backup quotidien complet + WAL streaming continu (PITR).
- **Rétention :** 30 jours (daily) + 12 mensuels (archive long-terme).
- **Vérification :** Restore test hebdomadaire (environnement staging), alerte si échec.
- **Redondance :** Backup géo-répliqué (minimum 2 zones).
- **RTO :** < 4 heures (reprise service).
- **RPO :** < 1 heure (PITR continu, amélioré vs 24h initial).
- **Device loss recovery :** User peut exporter ses données + re-import sur nouvel appareil. Données syncées serveur récupérables.

### 15.5 Privacy

- **Données personnelles :** Conformément aux lois nigériennes (lois similaires RGPD absent)
- **Consentement :** Acceptation conditions lors inscription
- **Droit accès :** Utilisateur peut exporter ses données (JSON/CSV)

---

## 16. Change Log

| Rév. | Date | Auteur | Changements |
|------|------|--------|-------------|
| 1 | 2026-06-21 | Maiga Tech Lab | PRD initial (création coachée). |
| 2 | 2026-06-21 | Review Codex + correctifs | **Sync :** FR-37a réécrit en Last-Write-Wins + notif (version vectors → v2) ; §15.1 aligné. **PDF partage :** FR-33 réaliste (Web Share API + download, `mailto` pièce jointe retiré). **Offline :** politique d'expiration 7 j clarifiée (re-auth obligatoire, FR-1). **Service Worker :** stratégie découpée par type de ressource (FR-35). **Scope :** découpage MVP-0 / MVP-1 / v2 (§6). **Routes :** presets figés MVP-0, CRUD MVP-1 (D-ROUTES). **Métriques :** SM-1 (seuil 5 min / cible 3 min) et SM-5 (seuil 5 s / cible 3 s) harmonisées. **Open Questions :** TVA, hébergement PDF, durée offline marquées résolues. |
| 3 | 2026-06-21 | Review Epics Codex + harmonisation | **RPO :** NFR R5 harmonisé à < 1h (PITR, aligné §15.4 ; anciennement < 24h). **Health endpoint :** O4 harmonisé à `/api/v1/health` (cohérence versioning `/api/v1/`). Ces corrections préparent le breakdown Epic/Stories. |

---

*Fin du PRD — Document révisé (rév. 2), prêt pour architecture.*

