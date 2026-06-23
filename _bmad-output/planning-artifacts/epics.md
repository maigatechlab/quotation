---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-quotation-2026-06-21/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-designs/ux-quotation-2026-06-21/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-quotation-2026-06-21/EXPERIENCE.md
  - _bmad-output/project-context.md
project_name: quotation
date: 2026-06-21
---

# quotation - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **Quotation Logistique**, decomposing the requirements from the PRD (42 FR across 11 modules), the UX Design (DESIGN.md + EXPERIENCE.md), and the Architecture Decision Document into implementable stories.

**Delivery phasing** (PRD §6): requirements are tagged `[MVP-0]` (ship-first vertical), `[MVP-1]` (hardening), or `[v2]` (deferred). Epic scope below targets **MVP-0 + MVP-1 (= v1)**; v2 items are out of scope.

## Requirements Inventory

### Functional Requirements

**Module 1 — Authentification et accès**
- FR-1: Connexion utilisateur (email/mot de passe, session offline ≤7j, check révocation au reconnect, re-auth obligatoire à J+7). `[MVP-0]`
- FR-2: Gestion des rôles (Administrateur / Commercial / Opérateur). `[MVP-0]`
- FR-3: Permission par fonctionnalité (matrice RBAC, HTTP 403, ownership-based, masquage UI). `[MVP-0]`
- FR-4: Réinitialisation mot de passe (lien email, token 24h, consommé après usage). `[MVP-0]`

**Module 2 — Paramètres société**
- FR-5: Configuration infos société (raison sociale, RCCM, NIF obligatoires, coordonnées, historique modifications). `[MVP-0]`
- FR-6: Upload logo société (PNG/JPG ≤2MB, redimensionné ≤300px, stocké Blob). `[MVP-0]`
- FR-7: Configuration signataire par défaut (nom, fonction, pré-rempli, modifiable par devis). `[MVP-0]`

**Module 3 — Gestion des clients**
- FR-8: Création fiche client (nom société + téléphone obligatoires, email validé). `[MVP-0]`
- FR-9: Recherche client (nom/téléphone/ville, FlexSearch full-text, fuzzy 1 typo, accents normalisés, offline). `[MVP-0]`
- FR-10: Modification client (snapshot client figé au devis, event log des modifications). `[MVP-0]`
- FR-11: Suppression client (soft delete, impossible si devis associés, conservé pour audit). `[MVP-0]`

**Module 4 — Gestion des devis**
- FR-12: Création nouveau devis (numéro auto, date du jour, validité +30j, statut Brouillon). `[MVP-0]`
- FR-13: Numérotation automatique (`TEMP-{DEVICE}-{SEQ}` offline → `DEV-{YYYY}-{XXXX}` serveur au sync, unicité, séquence annuelle). `[MVP-0]`
- FR-14: Duplication de devis (nouveau numéro, dates MAJ, client/trajet/prestations copiés, montants recalculés). `[MVP-0]`
- FR-15: Modification de statut (machine à états Brouillon→Validé→Envoyé→Accepté/Expiré/Annulé, transition Validé = validation complète, status logs). `[MVP-0]`
- FR-16: Recherche et filtrage devis (client/date/statut/référence, filtres combinables, tri date, pagination 25). `[MVP-0]`

**Module 5 — Détails opérationnels**
- FR-17: Saisie trajet (pays/ville départ/arrivée, dropdown pays Niger défaut, autocomplete villes). `[MVP-0]`
- FR-18: Saisie marchandise (nature, tonnage, capacité camion, prix unitaire, devise source, taux change). `[MVP-0]`
- FR-19: Calcul auto nombre de camions (`ceil(quantité/capacité)`, bornes MIN/MAX, protection division par zéro, surcharge possible). `[MVP-0]`
- FR-20: Calcul auto valeur marchandise (`quantité×prix×taux`, FCFA, 2 décimales arrondi financier, bornes prix/taux). `[MVP-0]`

**Module 6 — Prestations et frais**
- FR-21: Ajout ligne prestation (désignation+prix obligatoires, qté défaut 1, total ligne = prix×qté). `[MVP-0]`
- FR-22: Modification/suppression ligne (recalcul total, min 1 ligne, réordonnancement drag&drop). `[MVP-0]`
- FR-23: Calcul total devis (somme lignes, recalcul auto, format FCFA séparateur milliers). `[MVP-0]`
- FR-24: Modèles de lignes réutilisables (application toutes lignes, modifiables, définis par Admin). `[MVP-0]`

**Module 7 — Conditions et clauses**
- FR-25: Configuration conditions de paiement (texte libre, défaut par devis, modifiable). `[MVP-0]`
- FR-26: Bibliothèque de clauses standards (CRUD, titre+contenu, catégories). `[MVP-0]`
- FR-27: Application de clauses au devis (multi-sélection, affichées sur PDF, ordre ajustable). `[MVP-0]`
- FR-28: Clause spécifique par devis (texte libre, option "enregistrer comme modèle"). `[MVP-0]`

**Module 8 — Validation client**
- FR-29: Zone signature client sur PDF (nom, fonction, date, espace signature 50×20mm + cachet 30×30mm). `[MVP-0]`
- FR-30: Enregistrement accord client (champs modifiables, upload scan référence, statut → Accepté). `[MVP-0]`

**Module 9 — PDF et impression**
- FR-31: Génération PDF (en-tête logo+société+RCCM/NIF, corps, pied, A4 portrait, client-side jsPDF+html2canvas). `[MVP-0]`
- FR-32: Aperçu avant génération (rendu HTML fidèle, boutons Modifier/Générer). `[MVP-0]`
- FR-33: Export et partage (téléchargement local fallback universel, Web Share API niveau 2 fichiers, fallback guidé). `[MVP-0]`
- FR-34: Mise en page professionnelle (tableaux bordés, marges 15mm, polices ≥10pt, tolérance ≤2% vs mockup). `[MVP-0]`

**Module 10 — Offline-first / PWA**
- FR-35: Cache des données critiques (clients/modèles/paramètres, SW découpé par type de ressource, cache ≥30j). `[MVP-0]`
- FR-36: Création/modification offline (IndexedDB via Dexie, marquage "hors synchro"). `[MVP-0]` (IndexedDB **non chiffré** MVP-0)
- FR-37: Synchronisation automatique (queue FIFO, retry backoff exponentiel max 5, indicateur visuel). `[MVP-0]` (Background Sync API → `[MVP-1]`)
- FR-37a: Résolution de conflits (Last-Write-Wins arbitré horloge serveur, version perdante archivée, notification, idempotence). `[MVP-0]`
- FR-38: Installation PWA (invite install, icône, lancement plein écran). `[MVP-0]`
- FR-39: Mise à jour PWA (détection nouvelle version, notification, rechargement). `[MVP-0]`

**Module 11 — Tableau bord**
- FR-40: Vue synthétique activité (compteurs par statut, filtre période 7/30/90j/tout, refresh 30s). `[MVP-0]`
- FR-41: Liste devis récents (10 derniers, colonnes numéro/client/date/statut/montant, tap → ouvre). `[MVP-0]`
- FR-42: Métriques montants (somme Acceptés+Envoyés, exclusion Brouillons/Annulés, FCFA). `[MVP-0]`

**MVP-1 — FR à rédiger (hardening, palier v1)**
- FR-NEW-ROUTES: CRUD modèles de routes/corridors (départ/arrivée, distance, tarif prédéfini, application au devis, gaté tier Pro §12). `[MVP-1]` — presets figés en MVP-0.

### NonFunctional Requirements

**Performance (cibles Sahel 2G/Edge) :**
- NFR-P1: FCP <5s (2G) / <3s (3G)
- NFR-P2: TTI <8s (2G) / <5s (3G)
- NFR-P3: Création devis offline <3s
- NFR-P4: Génération PDF <5s (mobile bas de gamme)
- NFR-P5: Recherche clients <500ms (1000 clients offline)
- NFR-P6: Synchro <30s après connexion (delta sync)
- NFR-P7: Progressive enhancement (core utilisable sans assets lourds)
- NFR-P8: Bundle JS <300KB initial (gzip), lazy-load routes + PDF lib
- NFR-P9: Tests devices Android bas de gamme (1-2GB RAM, Android 8+) avant release

**Accessibility (WCAG 2.1 AA) :**
- NFR-A1: WCAG 2.1 AA minimum
- NFR-A2: Navigation clavier (tab order logique)
- NFR-A3: Screen reader (ARIA labels, landmarks, live regions)
- NFR-A4: Contraste 4.5:1 (texte normal), 3:1 (grand texte)
- NFR-A5: Font scaling 200% sans cassure
- NFR-A6: Audit a11y (axe-core) dans CI

**Internationalization :**
- NFR-I1: next-intl, tous UI strings externalisés
- NFR-I2: Locale `fr-NE` v1, structure `fr-ML`/`fr-BF` prête v2
- NFR-I3: Formats date/number/currency localisés (Intl API)
- NFR-I4: `countryConfig` extensible
- NFR-I5: UTF-8, gestion accents

**Error Handling :**
- NFR-E1: Catégorisation transient vs permanent
- NFR-E2: Messages user-friendly français, jamais stack trace user
- NFR-E3: Retry auto transient (backoff max 5), action manuelle permanent
- NFR-E4: Offline errors mises en queue + notifiées
- NFR-E5: Sync errors → notification + rollback local + archivage
- NFR-E6: React error boundaries par section
- NFR-E7: Reporting serveur (consent, PII scrubbed)

**Security :**
- NFR-S1: Mots de passe hashés (bcrypt/argon2)
- NFR-S2: HTTPS obligatoire production
- NFR-S3: Token JWT expiration 7 jours
- NFR-S4: IndexedDB chiffré au repos AES-GCM (clé PBKDF2 du mot de passe, PII/financier/commercial classifiés). `[MVP-1]`
- NFR-S5: Validation Zod partagée client/serveur, serveur authoritative
- NFR-S6: Rate limiting (auth 10/min/IP, lockout 5 échecs, devis 60/min/user, reset 3/h/email)
- NFR-S7: Remote wipe (admin purge données locales)

**Reliability :**
- NFR-R1: Uptime 99.5% mensuel
- NFR-R2: Taux échec synchro <1%
- NFR-R3: Backup quotidien, rétention 30j
- NFR-R4: RTO <4h
- NFR-R5: RPO <1h (PITR continu)

**Observability :**
- NFR-O1: Audit trail append-only par entité (who/what/when/where/before/after), immutable, exportable. Basique MVP-0, immutable+exportable `[MVP-1]`
- NFR-O2: Errors capturées (Sentry), stack trace + contexte
- NFR-O3: Metrics utilisation (analytics self-hosted)
- NFR-O4: Health check `/api/v1/health` (DB, storage, sync status) _(endpoint harmonisé à `/api/v1/health` pour cohérence avec le versioning `/api/v1/` — PRD §10.4 à mettre à jour de `/api/health`)_

### Additional Requirements

**Starter & init (Architecture §Starter Template) :**
- ADD-1: **Starter retenu** = `agentic-coding-starter-kit` (déjà scaffoldé/commité). Pas de re-scaffold. → **Epic 1 Story 1 = init story** (ajout libs additives, pas init projet).
- ADD-2: Librairies additives à ajouter (versions pinées à l'install) : **Serwist** (SW/PWA), **Dexie** (IndexedDB + seam crypto), **jsPDF + html2canvas** (PDF lazy), **next-intl** (i18n), **FlexSearch** (recherche offline), **next/font/local** (Spectral + Hanken Grotesk auto-hébergées, remplacent Geist), **Sentry**, **Vitest + Playwright + axe-core** (tests, aucun framework présent).

**Fondations partagées (Architecture §Implementation Sequence) :**
- ADD-3: Types partagés + schémas Zod partagés client/serveur (`lib/validation/`).
- ADD-4: `money.ts` — FCFA entier (XOF sans sous-unité), Intl formatting, arrondi financier explicite, **jamais de float monétaire**.
- ADD-5: `lib/calc/` — moteur déterministe pur (camions, valeur, totaux), bornes/garde division-zéro, unit-testé, réutilisé client + serveur (autoritatif).
- ADD-6: `lib/permissions.ts` — matrice RBAC : `can(role, action)` (UI) + `requirePermission(session, action, resource)` (serveur, 403).

**Data layer & sync (Architecture §Data Architecture) :**
- ADD-7: Schéma Drizzle domaine (`uuid()` PK, colonnes sync `revision`/`updated_at` + seams `company_id`/`pays`, enums anglais lowercase). `db:generate` + `db:migrate` only.
- ADD-8: Dexie `local-db.ts` (miroir entités synced + outbox + audit mirror) + seam `LocalCrypto` (no-op MVP-0 → AES-GCM MVP-1).
- ADD-9: Moteur sync `lib/sync/` : `applyLocalMutation` (write Dexie + enqueue SyncOp atomique), `push.ts`/`pull.ts`, `conflict.ts` (LWW + archive), `numbering.ts` (TEMP/DEV). Endpoints `POST /api/v1/sync/push` (idempotent), `GET /api/v1/sync/pull?since=`.
- ADD-10: Enveloppe API unique : succès = ressource directe, erreur = `{ error: { code, message, fields? } }`, status 400/401/403/409/422/429. Mapper snake_case DB ↔ camelCase JSON au boundary. Money = entier FCFA en JSON. Dates = ISO 8601 UTC.

**Cross-cutting (Architecture §Cross-Cutting) :**
- ADD-11: `lib/audit.ts` — emit `AuditEvent` dans chaque mutation API + transition statut.
- ADD-12: `lib/country-config.ts` — config i18n/locale/devise (I4), provider next-intl dans `layout.tsx`.
- ADD-13: Composants partagés `components/shared/` : offline-banner, sync-indicator, money-display.
- ADD-14: Infra/CI : Vercel (hosting), Neon Postgres (PITR), `@vercel/blob` (logos/signatures), GitHub Actions (`.github/workflows/ci.yml` : lint→typecheck→vitest→playwright+axe→build).
- ADD-15: PWA shell : `public/sw.js` (Serwist généré), `manifest.ts`, stratégie SW découpée par type de ressource (app shell cache-first, API lecture network-first/SWR, mutations queue-only, sécurité network-first strict).

### UX Design Requirements

**Design tokens & globals.css (DESIGN.md) :**
- UX-DR1: Mapper tous les tokens DESIGN.md dans `globals.css` Tailwind v4 `@theme inline` (couleurs core/surfaces/texte/status, radius, spacing, élévation) et vers les rôles sémantiques shadcn (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--ring`) pour héritage automatique.
- UX-DR2: Auto-héberger 2 polices (Spectral 400/500/600/700 + Hanken Grotesk 400/500/600/700) via `next/font/local`, remplacer Geist. Spectral = titres/montants/numéraux ; Hanken = UI. `tabular-nums` sur tous les montants.
- UX-DR3: Échelle d'élévation codifiée (Flat / Raised navy-tint / Overlay) — aucune ombre ad-hoc hors échelle.
- UX-DR4: Identité produit : logo mark "Q" navy + dot amber (SVG auto-hébergés `logo-mark.svg`, `logo-mark-light.svg`, `logo-full.svg`) ; motif filigrane Sahel ~4% navy-on-navy sur surfaces sombres (hero + en-tête PDF) uniquement, statique sous `prefers-reduced-motion`.
- UX-DR5: Discipline bi-couleur : navy commande, amber accent uniquement (FAB icon, hero glow, logo dot, grand numéral sur tint) ; amber jamais sur texte/petit UI ; texte sur amber = `amber-deep` (AA).

**Composants UI réutilisables (DESIGN.md + EXPERIENCE.md) :**
- UX-DR6: Hero card (navy, filigrane 4%, sunset radial glow breathing, eyebrow + Spectral 36 montant).
- UX-DR7: Camion card accent (tint amber, grand numéral Spectral `amber-deep`, caption formule).
- UX-DR8: Status badge (tinted bg + dot + text par lifecycle, 6 statuts, jamais color-only).
- UX-DR9: Segmented control / filter chips (single-select, actif navy fill, `aria-pressed`/`role=tab`).
- UX-DR10: Qty stepper prestations (−/+, min 1, recompute ligne + total à chaque change, ≥44×44px).
- UX-DR11: Checkbox tiles clauses (multi-select).
- UX-DR12: Bottom sheet status change (modal, 6 états + dots, tap backdrop ferme, focus trap + restore).
- UX-DR13: FAB amber (+, navy icon, 54×54, élevé −16px, → `/devis/nouveau`).
- UX-DR14: Toast (bottom-center pill, auto-dismiss ~2.2s, live region polite).
- UX-DR15: Search input (magnifier, filtre live numéro+client+route, case-insensitive partiel).
- UX-DR16: Bottom nav (5 slots Accueil·Devis·FAB·Clients·Compte, translucide+blur, masqué sur login/wizard/new-client/preview).
- UX-DR17: PDF document card (A4 blanc, en-tête navy + logo + filigrane, rule amber, Spectral, `tabular-nums`, navy TOTAL bar, blocs signature).

**Patterns d'état & interaction (EXPERIENCE.md) :**
- UX-DR18: États par surface (loading skeleton, empty + CTA, error inline `setError` français, offline banner persistant "{n} devis en attente", optimistic `TEMP-` jusqu'à `DEV-`).
- UX-DR19: Calculs live (recompute chaque keystroke, camions/valeur/total, guard capacité=0, 2-dp `Intl.NumberFormat('fr-FR')`, annoncés via live region).
- UX-DR20: Wizard 5 étapes (`/devis/nouveau` : Client → Trajet → Marchandise → Prestations → Conditions/Récap, sticky back + Précédent/Suivant, progress fill, presets corridors chips).
- UX-DR21: Motion restreint (entrance rise ~10px, sheet slide-up, toast slide-in, ambient subtil, **honore `prefers-reduced-motion`** : désactive ambient + entrance, garde rest states).

**Plancher accessibilité comportemental (EXPERIENCE.md) :**
- UX-DR22: Cibles ≥44×44px (steppers, FAB, nav, chips, hero period segments).
- UX-DR23: Noms accessibles (icon-only → `aria-label`), formes labellisées (`aria-describedby` erreurs, required annoncé), focus order logique + ring navy visible, status dot+text (jamais color-only), offline annoncé.

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR-1 | Epic 1 | Connexion utilisateur (session offline 7j) |
| FR-2 | Epic 1 | Gestion des rôles |
| FR-3 | Epic 1 | Permission par fonctionnalité (matrice RBAC) |
| FR-4 | Epic 1 | Réinitialisation mot de passe |
| FR-5 | Epic 2 | Configuration infos société |
| FR-6 | Epic 2 | Upload logo société |
| FR-7 | Epic 2 | Configuration signataire par défaut |
| FR-8 | Epic 2 | Création fiche client |
| FR-9 | Epic 2 | Recherche client (FlexSearch offline) |
| FR-10 | Epic 2 | Modification client (snapshot figé) |
| FR-11 | Epic 2 | Suppression client (soft delete) |
| FR-12 | Epic 3 | Création nouveau devis |
| FR-13 | Epic 3 | Numérotation automatique (TEMP→DEV) |
| FR-14 | Epic 3 | Duplication de devis |
| FR-15 | Epic 3 | Modification de statut (cycle de vie) |
| FR-16 | Epic 3 | Recherche et filtrage devis |
| FR-17 | Epic 3 | Saisie trajet |
| FR-18 | Epic 3 | Saisie marchandise |
| FR-19 | Epic 3 | Calcul auto nombre de camions |
| FR-20 | Epic 3 | Calcul auto valeur marchandise |
| FR-21 | Epic 3 | Ajout ligne prestation |
| FR-22 | Epic 3 | Modification/suppression ligne |
| FR-23 | Epic 3 | Calcul total devis |
| FR-24 | Epic 3 | Modèles de lignes réutilisables |
| FR-25 | Epic 3 | Configuration conditions de paiement |
| FR-26 | Epic 3 | Bibliothèque de clauses standards |
| FR-27 | Epic 3 | Application de clauses au devis |
| FR-28 | Epic 3 | Clause spécifique par devis |
| FR-29 | Epic 4 | Zone signature client sur PDF |
| FR-30 | Epic 4 | Enregistrement accord client |
| FR-31 | Epic 4 | Génération PDF |
| FR-32 | Epic 4 | Aperçu avant génération |
| FR-33 | Epic 4 | Export et partage |
| FR-34 | Epic 4 | Mise en page professionnelle |
| FR-35 | Epic 2 | Cache des données critiques (SW) |
| FR-36 | Epic 2 | Création/modification offline |
| FR-37 | Epic 2 | Synchronisation automatique |
| FR-37a | Epic 2 | Résolution de conflits (LWW) |
| FR-38 | Epic 1 | Installation PWA |
| FR-39 | Epic 1 | Mise à jour PWA |
| FR-40 | Epic 5 | Vue synthétique activité |
| FR-41 | Epic 5 | Liste devis récents |
| FR-42 | Epic 5 | Métriques montants |
| FR-NEW-ROUTES | Epic 6 | CRUD modèles routes/corridors `[MVP-1]` |

**NFR / ADD / UX-DR distribution :** cross-cutting (NFR perf/a11y/i18n/sécu/error, ADD fondations/data/sync/infra, UX-DR tokens/composants) sont portés par les epics où ils s'appliquent — détaillés dans chaque description d'epic et raffinés en critères d'acceptation à l'étape stories.

## Epic List

### Epic 1: Socle, Design System & Authentification
Poser le socle technique et permettre à un utilisateur d'installer la PWA, se connecter selon son rôle (Admin/Commercial/Opérateur), et atteindre le shell applicatif. Inclut : init des librairies additives, fondations partagées (`money.ts`, `calc/`, `permissions.ts`, Zod), data layer (Drizzle + Dexie + seam LocalCrypto no-op), enveloppe API + audit + i18n, design system (tokens DESIGN.md, polices auto-hébergées, logo), app shell + bottom nav, CI. Autonome : système d'auth complet + socle réutilisable.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-38, FR-39

### Epic 2: Référentiel offline — Société, Clients & Moteur de sync
Permettre à un admin de configurer la société (infos légales RCCM/NIF, logo, signataire) et à un commercial de gérer ses clients (CRUD, recherche FlexSearch), le tout en offline-first avec synchronisation automatique. Première activation du moteur de sync (`applyLocalMutation`, push/pull, LWW, numbering) sur les premières entités syncables. Cache SW par type de ressource. Autonome : utilise l'auth d'Epic 1, livre le référentiel + l'infrastructure offline.
**FRs covered:** FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-35, FR-36, FR-37, FR-37a

### Epic 3: Devis — création, calculs, prestations & clauses (cœur produit)
Permettre à un commercial de créer un devis complet via le wizard 5 étapes (client → trajet → marchandise → prestations → conditions/récap) avec calculs automatiques live (camions, valeur marchandise, totaux), numérotation TEMP→DEV, cycle de vie des statuts, lignes de prestations + modèles, et clauses (bibliothèque + application + spécifiques). Le climax flow du produit. Tout touche le wizard/entité devis (mêmes fichiers cœur) → consolidé en stories ordonnées. Autonome : utilise auth + clients + sync des epics précédents.
**FRs covered:** FR-12, FR-13, FR-14, FR-15, FR-16, FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, FR-27, FR-28

### Epic 4: PDF, validation client & partage
Permettre à un commercial de générer le PDF professionnel du devis (client-side, lazy jsPDF + html2canvas), de l'aperçevoir fidèlement, de le partager (Web Share API → WhatsApp/email, fallback téléchargement) et de capturer l'accord client (zone signature, transition → Accepté). Autonome : utilise le devis complet (Epic 3) + infos société/logo (Epic 2).
**FRs covered:** FR-29, FR-30, FR-31, FR-32, FR-33, FR-34

### Epic 5: Tableau de bord
Permettre à un gérant/commercial de visualiser son activité : compteurs de devis par statut (filtre période), liste des devis récents, métriques de montants devisés. Agrégats calculés localement (Dexie), hero card éditoriale. Autonome : utilise les devis (Epic 3).
**FRs covered:** FR-40, FR-41, FR-42

### Epic 6: Durcissement v1 `[MVP-1]`
Durcir la v1 après le ship MVP-0 : chiffrement IndexedDB au repos (AES-GCM via le seam LocalCrypto), enforcement des quotas par tier (§12) + grace period, audit trail immutable + export, Background Sync API, CRUD des modèles de routes/corridors (presets figés en MVP-0), et backup/PITR géo-répliqué (§15.4). Palier de livraison distinct, séquençable après MVP-0.
**FRs covered:** FR-NEW-ROUTES

---

## Epic 1: Socle, Design System & Authentification

Poser le socle technique et livrer une PWA installable où un utilisateur se connecte selon son rôle et atteint le shell applicatif. Couvre FR-1, FR-2, FR-3, FR-4, FR-38, FR-39 + ADD-1→14 + UX-DR1-5,16,21,22,23 + NFR sécu/a11y/i18n/perf transverses.

### Story 1.1: Initialisation des librairies & du design system

As a développeur de l'équipe Maiga Tech Lab,
I want les librairies additives, les tokens du design system, les polices auto-hébergées et le shell PWA scaffoldés sur le starter existant,
So that toutes les features suivantes s'appuient sur une base cohérente, offline-capable et conforme à DESIGN.md.

**Acceptance Criteria:**

**Given** le projet déjà scaffoldé (`agentic-coding-starter-kit`)
**When** j'installe les librairies additives
**Then** Serwist, Dexie, jsPDF, html2canvas, next-intl, FlexSearch, Sentry, Vitest, Playwright et axe-core sont ajoutés avec versions pinées (ADD-2)
**And** `pnpm install`, `pnpm check` et `pnpm build` réussissent

**Given** DESIGN.md comme contrat visuel
**When** je mappe les tokens dans `globals.css` (Tailwind v4 `@theme inline`)
**Then** couleurs core/surfaces/texte/status, radius, spacing et l'échelle d'élévation (Flat/Raised/Overlay) sont déclarés (UX-DR1, UX-DR3)
**And** ils sont mappés aux rôles sémantiques shadcn (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--ring`)

**Given** l'exigence offline/PWA
**When** je configure les polices
**Then** Spectral (400/500/600/700) et Hanken Grotesk (400/500/600/700) sont auto-hébergées via `next/font/local` et remplacent Geist (UX-DR2)
**And** les SVG logo (`logo-mark.svg`, `logo-mark-light.svg`, `logo-full.svg`) sont présents dans `public/`

**Given** Serwist
**When** je scaffolde le service worker et le manifest
**Then** `next.config.ts` câble Serwist, `manifest.ts` est défini, et le SW est désactivé en dev sauf test offline

### Story 1.2: Fondations métier partagées (money, calc, permissions, validation)

As a développeur,
I want les primitives métier pures (`money.ts`, `calc/`, `permissions.ts`, schémas Zod, enveloppe API, audit) avec tests unitaires,
So that toutes les features réutilisent des calculs corrects, testés et autoritatifs côté serveur.

**Acceptance Criteria:**

**Given** XOF sans sous-unité
**When** j'implémente `money.ts`
**Then** les montants sont des entiers FCFA, formatés via `Intl.NumberFormat('fr-FR')`, avec arrondi financier explicite (ADD-4)
**And** aucune arithmétique flottante sur les montants n'est possible
**And** les tests unitaires Vitest couvrent formatage et arrondi

**Given** les formules métier du PRD (FR-19, FR-20, FR-23)
**When** j'implémente `lib/calc/` (camions, valeur, totaux)
**Then** `ceil(tonnage/capacité)`, `tonnage×prix×taux`, `Σ lignes` sont des fonctions pures déterministes
**And** les gardes (division par zéro, bornes MIN/MAX tonnage/capacité/prix/taux) sont appliquées et testées
**And** le moteur est réutilisable client + serveur

**Given** la matrice de permissions FR-3
**When** j'implémente `lib/permissions.ts`
**Then** `can(role, action)` (UI) et `requirePermission(session, action, resource)` (serveur, lève 403) encodent la matrice ownership-based (ADD-6)
**And** les tests unitaires couvrent chaque cellule de la matrice

**Given** les conventions d'architecture
**When** je définis l'enveloppe API et l'audit
**Then** succès = ressource directe, erreur = `{ error: { code, message, fields? } }` (ADD-10), `lib/audit.ts` émet `AuditEvent` (ADD-11)
**And** le mapper snake_case↔camelCase est en place au boundary

### Story 1.3: Couche de données locale & seam de chiffrement

As a développeur,
I want le store Dexie local et le seam `LocalCrypto` scaffoldés, plus les tables Drizzle de base avec colonnes de sync,
So that l'auth et les features persistent localement en offline sans réécriture au palier MVP-1.

**Acceptance Criteria:**

**Given** l'architecture data layer
**When** je définis le schéma Drizzle de base
**Then** les tables custom utilisent `uuid()` PK, les colonnes sync `revision`/`updated_at` + seams `company_id`/`pays` sont présentes, enums anglais lowercase (ADD-7)
**And** la migration est créée via `pnpm db:generate` puis appliquée via `pnpm db:migrate` (jamais `db:push`)

**Given** l'exigence offline-first
**When** je définis `lib/local-db.ts` (Dexie)
**Then** le store miroite les entités synced + outbox + audit mirror (ADD-8)

**Given** le palier MVP-0
**When** j'implémente le seam `lib/crypto/local-crypto.ts`
**Then** l'interface `LocalCrypto` existe en mode no-op passthrough, prête à recevoir AES-GCM en MVP-1 (S4)
**And** toutes les lectures/écritures Dexie passent par ce seam

### Story 1.4: Connexion utilisateur (FR-1)

As a utilisateur (Commercial/Admin/Opérateur),
I want me connecter avec email et mot de passe et garder ma session offline,
So that j'accède à l'application même en zone à faible connectivité.

**Acceptance Criteria:**

**Given** un écran `/login` conforme à EXPERIENCE.md Flow 3
**When** je saisis des credentials valides
**Then** Better Auth m'authentifie (mots de passe hashés, S1), une session JWT 7 jours est créée (S3) et j'atterris sur le Dashboard

**Given** des credentials invalides
**When** je tente la connexion
**Then** le système retourne HTTP 401 et un message d'erreur français inline (`setError`)
**And** après 5 échecs, le compte est verrouillé (S6, unlock admin)

**Given** une session offline active
**When** je suis hors ligne jusqu'à 7 jours
**Then** l'accès est maintenu ; à J+7 sans reconnexion, l'app se verrouille et exige une re-authentification en ligne (FR-1, D-OFFLINE)

**Given** un retour de connexion
**When** la session se reconnecte
**Then** le token est rafraîchi et le statut utilisateur (révocation) est vérifié serveur ; si révoqué → session terminée + purge locale

### Story 1.5: Shell applicatif authentifié & navigation

As a utilisateur authentifié,
I want un shell mobile-first avec navigation par barre inférieure et indicateur offline,
So that je circule entre les surfaces et vois clairement mon état de connexion.

**Acceptance Criteria:**

**Given** que je suis authentifié
**When** le shell `(app)` se rend
**Then** la bottom nav 5 slots (Accueil · Devis · FAB · Clients · Compte) est affichée, masquée sur login/wizard/new-client/preview (UX-DR16)
**And** le FAB amber central pointe vers `/devis/nouveau` (UX-DR13)

**Given** un état hors ligne ou des opérations en attente
**When** je consulte n'importe quelle surface
**Then** une bannière offline persistante s'affiche ("Hors ligne · {n} devis en attente") avec point amber clignotant (UX-DR18)
**And** l'état offline est annoncé aux lecteurs d'écran (UX-DR23)

**Given** l'exigence i18n
**When** le shell se charge
**Then** le provider next-intl est monté, locale `fr-NE`, tous les strings UI externalisés dans `src/messages/fr-NE.json` (ADD-12, NFR-I1)
**And** `prefers-reduced-motion` est honoré (ambient + entrance désactivés, rest states gardés) (UX-DR21)

**Given** le plancher a11y
**When** je navigue au clavier
**Then** l'ordre de focus est logique, le ring navy visible partout, cibles ≥44×44px (UX-DR22, NFR-A2)

### Story 1.6: Rôles & matrice de permissions (FR-2, FR-3)

As a administrateur,
I want que chaque utilisateur ait un rôle déterminant ses droits, appliqué côté UI et serveur,
So that les actions sensibles sont protégées et l'interface n'affiche que le permis.

**Acceptance Criteria:**

**Given** les trois rôles (Admin/Commercial/Opérateur)
**When** un utilisateur est créé/assigné
**Then** son rôle est persisté et gouverne ses droits selon la matrice FR-3 (FR-2)

**Given** une action non autorisée
**When** l'utilisateur tente l'action via une route API mutante
**Then** `requirePermission` retourne HTTP 403 (double enforcement serveur)
**And** l'UI masque les boutons d'actions non permises via `can(role, action)` (FR-3)

**Given** le modèle ownership-based
**When** un Commercial accède au devis d'un autre Commercial
**Then** il peut consulter mais pas modifier ; l'Admin override tous droits (FR-3)

**Given** une page de gestion des utilisateurs (`/parametres/utilisateurs`)
**When** un Admin la consulte
**Then** il peut voir et assigner les rôles ; Commercial/Opérateur n'y ont pas accès

### Story 1.7: Réinitialisation du mot de passe (FR-4)

As a utilisateur ayant oublié son mot de passe,
I want demander un lien de réinitialisation par email,
So that je récupère l'accès à mon compte en autonomie.

**Acceptance Criteria:**

**Given** l'écran "Mot de passe oublié ?"
**When** je saisis mon email et soumets
**Then** un email avec lien sécurisé est envoyé (SMTP), token valide 24h (FR-4)
**And** un toast "Lien de réinitialisation envoyé" s'affiche

**Given** un lien de réinitialisation
**When** je l'utilise pour définir un nouveau mot de passe
**Then** le token est consommé après usage (usage unique) et ne peut être rejoué
**And** le rate limiting password reset (3/heure/email, S6) est appliqué

### Story 1.8: Installation & mise à jour PWA (FR-38, FR-39)

As a utilisateur,
I want installer l'application sur mon appareil et être notifié des mises à jour,
So that je l'utilise en plein écran et reste sur la dernière version.

**Acceptance Criteria:**

**Given** les critères navigateur réunis
**When** je charge l'app pour la première fois
**Then** une invite d'installation s'affiche et une icône d'installation est disponible (FR-38)
**And** l'app installée se lance en plein écran sans barre d'URL

**Given** une nouvelle version déployée
**When** je recharge l'app
**Then** la nouvelle version est détectée, une notification "Mise à jour disponible" s'affiche, et le rechargement s'applique au prochain lancement (FR-39)

---

## Epic 2: Référentiel offline — Société, Clients & Moteur de sync

Livrer le référentiel (société, clients) en offline-first avec synchronisation automatique. Première activation du moteur de sync sur les premières entités syncables. Couvre FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-35, FR-36, FR-37, FR-37a + ADD-9,13,15 + UX-DR15.

### Story 2.1: Moteur de synchronisation offline (FR-36, FR-37, FR-37a)

As a développeur,
I want le moteur de sync (mutation locale atomique, outbox, push/pull, résolution de conflits LWW, numérotation) opérationnel,
So that toute entité syncable persiste offline et se réconcilie avec le serveur sans perte ni double-application.

**Acceptance Criteria:**

**Given** une mutation locale
**When** j'appelle `applyLocalMutation`
**Then** l'écriture Dexie + l'enqueue d'un `SyncOp` (opId UUIDv7, entity, type, payload, baseRevision) se font de façon atomique (ADD-9) — jamais d'écriture Dexie sans enqueue

**Given** des opérations en attente et un retour réseau
**When** la sync se déclenche
**Then** la queue FIFO rejoue les ops vers `POST /api/v1/sync/push` (idempotent par opId), avec retry backoff exponentiel max 5 (FR-37)
**And** un `GET /api/v1/sync/pull?since={cursor}` ramène le delta et réconcilie Dexie
**And** un indicateur visuel de sync en cours est affiché

**Given** une révision serveur ≠ révision base client
**When** un conflit est détecté à l'échelle de l'entité
**Then** le dernier write (horloge serveur) gagne, la version perdante est archivée (non détruite), et l'utilisateur reçoit une notification de conflit (FR-37a)
**And** aucun merge champ-par-champ n'est tenté en MVP-0

**Given** le besoin de numérotation offline/online
**When** j'implémente la **primitive** `lib/sync/numbering.ts`
**Then** elle expose le mécanisme : format `TEMP-{DEVICE}-{SEQ}` local, attribution `DEV-{YYYY}-{XXXX}` serveur au sync, remplacement + notification (mécanisme uniquement)
**And** cette story **ne porte pas FR-13** (couverture FR-13 = Story 3.1, qui consomme cette primitive lors de la création de devis) — pas de double implémentation

### Story 2.2: Stratégie de cache Service Worker par type de ressource (FR-35)

As a utilisateur en zone à faible connectivité,
I want que les données critiques soient mises en cache selon une stratégie adaptée à chaque type de ressource,
So that l'app fonctionne offline sans servir de données de sécurité périmées.

**Acceptance Criteria:**

**Given** le Service Worker Serwist
**When** je configure les stratégies de cache (ADD-15)
**Then** l'app shell (HTML/JS/CSS, fonts, logo) est en Cache First (précaché à l'install)
**And** l'API lecture (clients, devis, paramètres, modèles) est en Network First avec fallback cache (ou SWR pour données peu volatiles)
**And** les mutations API ne sont jamais cachées (queue offline uniquement)
**And** permissions/quotas/révocation sont en Network First strict (pas de fallback périmé)

**Given** le premier chargement
**When** le cache initial se constitue
**Then** les données de référence (clients, modèles, paramètres société) persistent offline ≥30 jours et sont mises à jour à chaque connexion (FR-35)

### Story 2.3: Configuration des informations société (FR-5)

As a administrateur,
I want saisir et modifier les informations de ma société (raison sociale, RCCM, NIF, coordonnées),
So that ces informations apparaissent sur tous les devis et PDF générés.

**Acceptance Criteria:**

**Given** la page `/parametres` (accès Admin seul, FR-3)
**When** je saisis les infos société
**Then** raison sociale, forme juridique, capital, adresse, BP, RCCM, NIF, téléphones, emails sont enregistrés (FR-5)
**And** RCCM et NIF sont obligatoires et validés (regex OHADA)

**Given** une modification des infos
**When** je sauvegarde
**Then** la mutation passe par `applyLocalMutation` (offline-capable, sync auto)
**And** les modifications s'appliquent immédiatement aux nouveaux devis
**And** l'historique des modifications est conservé (event log, FR-10/O1)

### Story 2.4: Upload du logo société (FR-6)

As a administrateur,
I want uploader le logo de ma société,
So that il apparaît en en-tête des PDF de devis.

**Acceptance Criteria:**

**Given** la page paramètres société
**When** j'uploade un logo PNG/JPG ≤2MB
**Then** l'image est redimensionnée automatiquement (max 300px largeur), optimisée pour PDF et stockée dans `@vercel/blob` (FR-6)

**Given** un fichier invalide
**When** je tente l'upload (format non supporté ou >2MB)
**Then** une erreur française explicite s'affiche et l'upload est rejeté

### Story 2.5: Configuration du signataire par défaut (FR-7)

As a administrateur,
I want définir un signataire par défaut (nom, fonction),
So that il est pré-rempli sur chaque nouveau devis.

**Acceptance Criteria:**

**Given** la page paramètres société
**When** je définis le signataire par défaut
**Then** nom et fonction sont enregistrés (FR-7)
**And** ils sont pré-remplis sur chaque nouveau devis, modifiables au moment de la création

### Story 2.6: Création d'une fiche client (FR-8)

As a commercial,
I want créer une fiche client offline,
So that je réutilise ses données lors de la création de devis, même hors ligne.

**Acceptance Criteria:**

**Given** le formulaire `/clients/nouveau`
**When** je crée un client (nom société, contact, téléphone, email, pays, ville, adresse, notes)
**Then** nom société et téléphone sont obligatoires, email validé (format) (FR-8)
**And** la création passe par `applyLocalMutation` et le client apparaît immédiatement (optimistic), réconcilié au sync (FR-36)
**And** un toast "Client « {nom} » créé" confirme

### Story 2.7: Recherche de clients offline (FR-9)

As a commercial,
I want rechercher un client par nom, téléphone ou ville, même hors ligne,
So that je le retrouve rapidement lors de la création d'un devis.

**Acceptance Criteria:**

**Given** un index FlexSearch in-memory (nom société, contact, téléphone, ville)
**When** je saisis un terme de recherche
**Then** la recherche full-text partielle filtre la liste live, fuzzy (tolérance 1 typo), accents normalisés (é→e) (FR-9, UX-DR15)
**And** la recherche fonctionne offline et retourne en <500ms sur 1000 clients (NFR-P5)

### Story 2.8: Modification d'un client & snapshot historique (FR-10)

As a commercial,
I want modifier une fiche client sans altérer les devis historiques,
So that les anciens devis conservent les données client figées au moment de leur création.

**Acceptance Criteria:**

**Given** un client existant déjà référencé sur des devis
**When** je modifie ses informations
**Then** les devis historiques ne changent pas (snapshot client figé au devis, FR-10)

**Given** une modification de client
**When** je sauvegarde
**Then** chaque modification est tracée dans l'event log (champ, avant/après, user, timestamp) et la timeline est consultable (FR-10/M7)

### Story 2.9: Suppression d'un client (FR-11)

As a administrateur,
I want supprimer un client en soft delete,
So that les données restent disponibles pour audit tout en retirant le client des listes actives.

**Acceptance Criteria:**

**Given** un client sans devis associé
**When** un Admin le supprime
**Then** la suppression est un soft delete : données masquées mais conservées pour audit (FR-11)

**Given** un client associé à des devis existants
**When** je tente la suppression
**Then** elle est impossible et un message explique la raison

---

## Epic 3: Devis — création, calculs, prestations & clauses

Permettre à un commercial de créer un devis complet via le wizard 5 étapes avec calculs automatiques live, puis de gérer son cycle de vie, sa recherche et sa duplication. Le climax flow du produit. Couvre FR-12 → FR-28 + UX-DR6-12,19,20 + NFR-P3,E*.

### Story 3.1: Création d'un nouveau devis & numérotation (FR-12, FR-13)

As a commercial,
I want créer un nouveau devis en sélectionnant un client, avec un numéro et des dates attribués automatiquement,
So that je démarre rapidement un devis structuré, même hors ligne.

**Acceptance Criteria:**

**Given** le wizard `/devis/nouveau` étape 1 (Client)
**When** je sélectionne un client (client option card, tap → check rempli) ou crée un nouveau client inline
**Then** un devis est créé : référence/objet saisis, commercial attribué, statut initial "Brouillon" (FR-12)
**And** la date du devis = jour (modifiable), validité = jour +30 jours (modifiable)

**Given** la primitive de numérotation `lib/sync/numbering.ts` fournie par Story 2.1
**When** je crée un devis offline
**Then** j'**appelle** cette primitive : numéro `TEMP-{DEVICE}-{SEQ}` posé localement, remplacé par `DEV-{YYYY}-{XXXX}` serveur au sync, notification du remplacement (FR-13)
**And** la séquence serveur est unique et réinitialisée chaque année
**And** responsabilité clarifiée : **Story 2.1 = mécanisme, Story 3.1 = consommateur** (FR-13 porté par 3.1 uniquement)

### Story 3.2: Saisie du trajet (FR-17)

As a commercial,
I want saisir le trajet (pays/ville départ → arrivée) avec des corridors prédéfinis,
So that je renseigne l'itinéraire en un geste.

**Acceptance Criteria:**

**Given** le wizard étape 2 (Trajet)
**When** je saisis le trajet
**Then** pays départ/arrivée via dropdown (Niger par défaut MVP), villes en autocomplete (villes majeures) (FR-17)
**And** le trajet s'affiche "Ville Départ → Ville Arrivée"

**Given** les presets de corridors (chips codés en dur MVP-0)
**When** je tape un corridor (ex: "Niamey→Ouagadougou")
**Then** les deux extrémités se remplissent d'un coup (UX-DR20, EXPERIENCE Flow 1)

### Story 3.3: Marchandise & calculs automatiques (FR-18, FR-19, FR-20)

As a commercial,
I want saisir la marchandise et voir les calculs de camions et de valeur se mettre à jour en direct,
So that j'obtiens un chiffrage correct sans calcul manuel.

**Acceptance Criteria:**

**Given** le wizard étape 3 (Marchandise)
**When** je saisis nature, tonnage, capacité camion, prix unitaire, devise source, taux de change
**Then** quantité et capacité sont obligatoires, devise source = FCFA par défaut, taux = 1 si FCFA (FR-18)
**And** le champ taux n'apparaît que si devise ≠ FCFA (UX-DR19)

**Given** le calcul des camions (réutilise `lib/calc/`)
**When** tonnage et capacité sont saisis
**Then** la camion card affiche `ceil(tonnage/capacité)` live avec la formule, surcharge possible (FR-19, UX-DR7)
**And** les bornes (MIN_TONNAGE 0.1, MAX 10000 ; MIN_CAPACITE 1, MAX 100) et la protection division par zéro (capacité=0 → bloqué + erreur) sont appliquées

**Given** le calcul de valeur marchandise
**When** quantité, prix et taux sont saisis
**Then** `valeur = quantité × prix × taux` s'affiche live en FCFA (+ montant devise source si ≠ FCFA), 2 décimales arrondi financier via `money.ts` (FR-20)
**And** les bornes prix (MIN 0, MAX 10^10) et taux (MIN 0.001, négatif bloqué) sont appliquées
**And** les résultats de calcul sont annoncés via live region (UX-DR19, NFR-A3)

### Story 3.4: Lignes de prestations & total devis (FR-21, FR-22, FR-23)

As a commercial,
I want ajouter, modifier et supprimer des lignes de prestations avec un total recalculé en direct,
So that je détaille tous les frais et obtiens le montant total du devis.

**Acceptance Criteria:**

**Given** le wizard étape 4 (Prestations)
**When** j'ajoute une ligne (désignation, prix unitaire, quantité)
**Then** désignation et prix sont obligatoires, qté défaut 1 (stepper −/+, min 1), total ligne = `prix × quantité` (FR-21, UX-DR10)

**Given** des lignes existantes
**When** je modifie, supprime ou réordonne (drag & drop)
**Then** le total ligne et le total devis se recalculent ; suppression impossible s'il ne reste qu'une ligne requise (FR-22)

**Given** l'ensemble des lignes
**When** une ligne change
**Then** `total_devis = Σ total_ligne` se recalcule automatiquement (<100ms pour 20 lignes), affiché en FCFA séparateur milliers via `money.ts` (FR-23, NFR)

### Story 3.5: Modèles de lignes réutilisables (FR-24)

As a commercial,
I want appliquer des lignes standards depuis un modèle,
So that je remplis les prestations courantes sans ressaisie.

**Acceptance Criteria:**

**Given** des modèles de lignes définis par l'Admin (ex: "Transport Niger-Burkina", "Carnet transit")
**When** j'applique un modèle dans l'étape Prestations
**Then** toutes les lignes définies sont importées et restent modifiables individuellement (FR-24)
**And** les modèles sont disponibles offline

### Story 3.6: Conditions de paiement (FR-25)

As a administrateur,
I want définir des conditions de paiement par défaut appliquées aux devis,
So that chaque devis porte des modalités cohérentes, ajustables au cas par cas.

**Acceptance Criteria:**

**Given** les paramètres de conditions de paiement
**When** un Admin définit le délai et les modalités (texte libre, ex: "Paiement à 30 jours fin de mois")
**Then** elles sont appliquées par défaut à chaque nouveau devis (FR-25)
**And** elles sont modifiables par devis (wizard étape 5)

### Story 3.7: Bibliothèque de clauses standards (FR-26)

As a administrateur,
I want gérer une bibliothèque de clauses standards,
So that les commerciaux réutilisent des clauses validées sur leurs devis.

**Acceptance Criteria:**

**Given** la page `/parametres/clauses`
**When** un Admin gère les clauses
**Then** CRUD complet : chaque clause a un titre et un contenu (≤2000 caractères), organisée par catégorie (Paiement, Responsabilité, Exclusions) (FR-26)
**And** la bibliothèque est disponible offline

### Story 3.8: Application & clause spécifique au devis (FR-27, FR-28)

As a commercial,
I want sélectionner des clauses standards et ajouter une clause spécifique à un devis,
So that le devis porte les conditions contractuelles adaptées.

**Acceptance Criteria:**

**Given** le wizard étape 5 (Conditions)
**When** je sélectionne des clauses standards (checkbox tiles multi-select)
**Then** la multi-sélection est possible, les clauses s'affichent en bas du PDF, l'ordre est ajustable (FR-27, UX-DR11)

**Given** un besoin hors bibliothèque
**When** j'ajoute une clause spécifique (texte libre)
**Then** elle s'ajoute aux clauses standards sélectionnées (FR-28)
**And** une option "enregistrer comme modèle" l'ajoute à la bibliothèque future

### Story 3.9: Cycle de vie & changement de statut (FR-15)

As a commercial,
I want faire évoluer le statut d'un devis selon son cycle de vie,
So that je suis où en est chaque devis et garde une trace des transitions.

**Acceptance Criteria:**

**Given** un devis et le bottom sheet de statut (6 états + dots, état courant coché)
**When** je change le statut
**Then** les transitions suivent Brouillon → Validé → Envoyé → Accepté / Expiré / Annulé (FR-15, UX-DR8,12)
**And** "Brouillon → Validé" exige une validation complète (champs requis, total > 0, client assigné) ; sinon reste Brouillon + erreurs affichées

**Given** une transition
**When** elle est appliquée
**Then** elle est enregistrée dans `quotation_status_logs` (user, timestamp, ancien/nouveau statut), timeline consultable, audit immutable (FR-15/M7)
**And** un toast confirme ("Statut → Envoyé") ; chaque badge paire dot + texte (jamais color-only, UX-DR23)

### Story 3.10: Recherche & filtrage des devis (FR-16)

As a commercial,
I want rechercher et filtrer mes devis,
So that je retrouve rapidement un devis dans l'historique.

**Acceptance Criteria:**

**Given** la liste `/devis`
**When** je recherche/filtre par client, date, statut, référence
**Then** les filtres sont combinables (ex: client X + statut "Envoyé"), tri par date descendant par défaut (FR-16)
**And** les résultats sont paginés (25 par page) et la recherche fonctionne offline

### Story 3.11: Duplication d'un devis (FR-14)

As a commercial,
I want dupliquer un devis existant,
So that je crée rapidement une nouvelle version pour un client récurrent (EXPERIENCE Flow 2).

**Acceptance Criteria:**

**Given** un devis existant
**When** je le duplique
**Then** un nouveau numéro est généré, dates et validité mises à jour, client/trajet/prestations copiés (FR-14)
**And** les montants sont recalculés si nécessaire via `lib/calc/`
**And** le nouveau devis est créé en < 30 secondes (EXPERIENCE Flow 2)

---

## Epic 4: PDF, validation client & partage

Permettre à un commercial de générer, aperçevoir, partager le PDF professionnel du devis et de capturer l'accord client. Couvre FR-29, FR-30, FR-31, FR-32, FR-33, FR-34 + UX-DR17 + NFR-P4.

### Story 4.1: Génération du PDF professionnel (FR-31, FR-34)

As a commercial,
I want générer un PDF professionnel du devis, client-side et offline,
So that je dispose d'un document propre prêt à envoyer, même sans connexion.

**Acceptance Criteria:**

**Given** un devis complet et la librairie PDF lazy-loaded (jsPDF + html2canvas)
**When** je génère le PDF
**Then** en-tête (logo, raison sociale, RCCM, NIF, coordonnées), corps (numéro, date, validité, client, trajet, marchandise, lignes prestations, clauses), pied "Document généré par Quotation Logistique", format A4 portrait (FR-31)
**And** la génération est possible offline (client-side) en < 5 secondes sur mobile bas de gamme (NFR-P4)
**And** la librairie PDF est lazy-loaded (code splitting), sans impact sur le first load (NFR-P8)

**Given** la mise en page professionnelle (UX-DR17)
**When** le PDF est rendu
**Then** tableaux de lignes bordés, marges 15mm, polices ≥10pt (Spectral titres/montants `tabular-nums`, Hanken corps), en-tête navy + filigrane Sahel, navy TOTAL bar (FR-34)
**And** la tolérance visuelle est ≤2% vs mockup, testée cross-browser (Chrome, Safari mobile, Firefox)

### Story 4.2: Aperçu avant génération (FR-32)

As a commercial,
I want aperçevoir le devis avant de générer le PDF final,
So that je vérifie le rendu et corrige avant envoi.

**Acceptance Criteria:**

**Given** la page `/devis/[id]` (aperçu)
**When** je consulte l'aperçu
**Then** le rendu HTML est fidèle au PDF, scroll complet du document (FR-32, UX-DR17)
**And** les boutons "Modifier" et "Générer PDF" sont disponibles

### Story 4.3: Zone de signature client sur le PDF (FR-29)

As a commercial,
I want que le PDF inclue une zone de signature client,
So that le client puisse signer physiquement le devis (contrepartie papier de l'accord).

**Acceptance Criteria:**

**Given** le template PDF
**When** le document est généré
**Then** une zone "Bon pour accord — Client" délimitée inclut nom, fonction, date (pré-remplis si connus), espace signature 50×20mm + espace cachet 30×30mm (FR-29)
**And** la zone est positionnée à coordonnées fixées

### Story 4.4: Export & partage du PDF (FR-33)

As a commercial,
I want exporter et partager le PDF via les canaux supportés par le navigateur,
So that je l'envoie au client par WhatsApp ou email (EXPERIENCE Flow 1).

**Acceptance Criteria:**

**Given** un PDF généré
**When** je l'exporte
**Then** le téléchargement local est toujours disponible (fallback universel), nom `Devis-{Numéro}-{Client}.pdf` (FR-33)

**Given** un navigateur supportant Web Share API niveau 2
**When** je tape "Partager le PDF"
**Then** `navigator.share({ files: [...] })` ouvre la feuille de partage OS avec le PDF en pièce jointe (WhatsApp, email...)

**Given** un navigateur sans Web Share fichiers
**When** je tape partager
**Then** le PDF est téléchargé + message guidé selon la plateforme ("PDF enregistré — joignez-le depuis WhatsApp/votre email") ; pas de `mailto:` avec pièce jointe

### Story 4.5: Enregistrement de l'accord client (FR-30)

As a commercial,
I want enregistrer l'accord du client après réception de sa signature,
So that le devis passe au statut "Accepté" et alimente les métriques.

**Acceptance Criteria:**

**Given** un devis au statut **Envoyé** (ayant donc franchi Brouillon → Validé → Envoyé) et le bottom sheet de statut sur l'aperçu
**When** j'enregistre l'accord (nom, fonction, date modifiables ; upload scan signature en référence fichier)
**Then** la date d'accord ≤ jour +7 jours, et **seule la transition Envoyé → Accepté** est appliquée via le sheet de cycle de vie (FR-30, FR-15)
**And** l'enregistrement de l'accord est **impossible si le devis n'est pas au statut Envoyé** (Brouillon → Accepté interdit : contournerait la validation complète de Story 3.9)
**And** la transition est loguée (réutilise Story 3.9) et le devis Accepté compte vers le total devisé (Epic 5)

---

## Epic 5: Tableau de bord

Permettre à un gérant/commercial de visualiser son activité via des agrégats calculés localement. Couvre FR-40, FR-41, FR-42 + UX-DR6 + NFR offline.

### Story 5.1: Vue synthétique de l'activité (FR-40)

As a gérant,
I want voir les compteurs de devis par statut sur une période,
So that je saisis l'état de mon activité d'un coup d'œil.

**Acceptance Criteria:**

**Given** le Dashboard `/` (hero card navy, UX-DR6)
**When** je le consulte
**Then** les compteurs par statut (total, brouillons, envoyés, acceptés, expirés) s'affichent en temps réel via agrégats Dexie locaux (FR-40)
**And** un filtre par période (7j, 30j, 90j, tout) ajuste les compteurs
**And** le chargement est < 2 secondes offline (NFR) et se rafraîchit automatiquement

### Story 5.2: Liste des devis récents (FR-41)

As a commercial,
I want voir mes devis les plus récents sur le tableau de bord,
So that j'accède rapidement à mon travail en cours.

**Acceptance Criteria:**

**Given** le Dashboard
**When** la section "Devis récents" se rend
**Then** les 10 derniers devis s'affichent (colonnes numéro, client, date, statut, montant) (FR-41)
**And** un tap sur une ligne ouvre le devis, "Voir tout" mène à la liste `/devis`

### Story 5.3: Métriques de montants (FR-42)

As a gérant,
I want voir le total des montants devisés sur la période,
So that je mesure la valeur commerciale en cours.

**Acceptance Criteria:**

**Given** le hero card du Dashboard
**When** je consulte la métrique montant
**Then** la somme des devis "Acceptés" et "Envoyés" s'affiche en FCFA (séparateur milliers, Spectral `tabular-nums`), Brouillons et Annulés exclus (FR-42)
**And** elle suit la période sélectionnée (réutilise Story 5.1)

---

## Epic 6: Durcissement v1 `[MVP-1]`

Durcir la v1 après le ship MVP-0 via le seam de chiffrement, les quotas, l'audit immutable, le Background Sync, le CRUD des routes et le backup/PITR géo-répliqué. Palier de livraison distinct. Couvre FR-NEW-ROUTES + NFR-S4, quotas §12, O1, backup/PITR §15.4.

### Story 6.1: Chiffrement de l'IndexedDB au repos (NFR-S4)

As a responsable sécurité,
I want que les données locales sensibles soient chiffrées au repos,
So that les PII, montants et données commerciales sont protégés sur l'appareil.

**Acceptance Criteria:**

**Given** le seam `LocalCrypto` (no-op en MVP-0)
**When** j'active le chiffrement MVP-1
**Then** AES-GCM via Web Crypto chiffre PII (noms, emails, téléphones), financier (montants) et commercial (clauses, paramètres), clé dérivée du mot de passe (PBKDF2 100k iterations, salt unique) (S4)
**And** le cache n'est déchiffré en mémoire que pendant la session active

**Given** un reset de mot de passe (la clé PBKDF2 change)
**When** l'utilisateur réinitialise
**Then** le store local est purgé et re-syncé depuis le serveur (gap résolu, Architecture §Gap Analysis)

**Given** FlexSearch sur PII chiffrées
**When** la session se déverrouille
**Then** l'index plaintext in-memory est reconstruit au déverrouillage (gap résolu)

### Story 6.2: Enforcement des quotas par tier (Monetization §12)

As a opérateur de la plateforme,
I want que les quotas par tier soient appliqués avant les mutations,
So that l'usage reste conforme à l'abonnement avec une période de grâce.

**Acceptance Criteria:**

**Given** la matrice de quotas par tier (Starter/Pro/Entreprise)
**When** un utilisateur crée un devis ou ajoute un utilisateur
**Then** un hook pré-mutation vérifie le quota restant ; si dépassé → blocage + proposition d'upgrade (§12)
**And** une notification est envoyée à 80% du quota (email + in-app)

**Given** un dépassement de quota
**When** la période de grâce de 7 jours expire
**Then** le compte passe en mode lecture seule

### Story 6.3: Audit trail immutable & export (NFR-O1)

As a responsable conformité,
I want un journal d'audit append-only immutable et exportable,
So that je dispose d'une piste fiable pour la conformité (rétention 7 ans).

**Acceptance Criteria:**

**Given** l'event log basique de MVP-0
**When** je le durcis en MVP-1
**Then** chaque entrée (who/what/when/where/entity/before/after) est immutable une fois écrite, syncée serveur comme source de vérité (O1)
**And** l'export JSON/CSV est disponible pour conformité
**And** les actions tracées couvrent création, modification champ, transition statut, génération PDF, suppression, login/logout, conflit résolu

### Story 6.4: Background Sync API (FR-37 durci)

As a commercial,
I want que la synchronisation reprenne en arrière-plan même hors session active,
So that mes données partent dès le retour du réseau sans action de ma part.

**Acceptance Criteria:**

**Given** la queue offline (FR-37, MVP-0 = sync en session active)
**When** j'active la Background Sync API MVP-1
**Then** le Service Worker rejoue la queue au retour réseau même app fermée
**And** le comportement reste idempotent (réutilise les opId de Story 2.1)

### Story 6.5: CRUD des modèles de routes/corridors (FR-NEW-ROUTES)

As a commercial (tier Pro),
I want créer et gérer des modèles de routes/corridors avec tarifs prédéfinis,
So that j'applique un corridor tarifé en un geste au lieu des presets figés.

**Acceptance Criteria:**

**Given** la page `/parametres/modeles` (gaté tier Pro, §12)
**When** je gère les modèles de routes
**Then** CRUD complet : départ/arrivée, distance, tarif prédéfini (FR-NEW-ROUTES)
**And** un modèle s'applique au devis (remplace les presets codés en dur de Story 3.2)
**And** les modèles sont syncés et disponibles offline

### Story 6.6: Backup & PITR géo-répliqué (§15.4)

As a responsable de la fiabilité,
I want des sauvegardes continues géo-répliquées avec recovery point-in-time,
So que je puisse reprendre le service après incident avec une perte de données minimale (RTO <4h, RPO <1h).

**Acceptance Criteria:**

**Given** PostgreSQL managed (Neon)
**When** le backup PITR est activé
**Then** backup quotidien complet + WAL streaming continu (PITR), rétention 30 jours (daily) + 12 mensuels (archive long-terme) (§15.4)
**And** les backups sont géo-répliqués (minimum 2 zones)

**Given** l'exigence de vérifiabilité
**When** le restore test s'exécute
**Then** un restore test hebdomadaire tourne sur environnement staging avec alerte si échec

**Given** un incident
**When** je dois reprendre le service
**Then** RTO < 4 heures (reprise service), RPO < 1 heure (PITR continu, §15.4)
**And** le scope couvre DB (PostgreSQL) + Blob storage (logos, signatures) + config app
**And** la "device loss recovery" permet à un utilisateur d'exporter ses données + re-importer sur un nouvel appareil
