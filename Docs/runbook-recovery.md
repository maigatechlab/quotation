# Runbook — Procédure de Recovery

**Projet :** Quotation Logistique  
**RTO cible :** < 4 heures  
**RPO cible :** < 1 heure (WAL PITR continu)  
**Maintenu par :** Équipe Maiga Tech Lab

---

## 1. Restore PostgreSQL (Neon PITR)

### Prérequis

- Accès à la console Neon : https://console.neon.tech
- Accès au projet `quotation` (Scale plan minimum pour rétention 30 jours)
- Variable `POSTGRES_URL` disponible pour vérification post-restore

### Déclencher un restore PITR

1. Se connecter à la console Neon : https://console.neon.tech
2. Sélectionner le projet `quotation`
3. Aller dans **Branches → Primary**
4. Cliquer **Restore** → sélectionner le point dans le temps souhaité
   - WAL streaming = RPO < 1 heure garantie sur Scale plan
   - Sélectionner un timestamp avant l'incident
5. Confirmer le restore — la branche est restaurée in-place
6. Attendre la completion (~15-30 minutes selon la taille)

### Vérifier l'intégrité post-restore

```bash
psql $POSTGRES_URL -c "SELECT COUNT(*) FROM audit_event;"
psql $POSTGRES_URL -c "SELECT COUNT(*) FROM quote;"
psql $POSTGRES_URL -c "SELECT MAX(created_at) FROM quote;"
psql $POSTGRES_URL -c "SELECT MAX(created_at) FROM client;"
```

- Comparer les counts avec le dernier backup connu
- Vérifier les derniers `audit_event` pour confirmer la cohérence

### Vérifier le health endpoint

```bash
curl https://votre-domaine.com/api/v1/health | jq .
# Attendre: { "status": "ok", "checks": { "database": { "status": "ok" } } }
```

### Chronologie RTO

| Étape | Durée estimée |
|-------|--------------|
| Restore Neon PITR | ~15-30 min |
| Vérification intégrité | ~30 min |
| Notification utilisateurs | ~30 min |
| Reprise DNS/Vercel | ~15 min |
| **Total RTO** | **< 2 heures** (cible 4h) |

---

## 2. Géo-réplication Neon

### Configuration requise

- **Région primaire :** (documenter ici après configuration initiale)
- **Région secondaire :** (documenter ici après configuration initiale)

Les backups Neon sont répliqués entre régions AWS. En cas d'indisponibilité de la région primaire :

1. Accéder à la console Neon — les branches restent accessibles via l'API même si une région est down
2. Utiliser le endpoint de lecture de la région secondaire (si configuré)
3. Contacter le support Neon si la région primaire est inaccessible : https://neon.tech/support

### API Neon pour vérification

```bash
# Lister les branches du projet
curl -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches"

# Vérifier une branche spécifique
curl -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$NEON_STAGING_BRANCH"
```

---

## 3. Recovery Blob Storage (logos, signatures)

### Politique de durabilité Vercel Blob

**Vercel Blob est backed by Cloudflare R2 (Object Storage) :**
- Durabilité : 11 nines (99.999999999%)
- Réplication géographique Cloudflare native
- **Aucun backup supplémentaire requis en MVP-1**

En cas de perte d'un fichier individuel :
1. Contacter le support Vercel : https://vercel.com/support
2. Fournir le `blob.url` du fichier perdu (disponible dans les logs ou en BDD)

En cas de perte totale (cas extrêmement improbable avec 11 9s de durabilité) :
1. Les logos et signatures peuvent être re-uploadés par les utilisateurs
2. Les données structurelles (devis, clients) sont dans PostgreSQL (récupérables via PITR)

---

## 4. Device Loss Recovery (utilisateur — perte d'appareil)

Si un utilisateur perd son appareil (vol, casse) :

1. L'utilisateur se reconnecte sur le **nouvel appareil**
2. Les données sont récupérées automatiquement via le mécanisme de sync pull :
   ```
   GET /api/v1/sync/pull?since=1970-01-01T00:00:00.000Z
   ```
   (pull complet = curseur remis à zéro)
3. Attendre la fin du pull complet (~quelques secondes selon volume de données)

### Si le store local est corrompu (cas exceptionnel)

1. Ouvrir les DevTools du navigateur (F12)
2. Aller dans **Application → Storage → IndexedDB**
3. Supprimer la base `quotation-local`
4. Recharger l'application — le pull complet se déclenche automatiquement

Alternative via console JS :
```javascript
indexedDB.deleteDatabase('quotation-local');
location.reload();
```

---

## 5. Gestion du gap de sync post-restore

Si des données offline étaient en attente de sync au moment de l'incident :

1. Les opérations dans `syncQueue` sont stockées dans Dexie local des utilisateurs
2. Au reconnect, `triggerSync()` rejoue automatiquement la queue
3. Si le serveur a été restauré à un point antérieur aux ops locales :
   - Les ops seront réappliquées (idempotence garantie par `opId`)
   - Conflits possibles → résolu par LWW (Last Write Wins) sur l'horloge serveur
4. Vérifier les `audit_event` post-restore pour confirmer la cohérence des rejouées

---

## 6. Notification utilisateurs

En cas d'incident majeur (> 30 min d'interruption) :

1. **Email** aux utilisateurs via Resend (template à créer dans Story 3-x)
2. **Message in-app** au rechargement : banner via `next-intl` (à implémenter)
3. **ETA de reprise :** communiquer RTO < 4 heures

Template de communication minimum :
```
Objet: [Quotation Logistique] Maintenance d'urgence - reprise estimée à HH:MM UTC

Nous avons rencontré un incident technique. Notre équipe travaille activement
à la résolution. Vos données sont sécurisées.
Reprise de service estimée : [DATE/HEURE].
Nous vous tiendrons informés de l'avancement.
```

---

## 7. Archive long-terme (12 mois)

Pour les backups mensuels long-terme (au-delà de la rétention Neon) :

```bash
# Script de dump mensuel vers stockage externe
# À exécuter manuellement ou via cron GitHub Actions
pg_dump $POSTGRES_URL \
  --format=custom \
  --no-acl \
  --no-owner \
  -f "backup-$(date +%Y-%m).dump"

# Uploader vers Vercel Blob ou S3 externe
# (script à compléter selon la solution de stockage choisie)
```

---

## 8. Contacts et ressources

| Service | Lien |
|---------|------|
| Neon Console | https://console.neon.tech |
| Neon Support | https://neon.tech/support |
| Neon API Docs | https://api-docs.neon.tech |
| Neon PITR Docs | https://neon.tech/docs/introduction/point-in-time-recovery |
| Vercel Dashboard | https://vercel.com/dashboard |
| Vercel Support | https://vercel.com/support |
| Sentry (monitoring) | https://sentry.io (projet quotation) |
| Health Endpoint | `/api/v1/health` |

---

*Runbook créé le 2026-06-27 — Story 6.6 (§15.4 PRD)*
