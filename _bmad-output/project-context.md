---
project_name: 'quotation'
user_name: 'Maiga Tech Lab'
date: '2026-06-21'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'database_rules', 'code_quality', 'language_convention', 'critical_rules']
existing_patterns_found: 12
status: 'complete'
rule_count: 72
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

**Core Framework:**
- Next.js 16.1.6 (App Router, Turbopack)
- React 19.2.4
- TypeScript 5.9.3 (strict mode)

**Styling:**
- Tailwind CSS 4.3.0 (CSS-first via `@theme inline` in `globals.css`)
- shadcn/ui 3.8.5 (new-york style, neutral base)
- Lucide React (icons)
- Geist Sans + Geist Mono (fonts)

**Backend:**
- PostgreSQL (pg 8.20.0, postgres 3.4.9)
- Drizzle ORM 0.44.7
- Better Auth 1.6.11 (email/password)

**AI (optional):**
- AI SDK 5.0.188
- OpenRouter provider 1.5.4

**Package Manager:**
- pnpm (overrides: @types/react 19.2.5)

**Key Constraints:**
- React 19 features stable only — avoid experimental
- TypeScript strict mode fully enabled (including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Tailwind v4 CSS-first — no `tailwind.config.ts`, tokens in `globals.css`

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

**TypeScript Strict Mode:**
- `noUncheckedIndexedAccess` enabled — always handle undefined on array/object access
- `exactOptionalPropertyTypes` enabled — `undefined` ≠ `absent` in optional types
- `noUnusedLocals` and `noUnusedParameters` enabled — clean up unused code

**Import/Export:**
- Use `@/` alias for `src/*` imports (not relative paths where possible)
- Import order: React/Next → external packages → `@/*` internal → relative
- `"use client"` directive must be first line (no blank line before it)

**Component Patterns:**
- Client Components: `"use client"` (double quotes) as first line
- Server Components by default (no directive)
- Props interfaces: `interface ComponentProps { ... }` before component

**Error Handling:**
- Prefer `catch { ... }` without unused error parameter
- User-facing errors in French, technical errors logged
- Use `setError("message")` pattern for form/validation errors

**Async Patterns:**
- Use `async/await` over `.then()` chains
- Properly type return values from async functions
- Handle loading states with `isPending` or `isLoading` booleans

### Framework-Specific Rules (Next.js/React)

**Next.js App Router:**
- Use route groups `(group)/` for shared layouts without affecting URL
- Server Components by default — only add `"use client"` when necessary (interactivity, hooks, browser APIs)
- API routes in `app/api/*/route.ts` with named exports (`GET`, `POST`, etc.)
- Use `next/navigation` for `useRouter`, `usePathname` (not `next/router`)

**React Hooks:**
- Better Auth: use `useSession()` from `@/lib/auth-client`
- Form state: `const [field, setField] = useState("")`
- Loading states: `const [isPending, setIsPending] = useState(false)`
- Router: `const router = useRouter()` — use `router.push()`, `router.refresh()`

**Component Organization:**
- One component per file (export default for pages, named export for reusable)
- Props interface defined above component
- Early returns for loading/error states before main render

**Performance Patterns:**
- Use `<Suspense>` for async Server Components
- Consider `dynamic` imports for heavy client components
- Avoid unnecessary client boundaries — prefer Server Components when possible

### Database Rules (Drizzle)

**Schema Definition:**
- All custom tables use `uuid()` for primary keys
- Better Auth tables use `text` IDs — do not change
- Use `pgTable` from `drizzle-orm/pg-core`
- Define tables in `src/lib/schema.ts`

**Migration Workflow (CRITICAL):**
- When schema changes: `pnpm db:generate` → creates migration in `drizzle/`
- Then: `pnpm db:migrate` → applies migration to database
- NEVER use `pnpm db:push` for production schema changes
- Local dev only: `pnpm db:push` is acceptable for rapid prototyping

**Timestamp Pattern:**
```typescript
createdAt: timestamp("created_at").defaultNow().notNull()
updatedAt: timestamp("updated_at").$onUpdate(() => /* @__PURE__ */ new Date()).notNull()
```

**Foreign Keys:**
```typescript
userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" })
```
- Use `onDelete: "cascade"` for dependent records
- Reference function notation: `references(() => table.id)`

**Indexes:**
- Add indexes for frequently queried columns (email, userId, token)
- Use composite indexes for multi-column queries

### Code Quality & Style Rules

**Linting/Formatting:**
- Run `pnpm check` (lint + typecheck) before committing
- Semi-colons required
- Double quotes (not single)
- Max line width: 100
- `prettier-plugin-tailwindcss` sorts classes automatically

**Naming Conventions:**
- Files: kebab-case (`user-profile.tsx`, `auth-client.ts`)
- Components: PascalCase (`UserProfile`, `SignInButton`)
- Variables/Functions: camelCase (`isLoading`, `handleSubmit`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`, `API_URL`)
- React hooks: `use` prefix (`useSession`, `useDiagnostics`)

**Design System (DESIGN.md):**
- Use `cn()` from `@/lib/utils` for conditional classes
- Use semantic color tokens (not hardcoded values)
- Follow spacing/sizing/typography scales from DESIGN.md
- Use shadcn/ui components — don't rebuild basic UI
- Icons: Lucide React only

**Code Organization:**
- `src/app/` — Next.js routes and layouts
- `src/components/ui/` — shadcn/ui components
- `src/components/` — project-specific components
- `src/lib/` — utilities, DB, auth, schema
- `src/hooks/` — custom React hooks

### Language Convention

**UI/Labels (User-facing):**
- All user-facing text in **French**
- Button labels, form labels, error messages, placeholders → French
- Examples: "Se connecter", "Mot de passe", "Email", "Erreur lors de la connexion"

**Code/Technical:**
- Variable names, function names, comments in **English**
- Technical terms remain in English (API, database, authentication, etc.)
- Examples: `handleSubmit`, `isLoading`, `userEmail`

**Documentation:**
- Specs, README, project docs in **French**
- Technical documentation in **English** when appropriate

**Database:**
- Table names: English lowercase (`user`, `session`, `verification`)
- Column names: snake_case English (`created_at`, `email_verified`)
- Enum values: English (`draft`, `validated`, `sent`)

### Critical Don't-Miss Rules

**Database (CRITICAL):**
- NEVER `pnpm db:push` in production — ALWAYS `db:generate` + `db:migrate`
- Custom tables: use `uuid()` for IDs, NOT `serial` or auto-increment
- Better Auth tables: use `text` IDs, do NOT change to UUID

**React/Next.js Gotchas:**
- Use `next/navigation` for App Router (NOT `next/router`)
- `"use client"` required when using hooks (useState, useRouter, useEffect, etc.)
- Don't overuse `"use client"` — prefer Server Components by default
- After auth changes: use `router.refresh()` to update session state

**TypeScript Gotchas:**
- `noUncheckedIndexedAccess` means array access may return `undefined`
- Always type async function returns: `async Promise<Type>`
- Handle `exactOptionalPropertyTypes` — `undefined` ≠ absent

**Design System:**
- Use color tokens from `globals.css` (not hardcoded hex values)
- Use `cn()` utility for conditional classes
- Don't rebuild basic UI — use shadcn/ui components

**Auth Patterns:**
- Protected Server Components: check `session` before rendering
- Protected API routes: use auth middleware or session validation
- After sign-in/out: `router.push()` + `router.refresh()`

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

---

**Last Updated:** 2026-06-21
