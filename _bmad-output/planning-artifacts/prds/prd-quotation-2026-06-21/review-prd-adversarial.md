# Review adversarial — PRD Quotation Logistique

**Date :** 2026-06-21
**Reviewer :** deep-dive agent (adversarial review)
**PRD :** `prd.md`

---

## Executive Summary

**42 findings** détectés. PRD 60-70% ready pour dev. Foundations techniques (sync, sécurité, data integrity) nécessitent specification supplémentaire.

---

## Critical (6)

### C1 — Sync conflict resolution indéfini
**Location :** §4.10 (FR-37), §15.1
**Problem :** "Last-write-wins" insuffisant. Pas de stratégie detection conflits, UI résolution, garanties intégrité.
**Recommendation :** Optimistic concurrency + version vectors + field-level merge + conflict UI + audit trail.
**Impact :** Perte données, devis corrompus, litiges.

### C2 — Edge cases calculs absents
**Location :** §4.5 (FR-19, FR-20), §4.6 (FR-23)
**Problem :** Division zéro, valeurs négatives, max/min non définis, précision décimales.
**Recommendation :** Validation complète : MIN/MAX tonnage, capacité, prix, taux, lignes.
**Impact :** Calculs incorrects, pertes financières.

### C3 — Sécurité offline non spécifiée
**Location :** §4.10, §10.2 (S4), §15.3
**Problem :** IndexedDB non chiffré. Vol appareil = fuite données.
**Recommendation :** Encryption-at-rest (Web Crypto), key derivation (PBKDF2), session timeout, remote wipe.
**Impact :** Breach, privacy violations.

### C4 — Numérotation devis impossible avec offline
**Location :** §4.4 (FR-13)
**Problem :** Deux utilisateurs offline = même numéro. "Pas de trous" impossible.
**Recommendation :** Temporary numbers offline remplacés au sync OU user+device prefix OU accepter gaps.
**Impact :** Duplicats, problèmes comptables.

### C5 — Auth offline sans révocation
**Location :** §4.1 (FR-1), §10.2 (S1, S3)
**Problem :** Session 7j offline, pas de check révocation, replay attacks.
**Recommendation :** Token refresh au reconnect, forced reauth > X jours, encrypted credentials, biometric.
**Impact :** Accès non autorisé, account takeover.

### C6 — Architecture PDF indécidable
**Location :** §4.9 (FR-31, FR-33)
**Problem :** Client-side = inconsistant, server-side = viole offline.
**Recommendation :** Decision requise : client OU server OU hybrid.
**Impact :** Requirements impossibles.

---

## High (7)

### H1 — No Audit Trail Specification
**Problem :** "Actions critiques loggées" non défini. Pas de schema, rétention, immutability.
**Recommendation :** Append-only event log, immutable, syncé, exportable.

### H2 — Multi-User Collaboration Undefined
**Problem :** 3 rôles mais pas de locking, concurrent edits, ownership model.
**Recommendation :** Collaboration model, locking strategy, permission matrix, activity feed.

### H3 — Client/Server Validation Undefined
**Problem :** "Sanitization client et serveur" vague. Offline = client authoritative temporairement = trust boundary violation.
**Recommendation :** Shared validation schema (Zod), sync-time validation, error sync.

### H4 — Data Migration/Versioning Absent
**Problem :** Schema changes offline, version mismatch, no migration strategy.
**Recommendation :** API versioning, migration strategy, compatibility check, force upgrade.

### H5 — Rate Limiting/Anti-Abuse Absent
**Problem :** Pas de rate limit, quota, brute force protection.
**Recommendation :** Rate limits per endpoint, quota system, abuse detection, lockout.

### H6 — Backup/Recovery Underspecified
**Problem :** RTO/RPO sans détail scope, verification, recovery, device loss.
**Recommendation :** Backup scope, restore testing, user export, DR playbook.

### H7 — Monetization Not Linked to Features
**Problem :** Pricing tiers sans feature matrix, quota enforcement.
**Recommendation :** Feature matrix par tier, quota workflow.

---

## Medium (10) — Résumé

M1 Performance targets irréalistes Sahel | M2 i18n absent | M3 RBAC underspecified | M4 Error handling absent | M5 Mobile Money undefined | M6 Search/indexing strategy | M7 Historique undefined | M8 Logo storage | M9 Accessibility absent | M10 Data export

## Low (10) — Résumé

L1 Metrics inconsistentes | L2 Dark mode | L3 State transitions | L4 Email template | L5 Local storage fallback | L6 Language convention | L7 Font encoding | L8 Commercial assignment | L9 Date handling | L10 Version doc

## Consistency (3) — Résumé

Duplicate quote numbering conflict | Offline duration conflict | PDF template caching conflict

## Integration (3) — Résumé

Email provider undefined | Better Auth underspecified | Storage backend not chosen

## Architecture (3) — Résumé

"Instance" undefined | Service Worker strategy | Real-time undefined

---

## Recommendation

**Before dev :** Resolve C1-C6 + H1-H7
**During dev :** Technical design doc, data model, API contracts, conflict UI, error strategy
**Before launch :** Security audit, Sahel network testing, low-end Android testing, compliance review
