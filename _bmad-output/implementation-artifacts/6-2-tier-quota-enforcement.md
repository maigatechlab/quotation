---
story_key: 6-2-tier-quota-enforcement
epic_num: 6
story_num: 2
status: ready-for-dev
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 6.2 : Enforcement des quotas par tier (PRD §12)

**Statut :** ready-for-dev

## Story

**En tant qu'** opérateur de la plateforme,
**Je veux** que les quotas par tier soient appliqués avant les mutations,
**Afin que** l'usage reste conforme à l'abonnement avec une période de grâce (PRD §12).

---

## Critères d'acceptation (BDD)

**AC1 — Matrice de quotas par tier**

```
GIVEN  la matrice tier définie dans PRD §12
THEN  les quotas sont :
      Tier "starter"    : 1 utilisateur, 50 devis/mois
      Tier "pro"        : 3 utilisateurs, illimité devis
      Tier "entreprise" : 10 utilisateurs, illimité devis

      Modèles routes/corridors (FR-NEW-ROUTES Story 6.5) : gaté tier "pro" et "entreprise"
      → cette feature gate est prévue ici mais son enforcement complet est dans Story 6.5
```

**AC2 — Hook pré-mutation : création de devis**

```
GIVEN  un utilisateur sur tier "starter" avec 50 devis créés ce mois
WHEN  il tente de créer un devis supplémentaire (POST via sync/push, entity="quote", type="create")
THEN  le serveur retourne HTTP 429 avec corps { error: { code: "QUOTA_EXCEEDED", message: "..." } }
AND   aucun devis n'est créé

GIVEN  un utilisateur sur tier "starter" avec 49 devis ce mois
WHEN  il crée un devis
THEN  la création réussit normalement (HTTP 200)
```

**AC3 — Hook pré-mutation : ajout d'utilisateur**

```
GIVEN  un admin sur tier "starter" avec 1 utilisateur actif
WHEN  il tente d'inviter/créer un utilisateur supplémentaire (POST /api/v1/users)
THEN  le serveur retourne HTTP 429 { error: { code: "QUOTA_EXCEEDED", message: "..." } }
AND   aucun utilisateur n'est créé

GIVEN  un admin sur tier "pro" avec 3 utilisateurs actifs
WHEN  il tente d'ajouter un 4ème
THEN  HTTP 429 QUOTA_EXCEEDED
```

**AC4 — Notification à 80% du quota**

```
GIVEN  un utilisateur sur tier "starter"
WHEN  il crée son 40ème devis ce mois (80% de 50)
THEN  une notification in-app est émise : "Vous avez utilisé 80% de votre quota de devis (40/50)"
AND   un email de notification est envoyé à l'admin de la société
      (via lib/email.ts, template existant, asynchrone / best-effort)

WHEN  le 41ème, 42ème... devis est créé (>80%)
THEN  la notification in-app n'est PAS re-émise (une seule fois par pallier)
```

**AC5 — Grace period 7 jours**

```
GIVEN  un compte en dépassement de quota (>50 devis/mois pour starter)
WHEN  la grace period de 7 jours est active
THEN  les opérations de lecture restent possibles
AND   les nouvelles créations sont bloquées (HTTP 429)
AND   l'UI affiche une bannière "Quota dépassé — mise à niveau requise dans N jours"

WHEN  la grace period de 7 jours expire (graceExpiresAt < now())
THEN  le compte passe en mode lecture seule (quotaStatus = "readonly")
AND   toute mutation (create/update/delete) retourne HTTP 429 READONLY_MODE
AND   les sync pull restent actifs
```

**AC6 — Endpoint quota status**

```
GIVEN  un utilisateur authentifié
WHEN  il appelle GET /api/v1/quota
THEN  HTTP 200 avec :
      {
        tier: "starter" | "pro" | "entreprise",
        quotaStatus: "ok" | "warning" | "exceeded" | "readonly",
        quotas: {
          quotes: { limit: 50 | null, used: number, resetAt: string },
          users: { limit: 1 | 3 | 10, used: number }
        },
        graceExpiresAt: string | null
      }
```

**AC7 — Indicateur UI quota**

```
GIVEN  un utilisateur dont le quotaStatus est "warning" (≥80%)
WHEN  il est dans l'app (shell applicatif)
THEN  un bandeau non-bloquant s'affiche : "40/50 devis utilisés ce mois — Passer à Pro"

GIVEN  un quotaStatus "exceeded" ou "readonly"
WHEN  l'utilisateur est dans l'app
THEN  un bandeau bloquant (rouge) s'affiche en haut : "Quota dépassé — Mode lecture seule actif"
```

**AC8 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN  pnpm check
THEN  lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND   pnpm build passe sans erreur
AND   tests unitaires : matrice quotas ✓, hook pré-mutation ✓, calcul 80% ✓
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/schema.ts` — UPDATE : ajouter table `companySubscription` (tier, quotaStatus, graceExpiresAt, quotaResetAt, quotaUsedQuotes, quotaUsedUsers)
- `drizzle/` — générer + committer la migration
- `src/lib/quota/quota-config.ts` — CRÉER : matrice quotas (TIER_QUOTAS constant)
- `src/lib/quota/quota-check.ts` — CRÉER : `checkQuota(companyId, action, db)` retourne QuotaCheckResult
- `src/lib/quota/quota-notify.ts` — CRÉER : `notifyQuota80Percent(companyId, used, limit)` (email + audit)
- `src/app/api/v1/sync/push/route.ts` — UPDATE : injecter `checkQuota` avant les mutations create (quote, client, user)
- `src/app/api/v1/users/route.ts` — UPDATE : injecter `checkQuota` avant POST (create user)
- `src/app/api/v1/quota/route.ts` — CRÉER : GET handler quota status
- `src/components/shared/quota-banner.tsx` — CRÉER : composant bannière quota (warning + readonly)
- `src/hooks/use-quota-status.ts` — CRÉER : hook fetch GET /api/v1/quota (SWR ou fetch simple)
- `src/app/(app)/layout.tsx` — UPDATE : monter QuotaBanner
- `src/messages/fr-NE.json` — UPDATE : ajouter clés quota
- `src/lib/quota/quota.test.ts` — CRÉER : tests unitaires

**EXCLU (ne pas modifier) :**
- `src/lib/permissions.ts` — RBAC inchangé (quota ≠ permission)
- `src/app/api/v1/sync/pull/route.ts` — le pull reste toujours actif (lecture)
- `src/lib/local-db.ts` — quota géré côté serveur uniquement
- Aucun changement au moteur de sync côté client

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `src/lib/schema.ts` + migration

- [ ] Ajouter la table `companySubscription` :
  ```ts
  export const tierEnum = pgEnum("tier", ["starter", "pro", "entreprise"]);
  export const quotaStatusEnum = pgEnum("quota_status", ["ok", "warning", "exceeded", "readonly"]);

  export const companySubscription = pgTable("company_subscription", {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().unique(),
    tier: tierEnum("tier").notNull().default("starter"),
    quotaStatus: quotaStatusEnum("quota_status").notNull().default("ok"),
    quotaUsedQuotes: integer("quota_used_quotes").notNull().default(0),
    quotaUsedUsers: integer("quota_used_users").notNull().default(0),
    quotaResetAt: timestamp("quota_reset_at").notNull(),   // 1er du mois prochain
    graceExpiresAt: timestamp("grace_expires_at"),          // null si pas en dépassement
    exceededAt: timestamp("exceeded_at"),                   // null si pas dépassé
    notified80pct: boolean("notified_80pct").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  }, (t) => [
    index("idx_company_sub_company_id").on(t.companyId),
  ]);
  ```
- [ ] Exécuter `pnpm db:generate` (génère migration dans `drizzle/`)
- [ ] Exécuter `pnpm db:migrate` (applique sur la DB locale Docker)
- [ ] Vérifier que les fichiers dans `drizzle/` sont créés (`0008_*.sql` ou suivant)
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/lib/quota/quota-config.ts`

- [ ] Définir la matrice de quotas :
  ```ts
  export type Tier = "starter" | "pro" | "entreprise";

  export interface TierQuota {
    quotesPerMonth: number | null;  // null = illimité
    usersMax: number;
    routeTemplatesAllowed: boolean; // gaté pour Story 6.5
  }

  export const TIER_QUOTAS: Record<Tier, TierQuota> = {
    starter: {
      quotesPerMonth: 50,
      usersMax: 1,
      routeTemplatesAllowed: false,
    },
    pro: {
      quotesPerMonth: null,  // illimité
      usersMax: 3,
      routeTemplatesAllowed: true,
    },
    entreprise: {
      quotesPerMonth: null,  // illimité
      usersMax: 10,
      routeTemplatesAllowed: true,
    },
  };

  export const GRACE_PERIOD_DAYS = 7;
  export const QUOTA_WARNING_THRESHOLD = 0.8; // 80%
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Créer `src/lib/quota/quota-check.ts`

- [ ] Définir les types de résultat :
  ```ts
  export type QuotaAction = "quote.create" | "user.create";

  export type QuotaCheckResult =
    | { allowed: true; warn80pct: boolean; used: number; limit: number | null }
    | { allowed: false; reason: "QUOTA_EXCEEDED" | "READONLY_MODE"; message: string };
  ```
- [ ] Implémenter `checkQuota(companyId: string, action: QuotaAction, dbClient: typeof db): Promise<QuotaCheckResult>` :
  1. Récupérer `companySubscription` pour `companyId`
  2. Si pas de subscription → créer une subscription "starter" par défaut (seeding automatique)
  3. Si `quotaStatus === "readonly"` → `{ allowed: false, reason: "READONLY_MODE" }`
  4. Si `quotaStatus === "exceeded"` ET `graceExpiresAt < now()` → passer à "readonly" + retourner blocked
  5. Pour `quote.create` : vérifier `quotaUsedQuotes < TIER_QUOTAS[tier].quotesPerMonth` (si not null)
  6. Pour `user.create` : vérifier count users actifs pour ce companyId < `usersMax`
  7. Calculer le warn80pct
  8. Retourner `{ allowed: true, warn80pct, used, limit }`
- [ ] Implémenter `incrementQuotaUsed(companyId: string, action: QuotaAction, dbClient: typeof db): Promise<void>` :
  - Incrémente `quotaUsedQuotes` ou `quotaUsedUsers` dans `companySubscription`
  - Si dépassement après incrément → set `quotaStatus = "exceeded"`, `exceededAt = now()`, `graceExpiresAt = now() + 7 days`
- [ ] Implémenter `resetQuotaIfNeeded(sub: CompanySubscription): boolean` :
  - Si `quotaResetAt < now()` → reset `quotaUsedQuotes = 0`, `notified80pct = false`, `quotaResetAt = 1er du mois suivant`
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/lib/quota/quota-notify.ts`

- [ ] Implémenter `notifyQuota80Percent(companyId: string, used: number, limit: number, dbClient: typeof db): Promise<void>` :
  - Chercher l'admin de la société dans `user` (role = "admin", companyId = companyId)
  - Si trouvé → envoyer email via `lib/email.ts` (pattern existant)
  - Émettre un AuditEvent (what: "quota.warning_80pct", entityType: "company", entityId: companyId)
  - Mettre `notified80pct = true` dans `companySubscription`
- [ ] Gestion best-effort : `try/catch` autour de l'envoi email (ne pas faire échouer la mutation)
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Mettre à jour `src/app/api/v1/sync/push/route.ts`

- [ ] Importer `checkQuota`, `incrementQuotaUsed`, `notifyQuota80Percent`
- [ ] Dans la boucle de traitement des ops, avant le switch sur `entity` :
  ```ts
  // Pour entity === "quote" && type === "create"
  if (op.entity === "quote" && op.type === "create" && tenantId) {
    const quotaResult = await checkQuota(tenantId, "quote.create", db);
    if (!quotaResult.allowed) {
      results.push({ opId: op.opId, status: "conflict", entity: { error: quotaResult.reason } });
      continue; // ne pas traiter cet op
    }
    // Après création réussie :
    await incrementQuotaUsed(tenantId, "quote.create", db);
    if (quotaResult.warn80pct) {
      void notifyQuota80Percent(tenantId, quotaResult.used + 1, quotaResult.limit!, db);
    }
  }
  ```
- [ ] Préserver tous les autres cas sans modification
- [ ] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/app/api/v1/users/route.ts`

- [ ] Dans le handler POST (création d'utilisateur), avant l'insert :
  ```ts
  const quotaResult = await checkQuota(tenantId, "user.create", db);
  if (!quotaResult.allowed) {
    return apiError(HTTP_STATUS.TOO_MANY_REQUESTS, "QUOTA_EXCEEDED", "Limite d'utilisateurs atteinte pour votre tier.");
  }
  // après création : await incrementQuotaUsed(tenantId, "user.create", db);
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T7 — Créer `src/app/api/v1/quota/route.ts`

- [ ] GET handler authentifié :
  ```ts
  export async function GET(req: Request) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.companyId) return apiError(401, "UNAUTHENTICATED", "...");

    const sub = await getOrCreateSubscription(session.user.companyId, db);
    const tier = sub.tier;
    const quota = TIER_QUOTAS[tier];

    return NextResponse.json({
      tier,
      quotaStatus: sub.quotaStatus,
      quotas: {
        quotes: {
          limit: quota.quotesPerMonth,
          used: sub.quotaUsedQuotes,
          resetAt: sub.quotaResetAt.toISOString(),
        },
        users: {
          limit: quota.usersMax,
          used: sub.quotaUsedUsers,
        },
      },
      graceExpiresAt: sub.graceExpiresAt?.toISOString() ?? null,
    });
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T8 — Créer `src/hooks/use-quota-status.ts`

- [ ] Hook client qui fetch GET /api/v1/quota :
  ```ts
  "use client";

  import { useState, useEffect } from "react";

  export interface QuotaStatus {
    tier: "starter" | "pro" | "entreprise";
    quotaStatus: "ok" | "warning" | "exceeded" | "readonly";
    quotas: {
      quotes: { limit: number | null; used: number; resetAt: string };
      users: { limit: number; used: number };
    };
    graceExpiresAt: string | null;
  }

  export function useQuotaStatus(): QuotaStatus | null {
    const [status, setStatus] = useState<QuotaStatus | null>(null);

    useEffect(() => {
      fetch("/api/v1/quota")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setStatus(data as QuotaStatus); })
        .catch(() => {});
    }, []);

    return status;
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T9 — Créer `src/components/shared/quota-banner.tsx`

- [ ] `"use client"` première ligne
- [ ] Composant `QuotaBanner` utilisant `useQuotaStatus()` :
  ```tsx
  export function QuotaBanner() {
    const quota = useQuotaStatus();
    if (!quota || quota.quotaStatus === "ok") return null;

    if (quota.quotaStatus === "warning") {
      const used = quota.quotas.quotes.used;
      const limit = quota.quotas.quotes.limit;
      return (
        <div role="alert" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center">
          {t("quota.warning", { used, limit })} — <a href="/parametres" className="underline">{t("quota.upgrade")}</a>
        </div>
      );
    }

    if (quota.quotaStatus === "exceeded" || quota.quotaStatus === "readonly") {
      const days = quota.graceExpiresAt
        ? Math.max(0, Math.ceil((new Date(quota.graceExpiresAt).getTime() - Date.now()) / 86_400_000))
        : 0;
      return (
        <div role="alert" className="bg-red-600 px-4 py-2 text-xs text-white text-center">
          {quota.quotaStatus === "readonly"
            ? t("quota.readonly")
            : t("quota.exceeded", { days })}
          {" — "}<a href="/parametres" className="underline font-semibold">{t("quota.upgradeNow")}</a>
        </div>
      );
    }
    return null;
  }
  ```
- [ ] `useTranslations("quota")` pour les strings
- [ ] `pnpm typecheck` — zéro erreur

### T10 — Mettre à jour `src/app/(app)/layout.tsx`

- [ ] Importer et monter `<QuotaBanner />` en haut du shell applicatif (avant le contenu, sous la nav)
- [ ] `pnpm typecheck` — zéro erreur

### T11 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter section `quota` :
  ```json
  "quota": {
    "warning": "Vous avez utilisé {used}/{limit} devis ce mois",
    "upgrade": "Passer à Pro",
    "exceeded": "Quota dépassé — Mode lecture seule dans {days} jours",
    "readonly": "Mode lecture seule actif — Quota dépassé",
    "upgradeNow": "Mettre à niveau maintenant",
    "errorQuotaExceeded": "Quota atteint. Mettez votre compte à niveau pour continuer.",
    "errorReadonly": "Compte en mode lecture seule. Contactez l'administrateur."
  }
  ```

### T12 — Créer `src/lib/quota/quota.test.ts`

- [ ] Tests Vitest :
  ```ts
  describe("TIER_QUOTAS", () => {
    it("starter has 50 quotes/month limit", ...);
    it("pro has null (unlimited) quotes", ...);
    it("entreprise has 10 users max", ...);
  });

  describe("checkQuota", () => {
    it("allows creation when under limit", ...);
    it("blocks creation when limit reached", ...);
    it("blocks readonly mode", ...);
    it("returns warn80pct=true at 80% threshold", ...);
    it("resets quota when resetAt is past", ...);
  });
  ```
- [ ] `pnpm check` — tous tests passent

### T13 — Vérification finale (AC8)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (pas de régression)
- [ ] `pnpm build` : passe sans erreur
- [ ] Créer 50 devis → 51ème bloqué HTTP 429 ✓
- [ ] Tentative ajout user sur tier starter avec 1 user → bloqué ✓
- [ ] À 40 devis (80%) → notification in-app visible ✓
- [ ] QuotaBanner visible dans le shell ✓

---

## Dev Notes

### CRITIQUE — Pas de table tier/subscription existante dans le schéma

La table `companySubscription` n'existe pas encore dans `schema.ts`. Le seam `companyId` est présent sur toutes les entités et sur `user.companyId`. Il faut créer la table et la migration.

```typescript
// Attention : user.companyId est uuid("company_id") — peut être null
// La subscription est liée à la company (pas à l'user directement)
// companyId dans companySubscription est UNIQUE (1 subscription par company)
```

### CRITIQUE — `tenantId` dans push/route.ts

Dans `src/app/api/v1/sync/push/route.ts`, le `tenantId` est déjà résolu depuis la session :
```typescript
// Chercher le pattern existant dans push/route.ts
const session = await auth.api.getSession({ headers: await headers() });
const tenantId = session?.user?.companyId;  // uuid | null
```
Le check quota doit être conditionnel sur `tenantId !== null`.

### CRITIQUE — Increment quota APRÈS la mutation réussie

```typescript
// CORRECT : incrémenter APRÈS que la mutation soit commitée
case "quote": {
  // ... upsert quote dans DB
  await incrementQuotaUsed(tenantId!, "quote.create", db);  // APRÈS
  break;
}

// INCORRECT : incrémenter avant (si la mutation échoue, quota faussé)
await incrementQuotaUsed(...);
// ... upsert (peut échouer)
```

### CRITIQUE — quotaResetAt : initialisation

La `quotaResetAt` doit être le **1er du mois prochain à minuit UTC** :
```typescript
function nextResetDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
}
```

### CRITIQUE — Pas de quota côté client / Dexie

Le quota est **serveur uniquement**. Le client (Dexie, outbox) ne connaît pas le quota. Si la sync push retourne un conflict pour cause de quota, le SyncOp reste dans l'outbox avec `failed = true` et `lastError = "QUOTA_EXCEEDED"`. L'UI d'erreur sync gère ce cas.

### CRITIQUE — Grace period : déclenchement

La grace period démarre au moment où `quotaUsedQuotes > limit` pour la première fois dans le mois. Elle est stockée dans `graceExpiresAt = exceededAt + 7 jours`. À chaque mutation, si `exceededAt` est non-null et `graceExpiresAt < now()`, on bascule en `readonly`.

```typescript
// Dans checkQuota, avant toute autre vérification :
if (sub.quotaStatus === "exceeded" && sub.graceExpiresAt && sub.graceExpiresAt < new Date()) {
  // Passer en readonly
  await db.update(companySubscription)
    .set({ quotaStatus: "readonly", updatedAt: new Date() })
    .where(eq(companySubscription.companyId, companyId));
  return { allowed: false, reason: "READONLY_MODE", message: "Compte en mode lecture seule." };
}
```

### CRITIQUE — `HTTP_STATUS.TOO_MANY_REQUESTS`

Vérifier que `HTTP_STATUS` dans `src/lib/api/envelope.ts` inclut `TOO_MANY_REQUESTS = 429`. Si non, l'ajouter ou utiliser le literal `429` directement.

### CRITIQUE — Seed subscription par défaut

Si une company n'a pas encore de `companySubscription`, la créer avec tier "starter" et les valeurs par défaut. Cela évite de bloquer des companies créées avant cette story.

```typescript
async function getOrCreateSubscription(companyId: string, dbClient: typeof db) {
  const existing = await dbClient.query.companySubscription.findFirst({
    where: eq(companySubscription.companyId, companyId)
  });
  if (existing) return existing;
  // Créer une subscription starter par défaut
  const [created] = await dbClient.insert(companySubscription).values({
    companyId,
    tier: "starter",
    quotaStatus: "ok",
    quotaUsedQuotes: 0,
    quotaUsedUsers: 0,
    quotaResetAt: nextResetDate(),
  }).returning();
  return created;
}
```

### CRITIQUE — exactOptionalPropertyTypes TS 5.9.3

`graceExpiresAt?: ...` dans la table Drizzle. Si la colonne retourne `null` de la DB, utiliser `?? null` lors de la sérialisation JSON.

### Design tokens — bannière quota

```tsx
// Warning (amber)
className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center"

// Error / readonly (rouge)
className="bg-red-600 px-4 py-2 text-xs text-white text-center"

// Lien dans la bannière
className="underline font-semibold"
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Stocker quota dans Dexie côté client | Quota serveur uniquement |
| Incrémenter quota AVANT la mutation | Incrémenter APRÈS commit DB |
| Bloquer le sync pull pour quota | Le pull reste toujours actif |
| Réinitialiser quotaUsedUsers chaque mois | users = count actifs (pas cumulatif mensuel) |
| HTTP 403 pour quota exceeded | HTTP 429 (Too Many Requests) |
| Notification email bloquante | best-effort (try/catch, void) |

### Héritage des stories précédentes

**Architecture §54 :** "Extension seams required at MVP-0: quota hook before mutation" — le seam est prévu.

**src/app/api/v1/sync/push/route.ts :** Pattern existant de la boucle d'ops, `tenantId`, `requirePermission`, `apiError`. Le check quota s'insère dans la même logique.

**src/app/api/v1/users/route.ts :** Pattern existant pour la création d'utilisateur.

**src/lib/email.ts :** Template d'email existant depuis l'auth (reset password) — réutiliser pour quota notification.

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Générer et appliquer la migration
pnpm db:generate   # crée drizzle/0008_*.sql (ou suivant)
pnpm db:migrate    # applique

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [PRD §12] — Monetization : matrice tiers (Starter/Pro/Entreprise), quotas, grace period 7j, notification 80%
- [Architecture §54] — "Extension seams required at MVP-0: quota hook before mutation"
- [Architecture §63] — "Quota enforcement — pre-mutation hook, tier matrix, grace period"
- [src/lib/schema.ts] — Schéma Drizzle complet (ajouter companySubscription)
- [src/lib/permissions.ts] — RBAC existant (inchangé)
- [src/app/api/v1/sync/push/route.ts] — Route push : boucle ops, tenantId, apiError
- [src/app/api/v1/users/route.ts] — Route users : création utilisateur
- [src/lib/email.ts] — Envoi email (pattern existant)
- [src/lib/audit.ts] — Emission AuditEvent
- [src/app/(app)/layout.tsx] — Layout app shell (monter QuotaBanner)
- [src/messages/fr-NE.json] — i18n strings

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_À remplir par le dev agent lors de l'implémentation._

### Completion Notes List

_À remplir par le dev agent lors de l'implémentation._

### File List

- `src/lib/schema.ts` (à modifier — ajouter companySubscription)
- `drizzle/` (migration à générer)
- `src/lib/quota/quota-config.ts` (à créer)
- `src/lib/quota/quota-check.ts` (à créer)
- `src/lib/quota/quota-notify.ts` (à créer)
- `src/lib/quota/quota.test.ts` (à créer)
- `src/app/api/v1/sync/push/route.ts` (à modifier)
- `src/app/api/v1/users/route.ts` (à modifier)
- `src/app/api/v1/quota/route.ts` (à créer)
- `src/hooks/use-quota-status.ts` (à créer)
- `src/components/shared/quota-banner.tsx` (à créer)
- `src/app/(app)/layout.tsx` (à modifier)
- `src/messages/fr-NE.json` (à modifier)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/6-2-tier-quota-enforcement.md` (ce fichier)

### Change Log

- Story 6-2 créée : enforcement quotas par tier + grace period — PRD §12 (Date: 2026-06-25)
