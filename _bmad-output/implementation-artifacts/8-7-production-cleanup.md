# Story 8.7: Nettoyage pré-production

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a opérateur de la plateforme,
I want que l'environnement de production ne contienne aucune donnée ou configuration de test,
so that le premier client réel n'ait aucune trace de la phase de développement/QA.

## Acceptance Criteria

1. **Given** les comptes et tenants créés pendant la passe de test QA (`qa-owner@maigatechlab.test`, `sahel-admin@…`, tenants "QA Transit SARL" (Free, cycle complet créé→suspendu→réactivé→annulé) et "Sahel Cargo Express SARL" (Pro, actif, avec `kadi.commercial@…` et `moussa.operateur@…`)), **when** je prépare la base de production, **then** ces comptes/tenants n'existent pas en base de production (nouvelle base ou nettoyage explicite avant bascule, jamais un dump de la base de dev).
2. **Given** les variables d'environnement requises en production (`env.example`), **when** je déploie en production, **then** `RESEND_API_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `BETTER_AUTH_SECRET` (valeur unique de prod, jamais celle de dev), `POSTGRES_URL` (instance de prod) et les clés Stripe live sont toutes configurées et vérifiées via `pnpm env:check` ou équivalent.
3. **Given** le premier superadmin de production, **when** je crée ce compte, **then** il est créé via un mot de passe fort dédié, distinct de tout compte QA, et le script `scripts/create-superadmin.ts` (ou équivalent non-interactif) est utilisé plutôt qu'un compte laissé par erreur en base.

## Tasks / Subtasks

- [ ] Task 1 — Étendre `serverEnvSchema`/`checkEnv()` (`src/lib/env.ts`) pour couvrir les variables critiques de prod (AC: #2)
  - [ ] Ajouter à `serverEnvSchema` : `RESEND_API_KEY` (obligatoire quand `NODE_ENV === "production"`, optionnel sinon — utiliser `.superRefine()` ou un schema conditionnel, ne pas casser le dev où la clé est vide par design), `EMAIL_FROM` (requis avec `RESEND_API_KEY`), `CRON_SECRET` (obligatoire en production), `NEXT_PUBLIC_SENTRY_DSN` (optionnel mais validé si présent — appartient en réalité à `clientEnvSchema` puisqu'il est `NEXT_PUBLIC_*`), `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` (obligatoires en production, cf. Story 7-10).
  - [ ] Ce gap est documenté dans les Dev Notes de Story 8.2 (ligne ~164-166, `8-2-transactional-email-verification.md`) et Story 8.3 (ligne ~172-174, `8-3-cron-expiry-reminders-verification.md`) : `serverEnvSchema` ne référence aujourd'hui NI `RESEND_API_KEY` NI `CRON_SECRET`, alors que `src/lib/email.ts` et `src/app/api/cron/expiry-reminders/route.ts` font chacun leur propre check runtime (throw à l'appel, pas au boot). Le but de cette tâche est de fermer ce gap au niveau du schema Zod centralisé pour qu'un seul `pnpm env:check` avant déploiement suffise.
  - [ ] Ne PAS rendre ces champs obligatoires inconditionnellement dans `serverEnvSchema` — cela casserait le dev local où `RESEND_API_KEY`/`STRIPE_SECRET_KEY` sont volontairement vides (fallback console.log / mode test). Utiliser une validation conditionnelle sur `NODE_ENV` (voir pattern dans Dev Notes ci-dessous).
  - [ ] Mettre à jour `checkEnv()` en cohérence : avertissement en dev si absent, erreur bloquante si `NODE_ENV === "production"` et absent.
  - [ ] Ajouter un test unitaire `src/lib/env.test.ts` (nouveau fichier — n'existe pas encore) couvrant : dev sans ces clés → OK ; production sans `RESEND_API_KEY`/`CRON_SECRET`/`STRIPE_SECRET_KEY` → throw ; production avec toutes les clés → OK.
- [ ] Task 2 — Réparer le script `pnpm env:check` (AC: #2)
  - [ ] `package.json` ligne 19 : `"env:check": "node -e \"require('./src/lib/env.ts').checkEnv()\" || echo '...'"` — cette commande est cassée : `node -e require(...)` ne peut pas charger un fichier `.ts` directement (pas de transpilation), donc `pnpm env:check` échoue systématiquement aujourd'hui (à vérifier en l'exécutant : `pnpm env:check`).
  - [ ] Remplacer par un script fonctionnel utilisant `tsx` (déjà utilisé par `pnpm superadmin` ligne 18) : `"env:check": "npx tsx -e \"import { checkEnv } from './src/lib/env'; checkEnv();\""` (ou créer `scripts/env-check.ts` dédié si plus lisible, à la discrétion du dev).
  - [ ] Vérifier manuellement que la commande corrigée s'exécute sans erreur en local (`pnpm env:check`) et détecte bien un `POSTGRES_URL`/`BETTER_AUTH_SECRET` manquant (test négatif rapide en renommant temporairement `.env`, ne pas committer ce changement).
- [ ] Task 3 — Documenter la checklist de nettoyage pré-bascule production (AC: #1, #3)
  - [ ] Ajouter une section dans `Docs/testing/test-plan.md` (ou nouveau `Docs/ops/go-live-checklist.md` si plus approprié — vérifier convention existante dans `Docs/` avant de choisir) listant explicitement : les comptes/tenants QA à ne PAS retrouver en prod (`qa-owner@maigatechlab.test`, `sahel-admin@…`, `kadi.commercial@…`, `moussa.operateur@…`, tenants "QA Transit SARL", "Sahel Cargo Express SARL"), la variable d'environnement de chacune des clés listées en AC#2 avec sa source (Stripe Dashboard, Resend Dashboard, Sentry, `openssl rand -hex 32` pour `CRON_SECRET`/`BETTER_AUTH_SECRET`), et la procédure de création du superadmin de prod (Task 4).
  - [ ] Confirmer explicitement (documenter la décision) : la base de production est une **base neuve** (migrations appliquées via `pnpm db:migrate` sur une instance PostgreSQL vierge), jamais un dump/clone de la base de dev/QA — c'est la voie la plus sûre pour satisfaire AC#1 sans risque d'oubli d'un enregistrement de test.
  - [ ] Si une base partagée dev/QA/prod existait déjà (à vérifier — voir Dev Notes), documenter la requête SQL de nettoyage ciblé (delete des tenants par `id`/`slug` connus, cascade sur `user`, `company`, etc.) comme filet de sécurité, mais la recommandation reste une base neuve.
- [ ] Task 4 — Vérifier/adapter `scripts/create-superadmin.ts` pour un usage non-interactif fiable en CI/déploiement (AC: #3)
  - [ ] Le script existant est **interactif** (prompts `readline` pour email/password, voir lignes 20-50). Il fonctionne pour une création manuelle en local via `pnpm superadmin`, mais l'AC demande "un script non-interactif équivalent" comme option. Décider et documenter dans Completion Notes : soit (a) le script interactif existant est jugé suffisant pour une création manuelle unique en prod (recommandé — pas de sur-ingénierie pour un cas d'usage one-shot), soit (b) ajouter un mode non-interactif via variables d'env (`SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` lues si présentes, sinon fallback aux prompts).
  - [ ] Si (b) est choisi : ne JAMAIS committer de mot de passe en dur, ne jamais logger le mot de passe en clair (le script actuel ne le fait pas — vérifier que toute modification préserve ce comportement).
  - [ ] Documenter la commande finale à exécuter pour créer le superadmin de prod (`pnpm superadmin` avec `.env` pointant vers `POSTGRES_URL` de production, exécuté depuis un poste sécurisé, jamais via un pipeline CI qui logguerait la sortie).
- [ ] Task 5 — Valider par la suite de tests complète (AC: #2)
  - [ ] `pnpm check` (lint + typecheck + vitest, incluant le nouveau `env.test.ts`) doit passer.
  - [ ] `pnpm build` doit rester vert (le `db:migrate` du build ne doit pas échouer si les nouvelles validations `env.ts` sont correctement conditionnées au `NODE_ENV`).

## Dev Notes

### Contexte : pourquoi cette story existe

Cette story ferme des gaps **explicitement différés** par les stories 8.2 et 8.3 (vérification manuelle, pas de développement de feature) :
- Story 8.2 (`8-2-transactional-email-verification.md`, Dev Notes ligne 164-166, 185) : `serverEnvSchema` ne valide pas `RESEND_API_KEY`/`EMAIL_FROM`. Le garde-fou existant (`src/lib/email.ts`, throw runtime "RESEND_API_KEY is required for production email delivery") ne se déclenche qu'au premier envoi d'email en prod, pas au boot.
- Story 8.3 (`8-3-cron-expiry-reminders-verification.md`, Dev Notes ligne 172-174, 97) : même gap pour `CRON_SECRET` — validé uniquement dans le handler `route.ts` (401/500 runtime), pas dans `serverEnvSchema`.
- Les deux stories précédentes ont volontairement **documenté sans corriger**, en renvoyant explicitement à cette story 8.7.

Cette story ajoute aussi deux findings **non signalés dans 8.2/8.3** découverts pendant l'analyse de préparation, à traiter dans le même effort puisqu'ils touchent le même fichier/mécanisme :
1. `pnpm env:check` (package.json ligne 19) est **actuellement cassé** — `node -e require('./src/lib/env.ts')` ne peut pas fonctionner (pas de transpilation TS par `node` natif). L'AC#2 mentionne explicitement `pnpm env:check ou équivalent` comme méthode de vérification : il doit donc être rendu fonctionnel dans le cadre de cette story.
2. `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` ne sont pas non plus dans `serverEnvSchema` (même famille de gap), et l'AC#2 les mentionne explicitement ("clés Stripe live").

### Fichier central : `src/lib/env.ts`

État actuel (lu intégralement) :
```typescript
const serverEnvSchema = z.object({
  POSTGRES_URL: z.string().url("Invalid database URL"),
  BETTER_AUTH_SECRET: z.string().min(32, "..."),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-5-mini"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});
```
`getServerEnv()` throw si `safeParse` échoue. `checkEnv()` est une fonction séparée, plus permissive (warnings au lieu de throw pour les optionnels), **actuellement non appelée nulle part dans l'app** (seul `scripts/setup.ts` a sa propre fonction locale `checkEnvVariables()`, indépendante — ne pas confondre les deux, ne pas fusionner sans que ce soit demandé).

**Pattern recommandé pour la validation conditionnelle par `NODE_ENV`** (Zod ne supporte pas nativement "requis seulement si production" dans un objet plat — utiliser `.superRefine()`) :
```typescript
const serverEnvSchema = z
  .object({
    // ... champs existants ...
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.RESEND_API_KEY) {
        ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "RESEND_API_KEY is required in production" });
      }
      // ... répéter pour EMAIL_FROM, CRON_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
    }
  });
```

`NEXT_PUBLIC_SENTRY_DSN` appartient à `clientEnvSchema` (préfixe `NEXT_PUBLIC_*`), pas `serverEnvSchema` — suivre la convention déjà en place (`NEXT_PUBLIC_APP_URL` y est déjà). Le rendre optionnel mais documenté (Sentry peut être désactivé volontairement).

### `env.example` — déjà à jour, aucune modification attendue

Toutes les variables mentionnées en AC#2 sont déjà documentées dans `env.example` avec commentaires (RESEND_API_KEY, CRON_SECRET avec `openssl rand -hex 32`, STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_SENTRY_DSN). Cette story ne touche PAS `env.example` — le gap est uniquement dans la validation Zod (`env.ts`), pas dans la documentation.

### `scripts/create-superadmin.ts` — déjà codé, interactif

Script existant, lu intégralement : interactif (`readline`, prompts email + password masqué), commande `pnpm superadmin` (`npx tsx --env-file=.env scripts/create-superadmin.ts`). Gère déjà le cas "utilisateur existant → proposer promotion en superadmin" (voir lignes 65-80). Ne pas réécrire depuis zéro — évaluer si l'ajout d'un mode non-interactif est nécessaire (Task 4) ou si le script interactif suffit pour un usage one-shot en déploiement.

### Comptes/tenants QA à ne pas retrouver en production (Docs/testing/test-plan.md lignes 144-159)

```
Owner/superadmin QA : qa-owner@maigatechlab.test
Tenant "QA Transit SARL" (Free) — cycle complet créé → suspendu → réactivé → annulé (terminal)
Tenant "Sahel Cargo Express SARL" (Pro) — actif, admin sahel-admin@…,
  utilisateurs kadi.commercial@… (commercial), moussa.operateur@… (opérateur)
```
Aucun de ces identifiants n'apparaît dans un script de seed committé (vérifié — recherche `qa-owner|sahel-admin|QA Transit|Sahel Cargo` dans le repo : uniquement dans `Docs/testing/test-plan.md` et `tutorial-e2e-walkthrough.md`). Ils ont été créés manuellement via l'UI pendant la passe de test E2E, probablement dans une base de dev/staging partagée — confirmer avec l'opérateur plateforme quelle base a servi à ces tests avant de décider entre "base neuve" et "nettoyage ciblé" (Task 3).

### Architecture Compliance

- Ne pas introduire de nouvelle table ni de migration Drizzle — cette story est de la configuration/validation, pas un changement de schéma DB.
- Respecter le pattern TypeScript strict existant (`exactOptionalPropertyTypes`) lors de l'ajout de champs `.optional()` dans les schemas Zod.
- Ne pas dupliquer la logique déjà présente dans `src/lib/email.ts` (throw runtime) ou `route.ts` du cron — cette story ajoute une couche de validation **au boot** en complément, pas un remplacement ; les deux garde-fous (boot + runtime) peuvent coexister.

### Testing Requirements

- Nouveau fichier `src/lib/env.test.ts` (Vitest) : cas dev (OK sans clés optionnelles), cas production (throw si `RESEND_API_KEY`/`CRON_SECRET`/`STRIPE_SECRET_KEY` manquants, OK si toutes présentes). Utiliser `vi.stubEnv()` ou manipulation directe de `process.env` dans le test avec restauration en `afterEach`.
- `pnpm check` doit rester vert — seul critère de complétion technique vérifiable en CI pour cette story (le reste, AC#1 et AC#3, est procédural/documentaire et vérifié manuellement par l'opérateur plateforme, pas par un test automatisé).

### Project Structure Notes

- Fichier principal modifié : `src/lib/env.ts` (Task 1).
- Fichier modifié : `package.json` ligne 19 (`env:check` script, Task 2).
- Nouveau fichier : `src/lib/env.test.ts` (Task 1/5).
- Documentation : `Docs/testing/test-plan.md` ou nouveau `Docs/ops/go-live-checklist.md` (Task 3) — vérifier la convention existante dans `Docs/` (sous-dossiers `Docs/business/`, `Docs/testing/` déjà en place) avant de créer un nouveau sous-dossier.
- `scripts/create-superadmin.ts` : modification conditionnelle seulement si Task 4 opte pour un mode non-interactif (option b).
- Cette story ne touche PAS : `env.example` (déjà complet), le schéma Drizzle, les routes API existantes (`email.ts`, `cron/expiry-reminders/route.ts` gardent leurs checks runtime existants intacts).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.7] — AC et objectif de la story
- [Source: src/lib/env.ts] — schema Zod actuel (`serverEnvSchema`, `clientEnvSchema`, `checkEnv()`), lu intégralement, gap confirmé pour `RESEND_API_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [Source: package.json#scripts.env:check ligne 19] — commande actuellement cassée (`node -e require('*.ts')`)
- [Source: env.example] — toutes les variables de production déjà documentées, aucune modification attendue
- [Source: scripts/create-superadmin.ts] — script existant, interactif, `pnpm superadmin`
- [Source: _bmad-output/implementation-artifacts/8-2-transactional-email-verification.md#Dev Notes, lignes 164-185] — gap `RESEND_API_KEY` documenté et différé explicitement à cette story
- [Source: _bmad-output/implementation-artifacts/8-3-cron-expiry-reminders-verification.md#Dev Notes, lignes 97, 168-174] — gap `CRON_SECRET` documenté et différé explicitement à cette story
- [Source: Docs/testing/test-plan.md, lignes 144-159] — liste exhaustive des comptes/tenants QA créés pendant la passe de test E2E, à ne pas retrouver en production
- [Source: memory email-delivery-setup] — RESEND_API_KEY vide en dev intentionnel ; Resend test-mode limité à maigatechlab@gmail.com ; vérifier le domaine avant de restaurer la clé

## Dev Agent Record

### Agent Model Used

TBD (à renseigner par l'agent dev lors de l'implémentation)

### Debug Log References

### Completion Notes List

### File List
