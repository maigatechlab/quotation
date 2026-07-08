# Guide d'utilisation des skills personnalisés

> Créé le 2026-07-07. Quatre skills personnalisés complètent le cycle BMAD : deux au niveau utilisateur (valables dans **tous** les projets BMAD), deux propres au projet quotation. Ce guide explique **quand** les déclencher, **comment** les combiner avec les skills BMAD existants, et les erreurs à éviter.

---

## Vue d'ensemble

| Skill | Portée | Rôle | Fréquence recommandée |
|-------|--------|------|----------------------|
| `deferred-work-triage` | Tous projets BMAD | Assainir la dette technique accumulée par les code reviews | Fin d'epic, ou dès que `deferred-work.md` dépasse ~100 lignes |
| `story-verification` | Tous projets BMAD | Re-vérifier qu'une story ancienne tient toujours ses AC | Stories de vérification (type epic 8), avant release, après gros refactor |
| `add-synced-entity` | quotation | Câbler une nouvelle entité offline-first de bout en bout | Chaque fois qu'une story introduit une entité synchronisée |
| `owner-api-route` | quotation | Scaffolder une route API owner conforme aux patterns du repo | Chaque nouvelle route sous `/api/v1/owner` |

**Déclenchement** : dire la phrase-clé en langage naturel suffit (« triage deferred work », « verify story 8-3 », « add a synced entity », « add an owner route »). Pas besoin de syntaxe spéciale.

---

## Où les skills s'insèrent dans le cycle BMAD

```
PRD → Architecture → Epics/Stories → Sprint Planning
                                          │
              ┌───────────────────────────┤
              ▼                           ▼
        create-story                 dev-story
              │                           │
              │        ┌─ add-synced-entity ◄── si la story crée une entité synchronisée
              │        ├─ owner-api-route   ◄── si la story ajoute une route owner
              │        ▼
              │    code-review ──► alimente deferred-work.md
              │                           │
              ▼                           ▼
        retrospective ◄──── story-verification (stories epic 8 / pré-release)
              │
              ▼
        deferred-work-triage ──► nouvelles stories transversales ──► retour au cycle
```

Les deux skills projet interviennent **pendant** l'implémentation ; les deux skills utilisateur interviennent **entre** les stories, comme rituels d'hygiène.

---

## 1. `deferred-work-triage` — assainir la dette

### Quand l'utiliser

- **Fin d'epic** (moment idéal : juste avant ou après la rétrospective). L'epic vient de générer 5-10 nouvelles sections dans `deferred-work.md`.
- **Avant de planifier un sprint** : plusieurs items marqués « à traiter dans une passe transversale » peuvent devenir une story concrète du sprint.
- **Signal d'alerte** : le fichier dépasse ~100 lignes, ou une même phrase revient dans 3+ reviews (dates CSV, guards UUID, erreurs silencieuses…). C'est le signe qu'un thème mérite sa story.
- **Avant une release MVP** : distinguer ce qui est un vrai risque de ce qui est un tradeoff accepté.

### Quand ne PAS l'utiliser

- En plein milieu d'une story — le triage produit des décisions, pas des patchs. Mélanger triage et fix pollue les deux.
- Après chaque review individuelle — trop fréquent, le coût de vérification par item ne se rentabilise qu'en lot.

### Ce que ça produit

1. Un inventaire : items ouverts / déjà corrigés / obsolètes, vérifiés contre le code actuel.
2. Des clusters thématiques avec une proposition par cluster : story transversale, rattachement à une story planifiée, tradeoff accepté, ou suppression.
3. Un `deferred-work.md` réécrit, avec une section « Accepted tradeoffs » pour que les reviews suivantes arrêtent de re-signaler les mêmes points.

### Exemple concret (état actuel du projet)

Le fichier contient déjà des clusters évidents : ~6 items « erreurs Dexie absorbées silencieusement », ~4 items « guard UUID absent sur routes owner », ~3 items « dates/bornes temporelles ». Un triage aujourd'hui produirait probablement 2-3 stories transversales pour l'epic 9.

---

## 2. `story-verification` — re-vérifier l'existant

### Quand l'utiliser

- **Stories de vérification planifiées** (pattern epic 8 : 8-3 cron, 8-5 exports). Dire « verify story 8-3 » et le skill suit le protocole complet.
- **Après un refactor qui traverse un module ancien** : ex. si une passe transversale touche `expiry-job.ts`, re-vérifier la story 7-6 derrière.
- **Avant une mise en production** : re-vérifier les 2-3 stories les plus critiques (paiement, sync, auth).
- **Suspicion de régression** : « la feature X marchait, plus maintenant » → vérification formelle plutôt que debug improvisé.

### Quand ne PAS l'utiliser

- Sur une story qu'on vient d'implémenter — c'est le rôle de `bmad-code-review`, pas de la vérification. La vérification s'applique à du code qui a **vécu** (d'autres stories ont bâti dessus).
- Comme substitut aux tests E2E — le skill marque `UNVERIFIABLE` ce qui exige Docker/emails réels et dit exactement quoi lancer manuellement.

### Ce que ça produit

- Un artefact `X-Y-verification.md` : tableau AC → verdict (PASS / PASS-WITH-DRIFT / FAIL / UNVERIFIABLE) avec preuve `file:ligne`, régressions trouvées avec story d'origine suspectée, tests exécutés avec sorties verbatim.
- Sync de `sprint-status.yaml` et ajout des FAIL dans `deferred-work.md`.

### Règle importante

Le skill vérifie contre le **code actuel**, jamais contre les Dev Notes de l'époque — le code dérive, c'est précisément ce qu'on cherche à détecter. Et il ne corrige rien : vérification et réparation sont deux passes séparées (demander le fix explicitement ensuite).

---

## 3. `add-synced-entity` — nouvelle entité offline-first (quotation)

### Quand l'utiliser

- **Dès qu'une story introduit une entité qui doit fonctionner hors-ligne et se synchroniser.** Historiquement : `routeTemplate` (6-5), `quoteClause` (4-1), `quoteStatusLog` (4-5, resté local-only faute de câblage complet — exactement le genre d'oubli que ce skill prévient).
- **Au début de l'implémentation**, pas à la fin : le skill est une checklist de câblage (10+ fichiers, 2 runtimes), la suivre dans l'ordre évite les retours en arrière.
- Aussi utile en **mode review** : vérifier qu'une entité ajoutée par une story couvre bien tous les points de câblage (grep `getEntityTable` — si l'entité manque dans un seul switch, bug silencieux).

### Quand ne PAS l'utiliser

- Entité volontairement local-only (comme `quoteStatusLogs` en 4-5) — mais dans ce cas, documenter la décision dans la story, sinon la prochaine review la signalera comme oubli.
- Simple ajout de champ sur une entité existante — pas de nouveau câblage, juste vérifier `field-classification.ts` si le champ est PII/financier.

### Pièges qu'il encode (ne pas ré-apprendre à vos dépens)

Les 9 gotchas listés dans le skill sont tous des findings réels de ce repo. Les trois qui ont coûté le plus cher :
1. `where("failed").equals(0)` ne matche pas `false` en IndexedDB → `pendingCount` bloqué à 0 (story 2-2).
2. `await encrypt()` dans une transaction Dexie → abort IDB (story 6-5).
3. Le Service Worker a sa **propre** instance Dexie (`sw-db.ts`) — oublier de l'aligner casse le push en mode app fermée (stories 6-4/8-4).

---

## 4. `owner-api-route` — route API owner (quotation)

### Quand l'utiliser

- **Toute nouvelle route sous `/api/v1/owner/`** : action tenant (suspend/cancel/reactivate-style), endpoint de lecture, export.
- **Modification substantielle d'une route existante** : le skill sert alors de checklist de conformité (guard UUID présent ? union d'erreurs exhaustive ? eventType précis ?).

### Les 4 findings récurrents qu'il élimine

Chacun est apparu dans 2+ reviews :
1. **Guard UUID absent sur `[id]`** → id non-UUID atteint Postgres → 500 opaque au lieu de 400. Le skill impose la validation avant toute requête DB.
2. **Union d'erreurs sans garde d'exhaustivité** → un futur code d'erreur dégrade silencieusement en 500 générique.
3. **Réutilisation d'un `eventType` pour un événement différent** (le cas `reminder_sent` pour « payment covers period » pollue le reporting) → choisir un eventType précis, toujours.
4. **Enum affiché en UI = 4 fichiers à synchroniser** (Zod, table owner, template email, fr-NE.json) → le skill rappelle le grep.

---

## Rituels recommandés par phase de projet

### Pendant un sprint
- Story avec entité synchronisée → **add-synced-entity** au démarrage.
- Story avec route owner → **owner-api-route** au démarrage.
- Après chaque story : `bmad-code-review` (existant) alimente `deferred-work.md` — ne pas trier au fil de l'eau.

### Fin d'epic
1. `bmad-retrospective` (existant).
2. **deferred-work-triage** → stories transversales pour l'epic suivant.
3. Si l'epic a modifié des modules anciens : **story-verification** sur les 1-2 stories les plus exposées.

### Avant release
1. **story-verification** sur les stories critiques (paiement, sync, auth, cron).
2. **deferred-work-triage** en mode « risque » : chaque item ouvert est-il acceptable en prod ?
3. Exécuter manuellement les items `UNVERIFIABLE` (E2E Docker, emails réels).

### Nouveau projet BMAD
- `deferred-work-triage` et `story-verification` fonctionnent immédiatement (ils lisent la structure standard `_bmad-output/`).
- Les équivalents de `add-synced-entity` / `owner-api-route` sont à recréer par projet dès qu'un pattern multi-fichiers se répète 2-3 fois dans les reviews — c'est le signal qu'un skill projet rentabilise son écriture.

---

## Maintenance des skills

- **Un skill est vivant** : quand une review révèle un nouveau gotcha sur le sync ou les routes owner, l'ajouter au skill correspondant (fichiers dans `.claude/skills/<nom>/SKILL.md` ; skills utilisateur dans `~/.claude/skills/`).
- **Signal de création d'un nouveau skill** : même finding dans 3+ reviews, ou même ritual multi-fichiers répété à chaque story d'un type donné.
- Les skills projet sont versionnés avec le repo (`.claude/skills/`) — ils profitent à tout contributeur et à toute session Claude Code future.
