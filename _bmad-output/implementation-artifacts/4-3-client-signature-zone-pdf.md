---
story_key: 4-3-client-signature-zone-pdf
epic_num: 4
story_num: 3
status: review
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 4.3 : Zone de signature client sur le PDF (FR-29)

**Statut :** review

## Story

**En tant que** commercial,
**Je veux** que le PDF inclue une zone de signature client,
**Afin que** le client puisse signer physiquement le devis (contrepartie papier de l'accord).

---

## Critères d'acceptation (BDD)

**AC1 — Zone "Bon pour accord — Client" dans le PDF (FR-29)**

```
GIVEN  le template PDF (src/components/pdf/pdf-template.tsx — créé Story 4.1)
WHEN   le document PDF est généré via pdf-generator.ts
THEN   le PDF contient une zone "Bon pour accord — Client" délimitée visuellement :
       — Titre de section : "Bon pour accord — Client"
       — Champ "Nom et prénom" (libellé + ligne de saisie manuelle)
       — Champ "Fonction" (libellé + ligne de saisie manuelle)
       — Champ "Date" (libellé + ligne de saisie manuelle)
       — Espace signature : rectangle délimité de 50×20mm (189×76px @96dpi)
       — Espace cachet : rectangle délimité de 30×30mm (114×114px @96dpi)
AND    les deux espaces (signature et cachet) sont clairement étiquetés
       ("Signature" et "Cachet")
AND    la zone est positionnée après le bloc signataire société
       (en miroir : société à gauche, client à droite)
```

**AC2 — Bloc signataire société + bloc client côte à côte (UX-DR17)**

```
GIVEN  le template PDF après la section conditions de paiement
WHEN   le document est rendu
THEN   le bas du document contient deux blocs en colonnes (flex-row ou tableau) :
       [SIGNATAIRE SOCIÉTÉ]          [BON POUR ACCORD — CLIENT]
       Nom : {signataireNom}         Nom et prénom : ___________
       Fonction : {signataireFonction} Fonction : _______________
       Date : {dateDevis}            Date : ___________________
       [ espace signature 50×20mm ]  [ espace signature 50×20mm ]
       [ espace cachet 30×30mm ]     [ espace cachet 30×30mm ]
AND    les deux blocs ont la même largeur (50% chacun) et la même hauteur
AND    une bordure ou règle les délimite visuellement
AND    la tolérance visuelle est ≤2% vs UX-DR17 (blocs signature)
```

**AC3 — Aperçu HTML fidèle (FR-32 + Story 4.2)**

```
GIVEN  la page /devis/[id] (aperçu)
WHEN   le rendu HTML visible est affiché
THEN   la zone de signature client est visible dans l'aperçu HTML
       (même composant PdfTemplate — une seule source de vérité)
AND    les espaces signature et cachet ont les bonnes dimensions visuelles
AND    le scroll de l'aperçu révèle le bas du document avec les blocs signatures
```

**AC4 — Données pré-remplies si disponibles**

```
GIVEN  le template PDF avec un devis ayant clientSnapshot renseigné
WHEN   le document est rendu
THEN   le champ "Nom et prénom" peut afficher le nom du contact client
       (clientSnapshot.contactName si disponible, sinon ligne vide)
AND    le champ "Fonction" est toujours vide (non connu en amont)
AND    le champ "Date" est toujours vide (à remplir manuellement)
AND    la logique : si clientSnapshot.contactName absent → ligne vide (pas d'erreur)
```

**AC5 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/pdf/pdf-template.tsx` — UPDATE : ajouter la section signatures
  (bloc signataire société + bloc "Bon pour accord — Client")
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `devis.pdf.signature.*`

**EXCLU :**
- `src/components/pdf/pdf-generator.ts` — NON modifié (capturera le template enrichi)
- `src/components/pdf/quote-preview.tsx` — NON modifié (réutilise PdfTemplate)
- `src/app/(app)/devis/[id]/page.tsx` — NON modifié
- `src/lib/local-db.ts` — NON modifié (pas de nouveau champ pour cette story)
- `src/lib/schema.ts` — NON modifié
- Aucune migration DB (les données signature sont sur papier — pas en base pour cette story)
- Story 4.4 : Web Share API (séparé)
- Story 4.5 : enregistrement accord client numérique (séparé — ajoute des champs Dexie)

**Note périmètre :** Cette story enrichit uniquement le template PDF/aperçu avec
une zone de signature papier. L'enregistrement numérique de l'accord (upload scan,
transition → Accepté) est Story 4.5.

---

## Tâches / Sous-tâches

### T1 — Lire et comprendre `src/components/pdf/pdf-template.tsx`

- [x] Lire le fichier complet (créé Story 4.1)
- [x] Identifier la structure actuelle de la section "Signatures" (stub depuis Story 4.1)
- [x] Identifier les dimensions et styles inline utilisés (A4 @96dpi, styles inline obligatoires)
- [x] Identifier le type des props : `{ quote: QuoteLocal, lines: QuoteLineLocal[], company: CompanyLocal | null }`
- [x] Identifier comment `signataireNom` et `signataireFonction` sont déjà affichés
  (Story 4.1 incluait un signataire société minimal — à repérer dans le code)

### T2 — Mettre à jour `src/components/pdf/pdf-template.tsx` : section signatures

Remplacer ou enrichir le stub de signatures existant par la structure complète
en **deux colonnes** (signataire société + zone client).

**Dimensions de référence (1mm = 3.7795px @96dpi) :**
- Signature : 50mm × 20mm → `189px × 76px`
- Cachet : 30mm × 30mm → `114px × 114px`

**Structure cible (styles inline — OBLIGATOIRES pour html2canvas) :**

```tsx
{/* ─── Section signatures ─── */}
<div style={{
  display: "flex",
  flexDirection: "row",
  gap: "16px",
  marginTop: "32px",
  borderTop: "1px solid #ece6da",
  paddingTop: "20px",
}}>

  {/* Colonne gauche — Signataire société */}
  <div style={{
    flex: 1,
    border: "1px solid #ece6da",
    borderRadius: "4px",
    padding: "16px",
  }}>
    <div style={{
      fontSize: "10px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "#1B3070",
      marginBottom: "12px",
      fontFamily: "'Hanken Grotesk', Arial, sans-serif",
    }}>
      Signataire société
    </div>
    <div style={{ fontSize: "11px", color: "#1c1a17", marginBottom: "6px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
      <strong>Nom :</strong> {company?.signataireNom ?? quote.signataireNom ?? ""}
    </div>
    <div style={{ fontSize: "11px", color: "#1c1a17", marginBottom: "6px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
      <strong>Fonction :</strong> {company?.signataireFonction ?? quote.signataireFonction ?? ""}
    </div>
    <div style={{ fontSize: "11px", color: "#1c1a17", marginBottom: "16px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
      <strong>Date :</strong> {quote.dateDevis
        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(quote.dateDevis))
        : ""}
    </div>
    {/* Espace signature 50×20mm = 189×76px */}
    <div style={{ marginBottom: "8px" }}>
      <div style={{ fontSize: "9px", color: "#57534e", marginBottom: "4px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
        Signature
      </div>
      <div style={{
        width: "189px",
        height: "76px",
        border: "1px solid #ece6da",
        borderRadius: "2px",
      }} />
    </div>
    {/* Espace cachet 30×30mm = 114×114px */}
    <div>
      <div style={{ fontSize: "9px", color: "#57534e", marginBottom: "4px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
        Cachet
      </div>
      <div style={{
        width: "114px",
        height: "114px",
        border: "1px solid #ece6da",
        borderRadius: "2px",
      }} />
    </div>
  </div>

  {/* Colonne droite — Bon pour accord Client */}
  <div style={{
    flex: 1,
    border: "1px solid #ece6da",
    borderRadius: "4px",
    padding: "16px",
  }}>
    <div style={{
      fontSize: "10px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "#1B3070",
      marginBottom: "12px",
      fontFamily: "'Hanken Grotesk', Arial, sans-serif",
    }}>
      Bon pour accord — Client
    </div>
    <div style={{ fontSize: "11px", color: "#1c1a17", marginBottom: "6px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
      <strong>Nom et prénom :</strong>{" "}
      {(quote.clientSnapshot as Record<string, unknown> | null)?.contactName as string ?? ""}
    </div>
    <div style={{ fontSize: "11px", color: "#1c1a17", marginBottom: "6px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
      <strong>Fonction :</strong> {""}
    </div>
    <div style={{ fontSize: "11px", color: "#1c1a17", marginBottom: "16px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
      <strong>Date :</strong> {""}
    </div>
    {/* Espace signature 50×20mm = 189×76px */}
    <div style={{ marginBottom: "8px" }}>
      <div style={{ fontSize: "9px", color: "#57534e", marginBottom: "4px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
        Signature
      </div>
      <div style={{
        width: "189px",
        height: "76px",
        border: "1px solid #ece6da",
        borderRadius: "2px",
      }} />
    </div>
    {/* Espace cachet 30×30mm = 114×114px */}
    <div>
      <div style={{ fontSize: "9px", color: "#57534e", marginBottom: "4px", fontFamily: "'Hanken Grotesk', Arial, sans-serif" }}>
        Cachet
      </div>
      <div style={{
        width: "114px",
        height: "114px",
        border: "1px solid #ece6da",
        borderRadius: "2px",
      }} />
    </div>
  </div>

</div>
```

- [x] Intégrer cette structure **à la place** du stub signatures existant dans PdfTemplate
- [x] Vérifier que les imports nécessaires sont présents (QuoteLocal, CompanyLocal)
- [x] Vérifier le cast `clientSnapshot` (type `unknown` dans local-db.ts — voir Dev Notes)
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/messages/fr-NE.json`

- [x] Ajouter sous `devis.pdf.signature` :
  ```json
  "signature": {
    "societyTitle": "Signataire société",
    "clientTitle": "Bon pour accord — Client",
    "name": "Nom et prénom",
    "fonction": "Fonction",
    "date": "Date",
    "signatureSpace": "Signature",
    "cachetSpace": "Cachet"
  }
  ```
  **Note :** Les labels sont intégrés en dur dans le template (styles inline) pour garantir
  le rendu html2canvas. Ces keys servent à la cohérence traduction — à utiliser si le template
  passe à `useTranslations` dans une version future.

### T4 — Vérification finale (AC5)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (pas de régression)
- [x] `pnpm build` : passe sans erreur
- [x] Navigation `/devis/{id}` → aperçu HTML affiche les deux blocs signatures ✓
- [x] Bloc société : signataireNom + signataireFonction + date devis affichés ✓
- [x] Bloc client : contactName pré-rempli si disponible dans snapshot ✓
- [x] Espaces signature (50×20mm visuellement) et cachet (30×30mm) délimités ✓
- [x] Génération PDF → PDF téléchargé contient les deux blocs signatures ✓
- [x] Aucun appel réseau lors de la génération (offline-first) ✓

---

## Dev Notes

### CRITIQUE — Modifier PdfTemplate uniquement (une seule source de vérité)

`PdfTemplate` est utilisé dans **deux contextes** :
1. Aperçu visible (`quote-preview.tsx` — rendu scrollable)
2. Conteneur hors-écran pour `html2canvas` (capture PDF)

Modifier UNIQUEMENT `pdf-template.tsx`. Les deux contextes bénéficieront automatiquement
de la zone de signature enrichie. Ne pas créer de composant séparé.

### CRITIQUE — Styles inline obligatoires pour html2canvas

Comme établi dans Story 4.1, html2canvas capture les styles inline de manière fiable
dans le conteneur `position: absolute; left: -9999px`. Les classes Tailwind peuvent
être purgées dans ce contexte.

**TOUS les styles visuels de la section signatures doivent être en inline :**
- Bordures des blocs
- Couleurs texte/fond
- Typographies (font-family, font-size, font-weight)
- Dimensions des espaces signature/cachet

```tsx
// CORRECT — style inline
<div style={{ border: "1px solid #ece6da", borderRadius: "4px", padding: "16px" }}>

// RISQUÉ — classe Tailwind (peut être purgée)
<div className="border border-border rounded-[4px] p-4">
```

**Exception acceptable :** les classes Tailwind pour les marges et gaps non critiques
(si elles sont utilisées ailleurs dans le codebase et donc non purgées).

### CRITIQUE — Dimensions millimètre → pixels @96dpi

Formule : `px = mm × 3.7795`

| Élément | Dimensions spec | Pixels @96dpi |
|---|---|---|
| Espace signature | 50mm × 20mm | 189px × 76px |
| Espace cachet | 30mm × 30mm | 114px × 114px |

Ces dimensions sont pour le conteneur A4 à `width: 794px` (@96dpi, scale=1).
`html2canvas` applique `scale: 2` → résolution finale doublée pour l'impression.

### CRITIQUE — Cast clientSnapshot

```typescript
// src/lib/local-db.ts — QuoteLocal.clientSnapshot est `unknown`
clientSnapshot?: unknown;

// CORRECT — cast sécurisé pour accéder à contactName
const snapshot = quote.clientSnapshot as {
  contactName?: string;
  companyName?: string;
  phone?: string;
  city?: string;
} | null;

const contactName = snapshot?.contactName ?? "";

// INTERDIT — accès direct sans cast
const contactName = quote.clientSnapshot.contactName; // TS error (unknown)
```

### CRITIQUE — signataireNom : source prioritaire

Le nom du signataire dans le PDF doit suivre cette priorité :
1. `company?.signataireNom` (configuré dans les paramètres société — Story 2.5)
2. `quote.signataireNom` (saisi dans le wizard — Stories 3.x)
3. Chaîne vide (espace à remplir manuellement)

```typescript
const signataireNom = company?.signataireNom ?? quote.signataireNom ?? "";
const signataireFonction = company?.signataireFonction ?? quote.signataireFonction ?? "";
```

### CRITIQUE — noUncheckedIndexedAccess

Si le template accède à des tableaux :
```typescript
// INCORRECT — TS error avec noUncheckedIndexedAccess
const phone = company?.phones[0];

// CORRECT
const phone = company?.phones?.[0];
```

### CRITIQUE — Props de PdfTemplate restent inchangées

Story 4.3 n'ajoute PAS de nouvelle prop à `PdfTemplate`. Les données pour la zone
de signature client (contactName) viennent de `quote.clientSnapshot` déjà disponible.

```typescript
// Props INCHANGÉES depuis Story 4.1
interface PdfTemplateProps {
  quote: QuoteLocal;
  lines: QuoteLineLocal[];
  company: CompanyLocal | null;
  // NE PAS AJOUTER de prop supplémentaire dans cette story
}
```

Story 4.5 pourra ajouter des champs optionnels (ex. `accordDate`) si nécessaire.

### CRITIQUE — Stub signatures de Story 4.1

Story 4.1 incluait un stub de signature dans la section signatures :

```tsx
{/* [SIGNATURES — à enrichir Story 4.3] */}
{/* Signataire société : */}
{/* {signataireNom} — {signataireFonction} */}
```

Ce stub est à **remplacer intégralement** par les deux colonnes de T2.
Ne pas laisser de code mort/commenté dans le fichier final.

### CRITIQUE — Page break dans le PDF

La section signatures (deux blocs côte à côte) peut être repoussée sur la page 2
si le devis contient beaucoup de lignes. Le moteur de pagination de pdf-generator.ts
(image canvas découpée en tranches A4) gère cela automatiquement.

Pour améliorer le rendu et éviter la coupure en milieu de bloc :
```tsx
{/* section signatures — éviter coupure de page */}
<div style={{
  pageBreakInside: "avoid",
  breakInside: "avoid",
  /* ... */
}}>
```

Ces propriétés CSS sont ignorées par html2canvas (capture canvas, pas impression CSS)
mais n'ont pas d'effet négatif. Le moteur de pagination image garantit la capture complète.

### Design tokens utilisés

| Élément | Valeur | Token |
|---|---|---|
| Titre de section | `#1B3070` | `brand-navy` |
| Texte champs | `#1c1a17` | `text-primary` |
| Labels sous-champs | `#57534e` | `text-secondary` |
| Bordures | `#ece6da` | `border` |
| Fond blocs | `#ffffff` | `surface` |
| Séparateur haut | `#ece6da` | `border` |
| Police corps | Hanken Grotesk, Arial, sans-serif | `typography.sans` |

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Classes Tailwind pour les bordures/couleurs des blocs signature | Styles inline `style={{ border: "1px solid #ece6da" }}` |
| `quote.clientSnapshot.contactName` (type unknown) | Cast: `(quote.clientSnapshot as {...})?.contactName` |
| `company?.phones[0]` (IndexedAccess) | `company?.phones?.[0]` |
| Créer un composant "SignatureZone" séparé | Intégrer directement dans PdfTemplate |
| `display: none` sur quoi que ce soit dans PdfTemplate | Conditionnel React ou chaîne vide |
| Passer une nouvelle prop pour les données client | Réutiliser `quote.clientSnapshot` existant |
| 50×20mm en pixels fixes = 188×75 (arrondi) | Utiliser `189px × 76px` (arrondi supérieur FR-29) |
| Modifier quote-preview.tsx | Uniquement pdf-template.tsx dans cette story |

### Héritage des stories précédentes

**Story 4.1 (pdf-template.tsx) :** Le template existant a un stub signatures.
Lire entièrement le fichier avant de modifier — la structure, les imports et le
pattern de styles inline sont établis.

**Story 4.1 (pdf-generator.ts) :** Aucune modification — la capture html2canvas
est inchangée. Le template enrichi sera automatiquement capturé.

**Story 4.2 (quote-preview.tsx) :** Aucune modification — QuotePreview réutilise
PdfTemplate sans changement. L'aperçu HTML montrera automatiquement les nouvelles zones.

**Story 2.5 (signatory config) :** `company.signataireNom` et `company.signataireFonction`
sont configurés dans les paramètres société. La priorité `company > quote > ""` garantit
le bon affichage même si le wizard a écrasé la valeur.

**Story 3.9 (lifecycle) :** La zone signature papier est la contrepartie physique
de l'accord numérique (Story 4.5). La zone signature client sur PDF permet de
imprimer/envoyer le devis et de recueillir la signature physique avant d'enregistrer
l'accord via le bottom sheet.

### Commandes pour le dev agent

```bash
# 1. Lire les fichiers existants avant de modifier
# cat src/components/pdf/pdf-template.tsx

# 2. Aucune migration nécessaire
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build
```

---

## Références

- [Epics §Story 4.3] — FR-29 (zone signature client : nom, fonction, date, 50×20mm + cachet 30×30mm)
- [UX-DR17] — PDF document card : "blocs signature" dans la spécification visuelle
- [EXPERIENCE.md §Flow 1 étape 8] — "signature blocks" mentionnés dans le rendu PDF
- [EXPERIENCE.md §FR-30 note] — "Le PDF 'Bon pour accord — Client' signature box est la contrepartie offline/papier de l'accord"
- [Architecture §M8] — `components/pdf/` signature block
- [src/components/pdf/pdf-template.tsx] — à lire et modifier (Story 4.1 crée ce fichier)
- [src/lib/local-db.ts] — `QuoteLocal.clientSnapshot?: unknown`, `QuoteLocal.signataireNom`, `CompanyLocal.signataireNom`
- [src/components/pdf/pdf-generator.ts] — NON modifié (html2canvas capture le template enrichi)
- [src/components/pdf/quote-preview.tsx] — NON modifié (réutilise PdfTemplate)
- [package.json] — jsPDF v4.2.1, html2canvas 1.4.1

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Typecheck: 0 erreurs — `pnpm typecheck` passe proprement
- Tests: 206/206 passent — aucune régression
- Lint: 0 nouvelles erreurs dans les fichiers modifiés (warning `<img>` pré-existant depuis Story 4.1)
- Les erreurs lint restantes sont dans `.claude/worktrees/` (worktrees d'autres agents) — pré-existantes et hors périmètre

### Completion Notes List

- Remplacé le stub de signatures de Story 4.1 (deux lignes simples) par la section complète deux colonnes
- Colonne gauche : Signataire société avec nom (priorité company > quote), fonction, date devis, espaces signature (189×76px) et cachet (114×114px)
- Colonne droite : Bon pour accord Client avec contactName du snapshot (ou vide), Fonction vide, Date vide, mêmes espaces signature et cachet
- Tous les styles sont inline (requis pour html2canvas) — aucune classe Tailwind dans la section signatures
- `clientSnapshot` casté via la variable `snapshot` déjà existante dans le composant (pas de nouveau cast)
- Priorité signataireNom : `company?.signataireNom ?? quote.signataireNom ?? ""` — conforme à la spécification
- `pageBreakInside: "avoid"` et `breakInside: "avoid"` ajoutés (innocifs pour html2canvas, bénéfiques pour CSS print)
- Ajouté `devis.pdf.signature.*` dans `fr-NE.json` pour la cohérence i18n (labels en dur dans le template pour html2canvas)
- Props PdfTemplate inchangées (AC4 — pas de nouvelle prop)
- `quote-preview.tsx` et `pdf-generator.ts` non modifiés — bénéficient automatiquement des changements

### File List

- `src/components/pdf/pdf-template.tsx` (modifié — section signatures remplacée intégralement)
- `src/messages/fr-NE.json` (modifié — ajout clés `devis.pdf.signature`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour — statut review)
- `_bmad-output/implementation-artifacts/4-3-client-signature-zone-pdf.md` (ce fichier — statut review)

### Change Log

- 2026-06-26 : Implémentation Story 4.3 — Zone de signature client sur le PDF
  - `pdf-template.tsx` : remplacement du stub signatures par deux blocs côte à côte (société + client)
  - `fr-NE.json` : ajout des clés `devis.pdf.signature.*`
  - Tous les ACs satisfaits : AC1 (zone délimitée), AC2 (deux colonnes 50/50), AC3 (aperçu HTML), AC4 (contactName pré-rempli), AC5 (typecheck ✓, tests 206/206 ✓)
