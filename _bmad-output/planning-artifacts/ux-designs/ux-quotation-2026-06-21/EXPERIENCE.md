---
status: final
created: 2026-06-21
updated: 2026-06-21
project: quotation
form_factor: PWA offline-first, mobile-first (fr-NE)
ui_system: shadcn/ui (new-york, neutral base)
design_ref: ./DESIGN.md
sources:
  - prd-quotation-2026-06-21
  - project-context
  - design_handoff_quotation_app
---

# EXPERIENCE.md — Quotation Logistique

> Behavior contract. Owns **how it works** — IA, voice, behavioral patterns, states, interactions, accessibility, flows. Visual specs live in [DESIGN.md](./DESIGN.md); this spine references its tokens by `{path.to.token}`. **Both spines win on conflict** with any mock or import.

Distilled from the Claude Design hi-fi handoff + PRD (`prd-quotation-2026-06-21`). FR references point to the PRD.

---

## Foundation

- **Form-factor:** Progressive Web App, **offline-first**, **mobile-first**. Installable. Fills viewport (no bezel). Safe-area aware.
- **UI system:** shadcn/ui (new-york). Behavioral patterns below specify only the delta over shadcn defaults; visual identity is DESIGN.md.
- **Language:** French (fr-NE) UI; English code/data per `project-context`. Currency **FCFA (XOF)**.
- **Roles:** Administrateur · Commercial · Opérateur (PRD FR-2/3 permission matrix). Role chosen at login, governs visible actions.
- **Offline model:** IndexedDB local store + sync queue (FR-35/36/37/37a). Quote numbering offline `TEMP-{DEVICE}-{SEQ}` → server assigns `DEV-{YYYY}-{XXXX}` on sync (FR-13). Client snapshot frozen onto quote at creation (FR-10).

---

## Information Architecture

Routes (real app; prototype had no router):

```
/login                    Login (unauthenticated)
/                         Dashboard / Tableau de bord
/devis                    Quote list
/devis/nouveau            Create wizard (5 steps)
/devis/[id]               PDF preview (existing quote)
/clients                  Clients list
/clients/nouveau          New Client form
/parametres               Company settings + libraries
```

**Primary nav (bottom bar, 5 slots):** Accueil · Devis · **+ FAB** (center, → wizard) · Clients · Compte. Hidden on login, wizard, new-client, preview.

**Surface ↔ need closure:** every JTBD from PRD §2.1 lands on a surface —
- Créer un devis rapidement → wizard (`/devis/nouveau`)
- Calculer correctement → wizard steps 3–4 live calc
- Envoyer au client → PDF preview → Partager
- Retrouver l'historique → quote list (search/filter)
- Dupliquer → quote actions (FR-14)
- Suivre les statuts → status sheet + list badges
- Gérer clauses / routes / prestations → settings libraries
- Visualiser l'activité → dashboard
- Gérer clients → clients list + new-client form

Secondary surfaces under `/parametres`: Bibliothèque de clauses, Modèles de routes, Modèles de prestations, Utilisateurs & rôles, Déconnexion (FR-5/6/7/26).

---

## Voice and Tone (microcopy)

French, fr-NE, professional-but-warm. Concise, action-led. Brand voice lives in DESIGN.md.Brand & Style.

- **Eyebrows:** uppercase, terse — "MONTANT DEVISÉ · 30j".
- **Buttons:** verb-first — "Se connecter", "Suivant", "Générer le devis", "Partager le PDF", "Enregistrer le client".
- **Empty/offline:** reassuring, never alarming — "Fonctionne hors ligne · session 7 jours"; "Hors ligne · 2 devis en attente de synchronisation".
- **Toasts:** confirmation in past/result tense — "Client « {nom} » créé", "Statut → Envoyé", "Lien de réinitialisation envoyé".
- **Validation errors:** plain, what-to-fix — "Nom et téléphone obligatoires".
- **Money:** always FCFA suffix, `fr-FR` thousands grouping.

---

## Component Patterns (behavioral)

Visual specs → DESIGN.md.Components.

- **Segmented control (role / period):** single-select, immediate effect, one always active. Default role = Commercial; default period = 30j.
- **Filter chips (status):** single-select horizontal scroll; "Tous" default; filters list live.
- **Client option card (wizard step 1):** tap selects, shows filled check; one selected at a time.
- **Qty stepper (prestations):** −/+ buttons, min 1; recompute line + grand total on each change.
- **Checkbox tiles (clauses):** multi-select; selected state per DESIGN.md.
- **Bottom sheet (status change):** modal; lists 6 lifecycle states with dots, current shows check; select → apply + toast + close.
- **FAB:** always → `/devis/nouveau`.
- **Toast:** bottom-center pill, auto-dismiss ~2.2s, non-blocking.
- **Search input:** leading magnifier; filters by number + client + route, case-insensitive, partial, live.

---

## State Patterns

Each data surface specifies: **loading · empty · error · offline · partial/optimistic**.

- **Loading:** skeleton rows for list/dashboard; inline spinner on submit buttons (`isPending`).
- **Empty:** quote list "Aucun devis" + CTA to wizard; clients "Aucun client" + CTA to new-client.
- **Error:** form errors inline via `setError` (French); failed sync stays queued + visible offline banner.
- **Offline:** persistent banner when offline or pending items — "Hors ligne · {n} devis en attente de synchronisation"; blinking amber dot; all create/edit still work locally.
- **Optimistic:** new client/quote appears immediately, reconciled on sync; `TEMP-` number until server assigns `DEV-`.
- **Live calculation states (wizard, recompute every keystroke):**
  - `nombre_camions = ceil(tonnage / capacité)` — block/guard when capacité = 0 (FR-19).
  - `valeur_marchandise = tonnage × prix_unitaire × taux_change` (taux = 1 for FCFA; rate field appears only when devise ≠ FCFA).
  - `total_ligne = prix_unitaire × quantité`; `total_devis = Σ total_ligne`.
  - Financial 2-dp rounding; `Intl.NumberFormat('fr-FR')`.
- **Quote lifecycle:** Brouillon → Validé → Envoyé → Accepté / Expiré / Annulé. Every transition logged with user + timestamp (FR-15). Draft preview "⋯" → toast "Enregistrez le devis…" (no status change until saved).

---

## Interaction Primitives

- **Navigation:** bottom tab bar + FAB; wizard uses sticky back + Précédent/Suivant; back from step 1 → Dashboard.
- **Focus:** inputs/selects/textarea borders → `{colors.focus-ring}` on focus.
- **Selection feedback:** chosen card / clause / chip / period / role all use selected styling (DESIGN.md).
- **Sheet dismiss:** tap backdrop closes; body stops propagation.
- **Motion (restrained, degrades gracefully — every animated element rests visible):** screen entrance rise ~10px (`scrIn` ~0.4s, transform-only); sheet slide-up; toast slide-in; ambient subtle (logo dot pulse, hero glow breathe, FAB float, offline dot blink); wizard progress fill transition; selected-check pop. **Honor `prefers-reduced-motion`** — disable ambient + entrance, keep rest states. Sahel filigrane static.

---

## Accessibility Floor (behavioral; visual contrast → DESIGN.md)

- **Targets:** ≥44×44px touch targets (steppers, FAB, nav, chips, **hero period segments** — give them full-height hit area even when visually compact).
- **Accessible names & state:** icon-only controls (back, "⋯", avatar, FAB, search) carry `aria-label`; segmented controls / filter chips expose selected state via `aria-pressed`/`role="tab"+aria-selected`, not color alone; meta text never uses `text-faint` (use `text-muted`, AA — see DESIGN.md).
- **Focus order:** logical top-to-bottom; visible navy focus ring everywhere; trap focus in bottom sheet, restore on close.
- **Forms:** every field labeled (Hanken 11.5 label bound to control); required marked with accent `*` and announced; errors associated to fields (`aria-describedby`), not toast-only.
- **Live regions:** calc results (camion count, totals) and toasts use polite live regions so updates are announced.
- **Status:** never color-only — every status badge pairs dot + text label.
- **Motion:** `prefers-reduced-motion` fully honored.
- **Offline:** offline state announced, not silent.
- **Contrast:** body text AA; amber never carries text (see DESIGN.md D2). Target consumer-grade AA across.

---

## Key Flows

### Flow 1 — Amadou crafts a quote in 3 minutes (the climax flow)

**Amadou**, commercial chez un transitaire à Niamey, phone in hand, a client on the line asking for a Niamey→Ouagadougou price. Spotty 3G in the warehouse.

1. Opens the PWA (already installed). Offline banner shows calmly — he doesn't care, it just works. Dashboard greets "Bonjour, Amadou" over the navy hero with its warm sunset glow; the 30-day devisé total sits in Spectral.
2. Taps the amber **+** FAB → wizard, "Étape 1 / 5 · Client".
3. **Step 1 Client:** the client isn't listed. Taps dashed "Nouveau client", fills Nom + Téléphone, saves — toast "Client « … » créé", returns to step 1 with the new client **pre-selected** (filled check).
4. **Step 2 Trajet:** taps the "Niamey→Ouagadougou" corridor chip — both ends fill at once.
5. **Step 3 Marchandise:** nature, tonnage 60, capacité 30. The amber camion card snaps to **2** with formula `ceil(60 ÷ 30)`. Enters prix unitaire; valeur marchandise card updates live in FCFA.
6. **Step 4 Prestations:** taps "Transport", "Douane", "Manutention" template chips; nudges a qty stepper; the dark **Total prestations** recomputes on every tap.
7. **Step 5 Conditions:** payment terms prefilled; ticks Responsabilité + Assurance clauses. Récapitulatif shows client, trajet, camions, **Total** in accent Spectral. Taps **"Générer le devis"**.
8. **Climax — PDF preview:** a clean white document unfurls — navy header with the Q mark + Sahel filigrane band, his company's RCCM/NIF, the prestations table with `tabular-nums` totals, the navy TOTAL bar, signature blocks. It looks like something he'd be proud to send.
9. Taps **"Partager le PDF"** → toast, shares to WhatsApp. Total elapsed: under 3 minutes. The quote sits as **Brouillon**, queued for sync; it'll get its `DEV-2026-XXXX` number when signal returns.

### Flow 2 — Aïcha moves a quote through its lifecycle

**Aïcha**, admin, reviews yesterday's quotes on the bus (offline).

1. Dashboard → "Devis récents" → "Voir tout" → quote list.
2. Filters by **Envoyé** chip; searches a client name — list filters live.
3. Opens a quote → PDF preview → taps **"⋯"** → status sheet slides up. Current state shows a check.
4. Selects **Accepté** → toast "Statut → Accepté", sheet closes; transition logged with her name + timestamp. Dashboard counters and the amount card will reflect it (Accepté counts toward devisé total).

> **Client acceptance (PRD FR-30):** recording a client's accord is the **Brouillon/Envoyé → Accepté** transition above, performed via the status sheet on the quote's PDF preview. No separate "accord" surface in v1 — the lifecycle sheet is the single capture point. The PDF "Bon pour accord — Client" signature box is the offline/paper counterpart.

### Flow 3 — First run / login

1. `/login`: logo tile, "Quotation / Logistique" in Spectral, email + password, **role segmented control** (default Commercial), "Se connecter".
2. Footer reassures: green dot · "Fonctionne hors ligne · session 7 jours".
3. "Mot de passe oublié ?" → toast "Lien de réinitialisation envoyé".
4. Success → Dashboard. (Real app: FR-1 — hashed creds, 401 on bad, 7-day offline session, lockout after 5 fails.)

---

## Responsive & Platform

- **Mobile-first**, single-column. Primary target: Android phones on 3G/offline in the Sahel.
- **PWA:** installable, offline-first, self-hosted fonts + logo SVGs for offline integrity.
- **Tablet/desktop (post-MVP):** layout scales by widening the single column + max-width container; no separate IA in v1.
- **Print:** PDF preview maps to A4 print-ready output (jsPDF + html2canvas per PRD); the on-screen document card is the faithful preview.

---

## Inspiration & Anti-patterns

- **Inspiration:** editorial finance apps where serif numerals carry trust; warm-paper note apps; a printed devis you'd hand a client.
- **Anti-patterns to avoid:** generic SaaS blue-grey flatness; amber overload; cold near-black; color-only status; motion that doesn't rest; loud "ethnic" ornament (kept to 4% filigrane instead).
