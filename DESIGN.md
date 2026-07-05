# Design System — Quotation Logistique

Source of truth for UI work. Every token below is **verified against
`src/app/globals.css`** — if this file and the code disagree, the code
wins and this file must be updated.

Full design rationale (UX decision records `UX-DR*`, mockups, a11y
review) lives in
`_bmad-output/planning-artifacts/ux-designs/ux-quotation-2026-06-21/`.
Desktop-specific layout decisions: `.tmp-screenshots/design-brief.md`
(until merged here).

> History: this file previously described the starter-kit theme (Geist,
> OKLCH, dark mode). That system was replaced in Story 1-1 by the brand
> system below. **Light-only — there is no `.dark` block and none should
> be added.**

---

## Stack

- **Framework:** Next.js (App Router) + React + TypeScript
- **Styling:** Tailwind CSS v4 (CSS-first config via `@theme inline` in
  `globals.css` — no `tailwind.config.ts`)
- **Components:** shadcn/ui (new-york style) — restyle these, never
  introduce another component library
- **Icons:** Lucide React
- **Fonts:** Spectral (serif, headings) + Hanken Grotesk (sans, body),
  self-hosted via `next/font/local` in `src/app/fonts.ts`, weights
  400/500/600/700
- **Dark mode:** none. Light-only (UX decision C4)
- **Utilities:** `cn()` from `@/lib/utils`

---

## Colors

All hex, defined in `:root` of `globals.css`, bridged to Tailwind via
`@theme inline`. Use the utility classes (`bg-brand-navy`,
`text-text-muted`, …) — never raw hex in components.

### Brand

| Token | Value | Usage |
|---|---|---|
| `brand-navy` | `#1b3070` | Primary — buttons, links, active nav, letterhead |
| `brand-navy-deep` | `#152659` | Hover on primary, dark gradients |
| `brand-slate` | `#3a4c7a` | Secondary brand tone, charts |
| `brand-amber` | `#f6a624` | Accent, FAB, highlights |
| `amber-deep` | `#7d5600` | Text on amber (AA) |
| `terracotta` | `#b8502d` | Decorative only (hero sunset glow) |

### Surfaces

| Token | Value | Usage |
|---|---|---|
| `app-bg` | `#f7f4ee` | Page background (warm paper) |
| `surface` | `#ffffff` | Cards, inputs, rows |
| `surface-alt` | `#faf8f3` | Inset fields, bands, hover |
| `surface-tint-amber` | `#fdf3df` | Amber-tinted card (truck card) |

### Text

| Token | Value | Usage |
|---|---|---|
| `text-primary` | `#1c1a17` | Headings, primary content |
| `text-secondary` | `#57534e` | Secondary content (AA) |
| `text-muted` | `#6b6259` | Labels, captions (AA) |
| `text-faint` | `#a39d92` | Decorative only — **never useful text** |
| `text-on-dark` | `#faf6ef` | Text on navy/dark blocks |

### Borders & focus

| Token | Value |
|---|---|
| `border` | `#ece6da` |
| `border-input` (`--input`) | `#e3dcce` |
| `focus-ring` (`--ring`) | `#1b3070` |

### Status lifecycle (devis)

Each status has a text/bg/dot triplet, exposed as
`status-<name>-text|bg|dot` utilities:

| Status | text | bg | dot |
|---|---|---|---|
| brouillon | `#615a52` | `#f2efe9` | `#a8a29e` |
| validé | `#1d4e6f` | `#e9eff3` | `#2f6e96` |
| envoyé | `#964507` | `#fbeedd` | `#d97706` |
| accepté | `#11652f` | `#e8f1ea` | `#16a34a` |
| expiré | `#b91c1c` | `#f7e8e5` | `#dc2626` |
| annulé | `#615a52` | `#f0eeea` | `#a8a29e` |

Lifecycle: brouillon → validé → envoyé → accepté / expiré; annulé from
any state. Render as pill: dot + label, tinted bg, radius 6px
(`--radius-badge`). Component: `src/components/quote/status-badge.tsx`.

### shadcn semantic mapping

Semantic roles inherit brand tokens automatically — shadcn components
pick up the theme with no per-component overrides:

`background→app-bg`, `foreground→text-primary`, `primary→brand-navy`,
`primary-foreground→text-on-dark`, `secondary/muted→surface-alt`,
`accent→brand-amber`, `accent-foreground→amber-deep`,
`destructive→#b91c1c`, `card/popover→surface`, `input→border-input`,
`ring→focus-ring`. Charts: navy, amber, slate, terracotta, navy-deep.
Sidebar: `sidebar→surface`, `sidebar-primary→brand-navy`,
`sidebar-accent→surface-alt`.

---

## Typography

- **Headings / page titles / figures:** Spectral via `font-serif`
- **Body / UI:** Hanken Grotesk (default on `body`)
- **Money & quantities:** always `tabular-nums`
- Page header pattern (every page): ALL-CAPS eyebrow
  (`text-xs font-semibold uppercase tracking-wider text-text-muted`) +
  serif title (`font-serif text-2xl font-semibold text-text-primary`)

---

## Radius

Base `--radius: 11px` (shadcn `sm/md/lg/xl` derive from it).

| Token | Value | Usage |
|---|---|---|
| `--radius-input` / `--radius-button` | 11px | Inputs, buttons |
| `--radius-card` | 15px | Cards |
| `--radius-dark-block` | 16px | Navy blocks (dashboard hero) |
| `--radius-fab` | 18px | Mobile FAB |
| `--radius-pill` | 20px | Filter pills, segmented controls |
| `--radius-sheet-top` | 22px | Mobile bottom sheets |
| `--radius-badge` | 6px | Status badges |

---

## Spacing

`--spacing-screen-x: 20px` (mobile screen padding),
`--spacing-screen-x-login: 28px`, `--spacing-card-pad: 16px`,
`--spacing-card-gap: 10px`.
Desktop shell: sidebar `w-64`, content `lg:pl-64` +
`max-w-7xl lg:px-8 lg:py-8`, breakpoint `lg` (1024px).

---

## Elevation (UX-DR3)

| Utility | Usage |
|---|---|
| `shadow-flat` | Default cards |
| `shadow-raised` | Emphasis (navy tint) |
| `shadow-raised-fab` | FAB |
| `shadow-overlay` | Dialogs, sheets |

---

## Motion (UX-DR21)

Available: `animate-fade-in/-up`, `animate-scale-in`, `animate-scr-in`
(screen enter), `animate-sheet-up`, `animate-toast-in`,
`animate-blink-dot` (sync/live indicator), `animate-float`, hero
`breathe` glow. All disabled under `prefers-reduced-motion` — any new
animation must be added to that media query block in `globals.css`.

---

## Recurring patterns

- **Status pill** — see Status section above.
- **Dashboard hero** — navy block (`radius-dark-block`), period
  segmented control (7j/30j/90j/Tout), per-status dot counts, "Total
  devisé" serif figure, breathing glow (decorative terracotta).
- **Document preview (devis detail)** — mirrors the PDF: navy
  letterhead, amber rule, prestations table with navy TOTAL row,
  clauses. Keep the document metaphor.
- **Interactive cards** — `card-interactive` utility (hover lift).
- **Touch targets** — ≥44px (`touch-target` utility) on mobile
  (UX-DR19/22).
- **Focus** — `:focus-visible` outline 2px `ring` offset 2, global.

---

## Formats (French UI)

- Money: `1 650 000 FCFA` — fr-FR grouping, integer FCFA, no decimals
  (`formatFcfa` in `src/lib/money.ts`), `tabular-nums`
- Devis number: `DEV-2026-0042` server-side, `TEMP-XXXX-0001` before
  sync — layouts must tolerate both
- Dates: `04 juil. 2026` (lists), `4 juillet 2026` (document view)
- Route: `Niamey → Lomé`

---

## Rules

1. Use token utilities, never raw hex/px in components.
2. New colors/radii/shadows go into `globals.css` (`:root` +
   `@theme inline`), then get documented here.
3. Light-only — no `.dark`, no `next-themes`.
4. French labels in UI, English in code.
5. Restyle shadcn primitives; don't fork them or add other UI libraries.
6. `text-faint` is decorative only — never for readable content (a11y).
