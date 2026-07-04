---
story_key: 7-6-expiry-cron-automated-reminders
epic_num: 7
story_num: 6
status: done
baseline_commit: "a637dfe"  # dernier commit master au moment de la création
depends_on:
  - "7-1-tenants-schema-subdomain-middleware (schema tenants + tenant_events + user.tenantId + enums + tenant-config.ts DEFAULT_GRACE_PERIOD_DAYS + enforceTenantAccess) — HARD"
  - "7-3-create-tenant-welcome-email (pattern sendEmail + buildXxxHtml, tenant_events insert) — SOFT (réutilise les patterns)"
  - "7-5-manual-suspension-expiry-page (page /subscription-expired + enforcement read-only côté proxy) — SOFT (le cron pose le statut suspended que 7-5 affiche)"
---

# Story 7.6 : Cron expiration + rappels automatiques

**Statut :** done

## Story

**En tant que** plateforme SaaS (Maiga Tech Lab),
**Je veux** qu'un job planifié quotidien calcule les jours restants avant `subscriptionEnd` de chaque tenant, envoie des emails de rappel à J-7 / J-3 / J-1, suspende automatiquement à J0 en l'absence de paiement couvrant la période, et confirme la suspension effective à l'expiration de la période de grâce,
**Afin que** les clients soient relancés en temps utile, que les impayés passent automatiquement en lecture seule sans intervention manuelle du owner, et que le proxy (story 7-1) puisse appliquer l'enforcement en lisant le statut posé par ce cron.

---

## Critères d'acceptation (BDD)

**AC1 — Job planifié quotidien déclenché par Vercel Cron (authentifié par CRON_SECRET)**

```
GIVEN  une route GET /api/cron/expiry-reminders
WHEN   Vercel Cron l'invoque (production uniquement — header Authorization: Bearer <CRON_SECRET>)
THEN   la route vérifie que request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
AND    si le header est absent ou ne correspond pas → 401 UNAUTHORIZED via apiError("UNAUTHORIZED", ...)
AND    si CRON_SECRET n'est pas configuré → 500 INTERNAL_ERROR ("CRON_SECRET manquant")
AND    le corps répond 200 { processed: { reminders: N, suspended: M, graceExpired: K }, at: <ISO> }
       après exécution (pas de streaming — exécution synchrone complète)
AND    la configuration du cron est déclarée dans vercel.json (fichier à CRÉER à la racine du repo)
       avec schedule "17 3 * * *" (quotidien à 03:17 UTC — minute off-peak, jamais :00/:30)
```

> **Note Vercel :** Vercel Cron ne fonctionne QUE sur le déploiement de **production**. En dev local, déclencher manuellement via `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expiry-reminders`. Hobby plan limite à 2 jobs daily-minimum (compatible avec cette story : 1 job quotidien).

**AC2 — Décision de seuil J-7 / J-3 / J-1 (fonction pure, testable avec `now` injecté)**

```
GIVEN  un tenant avec status ∈ {active, trial}, subscriptionEnd défini, plan ≠ free
       (les tenants free n'expirent jamais — pas de rappel)
WHEN   computeReminderAction({ subscriptionEnd, status, plan }, now) est appelé
THEN   la fonction retourne un type discriminé :
         - { kind: "none" }                                    si joursRestants ∉ {7,3,1} ou déjà expiré ou plan free
         - { kind: "reminder"; stage: "first" | "second" | "urgent"; daysRemaining: number }
           quand joursRestants ∈ {7 → first, 3 → second, 1 → urgent}
         - { kind: "expired" }                                 si subscriptionEnd <= now (J0 atteint)
         - { kind: "grace-expired" }                           si status=suspended ET gracePeriodEndsAt <= now
AND    les seuils 7/3/1 sont des CONSTANTES exportées (REMINDER_THRESHOLDS_DAYS = [7,3,1])
AND    daysRemaining est calculé en jours calendaires (floor(différence de dates à minuit UTC),
       PAS en millisecondes — éviter les erreurs d'arrondi/DST)
```

**AC3 — Envoi des rappels email J-7 / J-3 / J-1 (idempotent)**

```
GIVEN  computeReminderAction retourne { kind: "reminder", stage }
WHEN   le job traite le tenant
THEN   un email est envoyé via sendEmail() (src/lib/email.ts — Resend, déjà configuré)
        avec un template HTML dédié au stage (buildReminderEmailHtml / Text)
        contenant : nom du tenant, date d'expiration (formatée FR), jours restants,
                    URL du tenant (https://{slug}.{APEX_DOMAIN}), contact owner (OWNER_CONTACT)
AND    le sujet varie par stage :
         - first (J-7)  : "Votre abonnement expire dans 7 jours"
         - second (J-3): "Rappel : votre abonnement expire dans 3 jours"
         - urgent (J-1): "Urgent : votre abonnement expire demain"
AND    l'adresse destinataire est l'email du user admin du tenant
        (le premier user WHERE tenantId = tenant.id AND role = 'admin' — il en existe au moins un, créé en 7-3)
AND    un événement tenant_events est inséré : eventType = 'reminder_sent',
        note = stage ('first'|'second'|'urgent'), actorId = 'system' (user_id spécial pour le cron)
```

**AC4 — Idempotence : aucun rappel renvoyé pour le même stage**

```
GIVEN  un tenant pour lequel un tenant_events eventType='reminder_sent' avec note='first'
       a DÉJÀ été inséré (rappel J-7 déjà envoyé)
WHEN   le job s'exécute à nouveau (ex: redéclenchement manuel ou cron consécutif)
THEN   la fonction hasReminderBeenSent(tenantId, stage, db) retourne true
AND    le job NE renvoie PAS l'email J-7 une seconde fois
AND    aucun nouvel événement 'reminder_sent' n'est inséré pour ce stage
AND    le check se fait AVANT l'envoi (SELECT 1 FROM tenant_events WHERE tenantId=? AND eventType='reminder_sent' AND note=? LIMIT 1)
AND    l'insertion de l'événement se fait APRÈS un envoi réussi (sendEmail résout sans throw)
       — fenêtre de double-envoi acceptable en cas de crash entre sendEmail et insert
       (le prochain cycle ne renverra pas car l'event sera présent)
```

**AC5 — Suspension automatique à J0 (subscriptionEnd <= now, pas de paiement couvrant la période)**

```
GIVEN  computeReminderAction retourne { kind: "expired" }
       (subscriptionEnd <= now, status ∈ {active, trial})
WHEN   le job vérifie les paiements : hasPaymentCoveringPeriod(tenant, db)
THEN   si AUCUN subscription_payments WHERE tenantId=? AND periodEnd >= tenant.subscriptionEnd
       n'existe (i.e. pas de paiement couvrant la période expirée) :
         - UPDATE tenants SET status = 'suspended',
                              gracePeriodEndsAt = now + DEFAULT_GRACE_PERIOD_DAYS (7 jours)
         - envoi email "expiration" (buildExpiryEmailHtml) informant de la suspension + durée de grâce
         - INSERT tenant_events eventType='suspended', actorId='system',
                  before={status}, after={status, gracePeriodEndsAt}, note='auto-suspended (J0, no payment)'
AND    si un paiement couvre la période → le tenant reste actif/trial (le renouvellement a été enregistré en 7-4),
       aucun changement de statut, mais logguer un événement note='payment covers period, skipped'
AND    un tenant déjà suspended n'est PAS re-suspendu (guard status check avant UPDATE)
AND    un tenant cancelled n'est JAMAIS traité par ce cron (exclu du SELECT initial)
```

**AC6 — Confirmation suspension effective après expiration de la grâce**

```
GIVEN  un tenant avec status = 'suspended' ET gracePeriodEndsAt <= now
       (période de grâce écoulée sans paiement régularisateur)
WHEN   computeReminderAction retourne { kind: "grace-expired" }
THEN   le statut reste 'suspended' (déjà posé en AC5) — AUCUNE mutation de statut nécessaire
       (l'enforcement read-only est déjà appliqué par le proxy depuis 7-1 qui lit status='suspended')
AND    si ce n'est pas déjà fait, on pose/maintient gracePeriodEndsAt tel quel (pas de reset)
AND    un événement tenant_events eventType='suspended' note='grace expired (read-only confirmed)'
       est inséré UNIQUEMENT si aucun événement 'grace expired' n'existe déjà pour ce tenant
       (idempotence — éviter le spam d'événements quotidiens)
AND    l'accès client reste en lecture seule (le proxy 7-1 redirige vers /subscription-expired sur status='suspended')
```

> **Note :** la suspension "effective" est purement un état de donnée — c'est le **proxy (story 7-1)** qui applique l'enforcement (redirect vers `/subscription-expired` pour status `suspended`/`cancelled`). Ce cron ne fait QUE poser/maintenir le statut. Voir Dev Notes pour le contrat 7-6 (écrit) → 7-1 (lit).

**AC7 — Pas de rappel ni suspension pour les tenants exclus**

```
GIVEN  un tenant avec status = 'cancelled'
WHEN   le job sélectionne les tenants à traiter
THEN   le tenant est EXCLU (jamais de rappel, jamais de re-suspension)
       — requête initiale WHERE status IN ('active', 'trial', 'suspended') ET plan != 'free'
AND    un tenant plan = 'free' est EXCLU (free n'expire jamais — gratuit à vie par spec Epic 7 §7)
AND    un tenant sans subscriptionEnd (NULL) est EXCLU (pas d'échéance → pas de rappel)
AND    un tenant sans user admin (anomalie) est SKIPPé avec log warning
       (ne fait pas échouer le job entier)
```

**AC8 — Robustesse : un tenant en erreur ne fait pas échouer tout le job**

```
GIVEN  plusieurs tenants à traiter
WHEN   l'envoi email échoue pour un tenant (Resindown, réseau)
THEN   l'erreur est catchée par tenant, loggée (console.error), et le job continue les autres tenants
AND    aucun événement 'reminder_sent' n'est inséré pour ce tenant (sendEmail a throw avant l'insert)
       → le rappel sera retenté au prochain cycle (idempotence préservée)
AND    la réponse finale inclut un compteur { errors: K } avec la liste des tenantIds en échec
AND    si la requête DB initiale (SELECT tenants) échoue → 500 INTERNAL_ERROR complet (échec du job)
```

**AC9 — Email de bannière de grâce non requis ici (UI = story 7-5)**

```
GIVEN  un tenant en période de grâce (status=suspended, gracePeriodEndsAt > now)
WHEN   le client accède à l'app
THEN   l'affichage de la bannière d'alerte est DEFERRED à la story 7-5 (lit le header x-tenant-grace posé par 7-1)
       — cette story ne crée AUCUNE UI, AUCUN composant, AUCUNE page
AND    aucun email spécifique "grace" n'est envoyé pendant la grâce (le mail d'expiration AC5 suffit)
```

**AC10 — Qualité & tests**

```
GIVEN  les fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
AND    tests unitaires (Vitest) couvrent :
         - computeReminderAction : J-7/J-3/J-1, J0 expired, grace-expired, free exclus, cancelled n/a,
           NULL subscriptionEnd, seuils frontières (J-8/J-6/J-2/J+1), injection de `now`
         - hasReminderBeenSent : true/false selon tenant_events
         - hasPaymentCoveringPeriod : true/false selon subscription_payments
         - buildReminderEmailHtml (3 stages) : escaping HTML du nom/URL/dates, structure
         - buildExpiryEmailHtml : contenu suspension + grâce + contact owner
         - runExpiryJob : orchestration mockée (db + sendEmail) — idempotence, skip free/cancelled,
           suspension J0, skip si paiement couvre, isolation erreur (1 tenant KO ne bloque pas les autres)
AND    test de route (Vitest ou manuel) : la route /api/cron/expiry-reminders renvoie 401 sans CRON_SECRET,
           200 avec, exécute runExpiryJob exactement une fois
```

---

## Périmètre de cette story

**INCLUS :**
- `vercel.json` — CRÉER (à la racine du repo) : déclaration du cron `expiry-reminders` schedule `"17 3 * * *"`
- `src/app/api/cron/expiry-reminders/route.ts` — CRÉER : handler GET authentifié par CRON_SECRET → appelle `runExpiryJob()`
- `src/lib/cron/expiry-job.ts` — CRÉER : `runExpiryJob({ db, now })` orchestration principale (itération tenants, dispatch par `computeReminderAction`)
- `src/lib/cron/expiry-decisions.ts` — CRÉER : `computeReminderAction(tenant, now)` pure + `REMINDER_THRESHOLDS_DAYS`, `hasReminderBeenSent`, `hasPaymentCoveringPeriod` (pures ou mock-friendly)
- `src/lib/cron/reminder-email.ts` — CRÉER : `buildReminderEmailHtml(stage, params)` / `Text`, `buildExpiryEmailHtml(params)` / `Text` (escaping, réutilise `escapeHtml`/`escapeAttribute`)
- `src/lib/cron/constants.ts` — CRÉER : `CRON_SYSTEM_ACTOR_ID = "system"` (acteur pour tenant_events du cron)
- Tests unitaires : `expiry-decisions.test.ts`, `reminder-email.test.ts`, `expiry-job.test.ts`, `route.test.ts`
- `env.example` — UPDATE : ajouter `CRON_SECRET=` (avec commentaire)
- `src/messages/fr-NE.json` — UPDATE : section `cron.emails` (sujets + corps FR — bien que les emails ne passent pas par next-intl directement, centraliser les chaînes FR ici pour cohérence et pour faciliter la story 7-12 templates configurables)

**EXCLU (hors périmètre — ne pas modifier) :**
- `src/lib/schema.ts` → tables `tenants`, `tenant_events`, `subscription_payments` → **déjà créées par story 7-1**
- `src/lib/tenants/tenant-config.ts` (`DEFAULT_GRACE_PERIOD_DAYS = 7`) → **fourni par 7-1, importer la constante**
- `src/proxy.ts` + `src/lib/tenants/tenant-enforcement.ts` → **story 7-1** (ce cron ne touche pas au proxy ; il pose juste le statut que le proxy lit)
- `src/lib/email.ts` → **utilise tel quel** (`sendEmail`, `isEmailDeliveryConfigured`, pattern `buildResetPasswordHtml`)
- Page `/subscription-expired` + bannière de grâce → **story 7-5** (UI, aucune UI dans cette story)
- Réactivation après paiement → **story 7-8** (UPDATE status → 'active', reset gracePeriodEndsAt)
- Templates configurables / activation-désactivation par type → **story 7-12** (platform settings) — ici les templates sont hardcoded, constante `DEFAULT_GRACE_PERIOD_DAYS` hardcodée (7), note TODO que 7-12 externalisera
- Configuration de la durée de grâce par tenant → DEFERRED 7-12 (ici constante globale)
- Stripe webhook auto-activation → **story 7-10**
- Enregistrement de paiement manuel → **story 7-4** (ce cron LIT les paiements, ne les crée pas)

---

## Tâches / Sous-tâches

### T1 — CRÉER `src/lib/cron/constants.ts`

- [x] Définir l'acteur système pour les tenant_events du cron :
  ```ts
  // user_id spécial pour les événements générés par le cron (pas un vrai user Better Auth)
  // Note : tenant_events.actorId est text NOT NULL — on utilise une sentinel "system"
  // plutôt que de créer un user Better Auth factice. La story 7-2/7-12 peut externaliser.
  export const CRON_SYSTEM_ACTOR_ID = "system";
  ```

### T2 — CRÉER `src/lib/cron/expiry-decisions.ts` (pures + DB)

- [x] Constantes des seuils :
  ```ts
  export const REMINDER_THRESHOLDS_DAYS = [7, 3, 1] as const;
  export type ReminderStage = "first" | "second" | "urgent";
  const STAGE_BY_DAYS: Record<number, ReminderStage> = { 7: "first", 3: "second", 1: "urgent" };
  ```
- [x] `computeReminderAction(tenant, now: Date): ReminderDecision` — **pure** (signature pour le type tenant à utiliser) :
  ```ts
  export type ReminderDecision =
    | { kind: "none" }
    | { kind: "reminder"; stage: ReminderStage; daysRemaining: number }
    | { kind: "expired" }
    | { kind: "grace-expired" };

  interface TenantForDecision {
    status: "active" | "trial" | "suspended" | "cancelled";
    plan: "free" | "pro" | "enterprise";
    subscriptionEnd: Date | null;
    gracePeriodEndsAt: Date | null;
  }

  export function computeReminderAction(tenant: TenantForDecision, now: Date): ReminderDecision {
    // 1. Exclusions : cancelled n'arrive jamais ici (filtré en amont) mais guard défensif
    if (tenant.status === "cancelled") return { kind: "none" };
    // 2. Free n'expire jamais
    if (tenant.plan === "free") return { kind: "none" };
    // 3. Pas d'échéance → rien
    if (!tenant.subscriptionEnd) return { kind: "none" };

    const daysRemaining = calendarDaysBetween(now, tenant.subscriptionEnd);

    // 4. Suspension déjà posée + grâce écoulée → confirmation read-only
    if (tenant.status === "suspended") {
      if (tenant.gracePeriodEndsAt && tenant.gracePeriodEndsAt <= now) {
        return { kind: "grace-expired" };
      }
      return { kind: "none" }; // suspended mais encore en grâce → rien à faire par le cron
    }

    // 5. active/trial : vérifier expiration
    if (daysRemaining <= 0) {
      return { kind: "expired" }; // J0 ou dépassé
    }

    // 6. Seuil de rappel ?
    if (daysRemaining in STAGE_BY_DAYS) {
      return { kind: "reminder", stage: STAGE_BY_DAYS[daysRemaining]!, daysRemaining };
    }
    return { kind: "none" };
  }
  ```
- [x] Helper calendrier **pur** `calendarDaysBetween(from: Date, to: Date): number` — compte les jours de minuit UTC à minuit UTC (PAS `Math.floor(ms/86400000)` qui casse sur DST/arrondis) :
  ```ts
  export function calendarDaysBetween(from: Date, to: Date): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const fromUtcMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const toUtcMidnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.floor((toUtcMidnight - fromUtcMidnight) / MS_PER_DAY);
  }
  ```
  (positif si `to` est dans le futur de `from`.)
- [x] `hasReminderBeenSent(tenantId, stage, db): Promise<boolean>` — DB :
  ```ts
  // SELECT 1 FROM tenant_events WHERE tenant_id = ? AND event_type = 'reminder_sent' AND note = ? LIMIT 1
  // note = stage ('first'|'second'|'urgent')
  const existing = await db.select({ id: tenantEvents.id })
    .from(tenantEvents)
    .where(and(
      eq(tenantEvents.tenantId, tenantId),
      eq(tenantEvents.eventType, "reminder_sent"),
      eq(tenantEvents.note, stage),
    ))
    .limit(1);
  return existing.length > 0;
  ```
- [x] `hasPaymentCoveringPeriod(tenant, db): Promise<boolean>` — DB :
  ```ts
  // Un paiement couvre la période si periodEnd >= tenant.subscriptionEnd
  const covering = await db.select({ id: subscriptionPayments.id })
    .from(subscriptionPayments)
    .where(and(
      eq(subscriptionPayments.tenantId, tenantId),
      gte(subscriptionPayments.periodEnd, tenant.subscriptionEnd),
    ))
    .limit(1);
  return covering.length > 0;
  ```
  Note : `subscriptionPayments.periodEnd` est `date({ mode: "date" })` (Date) et `tenant.subscriptionEnd` aussi — comparaison directe OK. Si Drizzle retourne des `Date`, `gte` compare correctement.
- [x] `hasGraceExpiredEventBeenSent(tenantId, db): Promise<boolean>` — idempotence pour AC6 (éviter le spam d'events quotidiens sur grace-expired) — check eventType='suspended' AND note='grace expired (read-only confirmed)'.
- [x] `pnpm typecheck`

### T3 — CRÉER `src/lib/cron/reminder-email.ts`

- [x] `buildReminderEmailHtml(stage, params): string` — HTML inline-stylé (imiter `buildResetPasswordHtml` dans `src/lib/email.ts`) :
  - params : `{ tenantName, subdomainUrl, expiryDateFormatted, daysRemaining, ownerContact }`
  - **CRITIQUE — escaping :** utiliser `escapeHtml`/`escapeAttribute` sur `tenantName`, `subdomainUrl`, `ownerContact`. Récupérer ces helpers depuis `src/lib/email.ts` (ils ne sont pas exportés actuellement → soit les exporter depuis email.ts, soit les dupliquer localement ; **préférer exporter depuis email.ts** — minuscule UPDATE non-cassant).
  - Urgence visuelle progressive : first (bleu), second (orange), urgent (rouge) via inline `style`.
- [x] `buildReminderEmailText(stage, params): string` — version texte brut.
- [x] `buildExpiryEmailHtml(params): string` / `buildExpiryEmailText(params): string` — email de suspension J0 :
  - params : `{ tenantName, subdomainUrl, graceEndsAtFormatted, graceDays, ownerContact }`
  - Contenu : "Votre abonnement a été suspendu pour non-paiement. Vous disposez d'une période de grâce de {graceDays} jours (jusqu'au {graceEndsAtFormatted}) pour régulariser. Au-delà, l'accès sera en lecture seule. Contactez {ownerContact}."
- [x] Sujets (constants, depuis `fr-NE.json` section `cron.emails` ou inline) :
  - first : `"Votre abonnement Quotation Logistique expire dans 7 jours"`
  - second : `"Rappel : votre abonnement expire dans 3 jours"`
  - urgent : `"Urgent : votre abonnement Quotation expire demain"`
  - expiry : `"Votre abonnement a été suspendu — régularisez sous {graceDays} jours"`
- [x] `pnpm typecheck`

### T4 — UPDATE `src/lib/email.ts` — exporter les helpers d'escaping (minuscule, non-cassant)

- [x] Exporter `escapeHtml` et `escapeAttribute` (actuellement privés) pour réutilisation par `reminder-email.ts` :
  ```ts
  export function escapeHtml(value: string): string { ... }   // ajouter "export"
  export function escapeAttribute(value: string): string { ... } // ajouter "export"
  ```
- [x] Vérifier qu'aucun import existant ne casse (ce sont des ajouts de `export`, purement additifs).
- [x] `pnpm typecheck`

### T5 — CRÉER `src/lib/cron/expiry-job.ts` — orchestration (AC3–AC8)

- [x] Signature :
  ```ts
  export interface ExpiryJobResult {
    processed: { reminders: number; suspended: number; graceExpired: number; errors: number };
    errorTenantIds: string[];
    at: string; // ISO timestamp
  }
  export async function runExpiryJob(opts: { now?: Date; db?: typeof import("@/lib/db").db } = {}): Promise<ExpiryJobResult>
  ```
  - `now` optionnel (défaut `new Date()`) — permet les tests déterministes.
  - `db` optionnel (défaut `db` de `@/lib/db`) — permet l'injection d'un mock.
- [x] Logique :
  ```ts
  const now = opts.now ?? new Date();
  const dbClient = opts.db ?? db;
  const result: ExpiryJobResult = { processed: { reminders:0, suspended:0, graceExpired:0, errors:0 }, errorTenantIds: [], at: now.toISOString() };

  // 1. SELECT tenants à traiter : status IN (active, trial, suspended) AND plan != 'free' AND subscriptionEnd IS NOT NULL
  const candidates = await dbClient.select()
    .from(tenants)
    .where(and(
      inArray(tenants.status, ["active", "trial", "suspended"]),
      ne(tenants.plan, "free"),
      isNotNull(tenants.subscriptionEnd),
    ));

  for (const tenant of candidates) {
    try {
      const decision = computeReminderAction(tenant, now);

      if (decision.kind === "none") continue;

      if (decision.kind === "reminder") {
        // Idempotence AC4
        if (await hasReminderBeenSent(tenant.id, decision.stage, dbClient)) continue;
        // Récupérer l'email admin du tenant
        const admin = await getTenantAdminEmail(tenant.id, dbClient);
        if (!admin) { console.warn(`No admin user for tenant ${tenant.id}, skipping reminder`); continue; }
        // Envoi
        await sendEmail({
          to: admin.email,
          subject: reminderSubject(decision.stage),
          html: buildReminderEmailHtml(decision.stage, { tenantName: tenant.name, subdomainUrl: ..., expiryDateFormatted: formatDateFR(tenant.subscriptionEnd), daysRemaining: decision.daysRemaining, ownerContact: process.env.OWNER_CONTACT ?? "" }),
          text: buildReminderEmailText(decision.stage, {...}),
        });
        // Logger APRÈS envoi réussi (fenêtre de double-envoi acceptable)
        await dbClient.insert(tenantEvents).values({ tenantId: tenant.id, eventType: "reminder_sent", actorId: CRON_SYSTEM_ACTOR_ID, note: decision.stage, before: null, after: { stage: decision.stage, daysRemaining: decision.daysRemaining } });
        result.processed.reminders++;
      }

      else if (decision.kind === "expired") {
        // AC5 : vérifier paiement couvrant
        if (await hasPaymentCoveringPeriod(tenant, dbClient)) {
          // Renouvellement enregistré en 7-4 — on logge et on ne suspend pas
          await dbClient.insert(tenantEvents).values({ tenantId: tenant.id, eventType: "reminder_sent", actorId: CRON_SYSTEM_ACTOR_ID, note: "payment covers period, skipped suspension", before: null, after: null });
          continue;
        }
        // Suspension
        const gracePeriodEndsAt = addDays(now, DEFAULT_GRACE_PERIOD_DAYS); // DEFAULT_GRACE_PERIOD_DAYS importé de tenant-config.ts (7-1)
        await dbClient.update(tenants).set({ status: "suspended", gracePeriodEndsAt }).where(eq(tenants.id, tenant.id));
        // Email expiration
        const admin = await getTenantAdminEmail(tenant.id, dbClient);
        if (admin) {
          try {
            await sendEmail({ to: admin.email, subject: `Votre abonnement a été suspendu — régularisez sous ${DEFAULT_GRACE_PERIOD_DAYS} jours`, html: buildExpiryEmailHtml({...}), text: buildExpiryEmailText({...}) });
          } catch { /* best-effort : ne pas faire échouer la suspension si l'email KO */ }
        }
        await dbClient.insert(tenantEvents).values({ tenantId: tenant.id, eventType: "suspended", actorId: CRON_SYSTEM_ACTOR_ID, before: { status: tenant.status }, after: { status: "suspended", gracePeriodEndsAt: gracePeriodEndsAt.toISOString() }, note: "auto-suspended (J0, no payment)" });
        result.processed.suspended++;
      }

      else if (decision.kind === "grace-expired") {
        // AC6 : idempotence — ne pas relogger chaque jour
        if (await hasGraceExpiredEventBeenSent(tenant.id, dbClient)) continue;
        // Statut déjà suspended (posé en AC5) — pas de mutation. Le proxy 7-1 applique read-only.
        await dbClient.insert(tenantEvents).values({ tenantId: tenant.id, eventType: "suspended", actorId: CRON_SYSTEM_ACTOR_ID, before: null, after: null, note: "grace expired (read-only confirmed)" });
        result.processed.graceExpired++;
      }
    } catch (err) {
      // AC8 : isolation — un tenant KO ne bloque pas les autres
      console.error(`Expiry job error for tenant ${tenant.id}`, err);
      result.processed.errors++;
      result.errorTenantIds.push(tenant.id);
    }
  }
  return result;
  ```
- [x] Helper `getTenantAdminEmail(tenantId, db): Promise<{ email: string } | null>` :
  ```ts
  // Premier user du tenant avec role='admin' (tenant admin, pas superadmin owner)
  const [admin] = await dbClient.select({ email: user.email })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.role, "admin")))
    .limit(1);
  return admin ?? null;
  ```
  Guard `noUncheckedIndexedAccess` : `admin` peut être `undefined` → retourner `null`.
- [x] Helper `addDays(date, n)` et `formatDateFR(date)` (purs) — `formatDateFR` via `Intl.DateTimeFormat("fr-FR", { day:"numeric", month:"long", year:"numeric" })`.
- [x] Helper `reminderSubject(stage)` (map stage → sujet FR).
- [x] `pnpm typecheck`

### T6 — CRÉER `src/app/api/cron/expiry-reminders/route.ts` (AC1)

- [x] Handler GET authentifié :
  ```ts
  import { NextResponse } from "next/server";
  import { runExpiryJob } from "@/lib/cron/expiry-job";
  import { apiError, HTTP_STATUS } from "@/lib/api/envelope";

  export const dynamic = "force-dynamic"; // jamais de cache statique sur un cron

  export async function GET(request: Request): Promise<Response> {
    const authHeader = request.headers.get("authorization");
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      return apiError("INTERNAL_ERROR", "CRON_SECRET manquant — configurez la variable d'environnement.", HTTP_STATUS.INTERNAL);
    }
    if (authHeader !== `Bearer ${secret}`) {
      return apiError("UNAUTHORIZED", "Non autorisé.", HTTP_STATUS.UNAUTHORIZED);
    }

    const result = await runExpiryJob();
    return NextResponse.json(result, { status: HTTP_STATUS.OK });
  }
  ```
  Note : Vercel Cron envoie des **GET** (pas POST). Ne pas exporter `POST`.
- [x] `pnpm typecheck`

### T7 — CRÉER `vercel.json` à la racine du repo (AC1)

- [x] Déclaration du cron :
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/expiry-reminders",
        "schedule": "17 3 * * *"
      }
    ]
  }
  ```
  - **Schedule `"17 3 * * *"`** = quotidien à **03:17 UTC** (minute off-peak — éviter :00/:30 pour ne pas surcharger l'API Vercel au même instant que tous les autres jobs planétaires ; 03:17 UTC = ~04:17 heure du Niger WAT, fenêtre creuse).
  - Si `vercel.json` existe déjà (pour d'autres réglages : regions, headers, etc.), **fusionner** la clé `crons` au lieu d'écraser.
- [x] Documenter dans la dev note : en Hobby plan, Vercel limite à 2 jobs daily-minimum (compatible — 1 job ici). En Pro, jusqu'à 40 jobs, granularité 1 min.

### T8 — UPDATE `env.example`

- [x] Ajouter :
  ```env
  # Secret pour authentifier les invocations du cron Vercel (/api/cron/*).
  # Vercel envoie "Authorization: Bearer <CRON_SECRET>". Générer avec : openssl rand -hex 32
  CRON_SECRET=
  ```
  (Ne PAS committer une vraie valeur — vide dans env.example, valeur réelle dans le dashboard Vercel Project Settings → Environment Variables.)

### T9 — UPDATE `src/messages/fr-NE.json`

- [x] Ajouter section `cron.emails` (centralisation des chaînes FR des emails — facilitera 7-12 templates configurables) :
  ```json
  "cron": {
    "emails": {
      "reminder": {
        "subjectFirst": "Votre abonnement Quotation Logistique expire dans 7 jours",
        "subjectSecond": "Rappel : votre abonnement expire dans 3 jours",
        "subjectUrgent": "Urgent : votre abonnement Quotation expire demain",
        "bodyIntro": "Bonjour,",
        "bodyReminder": "Votre abonnement pour {tenantName} expire le {expiryDate} (dans {days} jours).",
        "bodyAction": "Régularisez votre paiement pour éviter l'interruption de service.",
        "bodyAccess": "Accédez à votre espace : {subdomainUrl}",
        "bodyContact": "Contact : {ownerContact}"
      },
      "expiry": {
        "subject": "Votre abonnement a été suspendu — régularisez sous {graceDays} jours",
        "bodySuspended": "Votre abonnement pour {tenantName} a été suspendu pour non-paiement.",
        "bodyGrace": "Vous disposez d'une période de grâce de {graceDays} jours (jusqu'au {graceEndsAt}) pour régulariser.",
        "bodyReadonly": "Au-delà, l'accès sera limité en lecture seule.",
        "bodyContact": "Contactez votre fournisseur pour régulariser : {ownerContact}"
      }
    }
  }
  ```
  Note : ces chaînes ne sont pas lues par `next-intl` côté client (les emails sont des templates HTML serveur). Elles servent de source de vérité centralisée ; `reminder-email.ts` peut soit les lire via `getTranslations` (server, OK), soit les inliner. **Assomption retenue : inliner dans `reminder-email.ts` pour simplicité, mais DUPliquer le contenu dans `fr-NE.json` pour référence future (7-12).** Le dev peut choisir de lire via `getTranslations("cron.emails")` si plus propre.

### T10 — Tests unitaires Vitest

- [x] `src/lib/cron/expiry-decisions.test.ts` (injection de `now`) :
  ```ts
  describe("computeReminderAction", () => {
    const now = new Date("2026-07-01T12:00:00Z");
    it("J-7 → reminder first", () => {
      const sub = new Date("2026-07-08T00:00:00Z"); // 7 jours calendaires plus tard
      expect(computeReminderAction({ status:"active", plan:"pro", subscriptionEnd: sub, gracePeriodEndsAt: null }, now))
        .toEqual({ kind:"reminder", stage:"first", daysRemaining:7 });
    });
    it("J-3 → reminder second");
    it("J-1 → reminder urgent");
    it("J-8 → none (avant le premier seuil)");
    it("J-6 → none (entre seuils)");
    it("J-2 → none (entre seuils)");
    it("J0 (subscriptionEnd == now) → expired");
    it("J+1 (subscriptionEnd dans le passé) → expired");
    it("plan free → none (jamais de rappel)");
    it("subscriptionEnd null → none");
    it("status suspended + grace future → none");
    it("status suspended + grace passée → grace-expired");
    it("status cancelled → none (guard défensif)");
  });

  describe("calendarDaysBetween", () => {
    it("same day → 0");
    it("next day → 1");
    it("crosses month boundary correctly");
    it("ignores time-of-day (minuit UTC à minuit UTC)");
  });
  ```
- [x] `hasReminderBeenSent` / `hasPaymentCoveringPeriod` : mocker `db.select` (return tableaux vides vs non-vides) → assert true/false.
- [x] `src/lib/cron/reminder-email.test.ts` :
  - escaping : insérer `tenantName = '<script>x</script>'` et `ownerContact = '"injection"'` → vérifier qu'ils sont échappés dans le HTML (`&lt;script&gt;`, `&quot;injection&quot;`).
  - les 3 stages produisent un HTML contenant la bonne urgence visuelle (couleur) et le bon `daysRemaining`.
  - `buildExpiryEmailHtml` contient `graceDays` et `graceEndsAtFormatted` et `ownerContact`.
- [x] `src/lib/cron/expiry-job.test.ts` (mocks `db` + `sendEmail`) :
  - Cas nominal : 1 tenant J-7 → 1 sendEmail + 1 insert tenant_events reminder_sent + result.reminders=1.
  - Idempotence : tenant avec reminder déjà envoyé (mock hasReminderBeenSent=true) → sendEmail jamais appelé.
  - Suspension J0 sans paiement → 1 update tenants (status suspended, gracePeriodEndsAt = now+7j) + 1 sendEmail expiry + 1 insert event suspended.
  - Suspension J0 AVEC paiement couvrant → pas d'update, pas d'email, insert event "payment covers period".
  - Grace-expired idempotent : second run ne relogue pas l'event.
  - Skip free / skip cancelled / skip subscriptionEnd null.
  - Isolation : 1 tenant en throw (sendEmail rejette) → errors=1, errorTenantIds rempli, les autres tenants traités.
  - `now` injecté déterministe (vérifier que gracePeriodEndsAt = now + 7 jours exacts).
- [x] `src/app/api/cron/expiry-reminders/route.test.ts` (ou test d'intégration léger) :
  - Sans header Authorization → 401.
  - Avec `Authorization: Bearer wrong` → 401.
  - `CRON_SECRET` non set → 500.
  - Avec bon header + CRON_SECRET set → 200, `runExpiryJob` appelé exactement 1 fois (mock le module `expiry-job` via `vi.mock`).

### T11 — Vérification finale (AC10)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (pas de régression, 334+ existants + nouveaux)
- [x] `pnpm build` : passe sans erreur (vercel.json valide — Next.js ne valide pas vercel.json au build, mais Vercel le fera au déploiement)
- [x] Aucune nouvelle dépendance installée (tout réutilise `db`, `sendEmail`, `drizzle-orm`)
- [x] Test manuel dev : `CRON_SECRET=test pnpm dev` puis `curl -H "Authorization: Bearer test" http://localhost:3000/api/cron/expiry-reminders` → 200 avec `{ processed: {...} }`. Sans header → 401.

---

## Dev Notes

### CRITIQUE — Vercel Cron : `vercel.json` (PAS `vercel.ts`)

Le brief mentionnait un fichier `vercel.ts` pour la config des crons. **Cela n'existe pas.** Vercel Cron se configure via le fichier **`vercel.json`** à la racine du repo, sous la clé `crons` :

```json
{
  "crons": [
    { "path": "/api/cron/expiry-reminders", "schedule": "17 3 * * *" }
  ]
}
```

Sources : [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs), [Managing Cron Jobs (CRON_SECRET)](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Quickstart](https://vercel.com/docs/cron-jobs/quickstart).

**Faits clés (vérifiés 2026-06-28) :**
- Vercel envoie un **GET** (pas POST) à la `path` déclarée, sur le **déploiement de production uniquement**.
- Authentification : set `CRON_SECRET` dans le dashboard Vercel → Vercel envoie `Authorization: Bearer <CRON_SECRET>`. Le handler DOIT vérifier ce header (cf. AC1).
- **Hobby plan :** daily-minimum, max **2** jobs. Compatible (1 job quotidien ici).
- **Pro plan :** 1-min granularity, max 40 jobs.
- **Local dev :** le cron ne se déclenche PAS en `pnpm dev` (pas de scheduler Vercel en local). Tester via `curl` avec le header `Authorization: Bearer $CRON_SECRET`.

**Anti-pattern :** ne PAS créer un `setInterval` ou `node-cron` dans le serveur Next.js — les Serverless Functions sont éphémères (cold start, pas de process persistant). Vercel Cron est la voie officielle. Si l'architecture évolue vers self-hosted plus tard, l'équivalent serait `node-cron` ou un systemd timer pointant vers la même route `/api/cron/expiry-reminders` — **l'API `runExpiryJob()` est indépendante du transport**, donc portable.

### CRITIQUE — Architecture : `runExpiryJob()` découplée du transport HTTP

La logique métier (`runExpiryJob`) est dans `src/lib/cron/expiry-job.ts`, **indépendante** de la route HTTP. La route `/api/cron/expiry-reminders` n'est qu'un thin wrapper (auth + appel). Avantages :
- **Testable** : on peut appeler `runExpiryJob({ now: fixedDate, db: mockDb })` directement en test.
- **Portable** : si demain on passe sur self-hosted avec `node-cron` ou GitHub Actions scheduled workflow, on appelle `runExpiryJob()` sans toucher à la logique.
- **Debuggable** : le owner peut déclencher manuellement via un bouton admin (future story) en appelant la même fonction.

### CRITIQUE — Dépendance HARD sur story 7-1 (schema + tenant-config + proxy)

Cette story s'appuie sur la **story 7-1** non encore implémentée au moment de la création de ce fichier :
- **Tables** : `tenants` (colonnes `subscriptionEnd`, `trialEndsAt`, `gracePeriodEndsAt`, `status`, `plan`), `tenant_events` (colonne `eventType`, valeurs dont `'reminder_sent'`, `'suspended'`), `subscription_payments` (colonne `periodEnd`), `user.tenantId` (pour `getTenantAdminEmail`).
- **Enums** : `tenantStatusEnum`, `tenantPlanEnum`.
- **Constantes** : `DEFAULT_GRACE_PERIOD_DAYS = 7` (depuis `src/lib/tenants/tenant-config.ts`).
- **Contrat 7-6 (écrit) → 7-1 (lit)** : ce cron UPDATE `tenants.status = 'suspended'` et pose `gracePeriodEndsAt`. Le **proxy de la story 7-1** (`enforceTenantAccess` dans `src/lib/tenants/tenant-enforcement.ts`) LIT `status` et redirige vers `/subscription-expired` pour `suspended`/`cancelled`. **Sans 7-1 implémentée, le statut posé par ce cron n'a aucun enforcement** (mais la donnée est correcte, prête pour quand 7-1 atterrit).

**Mode dégradé (si 7-1 absent au moment du dev) :** la story ne compilera PAS (imports `tenants`, `tenantEvents`, `subscriptionPayments`, `DEFAULT_GRACE_PERIOD_DAYS` introuvables). Le dev DOIT d'abord implémenter 7-1, OU créer des stubs minimaux (déconseillé — préférer sérialiser 7-1 → 7-6).

### CRITIQUE — Dépendance SOFT sur story 7-5 (page /subscription-expired)

La story 7-5 fournit la **page UI** `/subscription-expired` et la bannière de grâce (lit le header `x-tenant-grace` posé par le proxy 7-1). Ce cron **ne crée aucune UI**. Si 7-5 n'est pas implémentée, les clients suspendus verront un redirect vers une page 404 (la route n'existe pas) — mais le statut DB sera correct. **Sérialiser 7-5 avant ou en parallèle de 7-6** pour une expérience complète.

### CRITIQUE — Conflit d'enum plan : `tenantPlanEnum` (free/pro/enterprise) vs `tierEnum` (starter/pro/entreprise)

Le repository a **DEUX systèmes de tiers** (héritage story 6-2) :
- `tierEnum = ["starter", "pro", "entreprise"]` sur `companySubscription.tier` (quota interne MVP).
- `tenantPlanEnum = ["free", "pro", "enterprise"]` sur `tenants.plan` (abonnement SaaS Epic 7).

Ce cron utilise **`tenants.plan` (`tenantPlanEnum`)** — la condition `plan != "free"` (AC7) filtre les tenants gratuits qui n'expirent jamais. **Ne PAS confondre** avec `companySubscription.tier`. Si un tenant à `plan="free"` doit être suspendu (anomalie business), c'est un signal que la décision `free n'expire jamais` est contestable — flag pour le parent. Le spec Epic 7 §7 confirme : free = 0 FCFA/mois, gratuit à vie.

### CRITIQUE — Idempotence : fenêtre de double-envoi acceptable

L'insert `tenant_events (reminder_sent)` se fait **APRÈS** un `sendEmail` réussi (AC4). Il existe une fenêtre entre `sendEmail` résolu et l'insert complété où un crash laisserait l'email envoyé SANS event → le prochain cycle renverrait l'email (double envoi). C'est **acceptable** pour des emails de rappel (idempotence stricte coûterait une transaction distribuée email+DB). L'alternative (insert avant envoi, puis update si échec) est plus fragile (comment marquer un event "envoi échoué" ?). Choix : **send-then-log**, fenêtre de double-envoi documentée et assumée.

Pour les **suspensions (AC5)**, l'UPDATE `tenants.status` se fait avant l'email (l'email est best-effort, ne fait pas échouer la suspension). Le guard `status === 'suspended'` en début de traitement AC5 empêche la re-suspension.

### CRITIQUE — `actorId = "system"` : sentinel text (pas un vrai user)

`tenant_events.actorId` est `text NOT NULL` (référence un user_id Better Auth). Le cron n'a pas de session utilisateur. Solution retenue : `CRON_SYSTEM_ACTOR_ID = "system"` (sentinel string). **Cela viole techniquement** la contrainte FK si `actorId` a une FK vers `user.id` — **vérifier le schéma 7-1** : le spec dit `actorId text NOT NULL` SANS `.references()` explicite dans la spec §2 (cf. `Docs/business/owner-subscription-management.md` ligne 88 : `actor_id text NOT NULL -- superadmin user_id`). Si 7-1 a ajouté une FK `.references(() => user.id)`, le dev DOIT soit :
- (a) retirer la FK sur `actorId` (préféré — les events système n'ont pas d'utilisateur), OU
- (b) créer un user Better Auth factice `id="system"` au seed/migration.

→ **Flag pour le parent :** confirmer avec le dev de 7-1 que `tenant_events.actorId` n'a PAS de FK vers `user.id` (ou la retirer). La spec n'en prévoit pas.

### CRITIQUE — `DEFAULT_GRACE_PERIOD_DAYS` hardcoded (constant) — externalisation DEFERRED à 7-12

Le spec Epic 7 §7 retient `DEFAULT_GRACE_PERIOD_DAYS = 7`. La story 7-12 (platform settings) permettra de configurer cette durée par l'owner. **Ici on importe la constante depuis `tenant-config.ts` (7-1).** Ne PAS lire depuis la DB (pas de table platform_settings encore). TODO commenté dans `expiry-job.ts` : `// TODO(story-7-12): externalize grace period to platform_settings`.

### CRITIQUE — Comparaison de dates Drizzle : `date({ mode: "date" })` retourne des `Date`

`tenants.subscriptionEnd`, `subscription_payments.periodEnd` sont `date({ mode: "date" })` (story 7-1) → Drizzle retourne des objets `Date` JS. Les comparaisons Drizzle (`gte`, `lt`) et JS (`<=`, `>=`) fonctionnent directement sur `Date`. Attention : `tenant.subscriptionEnd` peut être `null` (colonne nullable) → guard `if (!tenant.subscriptionEnd) return ...` avant tout usage (déjà dans `computeReminderAction`).

### CRITIQUE — Sélection initiale des tenants : `inArray`, `ne`, `isNotNull`

```ts
import { and, inArray, ne, isNotNull, eq, gte } from "drizzle-orm";

const candidates = await db.select().from(tenants).where(and(
  inArray(tenants.status, ["active", "trial", "suspended"]), // exclut cancelled
  ne(tenants.plan, "free"),                                   // exclut free
  isNotNull(tenants.subscriptionEnd),                         // exclut sans échéance
));
```
Vérifier que ces opérateurs Drizzle 0.44.7 existent (ils y sont). Le statut `cancelled` est exclu en amont (jamais de rappel ni re-suspension — AC7).

### CRITIQUE — Email admin du tenant : `user.role = "admin"` (tenant admin), PAS "superadmin"

`getTenantAdminEmail` cherche `WHERE tenantId = ? AND role = "admin"` (le tenant admin créé par la story 7-3). **Ne PAS** chercher `role = "superadmin"` (c'est le owner Maiga Tech Lab, qui n'a pas de `tenantId`). Le rôle `admin` est le tenant admin client. Guard `noUncheckedIndexedAccess` : `[admin]` peut être `undefined`.

Si un tenant n'a AUCUN user admin (anomalie — suppression manuelle), le job skip avec `console.warn` (AC7) — ne fait pas échouer le job.

### CRITIQUE — Vercel Hobby plan : 2 jobs max, daily-minimum

Si le projet est sur Hobby plan, on a droit à **2 cron jobs max** avec une granularité **journalière** (pas de job horaire/minutier). Cette story en utilise **1** (quotidien). Il reste 1 slot pour un futur job (ex: quota reset mensuel story 6-2, ou nettoyage). Si plus de jobs sont nécessaires en MVP, migrer en Pro. Documenter cette contrainte dans la dev note pour le déploiement.

### CRITIQUE — `dynamic = "force-dynamic"` sur la route cron

La route `/api/cron/expiry-reminders` DOIT être `export const dynamic = "force-dynamic"` — jamais de cache statique, jamais de génération au build. Sans cela, Next.js pourrait tenter de la prerender et échouer (elle lit la DB + l'env `CRON_SECRET`).

### CRITIQUE — Timezone : tout en UTC

Le cron schedule `"17 3 * * *"` est en **UTC** (Vercel Cron utilise UTC). `calendarDaysBetween` calcule en **UTC midnight** (pas tz-local). Les `subscriptionEnd` sont des `date` (calendaire, sans tz) → comparer en UTC est cohérent. Le formatage pour l'email utilise `Intl.DateTimeFormat("fr-FR", ...)` (affichage en tz local FR — acceptable, le client lit une date, pas un instant précis).

### Pattern existant à réutiliser

- `src/lib/email.ts` — `sendEmail`, `isEmailDeliveryConfigured`, `escapeHtml`/`escapeAttribute` (à exporter en T4), `buildResetPasswordHtml` (modèle de template HTML inline)
- `src/lib/api/envelope.ts` — `apiError`, `HTTP_STATUS`
- `src/lib/db.ts` — client `db` Drizzle (injectable via param pour tests)
- `src/lib/schema.ts` — `tenants`, `tenantEvents`, `subscriptionPayments`, `user` (tables fournies par 7-1)
- `src/lib/tenants/tenant-config.ts` (7-1) — `DEFAULT_GRACE_PERIOD_DAYS = 7`, `APEX_DOMAIN`
- Pattern fonction pure + `now` injecté : `src/lib/quote-status.ts` (`canTransition`) et `src/lib/tenants/tenant-enforcement.ts` (7-1, `enforceTenantAccess(tenant, now)`) — même style pour `computeReminderAction`
- Pattern test mock `db` : `src/lib/tenants/create-tenant.test.ts` (7-3) ou tests quota story 6-2

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Configurer le cron dans `vercel.ts` (n'existe pas) | `vercel.json` clé `crons` à la racine |
| Route `/api/cron/*` sans vérif `CRON_SECRET` | Header `Authorization: Bearer` check obligatoire |
| `setInterval` ou `node-cron` dans le serveur | Vercel Cron (Serverless Functions éphémères) |
| `Math.floor((date2-date1)/86400000)` pour les jours | `calendarDaysBetween` (UTC midnight, anti DST/arrondi) |
| Renvoyer un rappel déjà envoyé (pas d'idempotence) | `hasReminderBeenSent` check AVANT sendEmail |
| Insérer l'event `reminder_sent` AVANT l'envoi | APRÈS envoi réussi (send-then-log) |
| Envoyer un rappel à un tenant `cancelled` / `free` | Exclure via WHERE initial |
| Re-suspendre un tenant déjà `suspended` | Guard `status` check avant UPDATE |
| Logger `grace-expired` chaque jour | Idempotence via `hasGraceExpiredEventBeenSent` |
| Créer une UI / page / composant | Hors scope — story 7-5 |
| Créer `tenant_events.actorId` FK vers user.id | Sentinel `"system"` (vérifier schéma 7-1) |
| Lire `DEFAULT_GRACE_PERIOD_DAYS` depuis la DB | Constante de `tenant-config.ts` (7-12 externalisera) |
| Renvoyer un POST depuis la route cron | Vercel envoie GET uniquement |
| Oublier `dynamic = "force-dynamic"` | Toujours sur une route cron |
| Une erreur tenant fait échouer tout le job | try/catch par tenant, isolation (AC8) |
| Schedule à `:00` ou `:30` | Off-peak (ex: `17 3 * * *` = 03:17 UTC) |

### Commandes pour le dev agent

```bash
# 0. Prérequis : story 7-1 implémentée (schema + tenant-config + proxy)
#    Vérifier : pnpm typecheck passe AVANT de commencer (imports tenants/tenantEvents existent)

# 1. Docker en cours (DB)
docker compose up -d

# 2. AUCUNE migration à générer (schema fourni par 7-1)
# pnpm db:generate  ← NE PAS LANCER

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓ (334+ existants + nouveaux)

# 4. Build
pnpm build   # passe sans erreur (vercel.json n'est pas validé au build Next, mais au deploy Vercel)

# 5. Test manuel dev (CRON_SECRET local)
CRON_SECRET=dev-secret pnpm dev
# Dans un autre terminal :
curl -H "Authorization: Bearer dev-secret" http://localhost:3000/api/cron/expiry-reminders
# Attendu : 200 { "processed": {...}, "at": "..." }
# Sans header :
curl http://localhost:3000/api/cron/expiry-reminders  # → 401

# 6. Configurer en production (dashboard Vercel)
#    Project Settings → Environment Variables → CRON_SECRET = <openssl rand -hex 32>
#    Le cron se déclenchera automatiquement à 03:17 UTC sur le deployment de production.
```

---

## Références

- [Epic 7 spec] `Docs/business/owner-subscription-management.md` — §3.5 (Suspension automatique cron J-7/J-3/J-1/J0/grace), §3.6 (notifications templates), §7 (DEFAULT_GRACE_PERIOD_DAYS = 7)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) — config `vercel.json` crons, schedule cron expressions
- [Vercel Managing Cron Jobs (CRON_SECRET)](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — header `Authorization: Bearer`, securing invocations
- [Vercel Cron Quickstart](https://vercel.com/docs/cron-jobs/quickstart) — step-by-step
- [CLAUDE.md] — conventions DB, langues (UI FR / code EN), `pnpm check`
- [project-context.md] — règles TypeScript strict, Drizzle, API envelope, i18n, offline (N/A ici)
- [Story 7-1] `_bmad-output/implementation-artifacts/7-1-tenants-schema-subdomain-middleware.md` — fournit `tenants`, `tenant_events`, `subscription_payments`, `user.tenantId`, `tenant-config.ts` (`DEFAULT_GRACE_PERIOD_DAYS`), `enforceTenantAccess` (proxy lit le statut posé ici)
- [Story 7-3] `_bmad-output/implementation-artifacts/7-3-create-tenant-welcome-email.md` — pattern `sendEmail` + `buildXxxHtml` + insert `tenant_events` best-effort
- [Story 7-5] `_bmad-output/implementation-artifacts/7-5-manual-suspension-expiry-page.md` (à créer) — page `/subscription-expired` + bannière grâce (UI, hors scope 7-6)
- [src/lib/email.ts] — `sendEmail`, `escapeHtml`/`escapeAttribute` (à exporter), `buildResetPasswordHtml` (modèle template)
- [src/lib/api/envelope.ts] — `apiError`, `HTTP_STATUS`
- [src/lib/schema.ts] — `tenants`, `tenantEvents`, `subscriptionPayments`, `user` (après 7-1)
- [src/lib/tenants/tenant-enforcement.ts] (7-1) — `enforceTenantAccess` (proxy lit status, ce cron l'écrit)

---

## Developer Context

### Source : Epic 7 spec (`Docs/business/owner-subscription-management.md`)

**Epic 7 :** Owner Panel & Gestion des abonnements SaaS — Post-MVP. Dépendances : Epic 1 (auth/rôles, DONE), Epic 6.2 (quota enforcement, DONE).

**Story 7.6 (P1)** est le mécanisme d'**automatisation temporelle** : sans lui, le owner devrait manuellement vérifier chaque jour les tenants proches de l'expiration et envoyer les rappels + suspendre. Ce cron rend l'opération autonome.

**Flux de suspension automatique (§3.5) :**
```
J-7  → email 1er rappel (reminder first)
J-3  → email 2ème rappel (reminder second)
J-1  → email rappel urgent (reminder urgent)
J0   → expiration : si pas de paiement couvrant la période → status='suspended',
        gracePeriodEndsAt = now + 7 jours, email de suspension envoyé
       (pendant la grâce : accès maintenu + bannière — UI story 7-5)
J+7  → grâce écoulée : statut reste 'suspended' (read-only confirmé par le proxy 7-1)
       → redirect /subscription-expired pour le client
```

### Stories de l'Epic 7 (cross-context)

| ID | Titre | Relation avec 7-6 |
|----|-------|-------------------|
| 7.1 | Schema tenants + middleware subdomain routing | **PRÉREQUIS HARD** — fournit schema + `DEFAULT_GRACE_PERIOD_DAYS` + proxy qui lit le statut posé ici |
| 7.3 | Création manuelle tenant + email bienvenue | **SOFT** — pattern `sendEmail` + `tenant_events` réutilisé |
| 7.4 | Enregistrement paiement (mobile money) | **SOFT** — ce cron LIT `subscription_payments` pour `hasPaymentCoveringPeriod` |
| 7.5 | Suspension manuelle + page expiration tenant | **SOFT** — UI affichée quand ce cron a posé status='suspended' |
| **7.6** | **Cron expiration + rappels automatiques** | **(cette story)** |
| 7.8 | Réactivation après paiement | UPDATE status → 'active', reset `gracePeriodEndsAt` (inverse de ce cron) |
| 7.12 | Paramètres plateforme | Externalisera `DEFAULT_GRACE_PERIOD_DAYS` et les templates email |

### Paramètres business retenus (Epic 7 §7)

```ts
const DEFAULT_GRACE_PERIOD_DAYS = 7   // depuis tenant-config.ts (7-1)
const REMINDER_THRESHOLDS_DAYS = [7, 3, 1]  // J-7 first, J-3 second, J-1 urgent
```

Le cron schedule `"17 3 * * *"` (03:17 UTC quotidien) est un choix d'implémentation (minute off-peak, fenêtre creuse nuit Niger).

---

## Architecture Compliance

| Contrainte | Conformité story 7-6 |
|---|---|
| Hosting Vercel (architecture §Infrastructure) | ✅ Vercel Cron via `vercel.json`, native Next.js |
| Next.js 16 App Router (API routes `app/api/*/route.ts`) | ✅ Route GET `/api/cron/expiry-reminders/route.ts` |
| TypeScript strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | ✅ Guards `?? null`, `[admin] ?? null`, `STAGE_BY_DAYS[days]!` |
| Drizzle : opérateurs `and`/`inArray`/`ne`/`isNotNull`/`gte`/`eq` | ✅ Sélection + vérifications |
| API envelope : `apiError()`, `HTTP_STATUS` | ✅ 401 UNAUTHORIZED, 500 INTERNAL_ERROR sur la route |
| Audit : `tenant_events` append-only, best-effort (pattern 6-3) | ✅ Insert dans try/catch par tenant |
| Money : integer FCFA | N/A (pas de montant — ce cron ne crée pas de paiement) |
| `dynamic = "force-dynamic"` sur route cron | ✅ Pas de cache/prerender |
| Pas de nouvelle dépendance | ✅ Tout réutilise `db`, `sendEmail`, `drizzle-orm` |
| Email : réutiliser `src/lib/email.ts` (Resend) | ✅ `sendEmail` + export `escapeHtml`/`escapeAttribute` |

---

## Library / Framework Requirements

| Lib | Version repo | Usage story 7-6 |
|---|---|---|
| `next` | 16.1.6 | App Router API route `GET`, `NextResponse`, `Response` |
| `drizzle-orm` | 0.44.7 | `select`/`update`/`insert` sur `tenants`/`tenant_events`/`subscription_payments`/`user` ; opérateurs `and`/`inArray`/`ne`/`isNotNull`/`gte`/`eq` |
| `postgres` / `pg` | 3.4.9 / 8.20.0 | Via `src/lib/db.ts` (client `db` injectable) |
| (Resend via `src/lib/email.ts`) | — | `sendEmail`, `escapeHtml`/`escapeAttribute`, `isEmailDeliveryConfigured` |
| `vitest` | 4.1.9 | Tests unitaires `expiry-decisions`, `reminder-email`, `expiry-job`, `route` |
| node `crypto` (built-in) | — | Non requis (pas de génération de secret dans cette story ; le dev génère `CRON_SECRET` hors code) |

**Aucune nouvelle dépendance à installer.** Vercel Cron est un service plateforme (pas un package npm).

---

## File Structure Requirements

| Fichier | Action | Rôle |
|---|---|---|
| `vercel.json` | **NEW** (racine repo) | Déclaration cron `{ path: "/api/cron/expiry-reminders", schedule: "17 3 * * *" }` (fusionner si fichier existant) |
| `src/app/api/cron/expiry-reminders/route.ts` | **NEW** | Handler GET authentifié CRON_SECRET → appelle `runExpiryJob()` |
| `src/lib/cron/expiry-job.ts` | **NEW** | `runExpiryJob({ now?, db? })` orchestration (itération tenants, dispatch, isolation erreurs) |
| `src/lib/cron/expiry-decisions.ts` | **NEW** | `computeReminderAction` (pure), `calendarDaysBetween` (pure), `hasReminderBeenSent`, `hasPaymentCoveringPeriod`, `hasGraceExpiredEventBeenSent`, `REMINDER_THRESHOLDS_DAYS` |
| `src/lib/cron/reminder-email.ts` | **NEW** | `buildReminderEmailHtml`/`Text` (3 stages), `buildExpiryEmailHtml`/`Text` (escaping) |
| `src/lib/cron/constants.ts` | **NEW** | `CRON_SYSTEM_ACTOR_ID = "system"` |
| `src/lib/cron/expiry-decisions.test.ts` | **NEW** | Tests unitaires `computeReminderAction` + `calendarDaysBetween` + helpers DB mockés |
| `src/lib/cron/reminder-email.test.ts` | **NEW** | Tests unitaires escaping + contenu (3 stages + expiry) |
| `src/lib/cron/expiry-job.test.ts` | **NEW** | Tests orchestration (mock db + sendEmail) — idempotence, suspension, isolation |
| `src/app/api/cron/expiry-reminders/route.test.ts` | **NEW** | Tests route (401 sans secret, 200 avec, runExpiryJob appelé) |
| `src/lib/email.ts` | **UPDATE** | Exporter `escapeHtml` + `escapeAttribute` (additif, non-cassant) |
| `src/messages/fr-NE.json` | **UPDATE** | Section `cron.emails` (sujets + corps FR, source pour 7-12) |
| `env.example` | **UPDATE** | `CRON_SECRET=` avec commentaire |

**Ne PAS modifier :**
- `src/lib/schema.ts` (tables fournies par 7-1)
- `src/lib/tenants/tenant-config.ts` (lire `DEFAULT_GRACE_PERIOD_DAYS`)
- `src/proxy.ts` + `src/lib/tenants/tenant-enforcement.ts` (story 7-1 — ce cron ne fait que poser le statut que le proxy lit)
- `src/lib/auth.ts` (pas de session dans le cron — auth par CRON_SECRET, pas par cookie)
- Toute page UI / composant (story 7-5)
- `src/lib/quota/*` (quota = story 6-2, indépendant de l'expiration d'abonnement)

---

## Testing Requirements

### Tests unitaires (Vitest)

**Fonctions pures (couverture haute, sans mock) :**
- `expiry-decisions.test.ts` :
  - `computeReminderAction` : J-7 first, J-3 second, J-1 urgent, J-8 none, J-6 none, J-2 none, J0 expired, J+1 expired, plan free none, subscriptionEnd null none, suspended+grace future none, suspended+grace passée grace-expired, cancelled none (guard)
  - `calendarDaysBetween` : même jour 0, lendemain 1, frontière mois, ignore l'heure (UTC midnight)
- `reminder-email.test.ts` :
  - escaping HTML (XSS via tenantName/ownerContact avec `<script>`, `"`, `'`, `` ` ``)
  - 3 stages : HTML contient bon `daysRemaining` + urgence visuelle
  - `buildExpiryEmailHtml` contient `graceDays` + `graceEndsAtFormatted` + `ownerContact`

**Logique avec DB mockée :**
- `hasReminderBeenSent` / `hasPaymentCoveringPeriod` : mock `db.select().from().where().limit()` retourne `[]` (false) vs `[{id}]` (true)
- `expiry-job.test.ts` (mock `db` injecté + `sendEmail` mocké via `vi.mock("@/lib/email")`) :
  - Cas nominal reminder J-7 → 1 sendEmail + 1 insert reminder_sent, reminders=1
  - Idempotence reminder déjà envoyé → 0 sendEmail, 0 insert
  - Suspension J0 sans paiement → 1 update (status suspended, gracePeriodEndsAt = now+7j) + 1 sendEmail expiry + 1 insert suspended
  - Suspension J0 avec paiement couvrant → 0 update, 0 email, 1 insert "payment covers period"
  - Grace-expired idempotent : 2e run ne relogue pas
  - Skip free / skip cancelled / skip subscriptionEnd null (pas dans candidates)
  - Isolation : 1 tenant throw (sendEmail rejette) → errors=1, autres traités
  - `now` injecté déterministe : gracePeriodEndsAt exactement now+7j

**Route HTTP :**
- `route.test.ts` :
  - Sans header Authorization → 401
  - `Authorization: Bearer wrong` → 401
  - `CRON_SECRET` unset → 500 "CRON_SECRET manquant"
  - Bon header + secret → 200, `runExpiryJob` appelé 1 fois (vi.mock `expiry-job`)

### Tests E2E (Playwright) — **NON requis pour cette story**

Le cron est un job serveur déclenché par Vercel en production. Les E2E navigateur ne sont pas pertinents (pas d'UI). La couverture unitaire + route suffit. Un test de fumée en staging (déclenchement manuel du cron via curl avec CRON_SECRET) est recommandé post-déploiement mais hors scope story.

### Tests existants

- `pnpm check` doit continuer à passer : **334+ tests existants** (Epic 1–6 DONE + stories 7-1/7-2/7-3 si implémentées). Aucune régression attendue — le seul UPDATE sur un fichier existant est `src/lib/email.ts` (ajout de 2 `export`, purement additif).

---

## Previous Story Intelligence

**Story 7-1 (schema + proxy) — `ready-for-dev` :** fournit le socle. Points à respecter :
- `tenant_events` est append-only (pas de revision/updatedAt) — pattern `audit_event` story 6-3.
- `tenants.subscriptionEnd`/`trialEndsAt`/`gracePeriodEndsAt` sont `date({ mode: "date" })` → objets `Date` JS.
- `DEFAULT_GRACE_PERIOD_DAYS = 7` est dans `tenant-config.ts` — IMPORTER, ne pas redéfinir.
- `enforceTenantAccess` (proxy) lit `status='suspended'` → redirect. Ce cron POSE ce statut. Contrat écrit→lu clair.
- **Vérifier** : `tenant_events.actorId` ne doit PAS avoir de FK vers `user.id` (sinon `actorId="system"` casse). Flag parent.

**Story 7-3 (création tenant + email) — `ready-for-dev` :** pattern à réutiliser :
- `sendEmail({ to, subject, html, text })` + `isEmailDeliveryConfigured()` de `src/lib/email.ts`.
- Template HTML inline-stylé (imiter `buildResetPasswordHtml`).
- Insert `tenant_events` best-effort (try/catch, ne bloque pas).
- Email admin du tenant : `user.role = "admin"` + `user.tenantId` (le tenant admin créé en 7-3).

**Story 6-2 (quota) — `done` :** `companySubscription` et `tierEnum` (starter/pro/entreprise) sont **indépendants** de `tenants.plan` (free/pro/enterprise). Ce cron utilise `tenants.plan`, ne PAS confondre.

**Story 6-3 (audit) — `done` :** pattern append-only + best-effort. `tenant_events` suit exactement ce pattern.

**Epic 6 entièrement DONE** (2026-06-28). Epic 7 est le premier post-MVP.

---

## Git Intelligence Summary

Derniers commits pertinents :
- `a637dfe` fix: /register redirect to / (was /dashboard), add logout button to parametres
- `a5d9e2e` test(qa): API unit tests + Playwright E2E specs for uncovered routes
- `a4f6977` feat(6-3): immutable audit trail export
- `f57a515` feat(6-2): tier quota enforcement

**Patterns établis à respecter :**
- API routes : `app/api/*/route.ts` avec `export async function GET/POST`, `apiError` + `HTTP_STATUS`, `auth.api.getSession` pour les routes authentifiées (ici : pas de session, auth par `CRON_SECRET`).
- Tests : Vitest à côté du module (`src/lib/cron/*.test.ts`), mocks `vi.mock` pour `db` et `sendEmail`.
- Fonctions pures avec `now` injecté pour testabilité déterministe (cf. `enforceTenantAccess` 7-1, `canTransition` quote-status).
- Aucune `vercel.json` n'existe encore — c'est une création (vérifier qu'elle ne collisionne pas avec d'autres réglages à l'avenir).

---

## Latest Tech Information

### Vercel Cron Jobs (vérifié 2026-06-28)

Sources : [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs), [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Quickstart](https://vercel.com/docs/cron-jobs/quickstart), [KB guide](https://vercel.com/kb/guide/how-to-setup-cron-jobs-on-vercel).

- **Config :** fichier `vercel.json` à la racine, clé `crons` (array de `{ path, schedule }`). **Il n'existe pas de `vercel.ts`** — le brief qui le mentionnait était incorrect.
- **Méthode HTTP :** Vercel envoie un **GET** à la `path` (jamais POST). Le handler exporte `GET`.
- **Authentification :** set `CRON_SECRET` (env var dans le dashboard Vercel Project Settings) → Vercel envoie `Authorization: Bearer <CRON_SECRET>`. Le handler vérifie `request.headers.get("authorization") === \`Bearer ${process.env.CRON_SECRET}\``.
- **Production uniquement :** les crons ne se déclenchent que sur le déploiement de production. Pas de déclenchement en preview/dev local (tester via `curl`).
- **Plans :** Hobby = daily-minimum, max 2 jobs. Pro = 1-min granularity, max 40 jobs. Enterprise = max 40 jobs. (Compatible avec cette story : 1 job quotidien.)
- **Schedule syntax :** cron standard 5 champs, en **UTC**. `"17 3 * * *"` = tous les jours à 03:17 UTC.
- **Timeout :** le handler a le timeout standard des Serverless/Fluid Functions (10s Hobby default, jusqu'à 800s Pro). Pour un job qui itère sur N tenants avec envois email, surveiller le temps total. Si >10s en Hobby, migrer en Pro (Fluid Compute) ou batcher. Avec peu de tenants en MVP, OK.

### Pattern idempotent job design (best practices 2026)

Sources : [Automate Tasks Using Vercel Cron Jobs (DEV)](https://dev.to/onurhandtr/automate-the-tasks-using-vercel-cron-jobs-ieh), idempotency patterns.

- **Check-then-act :** vérifier un marqueur (ici `tenant_events eventType='reminder_sent'`) AVANT l'action (sendEmail). Réduit drastiquement les doubles envois.
- **Act-then-log :** exécuter l'action (sendEmail) PUIS logger le marqueur. Fenêtre de double-envoi en cas de crash entre les deux — acceptable pour des emails de rappel (vs une transaction distribuée coûteuse).
- **Isolation par item :** try/catch PAR tenant, pas un seul try/catch autour de la boucle. Un tenant en erreur ne doit pas empêcher le traitement des autres.
- **`now` injecté :** passer `now` en paramètre (défaut `new Date()`) pour des tests déterministes (J-7/J-3/J-1 reproductibles).
- **Schedule off-peak :** éviter `:00`/`:30` (congestion planétaire sur l'API Vercel). Préférer des minutes impares (`:17`, `:03`).
- **Log structure :** retourner un objet `{ processed: {...}, errors: N, errorTenantIds: [...] }` pour observabilité (le owner peut diagnostiquer).

### Alternative self-hosted (si migration future)

Si l'architecture quitte Vercel pour du self-hosted (Docker/VPS), l'équivalent serait :
- `node-cron` ou `bree` dans un process worker séparé (PAS dans le serveur Next.js — éphémère), OU
- un systemd timer / cron système qui `curl` la même route `/api/cron/expiry-reminders`.

L'API `runExpiryJob()` étant découplée du transport HTTP, elle est **portable** sans réécriture.

---

## Project Context Reference

Voir `_bmad-output/project-context.md` sections :
- **Technology Stack & Versions** — Next.js 16.1.6, Drizzle 0.44.7, Vitest 4.1.9
- **TypeScript Strict Mode** — `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`
- **Framework-Specific Rules (Next.js)** — App Router API routes (`app/api/*/route.ts`), `dynamic = "force-dynamic"`
- **Database Rules (Drizzle)** — opérateurs, `date({ mode: "date" })` retourne `Date`
- **API Routes Rules** — `apiError()`, `HTTP_STATUS`, codes d'erreur
- **Audit Trail Rules (Story 6-3)** — pattern best-effort, append-only (`tenant_events`)
- **Language Convention** — UI FR (emails en français), code EN, DB snake_case EN
- **Code Organization** — `src/lib/cron/` (nouveau dossier pour cette story), `src/app/api/cron/` (nouveau)

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6 (claude-sonnet-5), via Claude Code `bmad-dev-story` workflow.

### Debug Log References

- `pnpm typecheck` — clean after each task (T2/T3/T4/T5/T6).
- `pnpm check` — 616/616 tests pass, 0 lint errors (48 pre-existing `import/order` warnings unrelated to this story, same pattern as sibling `src/lib/tenants/*.test.ts` files).
- `pnpm build` — required starting Docker Desktop (was not running) + `docker compose up -d` for `db:migrate`; build then completed cleanly, `/api/cron/expiry-reminders` listed as dynamic (ƒ) route.
- Manual smoke test (`CRON_SECRET=dev-secret pnpm dev` + `curl`): no header → 401 `UNAUTHORIZED`; `Authorization: Bearer dev-secret` → 200 `{"processed":{"reminders":0,"suspended":0,"graceExpired":0,"errors":0},"errorTenantIds":[],"at":"..."}` — matches AC1 exactly.

### Completion Notes List

- Implemented all 10 ACs: cron route with CRON_SECRET auth (AC1), pure `computeReminderAction` with calendar-day threshold logic (AC2), idempotent J-7/J-3/J-1 reminder emails (AC3/AC4), auto-suspension at J0 with payment-coverage guard (AC5), idempotent grace-expired confirmation event (AC6), no UI added (AC9), exclusion of cancelled/free/no-subscriptionEnd/no-admin tenants (AC7), per-tenant error isolation (AC8), full test coverage (AC10).
- **Deviation from story pseudocode (justified):** `runExpiryJob`, `hasReminderBeenSent`, `hasPaymentCoveringPeriod`, and `hasGraceExpiredEventBeenSent` use the module-level `db` import from `@/lib/db` (mocked via `vi.mock` in tests) rather than an injected `db` parameter. This matches the established convention across every sibling file in `src/lib/tenants/` (`suspend.ts`, `record-payment.ts`, `cancel.ts`, `create-tenant.ts`) and their tests, none of which use parameter-injected `db`. Only `now` is injected as a parameter (also matching `enforceTenantAccess`/`canTransition`/`calculateTrialDates`).
- **Reused existing helpers instead of duplicating per story pseudocode:** `getTenantAdminEmail` and `buildOwnerContact` from `src/lib/tenants/tenant-contact.ts` (already built in story 7-4/7-5) rather than writing new local versions — avoids duplicate logic, same behavior.
- `escapeHtml`/`escapeAttribute` exported from `src/lib/email.ts` (T4) as specified — additive, non-breaking; existing callers (`buildResetPasswordHtml`) unaffected. `reminder-email.ts` imports these instead of duplicating them (unlike `suspend-email.ts`, which predates this convention).
- `tenant_events.actorId = "system"` sentinel confirmed safe: schema has no FK on `actorId` (`text NOT NULL`, comment explicitly allows a "SYSTEM" sentinel), and the `"system"` string sentinel is already used elsewhere in the codebase (`src/lib/quota/quota-notify.ts`, `who: "system"`).
- `vercel.json` created fresh at repo root (none existed) with the single cron entry; Hobby plan limit (2 jobs, daily-minimum) documented in Dev Notes, not re-litigated here.
- Route test uses real `Request`/`Response` objects (no `next/server` mocking needed) and mocks only `@/lib/cron/expiry-job`.
- No new dependencies installed.

### File List

**Created:**
- `src/lib/cron/constants.ts`
- `src/lib/cron/expiry-decisions.ts`
- `src/lib/cron/expiry-decisions.test.ts`
- `src/lib/cron/reminder-email.ts`
- `src/lib/cron/reminder-email.test.ts`
- `src/lib/cron/expiry-job.ts`
- `src/lib/cron/expiry-job.test.ts`
- `src/app/api/cron/expiry-reminders/route.ts`
- `src/app/api/cron/expiry-reminders/route.test.ts`
- `vercel.json`

**Modified:**
- `src/lib/email.ts` — exported `escapeHtml` / `escapeAttribute` (additive)
- `env.example` — added `CRON_SECRET=`
- `src/messages/fr-NE.json` — added `cron.emails` section
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status tracking (in-progress → review)

### Review Findings

_Code review adversarial (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 2026-07-03. Vérifs : typecheck ✓, 46/46 tests cron ✓._

**Décisions résolues (2026-07-03) → converties en patches :**

- [x] [Review][Decision→Patch] Accès pendant la grâce → **Option (a) retenue : lecture seule dès J0** (grâce = fenêtre pour payer avant blocage total). Actions : (P6) corriger la copie email 7-6 (`buildExpiryEmailHtml`/`Text` — la grâce n'implique plus accès complet) ; (P7, cross-story) aligner `enforceTenantAccess` (7-1) sur `assertTenantWritable` pour que suspended = lecture seule dès J0 côté nav. [Edge #3]
- [x] [Review][Decision→Patch] Runs manqués → **Rattrapage retenu** : `computeReminderAction` renvoie le plus grand palier non-envoyé où `daysRemaining ≤ seuil` (P8). L'idempotence `hasReminderBeenSent` empêche le double-envoi. [Blind #1 + Edge #1]
- [x] [Review][Decision→Patch] Timezone → **UTC partout retenu** : couvert par P2 (`formatDateFR` `timeZone:"UTC"`) + documenter `TZ=UTC` runtime (P9). [Blind #4/#6 + Edge #1/#2]

**Patches (appliqués 2026-07-03 — lint 0 erreur, typecheck ✓, 621/621 tests) :**

- [x] [Review][Patch] `env.example` : remplacé la var morte `OWNER_CONTACT` par `OWNER_WHATSAPP` / `OWNER_EMAIL` (réellement lues par `buildOwnerContact`). [env.example]
- [x] [Review][Patch] `formatDateFR` : ajouté `timeZone: "UTC"` pour aligner l'affichage sur le calcul de jours UTC. [src/lib/cron/expiry-job.ts]
- [x] [Review][Patch] Suspension atomique : `update(tenants)` + `insert(tenantEvents suspended)` enveloppés dans `db.transaction` (postgres-js). [src/lib/cron/expiry-job.ts]
- [x] [Review][Patch] `getTenantAdminEmail` : ajouté `orderBy(asc(user.createdAt))` — destinataire déterministe, aligné sur `record-payment.ts`. [src/lib/tenants/tenant-contact.ts]
- [x] [Review][Patch] Tests job-level skip free / cancelled / subscriptionEnd null ajoutés. [src/lib/cron/expiry-job.test.ts]
- [x] [Review][Patch] (P6) Copie email d'expiration reformulée : lecture seule effective dès la suspension, grâce = fenêtre pour rétablir un accès complet. [src/lib/cron/reminder-email.ts]
- [x] [Review][Patch] (P7) **Non nécessaire — replié dans P6.** Vérif : `enforceTenantAccess` renvoie déjà `allow` pour suspended (nav lecture) tandis que `assertTenantWritable` bloque les écritures = lecture seule dès J0 par design 7-1. Seule la copie email était incohérente (corrigée en P6). Aucun changement de `tenant-enforcement.ts`. [src/lib/tenants/tenant-enforcement.ts]
- [x] [Review][Patch] (P8) `computeReminderAction` : rattrapage via `stageForDaysRemaining` — fenêtres (≤7→first, ≤3→second, ≤1→urgent) au lieu de l'égalité stricte ; un run manqué déclenche quand même le rappel de la bonne urgence, l'idempotence `hasReminderBeenSent` limite à un email par fenêtre. Tests J-6/J-2 mis à jour + tests unitaires `stageForDaysRemaining`. [src/lib/cron/expiry-decisions.ts]
- [x] [Review][Patch] (P9) Documenté l'exigence runtime `TZ=UTC` dans env.example. [env.example]

**Différés (réels, non causés par 7-6 ou hors périmètre actuel) :**

- [x] [Review][Defer] Grâce ancrée au run du job pour un tenant active expiré depuis longtemps (crons manqués) → grâce fraîche recalculée. [src/lib/cron/expiry-decisions.ts] — deferred, edge tolérable MVP
- [x] [Review][Defer] Pas de batching/budget-temps sur le SELECT tenants — risque timeout function sur grande base. [src/lib/cron/expiry-job.ts:1089] — deferred, scalabilité post-MVP
- [x] [Review][Defer] Tenant suspended avec `gracePeriodEndsAt=null` (suspension manuelle 7-5) jamais traité → aucun event grace-expired. [src/lib/cron/expiry-decisions.ts:524-528] — deferred, dépend sémantique 7-5
- [x] [Review][Defer] En dev/preview sans `RESEND_API_KEY`, `sendEmail` no-op mais event `reminder_sent` loggé → si preview pointe la DB prod, rappel réel supprimé. [src/lib/email.ts:33-37] — deferred, couplage infra (preview ≠ DB prod)
- [x] [Review][Defer] `eventType='reminder_sent'` réutilisé pour l'event "payment covers period" — sémantique/analytics polluée (imposé par spec T5). [src/lib/cron/expiry-job.ts:1150] — deferred, conforme spec
- [x] [Review][Defer] Fuite de périmètre : working-tree `src/messages/fr-NE.json` embarque des sections i18n `subscriptionExpired`/`subscription`/`owner.*` (~250 lignes) appartenant à 7-2/7-4/7-5/7-7, non commitées. [src/messages/fr-NE.json] — deferred, hygiène de commit (séparer avant merge)

_Rejetés (bruit) : `subscriptionEnd!` (gardé par filtre SQL) ; `javascript:` dans href (slug validé/contrôlé) ; commentaire schéma "SYSTEM" vs code "system" (cosmétique, pas de FK)._

### Change Log

- Story 7-6 créée : cron expiration + rappels automatiques — Epic 7 §3.5 + §3.6 + §7 (Date: 2026-06-28)
- Story 7-6 implémentée : cron `/api/cron/expiry-reminders` (CRON_SECRET), `computeReminderAction` pur (J-7/J-3/J-1/expired/grace-expired), rappels email idempotents, auto-suspension J0 avec guard paiement, confirmation grace-expired idempotente, isolation d'erreur par tenant, `vercel.json` créé, `escapeHtml`/`escapeAttribute` exportés de `email.ts`. 42 nouveaux tests (616/616 total), `pnpm check` + `pnpm build` verts, smoke test manuel 401/200 confirmé (Date: 2026-07-03)
- Story 7-6 code review (opus-4-8, 3 couches adversariales) : 3 décisions résolues + 9 patches appliqués (env vars, formatDateFR UTC, suspension atomique `db.transaction`, getTenantAdminEmail déterministe, rattrapage runs manqués via fenêtres, copie email lecture-seule-dès-J0, tests skip niveau job). P7 (align enforceTenantAccess) jugé non nécessaire (design read-only déjà correct). 6 items différés (dont fuite de périmètre i18n à séparer). lint 0 erreur, typecheck ✓, 621/621 tests. Statut → done (Date: 2026-07-03)
