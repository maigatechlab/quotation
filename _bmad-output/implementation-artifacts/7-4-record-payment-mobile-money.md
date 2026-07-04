---
story_key: 7-4-record-payment-mobile-money
epic_num: 7
story_num: 4
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (enums paymentMethodEnum/billingCycleEnum + tables tenants/subscription_payments/tenant_events + tenant-config.ts) — HARD"
  - "7-2-owner-dashboard-tenant-list (rôle superadmin + RBAC /owner/* + requireOwnerSession() + layout owner + liste tenants) — HARD"
  - "7-3-create-tenant-welcome-email (pattern transactionnel rollback + reuse sendEmail + tenantPlanEnum) — SOFT (patterns, pas de dépendance runtime)"
---

# Story 7.4 : Enregistrement paiement (mobile money + manuel)

**Statut :** done

## Story

**En tant que** superadmin owner (Maiga Tech Lab),
**Je veux** enregistrer manuellement un paiement mobile money (Wave / Nitta / Amana) ou autre (Stripe / Cash / Virement) reçu hors-ligne pour un tenant, via un modal "Enregistrer un paiement" accessible depuis la liste et la fiche tenant,
**Afin que** chaque encaissement soit tracé dans `subscription_payments`, prolonge la période d'abonnement couverte, puisse réactiver un compte suspendu si demandé, et déclenche un email de confirmation au client — sans aucune intégration webhook (Wave/Nitta/Amana n'ont pas d'API webhook au Niger).

---

## Critères d'acceptation (BDD)

**AC1 — Accès à l'action "Enregistrer un paiement" (superadmin uniquement)**

```
GIVEN  un utilisateur authentifié avec rôle "superadmin"
WHEN   il ouvre la liste /owner/tenants OU la fiche /owner/tenants/[id]
THEN   un bouton / action "Enregistrer un paiement" est visible par ligne (liste) et sur la fiche
AND    au clic, un modal "Enregistrer un paiement" s'ouvre pré-rempli avec le tenant concerné

GIVEN  un utilisateur authentifié avec rôle "admin" (tenant client), "commercial" ou "operateur"
WHEN   il tente d'accéder à l'action ou appelle POST /api/v1/owner/tenants/[id]/payments
THEN   la route API retourne 403 FORBIDDEN (via requireOwnerSession())
AND    le modal ne s'affiche pas côté UI (l'action n'est rendue QUE si role === "superadmin")

GIVEN  un utilisateur non authentifié
WHEN   il appelle POST /api/v1/owner/tenants/[id]/payments
THEN   la route retourne 401 UNAUTHORIZED
```

> **Dépendance :** `requireOwnerSession()` est introduit par la **story 7-2**. Si 7-2 n'est pas implémentée au moment du dev, utiliser `role === "admin"` comme placeholder temporaire (cf. Dev Notes — mode dégradé) et laisser un `// TODO(story-7-2)`.

**AC2 — Champs du modal et validation client (FR-Epic7 §3.3 "Modal Enregistrer un paiement")**

```
GIVEN  le modal "Enregistrer un paiement" ouvert pour un tenant T
THEN   les champs suivants s'affichent :
       - Méthode de paiement [Select : Wave | Nitta | Amana | Stripe | Cash | Virement] (obligatoire)
       - Référence transaction [texte, optionnel sauf pour Stripe/Wave où elle est fortement recommandée]
       - Montant FCFA         [nombre entier > 0, obligatoire]
       - Date du paiement     [date, défaut = aujourd'hui, obligatoire]
       - Cycle de facturation [Select : Mensuel | Annuel] (obligatoire, détermine periodStart/End par défaut)
       - Période couverte     [date début] → [date fin] (obligatoires ; auto-calculées depuis cycle + date paiement, éditables)
       - Notes                [texte libre, optionnel]
       - ☐ Réactiver le compte si suspendu (checkbox, unchecked par défaut)

GIVEN  l'utilisateur soumet sans méthode de paiement
THEN   l'erreur française "La méthode de paiement est requise" s'affiche en ligne sur le champ
AND    aucune mutation n'est déclenchée

GIVEN  l'utilisateur saisit un montant négatif, nul, ou décimal (ex: 25000.50)
WHEN   il soumet
THEN   l'erreur "Le montant doit être un entier positif en FCFA" s'affiche
AND    aucune mutation n'est déclenchée

GIVEN  l'utilisateur saisit une période fin < période début
WHEN   il soumet
THEN   l'erreur "La date de fin de période doit être après la date de début" s'affiche

GIVEN  l'utilisateur saisit une date de paiement dans le futur (> aujourd'hui + 1 jour)
WHEN   il soumet
THEN   l'erreur "La date de paiement ne peut pas être dans le futur" s'affiche
```

**AC3 — Auto-calcul de la période couverte depuis le cycle (pure, testable)**

```
GIVEN  l'utilisateur choisit cycle = "monthly" et date paiement = 2026-06-15
THEN   periodStart s'auto-remplit = 2026-06-15 ET periodEnd s'auto-remplit = 2026-07-15 (+30 jours)
       (l'utilisateur peut encore éditer manuellement les deux dates)

GIVEN  l'utilisateur choisit cycle = "annual" et date paiement = 2026-06-15
THEN   periodStart = 2026-06-15 ET periodEnd = 2027-06-15 (+365 jours)

GIVEN  l'utilisateur change la date de paiement
THEN   periodStart ET periodEnd sont recalculés (si l'utilisateur n'a pas édité manuellement periodStart/End)

GIVEN  l'utilisateur édite manuellement periodEnd
THEN   l'auto-calcul est verrouillé (comme l'auto-slug en story 7-3) — re-saisir la date de paiement n'écrase plus periodEnd
```

**AC4 — Validation serveur (Zod) et existence du tenant**

```
GIVEN  un body POST /api/v1/owner/tenants/[id]/payments valide (tous champs AC2)
WHEN   l'API valide avec recordPaymentSchema.safeParse
THEN   les règles suivantes sont appliquées (identiques côté client + serveur) :
       - paymentMethod ∈ {nitta, wave, amana, stripe, cash, virement}
       - paymentReference : string max 200 (optionnel)
       - amount : integer > 0 ET ≤ 1e13 (borne money.ts)
       - paidAt : ISO datetime, ≤ now + 1 jour (tolérance fuseau)
       - periodStart : ISO date, < periodEnd
       - periodEnd : ISO date, > periodStart
       - billingCycle ∈ {monthly, annual}
       - reactivateIfSuspended : boolean (défaut false)
       - notes : string max 2000 (optionnel)
AND    si invalide → 400 apiError("VALIDATION_FAILED", ..., { fields })

GIVEN  un tenantId dans l'URL qui n'existe pas en base
WHEN   l'API valide
THEN   retour 404 apiError("NOT_FOUND", "Tenant introuvable", HTTP_STATUS.NOT_FOUND)

GIVEN  un tenantId existant mais status = 'cancelled'
WHEN   l'utilisateur tente d'enregistrer un paiement
THEN   retour 409 apiError("CONFLICT", "Impossible d'enregistrer un paiement pour un tenant annulé", ...)
       (un tenant annulé est définitif — pas de réactivation possible via paiement)
```

**AC5 — Insertion `subscription_payments` + journalisation `tenant_events` (transactionnel)**

```
GIVEN  un body valide pour un tenant T (status ∈ {active, trial, suspended})
WHEN   l'API exécute recordPayment()
THEN   l'opération s'exécute atomiquement et séquentiellement :
         1. SELECT tenant T FOR UPDATE (verrou pessimiste — empêche deux paiements concurrents)
         2. INSERT dans subscription_payments :
              { tenantId: T.id, amount, currency: "XOF", paymentMethod,
                paymentReference: paymentReference ?? null, paidAt,
                periodStart, periodEnd, billingCycle,
                confirmedBy: <superadmin user_id>, notes: notes ?? null }
         3. INSERT dans tenant_events :
              { tenantId: T.id, eventType: "payment_recorded",
                actorId: <superadmin user_id>, before: null,
                after: { amount, currency, paymentMethod, paymentReference, paidAt,
                         periodStart, periodEnd, billingCycle },  // JAMAIS de notes privées ici
                note: `Paiement ${paymentMethod} ${amount} XOF confirmé par ${actorEmail}` }
         4. (si reactivateIfSuspended ET T.status === "suspended") : cf. AC6
         5. (envoi email confirmation au client) : cf. AC7 (best-effort)
AND    l'insertion tenant_events est best-effort : un échec d'audit est loggé mais ne fait PAS échouer le paiement (pattern story 6-3)
AND    la réponse retourne 201 avec { paymentId, tenantId, amount, periodStart, periodEnd, reactivated, emailSent }
```

**AC6 — Checkbox "Réactiver si suspendu" (suspended → active)**

```
GIVEN  un tenant T avec status = "suspended"
AND    la checkbox "Réactiver le compte si suspendu" est COCHÉE
WHEN   le paiement réussit
THEN   en plus de l'insert payment (AC5) :
         - UPDATE tenants SET status = 'active',
             subscriptionStart = <periodStart>,
             subscriptionEnd = <periodEnd>,
             gracePeriodEndsAt = NULL
           WHERE id = T.id
         - INSERT tenant_events { eventType: "reactivated", actorId, before: { status: "suspended" },
             after: { status: "active", subscriptionEnd: periodEnd }, note: "Réactivé après paiement" }
AND    l'email de confirmation (AC7) mentionne "Votre compte a été réactivé"

GIVEN  un tenant T avec status = "suspended" ET checkbox DÉCOCHÉE
WHEN   le paiement réussit
THEN   le paiement est enregistré MAIS T.status reste "suspended"
AND    la réponse contient reactivated: false
AND    un warning s'affiche côté UI : "Paiement enregistré mais le compte reste suspendu. Cochez « Réactiver » pour le réactiver."

GIVEN  un tenant T avec status ∈ {active, trial} ET checkbox cochée
WHEN   le paiement réussit
THEN   la checkbox est ignorée (rien à réactiver) — T.status inchangé
AND    si subscriptionEnd (du tenant) < periodEnd (du paiement) → UPDATE tenants.subscriptionEnd = periodEnd
       (le paiement prolonge l'abonnement à la nouvelle période couverte)
```

**AC7 — Email de confirmation au client (reuse sendEmail)**

```
GIVEN  un paiement enregistré avec succès (reactivated ou non)
WHEN   l'étape email s'exécute (après AC5/AC6)
THEN   un email est envoyé via sendEmail() (src/lib/email.ts — Resend) à l'admin du tenant
       (SELECT email FROM user WHERE tenantId = T.id AND role = 'admin' ORDER BY createdAt LIMIT 1)
       contenant :
         - Sujet : "Paiement reçu — {amount} XOF" (ou "Compte réactivé — paiement reçu" si reactivated)
         - Montant + méthode + référence + date
         - Période couverte (du periodStart au periodEnd, format FR)
         - Si reactivated : mention explicite "Votre compte a été réactivé. Vous pouvez vous reconnecter."
         - Lien de connexion (https://{slug}.quotation.com — apex domain depuis tenant-config.ts)
AND    l'envoi est best-effort : si sendEmail lève (Resindown, pas de RESEND_API_KEY en prod),
       le paiement N'EST PAS annulé, emailSent = false, l'erreur est loggée (console.error)
AND    l'event tenant_events "payment_recorded" (AC5) contient dans sa note la mention
       "email envoyé" OU "email échoué" selon le cas

GIVEN  aucun user admin n'existe pour le tenant (T sans user lié)
WHEN   l'étape email s'exécute
THEN   l'email est skippé (emailSent = false), aucune erreur — note dans l'event "aucun email admin trouvé"

GIVEN  plusieurs users admin existent pour le tenant
WHEN   l'étape email s'exécute
THEN   l'email est envoyé au PLUS ANCIEN admin (ORDER BY createdAt ASC LIMIT 1)
       (assumption MVP — un seul destinataire ; Cc multiple DEFERRED)
```

**AC8 — Navigation et feedback UI**

```
GIVEN  un paiement enregistré avec succès
WHEN   l'API répond 201
THEN   le modal se ferme
AND    un toast success s'affiche : "Paiement de {amount} XOF enregistré pour {tenantName}"
AND    la page sous-jacente (liste ou fiche) se refresh (router.refresh()) pour refléter
       le nouveau paiement dans "Dernier paiement" / historique

GIVEN  une erreur 400 (validation)
WHEN   l'API répond
THEN   les erreurs par champ s'affichent en ligne dans le modal (pas de toast générique)

GIVEN  une erreur 404 (tenant introuvable)
WHEN   l'API répond
THEN   un toast erreur s'affiche : "Tenant introuvable" et le modal se ferme

GIVEN  une erreur 500 ou réseau
WHEN   l'API répond
THEN   un toast erreur s'affiche : "Une erreur est survenue. Le paiement n'a pas été enregistré."
AND    le bouton submit redevient actif (isPending = false)
```

**AC9 — Sécurité : pas de données sensibles dans les logs**

```
GIVEN  l'exécution de recordPayment()
THEN   les console.error / logs serveur ne contiennent JAMAIS :
       - le paymentReference en clair (peut contenir un ID Wave semi-privé) — le masquer partiellement
       - les notes privées du owner (input.notes)
AND    tenant_events.after (AC5) ne contient PAS les notes (jamais persistées dans l'event)
AND    tenant_events.after ne contient que { amount, currency, paymentMethod, paymentReference, paidAt, periodStart, periodEnd, billingCycle }
```

**AC10 — Qualité & tests**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression (334+ tests)
AND    pnpm build passe sans erreur
AND    tests unitaires (Vitest) couvrent :
        - calculatePeriodFromCycle() : monthly → +30j, annual → +365j, edge fin de mois
        - recordPaymentSchema : tous les cas d'erreur (AC4) — amount ≤ 0, décimal, periodEnd < periodStart, paidAt futur
        - buildPaymentConfirmationEmailHtml() : escaping HTML (référence avec <script>), présence des champs
        - recordPayment() (mock db + sendEmail) :
            * cas nominal (insert payment + insert event, emailSent=true, reactivated=false)
            * tenant suspended + reactivateIfSuspended=true → status→active, subscriptionEnd mis à jour, event "reactivated"
            * tenant suspended + reactivateIfSuspended=false → status inchangé
            * tenant active + subscriptionEnd < periodEnd → subscriptionEnd prolongé
            * tenant cancelled → 409 CONFLICT, aucun insert
            * tenant introuvable → 404 NOT_FOUND
            * sendEmail échoue → paiement conservé, emailSent=false
            * pas d'admin user → email skippé, emailSent=false
AND    tests E2E (Playwright) couvrent :
        - superadmin ouvre le modal depuis /owner/tenants (action par ligne)
        - soumission valide → toast success + refresh liste
        - montant décimal → erreur en ligne
        - tenant suspendu + checkbox réactiver → statut passe à actif (vérifier via re-fetch)
        - mock email (intercept sendEmail via console.log dev mode) vérifie le contenu
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/api/v1/owner/tenants/[id]/payments/route.ts` — CRÉER : POST (validation Zod → `recordPayment()` → 201/400/404/409/500)
- `src/lib/tenants/period.ts` — CRÉER : `calculatePeriodFromCycle(cycle, paidAt)` (pure, +30j/+365j)
- `src/lib/tenants/payment-email.ts` — CRÉER : `buildPaymentConfirmationEmailHtml(params)`, `buildPaymentConfirmationEmailText(params)` (escaping HTML)
- `src/lib/tenants/record-payment.ts` — CRÉER : `recordPayment(params)` — orchestration transactionnelle (lock + insert payment + insert event + réactivation + email)
- `src/lib/validation/payment.ts` — CRÉER : `recordPaymentSchema` (Zod — tous les champs + validation)
- `src/components/owner/record-payment-modal.tsx` — CRÉER : Client Component (modal contrôlé, auto-period, validation, soumission)
- `src/components/owner/record-payment-trigger.tsx` — CRÉER : wrapper bouton/action qui ouvre le modal (réutilisable liste + fiche)
- Tests unitaires : `period.test.ts`, `payment-email.test.ts`, `record-payment.test.ts` (mock `db`, `sendEmail`)
- `src/messages/fr-NE.json` — UPDATE : section `owner.payments.record` (tous les labels FR)
- Tests E2E : `tests/e2e/owner-record-payment.spec.ts` — CRÉER

**EXCLU (ne pas modifier — hors périmètre) :**
- `src/lib/schema.ts` → `subscription_payments`, `tenant_events`, `tenants`, `paymentMethodEnum`, `billingCycleEnum` → **déjà créés par story 7-1**
- Rôle `superadmin` + `requireOwnerSession()` + layout owner + liste tenants → **story 7-2**
- Fiche tenant `/owner/tenants/[id]` (onglet Abonnement / historique paiements) → **story 7-7** (le bouton "Enregistrer un paiement" est exposé via `RecordPaymentTrigger` réutilisable ; 7-7 le montera aussi dans la fiche)
- Cron expiration + rappels automatiques → **story 7-6**
- Suspension manuelle (page expiration) → **story 7-5** (cette story ne fait que LIRE `status='suspended'` et le lever si demandé)
- Réactivation autonome (sans paiement enregistré) → **story 7-8**
- Stripe webhook auto-activation → **story 7-10** (cette story enregistre un paiement Stripe MANUEL si l'owner le saisit, mais le webhook Stripe est un flux séparé)
- Rapports / export comptabilité → **story 7-11**
- Paramètres plateforme (prix, grace period) → **story 7-12**
- `src/lib/email.ts` → **utilise tel quel** (`sendEmail`, `isEmailDeliveryConfigured`, pattern `buildResetPasswordHtml`)
- `src/proxy.ts` → inchangé (la protection `/owner/*` est déjà posée par 7-2)

---

## Tâches / Sous-tâches

### T1 — CRÉER `src/lib/tenants/period.ts` (AC3, pure)

- [x] `calculatePeriodFromCycle(params: { cycle: "monthly" | "annual"; paidAt: Date }): { periodStart: Date; periodEnd: Date }` :
  - `periodStart = paidAt` (même jour)
  - `periodEnd = new Date(paidAt)` puis :
    - `monthly` → `periodEnd.setDate(periodEnd.getDate() + 30)`
    - `annual` → `periodEnd.setFullYear(periodEnd.getFullYear() + 1)` (année calendaire — préféré à +365j pour rester sur la même date jour/mois)
  - Retourner les deux dates (ne PAS muter l'input — cloner avec `new Date()`)
- [x] Documenter le choix "annual = +1 an calendaire" (vs +365j) dans un commentaire
- [x] `pnpm typecheck` — zéro erreur

### T2 — CRÉER `src/lib/validation/payment.ts` (AC2, AC4)

- [x] `recordPaymentSchema = z.object({...})` :
  ```ts
  {
    paymentMethod: z.enum(["nitta", "wave", "amana", "stripe", "cash", "virement"]),
    paymentReference: z.string().trim().max(200).optional(),
    amount: z.number().int("Le montant doit être un entier").positive("Le montant doit être positif")
             .max(1e13, "Montant hors borne"),
    paidAt: z.string().datetime(),  // ISO datetime string
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    billingCycle: z.enum(["monthly", "annual"]),
    reactivateIfSuspended: z.boolean().default(false),
    notes: z.string().trim().max(2000).optional(),
  }
  ```
- [x] **superRefine :**
  - `periodEnd > periodStart` sinon erreur sur `periodEnd` : "La date de fin de période doit être après la date de début"
  - `paidAt ≤ now + 1 jour` sinon erreur sur `paidAt` : "La date de paiement ne peut pas être dans le futur"
  - (la règle amount entier est déjà sur `z.number().int()` — message FR via le 2e arg)
- [x] **Notes sur `z.number().int()` :** le parseur Zod doit recevoir un `number` (le client envoie `Number(input)`). Côté API, `await req.json()` parse le JSON — un entier JSON devient `number`, un `25000.50` devient `25000.5` → `.int()` le rejette. C'est le comportement attendu.
- [x] Exporter `RecordPaymentInput = z.infer<typeof recordPaymentSchema>`
- [x] `pnpm typecheck` — zéro erreur

### T3 — CRÉER `src/lib/tenants/payment-email.ts` (AC7)

- [x] `buildPaymentConfirmationEmailHtml(params): string` — retourne HTML inline-stylé (imiter `buildResetPasswordHtml` dans `src/lib/email.ts`) :
  - params : `{ tenantName, subdomainUrl, amount, currency, paymentMethod, paymentReference, paidAt, periodStart, periodEnd, billingCycle, reactivated }`
  - **CRITIQUE — escaping :** utiliser `escapeHtml`/`escapeAttribute` sur `paymentReference`, `tenantName`. Le reference peut contenir `<`, `>`, `"`. NE JAMAIS l'insérer brut.
  - Sujet géré côté orchestration (AC7) — la fonction HTML ne construit que le body.
  - Contenu : en-tête "Paiement reçu", tableau récapitulatif (méthode, référence, montant formaté, date), période couverte, mention réactivation si `reactivated === true`, lien de connexion (`subdomainUrl`).
- [x] `buildPaymentConfirmationEmailText(params): string` — version texte brut (montant brut sans formatage monétaire, pour clients mail ne supportant pas HTML)
- [x] `pnpm typecheck` — zéro erreur

### T4 — CRÉER `src/lib/tenants/record-payment.ts` — orchestration transactionnelle (AC4, AC5, AC6, AC7, AC9)

- [x] Signature :
  ```ts
  export interface RecordPaymentParams {
    tenantId: string;
    input: RecordPaymentInput;
    actorId: string;          // superadmin user_id
    actorEmail: string;       // pour la note d'audit
  }
  export interface RecordPaymentResult {
    paymentId: string;
    tenantId: string;
    amount: number;
    periodStart: Date;
    periodEnd: Date;
    reactivated: boolean;     // true si status était suspended et reactivateIfSuspended
    subscriptionExtended: boolean;  // true si subscriptionEnd du tenant a été prolongé
    emailSent: boolean;
  }
  export async function recordPayment(params: RecordPaymentParams): Promise<RecordPaymentResult>
  ```
- [x] Logique (DANS CET ORDRE) :
  1. **SELECT tenant (avec verrou)** :
     ```ts
     const [tenant] = await db.select().from(tenants)
       .where(eq(tenants.id, params.tenantId))
       .for("update")  // pessimistic lock — Drizzle 0.44 supporte .for("update")
     if (!tenant) throw new RecordPaymentError("NOT_FOUND", "Tenant introuvable")
     ```
  2. **Rejeter les tenants cancelled :**
     ```ts
     if (tenant.status === "cancelled") {
       throw new RecordPaymentError("CONFLICT", "Impossible d'enregistrer un paiement pour un tenant annulé")
     }
     ```
  3. **Déterminer la réactivation :**
     ```ts
     const shouldReactivate = params.input.reactivateIfSuspended && tenant.status === "suspended"
     ```
  4. **INSÉRER le paiement :**
     ```ts
     const [payment] = await db.insert(subscriptionPayments).values({
       tenantId: tenant.id,
       amount: params.input.amount,
       currency: "XOF",
       paymentMethod: params.input.paymentMethod,
       paymentReference: params.input.paymentReference ?? null,
       paidAt: new Date(params.input.paidAt),
       periodStart: new Date(params.input.periodStart),
       periodEnd: new Date(params.input.periodEnd),
       billingCycle: params.input.billingCycle,
       confirmedBy: params.actorId,
       notes: params.input.notes ?? null,
     }).returning()
     if (!payment) throw new Error("Payment insert returned no row")
     ```
  5. **Réactivation / prolongation (UPDATE tenant si nécessaire) :**
     ```ts
     let reactivated = false
     let subscriptionExtended = false
     if (shouldReactivate) {
       await db.update(tenants).set({
         status: "active",
         subscriptionStart: new Date(params.input.periodStart),
         subscriptionEnd: new Date(params.input.periodEnd),
         gracePeriodEndsAt: null,
       }).where(eq(tenants.id, tenant.id))
       reactivated = true
     } else if (tenant.subscriptionEnd == null || new Date(tenant.subscriptionEnd) < new Date(params.input.periodEnd)) {
       // Prolongation : le paiement couvre au-delà de l'expiration actuelle
       await db.update(tenants).set({
         subscriptionEnd: new Date(params.input.periodEnd),
         ...(tenant.subscriptionStart == null ? { subscriptionStart: new Date(params.input.periodStart) } : {}),
       }).where(eq(tenants.id, tenant.id))
       subscriptionExtended = true
     }
     ```
  6. **Envoyer l'email de confirmation (best-effort)** — cf. détail ci-dessous
  7. **Logger l'événement `payment_recorded` (best-effort)** — cf. détail ci-dessous
  8. **(si shouldReactivate) Logger l'événement `reactivated` (best-effort)**
  9. **Retourner le résultat**
- [x] **Email (étape 6) — détail :**
  ```ts
  let emailSent = false
  try {
    // Trouver l'admin du tenant (le plus ancien)
    const [adminUser] = await db.select({ email: user.email })
      .from(user)
      .where(and(eq(user.tenantId, tenant.id), eq(user.role, "admin")))
      .orderBy(asc(user.createdAt))
      .limit(1)
    if (adminUser?.email) {
      const apexDomain = process.env.APEX_DOMAIN ?? "quotation.com"
      const subdomainUrl = `https://${tenant.slug}.${apexDomain}`
      await sendEmail({
        to: adminUser.email,
        subject: reactivated
          ? `Compte réactivé — paiement reçu (${params.input.amount} XOF)`
          : `Paiement reçu — ${params.input.amount} XOF`,
        html: buildPaymentConfirmationEmailHtml({ ... }),
        text: buildPaymentConfirmationEmailText({ ... }),
      })
      emailSent = true
    }
  } catch (err) {
    console.error("Payment confirmation email failed", maskError(err))
    emailSent = false
  }
  ```
- [x] **Audit event (étape 7) — détail :**
  ```ts
  try {
    await db.insert(tenantEvents).values({
      tenantId: tenant.id,
      eventType: "payment_recorded",
      actorId: params.actorId,
      before: null,
      after: {
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        paymentReference: payment.paymentReference,
        paidAt: payment.paidAt.toISOString(),
        periodStart: payment.periodStart.toISOString(),
        periodEnd: payment.periodEnd.toISOString(),
        billingCycle: payment.billingCycle,
      },  // JAMAIS de notes privées ici
      note: `Paiement ${payment.paymentMethod} ${payment.amount} XOF confirmé par ${params.actorEmail}${emailSent ? " — email envoyé" : " — email échoué"}`,
    })
  } catch (err) {
    console.error("tenant_events (payment_recorded) insert failed", maskError(err))
  }
  ```
- [x] **Audit event "reactivated" (étape 8, si shouldReactivate) :** même pattern, `eventType: "reactivated"`, `before: { status: "suspended" }`, `after: { status: "active", subscriptionEnd }`.
- [x] **Helper `RecordPaymentError` :** classe custom avec `code` (`"NOT_FOUND" | "CONFLICT"`) pour mapping propre en route.
- [x] **Helper `maskError(err)` :** retourne `err instanceof Error ? err.message : String(err)` SANS inclure `params.input.notes` ou `paymentReference` (logger uniquement le message générique).
- [x] **`exactOptionalPropertyTypes`** — utiliser `?? null` pour les champs nullables (`paymentReference`, `notes`).
- [x] `pnpm typecheck` — zéro erreur

### T5 — CRÉER `src/app/api/v1/owner/tenants/[id]/payments/route.ts` (AC1, AC4, AC5)

- [x] `export async function POST(req: Request, ctx: { params: Promise<{ id: string }> })` :
  - **Next 16 :** `params` est une Promise → `const { id } = await ctx.params`
  1. `const guard = await requireOwnerSession()` (depuis `src/lib/session`, story 7-2)
     - si `!guard.ok` → `apiError(guard.code, ..., guard.status)`
     - **Mode dégradé (si 7-2 absent) :** fallback inline (cf. Dev Notes)
  2. Récupérer `actorId = guard.session.user.id` et `actorEmail = guard.session.user.email`
  3. `const parsed = recordPaymentSchema.safeParse(await req.json())` → si `!parsed.success` → 400 `apiError("VALIDATION_FAILED", "Données invalides.", HTTP_STATUS.BAD_REQUEST, fields)`
  4. `try { const result = await recordPayment({ tenantId: id, input: parsed.data, actorId, actorEmail }); return NextResponse.json(result, { status: 201 }) }`
  5. `catch (err)` :
     - si `err instanceof RecordPaymentError` :
       - `err.code === "NOT_FOUND"` → 404 `apiError("NOT_FOUND", err.message, HTTP_STATUS.NOT_FOUND)`
       - `err.code === "CONFLICT"` → 409 `apiError("CONFLICT", err.message, HTTP_STATUS.CONFLICT)`
     - sinon → `console.error(err)` ; 500 `apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL)`
- [x] NE PAS logger `parsed.data` (contient `notes` et `paymentReference`) — logger uniquement le message d'erreur générique
- [x] `pnpm typecheck` — zéro erreur

### T6 — CRÉER `src/components/owner/record-payment-modal.tsx` (AC2, AC3, AC8)

- [x] `"use client"` première ligne, double quotes
- [x] Props : `{ tenantId: string; tenantName: string; tenantSlug: string; tenantStatus: string; open: boolean; onOpenChange: (open: boolean) => void }`
- [x] États : `isPending`, `errors` (par champ), `globalError`, `periodEdited` (bool pour verrouiller l'auto-calc), `form` (tous les champs contrôlés)
- [x] Champs contrôlés : paymentMethod (Select nitta/wave/amana/stripe/cash/virement), paymentReference (Input), amount (Input type=number step=1 min=1), paidAt (Input type=date, défaut aujourd'hui), billingCycle (SegmentedControl monthly/annual), periodStart (Input type=date), periodEnd (Input type=date), notes (Textarea), reactivateIfSuspended (Checkbox, défaut false)
- [x] **Auto-period :** `useEffect` sur `[paidAt, billingCycle]` → si `!periodEdited` → calculer `calculatePeriodFromCycle` et setter `periodStart`/`periodEnd` (format `YYYY-MM-DD` pour l'input date). Si l'utilisateur édite periodStart ou periodEnd → `setPeriodEdited(true)`.
- [x] **Affichage de la checkbox "Réactiver" :** affichée uniquement si `tenantStatus === "suspended"` (sinon la masquer — pas pertinent). Pré-cochée par défaut si suspended (assumption MVP — le owner veut en général réactiver).
- [x] **Validation client :** appeler `recordPaymentSchema.safeParse` (avec conversion des dates en ISO) avant soumission. Échec → `setErrors` par champ, pas de fetch.
- [x] `handleSubmit` :
  ```ts
  setIsPending(true); setErrors({}); setGlobalError(null)
  const payload = { ...form, paidAt: new Date(form.paidAt).toISOString(),
                    periodStart: new Date(form.periodStart).toISOString(),
                    periodEnd: new Date(form.periodEnd).toISOString() }
  const res = await fetch(`/api/v1/owner/tenants/${tenantId}/payments`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  })
  if (res.ok) {
    const data = await res.json()
    toast.success(`Paiement de ${data.amount} XOF enregistré pour ${tenantName}`)
    onOpenChange(false)
    router.refresh()
  } else {
    const body = await res.json()
    if (body.error?.fields) setErrors(body.error.fields)
    else if (body.error?.code === "NOT_FOUND") { toast.error("Tenant introuvable"); onOpenChange(false) }
    else if (body.error?.code === "CONFLICT") setGlobalError(body.error.message)
    else toast.error("Une erreur est survenue. Le paiement n'a pas été enregistré.")
  }
  setIsPending(false)
  ```
- [x] **Warning "compte reste suspendu" :** si `tenantStatus === "suspended"` ET `!form.reactivateIfSuspended` → afficher un bandeau d'avertissement jaune sous la checkbox : "Le compte restera suspendu après ce paiement. Cochez « Réactiver » pour le réactiver."
- [x] **Formatage amount en lecture :** afficher `formatFcfa(Number(amount))` en aperçu live sous l'input montant (ex: "25 000 XOF")
- [x] Utiliser le composant `Dialog` shadcn (`src/components/ui/dialog.tsx`) pour le modal
- [x] Tous les labels depuis `useTranslations("owner.payments.record")` — JAMAIS de texte FR hardcodé
- [x] `pnpm typecheck` — zéro erreur

### T7 — CRÉER `src/components/owner/record-payment-trigger.tsx` (AC1)

- [x] `"use client"` première ligne
- [x] Props : `{ tenant: { id, name, slug, status } }` + `variant?: "button" | "menu-item"` (pour s'adapter liste vs fiche)
- [x] Composant wrapper : un bouton (ou un `DropdownMenuItem`) qui ouvre le `RecordPaymentModal`
- [x] État local `open` pour contrôler le modal
- [x] Ce composant est réutilisable : 7-2 peut le monter dans le menu actions de la liste (en remplaçant le placeholder désactivé), et 7-7 le montera dans la fiche tenant
- [x] **NOTE pour le dev :** dans le périmètre de CETTE story, monter le trigger uniquement là où c'est testable. La liste `/owner/tenants` (story 7-2) a un placeholder désactivé "Enregistrer paiement" — le dev PEUT l'activer en important ce trigger, OU laisser le trigger testable via la fiche (quand 7-7 existera). Assumption : exposer via un bouton standalone sur la liste filtrée `?focus=<id>` en attendant 7-7, et documenter.
- [x] `pnpm typecheck` — zéro erreur

### T8 — UPDATE `src/messages/fr-NE.json`

- [x] Ajouter section `owner.payments.record` :
  ```json
  "owner": {
    "payments": {
      "record": {
        "title": "Enregistrer un paiement",
        "subtitle": "Tenant : {name}",
        "paymentMethod": "Méthode de paiement",
        "paymentMethodRequired": "La méthode de paiement est requise",
        "paymentReference": "Référence transaction",
        "paymentReferenceHint": "Ex : ID de transaction Wave, référence Nitta",
        "amount": "Montant (FCFA)",
        "amountInvalid": "Le montant doit être un entier positif en FCFA",
        "paidAt": "Date du paiement",
        "paidAtFuture": "La date de paiement ne peut pas être dans le futur",
        "billingCycle": "Cycle de facturation",
        "monthly": "Mensuel",
        "annual": "Annuel",
        "periodStart": "Début de période couverte",
        "periodEnd": "Fin de période couverte",
        "periodEndInvalid": "La date de fin de période doit être après la date de début",
        "notes": "Notes (internes)",
        "reactivateIfSuspended": "Réactiver le compte si suspendu",
        "reactivateWarning": "Le compte restera suspendu après ce paiement. Cochez « Réactiver » pour le réactiver.",
        "reactivatedNote": "Le compte sera réactivé après l'enregistrement.",
        "submit": "Enregistrer le paiement",
        "submitting": "Enregistrement en cours…",
        "success": "Paiement de {amount} XOF enregistré pour {name}",
        "error": "Une erreur est survenue. Le paiement n'a pas été enregistré.",
        "tenantNotFound": "Tenant introuvable",
        "cancelledConflict": "Impossible d'enregistrer un paiement pour un tenant annulé",
        "cancelled": "Annuler",
        "amountPreview": "{amount} XOF",
        "methods": { "nitta": "Nitta", "wave": "Wave", "amana": "Amana", "stripe": "Stripe", "cash": "Cash", "virement": "Virement" }
      }
    }
  }
  ```
  (Fusionner avec la section `owner` existante posée par 7-2 — ne pas écraser.)

### T9 — Tests unitaires Vitest

- [x] `src/lib/tenants/period.test.ts` :
  - `calculatePeriodFromCycle({ cycle: "monthly", paidAt: new Date("2026-06-15") })` → `periodEnd = 2026-07-15`
  - `cycle: "annual"` → `periodEnd = 2027-06-15` (+1 an calendaire)
  - `periodStart === paidAt` (même jour)
  - L'input `paidAt` n'est PAS muté (vérifier via deep equal avant/après)
  - Edge : 31 janvier + monthly → 30 mars (30j) — documenter
- [x] `src/lib/tenants/payment-email.test.ts` :
  - `buildPaymentConfirmationEmailHtml` : escaping correct (insérer une `paymentReference` contenant `<script>alert(1)</script>` et `"` → vérifier qu'il est échappé)
  - Présence des champs : montant formaté, méthode, référence, période, mention réactivation si `reactivated === true`, lien `subdomainUrl`
  - `buildPaymentConfirmationEmailText` : version texte contient tous les champs brut
- [x] `src/lib/tenants/record-payment.test.ts` (mock `db.select`/`db.insert`/`db.update`, `sendEmail`, `user` lookup) :
  - Cas nominal : tenant `active`, paiement 25000 → 1 insert payment, 1 insert event `payment_recorded`, 1 sendEmail, `reactivated=false`, `emailSent=true`
  - Tenant `suspended` + `reactivateIfSuspended=true` → 1 update tenant (status→active, subscriptionEnd), 2 inserts event (`payment_recorded` + `reactivated`), `reactivated=true`
  - Tenant `suspended` + `reactivateIfSuspended=false` → pas d'update tenant, `reactivated=false`
  - Tenant `active` + `subscriptionEnd < periodEnd` → 1 update tenant (subscriptionEnd prolongé), `subscriptionExtended=true`
  - Tenant `active` + `subscriptionEnd > periodEnd` → pas d'update tenant, `subscriptionExtended=false`
  - Tenant `cancelled` → `RecordPaymentError("CONFLICT")`, 0 insert, 0 update
  - Tenant introuvable → `RecordPaymentError("NOT_FOUND")`, 0 insert
  - `sendEmail` lève → paiement + events conservés, `emailSent=false`, note "email échoué"
  - Pas d'admin user (lookup retourne []) → email skippé, `emailSent=false`
  - **Vérifier que `tenant_events.after` ne contient JAMAIS `notes`** (assertion explicite)

### T10 — Tests E2E Playwright

- [x] `tests/e2e/owner-record-payment.spec.ts` :
  - **Setup** : seed superadmin + 1 tenant `active` (plan pro) + 1 tenant `suspended` (plan pro) + 1 admin user par tenant
  - **Mock email** : en dev sans `RESEND_API_KEY`, `sendEmail` fait `console.log` — espionner via `page.on("console")` ou vérifier la réponse API (`emailSent`)
  - Scénarios :
    1. Login superadmin → `/owner/tenants` → clic action "Enregistrer paiement" sur une ligne → modal s'ouvre avec le bon tenant
    2. Soumission sans méthode → erreur en ligne, pas de fetch
    3. Montant décimal (25000.50) → erreur en ligne
    4. Soumission valide (Wave, 25000, monthly) → toast success `25 000 XOF` + modal fermé + refresh liste
    5. Vérifier via re-fetch API que le paiement apparaît dans l'historique du tenant
    6. Tenant `suspended` + checkbox réactiver → statut passe à `active` (re-fetch tenant et vérifier `status`)
    7. Non-superadmin → 403 sur `POST /api/v1/owner/tenants/[id]/payments`
- [x] `pnpm test:e2e` — passe

### T11 — Vérification finale (AC10)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (334+ existants + nouveaux)
- [x] `pnpm build` : passe sans erreur
- [x] Aucune nouvelle dépendance installée (tout réutilise l'existant : `zod`, `drizzle-orm`, `better-auth`, `sonner`, `next-intl`, `resend` via `email.ts`)

### Review Findings (2026-07-02)

- [x] [Review][Decision→Patch] Réactivation ne valide pas que `periodEnd` est dans le futur — **Résolu : option (a) appliquée.** `recordPayment()` rejette maintenant la réactivation avec `RecordPaymentError("VALIDATION", ...)` si `periodEnd < now` ; la route mappe ce code vers 400 `VALIDATION_FAILED` (champ `reactivateIfSuspended`), affiché en ligne dans le modal.
- [x] [Review][Decision→Patch] `RecordPaymentTrigger` totalement inutilisé — **Résolu : option (a) appliquée.** `RecordPaymentTrigger` (variant `menu-item`) est maintenant un vrai `DropdownMenuItem` portant le fix key-remount ; `TenantActionsMenu` l'utilise directement au lieu de dupliquer le montage du modal.
- [x] [Review][Patch] Date "aujourd'hui" par défaut basée sur UTC pas sur le jour local [`src/components/owner/record-payment-modal.tsx:30-32`] — Corrigé : `toDateInputValue` construit désormais la date depuis les composants locaux (`getFullYear/getMonth/getDate`).
- [x] [Review][Patch] Pas de garde anti double-soumission sur le formulaire [`src/components/owner/record-payment-modal.tsx:349`] — Corrigé : garde synchrone `submittingRef` bloquant les soumissions concurrentes avant le premier re-render.
- [x] [Review][Patch] `maskError()` ne masque rien malgré son nom [`src/lib/tenants/record-payment.ts:27-29`] — Corrigé : renommé en `toLogMessage()` pour refléter son comportement réel (aucune valeur sensible n'y transite).
- [x] [Review][Patch] `1e13` codé en dur au lieu d'importer `MAX_MONETARY_VALUE` [`src/lib/validation/payment.ts:15`] — Corrigé : import direct depuis `src/lib/money.ts`.
- [x] [Review][Defer] Colonne Postgres `integer` incapable de porter `MAX_MONETARY_VALUE` (1e13) [`src/lib/schema.ts:495`, `src/lib/validation/payment.ts:15`] — différé, gap pré-existant à l'échelle du projet (même pattern sur `quotes.totalFcfa`), non introduit par cette story.
- [x] [Review][Defer] `id` tenant non-UUID dans l'URL → 500 au lieu de 400/404 [`src/app/api/v1/owner/tenants/[id]/payments/route.ts:347`] — différé, pattern pré-existant identique sur les routes suspend/cancel.
- [x] [Review][Defer] Échec d'insertion `tenant_events` non remonté via un flag de retour [`src/lib/tenants/record-payment.ts:171-214`] — différé, conforme au pattern best-effort établi par la story 6-3 ; amélioration observabilité à prévoir.
- [x] [Review][Defer] Libellés méthodes de paiement dupliqués sur 4 fichiers [`src/lib/validation/payment.ts:7`, `src/components/owner/tenants-table.tsx:839`, `src/lib/tenants/payment-email.ts`, `src/messages/fr-NE.json`] — différé, amélioration DRY non bloquante, une partie de la duplication est inhérente à la séparation i18n.
- [x] [Review][Defer] Rollover année bissextile non testé (29 fév → 1er mars) [`src/lib/tenants/period.ts`] — différé, edge case à très faible probabilité, aucune directive spec sur le comportement attendu.
- [x] [Review][Defer] `subscriptionExtended` calculé mais jamais affiché côté UI [`src/lib/tenants/record-payment.ts:223`, `src/components/owner/record-payment-modal.tsx`] — différé, amélioration UX secondaire.

---

## Dev Notes

### CRITIQUE — Dépendances HARD sur stories 7-1 et 7-2

Cette story s'appuie sur DEUX stories précédentes :

- **Story 7-1 (HARD) :** fournit les enums `paymentMethodEnum` (`nitta|wave|amana|stripe|cash|virement`), `billingCycleEnum` (`monthly|annual`), et les tables `tenants`, `subscription_payments`, `tenant_events`. **Sans 7-1, cette story ne compile pas.**
- **Story 7-2 (HARD) :** fournit `requireOwnerSession()` (dans `src/lib/session.ts`), le rôle `superadmin` dans `userRoleEnum`/`PERMISSION_MATRIX`, le layout `/owner/layout.tsx`, et la liste `/owner/tenants` (où le trigger est monté). **Sans 7-2, la route API n'est pas protégée et `requireOwnerSession` n'existe pas.**

**Mode dégradé (si 7-2 absent au moment du dev) :**
- Côté API : remplacer `const guard = await requireOwnerSession()` par un inline :
  ```ts
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED)
  const role = (session.user as Record<string, unknown>).role as string
  // TODO(story-7-2): remplacer par requireOwnerSession() + role === "superadmin"
  if (role !== "superadmin" && role !== "admin") return apiError("FORBIDDEN", ..., HTTP_STATUS.FORBIDDEN)
  ```
- Documenter ce TODO clairement pour que la story 7-2 le nettoie.

---

### CRITIQUE — Transactionnalité : un seul verrou pessimiste suffit

Contrairement à la story 7-3 (où l'insert tenant Drizzle et la création user Better Auth `signUp` ne sont PAS dans la même transaction native → rollback manuel obligatoire), **cette story n'appelle PAS Better Auth**. Les 3 mutations (insert payment, update tenant, insert event) sont toutes des opérations Drizzle sur PostgreSQL.

**Stratégie retenue (assumption MVP) :**
- Un seul `SELECT ... FOR UPDATE` sur le tenant en tête de `recordPayment()` (verrou pessimiste ligne tenant) — empêche deux paiements concurrents de se marcher dessus (race sur `subscriptionEnd`).
- Les 3 inserts/updates suivent SANS transaction native explicite. Si l'`insert payment` réussit puis l'`update tenant` échoue, le paiement est enregistré mais le tenant n'est pas prolongé/réactivé → **état incohérent**.

**Pourquoi ne PAS wrapper dans `db.transaction()` ?**
- Drizzle 0.44.7 supporte `db.transaction(async (tx) => { ... })`. C'est POSSIBLE et RECOMMANDÉ pour cette story.
- **Décision finale : utiliser `db.transaction()`** pour wrapper les étapes 4 (insert payment) + 5 (update tenant). Les étapes 6 (email) et 7/8 (audit events) restent HORS transaction (best-effort, ne doivent pas faire rollback un paiement réussi).

```ts
await db.transaction(async (tx) => {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, params.tenantId)).for("update")
  if (!tenant) throw new RecordPaymentError("NOT_FOUND", ...)
  if (tenant.status === "cancelled") throw new RecordPaymentError("CONFLICT", ...)
  // ... insert payment (tx) + update tenant (tx)
})
// HORS tx : email + audit events (best-effort)
```

**Note sur le lock :** `.for("update")` à l'intérieur de `db.transaction()` est supporté par Drizzle 0.44. Le `SELECT ... FOR UPDATE` verrouille la ligne tenant jusqu'au COMMIT.

**Flag parent :** si le dev préfère la simplicité (pas de transaction native), le risque est un état incohérent rare (crash serveur entre insert payment et update tenant). Acceptable en MVP mais à documenter.

---

### CRITIQUE — Email utility : réutiliser `src/lib/email.ts` (Resend, déjà configuré)

Le repository a **DÉJÀ** une lib d'email complète (`src/lib/email.ts`) :
- `sendEmail({ to, subject, html, text })` — Resend en prod, `console.log` en dev.
- `buildResetPasswordHtml(email, resetUrl)` — template HTML inline-stylé à **imiter** pour `buildPaymentConfirmationEmailHtml`.
- `escapeHtml` / `escapeAttribute` — **non exportés** dans `email.ts` (fonctions privées). Le dev DOIT soit :
  1. Dupliquer les helpers `escapeHtml`/`escapeAttribute` dans `payment-email.ts` (recommandé — évite de modifier `email.ts` hors scope), OU
  2. Demander à les exporter depuis `email.ts` (modification mineure, à valider).

**Décision : dupliquer les helpers dans `payment-email.ts`** (assumption non-interactive — ne pas modifier `email.ts`).

**NE PAS installer nodemailer.** NE PAS ajouter de nouvelle dépendance. NE PAS créer un second système d'email. Réutiliser `sendEmail` tel quel.

**Tests :** en l'absence de `RESEND_API_KEY`, `sendEmail` fait un `console.log` et résout sans erreur — parfait pour les tests unitaires/E2E. Pour vérifier le contenu, espionner `console.log` ou passer par la réponse API (`emailSent`).

---

### CRITIQUE — `amount` : integer FCFA, jamais float

`subscription_payments.amount` est `integer` PostgreSQL (FCFA entier). Règles :
- `z.number().int()` côté validation Zod rejette `25000.5`.
- Côté client, l'input `type="number" step="1" min="1"` empêche la saisie décimale dans la plupart des navigateurs, mais le parseur JS peut quand même produire un float si l'utilisateur tape `25000.50` → le `safeParse` Zod le rejette côté serveur.
- Côté API, `await req.json()` parse le JSON : `25000` → `number 25000`, `25000.50` → `number 25000.5` → `.int()` rejette.
- **NE PAS faire `Math.round(amount)`** pour "sauver" un montant décimal — c'est une perte de données silencieuse. Plutôt rejeter (UX claire).

**Formatage affichage :** `formatFcfa(25000)` → `"25 000 XOF"` (via `src/lib/money.ts`). Pour l'email texte brut, écrire `25000 XOF` ou `25 000 XOF` (avec séparateur milliers `Intl.NumberFormat("fr-FR")`).

---

### CRITIQUE — `noUncheckedIndexedAccess` + Drizzle `returning()`

```ts
const [payment] = await db.insert(subscriptionPayments).values({...}).returning()
if (!payment) throw new Error("Payment insert returned no row")
```
`returning()` retourne un tableau ; `[payment]` peut être `undefined`. Toujours vérifier.

Pour le lookup admin user :
```ts
const [adminUser] = await db.select({ email: user.email }).from(user)...
if (adminUser?.email) { await sendEmail({ to: adminUser.email, ... }) }
```

---

### CRITIQUE — `exactOptionalPropertyTypes` (TS 5.9.3)

Pour l'insertion Drizzle avec des champs nullables (`paymentReference`, `notes`), utiliser `?? null` :
```ts
paymentReference: params.input.paymentReference ?? null,
notes: params.input.notes ?? null,
```
Ne pas faire `paymentReference: params.input.paymentReference` (type `string | undefined` ≠ `string | null`).

Pour `reactivateIfSuspended` qui a un `default(false)` dans Zod, `parsed.data.reactivateIfSuspended` est `boolean` (toujours défini).

---

### CRITIQUE — `paidAt` en ISO datetime, `periodStart`/`periodEnd` en ISO date

Côté schema (story 7-1) :
- `paidAt: timestamp("paid_at")` → objet `Date` JS (instant précis).
- `periodStart: date("period_start", { mode: "date" })` → objet `Date` JS (date calendaire, minuit UTC).
- `periodEnd: date("period_end", { mode: "date" })` → idem.

Côté API, le client envoie tout en ISO string (`new Date(form.paidAt).toISOString()`). Le parseur Zod accepte `.datetime()` pour les trois. Côté `recordPayment`, convertir en `Date` :
```ts
paidAt: new Date(params.input.paidAt),
periodStart: new Date(params.input.periodStart),
periodEnd: new Date(params.input.periodEnd),
```

**Edge timezone :** `date("...", { mode: "date" })` stocke la date à minuit UTC. Si le client envoie `2026-06-15T00:00:00.000Z`, c'est cohérent. Si le navigateur du superadmin est en UTC+1 et envoie `2026-06-15T00:00:00+01:00`, le `toISOString()` normalise à `2026-06-14T23:00:00.000Z` → la période pourrait glisser d'un jour. **Décision MVP :** ignorer ce risque (le owner est au Niger, UTC+1, l'approximation d'un jour sur la période est acceptable). Documenter.

---

### CRITIQUE — `reactivateIfSuspended` : checkbox visible uniquement si `status === "suspended"`

Si le tenant est `active` ou `trial`, la checkbox n'a aucun effet (AC6 dernier bloc). Côté UI :
- **Masquer la checkbox** si `tenantStatus !== "suspended"` (pas pertinent → UX plus claire).
- Côté API, ignorer silencieusement `reactivateIfSuspended === true` si le tenant n'est pas `suspended` (ne pas lever d'erreur — idempotent).

---

### CRITIQUE — `payment_recorded` event ne contient JAMAIS les `notes`

Les `notes` (champ libre du owner dans le modal) sont **privées** — elles vont dans `subscription_payments.notes` (consultable par le owner uniquement) mais **JAMAIS** dans `tenant_events.after` (qui est l'audit trail visible). Vérifier dans les tests que `after` ne contient que `{ amount, currency, paymentMethod, paymentReference, paidAt, periodStart, periodEnd, billingCycle }`.

**Note sur `paymentReference` :** c'est une donnée semi-publique (ID de transaction Wave/Nitta) qui peut légitimement aller dans l'audit trail. Le masquer partiellement dans les `console.error` (ex: `ref ****1234`) est une precaution de defense-in-depth.

---

### CRITIQUE — Reactivation : `subscriptionStart` reset ou pas ?

AC6 dit : si `shouldReactivate`, `subscriptionStart = periodStart`. C'est une **reset** de la date de début d'abonnement à la nouvelle période. Rationale : la période d'abonnement "officielle" commence maintenant (le compte était suspendu, l'ancien `subscriptionStart` n'est plus pertinent).

**Alternative non retenue :** préserver l'ancien `subscriptionStart` (continuité historique). L'audit trail `before/after` trace le changement de toute façon.

→ **Flag parent :** valider ce choix (reset vs préservation). Assumption : reset pour clarté commerciale.

---

### CRITIQUE — Prolongation (active/trial + subscriptionEnd < periodEnd)

Quand un paiement est enregistré pour un tenant `active`/`trial` (pas de réactivation), et que `periodEnd` du paiement dépasse l'`subscriptionEnd` actuel du tenant → on étend `subscriptionEnd` à `periodEnd`. Rationale : le paiement couvre une période plus longue que l'abonnement en cours → l'abonnement suit.

**Edge :** si `periodEnd < subscriptionEnd` (paiement pour une période antérieure/chevauchante), on ne touche PAS à `subscriptionEnd` (le paiement est juste tracé, l'abonnement existant reste). C'est le cas pour un paiement "en retard" qui régularise une période passée.

---

### CRITIQUE — `for("update")` Drizzle 0.44.7

Drizzle supporte `.for("update")` sur les `select()` depuis 0.30+. Vérifier la signature exacte :
```ts
const [tenant] = await db.select().from(tenants)
  .where(eq(tenants.id, params.tenantId))
  .for("update")
```
Si `.for()` n'est pas disponible dans la version 0.44.7 (vérifier à l'implémentation), fallback : `db.transaction()` avec `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` (overkill) ou simplement accepter la race (MVP — deux paiements concurrents sont rares pour un owner manuel). Documenter le choix.

---

### CRITIQUE — Aucune donnée n'existe encore (7-1 et 7-2 non implémentées)

Au moment de la création de cette story (2026-06-28), 7-1 et 7-2 sont `ready-for-dev` (non implémentées). Le dev de 7-4 ne peut PAS `pnpm check`/`pnpm build` tant que 7-1 et 7-2 ne sont pas fusionnées.

**Stratégie recommandée :** implémenter dans l'ordre 7-1 → 7-2 → 7-3 → **7-4**. Si 7-4 doit avancer en parallèle, écrire le code contre le schéma cible (supposant 7-1 et 7-2 présentes) sans pouvoir tester jusqu'à merge.

→ **Flag parent :** planifier l'implémentation séquentielle.

---

### Pattern existant à réutiliser

- `src/lib/email.ts` — `sendEmail`, `buildResetPasswordHtml` (modèle template), `escapeHtml`/`escapeAttribute` (à dupliquer dans `payment-email.ts`)
- `src/app/api/v1/users/route.ts` — pattern POST : `auth.api.getSession` → check role → Zod `safeParse` → `apiError` ou `NextResponse.json(..., { status: 201 })`
- `src/lib/api/envelope.ts` — `apiError`, `HTTP_STATUS`, codes d'erreur
- `src/lib/permissions.ts` — référence RBAC (rôle `superadmin` = story 7-2)
- `src/lib/session.ts` — `requireOwnerSession()` (story 7-2, à utiliser tel quel)
- `src/lib/tenants/tenant-config.ts` (story 7-1) — `APEX_DOMAIN`
- `src/lib/money.ts` — `formatFcfa()` pour l'aperçu UI + l'email
- `src/messages/fr-NE.json` — pattern next-intl, section à ajouter sous `owner.payments.record`
- `src/components/ui/dialog.tsx` — composant Dialog shadcn pour le modal
- `src/components/ui/select.tsx`, `input.tsx`, `checkbox.tsx`, `textarea.tsx`, `button.tsx` — primitives shadcn
- `src/app/owner/tenants/new/new-tenant-form.tsx` (story 7-3) — pattern formulaire contrôlé (isPending, errors par champ, auto-calc verrouillable, handleSubmit)
- `src/lib/tenants/welcome-email.ts` (story 7-3) — pattern escaping HTML email + structure du template
- `src/lib/tenants/create-tenant.ts` (story 7-3) — pattern orchestration transactionnelle + rollback manuel + best-effort audit

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Installer nodemailer / react-email / nouvelle lib email | Réutiliser `sendEmail` de `src/lib/email.ts` (Resend) |
| `Math.round(amount)` pour "sauver" un montant décimal | `z.number().int()` rejette, UX claire |
| Stocker `amount` en `real`/float | `integer` FCFA (cf. schema story 7-1) |
| Mettre `notes` dans `tenant_events.after` | `after` ne contient QUE les champs publiques (AC9) |
| Logger `paymentReference` ou `notes` en clair dans `console.error` | `maskError()` retourne uniquement le message générique |
| Modifier `src/lib/email.ts` (exporter escapeHtml) | Dupliquer les helpers dans `payment-email.ts` (hors scope) |
| Créer une nouvelle table paiement | Utiliser `subscription_payments` (story 7-1) |
| Faire un rollback manuel comme en 7-3 | `db.transaction()` Drizzle (pas d'appel Better Auth ici) |
| Oublier `.for("update")` ou `db.transaction()` | Verrouiller la ligne tenant (race concurrent paiements) |
| `periodEnd` calculé via `+365j` pour annual | `+1 an calendaire` (`setFullYear(+1)`) — même jour/mois |
| Checkbox "Réactiver" visible pour un tenant `active` | Masquer si `status !== "suspended"` |
| Hardcoder du texte FR dans le modal | Clés `owner.payments.record.*` dans `fr-NE.json` |
| Modifier `src/lib/schema.ts` | Hors scope — tables fournies par story 7-1 |
| Créer `src/middleware.ts` | `proxy.ts` (Next 16, déjà géré par 7-1/7-2) |
| Étendre la validation dans la route (inline) | `recordPaymentSchema` dans `src/lib/validation/payment.ts` |

---

### Commandes pour le dev agent

```bash
# 0. PRÉREQUIS : stories 7-1 et 7-2 implémentées (schema + superadmin + requireOwnerSession)
#    Vérifier : pnpm typecheck passe AVANT de commencer cette story

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
# Login en tant que superadmin → /owner/tenants
# Action "Enregistrer paiement" sur une ligne → modal
# Soumettre un paiement test → vérifier la console (email dev mode) pour le contenu
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §3.3 (modal Enregistrer un paiement + fiche tenant onglet Abonnement), §5 (flux mobile money détaillé — confirmation manuelle owner), §2 (`subscription_payments` schema), §7 (paramètres retenus : prices XOF, grace 7j, methods enum)
- [CLAUDE.md] — conventions DB (uuid custom, text Better Auth), migration workflow, langues (UI FR / code EN), money integer FCFA
- [project-context.md] — règles TypeScript strict, Drizzle, API envelope, i18n next-intl, money integer, audit best-effort
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — fournit `paymentMethodEnum`, `billingCycleEnum`, `subscription_payments`, `tenant_events`, `tenants`, `tenant-config.ts` (`APEX_DOMAIN`)
- [Story 7-2] `_bmad-output/implementation-artifacts/7-2-owner-dashboard-tenant-list.md` — fournit `requireOwnerSession()`, rôle `superadmin`, layout owner, liste tenants (où le trigger est monté)
- [Story 7-3] `_bmad-output/implementation-artifacts/7-3-create-tenant-welcome-email.md` — pattern transactionnel + rollback, reuse `sendEmail`, `tenantPlanEnum`, escaping HTML email, auto-calc verrouillable (slug → period ici)
- [Story 6-3] `_bmad-output/implementation-artifacts/6-3-immutable-audit-trail-export.md` — pattern append-only `audit_event` (similaire à `tenant_events`), best-effort audit
- [src/lib/email.ts] — `sendEmail`, `buildResetPasswordHtml` (modèle template), `escapeHtml`/`escapeAttribute` (helpers privés à dupliquer)
- [src/app/api/v1/users/route.ts] — pattern POST création + Zod + `apiError`
- [src/lib/api/envelope.ts] — `apiError`, `HTTP_STATUS`, codes d'erreur
- [src/lib/money.ts] — `formatFcfa()`
- [src/lib/schema.ts] — `subscriptionPayments`, `tenantEvents`, `tenants`, `user` (avec `tenantId` après 7-1)
- [Drizzle ORM — SELECT FOR UPDATE](https://orm.drizzle.team/docs/select#locking) — `.for("update")` pessimistic lock
- [Drizzle ORM — Transactions](https://orm.drizzle.team/docs/transactions) — `db.transaction(async (tx) => {...})`
- [Zod 4 — number int](https://zod.dev/api?id=numbertype) — `.int()` rejette les floats

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`)

**Epic 7 :** Owner Panel & Gestion des abonnements SaaS — Post-MVP. Dépendances : Epic 1 (auth/rôles, DONE), Epic 6.2 (quota enforcement, DONE), stories 7-1 et 7-2 (ready-for-dev).

**Story 7.4 (P0)** est le mécanisme de **confirmation manuelle des paiements mobile money**. Dans le modèle MVP (§5), Wave/Nitta/Amana n'ont pas d'API webhook au Niger → le owner vérifie la réception dans son app mobile money, puis enregistre le paiement manuellement dans le panel. L'automatisation Stripe (webhook) arrive en story 7-10.

**Flux mobile money (§5) :**
```
1. Client contacte owner (WhatsApp/appel/email) → accord commercial
2. Owner envoie montant + numéro de compte (Wave/Nitta/Amana)
3. Client effectue le transfert mobile money
4. Owner vérifie la réception dans son app Wave/Nitta/Amana
5. Owner ouvre /owner/tenants (cette story — bouton par ligne) OU /owner/tenants/[id] (7-7)
6. Clic "Enregistrer un paiement" → modal
7. Saisit : méthode (Wave/Nitta/Amana/etc.), référence transaction, montant, cycle, période
8. Coche "Réactiver si suspendu" (si applicable)
9. Valide → paiement enregistré, tenant activé/prolongé, email envoyé au client
```

### Stories de l'Epic 7 (cross-context)

| ID | Titre | Relation avec 7-4 |
|----|-------|-------------------|
| 7.1 | Schema tenants + middleware subdomain routing | **PRÉREQUIS** — fournit les enums + tables paiements/events |
| 7.2 | Dashboard overview owner + liste tenants | **PRÉREQUIS** — fournit `requireOwnerSession` + layout + liste (trigger monté ici) |
| 7.3 | Création manuelle tenant + email bienvenue | SOFT — patterns (transactionnel, email, auto-calc) |
| **7.4** | **Enregistrement paiement (mobile money + manuel)** | **(cette story)** |
| 7.5 | Suspension manuelle + page expiration tenant | 7-4 lève la suspension si demandé ; 7-5 la pose |
| 7.6 | Cron expiration + rappels automatiques | Lit les `subscription_payments` pour décider expiration |
| 7.7 | Fiche tenant complète (onglets) | Montera `RecordPaymentTrigger` dans l'onglet Abonnement + affichera l'historique des paiements |
| 7.8 | Réactivation après paiement | 7-4 fait déjà la réactivation dans le flux paiement ; 7-8 est la réactivation autonome (sans nouveau paiement) |
| 7.10 | Stripe webhook auto-activation | Alternative automatisée — insère lui-même dans `subscription_payments` (différent flux) |
| 7.11 | Rapports & export comptabilité | Agrège les `subscription_payments` enregistrés ici |
| 7.12 | Paramètres plateforme (prix, grace) | Override `PLAN_PRICES_XOF`, `DEFAULT_GRACE_PERIOD_DAYS` |

### Paramètres business retenus (Epic 7 §7)

```ts
const DEFAULT_TRIAL_DAYS = 14      // (depuis tenant-config.ts story 7-1)
const DEFAULT_GRACE_PERIOD_DAYS = 7

const PLAN_LIMITS = {
  free: { maxUsers: 1 },
  pro: { maxUsers: 5 },
  enterprise: { maxUsers: 20 },
}

const PLAN_PRICES_XOF = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 25000, annual: 250000 },
  enterprise: { monthly: 75000, annual: 750000 },
}
```

`PLAN_PRICES_XOF` pourrait servir à **pré-remplir** le montant du modal quand le owner sélectionne un plan/cycle (assumption MVP : NON implémenté ici — le owner saisit le montant manuellement car il peut négocier. Le pré-remplissage auto depuis `PLAN_PRICES_XOF` est DEFERRED à story 7-12 quand les prix deviennent configurables).

---

## Architecture Compliance

| Contrainte | Conformité story 7-4 |
|---|---|
| Next.js 16 App Router (Server Components par défaut, `"use client"` si besoin) | ✅ Route API server-side ; modal = Client Component |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`) | ✅ Guards `?? null`, vérification `[payment]`, types `z.infer` |
| Drizzle : uuid() pour custom tables, text pour Better Auth | ✅ `subscription_payments.id` uuid ; `confirmedBy`/`actorId` text (user_id Better Auth) |
| Better Auth tables : text IDs, ne pas modifier | ✅ `user.id` est text ; lookup admin user sans modification |
| API envelope : `apiError()`, `HTTP_STATUS`, codes standard | ✅ Route POST utilise `apiError("VALIDATION_FAILED"|"NOT_FOUND"|"CONFLICT"|"FORBIDDEN"|"UNAUTHORIZED"|"INTERNAL_ERROR")` |
| Zod validation dans `src/lib/validation/` | ✅ `recordPaymentSchema` dans `src/lib/validation/payment.ts` |
| next-intl : UI strings dans `fr-NE.json` | ✅ Section `owner.payments.record` |
| Audit : best-effort, ne bloque pas le flux principal | ✅ Insert `tenant_events` dans try/catch hors transaction |
| Money : integer FCFA (jamais float) | ✅ `amount` integer, `z.number().int()`, jamais `Math.round` |
| Pas de nouvelle dépendance (pnpm install) | ✅ Tout réutilise l'existant (`better-auth`, `zod`, `drizzle-orm`, `resend` via `email.ts`) |
| `next/navigation` (pas `next/router`) | ✅ `useRouter`/`router.refresh()` de `next/navigation` dans le modal |
| Transactions Drizzle pour atomicité multi-mutations | ✅ `db.transaction()` wrapper (insert payment + update tenant) |
| proxy.ts (pas middleware.ts) | ✅ Inchangé — protection `/owner/*` déjà posée par 7-2 |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-4 |
|---|---|---|
| `next` | 16.1.6 | App Router, route API dynamique `[id]/payments`, `params` Promise, `headers()` |
| `better-auth` | 1.6.11 | `auth.api.getSession` (via `requireOwnerSession` story 7-2) |
| `drizzle-orm` | 0.44.7 | `db.transaction`, `db.insert`/`db.update`/`db.select`, `.for("update")`, operators `eq`/`and`/`asc` |
| `zod` | 4.4.3 | `recordPaymentSchema`, `safeParse`, `superRefine`, `.int()`/`.positive()`/`.max()` |
| `sonner` | 2.0.7 | `toast.success` / `toast.error` |
| `next-intl` | 4.13.0 | `useTranslations("owner.payments.record")` |
| shadcn/ui (new-york) | 3.8.5 | `Dialog`, `Input`, `Label`, `Select`, `Checkbox`, `Textarea`, `Button` |
| `vitest` | 4.1.9 | Tests unitaires (period, payment-email, record-payment) |
| `@playwright/test` | 1.61.0 | E2E owner-record-payment |
| `crypto` (node:crypto) | built-in | `crypto.randomUUID()` si besoin (non requis — Drizzle defaultRandom) |

**Aucune nouvelle dépendance à installer.** `resend` est déjà utilisé via `src/lib/email.ts` (fetch direct sur `api.resend.com`, pas de package npm dédié).

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `src/app/api/v1/owner/tenants/[id]/payments/route.ts` | **NEW** | POST : validation Zod → appelle `recordPayment()` → 201/400/404/409/500 |
| `src/lib/tenants/period.ts` | **NEW** | `calculatePeriodFromCycle(cycle, paidAt)` (pure, +30j/+1 an) |
| `src/lib/tenants/payment-email.ts` | **NEW** | `buildPaymentConfirmationEmailHtml`, `buildPaymentConfirmationEmailText` + helpers `escapeHtml`/`escapeAttribute` dupliqués |
| `src/lib/tenants/record-payment.ts` | **NEW** | `recordPayment(params)` orchestration transactionnelle (lock + insert payment + update tenant + email + events) + `RecordPaymentError` + `maskError` |
| `src/lib/validation/payment.ts` | **NEW** | `recordPaymentSchema` (Zod) + `RecordPaymentInput` |
| `src/components/owner/record-payment-modal.tsx` | **NEW** | Client Component : modal contrôlé, auto-period, validation, soumission |
| `src/components/owner/record-payment-trigger.tsx` | **NEW** | Wrapper bouton/action ouvrant le modal (réutilisable liste + fiche 7-7) |
| `src/lib/tenants/period.test.ts` | **NEW** | Tests unitaires period |
| `src/lib/tenants/payment-email.test.ts` | **NEW** | Tests unitaires email (escaping) |
| `src/lib/tenants/record-payment.test.ts` | **NEW** | Tests unitaires orchestration (mock db/sendEmail) |
| `src/messages/fr-NE.json` | **UPDATE** | Section `owner.payments.record` (tous les labels FR) |
| `tests/e2e/owner-record-payment.spec.ts` | **NEW** | E2E Playwright (modal + soumission + réactivation) |

**Ne PAS modifier :**
- `src/lib/schema.ts` (tables fournies par story 7-1)
- `src/lib/email.ts` (utiliser `sendEmail` tel quel ; dupliquer `escapeHtml` dans `payment-email.ts`)
- `src/lib/auth.ts` (Better Auth config — `getSession` est déjà disponible)
- `src/lib/permissions.ts` (rôle `superadmin` ajouté par story 7-2)
- `src/lib/session.ts` (`requireOwnerSession()` ajouté par story 7-2 — utiliser tel quel)
- `src/lib/tenants/tenant-config.ts` (fourni par story 7-1, lire `APEX_DOMAIN`)
- `src/proxy.ts` (protection `/owner/*` déjà posée par 7-2)
- `src/app/owner/layout.tsx`, `src/app/owner/page.tsx`, `src/app/owner/tenants/page.tsx` (story 7-2 — le trigger est un composant qu'on MONTE dans la liste existante sans modifier la page elle-même si possible, OU modification minimale pour remplacer le placeholder désactivé "Enregistrer paiement")

---

## Testing Requirements

### Tests unitaires (Vitest)

**Fonctions pures (couverture haute, sans mock) :**
- `period.test.ts` : `calculatePeriodFromCycle` (monthly → +30j, annual → +1 an calendaire, `periodStart === paidAt`, input non muté, edge fin de mois)
- `payment-email.test.ts` : escaping HTML (`paymentReference` avec `<script>` et `"`, `tenantName` avec accents), présence des champs (montant formaté, méthode, référence, période, mention réactivation conditionnelle, lien `subdomainUrl`), version texte brute

**Orchestration (mocks) :**
- `record-payment.test.ts` (mock `db.transaction`, `db.select`/`insert`/`update`, `sendEmail`, lookup `user`) :
  - Cas nominal complet (tenant `active` : 1 insert payment dans tx, 1 update tenant hors tx si prolongation, 1 sendEmail, 1 insert event `payment_recorded`, `reactivated=false`, `emailSent=true`, résultat correct)
  - Tenant `suspended` + `reactivateIfSuspended=true` → 1 update tenant (status→active, subscriptionEnd, gracePeriodEndsAt→null) dans tx, 2 inserts event (`payment_recorded` + `reactivated`), `reactivated=true`
  - Tenant `suspended` + `reactivateIfSuspended=false` → pas d'update tenant, `reactivated=false`, warning côté UI (testé en E2E)
  - Tenant `active` + `subscriptionEnd < periodEnd` → 1 update tenant (subscriptionEnd prolongé), `subscriptionExtended=true`
  - Tenant `active` + `subscriptionEnd > periodEnd` → pas d'update tenant, `subscriptionExtended=false`
  - Tenant `cancelled` → `RecordPaymentError("CONFLICT")`, 0 insert, 0 update
  - Tenant introuvable → `RecordPaymentError("NOT_FOUND")`, 0 insert
  - `sendEmail` lève → paiement + events conservés (pas de rollback), `emailSent=false`, note event "email échoué"
  - Pas d'admin user (lookup retourne []) → email skippé, `emailSent=false`
  - **Assertion explicite :** `tenant_events.after` ne contient JAMAIS `notes` (vérifier le payload du mock `db.insert(tenantEvents)`)

### Tests E2E (Playwright)

- `owner-record-payment.spec.ts` :
  - **Setup** : `tests/fixtures/seed-owner.ts` (créé en story 7-2) — étendre avec un tenant `suspended` + admin user par tenant si pas déjà présent
  - **Mock email** : en dev sans `RESEND_API_KEY`, `sendEmail` fait `console.log` — espionner via `page.on("console")` OU vérifier `emailSent` dans la réponse API
  - Scénarios :
    1. Login superadmin → `/owner/tenants` → clic action "Enregistrer paiement" sur une ligne → modal s'ouvre avec le bon tenant (nom affiché)
    2. Soumission sans méthode → erreur en ligne, pas de fetch
    3. Montant décimal (25000.50) → erreur en ligne
    4. periodEnd < periodStart → erreur en ligne
    5. Soumission valide (Wave, 25000, monthly, aujourd'hui) → toast success `25 000 XOF` + modal fermé + refresh liste
    6. Re-fetch `GET /api/v1/owner/tenants` (ou vérifier la row) → "Dernier paiement" mis à jour
    7. Tenant `suspended` + checkbox "Réactiver" cochée → soumission valide → re-fetch tenant → `status === "active"`
    8. Non-superadmin (admin client) → `POST /api/v1/owner/tenants/[id]/payments` → 403

### Tests existants

- `pnpm check` doit continuer à passer : **334+ tests existants** (Epic 1–6 + 7-1/7-2/7-3 quand implémentées). Aucune régression attendue car cette story ne modifie AUCUN fichier existant sauf `fr-NE.json` (ajout de clés, non-cassant) et potentiellement `src/app/owner/tenants/page.tsx` (montage du trigger — additionnel).

---

## Previous Story Intelligence

**Story 7-1 (schema + proxy) — `ready-for-dev` :** fournit le socle. Points à respecter :
- `subscription_payments.amount` est `integer` (FCFA, jamais float).
- `subscription_payments.paidAt` est `timestamp` (instant) ; `periodStart`/`periodEnd` sont `date({ mode: "date" })` (calendaire).
- `tenant_events` est append-only (pas de revision/updatedAt) — pattern `audit_event` story 6-3.
- `tenants` utilise `date({ mode: "date" })` pour `subscriptionStart`/`subscriptionEnd`/`trialEndsAt`/`gracePeriodEndsAt`.
- `paymentMethodEnum` = `nitta|wave|amana|stripe|cash|virement` ; `billingCycleEnum` = `monthly|annual`.
- `user.tenantId` (ajouté en 7-1) permet le lookup admin user pour l'email.

**Story 7-2 (dashboard + liste) — `ready-for-dev` :** fournit `requireOwnerSession()` (à utiliser tel quel dans la route API), le layout owner, et la liste `/owner/tenants` avec un placeholder désactivé "Enregistrer paiement" que cette story active via `RecordPaymentTrigger`.

**Story 7-3 (création tenant) — `ready-for-dev` :** patterns les plus proches à réutiliser :
- **Orchestration transactionnelle + rollback manuel :** `createTenantWithAdmin` (mais ici on utilise `db.transaction()` natif car pas d'appel Better Auth).
- **Reuse `sendEmail` + escaping HTML :** `buildWelcomeEmailHtml` (dupliquer les helpers escape).
- **Auto-calc verrouillable :** pattern `slugEdited` (7-3) → `periodEdited` (7-4).
- **`exactOptionalPropertyTypes` + `?? null`** pour les champs nullables.
- **Best-effort audit** (insert `tenant_events` dans try/catch).

**Story 6-3 (audit trail) — `done` :** pattern best-effort audit. L'insert `tenant_events` suit la même philosophie : try/catch hors transaction, ne bloque jamais le flux principal. L'event `payment_recorded` est l'équivalent de `sync.create` mais pour le domaine tenant.

**Epic 6 entièrement DONE** (2026-06-28). Epic 7 est le premier post-MVP.

---

## Git Intelligence Summary

Derniers commits pertinents :
- `a637dfe` fix: /register redirect to / (was /dashboard), add logout button to parametres
- `a5d9e2e` test(qa): API unit tests + Playwright E2E specs for uncovered routes
- `a4f6977` feat(6-3): immutable audit trail export — tenant-scoped events, login/logout hooks, CSV/JSON download
- `f57a515` feat(6-2): tier quota enforcement — free/pro/enterprise limits with monthly reset and banner
- `725f64b` feat(3-9/3-10/3-11/6-1): lifecycle status, search/filter, duplicate quote, IndexedDB encryption at rest

**Patterns établis à respecter :**
- API routes : `auth.api.getSession` → cast `session.user` → check role → Zod `safeParse` → `apiError` ou `NextResponse.json(..., { status: 201 })`
- Création de données : pattern `src/app/api/v1/users/route.ts` POST (le plus proche — POST + Zod + insert + retour 201)
- Tests : Vitest à côté du module (`src/lib/tenants/*.test.ts`), E2E dans `tests/e2e/`
- Chaque feat commit suit le format `feat(7-4): ...`

---

## Latest Tech Information

### Drizzle 0.44.7 — `db.transaction()` + `.for("update")`

Source : [Drizzle ORM Transactions](https://orm.drizzle.team/docs/transactions), [Drizzle SELECT locking](https://orm.drizzle.team/docs/select#locking)

- **`db.transaction(async (tx) => { ... })`** : wrapper natif. Si la callback lève, ROLLBACK automatique ; sinon COMMIT. Toutes les opérations sur `tx` partagent la même connexion.
- **`.for("update")`** : pose un `SELECT ... FOR UPDATE` (verrou pessimiste ligne). Compatible à l'intérieur d'une transaction. Empêche deux transactions concurrentes de modifier la même ligne tenant simultanément.
- **Usage story 7-4 :** wrapper `SELECT tenant FOR UPDATE` + `insert payment` + `update tenant` dans `db.transaction()`. Les events audit + email restent HORS transaction (best-effort).

### Drizzle — Insert avec enum PostgreSQL

```ts
await db.insert(subscriptionPayments).values({
  paymentMethod: "wave",        // string literal — Drizzle valide via le type pgEnum
  billingCycle: "monthly",
  amount: 25000,
  // ...
})
```
L'enum `paymentMethodEnum` rend le champ `paymentMethod` typé comme `"nitta" | "wave" | "amana" | "stripe" | "cash" | "virement"`. Le `z.enum([...])` de Zod doit lister les mêmes valeurs (dans le même ordre idéalement, pour la lisibilité).

### Zod 4.4.3 — `.int()` rejette les floats

```ts
z.number().int("Le montant doit être un entier").positive("...").max(1e13, "...")
```
- `.int()` rejette `25000.5` (avec un message FR custom).
- L'ordre des validations : `.int()` puis `.positive()` puis `.max()`.
- `superRefine` pour les règles cross-champs (`periodEnd > periodStart`, `paidAt ≤ now`).

### Next.js 16.1.6 — Route API dynamique `params` Promise

```ts
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params  // OBLIGATOIRE await en Next 16
  // ...
}
```
Source : [Next.js 16 — params is a Promise](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes). Le repo utilise déjà ce pattern (cf. stories 7-1/7-2).

### Resend (déjà intégré dans `src/lib/email.ts`)

Source : `src/lib/email.ts` (lecture du code existant)

- **Pas de package npm dédié** : `sendEmail` fait un `fetch("https://api.resend.com/emails", ...)` direct avec `RESEND_API_KEY`.
- **Dev mode** : sans `RESEND_API_KEY` et `NODE_ENV !== "production"` → `console.log` + résout sans erreur (parfait pour les tests).
- **Production** : `RESEND_API_KEY` requis, `EMAIL_FROM` configurable.
- **Décision : NE PAS utiliser nodemailer.** Resend est déjà choisi par le projet. Story 7-4 réutilise ce choix — aucune nouvelle dépendance.

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Technology Stack & Versions** — Better Auth 1.6.11, Drizzle 0.44.7, Zod 4.4.3, Resend (via email.ts), shadcn/ui 3.8.5
- **TypeScript Strict Mode** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`
- **Framework-Specific Rules (Next.js/React)** — App Router, `"use client"`, `next/navigation`, route API dynamique `params` Promise Next 16, i18n next-intl
- **API Routes Rules** — `apiError()`, cast `session.user` à `Record<string, unknown>`, Zod validation, codes d'erreur standard
- **Database Rules (Drizzle)** — `db.transaction()`, `.for("update")`, `integer` pour money, migration workflow
- **Money / Financial Rules** — `formatFcfa()`, FCFA entier (jamais float), borne 0–1e13
- **Audit Trail Rules (Story 6-3)** — pattern best-effort, `before`/`after` jsonb, jamais de données sensibles dans `after`
- **Language Convention** — UI FR (`fr-NE.json`), code EN, DB snake_case EN
- **Code Organization** — `src/lib/validation/` pour les schemas Zod, `src/lib/tenants/` (créé par 7-1) pour la logique tenant

---

## Assumptions

(Assumptions non-interactives — à valider par le parent si besoin)

1. **Cycle annual = +1 an calendaire** (pas +365j) — `setFullYear(+1)` garde le même jour/mois. Plus intuitif commercialement ("abonnement annuel").
2. **Email au PLUS ANCIEN admin du tenant** (ORDER BY createdAt ASC LIMIT 1) — un seul destinataire MVP. Cc multiple DEFERRED.
3. **Checkbox "Réactiver" masquée si `status !== "suspended"`** (pas pertinent pour active/trial) — UX plus claire.
4. **Réactivation = reset `subscriptionStart` à `periodStart`** (perte de l'ancien start, mais audit trail trace le changement). Alternative : préserver l'ancien start. → Flag Dev Notes.
5. **Prolongation auto si `periodEnd > subscriptionEnd`** pour les tenants active/trial — l'abonnement suit la période couverte par le paiement.
6. **`db.transaction()` natif Drizzle** pour wrapper insert payment + update tenant (pas de rollback manuel comme en 7-3, car pas d'appel Better Auth ici).
7. **`escapeHtml`/`escapeAttribute` dupliqués** dans `payment-email.ts` (ne pas modifier `src/lib/email.ts` hors scope).
8. **Pas de pré-remplissage du montant depuis `PLAN_PRICES_XOF`** — le owner saisit le montant (peut négocier). Pré-remplissage DEFERRED à 7-12.
9. **`paymentReference` visible dans `tenant_events.after`** (semi-public, ID de transaction) — mais masqué partiellement dans les `console.error`.
10. **`notes` JAMAIS dans `tenant_events.after`** (privées owner, vont uniquement dans `subscription_payments.notes`).
11. **Timezone UTC+1 (Niger)** — approximation d'un jour sur `periodStart`/`periodEnd` acceptable en MVP. Documenté.
12. **Trigger monté sur la liste `/owner/tenants`** en remplaçant le placeholder désactivé de 7-2 (modification minimale de la page liste, OU exposition via un bouton standalone). Le même composant sera remonté par 7-7 dans la fiche tenant.
13. **Mode dégradé si 7-2 absent** : `role === "admin"` accepté temporairement avec TODO(story-7-2) — à nettoyer par 7-2.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Zod 4 changed `required_error` → `error` in enum params — fixed in `payment.ts`
- Suspended tenant without reactivation was incorrectly extending `subscriptionEnd` — fixed `record-payment.ts` to guard `else if (tenant.status !== "suspended")`
- TS strict mode on test mock call args — added `callArg()` helper casting through `unknown[][]`
- Unused `auth` import in E2E spec — removed

### Completion Notes List

- T1 `period.ts`: `calculatePeriodFromCycle` — monthly +30j, annual +1 calendar year (setFullYear), no mutation
- T2 `payment.ts`: `recordPaymentSchema` with Zod 4 API, superRefine for cross-field rules (periodEnd>periodStart, paidAt≤now+1d)
- T3 `payment-email.ts`: HTML+text templates, duplicated escapeHtml/escapeAttribute (not exported from email.ts)
- T4 `record-payment.ts`: db.transaction wraps lock+insert+update; email+events best-effort outside tx; RecordPaymentError class; maskError helper; suspended-only guards
- T5 `route.ts`: POST API with requireOwnerSession guard, Zod safeParse, RecordPaymentError mapping
- T6 `record-payment-modal.tsx`: controlled form, auto-period with periodEdited lock, reactivate checkbox visible only for suspended tenants
- T7 `record-payment-trigger.tsx`: menu-item + button variants, mounts RecordPaymentModal
- T8 `fr-NE.json`: added `owner.payments.record.*` section (merged, no overwrite)
- T9 unit tests: 508/508 pass — period (7 tests), payment-email (14 tests), record-payment (23 tests)
- T10 E2E spec created: `e2e/owner-record-payment.spec.ts` (8 scenarios)
- T11 `pnpm check` ✓, `pnpm build` ✓, 508 tests passing (334+ existing + new)
- `tenants-table.tsx`: replaced disabled "Enregistrer paiement" DropdownMenuItem with live RecordPaymentTrigger

### File List

- `src/lib/tenants/period.ts` — NEW
- `src/lib/validation/payment.ts` — NEW
- `src/lib/tenants/payment-email.ts` — NEW
- `src/lib/tenants/record-payment.ts` — NEW
- `src/app/api/v1/owner/tenants/[id]/payments/route.ts` — NEW
- `src/components/owner/record-payment-modal.tsx` — NEW
- `src/components/owner/record-payment-trigger.tsx` — NEW
- `src/lib/tenants/period.test.ts` — NEW
- `src/lib/tenants/payment-email.test.ts` — NEW
- `src/lib/tenants/record-payment.test.ts` — NEW
- `e2e/owner-record-payment.spec.ts` — NEW
- `src/messages/fr-NE.json` — MODIFIED (owner.payments.record section added)
- `src/components/owner/tenants-table.tsx` — MODIFIED (RecordPaymentTrigger wired, ActionsMenu receives tenant object)

### Review Findings

_À remplir après code-review._

### Change Log

- Story 7-4 créée : enregistrement paiement (mobile money + manuel) — Epic 7 §3.3 + §5 (Date: 2026-06-28)
- Story 7-4 implémentée et prête pour review : 13 fichiers créés/modifiés, 508 tests pass, build ✓ (Date: 2026-06-29)
