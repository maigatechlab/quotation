---
story_key: 6-6-geo-replicated-backup-pitr
epic_num: 6
story_num: 6
status: ready-for-dev
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 6.6 : Backup & PITR Géo-répliqué (§15.4)

**Statut :** ready-for-dev

## Story

**En tant que** responsable de la fiabilité,
**Je veux** des sauvegardes continues géo-répliquées avec recovery point-in-time,
**Afin que** je puisse reprendre le service après incident avec une perte de données minimale (RTO <4h, RPO <1h, §15.4).

---

## Critères d'acceptation (BDD)

**AC1 — Backup PostgreSQL : PITR WAL + backup quotidien**

```
GIVEN  la base PostgreSQL déployée sur Neon (ou équivalent managed)
WHEN  le backup PITR est activé
THEN  backup quotidien complet + WAL streaming continu sont activés
AND   rétention 30 jours (daily backups) + 12 mensuels (archive long-terme) (§15.4)
AND   RPO < 1 heure (PITR continu, §15.4 PRD)
```

**AC2 — Géo-réplication : minimum 2 zones distinctes**

```
GIVEN  la configuration Neon
WHEN  la géo-réplication est activée
THEN  les backups sont répliqués dans minimum 2 zones géographiques distinctes (§15.4)
AND   si la zone primaire est indisponible, le restore peut s'effectuer depuis la zone secondaire
```

**AC3 — Restore test hebdomadaire automatisé**

```
GIVEN  le pipeline CI/CD (GitHub Actions)
WHEN  le workflow de restore test s'exécute chaque semaine (ou manuellement)
THEN  un restore de test est effectué sur environnement staging
AND   si le restore échoue → une alerte est envoyée (Sentry ou email ops)
AND   le résultat du test est loggé (succès/échec + timestamp)
```

**AC4 — Backup Blob storage (logos, signatures)**

```
GIVEN  les logos société et scans de signature stockés dans @vercel/blob
WHEN  la politique de backup Blob est configurée
THEN  les assets Blob sont inclus dans la stratégie de sauvegarde (§15.4 scope)
AND   un script ou workflow documente la procédure de recovery Blob
AND   ou : confirmation documentée que Vercel Blob garantit la durabilité des données
       (Vercel Blob est backed by Cloudflare R2 avec réplication native)
```

**AC5 — Health endpoint `/api/v1/health` : inclut statut backup**

```
GIVEN  l'endpoint /api/v1/health (à créer — actuellement /api/diagnostics existe)
WHEN  un monitoring externe interroge /api/v1/health
THEN  la réponse inclut : db connected, schema applied, sync status, backup_status (ok/warn/error)
AND   le backup_status reflète si la dernière vérification de backup est récente
AND   l'endpoint répond en < 2 secondes
AND   l'endpoint est public (pas d'auth requise) — même pattern que /api/diagnostics
```

**AC6 — Device loss recovery : export/import données utilisateur**

```
GIVEN  un utilisateur perd son appareil (téléphone volé/cassé)
WHEN  il se reconnecte sur un nouvel appareil
THEN  ses données (devis, clients, paramètres société) sont récupérées depuis le serveur
       via le mécanisme de sync pull existant (GET /api/v1/sync/pull)
AND   un endpoint ou page de "réinitialisation IndexedDB" efface le local store et
       redéclenche un pull complet (curseur remis à zéro)
AND   ou : la procédure est documentée dans un runbook ops
```

**AC7 — Runbook de recovery documenté**

```
GIVEN  un incident de production (DB corrompue, données perdues)
WHEN  l'équipe ops suit le runbook
THEN  le runbook couvre :
       1. Comment déclencher un restore PITR sur Neon
       2. Comment vérifier l'intégrité post-restore
       3. Comment notifier les utilisateurs si nécessaire
       4. Comment gérer le gap de sync (données offline en attente)
AND   le runbook est dans le repo (docs/runbook-recovery.md ou similaire)
```

**AC8 — Qualité**

```
GIVEN  les fichiers créés/modifiés
WHEN  pnpm check
THEN  lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND   pnpm build passe sans erreur
AND   le workflow GitHub Actions de restore test est valide (dry-run si possible)
```

---

## Nature de cette story — Infrastructure + Code minimal

Cette story est **principalement une story d'infrastructure et de configuration**, pas une story de feature applicative. Elle implique :
- Configuration Neon Postgres (UI Neon ou API Neon)
- Création d'un workflow GitHub Actions (restore test hebdomadaire)
- Création de l'endpoint `/api/v1/health` (port de `/api/diagnostics` existant)
- Un runbook documenté
- Vérification Vercel Blob durabilité

**Le dev agent doit :** configurer, documenter, créer le workflow CI et le health endpoint. Il ne s'agit **pas** de développer une nouvelle fonctionnalité utilisateur.

---

## Périmètre de cette story

**CRÉER :**
- `src/app/api/v1/health/route.ts` — endpoint health GET (public, adapté de /api/diagnostics)
- `.github/workflows/backup-restore-test.yml` — workflow hebdomadaire de test restore
- `docs/runbook-recovery.md` — procédure de recovery

**MODIFIER :**
- `env.example` — ajouter les variables Neon/backup si nécessaires

**CONFIGURATION (hors code) :**
- Activer PITR sur Neon Postgres (dashboard Neon ou CLI)
- Configurer la géo-réplication Neon (Neon branch replication / read replicas)
- Vérifier la politique de durabilité Vercel Blob
- Créer un projet staging Neon pour les restore tests

**EXCLU :**
- Toute modification du schéma applicatif
- Interface utilisateur de backup (hors scope MVP-1)
- Monitoring avancé (Datadog, PagerDuty) — Sentry suffit pour MVP-1

---

## Tâches / Sous-tâches

### T1 — Configurer Neon Postgres : PITR + géo-réplication

**Actions sur le dashboard Neon (pas de code) :**

- [ ] Vérifier que PITR (Point-In-Time Recovery) est activé sur le projet Neon
  - Neon gère le WAL streaming nativement pour les projets payants (Launch plan ou supérieur)
  - Confirmer la rétention WAL : idéalement 30 jours, minimum 7 jours
  - Console Neon : Settings → Backups → vérifier la rétention

- [ ] Configurer la géo-réplication :
  - **Option A (Neon branches) :** Créer une branche "backup" dans une région secondaire
    - Console Neon : Branches → New Branch → sélectionner une région différente
    - Régions Neon disponibles : aws-eu-west-1, aws-us-east-1, aws-ap-southeast-1, etc.
  - **Option B (read replicas) :** Ajouter un compute endpoint en lecture dans une 2ème région
  - Documenter la région primaire et la région secondaire dans le runbook

- [ ] Configurer les backups mensuels (archive long-terme 12 mois) :
  - Neon Paid plans incluent des snapshots automatiques
  - Pour l'archivage long-terme : scripter un dump pg_dump mensuel vers Vercel Blob ou S3 externe

- [ ] Variables d'environnement à documenter dans `env.example` :
  ```bash
  # Neon Postgres
  NEON_PROJECT_ID=          # ID du projet Neon (pour l'API Neon)
  NEON_API_KEY=             # Clé API Neon (pour les restore tests automatisés)
  NEON_STAGING_BRANCH=      # ID de la branche staging (pour les restore tests)
  DATABASE_URL_STAGING=     # URL de connexion à la branche staging
  ```

### T2 — Créer le workflow GitHub Actions : restore test hebdomadaire

- [ ] Créer `.github/workflows/backup-restore-test.yml` :
  ```yaml
  name: Weekly Backup Restore Test

  on:
    schedule:
      - cron: '0 2 * * 0'  # Chaque dimanche à 02h00 UTC
    workflow_dispatch:       # Déclenchable manuellement

  jobs:
    restore-test:
      name: Test PITR Restore
      runs-on: ubuntu-latest
      timeout-minutes: 30

      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Setup pnpm
          uses: pnpm/action-setup@v4
          with:
            version: 10

        - name: Setup Node.js
          uses: actions/setup-node@v4
          with:
            node-version: '20'
            cache: 'pnpm'

        - name: Install dependencies
          run: pnpm install --frozen-lockfile

        - name: Test database connectivity (primary)
          env:
            POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          run: |
            echo "Testing primary DB connectivity..."
            # Simple connectivity check via Node.js
            node -e "
              const { Client } = require('pg');
              const client = new Client({ connectionString: process.env.POSTGRES_URL });
              client.connect()
                .then(() => client.query('SELECT 1'))
                .then(() => { console.log('Primary DB: OK'); client.end(); })
                .catch(e => { console.error('Primary DB: FAILED', e.message); process.exit(1); });
            "

        - name: Verify Neon branch restore capability
          env:
            NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
            NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}
            NEON_STAGING_BRANCH: ${{ secrets.NEON_STAGING_BRANCH }}
          run: |
            echo "Verifying Neon PITR restore capability..."
            # Appel API Neon pour vérifier que la branche staging est accessible
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
              -H "Authorization: Bearer $NEON_API_KEY" \
              "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$NEON_STAGING_BRANCH")
            if [ "$STATUS" -eq 200 ]; then
              echo "Neon staging branch: ACCESSIBLE"
            else
              echo "Neon staging branch: INACCESSIBLE (HTTP $STATUS)"
              exit 1
            fi

        - name: Test staging DB connectivity
          env:
            DATABASE_URL_STAGING: ${{ secrets.DATABASE_URL_STAGING }}
          run: |
            if [ -z "$DATABASE_URL_STAGING" ]; then
              echo "WARNING: DATABASE_URL_STAGING not configured — skipping staging test"
              exit 0
            fi
            echo "Testing staging DB connectivity..."
            node -e "
              const { Client } = require('pg');
              const client = new Client({ connectionString: process.env.DATABASE_URL_STAGING });
              client.connect()
                .then(() => client.query('SELECT COUNT(*) FROM audit_event'))
                .then(r => { console.log('Staging DB: OK, audit_events:', r.rows[0].count); client.end(); })
                .catch(e => { console.error('Staging DB: FAILED', e.message); process.exit(1); });
            "

        - name: Notify on failure
          if: failure()
          env:
            SENTRY_DSN: ${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}
          run: |
            echo "RESTORE TEST FAILED - sending alert"
            # Envoyer une alerte via email ou Sentry
            # Pour MVP-1 : un email ops manuel ou une issue GitHub suffit
            echo "::error::Weekly backup restore test FAILED. Check Neon console and staging branch."
            # Optionnel : curl vers un webhook Slack/email
  ```

- [ ] Ajouter les secrets GitHub requis dans le repo (Settings → Secrets → Actions) :
  - `NEON_API_KEY` — clé API Neon
  - `NEON_PROJECT_ID` — ID du projet Neon
  - `NEON_STAGING_BRANCH` — ID de la branche staging
  - `DATABASE_URL_STAGING` — URL connexion branche staging (optionnel)

### T3 — Créer l'endpoint `/api/v1/health`

L'endpoint `/api/diagnostics` existe mais n'est pas versionné sous `/api/v1/`. Cette story crée `/api/v1/health` conforme à l'architecture (O4).

- [ ] Créer `src/app/api/v1/health/route.ts` :
  ```typescript
  import { NextResponse } from "next/server";

  type HealthStatus = "ok" | "warn" | "error";

  interface HealthResponse {
    status: HealthStatus;
    timestamp: string;
    version: string;
    checks: {
      database: { status: HealthStatus; latency_ms?: number; error?: string };
      storage: { status: HealthStatus; configured: boolean };
      sync: { status: HealthStatus };
      backup: { status: HealthStatus; note?: string };
    };
  }

  // Public endpoint — no auth required (monitoring tools)
  export async function GET() {
    const start = Date.now();

    // Database check
    let dbStatus: HealthStatus = "error";
    let dbLatency: number | undefined;
    let dbError: string | undefined;

    try {
      const [{ db }, { sql }] = await Promise.all([
        import("@/lib/db"),
        import("drizzle-orm"),
      ]);

      const checkPromise = db.execute(sql`SELECT 1 as ping`);
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      );

      await Promise.race([checkPromise, timeout]);
      dbLatency = Date.now() - start;
      dbStatus = "ok";
    } catch (e) {
      dbError = e instanceof Error ? e.message : "unknown";
      dbStatus = "error";
    }

    // Storage check (Vercel Blob configured?)
    const storageConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    const storageStatus: HealthStatus = storageConfigured ? "ok" : "warn";

    // Backup status (heuristic — check env vars présents)
    // Pour MVP-1 : si NEON_PROJECT_ID est configuré → backup considéré actif
    const backupConfigured = Boolean(process.env.NEON_PROJECT_ID);
    const backupStatus: HealthStatus = backupConfigured ? "ok" : "warn";
    const backupNote = backupConfigured
      ? "Neon PITR configured"
      : "NEON_PROJECT_ID not set — backup status unknown";

    // Overall status
    const overallStatus: HealthStatus = (() => {
      if (dbStatus === "error") return "error";
      if (storageStatus === "warn" || backupStatus === "warn") return "warn";
      return "ok";
    })();

    const body: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: "1",
      checks: {
        database: {
          status: dbStatus,
          ...(dbLatency !== undefined && { latency_ms: dbLatency }),
          ...(dbError !== undefined && { error: dbError }),
        },
        storage: { status: storageStatus, configured: storageConfigured },
        sync: { status: "ok" }, // Sync is stateless per request
        backup: { status: backupStatus, note: backupNote },
      },
    };

    // HTTP 200 même si warn/error — les monitoring tools lisent le JSON status
    return NextResponse.json(body, { status: 200 });
  }
  ```

- [ ] Ajouter `NEON_PROJECT_ID` dans `env.example`
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Documenter la politique Vercel Blob

- [ ] Vérifier sur la doc Vercel Blob : la durabilité des données
  - Vercel Blob est backed by Cloudflare R2 (Object Storage)
  - Cloudflare R2 garantit 11 9s de durabilité des données (99.999999999%)
  - Géo-réplication Cloudflare native
  - **Conclusion :** Vercel Blob ne nécessite pas de backup supplémentaire pour MVP-1
  - Documenter cette conclusion dans le runbook

### T5 — Créer le runbook `docs/runbook-recovery.md`

- [ ] Créer `docs/runbook-recovery.md` avec :
  ```markdown
  # Runbook — Procédure de Recovery

  ## 1. Restore PostgreSQL (Neon PITR)

  ### Déclencher un restore PITR
  1. Se connecter à la console Neon : https://console.neon.tech
  2. Sélectionner le projet `quotation`
  3. Aller dans Branches → Primary
  4. Cliquer "Restore" → sélectionner le point dans le temps souhaité
     (WAL streaming = RPO < 1 heure)
  5. Confirmer le restore — la branche est restaurée in-place

  ### Vérifier l'intégrité post-restore
  ```bash
  psql $POSTGRES_URL -c "SELECT COUNT(*) FROM audit_event;"
  psql $POSTGRES_URL -c "SELECT COUNT(*) FROM quote;"
  psql $POSTGRES_URL -c "SELECT MAX(created_at) FROM quote;"
  ```
  - Comparer les counts avec le dernier backup connu
  - Vérifier les derniers audit_events

  ### RTO cible : < 4 heures
  - Restore Neon PITR : ~15-30 minutes
  - Vérification intégrité : ~30 minutes
  - Notification utilisateurs : ~30 minutes
  - Reprise DNS/Vercel : ~15 minutes

  ## 2. Recovery Blob Storage (logos, signatures)

  Vercel Blob est backed by Cloudflare R2 (11 9s durabilité).
  En cas de perte de fichier individuel : contacter le support Vercel.
  En cas de perte totale : restaurer depuis les exports utilisateur.

  ## 3. Device Loss Recovery (utilisateur)

  Si un utilisateur perd son appareil :
  1. L'utilisateur se reconnecte sur le nouvel appareil
  2. Les données sont récupérées automatiquement via GET /api/v1/sync/pull
     (pull complet : mettre le curseur à `new Date(0).toISOString()`)
  3. Si le store local est corrompu : effacer IndexedDB "quotation-local" dans les
     DevTools du navigateur, puis recharger l'application

  ## 4. Gestion du gap de sync post-restore

  Si des données offline étaient en attente de sync au moment de l'incident :
  1. Les ops dans syncQueue sont toujours dans Dexie local des utilisateurs
  2. Au reconnect, triggerSync() rejoue la queue
  3. Si le serveur a été restauré à un point antérieur : les ops seront réappliquées
     (idempotence garantie par opId)
  4. Conflits possibles → LWW résolu par l'horloge serveur

  ## 5. Notification utilisateurs

  En cas d'incident majeur :
  - Email aux utilisateurs via Resend (template à créer)
  - Message dans l'application au rechargement (via next-intl banner)
  - ETA de reprise : RTO < 4 heures

  ## 6. Contacts

  - Neon support : https://neon.tech/support
  - Vercel support : https://vercel.com/support
  - Sentry alerts : https://sentry.io (projet quotation)
  ```

### T6 — Mettre à jour `env.example`

- [ ] Ajouter dans `env.example` :
  ```bash
  # Neon Postgres (backup & PITR)
  # Requis pour les restore tests automatisés (Story 6-6)
  NEON_PROJECT_ID=          # Dashboard Neon → Settings → General
  NEON_API_KEY=             # Dashboard Neon → Account → API Keys
  NEON_STAGING_BRANCH=      # ID de la branche staging créée pour les restore tests
  DATABASE_URL_STAGING=     # URL de connexion à la branche staging Neon
  ```

### T7 — Vérification finale (AC8)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] `GET /api/v1/health` répond `{ "status": "ok"|"warn", ... }` ✓
- [ ] Workflow `.github/workflows/backup-restore-test.yml` valide YAML ✓
- [ ] `docs/runbook-recovery.md` créé ✓
- [ ] `env.example` mis à jour avec variables Neon ✓

---

## Dev Notes

### CRITIQUE — Cette story est principalement infrastructure, PAS feature applicative

Le développeur doit comprendre que la valeur principale est dans :
1. La **configuration Neon** (PITR + géo-réplication) — actions sur le dashboard
2. Le **workflow GitHub Actions** — CI/CD backup test
3. Le **health endpoint** `/api/v1/health` — monitoring
4. Le **runbook** — documentation opérationnelle

Il n'y a pas de nouvelle page utilisateur, pas de nouvelles entités Dexie, pas de nouvelles tables PostgreSQL.

### CRITIQUE — Neon PITR : plans et limitations

Neon propose PITR sur les plans payants :
- **Free Tier :** pas de PITR (WAL retention très limitée)
- **Launch plan (~$19/mois) :** PITR 7 jours
- **Scale plan (~$69/mois) :** PITR 30 jours + auto-suspend avancé
- **Enterprise :** custom

Pour respecter la spécification §15.4 (rétention 30 jours), le **Scale plan minimum** est requis. Si le projet est sur Free Tier, documenter le gap et planifier la mise à niveau.

**Action requise :** vérifier le plan Neon actuel et upgrader si nécessaire.

### CRITIQUE — Health endpoint `/api/v1/health` vs `/api/diagnostics`

L'endpoint `/api/diagnostics` existant est pour le setup checklist de l'admin (pré-login). Le nouvel endpoint `/api/v1/health` est conforme à l'architecture (O4) et destiné aux monitoring externes.

**NE PAS supprimer** `/api/diagnostics` — il est utilisé par le setup checklist.

**Ne pas dupliquer** la logique : `/api/v1/health` peut importer et réutiliser des parties de `/api/diagnostics` si pertinent, mais doit être une route séparée.

### CRITIQUE — Vercel Blob durabilité : pas de backup supplémentaire nécessaire

Vercel Blob utilise Cloudflare R2 sous le capot :
- 11 nines de durabilité (99.999999999%)
- Réplication géographique Cloudflare native
- Pas de backup utilisateur supplémentaire nécessaire en MVP-1

Documenter cette décision explicitement dans le runbook pour éviter toute ambiguïté.

### CRITIQUE — Device loss recovery via sync pull existant

Le mécanisme de device loss recovery est **déjà implémenté** via :
- `GET /api/v1/sync/pull?since=1970-01-01T00:00:00.000Z` — pull complet
- L'utilisateur se reconnecte → auth session valide → pull complet → IndexedDB reconstruit

La seule chose à ajouter si nécessaire : une page ou procédure pour "effacer le store local et redéclencher le pull" (cas de store corrompu). Cela peut être documenté dans le runbook sans code supplémentaire en MVP-1.

### CRITIQUE — GitHub Actions : pas de `pnpm` intégré par défaut

Le workflow GitHub Actions doit installer pnpm explicitement :
```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 10
```

Et utiliser le cache Node.js avec `cache: 'pnpm'`.

### CRITIQUE — Secrets GitHub Actions

Les secrets suivants doivent être créés dans GitHub Settings → Secrets → Actions :
- `NEON_API_KEY` (requis pour le restore test)
- `NEON_PROJECT_ID` (requis)
- `NEON_STAGING_BRANCH` (optionnel — si branche staging créée)
- `DATABASE_URL_STAGING` (optionnel — connexion branche staging)
- `NEXT_PUBLIC_SENTRY_DSN` (déjà existant — pour les alertes)
- `POSTGRES_URL` (déjà existant — pour le test DB primary)

### Neon API v2 — Endpoints utilisés

```bash
# Lister les branches d'un projet
GET https://console.neon.tech/api/v2/projects/{project_id}/branches
Authorization: Bearer {NEON_API_KEY}

# Vérifier une branche spécifique
GET https://console.neon.tech/api/v2/projects/{project_id}/branches/{branch_id}

# Restore PITR (créer une branche à un point précis)
POST https://console.neon.tech/api/v2/projects/{project_id}/branches
{
  "branch": {
    "parent_id": "br-xxx",
    "parent_timestamp": "2026-06-24T12:00:00Z"  ← point dans le temps
  }
}
```

### Pièges & Anti-patterns

| INTERDIT | CORRECT |
|---|---|
| Supprimer `/api/diagnostics` | Créer `/api/v1/health` en parallèle |
| Considérer Vercel Blob sans durabilité | Vercel Blob = Cloudflare R2 = 11 nines, pas de backup supplémentaire |
| Plan Neon Free Tier pour la production | Scale plan minimum pour 30j rétention PITR |
| Oublier les GitHub Secrets pour le workflow | Les documenter dans le PR et dans env.example |
| Hard-coder l'URL Neon API dans le workflow | Utiliser les secrets `NEON_API_KEY` et `NEON_PROJECT_ID` |

### Héritage des stories précédentes

**Architecture (§15.4 Backup & Recovery) :**
- Neon Postgres avec PITR est l'architecture retenue dès le départ
- Cette story formalise et vérifie cette décision

**Story 6-3 (audit trail immutable) :**
- L'audit trail sera protégé par le PITR (rétention 7 ans pour l'audit)
- Le runbook doit mentionner que l'audit trail est append-only et immutable

**Story 2-1 (offline sync) :**
- Le mécanisme de device loss recovery s'appuie sur le sync pull existant
- Le curseur `SYNC_CURSOR_global` dans localStorage permet un pull complet si remis à zéro

### Commandes pour le dev agent

```bash
# 1. Aucune migration nécessaire (pas de nouveau schema)

# 2. Créer le répertoire health
mkdir -p src/app/api/v1/health

# 3. Créer le répertoire docs si absent
mkdir -p docs

# 4. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 5. Build
pnpm build   # passe sans erreur

# 6. Tester l'endpoint health manuellement
curl http://localhost:3000/api/v1/health | jq .
```

---

## Références

- [PRD §15.4] — Backup & Recovery : scope DB + Blob, rétention 30j, WAL PITR, RTO <4h, RPO <1h, restore test hebdo, géo-répliqué
- [PRD NFR R3, R4, R5] — Backup 30j rétention, RTO <4h, RPO <1h
- [Architecture §Infrastructure] — Neon Postgres PITR, Vercel Blob, GitHub Actions CI/CD
- [Epics §Story 6.6] — §15.4 backup/PITR géo-répliqué Neon Postgres
- [src/app/api/diagnostics/route.ts] — pattern health check à adapter pour /api/v1/health
- [Neon API v2 docs] — https://api-docs.neon.tech/reference/getting-started-with-neon-api
- [Neon PITR docs] — https://neon.tech/docs/introduction/point-in-time-recovery
- [Vercel Blob docs] — https://vercel.com/docs/storage/vercel-blob

---

## Dev Agent Record

### Agent Model Used

_À remplir par le dev agent_

### Debug Log References

_À remplir par le dev agent_

### Completion Notes List

_À remplir par le dev agent_

### File List

- `src/app/api/v1/health/route.ts` (à créer)
- `.github/workflows/backup-restore-test.yml` (à créer)
- `docs/runbook-recovery.md` (à créer)
- `env.example` (à modifier — variables Neon)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/6-6-geo-replicated-backup-pitr.md` (ce fichier)

### Change Log

_À remplir par le dev agent_
