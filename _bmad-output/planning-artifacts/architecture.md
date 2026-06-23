---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-21'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-quotation-2026-06-21/prd.md
  - _bmad-output/planning-artifacts/prds/prd-quotation-2026-06-21/review-prd-adversarial.md
  - _bmad-output/planning-artifacts/ux-designs/ux-quotation-2026-06-21/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-quotation-2026-06-21/EXPERIENCE.md
  - _bmad-output/project-context.md
  - docs/cahier-des-charges-mvp-quotation-logistique.md
workflowType: 'architecture'
project_name: 'quotation'
user_name: 'Maiga Tech Lab'
date: '2026-06-21'
---

# Architecture Decision Document — Quotation Logistique

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
42 FR across 11 modules. Architecturally they cluster into:
- **Identity & access** (FR-1–4): email/password auth, ownership-based RBAC (Admin/Commercial/Opérateur), permission matrix enforced client + server (HTTP 403), password reset.
- **Core CRUD + lifecycle** (FR-5–16, 21–28): company settings, clients (frozen snapshot onto quote), quotes with auto-numbering and status state machine (Brouillon→Validé→Envoyé→Accepté/Expiré/Annulé), prestations lines, clause library.
- **Deterministic business calc** (FR-19–20, 23): `nombre_camions = ceil(tonnage/capacité)`, `valeur = tonnage×prix×taux`, `total = Σ lignes`. 2-dp financial rounding, shared Zod schema, server authoritative.
- **Client-side PDF** (FR-31–34): jsPDF + html2canvas, A4, offline-capable, lazy-loaded.
- **Offline-first / PWA** (FR-35–39, 37a): IndexedDB store, FIFO sync queue, LWW conflict resolution arbitrated by server clock, TEMP→DEV numbering, service worker strategy split by resource type.
- **Dashboard** (FR-40–42): locally-computed aggregates.

**Non-Functional Requirements:**
- **Performance (Sahel 2G/Edge):** FCP <5s/2G, TTI <8s/2G, bundle <300KB gzip initial, lazy routes + PDF lib, delta sync <30s. Drives bundle discipline, code splitting, progressive enhancement.
- **Security:** IndexedDB encrypted at rest AES-GCM (key from PBKDF2 of password) — MVP-1; rate limiting; JWT 7-day session governing offline access; shared Zod validation, server source of truth; remote wipe.
- **Reliability/Data governance:** sync failure <1%, RPO <1h (PITR), RTO <4h, 7-year retention (quotes/clients/audit), API versioning `/api/v1/`, schema migration compatibility checks.
- **Observability:** append-only audit event log per entity (who/what/when/where/before/after), Sentry, `/api/health`.
- **Accessibility:** WCAG 2.1 AA, keyboard nav, ARIA, live regions for live calc.
- **i18n:** next-intl, locale `fr-NE`, extensible `fr-ML`/`fr-BF`, Intl formats, `countryConfig` structure.

**Scale & Complexity:**
- Primary domain: **full-stack PWA** (Next.js 16 App Router + React 19 + PostgreSQL/Drizzle + Better Auth)
- Complexity level: **high** — driven by offline-first conflict-resolving sync, not by feature count
- Estimated architectural components: ~11 feature modules + cross-cutting (local store/sync engine, calc engine, PDF engine, auth/RBAC, audit log, i18n, quota)

### Technical Constraints & Dependencies

- **Fixed stack** (project-context): Next.js 16.1.6, React 19.2.4, TS 5.9.3 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Tailwind v4 CSS-first, shadcn/ui new-york, Drizzle 0.44, Better Auth 1.6, Postgres.
- **DB workflow:** `db:generate` + `db:migrate` only, never `db:push` in prod. Custom tables `uuid()`, Better Auth tables `text` IDs.
- **Phasing (MVP-0/MVP-1/v2):** ship vertical first (unencrypted IndexedDB, FIFO queue, LWW); MVP-1 hardens (encryption, quota enforcement, immutable audit, PITR, Background Sync, route CRUD); v2 adds field-level merge, multi-tenant, multi-country, e-signature.
- **Extension seams required at MVP-0:** pluggable encryption interface on local store, quota hook before mutation, event log present (even if not yet immutable), `pays` field present.
- **External deps:** SMTP (password reset), Blob storage (logos/signatures). v2: Mobile Money, FX API, e-signature.

### Cross-Cutting Concerns Identified

- **Offline sync engine** — local store, queue, conflict detection (entity-level revision), LWW, optimistic UI reconciliation, idempotent ops. Touches every data surface.
- **RBAC / permissions** — enforced both client (hide actions) and server (403), ownership model.
- **Audit event log** — every mutation/transition/login tracked; append-only, synced server-side.
- **Encryption at rest** — classification (PII/financial/commercial), pluggable seam from MVP-0.
- **Quota enforcement** — pre-mutation hook, tier matrix, grace period.
- **i18n + locale formatting** — externalized strings, Intl-based money/date.
- **Error handling** — transient vs permanent, retry with backoff, French user messages, error boundaries.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack PWA (offline-first) — Next.js 16 App Router + React 19 + PostgreSQL/Drizzle + Better Auth.

### Starter Options Considered

The project is already scaffolded and committed from `create-agentic-app`
(`agentic-coding-starter-kit` v1.1.2). The stack it provides matches the locked
stack in `project-context.md` exactly, so no alternative starter was evaluated —
the decision is to **keep the existing scaffold** and add the libraries the PWA /
offline / PDF / i18n requirements need on top.

### Selected Starter: agentic-coding-starter-kit (existing, retained)

**Rationale for Selection:**
Already initialized, matches mandated stack (project-context), provides auth + DB +
UI system + validation + blob storage out of the box. Re-scaffolding would discard
committed setup with no benefit.

**Initialization Command:**

```bash
# Already executed — repo exists. New machines:
pnpm install
cp env.example .env   # set POSTGRES_URL, BETTER_AUTH_SECRET, NEXT_PUBLIC_APP_URL
docker compose up -d
pnpm db:migrate
pnpm dev
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:** Next.js 16.1.6 App Router (Turbopack), React 19.2.4, TypeScript 5.9.3 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

**Styling Solution:** Tailwind v4 CSS-first (`@theme inline` in globals.css), shadcn/ui new-york + neutral base, Lucide icons, sonner toasts.

**Data & Auth:** Drizzle ORM 0.44 + PostgreSQL (pg/postgres), Better Auth 1.6 (email/password), `@vercel/blob` for file storage, Zod 4 for validation.

**Build/Tooling:** ESLint 9 + eslint-config-next, Prettier + prettier-plugin-tailwindcss, drizzle-kit (`db:generate`/`db:migrate`).

**Code Organization:** `src/app` (routes), `src/components/ui` (shadcn), `src/components`, `src/lib` (auth, db, schema, storage, utils), `src/hooks`. `@/` alias.

**Development Experience:** Turbopack dev server, Docker Compose Postgres, `pnpm check` (lint+typecheck).

### Additive Libraries Required (init story — versions pinned at install)

Not provided by the starter; mandated by PRD/UX:
- **Serwist** — service worker / PWA manifest / install + update (FR-35/38/39).
- **Dexie** — IndexedDB local store with a pluggable encryption seam (FR-36, S4).
- **jsPDF + html2canvas** — client-side PDF, lazy-loaded (FR-31–34, C6).
- **next-intl** — i18n, locale `fr-NE` extensible AES (I1).
- **FlexSearch** — offline full-text client search (FR-9 / M6).
- **next/font/local** with **Spectral + Hanken Grotesk** self-hosted, replacing Geist (DESIGN.md).
- **Sentry** — client/server error reporting (O2).
- **Vitest + Playwright + axe-core** — unit/e2e + a11y in CI (A6, P9); no test framework present.

**Note:** Project initialization is already done; the FIRST implementation story is
adding the additive libraries above + PWA/service-worker scaffolding + self-hosted
fonts + the Tailwind token mapping from DESIGN.md.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Offline local store + sync model (Dexie + outbox + LWW)
- Money representation (integer FCFA, no float)
- Shared calc engine (pure TS, server-authoritative)
- API style + sync protocol (REST `/api/v1/` + push/pull endpoints)
- RBAC double enforcement (server guard + UI gating)

**Important Decisions (Shape Architecture):**
- Pluggable encryption seam (no-op MVP-0 → AES-GCM MVP-1)
- Frontend state (local-first Dexie liveQuery + Zustand + react-hook-form)
- Client-side PDF (jsPDF + html2canvas, lazy)
- Managed Postgres with PITR (Neon) + Vercel hosting + GitHub Actions CI

**Deferred Decisions (Post-MVP):**
- Field-level merge / version vectors (v2) — LWW only in MVP
- Multi-tenant data partitioning (v2) — single company per instance, but `companyId`/`pays` columns present from MVP-0
- FX rate API (v2) — manual rate entry MVP
- Background Sync API (MVP-1) — sync on reconnect during active session MVP-0

### Data Architecture

- **Server store:** PostgreSQL + Drizzle ORM (starter). Custom tables `uuid()` PKs, Better Auth tables keep `text` IDs. `db:generate` + `db:migrate` only.
- **Client store:** Dexie (IndexedDB) as the local-first source of truth. UI reads via `liveQuery`; network sync is background. Dexie tables mirror the synced entities (clients, quotes, quote lines, clauses, templates, settings, outbox, audit log).
- **Shared types:** entity TypeScript types shared between Drizzle schema and Dexie tables to keep both stores in lockstep.
- **Sync identity:** every synced entity carries `id` (UUIDv7, client-generated so offline creates need no server round-trip), `revision` (monotonic integer), `updatedAt` (server clock on sync). Quote *number* is separate: `TEMP-{DEVICE}-{SEQ}` offline → `DEV-{YYYY}-{XXXX}` server-assigned on sync (FR-13).
- **Conflict model:** entity-level Last-Write-Wins arbitrated by server clock (FR-37a). Losing version archived, user notified. No field-level merge in MVP.
- **Client snapshot:** client data frozen onto the quote at creation (FR-10) so later client edits don't mutate historical quotes.
- **Validation:** Zod schemas shared client/server; server is authoritative and re-validates on sync (S5/H3).
- **Money:** FCFA/XOF stored as **integers** (XOF has no minor unit). Foreign-currency amounts entered with decimals, converted to integer FCFA via `taux_change`. A central `money.ts` owns formatting (`Intl.NumberFormat('fr-FR')`) and explicit financial rounding. No floating-point arithmetic on monetary values.
- **Calc engine:** pure deterministic TS module `src/lib/calc/` (camions `ceil(tonnage/capacité)`, valeur marchandise, line/grand totals) with guards (division-by-zero, min/max bounds). Unit-tested; reused on client (live UI) and server (authoritative re-check).

### Authentication & Security

- **Auth:** Better Auth email/password (starter), 7-day session governing offline access (FR-1/S3). On reconnect: refresh token + server-side revocation check; revoked → session terminated + local purge.
- **Authorization:** ownership-based RBAC (Admin/Commercial/Opérateur). A shared permission util encodes the FR-3 matrix. **Double enforcement:** server route guards return 403; client hides unauthorized actions.
- **Offline encryption seam:** `LocalCrypto` interface wrapping Dexie reads/writes. MVP-0 = passthrough (no-op). MVP-1 = AES-GCM via Web Crypto, key derived PBKDF2 (100k iters, unique salt) from password; PII/financial/commercial fields classified for encryption (S4). Decrypted in memory only during active session.
- **Rate limiting:** server-side per FR-S6 (auth 10/min/IP, login lockout after 5, quote create 60/min/user, reset 3/hr/email).
- **Remote wipe:** admin-triggered local data purge (S7).
- **Transport:** HTTPS enforced in production (S2).

### API & Communication Patterns

- **Style:** Next.js Route Handlers, REST, versioned under `/api/v1/` (H4). Server Actions reserved for purely-online interactions; all syncable mutations go through REST so the offline outbox can replay them.
- **Sync endpoints:** `POST /api/v1/sync/push` (idempotent batch of queued ops, keyed by operation id) and `GET /api/v1/sync/pull?since={cursor}` (delta pull). Idempotency keys prevent double-application on retry.
- **Outbox:** persisted FIFO queue in Dexie; retry with exponential backoff (max 5, FR-37). Sync triggered on reconnect during active session (Background Sync deferred to MVP-1).
- **Error contract:** typed responses; errors categorized transient vs permanent (E1). User-facing messages in French, technical logged. React error boundaries per section (E6).
- **Health:** `GET /api/v1/health` → DB, storage, sync status (O4).

### Frontend Architecture

- **Local-first state:** Dexie `liveQuery` + React hooks are the read source of truth; components don't fetch from network directly. Background sync reconciles. Optimistic by construction.
- **Ephemeral UI state:** Zustand (wizard step, filters, sheet open). No TanStack Query (local store is the source of truth, not server cache).
- **Forms:** react-hook-form + `@hookform/resolvers` Zod resolver; inline `setError` French messages.
- **Routing:** App Router, route groups; 7 routes per EXPERIENCE.md (`/login`, `/`, `/devis`, `/devis/nouveau`, `/devis/[id]`, `/clients`, `/clients/nouveau`, `/parametres`). Bottom nav + FAB; nav hidden on login/wizard/new-client/preview.
- **PDF:** jsPDF + html2canvas, dynamically imported (lazy) so it never hits first load (P7/P8). HTML/CSS template rendered then captured; ≤2% layout tolerance vs mockup; A4 portrait (FR-31/34, C6).
- **Performance:** bundle <300KB gzip initial, route + PDF lazy-loading, self-hosted fonts (Spectral/Hanken), progressive enhancement so quote creation works before heavy assets load (P1–P9).
- **i18n:** next-intl, all UI strings externalized, locale `fr-NE`, `countryConfig` structure extensible to `fr-ML`/`fr-BF` (I1–I5).

### Infrastructure & Deployment

- **Hosting:** Vercel (Next.js 16 native, Fluid Compute for route handlers).
- **Database:** managed PostgreSQL with PITR — **Neon** recommended (branching + point-in-time recovery aligns with RPO <1h, §15.4). Backup daily + WAL streaming, geo-replicated, weekly restore test.
- **Storage:** `@vercel/blob` for company logos and signature scans (public/private as needed).
- **CI/CD:** GitHub Actions — `pnpm lint` → `typecheck` → Vitest (unit, calc engine) → Playwright e2e + axe-core a11y → build. PR previews on Vercel.
- **Observability:** Sentry (client + server, PII-scrubbed, O2), self-hosted usage analytics (O3), `/api/v1/health` for monitoring (O4).
- **Audit log:** append-only event log table (server) + Dexie mirror; every mutation/transition/login recorded (who/what/when/where/before/after). Basic in MVP-0, immutable + exportable in MVP-1 (O1).

### Decision Impact Analysis

**Implementation Sequence:**
1. Init story: additive libs (Serwist, Dexie, jsPDF/html2canvas, next-intl, FlexSearch, Sentry, Vitest/Playwright/axe), self-hosted fonts, DESIGN.md token mapping in globals.css.
2. Shared foundations: types, Zod schemas, `money.ts`, `calc/` engine (with unit tests), permission util.
3. Data layer: Drizzle schema (with `companyId`/`pays`/`revision`/`updatedAt`), Dexie schema + `LocalCrypto` seam (no-op), outbox.
4. Auth + RBAC guards.
5. Sync engine (push/pull, idempotency, LWW, conflict archive).
6. Feature modules on top (settings → clients → quotes → calc surfaces → prestations → clauses → PDF → dashboard).
7. PWA shell (service worker strategy by resource type, manifest, install/update).

**Cross-Component Dependencies:**
- Sync engine depends on entity revision/updatedAt contract → must land before any syncable feature.
- `calc/` + `money.ts` underpin quotes, prestations, dashboard → foundational.
- `LocalCrypto` seam must exist before Dexie writes ship, even as no-op, to avoid MVP-1 rewrite.
- Permission util consumed by both server guards and UI → shared from the start.
- Audit log hooks into every mutation path → wire into the data layer, not per-feature.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** ~10 areas. Naming/structure largely already
fixed by `project-context.md`; this section pins the app-specific patterns most likely
to diverge between agents: API/sync envelopes, offline op shape, money handling, audit
events, calc invocation, RBAC checks.

### Naming Patterns

**Database (Drizzle/Postgres) — from project-context:**
- Tables: English, **lowercase singular** (`quote`, `quote_line`, `client`, `company`, `clause`, `audit_event`). Better Auth tables unchanged (`user`, `session`).
- Columns: **snake_case** (`created_at`, `company_id`, `unit_price`).
- Custom PKs: `uuid()`; Better Auth PKs: `text`. FKs: `references(() => table.id, { onDelete: "cascade" })`.
- Sync columns on every syncable table: `revision` (integer), `updated_at` (server clock), plus `company_id` and `pays` (extension seams).
- Enum values: English lowercase (`draft`, `validated`, `sent`, `accepted`, `expired`, `cancelled`).
- Indexes: `idx_{table}_{column}` (e.g. `idx_quote_company_id`).

**API:**
- Endpoints: REST, **plural nouns**, kebab where multiword, versioned: `/api/v1/quotes`, `/api/v1/quote-lines`, `/api/v1/clients`, `/api/v1/sync/push`.
- Route params: App Router `[id]` folders; ids are UUIDv7 strings.
- Query params: **camelCase** (`?since=`, `?companyId=`, `?status=`).
- JSON bodies/responses: **camelCase** field names (mapped from snake_case DB at the boundary).

**Code — from project-context:**
- Files: **kebab-case** (`quote-wizard.tsx`, `sync-engine.ts`, `money.ts`).
- Components: PascalCase (`QuoteWizard`); functions/vars: camelCase (`computeCamions`); constants: UPPER_SNAKE (`MAX_TONNAGE`); hooks: `use` prefix (`useLiveQuotes`).
- `"use client"` first line, double quotes, `@/` alias, semicolons, 100-col.

### Structure Patterns

**Project Organization:**
- Routes/layouts: `src/app/` (route groups `(group)/` for shared layouts without URL impact).
- API: `src/app/api/v1/**/route.ts`, named exports `GET`/`POST`/etc.
- shadcn primitives: `src/components/ui/`; feature components: `src/components/{feature}/`.
- Domain logic in `src/lib/`: `calc/`, `money.ts`, `db.ts` (Drizzle), `local-db.ts` (Dexie), `sync/`, `crypto/` (LocalCrypto seam), `permissions.ts`, `schema.ts` (Drizzle), `validation/` (shared Zod), `audit.ts`.
- Hooks in `src/hooks/` (`use-live-quotes.ts`, `use-sync-status.ts`).
- i18n messages in `src/messages/{locale}.json`.

**File Structure:**
- Tests **co-located** `*.test.ts(x)` for units (calc, money, permissions); Playwright e2e in `e2e/`.
- Self-hosted fonts in `src/app/fonts/`; PWA assets/manifest in `public/`.
- Env: `.env` from `env.example`; never commit secrets.

### Format Patterns

**API Response Formats:**
- Success: **direct resource** (no `{data}` wrapper) — `200` object, `201` created, `204` no content.
- Error: single shape `{ "error": { "code": string, "message": string, "fields"?: Record<string,string> } }`. `code` machine-readable (`VALIDATION_FAILED`, `FORBIDDEN`, `QUOTA_EXCEEDED`, `CONFLICT`), `message` French user-facing, `fields` for form errors.
- Status codes: 400 validation, 401 unauth, 403 RBAC, 409 sync conflict, 422 business-rule, 429 rate limit.
- Dates: **ISO 8601 UTC strings** in JSON. UI formats via `Intl` (`fr-FR`/`fr-NE`).
- Money: integer FCFA in JSON (no decimals); formatting only at render via `money.ts`.

**Offline operation (outbox entry) — single shape:**
```ts
type SyncOp = {
  opId: string;        // UUIDv7, idempotency key
  entity: "client" | "quote" | "quoteLine" | "clause" | "company" | "template";
  entityId: string;    // UUIDv7
  type: "create" | "update" | "delete";
  payload: unknown;    // validated against shared Zod schema
  baseRevision: number;// revision the client edited from (conflict detection)
  queuedAt: string;    // ISO UTC
};
```

**Audit event — single shape (O1):**
```ts
type AuditEvent = {
  who: string; what: string; when: string; // ISO UTC
  where: string; // device/IP
  entity: { type: string; id: string };
  before?: unknown; after?: unknown;
};
```

### Communication Patterns

**Event/action naming:** sync ops use `entity.type` verbs already above; status transitions logged as `quote.status_changed`. No ad-hoc event names.

**State Management:**
- Reads: Dexie `liveQuery` via hooks (`useLiveQuotes`) — **never fetch from network in components**.
- Mutations: write to Dexie + enqueue `SyncOp` atomically (one helper `applyLocalMutation`), never write Dexie without enqueuing.
- Immutable updates only; Zustand for ephemeral UI (`useWizardStore`, `useFilterStore`).
- Optimistic by default; reconcile on sync; `TEMP-` quote number until server assigns `DEV-`.

### Process Patterns

**Calc & money:**
- All monetary math through `money.ts` (integer FCFA); **never** inline float arithmetic.
- All quote calculations through `src/lib/calc/` functions; **never** recompute totals inline in a component. Server re-runs the same functions on sync (authoritative).

**RBAC:**
- Every API route handler calls `requirePermission(session, action, resource)` before mutating → 403 on fail.
- UI gates with the same `can(role, action)` util; hidden ≠ unprotected (server still enforces).

**Error handling:**
- Categorize transient vs permanent (`E1`). Transient → retry with exponential backoff (max 5). Permanent → surface French message via `setError`/toast.
- User messages French; technical details logged to Sentry (PII-scrubbed). React error boundary per route section.

**Loading states:** boolean `isPending`/`isLoading`; skeleton rows for lists/dashboard; inline spinner on submit; persistent offline banner when offline or pending ops.

### Enforcement Guidelines

**All AI Agents MUST:**
- Map snake_case DB ↔ camelCase JSON/TS at the API boundary; never leak snake_case into TS types.
- Store and transmit money as integer FCFA; format only at render.
- Route every local write through `applyLocalMutation` (Dexie write + outbox enqueue together).
- Run business math only via `calc/` and `money.ts`; never duplicate formulas.
- Enforce permissions server-side on every mutating route, regardless of UI gating.
- Use the single error envelope and the `SyncOp`/`AuditEvent` shapes verbatim.
- Externalize all UI strings to `src/messages/` (no hardcoded French in components).

**Pattern Enforcement:** ESLint + `pnpm check` in CI; unit tests guard calc/money/permissions; PR review checks envelope/shape adherence. New patterns appended here + to `project-context.md`.

### Pattern Examples

**Good:**
- `POST /api/v1/quotes` → `201 { id, number, totalFcfa, ... }` (camelCase, integer money).
- `requirePermission(session, "quote.create", quote)` then mutate.
- `applyLocalMutation({ entity: "quote", type: "create", payload, baseRevision: 0 })`.

**Anti-patterns:**
- `{ data: {...}, error: null }` wrapper — not used.
- `amount: 1500.00` float money — forbidden; use integer `1500`.
- Component computing `prixUnitaire * quantite` inline — must call `calc`.
- Writing Dexie without enqueuing a `SyncOp` — breaks sync.
- snake_case in a JSON response or TS type — boundary must map.

## Project Structure & Boundaries

### Complete Project Directory Structure

```
quotation/
├── .github/workflows/ci.yml          # lint→typecheck→vitest→playwright+axe→build
├── docker-compose.yml                # local Postgres (existing)
├── drizzle.config.ts                 # (existing)
├── drizzle/                          # generated migrations (db:generate)
├── next.config.ts                    # + Serwist PWA wiring
├── components.json                   # shadcn (existing)
├── env.example                       # + NEON_/SENTRY_/SMTP_ keys
├── e2e/                              # Playwright specs
│   ├── quote-create.spec.ts
│   ├── offline-sync.spec.ts
│   └── a11y.spec.ts                  # axe-core
├── public/
│   ├── icons/                        # PWA install icons
│   ├── sw.js                         # Serwist service worker (generated)
│   └── logo-mark.svg, logo-full.svg  # product identity (DESIGN.md)
├── src/
│   ├── app/
│   │   ├── globals.css               # Tailwind v4 @theme — DESIGN.md tokens
│   │   ├── layout.tsx                # fonts (Spectral/Hanken), i18n provider, SW register
│   │   ├── manifest.ts               # PWA manifest (existing — extend)
│   │   ├── error.tsx, not-found.tsx  # (existing)
│   │   ├── (auth)/                    # login, forgot-password, reset-password (existing)
│   │   ├── (app)/                     # authenticated shell + bottom nav
│   │   │   ├── layout.tsx             # bottom nav + FAB + offline banner
│   │   │   ├── page.tsx               # / Dashboard (FR-40–42)
│   │   │   ├── devis/
│   │   │   │   ├── page.tsx           # quote list (FR-16)
│   │   │   │   ├── nouveau/page.tsx   # 5-step wizard (FR-12, 17–28)
│   │   │   │   └── [id]/page.tsx      # PDF preview + status sheet (FR-29–33)
│   │   │   ├── clients/
│   │   │   │   ├── page.tsx           # list + search (FR-8/9)
│   │   │   │   └── nouveau/page.tsx   # new client (FR-8)
│   │   │   └── parametres/
│   │   │       ├── page.tsx           # company settings (FR-5–7)
│   │   │       ├── clauses/page.tsx   # clause library (FR-26)
│   │   │       ├── modeles/page.tsx   # line/route templates (FR-24)
│   │   │       └── utilisateurs/page.tsx # users & roles (FR-2)
│   │   └── api/
│   │       ├── auth/[...all]/route.ts # Better Auth (existing)
│   │       └── v1/
│   │           ├── health/route.ts
│   │           ├── clients/route.ts, clients/[id]/route.ts
│   │           ├── quotes/route.ts, quotes/[id]/route.ts
│   │           ├── companies/route.ts
│   │           ├── clauses/route.ts
│   │           ├── templates/route.ts
│   │           └── sync/push/route.ts, sync/pull/route.ts
│   ├── components/
│   │   ├── ui/                        # shadcn primitives (existing) re-skinned
│   │   ├── quote/                     # wizard steps, line editor, preview, status-sheet
│   │   ├── client/                    # client card, form, search
│   │   ├── pdf/                       # PDF template + render trigger
│   │   ├── dashboard/                 # hero card, counters, recent list
│   │   ├── settings/                  # company form, clause/template editors
│   │   └── shared/                    # offline-banner, sync-indicator, money-display
│   ├── lib/
│   │   ├── auth.ts, auth-client.ts, session.ts   # (existing)
│   │   ├── db.ts                      # Drizzle client (existing)
│   │   ├── schema.ts                  # Drizzle schema (extend: domain tables)
│   │   ├── local-db.ts               # Dexie definition (client store)
│   │   ├── storage.ts                # @vercel/blob (existing)
│   │   ├── utils.ts                  # cn() (existing)
│   │   ├── money.ts                  # integer FCFA + Intl formatting
│   │   ├── permissions.ts            # RBAC matrix: can() + requirePermission()
│   │   ├── audit.ts                  # AuditEvent emit helper
│   │   ├── country-config.ts         # i18n/locale/currency config (I4)
│   │   ├── calc/                     # pure deterministic engine
│   │   │   ├── camions.ts, valeur.ts, totaux.ts
│   │   │   └── *.test.ts             # co-located unit tests
│   │   ├── validation/               # shared Zod schemas (client+server)
│   │   │   ├── quote.ts, client.ts, company.ts, clause.ts
│   │   ├── crypto/                   # LocalCrypto seam (no-op MVP-0 → AES-GCM MVP-1)
│   │   │   └── local-crypto.ts
│   │   ├── sync/                     # offline sync engine
│   │   │   ├── outbox.ts             # apply-local-mutation + queue
│   │   │   ├── push.ts, pull.ts      # client side of sync endpoints
│   │   │   ├── conflict.ts           # LWW + archive losing version
│   │   │   └── numbering.ts          # TEMP-/DEV- quote numbers
│   │   └── api/                      # server helpers: envelope, error mapper, snake↔camel
│   ├── hooks/
│   │   ├── use-session.ts            # (Better Auth, existing pattern)
│   │   ├── use-live-quotes.ts        # Dexie liveQuery
│   │   ├── use-live-clients.ts
│   │   └── use-sync-status.ts        # online/offline + pending count
│   ├── stores/                       # Zustand ephemeral UI
│   │   ├── wizard-store.ts, filter-store.ts
│   ├── messages/                     # next-intl
│   │   └── fr-NE.json                # (fr-ML.json / fr-BF.json v2)
│   └── proxy.ts                      # (existing) → auth/route protection
└── _bmad-output/planning-artifacts/  # PRD, UX, architecture.md
```

### Architectural Boundaries

**API Boundaries:** all server access via `/api/v1/*` Route Handlers. Every mutating route: `requirePermission` → Zod re-validate → Drizzle write → emit `AuditEvent`. Boundary mapper in `lib/api/` converts snake_case DB ↔ camelCase JSON. Sync is the only batch boundary (`/sync/push|pull`).

**Component Boundaries:** components read **only** via Dexie hooks (`hooks/use-live-*`), never `fetch`. Mutations call `lib/sync/outbox.applyLocalMutation`. Ephemeral UI state in `stores/` (Zustand). Presentational components in `components/{feature}/`; shadcn primitives untouched except token re-skin.

**Service Boundaries:** business math isolated in `lib/calc/` + `lib/money.ts` (pure, no I/O), reused client + server. RBAC in `lib/permissions.ts`. Crypto behind `lib/crypto/local-crypto.ts` interface. Audit behind `lib/audit.ts`.

**Data Boundaries:** server schema in `lib/schema.ts` (Drizzle, snake_case, `uuid()` PKs, sync columns). Client schema in `lib/local-db.ts` (Dexie, mirrors synced entities + outbox + audit mirror). Blob (`storage.ts`) for logos/signatures. No direct DB access from components.

### Requirements to Structure Mapping

| Module / FR | Location |
|---|---|
| M1 Auth/RBAC (FR-1–4) | `app/(auth)/`, `lib/auth*.ts`, `lib/permissions.ts`, `app/api/v1/.../route.ts` guards |
| M2 Company settings (FR-5–7) | `app/(app)/parametres/page.tsx`, `components/settings/`, `api/v1/companies` |
| M3 Clients (FR-8–11) | `app/(app)/clients/**`, `components/client/`, `api/v1/clients`, FlexSearch in `use-live-clients` |
| M4 Quotes (FR-12–16) | `app/(app)/devis/**`, `components/quote/`, `api/v1/quotes`, `lib/sync/numbering.ts` |
| M5 Operational (FR-17–20) | wizard steps in `components/quote/`, `lib/calc/` |
| M6 Prestations (FR-21–24) | `components/quote/line-editor`, `lib/calc/totaux.ts`, templates |
| M7 Clauses (FR-25–28) | `parametres/clauses`, `components/settings/`, `api/v1/clauses` |
| M8 Client validation (FR-29–30) | `components/pdf/` signature block, status sheet |
| M9 PDF (FR-31–34) | `components/pdf/`, lazy jsPDF+html2canvas |
| M10 Offline/PWA (FR-35–39, 37a) | `lib/local-db.ts`, `lib/sync/`, `lib/crypto/`, `public/sw.js`, `next.config.ts` |
| M11 Dashboard (FR-40–42) | `app/(app)/page.tsx`, `components/dashboard/`, Dexie aggregates |

**Cross-Cutting Concerns:**
- Offline sync → `lib/sync/` + `hooks/use-sync-status.ts` + `components/shared/offline-banner`.
- Audit → `lib/audit.ts` invoked in every API mutation + status transition.
- i18n → `src/messages/` + `lib/country-config.ts` + provider in `layout.tsx`.
- Error handling → `lib/api/` error mapper + per-route `error.tsx` boundaries.
- Encryption → `lib/crypto/local-crypto.ts` wrapping all Dexie reads/writes.

### Integration Points

**Internal Communication:** UI → Dexie hooks (read) / `applyLocalMutation` (write) → outbox → `sync/push` → server route → Drizzle → `pull` delta back → Dexie. Calc/money imported directly by UI and server routes.

**External Integrations:** SMTP (password reset, Better Auth), `@vercel/blob` (logos/signatures), Sentry (errors). v2: Mobile Money, FX API, e-signature.

**Data Flow:** create offline → UUIDv7 + `TEMP-` number + Dexie write + outbox enqueue → reconnect → push (idempotent) → server validates + assigns `DEV-` + revision + `updated_at` → pull delta → Dexie reconciled → UI updates via liveQuery. Conflicts resolved LWW server-side, losing version archived + user notified.

### File Organization Patterns

**Configuration:** root (`next.config.ts`, `drizzle.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `tsconfig.json`); env in `.env` from `env.example`; CI in `.github/workflows/`.

**Source:** feature-grouped components, domain logic in `lib/`, hooks in `hooks/`, stores in `stores/`, routes in `app/`.

**Test:** unit co-located `*.test.ts` (calc, money, permissions, sync); e2e in `e2e/` (Playwright + axe).

**Assets:** PWA icons + SVG logos + generated `sw.js` in `public/`; self-hosted fonts in `app/fonts/` (or `app/layout.tsx` via `next/font/local`).

### Development Workflow Integration

**Dev:** `docker compose up -d` → `pnpm db:migrate` → `pnpm dev` (Turbopack). Service worker disabled in dev unless testing offline.

**Build:** `pnpm build` = `db:migrate` + `next build` (Serwist generates `sw.js`). `pnpm check` gates.

**Deploy:** Vercel (Next 16 native), Neon Postgres (PITR), `@vercel/blob`. PR previews; GitHub Actions CI before merge.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices are mutually compatible — the
stack is the proven `create-agentic-app` baseline (Next.js 16 / React 19 / Drizzle /
Better Auth / Tailwind v4 / shadcn), extended with additive libraries that don't
conflict (Dexie, Serwist, jsPDF, next-intl, FlexSearch, Sentry). No contradictory
decisions: local-first reads + REST sync + integer money + shared calc engine reinforce
each other.

**Pattern Consistency:** Patterns support the decisions — single `SyncOp` shape and
`applyLocalMutation` enforce the offline model; integer-FCFA + `money.ts` enforce the
money decision; `requirePermission` enforces RBAC on every mutating route; snake↔camel
boundary mapping keeps DB and JSON conventions clean. Naming is anchored in
`project-context.md`.

**Structure Alignment:** Project structure supports every decision — `lib/sync/`,
`lib/calc/`, `lib/crypto/`, `lib/permissions.ts` isolate cross-cutting concerns;
`(app)` route group matches EXPERIENCE.md IA; `api/v1/` matches versioning; component
read-via-hooks boundary is structurally enforced.

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:** All 42 FR mapped to concrete locations (see
Requirements to Structure Mapping). Lifecycle, calc, offline numbering, PDF, dashboard,
clauses, RBAC matrix all have a home.

**Non-Functional Requirements Coverage:** Performance (bundle budgets, route + PDF
lazy-loading, self-hosted fonts, progressive enhancement, SW by resource type),
Security (double RBAC, AES-GCM seam, rate limiting, 7-day session, remote wipe),
Reliability (Neon PITR, RPO<1h), Observability (Sentry, append-only audit, health),
Accessibility (axe-core in CI, ARIA/live-region patterns), i18n (next-intl, `fr-NE`,
`countryConfig`) — all architecturally addressed.

### Implementation Readiness Validation ✅

**Decision Completeness:** Critical decisions documented; exact library versions pinned
at the init story (no reliable offline web verification at authoring time).

**Structure Completeness:** Full directory tree defined with file-level intent and
FR mapping; boundaries and integration points specified.

**Pattern Completeness:** Conflict points (API envelope, sync op, audit event, money,
calc, RBAC, naming) all pinned with good/anti-pattern examples.

### Gap Analysis Results

**Critical Gaps:** None blocking MVP-0 implementation.

**Important Gaps (resolve at the right phase):**
- **FlexSearch ↔ encrypted IndexedDB (MVP-1):** full-text search over encrypted PII cannot index at rest. Resolution: in-memory plaintext index rebuilt on session unlock; specify in the MVP-1 encryption story.
- **Password reset invalidates local encryption key (MVP-1):** PBKDF2 key changes on reset → local encrypted data unreadable. Resolution: purge local store + re-sync from server after reset.
- **PDF fidelity on Safari iOS (C6 risk):** html2canvas rendering variance. Mitigation: ≤2% tolerance, cross-browser tests; server-side Puppeteer fallback deferred to v2.

**Nice-to-Have Gaps:**
- Pricing/monetization (PRD Open Question #1) undecided — no MVP-0 impact (quota enforcement is MVP-1; `companyId`/tier seams present).
- Distance/tariff fields for route templates (MVP-1 CRUD) — presets hardcoded in MVP-0.

### Validation Issues Addressed

The three important gaps above are scheduled to their correct delivery tier (MVP-1)
and seamed for in MVP-0 (pluggable crypto, server as source of truth enabling re-sync,
HTML template isolation for PDF). No rework of MVP-0 decisions required.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** high — all 16 checklist items documented, no critical gaps; the three important gaps are MVP-1-scoped and seamed in MVP-0.

**Key Strengths:**
- Offline-first risk concentrated behind a single sync engine + `applyLocalMutation` choke point.
- Business correctness (calc + money) isolated, pure, server-authoritative, unit-testable.
- Extension seams (crypto, quota hook, `companyId`/`pays`, audit log) present from MVP-0 → no MVP-1/v2 rewrite.
- Leverages an already-committed, proven starter; additive-only changes.

**Areas for Future Enhancement:**
- Field-level merge / version vectors for true concurrent collaboration (v2).
- Multi-tenant + multi-country activation (v2).
- Server-side PDF rendering if client fidelity proves insufficient (v2).
- FX rate API, e-signature, Mobile Money (v2).

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently; route all local writes through `applyLocalMutation`, all money through `money.ts`, all business math through `calc/`.
- Enforce permissions server-side on every mutating route.
- Refer to this document and `project-context.md` for all architectural questions.

**First Implementation Priority:**
Init story — add additive libraries (Serwist, Dexie, jsPDF/html2canvas, next-intl,
FlexSearch, Sentry, Vitest/Playwright/axe), self-host Spectral + Hanken fonts, map
DESIGN.md tokens into `globals.css`, scaffold the PWA service worker, then build the
shared foundations (`schema.ts` domain tables, `money.ts`, `calc/`, `permissions.ts`,
Dexie `local-db.ts` + `LocalCrypto` no-op seam, sync engine).
