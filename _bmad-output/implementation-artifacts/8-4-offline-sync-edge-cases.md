# Story 8.4: Test des cas limites de synchronisation offline/reconnexion

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a commercial travaillant hors ligne,
I want que la synchronisation résiste à une vraie coupure réseau et à des conflits concurrents,
so that je ne perde jamais de devis ni de données client en travaillant sur le terrain.

## Acceptance Criteria

1. **Given** un devis créé en mode local (`TEMP-xxxx`) pendant une coupure réseau simulée (DevTools offline / avion) **When** le réseau revient **Then** la Background Sync (Story 6.4) rejoue la queue et le devis est synchronisé sans duplication (idempotence `opId`, déjà couverte par tests unitaires — à revérifier en conditions réseau réelles) **And** le comportement réel de renumérotation `TEMP-xxxx` → numéro définitif est vérifié et documenté (voir Dev Notes — le mécanisme n'a pas de point d'entrée confirmé dans le code actuel).
2. **Given** deux appareils/onglets modifiant le même client/devis hors ligne puis se reconnectant **When** la synchronisation résout le conflit (LWW via `revision`) **Then** aucune donnée n'est silencieusement perdue sans trace ; la version serveur gagnante est appliquée localement, un événement d'audit `conflict.archived` est écrit (DB + `auditMirror`), et un toast informe l'utilisateur.
3. **Given** le mode quota lecture-seule (Story 6.2, grâce expirée) **When** un utilisateur tente une mutation hors ligne dans cet état et se reconnecte **Then** la mutation est rejetée proprement par le serveur (409, `READONLY_MODE`/`QUOTA_EXCEEDED`) **And** le comportement client est vérifié : aujourd'hui l'op quota-rejetée est traitée comme un conflit générique par `handleConflict`, ce qui échoue silencieusement (payload sans `id`) et l'op finit `failed:true` avec un `lastError` générique et trompeur — ce point doit être corrigé (voir Task 3) pour que l'utilisateur reçoive un message clair (pas un échec silencieux ni un message de "conflit" incorrect).

## Tasks / Subtasks

- [ ] Task 1 — Vérifier le rejeu de la Background Sync après coupure réseau réelle (AC: #1)
  - [ ] En local (`pnpm dev`), simuler une coupure réseau réelle (DevTools "Offline" ou mode avion OS, pas juste un mock) pendant la création d'un devis (`wizard-step-client.tsx` assigne le `TEMP-xxxx` via `generateTempNumber`/`getNextLocalSeq`)
  - [ ] Vérifier que la mutation est bien mise en `syncQueue` (Dexie) avec `opId`, `baseRevision: 0`, `queuedAt` renseignés (`applyLocalMutation`, `src/lib/sync/outbox.ts`)
  - [ ] Rétablir le réseau et confirmer le déclenchement de sync : soit via l'événement `sync` du Service Worker (`src/app/sw.ts` ligne ~243, tag `BACKGROUND_SYNC_TAG = "quotation-sync"`), soit via le fallback `window "online"` (`src/hooks/use-sync-status.ts`) sur les navigateurs sans Background Sync API (Firefox, Safari < 16)
  - [ ] Confirmer qu'un rejeu double (re-déclenchement manuel de `triggerSync()` après un premier succès) ne crée pas de doublon serveur — vérifier `syncOpLog` (table serveur) contient une seule ligne par `opId` et que `POST /api/v1/sync/push` renvoie `{status:"noop"}` au deuxième passage (`applyOp`, `src/app/api/v1/sync/push/route.ts` lignes ~520-527)
  - [ ] **Vérifier explicitement le mécanisme de renumérotation `TEMP-xxxx` → numéro définitif** : à date, aucun point d'entrée serveur n'a été identifié qui convertit un numéro `TEMP-XXXX-0001` en `DEV-YYYY-NNNN` lors du push (`formatServerNumber` dans `src/lib/sync/numbering.ts` n'est référencé que dans son test unitaire, aucun appelant en code non-test). Documenter le comportement réel observé : soit le numéro TEMP persiste tel quel après sync (gap fonctionnel à consigner dans `test-plan.md` et potentiellement une nouvelle story de correction), soit un mécanisme existe ailleurs et doit être documenté avec sa localisation exacte.
- [ ] Task 2 — Vérifier la résolution de conflit LWW entre deux appareils (AC: #2)
  - [ ] Ouvrir deux sessions du navigateur (deux profils ou onglets, mêmes identifiants) pointant vers deux "appareils" logiques distincts (`getDeviceId()` différent — vider `localStorage` d'un profil pour forcer un nouveau device id)
  - [ ] Passer les deux hors-ligne, modifier le même client (ou devis) dans les deux avec des valeurs différentes, puis reconnecter l'un après l'autre
  - [ ] Confirmer que le deuxième push détecte `serverRevision > op.baseRevision` (conflit, `applyOp` ligne ~548) et reçoit une réponse 409 avec l'entité serveur
  - [ ] Vérifier côté client que `handleConflict` (`src/lib/sync/conflict.ts`) écrit bien l'entrée `auditMirror` (`conflict.archived`, `before`=payload local, `after`=entité serveur, `synced:false`), applique la version serveur en local (`table.put(serverEntity)`), et affiche le toast "Conflit résolu : une version plus récente a été appliquée."
  - [ ] Vérifier côté serveur qu'un `audit_event` réel (`what:"conflict.archived"`) est bien émis avec `companyId` renseigné (visible dans l'export audit, Story 6.3)
  - [ ] Confirmer qu'aucune donnée n'est perdue "sans trace" : la version perdante doit être reconstituable depuis `auditMirror.before` même si elle n'est plus appliquée
- [ ] Task 3 — Vérifier et corriger le traitement du rejet quota/readonly découvert à la synchronisation (AC: #3)
  - [ ] Mettre une company en quota `readonly` (grâce expirée, Story 6.2) puis, hors ligne, tenter une mutation (ex. création de devis) — elle doit être acceptée localement (Dexie source de vérité) et mise en `syncQueue`
  - [ ] Reconnecter et observer le comportement réel actuel : le serveur renvoie 409 avec `entity:{error:"READONLY_MODE"}` (ou `{error:"QUOTA_EXCEEDED"}` pour `quote.create`), et `pushSingleOp` (`src/lib/sync/push.ts` lignes ~32-53) appelle aujourd'hui `handleConflict(op, result.entity)` sans distinguer ce cas d'un vrai conflit LWW — `result.entity` n'a pas d'`id` valide, `table.put()` échoue, l'erreur est absorbée par le catch englobant, et l'op finit `failed:true` avec `lastError:"malformed or unresolvable conflict response"` (message générique et trompeur)
  - [ ] **Corriger `pushSingleOp`** : avant d'appeler `handleConflict`, détecter si `result.entity` est un objet d'erreur quota (`"error" in result.entity` avec valeur `"READONLY_MODE"` ou `"QUOTA_EXCEEDED"`/autre raison quota) plutôt qu'une entité réelle ; dans ce cas, marquer l'op `failed:true` avec un `lastError` explicite (ex. `"Quota dépassé : mutation refusée à la synchronisation"` / `"Compte en lecture seule : mutation refusée"`) et déclencher un toast utilisateur clair distinct du toast de conflit LWW
  - [ ] Vérifier que l'utilisateur voit un message compréhensible en français (pas un échec silencieux), conformément à la règle "Error Handling" du projet (messages utilisateur en français, erreurs techniques loguées séparément)
  - [ ] Ajouter un cas de régression dans `src/lib/sync/push.test.ts` (ou fichier équivalent s'il existe déjà) couvrant : réponse 409 avec `entity.error` (quota) → op `failed:true` avec message quota-spécifique, PAS d'appel à `handleConflict`/`table.put`
- [ ] Task 4 — Documenter les résultats (toutes AC)
  - [ ] Mettre à jour `Docs/testing/test-plan.md` section "Non couvert dans cette session" pour retirer/annoter la ligne "Mode hors-ligne réel" (ligne 148) avec le résultat de cette vérification
  - [ ] Consigner tout bug trouvé et corrigé (pattern déjà utilisé dans `test-plan.md` section "Bugs trouvés et corrigés"), en particulier le fix de Task 3 et la conclusion sur la renumérotation TEMP (Task 1)
  - [ ] Si la renumérotation TEMP→définitif s'avère être un gap réel non traité par cette story, le signaler explicitement dans `test-plan.md` et dans les Dev Agent Record notes pour arbitrage produit (nouvelle story potentielle)

## Dev Notes

- **Nature de la story : vérification manuelle/E2E en conditions réseau réelles, avec un correctif ciblé attendu (Task 3).** La logique de sync (push/pull, idempotence, LWW, background sync) est déjà entièrement implémentée et couverte par des tests unitaires avec mocks — cette story vérifie le comportement en conditions réelles (vraie coupure réseau, vrai Service Worker, deux appareils réels) et corrige un gap concret déjà identifié dans le traitement client des rejets quota à la synchronisation.
- **Ne pas réinventer :** toute la logique de push/pull/idempotence/LWW existe déjà (`src/lib/sync/push.ts`, `src/lib/sync/pull.ts`, `src/lib/sync/conflict.ts`, `src/lib/sync/outbox.ts`, `src/app/api/v1/sync/push/route.ts`, `src/app/api/v1/sync/pull/route.ts`). Ne modifier que le point précis identifié en Task 3 (`pushSingleOp`), sans toucher au reste du flux.

### Sync push/pull — logique serveur actuelle

- `src/app/api/v1/sync/push/route.ts` : traite `{ ops: SyncOp[] }` (max 100 par batch), **une op à la fois** dans `applyOp()` (~lignes 513-659) :
  - **Idempotence** : vérifie `syncOpLog` par `opId` en premier (~lignes 520-527) ; si trouvé, renvoie `{status:"noop"}` sans réappliquer.
  - **Conflit LWW** : `serverRevision = currentEntity.revision ?? 0` ; si `currentEntity !== null && serverRevision > op.baseRevision` → conflit (~ligne 548). Écrit un `audit_event` `conflict.archived` + une ligne `syncOpLog` (`result:"conflict"`), renvoie **HTTP 409** `{status:"conflict", entity: currentEntity}`. Le serveur gagne toujours (pas de fusion de champs) ; `newRevision = serverRevision + 1` calculé seulement sur le chemin sans conflit.
  - **Quota/readonly** (~lignes 574-626, même fonction) : avant persistance, vérifie `quotaStatus === "readonly"` (ou transition grâce expirée → readonly) et renvoie la **même forme de réponse que le conflit** : `{status:"conflict", entity:{error:"READONLY_MODE"}}` (409), avec `syncOpLog` marqué `result:"conflict"`. Même traitement pour quota dépassé sur `quote.create` (`entity:{error: quotaResult.reason}`, ex. `"QUOTA_EXCEEDED"`).
  - Aucune logique de renumérotation TEMP→permanent trouvée côté serveur — `persistEntityMutation` stocke `p.number` tel que fourni par le client.
- `src/app/api/v1/sync/pull/route.ts` : pull delta simple par `since`, scope `companyId`, renvoie `cursor` frais. Pas de logique conflit/idempotence (le pull écrase toujours via `put`, idempotent par nature).

### Background Sync et reconnexion

- `src/lib/sync/outbox.ts` : `registerBackgroundSync()` appelle `registration.sync.register(BACKGROUND_SYNC_TAG)` (constante `"quotation-sync"`, `src/lib/sync/constants.ts`) après chaque mutation locale dans `applyLocalMutation()`.
- `src/app/sw.ts` (~ligne 243) : `self.addEventListener("sync", ...)` filtre sur `event.tag === BACKGROUND_SYNC_TAG`, draine `syncQueue` via `openSwSyncDb()` (`src/lib/sync/sw-db.ts`, miroir des versions Dexie 1-5), poste un message `TRIGGER_SYNC` aux clients.
- `src/hooks/use-sync-status.ts` : fallback via l'événement `window "online"` (Background Sync API non supportée sur Firefox/Safari < iOS 16) + écoute du message `TRIGGER_SYNC` du SW. Les deux chemins convergent vers `triggerSync()` (`outbox.ts` ~ligne 121, garde anti-concurrence `syncInProgress`), qui appelle `processQueue()` (pousse les ops non-`failed` triées par `queuedAt`, FIFO) puis `pullDelta(cursor)`.

### syncQueue / SyncOpEntity / numérotation (`src/lib/local-db.ts`, `src/lib/sync/numbering.ts`)

```typescript
// SyncOp — src/lib/local-db.ts (~ligne 177)
interface SyncOp {
  opId: string; entity: SyncOpEntity; entityId: string; type: "create"|"update"|"delete";
  payload: unknown; baseRevision: number; queuedAt: string;
  failed?: boolean; retryCount: number; createdBy?: string; lastError?: string;
}
type SyncOpEntity = "client" | "quote" | "quoteLine" | "clause" | "company" | "template" | "routeTemplate";
```
- `getDeviceId()` : UUID persisté en `localStorage` (8 caractères). `getNextLocalSeq(deviceId)` : compteur `localStorage` `TEMP_SEQ_<deviceId>`. `generateTempNumber(deviceId, seq)` → `TEMP-XXXX-0001`. `formatServerNumber(year, seq)` → `DEV-2026-0042` — **cette dernière fonction n'a aucun appelant en dehors de son propre test unitaire** (`numbering.test.ts`) : aucun mécanisme confirmé de conversion TEMP→définitif au sync. `quote-list.tsx` (~ligne 437) affiche juste un badge si `quote.number.startsWith("TEMP-")`, sans logique de renumérotation associée. **À vérifier explicitement en Task 1** — c'est un point flou hérité, pas une supposition à valider aveuglément.

### Conflit — comment il est tracé aujourd'hui

- `src/lib/sync/conflict.ts` `handleConflict(op, serverEntity)` : écrit un enregistrement `auditMirror` (Dexie) — `conflict.archived`, `before`=payload local, `after`=entité serveur, `synced:false` — applique la version serveur localement (`table.put(serverEntity)`), affiche un toast `"Conflit résolu : une version plus récente a été appliquée."`. Le serveur émet aussi un `audit_event` réel `conflict.archived` (pas seulement le miroir Dexie). Aucune UI dédiée de log de conflits au-delà du toast + `auditMirror`/`audit_event`.
- Couvert par `src/lib/sync/conflict.test.ts` (3 tests) — mais ces tests supposent un `serverEntity` bien formé avec un `id` valide. **C'est précisément l'hypothèse qui casse dans le cas quota/readonly** (voir ci-dessous).

### Gap confirmé — rejet quota/readonly traité comme un conflit générique (à corriger, Task 3)

- `src/lib/sync/push.ts`, `pushSingleOp` (~lignes 32-53) : traite **toute** réponse 409 avec `result.entity !== undefined` de la même façon → appelle `handleConflict(op, result.entity)` sans distinguer une vraie entité conflit (`{id, revision, ...}`) d'un objet d'erreur quota (`{error:"READONLY_MODE"}`, sans `id`).
- `handleConflict` appelle alors `table.put({error:"READONLY_MODE"})` — Dexie rejette (pas de clé primaire inline) — l'exception est absorbée par le `catch` englobant (~lignes 45-47), et l'op est marquée `db.syncQueue.update(op.opId, {failed:true, lastError:"malformed or unresolvable conflict response"})`.
- **Effet net** : aucune distinction utilisateur entre un vrai conflit d'édition et un rejet quota/readonly ; le message d'erreur est générique et trompeur ; l'op disparaît du compteur `pendingCount` visible (qui ne compte que les ops non-`failed`) sans que l'utilisateur comprenne pourquoi sa mutation n'est jamais passée. **Ce n'est pas juste un manque de test — c'est un bug réel à corriger dans le cadre de cette story** (Task 3), conformément au mandat Epic 8 ("2 bugs cross-tenant déjà trouvés et corrigés pendant la passe de test E2E, ce type de correction ciblée fait partie du périmètre").

### Couverture de tests existante (ne pas dupliquer)

- `src/app/api/v1/sync/push/route.test.ts`, `src/app/api/v1/sync/pull/route.test.ts` — idempotence/permissions/ownership/validation au niveau API.
- `src/lib/sync/conflict.test.ts` — application LWW + miroir audit + toast (suppose une entité serveur bien formée).
- `src/lib/sync/numbering.test.ts` — formatage pur `generateTempNumber`/`formatServerNumber` uniquement, pas d'intégration avec le flux de sync réel.
- `src/lib/sync/outbox.test.ts` — `applyLocalMutation`, `processQueue`, retry/backoff (à consulter avant modification).
- `src/lib/sync/sw-db.test.ts` — concordance des versions de schéma entre `local-db.ts` et `sw-db.ts`.
- `src/lib/quota/quota.test.ts` — logique quota isolée, pas via le flux de sync push.
- **Aucun test existant n'exerce** : deux appareils/onglets réels modifiant simultanément la même entité sur le réseau, la vraie Background Sync API en conditions navigateur/SW réelles, le timing de reconnexion réel, ou le chemin client complet du rejet quota-readonly découvert à la synchronisation. C'est exactement le rôle de cette story.

### Testing Standards Summary

- `pnpm check` (lint + typecheck + vitest) doit rester vert après le correctif de Task 3.
- Ajouter un test de régression Vitest pour le fix de Task 3 (voir Task 3, dernier item) — suivre le style de `src/lib/sync/conflict.test.ts` / `src/lib/sync/push.ts` s'il a déjà un fichier de test, sinon en créer un minimal ciblé sur `pushSingleOp`.
- Pas de nouveaux tests automatisés attendus pour la vérification manuelle des Tasks 1 et 2 (coupure réseau réelle, deux appareils) — documenter les résultats dans `Docs/testing/test-plan.md` comme pour les Stories 8.1/8.2/8.3.

### Project Structure Notes

- Fichier à corriger : `src/lib/sync/push.ts` (fonction `pushSingleOp`) — seule modification de code attendue pour cette story, sauf découverte d'un bug additionnel pendant la vérification.
- Aucun nouveau module attendu ; si un test de régression est ajouté, suivre l'emplacement `src/lib/sync/push.test.ts` (à créer s'il n'existe pas) en miroir de `conflict.test.ts`.
- Documentation de résultats dans `Docs/testing/test-plan.md` (section "Non couvert dans cette session", ligne 148 actuellement).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.4: Test des cas limites de synchronisation offline/reconnexion] (lignes 1138-1156)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8: Préparation Go-Live] (lignes 291-293, contexte déclencheur)
- [Source: Docs/testing/test-plan.md#Non couvert dans cette session] (ligne 148 — "Mode hors-ligne réel" explicitement exclu de la passe E2E du 2026-07-06)
- [Source: src/app/api/v1/sync/push/route.ts] — logique push, idempotence `syncOpLog`, conflit LWW, gate quota/readonly (~lignes 513-659)
- [Source: src/app/api/v1/sync/pull/route.ts] — logique pull delta
- [Source: src/lib/sync/push.ts] — `pushSingleOp`, point de correction Task 3 (~lignes 32-53)
- [Source: src/lib/sync/conflict.ts] — `handleConflict`, application LWW locale + audit mirror + toast
- [Source: src/lib/sync/outbox.ts] — `registerBackgroundSync`, `applyLocalMutation`, `triggerSync`, `processQueue`
- [Source: src/app/sw.ts] — listener `sync` du Service Worker (~ligne 243)
- [Source: src/hooks/use-sync-status.ts] — fallback événement `online`, écoute `TRIGGER_SYNC`
- [Source: src/lib/local-db.ts] — `SyncOp`, `SyncOpEntity`, table `syncQueue` (~ligne 177)
- [Source: src/lib/sync/numbering.ts] — `generateTempNumber`, `getNextLocalSeq`, `getDeviceId`, `formatServerNumber` (appelant non confirmé)
- [Source: src/lib/quota/quota-check.ts] — `checkQuota`, statuts `ok`/`exceeded`/`readonly`
- [Source: _bmad-output/project-context.md] — règles Dexie/offline transverses (versions immuables, `syncQueue` plaintext, gestion d'erreurs en français)
- [Source: _bmad-output/implementation-artifacts/8-1-stripe-e2e-verification.md] — pattern de story de vérification E2E Epic 8 (référence de format)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
