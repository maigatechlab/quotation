# Owner Panel & Subscription Management — Brainstorming

**Date:** 2026-06-28  
**Statut:** Brainstorming → à promouvoir en Epic 7 BMAD  
**Contexte:** Besoin du owner (Maiga Tech Lab) de gérer les tenants, abonnements et paiements après lancement SaaS de l'app Quotation Logistique.

---

## 1. Décisions architecturales retenues

### Modèle de tenancy

**Multi-tenant SaaS avec sous-domaine par client.**

- Un seul déploiement Next.js
- Chaque client → `{slug}.quotation.com`
- Middleware Next.js lit le sous-domaine → résout `tenant_id` → scope toutes les requêtes DB
- Vercel wildcard domain (`*.quotation.com`) — configuration triviale
- Avantage vs instances séparées : un codebase, un déploiement, N tenants

### Modèle de paiement

**Hybride : mobile money local + Stripe (international)**

| Méthode | Flow | Confirmation |
|---------|------|--------------|
| Wave | Client envoie sur compte owner | **Manuelle** — owner confirme en dashboard |
| Nitta | Client envoie sur compte Nitta owner | **Manuelle** — owner confirme en dashboard |
| Amana | Client envoie sur compte owner | **Manuelle** — owner confirme en dashboard |
| Stripe | Paiement carte/SEPA en ligne | **Automatique** — webhook active le tenant |

Pas d'API webhook pour Wave/Nitta/Amana → confirmation manuelle obligatoire MVP.  
Automatisation Wave/mobile money possible en V2 si API disponible.

### Provisioning des comptes

**Phase 1 (MVP) :** Owner crée manuellement chaque tenant + compte admin client après confirmation du paiement.  
**Phase 2 :** Auto-activation post-Stripe + self-service avec payment gate.  
**Phase 3 :** Admin client invite ses propres utilisateurs en autonomie.

---

## 2. Schéma de données à ajouter

### Table `tenants`

```sql
id          uuid PRIMARY KEY
name        text NOT NULL              -- Raison sociale du client
slug        text UNIQUE NOT NULL       -- Sous-domaine : {slug}.quotation.com
status      enum('active', 'trial', 'suspended', 'cancelled') NOT NULL DEFAULT 'trial'
plan        enum('free', 'pro', 'enterprise') NOT NULL DEFAULT 'free'
subscription_start  date
subscription_end    date               -- NULL = pas d'abonnement actif
trial_ends_at       date               -- NULL si pas en trial
grace_period_ends_at date              -- NULL si pas en grâce
max_users   integer NOT NULL DEFAULT 3
notes       text                       -- Notes internes owner
created_at  timestamptz NOT NULL DEFAULT now()
updated_at  timestamptz NOT NULL DEFAULT now()
```

### Table `subscription_payments`

```sql
id              uuid PRIMARY KEY
tenant_id       uuid NOT NULL REFERENCES tenants(id)
amount          integer NOT NULL         -- Montant en FCFA (entier, jamais float)
currency        text NOT NULL DEFAULT 'XOF'
payment_method  enum('nitta', 'wave', 'amana', 'stripe', 'cash', 'virement')
payment_reference text                   -- Référence transaction (ex: ID Wave)
paid_at         timestamptz NOT NULL
period_start    date NOT NULL
period_end      date NOT NULL
billing_cycle   enum('monthly', 'annual') NOT NULL
confirmed_by    text NOT NULL            -- user_id du superadmin qui a confirmé
notes           text
created_at      timestamptz NOT NULL DEFAULT now()
```

### Table `tenant_events`

Journal d'audit des actions sur les tenants.

```sql
id          uuid PRIMARY KEY
tenant_id   uuid NOT NULL REFERENCES tenants(id)
event_type  text NOT NULL   -- 'created' | 'activated' | 'suspended' | 'reactivated' | 'cancelled' | 'payment_recorded' | 'plan_changed' | 'user_added' | 'reminder_sent'
actor_id    text NOT NULL   -- superadmin user_id
before      jsonb           -- état avant
after       jsonb           -- état après
note        text
created_at  timestamptz NOT NULL DEFAULT now()
```

### Modification `users`

Ajouter `tenant_id` sur la table utilisateurs Better Auth (via plugin/extension ou table de liaison).

---

## 3. Features du Panel Owner (`/owner`)

Route protégée `role = superadmin`. Inaccessible aux clients.

### 3.1 Dashboard overview

- **Compteurs globaux :** tenants actifs / en trial / suspendus / annulés
- **Revenus :** MRR (Monthly Recurring Revenue), ARR, total encaissé ce mois
- **Alertes critiques :**
  - Tenants dont l'abonnement expire dans ≤ 7 jours (badge rouge)
  - Tenants en période de grâce (badge orange)
  - Tenants en retard de paiement > 30 jours
- **Activité récente :** derniers paiements, dernières créations de tenants
- **Carte de santé :** % uptime, nb tenants actifs vs total

### 3.2 Liste des tenants (`/owner/tenants`)

Tableau paginé avec colonnes :
- Nom / Slug
- Plan (badge : Free / Pro / Enterprise)
- Statut (badge : Actif / Trial / Suspendu / Annulé)
- Date expiration abonnement + indicateur jours restants
- Dernier paiement (montant + méthode + date)
- Nb utilisateurs actifs / max
- Actions rapides : Voir · Suspendre · Réactiver · Enregistrer paiement

Filtres : statut, plan, expiration, méthode paiement, date création.  
Export CSV de la liste.

### 3.3 Fiche tenant (`/owner/tenants/[id]`)

**Onglet Infos générales**
- Nom, slug (URL), plan, statut, notes internes
- Modifier plan, changer statut, éditer notes
- Bouton "Suspendre" avec motif obligatoire
- Bouton "Réactiver" (vérifie que paiement est enregistré pour la période)
- Bouton "Annuler définitivement" avec confirmation

**Onglet Abonnement**
- Timeline visuelle de l'abonnement (périodes payées en vert, gaps en rouge)
- Période courante : dates début/fin + jours restants + cycle (mensuel/annuel)
- Historique complet des paiements (tableau : date, méthode, montant, référence, période couverte, confirmé par)
- Bouton "Enregistrer un paiement" → modal

**Modal "Enregistrer un paiement"**
```
Méthode de paiement  [Wave | Nitta | Amana | Stripe | Cash | Virement]
Référence transaction [champ texte]
Montant FCFA         [nombre]
Date du paiement     [datepicker]
Période couverte     [date début] → [date fin]  (ou: Mensuel / Annuel)
Notes                [texte libre]
☑ Réactiver le compte si suspendu
```

**Onglet Utilisateurs**
- Liste des utilisateurs du tenant (nom, email, rôle, dernière connexion, statut)
- Bouton "Ajouter un utilisateur" → crée un compte avec email de bienvenue
- Bouton "Révoquer" par utilisateur
- Indicateur quota : 2/3 utilisateurs (selon plan)

**Onglet Journal d'événements**
- Historique complet : création, activations, suspensions, paiements, changements plan, emails envoyés
- Filtrable par type d'événement
- Non modifiable (append-only)

### 3.4 Créer un tenant (`/owner/tenants/new`)

Formulaire :
```
Nom de la société    [texte obligatoire]
Slug / URL           [{slug}.quotation.com] [auto-généré, modifiable, unicité vérifiée]
Plan                 [Free | Pro | Enterprise]
Cycle               [Mensuel | Annuel]
Début période       [date]
Fin période         [date auto-calculée ou manuelle]
Admin du tenant
  Nom               [texte]
  Email             [email — recevra les credentials]
  Mot de passe      [auto-généré ou manuel]
Envoyer email de bienvenue ☑
Notes internes      [texte libre]
```

À la création :
1. Tenant créé en base
2. Compte admin client créé (Better Auth)
3. Email de bienvenue envoyé (si coché) avec URL `{slug}.quotation.com` + credentials
4. Événement `created` loggé

### 3.5 Gestion des suspensions

**Suspension automatique** (cron job quotidien) :
- J-7 avant expiration → email de rappel au tenant (1er rappel)
- J-3 avant expiration → 2ème rappel
- J-1 avant expiration → rappel urgent
- J0 expiration + pas de paiement → statut `suspended` (lecture seule pour le tenant)
- Middleware bloc toutes les mutations du tenant suspendu
- Page d'erreur : "Votre abonnement a expiré. Contactez [owner contact] pour renouveler."

**Période de grâce** (configurable, défaut 7 jours) :
- Pendant la grâce : accès maintenu mais bannière d'alerte persistante dans l'app client
- Après la grâce : suspension effective

**Suspension manuelle par owner** :
- Motif obligatoire (dropdown : non-paiement / fraude / demande client / autre)
- Notification email automatique au tenant suspendu
- Événement loggé

**Réactivation** :
- Owner clique "Réactiver" sur la fiche tenant
- Sélectionne ou enregistre le paiement correspondant
- Statut → `active`, date expiration mise à jour
- Notification email au tenant

### 3.6 Notifications & rappels (`/owner/settings/notifications`)

Configuration des emails automatiques :
- Templates des emails de rappel (J-7, J-3, J-1, expiration, bienvenue, suspension, réactivation)
- Adresse d'expéditeur
- Activer/désactiver chaque type de rappel
- Historique des emails envoyés par tenant

### 3.7 Rapports & comptabilité (`/owner/reports`)

- **Rapport mensuel :** revenus par méthode de paiement, nb nouveaux tenants, churn, tenants actifs
- **Export paiements :** CSV/Excel de tous les paiements sur une période
- **Rapport tenants :** état de chaque tenant à une date donnée
- **Prévisions :** renouvellements attendus le mois prochain (liste + montant total)

### 3.8 Paramètres plateforme (`/owner/settings`)

- Prix des plans (mensuel / annuel par tier)
- Durée de la période de grâce (défaut 7j)
- Email de contact affiché aux tenants suspendus
- Message personnalisé page de suspension
- Limites de quotas par plan (nb utilisateurs, nb devis/mois)

---

## 4. Enforcement côté tenant

### Middleware de vérification tenant

Chaque requête d'un tenant passe par :

```
1. Résolution sous-domaine → tenant_id
2. Lecture statut tenant en cache (Redis ou DB, TTL 5 min)
3. Si status = 'suspended' | 'cancelled' → redirect /subscription-expired
4. Si subscription_end < now() + grace → bannière d'alerte (mais accès maintenu)
5. Si subscription_end < now() → suspend automatiquement + redirect
```

### Page `/subscription-expired`

Affichée aux tenants suspendus :
- Message : "Votre abonnement Quotation Logistique a expiré."
- Date d'expiration
- Contact owner (WhatsApp / email)
- Données conservées, aucune suppression

---

## 5. Flux de paiement détaillé

### Flux mobile money (Wave / Nitta / Amana)

```
1. Client contacte owner (WhatsApp/appel/email)
2. Owner envoie montant + numéro de compte (Wave/Nitta/Amana)
3. Client effectue le transfert
4. Owner vérifie la réception dans son app Wave/Nitta/Amana
5. Owner ouvre /owner/tenants/[id]
6. Clique "Enregistrer un paiement"
7. Saisit : méthode, référence transaction, montant, période
8. Coche "Réactiver si suspendu"
9. Valide → tenant activé, email envoyé au client
```

### Flux Stripe (international)

```
1. Client va sur /checkout (page publique)
2. Choisit plan + cycle
3. Paiement Stripe
4. Webhook Stripe → /api/webhooks/stripe
5. Webhook crée/active tenant automatiquement
6. Email de bienvenue automatique
```

---

## 6. Mapping BMAD — Epic 7 proposé

**Titre :** `Epic 7: Owner Panel & Gestion des abonnements SaaS`  
**Phase :** Post-MVP (déploiement SaaS)  
**Dépendances :** Epic 1 (auth/rôles), Epic 6.2 (quota enforcement)

### Stories candidates

| ID | Titre | Priorité |
|----|-------|----------|
| 7.1 | Schema tenants + middleware subdomain routing | P0 |
| 7.2 | Dashboard overview owner + liste tenants | P0 |
| 7.3 | Création manuelle tenant + email bienvenue | P0 |
| 7.4 | Enregistrement paiement (mobile money) | P0 |
| 7.5 | Suspension manuelle + page expiration tenant | P0 |
| 7.6 | Cron expiration + rappels automatiques | P1 |
| 7.7 | Fiche tenant complète (onglets) | P1 |
| 7.8 | Réactivation après paiement | P1 |
| 7.9 | Gestion utilisateurs par tenant | P1 |
| 7.10 | Intégration Stripe (webhook auto-activation) | P2 |
| 7.11 | Rapports & export comptabilité | P2 |
| 7.12 | Paramètres plateforme (prix, quotas, grace period) | P2 |

---

## 7. Décisions recommandées

| Question | Décision MVP | Rationale |
|----------|--------------|-----------|
| Prix des plans | **Free : 0 FCFA/mois** (démo interne ou très petit client, 1 utilisateur, quotas stricts)<br>**Pro : 25 000 FCFA/mois** ou **250 000 FCFA/an**<br>**Enterprise : 75 000 FCFA/mois** ou **750 000 FCFA/an** | Prix simples à expliquer, compatibles avec paiement mobile money, et remise annuelle équivalente à 2 mois offerts. Free sert surtout d'acquisition/test, pas de plan commercial principal. |
| Durée trial par défaut | **14 jours** | 7 jours est souvent trop court pour tester un outil métier; 30 jours retarde trop la conversion. 14 jours donne assez de temps pour créer des devis réels sans allonger inutilement le cycle de vente. |
| Nb max d'utilisateurs par plan | **Free : 1 utilisateur**<br>**Pro : 5 utilisateurs**<br>**Enterprise : 20 utilisateurs par défaut**, extensible manuellement par le owner | Limites faciles à comprendre et à appliquer. Enterprise reste flexible pour les clients plus grands sans complexifier le pricing MVP. |
| Suspension | **Lecture seule pour non-paiement après période de grâce** : connexion autorisée, consultation/export autorisés, créations/modifications bloquées.<br>**Blocage total uniquement pour fraude, annulation définitive ou risque sécurité.** | La lecture seule protège les données du client et réduit les conflits commerciaux, tout en bloquant l'usage opérationnel tant que le paiement n'est pas régularisé. |
| Notifications SMS | **Pas en MVP. Emails + contact WhatsApp manuel.** Prévoir SMS/WhatsApp automatisé en V2 si un fournisseur fiable est choisi. | Les SMS ajoutent du coût, de la configuration et des risques de délivrabilité. Pour le MVP, les rappels email et le suivi owner manuel suffisent. |
| Self-service registration | **Phase 2** pour l'inscription + paiement Stripe. Garder la création manuelle owner en MVP. | Le provisioning manuel réduit les risques au lancement. Le self-service devient pertinent après validation du pricing, du workflow tenant et des paiements. |
| Stripe | **EUR comme devise principale Stripe**, USD seulement si besoin international spécifique. Les prix XOF restent la référence commerciale locale. | Le FCFA est arrimé à l'euro, donc l'EUR est plus lisible pour convertir les prix XOF. USD ajoute plus de variation de change pour les clients locaux/régionaux. |

### Paramètres retenus pour Epic 7

```ts
const DEFAULT_TRIAL_DAYS = 14
const DEFAULT_GRACE_PERIOD_DAYS = 7

const PLAN_LIMITS = {
  free: { maxUsers: 1 },
  pro: { maxUsers: 5 },
  enterprise: { maxUsers: 20 },
}

const PLAN_PRICES_XOF = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 25000, annual: 250000 },
  enterprise: { monthly: 75000, annual: 750000 },
}
```

---

## 8. Prochaines étapes

1. Valider ces paramètres business avec Maiga Tech Lab avant implémentation
2. Lancer `/bmad-sprint-planning` pour intégrer Epic 7 dans le sprint
3. Créer les stories via `/bmad-create-story` en commençant par 7.1 (schema + middleware)
