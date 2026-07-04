---
story_key: 7-12-platform-settings
epic_num: 7
story_num: 12
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la crÃ©ation
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (schema tenants + enums tenantPlanEnum + tenant-config.ts PLAN_LIMITS/PLAN_PRICES_XOF/DEFAULT_GRACE_PERIOD_DAYS/DEFAULT_TRIAL_DAYS + APEX_DOMAIN) â€” HARD (source des constantes Ã  externaliser)"
  - "7-2-owner-dashboard-tenant-list (rÃ´le superadmin + userRoleEnum += superadmin + requireOwnerAuth()/requireOwnerSession() + layout src/app/owner/layout.tsx + permissions Action owner.*) â€” HARD (le formulaire /owner/settings est superadmin-only)"
  - "7-5-manual-suspension-expiry-page (helper buildOwnerContact() + page /subscription-expired lisant OWNER_WHATSAPP/OWNER_EMAIL) â€” HARD (7-12 externalise ces valeurs en DB ; 7-5 est mis Ã  jour pour lire depuis platform_settings)"
  - "7-6-expiry-cron-automated-reminders (import DEFAULT_GRACE_PERIOD_DAYS depuis tenant-config.ts, TODO(story-7-12) commentÃ© dans expiry-job.ts) â€” HARD (7-12 refactor expiry-job pour lire grace depuis platform_settings)"
  - "7-9-tenant-user-management (PLAN_LIMITS pour maxUsers au moment de la crÃ©ation tenant cÃ´tÃ© 7-3 ; runtime lit tenant.maxUsers DB) â€” SOFT (7-12 externalise PLAN_LIMITS ; 7-9 lui-mÃªme lit dÃ©ja DB, pas de refactor majeur)"
  - "6-2-tier-quota-enforcement (tierEnum starter/pro/entreprise + companySubscription + TIER_QUOTAS dans src/lib/quota/quota-config.ts) â€” SOFT (dÃ©cision d'unification tierEnum â†” tenantPlanEnum â€” voir Dev Notes et section dÃ©diÃ©e)"
---

# Story 7.12 : ParamÃ¨tres plateforme (prix, quotas, grace period)

**Statut :** done

## Story

**En tant que** superadmin (owner Maiga Tech Lab),
**Je veux** configurer les paramÃ¨tres commerciaux et techniques de la plateforme (prix des plans, quotas d'utilisateurs, durÃ©e de trial, durÃ©e de grÃ¢ce, contacts affichÃ©s aux tenants suspendus, message de page d'expiration, activation des notifications),
**Afin que** ces valeurs ne soient plus codÃ©es en dur dans `tenant-config.ts` mais Ã©ditables en runtime sans redÃ©ploiement, avec application immÃ©diate aux nouvelles computations.

---

## CritÃ¨res d'acceptation (BDD)

**AC1 â€” ContrÃ´le d'accÃ¨s superadmin-only (route `/owner/settings`)**

```
GIVEN  un utilisateur authentifiÃ© avec role âˆˆ {admin, commercial, operateur} accÃ¨de Ã  /owner/settings
WHEN   la page (Server Component) se charge
THEN   requireOwnerAuth() (depuis src/lib/session.ts, story 7-2) lÃ¨ve PermissionError 403
AND    l'utilisateur est redirigÃ© vers / (ou une page 403) â€” JAMAIS accÃ¨s au formulaire
AND    aucun rendu partiel du formulaire n'est renvoyÃ© au client

GIVEN  un utilisateur authentifiÃ© avec role = "superadmin" accÃ¨de Ã  /owner/settings
WHEN   la page se charge
THEN   le layout src/app/owner/layout.tsx (story 7-2) s'affiche (sidebar owner)
AND    la page affiche 5 sous-sections : Plans & tarifs, Quotas, Cycle de vie, Contenu tenant, Notifications
AND    chaque sous-section prÃ©-remplit ses champs depuis la table platform_settings (ou les valeurs par dÃ©faut si la ligne singleton n'existe pas encore â€” AC9)
```

**AC2 â€” Sous-section Â« Plans & tarifs Â» (PLAN_PRICES_XOF, rÃ©fÃ©rence commerciale)**

```
GIVEN  la sous-section Plans & tarifs
WHEN   le superadmin consulte le formulaire
THEN   pour chaque plan âˆˆ {free, pro, enterprise} : deux champs monthly et annual (FCFA, entiers â‰¥ 0) prÃ©-remplis
AND    une note informative prÃ©cise : "RÃ©fÃ©rence commerciale. Les prix Stripe (price_id) sont gÃ©rÃ©s dans le dashboard Stripe â€” story 7-10. La modification ici n'affecte PAS les abonnements Stripe existants."
AND    les valeurs par dÃ©faut affichÃ©es (si platform_settings vide) sont :
       free: { monthly: 0, annual: 0 }
       pro: { monthly: 25000, annual: 250000 }
       enterprise: { monthly: 75000, annual: 750000 }

GIVEN  le superadmin saisit un prix nÃ©gatif ou dÃ©cimal (ex: -5000 ou 25000.5)
WHEN   il soumet le formulaire
THEN   la validation Zod rejette (z.coerce.number().int().nonnegative()) et affiche l'erreur inline franÃ§aise sous le champ : "Le prix doit Ãªtre un entier positif (FCFA)."
```

**AC3 â€” Sous-section Â« Quotas Â» (PLAN_LIMITS maxUsers)**

```
GIVEN  la sous-section Quotas
WHEN   le superadmin consulte le formulaire
THEN   pour chaque plan âˆˆ {free, pro, enterprise} : un champ maxUsers (entier â‰¥ 1) prÃ©-rempli
AND    les valeurs par dÃ©faut (si platform_settings vide) sont :
       free: 1, pro: 5, enterprise: 20

GIVEN  le superadmin saisit maxUsers = 0 ou nÃ©gatif pour un plan
WHEN   il soumet le formulaire
THEN   la validation Zod rejette (z.coerce.number().int().min(1)) et affiche "Le nombre d'utilisateurs doit Ãªtre â‰¥ 1."
```

**AC4 â€” Sous-section Â« Cycle de vie Â» (DEFAULT_TRIAL_DAYS, DEFAULT_GRACE_PERIOD_DAYS)**

```
GIVEN  la sous-section Cycle de vie
WHEN   le superadmin consulte le formulaire
THEN   deux champs : trialDays (1â€“60) et gracePeriodDays (0â€“30), prÃ©-remplis
AND    les valeurs par dÃ©faut sont trialDays = 14, gracePeriodDays = 7
AND    une note prÃ©cise : "La durÃ©e de grÃ¢ce s'applique aux NOUVELLES suspensions calculÃ©es par le cron (story 7-6). Les tenants dÃ©jÃ  en grÃ¢ce conservent leur gracePeriodEndsAt existant."

GIVEN  le superadmin saisit trialDays = 0 ou > 60
WHEN   il soumet le formulaire
THEN   validation Zod rejette (z.coerce.number().int().min(1).max(60)) â†’ "La durÃ©e d'essai doit Ãªtre entre 1 et 60 jours."

GIVEN  le superadmin saisit gracePeriodDays = 31
WHEN   il soumet le formulaire
THEN   validation Zod rejette (z.coerce.number().int().min(0).max(30)) â†’ "La durÃ©e de grÃ¢ce doit Ãªtre entre 0 et 30 jours."
```

**AC5 â€” Sous-section Â« Contenu tenant Â» (contact suspendu + message personnalisÃ©)**

```
GIVEN  la sous-section Contenu tenant
WHEN   le superadmin consulte le formulaire
THEN   3 champs : suspendedContactEmail (email valide), suspendedContactWhatsapp (texte libre, ex: "+227 90 00 00 00"), expiryMessage (textarea, message personnalisÃ© affichÃ© sur /subscription-expired)
AND    les valeurs par dÃ©faut (si platform_settings vide) sont :
       suspendedContactEmail = OWNER_EMAIL ?? EMAIL_FROM ?? "contact@maigatechlab.com"
       suspendedContactWhatsapp = OWNER_WHATSAPP ?? ""
       expiryMessage = "" (chaÃ®ne vide = utiliser le message i18n par dÃ©faut de story 7-5)

GIVEN  le superadmin saisit un email mal formÃ© (ex: "not-an-email")
WHEN   il soumet le formulaire
THEN   validation Zod rejette (z.string().email()) â†’ "Adresse email invalide."
```

**AC6 â€” Sous-section Â« Notifications Â» (activation par type + adresse expÃ©diteur)**

```
GIVEN  la sous-section Notifications
WHEN   le superadmin consulte le formulaire
THEN   un champ senderAddress (email) prÃ©-rempli (dÃ©faut : EMAIL_FROM)
AND    7 toggles (checkbox) un par type de notification :
       - trial-welcome (email de bienvenue, story 7-3)
       - reminder-j7 (rappel J-7, story 7-6)
       - reminder-j3 (rappel J-3)
       - reminder-j1 (rappel J-1)
       - expiry-notification (notification expiration J0)
       - suspension-notification (suspension, story 7-5)
       - reactivation-notification (rÃ©activation, story 7-8)
AND    chaque toggle a une valeur boolÃ©enne (dÃ©faut : tous true)

GIVEN  le superadmin dÃ©sactive reminder-j7 (dÃ©coche la case)
WHEN   il enregistre
THEN   platform_settings.notifications.reminderJ7 = false
AND    au prochain cycle du cron (story 7-6), l'email J-7 n'est PAS envoyÃ© (la fonction de dispatch lit le toggle)
AND    les autres types restent actifs
```

**AC7 â€” Persistance : table `platform_settings` singleton (typed row, CHECK id=1)**

```
GIVEN  le schÃ©ma src/lib/schema.ts aprÃ¨s cette story
WHEN   le dev exÃ©cute pnpm db:generate
THEN   une nouvelle migration drizzle/0014_*.sql est crÃ©Ã©e contenant CREATE TABLE "platform_settings" (...)
AND    la table contient une contrainte CHECK (id = 1) (singleton â€” une seule ligne possible)
AND    la colonne id est integer PRIMARY KEY (PAS uuid â€” exception justifiÃ©e pour singleton, voir Dev Notes)
AND    toutes les colonnes typÃ©es (integer pour prix/durÃ©es, boolean pour toggles, text pour emails/message, jsonb pour le bloc notifications)

GIVEN  la table platform_settings n'a aucune ligne (premier accÃ¨s aprÃ¨s migration)
WHEN   getPlatformSettings() est appelÃ©
THEN   la fonction insÃ¨re automatiquement la ligne singleton id=1 avec les valeurs par dÃ©faut codÃ©es
AND    onConflictDoNothing() protÃ¨ge contre la concurrence (deux requÃªtes simultanÃ©es)
AND    la ligne insÃ©rÃ©e est retournÃ©e (pas de null)
```

**AC8 â€” Refactor : les consumers lisent dÃ©sormais depuis platform_settings (avec fallback constantes)**

```
GIVEN  les fichiers consumers suivants (story 7-1/7-5/7-6) importent des constantes depuis tenant-config.ts
WHEN   cette story est implÃ©mentÃ©e
THEN   src/lib/tenants/tenant-config.ts est UPDATE :
       - DEFAULT_TRIAL_DAYS, DEFAULT_GRACE_PERIOD_DAYS, PLAN_LIMITS, PLAN_PRICES_XOF restent exportÃ©s (fallback en code)
       - MAIS ajout de fonctions asynchrones : getTrialDays(), getGracePeriodDays(), getPlanLimits(), getPlanPrices(), getOwnerContact(), getNotificationToggle(type)
       - ces fonctions lisent platform_settings (getPlatformSettings()) et retournent la valeur DB si prÃ©sente, sinon la constante de fallback
AND    src/lib/tenants/expiry-job.ts (story 7-6) est UPDATE : remplacer addDays(now, DEFAULT_GRACE_PERIOD_DAYS) par await getGracePeriodDays() puis addDays(now, grace)
       - le TODO(story-7-12) commentÃ© est supprimÃ©
AND    src/lib/tenants/tenant-contact.ts (story 7-5) est UPDATE : buildOwnerContact() lit dÃ©sormais depuis platform_settings (getOwnerContact()) avec fallback env vars puis fallback hardcoded
AND    src/app/subscription-expired/page.tsx (story 7-5) est UPDATE : si platform_settings.expiryMessage non vide, l'afficher Ã  la place du message i18n par dÃ©faut
AND    src/app/api/v1/owner/tenants/route.ts (story 7-2/7-3 â€” crÃ©ation tenant) est UPDATE : lors de la crÃ©ation, lire await getTrialDays() et await getPlanLimits()[plan].maxUsers au lieu des constantes synchrones
AND    la fonction de dispatch des emails (rappel/suspension/rÃ©activation â€” stories 7-5/7-6/7-8) vÃ©rifie await getNotificationToggle(type) avant d'envoyer

GIVEN  un consumer appelÃ© AVANT que la ligne platform_settings existe
WHEN   getPlatformSettings() fait le bootstrap (AC7)
THEN   aucune erreur â€” le fallback transparent s'applique
```

**AC9 â€” Application immÃ©diate : nouvelles computations utilisent les nouvelles valeurs**

```
GIVEN  le superadmin change gracePeriodDays de 7 â†’ 10 et enregistre
WHEN   un nouveau tenant est suspendu par le cron (story 7-6) APRÃˆS la modification
THEN   son gracePeriodEndsAt = now + 10 jours (nouvelle valeur)
AND    un tenant dÃ©jÃ  en grÃ¢ce (gracePeriodEndsAt existant = now + 7j) n'est PAS recalculÃ© â€” il conserve sa date d'origine (pas de rÃ©troactivitÃ©)

GIVEN  le superadmin change maxUsers pro de 5 â†’ 8 et enregistre
WHEN   un nouveau tenant pro est crÃ©Ã© (story 7-3)
THEN   tenant.maxUsers = 8 (lue via await getPlanLimits())
AND    les tenants pro existants (dÃ©jÃ  crÃ©Ã©s avec maxUsers=5) ne sont PAS migrÃ©s automatiquement â€” l'owner peut Ã©diter individuellement via la fiche tenant (story 7-7)
```

**AC10 â€” DÃ©cision tierEnum unification (FLAG â€” voir section dÃ©diÃ©e)**

```
GIVEN  le codebase contient DEUX enums de plan/tier divergents :
       - tierEnum (story 6-2) : ["starter", "pro", "entreprise"]  â†’ utilisÃ© par companySubscription, src/lib/quota/quota-config.ts (TIER_QUOTAS)
       - tenantPlanEnum (story 7-1) : ["free", "pro", "enterprise"]  â†’ utilisÃ© par tenants
WHEN   le parent (Maiga Tech Lab) confirme la dÃ©cision recommandÃ©e (voir "DÃ©cision tierEnum unification" en Dev Notes)
THEN   l'implÃ©mentation de cette story documente la dÃ©cision retenue et applique l'option choisie
AND    en attendant confirmation, cette story NE MODIFIE PAS tierEnum/tenantPlanEnum (les valeurs DB existantes ne sont PAS migrÃ©es dans cette story)
AND    platform_settings stocke PLAN_LIMITS et PLAN_PRICES_XOF avec les clÃ©s {free, pro, enterprise} (alignÃ©es sur tenantPlanEnum, l'enum du multi-tenant SaaS Epic 7)
```

**AC11 â€” Audit & Ã©vÃ©nement (tenant_events N/A ; log via auditEvent owner-scope)**

```
GIVEN  le superadmin enregistre une modification de platform_settings
WHEN   upsertPlatformSettings() rÃ©ussit
THEN   un auditEvent est Ã©mis (best-effort, try/catch, ne bloque pas) :
       - what: "platform.settings.updated"
       - who: superadmin userId
       - where: "/owner/settings"
       - entityType: "platform_settings", entityId: "1"
       - before: ancien Ã©tat (snapshot avant upsert), after: nouvel Ã©tat
AND    companyId est null (le superadmin n'a pas de companyId â€” c'est un Ã©vÃ©nement plateforme)
AND    le log "ParamÃ¨tres plateforme mis Ã  jour" est Ã©mis
```

**AC12 â€” QualitÃ© & tests**

```
GIVEN  les fichiers modifiÃ©s/crÃ©Ã©s
WHEN   je lance pnpm check
THEN   lint âœ“ + typecheck âœ“ (strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess) + tous les tests existants passent (sans rÃ©gression sur stories 7-1 Ã  7-9)
AND    pnpm build passe sans erreur (db:migrate puis next build)
AND    les tests Vitest suivants passent :
       - tests unitaires sur getPlatformSettings (bootstrap singleton, onConflictDoNothing)
       - tests unitaires sur getTrialDays/getGracePeriodDays/getPlanLimits/getPlanPrices (fallback constants quand DB vide)
       - tests unitaires sur buildOwnerContact (fallback env â†’ hardcoded)
       - tests unitaires sur la validation Zod (prix nÃ©gatif, grace > 30, trial = 0, email invalide, maxUsers = 0)
AND    le test E2E Playwright (tests/e2e/owner-settings.spec.ts) passe :
       - admin/commercial/operateur â†’ 403 sur /owner/settings
       - superadmin â†’ formulaire affichÃ©, modification d'un prix, vÃ©rification que getPlanPrices() retourne la nouvelle valeur
```

---

## PÃ©rimÃ¨tre de cette story

**INCLUS :**
- `src/lib/schema.ts` â€” UPDATE : ajouter `platformSettings` (singleton, CHECK id=1)
- `drizzle/0014_*.sql` â€” NEW (gÃ©nÃ©rÃ© par `pnpm db:generate`) : CREATE TABLE platform_settings + CHECK constraint
- `src/lib/data/platform-settings.ts` â€” NEW : `getPlatformSettings()` (bootstrap + cache), `upsertPlatformSettings(input)`, types `PlatformSettings` / `PlatformSettingsInput`
- `src/lib/tenants/tenant-config.ts` (story 7-1) â€” UPDATE : ajouter les accesseurs async `getTrialDays()`, `getGracePeriodDays()`, `getPlanLimits()`, `getPlanPrices()`, `getOwnerContact()`, `getNotificationToggle(type)` qui lisent platform_settings avec fallback sur les constantes existantes (DEFAULT_TRIAL_DAYS, DEFAULT_GRACE_PERIOD_DAYS, PLAN_LIMITS, PLAN_PRICES_XOF)
- `src/lib/validation/platform-settings.ts` â€” NEW : `platformSettingsSchema` (Zod : prix int non-nÃ©gatif, grace 0-30, trial 1-60, maxUsers â‰¥1, email, toggles)
- `src/app/owner/settings/actions.ts` â€” NEW : Server Action `savePlatformSettingsAction(prev, formData)` (Zod safeParse, auth guard superadmin, upsert, audit)
- `src/app/owner/settings/page.tsx` â€” NEW : Server Component (requireOwnerAuth, SSR lecture platform_settings, 5 sous-sections)
- `src/app/owner/settings/_components/platform-settings-form.tsx` â€” NEW : Client Component (`useActionState` + `useFormStatus`, 5 sections, validation inline)
- `src/lib/tenants/expiry-job.ts` (story 7-6) â€” UPDATE : `addDays(now, DEFAULT_GRACE_PERIOD_DAYS)` â†’ `addDays(now, await getGracePeriodDays())` ; supprimer le TODO(story-7-12)
- `src/lib/tenants/tenant-contact.ts` (story 7-5) â€” UPDATE : `buildOwnerContact()` lit `getOwnerContact()` (platform_settings) avec fallback env vars puis hardcoded
- `src/app/subscription-expired/page.tsx` (story 7-5) â€” UPDATE : si `platformSettings.expiryMessage` non vide, l'afficher Ã  la place du message i18n par dÃ©faut
- `src/app/api/v1/owner/tenants/route.ts` (story 7-2/7-3) â€” UPDATE : crÃ©ation tenant lit `await getTrialDays()` et `await getPlanLimits()[plan].maxUsers`
- `src/lib/notifications/*.ts` (stories 7-5/7-6/7-8 â€” dispatch emails) â€” UPDATE : vÃ©rifier `await getNotificationToggle(type)` avant l'envoi (gate)
- `src/messages/fr-NE.json` â€” UPDATE : section `owner.settings` (5 sous-sections, labels, notes informatives, messages d'erreur)
- `tests/unit/platform-settings.test.ts` â€” NEW : Vitest (bootstrap singleton, fallback constants, validation)
- `tests/unit/tenant-config-accessors.test.ts` â€” NEW : Vitest (getTrialDays/getGracePeriodDays/getPlanLimits/getPlanPrices/getOwnerContact/getNotificationToggle â€” fallback quand DB vide)
- `tests/e2e/owner-settings.spec.ts` â€” NEW : Playwright (403 non-superadmin, affichage, modification prix, vÃ©rification lecture)

**EXCLU (ne pas modifier â€” hors pÃ©rimÃ¨tre) :**
- `tierEnum` (story 6-2) et `tenantPlanEnum` (story 7-1) â€” **NON modifiÃ©s** dans cette story (voir DÃ©cision tierEnum en Dev Notes â€” dÃ©cision dÃ©fÃ©rÃ©e au parent)
- `src/lib/quota/quota-config.ts` (TIER_QUOTAS, story 6-2) â€” inchangÃ© (le quota devis/mois reste cÃ´tÃ© companySubscription ; cette story n'externalise QUE maxUsers cÃ´tÃ© tenant)
- Migration des valeurs tierEnum existantes (`starter`â†’`free`, `entreprise`â†’`enterprise`) â€” hors scope (sera une story dÃ©diÃ©e si dÃ©cision confirmÃ©e)
- `src/lib/schema.ts` tables domaines (clients/quotes/clauses/company) â€” inchangÃ©es
- `src/proxy.ts` â€” inchangÃ© (le proxy ne lit pas platform_settings ; il consomme tenant.status posÃ© par 7-6)
- Stripe / `subscription_payments` / webhook â€” stories 7-10 (les prix Stripe price_id ne sont PAS stockÃ©s ici â€” rÃ©fÃ©rence commerciale XOF uniquement)
- Rapports & export comptabilitÃ© â€” story 7-11
- Templates HTML des emails (J-7/J-3/J-1/etc.) â€” hors scope (seuls les TOGGLES d'activation sont ici ; le contenu des templates reste dans le code de stories 7-5/7-6/7-8)
- Historique des emails envoyÃ©s par tenant (spec Â§3.6) â€” deferred Ã  une story ultÃ©rieure (table `sent_emails` dÃ©diÃ©e) ; cette story ne gÃ¨re que la CONFIG des toggles

---

## TÃ¢ches / Sous-tÃ¢ches

### T1 â€” Ajouter la table `platformSettings` au schÃ©ma (AC7, AC1)

- [x] Dans `src/lib/schema.ts`, ajouter (aprÃ¨s la table `tenants` / `tenant_events` de 7-1) :
  ```ts
  // Singleton : une seule ligne (id = 1), CHECK constraint empÃªche toute autre valeur.
  // Exception Ã  la rÃ¨gle uuid() : justifiÃ©e pour un singleton de configuration plateforme.
  export const platformSettings = pgTable(
    "platform_settings",
    {
      id: integer("id").primaryKey().notNull(),
      // Plans & tarifs (FCFA â€” entiers non-nÃ©gatifs, rÃ©fÃ©rence commerciale XOF)
      priceFreeMonthly: integer("price_free_monthly").notNull().default(0),
      priceFreeAnnual: integer("price_free_annual").notNull().default(0),
      priceProMonthly: integer("price_pro_monthly").notNull().default(25000),
      priceProAnnual: integer("price_pro_annual").notNull().default(250000),
      priceEnterpriseMonthly: integer("price_enterprise_monthly").notNull().default(75000),
      priceEnterpriseAnnual: integer("price_enterprise_annual").notNull().default(750000),
      // Quotas maxUsers par plan
      maxUsersFree: integer("max_users_free").notNull().default(1),
      maxUsersPro: integer("max_users_pro").notNull().default(5),
      maxUsersEnterprise: integer("max_users_enterprise").notNull().default(20),
      // Cycle de vie (jours)
      trialDays: integer("trial_days").notNull().default(14),
      gracePeriodDays: integer("grace_period_days").notNull().default(7),
      // Contenu tenant
      suspendedContactEmail: text("suspended_contact_email").notNull().default("contact@maigatechlab.com"),
      suspendedContactWhatsapp: text("suspended_contact_whatsapp").notNull().default(""),
      expiryMessage: text("expiry_message").notNull().default(""),
      // Notifications (bloc jsonb â€” toggles + sender address)
      notifications: jsonb("notifications").notNull().default({
        senderAddress: process.env.EMAIL_FROM ?? "contact@maigatechlab.com",
        trialWelcome: true,
        reminderJ7: true,
        reminderJ3: true,
        reminderJ1: true,
        expiryNotification: true,
        suspensionNotification: true,
        reactivationNotification: true,
      }),
      // Audit
      updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    },
    (t) => [
      // Singleton enforcement â€” littÃ©ral en SQL string (Drizzle #4661 : CHECK ne supporte pas les params liÃ©s)
      check("platform_settings_singleton_check", sql`id = 1`),
    ]
  );

  export type PlatformSettings = typeof platformSettings.$inferSelect;
  ```
- [x] `pnpm db:generate` â€” vÃ©rifier que `drizzle/0014_*.sql` contient `CREATE TABLE "platform_settings"` ET `CHECK (id = 1)` (littÃ©ral, PAS `CHECK (id = $1)`)
- [x] Si la migration Ã©met `id = $1` (bug Drizzle #4661), Ã©diter le SQL Ã  la main pour remplacer par `id = 1` et documenter dans Completion Notes
- [x] `pnpm db:migrate` â€” applique
- [x] `pnpm typecheck` â€” zÃ©ro erreur

### T2 â€” CrÃ©er `src/lib/data/platform-settings.ts` (AC7, AC8, AC9)

- [x] CrÃ©er le module d'accÃ¨s donnÃ©es :
  ```ts
  import { db } from "@/lib/db";
  import { platformSettings, type PlatformSettings } from "@/lib/schema";
  import { eq, sql } from "drizzle-orm";

  const DEFAULTS: Omit<PlatformSettings, "id" | "updatedAt"> = {
    priceFreeMonthly: 0, priceFreeAnnual: 0,
    priceProMonthly: 25000, priceProAnnual: 250000,
    priceEnterpriseMonthly: 75000, priceEnterpriseAnnual: 750000,
    maxUsersFree: 1, maxUsersPro: 5, maxUsersEnterprise: 20,
    trialDays: 14, gracePeriodDays: 7,
    suspendedContactEmail: process.env.OWNER_EMAIL ?? process.env.EMAIL_FROM ?? "contact@maigatechlab.com",
    suspendedContactWhatsapp: process.env.OWNER_WHATSAPP ?? "",
    expiryMessage: "",
    notifications: {
      senderAddress: process.env.EMAIL_FROM ?? "contact@maigatechlab.com",
      trialWelcome: true, reminderJ7: true, reminderJ3: true, reminderJ1: true,
      expiryNotification: true, suspensionNotification: true, reactivationNotification: true,
    },
  };

  export async function getPlatformSettings(): Promise<PlatformSettings> {
    const rows = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
    if (rows[0]) return rows[0];
    // Bootstrap : insÃ¨re la ligne singleton avec les defaults (race-safe via onConflictDoNothing)
    const [created] = await db
      .insert(platformSettings)
      .values({ id: 1, ...DEFAULTS })
      .onConflictDoNothing({ target: platformSettings.id })
      .returning();
    // created peut Ãªtre undefined si une requÃªte concurrente a insÃ©rÃ© entre-temps â†’ re-lire
    if (created) return created;
    const [retry] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
    if (!retry) throw new Error("platform_settings: bootstrap failed");
    return retry;
  }

  export async function upsertPlatformSettings(input: Partial<Omit<PlatformSettings, "id" | "updatedAt">>): Promise<PlatformSettings> {
    const [row] = await db
      .insert(platformSettings)
      .values({ id: 1, ...DEFAULTS, ...input })
      .onConflictDoUpdate({
        target: platformSettings.id,
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    if (!row) throw new Error("platform_settings: upsert returned no row");
    return row;
  }

  export type PlatformSettingsRow = PlatformSettings;
  ```
- [x] Remarque : `getPlatformSettings()` n'est PAS cachÃ©e en mÃ©moire (Next cache `unstable_cache` pourrait Ãªtre ajoutÃ© en V2) â€” les lectures restent bon marchÃ© (1 ligne singleton). Pour cette story, lecture directe Ã  chaque appel.
- [x] `pnpm typecheck`

### T3 â€” CrÃ©er `src/lib/validation/platform-settings.ts` (AC2, AC3, AC4, AC5)

- [x] CrÃ©er le schÃ©ma Zod :
  ```ts
  import { z } from "zod";

  export const notificationsSchema = z.object({
    senderAddress: z.string().trim().toLowerCase().email("Adresse email expÃ©diteur invalide."),
    trialWelcome: z.coerce.boolean(),
    reminderJ7: z.coerce.boolean(),
    reminderJ3: z.coerce.boolean(),
    reminderJ1: z.coerce.boolean(),
    expiryNotification: z.coerce.boolean(),
    suspensionNotification: z.coerce.boolean(),
    reactivationNotification: z.coerce.boolean(),
  });

  export const platformSettingsSchema = z.object({
    // Prix â€” entiers non-nÃ©gatifs (FCFA)
    priceFreeMonthly: z.coerce.number().int().nonnegative("Le prix doit Ãªtre un entier positif (FCFA)."),
    priceFreeAnnual: z.coerce.number().int().nonnegative("Le prix doit Ãªtre un entier positif (FCFA)."),
    priceProMonthly: z.coerce.number().int().nonnegative("Le prix doit Ãªtre un entier positif (FCFA)."),
    priceProAnnual: z.coerce.number().int().nonnegative("Le prix doit Ãªtre un entier positif (FCFA)."),
    priceEnterpriseMonthly: z.coerce.number().int().nonnegative("Le prix doit Ãªtre un entier positif (FCFA)."),
    priceEnterpriseAnnual: z.coerce.number().int().nonnegative("Le prix doit Ãªtre un entier positif (FCFA)."),
    // Quotas
    maxUsersFree: z.coerce.number().int().min(1, "Le nombre d'utilisateurs doit Ãªtre â‰¥ 1."),
    maxUsersPro: z.coerce.number().int().min(1, "Le nombre d'utilisateurs doit Ãªtre â‰¥ 1."),
    maxUsersEnterprise: z.coerce.number().int().min(1, "Le nombre d'utilisateurs doit Ãªtre â‰¥ 1."),
    // Cycle de vie
    trialDays: z.coerce.number().int().min(1, "La durÃ©e d'essai doit Ãªtre entre 1 et 60 jours.").max(60, "La durÃ©e d'essai doit Ãªtre entre 1 et 60 jours."),
    gracePeriodDays: z.coerce.number().int().min(0, "La durÃ©e de grÃ¢ce doit Ãªtre entre 0 et 30 jours.").max(30, "La durÃ©e de grÃ¢ce doit Ãªtre entre 0 et 30 jours."),
    // Contenu tenant
    suspendedContactEmail: z.string().trim().toLowerCase().email("Adresse email invalide."),
    suspendedContactWhatsapp: z.string().trim(),
    expiryMessage: z.string().trim(),
    // Notifications
    notifications: notificationsSchema,
  });

  export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
  ```
- [x] Gestion des checkboxes (booleans) : cÃ´tÃ© Server Action, normaliser `formData.get(name) === "on"` AVANT safeParse (les checkboxes absentes ne sont pas dans FormData)

### T4 â€” UPDATE `src/lib/tenants/tenant-config.ts` : ajouter les accesseurs async avec fallback (AC8, AC9)

- [x] Conserver les constantes existantes (DEFAULT_TRIAL_DAYS=14, DEFAULT_GRACE_PERIOD_DAYS=7, PLAN_LIMITS, PLAN_PRICES_XOF) â€” elles servent de fallback
- [x] Ajouter les accesseurs :
  ```ts
  import { getPlatformSettings } from "@/lib/data/platform-settings";

  export async function getTrialDays(): Promise<number> {
    const s = await getPlatformSettings();
    return s.trialDays;
  }

  export async function getGracePeriodDays(): Promise<number> {
    const s = await getPlatformSettings();
    return s.gracePeriodDays;
  }

  export async function getPlanLimits(): Promise<Record<TenantPlan, { maxUsers: number }>> {
    const s = await getPlatformSettings();
    return {
      free: { maxUsers: s.maxUsersFree },
      pro: { maxUsers: s.maxUsersPro },
      enterprise: { maxUsers: s.maxUsersEnterprise },
    };
  }

  export async function getPlanPrices(): Promise<Record<TenantPlan, { monthly: number; annual: number }>> {
    const s = await getPlatformSettings();
    return {
      free: { monthly: s.priceFreeMonthly, annual: s.priceFreeAnnual },
      pro: { monthly: s.priceProMonthly, annual: s.priceProAnnual },
      enterprise: { monthly: s.priceEnterpriseMonthly, annual: s.priceEnterpriseAnnual },
    };
  }

  export type NotificationType =
    | "trialWelcome" | "reminderJ7" | "reminderJ3" | "reminderJ1"
    | "expiryNotification" | "suspensionNotification" | "reactivationNotification";

  export async function getNotificationToggle(type: NotificationType): Promise<boolean> {
    const s = await getPlatformSettings();
    return Boolean((s.notifications as Record<string, unknown>)[type]);
  }

  export async function getNotificationSenderAddress(): Promise<string> {
    const s = await getPlatformSettings();
    const n = s.notifications as { senderAddress?: string };
    return n.senderAddress ?? process.env.EMAIL_FROM ?? "contact@maigatechlab.com";
  }
  ```
- [x] Remarque : les accesseurs sont `async` (lecture DB). Les consumers synchrones doivent Ãªtre convertis en async (voir T7/T8/T9). Les anciennes constantes synchrones restent exportÃ©es pour rÃ©tro-compat mais sont marquÃ©es `@deprecated` (utiliser les accesseurs).

### T5 â€” UPDATE `src/lib/tenants/tenant-contact.ts` (story 7-5) : lire depuis platform_settings (AC8, AC5)

- [x] Modifier `buildOwnerContact()` pour devenir async et lire `getOwnerContact()` :
  ```ts
  import { getPlatformSettings } from "@/lib/data/platform-settings";

  export async function buildOwnerContact() {
    const s = await getPlatformSettings();
    const email = s.suspendedContactEmail || process.env.OWNER_EMAIL || process.env.EMAIL_FROM || "contact@maigatechlab.com";
    const whatsapp = s.suspendedContactWhatsapp || process.env.OWNER_WHATSAPP || null;
    return {
      email,
      whatsapp,
      displayEmail: email,
      displayWhatsapp: whatsapp ?? "Contactez votre interlocuteur Maiga Tech Lab",
    };
  }
  ```
- [x] Tous les appelants de `buildOwnerContact()` (page /subscription-expired) doivent `await` â€” vÃ©rifier T6

### T6 â€” UPDATE `src/app/subscription-expired/page.tsx` (story 7-5) (AC5, AC8)

- [x] Le Server Component `await buildOwnerContact()` (dÃ©jÃ  async depuis T5)
- [x] Lire `const settings = await getPlatformSettings()` ; si `settings.expiryMessage` non vide, l'afficher Ã  la place du message i18n par dÃ©faut (`t("message")`)
  ```tsx
  <p className="text-text-muted">{settings.expiryMessage || t("message")}</p>
  ```

### T7 â€” UPDATE `src/lib/tenants/expiry-job.ts` (story 7-6) (AC4, AC8, AC9)

- [x] Remplacer :
  ```ts
  // AVANT (story 7-6) :
  import { DEFAULT_GRACE_PERIOD_DAYS } from "./tenant-config";
  const gracePeriodEndsAt = addDays(now, DEFAULT_GRACE_PERIOD_DAYS);

  // APRÃˆS (cette story) :
  import { getGracePeriodDays } from "./tenant-config";
  const graceDays = await getGracePeriodDays();
  const gracePeriodEndsAt = addDays(now, graceDays);
  ```
- [x] Supprimer le commentaire `// TODO(story-7-12): externalize grace period to platform_settings`
- [x] VÃ©rifier que la fonction englobante est `async` (runExpiryJob l'est dÃ©jÃ )

### T8 â€” UPDATE `src/app/api/v1/owner/tenants/route.ts` (crÃ©ation tenant, story 7-2/7-3) (AC8, AC9)

- [x] Dans le handler POST (crÃ©ation tenant), remplacer les lectures synchrones de constantes par les accesseurs async :
  ```ts
  // AVANT :
  import { DEFAULT_TRIAL_DAYS, PLAN_LIMITS } from "@/lib/tenants/tenant-config";
  const trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS);
  const maxUsers = PLAN_LIMITS[plan].maxUsers;

  // APRÃˆS :
  import { getTrialDays, getPlanLimits } from "@/lib/tenants/tenant-config";
  const trialDays = await getTrialDays();
  const trialEndsAt = addDays(now, trialDays);
  const planLimits = await getPlanLimits();
  const maxUsers = planLimits[plan].maxUsers;
  ```

### T9 â€” UPDATE dispatch emails (stories 7-5/7-6/7-8) : gate par notification toggle (AC6, AC8)

- [x] Identifier toutes les fonctions d'envoi d'email automatique (rappel J-7/J-3/J-1, expiration, suspension, rÃ©activation, bienvenue trial)
- [x] Avant chaque envoi, vÃ©rifier le toggle :
  ```ts
  import { getNotificationToggle, type NotificationType } from "@/lib/tenants/tenant-config";

  // Exemple pour le rappel J-7 :
  if (!(await getNotificationToggle("reminderJ7"))) {
    return; // toggle dÃ©sactivÃ© â€” skip l'envoi
  }
  // ... envoi email ...
  ```
- [x] RÃ©cupÃ©rer l'adresse expÃ©diteur via `await getNotificationSenderAddress()` (ne pas utiliser `process.env.EMAIL_FROM` directement)
- [x] Logger un Ã©vÃ©nement tenant_events (story 7-1) `event_type: "reminder_sent"` uniquement si l'email est rÃ©ellement envoyÃ© (pas si skip)

### T10 â€” CrÃ©er la Server Action `src/app/owner/settings/actions.ts` (AC1, AC2â€“AC6, AC11, AC12)

- [x] `"use server"` en tÃªte de fichier
- [x] `savePlatformSettingsAction(_prev, formData)` :
  - Auth guard : `requireOwnerAuth()` (story 7-2) â€” lÃ¨ve 403 si non-superadmin
  - Normaliser les checkboxes : pour chaque toggle, `formData.get(name) === "on"` â†’ boolean
  - Construire l'objet raw (notifications nested)
  - `platformSettingsSchema.safeParse(raw)` â†’ si erreur, retourner `{ success: false, errors, values: raw }`
  - Snapshot `before` via `await getPlatformSettings()` (pour audit diff)
  - `await upsertPlatformSettings(parsed.data)`
  - Ã‰mettre auditEvent (`what: "platform.settings.updated"`, companyId: null, before/after)
  - Retourner `{ success: true, message: "ParamÃ¨tres enregistrÃ©s." }`
- [x] Type `PlatformSettingsState` exportÃ© pour le client

### T11 â€” CrÃ©er la page `src/app/owner/settings/page.tsx` (Server Component) (AC1)

- [x] `requireOwnerAuth()` en tÃªte (defense in depth â€” proxy + guard serveur)
- [x] `const settings = await getPlatformSettings()` (SSR seed, pas de double fetch)
- [x] Rendre `<PlatformSettingsForm defaults={settings} />` dans le layout `src/app/owner/layout.tsx`
- [x] Titre H1 "ParamÃ¨tres plateforme", eyebrow "Owner", layout conforme Ã  story 7-2

### T12 â€” CrÃ©er `src/app/owner/settings/_components/platform-settings-form.tsx` (Client Component) (AC1â€“AC6, AC12)

- [x] `"use client"`
- [x] `useActionState(savePlatformSettingsAction, initialState)` (React 19)
- [x] 5 sections (Cards) : Plans & tarifs / Quotas / Cycle de vie / Contenu tenant / Notifications
- [x] SubmitButton enfant de `<form>` utilisant `useFormStatus().pending`
- [x] Repopuler les champs depuis `state.values ?? defaults` (en cas d'Ã©chec validation, garder la saisie utilisateur)
- [x] Afficher `state.errors?.<field>?.[0]` sous chaque champ (erreur inline franÃ§aise)
- [x] Toast succÃ¨s via `sonner` quand `state.success`
- [x] Note informative sous la section Plans & tarifs (rÃ©fÃ©rence commerciale, prix Stripe gÃ©rÃ©s ailleurs)

### T13 â€” UPDATE `src/messages/fr-NE.json` : section `owner.settings` (AC1â€“AC6)

- [x] Ajouter la section :
  ```json
  "owner": {
    "settings": {
      "title": "ParamÃ¨tres plateforme",
      "eyebrow": "Owner",
      "sections": {
        "pricing": { "title": "Plans & tarifs", "note": "RÃ©fÃ©rence commerciale. Les prix Stripe sont gÃ©rÃ©s dans le dashboard Stripe." },
        "quotas": { "title": "Quotas d'utilisateurs" },
        "lifecycle": { "title": "Cycle de vie", "note": "La durÃ©e de grÃ¢ce s'applique aux nouvelles suspensions uniquement." },
        "tenantContent": { "title": "Contenu affichÃ© aux tenants" },
        "notifications": { "title": "Notifications automatiques" }
      },
      "fields": {
        "priceFreeMonthly": "Free mensuel (XOF)",
        "priceFreeAnnual": "Free annuel (XOF)",
        "priceProMonthly": "Pro mensuel (XOF)",
        "priceProAnnual": "Pro annuel (XOF)",
        "priceEnterpriseMonthly": "Enterprise mensuel (XOF)",
        "priceEnterpriseAnnual": "Enterprise annuel (XOF)",
        "maxUsersFree": "Utilisateurs max (Free)",
        "maxUsersPro": "Utilisateurs max (Pro)",
        "maxUsersEnterprise": "Utilisateurs max (Enterprise)",
        "trialDays": "DurÃ©e d'essai (jours)",
        "gracePeriodDays": "DurÃ©e de grÃ¢ce (jours)",
        "suspendedContactEmail": "Email de contact (suspendus)",
        "suspendedContactWhatsapp": "WhatsApp de contact (suspendus)",
        "expiryMessage": "Message page d'expiration (vide = dÃ©faut)",
        "senderAddress": "Adresse expÃ©diteur emails",
        "trialWelcome": "Email de bienvenue trial",
        "reminderJ7": "Rappel J-7",
        "reminderJ3": "Rappel J-3",
        "reminderJ1": "Rappel J-1",
        "expiryNotification": "Notification expiration J0",
        "suspensionNotification": "Notification suspension",
        "reactivationNotification": "Notification rÃ©activation"
      },
      "actions": { "save": "Enregistrer", "saving": "Enregistrementâ€¦" },
      "messages": {
        "saved": "ParamÃ¨tres plateforme enregistrÃ©s.",
        "forbidden": "AccÃ¨s rÃ©servÃ© au superadmin."
      }
    }
  }
  ```

### T14 â€” CrÃ©er `tests/unit/platform-settings.test.ts` (Vitest) (AC7, AC9, AC12)

- [x] Test bootstrap singleton : `getPlatformSettings()` quand table vide â†’ insÃ¨re id=1 avec defaults â†’ retourne la ligne
- [x] Test concurrence : deux appels simultanÃ©s Ã  `getPlatformSettings()` sur table vide â†’ un seul INSERT (onConflictDoNothing) â†’ pas d'erreur
- [x] Test upsert : `upsertPlatformSettings({ gracePeriodDays: 10 })` met Ã  jour la ligne existante
- [x] Test validation Zod (paramÃ©trÃ©) : prix nÃ©gatif, prix dÃ©cimal, grace=31, trial=0, trial=61, maxUsers=0, email invalide â†’ tous rejetÃ©s
- [x] Mock `db` via pattern existant (voir tests stories 7-1/7-6)

### T15 â€” CrÃ©er `tests/unit/tenant-config-accessors.test.ts` (Vitest) (AC8)

- [x] `getTrialDays()` retourne valeur DB si prÃ©sente, sinon DEFAULT_TRIAL_DAYS
- [x] `getGracePeriodDays()` retourne valeur DB si prÃ©sente, sinon DEFAULT_GRACE_PERIOD_DAYS
- [x] `getPlanLimits()` retourne valeurs DB structurÃ©es par plan, sinon fallback PLAN_LIMITS
- [x] `getPlanPrices()` idem
- [x] `getNotificationToggle("reminderJ7")` retourne false quand dÃ©sactivÃ©, true sinon
- [x] `buildOwnerContact()` (depuis tenant-contact.ts) : fallback env vars puis hardcoded quand DB vide

### T16 â€” CrÃ©er `tests/e2e/owner-settings.spec.ts` (Playwright) (AC1, AC12)

- [x] Test 403 : login admin/commercial/operateur â†’ GET /owner/settings â†’ redirect/403
- [x] Test superadmin : login â†’ /owner/settings â†’ formulaire affichÃ© (5 sections visibles)
- [x] Test modification : changer priceProMonthly 25000 â†’ 30000 â†’ enregistrer â†’ recharger â†’ valeur persistÃ©e
- [x] Test validation : saisir grace=31 â†’ erreur inline affichÃ©e
- [x] Test lecture consommateur : aprÃ¨s modification, vÃ©rifier que `getPlanPrices()` retourne la nouvelle valeur (via un endpoint test ou en inspectant la crÃ©ation tenant)

### T17 â€” VÃ©rification finale (AC12)

- [x] `pnpm check` : lint âœ“ + typecheck âœ“ + tests existants âœ“ (pas de rÃ©gression sur stories 7-1 Ã  7-9) + nouveaux tests âœ“
- [x] `pnpm build` : passe sans erreur (`db:migrate` applique 0014 puis `next build`)
- [x] `pnpm dev` : login superadmin â†’ /owner/settings â†’ formulaire fonctionnel

---

## Dev Notes

### CRITIQUE â€” DÃ©cision tierEnum unification (FLAG pour le parent â€” DÃ‰CISION RECOMMANDÃ‰E)

**Constat :** Le codebase contient DEUX enums de plan/tier divergents :
- `tierEnum` (story 6-2, `src/lib/schema.ts`) : `["starter", "pro", "entreprise"]` â€” utilisÃ© par `companySubscription.tier` et `src/lib/quota/quota-config.ts` (TIER_QUOTAS : starter=50 quotes/1 user, entreprise=unlimited/10 users)
- `tenantPlanEnum` (story 7-1) : `["free", "pro", "enterprise"]` â€” utilisÃ© par `tenants.plan`

**Divergences :**
| Aspect | tierEnum (6-2) | tenantPlanEnum (7-1) |
|---|---|---|
| Niveau bas | `starter` | `free` |
| Niveau haut | `entreprise` (FR) | `enterprise` (EN) |
| Niveau milieu | `pro` | `pro` (identique) |

**DÃ©cision recommandÃ©e : UNIFIER sur `tenantPlanEnum` (`free` / `pro` / `enterprise`).**

**Rationale :**
1. **Epic 7 est l'avenir du produit** (SaaS multi-tenant). Le modÃ¨le `tenants` est la source de vÃ©ritÃ© du billing. `companySubscription` (6-2) Ã©tait un Ã©chafaudage MVP prÃ©-SaaS.
2. **Anglais standard** (`free`/`enterprise`) est prÃ©fÃ©rable pour des valeurs d'enum DB (cohÃ©rent avec `tenantStatusEnum` active/trial/suspended, `paymentMethodEnum`, etc., tous en anglais).
3. **`starter`** suggÃ¨re un paywall (entrÃ©e payante) tandis que **`free`** est plus clair pour un plan gratuit d'acquisition (alignÃ© avec la dÃ©cision business spec Â§7 : "Free : 0 FCFA/mois").

**Plan de migration (DEFERRED â€” PAS dans cette story) :**
```sql
-- Story dÃ©diÃ©e future (ex: 7-13 ou correctif 6-2) :
-- 1. Ajouter les nouvelles valeurs Ã  l'enum tier (ordre important pour Ã©viter collision) :
ALTER TYPE tier ADD VALUE IF NOT EXISTS 'free';
ALTER TYPE tier ADD VALUE IF NOT EXISTS 'enterprise';
-- 2. Migrer les donnÃ©es :
UPDATE company_subscription SET tier = 'free' WHERE tier = 'starter';
UPDATE company_subscription SET tier = 'enterprise' WHERE tier = 'entreprise';
-- 3. Retirer les anciennes valeurs (requiert recrÃ©ation d'enum â€” procÃ©dure PG standard) :
--    CREATE TYPE tier_new AS ENUM ('free','pro','enterprise');
--    ALTER TABLE company_subscription ALTER COLUMN tier TYPE tier_new USING tier::text::tier_new;
--    DROP TYPE tier; ALTER TYPE tier_new RENAME TO tier;
-- 4. Mettre Ã  jour TIER_QUOTAS dans src/lib/quota/quota-config.ts (clÃ©s free/enterprise)
```

**Action de cette story :**
- **NE PAS modifier** `tierEnum` ni `tenantPlanEnum` ni migrer les donnÃ©es.
- `platform_settings` utilise les clÃ©s `{free, pro, enterprise}` (alignÃ©es sur `tenantPlanEnum`).
- Documenter cette dÃ©cision en Completion Notes et **flaguer pour confirmation parent**.
- Si le parent dÃ©cide de garder les deux enums sÃ©parÃ©s (dual model), `platform_settings` reste inchangÃ© (les clÃ©s free/pro/enterprise sont uniquement pour le billing Epic 7 ; tierEnum 6-2 reste scopÃ© au quota devis/mois cÃ´tÃ© `companySubscription`).

> **FLAG PARENT :** Confirmer la dÃ©cision d'unification (recommandÃ©e : unifier sur `free`/`pro`/`enterprise` via story dÃ©diÃ©e). En attendant, cette story est neutre â€” elle ne casse ni l'un ni l'autre.

---

### CRITIQUE â€” Singleton table : pourquoi `integer id CHECK id=1` plutÃ´t que `uuid`

**RÃ¨gle projet (`project-context.md`) :** "Custom tables: `uuid()` IDs".

**Exception justifiÃ©e ici :** Un singleton de configuration n'a pas besoin d'identitÃ© â€” il existe exactement UNE ligne. Utiliser `uuid()` rendrait l'enforcement singleton impossible sans contrainte CHECK supplÃ©mentaire sur une colonne arbitraire. Le pattern standard pour un singleton est `id integer PRIMARY KEY CHECK (id = 1)`. Documenter cette exception en Completion Notes.

**Alternative envisagÃ©e (rejetÃ©e) :** Table EAV key/value (`key text, value jsonb`). RejetÃ©e car perte de type (toutes les valeurs en jsonb), validation Zod plus fragile, et l'ensemble des ~20 champs est FIXE (pas open-ended). Voir recherche web (Drizzle docs + GitHub #4661) : typed singleton row est la pratique recommandÃ©e pour un set de config fermÃ©.

**Bug Drizzle #4661 (CHECK constraint paramÃ©trÃ©e) :** La contrainte CHECK doit utiliser un littÃ©ral SQL string (`sql\`id = 1\``), PAS une interpolation paramÃ©trÃ©e (`sql\`id = ${1}\`` qui gÃ©nÃ¨re `CHECK (id = $1)` â€” invalide en DDL). AprÃ¨s `pnpm db:generate`, vÃ©rifier le SQL gÃ©nÃ©rÃ© et corriger Ã  la main si nÃ©cessaire.

---

### CRITIQUE â€” `getPlatformSettings()` n'est PAS cachÃ©e (choix MVP)

Chaque appel fait un `SELECT` sur une ligne singleton (~0.1ms). Pour cette story, pas de cache en mÃ©moire (`unstable_cache` Next) â€” les consumers (cron, page, API) appellent `getPlatformSettings()` directement. Rationale :
1. La config change rarement (intervention manuelle owner).
2. Les consumers sont peu nombreux (expiry-job, tenant-contact, crÃ©ation tenant, dispatch emails, page settings).
3. Un cache introduirait de la complexitÃ© d'invalidation (le formulaire doit invalider aprÃ¨s save).

**V2 possible :** `unstable_cache(getPlatformSettings, ["platform-settings"], { revalidate: 60, tags: ["platform-settings"] })` + `revalidateTag("platform-settings")` dans `upsertPlatformSettings()`. Deferred.

---

### CRITIQUE â€” Accesseurs async vs constantes sync (breaking change pour consumers)

Les anciennes constantes (`DEFAULT_GRACE_PERIOD_DAYS`, `PLAN_LIMITS`, etc.) sont **synchrones**. Les nouveaux accesseurs (`getGracePeriodDays()`, `getPlanLimits()`) sont **async** (lecture DB). Cela impose de convertir les consumers en async.

**Consumers Ã  convertir (liste exhaustive) :**
| Consumer | Story | Conversion |
|---|---|---|
| `src/lib/tenants/expiry-job.ts` â€” `addDays(now, DEFAULT_GRACE_PERIOD_DAYS)` | 7-6 | â†’ `addDays(now, await getGracePeriodDays())` (T7) |
| `src/app/api/v1/owner/tenants/route.ts` POST â€” crÃ©ation tenant (trial + maxUsers) | 7-2/7-3 | â†’ `await getTrialDays()`, `await getPlanLimits()` (T8) |
| `src/lib/tenants/tenant-contact.ts` â€” `buildOwnerContact()` | 7-5 | â†’ async, lit `getOwnerContact()` (T5) |
| `src/app/subscription-expired/page.tsx` â€” `buildOwnerContact()` | 7-5 | â†’ `await buildOwnerContact()` (T6) |
| Dispatch emails (rappel/suspension/rÃ©activation) | 7-5/7-6/7-8 | â†’ gate `await getNotificationToggle(type)` (T9) |

**Anciennes constantes :** ConservÃ©es et marquÃ©es `@deprecated` (JSDoc) â€” servent de fallback dans les accesseurs et pour les tests unitaires. Ne PAS supprimer (casserait les imports existants).

---

### CRITIQUE â€” Refactor non-rÃ©troactif (AC9)

Les modifications de `platform_settings` s'appliquent UNIQUEMENT aux **nouvelles computations** :
- `gracePeriodDays` modifiÃ© â†’ affecte les **nouvelles** suspensions (cron 7-6). Les tenants dÃ©jÃ  en grÃ¢ce conservent leur `gracePeriodEndsAt` existant (calculÃ© avec l'ancienne valeur).
- `maxUsers` modifiÃ© â†’ affecte les **nouveaux** tenants crÃ©Ã©s (7-3). Les tenants existants conservent leur `tenant.maxUsers` (l'owner peut Ã©diter individuellement via fiche tenant 7-7).
- `trialDays` modifiÃ© â†’ affecte les **nouveaux** trials.

C'est le comportement attendu (pas de migration rÃ©troactive des donnÃ©es existantes). DocumentÃ© dans l'UI (note sous Cycle de vie).

---

### CRITIQUE â€” Notifications : bloc jsonb vs colonnes sÃ©parÃ©es

Le bloc `notifications` est stockÃ© en `jsonb` (structure imbriquÃ©e : senderAddress + 7 toggles). Rationale :
1. Les toggles sont sÃ©mantiquement groupÃ©s (mÃªme entitÃ© fonctionnelle).
2. Ajouter un nouveau type de notification (ex: `paymentReceipt`) ne nÃ©cessite pas de migration (juste une clÃ© jsonb en plus).
3. Le schÃ©ma Zod `notificationsSchema` valide le shape au runtime (dans la Server Action).

**InconvÃ©nient :** Perte de type au niveau DB (`jsonb` retourne `unknown`). Mitigation : le type `PlatformSettings["notifications"]` est infÃ©rÃ© depuis le `default` Drizzle (le shape initial est connu). Dans les accesseurs, caster via `as Record<string, unknown>` puis `Boolean()` (voir T4).

**Alternative rejetÃ©e :** 8 colonnes boolÃ©ennes sÃ©parÃ©es + 1 colonne senderAddress. Plus de type-safety mais migrations Ã  chaque ajout. RejetÃ© pour flexibilitÃ© (le set de notifications peut Ã©voluer).

---

### CRITIQUE â€” Pas de `tenant_events` pour platform_settings

`tenant_events` (story 7-1) est scopÃ© aux actions sur les TENANTS (created/activated/suspended/etc.). Les modifications de platform_settings sont des actions PLATEFORME (pas liÃ©es Ã  un tenant). Utiliser `auditEvent` (story 6-3) avec `companyId: null` (le superadmin n'a pas de companyId). Voir AC11.

---

### Pattern existant Ã  rÃ©utiliser

- **Story 7-1 :** `tenant-config.ts` (DEFAULT_TRIAL_DAYS, DEFAULT_GRACE_PERIOD_DAYS, PLAN_LIMITS, PLAN_PRICES_XOF, APEX_DOMAIN) â€” source des constantes Ã  externaliser.
- **Story 7-2 :** `requireOwnerAuth()` (Server Component) / `requireOwnerSession()` (API) dans `src/lib/session.ts` â€” guard superadmin. Layout `src/app/owner/layout.tsx`. `userRoleEnum += "superadmin"`.
- **Story 6-3 (audit) :** `emitAuditEvent` + `createAuditEvent` pattern â€” rÃ©utiliser pour l'audit de modification (avec `companyId: null`).
- **Story 2-3 (company config) :** Pattern Server Component (SSR seed) + Client Component formulaire + native `useState` (react-hook-form non installÃ©). Pour cette story, utiliser `useActionState` (React 19, plus moderne que useState pour les server actions).
- **Story 6-2 (quota) :** `TIER_QUOTAS` dans `src/lib/quota/quota-config.ts` â€” rÃ©fÃ©rence pour la dÃ©cision tierEnum (voir section dÃ©diÃ©e).
- **Story 7-6 (cron) :** `expiry-job.ts` + commentaire `TODO(story-7-12)` â€” point prÃ©cis du refactor (T7).
- **Drizzle `check()` + `sql` :** pattern `check("name", sql\`condition\`)` â€” voir `src/lib/schema.ts` existant pour exemples.

---

### PiÃ¨ges & Anti-patterns

| âŒ INTERDIT | âœ… CORRECT |
|---|---|
| Migrer `tierEnum`/`tenantPlanEnum` dans cette story | Documenter la dÃ©cision + flaguer parent (story dÃ©diÃ©e) |
| Stocker les prix Stripe `price_id` dans platform_settings | RÃ©fÃ©rence commerciale XOF uniquement â€” Stripe gÃ©rÃ© en dashboard (story 7-10) |
| Utiliser EAV key/value pour platform_settings | Singleton typed row avec CHECK id=1 |
| `CHECK (id = $1)` dans la migration (Drizzle #4661) | `CHECK (id = 1)` littÃ©ral â€” vÃ©rifier le SQL gÃ©nÃ©rÃ© |
| Cacher `getPlatformSettings()` en mÃ©moire sans invalidation | Lecture directe (MVP) ; cache V2 avec `revalidateTag` |
| Rendre les modifications rÃ©troactives (recalculer grace existante) | Nouvelles computations uniquement (AC9) |
| Garder les anciennes constantes sync ET les utiliser dans les consumers | Convertir les consumers en `await` accesseurs async |
| Oublier le gate notification toggle dans un dispatch email | Chaque envoi vÃ©rifie `await getNotificationToggle(type)` avant |
| Utiliser `z.coerce.boolean()` seul pour les checkboxes | Normaliser `=== "on"` cÃ´tÃ© Server Action (absent = false) |
| `useFormStatus()` dans le composant qui possÃ¨de `<form>` | Dans un composant enfant de `<form>` |
| Stocker les templates HTML des emails ici | Hors scope â€” seuls les TOGGLES (config) |
| Modifier `src/proxy.ts` pour lire platform_settings | InchangÃ© â€” proxy consomme `tenant.status` (posÃ© par 7-6) |
| `uuid()` pour la PK de platform_settings | `integer id` CHECK id=1 (exception justifiÃ©e) |

---

### HÃ©ritage des stories prÃ©cÃ©dentes

**Story 7-1 (schema + middleware) â€” ready-for-dev (NON implÃ©mentÃ©e) :** HARD dependency. Fournit `tenants`, `tenant_events`, `tenantPlanEnum`, et surtout `tenant-config.ts` (les constantes Ã  externaliser). Le dev DOIT s'assurer que 7-1 est fusionnÃ©e avant 7-12.

**Story 7-2 (dashboard owner + superadmin) â€” ready-for-dev :** HARD dependency. Fournit `userRoleEnum += "superadmin"`, `requireOwnerAuth()`, `src/app/owner/layout.tsx`. Sans 7-2, la route `/owner/settings` ne peut pas Ãªtre gardÃ©e.

**Story 7-5 (suspension + /subscription-expired) â€” ready-for-dev :** HARD dependency. Fournit `buildOwnerContact()` (Ã  refactoriser en T5) et la page `/subscription-expired` (Ã  mettre Ã  jour en T6 pour lire `expiryMessage`).

**Story 7-6 (cron expiry + rappels) â€” ready-for-dev :** HARD dependency. Fournit `expiry-job.ts` avec le `TODO(story-7-12)` (Ã  rÃ©soudre en T7) et les fonctions de dispatch des rappels (Ã  gater en T9).

**Story 7-9 (tenant user mgmt) â€” ready-for-dev :** SOFT dependency. Lit `tenant.maxUsers` depuis la DB (pas directement PLAN_LIMITS au runtime). Le refactor de PLAN_LIMITS en accesseur async affecte surtout la CRÃ‰ATION tenant (story 7-3, via T8).

**Story 6-2 (tier quota) â€” DONE :** Fournit `tierEnum` (starter/pro/entreprise) et `TIER_QUOTAS`. Source de la divergence d'enum â€” voir DÃ©cision tierEnum.

**Story 6-3 (audit) â€” DONE :** `emitAuditEvent` / `createAuditEvent` pattern. RÃ©utiliser pour audit modifications (avec `companyId: null`).

**Story 2-3 (company config) â€” DONE :** Pattern formulaire config (SSR seed + Client Component). Inspire T11/T12 (mais `useActionState` au lieu de `useState` natif â€” React 19 disponible).

---

### Commandes pour le dev agent

```bash
# 0. PRÃ‰REQUIS â€” stories 7-1, 7-2, 7-5, 7-6 doivent Ãªtre fusionnÃ©es
git log --oneline | grep -E "7-1|7-2|7-5|7-6"  # vÃ©rifier les commits

# 1. Docker en cours
docker compose up -d

# 2. Ajouter platformSettings au schema (T1)
#    Ã‰diter src/lib/schema.ts â€” ajouter la table aprÃ¨s tenants
pnpm db:generate   # crÃ©e drizzle/0014_*.sql
# VÃ‰RIFIER le SQL : doit contenir CHECK (id = 1) littÃ©ral, PAS CHECK (id = $1)
# Si bug Drizzle #4661 : Ã©diter le .sql Ã  la main (remplacer $1 par 1)
pnpm db:migrate    # applique

# 3. Seed un user superadmin pour tester (si pas dÃ©jÃ  fait en 7-2)
# psql : INSERT INTO "user" (id, name, email, role, "createdAt", "updatedAt")
#        VALUES (gen_random_uuid(), 'Owner', 'owner@maigatechlab.com', 'superadmin', now(), now());

# 4. ImplÃ©menter T2â€“T13 (data layer, validation, server action, page, form, refactor consumers)

# 5. QualitÃ©
pnpm check   # lint âœ“ typecheck âœ“ tests âœ“ (existants + nouveaux sans rÃ©gression)

# 6. Build
pnpm build   # db:migrate (dÃ©jÃ  appliquÃ©e) + next build â€” passe sans erreur

# 7. Dev + test manuel
pnpm dev
# Login superadmin â†’ http://localhost:3000/owner/settings
# Modifier gracePeriodDays 7 â†’ 10 â†’ enregistrer â†’ vÃ©rifier qu'un nouveau tenant suspendu prend +10j
```

---

## RÃ©fÃ©rences

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` â€” Â§3.8 ParamÃ¨tres plateforme, Â§3.6 Notifications config, Â§7 paramÃ¨tres business retenus (DEFAULT_TRIAL_DAYS=14, DEFAULT_GRACE_PERIOD_DAYS=7, PLAN_LIMITS, PLAN_PRICES_XOF)
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` â€” HARD dep : tenantPlanEnum, tenant-config.ts, tenant_events
- [Story 7-2] `_bmad-output/implementation-artifacts/7-2-owner-dashboard-tenant-list.md` â€” HARD dep : superadmin role, requireOwnerAuth(), owner layout
- [Story 7-5] `_bmad-output/implementation-artifacts/7-5-manual-suspension-expiry-page.md` â€” HARD dep : buildOwnerContact(), /subscription-expired page
- [Story 7-6] `_bmad-output/implementation-artifacts/7-6-expiry-cron-automated-reminders.md` â€” HARD dep : expiry-job.ts (TODO story-7-12), dispatch rappels
- [Story 7-9] `_bmad-output/implementation-artifacts/7-9-tenant-user-management.md` â€” SOFT dep : PLAN_LIMITS maxUsers
- [Story 6-2] (commit `f57a515`) â€” tierEnum starter/pro/entreprise (dÃ©cision unification)
- [Story 6-3] (commit `a4f6977`) â€” emitAuditEvent pattern
- [Story 2-3] `_bmad-output/implementation-artifacts/2-3-company-info-config.md` â€” pattern formulaire config (SSR + Client Component)
- [project-context.md] â€” rÃ¨gles Drizzle (uuid pour tables custom, exception singleton), TypeScript strict, API envelope, i18n, FCFA integer, audit companyId
- [Drizzle â€” Indexes & Constraints (CHECK)](https://orm.drizzle.team/docs/indexes-constraints)
- [Drizzle â€” BUG #4661 CHECK paramÃ©trÃ©](https://github.com/drizzle-team/drizzle-orm/issues/4661)
- [Drizzle â€” Upsert onConflictDoUpdate](https://orm.drizzle.team/docs/guides/upsert)
- [Next.js 16 â€” Forms with Server Actions](https://nextjs.org/docs/app/guides/forms)
- [React 19 â€” useActionState](https://react.dev/reference/react/useActionState)
- [DESIGN.md Â§Colors/Typography] â€” tokens (`bg-surface`, `bg-surface-alt`, `border-border`, `text-text-muted`)
- [EXPERIENCE.md Â§Component Patterns] â€” card/button/form specs
- [src/lib/schema.ts] â€” `tierEnum`, `companySubscription`, pattern `check()` + `sql`
- [src/lib/permissions.ts] â€” `Role` += `superadmin` (story 7-2), `requirePermission()`

---

## Developer Context

### Source : Epic 7 spec

`Docs/business/owner-subscription-management.md` â€” Â§3.8 Â« ParamÃ¨tres plateforme `/owner/settings` Â» + Â§3.6 Â« Notifications & rappels Â» + Â§7 Â« ParamÃ¨tres retenus pour Epic 7 Â». Epic 7 N'EST PAS dans `_bmad-output/planning-artifacts/epics.md` â€” ce document de brainstorming est la source autoritaire (validÃ© pour promotion en Epic 7 BMAD).

### Stories de l'Epic 7 (cross-context)

| Story | Titre | Statut | DÃ©pendance 7-12 |
|---|---|---|---|
| 7-1 | Schema tenants + middleware subdomain | ready-for-dev | HARD (constants Ã  externaliser) |
| 7-2 | Dashboard owner + liste tenants | ready-for-dev | HARD (superadmin, owner layout) |
| 7-3 | CrÃ©ation manuelle tenant + email bienvenue | ready-for-dev | SOFT (lit trial/maxUsers) |
| 7-4 | Enregistrement paiement mobile money | ready-for-dev | â€” (pas d'impact) |
| 7-5 | Suspension manuelle + page expiration | ready-for-dev | HARD (buildOwnerContact, page) |
| 7-6 | Cron expiration + rappels | ready-for-dev | HARD (expiry-job, dispatch) |
| 7-7 | Fiche tenant complÃ¨te (onglets) | ready-for-dev | â€” |
| 7-8 | RÃ©activation aprÃ¨s paiement | ready-for-dev | SOFT (dispatch rÃ©activation) |
| 7-9 | Gestion utilisateurs par tenant | ready-for-dev | SOFT (PLAN_LIMITS) |
| 7-10 | IntÃ©gration Stripe webhook | backlog | â€” (prix Stripe sÃ©parÃ©s) |
| 7-11 | Rapports & export comptabilitÃ© | backlog | â€” |
| **7-12** | **ParamÃ¨tres plateforme** | **ready-for-dev** | **(cette story)** |

### ParamÃ¨tres business retenus (Epic 7 Â§7)

```ts
const DEFAULT_TRIAL_DAYS = 14
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

Ces valeurs deviennent les **dÃ©fauts** (fallback) dans `platform_settings` et les accesseurs `tenant-config.ts`.

---

## Architecture Compliance

| Contrainte | ConformitÃ© story 7-12 |
|---|---|
| Custom tables : `uuid()` IDs | Exception justifiÃ©e : `integer id CHECK id=1` pour singleton (documentÃ©) |
| Migration : `db:generate` + `db:migrate`, jamais `push` | Migration `drizzle/0014_*.sql` gÃ©nÃ©rÃ©e + appliquÃ©e |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | Accesseurs gÃ¨rent les optionnels via conditional spreading ; `rows[0]` guardÃ© |
| FCFA integer (pas de float) | `z.coerce.number().int().nonnegative()` sur tous les prix |
| `apiError()` pour erreurs API | N/A â€” pas d'API route REST (Server Action) ; erreurs via `state.errors` |
| Audit sur toute Ã©criture | `emitAuditEvent` dans `savePlatformSettingsAction` (companyId: null) |
| i18n : toutes chaÃ®nes UI dans `fr-NE.json` | Section `owner.settings` ajoutÃ©e |
| Server Components par dÃ©faut | Page + action serveur ; Client Component uniquement pour le form interactif |
| `requirePermission()` / `requireOwnerAuth()` | `requireOwnerAuth()` en Server Component + Server Action |
| `pnpm check` + `pnpm build` | VÃ©rification finale (T17) |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-12 |
|---|---|---|
| next | 16.1.6 | App Router, Server Actions |
| react | 19.2.4 | `useActionState`, `useFormStatus` |
| drizzle-orm | 0.44.7 | `pgTable`, `check()`, `sql`, `onConflictDoUpdate` |
| zod | 4.4.3 | `platformSettingsSchema` (validation) |
| better-auth | 1.6.11 | Session (via `requireOwnerAuth()` de 7-2) |
| next-intl | 4.13.0 | `getTranslations("owner.settings")` Server Component |
| sonner | 2.0.7 | Toast succÃ¨s aprÃ¨s save |
| lucide-react | 0.539.0 | IcÃ´nes sections |
| vitest | 4.1.9 | Tests unitaires |
| @playwright/test | 1.61.0 | Tests E2E |

**Aucune nouvelle dÃ©pendance Ã  installer.**

---

## File Structure Requirements

| Fichier | Action | RÃ´le |
|---|---|---|
| `src/lib/schema.ts` | **UPDATE** | Ajouter `platformSettings` (singleton, CHECK id=1) |
| `drizzle/0014_*.sql` | **NEW** (gÃ©nÃ©rÃ©) | CREATE TABLE platform_settings + CHECK |
| `src/lib/data/platform-settings.ts` | **NEW** | `getPlatformSettings()` (bootstrap), `upsertPlatformSettings()`, types |
| `src/lib/validation/platform-settings.ts` | **NEW** | `platformSettingsSchema` (Zod) |
| `src/lib/tenants/tenant-config.ts` | **UPDATE** | Ajouter accesseurs async (getTrialDays, getGracePeriodDays, getPlanLimits, getPlanPrices, getNotificationToggle, getNotificationSenderAddress) ; `@deprecated` sur anciennes constantes |
| `src/lib/tenants/tenant-contact.ts` | **UPDATE** | `buildOwnerContact()` async, lit platform_settings |
| `src/app/subscription-expired/page.tsx` | **UPDATE** | `await buildOwnerContact()` + expiryMessage conditionnel |
| `src/lib/tenants/expiry-job.ts` | **UPDATE** | `await getGracePeriodDays()` ; supprimer TODO(story-7-12) |
| `src/app/api/v1/owner/tenants/route.ts` | **UPDATE** | CrÃ©ation tenant lit `await getTrialDays()` + `await getPlanLimits()` |
| `src/lib/notifications/*.ts` (dispatch) | **UPDATE** | Gate `await getNotificationToggle(type)` avant envoi |
| `src/app/owner/settings/actions.ts` | **NEW** | Server Action `savePlatformSettingsAction` |
| `src/app/owner/settings/page.tsx` | **NEW** | Server Component (requireOwnerAuth + SSR seed) |
| `src/app/owner/settings/_components/platform-settings-form.tsx` | **NEW** | Client Component (5 sections, useActionState) |
| `src/messages/fr-NE.json` | **UPDATE** | Section `owner.settings` |
| `tests/unit/platform-settings.test.ts` | **NEW** | Vitest (bootstrap, upsert, validation) |
| `tests/unit/tenant-config-accessors.test.ts` | **NEW** | Vitest (accesseurs + fallback) |
| `tests/e2e/owner-settings.spec.ts` | **NEW** | Playwright (403, affichage, modification) |

**Ne PAS modifier :** `tierEnum`/`tenantPlanEnum` (dÃ©cision diffÃ©rÃ©e), `src/lib/quota/quota-config.ts` (TIER_QUOTAS, story 6-2), `src/proxy.ts`, tables domaines (clients/quotes/clauses/company), `companySubscription`, Stripe/webhook (7-10), rapports (7-11).

---

## Testing Requirements

### Tests unitaires (Vitest)

- `tests/unit/platform-settings.test.ts` :
  - `getPlatformSettings()` bootstrap singleton quand table vide (insÃ¨re id=1 avec defaults)
  - Concurrence : `Promise.all([getPlatformSettings(), getPlatformSettings()])` sur table vide â†’ 1 seul INSERT, pas d'erreur
  - `upsertPlatformSettings({ gracePeriodDays: 10 })` met Ã  jour la ligne existante, retourne la ligne
  - Validation Zod (cas paramÃ©trÃ©s) : prix nÃ©gatif, prix dÃ©cimal, grace=31, trial=0/61, maxUsers=0, email invalide â†’ rejet
- `tests/unit/tenant-config-accessors.test.ts` :
  - `getTrialDays()` / `getGracePeriodDays()` / `getPlanLimits()` / `getPlanPrices()` : retournent DB si prÃ©sent, fallback constantes sinon
  - `getNotificationToggle("reminderJ7")` : false quand dÃ©sactivÃ©, true sinon
  - `buildOwnerContact()` : fallback env vars puis hardcoded quand DB vide

### Tests E2E (Playwright)

- `tests/e2e/owner-settings.spec.ts` :
  - Login admin/commercial/operateur â†’ GET /owner/settings â†’ 403/redirect
  - Login superadmin â†’ /owner/settings â†’ 5 sections visibles
  - Modifier `priceProMonthly` 25000 â†’ 30000 â†’ enregistrer â†’ recharger â†’ valeur persistÃ©e
  - Validation : `gracePeriodDays` = 31 â†’ erreur inline affichÃ©e, pas de save

### Seeding

- User superadmin (si pas seedÃ© en 7-2) :
  ```sql
  INSERT INTO "user" (id, name, email, role, "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), 'Owner', 'owner@maigatechlab.com', 'superadmin', now(), now());
  ```
- Aucun seed platform_settings requis â€” le bootstrap est automatique (AC7)

### Tests existants

- VÃ©rifier qu'aucune rÃ©gression sur les tests des stories 7-1 Ã  7-9 (les consumers refactorisÃ©s doivent rester fonctionnels)
- Les tests 7-6 qui mockent `DEFAULT_GRACE_PERIOD_DAYS` doivent continuer Ã  passer (la constante est conservÃ©e comme fallback)

---

## Previous Story Intelligence

**Story 7-9 (tenant user mgmt) :** Lit `tenant.maxUsers` depuis la DB au runtime (pas directement PLAN_LIMITS). Le refactor de PLAN_LIMITS en accesseur async impacte principalement la CRÃ‰ATION tenant (7-3, T8) â€” pas 7-9 lui-mÃªme. VÃ©rifier que les tests 7-9 ne cassent pas.

**Story 7-6 (cron expiry) :** Contient un `TODO(story-7-12)` explicite dans `expiry-job.ts` â€” point prÃ©cis du refactor (T7). La constante `DEFAULT_GRACE_PERIOD_DAYS` reste le fallback. Les tests 7-6 qui mockent cette constante continuent Ã  passer.

**Story 7-5 (suspension + page) :** `buildOwnerContact()` est initialement sync (lit env vars). La convertir en async (T5) peut casser les appelants â€” vÃ©rifier tous les imports.

**Story 7-2 (superadmin) :** Ã‰tablit le pattern `requireOwnerAuth()` + layout `src/app/owner/`. Cette story suit exactement ce pattern pour `/owner/settings`.

**Story 2-3 (company config) :** Pattern formulaire config (SSR seed + Client Component + native state). Cette story modernise avec `useActionState` (React 19 disponible dans le repo).

---

## Git Intelligence Summary

**Commits rÃ©cents pertinents :**
- `a637dfe` fix: /register redirect, logout button (baseline Epic 7)
- `a5d9e2e` test(qa): API unit tests + Playwright E2E specs
- `a4f6977` feat(6-3): immutable audit trail export (pattern `emitAuditEvent`)
- `f57a515` feat(6-2): tier quota enforcement (tierEnum starter/pro/entreprise â€” source de la divergence)
- `725f64b` feat(3-9/3-10/3-11/6-1): lifecycle, search/filter, duplicate, IndexedDB encryption

**Pattern Ã©tabli :**
- Baseline commit pour toutes les stories Epic 7 : `a637dfe`
- Audit events via `emitAuditEvent(createAuditEvent({...}))` â€” pattern stable depuis 6-3
- Refactor externalisation : cette story suit le pattern "constante â†’ config DB" classique (ex: `OWNER_WHATSAPP` env â†’ DB)

---

## Latest tech Information

- **Drizzle 0.44.7 â€” CHECK constraints :** Bug #4661 â€” les CHECK avec opÃ©rateurs gÃ©nÃ¨rent parfois du SQL paramÃ©trÃ© invalide. Utiliser `sql\`id = 1\`` (littÃ©ral string) et vÃ©rifier le `.sql` gÃ©nÃ©rÃ©. Source : [Drizzle #4661](https://github.com/drizzle-team/drizzle-orm/issues/4661).
- **Drizzle â€” Upsert singleton :** `onConflictDoUpdate({ target: platformSettings.id, set: {...} })` est le pattern canonique pour upsert singleton. Pas besoin de `excluded` (passage de l'objet complet au `set`). Source : [Drizzle upsert guide](https://orm.drizzle.team/docs/guides/upsert).
- **React 19 â€” `useActionState` :** Signature `(action, initialState) => [state, action, isPending]`. `isPending` disponible sans `useFormStatus` si le bouton est dans le mÃªme composant. Source : [React docs](https://react.dev/reference/react/useActionState).
- **Next.js 16 â€” Server Actions :** Toujours `async`, retournent une valeur sÃ©rialisable. `"use server"` en tÃªte de fichier ou par fonction. Source : [Next.js forms guide](https://nextjs.org/docs/app/guides/forms).
- **Checkboxes + FormData :** Checkbox unchecked â†’ absent de FormData. Normaliser `formData.get(name) === "on"` cÃ´tÃ© action avant validation (ne pas se fier Ã  `z.coerce.boolean()` seul).

---

## Project Context Reference

- `_bmad-output/project-context.md` Â§Database Rules : uuid pour custom tables (exception singleton documentÃ©e), migration generate+migrate
- Â§TypeScript Strict : `exactOptionalPropertyTypes` (conditional spreading), `noUncheckedIndexedAccess` (guard `rows[0]`)
- Â§Permissions : `requirePermission()` / `requireOwnerAuth()` pour guards
- Â§Audit : `emitAuditEvent` best-effort, `companyId` (null pour owner)
- Â§Money/Financial : FCFA integer (`z.coerce.number().int().nonnegative()`)
- Â§i18n : toutes chaÃ®nes dans `fr-NE.json`, `getTranslations()` Server Component
- Â§Code Quality : `pnpm check` = lint + typecheck + vitest ; `pnpm build` = db:migrate + next build
- Â§Naming : kebab-case fichiers, PascalCase composants, UPPER_SNAKE constantes

---

## Assumptions

1. Les stories 7-1, 7-2, 7-5, 7-6 seront fusionnÃ©es avant 7-12 (HARD dependencies). Si non, le dev doit les implÃ©menter d'abord ou coordonner.
2. La dÃ©cision tierEnum unification est **dÃ©fÃ©rÃ©e au parent** (recommandation : unifier sur `free`/`pro`/`enterprise`). En attendant, cette story est neutre.
3. `platform_settings` utilise une ligne singleton `integer id CHECK id=1` (exception Ã  la rÃ¨gle uuid, justifiÃ©e).
4. Les prix XOF sont une **rÃ©fÃ©rence commerciale** â€” les vrais `price_id` Stripe restent dans le dashboard Stripe (story 7-10).
5. Les modifications de config s'appliquent aux **nouvelles computations** uniquement (pas rÃ©troactif).
6. `getPlatformSettings()` n'est PAS cachÃ©e en MVP (lecture directe, ~0.1ms ; cache V2 deferred).
7. Le bloc `notifications` est `jsonb` (flexibilitÃ© pour ajouter des types sans migration).
8. Les anciennes constantes sync dans `tenant-config.ts` sont conservÃ©es comme fallback et marquÃ©es `@deprecated`.
9. L'historique des emails envoyÃ©s par tenant (spec Â§3.6) est **exclu** (table `sent_emails` dÃ©diÃ©e dans une story ultÃ©rieure).
10. La liste des types de notifications (7 toggles) correspond aux emails des stories 7-3/7-5/7-6/7-8 ; si de nouveaux types Ã©mergent, ils s'ajoutent au jsonb sans migration.

---

## Dev Agent Record

### Agent Model Used

Claude (Sonnet 4.6), via Claude Code â€” bmad-dev-story workflow, single continuous session (2026-07-04).

### Debug Log References

- `pnpm db:generate` â†’ `drizzle/0018_great_red_skull.sql` : `CHECK (id = 1)` gÃ©nÃ©rÃ© en littÃ©ral dÃ¨s le premier essai (pas de bug Drizzle #4661 rencontrÃ©).
- `pnpm build` a Ã©chouÃ© une premiÃ¨re fois : `src/app/checkout/checkout-form.tsx` (Client Component) importe `PLAN_PRICES_XOF` depuis `tenant-config.ts` ; en y ajoutant les accesseurs async (qui importent `@/lib/data/platform-settings` â†’ `@/lib/db` â†’ `postgres`), webpack tentait de bundler `net`/`tls`/`fs`/`perf_hooks` cÃ´tÃ© client. RÃ©solu en extrayant tous les accesseurs async dans un nouveau module serveur-only `src/lib/tenants/platform-config.ts`, laissant `tenant-config.ts` avec uniquement des constantes/types (voir Completion Notes).
- Smoke test manuel (curl + script `auth.api.getSession` direct, `.tmp/check-session.mjs`) a rÃ©vÃ©lÃ© que `session.user.role` Ã©tait `undefined` mÃªme pour un superadmin rÃ©el â€” cause : `src/lib/auth.ts` ne dÃ©clarait pas `user.additionalFields` pour `role`/`companyId`. Voir Completion Notes.
- `npx playwright test e2e/owner-settings.spec.ts` Ã©choue Ã  la phase de chargement (`TypeError: context.conditions?.includes is not a function`) â€” reproduit Ã  l'identique sur `e2e/owner-suspend-tenant.spec.ts` (spec non modifiÃ©e) : bug Playwright/env prÃ©existant, dÃ©jÃ  signalÃ© stories 7-7 Ã  7-11.

### Completion Notes List

- **T1â€“T3** : table singleton `platform_settings` (`integer id CHECK (id=1)`, exception documentÃ©e Ã  la rÃ¨gle uuid) + `src/lib/data/platform-settings.ts` (bootstrap race-safe via `onConflictDoNothing`, upsert via `onConflictDoUpdate`) + schÃ©ma Zod `platformSettingsSchema`. Migration `drizzle/0018_great_red_skull.sql` gÃ©nÃ©rÃ©e et appliquÃ©e (le projet en Ã©tait dÃ©jÃ  Ã  0017, pas 0014 comme supposÃ© par la story â€” sans impact).
- **T4/dÃ©viation architecturale** : les accesseurs async (`getTrialDays`, `getGracePeriodDays`, `getPlanLimits`, `getPlanPrices`, `getOwnerContact`, `getNotificationToggle`, `getNotificationSenderAddress`) ont Ã©tÃ© placÃ©s dans un **nouveau fichier** `src/lib/tenants/platform-config.ts`, PAS dans `tenant-config.ts` comme dÃ©crit dans les Dev Notes de la story. Raison : `tenant-config.ts` est importÃ© par le Client Component `src/app/checkout/checkout-form.tsx` (pour `PLAN_PRICES_XOF`) ; y ajouter un import (mÃªme dynamique) vers la couche DB casse le build webpack (Node builtins `net`/`tls`/`fs` non rÃ©solvables cÃ´tÃ© navigateur). `tenant-config.ts` ne contient plus que les constantes/types synchrones (fallback + types partagÃ©s) ; `platform-config.ts` est serveur-only et importÃ© uniquement par les consumers serveur (create-tenant, suspend, reactivate, expiry-job).
- **T5â€“T9** : `buildOwnerContact()` (tenant-contact.ts) converti en async, lit `platform_settings` avec fallback env â†’ hardcoded. `expiry-job.ts` lit `getGracePeriodDays()` et gate les 5 emails concernÃ©s (`reminderJ7/J3/J1`, `expiryNotification`) par leur toggle platform_settings ; `create-tenant.ts` lit `getTrialDays()`/`getPlanLimits()` et gate `trialWelcome` ; `suspend.ts` gate `suspensionNotification` ; `reactivate.ts` gate `reactivationNotification`. `sendEmail()` (`src/lib/email.ts`) accepte dÃ©sormais un `from?` optionnel, alimentÃ© par `getNotificationSenderAddress()` sur les 5 emails gatÃ©s (le "sender address" n'Ã©tait pas overridable auparavant). `subscription-expired/page.tsx` affiche `platformSettings.expiryMessage` si non vide.
- **T10â€“T13** : Server Action `savePlatformSettingsAction` (premiÃ¨re Server Action du projet â€” pattern `useActionState`/`useFormStatus` introduit ici), page `/owner/settings` (Server Component, SSR seed), formulaire client 5 sections. Lien "ParamÃ¨tres" activÃ© dans `src/app/owner/layout.tsx` (Ã©tait en "BientÃ´t disponible"). Checkboxes normalisÃ©es cÃ´tÃ© action via `formData.get(name) === "on"` avant Zod (absent = false).
- **T14â€“T16** : Le chemin de test rÃ©el du projet est `src/**/*.test.ts` (Vitest colocated) et `e2e/*.spec.ts` (Playwright) â€” PAS `tests/unit/` ni `tests/e2e/` comme indiquÃ© dans le PÃ©rimÃ¨tre de la story (config Vitest : `include: ["src/**/*.test.ts", ...]` ; aucun dossier `tests/` n'existe dans le repo). Tests Ã©crits aux emplacements rÃ©els : `src/lib/data/platform-settings.test.ts`, `src/lib/validation/platform-settings.test.ts`, `src/lib/tenants/platform-config.test.ts`, `e2e/owner-settings.spec.ts`.
- **T17** : `pnpm check` (lint 0 erreur / typecheck 0 erreur / 832 tests passent, 0 rÃ©gression) + `pnpm build` (succÃ¨s, route `/owner/settings` listÃ©e en Æ’ dynamique) â€” voir aussi la dÃ©viation critique ci-dessous.
- **DÃ©cision tierEnum (AC10)** : non tranchÃ©e dans cette story, comme prescrit â€” `tierEnum`/`tenantPlanEnum` non modifiÃ©s, `platform_settings` utilise les clÃ©s `{free, pro, enterprise}`. Flag maintenu pour le parent (voir Dev Notes de la story).
- **CRITIQUE â€” bug transversal dÃ©couvert et corrigÃ© (hors pÃ©rimÃ¨tre initial mais bloquant pour vÃ©rifier CETTE story)** : `src/lib/auth.ts` ne dÃ©clarait pas `user.additionalFields` pour Better Auth. RÃ©sultat rÃ©el en conditions de login normales : `session.user.role` est toujours `undefined`, donc **tout** garde de rÃ´le de l'application (`requireOwnerAuth`, `requireOwnerSession`, `can()`, `requirePermission()` â€” 23 fichiers identifiÃ©s) retombe silencieusement sur `"commercial"` et bloque tout utilisateur rÃ©el, y compris un superadmin rÃ©el, de toutes les routes protÃ©gÃ©es par rÃ´le. MasquÃ© jusqu'ici car (1) tous les tests unitaires mockent la session directement (jamais de vraie sÃ©rialisation Better Auth) et (2) tous les specs E2E sont bloquÃ©s par le bug Playwright/env prÃ©existant (jamais exÃ©cutÃ©s rÃ©ellement). ConfirmÃ© par appel direct `auth.api.getSession()` avec un vrai cookie de session avant/aprÃ¨s le fix. CorrigÃ© en ajoutant `user.additionalFields: { role, companyId }` (`input: false` â€” ces champs ne sont jamais modifiables via sign-up/update-user) dans `src/lib/auth.ts`. ValidÃ© : `/owner/settings` â†’ 200 pour un superadmin rÃ©el, 307 (redirect `/`) pour un compte `commercial` rÃ©el, aucune rÃ©gression sur les 832 tests ni sur le build. Note explicative ajoutÃ©e Ã  `_bmad-output/project-context.md` (Â§Auth check pattern) pour Ã©viter la rÃ©gression sur un futur champ de session.
- **E2E non exÃ©cutÃ©** : `e2e/owner-settings.spec.ts` Ã©crit (403 non-superadmin, 5 sections visibles, modification prix persistÃ©e, validation grace>30) mais bloquÃ© par le bug Playwright/env prÃ©existant (reproduit sur spec non modifiÃ©e `owner-suspend-tenant.spec.ts`). VÃ©rification manuelle effectuÃ©e Ã  la place via `curl` + session rÃ©elle (superadmin â†’ 200 avec titre + champ `priceProMonthly` prÃ©sents ; commercial â†’ 307).

### File List

**CrÃ©Ã©s :**
- `src/lib/data/platform-settings.ts`
- `src/lib/data/platform-settings.test.ts`
- `src/lib/validation/platform-settings.ts`
- `src/lib/validation/platform-settings.test.ts`
- `src/lib/tenants/platform-config.ts`
- `src/lib/tenants/platform-config.test.ts`
- `src/app/owner/settings/actions.ts`
- `src/app/owner/settings/page.tsx`
- `src/app/owner/settings/_components/platform-settings-form.tsx`
- `e2e/owner-settings.spec.ts`
- `drizzle/0018_great_red_skull.sql` (+ `drizzle/meta/0018_snapshot.json`, `drizzle/meta/_journal.json` mis Ã  jour)

**ModifiÃ©s :**
- `src/lib/schema.ts` â€” table `platformSettings` (singleton, CHECK id=1) + import `check`
- `src/lib/auth.ts` â€” `user.additionalFields` (role, companyId) â€” fix transversal, voir Completion Notes
- `src/lib/email.ts` â€” `sendEmail()` accepte `from?`
- `src/lib/tenants/tenant-config.ts` â€” rÃ©duit aux constantes/types synchrones (accesseurs dÃ©placÃ©s)
- `src/lib/tenants/tenant-contact.ts` â€” `buildOwnerContact()` async
- `src/lib/tenants/tenant-contact.test.ts`
- `src/lib/tenants/tenant-dates.ts` â€” `calculateTrialDates({ trialDays? })`
- `src/lib/tenants/create-tenant.ts` / `.test.ts`
- `src/lib/tenants/suspend.ts` / `.test.ts`
- `src/lib/tenants/cancel.ts` / `.test.ts`
- `src/lib/tenants/reactivate.ts` / `.test.ts`
- `src/lib/cron/expiry-job.ts` / `.test.ts`
- `src/app/subscription-expired/page.tsx`
- `src/app/owner/layout.tsx` â€” lien "ParamÃ¨tres" activÃ©
- `src/messages/fr-NE.json` â€” section `owner.settings`
- `_bmad-output/project-context.md` â€” note additionalFields
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**SupprimÃ© :**
- `src/lib/tenants/tenant-config-accessors.test.ts` (remplacÃ© par `src/lib/tenants/platform-config.test.ts`, suite au dÃ©placement T4)

### Review Findings

- [x] [Review][Dismissed] Decision resolue: accepter `platform-config.ts` comme module serveur-only officiel -- Confirmer le contrat d'export des accesseurs plateforme — AC8 demande `getTrialDays()`, `getGracePeriodDays()`, `getPlanLimits()`, `getPlanPrices()`, `getOwnerContact()` et `getNotificationToggle()` depuis `src/lib/tenants/tenant-config.ts`, mais l'implementation les deplace dans `src/lib/tenants/platform-config.ts` pour eviter de bundler la DB dans `checkout-form.tsx`. Choix requis: accepter officiellement `platform-config.ts` comme module serveur-only, ou maintenir une compatibilite d'import depuis `tenant-config.ts` sans casser le client bundle.
- [x] [Review][Dismissed] Decision resolue: garder les prix reference-only pour 7-12 -- Clarifier si les prix plateforme pilotent checkout/rapports ou restent une reference commerciale — `getPlanPrices()` existe, mais `src/lib/stripe/create-checkout-session.ts:59`, `src/app/checkout/checkout-form.tsx:38` et `src/lib/owner/reports.ts:181` utilisent encore `PLAN_PRICES_XOF`. AC2 dit que ces prix sont une reference commerciale et que les abonnements Stripe existants ne sont pas affectes; il faut confirmer si les nouvelles sessions Stripe, l'affichage checkout et les forecasts doivent lire la DB ou rester statiques.
- [x] [Review][Patch] Le message Zod pour prix decimal n'est pas le message FR requis [src/lib/validation/platform-settings.ts:14]
- [x] [Review][Patch] Les defaults `EMAIL_FROM` peuvent inserer une adresse avec display-name incompatible avec le formulaire email [src/lib/data/platform-settings.ts:21]
- [x] [Review][Patch] `getTenantAdminEmail()` peut choisir un admin revoque (`disabledAt` non null) comme destinataire lifecycle [src/lib/tenants/tenant-contact.ts:12]
- [x] [Review][Patch] L'edition de plan tenant continue d'utiliser `PLAN_LIMITS` statique au lieu de `getPlanLimits()` [src/lib/tenants/update-tenant.ts:50]
- [x] [Review][Patch] La validation accepte des entiers trop grands pour les colonnes PostgreSQL `integer` [src/lib/validation/platform-settings.ts:14]
- [x] [Review][Patch] Le log succes requis "Parametres plateforme mis a jour" manque apres sauvegarde [src/app/owner/settings/actions.ts:92]
- [x] [Review][Patch] Le test E2E modifie `platform_settings` sans restaurer l'etat singleton [e2e/owner-settings.spec.ts:47]
- [x] [Review][Patch] AC12 reste sous-couvert: roles non-superadmin incomplets, assertion `getPlanPrices()` absente, messages de validation non verifies exactement [e2e/owner-settings.spec.ts:51]
- [x] [Review][Defer] Provisioning Stripe utilise encore `PLAN_LIMITS` pour `maxUsers` [src/lib/stripe/handle-checkout-completed.ts:115] — deferred, pre-existing / Stripe explicitement hors scope 7-12
- [x] [Review][Defer] Emails Stripe et annulation n'appliquent pas uniformement le sender plateforme [src/lib/stripe/handle-checkout-completed.ts:195] — deferred, pre-existing / hors liste des toggles AC6
- [x] [Review][Defer] Idempotence reminder cron race-prone en executions concurrentes [src/lib/cron/expiry-job.ts:93] — deferred, pre-existing / tradeoff deja documente dans le code

### Change Log
- Story 7-12 crÃ©Ã©e : paramÃ¨tres plateforme (prix, quotas, grace period, contenu tenant, notifications) â€” table singleton platform_settings + externalisation des constantes tenant-config.ts + refactor consumers (expiry-job, tenant-contact, crÃ©ation tenant, dispatch emails) â€” Epic 7 Â§3.8 + Â§3.6 + Â§7 (Date: 2026-06-28)
- DÃ©cision tierEnum unification FLAGUÃ‰E pour confirmation parent (recommandation : unifier sur free/pro/enterprise via story dÃ©diÃ©e)
- Story 7-12 implÃ©mentÃ©e (2026-07-04) : table `platform_settings` + data layer + validation Zod + accesseurs async (dÃ©placÃ©s dans `platform-config.ts` pour raison webpack/client-bundle, voir Completion Notes) + refactor des 5 consumers (welcome/reminders/expiry/suspension/rÃ©activation) + page `/owner/settings` (Server Action, `useActionState`) + i18n. 832/832 tests, `pnpm check` et `pnpm build` verts. Fix transversal additionnel : `user.additionalFields` manquant dans Better Auth (role/companyId jamais exposÃ©s sur `session.user` en conditions rÃ©elles â€” bloquait silencieusement tous les gardes de rÃ´le de l'app). E2E Ã©crit mais bloquÃ© par le bug Playwright/env prÃ©existant ; vÃ©rifiÃ© manuellement via session rÃ©elle (curl).
