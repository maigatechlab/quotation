# Handoff: Quotation Logistique — Mobile PWA

## Overview
**Quotation Logistique** is an offline-first Progressive Web App for transporters, transitaires and commissionnaires in Niger (extensible to the AES space: Mali, Burkina Faso). It lets a commercial user create professional logistics quotes (*devis*) in ~3 minutes: pick a client, define the route/goods, add priced line items with automatic calculations (truck count, declared value, totals in FCFA), attach contractual clauses, and generate a print-ready PDF. The app is **mobile-first**, in **French (fr-NE)**, with currency in **FCFA (XOF)**.

This handoff covers the **core flow**: Login → Dashboard → Quote list → Create wizard (5 steps with live calculations) → PDF preview, plus the **Clients** list, a **New Client** form, **Company settings**, and a **status-change** flow. It maps to PRD modules 1, 3, 4, 5, 6, 7, 9 and 11 (see `prd.md`).

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing the intended look, layout, copy and interaction behavior. They are **not production code to copy directly**.

The prototype is authored as a single "Design Component" HTML file (`Quotation Logistique.dc.html`) that uses a small custom template runtime (`<sc-if>`, `<sc-for>`, `{{ }}` holes, and a `Component` logic class). **Do not port that runtime.** Instead, **recreate these designs in the target codebase's environment** using its established patterns and libraries. The PRD (`prd.md`) specifies the intended stack: **Next.js (App Router) + React, next-intl for i18n, IndexedDB (offline), Drizzle/PostgreSQL, Zod validation, client-side PDF (jsPDF + html2canvas)**. If you are starting fresh, that stack is the recommended target. Treat the `.dc.html` file purely as a visual + behavioral spec.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, component styling, copy, and interactions are all specified below and present in the prototype. Recreate the UI to match, using the codebase's component library where one exists (e.g. swap the hand-built inputs/buttons/sheets for the design-system equivalents, keeping the visual tokens below).

---

## Brand
The app is branded with the **Quotation Logistique** logo (navy "Q" mark with an amber dot + delivery arrow, plus the navy wordmark). Brand colors drive the whole UI: **navy `#1B3070`** (primary / ink / dark blocks) and **amber `#F6A624`** (energetic secondary accent). Logo assets are in `assets/logo-mark.svg` (navy-on-light), `assets/logo-mark-light.svg` (white mark + amber dot, for dark tiles) and `assets/logo-full.svg` (full lockup). Replace the placeholder company "TS" usages are gone — the mark now appears on the login screen, the Compte company card, and the PDF document header. Self-host these.

## Design Tokens

### Colors
| Token | Hex | Usage |
|---|---|---|
| Canvas (behind phone) | `#e2dcce` → `#ece6da` (radial) | App backdrop only (prototype framing) |
| App background | `#f7f4ee` | Screen background |
| Surface (cards) | `#ffffff` | Cards, inputs, rows |
| Surface alt | `#faf8f3` | Inset fields, subtle bands |
| Border | `#ece6da` | Card borders |
| Border (input) | `#e3dcce` | Input/select borders |
| Ink (primary text) / dark blocks | `#1B3070` (brand navy) | Headings, primary text, hero/total/footer blocks, logo tiles |
| Text secondary | `#57534e` / `#44403c` | Body, labels |
| Text muted | `#78716c` | Field labels |
| Text faint | `#a39d92` / `#8a8377` | Captions, placeholders, meta |
| **Primary accent (brand navy)** | `#1B3070` | Primary buttons, active tabs/chips, links, selected states, focus ring, "DEVIS", route arrows |
| **Secondary accent (brand amber)** | `#F6A624` | FAB (+) icon button, hero radial glow, camion-count card, logo dot |
| Amber (deep, text on tint) | `#9a6a07` | Text/number inside the amber camion card |
| Amber tint bg / border | `#fdf3df` / `#f6e2b4` | Camion-count highlight card |
| Brand slate | `#3A4C7A` | Minor logo accent |

### Status colors (quote lifecycle)
| Status | Text | Background | Dot |
|---|---|---|---|
| Brouillon (draft) | `#78716c` | `#f2efe9` | `#a8a29e` |
| Validé | `#1d4e6f` | `#e9eff3` | `#2f6e96` |
| Envoyé | `#b45309` | `#fbeedd` | `#d97706` |
| Accepté | `#15803d` | `#e8f1ea` | `#16a34a` |
| Expiré | `#b91c1c` | `#f7e8e5` | `#dc2626` |
| Annulé | `#78716c` | `#f0eeea` | `#a8a29e` |

### Typography
Two Google fonts:
- **Spectral** (serif) — weights 400/500/600/700. Used for: screen titles, large amounts, hero figures, document headings, big numerals (camion count, totals). Always with `letter-spacing: -0.01em` to `-0.015em` on large sizes.
- **Hanken Grotesk** (sans) — weights 400/500/600/700. Used for: all UI, labels, body, buttons, nav, table text.

Numeric amounts use `font-variant-numeric: tabular-nums` for column alignment.

Type scale (px, as used):
| Role | Font | Size | Weight |
|---|---|---|---|
| Screen title | Spectral | 27 | 600 |
| Hero amount | Spectral | 36 | 600 |
| Section title | Spectral | 18–22 | 600 |
| Big numeral (camion/total) | Spectral | 23–34 | 600 |
| Body / input | Hanken | 14 | 400–500 |
| Button | Hanken | 14.5–15 | 600 |
| Field label | Hanken | 11.5 | 600 |
| Uppercase eyebrow | Hanken | 10.5–11.5, `text-transform:uppercase`, `letter-spacing:.04em` | 600 |
| Caption / meta | Hanken | 11.5–13 | 400–500 |
| Nav label | Hanken | 10 | 600 |

### Spacing, radius, shadow
- Screen horizontal padding: **20px** (login: 28px).
- Card padding: **13–18px**. Gaps between cards: **10px**.
- Radius: inputs/buttons **10–13px**; cards **14–16px**; hero/dark blocks **14–18px**; phone shell **42px**; bottom sheet top corners **22px**; FAB **18px**; status badges **6px**; chips/pills **20px**.
- Card shadow: `0 1px 2px rgba(40,30,15,.03)`.
- Primary button shadow: `0 4px 14px -4px rgba(194,65,12,.6)` (FAB: `0 8px 18px -5px rgba(194,65,12,.65)`).
- Document (PDF) shadow: `0 8px 30px -10px rgba(40,30,15,.4)`.
- Focus state: input/textarea/select border → `#1B3070`.

### Device frame (prototype only)
The prototype renders inside a **402 × 858px** phone shell (radius 42px) on a warm canvas. In the real PWA there is no bezel — the app fills the viewport. A faux iOS status bar (time `9:41` + signal/wifi/battery) sits at top, height 46px; replace with the real OS status bar.

---

## Screens / Views

### 0. Login (`screen: login`, shown when `!authed`)
- **Purpose:** Authenticate with email + password; pick role.
- **Layout:** Full-height flex column, centered content, 28px side padding. Footer pinned bottom.
- **Components:**
  - Logo tile: 56×56, radius 16, bg `#1c1917`, white "TS" in Spectral 18/600.
  - Title "Quotation / Logistique" — Spectral 30/600, line-height 1.05, two lines.
  - Subtitle — Hanken 13.5, `#8a8377`.
  - Email input (prefilled `amadou@trans-sahel.ne`), Password input (`type=password`). Labels Hanken 11.5/600 `#78716c`.
  - **Role segmented control** — 3 equal buttons: Administrateur / Commercial / Opérateur. Selected = bg `#1c1917`, text `#faf6ef`; unselected = white, border `#e3dcce`, text `#57534e`. Default selected: **Commercial**.
  - Primary button "Se connecter" (full width, accent).
  - Text button "Mot de passe oublié ?" (centered, `#8a8377`) → shows toast "Lien de réinitialisation envoyé".
  - Footer: green dot + "Fonctionne hors ligne · session 7 jours".
- **Behavior:** "Se connecter" sets `authed=true`, navigates to Dashboard. (Prototype does not validate credentials; real app: PRD FR-1 — bcrypt/argon2, 401 on bad creds, 7-day offline session, account lockout after 5 fails.)

### 1. Dashboard / Tableau de bord (`screen: dashboard`)
- **Purpose:** Activity overview (PRD FR-40/41/42).
- **Layout:** 20px padding, vertical stack.
- **Components:**
  - Header row: greeting "Bonjour," (13px `#8a8377`) + user name (Spectral 27/600); right: 42px circular avatar (bg `#1c1917`, white initials).
  - **Offline banner** (toggle `showOffline`): bg `#fdf6e7`, border `#f1e2b8`, amber dot, text "Hors ligne · 2 devis en attente de synchronisation" `#92580a`.
  - **Hero amount card**: dark `#1c1917`, radius 18, a soft terracotta radial glow top-right. Eyebrow "MONTANT DEVISÉ · {period}", amount in Spectral 36/600 `#faf6ef` (sum of Envoyé+Accepté quotes, `… F`), sub-caption, and a period segmented control (7j / 30j / 90j / Tout) — active = accent bg/white, inactive = `rgba(255,255,255,.08)` / `#b6ada0`.
  - **Status counters**: 2×2 grid of white cards; each shows a colored status dot + label + count (Spectral 28/600). Counts derive from the quotes list.
  - "Devis récents" section title (Spectral 18) + "Voir tout" link (accent) → Quote list.
  - **Recent quote rows** (4): white card, tap opens PDF preview. Left: number (13.5/700) + status badge; client name; `trajet · date`. Right: amount (tabular) + "FCFA".

### 2. Quote list / Devis (`screen: list`)
- **Purpose:** Search & filter all quotes (PRD FR-16).
- **Components:**
  - Title "Devis" (Spectral 27).
  - Search input with leading magnifier icon; placeholder "Rechercher client, n° de devis…". Filters by number, client name, and route (case-insensitive, partial).
  - **Status filter chips** (horizontal scroll): Tous / Brouillon / Validé / Envoyé / Accepté / Expiré. Active = bg `#1c1917`, text `#faf6ef`; inactive = white, border `#e3dcce`.
  - Result count "{n} devis".
  - **Quote cards**: number (14/700) + status badge top row; client name; bottom row `trajet · date` left, amount + "FCFA" right. Tap → PDF preview.

### 3. Create wizard / Nouveau devis (`screen: create`, `step: 1..5`)
- **Purpose:** Build a quote in 5 steps. Realizes PRD UJ-1 and FRs 12/17/18/19/20/21/22/23/24/25/27/28.
- **Chrome:** Sticky header: back button (36×36, white, chevron-left) + centered title "Nouveau devis" with caption "Étape {n} / 5 · {stepName}". Below: a 5-segment progress bar — segments `≤ step` are accent `#1B3070`, rest `#e3dcce`. Sticky bottom bar: "Précédent" (secondary, only when step>1) + primary button ("Suivant", or **"Générer le devis"** on step 5).
  - Back from step 1 → Dashboard; otherwise → previous step.
- **Step 1 — Client:** Title "Sélectionner le client". List of client option cards (avatar tinted per client, name, ville · phone). Selected card: bg `#fffaf6`, border accent, with a filled accent check circle (24px) on the right. Dashed "Nouveau client" button → opens New Client form (returns to wizard with the new client pre-selected).
- **Step 2 — Trajet / corridor:** A card with a vertical connector (hollow accent ring = départ, filled accent square = arrivée, dotted line between). Two groups: **Départ** (ville input + pays select) and **Arrivée** (ville input + pays select). Below: "Corridors fréquents" chips that set both ends at once (Niamey→Ouagadougou, Cotonou→Niamey, Lomé→Niamey, Tema→Niamey, Niamey→Zinder).
- **Step 3 — Marchandise (live calc):** Inputs: Nature (text), Tonnage (t), Capacité camion (t). **Camion card** (tinted accent): big Spectral numeral = `ceil(tonnage / capacité)`, with formula caption `ceil(60 ÷ 30)`. "Valeur déclarée": Prix unitaire/t, Devise select (FCFA/EUR/USD). If devise ≠ FCFA, a Taux de change field appears. **Valeur marchandise card**: `tonnage × prix × taux` formatted FCFA, with source-currency sub-line. (PRD FR-19/20 — round up trucks; financial 2-dp; guard divide-by-zero.)
- **Step 4 — Prestations (live totals):** List of line cards; each = label, remove (×) button, a −/+ qty stepper (min 1), `× {unitPrice}` caption, and line total (qty×unitPrice). "Ajouter depuis un modèle" chips append a templated line (Transport, Carnet TRIE, Douane, Manutention, Escorte, Phytosanitaire, Assurance). **Total prestations** in a dark card (Spectral 23, `#faf6ef`). Recalculates on every change (PRD FR-21/22/23/24).
- **Step 5 — Conditions:** Payment-terms textarea (prefilled). "Clauses standards" multi-select list (checkbox tiles; selected = bg `#fffaf6`, border `#f0d8c8`, filled accent checkbox). 5 clauses: Paiement, Responsabilité, Assurance, Exclusions, Litiges. **Récapitulatif card**: client, trajet, line count, camion count, and Total (Spectral 26, accent). "Générer le devis" → PDF preview built from the draft.

### 4. PDF preview / Aperçu (`screen: preview`)
- **Purpose:** Print-ready devis (PRD FR-31/32/34). Built either from the draft (`previewSource:'draft'`, number `TEMP-A1B2-0007`, status Brouillon) or an existing quote (`previewSource:'quote'`).
- **Chrome:** Header: back + centered "Aperçu du devis" + caption (number) + "⋯" button (opens status sheet — see flow 6). Bottom bar: "Modifier" (→ wizard) + "Partager le PDF" (accent, upload icon) → toast.
- **Document (white A4 card, radius 4):** sections, top-to-bottom:
  1. **Header** — "TS" logo tile, company name (Spectral 15/700), tagline + address; right: "DEVIS" (Spectral 21/700, accent) + number. A `2px solid #1c1917` bottom rule. Row of RCCM / NIF / Tél (9px).
  2. **Destinataire + meta** — client block left; right column: Date, Validité (date+`validiteDays`), Statut (colored).
  3. **Objet** (band, bg `#faf8f3`) — `villeDep → villeArr` (Spectral 13) with an arrow; sub-line "nature · tonnage t · camions camion(s) · capacité t".
  4. **Prestations table** — header row (Désignation / Qté / P.U. / Montant) with a dark bottom rule; rows with `1px #f3eee4` separators; right-aligned totals block: Sous-total + a dark **TOTAL** bar (Spectral 15/700), "Montant en francs CFA (XOF)".
  5. **Conditions** — payment line (bold) + selected clauses (`<b>Title.</b> content`, 9px).
  6. **Signature** — two columns: "Le prestataire" (signataire name + role + dotted line) and "Bon pour accord — Client" (dashed box for signature/cachet).
  7. **Footer band** — "Document généré par Quotation Logistique · {company}".

### 5. Clients (`screen: clients`)
- Title "Clients" + a dark **+** button (38×38) → New Client form. Search input (visual). Client cards: tinted square avatar (initials), name, `ville · phone`, and a right-aligned devis count (Spectral 15) + "DEVIS".

### 5b. New Client form (`screen: newClient`)
- **Purpose:** Create a client (PRD FR-8). Reached from Clients **+** or from wizard step 1 (returns to caller; from wizard, the new client is auto-selected).
- **Chrome:** Back/cancel button + title "Nouveau client". Sticky bottom: "Enregistrer le client" (accent).
- **Fields:** Nom de la société **\***, Contact, Téléphone **\*** (2-col with Contact), E-mail, Pays (select) / Ville (2-col), Adresse, Notes internes (textarea). Required marked with accent `*`.
- **Validation:** Nom + Téléphone required — otherwise toast "Nom et téléphone obligatoires". On save: append to clients, toast "Client « {name} » créé", navigate back.

### 5c. Company settings / Paramètres (`screen: compte`)
- Title "Paramètres". Company card: TS tile + name + "SARL · Niamey, Niger"; 2×2 grid of RCCM / NIF / Signataire / Fonction. Settings list rows (icon tile + label + sub + chevron): Bibliothèque de clauses, Modèles de routes, Modèles de prestations, Utilisateurs & rôles, **Déconnexion** (→ returns to Login). (PRD FR-5/6/7/26.)

### Bottom navigation (shown on dashboard/list/clients/compte)
- 74px tall, translucent `rgba(247,244,238,.92)` + blur, top border `#ece6da`.
- 5 slots: **Accueil**, **Devis**, center elevated **+ FAB** (54×54, **amber `#F6A624` with navy `#1B3070` "+" icon**, raised −16px, gentle float animation) → Create wizard, **Clients**, **Compte**.
- Active tab icon+label = accent `#1B3070`; inactive = `#a39d92`. Hidden on login, create wizard, new-client and preview screens.

---

## Interactions & Behavior
- **Navigation:** tab bar + FAB; in-screen buttons set the active screen. No router in the prototype — model as routes in the real app (`/login`, `/`, `/devis`, `/devis/nouveau`, `/devis/[id]`, `/clients`, `/clients/nouveau`, `/parametres`).
- **Live calculations** (must recompute on every keystroke/step change):
  - `nombre_camions = ceil(tonnage / capacité_camion)` — block if capacité = 0 (PRD FR-19).
  - `valeur_marchandise = tonnage × prix_unitaire × taux_change` (taux = 1 when FCFA).
  - `total_ligne = prix_unitaire × quantité`; `total_devis = Σ total_ligne`.
  - All money formatted `fr-FR` thousands separators (`Intl.NumberFormat('fr-FR')`), suffix "FCFA"; 2-dp financial rounding per PRD.
- **Status change:** "⋯" on a saved quote opens a **bottom sheet** ("Changer le statut") listing the 6 lifecycle states with dots; current state shows an accent check. Selecting applies it and toasts "Statut → {label}". For a draft preview, "⋯" instead toasts "Enregistrez le devis…". (PRD FR-15 — log every transition with user+timestamp.)
- **Toasts:** dark pill, bottom-center, auto-dismiss ~2.2s. Used for share, password reset, save, status change, and settings stubs.
- **Bottom sheet:** dim backdrop `rgba(28,25,23,.42)`; tap backdrop to close; sheet body stops propagation. Slides up from bottom, rounded top (22px).
- **Selection feedback:** chosen client card / clause / filter chip / period / role all use the selected-state styling above.
- **Focus:** inputs/selects/textarea borders turn accent on focus.

## Animations
Motion is intentionally restrained and **degrades gracefully** (every animated element rests in a visible state, so reduced-motion users lose nothing):
- **Screen entrance** — each screen/wizard-step content rises ~10px on mount (`scrIn`, ~0.4s, ease-out). Transform-only.
- **Bottom sheet** — status sheet slides up (`sheetUp`) on open.
- **Toast** — slides up + in (`toastIn`).
- **Ambient (infinite, subtle):** the logo's amber dot pulses (`dotPulse`, 2.4s); the hero card's amber glow breathes (`glowPulse`, 5s); the FAB gently floats (`floatY`, 3.2s); the offline-sync dot blinks (`blink`, 1.8s).
- **Feedback:** selected client check pops in (`pop`); wizard progress segments animate their fill color (`transition: background .35s`); nav tab color transitions on switch.
Recreate with the codebase's motion library (e.g. Framer Motion) and honor `prefers-reduced-motion`.

## State Management
Prototype state (recreate as app/router/store state):
- `authed` (bool), `role` ('Administrateur'|'Commercial'|'Opérateur').
- `screen`, and for the wizard `step` (1–5).
- `draft`: `{ clientId, paysDep, villeDep, paysArr, villeArr, nature, qte, cap, pu, devise, taux, lines[], clauses[], payment }`. `lines[] = { id, label, pu, qte }`.
- `quotes[]` (full records incl. lines, clauses, dates, status) and `clients[]` (mutable — New Client appends).
- `nc` (new-client form draft), `ncReturn` ('clients'|'create').
- `previewSource` ('draft'|'quote'), `activeId` (selected quote), `statusSheet` (bool), `toast` (string).
- Tweakable props in the prototype: `companyName`, `userName`, `showOffline`, `validiteDays` (default 30) — surface as company/app settings.
- **Data fetching (real app):** offline-first via IndexedDB with sync queue (PRD FR-35/36/37/37a). Quote numbering: offline `TEMP-{DEVICE}-{SEQ}`, server assigns `DEV-{YYYY}-{XXXX}` on sync (FR-13). Client snapshot is frozen onto the quote at creation (FR-10). Permissions per role matrix (PRD FR-2/3).

## Assets
- **No external image assets.** All iconography is inline SVG (chevrons, search, plus, home/doc/users/gear nav icons, check, share/upload, route arrows, status-bar signal/wifi/battery). Recreate with the codebase's icon set (e.g. Lucide/Heroicons) — shapes are standard.
- **Logo** — the real **Quotation Logistique** mark is used (`assets/logo-mark*.svg`). The PRD's company-logo upload (FR-6, PNG/JPG ≤2MB, ≤300px) would let each tenant swap their own; the brand mark here is the app/product identity.
- **Fonts:** Spectral + Hanken Grotesk (Google Fonts). Self-host for offline/PWA.

## Files
- `Quotation Logistique.dc.html` — the full interactive prototype (all screens, logic, sample data). Open in a browser to click through. The `<script data-dc-script>` block at the bottom contains the `Component` logic class (state, handlers, sample `clients`/`quotes`/`lineTemplates`/`clauseLib`/`routeTemplates`, and all calculations) — read it for exact formulas, sample data, and copy.
- `prd.md` — the product requirements document (authoritative for functional requirements, NFRs, permissions, offline/sync, security, i18n).
