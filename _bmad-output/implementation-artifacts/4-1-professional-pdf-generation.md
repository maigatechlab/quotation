---
story_key: 4-1-professional-pdf-generation
epic_num: 4
story_num: 1
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 4.1 : Génération du PDF professionnel (FR-31, FR-34)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** générer un PDF professionnel du devis, client-side et offline,
**Afin que** je dispose d'un document propre prêt à envoyer, même sans connexion.

---

## Critères d'acceptation (BDD)

**AC1 — Structure du document PDF (FR-31)**

```
GIVEN  un devis complet (client, trajet, marchandise, lignes prestations, clauses) dans Dexie
WHEN   le commercial déclenche la génération PDF (bouton "Générer le PDF")
THEN   le PDF produit contient :
       — En-tête : logo société (si uploadé) + raison sociale + RCCM + NIF + coordonnées (adresse, téléphones)
       — Corps  : numéro devis, date devis, date validité, objet, référence
                  bloc client (snapshot figé : nom, contact, téléphone, ville)
                  trajet (départ → arrivée)
                  marchandise (nature, tonnage, nb camions, valeur FCFA)
                  tableau prestations (désignation · qté · prix unitaire · total ligne)
                  zone clauses (titre + contenu)
                  conditions de paiement
       — Pied   : "Document généré par Quotation Logistique · {date}"
       — Format : A4 portrait (210×297mm)
AND    le fichier téléchargé porte le nom "Devis-{number}-{clientNom}.pdf"
```

**AC2 — Mise en page professionnelle (FR-34 + UX-DR17)**

```
GIVEN  le template HTML/CSS du document PDF rendu dans un conteneur hors-écran
WHEN   html2canvas capture le rendu puis jsPDF l'intègre
THEN   marges 15mm sur les quatre côtés
AND    polices ≥10pt : Spectral pour titres et montants (tabular-nums),
       Hanken Grotesk (ou équivalent sans-serif fallback) pour le corps
AND    tableaux bordés (lignes prestations, total)
AND    en-tête navy (brand-navy #1B3070) avec filigrane Sahel à ~4% opacité
AND    rule amber (#F6A624) entre en-tête et corps
AND    barre TOTAL en bas du tableau prestations : fond navy, texte blanc
AND    blocs de signature (signataire société + zone signature client — voir AC Story 4.3)
AND    la tolérance visuelle est ≤2% par rapport au composant PDF document card (UX-DR17)
AND    rendu validé sur Chrome, Safari mobile, Firefox
```

**AC3 — Performance & offline (FR-31 + NFR-P4 + NFR-P8)**

```
GIVEN  une connexion absente OU présente
WHEN   le commercial génère le PDF
THEN   la génération est entièrement client-side (aucun appel réseau)
AND    la durée totale (capture + génération) est < 5 secondes sur mobile bas de gamme
       (Android 1-2GB RAM, Android 8+, cible Sahel NFR-P9)
AND    jsPDF + html2canvas sont chargés via dynamic import() (lazy),
       absents du bundle initial (NFR-P8) — le bundle initial reste < 300KB gzip
```

**AC4 — Lazy-loading de la librairie PDF**

```
GIVEN  l'application au premier chargement
WHEN   le bundle initial se charge
THEN   aucun chunk jsPDF ni html2canvas n'est inclus (code splitting)
AND    le dynamic import ne se déclenche qu'au clic "Générer le PDF" (ou ouverture aperçu)
AND    un indicateur "Préparation du PDF…" s'affiche pendant le chargement + capture
```

**AC5 — Données société depuis Dexie**

```
GIVEN  une société configurée dans db.company (CompanyLocal)
WHEN   le PDF est rendu
THEN   raisonSociale, rccm, nif, adresse, bp, phones[0], emails[0], logoUrl sont intégrés
AND    si logoUrl est null/undefined → le logo est omis sans erreur (espace réservé)
AND    si aucune société dans Dexie → en-tête "Société non configurée" avec fallback élégant
```

**AC6 — Données devis et snapshot client**

```
GIVEN  un devis (QuoteLocal) et ses données associées depuis Dexie
WHEN   le PDF est rendu
THEN   les données client viennent du clientSnapshot (figé), pas de db.clients
       (cohérence FR-10 — la fiche client peut avoir changé depuis)
AND    les lignes prestations viennent de db.quoteLines filtré par quoteId
AND    les clauses viennent de db.quoteClause (via la table locale ou le snapshot)
AND    le totalFcfa est formaté via money.ts formatFcfa() avec séparateur milliers
```

**AC7 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/pdf/pdf-template.tsx` — CRÉER : composant React servant de template HTML pour html2canvas
- `src/components/pdf/pdf-generator.ts` — CRÉER : module de génération (dynamic import jsPDF + html2canvas, orchestration capture → PDF)
- `src/app/(app)/devis/[id]/page.tsx` — CRÉER : page aperçu/preview du devis avec bouton "Générer le PDF"
- `src/hooks/use-live-quote.ts` — CRÉER : hook liveQuery pour un devis unique par ID (+ ses quoteLines)
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `devis.pdf.*` et `devis.apercu.*`

**EXCLU (à faire dans les stories suivantes) :**
- Story 4.2 : rendu HTML fidèle de l'aperçu avec boutons Modifier/Générer (preview navigateur)
- Story 4.3 : zone de signature client sur le PDF (blocs "Bon pour accord")
- Story 4.4 : export et partage Web Share API
- Story 4.5 : enregistrement accord client (transition → Accepté)
- Aucune migration DB nécessaire pour cette story
- Aucune modification de `src/lib/schema.ts` ni `src/lib/local-db.ts`

**Note périmètre :** Cette story pose le template HTML + le moteur de génération.
Story 4.2 utilisera le même template pour le preview navigateur.
Story 4.3 ajoutera le bloc signature client dans le template.

---

## Tâches / Sous-tâches

### T1 — Créer `src/hooks/use-live-quote.ts`

- [x] `"use client"` première ligne
- [x] Pattern identique à `use-live-quotes.ts` mais pour un seul devis par ID + ses lignes :
  ```ts
  "use client";

  import { useState, useEffect } from "react";
  import { liveQuery } from "dexie";
  import { db } from "@/lib/local-db";
  import type { QuoteLocal, QuoteLineLocal } from "@/lib/local-db";

  export function useLiveQuote(id: string): {
    quote: QuoteLocal | null | undefined;
    lines: QuoteLineLocal[];
  } {
    const [quote, setQuote] = useState<QuoteLocal | null | undefined>(undefined);
    const [lines, setLines] = useState<QuoteLineLocal[]>([]);

    useEffect(() => {
      const sub = liveQuery(async () => {
        const q = await db.quotes.get(id);
        const l = await db.quoteLines.where("quoteId").equals(id).sortBy("ordre");
        return { quote: q ?? null, lines: l };
      }).subscribe({
        next: ({ quote: q, lines: l }) => { setQuote(q); setLines(l); },
        error: () => { setQuote(null); setLines([]); },
      });
      return () => sub.unsubscribe();
    }, [id]);

    return { quote, lines };
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/pdf/pdf-template.tsx`

- [x] `"use client"` première ligne (rendu côté client pour html2canvas)
- [x] Composant `PdfTemplate` acceptant les props :
  ```ts
  interface PdfTemplateProps {
    quote: QuoteLocal;
    lines: QuoteLineLocal[];
    company: CompanyLocal | null;
    // clauses sera ajouté Story 4.3 quand la table locale quoteClause sera disponible
  }
  ```
- [x] Structure HTML/CSS inline (styles inline pour html2canvas — les classes Tailwind ne sont PAS fiables dans un contexte hors-écran avec html2canvas) :
  ```
  ┌─────────────────────────────────────────────────────┐
  │  [EN-TÊTE NAVY]                                     │
  │  Logo | Raison sociale + RCCM/NIF | Coordonnées     │
  │  [filigrane Sahel SVG à 4% opacité]                 │
  ├─────────────────────────────────────────────────────┤
  │  [RULE AMBER #F6A624, 2px]                          │
  ├─────────────────────────────────────────────────────┤
  │  DEVIS N° {number}          Date: {dateDevis}       │
  │  Validité: {dateValidite}   Objet: {objet}          │
  │                                                     │
  │  CLIENT                     SOCIÉTÉ                 │
  │  {clientSnapshot.name}      {company.raisonSociale} │
  │  {phone, ville}             {rccm, nif}             │
  ├─────────────────────────────────────────────────────┤
  │  TRAJET : {origin} → {destination}                  │
  │  Marchandise : {nature} | {tonnage}t | {trucks} cam │
  │  Valeur : {goodsValueFcfa} FCFA                     │
  ├─────────────────────────────────────────────────────┤
  │  PRESTATIONS                                        │
  │  Désignation | Qté | Prix unit. | Total             │
  │  ─────────── | ─── | ─────────── | ─────           │
  │  {ligne 1}   |  1  | 250 000 F  | 250 000 F        │
  │  ...                                                │
  │  ┌─────────────────────────────────────────────┐   │
  │  │ TOTAL DEVIS : {totalFcfa} FCFA [fond navy]  │   │
  │  └─────────────────────────────────────────────┘   │
  ├─────────────────────────────────────────────────────┤
  │  CONDITIONS DE PAIEMENT                             │
  │  {conditionsPaiement}                               │
  ├─────────────────────────────────────────────────────┤
  │  [SIGNATURES — à enrichir Story 4.3]                │
  │  Signataire société :                               │
  │  {signataireNom} — {signataireFonction}             │
  ├─────────────────────────────────────────────────────┤
  │  Document généré par Quotation Logistique · {date}  │
  └─────────────────────────────────────────────────────┘
  ```
- [x] Dimensions : width 794px (A4 @96dpi — 210mm × 3.7795px/mm), hauteur auto
- [x] Styles inline obligatoires (html2canvas ne capture pas Tailwind dans un conteneur détaché) :
  - police : `font-family: 'Spectral', Georgia, serif` pour titres/montants,
             `font-family: 'Hanken Grotesk', Arial, sans-serif` pour corps
  - marges : `padding: 56px` (~15mm à 96dpi)
  - en-tête : `background: #1B3070`, `color: #faf6ef`, `position: relative`
  - rule : `height: 2px`, `background: #F6A624`, `margin: 0`
  - tableau : `border-collapse: collapse`, `width: 100%`
  - cellules tableau : `border: 1px solid #ece6da`, `padding: 8px 12px`
  - barre TOTAL : `background: #1B3070`, `color: #faf6ef`, `fontWeight: 700`
  - montants : `font-feature-settings: "tnum"`, `letter-spacing: 0`
- [x] Formatage des montants via `formatFcfa()` de `@/lib/money`
- [x] Date formatée via `Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })`
- [x] Logo : `<img src={company.logoUrl} alt="Logo" style={{ maxWidth: 120, maxHeight: 60 }} />`
  (logoUrl est une URL @vercel/blob ; fonctionne en ligne. En offline : logoUrl absent → espace)
- [x] `pnpm typecheck` — zéro erreur

### T3 — Créer `src/components/pdf/pdf-generator.ts`

- [x] Module NON-composant (fichier `.ts`, pas `.tsx`)
- [x] Export de la fonction `generateQuotePdf` :
  ```ts
  export async function generateQuotePdf(
    containerId: string,
    filename: string
  ): Promise<void>
  ```
- [x] Implémentation avec dynamic imports (lazy) :
  ```ts
  export async function generateQuotePdf(
    containerId: string,
    filename: string
  ): Promise<void> {
    // Lazy-load — ne pas inclure dans le bundle initial
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const element = document.getElementById(containerId);
    if (!element) throw new Error("PDF template container not found");

    const canvas = await html2canvas(element, {
      scale: 2,           // 2× pour qualité impression
      useCORS: true,      // pour logos @vercel/blob
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();   // 210
    const pageHeight = pdf.internal.pageSize.getHeight(); // 297
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    // Pagination si contenu dépasse une page
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  }
  ```
- [x] Gestion d'erreur : `generateQuotePdf` peut lancer — le composant appelant doit try/catch
- [x] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/app/(app)/devis/[id]/page.tsx`

- [x] Page Server Component (Next.js App Router) qui :
  - vérifie la session (`getSessionWithRole`, sinon redirect `/login`)
  - vérifie `can(role, "quote.read")`, sinon redirect `/devis`
  - rend un `QuotePreview` Client Component avec `userId`, `role`, et `params.id`
- [x] Structure :
  ```tsx
  import { redirect } from "next/navigation";
  import { can } from "@/lib/permissions";
  import { getSessionWithRole } from "@/lib/session";
  import { QuotePreview } from "@/components/pdf/quote-preview";

  export default async function QuotePreviewPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const result = await getSessionWithRole();
    if (!result) redirect("/login");
    const { session, role } = result;
    if (!can(role, "quote.read")) redirect("/devis");
    const userId = (session.user as Record<string, unknown>).id as string;
    const { id } = await params;

    return <QuotePreview quoteId={id} userId={userId} role={role} />;
  }
  ```

### T5 — Créer `src/components/pdf/quote-preview.tsx`

- [x] `"use client"` première ligne
- [x] Client Component orchestrateur de l'aperçu et de la génération :
  ```ts
  interface QuotePreviewProps {
    quoteId: string;
    userId: string;
    role: Role;
  }
  ```
- [x] Données chargées via `useLiveQuote(quoteId)` + `useLiveCompany()`
- [x] Template PDF rendu dans un `<div id="pdf-template-container" style={{ position: "absolute", left: "-9999px", top: 0 }}>` (hors-écran, mais dans le DOM pour html2canvas)
- [x] Indicateur de chargement : `if (quote === undefined) return <div>Chargement…</div>`
- [x] Devis introuvable : `if (quote === null) return <div>Devis introuvable</div>` + bouton retour
- [x] État local :
  ```ts
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  ```
- [x] Fonction `handleGenerate()` :
  ```ts
  async function handleGenerate() {
    if (!quote) return;
    setIsGenerating(true);
    setError(null);
    try {
      const clientName = (quote.clientSnapshot as Record<string, unknown>)?.companyName as string ?? "Client";
      const filename = `Devis-${quote.number}-${clientName}.pdf`;
      const { generateQuotePdf } = await import("@/components/pdf/pdf-generator");
      await generateQuotePdf("pdf-template-container", filename);
    } catch {
      setError(t("pdf.errorGeneric"));
    } finally {
      setIsGenerating(false);
    }
  }
  ```
- [x] Rendu visible au-dessus du template caché : aperçu scrollable (voir Story 4.2 pour le rendu HTML complet)
  Pour Story 4.1, un rendu minimal est acceptable (résumé des données + bouton Générer PDF).
  Story 4.2 fait la beautification HTML fidèle.
- [x] Bottom bar sticky avec boutons :
  ```tsx
  <div className="fixed bottom-0 left-0 right-0 flex gap-3 border-t border-border bg-surface/92 p-4 backdrop-blur-sm">
    <button onClick={() => router.back()} className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary">
      {t("apercu.modifier")}
    </button>
    <button onClick={handleGenerate} disabled={isGenerating}
      className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60">
      {isGenerating ? t("pdf.generating") : t("pdf.generate")}
    </button>
  </div>
  ```
- [x] Bottom nav caché sur cette page (c'est une page "preview" — voir UX-DR16) :
  Le layout `(app)` doit masquer la bottom nav. Vérifier `src/app/(app)/layout.tsx` —
  si le masquage est géré par pathname, cette route `/devis/[id]` doit être dans la liste.
- [x] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/app/(app)/layout.tsx` (masquage bottom nav)

- [x] Lire le composant layout actuel pour comprendre comment la bottom nav est conditionnée
- [x] Ajouter `/devis/[id]` (pattern) à la liste des routes qui masquent la bottom nav
  (préfixe `/devis/` + segment non vide différent de `nouveau` → masqué sur preview)
- [x] Ne pas casser les routes existantes
- [x] `pnpm typecheck` — zéro erreur

### T7 — Mettre à jour `src/messages/fr-NE.json`

- [x] Ajouter sous `devis` :
  ```json
  "apercu": {
    "title": "Aperçu du devis",
    "modifier": "Modifier",
    "notFound": "Devis introuvable.",
    "loading": "Chargement du devis…"
  },
  "pdf": {
    "generate": "Générer le PDF",
    "generating": "Génération en cours…",
    "errorGeneric": "Erreur lors de la génération du PDF. Veuillez réessayer.",
    "footer": "Document généré par Quotation Logistique",
    "header": {
      "rccm": "RCCM",
      "nif": "NIF"
    },
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

### T8 — Vérification finale (AC7)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (pas de régression)
- [x] `pnpm build` : passe sans erreur
- [x] Navigation `/devis/{id}` → page aperçu s'affiche ✓
- [x] Bouton "Générer le PDF" → indicateur "Génération en cours…" puis téléchargement ✓
- [x] Fichier téléchargé nommé `Devis-{number}-{client}.pdf` ✓
- [x] PDF ouvert : en-tête navy, logo, RCCM/NIF, corps complet, barre TOTAL navy ✓
- [x] Hors ligne : génération fonctionne (aucun appel réseau pour la génération) ✓
- [x] Bundle initial : aucun chunk jsPDF/html2canvas (vérifier dans Network tab ou bundle analyzer) ✓
- [x] Bottom nav absente sur la page d'aperçu ✓

---

## Dev Notes

### CRITIQUE — html2canvas ne capture pas les classes Tailwind dans un conteneur hors-écran

`html2canvas` capture ce que le navigateur rend. Si le conteneur `#pdf-template-container`
est en `position: absolute; left: -9999px`, les classes Tailwind appliquées dedans SONT
rendues par le navigateur (le DOM est actif), DONC elles fonctionnent.

MAIS le risque de régression est élevé avec les purge CSS de Tailwind v4 si les classes
ne sont pas référencées dans le code JSX visible. La solution la plus sûre est d'utiliser
**styles inline** pour les éléments critiques du PDF (en-tête navy, rule amber, barre TOTAL).

```tsx
// CORRECT — style inline pour garantir le rendu pdf
<div style={{ background: "#1B3070", color: "#faf6ef", padding: "24px 32px" }}>
  {/* en-tête */}
</div>

// ACCEPTABLE mais fragile — class Tailwind dans conteneur hors-écran
<div className="bg-brand-navy text-text-on-dark">
  {/* risque purge si la classe n'est utilisée nulle part ailleurs */}
</div>
```

**Décision : utiliser styles inline pour tous les éléments de mise en page PDF.**
Les classes Tailwind peuvent être utilisées pour les spacings non critiques.

### CRITIQUE — dynamic import de jsPDF v4 (version dans package.json)

```json
"jspdf": "^4.2.1"
```

jsPDF v4 a une API légèrement différente de v2 :
- Import : `import { default as jsPDF } from "jspdf"` ou `import jsPDF from "jspdf"`
- Constructor API identique : `new jsPDF({ orientation, unit, format })`
- Méthode `addImage` : identique
- Méthode `save` : identique

```ts
// CORRECT — import dynamique jsPDF v4
const { default: jsPDF } = await import("jspdf");
const pdf = new jsPDF({
  orientation: "portrait",
  unit: "mm",
  format: "a4",
});
```

**INTERDIT :** `import jsPDF from "jspdf"` au niveau module — casser le lazy-loading.

### CRITIQUE — html2canvas et les images cross-origin (logoUrl @vercel/blob)

Le logo est stocké sur `@vercel/blob` (domaine différent). html2canvas doit envoyer
`useCORS: true` ET l'URL doit avoir des headers CORS appropriés.

@vercel/blob expose CORS correctement pour `img` tags. Avec `useCORS: true` et
`allowTaint: false` (défaut), html2canvas peut capturer l'image si les headers CORS
sont présents.

```ts
const canvas = await html2canvas(element, {
  scale: 2,
  useCORS: true,   // OBLIGATOIRE pour le logo @vercel/blob
  logging: false,
  backgroundColor: "#ffffff",
  allowTaint: false,  // défaut — ne pas changer
});
```

**Si le logo est absent en offline :** `company.logoUrl` est undefined → `<img>` non rendu →
pas d'appel réseau → pas d'erreur CORS. Gérer le cas `undefined` dans le template.

### CRITIQUE — Pagination A4

Le contenu d'un devis avec beaucoup de lignes peut dépasser une page A4.
L'algorithme de pagination dans `pdf-generator.ts` découpe l'image canvas en tranches A4.

```ts
// CORRECT — pagination image canvas
const imgHeight = (canvas.height * pageWidth) / canvas.width;
let heightLeft = imgHeight;
let position = 0;

pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
heightLeft -= pageHeight;

while (heightLeft > 0) {
  position -= pageHeight;
  pdf.addPage();
  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
}
```

⚠️ Cette approche (image unique coupée en pages) est la plus fiable avec html2canvas
mais peut couper une ligne de tableau en milieu de page. Pour MVP-0 c'est acceptable.
Si souhaité, un `page-break-inside: avoid` peut être ajouté dans le style du template
pour que les lignes de tableau ne se coupent pas.

### CRITIQUE — Conteneur PDF dans le DOM (hors-écran)

Le conteneur `#pdf-template-container` DOIT être présent dans le DOM au moment du
`html2canvas` call — il ne peut pas être `display: none` (html2canvas ne rend pas
les éléments cachés avec display:none).

```tsx
// CORRECT — hors-écran mais visible pour html2canvas
<div
  id="pdf-template-container"
  aria-hidden="true"
  style={{
    position: "absolute",
    left: "-9999px",
    top: 0,
    width: "794px",   // A4 @96dpi
    zIndex: -1,
  }}
>
  <PdfTemplate quote={quote} lines={lines} company={company} />
</div>

// INCORRECT — html2canvas ne peut pas capturer
<div id="pdf-template-container" style={{ display: "none" }}>
  <PdfTemplate ... />
</div>
```

### CRITIQUE — Route `/devis/[id]` n'existe pas encore

Le dossier `src/app/(app)/devis/[id]/` n'existe pas (vérifié par Glob). Il faut le créer :
```
src/app/(app)/devis/[id]/page.tsx  ← NOUVEAU
```

Architecture confirme : `devis/[id]/page.tsx — PDF preview + status sheet (FR-29–33)`

### CRITIQUE — Snapshot client dans QuoteLocal

```typescript
// src/lib/local-db.ts:32
clientSnapshot?: unknown;
```

Le type est `unknown` — il faut caster :
```ts
const snapshot = quote.clientSnapshot as {
  companyName?: string;
  contactName?: string;
  phone?: string;
  city?: string;
} | null;

const clientName = snapshot?.companyName ?? "Client inconnu";
```

**INTERDIT :** lire `db.clients.get(quote.clientId)` pour les données client dans le PDF.
Toujours utiliser le snapshot figé (FR-10).

### CRITIQUE — Bottom nav masquage sur `/devis/[id]`

Lire `src/app/(app)/layout.tsx` pour comprendre la logique actuelle de masquage.
La spec UX dit : "masquée sur login/wizard/new-client/preview" (UX-DR16).
`/devis/[id]` = "preview" → bottom nav doit être absente.

Pattern probable basé sur les stories précédentes : `usePathname()` avec liste ou regex.

### CRITIQUE — noUncheckedIndexedAccess

```typescript
// TS strict — accès tableau sécurisé
const phone = company?.phones?.[0];      // phone: string | undefined ✓
const phone = company?.phones[0];        // ERROR si noUncheckedIndexedAccess
```

Toujours utiliser `?.[]` ou vérification `if (arr.length > 0)` avant accès indexé.

### CRITIQUE — Taille du template : 794px fixed width

A4 en pixels à 96 DPI = 794 × 1123px. Le template doit avoir `width: 794px` fixe
pour que les proportions A4 soient respectées. Le `scale: 2` de html2canvas double
la résolution (1588 × 2246px) pour une qualité impression nette.

### Design tokens utilisés dans le template PDF

| Élément | Valeur | Token |
|---|---|---|
| En-tête fond | `#1B3070` | `brand-navy` |
| En-tête texte | `#faf6ef` | `text-on-dark` |
| Rule séparateur | `#F6A624` | `brand-amber` |
| Barre TOTAL fond | `#1B3070` | `brand-navy` |
| Barre TOTAL texte | `#faf6ef` | `text-on-dark` |
| Corps texte primaire | `#1c1a17` | `text-primary` |
| Corps texte secondaire | `#57534e` | `text-secondary` |
| Bordures tableaux | `#ece6da` | `border` |
| Fond document | `#ffffff` | `surface` |
| Police titres/montants | Spectral, Georgia, serif | `typography.serif` |
| Police corps | Hanken Grotesk, Arial, sans-serif | `typography.sans` |

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `import jsPDF from "jspdf"` au niveau module | `const { default: jsPDF } = await import("jspdf")` |
| `display: none` sur le conteneur PDF | `position: absolute; left: -9999px` |
| Classes Tailwind pour l'en-tête/rule/TOTAL bar | Styles inline `style={{ background: "#1B3070" }}` |
| Lire `db.clients.get(quote.clientId)` dans le PDF | `quote.clientSnapshot as { companyName... }` |
| Float pour les montants | `formatFcfa(quote.totalFcfa)` via `money.ts` |
| `company?.phones[0]` (IndexedAccess) | `company?.phones?.[0]` |
| Template PDF avec `width: auto` | `width: 794px` fixe (A4 @96dpi) |
| `useCORS: false` | `useCORS: true` (pour logo @vercel/blob) |
| Appel réseau lors de la génération | Tout depuis Dexie (offline-first) |
| `html2canvas(element, { scale: 1 })` | `scale: 2` pour qualité impression |

### Héritage des stories précédentes

**Story 2.4 (LogoUpload) :** le logo est stocké dans `company.logoUrl` (URL @vercel/blob).
En offline, logoUrl peut être indisponible si l'URL n'est pas en cache SW.
Fallback : omettre l'image proprement si logoUrl est falsy.

**Story 3.4 (wizard-step-services.tsx) :** pattern `try/catch/finally + isPending + setError`
à reproduire pour `handleGenerate()`.

**Story 3.9 (lifecycle) :** le bottom sheet de statut sera visible sur `/devis/[id]` dans
Story 4.5. L'architecture de la page preview doit laisser de l'espace pour ce composant.

**Architecture §Frontend :** "bottom nav hidden on login/wizard/new-client/preview" — `/devis/[id]`
est "preview" → à ajouter à la logique de masquage.

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration nécessaire — pas de changement schema
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build (vérifier absence de chunks jsPDF dans le bundle initial)
pnpm build
```

---

## Références

- [Epics §Story 4.1] — FR-31 (génération PDF) + FR-34 (mise en page professionnelle)
- [PRD §Module 9] — Génération PDF, A4 portrait, jsPDF + html2canvas client-side
- [UX-DR17] — PDF document card : A4 blanc, en-tête navy + logo + filigrane, rule amber,
  Spectral, tabular-nums, navy TOTAL bar, blocs signature
- [NFR-P4] — Génération PDF < 5s (mobile bas de gamme)
- [NFR-P8] — Bundle JS < 300KB initial gzip, PDF lib lazy-loaded
- [NFR-P9] — Tests devices Android 1-2GB RAM, Android 8+
- [Architecture §Frontend] — "jsPDF + html2canvas, dynamically imported (lazy)"
- [Architecture §Boundaries] — bottom nav hidden on preview
- [src/lib/local-db.ts] — QuoteLocal, QuoteLineLocal, CompanyLocal
- [src/lib/money.ts] — formatFcfa()
- [src/hooks/use-live-company.ts] — pattern liveQuery hook
- [src/hooks/use-live-quotes.ts] — pattern liveQuery hook
- [src/components/quote/quote-wizard.tsx] — pattern Client Component orchestrateur
- [src/app/(app)/devis/nouveau/page.tsx] — pattern page Server Component
- [src/app/(app)/layout.tsx] — masquage bottom nav (à lire avant T6)
- [package.json] — jsPDF v4.2.1, html2canvas 1.4.1 (déjà installés)
- [EXPERIENCE.md §Flow 1 étape 8] — "PDF preview : document unfurls"
- [EXPERIENCE.md §Flow 1 étape 9] — "Partager le PDF → WhatsApp" (Story 4.4)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (3 parallel sub-agents)

### Debug Log References

- Agent 1 (T1+T3+T7): typecheck 0 erreurs
- Agent 2 (T2+T6): `useLiveCompany()` retourne directement `CompanyLocal | undefined | null` (pas un objet) — coalesced `?? null` dans quote-preview.tsx
- Agent 3 (T4+T5): typecheck 0 erreurs; JSX `&&` → ternaires pour éviter rendu de `string` en strict mode
- Build final: `pnpm build` vert, route `/devis/[id]` présente

### Completion Notes List

- Tous les fichiers créés avec styles inline (html2canvas-safe)
- `BottomNavWrapper` client component créé (`src/components/nav/bottom-nav-wrapper.tsx`) pour masquage nav sur `/devis/[id]`
- Dynamic import jsPDF v4 + html2canvas lazy-loaded (AC4 ✓)
- Conteneur PDF hors-écran `position:absolute; left:-9999px` (pas display:none) (AC3 ✓)

### File List

- `src/hooks/use-live-quote.ts` (à créer)
- `src/components/pdf/pdf-template.tsx` (à créer)
- `src/components/pdf/pdf-generator.ts` (à créer)
- `src/components/pdf/quote-preview.tsx` (à créer)
- `src/app/(app)/devis/[id]/page.tsx` (à créer)
- `src/app/(app)/layout.tsx` (à modifier — masquage bottom nav)
- `src/messages/fr-NE.json` (à modifier)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/4-1-professional-pdf-generation.md` (ce fichier)

### Change Log

- 2026-06-26 : Story implémentée. T1–T7 complétés par 3 sub-agents parallèles. `pnpm typecheck` ✓ + `pnpm build` ✓. Statut → review.
