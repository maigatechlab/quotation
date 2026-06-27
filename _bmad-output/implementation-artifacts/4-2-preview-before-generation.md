---
story_key: 4-2-preview-before-generation
epic_num: 4
story_num: 2
status: review
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 4.2 : Aperçu avant génération (FR-32)

**Statut :** review

## Story

**En tant que** commercial,
**Je veux** aperçevoir le devis avant de générer le PDF final,
**Afin que** je vérifie le rendu et corrige avant envoi.

---

## Critères d'acceptation (BDD)

**AC1 — Rendu HTML fidèle au PDF (FR-32 + UX-DR17)**

```
GIVEN  la page /devis/[id] (aperçu du devis)
WHEN   le commercial consulte l'aperçu
THEN   le rendu HTML reproduit fidèlement le document PDF :
       — en-tête navy avec logo, raison sociale, RCCM, NIF, coordonnées
       — rule amber 2px entre en-tête et corps
       — bloc numéro/dates/objet/référence
       — bloc client (depuis clientSnapshot — données figées FR-10)
       — bloc trajet (départ → arrivée)
       — bloc marchandise (nature, tonnage, camions, valeur FCFA)
       — tableau de prestations bordé avec totaux par ligne
       — barre TOTAL DEVIS navy en bas du tableau
       — conditions de paiement
       — blocs de signature (signataire société, zone client — Story 4.3)
       — pied de page "Document généré par Quotation Logistique · {date}"
AND    la tolérance visuelle est ≤2% vs UX-DR17 (PDF document card)
AND    le rendu HTML est scrollable (hauteur auto, no clip)
```

**AC2 — Boutons Modifier et Générer PDF**

```
GIVEN  la page /devis/[id]
WHEN   l'aperçu est affiché
THEN   un bouton "Modifier" (secondaire) est visible en bas
AND    un bouton "Générer le PDF" (primaire, navy) est visible en bas
AND    "Modifier" navigue vers /devis/nouveau (ou ouvre le wizard en édition) — Story 3.x scope
       Pour MVP Story 4.2 : router.back() OU lien vers /devis est acceptable
AND    "Générer le PDF" déclenche la génération pdf-generator.ts (Story 4.1)
```

**AC3 — Réutilisation du template PDF**

```
GIVEN  le PdfTemplate de Story 4.1 (src/components/pdf/pdf-template.tsx)
WHEN   l'aperçu HTML est rendu sur /devis/[id]
THEN   le MÊME composant PdfTemplate est utilisé pour l'aperçu visible
       (pas un composant différent — une seule source de vérité)
AND    le conteneur hors-écran #pdf-template-container (Story 4.1) est présent pour la capture
AND    le conteneur visible reproduit le même rendu avec une légère mise en page responsive
       (max-width centrée, ombre Overlay, fond app-bg)
```

**AC4 — États de chargement et d'erreur**

```
GIVEN  la page /devis/[id]
WHEN  le devis est en cours de chargement (quote === undefined)
THEN   un skeleton ou spinner de chargement s'affiche
AND    le message "Chargement du devis…" est annoncé aux lecteurs d'écran (aria-live)

WHEN  le devis est introuvable (quote === null)
THEN   un message "Devis introuvable" s'affiche avec un bouton "Retour aux devis"
AND    aucune génération PDF n'est possible

WHEN  une erreur de génération se produit
THEN   un message d'erreur français inline s'affiche sous les boutons
AND    le bouton "Générer le PDF" redevient cliquable (retry)
```

**AC5 — Bottom nav absente sur la page d'aperçu**

```
GIVEN  la page /devis/[id]
WHEN   l'aperçu est affiché
THEN   la bottom nav n'est PAS affichée (UX-DR16 : masquée sur "preview")
AND    le FAB amber n'est PAS affiché
AND    le contenu n'est pas masqué par la bottom nav
```

**AC6 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/pdf/quote-preview.tsx` — UPDATE : enrichir le rendu HTML visible de
  l'aperçu (Story 4.1 a créé ce fichier avec un rendu minimal ; Story 4.2 le beautifie
  avec le PdfTemplate réutilisé)
- `src/app/(app)/layout.tsx` — UPDATE (si pas fait en Story 4.1) : masquage bottom nav
  sur /devis/[id]
- `src/messages/fr-NE.json` — UPDATE : compléter les keys `devis.apercu.*` si manquantes

**EXCLU :**
- `src/components/pdf/pdf-template.tsx` — créé en Story 4.1, PAS de modification
  structurelle (seulement utilisation depuis quote-preview.tsx)
- `src/components/pdf/pdf-generator.ts` — créé en Story 4.1, NON modifié
- Story 4.3 : zone de signature client
- Story 4.4 : Web Share API / export
- Story 4.5 : accord client / transition statut

**Note périmètre :** Story 4.2 "beautifie" la page créée en Story 4.1.
Si Story 4.1 n'est pas encore implémentée, Story 4.2 la couvre aussi (les deux sont étroitement liées).

---

## Tâches / Sous-tâches

### T1 — Lire et comprendre l'état de `src/components/pdf/quote-preview.tsx`

- [x] Lire le fichier existant (créé Story 4.1)
- [x] Identifier ce qui est déjà implémenté vs ce qui manque pour le rendu complet
- [x] Identifier si le masquage bottom nav a été fait dans layout.tsx

### T2 — Enrichir `src/components/pdf/quote-preview.tsx`

Le composant `QuotePreview` doit présenter l'aperçu HTML du devis en utilisant
`PdfTemplate` comme source unique de vérité visuelle.

**Structure cible :**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveQuote } from "@/hooks/use-live-quote";
import { useLiveCompany } from "@/hooks/use-live-company";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import type { Role } from "@/lib/permissions";

interface QuotePreviewProps {
  quoteId: string;
  userId: string;
  role: Role;
}

export function QuotePreview({ quoteId, userId, role }: QuotePreviewProps) {
  const t = useTranslations("devis");
  const router = useRouter();
  const { quote, lines } = useLiveQuote(quoteId);
  const company = useLiveCompany();
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // État chargement
  if (quote === undefined) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4"
           role="status" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-navy border-t-transparent" />
        <p className="text-sm text-text-muted">{t("apercu.loading")}</p>
      </div>
    );
  }

  // Devis introuvable
  if (quote === null) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4">
        <p className="text-sm text-text-secondary">{t("apercu.notFound")}</p>
        <button
          onClick={() => router.push("/devis")}
          className="h-11 rounded-xl border border-border px-6 text-sm font-medium text-text-secondary"
        >
          {t("apercu.backToList")}
        </button>
      </div>
    );
  }

  async function handleGenerate() {
    if (!quote) return;
    setIsGenerating(true);
    setGenError(null);
    try {
      const snapshot = quote.clientSnapshot as Record<string, unknown> | null;
      const clientName = (snapshot?.companyName as string) ?? "Client";
      const filename = `Devis-${quote.number}-${clientName}.pdf`;
      const { generateQuotePdf } = await import("@/components/pdf/pdf-generator");
      await generateQuotePdf("pdf-template-container", filename);
    } catch {
      setGenError(t("pdf.errorGeneric"));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-bg pb-24">
      {/* Aperçu visible — centré, ombre Overlay */}
      <div className="mx-auto w-full max-w-[840px] px-4 py-6">
        <div
          className="overflow-hidden rounded-[4px]"
          style={{ boxShadow: "0 8px 30px -10px rgba(40,30,15,.4)" }}
        >
          {/* PdfTemplate — MÊME composant que pour la capture pdf-generator */}
          <PdfTemplate quote={quote} lines={lines} company={company ?? null} />
        </div>
      </div>

      {/* Conteneur hors-écran pour html2canvas — OBLIGATOIRE */}
      <div
        id="pdf-template-container"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "794px",
          zIndex: -1,
        }}
      >
        <PdfTemplate quote={quote} lines={lines} company={company ?? null} />
      </div>

      {/* Barre d'action sticky en bas */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/92 px-4 py-3 backdrop-blur-sm">
        {genError && (
          <p className="mb-2 text-center text-xs text-destructive">{genError}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface-alt"
          >
            {t("apercu.modifier")}
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
          >
            {isGenerating ? t("pdf.generating") : t("pdf.generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [x] Remplacer le contenu de `quote-preview.tsx` par la version enrichie ci-dessus
- [x] Vérifier que PdfTemplate est importé depuis `@/components/pdf/pdf-template`
- [x] S'assurer que `useLiveQuote` et `useLiveCompany` sont importés correctement
- [x] `pnpm typecheck` — zéro erreur

### T3 — Vérifier `src/app/(app)/layout.tsx` (masquage bottom nav)

- [x] Lire le layout actuel
- [x] Vérifier que `/devis/[id]` (ou le pattern `/devis/` + segment non "nouveau") est
  dans la liste des routes qui masquent la bottom nav
- [x] Si ce n'est pas fait (Story 4.1 n'a pas modifié layout.tsx) : ajouter le masquage

Pattern probable dans le layout :
```tsx
// Exemple de pattern de masquage — à adapter selon l'implémentation existante
const pathname = usePathname();
const hideNav = 
  pathname.startsWith("/devis/nouveau") ||
  pathname.startsWith("/clients/nouveau") ||
  // Pattern pour /devis/[id] (preview) — toute route /devis/ avec un segment UUID
  /^\/devis\/[^/]+$/.test(pathname) && pathname !== "/devis";
```

- [x] `pnpm typecheck` — zéro erreur

### T4 — Compléter `src/messages/fr-NE.json`

- [x] Vérifier les keys sous `devis.apercu` (certaines peuvent être présentes depuis Story 4.1) :
  ```json
  "apercu": {
    "title": "Aperçu du devis",
    "modifier": "Modifier",
    "notFound": "Devis introuvable.",
    "loading": "Chargement du devis…",
    "backToList": "Retour aux devis",
    "scrollHint": "Faites défiler pour voir le document complet"
  }
  ```
- [x] Si les keys `devis.pdf.*` sont absentes (Story 4.1 non implémentée) :
  ```json
  "pdf": {
    "generate": "Générer le PDF",
    "generating": "Génération en cours…",
    "errorGeneric": "Erreur lors de la génération du PDF. Veuillez réessayer.",
    "footer": "Document généré par Quotation Logistique",
    "header": { "rccm": "RCCM", "nif": "NIF" },
    "sections": {
      "client": "Client",
      "trajet": "Trajet",
      "marchandise": "Marchandise",
      "prestations": "Prestations",
      "total": "TOTAL DEVIS",
      "conditions": "Conditions de paiement",
      "signatures": "Signatures"
    },
    "table": {
      "designation": "Désignation",
      "qty": "Qté",
      "unitPrice": "Prix unitaire",
      "total": "Total"
    }
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [x] `pnpm build` passe sans erreur
- [x] Navigation `/devis/{uuid}` → aperçu scrollable s'affiche ✓
- [x] En-tête navy visible avec raison sociale et RCCM/NIF ✓
- [x] Rule amber séparateur visible ✓
- [x] Tableau prestations avec bordures et barre TOTAL navy ✓
- [x] Bottom nav absente ✓
- [x] Bouton "Modifier" → router.back() ✓
- [x] Bouton "Générer le PDF" → génération + téléchargement ✓
- [x] Devis inexistant → message + bouton retour ✓

---

## Dev Notes

### CRITIQUE — Une seule source de vérité visuelle : PdfTemplate

Le principe clé de Story 4.2 : **le même composant `PdfTemplate` sert à la fois pour
l'aperçu HTML visible ET pour la capture html2canvas**.

```
QuotePreview
├── [visible]    <PdfTemplate .../>           ← rendu scrollable pour l'utilisateur
└── [hors-écran] <PdfTemplate .../>           ← capturé par html2canvas pour le PDF
    id="pdf-template-container"
```

**INTERDIT :** créer un second composant "préview-only" qui diverge du template PDF.
Si le dev crée un composant séparé, les deux sorties (HTML et PDF) vont dériver.

```tsx
// CORRECT — une seule source de vérité
<div className="...">
  <PdfTemplate quote={quote} lines={lines} company={company} />
</div>
<div id="pdf-template-container" style={{ position: "absolute", left: "-9999px" }}>
  <PdfTemplate quote={quote} lines={lines} company={company} />
</div>

// INCORRECT — deux composants différents → dérive garantie
<QuotePreviewHTML quote={quote} />   // composant séparé pour le rendu visible
<PdfTemplate ... />                  // composant séparé pour la capture
```

### CRITIQUE — Le conteneur hors-écran #pdf-template-container doit rester dans le DOM

Le conteneur `#pdf-template-container` est requis pour `generateQuotePdf()` qui fait :
```ts
const element = document.getElementById("pdf-template-container");
```

Il doit être **dans le DOM** (pas conditionnellement unmounté) quand `handleGenerate`
est appelé. Puisque le devis est non-null quand les boutons sont affichés, le conteneur
est présent.

### CRITIQUE — Width fixe 794px sur le conteneur hors-écran

```tsx
// CORRECT — width fixe A4 @96dpi pour html2canvas
<div
  id="pdf-template-container"
  style={{
    position: "absolute",
    left: "-9999px",
    top: 0,
    width: "794px",   // OBLIGATOIRE — A4 portrait @96dpi
    zIndex: -1,
  }}
>
```

Le conteneur visible (aperçu utilisateur) utilise `max-width: 840px` et est responsive.
Le conteneur hors-écran doit avoir EXACTEMENT `794px` pour que les proportions A4
correspondent.

### CRITIQUE — Rendu PdfTemplate : styles inline vs Tailwind

`PdfTemplate` (Story 4.1) utilise des **styles inline** pour les éléments critiques
(en-tête, rule, TOTAL bar). Cette approche fonctionne dans LES DEUX contextes :
- Aperçu visible → les styles inline s'appliquent normalement
- Capture hors-écran → html2canvas lit les styles inline (fiables)

Si Story 4.1 a utilisé des classes Tailwind pour certains éléments, vérifier qu'elles
sont purgées correctement (les classes dans le template hors-écran peuvent être purgées
si elles ne sont pas référencées dans le code visible).

**Solution safe** : si un style visuel ne passe pas dans la capture, convertir la
classe Tailwind en style inline dans `PdfTemplate`.

### CRITIQUE — Masquage bottom nav : pattern exact à lire

Le masquage de la bottom nav dépend de l'implémentation dans `src/app/(app)/layout.tsx`.
**Lire ce fichier avant d'écrire le code** pour éviter de casser la logique existante.

Patterns possibles selon les stories précédentes :
1. `usePathname()` + liste de strings → ajouter `/devis/[id]` comme pattern regex
2. Prop passée depuis la page Server Component → ajouter à la page /devis/[id]
3. Segment de route `(preview)` → restructurer le routing (éviter en MVP)

Pattern recommandé si non encore implémenté :
```tsx
// Dans layout.tsx
"use client";
import { usePathname } from "next/navigation";

const pathname = usePathname();
// Masquer sur wizard (/devis/nouveau), new-client, preview (/devis/{id})
const hideBottomNav =
  pathname === "/devis/nouveau" ||
  pathname === "/clients/nouveau" ||
  (/^\/devis\/[0-9a-f-]{36}$/.test(pathname));  // UUID pattern
```

### CRITIQUE — Prop `company` : `CompanyLocal | undefined | null`

`useLiveCompany()` retourne `CompanyLocal | undefined | null` :
- `undefined` : en cours de chargement
- `null` : aucune société trouvée
- `CompanyLocal` : société disponible

Dans le template rendu, la prop doit être `CompanyLocal | null` (pas undefined).
En attendant le chargement de la société, ne pas bloquer l'aperçu :

```tsx
// CORRECT — passer null si company est undefined (chargement)
<PdfTemplate quote={quote} lines={lines} company={company ?? null} />
```

### CRITIQUE — noUncheckedIndexedAccess dans PdfTemplate

```typescript
// Si PdfTemplate accède aux tableaux indexés
const phone = company?.phones[0];       // TS ERROR
const phone = company?.phones?.[0];     // CORRECT
```

### CRITIQUE — Scroll et hauteur minimale

L'aperçu doit être scrollable pour les devis longs. La structure :
```tsx
<div className="flex min-h-screen flex-col bg-app-bg pb-24">
  {/* pb-24 laisse de l'espace pour la barre d'action sticky */}
  <div className="mx-auto w-full max-w-[840px] px-4 py-6">
    {/* le rendu du devis — hauteur auto */}
  </div>
</div>
```

`pb-24` (96px) compense la barre d'action sticky `fixed bottom-0` de hauteur ~72px.

### CRITIQUE — Accessibilité de l'état de chargement

```tsx
// CORRECT — spinner accessible
<div role="status" aria-live="polite">
  <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-navy border-t-transparent" />
  <p className="text-sm text-text-muted">{t("apercu.loading")}</p>
</div>

// CORRECT — conteneur hors-écran masqué aux lecteurs d'écran
<div id="pdf-template-container" aria-hidden="true" style={...}>
  <PdfTemplate ... />
</div>
```

### Design tokens pour l'aperçu

| Élément | Class Tailwind / Style |
|---|---|
| Fond de page | `bg-app-bg` (#f7f4ee) |
| Ombre document | `style={{ boxShadow: "0 8px 30px -10px rgba(40,30,15,.4)" }}` (Overlay) |
| Rayon document | `rounded-[4px]` (paper feel — DESIGN.md) |
| Barre actions fond | `bg-surface/92 backdrop-blur-sm` |
| Barre actions bordure | `border-t border-border` |
| Bouton primaire | `bg-brand-navy text-text-on-dark hover:bg-brand-navy-deep` |
| Bouton secondaire | `border border-border text-text-secondary hover:bg-surface-alt` |
| Erreur inline | `text-destructive text-xs` |

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Créer un composant HTML d'aperçu distinct de PdfTemplate | Réutiliser PdfTemplate dans les deux contextes |
| `display: none` sur le conteneur hors-écran | `position: absolute; left: -9999px` |
| Omettre `aria-hidden="true"` sur le conteneur hors-écran | `aria-hidden="true"` obligatoire |
| Masquer bottom nav sans lire layout.tsx d'abord | Lire layout.tsx avant toute modification |
| `company?.phones[0]` (IndexedAccess) | `company?.phones?.[0]` |
| `if (company === undefined) return null` (bloquer aperçu) | `company ?? null` passé au template |
| Enlever `id="pdf-template-container"` du DOM quand quote chargé | Toujours présent quand quote != null |

### Héritage de Story 4.1

**`src/components/pdf/pdf-template.tsx`** (créé Story 4.1) :
- Accepte props `{ quote, lines, company }` avec styles inline
- Dimensions : `width: 794px`, marges 56px (~15mm)
- En-tête navy, rule amber, barre TOTAL navy
- `pnpm typecheck` doit déjà passer

**`src/components/pdf/pdf-generator.ts`** (créé Story 4.1) :
- `generateQuotePdf(containerId: string, filename: string): Promise<void>`
- Lazy-load jsPDF + html2canvas via `await import(...)`
- `useCORS: true`, `scale: 2`

**`src/hooks/use-live-quote.ts`** (créé Story 4.1) :
- `useLiveQuote(id: string): { quote: QuoteLocal | null | undefined, lines: QuoteLineLocal[] }`
- Pattern liveQuery natif Dexie

**`src/app/(app)/devis/[id]/page.tsx`** (créé Story 4.1) :
- Server Component avec `getSessionWithRole` + `can(role, "quote.read")`
- Rend `<QuotePreview quoteId={id} userId={userId} role={role} />`

### Commandes pour le dev agent

```bash
# 1. Lire les fichiers créés par Story 4.1
# src/components/pdf/pdf-template.tsx
# src/components/pdf/pdf-generator.ts
# src/components/pdf/quote-preview.tsx
# src/app/(app)/devis/[id]/page.tsx
# src/app/(app)/layout.tsx

# 2. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 3. Build
pnpm build
```

---

## Références

- [Epics §Story 4.2] — FR-32 (aperçu avant génération, rendu HTML fidèle, boutons Modifier/Générer)
- [UX-DR17] — PDF document card : spécification visuelle complète
- [EXPERIENCE.md §Flow 1 étape 8] — "Climax — PDF preview : a clean white document unfurls"
- [EXPERIENCE.md §Flow 2 étape 3] — "Opens a quote → PDF preview"
- [UX-DR16] — Bottom nav masquée sur "preview"
- [Architecture §Frontend] — "bottom nav hidden on login/wizard/new-client/preview"
- [src/components/pdf/pdf-template.tsx] — à lire en priorité (Story 4.1)
- [src/components/pdf/pdf-generator.ts] — generateQuotePdf() (Story 4.1)
- [src/components/pdf/quote-preview.tsx] — à enrichir (Story 4.1 version minimale)
- [src/hooks/use-live-quote.ts] — useLiveQuote (Story 4.1)
- [src/hooks/use-live-company.ts] — useLiveCompany (pattern)
- [src/app/(app)/layout.tsx] — masquage bottom nav (à lire avant T3)
- [DESIGN.md §Elevation] — Overlay shadow pour le document card
- [DESIGN.md §Shapes] — "PDF document card radius 4 (paper feel)"

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- T1: Story 4.1 avait déjà créé `quote-preview.tsx` avec conteneur hors-écran mais visible preview sous forme de summary card (pas PdfTemplate).
- T1: `bottom-nav-wrapper.tsx` avait déjà le masquage correct via regex `/^\/devis\/(?!nouveau)[^/]+/`.
- T2: Story 4.4 avait déjà modifié `quote-preview.tsx` pour ajouter share functionality — conservé lors de l'enrichissement visible.
- T3: `layout.tsx` n'a pas besoin de modification — `BottomNavWrapper` gère déjà le masquage.
- T4: Keys `backToList` et `scrollHint` manquantes dans `devis.apercu` — ajoutées.
- T5: ESLint échouait sur `.claude/worktrees/**` (fichiers hors-projet) — ajout de `.claude/worktrees/**` aux ignores dans `eslint.config.mjs`.
- T5: `pnpm check` : 0 erreurs, 206/206 tests passent.

### Completion Notes List

- AC1/AC3 : `QuotePreview` utilise maintenant `PdfTemplate` comme source unique de vérité visuelle — rendu visible centré max-w-840px avec ombre Overlay et border-radius 4px (paper feel). Conteneur hors-écran #pdf-template-container 794px toujours présent quand quote != null.
- AC2 : Boutons "Modifier" (router.back(), secondaire) et "Générer le PDF" (primaire navy) dans barre sticky. Story 4.4 a ajouté un 3ème bouton "Partager" (amber) — conservé.
- AC4 : Loading state avec spinner animé + `role="status" aria-live="polite"`. Not found state avec `router.push("/devis")` et `t("apercu.backToList")`. genError affiché en rouge sous les boutons avec `role="alert"`.
- AC5 : Bottom nav masquée via `BottomNavWrapper` avec regex `/^\/devis\/(?!nouveau)[^/]+/` — déjà implémenté avant cette story.
- AC6 : `pnpm check` passe sans erreurs. 206 tests passent sans régression. Fix `eslint.config.mjs` pour exclure `.claude/worktrees/**`.

### File List

- `src/components/pdf/quote-preview.tsx` (modifié — enrichissement visible avec PdfTemplate + fix états chargement/notFound/accessibilité)
- `src/messages/fr-NE.json` (modifié — ajout `devis.apercu.backToList` et `devis.apercu.scrollHint`)
- `eslint.config.mjs` (modifié — ajout `.claude/worktrees/**` aux ignores pour corriger erreurs lint pré-existantes)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour — 4-2 → review)
- `_bmad-output/implementation-artifacts/4-2-preview-before-generation.md` (ce fichier)

### Change Log

- 2026-06-26 : Story 4.2 implémentée — enrichissement `QuotePreview` avec `PdfTemplate` comme rendu visible (AC1/AC3), fix états chargement/erreur accessibles (AC4), ajout `backToList`+`scrollHint` dans fr-NE.json (T4), correction `eslint.config.mjs` pour `.claude/worktrees/**` (AC6).
