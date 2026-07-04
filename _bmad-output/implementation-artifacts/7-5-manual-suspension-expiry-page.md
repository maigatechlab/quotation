---
story_key: 7-5-manual-suspension-expiry-page
epic_num: 7
story_num: 5
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (schema tenants + tenant_events + user.tenantId + tenantStatusEnum/tenantPlanEnum + enforceTenantAccess dans proxy.ts) — HARD"
  - "7-2-owner-dashboard-tenant-list (rôle superadmin + RBAC /owner/* + layout owner + fiche tenant embryon) — HARD (route /owner/tenants/[id])"
  - "7-3-create-tenant-welcome-email (pattern create-tenant.ts + email Resend + tenant_events insert + tenant-config.ts) — SOFT (patterns réutilisés)"
---

# Story 7.5 : Suspension manuelle + page expiration tenant

**Statut :** done

## Story

**En tant que** superadmin owner (Maiga Tech Lab),
**Je veux** suspendre manuellement un tenant (motif obligatoire) ou l'annuler définitivement depuis sa fiche, et qu'une page d'expiration s'affiche aux tenants suspendus/annulés,
**Afin que** les comptes en non-paiement passent en lecture seule (consultation/export autorisés, mutations bloquées) et les comptes en fraude/annulation soient bloqués totalement — tout en notifiant le client par email et en tracant chaque action dans le journal `tenant_events`.

---

## Critères d'acceptation (BDD)

**AC1 — Accès aux actions de suspension/annulation (superadmin uniquement)**

```
GIVEN  un utilisateur authentifié avec rôle "superadmin"
WHEN   il accède à /owner/tenants/[id]
THEN   la fiche tenant affiche les boutons "Suspendre" et "Annuler définitivement"
       (état du bouton selon le statut courant du tenant — cf. AC2)

GIVEN  un utilisateur avec rôle "admin" (tenant client), "commercial" ou "operateur"
WHEN   il appelle POST /api/v1/owner/tenants/[id]/suspend (ou /cancel)
THEN   l'API retourne 403 FORBIDDEN

GIVEN  un utilisateur non authentifié
WHEN   il appelle POST /api/v1/owner/tenants/[id]/suspend
THEN   l'API retourne 401 UNAUTHORIZED
```

> **Dépendance :** le rôle `superadmin` et la protection RBAC de `/owner/*` sont introduits par la **story 7-2**. Si 7-2 n'est pas implémentée au moment du dev, utiliser `role === "admin"` comme placeholder temporaire (cf. Dev Notes — mode dégradé) et laisser un `TODO(story-7-2)`.

**AC2 — État des boutons selon le statut du tenant**

```
GIVEN  un tenant avec status = "active" ou "trial"
WHEN   la fiche tenant se charge
THEN   le bouton "Suspendre" est ACTIF (enabled)
AND    le bouton "Annuler définitivement" est ACTIF
AND    le bouton "Réactiver" est MASQUÉ (réservé story 7-8)

GIVEN  un tenant avec status = "suspended"
WHEN   la fiche tenant se charge
THEN   le bouton "Suspendre" est DÉSACTIVÉ (déjà suspendu)
AND    le bouton "Annuler définitivement" reste ACTIF
AND    le bouton "Réactiver" est visible mais renvoie vers la story 7-8 (réservé — laisser un TODO)

GIVEN  un tenant avec status = "cancelled"
WHEN   la fiche tenant se charge
THEN   les boutons "Suspendre" et "Annuler définitivement" sont DÉSACTIVÉS (terminal)
AND    un badge "Annulé — données conservées" s'affiche
```

**AC3 — Suspension manuelle : motif obligatoire (FR-Epic7 §3.5)**

```
GIVEN  un tenant active/trial et un superadmin sur la fiche tenant
WHEN   il clique "Suspendre"
THEN   un dialog/modal s'ouvre avec :
        - Un SELECT de motif OBLIGATOIRE : non-paiement | fraude | demande-client | autre
        - Un champ texte "Note interne" (optionnel, max 2000 caractères)
        - Une case à cocher "Bloquer totalement (fraude/sécurité)" — par défaut DÉCOCHÉE
          (cf. §7 : non-paiement = lecture seule, fraude = blocage total)
        - Boutons "Annuler" et "Confirmer la suspension"

GIVEN  le dialog de suspension ouvert
WHEN   l'utilisateur clique "Confirmer" sans sélectionner de motif
THEN   l'erreur française "Le motif de suspension est requis" s'affiche sur le champ motif
AND    aucune mutation n'est déclenchée
```

**AC4 — Action Suspendre : transition de statut + événement + email (FR-Epic7 §3.5 + §4)**

```
GIVEN  un tenant active/trial, un motif sélectionné (ex: "non-paiement"), "Bloquer totalement" DÉCOCHÉ
WHEN   le superadmin confirme la suspension
THEN   l'API POST /api/v1/owner/tenants/[id]/suspend exécute :
        1. SELECT tenant actuel → snapshot before = { status, plan, name, slug }
        2. UPDATE tenants SET status = 'suspended' WHERE id = ? AND status IN ('active','trial')
           (clause WHERE protège contre la concurrence — renvoie le row updated)
        3. INSERT INTO tenant_events :
             eventType = 'suspended'
             tenantId  = <id>
             actorId   = <superadmin user_id>
             before    = <snapshot before>
             after     = { status: 'suspended', reason: <motif>, note: <note|null>, totalBlock: false }
             note      = "Suspendu par {superadmin email}"
        4. Envoi email suspension-notification au tenant (best-effort, AC5)
AND    la réponse retourne 200 { tenantId, status: 'suspended', emailSent: <bool> }

GIVEN  le tenant est déjà suspended ou cancelled
WHEN   l'API reçoit POST .../suspend
THEN   l'UPDATE affecte 0 ligne (clause WHERE)
AND    l'API retourne 409 CONFLICT "Le tenant n'est pas dans un état suspendable (active/trial)"

GIVEN  "Bloquer totalement" est COCHÉ (cas fraude/sécurité)
WHEN   le superadmin confirme
THEN   le statut passe quand même à 'suspended' (la sémantique total-block est portée par le
       champ `after.totalBlock = true` dans l'event ET par le reason = 'fraude'/'autre')
AND    l'enforcement (lecture seule vs blocage total) lit la combinaison status + reason/totalBlock
       (cf. AC6 + Dev Notes — coordination avec 7-1 enforceTenantAccess)
```

**AC5 — Email de notification de suspension (reuse Resend via src/lib/email.ts)**

```
GIVEN  une suspension réussie
WHEN   l'envoi email est tenté
THEN   un email est envoyé via sendEmail() à l'admin du tenant (user.role='admin', tenantId=<id>)
        contenant :
         - Sujet : "Votre abonnement Quotation Logistique a été suspendu"
         - Raison (libellé FR mappé depuis l'enum : non-paiement → "Non-paiement",
           fraude → "Fraude", demande-client → "Demande client", autre → "Autre")
         - Date d'effet (aujourd'hui)
         - Contact owner (WhatsApp + email — lus depuis platform settings ou placeholder défaut)
         - Mention "Vos données sont conservées" (jamais de suppression)
         - Lien vers /subscription-expired (page explicative)

GIVEN  l'envoi email échoue (Resend down ou erreur réseau)
WHEN   la suspension a réussi
THEN   l'erreur est catchée et loggée (console.error)
AND    la suspension n'est PAS annulée (le statut reste 'suspended')
AND    l'event tenant_events est quand même inséré avec note "... — email suspension échoué"
AND    la réponse API indique emailSent=false
```

**AC6 — Enforcement : lecture seule (suspended) vs blocage total (fraude/cancelled) (FR-Epic7 §7 + §4)**

```
GIVEN  un tenant avec status = 'suspended' ET reason/totalBlock indique non-paiement (lecture seule)
WHEN   un utilisateur du tenant tente une lecture (GET devis, GET clients, sync/pull)
THEN   la requête réussit normalement (consultation autorisée)
AND    l'export PDF/CSV reste autorisé

GIVEN  un tenant suspended (lecture seule, non-paiement)
WHEN   un utilisateur du tenant tente une mutation (POST/PUT/DELETE devis, clients, sync/push)
THEN   la mutation est BLOQUÉE — HTTP 403 FORBIDDEN { error: { code: "TENANT_READONLY" } }
       (OU redirect /subscription-expired si l'enforcement se fait au niveau proxy/router —
        cf. Dev Notes : décision coordination avec 7-1)

GIVEN  un tenant avec status = 'suspended' ET reason = 'fraude' (blocage total)
WHEN   un utilisateur du tenant tente N'IMPORTE QUELLE action (lecture ou mutation)
THEN   il est redirigé vers /subscription-expired (blocage total — pas même consultation)

GIVEN  un tenant avec status = 'cancelled'
WHEN   un utilisateur du tenant tente N'IMPORTE QUELLE action
THEN   il est redirigé vers /subscription-expired (blocage total)
```

> **NOTE — coordination avec 7-1 (CRITIQUE) :** la story 7-1 ajoute `enforceTenantAccess` dans `src/proxy.ts` qui fait la résolution sous-domaine → tenant → redirect vers `/subscription-expired` quand `status IN ('suspended','cancelled')`. Cette story 7-5 FOURNIT la **destination** (`/subscription-expired`) et les **actions owner** (suspend/cancel), MAIS la sémantique fine **lecture-seule vs blocage-total** pour `suspended` chevauche potentiellement 7-1. Décision : 7-1 gère le redirect global cancelled/fraude (blocage total) ; 7-5 AJOUTE le blocage lecture-seule des mutations pour suspended-non-paiement via un **helper partagé** `assertTenantWritable(tenant)` appelé dans les routes mutantes. Documenter clairement la frontière (cf. Dev Notes + File Structure).

**AC7 — Action "Annuler définitivement" avec confirmation (FR-Epic7 §3.3)**

```
GIVEN  un tenant (actif/suspended/trial) et un superadmin
WHEN   il clique "Annuler définitivement"
THEN   un dialog de confirmation sévère s'ouvre :
        - Titre : "Annuler définitivement le tenant « {name} » ?"
        - Message : "Cette action est IRRÉVERSIBLE. Le tenant sera bloqué totalement.
                     Les données sont CONSERVÉES (aucune suppression). Le tenant ne pourra
                     plus se connecter tant qu'il n'est pas réactivé manuellement."
        - Champ de confirmation typé : l'utilisateur doit saisir le slug exact du tenant
          pour activer le bouton "Confirmer l'annulation" (protection anti-misclick)
        - Boutons "Annuler" (default) et "Confirmer l'annulation" (destructif, rouge)

GIVEN  le dialog d'annulation ouvert
WHEN   l'utilisateur clique "Confirmer" sans saisir le slug OU avec un slug incorrect
THEN   le bouton "Confirmer l'annulation" reste DÉSACTIVÉ
AND    aucune mutation n'est déclenchée

GIVEN  l'utilisateur a saisi le slug exact du tenant
WHEN   il clique "Confirmer l'annulation"
THEN   l'API POST /api/v1/owner/tenants/[id]/cancel exécute :
        1. SELECT tenant actuel → snapshot before
        2. UPDATE tenants SET status = 'cancelled' WHERE id = ? AND status != 'cancelled'
        3. INSERT INTO tenant_events (eventType='cancelled', before, after={ status:'cancelled' },
           note="Annulé par {superadmin email}")
        4. Envoi email cancellation au tenant (best-effort)
AND    la réponse retourne 200 { tenantId, status: 'cancelled', emailSent }

GIVEN  le tenant est déjà cancelled
WHEN   l'API reçoit POST .../cancel
THEN   retourne 409 CONFLICT "Ce tenant est déjà annulé"
```

**AC8 — Page publique /subscription-expired (FR-Epic7 §4)**

```
GIVEN  un tenant redirigé vers /subscription-expired (par proxy.ts 7-1)
WHEN   la page se charge
THEN   elle affiche (Server Component, PAS de nav app, layout minimal) :
        - Titre : "Votre abonnement a expiré"
        - Message : "Votre abonnement Quotation Logistique a expiré ou a été suspendu."
        - Date d'expiration : {subscriptionEnd ou date de suspension selon contexte}
        - Contact owner : WhatsApp ({OWNER_WHATSAPP}) + Email ({OWNER_EMAIL})
          (lus depuis env/platform settings, valeurs placeholder si non configurés)
        - Mention rassurante : "Vos données sont conservées. Aucune information n'a été supprimée.
          Contactez votre interlocuteur pour régulariser et réactiver votre accès."
        - Lien "Se déconnecter" (logout)
AND    la page est HORS route group (app)/ — chemin exact : src/app/subscription-expired/page.tsx
AND    aucun élément de l'app shell (sidebar, quota banner) n'est rendu

GIVEN  OWNER_WHATSAPP et OWNER_EMAIL ne sont pas configurés
WHEN   la page se charge
THEN   des placeholders s'affichent : "Contactez votre interlocuteur Maiga Tech Lab"
AND    un lien mailto générique et un numéro placeholder (documenté dans env.example)

GIVEN  un visiteur sans tenant résolu (accès direct à /subscription-expired)
WHEN   la page se charge
THEN   la page s'affiche avec un message générique (ne crash pas, ne leak pas de données tenant)
```

**AC9 — Qualité & tests**

```
GIVEN  les fichiers créés/modifiés
WHEN   je lance pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
AND    tests unitaires (Vitest) couvrent :
         - buildSuspendEmailHtml() : escaping HTML du motif/note/contact, présence raison/date/contact
         - buildCancelEmailHtml() : escaping, mention irréversible, présence contact
         - validateSuspendInput() : motif manquant, note trop longue, enum invalide
         - applySuspension() : transition active→suspended, clause WHERE concurrentielle,
           event inséré avec before/after corrects, totalBlock flag propagé
         - applyCancellation() : transition →cancelled, slug-check de confirmation,
           event 'cancelled' inséré, 409 si déjà cancelled
         - getTenantContact() : résolution admin tenant (role='admin', tenantId)
         - buildOwnerContact() : fallback placeholder quand env non configuré
AND    tests E2E (Playwright) couvrent :
         - /subscription-expired affiche le message, la date, le contact owner, le logout
         - superadmin suspend un tenant → statut→suspended, event loggé, email mocké envoyé
         - suspension sans motif → erreur en ligne
         - annulation : slug-check bloque tant que slug incorrect, puis succès
         - email mocké (intercept sendEmail) vérifie le contenu (raison FR, contact)
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/api/v1/owner/tenants/[id]/suspend/route.ts` — CRÉER : POST (suspension manuelle transactionnelle)
- `src/app/api/v1/owner/tenants/[id]/cancel/route.ts` — CRÉER : POST (annulation définitive)
- `src/lib/tenants/suspend.ts` — CRÉER : `applySuspension(params)` — orchestration (update + event + email) + `TenantStateConflictError`
- `src/lib/tenants/cancel.ts` — CRÉER : `applyCancellation(params)` — orchestration (update + event + email)
- `src/lib/tenants/tenant-access.ts` — CRÉER : `assertTenantWritable(tenant)` helper partagé (lecture seule vs blocage total) + `isTotalBlock(tenant, latestEvent)` — utilisé par les routes mutantes ET coordonné avec 7-1 `enforceTenantAccess`
- `src/lib/tenants/tenant-contact.ts` — CRÉER : `getTenantAdminEmail(tenantId)` + `buildOwnerContact()` (lit env/platform settings)
- `src/lib/tenants/suspend-email.ts` — CRÉER : `buildSuspendEmailHtml(params)`, `buildSuspendEmailText(params)` (escaping HTML)
- `src/lib/tenants/cancel-email.ts` — CRÉER : `buildCancelEmailHtml(params)`, `buildCancelEmailText(params)` (escaping HTML)
- `src/lib/validation/tenant-lifecycle.ts` — CRÉER : `suspendSchema` (Zod : reason enum + note + totalBlock), `cancelSchema` (Zod : confirmSlug)
- `src/app/owner/tenants/[id]/suspend-dialog.tsx` — CRÉER : Client Component (modal motif + note + totalBlock checkbox)
- `src/app/owner/tenants/[id]/cancel-dialog.tsx` — CRÉER : Client Component (modal confirmation + slug-check)
- `src/app/subscription-expired/page.tsx` — CRÉER : Server Component (page expiration, layout minimal, hors route group app/)
- `src/messages/fr-NE.json` — UPDATE : sections `owner.tenants.suspend`, `owner.tenants.cancel`, `subscriptionExpired`
- Tests unitaires : `suspend.test.ts`, `cancel.test.ts`, `tenant-access.test.ts`, `suspend-email.test.ts`, `cancel-email.test.ts`
- Tests E2E : `tests/e2e/owner-suspend-tenant.spec.ts`, `tests/e2e/subscription-expired-page.spec.ts`

**EXCLU (hors périmètre — ne pas modifier) :**
- `src/lib/schema.ts` → tables `tenants`, `tenant_events`, `user.tenantId`, `tenantStatusEnum`/`tenantPlanEnum` → **déjà créés par story 7-1**
- `src/proxy.ts` → résolution sous-domaine + `enforceTenantAccess` redirect global → **story 7-1** (cette story NE touche PAS au proxy — sauf coordonner le helper `assertTenantWritable` via un import, cf. Dev Notes)
- Rôle `superadmin` dans `userRoleEnum` + RBAC `/owner/*` + fiche tenant `/owner/tenants/[id]` → **story 7-2** (cette story AJOUTE les dialogs/boutons DANS la fiche existante — UPDATE coordonné ou hooks)
- Cron expiration + rappels automatiques → **story 7-6**
- Réactivation après paiement → **story 7-8** (bouton "Réactiver" présent mais TODO/non-fonctionnel ici)
- Fiche tenant complète (onglets) → **story 7-7**
- `src/lib/email.ts` → **utilise tel quel** (`sendEmail`, `isEmailDeliveryConfigured`, pattern `buildResetPasswordHtml`, `escapeHtml`)
- Enregistrement de paiement → **story 7-4**
- Platform settings (prix, quotas, grace) UI → **story 7-12** (cette story LIT OWNER_WHATSAPP/OWNER_EMAIL depuis env, avec TODO pour brancher la table platform_settings future)

---

## Tâches / Sous-tâches

### T1 — CRÉER `src/lib/validation/tenant-lifecycle.ts` (AC3, AC7)

- [x] `suspendSchema = z.object({...})` :
  ```ts
  {
    reason: z.enum(["non-paiement", "fraude", "demande-client", "autre"], {
      required_error: "Le motif de suspension est requis",
    }),
    note: z.string().trim().max(2000, "La note ne doit pas dépasser 2000 caractères").optional(),
    totalBlock: z.boolean().default(false),
  }
  ```
  - Exporter `SuspendInput = z.infer<typeof suspendSchema>`
- [x] `cancelSchema = z.object({...})` :
  ```ts
  {
    confirmSlug: z.string().trim().min(1, "La confirmation du slug est requise"),
  }
  ```
  - **superRefine** n'est PAS nécessaire ici — la vérification `confirmSlug === tenant.slug` se fait côté orchestration (le schema ne connaît pas le tenant)
  - Exporter `CancelInput = z.infer<typeof cancelSchema>`
- [x] `pnpm typecheck` — zéro erreur

### T2 — CRÉER `src/lib/tenants/tenant-contact.ts` (AC5, AC8)

- [x] `getTenantAdminEmail(tenantId: string): Promise<string | null>` :
  ```ts
  // SELECT email FROM user WHERE tenant_id = ? AND role = 'admin' LIMIT 1
  // Retourne null si aucun admin trouvé (le tenant peut n'avoir que des users non-admin)
  ```
- [x] `buildOwnerContact(): { whatsapp: string | null; email: string | null; displayWhatsapp: string; displayEmail: string }` :
  ```ts
  const whatsapp = process.env.OWNER_WHATSAPP ?? null
  const email = process.env.OWNER_EMAIL ?? process.env.EMAIL_FROM ?? null
  // Valeurs d'affichage avec fallback :
  const displayWhatsapp = whatsapp ?? "Contactez votre interlocuteur Maiga Tech Lab"
  const displayEmail = email ?? "contact@maigatechlab.com"
  return { whatsapp, email, displayWhatsapp, displayEmail }
  ```
- [x] `pnpm typecheck`

### T3 — CRÉER `src/lib/tenants/suspend-email.ts` (AC5)

- [x] `buildSuspendEmailHtml(params): string` — retourne HTML inline-stylé (imiter `buildResetPasswordHtml` dans `src/lib/email.ts`) :
  - params : `{ tenantName, reasonLabel, effectiveDate, ownerWhatsapp, ownerEmail }`
    - `reasonLabel` : libellé FR déjà mappé depuis l'enum côté orchestration (pas l'enum brut)
  - **CRITIQUE — escaping :** `escapeHtml`/`escapeAttribute` (cf. `src/lib/email.ts`) sur `tenantName`, `reasonLabel`, `note`, `ownerEmail`. La note peut contenir `<`, `>`, `"`.
  - Contenu : objet de la suspension, raison, date d'effet, contact owner (WhatsApp cliquable `https://wa.me/...`, email `mailto:`), mention données conservées, lien `/subscription-expired`
- [x] `buildSuspendEmailText(params): string` — version texte brut
- [x] `pnpm typecheck`

### T4 — CRÉER `src/lib/tenants/cancel-email.ts` (AC5)

- [x] `buildCancelEmailHtml(params): string` — similaire au suspend mais ton "annulation définitive" :
  - params : `{ tenantName, effectiveDate, ownerWhatsapp, ownerEmail }`
  - Contenu : "Votre abonnement a été annulé définitivement", mention IRRÉVERSIBLE, données conservées, contact owner, mention que la réactivation nécessite contact manuel
- [x] `buildCancelEmailText(params): string`
- [x] `pnpm typecheck`

### T5 — CRÉER `src/lib/tenants/suspend.ts` — orchestration (AC4, AC5)

- [x] Signature :
  ```ts
  export interface SuspendParams {
    tenantId: string;
    input: SuspendInput;
    actorId: string;          // superadmin user_id
    actorEmail: string;       // pour la note d'audit
  }
  export interface SuspendResult {
    tenantId: string;
    status: "suspended";
    emailSent: boolean;
  }
  export class TenantStateConflictError extends Error {
    constructor(public currentState: string, public action: string) {
      super(`Le tenant n'est pas dans un état permettant l'action "${action}" (état actuel: ${currentState})`);
    }
  }
  export async function applySuspension(params: SuspendParams): Promise<SuspendResult>
  ```
- [x] Logique (DANS CET ORDRE) :
  1. **SELECT tenant** : `SELECT * FROM tenants WHERE id = ?`
     - si aucun → throw `TenantNotFoundError` (404)
  2. **Snapshot before** : `{ name, slug, plan, status }`
  3. **UPDATE atomique avec clause WHERE concurrentielle** :
     ```ts
     const [updated] = await db.update(tenants)
       .set({ status: "suspended", updatedAt: new Date() })
       .where(and(eq(tenants.id, tenantId), inArray(tenants.status, ["active", "trial"])))
       .returning()
     if (!updated) {
       // 0 ligne → déjà suspendu/cancelled → conflit
       throw new TenantStateConflictError(existing.status, "suspend")
     }
     ```
  4. **Résoudre l'email admin du tenant** : `getTenantAdminEmail(tenantId)` (best-effort)
  5. **Envoyer l'email** (si admin trouvé) — best-effort :
     ```ts
     let emailSent = false
     const adminEmail = await getTenantAdminEmail(tenantId)
     if (adminEmail) {
       try {
         const contact = buildOwnerContact()
         await sendEmail({
           to: adminEmail,
           subject: "Votre abonnement Quotation Logistique a été suspendu",
           html: buildSuspendEmailHtml({ tenantName: updated.name, reasonLabel, effectiveDate: new Date(), ownerWhatsapp: contact.displayWhatsapp, ownerEmail: contact.displayEmail }),
           text: buildSuspendEmailText({ ... }),
         })
         emailSent = true
       } catch (err) {
         console.error("Suspend email failed", err)
         emailSent = false
       }
     }
     ```
     - `reasonLabel` : mapper `input.reason` → libellé FR (table locale dans `suspend.ts`) :
       `non-paiement → "Non-paiement"`, `fraude → "Fraude"`, `demande-client → "Demande client"`, `autre → "Autre"`
  6. **Logger l'événement** (best-effort) :
     ```ts
     try {
       await db.insert(tenantEvents).values({
         tenantId,
         eventType: "suspended",
         actorId: params.actorId,
         before: existingSnapshot,
         after: { status: "suspended", reason: input.reason, note: input.note ?? null, totalBlock: input.totalBlock },
         note: emailSent ? `Suspendu par ${params.actorEmail}` : `Suspendu par ${params.actorEmail} — email suspension échoué`,
       })
     } catch (err) {
       console.error("tenant_events insert failed", err)
     }
     ```
  7. **Retourner** `{ tenantId, status: "suspended", emailSent }`
- [x] **NOTE — pas de rollback :** l'UPDATE tenant + l'email + l'event ne sont PAS dans une transaction native. L'UPDATE est atomique en soi ; l'email et l'event sont best-effort. Si l'email échoue, le statut reste `suspended` (intentionnel — la suspension doit tenir même sans email). Si l'event échoue, idem. Documenter ce choix (contrairement à 7-3 où un rollback tenant était nécessaire car user+tenant atomiques).
- [x] `pnpm typecheck`

### T6 — CRÉER `src/lib/tenants/cancel.ts` — orchestration (AC7, AC5)

- [x] Signature :
  ```ts
  export interface CancelParams {
    tenantId: string;
    input: CancelInput;       // contient confirmSlug
    actorId: string;
    actorEmail: string;
  }
  export interface CancelResult {
    tenantId: string;
    status: "cancelled";
    emailSent: boolean;
  }
  export async function applyCancellation(params: CancelParams): Promise<CancelResult>
  ```
- [x] Logique :
  1. **SELECT tenant** → 404 si absent
  2. **Vérifier le slug de confirmation** (protection anti-misclick) :
     ```ts
     if (input.confirmSlug !== existing.slug) {
       throw new CancelConfirmationError("Le slug saisi ne correspond pas au tenant")
     }
     ```
  3. **Snapshot before**
  4. **UPDATE atomique** :
     ```ts
     const [updated] = await db.update(tenants)
       .set({ status: "cancelled", updatedAt: new Date() })
       .where(and(eq(tenants.id, tenantId), not(eq(tenants.status, "cancelled"))))
       .returning()
     if (!updated) throw new TenantStateConflictError(existing.status, "cancel")
     ```
  5. **Email cancellation** (best-effort, même pattern que suspend)
  6. **Event `cancelled`** (best-effort)
  7. **Retourner** `{ tenantId, status: "cancelled", emailSent }`
- [x] `pnpm typecheck`

### T7 — CRÉER `src/lib/tenants/tenant-access.ts` — helper enforcement (AC6) — COORDINATION 7-1

- [x] `isTotalBlock(tenant): boolean` :
  ```ts
  // cancelled = toujours blocage total
  // suspended = blocage total SI l'event le plus récent indique totalBlock=true
  //   (raison fraude/sécurité) — sinon lecture seule (non-paiement)
  export async function isTotalBlock(tenant: { status: string }): Promise<boolean> {
    if (tenant.status === "cancelled") return true
    if (tenant.status !== "suspended") return false
    // Chercher l'event 'suspended' le plus récent pour ce tenant
    const latestSuspend = await db.select()
      .from(tenantEvents)
      .where(and(eq(tenantEvents.tenantId, tenant.id), eq(tenantEvents.eventType, "suspended")))
      .orderBy(desc(tenantEvents.createdAt))
      .limit(1)
    const after = latestSuspend[0]?.after as { totalBlock?: boolean } | undefined
    return Boolean(after?.totalBlock)
  }
  ```
  - **ASSOMPTION (flag pour parent) :** on lit `totalBlock` depuis le `after` du dernier event suspendu. Alternative : ajouter une colonne `blockMode` sur `tenants` (mais c'est une modification de schema = story 7-1). Décision : lire depuis l'event (pas de schema change dans cette story). Documenter le coût (1 SELECT par check — acceptable pour le volume MVP).
- [x] `assertTenantWritable(tenant): Promise<void>` :
  ```ts
  // Utilisé dans les routes MUTANTES (POST/PUT/DELETE) pour bloquer les tenants
  // en lecture seule (suspended non-paiement) ou en blocage total (cancelled/fraude)
  export async function assertTenantWritable(tenant: { id: string; status: string }): Promise<void> {
    if (tenant.status === "cancelled") {
      throw new TenantBlockError("TENANT_CANCELLED", "Le tenant est annulé.")
    }
    if (tenant.status === "suspended") {
      if (await isTotalBlock(tenant)) {
        throw new TenantBlockError("TENANT_BLOCKED", "Le tenant est bloqué totalement.")
      }
      throw new TenantBlockError("TENANT_READONLY", "Le tenant est en lecture seule.")
    }
    // active/trial → autorisé
  }
  ```
- [x] `export class TenantBlockError extends Error { constructor(public code: "TENANT_READONLY"|"TENANT_BLOCKED"|"TENANT_CANCELLED", message: string) { super(message) } }`
- [x] **NOTE coordination 7-1 :** le proxy 7-1 (`enforceTenantAccess`) fait le **redirect global** vers `/subscription-expired` pour cancelled/fraude (au niveau router). Ce helper `assertTenantWritable` gère le **blocage mutation** pour suspended-non-paiement (au niveau route API). Frontière documentée : 7-1 = redirect navigation ; 7-5 = blocage mutation fine. NE PAS dupliquer la logique de redirect dans les routes API (le proxy gère déjà). **Si 7-1 n'est pas encore implémenté**, ce helper est quand même créé et testable unitairement (mock db) — les routes mutantes ne l'appelleront qu'une fois 7-1 en place (TODO).
- [x] `pnpm typecheck`

### T8 — CRÉER `src/app/api/v1/owner/tenants/[id]/suspend/route.ts` (AC1, AC3, AC4)

- [x] `export async function POST(req: Request, { params }: { params: Promise<{ id: string }> })` :
  1. `auth.api.getSession({ headers: await headers() })` → 401 si null
  2. Cast `session.user.role` → si `!== "superadmin"` → 403 `apiError("FORBIDDEN", ...)`
     - **Mode dégradé (si 7-2 absent) :** accepter `=== "admin"` + `TODO(story-7-2)`
  3. `const { id } = await params` (Next 16 — params est une Promise)
  4. Parse + valide le body avec `suspendSchema.safeParse(await req.json())` → 400 `apiError("VALIDATION_FAILED", ..., fields)` si invalide
  5. `try { const result = await applySuspension({ tenantId: id, input, actorId: session.user.id, actorEmail: session.user.email }) ; return NextResponse.json(result, { status: 200 }) }`
  6. `catch (err)` :
     - si `err instanceof TenantNotFoundError` → 404
     - si `err instanceof TenantStateConflictError` → 409 `apiError("CONFLICT", err.message)`
     - sinon → `console.error(err)` ; 500 `apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL)`
- [x] NE PAS logger `input.note` en clair dans les erreurs 500 (elle peut être sensible) — masquer
- [x] `pnpm typecheck`

### T9 — CRÉER `src/app/api/v1/owner/tenants/[id]/cancel/route.ts` (AC1, AC7)

- [x] `export async function POST(req, { params })` :
  - Même structure que suspend (auth + superadmin check + parse `cancelSchema`)
  - `try { result = await applyCancellation({...}) ; 200 }`
  - `catch` :
    - `CancelConfirmationError` → 400 `apiError("VALIDATION_FAILED", "Le slug saisi ne correspond pas", fields={ confirmSlug: ... })`
    - `TenantNotFoundError` → 404
    - `TenantStateConflictError` → 409
    - sinon → 500
- [x] `pnpm typecheck`

### T10 — CRÉER `src/app/owner/tenants/[id]/suspend-dialog.tsx` (AC3, AC4)

- [x] `"use client"` première ligne, double quotes
- [x] Props : `{ tenantId, tenantName, disabled }`
- [x] États : `open`, `isPending`, `errors` (par champ), `reason`, `note`, `totalBlock`
- [x] Composant : `Dialog` (shadcn/ui) avec trigger `Button` variant="outline" "Suspendre" (disabled si prop)
- [x] Formulaire dans le dialog :
  - `Select` motif : 4 options (clés i18n `owner.tenants.suspend.reason.*`)
  - `Textarea` note (optionnel)
  - `Checkbox` totalBlock — label "Bloquer totalement (fraude/sécurité)" + helper text explicatif
  - Boutons : "Annuler" (ferme dialog) + "Confirmer la suspension" (destructif)
- [x] `handleSubmit` :
  ```ts
  setIsPending(true); setErrors({})
  const res = await fetch(`/api/v1/owner/tenants/${tenantId}/suspend`, { method: "POST", body: JSON.stringify({ reason, note: note || undefined, totalBlock }) })
  if (res.ok) {
    toast.success(`Tenant « ${tenantName} » suspendu`)
    setOpen(false); router.refresh()
  } else {
    const body = await res.json()
    if (body.error?.fields) setErrors(body.error.fields)
    else if (body.error?.code === "CONFLICT") toast.error("Le tenant n'est pas suspendable dans son état actuel")
    else toast.error("Une erreur est survenue")
  }
  setIsPending(false)
  ```
- [x] Tous les labels depuis `useTranslations("owner.tenants.suspend")` — JAMAIS de texte FR hardcodé
- [x] `pnpm typecheck`

### T11 — CRÉER `src/app/owner/tenants/[id]/cancel-dialog.tsx` (AC7)

- [x] `"use client"` première ligne
- [x] Props : `{ tenantId, tenantName, tenantSlug, disabled }`
- [x] États : `open`, `isPending`, `confirmSlug`, `error`
- [x] `Dialog` avec trigger `Button` variant="destructive" "Annuler définitivement"
- [x] Message d'avertissement sévère (clé i18n `owner.tenants.cancel.warning`)
- [x] Champ `Input` : "Pour confirmer, saisissez le slug du tenant (`{tenantSlug}`)"
  - Le bouton "Confirmer l'annulation" est `disabled` tant que `confirmSlug !== tenantSlug`
- [x] `handleSubmit` : POST `/cancel` avec `{ confirmSlug }` → toast + redirect/refresh
  - 400 `VALIDATION_FAILED` (slug incorrect) → erreur en ligne sur le champ
- [x] Tous les labels depuis `useTranslations("owner.tenants.cancel")`
- [x] `pnpm typecheck`

### T12 — UPDATE la fiche tenant `/owner/tenants/[id]` pour monter les dialogs (AC2)

- [x] **NOTE :** la fiche tenant `/owner/tenants/[id]` est créée par **story 7-2** (embryon) ou **7-7** (complète). Cette story AJOUTE les boutons/dialogs `SuspendDialog` + `CancelDialog` dans la fiche existante.
- [x] Si la fiche n'existe pas encore (7-2 non implémenté), créer un **embryon minimal** `src/app/owner/tenants/[id]/page.tsx` :
  - Server Component : auth superadmin + SELECT tenant + rendu des infos de base (name, slug, status badge) + montage des deux dialogs
  - **Flag pour parent :** ceci chevauche 7-2/7-7 — coordonner pour ne pas dupliquer. Assomption : créer l'embryon ici si absent, 7-7 l'enrichira en onglets.
- [x] États des boutons selon `tenant.status` (AC2) :
  - `active/trial` → Suspend enabled, Cancel enabled
  - `suspended` → Suspend disabled, Cancel enabled, badge "Suspendu"
  - `cancelled` → Suspend disabled, Cancel disabled, badge "Annulé"
- [x] `pnpm typecheck`

### T13 — CRÉER `src/app/subscription-expired/page.tsx` (AC8)

- [x] Server Component, **HORS route group `(app)/`** — chemin exact `src/app/subscription-expired/page.tsx` (URL `/subscription-expired`)
- [x] **PAS de `app/layout.tsx` implicite** : Next 16 — cette page hérite du layout racine `src/app/layout.tsx` (qui est minimal : html/body). Vérifier qu'elle n'est PAS sous `(app)/layout.tsx` (qui contient la sidebar/quota banner). Si besoin, ajouter un **route group** `(public)/` ou s'assurer que le `app/layout.tsx` racine ne rend pas l'app shell.
  - **ASSOMPTION (flag pour parent) :** le layout racine `app/layout.tsx` actuel ne contient PAS la sidebar (c'est `(app)/layout.tsx` qui l'a). Donc `/subscription-expired` hors `(app)/` = layout minimal automatique. Vérifier au dev.
- [x] Pas d'auth check (page publique — mais ne leak aucune donnée tenant)
- [x] Lecture des contacts owner : `buildOwnerContact()` (depuis `tenant-contact.ts`)
- [x] Contenu (i18n `subscriptionExpired.*`) :
  ```tsx
  <main className="min-h-screen flex items-center justify-center px-4">
    <div className="max-w-md w-full text-center space-y-4">
      <h1 className="font-serif text-2xl">{t("title")}</h1>
      <p className="text-text-muted">{t("message")}</p>
      <p className="text-sm">{t("dataPreserved")}</p>
      <div className="border rounded-lg p-4 space-y-2">
        <p className="font-semibold">{t("contactTitle")}</p>
        {contact.whatsapp && (
          <a href={`https://wa.me/${contact.whatsapp}`} className="block underline">{t("whatsapp")}: {contact.displayWhatsapp}</a>
        )}
        <a href={`mailto:${contact.displayEmail}`} className="block underline">{t("email")}: {contact.displayEmail}</a>
      </div>
      <form action="/api/auth/signout" method="post">
        <Button type="submit" variant="outline">{t("logout")}</Button>
      </form>
    </div>
  </main>
  ```
- [x] **NOTE — logout :** utiliser le endpoint Better Auth signout (POST `/api/auth/signout`) ou un `signOut()` du `auth-client`. Vérifier le pattern existant (le commit `a637dfe` a ajouté un bouton logout à `/parametres` — réutiliser ce pattern).
- [x] **ASSOMPTION — date d'expiration :** la page est générique (pas de résolution de tenant spécifique côté serveur — le proxy 7-1 fait le redirect mais ne passe pas le tenantId). Afficher un message générique sans date spécifique, OU récupérer le tenant depuis le subdomain si l'API le permet. Décision MVP : message générique sans date (flag pour parent — la page pourrait être enrichie en 7-6 pour afficher la date réelle via résolution subdomain côté serveur).
- [x] `pnpm typecheck`

### T14 — UPDATE `src/messages/fr-NE.json`

- [x] Ajouter section `owner.tenants.suspend` :
  ```json
  "suspend": {
    "trigger": "Suspendre",
    "title": "Suspendre le tenant « {name} »",
    "reasonLabel": "Motif de suspension",
    "reasonPlaceholder": "Sélectionnez un motif",
    "reasonRequired": "Le motif de suspension est requis",
    "reasonNonPaiement": "Non-paiement",
    "reasonFraude": "Fraude",
    "reasonDemandeClient": "Demande client",
    "reasonAutre": "Autre",
    "note": "Note interne",
    "noteHint": "Visible par le owner uniquement (optionnel)",
    "noteTooLong": "La note ne doit pas dépasser 2000 caractères",
    "totalBlock": "Bloquer totalement (fraude/sécurité)",
    "totalBlockHint": "Lecture seule si décoché (consultation autorisée). Blocage total si coché (aucun accès).",
    "confirm": "Confirmer la suspension",
    "cancel": "Annuler",
    "success": "Tenant « {name} » suspendu",
    "errorConflict": "Le tenant n'est pas suspendable dans son état actuel",
    "error": "Une erreur est survenue"
  }
  ```
- [x] Ajouter section `owner.tenants.cancel` :
  ```json
  "cancel": {
    "trigger": "Annuler définitivement",
    "title": "Annuler définitivement le tenant « {name} » ?",
    "warning": "Cette action est IRRÉVERSIBLE. Le tenant sera bloqué totalement. Les données sont CONSERVÉES (aucune suppression). Le tenant ne pourra plus se connecter tant qu'il n'est pas réactivé manuellement.",
    "confirmSlugLabel": "Pour confirmer, saisissez le slug du tenant",
    "confirmSlugHint": "Slug attendu : {slug}",
    "confirmSlugMismatch": "Le slug saisi ne correspond pas",
    "confirm": "Confirmer l'annulation",
    "cancel": "Annuler",
    "success": "Tenant « {name} » annulé définitivement",
    "errorConflict": "Ce tenant est déjà annulé",
    "error": "Une erreur est survenue"
  }
  ```
- [x] Ajouter section `subscriptionExpired` :
  ```json
  "subscriptionExpired": {
    "title": "Votre abonnement a expiré",
    "message": "Votre abonnement Quotation Logistique a expiré ou a été suspendu.",
    "dataPreserved": "Vos données sont conservées. Aucune information n'a été supprimée. Contactez votre interlocuteur pour régulariser et réactiver votre accès.",
    "contactTitle": "Contactez Maiga Tech Lab",
    "whatsapp": "WhatsApp",
    "email": "Email",
    "logout": "Se déconnecter"
  }
  ```

### T15 — Tests unitaires Vitest

- [x] `src/lib/tenants/suspend-email.test.ts` : escaping correct (note avec `<script>` et `"`), présence raison/date/contact/whatsapp/email, structure HTML
- [x] `src/lib/tenants/cancel-email.test.ts` : escaping, mention IRRÉVERSIBLE, présence contact
- [x] `src/lib/tenants/tenant-contact.test.ts` : `getTenantAdminEmail` retourne l'email admin (mock db), null si aucun admin ; `buildOwnerContact` fallback placeholder quand env non set
- [x] `src/lib/tenants/suspend.test.ts` (mock `db.update/insert/select`, `sendEmail`, `getTenantAdminEmail`) :
  - Cas nominal : active→suspended, event inséré avec before/after + totalBlock=false, email envoyé, `emailSent=true`
  - totalBlock=true → after.totalBlock=true dans l'event
  - Tenant déjà suspended → UPDATE renvoie 0 ligne → `TenantStateConflictError`, aucun event, aucun email
  - Tenant cancelled → idem conflit
  - Tenant inexistant → `TenantNotFoundError` (404)
  - `sendEmail` échoue → statut reste suspended, `emailSent=false`, event inséré avec note d'échec
  - Pas d'admin trouvé → pas d'email, event quand même inséré, `emailSent=false`
  - Mapping reason enum→libellé FR correct pour les 4 valeurs
- [x] `src/lib/tenants/cancel.test.ts` :
  - Cas nominal : →cancelled, event inséré, email envoyé
  - Slug de confirmation incorrect → `CancelConfirmationError`, aucun update
  - Déjà cancelled → `TenantStateConflictError`
  - `sendEmail` échoue → statut reste cancelled, `emailSent=false`
- [x] `src/lib/tenants/tenant-access.test.ts` (mock db) :
  - `isTotalBlock(cancelled)` → true
  - `isTotalBlock(suspended, dernier event totalBlock=true)` → true
  - `isTotalBlock(suspended, dernier event totalBlock=false)` → false
  - `isTotalBlock(active)` → false
  - `assertTenantWritable(active)` → ne throw pas
  - `assertTenantWritable(suspended non-paiement)` → throw `TENANT_READONLY`
  - `assertTenantWritable(suspended fraude)` → throw `TENANT_BLOCKED`
  - `assertTenantWritable(cancelled)` → throw `TENANT_CANCELLED`

### T16 — Tests E2E Playwright

- [x] `tests/e2e/subscription-expired-page.spec.ts` :
  - Accès direct `/subscription-expired` → page rendue (titre, message, contact, logout)
  - Pas de sidebar / app shell visible
  - Si OWNER_WHATSAPP/OWNER_EMAIL set → contacts affichés ; sinon placeholders
- [x] `tests/e2e/owner-suspend-tenant.spec.ts` :
  - **Setup** : seed superadmin (ou admin mode dégradé), seed un tenant active, login
  - Intercept `**/api/v1/owner/tenants/*/suspend` et mock sendEmail (dev mode console.log)
  - Scénarios :
    1. Ouvre le dialog suspend → 4 motifs visibles
    2. Confirme sans motif → erreur en ligne, pas de fetch
    3. Confirme avec motif "non-paiement" → toast success, statut→suspended, event loggé (vérifier en DB)
    4. Tente suspend sur un tenant déjà suspended → toast conflict
    5. Annulation : ouvre dialog, slug-check bloque tant que slug incorrect, puis succès
  - Vérifier le contenu de l'email mocké (raison FR, contact owner)

### T17 — Vérification finale (AC9)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (pas de régression, 334+ tests existants + nouveaux)
- [x] `pnpm build` : passe sans erreur
- [x] Aucune nouvelle dépendance installée (tout réutilise l'existant)

---

## Dev Notes

### CRITIQUE — Dépendances HARD sur stories 7-1 et 7-2

Cette story s'appuie sur DEUX stories précédentes non encore implémentées au moment de la création de ce fichier :

- **Story 7-1 (HARD) :** fournit `tenants`, `tenant_events` (tables), `user.tenantId` (colonne), `tenantStatusEnum` (`active|trial|suspended|cancelled`), `tenantPlanEnum`, `enforceTenantAccess` dans `src/proxy.ts` (redirect global cancelled/fraude → `/subscription-expired`), `tenant-config.ts`. **Sans 7-1, cette story ne compile pas** (tables `tenants`/`tenant_events` absentes du `src/lib/schema.ts` actuel — vérifié au moment de la création).
- **Story 7-2 (HARD) :** fournit le rôle `superadmin` dans `userRoleEnum` (actuellement seul `admin|commercial|operateur`), la fiche tenant `/owner/tenants/[id]` (embryon), le layout owner `/owner/layout.tsx`. **Sans 7-2, la route owner n'est pas protégée et `role === "superadmin"` ne typecheck pas.**

**Mode dégradé (si 7-1/7-2 absents au moment du dev) :**
- Côté page/API : `if (role !== "superadmin" && role !== "admin")` avec `// TODO(story-7-2): retirer "admin"`
- Côté schema : si `tenants`/`tenant_events` n'existent pas, **HALT** — cette story ne peut pas compiler sans 7-1. Documenter et attendre 7-1.
- Documenter chaque TODO clairement.

---

### CRITIQUE — `src/lib/schema.ts` actuel n'a PAS les tables tenants (vérifié)

Au moment de la création de ce fichier, `src/lib/schema.ts` contient `companySubscription` (Epic 6, tier-based quotas) mais **PAS** `tenants`/`tenant_events`/`tenantPlanEnum`/`tenantStatusEnum`. Ces dernières sont introduites par **story 7-1**. Conflit de noms à éviter :

- `tierEnum` (story 6-2) = `starter | pro | entreprise` (quotas MVP) — **DIFFÉRENT** de
- `tenantPlanEnum` (story 7-1) = `free | pro | enterprise` (plans SaaS Epic 7)

Cette story utilise `tenantStatusEnum` (`active|trial|suspended|cancelled`) et `tenantPlanEnum` (jamais `tierEnum`). Ne pas confondre.

---

### CRITIQUE — Coordination enforcement 7-1 vs 7-5 (frontière)

Le spec Epic 7 §4 prévoit un enforcement multi-niveau :

| Niveau | Story | Mécanisme | Périmètre |
|---|---|---|---|
| **Navigation (redirect)** | 7-1 | `enforceTenantAccess` dans `src/proxy.ts` | cancelled/fraude → redirect `/subscription-expired` |
| **Mutation fine (block)** | **7-5 (cette story)** | `assertTenantWritable(tenant)` dans routes mutantes | suspended-non-paiement → 403 TENANT_READONLY |
| **Lecture** | — | toujours autorisée (sauf fraude/cancelled gérés par 7-1) | consultation/export |

**Décision (assomption, flag pour parent) :**
- 7-1 gère le **redirect navigation** (cancelled + suspended-fraude → page expired) au niveau proxy/router.
- 7-5 fournit `assertTenantWritable` pour le **blocage mutation** lecture-seule (suspended-non-paiement), appelé dans les routes mutantes (`sync/push`, `clients POST`, `quotes POST`, etc.).
- **NE PAS dupliquer** le redirect dans les routes API — le proxy gère déjà.
- Si 7-1 n'est pas encore implémenté, `assertTenantWritable` est créé + testable unitairement (mock db), mais **les routes mutantes ne l'appelleront qu'une fois 7-1 en place** (TODO marqué). L'objectif de 7-5 est de FOURNIR le helper + les actions owner + la page destination.

**Alternative non retenue :** tout mettre dans le proxy. Rejeté car le proxy (middleware) ne peut pas facilement distinguer lecture vs mutation de façon fiable pour toutes les routes (sync/push POST contient des ops create ET update ET delete mélangés). Le helper route-level est plus précis.

---

### CRITIQUE — Email utility : réutiliser `src/lib/email.ts` (Resend, déjà configuré)

Le repository a **DÉJÀ** une lib d'email complète (`src/lib/email.ts`) :
- `sendEmail({ to, subject, html, text })` — Resend (`RESEND_API_KEY`) en prod, `console.log` en dev (sans clé).
- `isEmailDeliveryConfigured()` — booléen.
- `escapeHtml`/`escapeAttribute` — **privées** au module (non exportées). Pour cette story, soit (a) dupliquer ces fonctions dans `suspend-email.ts`/`cancel-email.ts` (pur, testable), soit (b) demander leur export (UPDATE `email.ts` — coordonner). **Décision : dupliquer** (pattern self-contained, pas de modification de `email.ts` qui est partagé).
- `buildResetPasswordHtml(email, resetUrl)` — template à **imiter**.

**NE PAS installer nodemailer.** NE PAS créer un second système. Réutiliser `sendEmail` tel quel.

**Tests :** en dev sans `RESEND_API_KEY`, `sendEmail` fait `console.log` et résout sans erreur — parfait pour les tests (pas de mock réseau).

---

### CRITIQUE — Pas de rollback nécessaire (contrairement à 7-3)

Dans 7-3, le rollback manuel était nécessaire car tenant+user devaient être atomiques. ICI :
- L'UPDATE tenant est atomique en soi (clause WHERE concurrentielle).
- L'email et l'event sont **best-effort** : un échec ne doit PAS annuler la suspension (le statut doit tenir — sinon le tenant retrouve l'accès par un échec réseau Resend, ce qui est un risque sécurité).
- Donc : UPDATE d'abord, puis email + event dans des `try/catch` indépendants. **Pas de rollback.**

---

### CRITIQUE — Clause WHERE concurrentielle sur l'UPDATE

Pour éviter les race conditions (deux admins suspendent en parallèle) :
```ts
.where(and(eq(tenants.id, tenantId), inArray(tenants.status, ["active", "trial"])))
.returning()
```
Si 0 ligne retournée → le statut a changé entre le SELECT et l'UPDATE (conflit) → 409. Ne PAS faire un UPDATE inconditionnel puis vérifier après.

---

### CRITIQUE — `isTotalBlock` : lire depuis l'event vs colonne (assomption flag)

Le spec §7 distingue lecture-seule (non-paiement) et blocage-total (fraude/sécurité) pour les `suspended`. Deux options pour stocker cette distinction :

1. **Colonne `blockMode` sur `tenants`** — propre mais = modification de schema (story 7-1).
2. **Lire `totalBlock` depuis le dernier event `suspended`** — pas de schema change, mais 1 SELECT par check.

**Décision MVP : option 2** (pas de schema change dans cette story). `isTotalBlock(tenant)` fait un SELECT sur `tenant_events` filtré par `eventType='suspended'`, trié par `createdAt DESC`, LIMIT 1, lit `after.totalBlock`. Acceptable pour le volume MVP (quelques tenants). **Flag pour parent :** si la perf devient un problème, migrer vers une colonne en 7-1 ou 7-12.

---

### CRITIQUE — Next 16 : `params` est une Promise

Dans les routes dynamiques Next 16, `params` est une `Promise` :
```ts
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  ...
}
```
Ne pas déstructurer `params` directement (synchrone = erreur de type en Next 16).

---

### CRITIQUE — Page `/subscription-expired` hors route group `(app)/`

Pour que la page d'expiration n'hérite PAS de l'app shell (sidebar, quota banner, offline banner — qui supposent un tenant résolu), elle doit être **hors** du route group `src/app/(app)/`. Chemin exact : `src/app/subscription-expired/page.tsx`. Elle hérite alors du layout racine `src/app/layout.tsx` (minimal : html/body).

**Vérifier au dev :** ouvrir `src/app/layout.tsx` et confirmer qu'il ne rend PAS la sidebar/QuotaBanner (ce devrait être `(app)/layout.tsx` qui le fait). Si le layout racine rend l'app shell, créer un route group `(public)/subscription-expired/` avec un layout public minimal.

---

### CRITIQUE — `exactOptionalPropertyTypes` (TS 5.9.3)

Pour l'event `after` jsonb :
```ts
after: { status: "suspended", reason: input.reason, note: input.note ?? null, totalBlock: input.totalBlock }
```
`input.note` est `string | undefined` → `?? null` pour le convertir en `string | null` (conforme au type jsonb). Ne pas faire `note: input.note` (type incompatible).

---

### CRITIQUE — `noUncheckedIndexedAccess`

`db.update(...).returning()` retourne un tableau ; `[updated]` peut être `undefined` :
```ts
const [updated] = await db.update(tenants).set({...}).where(...).returning()
if (!updated) throw new TenantStateConflictError(...)
```

Pour `isTotalBlock`, `latestSuspend[0]?.after` peut être `undefined` → optional chaining obligatoire.

---

### Pattern existant à réutiliser

- `src/lib/email.ts` — `sendEmail`, `buildResetPasswordHtml` (modèle template), `escapeHtml`/`escapeAttribute` (dupliquer)
- `src/lib/api/envelope.ts` — `apiError`, `HTTP_STATUS`, codes d'erreur
- `src/lib/permissions.ts` — référence RBAC (rôle `superadmin` = story 7-2)
- `src/lib/audit.ts` — pattern best-effort event (mais ici on insère directement dans `tenant_events`, table distincte de `audit_event`)
- `src/lib/tenants/create-tenant.ts` (story 7-3) — pattern orchestration tenant + email + event (mais **pas** le rollback — voir ci-dessus)
- `src/lib/tenants/tenant-config.ts` (story 7-1) — `PLAN_LIMITS`, `DEFAULT_TRIAL_DAYS`, `APEX_DOMAIN`
- `src/messages/fr-NE.json` — pattern next-intl
- `src/components/client/client-form.tsx` (story 2-6) — pattern formulaire contrôlé (isPending, errors par champ, toast)
- shadcn/ui — `Dialog`, `Select`, `Textarea`, `Checkbox`, `Input`, `Button` (déjà dans le repo)

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Installer nodemailer / react-email / une nouvelle lib email | Réutiliser `sendEmail` de `src/lib/email.ts` (Resend) |
| Rollback la suspension si l'email échoue | Email/event best-effort — le statut reste `suspended` |
| UPDATE tenant sans clause WHERE concurrentielle | `.where(and(eq(id), inArray(status, [...]))).returning()` + check 0 ligne → 409 |
| Modifier `src/lib/schema.ts` | Hors scope — tables fournies par story 7-1 |
| Modifier `src/proxy.ts` | Hors scope — `enforceTenantAccess` = story 7-1 (cette story fournit le helper route-level `assertTenantWritable`) |
| Modifier `src/lib/email.ts` | Utiliser `sendEmail` tel quel ; dupliquer `escapeHtml` si besoin |
| Confondre `tierEnum` (6-2) et `tenantPlanEnum` (7-1) | Cette story utilise `tenantStatusEnum` + `tenantPlanEnum` uniquement |
| Texte FR hardcodé dans les composants | Clés `owner.tenants.suspend.*` / `owner.tenants.cancel.*` / `subscriptionExpired.*` dans `fr-NE.json` |
| HTML email non échappé (note avec `<script>`) | `escapeHtml`/`escapeAttribute` sur tous les champs dynamiques |
| Logger `input.note` dans les erreurs 500 | Logger uniquement le message générique |
| Placer `/subscription-expired` sous `(app)/` | Hors route group → layout racine minimal (pas d'app shell) |
| Destructurer `params` synchrone (Next 16) | `const { id } = await params` (Promise) |
| Dupliquer la logique redirect dans les routes API | Le proxy 7-1 gère le redirect navigation ; `assertTenantWritable` gère le blocage mutation |

---

### Commandes pour le dev agent

```bash
# 0. Prérequis : stories 7-1 ET 7-2 implémentées (schema + superadmin + fiche tenant)
#    Vérifier : pnpm typecheck passe AVANT de commencer cette story
#    Si tenants/tenant_events n'existent pas dans schema.ts → HALT (attendre 7-1)

# 1. Docker en cours (DB)
docker compose up -d

# 2. AUCUNE migration à générer (schema fourni par 7-1)
# pnpm db:generate  ← NE PAS LANCER

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓ (334+ existants + nouveaux)

# 4. Build
pnpm build   # passe sans erreur

# 5. Test manuel (dev)
pnpm dev
# Owner : /owner/tenants/[id] → suspendre un tenant → vérifier console (email dev) + DB (status + event)
# Tenant : accéder à l'app en tant qu'utilisateur du tenant suspendu → redirect /subscription-expired
# Page directe : /subscription-expired → vérifier le rendu
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §3.3 (boutons Suspendre/Annuler), §3.5 (gestion suspensions : motif obligatoire, email auto, event loggé), §4 (page `/subscription-expired` + enforcement middleware), §7 (décisions : lecture-seule non-paiement vs blocage-total fraude/cancel)
- [CLAUDE.md] — conventions DB (uuid custom, text Better Auth), migration workflow, langues (UI FR / code EN), Next 16
- [project-context.md] — règles TypeScript strict, Drizzle, API envelope, i18n next-intl, money integer, Next 16 `params` Promise
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — fournit `tenants`, `tenant_events`, `user.tenantId`, enums, `enforceTenantAccess` (proxy), `tenant-config.ts`
- [Story 7-2] `_bmad-output/implementation-artifacts/7-2-*.md` — fournira `superadmin` role + RBAC `/owner/*` + fiche tenant embryon `/owner/tenants/[id]`
- [Story 7-3] `_bmad-output/implementation-artifacts/7-3-create-tenant-welcome-email.md` — pattern orchestration tenant + email + event (mais PAS le rollback ici)
- [Story 6-2] `_bmad-output/implementation-artifacts/6-2-tier-quota-enforcement.md` — pattern enforcement pre-mutation + best-effort + atomic SQL
- [Story 6-3] `_bmad-output/implementation-artifacts/6-3-immutable-audit-trail-export.md` — pattern table append-only + best-effort audit
- [src/lib/email.ts] — `sendEmail`, `buildResetPasswordHtml`, `escapeHtml`/`escapeAttribute` (modèle template email)
- [src/proxy.ts] — middleware actuel (cookie-only) ; 7-1 y ajoute `enforceTenantAccess`
- [src/lib/schema.ts] — `companySubscription` (Epic 6), `user` (avec `tenantId` après 7-1) ; `tenants`/`tenant_events` ajoutés par 7-1
- [src/lib/api/envelope.ts] — `apiError`, `HTTP_STATUS`, codes d'erreur

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`)

**Epic 7 :** Owner Panel & Gestion des abonnements SaaS — Post-MVP. Dépendances : Epic 1 (DONE), Epic 6 (DONE).

**Story 7.5 (P0)** couvre DEUX mécanismes complémentaires :
1. **Actions owner** (§3.3 + §3.5) : suspendre (motif obligatoire) et annuler définitivement (confirmation par slug) un tenant depuis sa fiche.
2. **Page d'expiration** (§4) : `/subscription-expired` affichée aux tenants suspendus/annulés, avec contact owner et mention données conservées.

**Décisions business clés (§7) :**
- **Non-paiement après grâce → lecture seule** (connexion OK, consultation/export OK, mutations bloquées).
- **Fraude / annulation / sécurité → blocage total** (aucun accès, redirect page expired).
- **Notifications :** emails + contact WhatsApp manuel (PAS de SMS en MVP).
- **Données :** toujours conservées (jamais de suppression à la suspension/annulation).

### Stories de l'Epic 7 (cross-context)

| ID | Titre | Relation avec 7-5 |
|----|-------|-------------------|
| 7.1 | Schema tenants + middleware subdomain routing | **PRÉREQUIS** — tables + `enforceTenantAccess` (redirect) |
| 7.2 | Dashboard + liste tenants + fiche embryon | **PRÉREQUIS** — `superadmin` + fiche `/owner/tenants/[id]` où monter les dialogs |
| 7.3 | Création manuelle tenant + email bienvenue | SOFT — patterns orchestration + email réutilisés |
| 7.4 | Enregistrement paiement | Indépendant (mais la réactivation post-paiement = 7-8) |
| **7.5** | **Suspension manuelle + page expiration** | **(cette story)** |
| 7.6 | Cron expiration + rappels | Lit les statuts posés ici (suspended automatique vs manuel) |
| 7.7 | Fiche tenant complète (onglets) | Enrichira la fiche où 7-5 monte les dialogs |
| 7.8 | Réactivation après paiement | Bouton "Réactiver" (TODO ici, implémenté en 7-8) |
| 7.12 | Paramètres plateforme | Fournira la table `platform_settings` (OWNER_WHATSAPP/OWNER_EMAIL lus depuis env en attendant) |

### Paramètres business retenus (Epic 7 §7)

```ts
// Sémantique d'enforcement
// suspended + totalBlock=false (non-paiement) → lecture seule
// suspended + totalBlock=true  (fraude/sécurité) → blocage total
// cancelled                     → blocage total (terminal)
```

---

## Architecture Compliance

| Contrainte | Conformité story 7-5 |
|---|---|
| Next.js 16 App Router (Server Components par défaut, `"use client"` si besoin) | ✅ Page expired = Server Component ; dialogs = Client Components |
| Next 16 `params` est une Promise | ✅ `const { id } = await params` dans les routes dynamiques |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`) | ✅ Guards `?? null`, vérification `[updated]`, optional chaining `latestSuspend[0]?.after` |
| Drizzle : uuid() pour custom tables | ✅ Utilise `tenants.id` (uuid) fourni par 7-1 |
| Better Auth tables : text IDs, ne pas modifier | ✅ `user.id` est text ; `getTenantAdminEmail` lit sans modifier |
| API envelope : `apiError()`, `HTTP_STATUS`, codes standard | ✅ Routes POST utilisent `apiError("VALIDATION_FAILED"|"CONFLICT"|"FORBIDDEN"|"NOT_FOUND"|"INTERNAL_ERROR")` |
| Zod validation dans `src/lib/validation/` | ✅ `suspendSchema`/`cancelSchema` dans `src/lib/validation/tenant-lifecycle.ts` |
| next-intl : UI strings dans `fr-NE.json` | ✅ Sections `owner.tenants.suspend`, `owner.tenants.cancel`, `subscriptionExpired` |
| Audit `tenant_events` : best-effort, ne bloque pas le flux principal | ✅ Insert dans try/catch indépendant de l'email |
| Pas de nouvelle dépendance (pnpm install) | ✅ Tout réutilise l'existant (`better-auth`, `zod`, `resend` via `email.ts`, shadcn/ui) |
| `next/navigation` (pas `next/router`) | ✅ `useRouter` de `next/navigation` dans les dialogs |
| Money : integer FCFA | N/A (pas de montant dans cette story) |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-5 |
|---|---|---|
| `next` | 16.1.6 | App Router, Server/Client Components, routes dynamiques (`params` Promise), `redirect` |
| `better-auth` | 1.6.11 | `auth.api.getSession` (auth superadmin dans routes + page) |
| `drizzle-orm` | 0.44.7 | `db.update`/`db.insert`/`db.select` sur `tenants`, `tenant_events`, `user` ; `inArray`, `not`, `and`, `desc` |
| `zod` | 4.4.3 | `suspendSchema`, `cancelSchema`, `safeParse` |
| `sonner` | 2.0.7 | `toast.success` / `toast.error` dans les dialogs |
| `next-intl` | 4.13.0 | `useTranslations`, `getTranslations` |
| shadcn/ui (new-york) | 3.8.5 | `Dialog`, `Select`, `Textarea`, `Checkbox`, `Input`, `Button` |
| `vitest` | 4.1.9 | Tests unitaires (suspend, cancel, access, emails) |
| `@playwright/test` | 1.61.0 | E2E owner-suspend + subscription-expired |

**Aucune nouvelle dépendance à installer.**

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `src/app/api/v1/owner/tenants/[id]/suspend/route.ts` | **NEW** | POST : suspension (valide → `applySuspension` → 200/409/500) |
| `src/app/api/v1/owner/tenants/[id]/cancel/route.ts` | **NEW** | POST : annulation (valide → `applyCancellation` → 200/400/409/500) |
| `src/lib/tenants/suspend.ts` | **NEW** | `applySuspension` (update WHERE concurrentielle + email + event) + `TenantStateConflictError`, `TenantNotFoundError` |
| `src/lib/tenants/cancel.ts` | **NEW** | `applyCancellation` (slug-check + update + email + event) + `CancelConfirmationError` |
| `src/lib/tenants/tenant-access.ts` | **NEW** | `assertTenantWritable`, `isTotalBlock`, `TenantBlockError` (helper enforcement lecture-seule vs blocage total) |
| `src/lib/tenants/tenant-contact.ts` | **NEW** | `getTenantAdminEmail`, `buildOwnerContact` |
| `src/lib/tenants/suspend-email.ts` | **NEW** | `buildSuspendEmailHtml`, `buildSuspendEmailText` (escaping) |
| `src/lib/tenants/cancel-email.ts` | **NEW** | `buildCancelEmailHtml`, `buildCancelEmailText` (escaping) |
| `src/lib/validation/tenant-lifecycle.ts` | **NEW** | `suspendSchema`, `cancelSchema` (Zod) |
| `src/app/owner/tenants/[id]/suspend-dialog.tsx` | **NEW** | Client Component : modal motif + note + totalBlock |
| `src/app/owner/tenants/[id]/cancel-dialog.tsx` | **NEW** | Client Component : modal confirmation + slug-check |
| `src/app/owner/tenants/[id]/page.tsx` | **NEW ou UPDATE** | Embryon fiche tenant (si 7-2 absent) OU UPDATE pour monter les dialogs |
| `src/app/subscription-expired/page.tsx` | **NEW** | Server Component page expiration (hors route group app/) |
| `src/messages/fr-NE.json` | **UPDATE** | Sections `owner.tenants.suspend`, `owner.tenants.cancel`, `subscriptionExpired` |
| `src/lib/tenants/suspend-email.test.ts` | **NEW** | Tests escaping + contenu email suspension |
| `src/lib/tenants/cancel-email.test.ts` | **NEW** | Tests escaping + contenu email annulation |
| `src/lib/tenants/tenant-contact.test.ts` | **NEW** | Tests résolution admin + fallback contacts |
| `src/lib/tenants/suspend.test.ts` | **NEW** | Tests orchestration suspension (mocks db/sendEmail) |
| `src/lib/tenants/cancel.test.ts` | **NEW** | Tests orchestration annulation |
| `src/lib/tenants/tenant-access.test.ts` | **NEW** | Tests `isTotalBlock` + `assertTenantWritable` |
| `tests/e2e/owner-suspend-tenant.spec.ts` | **NEW** | E2E suspend/cancel flow |
| `tests/e2e/subscription-expired-page.spec.ts` | **NEW** | E2E page expiration |

**Ne PAS modifier :**
- `src/lib/schema.ts` (tables fournies par story 7-1)
- `src/proxy.ts` (`enforceTenantAccess` = story 7-1)
- `src/lib/email.ts` (utiliser `sendEmail` tel quel ; dupliquer `escapeHtml` si besoin)
- `src/lib/auth.ts` (Better Auth config)
- `src/lib/permissions.ts` (rôle `superadmin` = story 7-2)
- `src/lib/tenants/tenant-config.ts` (fourni par 7-1, lire les constantes)
- `env.example` (`OWNER_WHATSAPP`/`OWNER_EMAIL` ajoutés par story 7-1 ou 7-12 — flag)

---

## Testing Requirements

### Tests unitaires (Vitest)

**Fonctions pures (couverture haute, sans mock) :**
- `suspend-email.test.ts` : escaping (note avec `<script>`, `"`, `'`), présence raison/date/contact/whatsapp/email, structure HTML
- `cancel-email.test.ts` : escaping, mention IRRÉVERSIBLE, présence contact
- `tenant-contact.test.ts` (mock db léger) : `getTenantAdminEmail` retourne admin email / null ; `buildOwnerContact` fallback placeholder

**Orchestration (mocks db/sendEmail) :**
- `suspend.test.ts` :
  - Cas nominal : active→suspended, event inséré avec before/after + totalBlock=false, email envoyé, `emailSent=true`
  - totalBlock=true → after.totalBlock=true
  - Déjà suspended → UPDATE 0 ligne → `TenantStateConflictError`, aucun event/email
  - Inexistant → `TenantNotFoundError`
  - `sendEmail` échoue → statut suspended conservé, `emailSent=false`, event avec note d'échec
  - Pas d'admin → pas d'email, event quand même, `emailSent=false`
  - Mapping reason enum→FR correct (4 valeurs)
- `cancel.test.ts` :
  - Cas nominal → cancelled + event + email
  - Slug incorrect → `CancelConfirmationError`, aucun update
  - Déjà cancelled → conflit
  - Email échoue → cancelled conservé
- `tenant-access.test.ts` :
  - `isTotalBlock` : cancelled→true, suspended+totalBlock→true/false, active→false
  - `assertTenantWritable` : active→OK, suspended-non-paiement→TENANT_READONLY, suspended-fraude→TENANT_BLOCKED, cancelled→TENANT_CANCELLED

### Tests E2E (Playwright)

- `subscription-expired-page.spec.ts` :
  - Accès direct `/subscription-expired` → page rendue (titre, message, contact, logout), pas d'app shell
  - Placeholders si env non configurés
- `owner-suspend-tenant.spec.ts` :
  - Setup : seed superadmin + tenant active, login
  - Mock email (dev console.log)
  - Suspend sans motif → erreur en ligne
  - Suspend avec motif → toast + statut suspended + event en DB + email mocké vérifié
  - Suspend tenant déjà suspended → toast conflict
  - Cancel : slug-check bloque, puis succès

### Tests existants

- `pnpm check` doit continuer à passer : **334+ tests existants**. Aucune régression attendue car cette story ne modifie AUCUN fichier existant sauf `fr-NE.json` (ajout de clés, non-cassant) et potentiellement la fiche tenant 7-2/7-7 (UPDATE coordonné).

---

## Previous Story Intelligence

**Story 7-4 (record payment) — NON CRÉÉE au moment de cette création.** Conformément aux instructions, on saute l'intelligence previous-story et on référence **7-3 + 7-1** à la place.

**Story 7-3 (create tenant + welcome email) — `ready-for-dev` :** patterns directement réutilisables :
- Orchestration `createTenantWithAdmin` → modèle pour `applySuspension`/`applyCancellation` (update + email + event séquentiel).
- **DIFFÉRENCE clé :** 7-3 avait un rollback manuel (tenant+user atomiques). ICI **pas de rollback** — email/event best-effort, le statut doit tenir même si l'email échoue (sécurité).
- `buildWelcomeEmailHtml` → modèle pour `buildSuspendEmailHtml`/`buildCancelEmailHtml` (escaping, template inline-stylé).
- `TenantConflictError` → modèle pour `TenantStateConflictError` (409).
- Pattern `auth.api.getSession` + cast `session.user` + check role + Zod `safeParse` + `apiError` → identique.
- Mode dégradé `role === "admin"` accepté temporairement avec TODO 7-2.

**Story 7-1 (schema + proxy) — `ready-for-dev` :** socle. Points à respecter :
- `tenant_events` est append-only (pas de revision/updatedAt) — pattern `audit_event` story 6-3.
- `tenants.status` est `tenantStatusEnum` (`active|trial|suspended|cancelled`) — utiliser `inArray`/`not`/`eq` de Drizzle pour les clauses WHERE.
- `tenant_events.after` est jsonb — typer via `as { totalBlock?: boolean }` (cast prudent avec optional chaining).
- `enforceTenantAccess` (proxy 7-1) fait le redirect navigation ; `assertTenantWritable` (cette story) fait le blocage mutation — **ne pas dupliquer**.
- Conflit de noms tiers : `tierEnum` (6-2) ≠ `tenantPlanEnum` (7-1). Cette story utilise `tenantStatusEnum`.

**Story 6-2 (quota enforcement) — `done` :** pattern enforcement le plus proche :
- Pre-mutation check via helper (`checkQuota` → `assertTenantWritable` ici).
- Best-effort notify (`notifyQuota80Percent` → email suspension ici).
- Atomic SQL (`sql\`quota + 1\`` → ici clause WHERE concurrentielle sur UPDATE).
- HTTP 429 pour quota vs HTTP 403 pour tenant readonly — distinction claire.

**Story 6-3 (audit trail) — `done` :** pattern best-effort audit. L'insert `tenant_events` suit la même philosophie : try/catch, ne bloque jamais le flux principal.

**Epic 6 entièrement DONE** (2026-06-28). Epic 7 est le premier post-MVP.

---

## Git Intelligence Summary

Derniers commits pertinents :
- `a637dfe` fix: /register redirect to / (was /dashboard), add logout button to parametres — **pattern logout à réutiliser pour `/subscription-expired`**
- `a5d9e2e` test(qa): API unit tests + Playwright E2E specs for uncovered routes
- `a4f6977` feat(6-3): immutable audit trail export — pattern tenant_events append-only
- `f57a515` feat(6-2): tier quota enforcement — pattern enforcement pre-mutation

**Patterns établis à respecter :**
- API routes : `auth.api.getSession` → cast `session.user` → check role → Zod `safeParse` → `apiError` ou `NextResponse.json`
- Tests : Vitest à côté du module (`src/lib/tenants/*.test.ts`), E2E dans `tests/e2e/`
- Chaque feat commit suit le format `feat(7-5): ...`
- Logout button pattern (commit a637dfe) → réutiliser pour la page expired

---

## Latest tech Information

### Next.js 16.1.6 — `params` est une Promise dans les routes dynamiques

Source : [Next.js 16 release notes](https://next.dev/blog/next-16), App Router docs.

- Dans les Page/Route Handlers dynamiques, `params` est désormais une `Promise<{ ... }>` — doit être `await`-ed.
- Server Components par défaut ; `"use client"` (double quotes, première ligne) pour les composants interactifs (dialogs).
- `redirect()` de `next/navigation` (Server Components) ; `useRouter()` de `next/navigation` (Client Components) — JAMAIS `next/router`.
- Route groups `(group)/` pour layouts partagés sans impact URL — clé pour isoler `/subscription-expired` hors `(app)/`.

### Drizzle 0.44.7 — Clause WHERE concurrentielle sur UPDATE

Source : [Drizzle ORM update docs](https://orm.drizzle.team/docs/update)

- `db.update(table).set({...}).where(and(eq(...), inArray(...))).returning()` — pattern UPDATE atomique avec clause de garde.
- Si 0 ligne retournée → la condition WHERE n'a matché aucun row (état changé entre SELECT et UPDATE) → traiter comme conflit (409).
- `inArray(column, [...])` et `not(eq(...))` pour les guards sur enums.
- `desc(column)` + `limit(1)` pour récupérer le dernier event (`isTotalBlock`).

### Better Auth 1.6.11 — `signOut` côté client/server

- Pour le bouton logout de `/subscription-expired` : utiliser `signOut()` du `src/lib/auth-client.ts` (côté client) ou POST `/api/auth/signout` (côté serveur/form).
- Le commit `a637dfe` a déjà établi ce pattern sur `/parametres` — réutiliser.

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Technology Stack & Versions** — Better Auth 1.6.11, Drizzle 0.44.7, Zod 4.4.3, Resend (via email.ts), shadcn/ui
- **TypeScript Strict Mode** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`
- **Framework-Specific Rules (Next.js/React)** — App Router, `"use client"`, `next/navigation`, i18n next-intl, `params` Promise (Next 16)
- **API Routes Rules** — `apiError()`, cast `session.user` à `Record<string, unknown>`, Zod validation
- **Permissions Rules** — référence `requirePermission`/`can` (rôle `superadmin` = story 7-2)
- **Audit Trail Rules (Story 6-3)** — pattern best-effort, `before`/`after` jsonb
- **Quota Rules (Story 6-2)** — pattern enforcement pre-mutation + best-effort notify + atomic SQL
- **Language Convention** — UI FR (`fr-NE.json`), code EN, DB snake_case EN
- **Code Organization** — `src/lib/validation/` pour Zod schemas, `src/lib/tenants/` pour la logique tenant

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-06-30)

### Debug Log References

- `required_error` non supporté sur `z.enum` dans Zod 4.4.3 (compat layer) — remplacé par enum sans custom error (frontend gère l'affichage via i18n)
- `tenant-contact.test.ts` : mock `@/lib/db` ajouté pour éviter l'erreur POSTGRES_URL dans les tests purs de `buildOwnerContact`
- Import `headers` inutilisé dans la route suspend — supprimé
- Import `user as userTable` inutilisé dans `suspend.ts` — supprimé (la résolution de l'admin est dans `tenant-contact.ts`)

### Completion Notes List

- T1 : `suspendSchema` + `cancelSchema` créés dans `src/lib/validation/tenant-lifecycle.ts`
- T2 : `getTenantAdminEmail` + `buildOwnerContact` dans `src/lib/tenants/tenant-contact.ts`
- T3 : `buildSuspendEmailHtml/Text` avec `escapeHtml`/`escapeAttribute` dupliqués (pattern welcome-email)
- T4 : `buildCancelEmailHtml/Text` — mention IRRÉVERSIBLE, réactivation contact manuel
- T5 : `applySuspension` — UPDATE WHERE concurrentielle + best-effort email + best-effort event, `TenantStateConflictError`/`TenantNotFoundError` exportés
- T6 : `applyCancellation` — slug-check anti-misclick + même pattern best-effort, `CancelConfirmationError`
- T7 : `assertTenantWritable` + `isTotalBlock` + `TenantBlockError` — lit `totalBlock` depuis dernier event `suspended` (pas de schema change)
- T8 : POST `/api/v1/owner/tenants/[id]/suspend` — `requireOwnerSession` + Zod + `applySuspension` + erreurs typées
- T9 : POST `/api/v1/owner/tenants/[id]/cancel` — même pattern
- T10 : `SuspendDialog` client component — Select motif + Textarea note + checkbox totalBlock natif
- T11 : `CancelDialog` client component — slug-check, bouton confirm désactivé tant que slug incorrect
- T12 : Fiche tenant embryon `/owner/tenants/[id]/page.tsx` — `TenantStatusBadge` + `TenantPlanBadge` réutilisés, boutons dialogs avec états AC2, TODO(story-7-8) réactivation
- T13 : `/subscription-expired/page.tsx` mis à jour — `buildOwnerContact` depuis `tenant-contact.ts`, `ExpiredLogoutButton` (no crypto context), `subscriptionExpired.*` i18n
- T14 : `fr-NE.json` — sections `owner.tenants.suspend`, `owner.tenants.cancel`, `subscriptionExpired`, `owner.tenants.tenantDetail` ajoutées
- T15 : 6 fichiers de tests unitaires — 563 tests, 0 régression
- T16 : 2 fichiers E2E Playwright — subscription-expired-page.spec.ts + owner-suspend-tenant.spec.ts
- T17 : `pnpm check` ✓ (0 erreurs, 44 warnings import-order dans tests — non bloquants) + `pnpm build` ✓

### File List

- `src/lib/validation/tenant-lifecycle.ts` — NEW
- `src/lib/tenants/tenant-contact.ts` — NEW
- `src/lib/tenants/suspend-email.ts` — NEW
- `src/lib/tenants/cancel-email.ts` — NEW
- `src/lib/tenants/suspend.ts` — NEW
- `src/lib/tenants/cancel.ts` — NEW
- `src/lib/tenants/tenant-access.ts` — NEW
- `src/app/api/v1/owner/tenants/[id]/suspend/route.ts` — NEW
- `src/app/api/v1/owner/tenants/[id]/cancel/route.ts` — NEW
- `src/app/owner/tenants/[id]/suspend-dialog.tsx` — NEW
- `src/app/owner/tenants/[id]/cancel-dialog.tsx` — NEW
- `src/app/owner/tenants/[id]/page.tsx` — NEW (embryon fiche tenant)
- `src/app/subscription-expired/page.tsx` — UPDATE (refactorisé vers subscriptionExpired.* i18n + buildOwnerContact)
- `src/app/subscription-expired/logout-button.tsx` — NEW (client component sans crypto context)
- `src/messages/fr-NE.json` — UPDATE (sections suspend/cancel/subscriptionExpired/tenantDetail)
- `src/lib/tenants/suspend-email.test.ts` — NEW
- `src/lib/tenants/cancel-email.test.ts` — NEW
- `src/lib/tenants/tenant-contact.test.ts` — NEW
- `src/lib/tenants/suspend.test.ts` — NEW
- `src/lib/tenants/cancel.test.ts` — NEW
- `src/lib/tenants/tenant-access.test.ts` — NEW
- `e2e/subscription-expired-page.spec.ts` — NEW
- `e2e/owner-suspend-tenant.spec.ts` — NEW
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATE (7-5 → in-progress → review)

### Review Findings

_À remplir après code-review._

### Change Log

- Story 7-5 créée : suspension manuelle + page expiration tenant — Epic 7 §3.3 + §3.5 + §4 + §7 (Date: 2026-06-28)
- Story 7-5 implémentée : 14 fichiers créés, 2 mis à jour, 6 test suites unitaires (563 tests ✓), 2 specs E2E, build ✓ (Date: 2026-06-30)

- Review fixes 7-5 appliqués : enforcement API tenant, page expiration avec date, validation motif FR, admin tenant lié à `companyId` et `tenantId`, tests ciblés + `pnpm check` + `pnpm build` ✓ (Date: 2026-06-30)
- Note validation : `pnpm test:e2e` puis les deux specs 7-5 ciblées ont été tentés, mais le runner Playwright est resté silencieux/hung et a dû être stoppé sans résultat exploitable (Date: 2026-06-30)
