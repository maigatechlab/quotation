# Deferred Work

## Deferred from: code review de 3-5-reusable-line-templates (2026-06-26)

- **`isPending` partagé bloque toutes actions liste pendant un delete** [`src/components/settings/template-manager.tsx`] — Pattern commun codebase (CompanyForm, etc.). UX intentionnelle. Refacto isPending par-action post-MVP.
- **Picker templates sans dismiss outside-click/Escape** [`src/components/quote/wizard-step-services.tsx:537`] — Spec dit explicitement "optionnel MVP — acceptable de le laisser ouvert". Ajouter Escape + click-outside post-MVP.
- **Retour liste sans confirmation si formulaire non sauvegardé** [`src/components/settings/template-manager.tsx`] — UX post-MVP. Confirmer navigation si `nom || formLines modifiées`.
- **Commercial ne peut pas consulter les templates dans Paramètres** [`src/app/(app)/parametres/page.tsx`] — `can(role, "template.create")` cache le manager aux commerciaux. Intentionnel pour MVP. Envisager page lecture-seule post-MVP.
- **Guard `template.create` plutôt que `role === "admin"`** [`src/app/(app)/parametres/page.tsx:93`] — Fonctionnellement correct avec la matrice actuelle. Risque si un futur rôle obtient `template.create: true`. Revoir lors de l'ajout d'un nouveau rôle.

## Fix appliqué hors story (2026-06-24)

- **accountLockoutPlugin — hooks retournaient void** [`src/lib/auth.ts`] — Better Auth v1.6.20 destructure la valeur de retour des hook handlers sans guard undefined ; retourner `void` causait `TypeError: Cannot read properties of undefined (reading 'headers')` sur tous les sign-in. Fix : `return {}` dans `before` et `after`. Le `after` hook utilise maintenant `context["returnStatus"]` (propriété directe) au lieu du pattern nested `context["context"]["returned"]` qui ne correspondait plus à l'API v1.6.

## Deferred from: code review de 1-4-user-login (2026-06-23)

- **Commentaire SQL CASE trompeur** [`src/lib/lockout.ts:22`] — Indique "atomic" alors que le flux global ne l'est pas. Qualité de commentaire uniquement.
- **`selectedRole` cosmétique uniquement** [`src/components/auth/login-form.tsx:27`] — Intentionnel MVP-0. Story 1.6 câblera la vérification de rôle.
- **Énumération d'emails via lockout** [`src/lib/lockout.ts`] — Un attacker peut déduire qu'un email est enregistré si le compte finit par se verrouiller. Acceptable MVP-0, durcissement Story 1.6.
- **Rate limiting réseau non implémenté** — NFR-S6 spécifie 10 req/min/IP au niveau passerelle. Hors scope Story 1.4, Story 1.6 ou infrastructure.
- **`enforceExpiry` retourne false si LAST_ONLINE_KEY absent** [`src/hooks/use-offline-session.ts:35`] — Comportement intentionnel pour nouveaux utilisateurs sans historique offline. Documenter si comportement doit changer.
- **Double appel `enforceExpiry` (SessionGuard + useOfflineSession)** — SessionGuard est pré-existant. Hook non monté avant Story 1.5. Réévaluer l'interaction en Story 1.5 lors du montage.

## Deferred from: code review de 3-2-route-entry (2026-06-25)

- **`auditMirror.add` hors transaction Dexie** [`src/components/quote/wizard-step-route.tsx:~163`] — Pattern prescrit par la spec (INTERDIT de le mettre dans dexieWriteFn). Gap atomicité en cas de coupure entre les deux writes. Corriger via queue audit ou param audit dans `applyLocalMutation` (Story 6.x).
- **`catch {}` sans logging** [`src/components/quote/wizard-step-route.tsx: bloc catch`] — Erreurs Dexie/sync silencieuses en production. Ajouter `console.error` ou Sentry dans une passe transversale.
- **Spread `{ ...current, ...routeFields }` dans payload** [`src/components/quote/wizard-step-route.tsx: payload`] — Patch complet cohérent avec le pattern offline-first du projet, mais résurrecte des champs potentiellement périmés. Réévaluer si conflit multi-devices est une priorité.
- **`useEffect(resetWizard, [])` sans deps** [`src/components/quote/quote-wizard.tsx:59`] — Introduit Story 3-1, eslint-disable. Peut causer reset silencieux sur re-mount. Stabiliser `resetWizard` via useCallback ou useRef (refacto wizard global).

## Deferred from: code review de 2-3-company-info-config (2026-06-24)

- **userId cast non sécurisé depuis session** [`src/app/(app)/parametres/page.tsx`] — `(session.user as Record<string, unknown>).id as string` sans guard null. Pattern pré-existant codebase, à uniformiser via helper session.
- **liveQuery error handler silencieux** [`src/hooks/use-live-company.ts`] — `error: () => setCompany(null)` avale Dexie.AbortError (déclenché sur DB upgrade). Flash bootstrap momentané acceptable MVP.
- **SyncOp.createdBy non indexé** [`src/lib/local-db.ts`] — Ajouté à l'interface sans index Dexie. Requêtes par createdBy = full scan. Story 2-1.
- **syncOpLog sans isolation tenant** [`src/lib/schema.ts`] — Pas de userId/companyId sur la table. Si un endpoint de lecture est ajouté, exposition cross-tenant. Story 2-1.
- **sync.push/pull non vérifiées per-entity** [`src/app/api/v1/sync/push/route.ts`] — Rôle commercial peut pousser entity="company" via sync si companyId correspond. Story 2-1 design gap.
- **user.companyId sans FK constraint** [`src/lib/schema.ts:51`] — `uuid("company_id")` sans `.references(() => companyTable.id)`. Intégrité référentielle non enforced. Ajouter FK + `onDelete: "set null"` dans une migration dédiée (hors scope Story 2-3).
- **emitAuditEvent hors transaction** [`src/app/api/v1/companies/route.ts`] — Commit DB puis audit — gap si audit throw. Pattern codebase à corriger via queue ou outbox audit.
- **AuditEvent UPDATE via sync push** [`src/app/api/v1/sync/push/route.ts`] — AC5 requiert audit sur save. Push route Story 2-1 doit émettre `what="sync.update"` pour entity=company. Vérifier.
- **triggerSync singleton module-level** [`src/lib/sync/outbox.ts`] — Non partagé entre tabs, reseté par HMR dev. Coordination multi-tab via navigator.locks Story 6.x.

## Deferred from: code review de 2-2-service-worker-cache-strategy (2026-06-24)

- **`.equals(0)` sur champ boolean `failed`** [`src/hooks/use-sync-status.ts`] — `db.syncQueue.where("failed").equals(0)` ne matche pas `false` (boolean) dans IndexedDB. Bug pré-existant Story 2-1, `pendingCount` reste à 0 même avec queue pleine.
- **Sync concurrent ignoré si sync en vol** [`src/hooks/use-sync-status.ts`] — L'event `online` pendant un sync actif est silencieusement ignoré (pas de retry-on-complete). Concerné Story 2-1.
- **Deux gardes sync découplés (module + hook)** [`src/lib/sync/outbox.ts`, `src/hooks/use-sync-status.ts`] — Le guard hook (`syncInProgressRef`) et le guard module (`syncInProgress` dans outbox.ts) ne sont pas synchronisés. Un appel manuel peut passer le guard hook alors que le module est occupé.
- **`pullDelta` sans retry sur échec réseau** [`src/lib/sync/outbox.ts`] — En cas d'erreur réseau sur `/api/v1/sync/pull`, aucun mécanisme de retry. Le curseur n'avance pas, le delta suivant re-récupère les mêmes données (comportement safe mais pas optimal).

## Deferred from: code review de 2-1-offline-sync-engine (2026-06-23)

- **`companyId` ajouté à la table `user` hors scope** [`src/lib/schema.ts`] — Migration déjà appliquée et fonctionnellement requise par les routes sync. Attribuer rétroactivement à une story company-provisioning.
- **`pullDelta` écrase les ops locales en attente** [`src/lib/sync/pull.ts`] — Comportement voulu : LWW server wins per spec (triggerSync fait push avant pull).
- **`getNextLocalSeq` non atomique** [`src/lib/sync/numbering.ts:12`] — localStorage synchrone protège le thread principal ; Web Workers hors scope MVP.
- **Race processQueue snapshot + délai retry** [`src/lib/sync/outbox.ts`] — Mitigé par le fix du flag syncInProgress (P9). Réévaluer si concurrence multi-tab est supportée.
- **Cursor race entre deux `triggerSync` concurrents** [`src/lib/sync/outbox.ts:82`] — Mitigé par le fix P9. Les puts Dexie sont idempotents donc l'impact est limité au bandwidth.
