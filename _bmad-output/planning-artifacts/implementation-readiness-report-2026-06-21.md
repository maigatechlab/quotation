---
stepsCompleted: [1, 2, 3, 4, 5, 6]
documentsIncluded:
  - prds/prd-quotation-2026-06-21/prd.md
  - architecture.md
  - epics.md
  - ux-designs/ux-quotation-2026-06-21/DESIGN.md
  - ux-designs/ux-quotation-2026-06-21/EXPERIENCE.md
project_name: quotation
date: 2026-06-21
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-21
**Project:** quotation
**Assessor:** PM (requirements traceability & planning-gap specialist)

## Document Discovery

### PRD (sharded)
- Folder: `prds/prd-quotation-2026-06-21/`
  - `prd.md` (54 KB, rév. 3, 2026-06-21) — **version retenue**
  - `.decision-log.md` (6 KB)
  - `review-prd-adversarial.md` (5 KB) — review, non retenu comme source primaire

### Architecture (whole)
- `architecture.md` (40 KB, status complete, 2026-06-21) — **version retenue**

### Epics & Stories (whole)
- `epics.md` (59 KB, stepsCompleted [1,2,3,4], 2026-06-21) — **version retenue** (6 epics, 42 stories)

### UX Design (sharded)
- Folder: `ux-designs/ux-quotation-2026-06-21/`
  - `DESIGN.md` (12 KB, status final) — **version retenue**
  - `EXPERIENCE.md` (12 KB, status final) — **version retenue**
  - `.decision-log.md`, `reconcile-design-handoff.md`, `review-accessibility.md`, `review-rubric-walker.md`, `mockups/`, `imports/` — supporting, non primaires

### Critical Issues
- **Duplicates:** Aucun. Chaque type de document existe soit en version entière, soit en version shardée — jamais les deux. ✅
- **Missing:** Aucun document requis manquant. ✅

### Resolution
Aucune action requise. Sélection confirmée :
- PRD = `prd.md` (rév. 3)
- Architecture = `architecture.md`
- Epics = `epics.md`
- UX = `DESIGN.md` + `EXPERIENCE.md`

## PRD Analysis

_Source : `prds/prd-quotation-2026-06-21/prd.md` rév. 3 (lue intégralement)._

### Functional Requirements (43)

**Module 1 — Authentification (FR-1→4)**
- FR-1: Connexion email/mot de passe, session offline ≤7j, check révocation reconnect, re-auth obligatoire J+7 `[MVP-0]`
- FR-2: Rôles Admin/Commercial/Opérateur `[MVP-0]`
- FR-3: Matrice permissions RBAC (HTTP 403, ownership-based, masquage UI) `[MVP-0]`
- FR-4: Réinitialisation mot de passe (email, token 24h, usage unique) `[MVP-0]`

**Module 2 — Paramètres société (FR-5→7)**
- FR-5: Infos société (raison sociale, RCCM, NIF obligatoires, coordonnées, historique) `[MVP-0]`
- FR-6: Upload logo (PNG/JPG ≤2MB, ≤300px, Blob) `[MVP-0]`
- FR-7: Signataire par défaut (nom, fonction, pré-rempli, modifiable) `[MVP-0]`

**Module 3 — Clients (FR-8→11)**
- FR-8: Création fiche client (nom société + téléphone obligatoires, email validé) `[MVP-0]`
- FR-9: Recherche (FlexSearch, fuzzy, accents normalisés, offline) `[MVP-0]`
- FR-10: Modification (snapshot figé au devis, event log) `[MVP-0]`
- FR-11: Suppression (soft delete, impossible si devis associés) `[MVP-0]`

**Module 4 — Devis (FR-12→16)**
- FR-12: Création (numéro auto, date jour, validité +30j, statut Brouillon) `[MVP-0]`
- FR-13: Numérotation TEMP→DEV (unicité, séquence annuelle) `[MVP-0]`
- FR-14: Duplication (nouveau numéro, dates MAJ, copie, recalcul) `[MVP-0]`
- FR-15: Machine à états Brouillon→Validé→Envoyé→Accepté/Expiré/Annulé, status logs `[MVP-0]`
- FR-16: Recherche/filtrage (client/date/statut/référence, combinables, pagination 25) `[MVP-0]`

**Module 5 — Détails opérationnels (FR-17→20)**
- FR-17: Trajet (pays/ville, dropdown Niger défaut, autocomplete) `[MVP-0]`
- FR-18: Marchandise (nature, tonnage, capacité, prix, devise, taux) `[MVP-0]`
- FR-19: Calcul camions `ceil(q/capacité)`, bornes, division-zéro, surcharge `[MVP-0]`
- FR-20: Calcul valeur `q×prix×taux`, FCFA, 2 décimales, bornes `[MVP-0]`

**Module 6 — Prestations (FR-21→24)**
- FR-21: Ligne prestation (désignation+prix obligatoires, qté défaut 1, total) `[MVP-0]`
- FR-22: Modif/suppression ligne (recalcul, min 1, drag&drop) `[MVP-0]`
- FR-23: Total devis (somme, recalcul auto, FCFA milliers) `[MVP-0]`
- FR-24: Modèles de lignes réutilisables (Admin) `[MVP-0]`

**Module 7 — Clauses (FR-25→28)**
- FR-25: Conditions paiement (texte libre, défaut, modifiable) `[MVP-0]`
- FR-26: Bibliothèque clauses (CRUD, catégorie) `[MVP-0]`
- FR-27: Application clauses devis (multi-sélection, PDF, ordre) `[MVP-0]`
- FR-28: Clause spécifique (texte libre, option modèle) `[MVP-0]`

**Module 8 — Validation client (FR-29→30)**
- FR-29: Zone signature PDF (nom, fonction, date, 50×20mm + cachet 30×30mm) `[MVP-0]`
- FR-30: Accord client (champs, scan, statut Accepté) `[MVP-0]`

**Module 9 — PDF (FR-31→34)**
- FR-31: Génération PDF (en-tête/corps/pied, A4, client-side jsPDF) `[MVP-0]`
- FR-32: Aperçu (HTML fidèle, boutons Modifier/Générer) `[MVP-0]`
- FR-33: Export/partage (téléchargement + Web Share API v2, fallback guidé) `[MVP-0]`
- FR-34: Mise en page pro (bordures, marges 15mm, polices ≥10pt, tolérance ≤2%) `[MVP-0]`

**Module 10 — Offline/PWA (FR-35→39, 37a)**
- FR-35: Cache données critiques (SW par type ressource, ≥30j) `[MVP-0]`
- FR-36: Création/modif offline (IndexedDB Dexie non chiffré MVP-0) `[MVP-0]`
- FR-37: Sync auto (queue FIFO, retry backoff max 5) `[MVP-0]` (Background Sync `[MVP-1]`)
- FR-37a: Conflits LWW horloge serveur, archive, notif, idempotence `[MVP-0]`
- FR-38: Installation PWA `[MVP-0]`
- FR-39: Mise à jour PWA `[MVP-0]`

**Module 11 — Tableau de bord (FR-40→42)**
- FR-40: Vue synthétique (compteurs statut, période 7/30/90j/tout, refresh 30s) `[MVP-0]`
- FR-41: Devis récents (10 derniers, colonnes, tap→ouvre) `[MVP-0]`
- FR-42: Montants (somme Acceptés+Envoyés, exclusion Brouillons/Annulés) `[MVP-0]`

**MVP-1**
- FR-NEW-ROUTES: CRUD modèles routes/corridors (tier Pro) `[MVP-1]`

### Non-Functional Requirements (43)

**Performance (P1-P9, Sahel 2G/Edge) :** FCP <5s/2G, TTI <8s/2G, création devis <3s, PDF <5s, recherche <500ms, sync <30s, progressive enhancement, bundle <300KB gzip, tests Android bas de gamme.

**Accessibility (A1-A6) :** WCAG 2.1 AA, navigation clavier, screen reader/ARIA, contraste 4.5:1, font scaling 200%, axe-core CI.

**Internationalization (I1-I5) :** next-intl, locale `fr-NE` extensible, formats Intl, `countryConfig`, UTF-8/accents.

**Error Handling (E1-E7) :** catégorisation transient/permanent, messages FR, retry backoff max 5, offline errors en queue, sync errors rollback+archive, error boundaries par section, reporting (consent, PII scrubbed).

**Security (S1-S7) :** mdp hashés, HTTPS, JWT 7j, IndexedDB AES-GCM au repos `[MVP-1]`, validation Zod partagée serveur-authoritative, rate limiting, remote wipe.

**Reliability (R1-R5) :** uptime 99.5%, échec sync <1%, backup quotidien 30j, RTO <4h, RPO <1h (PITR).

**Observability (O1-O4) :** audit trail append-only immutable+exportable (basique MVP-0, immutable MVP-1), Sentry, metrics, health `/api/v1/health`.

### Additional Requirements

- **Assumptions Index (§9) :** 12 `[ASSUMPTION]`/`[DÉCISION]` taggées (email/mdp, mono-société, Niger-only, pas TVA, trajet A→B simple, taux manuel, numérotation/instance, templates OHADA, PDF client-side, SW par ressource, pas background sync, pas graphiques).
- **Monetization (§12) :** tiers Starter/Pro/Entreprise + quotas (utilisateurs, devis/mois, features). Enforcement + grace period `[MVP-1]`.
- **Data Governance (§15) :** sync LWW + purge 90j, rétention devis/clients/audit 7 ans (fiscal), API versioning `/api/v1/`, schema versioning + force upgrade, backup PITR géo-répliqué (§15.4), privacy (consentement, export données).
- **Operational (§13) :** SLA 99.5%, support email/WhatsApp, maintenance dimanche 2h-6h.

### PRD Completeness Assessment

**Statut : COMPLET et de haute qualité.**
- 43 FR + 43 NFR, toutes numérotées, testables, avec conséquences mesurables.
- Scope explicitement phasé MVP-0/MVP-1/v2 (§6) — découpage clair, sans ambiguïté de périmètre.
- Open Questions résolues (§8) ; assumptions indexées (§9).
- rév. 3 intègre harmonisations du review Codex (RPO <1h, health `/api/v1/health`).
- **Risque résiduel :** Open Question #1 (modèle monétisation final) — non bloquant MVP-0 (quota enforcement = MVP-1, seams `companyId`/tier présents).

## Epic Coverage Validation

### Coverage Matrix

| FR | Epic | Story | Status |
|----|------|-------|--------|
| FR-1 | Epic 1 | 1.4 Connexion | ✓ |
| FR-2 | Epic 1 | 1.6 Rôles | ✓ |
| FR-3 | Epic 1 | 1.6 Matrice permissions | ✓ |
| FR-4 | Epic 1 | 1.7 Réinitialisation mdp | ✓ |
| FR-5 | Epic 2 | 2.3 Infos société | ✓ |
| FR-6 | Epic 2 | 2.4 Upload logo | ✓ |
| FR-7 | Epic 2 | 2.5 Signataire | ✓ |
| FR-8 | Epic 2 | 2.6 Création client | ✓ |
| FR-9 | Epic 2 | 2.7 Recherche FlexSearch | ✓ |
| FR-10 | Epic 2 | 2.8 Modification + snapshot | ✓ |
| FR-11 | Epic 2 | 2.9 Suppression | ✓ |
| FR-12 | Epic 3 | 3.1 Création devis | ✓ |
| FR-13 | Epic 3 | 3.1 Numérotation (consume numbering 2.1) | ✓ |
| FR-14 | Epic 3 | 3.11 Duplication | ✓ |
| FR-15 | Epic 3 | 3.9 Cycle de vie | ✓ |
| FR-16 | Epic 3 | 3.10 Recherche/filtrage | ✓ |
| FR-17 | Epic 3 | 3.2 Trajet | ✓ |
| FR-18 | Epic 3 | 3.3 Marchandise | ✓ |
| FR-19 | Epic 3 | 3.3 Calcul camions | ✓ |
| FR-20 | Epic 3 | 3.3 Calcul valeur | ✓ |
| FR-21 | Epic 3 | 3.4 Lignes prestation | ✓ |
| FR-22 | Epic 3 | 3.4 Modif/suppression | ✓ |
| FR-23 | Epic 3 | 3.4 Total devis | ✓ |
| FR-24 | Epic 3 | 3.5 Modèles de lignes | ✓ |
| FR-25 | Epic 3 | 3.6 Conditions paiement | ✓ |
| FR-26 | Epic 3 | 3.7 Bibliothèque clauses | ✓ |
| FR-27 | Epic 3 | 3.8 Application clauses | ✓ |
| FR-28 | Epic 3 | 3.8 Clause spécifique | ✓ |
| FR-29 | Epic 4 | 4.3 Zone signature | ✓ |
| FR-30 | Epic 4 | 4.5 Accord client | ✓ |
| FR-31 | Epic 4 | 4.1 Génération PDF | ✓ |
| FR-32 | Epic 4 | 4.2 Aperçu | ✓ |
| FR-33 | Epic 4 | 4.4 Export/partage | ✓ |
| FR-34 | Epic 4 | 4.1 Mise en page pro | ✓ |
| FR-35 | Epic 2 | 2.2 Cache SW | ✓ |
| FR-36 | Epic 2 | 2.1 (mécanisme) + 2.6 (usage) | ✓ |
| FR-37 | Epic 2 | 2.1 Sync auto | ✓ |
| FR-37a | Epic 2 | 2.1 Conflits LWW | ✓ |
| FR-38 | Epic 1 | 1.8 Installation PWA | ✓ |
| FR-39 | Epic 1 | 1.8 MAJ PWA | ✓ |
| FR-40 | Epic 5 | 5.1 Vue synthétique | ✓ |
| FR-41 | Epic 5 | 5.2 Devis récents | ✓ |
| FR-42 | Epic 5 | 5.3 Montants | ✓ |
| FR-NEW-ROUTES | Epic 6 | 6.5 CRUD routes `[MVP-1]` | ✓ |

### Missing Requirements

**Aucune FR manquante.** Les 43 FR du PRD sont toutes tracées vers une story implémentable.

### Coverage Statistics

- Total PRD FR : **43**
- FR couvertes dans epics : **43**
- Pourcentage de couverture : **100%**

### Notes de traceability

- **FR-13 clarifié** (review Codex) : mécanisme `numbering.ts` en Story 2.1, FR-13 portée par Story 3.1 (consommateur). Pas de double implémentation.
- **FR-30/FR-15 cohérents** : transition accord client verrouillée à Envoyé→Accepté (Story 4.5), respecte la machine à états Story 3.9.

## UX Alignment Assessment

### UX Document Status
**Trouvé.** `DESIGN.md` (visual contract, status final) + `EXPERIENCE.md` (behavioral contract, status final). Deux spines lus intégralement.

### UX ↔ PRD Alignment

- **IA ↔ Modules :** Les 7 routes EXPERIENCE (`/login`, `/`, `/devis`, `/devis/nouveau`, `/devis/[id]`, `/clients`, `/parametres`) couvrent les 11 modules PRD. ✅
- **Flows ↔ User Journeys :** Flow 1 (Amadou, climax) = UJ-1 ; Flow 2 (Aïcha lifecycle) = UJ-3 ; Flow 3 (login) = FR-1. ✅
- **JTBD closure :** EXPERIENCE §"Surface ↔ need closure" map chaque JTBD PRD §2.1 vers une surface. Aucun JTBD orphelin. ✅
- **Status sheet = point de capture FR-30 :** EXPERIENCE confirme qu'aucune surface "accord" séparée — le sheet de cycle de vie est l'unique point de capture. Cohérent avec le verrouillage Story 4.5. ✅

### UX ↔ Architecture Alignment

- **Frontend Architecture** adopte explicitement : routes EXPERIENCE, fonts Spectral/Hanken (remplaçant Geist), mapping tokens DESIGN→shadcn, PDF lazy jsPDF+html2canvas, offline banner + sync-indicator. ✅
- **Performance :** UX progressive enhancement + motion réduit ↔ archi bundle <300KB, lazy-load, self-hosted fonts. ✅
- **A11y :** UX-DR22/23 (cibles 44px, ARIA) ↔ archi NFR-A1-6 (WCAG AA, axe-core CI). ✅
- **i18n :** UX `fr-NE` ↔ archi next-intl. ✅

### Alignment Issues
**Aucune.** UX, PRD et Architecture sont triplement alignés. Les 23 UX-DR sont couvertes par les stories (intégrées aux epics features).

### Warnings
**Aucun.** UX complet, final, aligné. (Note : pas de dark mode v1 — décision explicite UX+PRD, sunlight Sahel, non un gap.)

## Epic Quality Review

Audit rigoureux appliqué sans complaisance (les epics étant de mon cru, l'enjeu est de les challenger honnêtement).

### Best Practices Checklist

| Critère | E1 | E2 | E3 | E4 | E5 | E6 |
|---------|----|----|----|----|----|----|
| Valeur utilisateur livrée | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Epic indépendant (backward-only) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stories correctement dimensionnées | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Aucune dépendance avant | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tables créées au besoin (JIT) | ✅ | ✅ | ✅ | n/a | n/a | n/a |
| Critères d'acceptation clairs | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Traçabilité FR maintenue | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### 🔴 Critical Violations
**Aucune.** Pas d'epic technique sans valeur (le moteur de sync est logé dans Epic 2 avec sa 1ère entité, pas isolé). Pas de dépendance avant bloquante.

### 🟠 Major Issues

**1. Story 2.1 surdimensionnée (4 mécanismes).**
Story 2.1 regroupe : (a) mutation atomique `applyLocalMutation`+outbox, (b) push/pull + retry backoff + indicateur, (c) résolution conflits LWW + archive, (d) primitive numérotation `numbering.ts`. C'est trop pour une session dev unique — risque de livraison partielle.
**Recommandation :** scinder en **2.1a** (outbox + `applyLocalMutation`, testable sur entité company de 2.3) et **2.1b** (sync push/pull + LWW + idempotence). `numbering.ts` reste mécanisme en 2.1a ou 2.1b selon affinité.

**2. Story 1.2 surdimensionnée (6 livrables).**
Story 1.2 porte `money.ts` + `calc/` (3 calculs) + `permissions.ts` (matrice RBAC complète) + schémas Zod + enveloppe API + `audit.ts`. Volume excessif.
**Recommandation :** scinder en **1.2a** (`money.ts` + `calc/` + tests, cœur métier) et **1.2b** (`permissions.ts` + enveloppe API + `audit.ts`, plomberie transverse).

### 🟡 Minor Concerns

**3. Stories techniques "As a développeur" (1.1, 1.2, 1.3, 2.1).**
Ces stories de fondation ne sont pas des user stories strictes (pas de valeur utilisateur standalone). **Acceptable** par convention BMad pour les fondations Epic 1/Epic 2 (le skill `create-epics` autorise explicitement les "foundation stories that only setup what's needed"), mais elles sont honnêtement des enableurs techniques. Le persona "développeur" reflète cette nature. Pas de correction requise — signalé pour transparence.

**4. Story 1.5 — FAB pointant vers `/devis/nouveau` (lien mort avant Epic 3).**
À la fin d'Epic 1, le FAB navigue vers une route pas encore construite. Le shell reste utilisable (navigation/404), mais le lien est mort jusqu'à Epic 3. Non bloquant.
**Recommandation :** accepter tel quel (squelette de route placeholder suffisant), ou ajouter une note AC précisant "route placeholder jusqu'à Epic 3".

**5. Epic 6 — stories peu user-facing (6.1 chiffrement, 6.3 audit, 6.6 backup).**
Infra/hardening, valeur opérateur/conformité plutôt qu'utilisateur final. **Acceptable** comme palier MVP-1 de durcissement (catégorie reconnue), mais cadrer de préférence avec persona opérateur/responsable sécurité (déjà fait pour 6.1/6.3/6.6).

### Dependency Analysis (within-epic)

| Epic | Flux intra | Statut |
|------|-----------|--------|
| 1 | 1.1 (init) → 1.2 (fondations) → 1.3 (data) → 1.4 (login) → 1.5 (shell) → 1.6 (RBAC) → 1.7 (reset) → 1.8 (PWA) | ✅ backward-only |
| 2 | 2.1 (sync engine) → 2.2 (SW cache) → 2.3 (société) → 2.4-2.5 → 2.6-2.9 (clients) | ✅ backward-only |
| 3 | 3.1 (création) → 3.2-3.8 (wizard steps) → 3.9-3.11 (opérations existant) | ✅ backward-only |
| 4 | 4.1-4.4 (PDF) → 4.5 (accord, réutilise 3.9) | ✅ backward-only |
| 5 | 5.1 → 5.2 → 5.3 | ✅ |
| 6 | 6.1-6.6 indépendantes entre elles | ✅ |

### Database/Entity Creation Timing

✅ Pas de violation "toutes les tables d'un coup". Story 1.3 pose le socle (company + audit + colonnes sync) ; tables client créées en 2.6 ; quote/quote_line en 3.1 ; clause/template en 3.7/3.5. Création JIT conforme.

### Starter Template

✅ Architecture spécifie `agentic-coding-starter-kit` (déjà scaffoldé). Story 1.1 = ajout libs additives + design system sur starter existant — conforme à la note architecture ("FIRST story = adding additive libraries, not init from scratch").

### Recommandations actionnables (synthèse)

1. **Scinder Story 2.1** → 2.1a + 2.1b (outbox vs sync/LWW).
2. **Scinder Story 1.2** → 1.2a + 1.2b (money/calc vs permissions/envelope/audit).
3. _(Optionnel)_ Ajouter note AC Story 1.5 sur le FAB placeholder.
4. _(Optionnel)_ Scission Epic 6 — non recommandé (palier hardening cohérent).

**Ces scissions (1, 2) sont les seules corrections recommandées avant implementation.** Le reste est acceptable tel quel.

## Summary and Recommendations

### Overall Readiness Status

## ✅ READY (with 2 recommended splits)

Le planning est solide, complet et aligné. Aucun blocker critique. Les 2 scissions recommandées sont de la discipline de sizing (qualité de vie pour le dev agent), pas des défauts structurels — le projet peut démarrer en implementation dès maintenant, les scissions pouvant être appliquées au moment du `create-story` (qui regénère un story file dédié).

### Synthèse des findings

| Étape | Résultat |
|-------|----------|
| Document Discovery | ✅ 4 docs primaires, 0 doublon, 0 manquant |
| PRD Analysis | ✅ 43 FR + 43 NFR, scope phasé clair |
| Epic Coverage | ✅ **100%** (43/43 FR tracées) |
| UX Alignment | ✅ triple alignement UX↔PRD↔Architecture, 0 issue |
| Epic Quality | 🟠 2 stories surdimensionnées, 🟡 3 minor, 0 critical |

### Critical Issues Requiring Immediate Action

**Aucune issue critique.** Le breakdown est implémentable en l'état.

### Recommended Next Steps

1. **(Recommandé) Scinder Story 1.2** → 1.2a (`money.ts` + `calc/` + tests) et 1.2b (`permissions.ts` + enveloppe API + `audit.ts`). Évite une story trop large pour le socle.
2. **(Recommandé) Scinder Story 2.1** → 2.1a (outbox + `applyLocalMutation`, testable sur l'entité company de 2.3) et 2.1b (sync push/pull + LWW + idempotence). Sépare la persistance locale de la réconciliation réseau.
3. **(Optionnel)** Note AC Story 1.5 : FAB → route placeholder jusqu'à Epic 3.
4. **Procéder à `[SP]` Sprint Planning** puis cycle `[CS]`→`[VS]`→`[DS]`→`[CR]`. Les scissions 1-2 seront naturellement appliquées quand chaque story file sera créé.

### Verdict

- **Couverture requirements :** 100% — aucune FR orpheline, traçabilité complète.
- **Alignement :** PRD, Architecture, UX et Epics quadruplement cohérents (incluant harmonisations review Codex : RPO <1h, health `/api/v1/health`, transition Accepté verrouillée, FR-13 clarifié, backup/PITR Story 6.6).
- **Qualité epics :** structurée par valeur utilisateur, dépendances backward-only, fondations JIT.
- **Risque résiduel :** Open Question #1 (monétisation finale) — non bloquant MVP-0.

**Conclusion : le projet est prêt pour la Phase 4 (implementation).**

---

*Assessment terminé le 2026-06-21. Assesseur : PM (spécialiste traceability & planning gaps).*
