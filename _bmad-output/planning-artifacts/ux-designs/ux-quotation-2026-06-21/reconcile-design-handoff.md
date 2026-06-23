# Reconcile — Claude Design handoff → spines

Input: `ux-designs/graphics/design_handoff_quotation_app/` (README + `.dc.html` prototype + logo SVGs).

The handoff is the authoritative baseline. Spines adopt it wholesale **except** the designer improvements below (Maiga Tech Lab brief: chaleureux/local/modern/reference). Spines win on conflict.

## Adopted as-is
- Full color/type/space/radius token set, status palette, currency formatting.
- All 8+ surfaces, IA, routes, live-calc formulas, lifecycle, offline/sync model, state shape.
- Restrained motion set + reduced-motion handling.
- Spectral + Hanken pairing; tabular-nums on money.

## Changed (designer touch)
- **D1 Brand unification** — handoff still carried cold near-black `#1c1917` (dark hero, login tile) and a "TS" placeholder logo. Spines drop both: dark blocks = brand navy `#1B3070`, real Q mark everywhere. *Prototype shows old `#1c1917` — ignore; spine wins.*
- **D2 A11y floor** — handoff used amber in some text-adjacent spots; spine restricts amber to FAB icon / glow / dot / large-numeral-on-tint, deep amber `#9a6a07` for text-on-tint, navy for all interactive text. No dark mode v1.
- **D3 Money signature** — codified Spectral + tabular-nums on *every* amount.
- **D4 Elevation** — replaced ad-hoc terracotta-tinted shadows with a 3-tier navy-warm scale.
- **D5 Sahel filigrane** — new: 4% navy-on-navy geometric motif on dark hero + PDF header band (not in prototype).
- **D6 Sunset hero** — hero glow specified as amber→terracotta radial over navy (prototype had a vaguer "terracotta glow" over near-black).

## Dropped / deferred (surface for review)
- Faux iOS status bar + 402×858 device shell — framing only, not in real PWA.
- `<sc-if>/<sc-for>` custom runtime — do not port (recreate in Next.js/React per project-context).
- Dark mode — deferred post-MVP (outdoor sunlight favors high-contrast light).

## Open for downstream (architecture / build)
- Self-host Spectral + Hanken + logo SVGs (offline integrity).
- Sahel motif asset: produce as inline SVG pattern, ≤4% opacity, single navy.
