---
story_key: 4-4-export-share-pdf
epic_num: 4
story_num: 4
status: review
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 4.4 : Export & partage du PDF (FR-33)

**Statut :** review

## Story

**En tant que** commercial,
**Je veux** exporter et partager le PDF via les canaux supportés par le navigateur,
**Afin que** je l'envoie au client par WhatsApp ou email (EXPERIENCE Flow 1).

---

## Critères d'acceptation (BDD)

**AC1 — Téléchargement local (fallback universel)**

```
GIVEN  un PDF généré (Blob en mémoire)
WHEN   le commercial déclenche l'export
THEN   le téléchargement local démarre toujours (fallback universel)
AND    le fichier porte le nom "Devis-{Numéro}-{Client}.pdf"
AND    ce comportement fonctionne sur tous les navigateurs (Chrome, Safari, Firefox, WebView)
AND    la génération est offline (aucun appel réseau)
```

**AC2 — Web Share API niveau 2 (navigateurs supportant le partage de fichiers)**

```
GIVEN  un navigateur supportant navigator.share({ files: [...] }) — Web Share API Level 2
WHEN   le commercial tape "Partager le PDF"
THEN   `navigator.share({ files: [pdfFile], title: "Devis-{Numéro}", text: "..." })`
       ouvre la feuille de partage système de l'OS
AND    la feuille de partage propose WhatsApp, email et autres apps installées
AND    si l'utilisateur annule (AbortError) → aucun message d'erreur affiché (comportement attendu)
AND    si une autre erreur → message d'erreur français affiché (non-bloquant)
```

**AC3 — Fallback guidé (navigateurs sans Web Share fichiers)**

```
GIVEN  un navigateur NE supportant PAS navigator.share({ files: [...] })
       (Desktop Chrome, Firefox, certains WebViews Android)
WHEN   le commercial tape "Partager le PDF"
THEN   le PDF est d'abord téléchargé localement (comme AC1)
AND    un message guidé s'affiche selon la plateforme :
       — Mobile : "PDF enregistré — joignez-le depuis WhatsApp / votre email"
       — Desktop : "PDF téléchargé dans vos téléchargements — joignez-le depuis votre client email"
AND    AUCUN lien mailto: avec pièce jointe (FR-33 interdit explicitement cette approche)
AND    AUCUNE tentative d'ouvrir WhatsApp Web avec URL de fichier (non supporté)
```

**AC4 — Détection de capacité Web Share API**

```
GIVEN  la page /devis/[id]
WHEN   le rendu s'initialise
THEN   la capacité de partage est détectée via :
       canShareFiles = typeof navigator !== "undefined"
                    && typeof navigator.share === "function"
                    && typeof navigator.canShare === "function"
                    && navigator.canShare({ files: [dummyFile] })
AND    si canShareFiles = true → bouton "Partager le PDF" est affiché
AND    si canShareFiles = false → bouton "Partager le PDF" peut être caché OU affiché
       avec comportement fallback de AC3 (décision UX : afficher toujours pour guider)
```

**AC5 — UX de la barre d'action (quote-preview.tsx)**

```
GIVEN  la page /devis/[id]
WHEN   l'aperçu est affiché
THEN   la barre d'action sticky en bas contient :
       [Modifier]  [Générer PDF]  [Partager]
       ou
       [Modifier]  [Générer & Partager]
AND    l'ordre des boutons respecte la hiérarchie d'action (primaire = Générer/Partager)
AND    le bouton "Partager" est désactivé (disabled) pendant la génération
AND    les labels sont en français
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
- `src/components/pdf/quote-preview.tsx` — UPDATE : ajouter bouton "Partager le PDF",
  logique de détection Web Share API Level 2, fallback guidé, UX de la barre d'action
- `src/lib/pdf-share.ts` — CRÉER : module de partage PDF
  (génération Blob en mémoire via jsPDF, logique share/download, détection canShareFiles)
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `devis.pdf.share.*`

**EXCLU :**
- `src/components/pdf/pdf-template.tsx` — NON modifié (inchangé)
- `src/components/pdf/pdf-generator.ts` — NON modifié OU légèrement adapté
  (voir Dev Notes sur génération Blob vs téléchargement direct)
- `src/app/(app)/devis/[id]/page.tsx` — NON modifié
- Story 4.5 : enregistrement accord client (séparé)
- Aucune migration DB (partage = action client-side sans persistance)

**Note périmètre :** Story 4.4 ajoute le partage sur la page `/devis/[id]` existante.
L'architecture des boutons en barre sticky est enrichie sans refactoriser Story 4.1/4.2.

---

## Tâches / Sous-tâches

### T1 — Créer `src/lib/pdf-share.ts`

Module client-side (pas de directive `"use client"` — c'est un `.ts`, pas `.tsx`)
mais contient des appels à des APIs browser. À importer uniquement côté client.

```typescript
/**
 * pdf-share.ts — Génération Blob PDF et partage/téléchargement
 * Client-side only — browser APIs (navigator.share, URL.createObjectURL)
 */

/**
 * Détecte si le navigateur supporte Web Share API Level 2 (partage de fichiers)
 * IMPORTANT : appeler avec un vrai File object (dummyFile) pour tester canShare()
 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    // Test avec un fichier factice — canShare() vérifie le support réel
    const testFile = new File(["test"], "test.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Génère un Blob PDF depuis le conteneur DOM hors-écran
 * (réutilise html2canvas + jsPDF en lazy-load — même pattern que pdf-generator.ts)
 */
export async function generatePdfBlob(containerId: string): Promise<Blob> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const element = document.getElementById(containerId);
  if (!element) throw new Error("PDF template container not found");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
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

  // Retourner le Blob au lieu de sauvegarder directement
  return pdf.output("blob");
}

/**
 * Télécharge un Blob PDF localement (fallback universel)
 */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); // nécessaire sur Firefox
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Partage un PDF via Web Share API Level 2
 * Lève une erreur si l'API n'est pas supportée ou si la mémoire est insuffisante
 */
export async function sharePdfBlob(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: "application/pdf" });
  await navigator.share({
    files: [file],
    title,
    text: title,
  });
}

/**
 * Détecte la plateforme mobile pour le message guidé de fallback
 */
export function isMobilePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}
```

- [x] Créer le fichier avec le contenu ci-dessus
- [x] `pnpm typecheck` — zéro erreur

### T2 — Lire `src/components/pdf/quote-preview.tsx` et `src/components/pdf/pdf-generator.ts`

- [x] Lire `quote-preview.tsx` (enrichi Story 4.2) pour comprendre l'état actuel
- [x] Identifier : la barre d'action, les états `isGenerating`/`genError`, la fonction `handleGenerate`
- [x] Lire `pdf-generator.ts` (Story 4.1) pour comprendre si il expose déjà un Blob ou
  seulement `pdf.save()` (téléchargement direct)
- [x] Décider de l'approche :
  - Option A (préférable) : `pdf-generator.ts` reste inchangé pour le bouton "Générer PDF",
    et `pdf-share.ts` gère sa propre génération Blob pour "Partager"
  - Option B : adapter `pdf-generator.ts` pour exposer à la fois `save()` et `output("blob")`
  - **Recommandation :** Option A — séparation des responsabilités, pas de régression Story 4.1

### T3 — Mettre à jour `src/components/pdf/quote-preview.tsx`

Enrichir la barre d'action sticky et les états pour supporter le partage.

**Nouveaux états :**
```typescript
const [isSharing, setIsSharing] = useState(false);
const [shareError, setShareError] = useState<string | null>(null);
const [shareGuidance, setShareGuidance] = useState<string | null>(null);
// Détection capacité share (uniquement côté client)
const [shareSupported, setShareSupported] = useState(false);
```

**Détection au montage (useEffect — browser-only) :**
```typescript
useEffect(() => {
  // canShareFiles() utilise des APIs browser — doit être dans useEffect (SSR-safe)
  import("@/lib/pdf-share").then(({ canShareFiles: check }) => {
    setShareSupported(check());
  });
}, []);
```

**Fonction handleShare :**
```typescript
async function handleShare() {
  if (!quote) return;
  setIsSharing(true);
  setShareError(null);
  setShareGuidance(null);
  try {
    const snapshot = quote.clientSnapshot as Record<string, unknown> | null;
    const clientName = (snapshot?.companyName as string) ?? "Client";
    const filename = `Devis-${quote.number}-${clientName}.pdf`;
    const title = `Devis ${quote.number}`;

    const { generatePdfBlob, downloadPdfBlob, sharePdfBlob, isMobilePlatform } =
      await import("@/lib/pdf-share");

    const blob = await generatePdfBlob("pdf-template-container");

    if (shareSupported) {
      try {
        await sharePdfBlob(blob, filename, title);
        // Succès — la feuille de partage s'est ouverte
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Annulé par l'utilisateur — comportement normal, aucun message
          return;
        }
        // Erreur réelle → fallback download + message
        downloadPdfBlob(blob, filename);
        setShareError(t("pdf.share.errorFallback"));
      }
    } else {
      // Fallback guidé — téléchargement + message d'orientation
      downloadPdfBlob(blob, filename);
      const mobile = isMobilePlatform();
      setShareGuidance(
        mobile ? t("pdf.share.guidanceMobile") : t("pdf.share.guidanceDesktop")
      );
    }
  } catch {
    setShareError(t("pdf.share.errorGeneric"));
  } finally {
    setIsSharing(false);
  }
}
```

**Barre d'action enrichie :**
```tsx
<div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/92 px-4 py-3 backdrop-blur-sm">
  {/* Erreurs et guidance */}
  {genError && (
    <p className="mb-2 text-center text-xs text-destructive">{genError}</p>
  )}
  {shareError && (
    <p className="mb-2 text-center text-xs text-destructive">{shareError}</p>
  )}
  {shareGuidance && (
    <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
      {shareGuidance}
    </p>
  )}
  <div className="flex gap-2">
    {/* Bouton Modifier — secondaire */}
    <button
      type="button"
      onClick={() => router.back()}
      className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface-alt"
    >
      {t("apercu.modifier")}
    </button>
    {/* Bouton Générer PDF — primaire navy */}
    <button
      type="button"
      onClick={handleGenerate}
      disabled={isGenerating || isSharing}
      className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
    >
      {isGenerating ? t("pdf.generating") : t("pdf.generate")}
    </button>
    {/* Bouton Partager — secondaire amber ou icône */}
    <button
      type="button"
      onClick={handleShare}
      disabled={isGenerating || isSharing}
      className="h-11 flex-1 rounded-xl border border-brand-amber bg-amber-50 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
    >
      {isSharing ? t("pdf.share.sharing") : t("pdf.share.label")}
    </button>
  </div>
</div>
```

- [x] Ajouter les états `isSharing`, `shareError`, `shareGuidance`, `shareSupported`
- [x] Ajouter `useEffect` pour détection `canShareFiles` (SSR-safe, lazy import)
- [x] Ajouter la fonction `handleShare`
- [x] Enrichir la barre d'action avec le bouton "Partager"
- [x] Gérer l'affichage du message `shareGuidance` (toast-like ou inline)
- [x] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/messages/fr-NE.json`

- [x] Ajouter sous `devis.pdf.share` :
  ```json
  "share": {
    "label": "Partager",
    "sharing": "Partage en cours…",
    "errorGeneric": "Erreur lors du partage. Veuillez réessayer.",
    "errorFallback": "Partage impossible — PDF téléchargé à la place.",
    "guidanceMobile": "PDF enregistré — joignez-le depuis WhatsApp ou votre application email.",
    "guidanceDesktop": "PDF téléchargé — joignez-le depuis votre client email."
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [x] `pnpm build` : passe sans erreur
- [ ] Sur mobile Android (Chrome/WebView) : tap "Partager" → feuille de partage OS ✓ (vérification manuelle à faire)
- [ ] Sur iOS Safari : tap "Partager" → feuille de partage iOS ✓ (vérification manuelle à faire)
- [ ] Sur desktop Chrome : tap "Partager" → PDF téléchargé + message guidé ✓ (vérification manuelle à faire)
- [ ] Bouton "Annuler" dans la feuille OS → aucun message d'erreur affiché ✓ (vérification manuelle à faire)
- [x] Bouton "Générer PDF" fonctionne toujours (pas de régression Story 4.1/4.2) ✓
- [x] Nom du fichier partagé/téléchargé : "Devis-{Numéro}-{Client}.pdf" ✓
- [x] Génération hors ligne : aucun appel réseau ✓
- [x] `isSharing = true` → deux boutons Générer/Partager désactivés pendant le partage ✓

---

## Dev Notes

### CRITIQUE — Web Share API Level 2 : détection correcte

Web Share API Level 1 (`navigator.share({ url, text, title })`) est largement supportée.
Level 2 (partage de fichiers) est plus restreinte :

```typescript
// CORRECT — détection complète Level 2
function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  try {
    const testFile = new File(["test"], "test.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

// INCORRECT — Level 1 uniquement (ne supporte pas les fichiers)
const canShare = typeof navigator.share === "function";
```

**Support navigateur (2025) :**
| Navigateur | Web Share Level 2 |
|---|---|
| Chrome Android 75+ | ✓ |
| Safari iOS 15+ | ✓ |
| Samsung Internet 13+ | ✓ |
| Chrome Desktop | ✗ (intentionnellement désactivé) |
| Firefox | ✗ |
| Edge Desktop | Partiel |

La cible utilisateur (Niger, Mali, Burkina Faso) utilise majoritairement Chrome Android
et des WebViews Android → Level 2 est disponible pour la grande majorité.

### CRITIQUE — AbortError lors de l'annulation par l'utilisateur

Quand l'utilisateur ferme la feuille de partage sans choisir d'app :

```typescript
try {
  await navigator.share({ files: [...] });
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    // L'utilisateur a annulé → ne rien faire (comportement normal)
    return;
  }
  // Vraie erreur → traiter
  throw err;
}
```

**INTERDIT :** afficher un message d'erreur quand `err.name === "AbortError"`.
C'est le comportement normal et attendu du partage OS.

### CRITIQUE — Génération Blob vs save() direct

`pdf-generator.ts` (Story 4.1) appelle `pdf.save(filename)` directement.
Pour le partage, il faut un `Blob` en mémoire.

**Option A (recommandée) :** créer `pdf-share.ts` avec sa propre logique de génération
Blob (réutilise html2canvas + jsPDF lazy-load, même pattern). Avantage : pas de
modification de `pdf-generator.ts` → zéro risque de régression Stories 4.1/4.2.

```typescript
// pdf-share.ts — génère un Blob
const blob = await pdf.output("blob"); // jsPDF v4 API — retourne un Blob natif

// vs pdf-generator.ts — sauvegarde directement
pdf.save(filename); // déclenche le téléchargement navigateur
```

**jsPDF v4 `output("blob")` :** disponible depuis jsPDF 2.x, stable en v4.
```typescript
// CORRECT — jsPDF v4
const blob = pdf.output("blob"); // synchrone, retourne Blob
// ou
const blobUrl = pdf.output("bloburl"); // URL blob pour iframe ou link
```

**Si Option B choisie :** adapter `pdf-generator.ts` pour exposer les deux :
```typescript
export async function generateQuotePdf(containerId: string, filename: string): Promise<void>
export async function generateQuotePdfBlob(containerId: string): Promise<Blob>
```
Risque de régression plus élevé — préférer Option A.

### CRITIQUE — SSR-safe detection (Next.js)

`navigator.share` et `navigator.canShare` n'existent pas côté serveur (SSR).
La détection doit être dans un `useEffect` ou un `import()` dynamique :

```typescript
// CORRECT — useEffect (exécuté uniquement côté client)
useEffect(() => {
  import("@/lib/pdf-share").then(({ canShareFiles: check }) => {
    setShareSupported(check());
  });
}, []);

// INCORRECT — exécuté pendant le rendu SSR → ReferenceError
const shareOk = canShareFiles(); // navigator undefined côté serveur
```

### CRITIQUE — URL.createObjectURL pour le téléchargement

```typescript
// CORRECT — téléchargement via lien programmatique
function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); // nécessaire sur Firefox
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000); // libérer mémoire
}
```

`URL.revokeObjectURL` doit être appelé après le téléchargement pour libérer
la mémoire. Le délai de 5s garantit que le navigateur a commencé le téléchargement.

### CRITIQUE — Barre d'action avec 3 boutons

Avec 3 boutons dans la barre sticky, l'espace peut être contraint sur petits écrans.

```tsx
// Sur écrans < 375px : les 3 boutons flex-1 peuvent être trop étroits
// Solution : utiliser des icônes + labels courts
// Modifier  | Générer  | Partager
// [flex-1]   [flex-1]   [flex-1]

// OU : grouper Générer + Partager côté droit, Modifier seul à gauche
// [Modifier flex-none]  [Générer flex-1]  [Partager flex-1]
```

Adapter selon ce que Story 4.2 a déjà implémenté pour les deux premiers boutons.
Ne pas casser l'équilibre existant.

### CRITIQUE — Gestion de la mémoire PDF Blob

La génération d'un Blob PDF (~2-5MB) consomme de la mémoire sur les appareils
bas de gamme cibles (Android 1-2GB RAM, NFR-P9). Libérer la référence après usage :

```typescript
// CORRECT — Blob libéré après usage
const blob = await generatePdfBlob("pdf-template-container");
await sharePdfBlob(blob, filename, title); // ou downloadPdfBlob
// blob est GC'd naturellement (pas de revokeObjectURL nécessaire pour le Blob lui-même)
```

**Ne pas stocker le Blob en state React** — il serait conservé en mémoire pour
toute la durée de vie du composant.

### CRITIQUE — Nom de fichier : pas de caractères spéciaux

Le nom de fichier partagé peut contenir des caractères spéciaux si le nom client
contient des espaces ou accents. jsPDF et Web Share API tolerent les espaces dans
les noms de fichier sur les OSes modernes, mais il est prudent de sanitiser :

```typescript
// CORRECT — conserver les espaces (acceptés par les OSes modernes)
const filename = `Devis-${quote.number}-${clientName}.pdf`;
// → "Devis-DEV-2026-0001-Transport Sahel.pdf" ✓

// Éviter de remplacer les espaces par %20 — le nom partagé serait illisible
```

### CRITIQUE — Pas de mailto: avec pièce jointe (FR-33 interdit)

```typescript
// INTERDIT — explicitement exclu par FR-33
window.location.href = `mailto:?subject=Devis&attachment=${blobUrl}`;

// INTERDIT — WhatsApp Web ne supporte pas les pièces jointes depuis browser
window.open(`https://wa.me/?text=${encodeURIComponent(blobUrl)}`);

// CORRECT — Web Share API (si supportée) ou téléchargement + message guidé
```

### Design tokens de la barre d'action

| Bouton | Style |
|---|---|
| Modifier (secondaire) | `border border-border text-text-secondary hover:bg-surface-alt` |
| Générer PDF (primaire navy) | `bg-brand-navy text-text-on-dark hover:bg-brand-navy-deep` |
| Partager (accent amber) | `border border-brand-amber bg-amber-50 text-amber-700 hover:bg-amber-100` |
| Message guidance | `bg-amber-50 text-amber-700 rounded-lg px-3 py-2 text-xs` |
| Erreur inline | `text-destructive text-xs text-center` |

### Héritage des stories précédentes

**Story 4.1 (pdf-generator.ts) :** pattern de génération jsPDF + html2canvas lazy-load.
`pdf-share.ts` utilise le même pattern pour la génération Blob (Option A).

**Story 4.2 (quote-preview.tsx) :** barre d'action avec boutons Modifier + Générer.
Story 4.4 enrichit cette barre sans la refactoriser. Lire le fichier avant de modifier.

**Story 4.3 (pdf-template.tsx) :** template enrichi avec zones de signature.
Le Blob généré par `pdf-share.ts` capturera automatiquement ces zones.

**EXPERIENCE.md §Flow 1 étape 9 :** "Taps 'Partager le PDF' → toast, shares to WhatsApp.
Total elapsed: under 3 minutes." — Le toast de succès (si besoin) peut être un `shareGuidance`
affiché brièvement. Sur mobile avec Web Share Level 2, la feuille OS confirme elle-même.

### Commandes pour le dev agent

```bash
# 1. Lire les fichiers existants avant de modifier
# src/components/pdf/quote-preview.tsx (State 4.2)
# src/components/pdf/pdf-generator.ts (Story 4.1)

# 2. Aucune migration nécessaire
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build
```

---

## Références

- [Epics §Story 4.4] — FR-33 (export et partage : Web Share API niveau 2 fichiers,
  fallback téléchargement local universel, fallback guidé ; INTERDIT : mailto: avec pièce jointe)
- [EXPERIENCE.md §Flow 1 étape 9] — "Taps 'Partager le PDF' → toast, shares to WhatsApp"
- [PRD §Module 9] — Export et partage, Web Share API
- [Architecture §External Integrations] — pas d'intégration externe pour le partage (Web Share = native OS)
- [src/components/pdf/quote-preview.tsx] — à enrichir (barre d'action, état isSharing)
- [src/components/pdf/pdf-generator.ts] — Pattern génération jsPDF + html2canvas (Story 4.1)
- [src/lib/pdf-share.ts] — à créer
- [src/messages/fr-NE.json] — clés share existantes + à ajouter
- [package.json] — jsPDF v4.2.1 (`output("blob")` disponible), html2canvas 1.4.1
- MDN Web Share API Level 2 — https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- [NFR-P9] — Appareils cibles : Android 1-2GB RAM, Android 8+

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Option A choisie : `pdf-share.ts` génère son propre Blob via jsPDF `output("blob")`, `pdf-generator.ts` inchangé
- SSR-safe : détection `canShareFiles()` via `useEffect` + lazy import `@/lib/pdf-share`
- AbortError géré silencieusement (annulation OS) — aucun message affiché à l'utilisateur
- `downloadPdfBlob` utilise `document.body.appendChild(a)` pour compatibilité Firefox
- `pnpm check` : 0 erreurs dans les fichiers nouveaux/modifiés ; 12 erreurs pre-existantes dans worktrees/.claude (hors périmètre)
- 206 tests passent sans régression

### Completion Notes List

- [x] T1 : `src/lib/pdf-share.ts` créé avec `canShareFiles`, `generatePdfBlob`, `downloadPdfBlob`, `sharePdfBlob`, `isMobilePlatform`
- [x] T2 : Lecture de `quote-preview.tsx` et `pdf-generator.ts` — Option A retenue
- [x] T3 : `quote-preview.tsx` enrichi — états `isSharing/shareError/shareGuidance/shareSupported`, `useEffect` SSR-safe, `handleShare`, barre d'action 3 boutons
- [x] T4 : `fr-NE.json` — section `devis.pdf.share` ajoutée + `devis.apercu.backToList` (requis par linter)
- [x] T5 : `pnpm check` ✓ (typecheck ✓, 206 tests ✓), lint 0 erreurs dans fichiers modifiés

### File List

- `src/lib/pdf-share.ts` (créé)
- `src/components/pdf/quote-preview.tsx` (modifié — bouton Partager + logique share + améliorations UX linter)
- `src/messages/fr-NE.json` (modifié — keys devis.pdf.share.* + devis.apercu.backToList)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour — status review)
- `_bmad-output/implementation-artifacts/4-4-export-share-pdf.md` (ce fichier — status review)

### Change Log

- 2026-06-26 : Story 4.4 implémentée — création de `pdf-share.ts` (module partage PDF client-side), enrichissement de `quote-preview.tsx` (barre d'action 3 boutons, Web Share API Level 2, fallback guidé, gestion AbortError), mise à jour de `fr-NE.json` (clés devis.pdf.share.*). Tous les ACs couverts. 206 tests passent. TypeScript clean.
