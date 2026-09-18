# Quotation Logistique

Application web de gestion de devis pour les transitaires, transporteurs et
commissionnaires en douane du Niger — et, à terme, de l'espace AES.

*A French-language SaaS for logistics quotations in West Africa. Multi-tenant,
offline-first, built for the Sahel.*

**Démo :** https://quotationlogistique.com

<!-- À AJOUTER : une capture d'écran du wizard de devis ou du PDF généré. -->

---

## Le problème

Un transitaire à Niamey produit ses devis à la main, dans un tableur ou un
document Word recopié d'un dossier à l'autre. Les calculs de tonnage, de
change et de droits de douane se refont à chaque fois. Le PDF part par mail
ou WhatsApp, et plus personne ne sait ensuite quel devis a été accepté,
lequel a expiré, ni ce qu'on avait facturé au même client six mois plus tôt.

L'application remplace ce circuit : on saisit le dossier une fois, les
montants se calculent, le PDF sort au format que le client reconnaît déjà,
et l'historique reste consultable par client et par commercial.

Elle est pensée pour des conditions réseau irrégulières. L'application
fonctionne hors ligne et resynchronise seule dès que la connexion revient.

---

## Ce que ça fait

- **Devis complets** — trajet, nature de la marchandise, tonnage, capacité
  camion, valeur commerciale, devise et taux de change, avec calcul
  automatique des totaux
- **Lignes de prestations réutilisables** — transport, carnet de transit,
  droits et taxes, frais phytosanitaires, traitement douanier, frais de service
- **Bibliothèque de clauses standards** et conditions de paiement par défaut,
  applicables en un clic depuis le wizard
- **Export PDF** au format proche du modèle papier existant, avec en-tête
  société, zone d'accord client, signature et cachet
- **Cycle de vie du devis** — brouillon, validé, envoyé, accepté, expiré,
  annulé — avec historique des changements de statut et duplication
- **Fonctionnement hors ligne** — saisie et consultation sans réseau,
  synchronisation en arrière-plan au retour de la connexion
- **Multi-société** — chaque client du service a son propre sous-domaine,
  ses données isolées, ses utilisateurs et son abonnement
- **Piste d'audit** exportable en CSV ou JSON, immuable, par société

---

## Architecture

| | |
|---|---|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript |
| **Base de données** | PostgreSQL (Neon) + Drizzle ORM |
| **Authentification** | Better Auth — sessions, clés API, rôles, pas d'inscription publique |
| **Multi-tenant** | Résolution par sous-domaine en middleware, isolation au niveau requête |
| **Hors ligne** | Serwist (service worker) + Dexie/IndexedDB chiffré au repos, sync en arrière-plan |
| **Paiement** | Stripe Checkout + webhooks, tarifs en XOF, quotas par palier |
| **PDF** | jsPDF + html2canvas |
| **Recherche** | FlexSearch, côté client |
| **i18n** | next-intl — interface entièrement en français |
| **Emails** | Resend (transactionnels : vérification, réinitialisation, expiration) |
| **Supervision** | Sentry (client, serveur, edge) |
| **Tâches planifiées** | Vercel Cron — expiration des devis et des abonnements |
| **Hébergement** | Vercel |

### Qualité

- **Vitest** pour les tests unitaires, avec `fake-indexeddb` pour la couche hors ligne
- **Playwright** pour les parcours end-to-end, dont des contrôles
  d'accessibilité via `@axe-core/playwright`
- **GitHub Actions** — lint, typecheck, tests, et un test de restauration
  automatisé contre une branche Neon (PITR)
- **Validation des variables d'environnement au démarrage** (`pnpm env:check`),
  en mode strict pour la production

---

## Installation

Prérequis : Node (voir `.nvmrc`), pnpm, et une instance PostgreSQL.

```bash
git clone https://github.com/maigatechlab/quotation.git
cd quotation
pnpm install
cp env.example .env     # puis renseigner les valeurs
pnpm db:migrate
pnpm dev
```

L'application tourne sur http://localhost:3000.

### Variables d'environnement

`env.example` liste l'ensemble. Le strict minimum pour démarrer :

| Variable | Rôle |
|---|---|
| `POSTGRES_URL` | Chaîne de connexion PostgreSQL |
| `BETTER_AUTH_SECRET` | **À générer** — ne jamais réutiliser une valeur d'exemple |
| `BETTER_AUTH_URL` | `http://localhost:3000` en développement |
| `NEXT_PUBLIC_APP_URL` | Idem |

En développement, les liens de vérification et de réinitialisation
s'affichent dans la console si `RESEND_API_KEY` n'est pas renseignée.

Pour tester le multi-tenant en local, mettre `SUBDOMAIN_DEV_MODE=1` et
passer l'en-tête `x-test-tenant-slug`, ou utiliser les URLs de la forme
`http://{slug}.localhost:3000`.

### Créer le compte propriétaire

```bash
pnpm superadmin
```

L'inscription publique est désactivée. Les sociétés sont créées depuis la
console propriétaire.

---

## Commandes

```bash
pnpm dev                     # serveur de développement (Turbopack)
pnpm check                   # lint + typecheck + tests unitaires
pnpm test:e2e                # parcours Playwright
pnpm env:check:production    # validation stricte des variables avant déploiement

pnpm db:generate             # générer une migration depuis src/lib/schema.ts
pnpm db:migrate              # l'appliquer
pnpm db:studio               # explorer la base
```

Pour toute évolution de schéma destinée à être conservée, passer par
`db:generate` puis `db:migrate` — `db:push` est réservé à l'expérimentation locale.

---

## Déploiement

Cible : Vercel. Variables requises en production, au-delà de celles du
développement : `APEX_DOMAIN` (pour la résolution des sous-domaines),
`CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Le runtime doit tourner en UTC — c'est le cas par défaut sur Vercel. En
auto-hébergement, exporter `TZ=UTC`, faute de quoi les calculs d'expiration
dérivent.

`pnpm build` applique les migrations avant la compilation. Si votre
plateforme ne doit pas migrer pendant le build, utiliser `build:ci` et
lancer les migrations comme étape séparée.

---

## Origine du projet

Le squelette initial vient du
[Agentic Coding Starter Kit](https://github.com/leonvanzyl/agentic-coding-starter-kit)
de Leon van Zyl (MIT) : configuration Next.js, Better Auth et Drizzle, plus
les fichiers d'instructions agent (`AGENTS.md`, `CLAUDE.md`, `DESIGN.md`).

Tout le reste — le domaine métier, le multi-tenant, la couche hors ligne,
la facturation, l'export PDF, la piste d'audit — a été construit pour ce projet.

Pour le starter kit lui-même, ses questions et son support, voir le dépôt d'origine.

---

## Licence

<!-- À DÉCIDER — voir les questions ouvertes du handoff. -->

---

Développé par [Maiga Tech Lab](https://github.com/maigatechlab) — Niamey / Calgary.
