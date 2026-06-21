# Cahier des charges MVP — Application web de quotation logistique

## Vision du produit

L’application est une solution web de gestion de devis logistiques destinée dans un premier temps aux professionnels du Niger, notamment les transporteurs, transitaires, commissionnaires en douane, sociétés de négoce et opérateurs logistiques. Le produit sera ensuite étendu à l’ensemble de l’espace AES, en particulier le Mali et le Burkina Faso, grâce à une architecture évolutive et adaptée aux réalités du marché sahélien francophone.[cite:3][cite:5][cite:10][cite:13]

Le MVP doit répondre à un besoin simple et concret : créer rapidement un devis professionnel, calculer automatiquement les montants, générer un document propre à imprimer ou envoyer, puis conserver un historique exploitable par client et par commercial.[cite:1]

## Objectifs

Les objectifs du MVP sont les suivants :
- Réduire la production manuelle de devis logistiques.
- Standardiser les devis pour les professionnels du Niger.
- Automatiser les calculs de tonnage, valeur marchandise et prestations.
- Produire un PDF professionnel proche du format actuellement utilisé.
- Préparer une base technique extensible pour l’espace AES.[cite:1][cite:5][cite:13]

## Utilisateurs cibles

Le produit vise en priorité :
- Les sociétés de transport routier.
- Les transitaires et commissionnaires.
- Les entreprises de dédouanement.
- Les négociants et importateurs/exportateurs.
- Les équipes commerciales et administratives des sociétés logistiques.[cite:5][cite:13]

Le MVP sera pensé pour des utilisateurs francophones, avec une interface 100% en français, ce qui correspond à une logique de déploiement initial sur le Niger puis sur des marchés AES également majoritairement francophones.[cite:10][cite:13]

## Périmètre fonctionnel

Le MVP doit inclure les modules suivants.

### 1. Authentification et accès
- Connexion sécurisée.
- Gestion minimale des rôles : administrateur, commercial, opérateur.
- Restriction d’accès selon rôle.[cite:7]

### 2. Paramètres société
- Raison sociale.
- Forme juridique.
- Capital social.
- Adresse du siège.
- BP.
- RCCM.
- NIF.
- Téléphones.
- Emails.
- Logo.
- Signataire par défaut.[cite:1]

### 3. Gestion des clients
- Nom de la société cliente.
- Nom du contact.
- Téléphone.
- Email.
- Pays.
- Ville.
- Adresse.
- Notes internes.

### 4. Gestion des devis
- Numéro de devis automatique.
- Date du devis.
- Date de fin de validité.
- Client.
- Commercial en charge.
- Référence ou objet du dossier.
- Statut : brouillon, validé, envoyé, accepté, expiré, annulé.[cite:1]

### 5. Détails opérationnels
- Pays / ville de départ.
- Pays / ville d’arrivée.
- Trajet.
- Nature de la marchandise.
- Quantité en tonnes.
- Capacité camion.
- Nombre de camions.
- Valeur commerciale.
- Prix unitaire marchandise.
- Devise.
- Taux de change.
- Valeur totale locale.[cite:1]

### 6. Prestations et frais
Le tableau doit permettre d’ajouter, modifier et supprimer des lignes de devis avec :
- Désignation.
- Prix unitaire.
- Quantité.
- Total ligne.
- Ordre d’affichage.[cite:1]

Le système doit prévoir des lignes standards réutilisables comme :
- Transport.
- Carnet de transit.
- Droits et taxes douanières.
- Frais phytosanitaires.
- Frais de traitement douanier.
- Frais de service.[cite:1]

### 7. Conditions et clauses
- Termes et conditions de paiement.
- Clauses standards réutilisables.
- Clauses spécifiques au devis.
- Mentions particulières comme exclusion FDA, variation réglementaire, caractère estimatif du devis.[cite:1]

### 8. Validation client
- Nom du signataire.
- Fonction.
- Date.
- Signature.
- Cachet.
- Zone imprimable pour accord client.[cite:1]

### 9. PDF et impression
- Aperçu avant impression.
- Export PDF.
- Mise en page proche du modèle actuel.
- En-tête et pied de page société.
- Tableau des frais propre et lisible.[cite:1]

## Règles métier

Le système doit intégrer les calculs suivants :
- `nombre_camions = ceil(quantité / capacité_camion)` si mode calcul automatique.
- `valeur_marchandise = quantité x prix_unitaire x taux_change` si la devise source est étrangère.
- `total_ligne = prix_unitaire x quantité`.
- `total_devis = somme des lignes`.
- `date_validité = date_devis + nombre_de_jours`, avec possibilité de saisie manuelle.[cite:1]

Des règles de confort doivent aussi être prévues :
- Duplication d’un devis existant.
- Sauvegarde brouillon.
- Modèles de clauses.
- Modèles de lignes de frais par corridor logistique.
- Historique par client.[cite:1]

## Spécificités Niger puis AES

Le cahier des charges doit intégrer explicitement cette orientation :
- MVP optimisé pour les professionnels du Niger.
- Langue unique : français.
- Devise principale : FCFA.
- Documents conformes aux usages administratifs et commerciaux locaux.
- Architecture extensible pour le Mali et le Burkina Faso en phase suivante.[cite:5][cite:10][cite:13]

Pour préparer l’extension AES, il faut prévoir dès maintenant :
- Paramètres multi-sociétés.
- Paramètres multi-agences.
- Champs pays dans les clients et devis.
- Paramètres de numérotation par entité.
- Possibilité future de gérer plusieurs devises et plusieurs modèles de document.[cite:7][cite:13]

## Écrans du MVP

Les écrans prioritaires sont :
- Connexion.
- Tableau de bord.
- Liste des devis.
- Nouveau devis.
- Détail / aperçu d’un devis.
- Liste des clients.
- Nouveau client.
- Paramètres société.
- Bibliothèque de clauses.[cite:2][cite:3]

Le tableau de bord peut afficher :
- Nombre total de devis.
- Devis en brouillon.
- Devis envoyés.
- Devis acceptés.
- Devis expirés.
- Montant total devisé sur une période.[cite:2]

## Base de données

Structure recommandée :

| Table | Description |
|---|---|
| `users` | Utilisateurs de l’application et rôles |
| `companies` | Informations de la société émettrice |
| `clients` | Fiches clients |
| `quotations` | En-tête du devis |
| `quotation_items` | Lignes de prestations et frais |
| `quotation_clauses` | Clauses standard ou spécifiques |
| `quotation_status_logs` | Historique des changements de statut |
| `quotation_approvals` | Données d’accord client |
| `routes` | Corridors logistiques prédéfinis |
| `rate_templates` | Tarifs ou lignes standards réutilisables |

Cette structure est cohérente avec une ambition de produit régional évolutif et avec une approche de solutions sur mesure, extensibles et bien documentées.[cite:4][cite:7]

## Exigences techniques

Recommandations MVP :
- Frontend web responsive.
- Interface propre, simple, orientée bureau et tablette.
- Backend API avec base PostgreSQL.
- Génération PDF côté serveur ou via HTML print template.
- Hébergement cloud ou VPS.
- Journalisation des actions critiques.[cite:3][cite:8]

Stack recommandée :
- Next.js ou React.
- Tailwind CSS.
- Supabase/PostgreSQL ou backend Node.js + PostgreSQL.
- Déploiement Vercel + Supabase, ou Hetzner si contrôle complet souhaité.[cite:3][cite:8]

## Roadmap

### Phase 1 — MVP Niger
- Auth.
- Paramètres société.
- Clients.
- Création de devis.
- Calculs automatiques.
- PDF / impression.
- Historique simple.[cite:1]

### Phase 2 — Consolidation Niger
- Statuts avancés.
- Duplication de devis.
- Bibliothèque de routes.
- Bibliothèque de frais standards.
- Filtres et recherche.
- Tableau de bord enrichi.[cite:2]

### Phase 3 — Extension AES
- Multi-entités.
- Multi-pays.
- Numérotation par pays/agence.
- Multi-devises.
- Variantes de documents selon pays.
- Gestion commerciale régionale.[cite:5][cite:7][cite:13]

## Critères de succès

Le MVP sera réussi si :
- un commercial peut créer un devis complet en quelques minutes ;[cite:1]
- les calculs sont automatiques et fiables ;[cite:1]
- le PDF généré est suffisamment professionnel pour être envoyé directement au client ;[cite:1]
- les devis sont retrouvables par client, date et statut ;[cite:2]
- la structure permet une extension propre vers l’espace AES sans refonte majeure.[cite:7][cite:13]
