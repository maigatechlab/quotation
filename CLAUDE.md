# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Context

**Quotation Logistique** — Application web de gestion de devis pour professionnels du transport/logistique au Niger (MVP), puis extension à l'espace AES (Mali, Burkina Faso).

**Cible principale :** Transporteurs, transitaires, commissionnaires, négociants.

**Spécification complète :** `Docs/cahier-des-charges-mvp-quotation-logistique.md`

---

## Tech Stack

- **Next.js 16** + React 19 + App Router
- **TypeScript** (strict)
- **Better Auth** (email/password par défaut)
- **PostgreSQL** + Drizzle ORM
- **shadcn/ui** + Tailwind CSS + Lucide icons
- **AI SDK** + OpenRouter (fonctionnalités chat optionnelles)
- **pnpm** (package manager)

---

## Commands

```bash
# Development
pnpm dev              # Start dev server (Turbopack)
pnpm build            # Migrate + build for production
pnpm start            # Start production server

# Quality
pnpm lint             # ESLint
pnpm typecheck        # TypeScript check
pnpm check            # lint + typecheck
pnpm format           # Prettier format

# Database
pnpm db:generate      # Generate Drizzle migration
pnpm db:migrate       # Run migrations
pnpm db:studio        # Drizzle Studio UI
pnpm db:push          # Push schema (local dev only)
pnpm db:reset         # Drop + recreate schema (local dev)

# Docker (Postgres local)
docker compose up -d
docker compose down
```

---

## Database Workflow

**IMPORTANT:** When schema changes:
1. Edit `src/lib/schema.ts`
2. Run `pnpm db:generate` (creates migration in `drizzle/`)
3. Run `pnpm db:migrate` (applies migration)

**NEVER use `drizzle push` for production schema changes.**

**ID Columns:** Use `uuid()` for custom tables. Better Auth tables use `text` IDs.

---

## Architecture

### Key Directories

```
src/
├── app/              # Next.js App Router
│   ├── (auth)/       # Auth routes (login, register, etc.)
│   ├── api/          # API routes
│   └── ...
├── components/
│   ├── auth/         # Auth components
│   └── ui/           # shadcn/ui components
├── lib/
│   ├── auth.ts       # Better Auth server config
│   ├── auth-client.ts # Better Auth client
│   ├── db.ts         # Database client
│   ├── schema.ts     # Drizzle schema
│   ├── session.ts    # Session utilities
│   ├── storage.ts    # File storage abstraction
│   └── utils.ts      # Utilities
└── hooks/            # React hooks
```

### Auth Flow

Better Auth configured in `src/lib/auth.ts`. Email/password enabled by default.

- Protected routes: check `session` in Server Components
- Client: use `auth-client.ts` hooks

---

## Agent Instructions

**See `AGENTS.md` for detailed agent rules.**

Key points:
- **Planning mode:** Ask clarifying questions, use sub-agents for research/review
- **Edit mode:** Use sub-agents for parallel implementation, coordinate only
- **After changes:** Run `pnpm check` and `pnpm build`
- **Schema changes:** Always generate + migrate, never push
- **UI:** Follow `DESIGN.md` design system

---

## MVP Features (Phase 1)

1. **Auth** — Connexion, rôles (admin, commercial, opérateur)
2. **Paramètres société** — Infos entreprise, logo, signataire
3. **Clients** — CRUD clients
4. **Devis** — CRUD avec calculs automatiques
5. **Détails opérationnels** — Trajet, marchandise, tonnage
6. **Prestations** — Lignes de devis avec calculs
7. **Conditions/Clauses** — Bibliothèque de clauses
8. **PDF** — Génération document professionnel

---

## Language Convention

- **Code:** English (variable names, comments, technical terms)
- **UI/Labels:** French (user-facing text)
- **Documentation:** French (specs, README)

---

## Environment Variables

Copy from `env.example`:
```bash
cp env.example .env
```

Required:
- `POSTGRES_URL` — PostgreSQL connection
- `BETTER_AUTH_SECRET` — Auth secret
- `NEXT_PUBLIC_APP_URL` — App URL

Optional (AI features):
- `OPENROUTER_API_KEY` — OpenRouter key
- `OPENROUTER_MODEL` — Model to use

---

## Project Specs Reference

Complete requirements in `Docs/cahier-des-charges-mvp-quotation-logistique.md`:

- Vision du produit
- Objectifs
- Utilisateurs cibles
- Périmètre fonctionnel (9 modules)
- Règles métier (calculs)
- Roadmap (3 phases)
- Critères de succès

---

## Development Workflow

1. `docker compose up -d` — Start Postgres
2. `pnpm db:migrate` — Apply migrations
3. `pnpm dev` — Start dev server
4. Open http://localhost:3000
