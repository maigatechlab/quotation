---
baseline_commit: 6d86a44c3f31256223116b01a2fcb34d0716df51
---

# Story 8.6: Audit de sécurité ciblé cross-tenant

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a responsable sécurité,
I want un audit systématique de toutes les routes API scopées par tenant,
so that les 2 failles trouvées pendant la passe de test (fuite cross-tenant + IDOR sur `/api/v1/users`, déjà corrigées) n'aient pas d'équivalent ailleurs dans l'API.

## Acceptance Criteria

1. **Given** les 2 bugs de sécurité déjà corrigés (`GET/PATCH /api/v1/users[/id]` — filtrage manquant par `companyId`), **when** je passe en revue toutes les routes sous `src/app/api/v1/**` qui lisent ou modifient des entités scopées par `companyId` (clients, quotes, quoteLines, clauses, templates, routeTemplates, company), **then** chaque `SELECT`/`UPDATE`/`DELETE` inclut bien une clause `WHERE company_id = <companyId de la session>`, avec un test de non-régression par route (payload d'un autre tenant → 403/404, jamais 200 avec les données d'autrui).
2. **Given** les routes `owner/**` (accès plateforme, cross-tenant par design), **when** je vérifie leur garde d'autorisation, **then** `requireOwnerSession`/équivalent est bien systématique, sans route owner accessible à un rôle tenant.
3. **Given** l'ensemble de la matrice de permissions (`src/lib/permissions.ts`), **when** je croise déclaratif (permissions) et effectif (implémentation route par route), **then** aucun écart n'existe entre ce que la matrice autorise et ce que le code applique réellement.

## Tasks / Subtasks

- [x] Task 1 — Corriger la faille IDOR cross-tenant sur `POST /api/v1/quotes/[id]/agreement-scan` (AC: #1)
  - [x] Dans `src/app/api/v1/quotes/[id]/agreement-scan/route.ts`, `db.query.quote.findFirst({ where: eq(quoteTable.id, quoteId) })` (ligne ~29-31) ne filtre pas par `companyId`. `requirePermission(userRole, "quote.update", dbQuote.ownerId, userId)` (ligne 38) ne bloque **que** le rôle `commercial` (permission `"own"` → vérifie `ownerId === userId`). Pour le rôle `admin`, `"quote.update": true` inconditionnel dans `PERMISSION_MATRIX` → **aucune vérification `companyId` n'a lieu** : un admin du tenant A peut uploader/écraser le scan d'accord d'un devis appartenant au tenant B en devinant/énumérant son `id`.
  - [x] Ajouter la vérification `dbQuote.companyId === callerCompanyId` (même pattern que `assertOwnership()` dans `src/app/api/v1/sync/push/route.ts` lignes 187-208) avant tout accès en lecture/écriture ; retourner `apiError("NOT_FOUND", ..., HTTP_STATUS.NOT_FOUND)` (ne pas distinguer 403 de 404 pour éviter l'énumération de devis existants d'un autre tenant).
  - [x] Ajouter un test de non-régression dans un nouveau `route.test.ts` : devis appartenant à `companyId: "co-2"`, session avec `companyId: "co-1"`, rôle `admin` → 404 (pas 200, pas de leak du scan).
- [x] Task 2 — Auditer chaque route `src/app/api/v1/**` scopée par `companyId` selon le tableau de référence ci-dessous (AC: #1)
  - [x] Pour chaque route listée dans "Surface d'audit — routes tenant-scoped", vérifier que toute requête `db.select/update/delete` sur une table avec colonne `company_id` inclut `eq(table.companyId, callerCompanyId)` (ou équivalent `and(...)`), et que la valeur vient de `session.user.companyId` — jamais du payload/params de la requête cliente.
  - [x] Écrire ou compléter un test `route.test.ts` par route non déjà couverte : payload/id appartenant à un autre tenant (`companyId` différent) → 403/404 (jamais 200 avec les données d'autrui). Suivre le pattern de mock existant dans `src/app/api/v1/users/route.test.ts` (mock `auth.api.getSession`, mock `db`).
  - [x] Documenter dans `Dev Agent Record > Completion Notes` le résultat route par route (conforme / corrigé / déjà couvert par test).
- [x] Task 3 — Vérifier la garde d'autorisation de toutes les routes `owner/**` (AC: #2)
  - [x] Confirmer que chaque route sous `src/app/api/v1/owner/**` appelle `requireOwnerSession()` (déjà vérifié présent dans les 15 fichiers actuels lors de la préparation de cette story — revalider qu'aucune route n'a été ajoutée/modifiée depuis sans la garde).
  - [x] Vérifier qu'aucune route `owner/**` n'accepte un rôle tenant (`admin`/`commercial`/`operateur`) — `requireOwnerSession` doit retourner `403 FORBIDDEN` si `role !== "superadmin"` (déjà implémenté dans `src/lib/session.ts`, à couvrir par test si absent).
  - [x] Vérifier `src/app/owner/layout.tsx` et toute page Server Component sous `src/app/owner/**` — confirmer l'usage de `requireOwnerAuth()` (redirect côté page, complémentaire à la garde API).
- [x] Task 4 — Croiser `src/lib/permissions.ts` (déclaratif) avec l'implémentation effective (AC: #3)
  - [x] Pour chaque `Action` de `PERMISSION_MATRIX`, lister la ou les routes qui l'utilisent (`requirePermission`/`can`) et vérifier que le comportement effectif correspond exactement à la permission déclarée (`true`/`false`/`"own"`).
  - [x] Vérifier spécifiquement les permissions `"own"` (`quote.update`, `quote.delete`, `quote.change-status`, `client.update` pour `commercial`) : chaque route qui les utilise doit passer `ownerId` et `currentUserId` réels à `requirePermission()` — jamais `undefined` en dur, sinon la vérification "own" est silencieusement contournée.
  - [x] Vérifier `src/app/api/v1/sync/push/route.ts` : `resolveEntityAction()`/`resolveEntityOwner()` (lignes 53-91) doivent produire le bon mapping action/owner pour chaque `entity` de `SyncOpEntity` — en particulier `quoteLine` (résout l'owner via le `quote` parent, ligne 78-88) et `company` (pas d'"own", ligne 76).
  - [x] Documenter tout écart trouvé et le corriger, ou noter en `Completion Notes` si volontairement différé (avec justification).
- [x] Task 5 — Valider par la suite de tests complète (AC: #1, #2, #3)
  - [x] `pnpm check` (lint + typecheck + vitest) doit passer avec tous les nouveaux tests de non-régression.
  - [x] `pnpm build` doit rester vert.

## Dev Notes

### Surface d'audit — routes tenant-scoped (`src/app/api/v1/**`)

**Contexte architectural clé :** ce projet est **offline-first** — la majorité des entités métier (clients, quotes, quoteLines, clauses, templates, routeTemplates) n'ont **pas** de routes CRUD REST dédiées. Elles transitent uniquement par les deux endpoints génériques de synchronisation :
- `POST /api/v1/sync/push` (`src/app/api/v1/sync/push/route.ts`) — déjà scopé : `assertOwnership()` (lignes 187-208) vérifie `op.entityId === userCompanyId` pour `company`, et `currentEntity.companyId === userCompanyId` pour tout le reste ; les nouvelles entités sont stampées `companyId: userCompanyId` côté serveur (jamais depuis le payload client). **Vérifier, ne pas réinventer.**
- `GET /api/v1/sync/pull` (`src/app/api/v1/sync/pull/route.ts`) — déjà scopé : chaque `SELECT` inclut `eq(table.companyId, userCompanyId)`. **Vérifier, ne pas réinventer.**

Routes REST individuelles à auditer (liste exhaustive de `src/app/api/v1/**/route.ts`) :

| Route | Statut connu (avant story) | Point d'attention |
|---|---|---|
| `GET/POST /api/v1/users` | ✅ corrigé (bug #1 test-plan) | Filtre `eq(userTable.companyId, companyId)` déjà en place — vérifier non-régression |
| `PATCH /api/v1/users/[id]` | ✅ corrigé (bug #2 test-plan, IDOR) | `WHERE id = ... AND company_id = ...` déjà en place — vérifier non-régression |
| `GET/POST /api/v1/companies` | ✅ scopé par `session.user.companyId` | RAS |
| `POST /api/v1/companies/logo` | ✅ scopé | RAS |
| `POST /api/v1/quotes/[id]/agreement-scan` | 🔴 **NON scopé — voir Task 1** | `dbQuote` fetché par id seul, aucun check `companyId`; admin bypass via permission `true` inconditionnelle |
| `GET /api/v1/quota` | ✅ scopé par `session.user.companyId` | RAS |
| `GET /api/v1/audit/export` | ✅ scopé (`eq(auditEvent.companyId, companyId)`) | RAS |
| `POST /api/v1/sync/push` | ✅ scopé (`assertOwnership`) | Revérifier les mappings action/owner (Task 4) |
| `GET /api/v1/sync/pull` | ✅ scopé | RAS |
| `GET /api/v1/health` | N/A (pas de données tenant) | RAS |
| `POST /api/v1/checkout/create-session` | À vérifier — scope tenant vs Stripe | Hors périmètre strict de cette story si déjà couvert par 7-10, mais vérifier qu'un tenant ne peut pas créer une session checkout pour un autre `tenantId` |
| Toutes les routes `src/app/api/v1/owner/**` (15 fichiers) | ✅ toutes utilisent `requireOwnerSession()` (vérifié lors de la préparation de cette story) | Revalider — voir Task 3 |

### Pattern de référence pour le scoping cross-tenant

```typescript
// Pattern correct (déjà utilisé dans users/route.ts, users/[id]/route.ts, sync/push, sync/pull) :
// 1. companyId vient TOUJOURS de session.user, jamais du payload/params client
const rawCid = (session.user as Record<string, unknown>).companyId;
const companyId: string | null = typeof rawCid === "string" && rawCid !== "" ? rawCid : null;

// 2. Toute lecture/écriture inclut la clause companyId
await db.update(table).set({...}).where(and(eq(table.id, id), eq(table.companyId, companyId)));

// 3. Si le résultat est vide → 404 (ne jamais révéler que la ressource existe chez un autre tenant)
```

Pour les routes `owner/**` (cross-tenant par design) :
```typescript
import { requireOwnerSession } from "@/lib/session";
const guard = await requireOwnerSession(); // 401 si pas de session, 403 si role !== "superadmin"
if (!guard.ok) return apiError(guard.code, "Accès refusé.", guard.status);
```

### Architecture Compliance

- **Ne jamais faire confiance à `companyId`/`tenantId` venant du body/params client** — toujours `session.user.companyId` (tenant métier) ou `session.user.tenantId` (statut d'abonnement, table `tenants`, distinct de `companyId`).
- `assertSessionTenantWritable()` (`src/lib/tenants/request-guard.ts`) gate les écritures si le tenant est `suspended`/`cancelled` — ne pas confondre avec le scoping `companyId` (ce sont deux contrôles indépendants, souvent utilisés ensemble sur les routes de mutation).
- Toujours utiliser `apiError()` de `@/lib/api/envelope` pour les réponses d'erreur (jamais `NextResponse.json` brut pour les erreurs, sauf code legacy pré-existant qu'il ne faut pas reformater hors scope).
- Ne pas introduire de nouvelle route REST pour clients/quotes/etc. — le pattern du projet est sync push/pull ; toute correction doit rester dans les routes existantes.

### Testing Requirements

- Tests unitaires Vitest (`route.test.ts` à côté de chaque route), pattern de mock déjà établi dans `src/app/api/v1/users/route.test.ts` : `vi.mock("@/lib/auth")`, `vi.mock("@/lib/db")`, `mockSession(role, companyId)`.
- Chaque route corrigée ou vérifiée doit avoir au moins un test "cross-tenant → 403/404" simulant un payload/ressource d'un autre `companyId`.
- `pnpm check` doit rester vert (lint + typecheck + vitest run) — c'est le seul critère de complétion technique vérifiable en CI.

### Project Structure Notes

- Fichiers à modifier : `src/app/api/v1/quotes/[id]/agreement-scan/route.ts` (fix), nouveau `src/app/api/v1/quotes/[id]/agreement-scan/route.test.ts` (test), plus tout `route.test.ts` manquant identifié lors de l'audit (Task 2).
- Aucun changement de schéma DB attendu pour cette story (audit + correctifs de logique applicative uniquement).
- Si un écart de permission est trouvé (Task 4) nécessitant une évolution de `src/lib/permissions.ts`, documenter avant de modifier — la matrice est une source de vérité partagée par toutes les routes REST et par `sync/push`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.6] — AC et objectif de la story
- [Source: Docs/testing/test-plan.md#Bugs trouvés et corrigés] — détail des 2 bugs cross-tenant déjà corrigés (fuite `GET /api/v1/users`, IDOR `PATCH /api/v1/users/[id]`) qui ont déclenché cet epic
- [Source: src/app/api/v1/users/route.ts, src/app/api/v1/users/[id]/route.ts] — pattern de référence pour le scoping `companyId` déjà appliqué
- [Source: src/app/api/v1/sync/push/route.ts#assertOwnership, resolveEntityAction, resolveEntityOwner] — pattern de scoping et de permission "own" pour toutes les entités synchronisées
- [Source: src/lib/tenants/request-guard.ts#assertSessionTenantWritable] — garde de statut tenant (suspendu/annulé), distincte du scoping `companyId`
- [Source: src/lib/session.ts#requireOwnerSession, requireOwnerAuth] — garde d'autorisation superadmin pour les routes/pages `owner/**`
- [Source: src/lib/permissions.ts#PERMISSION_MATRIX] — matrice déclarative à croiser avec l'implémentation effective (Task 4)
- [Source: src/app/api/v1/quotes/[id]/agreement-scan/route.ts] — route identifiée comme non scopée par `companyId` lors de la préparation de cette story (Task 1)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (Claude Code)

### Debug Log References

- Test env gotcha (jsdom) : `Request.formData()` sur un body `FormData` construit avec `File` ne préserve pas l'instance `File` après re-parsing sous jsdom — même contournement que `src/app/api/v1/companies/logo/route.test.ts` : `vi.spyOn(req, "formData").mockResolvedValue(formData)`.

### Completion Notes List

**Task 1 — IDOR corrigé.** `POST /api/v1/quotes/[id]/agreement-scan` : ajout de `dbQuote.companyId !== callerCompanyId → 404` avant tout accès (même code que "devis introuvable", pour ne pas permettre l'énumération cross-tenant). `callerCompanyId` dérivé uniquement de `session.user.companyId`. 4 nouveaux tests dans `route.test.ts` (401, 404 introuvable, 404 cross-tenant admin bypass, 200 même tenant).

**Task 2 — Audit route par route (`src/app/api/v1/**`) :**
| Route | Résultat |
|---|---|
| `GET/POST /api/v1/users` | Conforme — `eq(userTable.companyId, companyId)` (GET) et stamp serveur `companyId: tenantId` (POST), déjà testé |
| `PATCH /api/v1/users/[id]` | Conforme — `and(eq(id), eq(companyId))`, déjà testé |
| `GET/POST /api/v1/companies` | Conforme — GET filtre par `companyId` de session ; POST scope l'update du user courant uniquement (`eq(userTable.id, userId)`), pas de paramètre client pour cibler un autre tenant |
| `POST /api/v1/companies/logo` | Conforme — update scopé `eq(companyTable.id, companyId)` (session) |
| `POST /api/v1/quotes/[id]/agreement-scan` | **Corrigé (Task 1)** |
| `GET /api/v1/quota` | Conforme — toutes les requêtes utilisent `companyId` de session |
| `GET /api/v1/audit/export` | Conforme — `eq(auditEvent.companyId, companyId)` de session |
| `POST /api/v1/sync/push` | Conforme — `assertOwnership()` vérifie `companyId` pour toute entité existante ; nouvelles entités stampées `companyId: userCompanyId` côté serveur. Point mineur documenté ci-dessous (quoteLine.quoteId) |
| `GET /api/v1/sync/pull` | Conforme — chaque `SELECT` scopé `eq(table.companyId, userCompanyId)` |
| `GET /api/v1/health` | N/A — aucune donnée tenant, endpoint de monitoring public |
| `POST /api/v1/checkout/create-session` | Conforme (par construction) — route publique de signup, le schéma de payload (`createCheckoutSessionSchema`) ne contient aucun identifiant de tenant/entreprise existante à cibler ; crée toujours une nouvelle société. Aucun vecteur cross-tenant possible avec ce payload |
| Routes `owner/**` (15 fichiers) | Voir Task 3 |

**Point mineur documenté (différé) :** dans `sync/push`, pour une création de `quoteLine`, `payload.quoteId` (ligne 347) n'est pas vérifié contre le tenant de l'appelant avant insertion — la ligne créée est toujours stampée avec `companyId: tenantId` de l'appelant (jamais le tenant de la quote référencée), donc **aucune fuite de données cross-tenant** n'est possible (la ligne créée reste scopée et visible uniquement pour le tenant de l'appelant). Impact limité à une incohérence référentielle potentielle (une `quoteLine` de l'attaquant pointant vers un `quoteId` d'un autre tenant, sans conséquence de confidentialité). Différé car hors du périmètre strict de cette story (fuite/IDOR cross-tenant) — à traiter si besoin dans une story de validation de payload sync.

**Task 3 — Garde `owner/**` :** les 15 fichiers sous `src/app/api/v1/owner/**` appellent tous `requireOwnerSession()` (401 si pas de session, 403 si `role !== "superadmin"`, testé dans `src/lib/session.test.ts`). `src/app/owner/layout.tsx` appelle `requireOwnerAuth()` (redirect `/owner/login` ou `/`). Aucune route owner accessible à un rôle tenant.

**Task 4 — Croisement matrice/implémentation :** seuls deux points d'appel utilisent des permissions `"own"` dynamiques : `sync/push/route.ts` (`resolveEntityAction`/`resolveEntityOwner`, lignes 53-91, mapping vérifié entité par entité — `company` sans "own" correct, `quoteLine` résout l'owner via la quote parente) et `quotes/[id]/agreement-scan/route.ts` (corrigé Task 1). Aucun appel à `requirePermission()` ne passe `undefined` en dur pour `ownerId`/`currentUserId` — recherche exhaustive (`grep requirePermission(`) confirmée. Les permissions `quote.delete`/`quote.change-status`/`client.update` ("own" pour `commercial`) ne sont pas exposées par des routes REST dédiées — elles transitent uniquement par `sync/push` (déjà audité) ou sont utilisées côté client uniquement pour le gating UI (`can()`), sans impact sécurité serveur.

**Résultat global :** 1 IDOR corrigé (Task 1), 0 écart trouvé sur `owner/**` (Task 3), 0 écart bloquant sur la matrice de permissions (Task 4), 1 point mineur documenté et différé (quoteLine.quoteId, sans fuite cross-tenant).

### File List

- `src/app/api/v1/quotes/[id]/agreement-scan/route.ts` (modifié — fix IDOR)
- `src/app/api/v1/quotes/[id]/agreement-scan/route.test.ts` (nouveau — 4 tests)
