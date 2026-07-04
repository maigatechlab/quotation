---
story_key: 7-7-tenant-detail-page-tabs
epic_num: 7
story_num: 7
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (schema tenants/subscription_payments/tenant_events + user.tenantId + enums + PLAN_LIMITS + tenant-config.ts) — HARD"
  - "7-2-owner-dashboard-tenant-list (rôle superadmin + RBAC /owner/* + requireOwnerAuth()/requireOwnerSession() + layout owner + liste tenants + fr-NE section owner + badges + format helpers) — HARD"
  - "7-3-create-tenant-welcome-email (pattern page Server Component + tenant lookup by id) — SOFT"
  - "7-4-record-payment-mobile-money (RecordPaymentTrigger + RecordPaymentModal + recordPayment + period helpers) — HARD (montage dans onglet Abonnement)"
  - "7-5-manual-suspension-expiry-page (SuspendDialog + CancelDialog + applySuspension/applyCancellation + tenant-access) — HARD (montage dans onglet Infos)"
  - "7-6-expiry-cron-automated-reminders (génère les tenant_events affichés dans le Journal) — SOFT (données seulement)"
  - "7-8-reactivate-after-payment (bouton Réactiver — NON CRÉÉ ; placeholder/désactivé dans cette story)"
  - "7-9-tenant-user-management (gestion utilisateurs par tenant — NON CRÉÉ ; onglet Utilisateurs lit + lien vers 7-9 pour mutations)"
---

# Story 7.7 : Fiche tenant complète (onglets)

**Statut :** done

## Story

**En tant que** superadmin owner (Maiga Tech Lab),
**Je veux** une fiche détaillée du tenant sur `/owner/tenants/[id]` organisée en quatre onglets — (1) Infos générales, (2) Abonnement, (3) Utilisateurs, (4) Journal d'événements — qui orchestre et réutilise les actions déjà construites dans les stories 7-4 (enregistrement paiement) et 7-5 (suspendre/annuler),
**Afin que** je pilote chaque tenant depuis une vue unique : consulter et modifier ses infos, visualiser l'historique d'abonnement et encaisser un paiement, lister ses utilisateurs avec leur quota par plan, et auditer toutes les actions via le journal d'événements append-only — sans dupliquer la logique métier déjà implémentée.

---

## Critères d'acceptation (BDD)

**AC1 — Accès à la fiche tenant (superadmin uniquement, `params` Promise Next 16)**

```
GIVEN  un utilisateur authentifié avec rôle "superadmin"
AND    une URL /owner/tenants/<uuid>
WHEN   la page se charge (Server Component, layout owner 7-2 déjà appliqué)
THEN   requireOwnerAuth() (depuis src/lib/session, story 7-2) est appelée en tête
AND    le paramètre dynamique `params` est awaited : `const { id } = await params`
       (Next 16 — params est une Promise, NE PAS déstructurer synchrone)
AND    un SELECT tenant par id est exécuté (db.select().from(tenants).where(eq(tenants.id, id)))
AND    si le tenant n'existe PAS → notFound() (helper Next 16, page 404 standard du repo)
AND    si l'id n'est pas un UUID valide → notFound() (ou Drizzle lève → catch → notFound)

GIVEN  un utilisateur authentifié avec rôle "admin" / "commercial" / "operateur"
WHEN   il tente /owner/tenants/<uuid>
THEN   requireOwnerAuth() redirige vers "/" (dashboard client) — defense in depth proxy 7-2

GIVEN  un utilisateur non authentifié
WHEN   il tente /owner/tenants/<uuid>
THEN   requireOwnerAuth() redirige vers "/" (login)
```

**AC2 — En-tête de fiche + composant `<Tabs>` shadcn à 4 onglets (FR-Epic7 §3.3)**

```
GIVEN  le tenant T trouvé
WHEN   la fiche se rend
THEN   un en-tête affiche :
        - Nom du tenant (font-serif, text-2xl, font-semibold)
        - Slug en sous-titre gris : "{slug}.quotation.com"
        - Badge Plan (réutiliser <TenantPlanBadge> de la story 7-2)
        - Badge Statut (réutiliser <TenantStatusBadge> de la story 7-2)
        - Lien retour vers /owner/tenants (icône ChevronLeft + texte "Tenants")
AND    un composant shadcn <Tabs> (CRÉER src/components/ui/tabs.tsx — wrapper @radix-ui/react-tabs)
       est rendu avec 4 <TabsTrigger> dans l'ordre :
        1. "Infos générales"   (value="infos")
        2. "Abonnement"        (value="abonnement")
        3. "Utilisateurs"      (value="utilisateurs")
        4. "Journal"           (value="journal")
AND    l'onglet actif par défaut est piloté par searchParams : ?tab=infos|abonnement|utilisateurs|journal
       (défaut "infos") — partageable/bookmarkable
AND    chaque <TabsContent> rend un sous-composant dédié (Server Component recevant les données en props)
AND    les labels des triggers viennent de fr-NE.json section owner.tenants.detail.tabs.*
```

> **Dépendance composant :** `@radix-ui/react-tabs` n'est PAS installé dans le repo (vérifié au moment de la création). Cette story DOIT (a) ajouter la dépendance `pnpm add @radix-ui/react-tabs`, (b) créer `src/components/ui/tabs.tsx` (wrapper shadcn new-york standard), voir Dev Notes §"Tabs setup".

**AC3 — Onglet "Infos générales" (FR-Epic7 §3.3)**

```
GIVEN  l'onglet "infos" actif
WHEN   le <TenantInfosTab> se rend (Server Component, props : tenant)
THEN   il affiche :
        - Section "Identité" : nom, slug (lecture seule — slug non éditable post-création), plan (badge), statut (badge)
        - Section "Abonnement courant" (résumé compact) : subscriptionStart, subscriptionEnd,
          jours restants (via formatDaysRemaining de src/lib/owner/format.ts story 7-2),
          gracePeriodEndsAt si présent (badge orange "En grâce — expire le {date}")
        - Section "Notes internes" : textarea pré-rempli avec tenants.notes (modifiable — AC4)
        - Section "Actions" : montage des composants réutilisés :
            * <SuspendDialog> (story 7-5) — désactivé si status ∉ {active, trial}
            * <CancelDialog> (story 7-5) — désactivé si status === 'cancelled'
            * Bouton "Réactiver" : placeholder désactivé avec tooltip "Bientôt disponible (story 7-8)"
              (la réactivation est implémentée en 7-8 — NE PAS implémenter la logique ici)
AND    les états des boutons suivent AC2 de la story 7-5 (active/trial → suspend enabled, etc.)
AND    les labels viennent de fr-NE.json section owner.tenants.detail.infos.*
```

**AC4 — Édition inline plan/notes (mutation via API existante ou nouvelle route dédiée)**

```
GIVEN  le superadmin sur l'onglet "infos"
WHEN   il modifie le Plan (Select free/pro/enterprise) OU les Notes (textarea) OU le Statut
THEN   un bouton "Enregistrer" (ou auto-save onBlur pour notes) déclenche
       POST /api/v1/owner/tenants/[id] (CRÉER cette story — route PATCH/POST update minimal)
       avec body { plan?, notes?, status? } (un ou plusieurs champs)
AND    la route valide via updateTenantSchema (Zod — CRÉER dans src/lib/validation/tenant-update.ts) :
        - plan ∈ {free, pro, enterprise} (optionnel)
        - notes : string max 5000 (optionnel)
        - status ∈ {active, trial, suspended, cancelled} (optionnel — changer status ici est un shortcut
          administratif ; pour les transitions sémantiques, préférer SuspendDialog/CancelDialog/7-8)
AND    la route appelle applyTenantUpdate() (CRÉER src/lib/tenants/update-tenant.ts) :
        1. SELECT tenant → snapshot before
        2. UPDATE tenants SET <champs> WHERE id = ? RETURNING *
        3. INSERT tenant_events eventType='plan_changed' (si plan modifié) OU 'updated' (si notes/status)
           avec before/after, actorId, note="Modifié par {actorEmail}"
        4. retourne le tenant mis à jour
AND    le changement de plan met à jour maxUsers du tenant ? NON — maxUsers reste lu depuis PLAN_LIMITS
       (tenant-config.ts story 7-1) à la volée, on ne stocke PAS maxUsers dans la table
       (le SELECT qui calcule le quota AC7 lit PLAN_LIMITS[plan].maxUsers dynamiquement)
AND    réponse 200 { tenant } puis router.refresh() côté client (toast success)
AND    si status='cancelled' est posé via ce shortcut → l'enforcement proxy 7-1 s'applique immédiatement
       (documenté : utiliser CancelDialog pour une annulation propre avec email + event dédiés)
```

> **NOTE scope :** cette route update est volontairement minimale (plan/notes/status bruts). Les transitions sémantiques (suspend avec motif+email, cancel avec slug-check+email, reactivate après paiement) passent par les routes dédiées 7-5/7-8. Le shortcut status est documenté comme "usage administratif avancé".

**AC5 — Onglet "Abonnement" (FR-Epic7 §3.3 — timeline + période courante + historique paiements)**

```
GIVEN  l'onglet "abonnement" actif
WHEN   le <TenantSubscriptionTab> se rend (Server Component, props : tenant, payments[])
THEN   il affiche TROIS sous-sections empilées :

  (a) "Période courante" — carte :
        - subscriptionStart → subscriptionEnd (dates formatées FR via formatDateFr)
        - cycle : déduit du dernier payment.billingCycle (ou "—" si aucun paiement)
        - jours restants : formatDaysRemaining(subscriptionEnd) avec tone color (vert/orange/rouge)
        - si gracePeriodEndsAt : badge orange "Période de grâce — fin {date}"
        - si status='trial' : badge "Trial — fin {trialEndsAt}"

  (b) "Timeline visuelle" — FR-Epic7 §3.3 "Timeline visuelle de l'abonnement (périodes payées en vert, gaps en rouge)" :
        - rendu en CSS divs (PAS de lib chart — assumption non-interactive)
        - chaque payment devient un segment vert (largeur proportionnelle à la durée periodStart→periodEnd)
        - les gaps entre periodEnd du paiement N et periodStart du paiement N+1 deviennent des segments rouges
        - segments triés par periodStart ASC (chronologique gauche→droite)
        - chaque segment : title HTML = "{méthode} {montant} XOF — {periodStart} → {periodEnd}"
        - un axe minimal : date de début (premier payment.periodStart) à date de fin (max(now, dernier periodEnd))
        - si 0 paiement → message "Aucun paiement enregistré" + suggestion d'utiliser le bouton AC6

  (c) "Historique des paiements" — tableau HTML natif (pattern TenantsTable story 7-2) :
        colonnes : Date (paidAt), Méthode (badge paymentMethod), Montant (formatFcfa),
                   Référence (paymentReference ou "—"), Période couverte (periodStart→periodEnd),
                   Cycle (billingCycle), Confirmé par (JOIN user sur confirmedBy → email),
        tri : paidAt DESC (plus récent en premier)
        si 0 paiement → ligne "Aucun paiement" (colspan)

AND    le bouton "Enregistrer un paiement" est monté via <RecordPaymentTrigger tenant={...} />
       (COMPOSANT RÉUTILISÉ de la story 7-4 — NE PAS réimplémenter le modal ni la route POST .../payments)
       placé en haut de l'onglet (à droite du titre "Abonnement")
AND    après enregistrement (7-4), router.refresh() re-fetch ce Server Component → la timeline + le tableau
       reflètent le nouveau paiement automatiquement
```

> **Dépendance composant :** `<RecordPaymentTrigger>` et `<RecordPaymentModal>` sont créés par la story 7-4. Cette story les IMPORTE et les MONTE. Si 7-4 n'est pas implémentée au moment du dev, laisser un placeholder bouton désactivé avec `TODO(story-7-4)` (cf. Dev Notes — mode dégradé).

**AC6 — Données d'abonnement : queries serveur (JOIN subscription_payments + user)**

```
GIVEN  la page /owner/tenants/[id]?tab=abonnement
WHEN   le Server Component récupère les données
THEN   deux queries parallélisées (Promise.all) :
        1. getTenantPayments(tenantId) : SELECT * FROM subscription_payments
           WHERE tenant_id = ? ORDER BY paid_at DESC
           + JOIN LEFT user ON subscription_payments.confirmed_by = user.id
           pour résoudre "Confirmé par" → user.email
        2. getCurrentPeriod(tenant) : pure fn calculant la période courante
           depuis tenant.subscriptionStart/End + dernier payment.billingCycle
AND    les queries utilisent les helpers du module src/lib/owner/ (CRÉER tenant-detail.ts) ou
       étendent src/lib/owner/metrics.ts (story 7-2) — préférer un module dédié tenant-detail.ts
       pour ne pas surcharger metrics.ts
AND    pas de N+1 : un seul SELECT sur subscription_payments avec LEFT JOIN user
AND    les montants sont des integer FCFA (jamais float), formatés via formatFcfa à l'affichage
```

**AC7 — Onglet "Utilisateurs" (FR-Epic7 §3.3 — liste + quota par plan)**

```
GIVEN  l'onglet "utilisateurs" actif
WHEN   le <TenantUsersTab> se rend (Server Component, props : tenant, users[], quota)
THEN   il affiche :

  (a) En-tête quota : "X / Y utilisateurs" où
        - X = COUNT(user WHERE tenantId = tenant.id)              (actifs — pas de soft-delete en MVP)
        - Y = PLAN_LIMITS[tenant.plan].maxUsers                   (depuis tenant-config.ts story 7-1)
        - barre de progression (div + width %) — couleur :
          * < 80% → vert (status-accepte)
          * 80-99% → orange (status-valide)
          * = 100% → rouge (status-annule) "Quota atteint"
        - si X > Y (dépassement — cas edge après downgrade de plan) → badge rouge "Quota dépassé"

  (b) Bouton "Ajouter un utilisateur" : LIEN vers /owner/tenants/[id]/utilisateurs/nouveau
       (route implémentée en story 7-9 — placeholder désactivé + tooltip "Bientôt (story 7-9)" tant que 7-9 n'existe pas)

  (c) Tableau HTML natif des users du tenant :
        colonnes : Nom (user.name), Email (user.email), Rôle (badge admin/commercial/operateur),
                   Dernière connexion (MAX(session.expiresAt) WHERE userId — OU user.updatedAt si pas de session),
                   Statut (compte vérifié ? "Actif" : "Email non vérifié"),
                   Actions (bouton "Révoquer" → route 7-9, placeholder désactivé ici)
        tri : user.createdAt ASC (plus anciens en premier — l'admin créé en 7-3 en tête)
        si 0 user → "Aucun utilisateur" + suggestion (lien 7-9)

AND    la query : SELECT * FROM user WHERE tenantId = ? LEFT JOIN (SELECT userId, MAX(expiresAt) lastSeen
                  FROM session GROUP BY userId) s ON s.userId = user.id ORDER BY user.createdAt ASC
AND    "Dernière connexion" : si s.lastSeen existe et <= now → formatDateFr(lastSeen), sinon "Jamais"
AND    les boutons "Ajouter"/"Révoquer" sont des placeholders désactivés (story 7-9 non créée)
       avec tooltip "Bientôt disponible (story 7-9)" — NE PAS implémenter la logique d'ajout/révocation ici
```

> **NOTE scope :** cet onglet est en LECTURE (liste + quota). Toute mutation (ajout/révocation/invitation) est implémentée en story 7-9. Ici on expose la donnée + un lien vers la future route 7-9.

**AC8 — Onglet "Journal d'événements" (FR-Epic7 §3.3 — append-only, filtrable)**

```
GIVEN  l'onglet "journal" actif
WHEN   le <TenantJournalTab> se rend (Server Component, props : tenant, events[], eventTypeFilter)
THEN   il affiche :

  (a) Barre de filtre : <Select> "Type d'événement" piloté par searchParams ?event=
        options : (tous), created, activated, suspended, reactivated, cancelled,
        payment_recorded, plan_changed, user_added, reminder_sent
        (les valeurs correspondent à tenant_events.event_type du schema 7-1 + Epic 7 §2)
        changement → router.push(`?tab=journal&event=${value}`) — server-driven, pas de state client

  (b) Timeline append-only des events filtrés :
        chaque event : icône Lucide (mapping eventType→icon, table dans fr-NE ou composant),
        libellé FR (owner.events.{eventType}), note, actor (JOIN user sur actorId → email ou "system"),
        date relative (formatRelativeDate de story 7-2) + date absolue au hover (title HTML)
        tri : createdAt DESC (plus récent en premier)

  (c) Mention "Append-only" : footer "Ce journal est immuable. Aucun événement ne peut être modifié ni supprimé."

AND    la query : SELECT tenant_events.*, user.email AS actorEmail FROM tenant_events
                  LEFT JOIN user ON tenant_events.actor_id = user.id
                  WHERE tenant_id = ? [AND event_type = ?] ORDER BY created_at DESC LIMIT 200
       (limite 200 — pagination DEFERRED, le volume reste faible en MVP)
AND    l'onglet est LECTURE SEULE — aucun bouton édition/suppression
AND    si 0 event → "Aucun événement enregistré pour ce tenant"
```

> **NOTE `actorId='system'` :** le cron 7-6 insère des events avec `actorId='system'` (constante spéciale, pas un user_id réel). Le LEFT JOIN user retourne NULL → afficher le libellé "Système" au lieu de l'email.

**AC9 — Navigation inter-onglets via searchParams (partageable, server-driven)**

```
GIVEN  le superadmin sur /owner/tenants/[id]?tab=abonnement
WHEN   il clique le trigger "Journal"
THEN   l'URL devient /owner/tenants/[id]?tab=journal (router.push côté client dans le wrapper Tabs)
AND    la page re-render server-side avec le bon onglet actif ET les bonnes données
AND    si on ouvre l'URL directement (bookmark/partage) → le bon onglet s'affiche au chargement initial
AND    les autres searchParams (?event= pour le journal, ?focus= pour la liste 7-2) sont préservés
       lors du changement d'onglet (ne pas écraser la query string)

GIVEN  le tableau de bord owner (story 7-2) ou la liste des tenants
WHEN   un lien pointe vers /owner/tenants/[id]?tab=abonnement
THEN   l'onglet Abonnement s'ouvre directement (deep-link)
       (utile pour le bouton "Enregistrer paiement" depuis la liste 7-2 qui peut cibler ?tab=abonnement)
```

**AC10 — Qualité & tests**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression (334+ tests)
AND    pnpm build passe sans erreur
AND    tests unitaires (Vitest) couvrent :
        - getTenantPayments() : mock db, vérifie JOIN user, tri DESC, gestion confirmedBy null
        - getCurrentPeriod() : calcul période depuis tenant + dernier payment.billingCycle
        - getTenantUsers() : mock db, COUNT + JOIN session lastSeen, tri ASC
        - getTenantEvents() : mock db, filtre event_type, LEFT JOIN user actorEmail, actorId='system' → null
        - computeUserQuota() : active/max par plan, cas dépassement, cas plan free (max=1)
        - buildSubscriptionTimeline() : pure fn, segments verts/rouges, gaps détectés, tri chronologique
        - applyTenantUpdate() (mock db) : update plan + event 'plan_changed', update notes + event 'updated',
          clause WHERE id, retourne tenant
        - updateTenantSchema (Zod) : plan invalide rejeté, notes > 5000 rejeté, champs optionnels OK
AND    tests E2E (Playwright) couvrent :
        - superadmin ouvre /owner/tenants/[id] → 4 onglets visibles, "Infos" actif par défaut
        - clic "Abonnement" → URL ?tab=abonnement, timeline + tableau paiements + bouton RecordPaymentTrigger
        - clic "Journal" → timeline events affichée, filtre par event_type modifie les rows
        - clic "Utilisateurs" → tableau users + quota "X/Y" + barre progression
        - édition plan (Select) → toast success + re-render avec nouveau badge plan
        - édition notes → sauvegarde + refresh
        - non-superadmin → redirect / depuis /owner/tenants/[id]
        - tenant inexistant (/owner/tenants/<uuid-invalide>) → page 404 (notFound)
        - deep-link ?tab=journal → onglet Journal actif au chargement
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/owner/tenants/[id]/page.tsx` — CRÉER : Server Component principal (auth + fetch + 4 Tabs)
- `src/components/ui/tabs.tsx` — CRÉER : wrapper shadcn @radix-ui/react-tabs (NEW DEPENDENCY)
- `src/components/owner/tenant-detail-tabs.tsx` — CRÉER : Client Component wrapper `<Tabs>` contrôlé par searchParams (state sync URL)
- `src/components/owner/tenant-detail/infos-tab.tsx` — CRÉER : Server Component onglet Infos
- `src/components/owner/tenant-detail/subscription-tab.tsx` — CRÉER : Server Component onglet Abonnement
- `src/components/owner/tenant-detail/users-tab.tsx` — CRÉER : Server Component onglet Utilisateurs
- `src/components/owner/tenant-detail/journal-tab.tsx` — CRÉER : Server Component onglet Journal
- `src/components/owner/tenant-detail/subscription-timeline.tsx` — CRÉER : composant visuel timeline CSS (périodes vertes / gaps rouges)
- `src/components/owner/tenant-detail/user-quota-bar.tsx` — CRÉER : barre de progression quota (X/Y)
- `src/components/owner/tenant-detail/edit-notes-form.tsx` — CRÉER : Client Component (textarea + submit notes)
- `src/components/owner/tenant-detail/edit-plan-form.tsx` — CRÉER : Client Component (Select plan + submit)
- `src/lib/owner/tenant-detail.ts` — CRÉER : `getTenantPayments`, `getCurrentPeriod`, `getTenantUsers`, `getTenantEvents`, `computeUserQuota`
- `src/lib/owner/subscription-timeline.ts` — CRÉER : `buildSubscriptionTimeline(payments)` (pure, segments vert/rouge)
- `src/lib/tenants/update-tenant.ts` — CRÉER : `applyTenantUpdate(params)` (update plan/notes/status + event audit)
- `src/lib/validation/tenant-update.ts` — CRÉER : `updateTenantSchema` (Zod — plan/notes/status optionnels)
- `src/app/api/v1/owner/tenants/[id]/route.ts` — CRÉER : PATCH/POST update minimal (valide → applyTenantUpdate → 200/400/404)
- `src/messages/fr-NE.json` — UPDATE : section `owner.tenants.detail` (tabs, infos, abonnement, utilisateurs, journal, events labels, quota)
- Tests unitaires : `tenant-detail.test.ts`, `subscription-timeline.test.ts`, `update-tenant.test.ts`
- Tests E2E : `tests/e2e/owner-tenant-detail.spec.ts`
- `package.json` — UPDATE : ajouter `@radix-ui/react-tabs` dépendance

**EXCLU (ne pas modifier — hors périmètre) :**
- `src/lib/schema.ts` → tables `tenants`, `subscription_payments`, `tenant_events`, `user.tenantId` → **déjà créés par story 7-1**
- Rôle `superadmin` + `requireOwnerAuth()`/`requireOwnerSession()` + layout `/owner/layout.tsx` + liste `/owner/tenants/page.tsx` + badges → **story 7-2** (cette story réutilise badges et helpers, NE PAS recréer)
- `<RecordPaymentTrigger>` + `<RecordPaymentModal>` + route POST .../payments + `recordPayment()` + `calculatePeriodFromCycle` → **story 7-4** (cette story IMPORTE RecordPaymentTrigger et le MONTE dans l'onglet Abonnement)
- `<SuspendDialog>` + `<CancelDialog>` + routes .../suspend + .../cancel + `applySuspension`/`applyCancellation` + `tenant-access.ts` → **story 7-5** (cette story IMPORTE les dialogs et les MONTE dans l'onglet Infos)
- Cron expiration + rappels → **story 7-6** (génère les events lus dans le Journal)
- Réactivation autonome (bouton "Réactiver") → **story 7-8** (placeholder désactivé ici)
- Gestion utilisateurs (ajouter/révoquer/inviter) → **story 7-9** (boutons placeholder désactivés ici, onglet Utilisateurs = lecture + lien)
- Création de tenant → **story 7-3** (inchangée)
- Stripe webhook / rapports / paramètres plateforme → **stories 7-10/7-11/7-12**
- `src/lib/email.ts`, `src/lib/auth.ts`, `src/lib/permissions.ts`, `src/proxy.ts` → inchangés
- `src/app/owner/layout.tsx` → inchangé (hérite du layout owner 7-2)

---

## Tâches / Sous-tâches

### T1 — Installer `@radix-ui/react-tabs` + créer `src/components/ui/tabs.tsx`

- [x] `pnpm add @radix-ui/react-tabs` (compatible avec les autres @radix-ui déjà installés — `@radix-ui/react-dialog` 1.1.15 etc.)
- [x] Créer `src/components/ui/tabs.tsx` (wrapper shadcn new-york standard — cf. https://ui.shadcn.com/docs/components/radix/tabs) :
  ```tsx
  "use client";
  import * as React from "react";
  import * as TabsPrimitive from "@radix-ui/react-tabs";
  import { cn } from "@/lib/utils";

  export const Tabs = TabsPrimitive.Root;
  export const TabsList = React.forwardRef<
    React.ComponentRef<typeof TabsPrimitive.List>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
  >(({ className, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-xl bg-surface-alt p-1 text-text-muted",
        className
      )}
      {...props}
    />
  ));
  TabsList.displayName = TabsPrimitive.List.displayName;

  export const TabsTrigger = React.forwardRef<
    React.ComponentRef<typeof TabsPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
  >(({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
        "data-[state=active]:bg-surface data-[state=active]:text-text-primary data-[state=active]:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  ));
  TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

  export const TabsContent = React.forwardRef<
    React.ComponentRef<typeof TabsPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
  >(({ className, ...props }, ref) => (
    <TabsPrimitive.Content
      ref={ref}
      className={cn("mt-4 focus-visible:outline-none", className)}
      {...props}
    />
  ));
  TabsContent.displayName = TabsPrimitive.Content.displayName;
  ```
- [x] **NOTE — design tokens :** utiliser `bg-surface-alt`, `bg-surface`, `text-text-primary`, `text-text-muted`, `ring-brand-navy` (cf. globals.css tokens + DESIGN.md). Cohérent avec les autres primitives shadcn du repo.
- [x] `pnpm typecheck` — zéro erreur

### T2 — CRÉER `src/lib/owner/tenant-detail.ts` (AC6, AC7, AC8 — queries serveur)

- [x] Imports :
  ```ts
  import { eq, and, desc, asc, sql } from "drizzle-orm";
  import { db } from "@/lib/db";
  import { tenants, subscriptionPayments, tenantEvents, user, session } from "@/lib/schema";
  import { PLAN_LIMITS } from "@/lib/tenants/tenant-config"; // story 7-1
  ```
- [x] `getTenantById(id: string)` :
  ```ts
  export async function getTenantById(id: string) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant ?? null;
  }
  ```
- [x] `getTenantPayments(tenantId: string)` (AC6) :
  ```ts
  // SELECT sp.*, u.email AS confirmer_email FROM subscription_payments sp
  // LEFT JOIN user u ON sp.confirmed_by = u.id
  // WHERE sp.tenant_id = ? ORDER BY sp.paid_at DESC
  export async function getTenantPayments(tenantId: string) {
    return await db.select({
      id: subscriptionPayments.id,
      amount: subscriptionPayments.amount,
      currency: subscriptionPayments.currency,
      paymentMethod: subscriptionPayments.paymentMethod,
      paymentReference: subscriptionPayments.paymentReference,
      paidAt: subscriptionPayments.paidAt,
      periodStart: subscriptionPayments.periodStart,
      periodEnd: subscriptionPayments.periodEnd,
      billingCycle: subscriptionPayments.billingCycle,
      confirmedBy: subscriptionPayments.confirmedBy,
      confirmerEmail: user.email,
    })
      .from(subscriptionPayments)
      .leftJoin(user, eq(subscriptionPayments.confirmedBy, user.id))
      .where(eq(subscriptionPayments.tenantId, tenantId))
      .orderBy(desc(subscriptionPayments.paidAt));
  }
  ```
- [x] `getCurrentPeriod(tenant, payments)` (AC5a — pure fn) :
  ```ts
  export function getCurrentPeriod(
    tenant: { subscriptionStart: Date | null; subscriptionEnd: Date | null; status: string; trialEndsAt: Date | null; gracePeriodEndsAt: Date | null },
    payments: { billingCycle: "monthly" | "annual" }[]
  ) {
    const lastPayment = payments[0]; // déjà trié DESC par getTenantPayments
    return {
      start: tenant.subscriptionStart,
      end: tenant.subscriptionEnd,
      cycle: lastPayment?.billingCycle ?? null,
      trialEndsAt: tenant.trialEndsAt,
      gracePeriodEndsAt: tenant.gracePeriodEndsAt,
      status: tenant.status,
    };
  }
  ```
- [x] `getTenantUsers(tenantId: string)` (AC7) :
  ```ts
  // SELECT u.*, s.last_seen FROM user u
  // LEFT JOIN (SELECT user_id, MAX(expires_at) AS last_seen FROM session WHERE user_id IN (...) GROUP BY user_id) s
  //   ON s.user_id = u.id
  // WHERE u.tenant_id = ? ORDER BY u.created_at ASC
  export async function getTenantUsers(tenantId: string) {
    return await db.select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastSeen: sql<Date | null>`(SELECT MAX(${session.expiresAt}) FROM ${session} WHERE ${session.userId} = ${user.id})`,
    })
      .from(user)
      .where(eq(user.tenantId, tenantId))
      .orderBy(asc(user.createdAt));
  }
  ```
  **NOTE sous-requête corrélée :** Drizzle ne supporte pas facilement GROUP BY + JOIN LATERAL pour lastSeen. Préférer une sous-requête corrélée `sql\`(SELECT MAX(...) FROM session WHERE ...)\`` (pattern déjà utilisé en story 7-2 pour activeUsers). Pour N users, c'est N sous-requêtes — acceptable en MVP (< 20 users/tenant).
- [x] `computeUserQuota(tenant, activeUsers: number)` (AC7a — pure fn) :
  ```ts
  export function computeUserQuota(
    tenant: { plan: "free" | "pro" | "enterprise" },
    activeUsers: number
  ): { active: number; max: number; pct: number; tone: "ok" | "warn" | "full" | "exceeded" } {
    const max = PLAN_LIMITS[tenant.plan].maxUsers;
    const pct = max === 0 ? 0 : Math.round((activeUsers / max) * 100);
    const tone = activeUsers > max ? "exceeded" : pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
    return { active: activeUsers, max, pct, tone };
  }
  ```
- [x] `getTenantEvents(tenantId, eventTypeFilter?)` (AC8) :
  ```ts
  export async function getTenantEvents(tenantId: string, eventType?: string) {
    const conditions = [eq(tenantEvents.tenantId, tenantId)];
    if (eventType && eventType !== "all") {
      conditions.push(eq(tenantEvents.eventType, eventType));
    }
    return await db.select({
      id: tenantEvents.id,
      eventType: tenantEvents.eventType,
      actorId: tenantEvents.actorId,
      before: tenantEvents.before,
      after: tenantEvents.after,
      note: tenantEvents.note,
      createdAt: tenantEvents.createdAt,
      actorEmail: user.email,
    })
      .from(tenantEvents)
      .leftJoin(user, eq(tenantEvents.actorId, user.id))
      .where(and(...conditions))
      .orderBy(desc(tenantEvents.createdAt))
      .limit(200);
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T3 — CRÉER `src/lib/owner/subscription-timeline.ts` (AC5b — pure fn)

- [x] Type :
  ```ts
  export interface TimelineSegment {
    kind: "paid" | "gap";
    start: Date;
    end: Date;
    // pour "paid" :
    amount?: number;
    paymentMethod?: string;
    paymentReference?: string | null;
    // pour "gap" :
    durationDays?: number;
  }
  export interface SubscriptionTimeline {
    segments: TimelineSegment[];
    axisStart: Date | null;  // premier periodStart
    axisEnd: Date | null;    // max(now, dernier periodEnd)
    totalPaidDays: number;
    totalGapDays: number;
  }
  ```
- [x] `buildSubscriptionTimeline(payments: { periodStart: Date; periodEnd: Date; amount: number; paymentMethod: string; paymentReference: string | null }[])` :
  - Trier payments par `periodStart` ASC (chronologique)
  - Pour chaque payment → segment "paid" (`start=periodStart`, `end=periodEnd`, montant/méthode/référence)
  - Entre deux payments consécutifs, si `payments[i+1].periodStart > payments[i].periodEnd` → segment "gap" (`start=payments[i].periodEnd`, `end=payments[i+1].periodStart`)
  - `axisStart = payments[0].periodStart` (null si 0 payment)
  - `axisEnd = max(new Date(), payments[last].periodEnd)` (null si 0 payment)
  - `totalPaidDays` = somme des durées "paid" en jours (Math.round((end-start)/(86400000)))
  - `totalGapDays` = somme des durées "gap" en jours
  - **Edge — chevauchement :** si `payments[i+1].periodStart < payments[i].periodEnd` (périodes qui se chevauchent), ne PAS créer de gap négatif ; juste juxtaposer les segments paid (l'utilisateur verra le chevauchement visuellement). Documenter.
- [x] **CRITIQUE — immutabilité :** ne pas muter l'input `payments` (cloner les dates avec `new Date()` dans les segments).
- [x] `pnpm typecheck` — zéro erreur

### T4 — CRÉER `src/lib/tenants/update-tenant.ts` (AC4 — orchestration update)

- [x] Signature :
  ```ts
  export interface UpdateTenantParams {
    tenantId: string;
    input: { plan?: "free" | "pro" | "enterprise"; notes?: string; status?: "active" | "trial" | "suspended" | "cancelled" };
    actorId: string;
    actorEmail: string;
  }
  export interface UpdateTenantResult {
    tenant: /* row tenants */;
    changes: ("plan" | "notes" | "status")[];
  }
  export async function applyTenantUpdate(params: UpdateTenantParams): Promise<UpdateTenantResult>
  ```
- [x] Logique :
  1. **SELECT tenant** → 404 (`TenantNotFoundError`) si absent
  2. **Snapshot before** : `{ plan, notes, status }`
  3. **Build update payload** : uniquement les champs présents dans `input` (ne pas écraser les absents — `exactOptionalPropertyTypes`)
  4. **UPDATE atomique** :
     ```ts
     const [updated] = await db.update(tenants)
       .set({ ...payload, updatedAt: new Date() })
       .where(eq(tenants.id, params.tenantId))
       .returning();
     if (!updated) throw new TenantNotFoundError(params.tenantId);
     ```
  5. **Déterminer les changements** : comparer before/after pour plan/notes/status → `changes: string[]`
  6. **Logger l'event** (best-effort) :
     - si `plan` modifié → eventType `"plan_changed"`
     - sinon → eventType `"updated"` (notes et/ou status)
     - `before`, `after` (jsonb avec uniquement les champs modifiés), `note="Modifié par ${actorEmail}"`
     ```ts
     try {
       await db.insert(tenantEvents).values({
         tenantId: params.tenantId,
         eventType: changes.includes("plan") ? "plan_changed" : "updated",
         actorId: params.actorId,
         before: snapshotBefore,
         after: { /* champs modifiés uniquement */ },
         note: `Modifié par ${params.actorEmail}`,
       });
     } catch (err) {
       console.error("tenant_events (update) insert failed", err);
     }
     ```
  7. **Retourner** `{ tenant: updated, changes }`
- [x] **NOTE — pas d'email** : cette route update est administrative (pas de notification client). Les transitions sémantiques (suspend/cancel/reactivate) notifient via leurs routes dédiées 7-5/7-8.
- [x] **Helper `TenantNotFoundError`** : réutiliser depuis story 7-5 ou dupliquer (cohérence).
- [x] `pnpm typecheck` — zéro erreur

### T5 — CRÉER `src/lib/validation/tenant-update.ts` (AC4)

- [x] `updateTenantSchema = z.object({...})` :
  ```ts
  {
    plan: z.enum(["free", "pro", "enterprise"]).optional(),
    notes: z.string().trim().max(5000, "Les notes ne doivent pas dépasser 5000 caractères").optional(),
    status: z.enum(["active", "trial", "suspended", "cancelled"]).optional(),
  }
  ```
- [x] **superRefine :** au moins un des trois champs doit être présent (sinon update vide → 400 `"Aucun champ à mettre à jour"`).
- [x] Exporter `UpdateTenantInput = z.infer<typeof updateTenantSchema>`.
- [x] `pnpm typecheck` — zéro erreur

### T6 — CRÉER `src/app/api/v1/owner/tenants/[id]/route.ts` (AC4)

- [x] `export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> })` :
  1. `const guard = await requireOwnerSession()` (story 7-2) → 401/403 si pas superadmin
  2. `const { id } = await params` (Next 16 Promise)
  3. `const parsed = updateTenantSchema.safeParse(await req.json())` → 400 si invalide (`apiError("VALIDATION_FAILED", ..., fields)`)
  4. `try { const result = await applyTenantUpdate({ tenantId: id, input: parsed.data, actorId: guard.session.user.id, actorEmail: guard.session.user.email }); return NextResponse.json(result, { status: 200 }); }`
  5. `catch (err)` :
     - `TenantNotFoundError` → 404 `apiError("NOT_FOUND", ...)`
     - sinon → 500 `apiError("INTERNAL_ERROR", ...)`
- [x] NE PAS logger `input.notes` en clair (peut être sensible).
- [x] `pnpm typecheck` — zéro erreur

### T7 — CRÉER `src/components/owner/tenant-detail-tabs.tsx` (AC2, AC9 — Client Component wrapper Tabs)

- [x] `"use client"` première ligne
- [x] Props : `{ tenant, payments, users, quota, events, eventTypes, initialTab }` (données passées par le Server Component parent — pas de fetch client)
- [x] Utiliser `useRouter`, `useSearchParams`, `usePathname` de `next/navigation` pour synchroniser l'onglet avec `?tab=` :
  ```tsx
  "use client";
  import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
  import { useSearchParams, useRouter, usePathname } from "next/navigation";
  // ... imports des 4 sous-composants tab

  export function TenantDetailTabs({ tenant, payments, users, quota, events, eventTypes, initialTab }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentTab = searchParams.get("tab") ?? initialTab ?? "infos";

    function onTabChange(value: string) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", value);
      router.push(`${pathname}?${params.toString()}`);
    }

    return (
      <Tabs value={currentTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="infos">{/* t infos */}</TabsTrigger>
          <TabsTrigger value="abonnement">{/* t abonnement */}</TabsTrigger>
          <TabsTrigger value="utilisateurs">{/* t utilisateurs */}</TabsTrigger>
          <TabsTrigger value="journal">{/* t journal */}</TabsTrigger>
        </TabsList>
        <TabsContent value="infos"><InfosTab tenant={tenant} /></TabsContent>
        <TabsContent value="abonnement"><SubscriptionTab tenant={tenant} payments={payments} /></TabsContent>
        <TabsContent value="utilisateurs"><UsersTab tenant={tenant} users={users} quota={quota} /></TabsContent>
        <TabsContent value="journal"><JournalTab tenant={tenant} events={events} eventTypes={eventTypes} /></TabsContent>
      </Tabs>
    );
  }
  ```
- [x] **NOTE — Suspense boundary :** `useSearchParams` en Next 16 requiert un `<Suspense>` boundary autour du composant qui l'utilise. Le wrapper dans le `page.tsx` parent avec `<Suspense fallback={<TabsSkeleton />}>`.
- [x] Les labels des triggers viennent de `useTranslations("owner.tenants.detail.tabs.*")`.
- [x] `pnpm typecheck` — zéro erreur

### T8 — CRÉER `src/app/owner/tenants/[id]/page.tsx` (AC1, AC2 — Server Component principal)

- [x] Server Component :
  ```tsx
  import { Suspense } from "react";
  import { notFound } from "next/navigation";
  import { requireOwnerAuth } from "@/lib/session";
  import { getTenantById, getTenantPayments, getTenantUsers, computeUserQuota, getTenantEvents, getCurrentPeriod } from "@/lib/owner/tenant-detail";
  import { TenantStatusBadge, TenantPlanBadge } from "@/components/owner/tenant-status-badge"; // + tenant-plan-badge
  import { TenantDetailTabs } from "@/components/owner/tenant-detail-tabs";
  import { TabsSkeleton } from "@/components/owner/tabs-skeleton";

  interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }

  export const dynamic = "force-dynamic"; // évite stale searchParams PPR Next 16

  export default async function TenantDetailPage({ params, searchParams }: PageProps) {
    const { id } = await params;
    const sp = await searchParams;
    await requireOwnerAuth(); // redirect si non-superadmin

    const tenant = await getTenantById(id);
    if (!tenant) notFound();

    const initialTab = (typeof sp.tab === "string" ? sp.tab : "infos") as "infos" | "abonnement" | "utilisateurs" | "journal";
    const eventType = typeof sp.event === "string" ? sp.event : undefined;

    // Paralléliser les queries
    const [payments, users, events] = await Promise.all([
      getTenantPayments(id),
      getTenantUsers(id),
      getTenantEvents(id, eventType),
    ]);
    const quota = computeUserQuota({ plan: tenant.plan }, users.length);

    return (
      <div className="flex flex-col gap-6">
        {/* En-tête */}
        <div>
          <a href="/owner/tenants" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
            <ChevronLeft className="size-3" /> Tenants
          </a>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-serif text-2xl font-semibold text-text-primary">{tenant.name}</h1>
            <TenantPlanBadge plan={tenant.plan} />
            <TenantStatusBadge status={tenant.status} />
          </div>
          <p className="text-xs text-text-muted">{tenant.slug}.quotation.com</p>
        </div>

        {/* Tabs (Suspense pour useSearchParams) */}
        <Suspense fallback={<TabsSkeleton />}>
          <TenantDetailTabs
            tenant={tenant}
            payments={payments}
            users={users}
            quota={quota}
            events={events}
            eventTypes={EVENT_TYPES}
            initialTab={initialTab}
          />
        </Suspense>
      </div>
    );
  }
  ```
- [x] **EVENT_TYPES** : constante exportée (table des types d'events pour le filtre du Journal) — `["all","created","activated","suspended","reactivated","cancelled","payment_recorded","plan_changed","user_added","reminder_sent","updated"]`.
- [x] `notFound()` de Next 16 active automatiquement `not-found.tsx` le plus proche (vérifier qu'il existe au niveau `src/app/owner/not-found.tsx` OU hérite du `src/app/not-found.tsx` racine — si pas de not-found dédié owner, le global suffit).
- [x] `pnpm typecheck` — zéro erreur

### T9 — CRÉER `src/components/owner/tenant-detail/infos-tab.tsx` (AC3, AC4 — onglet Infos)

- [x] Server Component recevant `{ tenant }`.
- [x] Layout en sections (cf. AC3) :
  - Section "Identité" : nom (lecture), slug (lecture), badges plan/status, "Créé le {createdAt}".
  - Section "Abonnement courant" : période courante (dates), jours restants, grace/trial badges.
  - Section "Notes internes" : monter `<EditNotesForm initialNotes={tenant.notes} tenantId={tenant.id} />` (Client Component).
  - Section "Plan" : monter `<EditPlanForm currentPlan={tenant.plan} tenantId={tenant.id} />` (Client Component).
  - Section "Actions" :
    ```tsx
    <div className="flex flex-wrap gap-2">
      <SuspendDialog tenantId={tenant.id} tenantName={tenant.name} disabled={tenant.status !== "active" && tenant.status !== "trial"} />
      <CancelDialog tenantId={tenant.id} tenantName={tenant.name} tenantSlug={tenant.slug} disabled={tenant.status === "cancelled"} />
      {/* Réactiver : placeholder désactivé — story 7-8 */}
      <Button variant="outline" disabled title="Bientôt disponible (story 7-8)">Réactiver</Button>
    </div>
    ```
  - **IMPORTS réutilisés :** `SuspendDialog`, `CancelDialog` depuis `src/app/owner/tenants/[id]/suspend-dialog.tsx` et `cancel-dialog.tsx` (story 7-5). Si ces composants n'existent pas encore (7-5 non implémentée), laisser des placeholders désactivés avec `TODO(story-7-5)`.
- [x] Labels depuis `getTranslations("owner.tenants.detail.infos.*")` (Server Component → `getTranslations` pas `useTranslations`).
- [x] `pnpm typecheck` — zéro erreur

### T10 — CRÉER `src/components/owner/tenant-detail/edit-notes-form.tsx` + `edit-plan-form.tsx` (AC4 — Client Components)

- [x] **`edit-notes-form.tsx`** — `"use client"`, props `{ tenantId, initialNotes }` :
  - Textarea contrôlé (default = initialNotes ?? "")
  - Bouton "Enregistrer" (isPending)
  - `handleSubmit` : `PATCH /api/v1/owner/tenants/${tenantId}` avec body `{ notes }` → toast success + `router.refresh()`
  - Gestion erreurs 400 (notes trop longues) → erreur en ligne
- [x] **`edit-plan-form.tsx`** — `"use client"`, props `{ tenantId, currentPlan }` :
  - Select (free/pro/enterprise) contrôlé
  - Auto-submit sur changement (ou bouton "Appliquer") → `PATCH ...` avec body `{ plan }` → toast + refresh
  - Gestion erreurs
- [x] **Pattern existant à imiter :** `src/app/owner/tenants/new/new-tenant-form.tsx` (story 7-3) pour le pattern formulaire contrôlé (isPending, errors par champ, toast, router.refresh).
- [x] Labels depuis `useTranslations("owner.tenants.detail.infos.notes.*" | "...plan.*")`.
- [x] `pnpm typecheck` — zéro erreur

### T11 — CRÉER `src/components/owner/tenant-detail/subscription-tab.tsx` (AC5 — onglet Abonnement)

- [x] Server Component recevant `{ tenant, payments }`.
- [x] Layout en 3 sous-sections (cf. AC5) :
  - Header : titre "Abonnement" + `<RecordPaymentTrigger tenant={{ id, name, slug, status }} />` (IMPORTÉ de la story 7-4) à droite.
    - **Si 7-4 non implémentée :** placeholder bouton désactivé avec `TODO(story-7-4)`.
  - (a) Carte "Période courante" :
    ```tsx
    const period = getCurrentPeriod(tenant, payments);
    const daysRemaining = formatDaysRemaining(tenant.subscriptionEnd);
    // affichage dates + cycle + badge jours restants + grace/trial badges
    ```
  - (b) Timeline visuelle : `<SubscriptionTimeline payments={payments} />` (cf. T12).
  - (c) Tableau HTML natif des paiements (pattern TenantsTable 7-2) :
    - thead : Date | Méthode | Montant | Référence | Période | Cycle | Confirmé par
    - tbody : `payments.map(p => ...)` avec `formatFcfa(p.amount)`, `formatDateFr(p.paidAt)`, badge paymentMethod, `p.confirmerEmail ?? "—"`.
    - Si 0 paiement → ligne "Aucun paiement" (colspan 7).
- [x] Labels depuis `getTranslations("owner.tenants.detail.abonnement.*")`.
- [x] `pnpm typecheck` — zéro erreur

### T12 — CRÉER `src/components/owner/tenant-detail/subscription-timeline.tsx` (AC5b — visuel CSS)

- [x] Server Component (pas d'interactivité) recevant `{ payments }`.
- [x] Calcul : `const timeline = buildSubscriptionTimeline(payments)` (T3).
- [x] Rendu CSS :
  ```tsx
  if (timeline.segments.length === 0) {
    return <p className="text-xs text-text-muted">{t("noPayments")}</p>;
  }
  const totalDays = timeline.totalPaidDays + timeline.totalGapDays;
  return (
    <div className="space-y-2">
      <div className="flex h-8 w-full overflow-hidden rounded-lg border border-border">
        {timeline.segments.map((seg, i) => {
          const widthPct = totalDays === 0 ? 0 : Math.max(2, Math.round(((seg.kind === "paid" ? diffDays(seg.start, seg.end) : seg.durationDays ?? 0) / totalDays) * 100));
          const cls = seg.kind === "paid"
            ? "bg-status-accepte-bg hover:bg-status-accepte-bg/80"
            : "bg-status-annule-bg hover:bg-status-annule-bg/80";
          const title = seg.kind === "paid"
            ? `${seg.paymentMethod} ${formatFcfa(seg.amount ?? 0)} — ${formatDateFr(seg.start)} → ${formatDateFr(seg.end)}`
            : `Gap — ${seg.durationDays} jours — ${formatDateFr(seg.start)} → ${formatDateFr(seg.end)}`;
          return <div key={i} className={cls} style={{ width: `${widthPct}%` }} title={title} />;
        })}
      </div>
      <div className="flex justify-between text-xs text-text-muted">
        <span>{formatDateFr(timeline.axisStart)}</span>
        <span>{formatDateFr(timeline.axisEnd)}</span>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-status-accepte-bg" /> Payé ({timeline.totalPaidDays}j)</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-status-annule-bg" /> Gap ({timeline.totalGapDays}j)</span>
      </div>
    </div>
  );
  ```
- [x] **AUCUNE lib chart** (pas de recharts, pas de visx, pas de d3) — assumption non-interactive : CSS `div` + `width: %`. Cohérent avec la carte de santé de 7-2 (barre de progression div).
- [x] **Largeur minimum 2%** par segment (sinon un segment d'un jour serait invisible) — `Math.max(2, ...)`.
- [x] Labels depuis `getTranslations("owner.tenants.detail.abonnement.timeline.*")`.
- [x] `pnpm typecheck` — zéro erreur

### T13 — CRÉER `src/components/owner/tenant-detail/users-tab.tsx` + `user-quota-bar.tsx` (AC7 — onglet Utilisateurs)

- [x] **`users-tab.tsx`** — Server Component `{ tenant, users, quota }` :
  - En-tête quota : `<UserQuotaBar quota={quota} />` (T13b) + texte "X / Y utilisateurs".
  - Bouton "Ajouter un utilisateur" : placeholder désactivé `<Button disabled title="Bientôt disponible (story 7-9)">+ Ajouter</Button>` (lien vers route future `/owner/tenants/[id]/utilisateurs/nouveau`).
  - Tableau HTML natif (pattern TenantsTable 7-2) :
    - thead : Nom | Email | Rôle | Dernière connexion | Statut | Actions
    - tbody : `users.map(u => ...)`, badge rôle (réutiliser `user-role-selector` mapping ou fr-NE), `u.lastSeen ? formatDateFr(u.lastSeen) : "Jamais"`, `u.emailVerified ? "Actif" : "Email non vérifié"`, bouton "Révoquer" disabled (story 7-9).
    - Si 0 user → ligne "Aucun utilisateur".
  - Labels depuis `getTranslations("owner.tenants.detail.utilisateurs.*")`.
- [x] **`user-quota-bar.tsx`** — Server Component `{ quota }` :
  - Barre de progression : `width: ${quota.pct}%` avec couleur selon `quota.tone` :
    - ok → `bg-status-accepte`
    - warn → `bg-status-valide`
    - full → `bg-status-annule`
    - exceeded → `bg-status-annule` (rouge) + texte "Quota dépassé"
  - Texte "X / Y" (font-serif tabular-nums).
- [x] `pnpm typecheck` — zéro erreur

### T14 — CRÉER `src/components/owner/tenant-detail/journal-tab.tsx` (AC8 — onglet Journal)

- [x] Server Component `{ tenant, events, eventTypes }`.
- [x] **Filtre par event_type piloté par searchParams :** le wrapper `TenantDetailTabs` ne peut pas gérer le filtre du journal (qui dépend de `?event=`). Solution : le filtre est un mini Client Component `<JournalEventFilter currentEventType={eventType} pathname={...} />` qui met à jour l'URL. Le `page.tsx` (Server Component) lit `sp.event` et fetch les events filtrés côté serveur.
- [x] Rendu timeline append-only :
  - Chaque event : icône Lucide (mapping eventType→icon : `created`→Plus, `payment_recorded`→Banknote, `suspended`→Ban, `reactivated`→RefreshCw, `cancelled`→XCircle, `plan_changed`→ArrowLeftRight, `reminder_sent`→Bell, `updated`→Pencil, etc.).
  - Libellé FR (mapping eventType→`owner.events.{eventType}` de fr-NE.json posé en 7-2, étendre avec `updated`).
  - Note (si présente).
  - Actor : `event.actorEmail ?? "Système"` (actorId='system' → LEFT JOIN NULL → "Système").
  - Date relative (`formatRelativeDate(event.createdAt)`) + date absolue au hover (`title={formatDateFr(event.createdAt)}`).
  - Tri `createdAt DESC` (déjà trié par la query).
- [x] Footer "Append-only" : `<p className="text-xs text-text-muted italic">{t("appendOnly")}</p>`.
- [x] Si 0 event → "Aucun événement enregistré pour ce tenant".
- [x] Labels depuis `getTranslations("owner.tenants.detail.journal.*")` + `owner.events.*` (7-2).
- [x] `pnpm typecheck` — zéro erreur

### T15 — CRÉER `src/components/owner/tabs-skeleton.tsx`

- [x] Server Component (skeleton pendant le Suspense de `TenantDetailTabs`) :
  ```tsx
  import { Skeleton } from "@/components/ui/skeleton";
  export function TabsSkeleton() {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T16 — UPDATE `src/messages/fr-NE.json`

- [x] Ajouter section `owner.tenants.detail` :
  ```json
  "detail": {
    "backToTenants": "Tenants",
    "tabs": {
      "infos": "Infos générales",
      "abonnement": "Abonnement",
      "utilisateurs": "Utilisateurs",
      "journal": "Journal"
    },
    "infos": {
      "identityTitle": "Identité",
      "name": "Nom",
      "slug": "Slug",
      "createdAt": "Créé le",
      "subscriptionTitle": "Abonnement courant",
      "subscriptionStart": "Début",
      "subscriptionEnd": "Fin",
      "cycle": "Cycle",
      "cycleMonthly": "Mensuel",
      "cycleAnnual": "Annuel",
      "noCycle": "—",
      "inGrace": "Période de grâce — fin {date}",
      "inTrial": "Trial — fin {date}",
      "notesTitle": "Notes internes",
      "notesHint": "Visibles par le owner uniquement",
      "notesPlaceholder": "Ajouter des notes internes…",
      "notesSave": "Enregistrer les notes",
      "notesSaving": "Enregistrement…",
      "notesSaved": "Notes enregistrées",
      "notesTooLong": "Les notes ne doivent pas dépasser 5000 caractères",
      "planTitle": "Plan",
      "planChange": "Changer de plan",
      "planApply": "Appliquer",
      "planChanged": "Plan mis à jour",
      "actionsTitle": "Actions",
      "reactivate": "Réactiver",
      "reactivateComingSoon": "Bientôt disponible (story 7-8)"
    },
    "abonnement": {
      "title": "Abonnement",
      "currentPeriodTitle": "Période courante",
      "timeline": {
        "title": "Timeline de l'abonnement",
        "noPayments": "Aucun paiement enregistré",
        "paid": "Payé ({days}j)",
        "gap": "Gap ({days}j)",
        "segmentTooltip": "{method} {amount} — {start} → {end}",
        "gapTooltip": "Gap — {days} jours — {start} → {end}"
      },
      "historyTitle": "Historique des paiements",
      "columns": {
        "date": "Date",
        "method": "Méthode",
        "amount": "Montant",
        "reference": "Référence",
        "period": "Période couverte",
        "cycle": "Cycle",
        "confirmedBy": "Confirmé par"
      },
      "empty": "Aucun paiement",
      "recordPayment": "Enregistrer un paiement"
    },
    "utilisateurs": {
      "title": "Utilisateurs",
      "quota": "{active} / {max} utilisateurs",
      "quotaExceeded": "Quota dépassé",
      "quotaFull": "Quota atteint",
      "addUser": "+ Ajouter un utilisateur",
      "addUserComingSoon": "Bientôt disponible (story 7-9)",
      "columns": {
        "name": "Nom",
        "email": "Email",
        "role": "Rôle",
        "lastSeen": "Dernière connexion",
        "status": "Statut",
        "actions": "Actions"
      },
      "lastSeenNever": "Jamais",
      "statusActive": "Actif",
      "statusUnverified": "Email non vérifié",
      "revoke": "Révoquer",
      "revokeComingSoon": "Bientôt disponible (story 7-9)",
      "empty": "Aucun utilisateur"
    },
    "journal": {
      "title": "Journal d'événements",
      "filterAll": "Tous les types",
      "filterByType": "Type d'événement",
      "actorSystem": "Système",
      "empty": "Aucun événement enregistré pour ce tenant",
      "appendOnly": "Ce journal est immuable. Aucun événement ne peut être modifié ni supprimé."
    }
  }
  ```
- [x] Étendre `owner.events` (posé en 7-2) avec : `"updated": "Tenant modifié"`.
- [x] **Ne PAS écraser** les sections posées par 7-2/7-3/7-4/7-5/7-6 (fusion additive).
- [x] `pnpm typecheck` — zéro erreur

### T17 — Tests unitaires Vitest

- [x] `src/lib/owner/tenant-detail.test.ts` (mock `db`) :
  - `getTenantPayments` : retourne paiements triés DESC, `confirmerEmail` résolu via LEFT JOIN, `confirmedBy` null → `confirmerEmail` null
  - `getCurrentPeriod` : cycle = dernier payment.billingCycle, cycle null si 0 payment, grace/trial reportés
  - `getTenantUsers` : users triés ASC, `lastSeen` résolu (MAX session), `lastSeen` null si pas de session
  - `getTenantEvents` : filtré par eventType quand fourni, "all" = pas de filtre, tri DESC, `actorEmail` null quand actorId='system'
  - `computeUserQuota` : free(1)/pro(5)/enterprise(20), tone ok/warn/full/exceeded, cas dépassement (active=6 > max=5 → exceeded), cas max=0 (plan inexistant — ne devrait pas arriver, mais guard)
- [x] `src/lib/owner/subscription-timeline.test.ts` :
  - 0 payment → `segments=[]`, `axisStart=null`, `axisEnd=null`, `totalPaidDays=0`, `totalGapDays=0`
  - 1 payment → 1 segment paid, pas de gap
  - 2 payments avec gap → 2 segments paid + 1 segment gap
  - 2 payments chevauchants → 2 segments paid, pas de gap négatif
  - Tri chronologique (input non trié → output trié par periodStart ASC)
  - Input non muté (deep equal avant/après)
  - `totalPaidDays` = somme des durées paid en jours
- [x] `src/lib/tenants/update-tenant.test.ts` (mock `db`) :
  - Cas nominal : update plan → UPDATE + event `plan_changed`, retourne tenant + changes=["plan"]
  - Update notes → event `updated`, changes=["notes"]
  - Update status → event `updated`, changes=["status"]
  - Update plan + notes → event `plan_changed` (priorité), changes=["plan","notes"]
  - Tenant inexistant → `TenantNotFoundError`
  - Event insert échoue → update conservé (best-effort), pas de throw
- [x] `src/lib/validation/tenant-update.test.ts` :
  - `updateTenantSchema` : plan valide, notes 5001 chars → erreur, status invalide → erreur, body vide → erreur (superRefine)
- [x] `pnpm check` — tous tests passent sans régression

### T18 — Tests E2E Playwright

- [x] `tests/e2e/owner-tenant-detail.spec.ts` :
  - **Setup** : étendre `tests/fixtures/seed-owner.ts` (story 7-2) — seed 1 tenant "Acme SARL" avec 3 payments (dont un gap), 2 users (admin + commercial), 5 events (created, payment_recorded, suspended, reactivated, reminder_sent).
  - Scénarios :
    1. Login superadmin → `/owner/tenants/[id]` → 4 onglets visibles, "Infos" actif par défaut, en-tête (nom + slug + badges plan/status)
    2. Clic "Abonnement" → URL `?tab=abonnement`, timeline visible (segments verts/rouges), tableau paiements (3 rows), bouton "Enregistrer un paiement" visible
    3. Clic "Utilisateurs" → URL `?tab=utilisateurs`, quota "2 / 5" (plan pro), barre progression, tableau users (2 rows)
    4. Clic "Journal" → URL `?tab=journal`, 5 events visibles, footer "Append-only"
    5. Filtre Journal `event=suspended` → 1 event "Suspendu" visible (les autres cachés)
    6. Deep-link `?tab=journal&event=payment_recorded` → onglet Journal + filtre actif au chargement
    7. Édition notes : textarea rempli → submit → toast success → refresh → notes persistées (re-fetch)
    8. Édition plan : Select → "enterprise" → submit → toast → badge plan devient "Enterprise"
    9. Non-superadmin → redirect `/` depuis `/owner/tenants/[id]`
    10. Tenant inexistant `/owner/tenants/00000000-0000-0000-0000-000000000000` → page 404
    11. Bouton "Réactiver" disabled (story 7-8 — vérifier l'attribut `disabled`)
    12. Boutons "Ajouter utilisateur" et "Révoquer" disabled (story 7-9)
- [x] `pnpm test:e2e` — passe

### T19 — Vérification finale (AC10)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (334+ existants + nouveaux)
- [x] `pnpm build` : passe sans erreur
- [x] Aucune régression sur les stories 7-1..7-6 (cette story ne modifie aucun fichier existant sauf `fr-NE.json` additif + `package.json` additif)

---

## Dev Notes

### CRITIQUE — Dépendances HARD sur stories 7-1, 7-2, 7-4, 7-5

Cette story est une **story d'orchestration** : elle assemble les composants/actions des stories précédentes. Hard dependencies :

- **Story 7-1 (HARD) :** fournit les tables `tenants`, `subscription_payments`, `tenant_events`, `user.tenantId`, les enums (`tenantStatusEnum`, `tenantPlanEnum`, `paymentMethodEnum`, `billingCycleEnum`), `tenant-config.ts` (`PLAN_LIMITS`). **Sans 7-1, aucune query ne compile.**
- **Story 7-2 (HARD) :** fournit le rôle `superadmin`, `requireOwnerAuth()`/`requireOwnerSession()`, le layout `/owner/layout.tsx`, les badges `<TenantStatusBadge>`/`<TenantPlanBadge>`, les helpers `formatDateFr`/`formatDaysRemaining`/`formatRelativeDate`, et la section `owner.*` dans `fr-NE.json` (incluant `owner.events.*`).
- **Story 7-4 (HARD) :** fournit `<RecordPaymentTrigger>` et `<RecordPaymentModal>` (à monter dans l'onglet Abonnement) + la route POST `/api/v1/owner/tenants/[id]/payments`. **Sans 7-4, le bouton "Enregistrer un paiement" doit être un placeholder désactivé.**
- **Story 7-5 (HARD) :** fournit `<SuspendDialog>`, `<CancelDialog>` (à monter dans l'onglet Infos) + les routes suspend/cancel. **Sans 7-5, ces boutons doivent être des placeholders désactivés.**

**Mode dégradé (si 7-4 ou 7-5 absents au moment du dev) :**
- Remplacer `<RecordPaymentTrigger>` par `<Button disabled title="Bientôt disponible (story 7-4)">Enregistrer un paiement</Button>` + `// TODO(story-7-4): monter RecordPaymentTrigger`.
- Remplacer `<SuspendDialog>`/`<CancelDialog>` par des `<Button disabled>` + `TODO(story-7-5)`.
- La fiche compile et fonctionne en lecture (3 onglets sur 4 pleinement fonctionnels : Infos sans actions, Abonnement lecture + timeline + historique, Utilisateurs lecture, Journal lecture). Seules les mutations suspend/cancel/payment sont placeholderisées.
- Documenter chaque TODO clairement.

---

### CRITIQUE — `@radix-ui/react-tabs` n'est PAS installé (vérifié)

Au moment de la création de cette story, le repo n'a PAS `@radix-ui/react-tabs` en dépendance (vérifié dans `package.json` — seuls dialog, dropdown-menu, label, slot, avatar le sont). Il n'y a PAS non plus de `src/components/ui/tabs.tsx`.

**Action obligatoire (T1) :** `pnpm add @radix-ui/react-tabs` puis créer `src/components/ui/tabs.tsx` (wrapper shadcn new-york standard). C'est une addition minimaliste (~3kb gzipped), cohérente avec le reste de la stack shadcn. **NE PAS** réimplémenter un système d'onglets custom (state + classes) — Radix gère l'accessibilité (ARIA tablist, keyboard nav) gratuitement.

**Alternative non retenue :** onglets en `<a>` + searchParams seul (sans Radix). Rejeté car : (a) full-page reload à chaque changement d'onglet (lent), (b) pas d'accessibilité native, (c) perd le state local. Radix Tabs en Client Component + sync searchParams = meilleur compromis.

---

### CRITIQUE — `useSearchParams` requiert `<Suspense>` en Next 16

En Next 16, `useSearchParams()` dans un Client Component force la page entière en **client-side rendering** (CSR bailout) à moins d'être enveloppé dans un `<Suspense>` boundary. Sinon, le build échoue avec une erreur `"useSearchParams() should be wrapped in a suspense boundary"`.

**Mitigation (T8) :** wrapper `<TenantDetailTabs />` dans `<Suspense fallback={<TabsSkeleton />}>` dans le `page.tsx` Server Component. Le skeleton s'affiche pendant le rendu initial puis les tabs hydratent.

Source : [Next.js 16 — useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params).

---

### CRITIQUE — `params` ET `searchParams` sont des Promises en Next 16

```tsx
// CORRECT (Next 16)
interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
export default async function Page({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  // ...
}

// INCORRECT (Next 14/15 sync)
export default function Page({ params, searchParams }) { ... }
```

Le repo utilise déjà `await headers()` partout (pattern établi). Appliquer la même logique à `params` et `searchParams`. Source : [Next.js 16 — Page API](https://nextjs.org/docs/app/api-reference/file-conventions/page), [Next.js 16 — searchParams is a Promise](https://nextjs.org).

---

### CRITIQUE — `dynamic = "force-dynamic"` pour éviter le stale PPR

Avec Partial Prerendering (Next 16), `searchParams` peut recevoir des valeurs stale cachées après un `router.push`. Pour la fiche tenant (page admin non publique, données par tenant), `export const dynamic = "force-dynamic"` est acceptable :

```tsx
export const dynamic = "force-dynamic"; // page non cachée, données fraîches à chaque requête
```

Idem que pour `/owner/tenants` (story 7-2). Source : [Next.js 16 PPR caveat](https://github.com/vercel/next.js/discussions/88535).

---

### CRITIQUE — Timeline visuelle : CSS divs, PAS de lib chart

Le spec Epic 7 §3.3 demande une "Timeline visuelle de l'abonnement (périodes payées en vert, gaps en rouge)". Deux approches :

1. **CSS divs + width %** (retenue) — `buildSubscriptionTimeline` (T3) calcule des segments, le composant (T12) rend des `<div style={{ width: `${pct}%` }} className="bg-status-accepte-bg" />` côte à côte dans un flex container. ~30 lignes de code, zéro dépendance.
2. **Lib chart (recharts/visx)** — rejetée : ajoute 50-100kb, surdimensionnée pour 4-10 segments.

**Décision : CSS divs.** Cohérent avec la carte de santé de 7-2 (barre de progression div) et l'éthic "pas de lib lourde pour MVP". Si le owner veut plus tard un vrai Gantt interactif (zoom, tooltips), DEFERRED à story 7-11 (rapports).

---

### CRITIQUE — Mapping `tenant` ↔ seam `companyId` DEFERRED (flag parent)

Comme noté en stories 7-1 et 7-2, le repo a un seam multi-tenant existant basé sur `companyId` (toutes les tables domaines). Le nouveau modèle `tenants` (Epic 7) est un nouveau root commercial. Cette fiche tenant lit **uniquement** la table `tenants` (et les tables liées `subscription_payments`, `tenant_events`, `user` via `tenantId`).

**Question ouverte (carry-forward flag) :** la fiche tenant devrait-elle aussi afficher les données de la `company` liée (raisonSociale, RCCM, NIF, logo) ? Pour le MVP :
- Cette story N'AFFICHE PAS les données `company` (pas de JOIN `tenants` ↔ `company`).
- `getTenantUsers` filtre sur `user.tenantId` (pas `user.companyId`).
- Le compteur "Utilisateurs" (AC7) utilise `user.tenantId`.

→ **Flag parent :** valider le mapping tenant↔company avant de l'enrichir. Possibilité d'ajouter un 5e onglet "Société" en story future si besoin d'afficher les infos `company`.

---

### CRITIQUE — `actorId='system'` dans le Journal

Le cron 7-6 insère des events avec `actorId = 'system'` (constante spéciale, PAS un user_id réel Better Auth). Le LEFT JOIN `user ON tenant_events.actor_id = user.id` retourne `actorEmail = NULL` pour ces rows.

**Mitigation :** dans le composant `journal-tab.tsx` (T14), afficher `"Système"` quand `event.actorEmail` est null :
```tsx
<span>{event.actorEmail ?? t("actorSystem")}</span>
```

Ne PAS afficher "—" ou null brut.

---

### CRITIQUE — `lastSeen` : sous-requête corrélée (perf)

Pour la colonne "Dernière connexion" du tableau users (AC7), il faut `MAX(session.expiresAt)` par user. Drizzle ne gère pas facilement GROUP BY + JOIN LATERAL. Trois options :

1. **Sous-requête corrélée `sql\`(SELECT MAX(...) FROM session WHERE ...)\``** (retenue) — N sous-requêtes pour N users. Acceptable en MVP (< 20 users/tenant, < 20ms).
2. **Deux queries** : une pour les users, une pour les `MAX(session.expiresAt) GROUP BY userId WHERE userId IN (...)` puis merge en JS. Plus verbeux, 2 round-trips DB.
3. **LEFT JOIN + GROUP BY** : `LEFT JOIN session ON session.user_id = user.id GROUP BY user.id` — Drizzle 0.44 supporte GROUP BY mais le typage est lourd.

**Décision : option 1** (cohérent avec le pattern `activeUsers` de la story 7-2 qui utilise `sql\`SELECT COUNT(*)...\``). Pour 20 users max, la perf est négligeable. Si un tenant a beaucoup d'users (enterprise, 20 max), c'est encore OK.

---

### CRITIQUE — Update plan ne change PAS `maxUsers` dans la table

`tenants.maxUsers` (colonne du schema 7-1, défaut 3) est **obsolète** dans le modèle Epic 7 : le max est lu dynamiquement depuis `PLAN_LIMITS[tenant.plan].maxUsers` (tenant-config.ts). Donc quand le owner change le plan (AC4), on ne touche PAS à `tenants.maxUsers` — le quota AC7 est recalculé à la volée depuis `PLAN_LIMITS`.

**NOTE pour le dev :** vérifier si `tenants.maxUsers` est même utilisé ailleurs (story 7-2 l'utilise dans `fetchTenantsPage` ?). Si oui, c'est un legacy — `PLAN_LIMITS` est la source de vérité. Flag pour coherence : migrer `fetchTenantsPage` (7-2) pour lire `PLAN_LIMITS` au lieu de `tenants.maxUsers`. **Ne PAS le faire dans cette story** (hors scope) — documenter le TODO.

---

### CRITIQUE — `exactOptionalPropertyTypes` (TS 5.9.3)

Pour l'update payload (T4), ne construire que les champs présents dans `input` :
```ts
const payload: Partial<typeof tenants.$inferInsert> = {};
if (input.plan !== undefined) payload.plan = input.plan;
if (input.notes !== undefined) payload.notes = input.notes;
if (input.status !== undefined) payload.status = input.status;
if (Object.keys(payload).length === 0) throw new Error("No fields to update");
await db.update(tenants).set({ ...payload, updatedAt: new Date() })...
```
Ne PAS faire `set({ ...input })` car `input` a des `undefined` (avec `exactOptionalPropertyTypes`, `undefined` ≠ absent).

Pour `tenant.notes` qui est `text | null` :
```tsx
<Textarea defaultValue={tenant.notes ?? ""} />
```
(`null` → chaîne vide pour l'input).

---

### CRITIQUE — `noUncheckedIndexedAccess`

- `payments[0]` dans `getCurrentPeriod` peut être `undefined` → optional chaining : `payments[0]?.billingCycle ?? null`.
- `db.update(...).returning()` → `[updated]` peut être `undefined` → `if (!updated) throw new TenantNotFoundError(...)`.
- `event.actorEmail` peut être `null` → `event.actorEmail ?? t("actorSystem")`.

---

### CRITIQUE — `notFound()` de Next 16 pour tenant inexistant

Quand `getTenantById(id)` retourne `null` (tenant inexistant ou id invalide), appeler `notFound()` (de `next/navigation`). Next 16 active automatiquement le `not-found.tsx` le plus proche :
- Si `src/app/owner/not-found.tsx` existe → l'utilise.
- Sinon → hérite du `src/app/not-found.tsx` racine.

Pour cette story, NE PAS créer un `not-found.tsx` owner dédié (le global suffit). Si le branding owner est souhaité pour la 404, DEFERRED à story future.

**Guard id invalide :** un id qui n'est pas un UUID valide fait lever Drizzle (ou retourne juste 0 row selon le driver). `getTenantById` retourne `null` dans les deux cas → `notFound()`. Pas besoin de validation UUID explicite (Drizzle pg gère).

---

### Pattern existant à réutiliser

- `src/app/(app)/devis/[id]/page.tsx` — pattern page détail avec `params` (à moderniser en `Promise` Next 16) : Server Component qui fetch un devis par id + `notFound()` si absent.
- `src/app/owner/tenants/page.tsx` (story 7-2) — pattern page owner Server Component + `searchParams` Promise + `Promise.all` queries.
- `src/app/owner/tenants/new/new-tenant-form.tsx` (story 7-3) — pattern formulaire contrôlé (isPending, errors par champ, toast, `router.refresh()`).
- `src/components/owner/tenants-table.tsx` (story 7-2) — pattern tableau HTML natif (thead/tbody, `bg-surface-alt`, `border-border`).
- `src/components/owner/owner-recent-activity.tsx` (story 7-2) — pattern timeline events (icône + texte + date relative).
- `src/components/owner/owner-health-card.tsx` (story 7-2) — pattern barre de progression CSS (pour `user-quota-bar`).
- `src/components/owner/owner-alerts.tsx` (story 7-2) — pattern badges `formatDaysRemaining` + tone.
- `src/lib/owner/format.ts` (story 7-2) — `formatDateFr`, `formatDaysRemaining`, `formatRelativeDate`.
- `src/lib/owner/metrics.ts` (story 7-2) — pattern JOIN LATERAL / sous-requête corrélée `sql\`...\``.
- `src/lib/money.ts` — `formatFcfa()`.
- `src/components/ui/skeleton.tsx` — pour `TabsSkeleton`.
- shadcn primitives existantes : `badge`, `button`, `select`, `textarea`, `input`, `label`, `dropdown-menu`, `dialog` (déjà dans `src/components/ui/`).

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Réimplémenter `<RecordPaymentTrigger>` / `<SuspendDialog>` / `<CancelDialog>` | IMPORTER depuis 7-4/7-5 et MONTER |
| Installer recharts/visx/d3 pour la timeline | CSS divs + width % (buildSubscriptionTimeline) |
| Réimplémenter un système d'onglets custom | `@radix-ui/react-tabs` + wrapper shadcn (T1) |
| `useSearchParams` sans `<Suspense>` | `<Suspense fallback={<TabsSkeleton />}>` autour de `<TenantDetailTabs>` |
| `params`/`searchParams` sync (Next 14 style) | `await params` + `await searchParams` (Promise Next 16) |
| Stale PPR sur changement d'onglet | `export const dynamic = "force-dynamic"` sur la page |
| Implémenter la réactivation (bouton "Réactiver") | Placeholder désactivé (story 7-8) |
| Implémenter l'ajout/révocation d'users | Placeholder désactivé (story 7-9) |
| Modifier `tenants.maxUsers` au changement de plan | Lire `PLAN_LIMITS[plan].maxUsers` dynamiquement |
| Hardcoder du texte FR dans les composants | Clés `owner.tenants.detail.*` dans `fr-NE.json` |
| N+1 sur les users (fetch lastSeen par user en boucle) | Sous-requête corrélée SQL ou GROUP BY |
| Afficher "—" pour `actorId='system'` | Afficher "Système" (t("actorSystem")) |
| Omettre le footer "Append-only" du Journal | `<p className="italic">Ce journal est immuable…</p>` |
| `set({ ...input })` avec `undefined` | Construire `payload` champ par champ (`exactOptionalPropertyTypes`) |
| Créer un 5e onglet "Société" avec JOIN company | DEFERRED — cette story lit `tenants` uniquement (flag parent) |
| Modifier `src/lib/schema.ts` | Hors scope — tables fournies par story 7-1 |
| Modifier `src/lib/email.ts`, `src/lib/auth.ts`, `src/proxy.ts` | Inchangés |

---

### Commandes pour le dev agent

```bash
# 0. PRÉREQUIS : stories 7-1, 7-2, 7-4, 7-5 implémentées (schema + superadmin + RecordPayment + Suspend/Cancel)
#    Vérifier : pnpm typecheck passe AVANT de commencer cette story
#    Si 7-4/7-5 absents → mode dégradé (placeholders désactivés + TODO)

# 1. Installer @radix-ui/react-tabs
pnpm add @radix-ui/react-tabs

# 2. Docker en cours (DB)
docker compose up -d

# 3. AUCUNE migration à générer (schema fourni par 7-1)
# pnpm db:generate  ← NE PAS LANCER

# 4. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓ (334+ existants + nouveaux)

# 5. Build
pnpm build   # passe sans erreur

# 6. Dev
pnpm dev
# Login superadmin → /owner/tenants → clic "Voir" sur un tenant → /owner/tenants/[id]
# Naviguer entre les 4 onglets, vérifier ?tab= dans l'URL
# Tester édition notes/plan, vérifier le Journal après mutation
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §3.3 "Fiche tenant `/owner/tenants/[id]`" (4 onglets : Infos, Abonnement, Utilisateurs, Journal), §2 schema tables, §7 paramètres (PLAN_LIMITS, prices)
- [CLAUDE.md] — conventions DB (uuid custom, text Better Auth), migration workflow, langues (UI FR / code EN), Next 16
- [project-context.md] — règles TypeScript strict, Drizzle, Next 16 `params`/`searchParams` Promise, i18n next-intl, money integer FCFA
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — fournit tables `tenants`/`subscription_payments`/`tenant_events`, `user.tenantId`, enums, `tenant-config.ts` (`PLAN_LIMITS`)
- [Story 7-2] `_bmad-output/implementation-artifacts/7-2-owner-dashboard-tenant-list.md` — fournit `requireOwnerAuth()`/`requireOwnerSession()`, layout owner, badges, helpers `format*`, fr-NE `owner.*`, pattern JOIN LATERAL
- [Story 7-3] `_bmad-output/implementation-artifacts/7-3-create-tenant-welcome-email.md` — pattern page Server Component + tenant lookup + formulaire contrôlé
- [Story 7-4] `_bmad-output/implementation-artifacts/7-4-record-payment-mobile-money.md` — fournit `<RecordPaymentTrigger>` + `<RecordPaymentModal>` + route POST .../payments (à monter dans onglet Abonnement)
- [Story 7-5] `_bmad-output/implementation-artifacts/7-5-manual-suspension-expiry-page.md` — fournit `<SuspendDialog>` + `<CancelDialog>` + routes suspend/cancel (à monter dans onglet Infos)
- [Story 7-6] `_bmad-output/implementation-artifacts/7-6-expiry-cron-automated-reminders.md` — génère les `tenant_events` lus dans le Journal (actorId='system')
- [src/app/(app)/devis/[id]/page.tsx] — pattern page détail avec `params` + `notFound()`
- [src/app/owner/tenants/page.tsx] (story 7-2) — pattern page owner Server Component + searchParams Promise + Promise.all
- [src/lib/owner/metrics.ts] (story 7-2) — pattern sous-requête corrélée `sql\`...\``
- [src/lib/owner/format.ts] (story 7-2) — `formatDateFr`, `formatDaysRemaining`, `formatRelativeDate`
- [src/lib/money.ts] — `formatFcfa()`
- [shadcn/ui — Tabs] https://ui.shadcn.com/docs/components/radix/tabs — wrapper @radix-ui/react-tabs
- [Next.js 16 — Page API] https://nextjs.org/docs/app/api-reference/file-conventions/page — `params`/`searchParams` Promise
- [Next.js 16 — useSearchParams] https://nextjs.org/docs/app/api-reference/functions/use-search-params — Suspense boundary requis
- [Next.js 16 — notFound] https://nextjs.org/docs/app/api-reference/functions/not-found

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`)

**Epic 7 :** Owner Panel & Gestion des abonnements SaaS — Post-MVP. Dépendances : Epic 1 (DONE), Epic 6 (DONE), stories 7-1 à 7-6 (ready-for-dev ou done).

**Story 7.7 (P1)** est la **story d'orchestration** de la fiche tenant : elle assemble les composants/actions des stories précédentes (7-4 paiement, 7-5 suspend/cancel) dans une UI structurée en 4 onglets, et ajoute les vues lecture-only (Utilisateurs, Journal) + le shortcut d'édition (plan/notes/status). C'est le "hub" opérationnel du owner pour piloter chaque tenant.

**4 onglets (§3.3) :**
1. **Infos générales** — identité, abonnement courant, notes éditables, plan changeable, actions Suspendre/Annuler/Réactiver.
2. **Abonnement** — période courante, timeline visuelle vert/rouge, historique paiements, bouton "Enregistrer un paiement" (réutilise 7-4).
3. **Utilisateurs** — liste + quota par plan (lecture ; mutations en 7-9).
4. **Journal** — timeline append-only des `tenant_events` (lecture ; créé par 7-3/7-4/7-5/7-6).

### Stories de l'Epic 7 (cross-context)

| ID | Titre | Relation avec 7-7 |
|----|-------|-------------------|
| 7.1 | Schema tenants + middleware | **PRÉREQUIS** — tables + enums + `PLAN_LIMITS` |
| 7.2 | Dashboard + liste tenants | **PRÉREQUIS** — `requireOwnerAuth`, badges, helpers format, fr-NE owner.* |
| 7.3 | Création manuelle tenant | SOFT — pattern page détail Server Component |
| 7.4 | Enregistrement paiement | **EMBED** — `<RecordPaymentTrigger>` monté dans onglet Abonnement |
| 7.5 | Suspension manuelle + page expiration | **EMBED** — `<SuspendDialog>` + `<CancelDialog>` montés dans onglet Infos |
| 7.6 | Cron expiration + rappels | SOFT — génère les events lus dans le Journal |
| **7.7** | **Fiche tenant complète (onglets)** | **(cette story)** |
| 7.8 | Réactivation après paiement | Placeholder bouton "Réactiver" (à activer en 7-8) |
| 7.9 | Gestion utilisateurs par tenant | Placeholder boutons "Ajouter"/"Révoquer" (à activer en 7-9) |
| 7.10 | Stripe webhook | Génère des `subscription_payments` affichés dans Abonnement |
| 7.11 | Rapports & export | Étend la fiche avec rapports par tenant (future) |
| 7.12 | Paramètres plateforme | Fournit `PLAN_PRICES_XOF` configurable (future) |

### Paramètres business retenus (Epic 7 §7)

```ts
const PLAN_LIMITS = {
  free: { maxUsers: 1 },
  pro: { maxUsers: 5 },
  enterprise: { maxUsers: 20 },
}  // depuis tenant-config.ts (story 7-1) — lu pour computeUserQuota (AC7)
```

`PLAN_LIMITS` est la source de vérité pour le quota utilisateurs. `tenants.maxUsers` (colonne legacy du schema 7-1) est OBSOLÈTE dans ce modèle — ne pas l'utiliser.

---

## Architecture Compliance

| Contrainte | Conformité story 7-7 |
|---|---|
| Next.js 16 App Router (Server Components par défaut) | ✅ page + 4 onglets = Server Components ; wrapper Tabs + forms = Client Components |
| Next 16 `params`/`searchParams` Promise | ✅ `await params` + `await searchParams` dans `page.tsx` |
| Next 16 `useSearchParams` Suspense boundary | ✅ `<Suspense fallback={<TabsSkeleton />}>` autour de `<TenantDetailTabs>` |
| `dynamic = "force-dynamic"` (anti-stale PPR) | ✅ sur la page |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`) | ✅ Guards `?? null`, optional chaining, payload champ par champ |
| Drizzle : uuid() pour custom tables, text pour Better Auth | ✅ `tenants.id` uuid ; `user.id`/`actorId`/`confirmedBy` text |
| next-intl : UI strings dans `fr-NE.json` | ✅ Section `owner.tenants.detail` complète (4 onglets) |
| API envelope : `apiError()` | ✅ Route PATCH `/api/v1/owner/tenants/[id]` via `requireOwnerSession` |
| Zod validation dans `src/lib/validation/` | ✅ `updateTenantSchema` dans `src/lib/validation/tenant-update.ts` |
| Audit `tenant_events` : best-effort, append-only | ✅ Insert dans `applyTenantUpdate` try/catch |
| Money : integer FCFA | ✅ `formatFcfa()` pour montants paiements |
| Pas de nouvelle lib lourde (chart, table virtualization) | ✅ Timeline CSS divs ; tableau HTML natif (pattern repo) |
| Dépendance additionnelle minimale | ✅ `@radix-ui/react-tabs` (~3kb) — cohérent stack shadcn |
| `next/navigation` (pas `next/router`) | ✅ `useRouter`/`useSearchParams`/`usePathname` de `next/navigation` |
| Réutilisation des composants des stories précédentes | ✅ IMPORT RecordPaymentTrigger (7-4), SuspendDialog/CancelDialog (7-5), badges (7-2) |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-7 |
|---|---|---|
| `next` | 16.1.6 | App Router, page `[id]`, `params`/`searchParams` Promise, `notFound`, `Suspense`, `dynamic = "force-dynamic"` |
| `react` | 19.2.4 | `<Suspense>`, composition Server/Client Components |
| `@radix-ui/react-tabs` | **NEW** (dernière stable compatible, ~1.1.x) | Primitive Tabs (wrapper shadcn `src/components/ui/tabs.tsx`) |
| `better-auth` | 1.6.11 | `auth.api.getSession` (via `requireOwnerAuth` story 7-2) |
| `drizzle-orm` | 0.44.7 | Queries `tenants`/`subscription_payments`/`tenant_events`/`user`/`session`, `eq`/`and`/`desc`/`asc`/`sql`, `db.update`/`db.insert` |
| `zod` | 4.4.3 | `updateTenantSchema` |
| `sonner` | 2.0.7 | `toast.success` / `toast.error` dans les forms |
| `next-intl` | 4.13.0 | `getTranslations` (Server), `useTranslations` (Client) |
| `lucide-react` | 0.539.0 | Icônes (ChevronLeft, Banknote, Ban, RefreshCw, XCircle, Bell, Pencil, ArrowLeftRight, Plus) |
| shadcn/ui (new-york) | 3.8.5 | `Badge`, `Button`, `Select`, `Textarea`, `Input`, `Label`, `Skeleton` (existants) + `Tabs` (CRÉER) |
| `vitest` | 4.1.9 | Tests unitaires (tenant-detail, subscription-timeline, update-tenant) |
| `@playwright/test` | 1.61.0 | E2E owner-tenant-detail |

**Une seule dépendance à installer : `@radix-ui/react-tabs`.** Tout le reste réutilise l'existant.

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `src/app/owner/tenants/[id]/page.tsx` | **NEW** | Server Component principal (auth + fetch + Suspense Tabs) |
| `src/components/ui/tabs.tsx` | **NEW** | Wrapper shadcn @radix-ui/react-tabs |
| `src/components/owner/tenant-detail-tabs.tsx` | **NEW** | Client Component wrapper `<Tabs>` contrôlé par searchParams |
| `src/components/owner/tenant-detail/infos-tab.tsx` | **NEW** | Server Component onglet Infos |
| `src/components/owner/tenant-detail/subscription-tab.tsx` | **NEW** | Server Component onglet Abonnement |
| `src/components/owner/tenant-detail/users-tab.tsx` | **NEW** | Server Component onglet Utilisateurs |
| `src/components/owner/tenant-detail/journal-tab.tsx` | **NEW** | Server Component onglet Journal |
| `src/components/owner/tenant-detail/subscription-timeline.tsx` | **NEW** | Composant visuel timeline CSS (segments vert/rouge) |
| `src/components/owner/tenant-detail/user-quota-bar.tsx` | **NEW** | Barre de progression quota (X/Y) |
| `src/components/owner/tenant-detail/edit-notes-form.tsx` | **NEW** | Client Component (textarea + submit notes) |
| `src/components/owner/tenant-detail/edit-plan-form.tsx` | **NEW** | Client Component (Select plan + submit) |
| `src/components/owner/tenant-detail/journal-event-filter.tsx` | **NEW** | Client Component (Select filtre eventType → URL) |
| `src/components/owner/tabs-skeleton.tsx` | **NEW** | Skeleton Suspense fallback |
| `src/lib/owner/tenant-detail.ts` | **NEW** | `getTenantById`, `getTenantPayments`, `getCurrentPeriod`, `getTenantUsers`, `computeUserQuota`, `getTenantEvents` |
| `src/lib/owner/subscription-timeline.ts` | **NEW** | `buildSubscriptionTimeline(payments)` (pure, segments vert/rouge) |
| `src/lib/tenants/update-tenant.ts` | **NEW** | `applyTenantUpdate(params)` (update plan/notes/status + event audit) |
| `src/lib/validation/tenant-update.ts` | **NEW** | `updateTenantSchema` (Zod) |
| `src/app/api/v1/owner/tenants/[id]/route.ts` | **NEW** | PATCH update minimal (valide → applyTenantUpdate → 200/400/404) |
| `src/lib/owner/tenant-detail.test.ts` | **NEW** | Tests Vitest queries |
| `src/lib/owner/subscription-timeline.test.ts` | **NEW** | Tests Vitest pure fn |
| `src/lib/tenants/update-tenant.test.ts` | **NEW** | Tests Vitest orchestration |
| `src/lib/validation/tenant-update.test.ts` | **NEW** | Tests Vitest Zod schema |
| `tests/e2e/owner-tenant-detail.spec.ts` | **NEW** | E2E Playwright (4 onglets + navigation + édition + filtres) |
| `src/messages/fr-NE.json` | **UPDATE** | Section `owner.tenants.detail` (tabs, infos, abonnement, utilisateurs, journal) + `owner.events.updated` |
| `package.json` | **UPDATE** | Ajouter `@radix-ui/react-tabs` dépendance |

**Ne PAS modifier :**
- `src/lib/schema.ts` (tables fournies par story 7-1)
- `src/lib/auth.ts`, `src/lib/email.ts`, `src/lib/permissions.ts`, `src/proxy.ts`
- `src/app/owner/layout.tsx`, `src/app/owner/page.tsx`, `src/app/owner/tenants/page.tsx` (story 7-2)
- `src/components/owner/record-payment-trigger.tsx`, `record-payment-modal.tsx` (story 7-4 — IMPORTER, ne pas modifier)
- `src/app/owner/tenants/[id]/suspend-dialog.tsx`, `cancel-dialog.tsx` (story 7-5 — IMPORTER, ne pas modifier)
- Les routes API suspend/cancel/payments (stories 7-4/7-5 — inchangées)
- `src/lib/tenants/tenant-config.ts` (story 7-1 — lire `PLAN_LIMITS`)

---

## Testing Requirements

### Tests unitaires (Vitest)

**Fonctions pures (couverture haute, sans mock) :**
- `subscription-timeline.test.ts` :
  - 0 payment → segments=[], axisStart/End null, totals 0
  - 1 payment → 1 segment paid, pas de gap
  - 2 payments avec gap (periodEnd N < periodStart N+1) → 1 segment gap entre les deux
  - 2 payments chevauchants (periodEnd N > periodStart N+1) → pas de gap négatif, 2 segments paid juxtaposés
  - Tri chronologique (input non trié → output trié periodStart ASC)
  - Input non muté (deep equal)
  - `totalPaidDays`/`totalGapDays` corrects (Math.round diff en jours)
- `tenant-update.test.ts` (Zod) :
  - plan valide accepté, notes 5000 OK / 5001 rejeté, status invalide rejeté, body vide → superRefine erreur

**Queries/Orchestration (mocks db) :**
- `tenant-detail.test.ts` (mock `db`) :
  - `getTenantPayments` : tri DESC, `confirmerEmail` résolu (LEFT JOIN), `confirmedBy` null → `confirmerEmail` null
  - `getCurrentPeriod` : cycle = dernier payment.billingCycle, null si 0 payment, grace/trial reportés depuis tenant
  - `getTenantUsers` : tri ASC createdAt, `lastSeen` résolu (sous-requête), null si pas de session
  - `getTenantEvents` : filtre eventType quand fourni (et ≠ "all"), tri DESC, `actorEmail` null quand actorId='system', limite 200
  - `computeUserQuota` : free/pro/enterprise, tone ok/warn/full/exceeded, dépassement (6 > 5 → exceeded), max=0 guard
- `update-tenant.test.ts` (mock `db`) :
  - Cas nominal plan → UPDATE + event `plan_changed`, changes=["plan"]
  - Update notes → event `updated`, changes=["notes"]
  - Update status → event `updated`, changes=["status"]
  - Update plan + notes → event `plan_changed` (priorité), changes=["plan","notes"]
  - Tenant inexistant → `TenantNotFoundError`
  - Event insert échoue → update conservé (best-effort), pas de throw

### Tests E2E (Playwright)

- `owner-tenant-detail.spec.ts` :
  - **Setup** : étendre `tests/fixtures/seed-owner.ts` — 1 tenant "Acme SARL" (plan pro) + 3 payments (monthly, monthly, annual — avec un gap entre le 1er et le 2e) + 2 users (admin + commercial) + 5 events (created, payment_recorded ×2, suspended, reminder_sent)
  - Scénarios (cf. AC10 + T18) :
    1. 4 onglets visibles, "Infos" actif par défaut, en-tête
    2. Clic Abonnement → URL `?tab=abonnement`, timeline (segments verts/rouges), 3 rows paiements, bouton RecordPayment
    3. Clic Utilisateurs → URL `?tab=utilisateurs`, quota "2 / 5", barre progression, 2 rows users
    4. Clic Journal → URL `?tab=journal`, 5 events, footer append-only
    5. Filtre Journal `event=suspended` → 1 event visible
    6. Deep-link `?tab=journal&event=payment_recorded` → onglet + filtre au chargement
    7. Édition notes → toast + refresh + persistance
    8. Édition plan → toast + badge plan mis à jour
    9. Non-superadmin → redirect `/`
    10. Tenant inexistant → 404
    11. Bouton "Réactiver" disabled (story 7-8)
    12. Boutons "Ajouter utilisateur" + "Révoquer" disabled (story 7-9)

### Tests existants

- `pnpm check` doit continuer à passer : **334+ tests existants**. Aucune régression attendue car cette story ne modifie AUCUN fichier existant sauf `fr-NE.json` (ajout additif de clés, non-cassant) et `package.json` (ajout `@radix-ui/react-tabs`).

---

## Previous Story Intelligence

**Story 7-6 (cron expiration) — `ready-for-dev` :** génère les `tenant_events` lus dans le Journal (onglet 4). Points à respecter :
- Les events du cron ont `actorId = 'system'` (constante spéciale, pas un user_id). Le LEFT JOIN user retourne `actorEmail = null` → afficher "Système".
- `event_type` possibles depuis 7-6 : `reminder_sent` (note = stage first/second/urgent), `suspended` (note = 'auto-suspended (J0, no payment)'). Le filtre du Journal (AC8) doit lister ces types.

**Story 7-5 (suspend/cancel) — `ready-for-dev` :** fournit `<SuspendDialog>` et `<CancelDialog>` (à monter dans onglet Infos). Points à respecter :
- Les dialogs sont des Client Components dans `src/app/owner/tenants/[id]/suspend-dialog.tsx` et `cancel-dialog.tsx`.
- Leurs props : `{ tenantId, tenantName, disabled }` (Suspend) et `{ tenantId, tenantName, tenantSlug, disabled }` (Cancel).
- L'état `disabled` dépend du `tenant.status` (AC2 story 7-5) — calculer dans `infos-tab.tsx`.

**Story 7-4 (record payment) — `ready-for-dev` :** fournit `<RecordPaymentTrigger>` (à monter dans onglet Abonnement). Points à respecter :
- Props : `{ tenant: { id, name, slug, status } }` + `variant?: "button" | "menu-item"`.
- Pour la fiche, utiliser `variant="button"` (bouton standalone à droite du titre Abonnement).
- Après enregistrement, le trigger fait `router.refresh()` → le Server Component `subscription-tab.tsx` re-fetch → timeline + tableau mis à jour automatiquement.

**Story 7-2 (dashboard + liste) — `ready-for-dev` :** patterns les plus proches à réutiliser :
- **Page Server Component + searchParams Promise + Promise.all queries** : modèle exact pour `page.tsx` (T8).
- **Tableau HTML natif** (`TenantsTable`) : modèle pour les tableaux paiements/users.
- **Timeline events** (`OwnerRecentActivity`) : modèle pour le Journal (icône + texte + date relative).
- **Barre de progression CSS** (`OwnerHealthCard`) : modèle pour `user-quota-bar`.
- **Badges** (`TenantStatusBadge`/`TenantPlanBadge`) : réutiliser tels quels dans l'en-tête.
- **Helpers format** (`formatDateFr`, `formatDaysRemaining`, `formatRelativeDate`) : réutiliser dans tous les onglets.
- **Sous-requête corrélée SQL** (`activeUsers` dans `fetchTenantsPage`) : modèle pour `lastSeen` dans `getTenantUsers`.

**Story 7-3 (create tenant) — `ready-for-dev` :** pattern formulaire contrôlé (`new-tenant-form.tsx`) : modèle pour `edit-notes-form` et `edit-plan-form` (isPending, errors par champ, toast, `router.refresh()`).

**Story 6-3 (audit trail) — `done` :** pattern append-only. Le Journal (onglet 4) suit la même philosophie que `audit_event` — lecture seule, pas de modification/suppression.

**Epic 6 entièrement DONE** (2026-06-28). Epic 7 est le premier post-MVP.

---

## Git Intelligence Summary

Derniers commits pertinents :
- `a637dfe` fix: /register redirect to / (was /dashboard), add logout button to parametres
- `a5d9e2e` test(qa): API unit tests + Playwright E2E specs for uncovered routes — **pattern tests E2E**
- `a4f6977` feat(6-3): immutable audit trail export — **pattern append-only (modèle Journal)**
- `f57a515` feat(6-2): tier quota enforcement — **pattern quota bar (modèle user-quota-bar)**
- `725f64b` feat(3-9/3-10/3-11/6-1): lifecycle status, search/filter, duplicate quote, IndexedDB encryption

**Patterns établis à respecter :**
- Pages détail : `src/app/(app)/devis/[id]/page.tsx` (Server Component + fetch by id + notFound)
- Tests : Vitest à côté du module (`src/lib/owner/*.test.ts`), E2E dans `tests/e2e/`
- Chaque feat commit suit le format `feat(7-7): ...`
- Composants owner dans `src/components/owner/` (sous-dossier `tenant-detail/` pour les sous-composants tab)

---

## Latest Tech Information

### Next.js 16.1.6 — `params`/`searchParams` Promise + `useSearchParams` Suspense

Source : [Next.js 16 Page API](https://nextjs.org/docs/app/api-reference/file-conventions/page), [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params)

- **`params` et `searchParams` sont des Promises** — `await` obligatoire dans les Page Handlers.
- **`useSearchParams()` en Client Component** force un CSR bailout à moins d'être dans un `<Suspense>` boundary. Sans Suspense → erreur de build `"useSearchParams() should be wrapped in a suspense boundary"`.
- **Mitigation PPR (Partial Prerendering) :** `export const dynamic = "force-dynamic"` sur les pages qui dépendent de searchParams fraîches (admin pages). Évite le stale cache après `router.push`.

### shadcn/ui Tabs — Client Component sur @radix-ui/react-tabs

Source : [shadcn Tabs docs](https://ui.shadcn.com/docs/components/radix/tabs)

- shadcn `<Tabs>` est un Client Component (`"use client"` obligatoire dans le wrapper) car `@radix-ui/react-tabs` utilise React state/context.
- **Pattern recommandé en App Router :** Server Component parent fetch les données → passe en props au Client Component `<Tabs>` wrapper → les `<TabsContent>` peuvent contenir des Server Components enfants (Next 16 compose correctement).
- `value`/`onValueChange` permettent le contrôle externe (pour sync avec searchParams).
- Accessibilité native : ARIA tablist/tab/tabpanel, navigation clavier (flèches), focus management.

### Drizzle 0.44.7 — Sous-requête corrélée dans `select`

```ts
lastSeen: sql<Date | null>`(SELECT MAX(${session.expiresAt}) FROM ${session} WHERE ${session.userId} = ${user.id})`
```
- Drizzle permet d'injecter du SQL brut dans le `select({ ... })` via `sql\`...\``. Les colonnes référencées (`${session.expiresAt}`, `${user.id}`) sont automatiquement qualifiées avec leurs alias de table.
- Typage via `sql<Type>` — `sql<Date | null>` pour une colonne potentiellement absente.
- Pattern déjà utilisé en story 7-2 pour `activeUsers` (COUNT corrélé).

### React 19.4 — `<Suspense>` + composition Server/Client

Source : [React 19 Suspense](https://react.dev/reference/react/Suspense)

- `<Suspense fallback={...}>` autour d'un Client Component qui utilise `useSearchParams` — le fallback s'affiche pendant le rendu initial puis le composant hydrate.
- Les Server Components peuvent être passés comme props ou enfants aux Client Components (Next 16 sérialise correctement les données).

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Technology Stack & Versions** — Next 16.1.6, React 19.2.4, Drizzle 0.44.7, Zod 4.4.3, shadcn/ui 3.8.5, Lucide 0.539.0
- **TypeScript Strict Mode** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`
- **Framework-Specific Rules (Next.js/React)** — App Router, `"use client"`, `next/navigation`, `params`/`searchParams` Promise (Next 16), `<Suspense>` pour `useSearchParams`, i18n next-intl
- **API Routes Rules** — `apiError()`, cast `session.user.role`, Zod validation
- **Database Rules (Drizzle)** — sous-requêtes corrélées `sql\`...\``, `db.update().returning()`, `exactOptionalPropertyTypes` pour les payloads
- **Money / Financial Rules** — `formatFcfa()`, FCFA entier
- **Audit Trail Rules (Story 6-3)** — pattern append-only (modèle Journal)
- **Quota Rules (Story 6-2)** — pattern quota bar + tone colors
- **Language Convention** — UI FR (`fr-NE.json`), code EN, DB snake_case EN
- **Code Organization** — `src/lib/validation/` pour Zod, `src/lib/owner/` pour les queries owner, `src/lib/tenants/` pour la logique tenant métier

---

## Assumptions

(Assumptions non-interactives — à valider par le parent si besoin)

1. **Timeline visuelle en CSS divs** (pas de lib chart) — `buildSubscriptionTimeline` pure fn + composant CSS. Cohérent avec la carte de santé 7-2 (barre div).
2. **`@radix-ui/react-tabs` ajouté comme dépendance** — seule nouvelle dépendance de cette story (~3kb gzipped). Cohérent avec la stack shadcn déjà installée (dialog, dropdown-menu, etc.).
3. **Bouton "Réactiver" = placeholder désactivé** (story 7-8 non créée). Tooltip "Bientôt disponible".
4. **Boutons "Ajouter utilisateur" + "Révoquer" = placeholders désactivés** (story 7-9 non créée). Lien vers route future.
5. **Route PATCH update minimal** (plan/notes/status bruts) — shortcut administratif. Les transitions sémantiques (suspend avec motif/email, cancel avec slug-check/email, reactivate) passent par les routes dédiées 7-5/7-8.
6. **`tenants.maxUsers` OBSOLÈTE** — quota lu dynamiquement depuis `PLAN_LIMITS[plan].maxUsers`. Cette story ne modifie PAS `tenants.maxUsers` au changement de plan. Flag : migrer `fetchTenantsPage` (7-2) pour cohérence (TODO, hors scope).
7. **Mapping tenant↔company DEFERRED** — cette fiche lit uniquement `tenants` (pas de JOIN `company`). Si besoin d'afficher les infos société (raisonSociale, RCCM, NIF, logo), ajouter un 5e onglet "Société" en story future. Flag parent carry-forward.
8. **`actorId='system'` affiché comme "Système"** dans le Journal (cron 7-6). Pas d'email.
9. **`lastSeen` via sous-requête corrélée SQL** (perf acceptable pour < 20 users/tenant). Alternative : deux queries + merge JS (non retenue).
10. **Limite 200 events** dans le Journal (pas de pagination). Le volume reste faible en MVP. Pagination DEFERRED.
11. **`dynamic = "force-dynamic"`** sur la page (admin non publique, données fraîches). Évite le stale PPR Next 16.
12. **Mode dégradé si 7-4/7-5 absents** : placeholders désactivés + TODO. La fiche compile et fonctionne en lecture (3 onglets pleins + Infos sans actions).
13. **Pas de `not-found.tsx` owner dédié** — hérite du global `src/app/not-found.tsx`. Branding owner DEFERRED.
14. **Largeur minimum 2% par segment timeline** (sinon un segment d'un jour serait invisible sur un axe de plusieurs années).
15. **Edge timezone** (Niger UTC+1) : les dates `periodStart`/`periodEnd` (mode "date") peuvent glisser d'un jour à l'affichage. Acceptable en MVP (assumption héritée de 7-4).

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8)

### Debug Log References

- `pnpm typecheck` — clean after T1-T19 (2 fixes needed: `exactOptionalPropertyTypes` on `JournalTab.eventTypeFilter`, dead comparison in `users-tab.tsx` quota tone check)
- `pnpm lint` — 0 errors, pre-existing `import/order` warning baseline unchanged; fixed the one new error (`<a>` → `next/link` in `page.tsx`) plus import ordering in files this story touched
- `pnpm vitest run` — 657/657 passed (621 pre-existing + 36 new), 0 regressions
- `pnpm build` — succeeds; `/owner/tenants/[id]` compiles as dynamic (ƒ), no `useSearchParams` Suspense build error
- `npx playwright test --list` — fails with `TypeError: context.conditions?.includes is not a function` for **every** spec in `e2e/` (verified against pre-existing `owner-suspend-tenant.spec.ts` too) — a local Playwright/Node module-resolution environment issue, not introduced by this story. New spec typechecks clean and follows the exact seeding/assertion pattern of `owner-suspend-tenant.spec.ts` / `owner-record-payment.spec.ts`.

### Completion Notes List

- All 19 tasks implemented. Stories 7-1/7-2/7-4/7-5/7-6 were already `done` at start, so no degraded-mode placeholders were needed for `RecordPaymentTrigger`/`SuspendDialog`/`CancelDialog` — they're imported and mounted for real.
- **Architectural deviation from T7 pseudo-code (documented, necessary):** `InfosTab`, `SubscriptionTab`, `UsersTab`, `JournalTab` are async Server Components (they call `getTranslations` from `next-intl/server`). Next.js does not allow importing/rendering an async Server Component directly inside a `"use client"` module. So `TenantDetailTabs` (`tenant-detail-tabs.tsx`) takes the four tab bodies as **pre-rendered `ReactNode` props** (`infosContent`, `abonnementContent`, `utilisateursContent`, `journalContent`) instead of importing the tab components itself; `page.tsx` (the Server Component) renders `<InfosTab .../>` etc. and passes the elements down. This is the standard supported Server→Client children-slot pattern and preserves everything else in the story (searchParams-driven tab state, deep-linking, Suspense boundary).
- Reused `TenantNotFoundError` from `src/lib/tenants/suspend.ts` in `update-tenant.ts` (per Dev Notes guidance) instead of duplicating it.
- `tenant-detail.ts` correlated subquery for `lastSeen` uses real Drizzle column refs (`session.expiresAt`, `session.userId`) rather than raw string SQL, matching the `activeUsers` pattern already established in `tenant-filters.ts`.
- `[id]/page.tsx` pre-existed as a stub (no tabs, hardcoded French, no update route) from the 7-1..7-6 baseline — fully replaced per AC1-AC9.
- The existing `owner-suspend-tenant.spec.ts` E2E spec targets `/owner/tenants/[id]` and asserts the Suspend/Cancel buttons are visible with no tab interaction — this still works because "Infos générales" is the default active tab and the Suspend/Cancel dialogs live there, so no regression on that spec.
- fr-NE.json: added `owner.tenants.detail.*` (tabs/infos/abonnement/utilisateurs/journal) and `owner.events.updated` — purely additive, existing `owner.tenantDetail.*` legacy keys (used only by the old stub page) were left in place rather than deleted, since removing i18n keys is out of scope for this story and nothing else was verified to depend on them.
- E2E spec (`e2e/owner-tenant-detail.spec.ts`) could not be executed end-to-end in this environment (see Debug Log) but was typechecked and structurally validated against the two closest existing specs.

### File List

**Created:**
- `src/components/ui/tabs.tsx`
- `src/lib/owner/tenant-detail.ts`
- `src/lib/owner/tenant-detail.test.ts`
- `src/lib/owner/subscription-timeline.ts`
- `src/lib/owner/subscription-timeline.test.ts`
- `src/lib/tenants/update-tenant.ts`
- `src/lib/tenants/update-tenant.test.ts`
- `src/lib/validation/tenant-update.ts`
- `src/lib/validation/tenant-update.test.ts`
- `src/app/api/v1/owner/tenants/[id]/route.ts`
- `src/components/owner/tenant-detail-tabs.tsx`
- `src/components/owner/tabs-skeleton.tsx`
- `src/components/owner/tenant-detail/infos-tab.tsx`
- `src/components/owner/tenant-detail/subscription-tab.tsx`
- `src/components/owner/tenant-detail/subscription-timeline.tsx`
- `src/components/owner/tenant-detail/users-tab.tsx`
- `src/components/owner/tenant-detail/user-quota-bar.tsx`
- `src/components/owner/tenant-detail/journal-tab.tsx`
- `src/components/owner/tenant-detail/journal-event-filter.tsx`
- `src/components/owner/tenant-detail/edit-notes-form.tsx`
- `src/components/owner/tenant-detail/edit-plan-form.tsx`
- `e2e/owner-tenant-detail.spec.ts` (placed under `e2e/`, the repo's actual Playwright `testDir`, not `tests/e2e/` as the story draft assumed)

**Modified:**
- `src/app/owner/tenants/[id]/page.tsx` (replaced stub with full 4-tab Server Component)
- `src/messages/fr-NE.json` (additive: `owner.tenants.detail.*`, `owner.events.updated`)
- `package.json` / `pnpm-lock.yaml` (added `@radix-ui/react-tabs`)

### Review Findings

_Revue adversariale 2026-07-03 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 1 décision, 17 patchs, 6 différés, 8 rejetés (bruit/artefacts)._

- [x] [Review][Decision] `maxUsers` : deux sources de vérité (colonne `tenants.maxUsers` vs `PLAN_LIMITS[plan].maxUsers`) — **résolu 2026-07-03 : option (a)** — synchroniser la colonne lors du changement de plan (voir patch ci-dessous).
- [x] [Review][Patch] Sync `maxUsers = PLAN_LIMITS[newPlan].maxUsers` dans `applyTenantUpdate` quand `plan` change — élimine la divergence liste tenants (« n / 5 ») vs onglet Utilisateurs (« n / 1 ») après changement de plan [src/lib/tenants/update-tenant.ts:31]
- [x] [Review][Patch] edit-plan-form : échec API affiche `toast.error(t("planChanged"))` (libellé de succès) + échec réseau totalement muet [src/components/owner/tenant-detail/edit-plan-form.tsx:40]
- [x] [Review][Patch] edit-notes-form : erreurs 401/500/réseau affichées « notesTooLong » — ajouter clé d'erreur générique [src/components/owner/tenant-detail/edit-notes-form.tsx:36]
- [x] [Review][Patch] `?tab=` invalide non validé côté client → aucun onglet actif, contenu vide (serveur valide, client caste brut) [src/components/owner/tenant-detail-tabs.tsx:29]
- [x] [Review][Patch] `?event=` invalide non validé → journal vide trompeur + Select sans valeur — fallback « all » [src/app/owner/tenants/[id]/page.tsx:43]
- [x] [Review][Patch] AC1 : id non-UUID → Postgres 22P02 → 500 au lieu de `notFound()` [src/app/owner/tenants/[id]/page.tsx:36]
- [x] [Review][Patch] id non-UUID sur PATCH → 500 INTERNAL_ERROR au lieu de 404 [src/app/api/v1/owner/tenants/[id]/route.ts:38]
- [x] [Review][Patch] AC7 : garde `lastSeen <= now` absente — `MAX(session.expiresAt)` affiche une « dernière connexion » dans le futur. Fix : sous-requête basée sur `MAX(session.updatedAt)` (dernière activité réelle) avec garde `<= now()` en SQL (render pur — `Date.now()` en render interdit par la règle React purity) [src/lib/owner/tenant-detail.ts:64]
- [x] [Review][Patch] Timeline : pas de gap terminal quand dernier `periodEnd` < now — abonnement expiré affiche barre verte pleine jusqu'à « aujourd'hui » [src/lib/owner/subscription-timeline.ts:74]
- [x] [Review][Patch] Timeline : `Math.max(2, …)` sans re-normalisation → somme des largeurs > 100 %, segments récents coupés par `overflow-hidden` [src/components/owner/tenant-detail/subscription-timeline.tsx:29]
- [x] [Review][Patch] Timeline : `periodEnd < periodStart` → durées négatives non clampées [src/lib/owner/subscription-timeline.ts:27]
- [x] [Review][Patch] `applyTenantUpdate` : select + update non transactionnels → snapshot `before` faux sous concurrence — envelopper dans `db.transaction` [src/lib/tenants/update-tenant.ts:24]
- [x] [Review][Patch] Notes : `""` jamais normalisé en `NULL` — deux états distincts en base pour « pas de note » [src/lib/tenants/update-tenant.ts]
- [x] [Review][Patch] AC3 : badges plan/statut absents de la section « Identité » [src/components/owner/tenant-detail/infos-tab.tsx]
- [x] [Review][Patch] AC2 : « Tenants » codé en dur — clé `owner.tenants.detail.backToTenants` existe et n'est pas utilisée [src/app/owner/tenants/[id]/page.tsx:65]
- [x] [Review][Patch] AC7 : clé i18n `utilisateurs.quota` (« {active} / {max} utilisateurs ») inutilisée — rendu « X / Y » en dur [src/components/owner/tenant-detail/user-quota-bar.tsx]
- [x] [Review][Patch] AC5 : cas 0 paiement — suggestion d'utiliser le bouton « Enregistrer un paiement » manquante [src/components/owner/tenant-detail/subscription-timeline.tsx]
- [x] [Review][Patch] AC10 : test unitaire `computeUserQuota` cas `max=0` manquant [src/lib/owner/tenant-detail.test.ts]
- [x] [Review][Defer] PATCH `status` contourne les workflows suspend/cancel (eventType `updated` → introuvable via filtre `?event=suspended`, aucune règle de transition, `gracePeriodEndsAt` non purgé) — deferred, comportement voulu par spec AC4 (« shortcut administratif documenté ») ; à réévaluer en story 7-8
- [x] [Review][Defer] Chevauchements de périodes double-comptés dans `totalPaidDays` [src/lib/owner/subscription-timeline.ts:57] — deferred, juxtaposition explicitement acceptée par spec T3
- [x] [Review][Defer] Insertion `tenant_events` best-effort non transactionnelle (update possible sans trace d'audit) [src/lib/tenants/update-tenant.ts:44] — deferred, mandaté par spec T4
- [x] [Review][Defer] Select plan : revert vers prop périmée si succès puis échec avant fin de `router.refresh()` [src/components/owner/tenant-detail/edit-plan-form.tsx:41] — deferred, race rare, fix complexe
- [x] [Review][Defer] Assertions E2E manquantes (segments timeline, re-render badge plan, barre quota) + suite E2E non exécutable localement (env Playwright préexistant cassé) [e2e/owner-tenant-detail.spec.ts] — deferred, bloqué par environnement
- [x] [Review][Defer] Journal tronqué silencieusement à 200 événements sans indicateur [src/lib/owner/tenant-detail.ts:103] — deferred, pagination explicitement DEFERRED par spec AC8

### Change Log

- Story 7-7 créée : fiche tenant complète (4 onglets — Infos, Abonnement, Utilisateurs, Journal) — Epic 7 §3.3 (Date: 2026-06-28)
- Story 7-7 implémentée (Date: 2026-07-03) : 4 onglets (Infos/Abonnement/Utilisateurs/Journal), route PATCH update tenant, `@radix-ui/react-tabs`, 36 nouveaux tests unitaires + 1 spec E2E. `pnpm check` 657/657 tests, `pnpm build` OK.
- Code review adversarial (Date: 2026-07-03) : 18 patchs appliqués, 6 différés, 8 rejetés. Fixes clés : guard UUID (page + PATCH → 404), validation `?tab=`/`?event=` côté client, toasts d'erreur corrects (plan/notes), `lastSeen` = `MAX(session.updatedAt)` avec garde `<= now()` en SQL (au lieu de `expiresAt` — date future), timeline avec gap terminal + largeurs re-normalisées + durées clampées ≥ 0, `applyTenantUpdate` transactionnel (`SELECT … FOR UPDATE`) + sync `maxUsers` depuis `PLAN_LIMITS` au changement de plan (décision D1) + notes `""` → `NULL`, badges plan/statut section Identité, clés i18n `backToTenants`/`quota` branchées, suggestion 0-paiement. Décision D1 : colonne `maxUsers` synchronisée au changement de plan (option a). `pnpm check` 664/664 tests, `pnpm build` OK.
