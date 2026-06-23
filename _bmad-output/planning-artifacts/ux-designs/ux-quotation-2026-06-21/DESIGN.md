---
status: final
created: 2026-06-21
updated: 2026-06-21
project: quotation
ui_system: shadcn/ui (new-york, neutral base) + Tailwind v4 (CSS-first @theme in globals.css)
sources:
  - prd-quotation-2026-06-21
  - project-context
  - design_handoff_quotation_app
colors:
  brand-navy: "#1B3070"
  brand-navy-deep: "#152659"
  brand-slate: "#3A4C7A"
  brand-amber: "#F6A624"
  amber-deep: "#7d5600"
  terracotta: "#b8502d"
  app-bg: "#f7f4ee"
  surface: "#ffffff"
  surface-alt: "#faf8f3"
  surface-tint-amber: "#fdf3df"
  border: "#ece6da"
  border-input: "#e3dcce"
  ink: "#1B3070"
  text-primary: "#1c1a17"
  text-secondary: "#57534e"
  text-muted: "#6b6259"
  text-faint: "#a39d92"
  text-on-dark: "#faf6ef"
  focus-ring: "#1B3070"
  status-draft-text: "#615a52"
  status-draft-bg: "#f2efe9"
  status-valide-text: "#1d4e6f"
  status-valide-bg: "#e9eff3"
  status-envoye-text: "#964507"
  status-envoye-bg: "#fbeedd"
  status-accepte-text: "#11652f"
  status-accepte-bg: "#e8f1ea"
  status-expire-text: "#b91c1c"
  status-expire-bg: "#f7e8e5"
  status-annule-text: "#615a52"
  status-annule-bg: "#f0eeea"
typography:
  serif: "Spectral"
  sans: "Hanken Grotesk"
  weights: [400, 500, 600, 700]
  numeric: "tabular-nums"
rounded:
  input: "11px"
  button: "11px"
  card: "15px"
  dark-block: "16px"
  sheet-top: "22px"
  fab: "18px"
  badge: "6px"
  pill: "20px"
spacing:
  screen-x: "20px"
  screen-x-login: "28px"
  card-pad: "16px"
  card-gap: "10px"
components:
  button: "navy fill, white text, radius 11, warm shadow"
  fab: "amber fill, navy + icon, 54px, elevated -16px"
  card: "white surface, border #ece6da, shadow flat"
  input: "surface, border #e3dcce, focus navy"
  status-badge: "tinted bg + dot + text per lifecycle"
---

# DESIGN.md — Quotation Logistique

> Visual identity contract. Owns **how it looks**. Pairs with [EXPERIENCE.md](./EXPERIENCE.md) (how it works), which references these tokens by `{path.to.token}` name. **This spine wins on conflict** with any mock, the handoff prototype, or import. Inherits from **shadcn/ui (new-york, neutral)** + Tailwind v4; tokens below extend the system defaults.

Distilled from the Claude Design hi-fi handoff (`imports/` → `ux-designs/graphics/design_handoff_quotation_app/`) with Maiga Tech Lab's brief — **chaleureux · local · modern · reference-worthy** — applied as designer improvements D1–D6 (see `.decision-log.md`).

---

## Brand & Style

**Quotation Logistique** is a warm, editorial, trustworthy logistics tool for the Sahel. The personality: **a professional document you'd be proud to hand a client**, rendered with the calm confidence of a serif-led editorial layout over warm paper, energized by a single amber spark.

- **Voice of the visuals:** premium but grounded; local without cliché. Warmth comes from paper tones + a sunset glow, not from loud ornament.
- **Two-color discipline:** navy commands, amber accents. Never let amber govern large areas or carry text.
- **Editorial serif for value:** every money figure and title is set in Spectral — money is the signature of this product.
- **Local touch:** a Sahel/Tuareg-inspired geometric line motif appears only as a 4%-opacity filigrane on dark surfaces (hero, PDF header). Felt, not seen.
- **Logo:** navy "Q" mark with an amber dot + delivery arrow. Self-host SVGs (`logo-mark.svg`, `logo-mark-light.svg` for dark tiles, `logo-full.svg` lockup). The mark is the product identity; tenant company logos (PRD FR-6) appear separately on PDF/company card.

---

## Colors

Tailwind v4 CSS-first — declare as tokens in `globals.css` under `@theme inline`. Map to shadcn semantic roles (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--ring`) so shadcn components inherit automatically.

### Core

| Token | Hex | Role |
|---|---|---|
| `{colors.brand-navy}` | `#1B3070` | Primary. Buttons, links, active states, ink, dark blocks, focus ring, route arrows |
| `{colors.brand-slate}` | `#3A4C7A` | Minor brand accent (logo detail, subtle dividers on dark) |
| `{colors.brand-amber}` | `#F6A624` | Energetic accent. FAB icon, hero glow, logo dot, large-numeral-on-tint. **Never text/small UI.** |
| `{colors.amber-deep}` | `#7d5600` | Text/numerals **on** amber tint (darkened to clear AA 4.5:1 — was `#9a6a07`, only 4.29:1) |
| `{colors.terracotta}` | `#b8502d` | Sunset-glow far stop on hero only |

### Surfaces & text

| Token | Hex | Role |
|---|---|---|
| `{colors.app-bg}` | `#f7f4ee` | Screen background (warm paper) |
| `{colors.surface}` | `#ffffff` | Cards, inputs, rows |
| `{colors.surface-alt}` | `#faf8f3` | Inset fields, subtle bands |
| `{colors.surface-tint-amber}` | `#fdf3df` | Amber highlight card (camion count) |
| `{colors.border}` | `#ece6da` | Card borders |
| `{colors.border-input}` | `#e3dcce` | Input/select borders |
| `{colors.text-primary}` | `#1c1a17` | Warm near-black body emphasis |
| `{colors.text-secondary}` | `#57534e` | Body, labels (AA ✓) |
| `{colors.text-muted}` | `#6b6259` | Field labels, **meta, dates, "FCFA", captions** (darkened from `#78716c` → clears AA on paper). Smallest token allowed for any text a user must read. |
| `{colors.text-faint}` | `#a39d92` | **Decorative / disabled / placeholder only** — never meaningful content (fails AA at ~2.6:1) |
| `{colors.text-on-dark}` | `#faf6ef` | Text on navy blocks |

### Status (quote lifecycle)

| Status | Text | Bg | Dot |
|---|---|---|---|
| Brouillon | `#615a52` | `#f2efe9` | `#a8a29e` |
| Validé | `#1d4e6f` | `#e9eff3` | `#2f6e96` |
| Envoyé | `#964507` | `#fbeedd` | `#d97706` |
| Accepté | `#11652f` | `#e8f1ea` | `#16a34a` |
| Expiré | `#b91c1c` | `#f7e8e5` | `#dc2626` |
| Annulé | `#615a52` | `#f0eeea` | `#a8a29e` |

> Badge text colors darkened (Brouillon/Annulé/Envoyé/Accepté) to clear AA 4.5:1 on their tints — the lighter handoff values sat at 4.1–4.4:1. Validé/Expiré already passed. Dots are decorative (label always present, so color-only is never the sole signal).

> **D2 accessibility floor (post-review):** any text a user must read uses `text-secondary` or `text-muted` (both AA) — **never `text-faint`** (decorative/placeholder only). Amber `{colors.brand-amber}` is decorative/icon/large-numeral only; amber-context text uses `{colors.amber-deep}` (now AA). Focus ring `{colors.focus-ring}` at ≥3:1 (on dark surfaces, render a light halo to guarantee it). No dark mode in v1 (outdoor Sahel sunlight → high-contrast light prioritized; revisit post-MVP). **Verify all ratios in build** (tokens darkened by eye against AA targets).

---

## Typography

Two Google fonts, **self-hosted** (offline/PWA requirement).

- **`{typography.serif}` — Spectral** (400/500/600/700): screen titles, hero figures, section titles, **all money amounts**, big numerals (camion count, totals), PDF document headings. Apply `letter-spacing: -0.01em` to `-0.015em` at large sizes.
- **`{typography.sans}` — Hanken Grotesk** (400/500/600/700): all UI — labels, body, buttons, nav, table text.
- **Numerals:** every amount uses `font-variant-numeric: tabular-nums` for column alignment (**D3 — money is the signature**).

### Scale (px)

| Role | Font | Size | Weight |
|---|---|---|---|
| Screen title | Spectral | 27 | 600 |
| Hero amount | Spectral | 36 | 600 |
| Section title | Spectral | 18–22 | 600 |
| Big numeral (camion / total) | Spectral | 23–34 | 600 |
| Body / input | Hanken | 14 | 400–500 |
| Button | Hanken | 14.5–15 | 600 |
| Field label | Hanken | 11.5 | 600 |
| Eyebrow (uppercase) | Hanken | 10.5–11.5 · `uppercase` · `ls .04em` | 600 |
| Caption / meta | Hanken | 11.5–13 | 400–500 |
| Nav label | Hanken | 10 | 600 |

---

## Layout & Spacing

- Screen horizontal padding **`{spacing.screen-x}` (20px)**; login **`{spacing.screen-x-login}` (28px)**.
- Card padding **13–18px** (default `{spacing.card-pad}` 16); inter-card gap **`{spacing.card-gap}` (10px)**.
- Mobile-first single-column stack. Two-column only for paired fields (Contact+Téléphone, Pays+Ville) and status-counter 2×2 grid.
- Sticky chrome: wizard header + progress + bottom action bar; bottom nav 74px (hidden on login/wizard/new-client/preview).
- Real PWA fills viewport — **no device bezel** (prototype's 402×858 shell + faux iOS status bar are framing only; use real OS status bar). Respect safe-area insets.

---

## Elevation & Depth (D4 — codified scale)

| Tier | Shadow | Use |
|---|---|---|
| **Flat** | `0 1px 2px rgba(40,30,15,.03)` | Cards, rows, inputs |
| **Raised** | `0 4px 14px -4px rgba(27,48,112,.45)` (FAB `0 8px 18px -5px rgba(27,48,112,.5)`) | Primary button, FAB |
| **Overlay** | `0 8px 30px -10px rgba(40,30,15,.4)` | Bottom sheet, PDF document |

No ad-hoc shadows outside this scale. (Raised shadow warmed to navy tint — D1, replacing the handoff's terracotta-shadow leftover.)

---

## Shapes

Radius tokens: input/button **`{rounded.input}` 11** · card **`{rounded.card}` 15** · dark block **`{rounded.dark-block}` 16** · sheet top **`{rounded.sheet-top}` 22** · FAB **`{rounded.fab}` 18** · status badge **`{rounded.badge}` 6** · chips/pills **`{rounded.pill}` 20**. PDF document card radius 4 (paper feel).

**Sahel filigrane (D5):** geometric line motif (chevrons/diamonds, Tuareg-inspired) at **~4% opacity, navy-on-navy**, on the dark hero block and the PDF header band only. Static under `prefers-reduced-motion`. Never on light surfaces or accent cards.

---

## Components

Inherit shadcn/ui (new-york). Tokens above re-skin defaults; specify only the visual delta. Behavioral specs live in [EXPERIENCE.md](./EXPERIENCE.md).

- **Button (primary):** `{colors.brand-navy}` fill, `{colors.text-on-dark}` label, radius `{rounded.button}`, Raised shadow, Hanken 600. Full-width in forms/wizard.
- **Button (secondary):** white, border `{colors.border-input}`, text `{colors.text-secondary}`.
- **FAB (+):** amber `{colors.brand-amber}` fill, **navy `{colors.brand-navy}` "+" icon**, 54×54, radius `{rounded.fab}`, elevated −16px in nav, gentle float.
- **Input / select / textarea:** `{colors.surface}`, border `{colors.border-input}`, radius `{rounded.input}`; focus border → `{colors.focus-ring}`.
- **Card:** `{colors.surface}`, border `{colors.border}`, radius `{rounded.card}`, Flat shadow.
- **Hero card:** navy `{colors.brand-navy}` base, radius `{rounded.dark-block}`, Sahel filigrane 4%, **sunset radial glow top-right** (amber → terracotta, low opacity, breathing). Eyebrow + Spectral 36 amount in `{colors.text-on-dark}`. Visual reference: [`mockups/dashboard-hero-improved.html`](./mockups/dashboard-hero-improved.html) (spine wins on conflict).
- **Camion card (accent):** tint `{colors.surface-tint-amber}`, border `#f6e2b4`, big Spectral numeral in `{colors.amber-deep}`, formula caption.
- **Status badge:** tinted bg + dot + text per lifecycle table, radius `{rounded.badge}`.
- **Segmented control / filter chips:** active = navy fill + white; inactive = white + border `{colors.border-input}`.
- **Bottom sheet:** white, top radius `{rounded.sheet-top}`, Overlay shadow, dim backdrop `rgba(28,25,23,.42)`.
- **Bottom nav:** translucent `rgba(247,244,238,.92)` + blur, top border `{colors.border}`; active icon/label navy, inactive `{colors.text-faint}`.
- **PDF document:** white A4 card, Overlay shadow, navy header with logo mark + Sahel filigrane band, amber rule accent, Spectral headings, `tabular-nums` totals, navy TOTAL bar.

---

## Do's and Don'ts

**Do**
- Set every money amount in Spectral + `tabular-nums`.
- Keep amber to FAB icon, hero glow, logo dot, large-numeral-on-tint.
- Use navy for all interactive text, links, active states, focus.
- Keep the Sahel motif a 4% whisper on dark surfaces only.
- Map tokens to shadcn semantic roles so components inherit.

**Don't**
- Don't use amber for body text or small UI (fails AA).
- Don't reintroduce cold near-black `#1c1917` — dark blocks are brand navy (D1).
- Don't ship ad-hoc shadows outside the elevation scale.
- Don't render the device bezel / faux status bar in the real PWA.
- Don't let the local motif exceed ~4% or spread to light/accent surfaces.
- Don't add dark mode in v1.
