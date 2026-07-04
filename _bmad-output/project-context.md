---
project_name: 'quotation'
user_name: 'Maiga Tech Lab'
date: '2026-06-28'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'database_rules', 'offline_sync', 'crypto', 'quota', 'permissions', 'audit', 'pdf', 'testing', 'code_quality', 'language_convention', 'critical_rules']
existing_patterns_found: 28
status: 'complete'
rule_count: 112
optimized_for_llm: true
---

# Project Context for AI Agents

_Règles critiques que les agents IA doivent suivre pour implémenter du code dans ce projet. Focus sur les détails non-évidents._

---

## Technology Stack & Versions

**Core Framework:**
- Next.js 16.1.6 (App Router, Turbopack dev / Webpack prod)
- React 19.2.4
- TypeScript 5.9.3 (strict mode)

**Styling:**
- Tailwind CSS 4.3.0 (CSS-first via `@theme inline` in `globals.css`)
- shadcn/ui 3.8.5 (new-york style, neutral base)
- Lucide React 0.539.0 (icons only)
- Geist Sans + Geist Mono (fonts)

**Backend:**
- PostgreSQL + Drizzle ORM 0.44.7
- pg 8.20.0, postgres 3.4.9
- Better Auth 1.6.11 (email/password)

**Offline / Local DB:**
- Dexie 4.4.4 (IndexedDB ORM)
- Serwist 9.5.11 / @serwist/next 9.5.11 (Service Worker / PWA)
- FlexSearch 0.8.212 (offline full-text search)

**PDF Generation:**
- jsPDF 4.2.1 + html2canvas 1.4.1

**State / UI Extras:**
- Zustand 5.0.14 (client state)
- @dnd-kit/core + @dnd-kit/sortable (drag-and-drop for ordering)
- Sonner 2.0.7 (toast notifications)
- next-intl 4.13.0 (i18n — messages in `src/messages/fr-NE.json`)
- react-markdown 10.1.0

**Validation:**
- Zod 4.4.3 (API input validation)

**Storage / Observability:**
- @vercel/blob 2.3.3 (logo upload)
- @sentry/nextjs 10.59.0 (error monitoring)

**Testing:**
- Vitest 4.1.9 (unit + integration)
- @playwright/test 1.61.0 (E2E)
- fake-indexeddb 6.2.5 (Dexie unit tests)
- @axe-core/playwright (accessibility)

**AI (optional):**
- AI SDK 5.0.188 + @openrouter/ai-sdk-provider 1.5.4

**Package Manager:** pnpm (overrides: `@types/react 19.2.5`)

**Key Constraints:**
- TypeScript strict mode: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`
- Tailwind v4 CSS-first — no `tailwind.config.ts`, all tokens in `globals.css`
- `pnpm build` = `db:migrate && next build --webpack` (not Turbopack for prod)
- `pnpm check` = lint + typecheck + **vitest run** (tests included)

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

**TypeScript Strict Mode:**
- `noUncheckedIndexedAccess` — array access may return `undefined`, always guard
- `exactOptionalPropertyTypes` — `undefined` ≠ absent; use `prop?: T` not `prop: T | undefined`
- `noUnusedLocals` / `noUnusedParameters` — compiler error on unused symbols

**Import/Export:**
- Use `@/` alias for `src/*` imports
- Import order: React/Next → external packages → `@/*` internal → relative
- `"use client"` directive: first line, double quotes, no blank line before it

**Error Handling:**
- `catch { ... }` without unused error parameter (TS5 style)
- User-facing messages in French; technical errors logged only
- Form errors: `setError("message fr")` pattern

**Async Patterns:**
- `async/await` over `.then()` chains
- Explicitly type async return: `async function foo(): Promise<T>`

---

### Framework-Specific Rules (Next.js/React)

**App Router:**
- Route groups `(group)/` for shared layouts without URL impact
- Server Components by default — only `"use client"` when needed (hooks, browser APIs)
- API routes: `app/api/*/route.ts` with named exports (`GET`, `POST`, etc.)
- Navigation: `next/navigation` only (NOT `next/router`)

**React Hooks:**
- Session: `useSession()` from `@/lib/auth-client`
- Loading state: `const [isPending, setIsPending] = useState(false)`
- Router: `useRouter()` → `router.push()` + `router.refresh()` after auth changes

**i18n (next-intl):**
- All UI strings in `src/messages/fr-NE.json` — never hardcode French text in components
- Use `useTranslations("namespace")` in Client Components
- Use `getTranslations("namespace")` in Server Components / API routes
- Key pattern: `"module.section.key"` (e.g. `"parametres.audit.heading"`)

**Toast Notifications:**
- Use `sonner` toast: `import { toast } from "sonner"`
- Success: `toast.success(t("key"))`, Error: `toast.error(t("key"))`

**Drag-and-Drop (ordering):**
- Use `@dnd-kit/sortable` for any ordered list (templates, clauses, lines)
- Pattern: `DndContext` → `SortableContext` → `useSortable` per item

---

### Database Rules (Drizzle — PostgreSQL)

**Schema Definition:**
- All custom tables: `uuid()` for primary keys
- Better Auth tables: `text` IDs — do NOT change to UUID
- Define all tables in `src/lib/schema.ts`
- Indexes: always index `companyId`, `who`, `when`, `entityType/entityId` on new tables

**Migration Workflow (CRITICAL):**
1. Edit `src/lib/schema.ts`
2. `pnpm db:generate` → creates migration in `drizzle/`
3. `pnpm db:migrate` → applies to database
4. NEVER use `pnpm db:push` for production changes

**Timestamp Pattern:**
```typescript
createdAt: timestamp("created_at").defaultNow().notNull()
updatedAt: timestamp("updated_at").$onUpdate(() => new Date()).notNull()
```

**Foreign Keys:**
```typescript
userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" })
```

**Atomic Increments (Quota Pattern):**
```typescript
// Use SQL expression — NOT read-modify-write
set({ quotaUsedQuotes: sql`quota_used_quotes + 1` })
```

---

### Offline / Local DB Rules (Dexie)

**Architecture:** Dexie (IndexedDB) is the **client source of truth**. All UI reads/writes go to Dexie. Server sync happens via `/api/v1/sync/push` and `/api/v1/sync/pull`.

**LocalDatabase (`src/lib/local-db.ts`):**
```
Tables: clients, quotes, quoteLines, clauses, quoteClauses,
        templates, routeTemplates, company, syncQueue,
        auditMirror, quoteStatusLogs
```

**Dexie Version Rules (CRITICAL):**
- Versions are **cumulative and immutable** — NEVER modify an existing `.version(N)` block
- To add a table or index: add a new `.version(N+1).stores({...})` block only
- Current version: **5** (routeTemplates added in Story 6-5)

**pays Field:**
- Every local entity must have `pays: "NE"` (Niger, ISO 3166-1 alpha-2)
- Hardcoded for MVP-1 — do not make dynamic

**revision Field:**
- Every local entity has `revision: number` — server-assigned on sync
- New local records: `revision: 0`

**ID Generation:**
- Use `crypto.randomUUID()` for new local entity IDs
- Quote numbers: `generateTempNumber(getDeviceId(), getNextLocalSeq(deviceId))` → `TEMP-XXXX-0001`
- Server assigns permanent numbers: `DEV-YYYY-NNNN` format

**SyncOp Entities:**
```typescript
type SyncOpEntity = "client" | "quote" | "quoteLine" | "clause" | "company" | "template" | "routeTemplate"
```
- Max 100 ops per push batch
- Always include `baseRevision`, `queuedAt`, `createdBy`

**syncQueue Invariant:**
- `syncQueue` payloads must stay **plaintext** (not encrypted) — server reads them raw
- Do NOT apply encryption middleware to syncQueue entries

---

### At-Rest Encryption Rules (Story 6-1)

**Layer:** `installEncryptionLayer(db)` in `local-db.ts` wraps all Dexie read/writes transparently. Key loaded via `CryptoContext` (`src/lib/crypto/crypto-context.tsx`).

**Classified Fields** (`src/lib/crypto/field-classification.ts`):
```
clients:     companyName, contactName, phone, email, address, notes
company:     raisonSociale, adresse, phones, emails, signataireNom, signataireFonction
quotes:      totalFcfa, goodsValueFcfa, unitPrice, clientSnapshot
quoteLines:  designation, unitPrice, totalFcfa
clauses:     contenu
quoteClauses: contenu
```

**NOT encrypted (indexes must stay plaintext):**
- `id`, `status`, `clientId`, `companyId`, `ordre`, `revision`, date fields
- `syncQueue` payloads, `auditMirror`, `templates`, `routeTemplates`, `quoteStatusLogs`

**Rules:**
- Never bypass the encryption layer for classified tables
- When adding a new classified field: update `CLASSIFIED_FIELDS` in `field-classification.ts`
- `CryptoContext` provides `{ key, isReady }` — check `isReady` before heavy Dexie ops

---

### Quota System Rules (Story 6-2)

**Tiers:** `starter | pro | entreprise`
```
starter:    50 quotes/month, 1 user, no route templates
pro:        unlimited quotes, 3 users, route templates
entreprise: unlimited quotes, 10 users, route templates
```

**Flow (CRITICAL — must follow this order):**
1. `checkQuota(companyId, action, db)` → `QuotaCheckResult`
2. If `!result.allowed` → return 402/403 with `result.reason`
3. Execute the operation
4. `incrementQuotaUsed(companyId, action, db)` — atomic SQL increment

**Quota statuses:** `ok` → `exceeded` (7-day grace) → `readonly`

**Actions:** `"quote.create" | "user.create"`

**Import:**
```typescript
import { checkQuota, incrementQuotaUsed } from "@/lib/quota/quota-check"
import { TIER_QUOTAS } from "@/lib/quota/quota-config"
```

---

### Permissions Rules

**Roles:** `admin | commercial | operateur`

**API routes — use `requirePermission()`:**
```typescript
requirePermission(userRole, action, ownerId?, currentUserId?)
// throws PermissionError (403) if denied
```

**UI gating — use `can()`:**
```typescript
if (can(role, "quote.create")) { /* show button */ }
```

**Permission matrix highlights:**
- `user.manage` — admin only (audit export, user CRUD)
- `company.update` — admin only
- `clause.*` create/update/delete — admin only
- `template.*` create/update/delete — admin only
- `quote.update/delete/change-status` — commercial: "own" only; operateur: false

**Import:**
```typescript
import { can, requirePermission, PermissionError } from "@/lib/permissions"
```

---

### Audit Trail Rules (Story 6-3)

**Every write operation must emit an audit event** (best-effort — never block the main flow).

**Pattern:**
```typescript
await emitAuditEvent(createAuditEvent({
  companyId,           // REQUIRED — tenant scope for export filtering
  who: userId,
  what: "entity.action",  // e.g. "quote.created", "client.updated"
  where: "api/v1/route-name",
  entity: { type: "quote", id: entityId },
  before: previousState ?? undefined,
  after: newState ?? undefined,
}))
```

**Login/Logout audit helpers:**
```typescript
emitLoginAudit({ userId, companyId, ipAddress, userAgent })
emitLogoutAudit({ userId, companyId, ipAddress })
```

**companyId is mandatory** — audit export filters by it. Events without companyId are invisible to the export endpoint.

**Export endpoint:** `GET /api/v1/audit/export?format=json|csv&from=YYYY-MM-DD&to=YYYY-MM-DD`
- Admin-only; scoped to user's companyId; limit 10,000 events
- CSV: UTF-8 BOM (`﻿`) prepended for Excel compatibility (Niger/AES region)

---

### API Routes Rules

**Error responses — always use `apiError()`:**
```typescript
import { apiError, HTTP_STATUS } from "@/lib/api/envelope"
return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED)
```

**Error codes:** `VALIDATION_FAILED | FORBIDDEN | QUOTA_EXCEEDED | CONFLICT | NOT_FOUND | UNAUTHORIZED | RATE_LIMITED | INTERNAL_ERROR`

**Auth check pattern (Server Components & API routes):**
```typescript
const session = await auth.api.getSession({ headers: await headers() })
if (!session?.user) return apiError("UNAUTHORIZED", ..., HTTP_STATUS.UNAUTHORIZED)
const userId = session.user.id
const userRole = (session.user as Record<string, unknown>).role as Role
const companyId = (session.user as Record<string, unknown>).companyId as string
```

**CRITICAL — `session.user` custom fields require `additionalFields` (Better Auth):** Better Auth strips any `user` table column it doesn't know about from `session.user` by default. `role` and `companyId` are declared in `src/lib/auth.ts` under `user.additionalFields` — **any new custom column read via `(session.user as Record<string, unknown>).xxx` MUST be added there too**, or it silently comes back `undefined` and every guard reading it (`requireOwnerAuth`, `requirePermission`, `can()`) falls back to its default (usually locking the user out). This is easy to miss because unit tests mock the session object directly and never exercise real Better Auth serialization — verify with a real login (browser or `auth.api.getSession()` against a live cookie), not just mocked tests, whenever a new session field is introduced.

**Input validation:** Use Zod schemas from `src/lib/validation/` — do NOT inline ad-hoc validation in routes.

---

### Quote Status State Machine (Story 3-9)

**Valid transitions:**
```
draft → validated | cancelled
validated → sent | cancelled
sent → accepted | expired | cancelled
accepted → (terminal)
expired → (terminal)
cancelled → (terminal)
```

**Always use `canTransition()` — never bypass:**
```typescript
import { canTransition, validateDraftToValidated } from "@/lib/quote-status"
if (!canTransition(current, target)) throw new Error("Invalid transition")
```

**Draft → Validated requires validation:**
```typescript
const errors = validateDraftToValidated(quote, lines)
// errors: missingClient | missingLines | zeroTotal | missingRoute | missingSignatory
```

---

### Money / Financial Rules

**Currency: FCFA (XOF) — integer only, no decimals**
```typescript
import { formatFcfa, roundFcfa, toFcfa } from "@/lib/money"
formatFcfa(1500000)  // "1 500 000 XOF"
toFcfa(amount, exchangeRate)  // converts foreign currency → FCFA
roundFcfa(n)         // Math.round — always round before storing
```

**Bounds:** `0 ≤ value ≤ 1e13` (validated by calc helpers)

**Atomic calc helpers** (`src/lib/calc.ts`):
- `computeLineTotal(unitPrice, quantity)` → FCFA
- `computeQuoteTotal(lines)` → FCFA
- `computeValeurMarchandise(tonnage, unitPrice, exchangeRate)` → FCFA
- `computeCamions(tonnage, capacity)` → truck count

**Quote duplication — use pure builder:**
```typescript
import { buildDuplicateQuoteData } from "@/lib/duplicate-quote"
const data = buildDuplicateQuoteData(source, lines, clauses, userId)
// Then persist atomically in a single Dexie transaction
```

---

### PDF Generation Rules

**Libraries:** jsPDF 4.2.1 + html2canvas 1.4.1

**Pattern:**
1. Render quote data into a hidden HTML element
2. `html2canvas(element)` → canvas
3. `jspdf` → add image from canvas → save

**CSV exports always need UTF-8 BOM:**
```typescript
// ﻿ = UTF-8 BOM — required for Excel on Windows (standard in Niger/AES)
return "﻿" + [headers.join(","), ...rows].join("\r\n")
```

---

### Testing Rules

**Run tests:** `pnpm test` (Vitest) — included in `pnpm check`

**Unit tests:** `src/**/*.test.ts` alongside the module
**Integration tests:** `src/**/*.integration.test.ts`
**E2E tests:** `tests/e2e/**` (Playwright)

**Dexie unit tests:**
```typescript
import "fake-indexeddb/auto"  // must be first import in test file
```

**Pure logic first:** Extract pure functions (no DB, no React) into separate files so they can be tested without mocks. Example pattern: `quote-status.ts` (pure) tested by `quote-status.test.ts`.

**Integration tests:** Use real Dexie with `fake-indexeddb`, real calc helpers — no mocks for core business logic.

---

### Code Quality & Style Rules

**Linting/Formatting:**
- `pnpm check` = lint + typecheck + vitest (all must pass before commit)
- Semi-colons required; double quotes; max line 100
- `prettier-plugin-tailwindcss` sorts classes automatically

**Naming Conventions:**
- Files: kebab-case (`audit-export.tsx`, `quota-check.ts`)
- Components: PascalCase (`AuditExport`, `QuotaCheck`)
- Variables/Functions: camelCase
- Constants: UPPER_SNAKE_CASE (`EXPORT_LIMIT`, `GRACE_PERIOD_DAYS`)
- Hooks: `use` prefix

**Design System:**
- `cn()` from `@/lib/utils` for conditional classes
- Semantic color tokens (not hardcoded hex)
- shadcn/ui components — don't rebuild basic UI
- Icons: Lucide React only

**Code Organization:**
```
src/
├── app/              # Next.js routes + layouts
│   └── api/v1/       # API routes (auth, sync, quota, audit, companies, users)
├── components/
│   ├── ui/           # shadcn/ui components
│   └── settings/     # settings page components
├── lib/
│   ├── api/          # envelope.ts, mapper.ts
│   ├── crypto/       # encryption layer
│   ├── quota/        # quota-check, quota-config, quota-notify
│   ├── sync/         # numbering.ts
│   ├── validation/   # Zod schemas per entity
│   ├── audit.ts      # emitAuditEvent, createAuditEvent
│   ├── auth.ts       # Better Auth server config (plugins: lockout, rate-limit, audit)
│   ├── local-db.ts   # Dexie LocalDatabase (+ encryption install)
│   ├── money.ts      # FCFA formatting + calc
│   ├── permissions.ts # can(), requirePermission(), PERMISSION_MATRIX
│   ├── quote-status.ts # state machine
│   └── schema.ts     # Drizzle schema (all tables)
└── messages/
    └── fr-NE.json    # All UI strings (French, Niger)
```

---

### Language Convention

**UI/Labels:** French only — use `next-intl` keys, never hardcode French text in components
**Code:** English (variable names, comments, technical terms)
**Database:** English snake_case (table names, column names); enum values English (`draft`, `validated`)
**Documentation:** French (specs, README)

---

## Critical Don't-Miss Rules

### Database
- NEVER `pnpm db:push` in production — ALWAYS `db:generate` + `db:migrate`
- Custom tables: `uuid()` IDs; Better Auth tables: `text` IDs
- New tables: always add `companyId` index + `createdAt`/`updatedAt` timestamps

### Dexie / Offline
- Dexie version blocks are IMMUTABLE — only add new `.version(N)` blocks, never edit old ones
- `pays: "NE"` required on every new local entity (QuoteLocal, ClientLocal, etc.)
- `revision: 0` on new local entities; server sets final revision on sync
- `syncQueue` payloads must stay plaintext — server reads them directly

### Audit
- ALL write operations must emit an audit event
- Always include `companyId` in `createAuditEvent()` — export filtering depends on it
- Best-effort: wrap `emitAuditEvent()` in try/catch, never block the main flow

### Quota
- Check quota BEFORE the operation (`checkQuota`); increment AFTER success (`incrementQuotaUsed`)
- Use `sql\`quota_used_quotes + 1\`` atomic increment — never read-modify-write

### Permissions
- `requirePermission()` in every mutating API route
- `can()` for UI gating only — not for security enforcement

### API Routes
- Always `apiError()` from `@/lib/api/envelope` — never raw `NextResponse.json()` for errors
- Cast `session.user` to `Record<string, unknown>` to access `role` and `companyId`

### CSV / Exports
- UTF-8 BOM (`﻿`) prefix required for Excel compatibility in Niger/AES region

### React / Next.js
- `"use client"` first line, no blank line before, double quotes
- `next/navigation` (not `next/router`) for App Router
- `router.refresh()` after any auth state change

### TypeScript
- `noUncheckedIndexedAccess`: always guard `arr[0]` with `if (arr[0])` or `?? default`
- `exactOptionalPropertyTypes`: conditional assignment pattern for optional fields:
  ```typescript
  if (source.field != null) record.field = source.field
  ```

---

**Last Updated:** 2026-06-28
