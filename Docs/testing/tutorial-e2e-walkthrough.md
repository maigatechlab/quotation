# Tutoriel — Prise en main complète de Quotation Logistique

> Ce tutoriel reprend, étape par étape, un scénario complet réel : création d'un tenant depuis la console owner, configuration de la société, gestion des utilisateurs et des rôles, création d'un client, puis rédaction d'un devis complet jusqu'au PDF. Utilisable comme guide de démonstration ou d'onboarding.

---

## Pré-requis

```bash
docker compose up -d      # ou vérifier que le conteneur Postgres tourne déjà
pnpm db:migrate
pnpm dev                  # http://localhost:3000
```

Pour obtenir un premier compte **owner/superadmin** (aucune inscription publique n'existe pour ce rôle) :

```bash
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"owner@example.com","password":"MotDePasse1234","name":"Mon Nom"}'
```

Puis promouvoir ce compte en base :

```sql
UPDATE "user" SET role = 'superadmin' WHERE email = 'owner@example.com';
```

---

## 1. Connexion Owner Console

1. Aller sur `http://localhost:3000/owner/login` (route dédiée, distincte de `/login` — le sélecteur de rôle de `/login` ne propose que Admin/Commercial/Opérateur, jamais Owner).
2. Se connecter avec le compte superadmin.
3. Le tableau de bord affiche : tenants actifs/trial/suspendus/annulés, MRR/ARR, alertes critiques, activité récente, santé plateforme.

## 2. Créer un tenant

1. Menu **Tenants** → **Nouveau tenant** (`/owner/tenants/new`).
2. Renseigner : nom de la société, sous-domaine (slug), plan (Free/Pro/Enterprise), cycle de facturation.
3. Section **Administrateur du tenant** : nom, email, mot de passe (auto-généré ou manuel — choisir *Définir manuellement* pour connaître le mot de passe immédiatement, utile en test).
4. Cocher/décocher l'envoi de l'email de bienvenue (en dev, sans `RESEND_API_KEY`, l'email est simplement loggé côté serveur).
5. **Créer le tenant** → redirection vers la liste, le tenant apparaît en statut `Trial`.

Le tenant admin est créé automatiquement avec `role = admin` et peut se connecter immédiatement sur `/login` (sélecteur de rôle **Administrateur**).

## 3. Cycle de vie d'un tenant (suspension / réactivation / annulation)

Depuis `/owner/tenants/<id>`, onglet **Infos générales** :

- **Suspendre** : choisir un motif (Non-paiement / Fraude / Demande client / Autre), note interne optionnelle, case *"Bloquer totalement"* pour couper tout accès (sinon lecture seule).
- **Réactiver** : si aucun paiement ne couvre la nouvelle période, un dialogue impose d'**enregistrer un paiement** d'abord (méthode, montant, date, cycle, période couverte) — la réactivation se fait automatiquement à la confirmation du paiement si la case *"Réactiver le compte si suspendu"* est cochée.
- **Annuler définitivement** : nécessite de retaper le **slug exact** du tenant pour confirmer — action irréversible.

Chaque action est journalisée (onglet **Journal**) avec l'acteur et l'horodatage.

## 4. Gérer les utilisateurs d'un tenant (depuis la console owner)

Onglet **Utilisateurs** du détail tenant :

- Le quota (`x / maxUsers`) dépend du plan (Free = 1, Pro = 5, Enterprise = 20 — configurable dans `/owner/settings`).
- **+ Ajouter un utilisateur** : nom, email, rôle (Administrateur/Commercial/Opérateur), mot de passe auto ou manuel.
- **Révoquer** : désactive le compte (soft-disable) sans le supprimer — réversible via **Réactiver**.
- **Supprimer** : nécessite de retaper l'**email exact** — les devis/clients créés par l'utilisateur sont conservés.
- Le dernier administrateur actif ne peut être ni révoqué ni supprimé (boutons désactivés).

## 5. Se connecter côté tenant et configurer la société

1. Se déconnecter de la console owner, aller sur `/login`.
2. Sélectionner le rôle **Administrateur**, saisir les identifiants du tenant admin.
3. Menu **Paramètres** → onglet **Société** :
   - Renseigner raison sociale, forme juridique, capital, RCCM, NIF, adresse, téléphone(s), email(s) → **Enregistrer**.
   - **Changer le logo** → upload d'une image (PNG/JPG).
   - **Signataire par défaut** (nom + fonction) → pré-remplira automatiquement l'étape 1 du wizard de devis.

> Seul le rôle **admin** voit les onglets Modèles / Conformité / Utilisateurs. Commercial/Opérateur ne voient que Société, en lecture seule.

## 6. Modèles de routes (corridors fréquents)

Onglet **Modèles** (`/parametres/modeles`) :

- **Ajouter un modèle** : nom du corridor, pays/ville de départ, pays/ville d'arrivée, distance (km), tarif prédéfini (FCFA).
- Ce modèle apparaîtra comme raccourci cliquable dans l'étape **Trajet** du wizard de devis, et pré-remplira automatiquement villes + tarif à l'étape **Marchandise**.

## 7. Créer un client

Menu **Clients** → **Nouveau client** :

- Nom de la société *, nom du contact, téléphone *, email, ville, adresse, notes.
- La suppression d'un client est bloquée s'il a des devis associés (protection d'intégrité).

## 8. Créer un devis complet (wizard 5 étapes)

Menu **Devis** → **Nouveau devis** (`/devis/nouveau`) :

1. **Client** — sélectionner un client existant (ou créer à la volée), objet du devis, référence, dates, signataire (pré-rempli).
2. **Trajet** — cliquer sur un corridor fréquent (ou saisir pays/villes manuellement).
3. **Marchandise** — nature, tonnage, capacité camion : le **nombre de camions** (`⌈tonnage / capacité⌉`) et la **valeur marchandise** se calculent automatiquement ; le prix unitaire est pré-rempli si un modèle de route correspond.
4. **Prestations** — une ou plusieurs lignes (désignation, prix unitaire, quantité) ; totaux calculés en temps réel. Un bouton *Appliquer un modèle* réutilise une ligne enregistrée précédemment.
5. **Conditions** — conditions de paiement (texte libre), clauses contractuelles : cocher des clauses existantes ou rédiger une clause spécifique avec l'option *"Enregistrer comme modèle dans la bibliothèque"* pour la réutiliser sur de futurs devis.

**Terminer et sauvegarder** → le devis est créé localement (numéro provisoire `TEMP-xxxx`, mode local-first hors-ligne) puis synchronisé avec le serveur (numéro définitif).

## 9. Détail du devis, statut et PDF

Sur `/devis/<id>` :

- Aperçu complet façon document officiel : en-tête société (logo, RCCM/NIF), client, trajet, marchandise, tableau des prestations, total, conditions de paiement, clauses, blocs signature (société + client).
- **Générer le PDF** → télécharge un PDF (2 pages : corps du devis + page signatures) identique à l'aperçu.
- **Changer le statut** : `Brouillon → Validé → Envoyé → Accepté` (ou `Expiré`/`Annulé`) — seules les transitions valides depuis le statut courant sont proposées ; chaque transition est historisée avec l'acteur.
- **Modifier** / **Dupliquer ce devis** / **Partager** disponibles dans le panneau latéral.

---

## Comptes créés durant la session de test (référence)

| Rôle | Email | Tenant |
|---|---|---|
| Superadmin | qa-owner@maigatechlab.test | — |
| Admin | sahel-admin@maigatechlab.test | Sahel Cargo Express SARL (Pro) |
| Commercial | kadi.commercial@maigatechlab.test | idem |
| Opérateur | moussa.operateur@maigatechlab.test | idem |

> Ces comptes sont des données de test locales — à supprimer avant toute mise en production.
