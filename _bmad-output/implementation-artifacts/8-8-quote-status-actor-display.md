---
baseline_commit: "a5160545a7a3514250d974b21452264b01f23e26"
---

# Story 8.8 (mineure): Affichage lisible de l'acteur dans l'historique de statut des devis

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur consultant l'historique d'un devis,
I want voir le nom de la personne ayant changé le statut plutôt que son id technique,
so that l'historique soit lisible sans avoir à recouper avec la base de données.

## Acceptance Criteria

1. **Given** l'historique actuel affichant `De Brouillon vers Validé par <userId>` (id technique brut), **when** l'historique est affiché, **then** le nom (ou email si nom absent) de l'utilisateur est résolu et affiché à la place de l'id brut.
2. **Given** un utilisateur supprimé depuis (Story 7-9, suppression définitive), **when** son historique de transitions est consulté, **then** un libellé de repli lisible est affiché (ex: "Utilisateur supprimé") plutôt qu'une erreur ou un id orphelin.

## Tasks / Subtasks

- [x] Task 1 — Capturer un snapshot du nom de l'acteur au moment du changement de statut (AC: #1, #2)
  - [x] Dans `src/lib/local-db.ts`, ajouter un champ optionnel `changedByName?: string` à `QuoteStatusLogLocal` (ligne ~141-149). **Pas de bump de version Dexie nécessaire** — c'est un champ non indexé ajouté à un objet existant, pas un nouvel index/table (voir règle "Dexie Version Rules" du contexte projet).
  - [x] Dans `src/components/quote/status-change-sheet.tsx` (`handleSelectStatus`, ligne ~154-162), ajouter `changedByName: userName` à l'objet `statusLog` construit avant `db.quoteStatusLogs.put(statusLog)`.
  - [x] Ajouter la prop `userName: string` à `StatusChangeSheetProps` (à côté de `userId`, ligne ~28-34) et à l'appel du composant dans `src/components/pdf/quote-preview.tsx` (`QuotePreview` reçoit déjà `userId` en prop, ajouter `userName` de la même façon).
  - [x] Ajouter la prop `userName` à `QuotePreview` (`src/components/pdf/quote-preview.tsx`, interface `QuotePreviewProps` ligne ~27-31) et la propager à `<StatusChangeSheet userName={userName} .../>`.
  - [x] Dans `src/app/(app)/devis/[id]/page.tsx`, lire `session.user.name` (Better Auth `user.name`, déjà un champ standard — pas besoin d'`additionalFields`) et passer `userName={(session.user as Record<string, unknown>).name as string}` à `<QuotePreview>` en plus de `userId`.
- [x] Task 2 — Résoudre l'affichage pour les entrées existantes sans snapshot (legacy) et gérer le fallback utilisateur supprimé (AC: #1, #2)
  - [x] Dans `src/components/pdf/quote-preview.tsx`, au montage, appeler `GET /api/v1/users` **uniquement si le rôle courant a la permission `user.read`** (aujourd'hui : `admin` seulement — voir Dev Notes, "Piège de permission"). Construire une `Map<string, { name: string; email: string }>` à partir de la réponse.
  - [x] Écrire une fonction pure `resolveActorLabel(log: QuoteStatusLogLocal, usersById: Map<string, {name: string; email: string}>): string` (co-localisée dans `quote-preview.tsx` ou extraite dans un fichier `src/lib/quote-status-actor.ts` si testée unitairement) qui applique cet ordre de priorité :
    1. `log.changedByName` si présent (nouveau snapshot, AC1 — cas nominal après cette story) → retourner tel quel.
    2. Sinon, si `usersById.has(log.changedBy)` (legacy, utilisateur toujours actif) → retourner `name || email`.
    3. Sinon, si la Map a été chargée avec succès mais ne contient pas l'id → retourner le libellé "utilisateur supprimé" (AC2).
    4. Sinon (Map non chargée : rôle sans permission `user.read`, ou requête échouée/hors-ligne) → retourner un libellé neutre distinct ("Utilisateur inconnu" ou équivalent) plutôt que "supprimé" à tort — **ne pas déclarer un utilisateur supprimé quand on n'a simplement pas pu vérifier**.
  - [x] Remplacer les deux usages actuels de `t("detail.historyBy", { user: log.changedBy })` (mobile ligne ~261-266 et rail desktop ligne ~415-417 de `quote-preview.tsx`) par `t("detail.historyBy", { user: resolveActorLabel(log, usersById) })`.
- [x] Task 3 — Ajouter les clés i18n manquantes (AC: #1, #2)
  - [x] Dans `src/messages/fr-NE.json`, namespace `devis.detail` (ligne ~394-405) : ajouter `"historyByDeleted": "Utilisateur supprimé"` et `"historyByUnknown": "Utilisateur inconnu"`. Ne pas modifier `historyEntry`/`historyBy` existants (format `{from}`/`{to}`/`{user}` conservé — seule la valeur injectée dans `{user}` change).
- [x] Task 4 — Tests (AC: #1, #2)
  - [x] Test unitaire pour `resolveActorLabel` (ou fonction équivalente) : cas snapshot présent, cas legacy résolu via Map, cas legacy absent de la Map (→ "supprimé"), cas Map non chargée (→ "inconnu", jamais "supprimé").
  - [x] Mettre à jour/ajouter un test pour `status-change-sheet.tsx` (ou son test existant s'il y en a un) vérifiant que `changedByName` est bien écrit dans `db.quoteStatusLogs` lors d'un changement de statut.
  - [x] `pnpm check` (lint + typecheck + vitest) doit rester vert.

## Dev Notes

### Contexte architectural clé

- `quoteStatusLogs` est une table **Dexie locale, append-only, jamais synchronisée au serveur en MVP-0** (commentaire explicite dans `status-change-sheet.tsx` ligne ~44-46 : "non syncé en MVP-0"). La table Postgres `quoteStatusLog` existe dans `src/lib/schema.ts` (ligne 390) mais n'est **pas** alimentée par le flux applicatif actuel (absente de `SyncOpEntity` dans `local-db.ts`) — ne pas la modifier, ne pas y écrire, ce n'est pas le chemin de données réel.
- Conséquence : la résolution de `changedBy` (un `userId` brut) en nom lisible ne peut **pas** s'appuyer sur une jointure serveur au moment du changement de statut — tout se passe en local (Dexie) et éventuellement via un appel API ponctuel pour les entrées historiques.

### Piège de permission — NE PAS appeler `GET /api/v1/users` sans vérifier le rôle

`GET /api/v1/users` (`src/app/api/v1/users/route.ts`) est gardé par `requirePermission(userRole, "user.read")`. Dans `src/lib/permissions.ts` (`PERMISSION_MATRIX`), **`user.read` est `true` uniquement pour `admin`** — `false` pour `commercial` et `operateur`. Un `commercial` consulte pourtant très couramment l'historique de **ses propres** devis (permission `quote.update: "own"`). Si l'appel à cet endpoint est fait sans garde, **il renverra 403 pour tout utilisateur non-admin**, cassant silencieusement la résolution de nom pour la majorité des utilisateurs. Le fetch doit donc :
- être fait en `try/catch`, jamais bloquant pour l'affichage de l'historique ;
- être considéré comme "non disponible" (fallback "Utilisateur inconnu", pas "supprimé") si le rôle n'a pas la permission ou si l'appel échoue (403, réseau hors-ligne, etc.).

C'est précisément pour éviter ce problème que le **snapshot au moment de l'écriture** (`changedByName`, Task 1) est la solution principale et robuste : elle ne dépend d'aucun appel réseau ni d'aucune permission, fonctionne 100% hors-ligne, et couvre tous les rôles puisque c'est l'acteur lui-même qui écrit son propre nom au moment de l'action (déjà présent en session). L'appel à `/api/v1/users` (Task 2) n'est qu'un filet de sécurité pour les entrées **legacy** créées avant cette story.

### Pattern de référence — snapshot dénormalisé

Le projet a déjà ce pattern ailleurs, à suivre à l'identique :
- `quoteSnapshot.clientSnapshot` (`src/lib/local-db.ts` `QuoteLocal.clientSnapshot`) — dénormalise les infos client au moment de la création du devis.
- `clientAccordNom`/`clientAccordFonction` (`client-agreement-sheet.tsx`) — dénormalise le nom du signataire client au moment de l'accord.
`changedByName` suit la même logique : capturer la donnée humaine au moment de l'événement plutôt que de la résoudre a posteriori par jointure.

### Better Auth — `session.user.name`

`name` est un champ **standard** de la table `user` Better Auth (pas un champ custom) — contrairement à `role`/`companyId`, il n'a **pas besoin** d'être ajouté à `user.additionalFields` dans `src/lib/auth.ts` pour être présent sur `session.user`. Vérifiable directement : `CreateUserSchema` dans `src/app/api/v1/users/route.ts` exige déjà `name` à la création utilisateur.

### Fichiers à modifier

- `src/lib/local-db.ts` — ajout champ `changedByName?` sur `QuoteStatusLogLocal`.
- `src/components/quote/status-change-sheet.tsx` — écriture du snapshot, nouvelle prop `userName`.
- `src/components/pdf/quote-preview.tsx` — nouvelle prop `userName`, fetch users + résolution d'affichage (2 emplacements : section historique mobile ~ligne 237-272, rail historique desktop ~ligne 369-424).
- `src/app/(app)/devis/[id]/page.tsx` — lecture et passage de `session.user.name`.
- `src/messages/fr-NE.json` — 2 nouvelles clés sous `devis.detail`.
- Nouveau fichier de test si `resolveActorLabel` est extrait (`src/lib/quote-status-actor.test.ts`), sinon test co-localisé.

### Testing Requirements

- Tests unitaires Vitest pour la fonction de résolution (les 4 cas de priorité listés en Task 2).
- Pas de test E2E requis pour cette story mineure — `pnpm check` (lint + typecheck + vitest) est le critère de complétion technique.
- Respecter le pattern `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` du projet : `changedByName?: string` (jamais `changedByName: string | undefined`) sur l'interface Dexie.

### Project Structure Notes

- Aucune migration Drizzle nécessaire (aucune colonne Postgres ajoutée — `quoteStatusLog` côté serveur n'est pas utilisé par ce flux).
- Aucun bump de version Dexie nécessaire (champ optionnel non indexé sur une table existante).
- Respecter l'i18n obligatoire : aucun texte français en dur dans les composants, tout passe par `useTranslations("devis")` et les clés de `fr-NE.json`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.8] — AC et objectif de la story
- [Source: src/components/pdf/quote-preview.tsx] — deux emplacements d'affichage de l'historique (mobile + rail desktop) utilisant `t("detail.historyBy", { user: log.changedBy })`
- [Source: src/components/quote/status-change-sheet.tsx#handleSelectStatus] — écriture actuelle du `statusLog` dans `db.quoteStatusLogs`, à étendre avec `changedByName`
- [Source: src/lib/local-db.ts#QuoteStatusLogLocal] — interface Dexie de l'entrée d'historique
- [Source: src/hooks/use-live-quote.ts] — hook `liveQuery` exposant `statusLogs` triés par `changedAt`
- [Source: src/app/api/v1/users/route.ts] — endpoint de résolution des utilisateurs du tenant, gardé par `requirePermission(userRole, "user.read")`
- [Source: src/lib/permissions.ts#PERMISSION_MATRIX] — `user.read` est `true` uniquement pour `admin` (piège de permission détaillé ci-dessus)
- [Source: src/lib/tenants/tenant-users.ts] — suppression définitive d'un utilisateur de tenant (Story 7-9), scénario déclenchant AC2
- [Source: src/messages/fr-NE.json#devis.detail] — namespace i18n existant (`historyEntry`, `historyBy`) à étendre

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `pnpm typecheck` : 1 échec initial (`exactOptionalPropertyTypes`) sur `quote-status-actor.test.ts` — passage de `changedByName: undefined` littéral à omission de la clé (objets `{}`/`{ changedBy: "x" }`), corrigé.

### Completion Notes List

- Snapshot dénormalisé `changedByName` ajouté à `QuoteStatusLogLocal` (pas de bump Dexie — champ optionnel non indexé), écrit par `StatusChangeSheet.handleSelectStatus` à partir de `session.user.name` propagé via `QuotePreview` → page serveur.
- Fonction pure `resolveActorLabel` extraite dans `src/lib/quote-status-actor.ts` (testée unitairement, 4 cas de priorité + cas "aucun acteur").
- Fallback legacy : `QuotePreview` appelle `GET /api/v1/users` uniquement si `can(role, "user.read")` (garde le piège de permission documenté en Dev Notes — jamais bloquant, `try/catch`, `null` tant que non chargé pour distinguer "non vérifié" de "supprimé").
- 2 clés i18n ajoutées (`devis.detail.historyByDeleted`, `historyByUnknown`), utilisées dans les deux emplacements d'historique (mobile + rail desktop).
- Tests : `src/lib/quote-status-actor.test.ts` (6 cas) + nouveau `src/components/quote/status-change-sheet.test.tsx` (vérifie `changedByName` écrit en DB lors d'un changement de statut réel via Dexie/fake-indexeddb).
- `pnpm check` (lint + typecheck + 862/862 tests) vert. `pnpm build` vert (compilation + génération des pages).

### File List

- `src/lib/local-db.ts` (modifié — `changedByName?: string` sur `QuoteStatusLogLocal`)
- `src/components/quote/status-change-sheet.tsx` (modifié — prop `userName`, écriture `changedByName`)
- `src/components/quote/status-change-sheet.test.tsx` (nouveau)
- `src/components/pdf/quote-preview.tsx` (modifié — prop `userName`, fetch `/api/v1/users` conditionnel, résolution acteur historique mobile + desktop)
- `src/app/(app)/devis/[id]/page.tsx` (modifié — lecture `session.user.name`, prop `userName`)
- `src/lib/quote-status-actor.ts` (nouveau — `resolveActorLabel`)
- `src/lib/quote-status-actor.test.ts` (nouveau)
- `src/messages/fr-NE.json` (modifié — clés `devis.detail.historyByDeleted`/`historyByUnknown`)

## Change Log

- 2026-07-06 : Implémentation complète (Tasks 1-4) — snapshot `changedByName` dénormalisé + fallback legacy via `/api/v1/users` (garde permission) + libellés i18n dédiés. 862/862 tests, `pnpm check` et `pnpm build` verts. Statut → review.
- 2026-07-06 : Code review — approuvé, aucun finding bloquant. `pnpm test`/`typecheck`/`check` (86 fichiers, 862 tests)/`build:ci` verts. 43 warnings lint pré-existants hors périmètre 8-8 (import-order/a11y/image). Statut → done.
