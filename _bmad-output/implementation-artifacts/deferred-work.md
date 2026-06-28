# Deferred Work

## Deferred from: code review de 6-1-indexeddb-encryption-at-rest (2026-06-27)

- **Refresh perd la clé en mémoire** [`src/lib/crypto/crypto-context.tsx`] — Conforme AC3 (clé mémoire-seule), mais un hard refresh (F5) avec session Better Auth persistante affiche les champs classifiés vides jusqu'à reconnexion. Candidat v2 : écran de déverrouillage / clé enveloppée éphémère re-dérivée sans re-login.
- **Changement de mot de passe cross-device** [`src/lib/crypto/`] — Si le mot de passe change sur un autre appareil (sans passer par le reset local), les données chiffrées avec l'ancienne clé deviennent illisibles (champs → undefined) jusqu'à re-sync. Le flow reset local (AC4) couvre le cas même-appareil. Réconciliation multi-appareils à prévoir.
- **Coût déchiffrement par champ sur grandes listes** [`src/lib/crypto/entity-crypto.ts`] — ~200 clients × 6 champs = ~1200 appels subtle.decrypt par emit liveQuery. Acceptable MVP-1 ; envisager un cache mémoire déchiffré ou un batch si latence ressentie.
- **templates / routeTemplates non chiffrés** [`src/lib/crypto/field-classification.ts`] — Non énumérés dans AC2, laissés en clair (métadonnées structurelles). Réévaluer si jugés sensibles. (NB : `quoteClauses.contenu` et `quotes.clientSnapshot` ajoutés au chiffrement suite au 2ᵉ code review.)
- **PBKDF2 100k perçu au login mot de passe erroné** [`src/components/auth/login-form.tsx`] — clé dérivée avant `signIn`, coût payé même si mauvais mot de passe. Micro-label « Dérivation… » envisageable (UX, low).

## Deferred from: code review de 3-6/3-7/3-8 (2026-06-27)

- **[3-6] `conditionsPaiementDefaut: null` dans le payload outbox** [`src/components/settings/payment-terms-form.tsx`] — Payload outbox envoie `null` quand la valeur est effacée, mais Dexie fait `delete`. Côté serveur null est accepté. Uniformiser vers omission conditionnelle dans une passe transversale.
- **[3-6] PaymentTermsForm fallback SSR prop quand `useLiveCompany()=null`** [`src/components/settings/payment-terms-form.tsx`] — Comportement documenté/intentionnel. Documenter plus explicitement pour éviter confusion future.
- **[3-7] `pays` hardcodé `"NE"` dans création clause** [`src/components/settings/clause-manager.tsx`, `src/components/quote/wizard-step-conditions.tsx`] — Pattern pré-existant toutes entités. À résoudre lors de l'extension AES (Mali, Burkina Faso).
- **[3-7] `useLiveClauses` absorbe silencieusement erreurs Dexie** [`src/hooks/use-live-clauses.ts:26`] — Pattern pré-existant identique à `useLiveTemplates` et `useLiveRouteTemplates`. Exposer un état `error` dans une passe transversale.
- **[3-8] Pas d'atomicité quote update / bulkPut quoteClauses / auditMirror** [`src/components/quote/wizard-step-conditions.tsx:L220-330`] — Crash entre opérations = état incohérent local. Wrapping `db.transaction("rw", [quotes, quoteClauses, auditMirror])` requis ; différé car hors périmètre MVP-0.
- **[3-8] IDs clauseIds sélectionnés deviennent obsolètes si bibliothèque modifiée mid-wizard** [`src/components/quote/wizard-step-conditions.tsx`] — `clauseById.get(key)` retourne undefined → `contenu:""` persisté. Edge case faible en MVP solo. Reconciliation à prévoir lors du mode multi-utilisateurs.
- **[3-8] Modèle "Enregistrer comme modèle" a toujours le titre "Clause spécifique"** [`src/components/quote/wizard-step-conditions.tsx:L248`] — Toutes les clauses spécifiques sauvegardées s'appellent identiquement. Gap UX différé.



## Deferred from: code review de 6-5-route-corridor-templates-crud (2026-06-27)

- **Contraintes DB manquantes sur `route_template`** [`drizzle/0010_chilly_iron_man.sql`] — Pas de FK ni NOT NULL sur `company_id`, `pays` nullable. Pattern pré-existant sur toutes les tables tenant-scoped. Ajouter contraintes dans une migration dédiée post-MVP.
- **`wizard-step-goods.tsx` seed useEffect([], []) non réactif** [`src/components/quote/wizard-step-goods.tsx:50`] — Ne re-seed pas `unitPrice` si user revient étape route et change de template, ni si `tarifFcfa=0`. Vérifier cycle de vie composant wizard (remount ?) ; si stay-mounted, ajouter deps `[quoteId]` et check `q?.unitPrice !== undefined`.
- **`useLiveRouteTemplates` absorbe silencieusement les erreurs Dexie** [`src/hooks/use-live-route-templates.ts:26`] — Pattern pré-existant. Exposer un état `error` distinct de "liste vide" pour diagnostic.
- **Cast `as unknown as EntityTable` dans conflict.ts et outbox.ts** [`src/lib/sync/conflict.ts:23`, `src/lib/sync/outbox.ts:26`] — Pattern pré-existant toutes entités. Typer correctement ou remplacer par une interface générique dans une passe transversale.
- **Delete op sur entité inexistante → "applied" sans lignes affectées** [`src/app/api/v1/sync/push/route.ts`] — Pattern pré-existant. Vérifier `rowCount > 0` avant de logger "applied" dans syncOpLog.
- **Pull transaction + localCrypto.encrypt async → risque abort IDB** [`src/lib/sync/pull.ts:57`] — Pré-existant toutes entités. Extraire l'encrypt en dehors de la transaction ou utiliser SubtleCrypto synchrone.
- **delete+create même batch → 409 sur le create** [`src/app/api/v1/sync/push/route.ts`] — Faible probabilité MVP-1. Gérer dans le conflict resolver : si 409 sur create et entity soft-deleted server, re-créer avec un nouvel opId.
- **Chips statiques → dynamiques flash UX** [`src/components/quote/wizard-step-route.tsx`] — Utiliser le flag `loaded` de `useLiveRouteTemplates` pour ne pas afficher les chips statiques si Dexie est en cours de chargement (spinner ou absence de chips).
- **Curseur pull gt au lieu de gte** [`src/app/api/v1/sync/pull/route.ts:85`] — Pré-existant toutes entités. Changer en `gte` ou utiliser un curseur opaque (last-seen ID) pour éviter la race.
- **`useLiveRouteTemplates` `.filter()` scan complet** [`src/hooks/use-live-route-templates.ts:19`] — Utiliser `db.routeTemplates.where("deletedAt").equals(undefined).toArray()` (ou compound index) pour éviter le scan sur grand volume.

## Deferred from: code review de 4-5-record-client-agreement (2026-06-26)

- **Journal `quoteStatusLogs` local-only, jamais synchronisé serveur** [`src/components/quote/client-agreement-sheet.tsx:143`] — Aucune entité `quoteStatusLog` dans `SyncOpEntity`, aucune table serveur. Perdu au vidage cache / changement d'appareil. Différé à Story 3-9 (machine d'état lifecycle) — local-only conforme à l'intention "préfigure 3-9".
- **Guard serveur de transition de statut absent** [`src/app/api/v1/sync/push/route.ts`] — `quoteStatusVal` accepte `accepted` depuis n'importe quel statut antérieur ; Dev Notes imposaient le guard "client ET serveur". Différé à Story 3-9 — appartient au state machine lifecycle ; users authentifiés de confiance. Implémenter `accepted` exige `current = sent` lors de la story 3-9.
- **`clientAccordDate` parsé en UTC vs `maxDate` local** [`src/components/quote/client-agreement-sheet.tsx:125`] — `new Date("YYYY-MM-DD")` = UTC midnight comparé à un `maxDate` local → off-by-one en fuseau négatif. Non déclenchable en zone AES (UTC+0/+1). Normaliser en comparaison date-parts si extension hors AES.
- **Écriture quote + statusLog non atomique** [`src/components/quote/client-agreement-sheet.tsx:131-150`] — `db.quotes.put` et `db.quoteStatusLogs.put` sont 2 writes Dexie séparés ; crash entre les deux = devis `accepted` sans log. Envelopper dans `db.transaction` post-MVP.
- **`crypto.randomUUID` indéfini en contexte non sécurisé** [`src/components/quote/client-agreement-sheet.tsx:144`] — HTTP LAN (déploiement on-prem possible) → throw masqué en `errorGeneric`. Pattern pré-existant (outbox.ts). Polyfill si déploiement HTTP confirmé.

## Deferred from: code review de 6-4-background-sync-api (2026-06-27)

- **Clé i18n `sync.backgroundSyncComplete` sans consommateur** [`src/messages/fr-NE.json`] — Toast optionnel per spec AC3, non implémenté. Supprimer ou implémenter le toast post-MVP.
- **Pas de `pullDelta` dans `directSyncFromSW()`** [`src/app/sw.ts`] — SW path push-only ; `pull.ts` explicitement hors scope story 6-4. Évaluer si la fraîcheur des données est un problème post-MVP.
- **`vi.resetModules()` fragile avec import statique** [`src/lib/sync/outbox.test.ts`] — Fonctionne aujourd'hui car `navigator` est lu au runtime. À corriger si le module cache des refs au module scope.
- **N instances `useSyncStatus` → N syncs par TRIGGER_SYNC** [`src/hooks/use-sync-status.ts`] — Architectural ; improbable en pratique (montage unique en layout). Protéger via module-level guard si usage multi-instance confirmé.
- **Fuite Promise dans `registerBackgroundSync()` si SW stalled** [`src/lib/sync/outbox.ts:44-58`] — Fire-and-forget, aucun impact utilisateur. Ajouter `Promise.race` avec timeout si SW install stall devient un pattern connu.
- **Session expirée en mode app fermée** [`src/app/sw.ts:directSyncFromSW`] — 401 → return silencieux → ops bloquées sans notification. Session 7 jours = acceptable MVP. Considérer BroadcastChannel "session expirée" post-MVP.
- **`liveQuery` cross-contexte SW→page non réactive** [`src/app/sw.ts:directSyncFromSW`] — Writes SW via instance Dexie séparée ne triggent pas liveQuery page. `pendingCount` stale jusqu'au prochain focus/interaction. Comportement conforme spec AC3 "au prochain focus".

## Deferred from: code review de 4-4-export-share-pdf (2026-06-27)

- **Floating-point spurious extra page dans PDF multi-pages** [`src/lib/pdf-share.ts`] — Pattern identique dans `pdf-generator.ts` Story 4.1. `heightLeft` calculé avec flottants peut produire une page presque vide. Corriger post-MVP en ajoutant `if (heightLeft > 0.1)` comme guard.
- **Dexie live update pendant traversée html2canvas** [`src/components/pdf/quote-preview.tsx`] — Si une sync en arrière-plan écrit pendant la capture, le rendu peut être partiel. Architectural concern pour tous les PDF stories. Mitiger post-MVP avec snapshot local avant capture.
- **`useCORS: true` peut faire un appel réseau si logo cross-origin** [`src/lib/pdf-share.ts`] — Même paramètre accepté dans `pdf-generator.ts` Story 4.1. Si logo stocké en remote non-caché, viole AC1 offline. Résolution post-MVP : stocker logo en base64 dans Dexie.
- **iPad desktop mode reçoit guidance desktop au lieu de mobile** [`src/lib/pdf-share.ts`] — iPadOS 13+ en mode desktop envoie UA Mac. Regex ne matche pas. Faible impact sur cible principale (Niger/Mali/BF = Chrome Android). Mitiger avec `maxTouchPoints > 0` check post-MVP.
- **`isCompanyLoading` dans `disabled` non listé dans AC5** [`src/components/pdf/quote-preview.tsx`] — Introduit en Story 4.2 comme guard de sécurité (boutons désactivés si société pas encore chargée depuis Dexie). Comportement intentionnel et sûr, hors périmètre Story 4.4.
- **`NotAllowedError` (gesture timeout) affiche message `errorFallback` trompeur** [`src/components/pdf/quote-preview.tsx`] — Sur appareils lents, `html2canvas` peut prendre 3–8 s, consumant le user gesture token. `navigator.share` lève `NotAllowedError` → fallback download + "Partage impossible". Fonctionnel mais misleading. Post-MVP : détecter `NotAllowedError` spécifiquement et adapter le message.

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

## Deferred from: code review of 4-2-preview-before-generation (2026-06-27)

- **Risques pagination/canvas PDF long** [`src/components/pdf/pdf-generator.ts:35`] — pre-existing Story 4.1 scope. Les devis longs peuvent être coupés entre lignes/blocs ou atteindre les limites canvas; à traiter dans une passe pagination PDF dédiée.
- **Partage PDF duplique la logique de capture non paginée** [`src/lib/pdf-share.ts:57`] — Story 4.4 scope. Réutiliser le futur moteur paginé pour éviter une divergence téléchargement/partage.
- **Sélection de société non liée au devis si plusieurs lignes Dexie existent** [`src/hooks/use-live-company.ts:13`] — data model/sync scope. Prévoir une sélection par `quote.companyId` quand plusieurs sociétés locales deviennent possibles.
- **Logo distant `logoUrl` dépend du CORS html2canvas** [`src/components/pdf/pdf-template.tsx:89`] — pre-existing Story 4.1 scope. Favoriser `logoData` ou convertir le logo distant en data URL validée avant capture.

## Deferred from: code review of 4-3-client-signature-zone-pdf.md (2026-06-27)

- La generation du nom de fichier PDF caste `clientSnapshot.companyName` en string sans garde runtime [src/components/pdf/quote-preview.tsx:93]. Hors perimetre Story 4.3; a traiter avec les changements d'export/partage.

## Deferred from: code review of 3-10-search-filter-quotations (2026-06-27)

- `StatusBadge` indexes `STATUS_CONFIG[status]` without a fallback; an unknown or future persisted/synced status can crash quote-list rendering. Pre-existing in the Story 3.9 status component, outside the direct Story 3.10 scope.

## Deferred from: code review 3-11 / 3-9 / 3-10 (2026-06-27)

- **D1** [`duplicate-quote-button.tsx`] Données source lues hors transaction — sync pull entre lecture et `db.transaction` capturerait snapshot périmé. Fix : lire source dans la transaction. Acceptable MVP single-user.
- **D2** [`quote-list.tsx:52`] `Date.now()` dans `useMemo` filtre période — staleness au plus quelques ms, négligeable.
- **D3** [`status-change-sheet.tsx:115,134`] Double lecture quote draft→validated (validation puis mutation) — race condition si sync pull entre les deux lectures retire le client. Revalider dans la 2ème lecture pour strictement corriger.
- **D4** [`status-change-sheet.tsx:249`] `aria-pressed` sur boutons de transition de statut — `aria-current="true"` serait plus sémantique pour l'élément courant. Amélioration accessibilité.
