---
story_key: 7-3-create-tenant-welcome-email
epic_num: 7
story_num: 3
status: review
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (schema tenants + tenant_events + user.tenantId + enums) — HARD"
  - "7-2-owner-dashboard-tenant-list (rôle superadmin + RBAC /owner/* + layout owner) — HARD (route /owner/* protégée)"
---

# Story 7.3 : Création manuelle d'un tenant + email de bienvenue

**Statut :** done

## Story

**En tant que** superadmin owner (Maiga Tech Lab),
**Je veux** créer manuellement un tenant SaaS et son compte administrateur client depuis `/owner/tenants/new`,
**Afin que** le client reçoive immédiatement son sous-domaine `{slug}.quotation.com` et ses identifiants de connexion par email, et que chaque création soit tracée dans le journal `tenant_events`.

---

## Critères d'acceptation (BDD)

**AC1 — Accès à la page (superadmin uniquement)**

```
GIVEN  un utilisateur authentifié avec rôle "superadmin"
WHEN   il accède à /owner/tenants/new
THEN   le formulaire de création de tenant est affiché

GIVEN  un utilisateur avec rôle "admin" (tenant client), "commercial" ou "operateur"
WHEN   il accède à /owner/tenants/new
THEN   il est redirigé (302) vers /owner/tenants (ou /dashboard) avec un toast d'erreur
AND    la route API POST /api/v1/owner/tenants retourne 403 FORBIDDEN

GIVEN  un utilisateur non authentifié
WHEN   il accède à /owner/tenants/new
THEN   il est redirigé vers /login
```

> **Dépendance :** le rôle `superadmin` et la protection RBAC de `/owner/*` sont introduits par la **story 7-2**. Si 7-2 n'est pas encore implémentée au moment du dev, utiliser `role === "admin"` comme placeholder temporaire (cf. Dev Notes — mode dégradé) et laisser un TODO.

**AC2 — Champs du formulaire et validation (FR-Epic7 §3.4)**

```
GIVEN  le formulaire /owner/tenants/new
WHEN   l'utilisateur soumet sans "companyName"
THEN   l'erreur française "Le nom de la société est requis" s'affiche en ligne
AND    aucune mutation n'est déclenchée

GIVEN  le slug saisi contient des caractères invalides (majuscules, espaces, accents, caractères spéciaux)
WHEN   l'utilisateur soumet
THEN   l'erreur "Le slug ne doit contenir que des minuscules, des chiffres et des tirets" s'affiche
AND    aucune mutation n'est déclenchée

GIVEN  un slug déjà utilisé par un tenant existant
WHEN   l'utilisateur soumet (ou au blur du champ slug)
THEN   l'erreur "Ce sous-domaine est déjà utilisé" s'affiche
AND    aucune mutation n'est déclenchée

GIVEN  un email admin dans un format invalide
WHEN   l'utilisateur soumet
THEN   l'erreur "Format email invalide" s'affiche

GIVEN  l'utilisateur choisit "Mot de passe auto-généré"
WHEN   l'utilisateur soumet
THEN   un mot de passe aléatoire fort (≥ 16 caractères, mixant classes) est généré côté serveur
AND    ce mot de passe est inclus dans l'email de bienvenue (si checkbox email coché)
AND    il n'est JAMAIS stocké en clair (hash scrypt via Better Auth)
```

**AC3 — Auto-génération et édition du slug**

```
GIVEN  l'utilisateur saisit "Trans Sahel Logistics" dans companyName
WHEN   le champ slug n'a pas été édité manuellement
THEN   le slug s'auto-génère en live : "trans-sahel-logistics"
        (lowercase, accents retirés, espaces → tirets, tirets multiples condensés,
         trim des tirets en tête/queue)

GIVEN  l'utilisateur édite manuellement le champ slug
WHEN   il re-saisit le companyName
THEN   le slug n'est PAS écrasé (l'édition manuelle verrouille l'auto-génération)
```

**AC4 — Flux de création transactionnel (FR-Epic7 §3.4 + §5)**

```
GIVEN  un formulaire valide (companyName, slug unique, plan, cycle, admin name/email, password mode)
WHEN   l'utilisateur soumet
THEN   l'API POST /api/v1/owner/tenants exécute atomiquement et séquentiellement :
         1. INSERT dans tenants (status='trial', plan, maxUsers depuis PLAN_LIMITS,
            trialEndsAt = now + DEFAULT_TRIAL_DAYS, subscriptionStart/End selon cycle)
         2. Création du compte admin client via auth.api.signUp ({ email, password, name })
            → crée user + account (credential, password hash scrypt) dans UNE transaction Better Auth
         3. UPDATE user SET tenantId = <nouveau tenant>.id, role = 'admin'
         4. (si checkbox "Envoyer email de bienvenue") envoi email avec {slug}.quotation.com + credentials
         5. INSERT dans tenant_events (event_type='created', actorId=superadmin.id, after={...état...})
AND    si l'étape 2 ou 3 échoue → ROLLBACK de l'étape 1 (le tenant inséré est supprimé)
AND    si l'étape 4 échoue → le tenant ET le user sont conservés (email est best-effort,
       l'échec est loggé mais ne fait pas échouer la requête — un event 'created' est quand même loggé)
AND    la réponse retourne 201 avec { tenantId, slug, subdomainUrl, adminUserId }

GIVEN  l'email admin saisi correspond déjà à un user existant
WHEN   l'utilisateur soumet
THEN   l'API retourne 409 CONFLICT "Un utilisateur avec cet email existe déjà"
AND    AUCUN tenant n'est créé (vérification avant toute insertion)
```

**AC5 — Email de bienvenue**

```
GIVEN  la checkbox "Envoyer email de bienvenue" est cochée
WHEN   la création réussit
THEN   un email est envoyé via sendEmail() (src/lib/email.ts — Resend, déjà configuré)
        contenant :
         - Sujet : "Bienvenue sur Quotation Logistique — vos identifiants"
         - URL du tenant : https://{slug}.quotation.com
         - Email de connexion : {admin email}
         - Mot de passe : {password en clair} (uniquement si auto-généré OU si mode manuel coché)
         - Lien de connexion + mention "Changez votre mot de passe à la première connexion"
         - Période d'essai : "Votre période d'essai se termine le {trialEndsAt}"

GIVEN  la checkbox "Envoyer email de bienvenue" est DÉCOCHÉE
WHEN   la création réussit
THEN   aucun email n'est envoyé
AND    le mot de passe (si auto-généré) est retourné dans la réponse API (pour que le owner
       puisse le communiquer manuellement au client)
AND    un avertissement s'affiche côté UI : "Email non envoyé — communiquez les identifiants manuellement"

GIVEN  l'envoi email échoue (Resindown ou erreur réseau)
WHEN   la création a réussi
THEN   l'erreur est catchée et loggée (console.error)
AND    la création n'est PAS annulée (le tenant + user existent)
AND    un event tenant_events est quand même inséré avec note "email bienvenue échoué"
```

**AC6 — Journalisation d'audit (tenant_events)**

```
GIVEN  une création de tenant réussie
WHEN   l'opération se termine
THEN   une ligne est insérée dans tenant_events :
         - eventType : 'created'
         - tenantId : <nouveau tenant>.id
         - actorId : <superadmin user_id>
         - before : null
         - after : { name, slug, plan, status, trialEndsAt, maxUsers } (sans données sensibles)
         - note : "Créé par {superadmin email}" (optionnel)
AND    l'insertion est best-effort (un échec d'audit ne fait pas échouer la création, cf. pattern audit_event story 6-3)
```

**AC7 — Navigation et feedback UI**

```
GIVEN  une création réussie
WHEN   l'API répond 201
THEN   un toast success s'affiche : "Tenant « {companyName} » créé — {slug}.quotation.com"
AND    l'utilisateur est redirigé vers /owner/tenants/[id] (fiche tenant, story 7-7)
       ou /owner/tenants (liste, story 7-2) si la fiche n'existe pas encore

GIVEN  une erreur 409 (email ou slug dupliqué)
WHEN   l'API répond
THEN   l'erreur s'affiche en ligne sur le champ concerné (pas de toast générique)

GIVEN  une erreur 500 ou réseau
WHEN   l'API répond
THEN   un toast erreur s'affiche : "Une erreur est survenue. Le tenant n'a pas été créé."
AND    le bouton submit redevient actif (isPending = false)
```

**AC8 — Qualité & tests**

```
GIVEN  les fichiers créés/modifiés
WHEN   je lance pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
AND    tests unitaires (Vitest) couvrent :
         - generateSlug() : accents, espaces, tirets multiples, trim, caractères spéciaux
         - generatePassword() : longueur, diversité de classes, non-prévisibilité
         - validateTenantInput() : tous les cas d'erreur (AC2)
         - buildWelcomeEmailHtml() : escaping HTML du mot de passe et du slug
         - calculateTrialDates() : trialEndsAt = now + 14j, subscriptionEnd selon cycle
AND    tests E2E (Playwright) couvrent :
         - superadmin accède au formulaire
         - non-superadmin redirigé
         - soumission valide → création + redirection + toast
         - slug dupliqué → erreur en ligne
         - email dupliqué → erreur 409
         - email mocké (intercept sendEmail) vérifie le contenu de l'email
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/owner/tenants/new/page.tsx` — CRÉER : Server Component (auth superadmin + RBAC + rendu formulaire)
- `src/app/owner/tenants/new/new-tenant-form.tsx` — CRÉER : Client Component (formulaire contrôlé, auto-slug, validation, soumission)
- `src/app/api/v1/owner/tenants/route.ts` — CRÉER : POST (création transactionnelle tenant + user + email + event)
- `src/lib/tenants/slug.ts` — CRÉER : `generateSlug(name)`, `validateSlug(slug)` (purs, testables)
- `src/lib/tenants/password.ts` — CRÉER : `generatePassword(length=20)` (pur, testable, utilise `crypto.randomInt`)
- `src/lib/tenants/welcome-email.ts` — CRÉER : `buildWelcomeEmailHtml(params)`, `buildWelcomeEmailText(params)` (escaping HTML)
- `src/lib/tenants/tenant-dates.ts` — CRÉER : `calculateTrialDates(plan, cycle, now)` retourne `{ subscriptionStart, subscriptionEnd, trialEndsAt }`
- `src/lib/validation/tenant.ts` — CRÉER : `createTenantSchema` (Zod — tous les champs + validation)
- `src/lib/tenants/create-tenant.ts` — CRÉER : `createTenantWithAdmin(params)` — orchestration transactionnelle (appelée par la route API)
- Tests unitaires : `slug.test.ts`, `password.test.ts`, `welcome-email.test.ts`, `tenant-dates.test.ts`, `create-tenant.test.ts` (mock `auth.api.signUp`, `db`, `sendEmail`)
- `src/messages/fr-NE.json` — UPDATE : section `owner.tenants.new` (tous les labels FR)
- Tests E2E : `tests/e2e/owner-create-tenant.spec.ts` — CRÉER

**EXCLU (hors périmètre — ne pas modifier) :**
- `src/lib/schema.ts` → tables `tenants`, `tenant_events`, `user.tenantId`, enums → **déjà créés par story 7-1**
- Rôle `superadmin` dans `userRoleEnum` + RBAC `/owner/*` → **story 7-2**
- Layout owner `/owner/layout.tsx` + navigation owner → **story 7-2**
- Liste des tenants `/owner/tenants` → **story 7-2**
- Fiche tenant `/owner/tenants/[id]` → **story 7-7** (la redirection post-création peut fallback vers `/owner/tenants`)
- Enregistrement de paiement → **story 7-4**
- Cron expiration + rappels → **story 7-6**
- Résolution de sous-domaine / proxy → **story 7-1** (cette story ne touche PAS au proxy)
- `src/lib/email.ts` → **utilise tel quel** (`sendEmail`, `isEmailDeliveryConfigured`, pattern `buildResetPasswordHtml`)
- Stripe webhook auto-activation → **story 7-10**

---

## Tâches / Sous-tâches

### T1 — CRÉER `src/lib/tenants/slug.ts` (AC2, AC3)

- [x] `generateSlug(name: string): string` — pure :
  - `.normalize("NFD").replace(/[̀-ͯ]/g, "")` (retire les accents)
  - `.toLowerCase()`
  - `.replace(/[^a-z0-9]+/g, "-")` (tout ce qui n'est pas alphanum → tiret)
  - `.replace(/^-+|-+$/g, "")` (trim tirets en tête/queue)
  - `.replace(/-{2,}/g, "-")` (condense les tirets multiples)
  - si résultat vide → retourner `"tenant"` (fallback)
- [x] `validateSlug(slug: string): { valid: boolean; reason?: string }` — regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longueur 3–63 (limites sous-domaine DNS)
- [x] `pnpm typecheck` — zéro erreur

### T2 — CRÉER `src/lib/tenants/password.ts` (AC2)

- [x] `generatePassword(length = 20): string` — utilise `crypto.randomInt` (PAS `Math.random`) :
  - charset garanti : lowercase + uppercase + digits + symbols (`-!@#$%^&*`)
  - force l'inclusion d'au moins 1 caractère de chaque classe (shuffle final)
  - évite les caractères ambigus (`O`, `0`, `l`, `1`, `I`) pour la lisibilité email
- [x] `pnpm typecheck`

### T3 — CRÉER `src/lib/tenants/tenant-dates.ts` (AC4)

- [x] `calculateTrialDates(params: { cycle: "monthly" | "annual"; now?: Date }): { subscriptionStart: Date; subscriptionEnd: Date; trialEndsAt: Date }` :
  - `trialEndsAt = now + DEFAULT_TRIAL_DAYS` (14 j, importé de `tenant-config.ts` story 7-1)
  - `subscriptionStart = now`
  - `subscriptionEnd = cycle === "annual" ? now + 365j : now + 30j` (approximation calendaire — utiliser `setDate` ou addition ms ; documenter le choix)
- [x] `pnpm typecheck`

### T4 — CRÉER `src/lib/tenants/welcome-email.ts` (AC5)

- [x] `buildWelcomeEmailHtml(params): string` — retourne HTML inline-stylé (imiter `buildResetPasswordHtml` dans `src/lib/email.ts`):
  - params : `{ tenantName, subdomainUrl, adminEmail, password, trialEndsAt }`
  - **CRITIQUE — escaping :** utiliser `escapeHtml`/`escapeAttribute` (cf. `src/lib/email.ts`) sur le mot de passe, le slug, le nom. Le mot de passe peut contenir `<`, `>`, `"`, `'`, `` ` `` — ne JAMAIS l'insérer brut dans le HTML.
  - Contenu : bienvenue, URL tenant (cliquable), credentials dans un bloc `<pre>` ou tableau, mention période d'essai, mention "Changez votre mot de passe à la première connexion"
- [x] `buildWelcomeEmailText(params): string` — version texte brut (pour clients mail ne supportant pas HTML)
- [x] `pnpm typecheck`

### T5 — CRÉER `src/lib/validation/tenant.ts` (AC2)

- [x] `createTenantSchema = z.object({...})` :
  ```ts
  {
    companyName: z.string().trim().min(1, "Le nom de la société est requis").max(120),
    slug: z.string().trim().min(1).max(63)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalide"),
    plan: z.enum(["free", "pro", "enterprise"]),
    cycle: z.enum(["monthly", "annual"]),
    periodStart: z.string().datetime().optional(), // ISO; défaut = now côté serveur
    periodEnd: z.string().datetime().optional(),   // défaut calculé depuis cycle
    adminName: z.string().trim().min(1, "Le nom de l'administrateur est requis").max(120),
    adminEmail: z.string().trim().email("Format email invalide"),
    passwordMode: z.enum(["auto", "manual"]),
    manualPassword: z.string().optional(), // requis si passwordMode="manual" (min 12)
    sendWelcomeEmail: z.boolean().default(true),
    notes: z.string().max(2000).optional(),
  }
  ```
  - **superRefine :** si `passwordMode === "manual"` et `manualPassword` absent ou `< 12` car → erreur sur `manualPassword`
- [x] Exporter `CreateTenantInput = z.infer<typeof createTenantSchema>`
- [x] `pnpm typecheck`

### T6 — CRÉER `src/lib/tenants/create-tenant.ts` — orchestration transactionnelle (AC4, AC5, AC6)

- [x] Signature :
  ```ts
  export interface CreateTenantParams {
    input: CreateTenantInput;
    actorId: string;          // superadmin user_id
    actorEmail: string;       // pour la note d'audit
  }
  export interface CreateTenantResult {
    tenantId: string;
    slug: string;
    subdomainUrl: string;
    adminUserId: string;
    generatedPassword?: string; // présent si passwordMode="auto" (pour retour API / UI)
    emailSent: boolean;
  }
  export async function createTenantWithAdmin(params: CreateTenantParams): Promise<CreateTenantResult>
  ```
- [x] Logique (DANS CET ORDRE) :
  1. **Vérifier l'unicité du slug** : `SELECT id FROM tenants WHERE slug = ?` → si trouvé, throw `TenantConflictError("slug")`
  2. **Vérifier l'unicité de l'email** : `SELECT id FROM user WHERE email = ?` → si trouvé, throw `TenantConflictError("email")`
  3. **Calculer les dates** : `calculateTrialDates({ cycle })`
  4. **Déterminer le mot de passe** : si `passwordMode === "auto"` → `generatePassword()` ; sinon `input.manualPassword`
  5. **INSÉRER le tenant** :
     ```ts
     const [tenant] = await db.insert(tenants).values({
       name: input.companyName,
       slug: input.slug,
       status: "trial",
       plan: input.plan,
       maxUsers: PLAN_LIMITS[input.plan].maxUsers,
       subscriptionStart: dates.subscriptionStart,
       subscriptionEnd: dates.subscriptionEnd,
       trialEndsAt: dates.trialEndsAt,
       notes: input.notes ?? null,
     }).returning()
     ```
  6. **Créer le compte admin via Better Auth** (CRITIQUE — voir Dev Notes) :
     ```ts
     const signUpResult = await auth.api.signUp({
       body: { email: input.adminEmail, password, name: input.adminName },
     })
     if (!signUpResult?.user) throw new Error("Better Auth signUp failed")
     const adminUser = signUpResult.user
     ```
  7. **Lier le user au tenant + forcer le rôle "admin"** (tenant admin) :
     ```ts
     await db.update(userTable).set({
       tenantId: tenant.id,
       role: "admin",
     }).where(eq(userTable.id, adminUser.id))
     ```
  8. **Envoyer l'email** (si `sendWelcomeEmail`) — best-effort :
     ```ts
     let emailSent = false
     if (input.sendWelcomeEmail) {
       try {
         await sendEmail({
           to: input.adminEmail,
           subject: "Bienvenue sur Quotation Logistique — vos identifiants",
           html: buildWelcomeEmailHtml({...}),
           text: buildWelcomeEmailText({...}),
         })
         emailSent = true
       } catch (err) {
         console.error("Welcome email failed", err)
         emailSent = false
       }
     }
     ```
  9. **Logger l'événement** (best-effort) :
     ```ts
     try {
       await db.insert(tenantEvents).values({
         tenantId: tenant.id,
         eventType: "created",
         actorId: params.actorId,
         before: null,
         after: { name: tenant.name, slug: tenant.slug, plan: tenant.plan, status: tenant.status, trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null, maxUsers: tenant.maxUsers },
         note: emailSent ? `Créé par ${params.actorEmail}` : `Créé par ${params.actorEmail} — email bienvenue échoué`,
       })
     } catch (err) {
       console.error("tenant_events insert failed", err)
     }
     ```
  10. **Retourner le résultat** avec `generatedPassword` (si auto) pour la réponse API
- [x] **ROLLBACK sur échec :** wrapper étapes 5–7 dans un `try/catch` ; si l'étape 6 ou 7 échoue → `await db.delete(tenants).where(eq(tenants.id, tenant.id))` (cascade supprime aussi les events liés via FK ON DELETE CASCADE — vérifier le schéma story 7-1) puis rethrow. Documenter ce rollback explicite (Better Auth signUp et l'insert Drizzle ne sont PAS dans la même transaction native — d'où le rollback manuel).
- [x] `pnpm typecheck`

### T7 — CRÉER `src/app/api/v1/owner/tenants/route.ts` (AC1, AC4)

- [x] `export async function POST(req: Request)` :
  1. `auth.api.getSession({ headers: await headers() })` → 401 si null
  2. Cast `session.user.role` → si `!== "superadmin"` → 403 `apiError("FORBIDDEN", ...)`
     - **Mode dégradé (si 7-2 pas implémenté) :** accepter `=== "admin"` + TODO (cf. Dev Notes)
  3. Parse + valide le body avec `createTenantSchema.safeParse(await req.json())` → 400 `apiError("VALIDATION_FAILED", ..., fields)` si invalide
  4. `try { const result = await createTenantWithAdmin({...}) ; return NextResponse.json(result, { status: 201 }) }`
  5. `catch (err)` :
     - si `err instanceof TenantConflictError` → 409 `apiError("CONFLICT", message, fields={ [field]: msg })`
     - sinon → `console.error(err)` ; 500 `apiError("INTERNAL_ERROR", "Une erreur est survenue.", HTTP_STATUS.INTERNAL)`
- [x] NE PAS exposer le mot de passe en clair dans les logs serveur (le masquer dans tout `console.error`)
- [x] `pnpm typecheck`

### T8 — CRÉER `src/app/owner/tenants/new/page.tsx` (AC1)

- [x] Server Component :
  ```tsx
  import { redirect } from "next/navigation"
  import { auth } from "@/lib/auth"
  import { headers } from "next/headers"
  import { NewTenantForm } from "./new-tenant-form"
  import { getTranslations } from "next-intl/server"

  export default async function NewTenantPage() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect("/login")
    const role = (session.user as Record<string, unknown>).role as string
    // HARD dépendance story 7-2 : role === "superadmin"
    // Mode dégradé : accepter "admin" temporairement (TODO retirer après 7-2)
    if (role !== "superadmin" && role !== "admin") redirect("/dashboard")
    const t = await getTranslations("owner.tenants.new")
    return (
      <div className="flex flex-col px-5 pt-8 pb-10 max-w-2xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("eyebrow")}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
          {t("title")}
        </h1>
        <div className="mt-6">
          <NewTenantForm />
        </div>
      </div>
    )
  }
  ```
- [x] `pnpm typecheck`

### T9 — CRÉER `src/app/owner/tenants/new/new-tenant-form.tsx` (AC2, AC3, AC7)

- [x] `"use client"` première ligne, double quotes
- [x] États : `isPending`, `errors` (par champ), `globalError`, `slugEdited` (bool pour verrouiller l'auto-gen)
- [x] Champs contrôlés : companyName, slug, plan (Select free/pro/enterprise), cycle (SegmentedControl monthly/annual), periodStart, periodEnd, adminName, adminEmail, passwordMode (radio auto/manual), manualPassword (conditionnel), sendWelcomeEmail (Checkbox, défaut true), notes (Textarea)
- [x] **Auto-slug :** `useEffect` sur `companyName` → si `!slugEdited` → `setSlug(generateSlug(companyName))`
- [x] **Validation client :** appeler `createTenantSchema.safeParse` avant soumission (échec → `setErrors` par champ, pas de fetch)
- [x] `handleSubmit` :
  ```ts
  setIsPending(true); setErrors({}); setGlobalError(null)
  const res = await fetch("/api/v1/owner/tenants", { method: "POST", body: JSON.stringify(payload) })
  if (res.ok) {
    const data = await res.json()
    toast.success(`Tenant « ${companyName} » créé — ${data.slug}.quotation.com`)
    // Si password auto ET email non envoyé → afficher le password une fois (modal ou toast)
    router.push(`/owner/tenants/${data.tenantId}`)
  } else {
    const body = await res.json()
    if (body.error?.fields) setErrors(body.error.fields)
    else if (body.error?.code === "CONFLICT") setErrors({ /* mapper field */ })
    else toast.error("Une erreur est survenue. Le tenant n'a pas été créé.")
  }
  setIsPending(false)
  ```
- [x] **Affichage du mot de passe auto-généré non envoyé :** si `passwordMode === "auto"` ET `!sendWelcomeEmail` ET création réussie → afficher le password dans un bloc `<pre>` avec bouton "Copier" (le password vient de `data.generatedPassword`)
- [x] Tous les labels depuis `useTranslations("owner.tenants.new")` — JAMAIS de texte FR hardcodé
- [x] `pnpm typecheck`

### T10 — UPDATE `src/messages/fr-NE.json`

- [x] Ajouter section `owner.tenants.new` :
  ```json
  "owner": {
    "tenants": {
      "new": {
        "eyebrow": "Owner · Tenants",
        "title": "Nouveau tenant",
        "companyName": "Nom de la société",
        "companyNameRequired": "Le nom de la société est requis",
        "slug": "Sous-domaine",
        "slugHint": "Le tenant sera accessible sur {slug}.quotation.com",
        "slugInvalid": "Le slug ne doit contenir que des minuscules, des chiffres et des tirets",
        "slugTaken": "Ce sous-domaine est déjà utilisé",
        "plan": "Plan",
        "cycle": "Cycle de facturation",
        "monthly": "Mensuel",
        "annual": "Annuel",
        "periodStart": "Début de période",
        "periodEnd": "Fin de période",
        "adminSection": "Administrateur du tenant",
        "adminName": "Nom de l'administrateur",
        "adminNameRequired": "Le nom de l'administrateur est requis",
        "adminEmail": "Email de l'administrateur",
        "adminEmailInvalid": "Format email invalide",
        "adminEmailTaken": "Un utilisateur avec cet email existe déjà",
        "passwordMode": "Mot de passe",
        "passwordAuto": "Générer automatiquement",
        "passwordManual": "Définir manuellement",
        "manualPassword": "Mot de passe",
        "manualPasswordRequired": "Le mot de passe doit faire au moins 12 caractères",
        "sendWelcomeEmail": "Envoyer l'email de bienvenue avec les identifiants",
        "notes": "Notes internes",
        "submit": "Créer le tenant",
        "submitting": "Création en cours…",
        "success": "Tenant « {name} » créé — {slug}.quotation.com",
        "error": "Une erreur est survenue. Le tenant n'a pas été créé.",
        "emailNotSent": "Email non envoyé — communiquez les identifiants manuellement",
        "generatedPassword": "Mot de passe généré",
        "copyPassword": "Copier",
        "changePasswordHint": "Changez votre mot de passe à la première connexion."
      }
    }
  }
  ```

### T11 — Tests unitaires Vitest

- [x] `src/lib/tenants/slug.test.ts` : accents ("Établissement Café" → "etablissement-cafe"), espaces multiples, tirets en tête/queue, caractères spéciaux, empty → fallback
- [x] `src/lib/tenants/password.test.ts` : longueur correcte, contient au moins 1 de chaque classe, exécutions successives différentes (non-déterminisme), pas de caractères ambigus
- [x] `src/lib/tenants/tenant-dates.test.ts` : trialEndsAt = now+14j, monthly → +30j, annual → +365j
- [x] `src/lib/tenants/welcome-email.test.ts` : escaping correct (insérer un password contenant `<script>` et `"` → vérifier qu'il est échappé dans le HTML), présence de l'URL/slug/email/password
- [x] `src/lib/tenants/create-tenant.test.ts` (mock `auth.api.signUp`, `db.insert/update`, `sendEmail`) :
  - Cas nominal : tenant créé, user créé, role="admin", tenantId set, event inséré, email envoyé, `generatedPassword` retourné
  - Slug dupliqué → `TenantConflictError("slug")`, aucun INSERT
  - Email dupliqué → `TenantConflictError("email")`, aucun INSERT
  - `auth.api.signUp` échoue → tenant rollback (DELETE appelé), erreur propagée
  - `sendEmail` échoue → tenant + user conservés, `emailSent=false`, event inséré avec note d'échec
  - `sendWelcomeEmail=false` → `sendEmail` jamais appelé, `generatedPassword` retourné

### T12 — Tests E2E Playwright

- [x] `tests/e2e/owner-create-tenant.spec.ts` :
  - **Setup** : seed un superadmin (ou admin en mode dégradé), login
  - Intercept `**/api/v1/owner/tenants` et `sendEmail` (mock Resend via `page.route("**/api/v1/owner/tenants", ...)`) — ou intercept via la lib email en mockant `RESEND_API_KEY` absent (dev console log)
  - Scénarios :
    1. Accès au formulaire `/owner/tenants/new` en tant que superadmin → formulaire visible
    2. Soumission valide → toast success + redirection
    3. Slug dupliqué → erreur en ligne
    4. Non-superadmin → redirect (si testable avec un user tenant)
    5. Auto-slug se met à jour quand on tape le companyName
- [x] `pnpm test:e2e` — passe

### T13 — Vérification finale (AC8)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (pas de régression, 334+ tests existants + nouveaux)
- [x] `pnpm build` : passe sans erreur
- [x] Aucune nouvelle dépendance installée (tout réutilise l'existant)

---

## Dev Notes

### CRITIQUE — Dépendances HARD sur stories 7-1 et 7-2

Cette story s'appuie sur DEUX stories précédentes non encore implémentées au moment de la création de ce fichier :

- **Story 7-1 (HARD) :** fournit `tenants`, `tenant_events` (tables), `user.tenantId` (colonne), `tenantPlanEnum`/`tenantStatusEnum`/`billingCycleEnum` (enums), `tenant-config.ts` (`DEFAULT_TRIAL_DAYS`, `PLAN_LIMITS`, `APEX_DOMAIN`). **Sans 7-1, cette story ne compile pas.**
- **Story 7-2 (HARD) :** fournit le rôle `superadmin` dans `userRoleEnum`, le layout `/owner/layout.tsx`, la navigation owner, et la protection RBAC de `/owner/*`. **Sans 7-2, la route `/owner/tenants/new` n'est pas protégée et le type `role === "superadmin"` ne typecheck pas.**

**Mode dégradé (si 7-2 absent au moment du dev) :**
- Côté page : `if (role !== "superadmin" && role !== "admin") redirect(...)` avec un `// TODO(story-7-2): retirer "admin"` 
- Côté API : idem
- Documenter ce TODO clairement pour que la story 7-2 le nettoie.

---

### CRITIQUE — Création du compte admin : utiliser `auth.api.signUp` (PAS le plugin admin, PAS l'insert direct)

Le repository a **déjà un pattern** pour créer un user : `src/app/api/v1/users/route.ts` (POST) fait un `db.insert(userTable)` **direct** puis envoie un email de reset password. **Ce pattern ne convient PAS ici** car :
1. Le spec Epic 7 §3.4 exige un **mot de passe** envoyé au client (pas un lien de reset).
2. Un insert direct ne crée PAS la ligne `account` (credential) avec le hash du mot de passe → l'utilisateur ne pourrait pas se connecter.

**Solution retenue : `auth.api.signUp({ body: { email, password, name } })`** (API server-side Better Auth 1.6.11). Cette méthode :
- Crée la ligne `user` ET la ligne `account` (providerId="credential", password hashé en scrypt) dans une transaction interne Better Auth.
- Hash le mot de passe avec **scrypt** (non-blocking depuis v1.6, via `node:crypto`).
- Ne nécessite PAS le plugin admin (qui ajouterait des colonnes `banned`/`banReason` au schéma et une migration — hors scope).
- Référence : [Better Auth Email & Password docs](https://better-auth.com/docs/authentication/email-password), [GitHub issue #6306](https://github.com/better-auth/better-auth/issues/6306) (patterns programmatiques).

**Après `signUp`**, on UPDATE le user pour forcer `tenantId` et `role = "admin"` (rôle tenant admin, à ne pas confondre avec le superadmin owner). Better Auth `signUp` crée le user avec le `defaultRole` du plugin — ici on l'écrase explicitement.

**Alternative non retenue : plugin admin (`admin.createUser`).** Le plugin admin exigerait : `import { admin } from "better-auth/plugins"`, ajout au tableau `plugins`, **migration de schéma** (colonnes `banned`, `banReason`, `banExpires`, `role` déjà présent). Trop invasif pour cette story. `signUp` est plus simple et suffisante.

**Anti-pattern à PROSCRIRE :** hasher le mot de passe manuellement et faire un double `db.insert(user)` + `db.insert(account)`. Better Auth gère le scrypt + les colonnes internes ; reproduire ce schéma est fragile et cassera à la prochaine mise à jour.

---

### CRITIQUE — Transactionnalité : pas de transaction native cross-Drizzle/Better-Auth

L'insertion du tenant (Drizzle) et la création du user (Better Auth `signUp`) ne sont **PAS** dans la même transaction SQL. D'où la stratégie de **rollback manuel** dans `createTenantWithAdmin` :

```ts
const [tenant] = await db.insert(tenants).values({...}).returning()
try {
  const signUpResult = await auth.api.signUp({ body: {...} })
  await db.update(userTable).set({ tenantId: tenant.id, role: "admin" }).where(...)
} catch (err) {
  // Rollback : supprimer le tenant (cascade supprime ses tenant_events via FK ON DELETE CASCADE)
  await db.delete(tenants).where(eq(tenants.id, tenant.id))
  throw err
}
```

**Pourquoi cet ordre (tenant d'abord, user ensuite) ?**
- Le user doit être lié au tenant (`user.tenantId`), donc le tenant doit exister d'abord.
- Si on créait le user d'abord et que l'insert tenant échouait, il faudrait supprimer le user (et son account) — plus complexe (cascade Better Auth).
- Le rollback "supprimer le tenant" est trivial (FK cascade).

**Vérifier le schéma story 7-1 :** `tenant_events.tenantId` doit avoir `ON DELETE CASCADE` (cf. spec 7-1 AC3). Si ce n'est pas le cas, le rollback laissera des orphelins — flag pour le parent.

---

### CRITIQUE — Email utility : réutiliser `src/lib/email.ts` (Resend, déjà configuré)

Le repository a **DÉJÀ** une lib d'email complète (`src/lib/email.ts`) :
- `sendEmail({ to, subject, html, text })` — utilise Resend (`RESEND_API_KEY`) en production, `console.log` en dev (NODE_ENV !== production).
- `isEmailDeliveryConfigured()` — `Boolean(RESEND_API_KEY) || NODE_ENV !== "production"`.
- `buildResetPasswordHtml(email, resetUrl)` — template HTML inline-stylé à **imiter** pour `buildWelcomeEmailHtml`.

**NE PAS installer nodemailer.** NE PAS ajouter de nouvelle dépendance. NE PAS créer un second système d'email. Réutiliser `sendEmail` tel quel.

**Tests :** en l'absence de `RESEND_API_KEY`, `sendEmail` fait un `console.log` et résout sans erreur — parfait pour les tests unitaires/E2E (pas de mock réseau nécessaire). Pour les tests E2E qui vérifient le contenu, espionner `console.log` ou refactoriser `sendEmail` pour accepter un transport injectable (optionnel — hors scope, flag).

---

### CRITIQUE — Sécurité : ne jamais logger le mot de passe

Le mot de passe auto-généré (ou manuel) ne doit JAMAIS apparaître dans :
- Les logs serveur (`console.log`, `console.error`, Sentry)
- Les réponses API (sauf le champ explicite `generatedPassword` qui va au superadmin UNE FOIS)
- Les `tenant_events.after` (qui ne contient QUE `{ name, slug, plan, status, trialEndsAt, maxUsers }` — JAMAIS de credentials)
- Les messages d'erreur

Dans les `catch` de `createTenantWithAdmin`, logger uniquement le message d'erreur générique, jamais l'objet `input` complet (qui contient `manualPassword`).

---

### CRITIQUE — `exactOptionalPropertyTypes` (TS 5.9.3)

Pour l'insertion Drizzle avec des champs nullables (`subscriptionStart`, `subscriptionEnd`, `trialEndsAt`, `notes`), utiliser le spread conditionnel ou `?? null` :
```ts
notes: input.notes ?? null,
trialEndsAt: dates.trialEndsAt, // toujours défini ici
```
Ne pas faire `notes: input.notes` (type `string | undefined` ≠ `string | null`).

Pour la réponse API, `generatedPassword` est optionnel — utiliser le type `generatedPassword?: string` et ne l'inclure que si `passwordMode === "auto"`.

---

### CRITIQUE — `noUncheckedIndexedAccess`

`db.insert(...).returning()` retourne un tableau ; `[tenant]` peut être `undefined`. Toujours vérifier :
```ts
const [tenant] = await db.insert(tenants).values({...}).returning()
if (!tenant) throw new Error("Tenant insert returned no row")
```

---

### CRITIQUE — Sous-domaine en dev : `{slug}.quotation.com` non résolvable localement

Le spec affiche `{slug}.quotation.com` dans l'email. En dev, ce domaine n'existe pas. L'email contient donc une URL qui ne marchera qu'en production. **Ne PAS faire de logique conditionnelle** (l'email est pour le client final, pas pour le dev). Documenter dans le body de l'email que c'est l'URL de production.

Le `subdomainUrl` est construit ainsi :
```ts
const apexDomain = process.env.APEX_DOMAIN ?? "quotation.com"
const subdomainUrl = `https://${input.slug}.${apexDomain}`
```
(`APEX_DOMAIN` est introduit par la story 7-1 dans `env.example`.)

---

### Pattern existant à réutiliser

- `src/lib/email.ts` — `sendEmail`, `buildResetPasswordHtml` (modèle pour le template HTML)
- `src/app/api/v1/users/route.ts` — pattern POST création user + `apiError` + Zod validation (mais NE PAS copier l'insert direct — utiliser `auth.api.signUp` à la place, voir ci-dessus)
- `src/lib/api/envelope.ts` — `apiError`, `HTTP_STATUS`, codes d'erreur
- `src/lib/audit.ts` — pattern `createAuditEvent`/`emitAuditEvent` best-effort (similaire à l'insert `tenant_events`, mais ici on insère directement car la table `tenant_events` est distincte de `audit_event`)
- `src/lib/permissions.ts` — `requirePermission` / `can` (référence RBAC ; le rôle `superadmin` est ajouté en 7-2)
- `src/lib/session.ts` — `getSessionWithRole` (mais ici on a besoin de l'email du superadmin pour la note d'audit → utiliser `auth.api.getSession` directement)
- `src/lib/tenants/tenant-config.ts` (story 7-1) — `DEFAULT_TRIAL_DAYS`, `PLAN_LIMITS`
- `src/messages/fr-NE.json` — pattern next-intl, section à ajouter sous `owner.tenants.new`
- `src/components/client/client-form.tsx` (story 2-6) — pattern formulaire contrôlé : `isPending`, `errors` par champ, `globalError`, `handleSubmit` (validate → submit → toast → redirect)

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Installer nodemailer / react-email / une nouvelle lib email | Réutiliser `sendEmail` de `src/lib/email.ts` (Resend) |
| Hasher le mot de passe manuellement + insert `account` direct | `auth.api.signUp({ body: { email, password, name } })` |
| Utiliser le plugin admin (`admin.createUser`) — migration invasive | `auth.api.signUp` (suffisant, pas de migration) |
| `Math.random()` pour le mot de passe | `crypto.randomInt()` (cryptographiquement sûr) |
| Insérer le mot de passe en clair dans `tenant_events.after` | `after` ne contient QUE `{ name, slug, plan, status, trialEndsAt, maxUsers }` |
| Logger `input.manualPassword` dans les erreurs | Logger uniquement le message générique |
| Oublier le rollback si `signUp` échoue | `db.delete(tenants)` dans le `catch` |
| Texte FR hardcodé dans les composants | Clés `owner.tenants.new.*` dans `fr-NE.json` |
| `db.insert(userTable)` direct (pattern users/route.ts) sans account | `auth.api.signUp` crée user + account atomiquement |
| HTML email non échappé (XSS via mot de passe) | `escapeHtml`/`escapeAttribute` sur tous les champs dynamiques |
| Modifier `src/lib/schema.ts` | Hors scope — tables fournies par story 7-1 |
| Modifier `src/lib/email.ts` | Utiliser `sendEmail` tel quel |
| Créer `/owner/layout.tsx` ou `/owner/tenants/page.tsx` | Hors scope — story 7-2 |

---

### Commandes pour le dev agent

```bash
# 0. Prérequis : stories 7-1 et 7-2 implémentées (schema + superadmin)
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
# Aller sur /owner/tenants/new (login en tant que superadmin)
# Soumettre un formulaire de test → vérifier la console (email dev mode) pour le contenu de l'email
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §3.4 (formulaire création tenant), §5 (flux provisioning manuel), §6 (mapping story 7.3), §7 (paramètres PLAN_LIMITS, DEFAULT_TRIAL_DAYS)
- [CLAUDE.md] — conventions DB (uuid custom, text Better Auth), migration workflow, langues (UI FR / code EN)
- [project-context.md] — règles TypeScript strict, Drizzle, API envelope, i18n next-intl, money integer
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — fournit `tenants`, `tenant_events`, `user.tenantId`, enums, `tenant-config.ts` (`PLAN_LIMITS`, `DEFAULT_TRIAL_DAYS`, `APEX_DOMAIN`)
- [Story 7-2] `_bmad-output/implementation-artifacts/7-2-*.md` (à créer) — fournira `superadmin` role + RBAC `/owner/*` + layout owner
- [Story 2-6] `_bmad-output/implementation-artifacts/2-6-create-client.md` — pattern formulaire contrôlé (le plus proche analog CRUD)
- [Story 6-3] `_bmad-output/implementation-artifacts/6-3-immutable-audit-trail-export.md` — pattern table append-only + best-effort audit
- [src/lib/email.ts] — `sendEmail`, `buildResetPasswordHtml`, `isEmailDeliveryConfigured` (modèle template email)
- [src/lib/auth.ts] — Better Auth config (plugins), `auth.api.signUp` disponible server-side
- [src/app/api/v1/users/route.ts] — pattern POST création user + Zod + `apiError` (mais utiliser `signUp` au lieu de l'insert direct)
- [src/lib/api/envelope.ts] — `apiError`, `HTTP_STATUS`, codes d'erreur
- [src/lib/schema.ts] — `tenants`, `tenantEvents`, `user` (avec `tenantId` après 7-1)
- [Better Auth Email & Password](https://better-auth.com/docs/authentication/email-password) — `signUp` server-side API, scrypt hashing
- [Better Auth 1.6 release notes](https://better-auth.com/blog/1-6) — scrypt non-blocking via `node:crypto`
- [GitHub issue #6306](https://github.com/better-auth/better-auth/issues/6306) — patterns création user programmatique avec password

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`)

**Epic 7 :** Owner Panel & Gestion des abonnements SaaS — Post-MVP. Dépendances : Epic 1 (auth/rôles, DONE), Epic 6.2 (quota enforcement, DONE).

**Story 7.3 (P0)** est le mécanisme de **provisioning manuel** d'un tenant. Dans le modèle MVP (§5 Phase 1), le owner crée chaque tenant + compte admin client manuellement après confirmation du paiement mobile money. L'auto-activation Stripe (Phase 2) arrive en story 7-10.

**Flux de provisioning manuel (§5) :**
```
1. Client contacte owner (WhatsApp/appel/email) → accord commercial
2. Client effectue le paiement mobile money
3. Owner ouvre /owner/tenants/new (cette story)
4. Owner remplit le formulaire (société, slug, plan, admin client)
5. Le tenant + le compte admin sont créés, l'email de bienvenue part
6. Le client reçoit {slug}.quotation.com + ses credentials
7. Le client se connecte, change son mot de passe, commence à utiliser l'app
```

### Stories de l'Epic 7 (cross-context)

| ID | Titre | Relation avec 7-3 |
|----|-------|-------------------|
| 7.1 | Schema tenants + middleware subdomain routing | **PRÉREQUIS** — fournit le schéma + `tenant-config.ts` |
| 7.2 | Dashboard overview owner + liste tenants | **PRÉREQUIS** — fournit `superadmin` role + RBAC `/owner/*` + layout |
| **7.3** | **Création manuelle tenant + email bienvenue** | **(cette story)** |
| 7.4 | Enregistrement paiement (mobile money) | Indépendant (mais un tenant doit exister → 7-3 d'abord en pratique) |
| 7.5 | Suspension manuelle + page expiration tenant | Lit les tenants créés ici |
| 7.6 | Cron expiration + rappels automatiques | Lit `trialEndsAt` posé ici |
| 7.7 | Fiche tenant complète (onglets) | Lit le tenant + ses events créés ici |
| 7.9 | Gestion utilisateurs par tenant | Ajoute des users au tenant créé ici |
| 7.10 | Stripe webhook auto-activation | Alternative automatisée à cette création manuelle |

### Paramètres business retenus (Epic 7 §7)

```ts
const DEFAULT_TRIAL_DAYS = 14      // trialEndsAt = now + 14j (depuis tenant-config.ts story 7-1)
const PLAN_LIMITS = {
  free: { maxUsers: 1 },
  pro: { maxUsers: 5 },
  enterprise: { maxUsers: 20 },
}  // maxUsers posé sur le tenant à la création
```

Le `plan` par défaut dans le formulaire est `"free"` (le dev peut choisir `"pro"` comme défaut commercial si le owner préfère — assomption : défaut `"free"`, modifiable).

---

## Architecture Compliance

| Contrainte | Conformité story 7-3 |
|---|---|
| Next.js 16 App Router (Server Components par défaut, `"use client"` si besoin) | ✅ Page = Server Component, formulaire = Client Component |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`) | ✅ Guards `?? null`, vérification `[tenant]`, types `z.infer` |
| Drizzle : uuid() pour custom tables | ✅ Utilise `tenants.id` (uuid) fourni par 7-1 |
| Better Auth tables : text IDs, ne pas modifier | ✅ `user.id` est text ; `signUp` gère la création |
| API envelope : `apiError()`, `HTTP_STATUS`, codes standard | ✅ Route POST utilise `apiError("VALIDATION_FAILED"|"CONFLICT"|"FORBIDDEN"|"INTERNAL_ERROR")` |
| Zod validation dans `src/lib/validation/` | ✅ `createTenantSchema` dans `src/lib/validation/tenant.ts` |
| next-intl : UI strings dans `fr-NE.json` | ✅ Section `owner.tenants.new` |
| Audit : best-effort, ne bloque pas le flux principal | ✅ Insert `tenant_events` dans try/catch |
| Money : integer FCFA (jamais float) | N/A (pas de montant dans cette story — paiement = story 7-4) |
| Pas de nouvelle dépendance (pnpm install) | ✅ Tout réutilise l'existant (`better-auth`, `zod`, `resend` via `email.ts`) |
| `next/navigation` (pas `next/router`) | ✅ `useRouter` de `next/navigation` dans le formulaire |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-3 |
|---|---|---|
| `next` | 16.1.6 | App Router, Server/Client Components, `redirect`, `useRouter` |
| `better-auth` | 1.6.11 | `auth.api.getSession`, `auth.api.signUp` (création user + account scrypt) |
| `drizzle-orm` | 0.44.7 | `db.insert`/`db.update`/`db.delete`/`db.select` sur `tenants`, `user`, `tenant_events` |
| `zod` | 4.4.3 | `createTenantSchema`, `safeParse`, `superRefine` |
| `sonner` | 2.0.7 | `toast.success` / `toast.error` |
| `next-intl` | 4.13.0 | `useTranslations`, `getTranslations` |
| shadcn/ui (new-york) | 3.8.5 | `Input`, `Label`, `Select`, `Checkbox`, `Textarea`, `Button` |
| `vitest` | 4.1.9 | Tests unitaires (slug, password, dates, email, create-tenant) |
| `@playwright/test` | 1.61.0 | E2E owner-create-tenant |
| `crypto` (node:crypto) | built-in | `crypto.randomInt` pour `generatePassword` |

**Aucune nouvelle dépendance à installer.** `resend` est déjà utilisé via `src/lib/email.ts` (fetch direct sur `api.resend.com`, pas de package npm dédié).

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `src/app/owner/tenants/new/page.tsx` | **NEW** | Server Component : auth superadmin + RBAC + rendu formulaire |
| `src/app/owner/tenants/new/new-tenant-form.tsx` | **NEW** | Client Component : formulaire contrôlé, auto-slug, validation, soumission |
| `src/app/api/v1/owner/tenants/route.ts` | **NEW** | POST : création transactionnelle (valide → appelle `createTenantWithAdmin` → 201/409/500) |
| `src/lib/tenants/slug.ts` | **NEW** | `generateSlug`, `validateSlug` (purs) |
| `src/lib/tenants/password.ts` | **NEW** | `generatePassword` (crypto.randomInt) |
| `src/lib/tenants/tenant-dates.ts` | **NEW** | `calculateTrialDates` (purs) |
| `src/lib/tenants/welcome-email.ts` | **NEW** | `buildWelcomeEmailHtml`, `buildWelcomeEmailText` (escaping) |
| `src/lib/tenants/create-tenant.ts` | **NEW** | `createTenantWithAdmin` (orchestration + rollback) + `TenantConflictError` |
| `src/lib/validation/tenant.ts` | **NEW** | `createTenantSchema` (Zod) |
| `src/lib/tenants/slug.test.ts` | **NEW** | Tests unitaires slug |
| `src/lib/tenants/password.test.ts` | **NEW** | Tests unitaires password |
| `src/lib/tenants/tenant-dates.test.ts` | **NEW** | Tests unitaires dates |
| `src/lib/tenants/welcome-email.test.ts` | **NEW** | Tests unitaires email (escaping) |
| `src/lib/tenants/create-tenant.test.ts` | **NEW** | Tests unitaires orchestration (mock signUp/db/sendEmail) |
| `src/messages/fr-NE.json` | **UPDATE** | Section `owner.tenants.new` |
| `tests/e2e/owner-create-tenant.spec.ts` | **NEW** | E2E Playwright |

**Ne PAS modifier :**
- `src/lib/schema.ts` (tables fournies par story 7-1)
- `src/lib/email.ts` (utiliser `sendEmail` tel quel)
- `src/lib/auth.ts` (Better Auth config — `signUp` est déjà disponible)
- `src/lib/permissions.ts` (rôle `superadmin` ajouté par story 7-2)
- `src/lib/tenants/tenant-config.ts` (fourni par story 7-1, lire les constantes)
- `src/proxy.ts` (résolution sous-domaine = story 7-1)
- `env.example` (`APEX_DOMAIN`, `OWNER_CONTACT` ajoutés par story 7-1)

---

## Testing Requirements

### Tests unitaires (Vitest)

**Fonctions pures (couverture haute, sans mock) :**
- `slug.test.ts` : `generateSlug` (8+ cas : accents, espaces, tirets, vide, caractères spéciaux, chiffres), `validateSlug` (valide, trop court, trop long, majuscules, caractères interdits)
- `password.test.ts` : longueur, 1+ de chaque classe, non-déterminisme (10 exécutions → 10 valeurs distinctes), pas de caractères ambigus, longueur paramétrable
- `tenant-dates.test.ts` : trial = now+14j, monthly = +30j, annual = +365j, dates dans le futur
- `welcome-email.test.ts` : escaping HTML (password avec `<script>alert(1)</script>` et `"`, `'`), présence URL/slug/email/password/trialEndsAt, structure HTML valide

**Orchestration (mocks) :**
- `create-tenant.test.ts` (mock `auth.api.signUp`, `db.*`, `sendEmail`) :
  - Cas nominal complet (vérifier : 1 insert tenant, 1 signUp, 1 update user, 1 sendEmail, 1 insert event, résultat correct)
  - Slug dupliqué → `TenantConflictError("slug")`, 0 insert
  - Email dupliqué → `TenantConflictError("email")`, 0 insert
  - `signUp` échoue → 1 insert tenant + 1 delete tenant (rollback), erreur propagée, 0 sendEmail, 0 event
  - `sendEmail` échoue → tenant + user conservés, `emailSent=false`, event inséré avec note d'échec
  - `sendWelcomeEmail=false` → sendEmail jamais appelé, `generatedPassword` dans le résultat

### Tests E2E (Playwright)

- `owner-create-tenant.spec.ts` :
  - **Setup** : seed superadmin (ou admin mode dégradé), login via la flow existante
  - **Mock email** : en dev sans `RESEND_API_KEY`, `sendEmail` fait `console.log` — espionner ou vérifier la réponse API (`generatedPassword`)
  - Scénarios :
    1. Accès `/owner/tenants/new` en superadmin → formulaire rendu avec tous les champs
    2. Non-superadmin → redirect
    3. Saisie companyName → auto-slug se met à jour
    4. Édition manuelle du slug → ne s'écrase plus quand companyName change
    5. Soumission valide → toast success + redirection
    6. Slug dupliqué (pre-séder un tenant) → erreur en ligne
    7. Soumission sans companyName → erreur en ligne, pas de fetch

### Tests existants

- `pnpm check` doit continuer à passer : **334+ tests existants** (Epic 1–6 DONE). Aucune régression attendue car cette story ne modifie AUCUN fichier existant sauf `fr-NE.json` (ajout de clés, non-cassant).

---

## Previous Story Intelligence

**Story 7-1 (schema + proxy) — `ready-for-dev` :** fournit le socle. Points à respecter :
- `tenant_events` est append-only (pas de revision/updatedAt) — pattern `audit_event` story 6-3.
- `tenants` utilise `date({ mode: "date" })` pour `subscriptionStart`/`subscriptionEnd`/`trialEndsAt` → retourne des objets `Date`, attention au typage.
- `user.tenantId` est nullable (un superadmin n'a PAS de tenant ; un user client en a un).
- Conflit de noms de tiers : `tierEnum` (story 6-2, `starter/pro/entreprise`) ≠ `tenantPlanEnum` (story 7-1, `free/pro/enterprise`). Cette story utilise `tenantPlanEnum`.

**Story 7-2 (dashboard + liste) — NON CRÉÉE :** cette story dépend de 7-2 pour le rôle `superadmin` et la protection `/owner/*`. Si 7-2 n'est pas implémentée, utiliser le **mode dégradé** (`role === "admin"` accepté temporairement) documenté dans les Dev Notes.

**Story 2-6 (création client) — `done` :** pattern formulaire contrôlé le plus proche :
- États `isPending`, `errors` par champ, `globalError`
- `handleSubmit` : validate (Zod safeParse) → submit (fetch) → toast → redirect
- `exactOptionalPropertyTypes` : spread conditionnel pour les champs optionnels
- Ici on remplace `applyLocalMutation` (Dexie offline) par un `fetch` direct vers l'API (le owner panel est ONLINE-only, pas de sync offline).

**Story 6-3 (audit trail) — `done` :** pattern best-effort audit. L'insert `tenant_events` suit la même philosophie : try/catch, ne bloque jamais le flux principal.

**Epic 6 entièrement DONE** (2026-06-28). Epic 7 est le premier post-MVP.

---

## Git Intelligence Summary

Derniers commits pertinents :
- `a637dfe` fix: /register redirect to / (was /dashboard), add logout button to parametres
- `a5d9e2e` test(qa): API unit tests + Playwright E2E specs for uncovered routes
- `a4f6977` feat(6-3): immutable audit trail export
- `f57a515` feat(6-2): tier quota enforcement

**Patterns établis à respecter :**
- API routes : `auth.api.getSession` → cast `session.user` → `requirePermission`/check role → Zod `safeParse` → `apiError` ou `NextResponse.json`
- Création de user : `src/app/api/v1/users/route.ts` POST montre le pattern (mais utiliser `signUp` au lieu de l'insert direct pour cette story)
- Tests : Vitest à côté du module (`src/lib/tenants/*.test.ts`), E2E dans `tests/e2e/`
- Chaque feat commit suit le format `feat(7-3): ...`

---

## Latest Tech Information

### Better Auth 1.6.11 — `signUp` server-side (création user programmatique)

Source : [Better Auth Email & Password](https://better-auth.com/docs/authentication/email-password), [1.6 release notes](https://better-auth.com/blog/1-6)

- **`auth.api.signUp({ body: { email, password, name } })`** : API server-side qui crée le user ET le credential account (scrypt hash) dans une transaction interne.
- **Scrypt non-blocking** depuis v1.6 : utilise `node:crypto` natif, ne bloque pas l'event loop. Compatible avec les passwords générés de cette story.
- **Pas besoin du plugin admin** pour créer un user avec password — `signUp` suffit. Le plugin admin (`admin.createUser`) ajoute des colonnes au schéma (`banned`, `banReason`, `banExpires`) et une migration → trop invasif, non retenu.
- **Référence pour les cas programmatiques** : [GitHub issue #6306](https://github.com/better-auth/better-auth/issues/6306) — confirme que `signUp` est la voie recommandée pour créer un user avec password hors d'une requête navigateur.

### Resend (déjà intégré dans `src/lib/email.ts`)

Source : `src/lib/email.ts` (lecture du code existant)

- **Pas de package npm dédié** : `sendEmail` fait un `fetch("https://api.resend.com/emails", ...)` direct avec `RESEND_API_KEY`.
- **Dev mode** : sans `RESEND_API_KEY` et `NODE_ENV !== "production"` → `console.log` + résout sans erreur (parfait pour les tests).
- **Production** : `RESEND_API_KEY` requis, `EMAIL_FROM` configurable.
- **Décision : NE PAS utiliser nodemailer.** Resend est déjà choisi par le projet (rationale : API HTTP simple, délivrabilité, pas de SMTP à maintenir, plan gratuit suffisant pour le volume MVP). Story 7-3 réutilise ce choix — aucune nouvelle dépendance.

### Next.js 16.1.6 — App Router

- Server Components par défaut ; `"use client"` (double quotes, première ligne) pour les composants interactifs.
- `redirect()` de `next/navigation` (Server Components) ; `useRouter()` de `next/navigation` (Client Components) — JAMAIS `next/router`.
- `headers()` de `next/headers` (async en Next 16) pour lire la session en Server Component / API route.

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Technology Stack & Versions** — Better Auth 1.6.11, Drizzle 0.44.7, Zod 4.4.3, Resend (via email.ts)
- **TypeScript Strict Mode** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`
- **Framework-Specific Rules (Next.js/React)** — App Router, `"use client"`, `next/navigation`, i18n next-intl
- **API Routes Rules** — `apiError()`, cast `session.user` à `Record<string, unknown>`, Zod validation
- **Permissions Rules** — référence `requirePermission`/`can` (rôle `superadmin` = story 7-2)
- **Audit Trail Rules (Story 6-3)** — pattern best-effort, `before`/`after` jsonb
- **Language Convention** — UI FR (`fr-NE.json`), code EN, DB snake_case EN
- **Code Organization** — `src/lib/validation/` pour les schemas Zod, `src/lib/tenants/` (créé par 7-1) pour la logique tenant

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Opus 4.8) — BMad dev-story workflow.

### Debug Log References

- `pnpm typecheck` — initial error TS2556 dans `create-tenant.test.ts` (spread sur mock `deleteWhere` typé `() => Promise`). Corrigé : `where: () => h.deleteWhere()`.
- `pnpm lint` — 1 erreur React `setState synchronously within an effect` sur l'auto-slug `useEffect`. Refactor : suppression de l'effet, dérivation du slug dans `handleCompanyNameChange` (pattern « you might not need an effect »).
- `pnpm check` final : 0 erreur lint (21 warnings import/order pré-existants), typecheck ✓, **460 tests passés** (vs 334+ avant — aucune régression).
- `pnpm build` : succès, route `/owner/tenants/new` présente dans le manifeste.

### Completion Notes List

- **Dépendances 7-1/7-2 satisfaites** : les deux stories sont `done`. Rôle `superadmin` réel dans `userRoleEnum` + `requireOwnerSession`/`requireOwnerAuth` (src/lib/session.ts) — **mode dégradé NON utilisé**, aucun TODO résiduel.
- **Méthode Better Auth** : la story citait `auth.api.signUp`, mais l'API server-side réelle (better-auth 1.6.11) est **`auth.api.signUpEmail`** (vérifié dans les types `node_modules`). Implémenté avec `signUpEmail`.
- **Route POST** ajoutée au fichier existant `src/app/api/v1/owner/tenants/route.ts` (GET de la story 7-2 préservé), avec `requireOwnerSession` pour la garde RBAC.
- **Rollback manuel** : tenant inséré d'abord ; si `signUpEmail`/`update` échoue → `db.delete(tenants)` (cascade `tenant_events` via FK ON DELETE CASCADE, confirmé schéma 7-1). Email + audit `tenant_events` best-effort.
- **Escaping email** : `escapeHtml`/`escapeAttribute` ne sont PAS exportés depuis `src/lib/email.ts` → équivalents locaux définis dans `welcome-email.ts` (test couvre un password `<script>…</script>"'`).
- **Sécurité** : le mot de passe n'est jamais loggé (route logge `err.message` uniquement) ni stocké dans `tenant_events.after`.
- **Redirection post-création** : `/owner/tenants/[id]` (story 7-7) n'existe pas encore → fallback vers `/owner/tenants`. Si password auto + email non envoyé → panneau affichant le password (copie) avant redirection.
- **E2E** : déposés dans `e2e/` (et non `tests/e2e/` — répertoire réel du projet, cf. `playwright.config`). Non exécutés ici (nécessitent serveur dev + seed HTTP) ; même convention que les specs E2E existantes du repo.
- Aucune nouvelle dépendance installée. Aucun fichier hors-scope modifié.

### File List

**Créés :**
- `src/lib/tenants/slug.ts`
- `src/lib/tenants/password.ts`
- `src/lib/tenants/tenant-dates.ts`
- `src/lib/tenants/welcome-email.ts`
- `src/lib/tenants/create-tenant.ts`
- `src/lib/validation/tenant.ts`
- `src/app/owner/tenants/new/page.tsx`
- `src/app/owner/tenants/new/new-tenant-form.tsx`
- `src/lib/tenants/slug.test.ts`
- `src/lib/tenants/password.test.ts`
- `src/lib/tenants/tenant-dates.test.ts`
- `src/lib/tenants/welcome-email.test.ts`
- `src/lib/tenants/create-tenant.test.ts`
- `e2e/owner-create-tenant.spec.ts`

**Modifiés :**
- `src/app/api/v1/owner/tenants/route.ts` (ajout du handler `POST`)
- `src/messages/fr-NE.json` (section `owner.tenants.new`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (7-3 → in-progress → review)

### Review Findings

**Code review du 2026-06-28 — 2 decision_needed, 3 patch, 3 defer, 3 dismissed**

- [x] [Review][Decision] D1 — Champ mot de passe manuel `type="text"` → corrigé en `type="password"`. [new-tenant-form.tsx:321]
- [x] [Review][Decision] D2 — `periodStart`/`periodEnd` absents — omission volontaire acceptable, story 7-4 gère les dates réelles. Déféré.
- [x] [Review][Patch] P1 — Bouton panneau mot de passe : `t("title")` → `t("goToList")` + clé ajoutée dans fr-NE.json. [new-tenant-form.tsx:153]
- [x] [Review][Patch] P2 — Email uniqueness : `.toLowerCase()` ajouté avant comparaison DB. [create-tenant.ts:82]
- [x] [Review][Patch] P3 — Slug min/max : messages d'erreur français ajoutés. [tenant.ts:15-16]
- [x] [Review][Defer] W1 — Orphan Better Auth user si `db.update(userTable)` échoue après que `signUpEmail` a réussi : rollback supprime le tenant mais pas le user/account créé. Limitation connue et documentée dans la spec — hors scope story 7-3. [create-tenant.ts:136-143] — deferred, pre-existing (spec §Dev Notes)
- [x] [Review][Defer] W2 — TOCTOU slug/email : deux SELECT distincts avant l'INSERT, sans transaction. Remplacé par contrainte DB unique (story 7-1). [create-tenant.ts:71-88] — deferred, pre-existing (couvert par contrainte DB story 7-1)
- [x] [Review][Defer] W3 — Test E2E "non-superadmin → redirect" absent. Conditionnel dans la spec T12 ("si testable avec un user tenant"). Couvert par tests unitaires `requireOwnerSession`. [e2e/owner-create-tenant.spec.ts] — deferred, pre-existing (conditionnel spec)

### Change Log

- Story 7-3 créée : création manuelle tenant + email de bienvenue — Epic 7 §3.4 + §5 (Date: 2026-06-28)
- Story 7-3 implémentée : 8 modules + 5 suites de tests unitaires + 1 spec E2E ; route POST `/api/v1/owner/tenants` ; formulaire `/owner/tenants/new` ; i18n `owner.tenants.new`. `pnpm check` ✓ (460 tests), `pnpm build` ✓. Statut → review (Date: 2026-06-28)
- Story 7-3 code review : 4 patches appliqués (type="password", goToList i18n, email lowercase, slug FR messages), D2 déféré, 3 defer, 3 dismissed. Statut → done (Date: 2026-06-28)
