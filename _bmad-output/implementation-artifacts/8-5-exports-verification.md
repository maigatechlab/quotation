# Story 8.5: Vérification des exports (rapports, paiements, audit)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a admin plateforme ou tenant,
I want que tous les boutons d'export produisent des fichiers corrects et complets,
so that je peux réellement utiliser ces exports pour la comptabilité et la conformité.

## Acceptance Criteria

1. **Given** `GET /api/v1/owner/reports/tenants/export` et `GET /api/v1/owner/reports/payments/export` **When** je déclenche l'export CSV depuis l'UI owner (`/owner/reports`) **Then** le fichier téléchargé s'ouvre correctement dans Excel/LibreOffice, contient les colonnes attendues et les données correspondent à ce qui est affiché à l'écran (pas de troncature, encodage correct pour les caractères accentués).
2. **Given** `GET /api/v1/owner/tenants/export` (bouton "Exporter CSV" sur `/owner/tenants`, filtré par `TenantFilters`) **When** je déclenche l'export depuis la liste des tenants **Then** le fichier reflète bien les filtres actifs (status, plan, expiry, paymentMethod, dates, recherche `q`) et les données correspondent à la liste affichée à l'écran.
3. **Given** `GET /api/v1/audit/export` (Story 6.3) **When** un admin tenant exporte le journal d'audit en JSON et en CSV **Then** les deux formats contiennent les mêmes événements filtrés par `companyId`/plage de dates, le CSV a un encodage correct (accents, BOM UTF-8) et le JSON est ré-importable/parsable (structure `AuditRow[]`, `before`/`after` en JSON stringifié valide).

## Tasks / Subtasks

- [ ] Task 1 — Vérifier l'export CSV rapports owner (tenants snapshot + paiements) (AC: #1)
  - [ ] Se connecter en tant que superadmin (`requireOwnerSession`), aller sur `/owner/reports` (`src/app/owner/reports/page.tsx`)
  - [ ] Déclencher l'export "snapshot tenants" (bouton lié à `GET /api/v1/owner/reports/tenants/export`, `src/app/api/v1/owner/reports/tenants/export/route.ts`) → vérifier colonnes `name,slug,plan,status,subscriptionStart,subscriptionEnd,maxUsers` (`SNAPSHOT_HEADERS`, `src/lib/owner/reports-csv.ts` ligne 18), ouvrir le fichier dans Excel/LibreOffice et confirmer que les accents (raison sociale, etc.) s'affichent correctement (BOM UTF-8 déjà présent, ligne 69) et que les dates sont au format `YYYY-MM-DD`
  - [ ] Sur `PaymentsExportSection` (`src/components/owner/reports/payments-export-section.tsx`) + `DateRangePicker`, sélectionner une plage `from`/`to` valide et déclencher `GET /api/v1/owner/reports/payments/export` (`src/app/api/v1/owner/reports/payments/export/route.ts`) → vérifier colonnes `date,tenant,slug,method,amount,currency,reference,periodStart,periodEnd,billingCycle,confirmedBy,notes` (`PAYMENTS_HEADERS`, `reports-csv.ts` ligne 3) et que les montants/tenants correspondent à ce qui est affiché à l'écran pour la même plage
  - [ ] Tester les cas d'erreur : `from`/`to` manquants ou invalides → `VALIDATION_FAILED` 400 (déjà codé, `validateDateRange`, `src/lib/owner/reports.ts`) ; confirmer que l'UI affiche un message clair plutôt qu'un échec silencieux
  - [ ] Vérifier le comportement à la limite de 10 000 lignes (`rows.length >= 10_000` → `console.warn`, route.ts ligne 35-37) — si un jeu de données de test suffisamment grand est disponible, sinon documenter que ce cas n'a pas pu être testé en conditions réelles et pourquoi
- [ ] Task 2 — Vérifier l'export CSV liste des tenants filtrée (AC: #2)
  - [ ] Sur `/owner/tenants`, appliquer plusieurs combinaisons de filtres (status, plan, expiry, paymentMethod, dates de création, recherche texte `q`) via `TenantFilters` (`src/lib/owner/tenant-filters.ts`)
  - [ ] Cliquer le bouton "Exporter CSV" (`src/components/owner/tenants-export-button.tsx`) qui appelle `GET /api/v1/owner/tenants/export?...` (`src/app/api/v1/owner/tenants/export/route.ts`, `buildTenantsCsv`/`fetchTenantsPage`, `src/lib/owner/csv.ts` + `tenant-filters.ts`)
  - [ ] Confirmer que le fichier exporté contient exactement les tenants visibles à l'écran pour ces filtres (même ordre/tri si applicable), pas de tenant en trop ni manquant, encodage correct
  - [ ] Noter la distinction : cet endpoint (`/api/v1/owner/tenants/export`, filtré, `EXPORT_MAX=10_000`) est différent de l'endpoint "snapshot" de Task 1 (`/api/v1/owner/reports/tenants/export`, non filtré) — ne pas les confondre, vérifier les deux séparément
- [ ] Task 3 — Vérifier l'export du journal d'audit tenant (JSON + CSV) (AC: #3)
  - [ ] Se connecter en tant qu'admin d'une company (rôle `admin`, requis par la route), aller dans Paramètres → onglet audit (`AuditExport`, `src/components/settings/audit-export.tsx`)
  - [ ] Générer plusieurs événements d'audit réels au préalable si le jeu de données est trop vide (créer/modifier un client, un devis, changer un statut — chaque action émet un `emitAuditEvent`)
  - [ ] Exporter en JSON (`GET /api/v1/audit/export?format=json&from=...&to=...`) → vérifier que le fichier est un tableau JSON valide, ré-importable (`JSON.parse` sans erreur), et que chaque événement contient `id,who,what,when,where,entityType,entityId,before,after,createdAt` scopé au `companyId` de l'admin connecté
  - [ ] Exporter en CSV (`format=csv`) → ouvrir dans Excel/LibreOffice, vérifier les mêmes colonnes (`buildCsv`, `src/app/api/v1/audit/export/route.ts` lignes 13-44), le BOM UTF-8 (accents corrects), et que `before`/`after` (JSON stringifié échappé) restent lisibles/parsables cellule par cellule
  - [ ] Confirmer que JSON et CSV pour la même plage de dates contiennent le même nombre d'événements et les mêmes IDs (pas de divergence entre les deux formats)
  - [ ] Vérifier le comportement cross-tenant : un admin d'une autre company ne doit voir/exporter QUE ses propres événements (`eq(auditEvent.companyId, companyId)`, ligne 71) — tester avec 2 comptes admin de companies différentes
  - [ ] Concernant la mention "rétention 7 ans" affichée dans l'UI (`src/messages/fr-NE.json` ligne 439, `parametres.audit.description`) : **il n'existe aucun job de purge/rétention codé** — c'est une promesse de conservation (les événements ne sont jamais supprimés), pas un mécanisme actif de rétention à vérifier techniquement. Documenter cette clarification plutôt que chercher un mécanisme de purge inexistant.
- [ ] Task 4 — Documenter les résultats et bugs trouvés (toutes AC)
  - [ ] Mettre à jour `Docs/testing/test-plan.md` ligne 149 ("Export CSV/Excel... téléchargement non vérifié fichier par fichier") pour refléter le résultat de cette vérification
  - [ ] Si un bug est trouvé (ex. troncature, mauvais encodage, colonne manquante, filtre non appliqué), le corriger précisément dans le fichier concerné et ajouter un test de non-régression Vitest (voir fichiers `*.test.ts` existants comme modèle), puis consigner dans la section "Bugs trouvés et corrigés" de `test-plan.md`

## Dev Notes

- **Nature de la story : vérification manuelle des exports déjà codés, pas de nouvelle feature.** Toute la logique CSV/JSON existe et est déjà couverte par des tests unitaires (`src/lib/owner/reports-csv.test.ts`, `src/lib/owner/csv.test.ts`, `src/app/api/v1/audit/export/route.test.ts`). Ne pas réimplémenter — seulement vérifier en conditions réelles (vrai navigateur, vrai Excel/LibreOffice, vraies données) que ce que les tests unitaires valident en isolation fonctionne aussi bout-en-bout (rendu UI, téléchargement navigateur, ouverture fichier).
- **Trois endpoints d'export tenants/paiements distincts à ne pas confondre :**
  - `GET /api/v1/owner/reports/tenants/export` — snapshot complet non filtré (`fetchTenantsSnapshot`, page 1, jusqu'à 10 000 lignes), colonnes `SNAPSHOT_HEADERS`
  - `GET /api/v1/owner/reports/payments/export` — paiements sur une plage de dates (`fetchPaymentsForExport`), colonnes `PAYMENTS_HEADERS`
  - `GET /api/v1/owner/tenants/export` — liste des tenants **filtrée** (mêmes filtres que la page `/owner/tenants`, `TenantFilters`), colonnes différentes (`buildTenantsCsv` dans `src/lib/owner/csv.ts`, pas `reports-csv.ts`)
- **Tous les CSV owner + audit utilisent un BOM UTF-8 (`"﻿"`) en préfixe** — ne jamais le retirer, c'est requis pour Excel dans la région Niger/AES (déjà une règle du projet, voir `project-context.md`).
- **Formats de date dans les CSV :** toujours `YYYY-MM-DD` (`toIsoDateOnly`), jamais de format localisé — cohérent avec le reste du projet.
- **`requireOwnerSession()`** protège les 3 routes `owner/**` — retourne `{ ok: false, code: "UNAUTHORIZED" | "FORBIDDEN" }` sinon ; `GET /api/v1/audit/export` utilise un contrôle différent (`session.user.role !== "admin"` + `companyId` requis) car c'est une route tenant, pas owner — ne pas mélanger les deux mécanismes de garde pendant la vérification.
- **Limite d'export : 10 000 lignes** sur les 4 endpoints (`EXPORT_LIMIT`/`EXPORT_MAX`). Au-delà, troncature silencieuse côté owner reports (juste un `console.warn` serveur, rien côté utilisateur) — si ce comportement est jugé insuffisant pendant la vérification, le documenter comme limitation connue plutôt que le corriger hors scope (ce n'est pas un bug, c'est une limite MVP documentée).
- **Mention "rétention 7 ans" (fr-NE.json) est une promesse de non-suppression, pas un mécanisme actif** — `auditEvent` est une table append-only sans job de purge ni colonne d'expiration (voir commentaire schema.ts ligne 476 : "append-only — no revision, no updatedAt"). Ne pas chercher/créer de logique de rétention.
- **Ne pas réinventer :** `buildPaymentsCsv`/`buildTenantsSnapshotCsv` (`src/lib/owner/reports-csv.ts`), `buildTenantsCsv` (`src/lib/owner/csv.ts`), `buildCsv` (inline dans `src/app/api/v1/audit/export/route.ts`) sont déjà testés unitairement — ne les modifier qu'en cas de bug réel confirmé pendant cette vérification manuelle.

### Fichiers pertinents (ne pas modifier sauf bug confirmé)

- `src/app/api/v1/owner/reports/tenants/export/route.ts`, `src/app/api/v1/owner/reports/payments/export/route.ts`, `src/app/api/v1/owner/tenants/export/route.ts` — les 3 endpoints d'export owner
- `src/app/api/v1/audit/export/route.ts` — export audit tenant (JSON + CSV)
- `src/lib/owner/reports.ts` — `fetchTenantsSnapshot`, `fetchPaymentsForExport`, `validateDateRange`, `isValidDateParam`
- `src/lib/owner/reports-csv.ts` — `buildPaymentsCsv`, `buildTenantsSnapshotCsv`
- `src/lib/owner/csv.ts` — `buildTenantsCsv` (export liste filtrée)
- `src/lib/owner/tenant-filters.ts` — `parseTenantFilters`, `fetchTenantsPage`, type `TenantFilters`
- `src/components/owner/reports/payments-export-section.tsx`, `src/components/owner/reports/date-range-picker.tsx` (si présent) — UI export paiements
- `src/components/owner/tenants-export-button.tsx` — UI export tenants filtré
- `src/components/settings/audit-export.tsx` — UI export audit tenant
- `src/app/owner/reports/page.tsx` — page rapports owner
- `src/lib/session.ts` — `requireOwnerSession`
- Tests existants (référence, ne pas dupliquer) : `src/lib/owner/reports-csv.test.ts`, `src/lib/owner/csv.test.ts`, `src/lib/owner/reports.test.ts`, `src/app/api/v1/audit/export/route.test.ts`

### Project Structure Notes

- Aucun nouveau fichier de code attendu — vérification manuelle documentée dans `Docs/testing/test-plan.md`. Si un bug est corrigé, rester dans les fichiers listés ci-dessus et suivre l'organisation existante (`src/lib/owner/`, `src/app/api/v1/owner/`, `src/app/api/v1/audit/`).
- Toute correction de bug doit s'accompagner d'un test Vitest de non-régression dans le fichier `*.test.ts` correspondant déjà existant.

### Testing Standards Summary

- Cette story est elle-même une vérification manuelle E2E des exports — pas de nouveaux tests automatisés requis sauf si un bug est corrigé, auquel cas suivre les conventions Vitest existantes (fichiers `*.test.ts` cités ci-dessus comme modèle).
- `pnpm check` (lint + typecheck + vitest) doit rester vert après toute correction de bug.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.5: Vérification des exports (rapports, paiements, audit)] (lignes 1158-1172)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8: Préparation Go-Live] (lignes 1078-1080, contexte déclencheur)
- [Source: Docs/testing/test-plan.md#Non couvert dans cette session] (ligne 149 — export CSV/Excel explicitement non vérifié fichier par fichier pendant la passe E2E du 2026-07-06)
- [Source: src/app/api/v1/owner/reports/tenants/export/route.ts] — export snapshot tenants
- [Source: src/app/api/v1/owner/reports/payments/export/route.ts] — export paiements par plage de dates
- [Source: src/app/api/v1/owner/tenants/export/route.ts] — export tenants filtré (distinct du snapshot)
- [Source: src/app/api/v1/audit/export/route.ts] — export audit tenant JSON/CSV
- [Source: src/lib/owner/reports-csv.ts, src/lib/owner/csv.ts] — construction CSV + BOM UTF-8
- [Source: src/messages/fr-NE.json#parametres.audit] (ligne 439 — mention "rétention 7 ans")
- [Source: src/lib/schema.ts#auditEvent] (ligne 476-498 — table append-only, pas de mécanisme de purge)
- [Source: _bmad-output/project-context.md] — règles projet transverses (CSV/BOM, API envelope, testing standards)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
