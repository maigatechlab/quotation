# UX Spine Rubric Walker — Findings Report

Run: ux-quotation-2026-06-21
Reviewer role: rubric walker (coverage · internal consistency · cross-reference integrity)
Date: 2026-06-21
Files reviewed: DESIGN.md, EXPERIENCE.md (+ context: .decision-log.md, prd.md)

Verdict: **PASS with minor cleanups.** No blockers. Both spines are well-formed, the single token cross-reference resolves, and surface↔need closure is complete. Findings below are mostly NIT/MINOR consistency drifts between the two spines and the decision log.

---

## 1. DESIGN.md — Spine Coverage

Canonical section order expected: Brand & Style · Colors · Typography · Layout & Spacing · Elevation & Depth · Shapes · Components · Do's and Don'ts.

**Result: CLEAN.** All eight sections present, in canonical order:
- Brand & Style (L78) · Colors (L90) · Typography (L135) · Layout & Spacing (L160) · Elevation & Depth (L170) · Shapes (L182) · Components (L190) · Do's and Don'ts (L209).

Frontmatter tokens (colors, typography, rounded, spacing, components) all present. Hex values validated — all are well-formed 6-digit hex. No malformed values.

### [NIT] DESIGN.md · Frontmatter `colors` vs Colors tables — status DOT colors not tokenized
The status lifecycle table (L122–129) introduces dot hex values (`#a8a29e`, `#2f6e96`, `#d97706`, `#16a34a`, `#dc2626`) that exist only in the prose table, not in the frontmatter `colors` block (which has `*-text` and `*-bg` but no `*-dot`). Same for camion-card border `#f6e2b4` (L200) and sheet backdrop `rgba(28,25,23,.42)` (L203) and bottom-nav `rgba(247,244,238,.92)` (L204). These are intentional one-off visual values, but a downstream consumer reading only the frontmatter token map will not find them.
**Fix (optional):** Either add `status-*-dot` tokens to frontmatter or add a one-line note under the status table: "Dot colors are table-local; not exported as named tokens."

### [NIT] DESIGN.md · `{colors.text-primary}` and `{colors.brand-navy-deep}` declared but unused in prose
Frontmatter declares `brand-navy-deep: "#152659"` (L13) and `text-primary` is used (L114) — fine. But `brand-navy-deep` appears in no table or component spec. Either wire it into the hero/dark-block spec or drop it to avoid a dangling token.
**Fix (optional):** Reference `{colors.brand-navy-deep}` where the deepest navy is used (e.g., TOTAL bar or hero base shadow), or remove from frontmatter.

---

## 2. EXPERIENCE.md — Spine Coverage

Expected: Foundation · Information Architecture · Voice and Tone · Component Patterns · State Patterns · Interaction Primitives · Accessibility Floor · Key Flows. Triggered: Responsive & Platform, Inspiration & Anti-patterns.

**Result: CLEAN.** All eight core sections present in canonical order:
- Foundation (L23) · Information Architecture (L33) · Voice and Tone (L65) · Component Patterns (L78) · State Patterns (L95) · Interaction Primitives (L112) · Accessibility Floor (L122) · Key Flows (L135).

Both triggered sections present and justified:
- Responsive & Platform (L169) — justified: PWA/mobile-first/print is a real platform concern.
- Inspiration & Anti-patterns (L178) — present and substantive.

### [NIT] EXPERIENCE.md · L67 — missing space after sentence
"Brand voice lives in DESIGN.md.Brand & Style." — the cross-section pointer `DESIGN.md.Brand & Style` is glued to the previous sentence (no space after the period). Cosmetic only.
**Fix:** "...action-led. Brand voice lives in DESIGN.md → Brand & Style."

---

## 3. Cross-Reference Integrity

Extracted every `{path.to.token}` reference in EXPERIENCE.md and resolved against DESIGN.md frontmatter.

**Result: CLEAN.** Exactly one token reference appears in EXPERIENCE.md:
- L115 `{colors.focus-ring}` → resolves to DESIGN.md frontmatter L30 (`focus-ring: "#1B3070"`). VALID.

No dangling references.

### [MINOR] EXPERIENCE.md · Under-referencing of DESIGN tokens (integrity is fine, but contract is loose)
EXPERIENCE.md frequently points at DESIGN.md by *section name* prose ("per DESIGN.md", "selected state per DESIGN.md", "DESIGN.md.Components", "DESIGN.md D2") rather than by `{token}` path. This is not a dangling-reference defect, but it weakens the machine-checkable contract the `{path.to.token}` convention is meant to provide. Only `focus-ring` is actually wired as a token. Colors named in EXPERIENCE prose (e.g., "blinking amber dot" L101, "navy focus ring" L125, "accent `*`" L126) could each carry a `{colors.*}` reference.
**Fix (optional, raises rigor):** Convert the most load-bearing prose color/radius mentions to `{colors.brand-amber}`, `{colors.focus-ring}`, etc., so cross-ref integrity can be auto-validated rather than eyeballed.

---

## 4. Surface ↔ Need Closure (PRD JTBD / modules → IA surfaces)

PRD §2.1 lists 9 JTBD; EXPERIENCE.md L50–61 explicitly maps each to a surface.

**Result: CLEAN — full closure, no orphan surfaces, no unmet needs.**

| PRD JTBD (§2.1) | IA surface (EXPERIENCE L50–61) | Status |
|---|---|---|
| Créer un devis rapidement | wizard `/devis/nouveau` | mapped |
| Calculer correctement | wizard steps 3–4 live calc | mapped |
| Envoyer au client | PDF preview → Partager | mapped |
| Retrouver l'historique | quote list (search/filter) | mapped |
| Dupliquer un devis | quote actions (FR-14) | mapped |
| Suivre les statuts | status sheet + list badges | mapped |
| Gérer modèles clauses | settings libraries | mapped |
| Gérer modèles routes | settings libraries | mapped |
| Visualiser l'activité | dashboard | mapped |

PRD 11 modules cross-check: every module lands on a route. Modules 1(Auth)→/login, 2(Société)→/parametres, 3(Clients)→/clients, 4(Devis)→/devis(+wizard), 5(Détails op.)→wizard steps 2–3, 6(Prestations)→wizard step 4, 7(Clauses)→wizard step 5 + /parametres lib, 8(Validation client)→PDF preview signature zone, 9(PDF)→/devis/[id], 10(Offline/PWA)→cross-cutting (Foundation + State Patterns), 11(Dashboard)→`/`.

### [MINOR] Module 8 (Validation client / FR-29, FR-30) — thin surface coverage
PRD Module 8 (signature zone on PDF + "enregistrer accord client" → status Accepté, FR-30) has no dedicated IA surface or interaction. The signature *zone* is mentioned only as a static PDF element in Flow 1 step 8 ("signature blocks"). The *behavior* of FR-30 (commercial records client agreement → quote auto-transitions to Accepté) is not represented in any flow or component pattern; the only path to Accepté shown is the manual status sheet (Flow 2). This is an MVP-scope module with a behavioral FR that the experience spine doesn't surface.
**Fix:** Add one bullet under Component Patterns or State Patterns covering "Enregistrer l'accord client" (FR-30) and note that it can drive the Accepté transition, OR explicitly defer it in a scope note so the gap is intentional.

### [NIT] FR-11 (soft-delete client) and FR-39 (PWA update prompt) absent from IA/flows
Minor: client deletion (FR-11) and the "Mise à jour disponible" PWA prompt (FR-39) appear in neither IA, component patterns, nor flows. Both are in MVP scope. Low risk (both are edge/admin actions), but worth a one-line acknowledgement.
**Fix (optional):** Add FR-39 update prompt to State Patterns; note FR-11 delete on the clients surface.

---

## 5. Key Flows — Protagonist / Climax / Numbered Steps

| Flow | Named protagonist | Climax beat | Numbered steps |
|---|---|---|---|
| Flow 1 (L137) | **Amadou** (commercial, Niamey) | YES — L148 "**Climax — PDF preview**" explicitly labelled | YES — 1–9 |
| Flow 2 (L151) | **Fatima** (admin) | Implicit (status → Accepté, L158) — not labelled "climax" | YES — 1–4 |
| Flow 3 (L160) | First run / login — **no named protagonist** | None (utility flow) | YES — 1–4 |

**Result: PASS.** The primary/climax flow (Flow 1) fully satisfies all three criteria.

### [NIT] EXPERIENCE.md · Flow 2 & Flow 3 — softer on protagonist/climax
Flow 2 has a named protagonist but no explicit climax label. Flow 3 (login) has no named protagonist and is a pure utility flow. Acceptable — the rubric requires the named protagonist + climax + numbered steps for the *key* flow, which Flow 1 nails. Flagging only for completeness.
**Fix (optional):** Label Flow 2's climax beat; optionally give Flow 3 a protagonist (e.g., "Amadou's first launch") for consistency.

### [NIT] Protagonist name drift vs PRD personas
PRD §2.3 personas are **Amadou** (transitaire), **Fatou** (commerciale), **Ibrahim** (gérant), **Aïcha** (admin). EXPERIENCE.md uses **Amadou** (matches) and **Fatima** (admin) — "Fatima" does not match any PRD persona; the PRD admin is "Aïcha" and the PRD commerciale is "Fatou". Not a correctness defect, but a traceability drift.
**Fix (optional):** Rename "Fatima" → "Aïcha" (admin) to align Flow 2 with PRD §2.3, or note the personas are illustrative.

---

## 6. Internal Contradictions (cross-file token/value/rule consistency)

Checked tokens, radii, shadows, status model, currency, motion rules, accessibility rules across both spines and the decision log.

**Result: Mostly consistent. Two real drifts found (both MINOR), plus the decision-log baseline drift below.**

### [MINOR] CONTRADICTION — Fonts: spines say Spectral + Hanken Grotesk; decision-log "Foundation (inherited)" says Geist
DESIGN.md frontmatter (L43–45) and Typography section commit to **Spectral** (serif) + **Hanken Grotesk** (sans). EXPERIENCE.md agrees. But `.decision-log.md` L21 "Foundation (inherited)" states **"Fonts: Geist Sans + Geist Mono"**. The captured baseline later in the same log (L35) correctly says Spectral + Hanken. So the log internally contradicts itself, and its inherited-foundation line contradicts both final spines.
**Severity rationale:** The two *spines* agree with each other (Spectral/Hanken wins, and DESIGN.md declares "This spine wins on conflict"), so the shipped contract is unambiguous. The defect is a stale line in the decision log only.
**Fix:** Update `.decision-log.md` L21 to "Fonts: Spectral (serif) + Hanken Grotesk (sans)" so the log doesn't carry a contradicted inherited default.

### [MINOR] CONTRADICTION — Radius values: decision-log ranges vs DESIGN.md fixed tokens
`.decision-log.md` L36 captured baseline radii as ranges: "inputs/btn 10–13, card 14–16, dark 14–18". DESIGN.md finalized them to single tokens: input/button **11**, card **15**, dark-block **16** (frontmatter L48–55). The finalized values fall inside the captured ranges, so this is a legitimate distillation, not an error — but if a reviewer diffs log↔spine literally it reads as a mismatch.
**Severity rationale:** DESIGN.md is the authority and its values are self-consistent (frontmatter ↔ Shapes section L184 agree: input/button 11, card 15, dark 16, sheet 22, FAB 18, badge 6, pill 20). No contradiction *within* the shipped spines.
**Fix (optional):** None required for the spines. Optionally annotate the decision log that ranges were resolved to fixed tokens at Finalize.

### Consistency checks that PASSED (no contradiction):
- **Status lifecycle** — 6 states (Brouillon · Validé · Envoyé · Accepté · Expiré · Annulé) identical across DESIGN.md status table, EXPERIENCE.md State Patterns (L108) + status sheet (L87), and PRD glossary/FR-15.
- **Camion formula** — `ceil(tonnage / capacité)` consistent: DESIGN camion card, EXPERIENCE L105, Flow 1 step 5, PRD FR-19. Division-by-zero guard present in both EXPERIENCE (L105) and PRD FR-19.
- **Currency/number format** — FCFA + `Intl.NumberFormat('fr-FR')` / `fr-FR` grouping consistent across EXPERIENCE (L74, L107) and PRD.
- **Quote numbering** — `TEMP-{DEVICE}-{SEQ}` → `DEV-{YYYY}-{XXXX}` consistent: EXPERIENCE Foundation L29 + State L102 + Flow 1 step 9, PRD FR-13.
- **Offline session** — "7 jours" consistent: EXPERIENCE L71/Flow 3 L163, PRD FR-1.
- **Focus ring** — navy `#1B3070`, ≥3:1, color token `focus-ring` consistent across both spines (DESIGN D2 L131, frontmatter L30; EXPERIENCE L115/L125).
- **Amber rule** — "never text/small UI, AA" stated identically in DESIGN (L100/L131, Don'ts) and EXPERIENCE (L131).
- **Elevation scale** — Flat/Raised/Overlay used in DESIGN; EXPERIENCE doesn't re-declare shadow values (correct — visual lives in DESIGN). No conflict.
- **Motion / `prefers-reduced-motion`** — honored in both (DESIGN Shapes L186 filigrane static; EXPERIENCE L118/L129). Consistent.
- **No dark mode v1** — DESIGN D2/Don'ts; EXPERIENCE implies light-only. Consistent.
- **Bottom nav hide rules** — DESIGN L165 (login/wizard/new-client/preview) ↔ EXPERIENCE L48 (login, wizard, new-client, preview). Consistent.

---

## Severity Summary

| Severity | Count |
|---|---|
| BLOCKER | 0 |
| MAJOR | 0 |
| MINOR | 4 |
| NIT | 6 |

**MINOR:** (a) Module 8 / FR-30 thin surface coverage; (b) EXPERIENCE under-references DESIGN tokens as prose not `{token}`; (c) font contradiction in decision-log inherited line; (d) radius range-vs-fixed drift in decision-log.

**Overall:** Both spines are publish-ready. The two cross-file "contradictions" both live in the **decision log**, not in the shipped spines — the spines agree with each other and DESIGN.md's "spine wins on conflict" clause makes the contract unambiguous. The only substantive product gap is Module 8 (FR-30 record-client-agreement → Accepté), which the experience spine doesn't surface.
