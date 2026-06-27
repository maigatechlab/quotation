---
story_key: 6-3-immutable-audit-trail-export
epic_num: 6
story_num: 3
status: ready-for-dev
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 6.3 : Audit trail immutable & export (NFR-O1)

**Statut :** ready-for-dev

## Story

**En tant que** responsable conformité,
**Je veux** un journal d'audit append-only immutable et exportable,
**Afin que** je dispose d'une piste fiable pour la conformité réglementaire (rétention 7 ans, NFR-O1).

---

## Critères d'acceptation (BDD)

**AC1 — Immutabilité de l'audit trail serveur**

```
GIVEN  la table `audit_event` PostgreSQL existante (append-only par design)
WHEN  j'active l'immutabilité MVP-1
THEN  un trigger PostgreSQL `prevent_audit_update_delete` interdit UPDATE et DELETE sur `audit_event`
AND   toute tentative de modification retourne une erreur PostgreSQL (RAISE EXCEPTION)
AND   le trigger est posé via migration Drizzle
AND   les INSERT restent autorisés (append-only preserved)
```

**AC2 — Couverture des événements tracés**

```
GIVEN  les mutations en cours dans l'application
WHEN  un événement se produit
THEN  il est tracé dans audit_event avec who/what/when/where/entityType/entityId/before/after :

Création entité      : what = "sync.create"   (déjà implémenté push/route.ts:518-527)
Modification entité  : what = "sync.update"   (déjà implémenté)
Suppression entité   : what = "sync.delete"   (déjà implémenté)
Conflit LWW résolu   : what = "conflict.archived" (déjà implémenté push/route.ts:484-492)
Transition statut    : what = "quote.status_change" (à ajouter sur l'endpoint de statut si distinct de sync)
Génération PDF       : what = "quote.pdf_generated" (Story 4.x — à noter pour quand elle arrive)
Login utilisateur    : what = "auth.login" (à ajouter dans auth callback)
Logout utilisateur   : what = "auth.logout" (à ajouter)
Conflit résolu       : what = "conflict.resolved" (déjà émis)
```

**AC3 — Export JSON de l'audit trail**

```
GIVEN  un admin authentifié
WHEN  il appelle GET /api/v1/audit/export?format=json&from=YYYY-MM-DD&to=YYYY-MM-DD
THEN  HTTP 200 avec Content-Type: application/json
AND   corps = tableau JSON d'AuditEvent filtrés par companyId + plage de dates
AND   chaque entrée contient : id, who, what, when, where, entityType, entityId, before, after, createdAt
AND   limité à 10 000 entrées par export (protection mémoire)
AND   trié par `when` ASC

GIVEN  un utilisateur non-admin (commercial ou opérateur)
WHEN  il tente d'accéder à /api/v1/audit/export
THEN  HTTP 403 Forbidden
```

**AC4 — Export CSV de l'audit trail**

```
GIVEN  un admin authentifié
WHEN  il appelle GET /api/v1/audit/export?format=csv&from=YYYY-MM-DD&to=YYYY-MM-DD
THEN  HTTP 200 avec Content-Type: text/csv; charset=utf-8
AND   Content-Disposition: attachment; filename="audit-{companyId}-{date}.csv"
AND   première ligne = en-têtes CSV : id,who,what,when,where,entityType,entityId,before,after,createdAt
AND   colonnes before/after sérialisées en JSON inline (escapées pour CSV)
AND   encodage UTF-8 avec BOM pour compatibilité Excel
```

**AC5 — Interface d'export dans les Paramètres**

```
GIVEN  un admin sur la page /parametres
WHEN  il consulte la section "Audit & Conformité"
THEN  un formulaire s'affiche avec :
      - Sélecteur date début (date input)
      - Sélecteur date fin (date input, défaut = aujourd'hui)
      - Boutons "Télécharger JSON" et "Télécharger CSV"

WHEN  l'admin clique "Télécharger JSON" ou "Télécharger CSV"
THEN  le fichier est téléchargé (download direct, pas de nouvel onglet)
AND   un toast confirme "Export audit téléchargé"
```

**AC6 — Login/logout tracés**

```
GIVEN  un utilisateur qui se connecte avec succès
WHEN  le login est validé par Better Auth
THEN  un AuditEvent est émis : who=userId, what="auth.login", where=IP+userAgent, entityType="user", entityId=userId

GIVEN  un utilisateur qui se déconnecte
WHEN  le logout est déclenché (signOut)
THEN  un AuditEvent est émis : who=userId, what="auth.logout"
```

**AC7 — Rétention 7 ans**

```
GIVEN  la politique de rétention audit (PRD §15.3)
WHEN  le système est en production
THEN  la table audit_event N'A PAS de politique de suppression automatique (rétention manuelle)
AND   un commentaire dans le code documente "Rétention 7 ans — ne pas purger avant 2033+"
AND   un index `idx_audit_event_when` sur `when` est créé pour les queries d'export
```

**AC8 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN  pnpm check
THEN  lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND   pnpm build passe sans erreur
AND   test d'intégration : trigger immutabilité bloque DELETE ✓, export JSON ✓, export CSV ✓
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/schema.ts` — UPDATE : ajouter index `idx_audit_event_when` sur colonne `when` ; la table `audit_event` existe déjà
- `drizzle/` — générer + committer la migration (trigger SQL + index)
- `src/app/api/v1/audit/export/route.ts` — CRÉER : GET handler export JSON/CSV (admin uniquement)
- `src/lib/audit.ts` — UPDATE : ajouter les fonctions `emitLoginAudit` / `emitLogoutAudit`
- `src/lib/auth.ts` — UPDATE : hooks Better Auth pour tracer login/logout
- `src/components/settings/audit-export.tsx` — CRÉER : composant UI export audit (section Paramètres admin)
- `src/app/(app)/parametres/page.tsx` — UPDATE : monter AuditExport (admin only)
- `src/messages/fr-NE.json` — UPDATE : ajouter clés audit

**EXCLU (ne pas modifier) :**
- La table `audit_event` elle-même dans `schema.ts` — elle existe déjà avec tous les champs requis
- `src/app/api/v1/sync/push/route.ts` — les événements sync.create/update/delete/conflict.archived sont déjà émis
- `src/lib/local-db.ts` — `auditMirror` Dexie existe (miroir client-side, non modifié dans cette story)
- Aucune modification du moteur de sync
- Génération PDF tracée dans Story 4.x (hors périmètre)

---

## Tâches / Sous-tâches

### T1 — Migration : trigger immutabilité + index

- [ ] Créer la migration SQL **à la main** (pas via Drizzle schema change pour les triggers) :
  Créer le fichier `drizzle/XXXX_audit_immutable_trigger.sql` OU ajouter le trigger dans la migration générée

  **Option retenue : migration SQL custom via Drizzle `sql` template** :
  Dans `src/lib/schema.ts`, ne rien ajouter (trigger non supporté nativement par Drizzle).
  À la place, créer le fichier de migration à la main :

  ```sql
  -- drizzle/XXXX_audit_immutable.sql
  -- Trigger immutabilité audit_event (NFR-O1 MVP-1)
  -- Rétention 7 ans — ne pas purger avant 2033+

  CREATE OR REPLACE FUNCTION prevent_audit_mutation()
  RETURNS trigger AS $$
  BEGIN
    RAISE EXCEPTION 'audit_event is immutable: % on row % is forbidden', TG_OP, OLD.id;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER prevent_audit_update_delete
    BEFORE UPDATE OR DELETE ON audit_event
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

  -- Index for date-range exports
  CREATE INDEX IF NOT EXISTS idx_audit_event_when ON audit_event ("when");
  ```

- [ ] Ajouter l'index `idx_audit_event_when` dans `src/lib/schema.ts` pour la cohérence de type Drizzle :
  ```ts
  export const auditEvent = pgTable("audit_event", {
    // ... champs existants inchangés
  }, (t) => [
    index("idx_audit_event_entity").on(t.entityType, t.entityId),
    index("idx_audit_event_who").on(t.who),
    index("idx_audit_event_when").on(t.when),  // AJOUTER
  ]);
  ```

- [ ] Enregistrer la migration dans `drizzle/meta/_journal.json` manuellement ou via `pnpm db:generate` + éditer le SQL généré pour ajouter le trigger

- [ ] Exécuter `pnpm db:migrate`

- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/app/api/v1/audit/export/route.ts`

- [ ] Handler GET authentifié, admin uniquement :
  ```ts
  import { headers } from "next/headers";
  import { NextResponse } from "next/server";
  import { and, gte, lte, eq } from "drizzle-orm";
  import { auth } from "@/lib/auth";
  import { db } from "@/lib/db";
  import { auditEvent } from "@/lib/schema";
  import { apiError, HTTP_STATUS } from "@/lib/api/envelope";

  const EXPORT_LIMIT = 10_000;

  export async function GET(req: Request) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return apiError(401, "UNAUTHENTICATED", "Non authentifié.");
    if (session.user.role !== "admin") return apiError(403, "FORBIDDEN", "Réservé aux administrateurs.");

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") ?? "json";
    const from = searchParams.get("from");
    const to = searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

    const companyId = session.user.companyId;

    // Build filters
    const conditions = [];
    if (from) conditions.push(gte(auditEvent.when, new Date(from)));
    if (to) conditions.push(lte(auditEvent.when, new Date(to + "T23:59:59Z")));
    // Filter by companyId via who (userId in the company)
    // Note: audit_event has no companyId — filter via JOIN with user table
    // For MVP-1: use userId list for this company (sub-query or pre-fetch)
    const userIds = await getUserIdsForCompany(companyId, db);

    const events = await db.select().from(auditEvent)
      .where(and(
        ...conditions,
        // filter who IN userIds (or use sql`who = ANY(${userIds})`)
      ))
      .orderBy(auditEvent.when)
      .limit(EXPORT_LIMIT);

    if (format === "csv") {
      const csv = buildCsv(events);
      const today = new Date().toISOString().slice(0, 10);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-${companyId ?? "export"}-${today}.csv"`,
        },
      });
    }

    return NextResponse.json(events);
  }
  ```

- [ ] Implémenter `buildCsv(events)` :
  ```ts
  function buildCsv(events: typeof auditEvent.$inferSelect[]): string {
    const HEADERS = ["id","who","what","when","where","entityType","entityId","before","after","createdAt"];
    const rows = events.map(e => [
      e.id, e.who, e.what, e.when.toISOString(), e.where,
      e.entityType, e.entityId,
      JSON.stringify(e.before ?? null).replace(/"/g, '""'),
      JSON.stringify(e.after ?? null).replace(/"/g, '""'),
      e.createdAt.toISOString(),
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    // BOM UTF-8 pour compatibilité Excel
    return "﻿" + [HEADERS.join(","), ...rows].join("\r\n");
  }
  ```

- [ ] Implémenter `getUserIdsForCompany(companyId, db)` : `SELECT id FROM user WHERE company_id = $1`

- [ ] **Cas edge :** companyId null → retourner 400

- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/lib/audit.ts`

- [ ] Ajouter les fonctions spécialisées login/logout :
  ```ts
  export async function emitLoginAudit(params: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await emitAuditEvent(createAuditEvent({
      who: params.userId,
      what: "auth.login",
      where: [params.ipAddress, params.userAgent].filter(Boolean).join("|") || "unknown",
      entity: { type: "user", id: params.userId },
    }));
  }

  export async function emitLogoutAudit(params: {
    userId: string;
    ipAddress?: string | null;
  }): Promise<void> {
    await emitAuditEvent(createAuditEvent({
      who: params.userId,
      what: "auth.logout",
      where: params.ipAddress ?? "unknown",
      entity: { type: "user", id: params.userId },
    }));
  }
  ```
- [ ] Exporter les nouvelles fonctions
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Tracer login/logout dans `src/lib/auth.ts`

- [ ] Localiser la configuration Better Auth (hooks `onSuccess` du signIn/signOut)
- [ ] Ajouter le hook d'audit login dans Better Auth :
  ```ts
  // Dans la configuration Better Auth
  hooks: {
    after: [
      {
        matcher: (context) => context.path === "/sign-in/email" && !context.error,
        handler: async (context) => {
          // Extraire userId depuis la réponse session
          const session = context.response?.body?.session;
          if (session?.userId) {
            await emitLoginAudit({
              userId: session.userId,
              ipAddress: context.request?.headers?.get("x-forwarded-for") ?? null,
              userAgent: context.request?.headers?.get("user-agent") ?? null,
            }).catch(() => {}); // best-effort
          }
        },
      },
      {
        matcher: (context) => context.path === "/sign-out",
        handler: async (context) => {
          const session = await auth.api.getSession({ headers: context.request!.headers });
          if (session?.user?.id) {
            await emitLogoutAudit({
              userId: session.user.id,
              ipAddress: context.request?.headers?.get("x-forwarded-for") ?? null,
            }).catch(() => {});
          }
        },
      },
    ],
  },
  ```
- [ ] **Alternative si Better Auth hooks ne supportent pas ce pattern :** créer une route middleware API `/api/auth/login-hook` ou wraper le handler auth
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Créer `src/components/settings/audit-export.tsx`

- [ ] `"use client"` première ligne
- [ ] Composant `AuditExport` avec formulaire de téléchargement :
  ```tsx
  export function AuditExport() {
    const t = useTranslations("parametres.audit");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
    const [isPending, setIsPending] = useState(false);

    async function handleExport(format: "json" | "csv") {
      setIsPending(true);
      try {
        const params = new URLSearchParams({ format, ...(from ? { from } : {}), to });
        const res = await fetch(`/api/v1/audit/export?${params}`);
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const today = new Date().toISOString().slice(0, 10);
        const ext = format === "csv" ? "csv" : "json";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-${today}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        // toast success (utiliser le pattern sonner existant)
      } catch {
        // toast error
      } finally {
        setIsPending(false);
      }
    }

    return (
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-text-primary">{t("heading")}</h2>
        <p className="text-xs text-text-muted">{t("description")}</p>
        <div className="flex gap-3">
          <div>
            <label className="text-xs font-semibold text-text-muted">{t("from")}</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="mt-1 h-9 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary" />
          </div>
          <div>
            <label className="text-xs font-semibold text-text-muted">{t("to")}</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="mt-1 h-9 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary" />
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => handleExport("json")} disabled={isPending}
            className="h-9 rounded-xl border border-border px-4 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-60">
            {t("downloadJson")}
          </button>
          <button type="button" onClick={() => handleExport("csv")} disabled={isPending}
            className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60">
            {t("downloadCsv")}
          </button>
        </div>
        {isPending && <p className="text-xs text-text-muted">{t("exporting")}</p>}
      </div>
    );
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/app/(app)/parametres/page.tsx`

- [ ] Importer `AuditExport`
- [ ] Ajouter la section "Audit & Conformité" (visible admin uniquement) après les autres sections :
  ```tsx
  {can(role, "user.manage") && (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <AuditExport />
    </div>
  )}
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T7 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter section `parametres.audit` :
  ```json
  "audit": {
    "heading": "Audit & Conformité",
    "description": "Exportez le journal d'audit pour vos obligations de conformité (rétention 7 ans).",
    "from": "Date de début",
    "to": "Date de fin",
    "downloadJson": "Télécharger JSON",
    "downloadCsv": "Télécharger CSV",
    "exporting": "Préparation de l'export...",
    "exported": "Journal d'audit téléchargé."
  }
  ```

### T8 — Vérification finale (AC8)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests ✓ (pas de régression)
- [ ] `pnpm build` : passe sans erreur
- [ ] Trigger immutabilité : tentative DELETE sur audit_event → exception PostgreSQL ✓
- [ ] Export JSON sur plage de dates → fichier téléchargé ✓
- [ ] Export CSV → fichier UTF-8 avec BOM, colonnes correctes ✓
- [ ] Non-admin → 403 ✓
- [ ] Login tracé dans audit_event ✓

---

## Dev Notes

### CRITIQUE — La table `audit_event` existe déjà

La table `audit_event` est déjà présente dans `src/lib/schema.ts` (lignes 350-368) avec tous les champs requis (id, who, what, when, where, entityType, entityId, before, after, createdAt). **Ne pas la redéfinir.** Cette story :
1. Ajoute un index `idx_audit_event_when` (Drizzle)
2. Pose un trigger PostgreSQL (SQL custom dans la migration)

### CRITIQUE — Trigger PostgreSQL via migration custom

Drizzle ORM ne génère pas de triggers. Deux approches :

**Approche A (recommandée) :** Créer la migration à la main dans `drizzle/XXXX_audit_immutable.sql` + mettre à jour `drizzle/meta/_journal.json` manuellement. Risqué si le journal est mal formé.

**Approche B (plus robuste) :** Générer une migration vide via `pnpm db:generate` (qui détectera uniquement l'ajout de l'index `idx_audit_event_when`), puis éditer le fichier SQL généré pour y ajouter le trigger.

**Approche B détaillée :**
```bash
# 1. Ajouter l'index dans schema.ts
# 2. Générer
pnpm db:generate
# → génère drizzle/0008_audit_index.sql (ou numéro suivant)
# 3. Éditer le fichier SQL pour ajouter le trigger après l'index
# 4. pnpm db:migrate
```

Le SQL du trigger à insérer dans le fichier généré :
```sql
-- Trigger immutabilité NFR-O1 MVP-1
-- Rétention audit 7 ans — ne pas purger avant 2033+
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is immutable: operation % on row % is forbidden', TG_OP, OLD.id;
END;
$$;

CREATE TRIGGER prevent_audit_update_delete
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

### CRITIQUE — audit_event n'a pas de companyId

La table `audit_event` n'a pas de colonne `companyId`. Pour filtrer par entreprise dans l'export, il faut passer par les `userId` de cette entreprise :

```typescript
// Récupérer les userId de la company
const users = await db.select({ id: user.id })
  .from(user)
  .where(eq(user.companyId, companyId));
const userIds = users.map(u => u.id);

// Filtrer les audit events
import { inArray } from "drizzle-orm";
const events = await db.select().from(auditEvent)
  .where(and(
    inArray(auditEvent.who, userIds),
    from ? gte(auditEvent.when, new Date(from)) : undefined,
    gte(auditEvent.when, new Date(to + "T23:59:59Z"))  // attention inversion
  ));
```

**Attention :** `lte` (≤) pour `to`, `gte` (≥) pour `from`. Ne pas les inverser.

### CRITIQUE — Better Auth hooks : pattern exact

Il faut vérifier quelle version de Better Auth 1.6 est utilisée et comment ses hooks sont configurés. Lire `src/lib/auth.ts` attentivement avant d'implémenter. Better Auth 1.6 expose des hooks `onRequest`, `onResponse`, ou via la propriété `hooks` de `betterAuth({})`.

Approche alternative plus sûre : utiliser `auth.api.getSession` dans le middleware Next.js pour tracer le login.

**Approche Next.js middleware (plus sûre) :**
```ts
// src/middleware.ts ou dans un route handler dédié
// Après un signIn réussi côté client, appeler POST /api/v1/audit/login-event
// avec le userId dans le body (authentifié par la session)
```

Ou, encore plus simple : instrumenter dans les Server Actions ou dans les pages de login côté serveur.

**Décision finale pour le dev agent :** Si Better Auth hooks ne permettent pas facilement d'injecter un call DB supplémentaire (risque d'erreur ou non-support), utiliser une route dédiée appelée côté client post-login : `POST /api/v1/audit/track-login` — appelée depuis `src/components/auth/login-form.tsx` après le succès du signIn.

### CRITIQUE — Audit events existants déjà couverts

Les événements suivants sont **déjà émis** dans `push/route.ts` et ne nécessitent PAS de modification :
- `sync.create` (ligne 521)
- `sync.update` (ligne 521)
- `sync.delete` (ligne 521)
- `conflict.archived` (ligne 487)

Cette story ajoute uniquement : auth.login, auth.logout (et éventuellement quote.status_change si implémenté séparément de sync).

### CRITIQUE — Export limité à 10 000 entrées

Pour les entreprises avec beaucoup d'activité, 10 000 entrées suffit pour la plupart des exports. Si l'admin a besoin de plus, il peut diviser la plage de dates. **Ne pas paginer côté client** — un seul fichier par export.

### CRITIQUE — BOM UTF-8 dans le CSV

`"﻿"` au début du CSV est nécessaire pour que Excel (utilisé par les comptables au Niger) reconnaisse correctement l'UTF-8. Ne pas l'omettre.

### CRITIQUE — Pas de suppression des AuditEvents côté client (auditMirror)

Le `auditMirror` Dexie (côté client) contient une copie locale des événements. Cette story ne modifie pas `auditMirror`. L'immutabilité cible uniquement la table PostgreSQL serveur (source de vérité).

### Design tokens — cohérence avec les stories précédentes

```tsx
// Section dans Paramètres
className="mt-6 rounded-2xl border border-border bg-surface p-5"

// Heading
className="text-sm font-semibold text-text-primary"

// Description
className="text-xs text-text-muted"

// Input date
className="h-9 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"

// Bouton JSON (secondaire)
className="h-9 rounded-xl border border-border px-4 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-60"

// Bouton CSV (primaire)
className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Modifier les champs de `audit_event` dans schema.ts | Uniquement ajouter un index |
| Ajouter UPDATE/DELETE sur audit_event dans l'app | Insert uniquement — le trigger bloque le reste |
| Exporter des events sans filtre companyId | Filtrer via userIds de la company |
| Bloquer login si emitAuditEvent échoue | `try/catch` best-effort — ne jamais bloquer l'auth |
| Stocker le JSON before/after en double échappement CSV | `JSON.stringify(before).replace(/"/g, '""')` |
| Omettre le BOM dans le CSV | `"﻿"` requis pour Excel |
| Oublier `Content-Disposition` sur le CSV | Nécessaire pour le download automatique |

### Héritage des stories précédentes

**Story 1.3 (local-data-layer) :** `auditMirror` Dexie déjà créé — non modifié.

**Stories 2.x (sync engine) :** `emitAuditEvent` déjà utilisé dans `push/route.ts` — ne pas dupliquer.

**Architecture §198 :** "Audit log: append-only event log table (server) + Dexie mirror; every mutation/transition/login recorded"

**PRD §998 :** "Immutable une fois écrit. Syncé serveur (source de vérité). Exportable (JSON/CSV) pour compliance."

**PRD §15.3 (rétention) :** "Logs (audit trail) : Conservés 7 ans (aligné obligation fiscale devis)"

**PRD §15.5 (RGPD) :** "Droit accès : Utilisateur peut exporter ses données (JSON/CSV)"

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Ajouter l'index dans schema.ts, puis générer la migration
pnpm db:generate
# → éditer le fichier SQL généré pour ajouter le trigger immutabilité

# 3. Appliquer
pnpm db:migrate

# 4. Vérifier que le trigger existe
# psql → \d audit_event → voir les triggers

# 5. Qualité
pnpm check

# 6. Build
pnpm build
```

---

## Références

- [NFR-O1] — Audit trail append-only immutable + exportable `[MVP-1]`
- [PRD §998] — Spécification complète audit trail (who/what/when/where/entity/before/after)
- [PRD §15.3] — Rétention 7 ans (obligation fiscale)
- [PRD §15.5] — Droit d'accès RGPD (export JSON/CSV)
- [Architecture §198] — Audit log design (server + Dexie mirror)
- [Architecture §61] — "Audit event log — every mutation/transition/login tracked; append-only"
- [src/lib/audit.ts] — Fonctions `createAuditEvent`, `emitAuditEvent` existantes
- [src/lib/schema.ts:350-368] — Table `audit_event` existante (champs complets)
- [src/app/api/v1/sync/push/route.ts:484-527] — Émission audit events existants (sync.* + conflict.*)
- [src/lib/local-db.ts:143-155] — `AuditEventLocal` + `auditMirror` Dexie
- [src/lib/auth.ts] — Configuration Better Auth (hooks pour login/logout)
- [src/app/(app)/parametres/page.tsx] — Point d'intégration UI Admin

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_À remplir par le dev agent lors de l'implémentation._

### Completion Notes List

_À remplir par le dev agent lors de l'implémentation._

### File List

- `src/lib/schema.ts` (à modifier — ajouter index audit_event.when)
- `drizzle/` (migration à générer + éditer pour trigger SQL)
- `src/app/api/v1/audit/export/route.ts` (à créer)
- `src/lib/audit.ts` (à modifier — ajouter emitLoginAudit/emitLogoutAudit)
- `src/lib/auth.ts` (à modifier — hooks login/logout)
- `src/components/settings/audit-export.tsx` (à créer)
- `src/app/(app)/parametres/page.tsx` (à modifier — section AuditExport)
- `src/messages/fr-NE.json` (à modifier)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/6-3-immutable-audit-trail-export.md` (ce fichier)

### Change Log

- Story 6-3 créée : audit trail immutable (trigger PostgreSQL) + export JSON/CSV — NFR-O1 MVP-1 (Date: 2026-06-25)
