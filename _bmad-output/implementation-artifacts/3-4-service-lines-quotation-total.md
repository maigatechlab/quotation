---
story_key: 3-4-service-lines-quotation-total
epic_num: 3
story_num: 4
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 3.4 : Lignes de prestations & total devis (FR-21, FR-22, FR-23)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** ajouter, modifier et supprimer des lignes de prestations avec un total recalculé en direct,
**Afin que** je détaille tous les frais et obtienne le montant total du devis.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage wizard étape 4 (Prestations)**

```
GIVEN  un devis créé avec client (étape 1), trajet (étape 2) et marchandise (étape 3)
WHEN   le commercial arrive à l'étape 4 (Prestations)
THEN   WizardStepServices s'affiche avec :
         - en-tête "Prestations" (step 4/5 dans la progress bar)
         - lignes chargées depuis db.quoteLines.where("quoteId").equals(quoteId).sortBy("ordre")
         - si aucune ligne en DB : une ligne vide pré-créée (désignation vide, prix 0, qté 1)
         - bouton "Ajouter une ligne"
         - card total devis (live, aria-live="polite")
         - bouton "Précédent" → setStep(3)
         - bouton "Suivant" → validation + persistance + setStep(5)
```

**AC2 — Ajout de ligne (FR-21, UX-DR10)**

```
GIVEN  l'étape Prestations
WHEN   le commercial clique "Ajouter une ligne"
THEN   une nouvelle ligne est ajoutée avec : désignation vide, prix 0, quantité 1 (défaut)
AND    désignation et prix sont obligatoires (bloquent "Suivant" si vides/invalides)
AND    stepper −/+ pour la quantité : min 1, targets ≥44×44px (UX-DR22)
AND    total ligne = computeLineTotal(unitPrice, qty) s'affiche live dans la ligne
```

**AC3 — Modification de ligne (FR-22)**

```
GIVEN  une ligne existante
WHEN   le commercial modifie désignation, prix ou quantité
THEN   le total de la ligne se recalcule via computeLineTotal(unitPrice, qty)
AND    le total du devis se recalcule via computeQuoteTotal(toutes les lignes) (FR-23)
AND    les résultats sont annoncés via aria-live="polite" (NFR-A3)
AND    recalcul < 100ms pour 20 lignes (NFR-P3)
```

**AC4 — Suppression de ligne (FR-22)**

```
GIVEN  au moins 2 lignes
WHEN   le commercial supprime une ligne
THEN   la ligne est retirée de la liste
AND    les totaux se recalculent immédiatement

GIVEN  exactement 1 ligne
WHEN   le commercial tente de supprimer la ligne
THEN   le bouton Supprimer est désactivé (disabled) avec aria-disabled="true"
AND    aria-label indique "Au moins une ligne est requise"
```

**AC5 — Réordonnancement (FR-22)**

```
GIVEN  plusieurs lignes affichées
WHEN   le commercial réordonne via drag & drop (@dnd-kit/sortable)
THEN   l'ordre visuel des lignes est mis à jour localement
AND    le champ ordre de chaque ligne reflète sa position (0-based)
AND    les totaux restent corrects après réordonnancement
```

**AC6 — Calcul total devis live (FR-23, UX-DR19)**

```
GIVEN  l'ensemble des lignes
WHEN   une ligne change (ajout, modification, suppression, réordonnancement)
THEN   total_devis = computeQuoteTotal(lines.map(l => ({ totalFcfa: computeLineTotal(l.unitPrice, l.qty) })))
AND    affiché en FCFA formaté via formatFcfa() (ex : "1 500 000 XOF")
AND    annoncé via aria-live="polite" aria-atomic="true"
AND    hero card style : font-serif text-2xl font-semibold text-brand-navy (UX-DR6)
```

**AC7 — Validation avant navigation vers étape 5**

```
GIVEN  le bouton "Suivant"
WHEN   au moins une ligne a désignation vide
THEN   erreur inline "La désignation est requise" sur la ligne concernée (aria-describedby)
AND    la navigation est bloquée

GIVEN  le bouton "Suivant"
WHEN   au moins une ligne a unitPrice = 0 ou invalide
THEN   erreur inline "Le prix est requis" sur la ligne concernée
AND    la navigation est bloquée

GIVEN  toutes les lignes valides (designation non vide, unitPrice > 0)
WHEN   le commercial clique "Suivant"
THEN   validation passe → persistance déclenchée (AC8)
```

**AC8 — Persistance lignes & totalFcfa au devis**

```
GIVEN  toutes les lignes valides
WHEN   le commercial clique "Suivant"
THEN   pour chaque id dans deletedLineIds :
         dbLine = await db.quoteLines.get(id)
         applyLocalMutation("quoteLine", id, "delete", {}, dbLine.revision, () => db.quoteLines.delete(id), userId)
AND    pour chaque ligne NEW (isNew = true) :
         applyLocalMutation("quoteLine", line.id, "create", linePayload, 0, () => db.quoteLines.put(lineRecord), userId)
AND    pour chaque ligne existante (isNew = false) :
         dbLine = await db.quoteLines.get(line.id)
         applyLocalMutation("quoteLine", line.id, "update", linePayload, dbLine.revision, () => db.quoteLines.put(updatedRecord), userId)
AND    currentQuote = await db.quotes.get(quoteId)
AND    applyLocalMutation("quote", quoteId, "update", { ...currentQuote, totalFcfa: computedTotal, updatedAt: now }, currentQuote.revision, () => db.quotes.put(updatedQuote), userId)
AND    db.auditMirror.add({ what: "quote.services_update", ... }) APRÈS tous les applyLocalMutation
AND    void triggerSync()
AND    useWizardStore.getState().setStep(5)
```

**AC9 — WizardStep5Stub (étape 5 — Conditions/Récap)**

```
GIVEN  l'étape 5 non encore implémentée (Story 3.6/3.8)
WHEN   le commercial arrive à l'étape 5
THEN   WizardStep5Stub s'affiche : texte via tW("stubStep", { step: 5, label: "Conditions" })
AND    bouton "Précédent" → setStep(4)
AND    bouton "Terminer" → resetWizard() + router.push("/devis")
```

**AC10 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/quote/wizard-step-services.tsx` — CRÉER : étape 4 (lignes prestations + total live)
- `src/components/quote/quote-wizard.tsx` — UPDATE : remplacer WizardStep4Stub par WizardStepServices, ajouter WizardStep5Stub
- `src/messages/fr-NE.json` — UPDATE : ajouter section `devis.wizard.prestations`
- `package.json` + `pnpm-lock.yaml` — UPDATE : `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

**EXCLU :**
- Aucune migration DB — `quoteLine` table Drizzle déjà dans schema.ts (lignes 248-275) + `quoteLines` Dexie déjà dans local-db.ts (version 1)
- Aucune modification de push/route.ts — quoteLine déjà géré lignes 320-343, quote.totalFcfa ligne 306
- Aucune modification de src/lib/calc/ — computeLineTotal/computeQuoteTotal déjà dans totaux.ts
- Aucune modification de src/lib/local-db.ts — QuoteLineLocal (lignes 58-72) et QuoteLocal.totalFcfa (ligne 50) déjà présents
- Modèles de lignes réutilisables (Story 3.5)
- Conditions de paiement (Story 3.6)
- Bibliothèque de clauses (Story 3.7/3.8)

---

## Tâches / Sous-tâches

### T1 — Installer @dnd-kit

- [x] `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- [x] Vérifier que package.json est mis à jour
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/quote/wizard-step-services.tsx` (AC1–AC8)

- [x] `"use client"` première ligne
- [x] Imports :
  ```ts
  import { useState, useEffect } from "react";
  import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
  } from "@dnd-kit/core";
  import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
  } from "@dnd-kit/sortable";
  import { CSS } from "@dnd-kit/utilities";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { QuoteLocal } from "@/lib/local-db";
  import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
  import { useWizardStore } from "@/stores/wizard-store";
  import { computeLineTotal, computeQuoteTotal } from "@/lib/calc";
  import { formatFcfa } from "@/lib/money";
  ```
- [x] Type `WorkingLine` :
  ```ts
  interface WorkingLine {
    id: string;           // UUID, pré-généré pour nouvelles lignes
    designation: string;
    unitPrice: string;    // string pour input, parsé en nombre à la sauvegarde
    quantity: number;     // integer ≥ 1
    ordre: number;        // 0-based
    isNew: boolean;       // true = jamais persisté en Dexie
    dbRevision: number;   // 0 si isNew, sinon revision depuis Dexie
    createdAt: string;    // ISO string
    pays: string;
    companyId?: string;
  }
  ```
- [x] Props : `interface WizardStepServicesProps { userId: string }`
- [x] État local :
  ```ts
  const t = useTranslations("devis.wizard.prestations");
  const tW = useTranslations("devis.wizard");
  const { quoteId, setStep } = useWizardStore();
  const [lines, setLines] = useState<WorkingLine[]>([]);
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  ```
- [x] Chargement initial depuis Dexie :
  ```ts
  useEffect(() => {
    if (!quoteId) return;
    db.quoteLines
      .where("quoteId").equals(quoteId)
      .sortBy("ordre")
      .then((dbLines) => {
        if (dbLines.length === 0) {
          setLines([newEmptyLine()]);
        } else {
          setLines(
            dbLines.map((l) => ({
              id: l.id,
              designation: l.designation,
              unitPrice: String(l.unitPrice),
              quantity: l.quantity,
              ordre: l.ordre,
              isNew: false,
              dbRevision: l.revision,
              createdAt: l.createdAt,
              pays: l.pays,
              ...(l.companyId != null ? { companyId: l.companyId } : {}),
            }))
          );
        }
        setLoaded(true);
      });
  }, [quoteId]);
  ```
- [x] Fonction `newEmptyLine()` :
  ```ts
  function newEmptyLine(): WorkingLine {
    return {
      id: crypto.randomUUID(),
      designation: "",
      unitPrice: "",
      quantity: 1,
      ordre: lines.length,
      isNew: true,
      dbRevision: 0,
      createdAt: new Date().toISOString(),
      pays: "NE",
    };
  }
  ```
- [x] Calculs live dérivés (inline dans render, pas de useEffect) :
  ```ts
  const parsedLines = lines.map((l) => {
    const price = Math.max(0, Math.round(parseFloat(l.unitPrice) || 0));
    const totalFcfa = (price > 0 && l.quantity > 0)
      ? computeLineTotal(price, l.quantity)
      : 0;
    return { ...l, parsedPrice: price, totalFcfa };
  });
  const quoteTotal = computeQuoteTotal(parsedLines.map((l) => ({ totalFcfa: l.totalFcfa })));
  ```
- [x] DnD sensors :
  ```ts
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLines((prev) => {
      const oldIdx = prev.findIndex((l) => l.id === active.id);
      const newIdx = prev.findIndex((l) => l.id === over.id);
      return arrayMove(prev, oldIdx, newIdx).map((l, i) => ({ ...l, ordre: i }));
    });
  }
  ```
- [x] `addLine()` :
  ```ts
  function addLine() {
    setLines((prev) => [...prev, { ...newEmptyLine(), ordre: prev.length }]);
  }
  ```
- [x] `updateLine(id, field, value)` :
  ```ts
  function updateLine(id: string, field: keyof WorkingLine, value: unknown) {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[id]?.[field as string];
      return copy;
    });
  }
  ```
- [x] `removeLine(id, isNew)` :
  ```ts
  function removeLine(id: string, isNew: boolean) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id).map((l, i) => ({ ...l, ordre: i })));
    if (!isNew) {
      setDeletedLineIds((prev) => [...prev, id]);
    }
  }
  ```
- [x] `handleNext()` :
  - Guard `if (!quoteId)` → setGlobalError(t("errorNoQuote")) + return
  - Validation séquentielle :
    - Pour chaque ligne : désignation vide → `lineErrors[line.id].designation = t("designationRequired")`
    - Pour chaque ligne : unitPrice vide ou ≤ 0 → `lineErrors[line.id].unitPrice = t("unitPriceRequired")`
    - Si `Object.keys(lineErrors).length > 0` → setErrors(lineErrors) + return
  - `setIsPending(true)`
  - Dans try/finally :
    ```ts
    const now = new Date().toISOString();
    // 1. Supprimer les lignes marquées supprimées
    for (const lineId of deletedLineIds) {
      const dbLine = await db.quoteLines.get(lineId);
      if (dbLine) {
        await applyLocalMutation(
          "quoteLine", lineId, "delete", {}, dbLine.revision,
          async () => { await db.quoteLines.delete(lineId); },
          userId
        );
      }
    }
    // 2. Créer/mettre à jour les lignes restantes
    for (const line of lines) {
      const parsedPrice = Math.round(parseFloat(line.unitPrice) || 0);
      const total = computeLineTotal(parsedPrice, line.quantity);
      const payload: Record<string, unknown> = {
        quoteId,
        designation: line.designation.trim(),
        unitPrice: parsedPrice,
        quantity: line.quantity,
        totalFcfa: total,
        ordre: line.ordre,
        pays: line.pays,
        updatedAt: now,
        createdAt: line.createdAt,
      };
      if (line.companyId != null) payload.companyId = line.companyId;

      if (line.isNew) {
        await applyLocalMutation(
          "quoteLine", line.id, "create", payload, 0,
          async () => {
            await db.quoteLines.put({
              id: line.id,
              quoteId,
              designation: String(payload.designation),
              unitPrice: parsedPrice,
              quantity: line.quantity,
              totalFcfa: total,
              ordre: line.ordre,
              pays: line.pays,
              revision: 0,
              updatedAt: now,
              createdAt: line.createdAt,
              ...(line.companyId != null ? { companyId: line.companyId } : {}),
            });
          },
          userId
        );
      } else {
        const dbLine = await db.quoteLines.get(line.id);
        if (dbLine) {
          await applyLocalMutation(
            "quoteLine", line.id, "update", payload, dbLine.revision,
            async () => {
              await db.quoteLines.put({
                ...dbLine,
                designation: String(payload.designation),
                unitPrice: parsedPrice,
                quantity: line.quantity,
                totalFcfa: total,
                ordre: line.ordre,
                updatedAt: now,
              });
            },
            userId
          );
        }
      }
    }
    // 3. Mettre à jour quote.totalFcfa
    const currentQuote = await db.quotes.get(quoteId);
    if (!currentQuote) { setGlobalError(t("errorNoQuote")); return; }
    const newTotal = computeQuoteTotal(
      parsedLines.map((l) => ({ totalFcfa: l.totalFcfa }))
    );
    const updatedQuote: QuoteLocal = { ...currentQuote, totalFcfa: newTotal, updatedAt: now };
    await applyLocalMutation(
      "quote", quoteId, "update",
      { ...currentQuote, totalFcfa: newTotal, updatedAt: now },
      currentQuote.revision,
      async () => { await db.quotes.put(updatedQuote); },
      userId
    );
    // 4. AuditMirror APRÈS tous les applyLocalMutation (hors tx)
    await db.auditMirror.add({
      id: crypto.randomUUID(),
      who: userId,
      what: "quote.services_update",
      when: now,
      where: "/devis/nouveau",
      entityType: "quote",
      entityId: quoteId,
      before: { lineCount: deletedLineIds.length + lines.filter(l => !l.isNew).length },
      after: { lineCount: lines.length, totalFcfa: newTotal },
      createdAt: now,
      synced: false,
    });
    void triggerSync();
    useWizardStore.getState().setStep(5);
    ```
- [x] Composant `SortableLineRow` (défini dans le même fichier) :
  ```tsx
  function SortableLineRow({ line, parsedPrice, totalFcfa, errors, onUpdate, onRemove, isOnly, isPending, t }: ...) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: line.id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    // ... rendu avec drag handle, inputs, stepper, total ligne
  }
  ```
- [x] Drag handle avec aria-label (accessible) + `touch-none` (éviter conflit scroll mobile)
- [x] Stepper −/+ (AC2, UX-DR10) :
  ```tsx
  <button
    type="button"
    aria-label={t("decreaseQty")}
    onClick={() => onUpdate(line.id, "quantity", Math.max(1, line.quantity - 1))}
    disabled={line.quantity <= 1 || isPending}
    className="flex h-11 w-11 items-center justify-center rounded-xl border border-input bg-surface text-text-primary disabled:opacity-40"
  >
    −
  </button>
  <span className="w-8 text-center text-sm font-semibold text-text-primary">{line.quantity}</span>
  <button
    type="button"
    aria-label={t("increaseQty")}
    onClick={() => onUpdate(line.id, "quantity", line.quantity + 1)}
    disabled={isPending}
    className="flex h-11 w-11 items-center justify-center rounded-xl border border-input bg-surface text-text-primary disabled:opacity-40"
  >
    +
  </button>
  ```
- [x] Total ligne affiché dans la ligne :
  ```tsx
  <p className="text-xs text-text-muted">{t("lineTotal")} : <span className="font-semibold text-text-primary">{parsedPrice > 0 ? formatFcfa(totalFcfa) : "—"}</span></p>
  ```
- [x] Card total devis (live region) :
  ```tsx
  <div aria-live="polite" aria-atomic="true" className="rounded-xl border border-border bg-surface p-4 mt-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
      {t("quoteTotalLabel")}
    </p>
    <p className="font-serif text-2xl font-semibold text-brand-navy">
      {formatFcfa(quoteTotal)}
    </p>
    <p className="text-xs text-text-muted mt-0.5">{t("quoteTotalCaption", { count: lines.length })}</p>
  </div>
  ```
- [x] Bouton "Ajouter une ligne" :
  ```tsx
  <button type="button" onClick={addLine} disabled={isPending}
    className="flex items-center gap-2 h-10 rounded-xl border border-dashed border-border px-4 text-sm text-text-secondary hover:bg-surface disabled:opacity-60">
    + {t("addLine")}
  </button>
  ```
- [x] Skeleton si `!loaded` :
  ```tsx
  if (!loaded) {
    return (
      <div className="space-y-3 px-5 pb-6 pt-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-border" />
        ))}
      </div>
    );
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/components/quote/quote-wizard.tsx` (AC9)

- [x] Supprimer `WizardStep4Stub` (entièrement)
- [x] Ajouter import : `import { WizardStepServices } from "./wizard-step-services";`
- [x] Ajouter `WizardStep5Stub` :
  ```tsx
  function WizardStep5Stub() {
    const router = useRouter();
    const { setStep, resetWizard } = useWizardStore();
    const tW = useTranslations("devis.wizard");

    function handleFinish() {
      resetWizard();
      router.push("/devis");
    }

    return (
      <div className="space-y-6 px-5 pb-6">
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-text-secondary">
            {tW("stubStep", { step: 5, label: "Conditions" })}
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setStep(4)}
            className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface">
            {tW("previous")}
          </button>
          <button type="button" onClick={handleFinish}
            className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep">
            {tW("finish")}
          </button>
        </div>
      </div>
    );
  }
  ```
- [x] Remplacer `{step === 4 && <WizardStep4Stub />}` par `{step === 4 && <WizardStepServices userId={userId} />}`
- [x] Ajouter `{step === 5 && <WizardStep5Stub />}`
- [x] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/messages/fr-NE.json` (labels UI)

- [x] Ajouter sous `devis.wizard` (après la section `marchandise`) :
  ```json
  "prestations": {
    "heading": "Prestations",
    "addLine": "Ajouter une ligne",
    "designationLabel": "Désignation",
    "designationPlaceholder": "Ex : Transport Niamey-Agadez",
    "designationRequired": "La désignation est requise",
    "unitPriceLabel": "Prix unitaire (FCFA)",
    "unitPricePlaceholder": "Ex : 250000",
    "unitPriceRequired": "Le prix est requis",
    "quantityLabel": "Qté",
    "decreaseQty": "Diminuer la quantité",
    "increaseQty": "Augmenter la quantité",
    "lineTotal": "Total ligne",
    "removeLine": "Supprimer la ligne",
    "removeLineDisabled": "Au moins une ligne est requise",
    "dragHandle": "Déplacer la ligne",
    "quoteTotalLabel": "Total devis",
    "quoteTotalCaption": "{count, plural, one {# prestation} other {# prestations}}",
    "saving": "Enregistrement…",
    "errorNoQuote": "Devis introuvable. Recommencez depuis l'étape 1.",
    "errorGeneric": "Une erreur est survenue. Veuillez réessayer."
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC10)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (pas de régression)
- [x] `pnpm build` : passe sans erreur
- [x] Navigation : étape 3 → Suivant → étape 4 affichée avec ligne vide ✓
- [x] Ajout ligne → total live mis à jour ✓
- [x] Stepper − bloqué à 1 ✓
- [x] Suppression dernière ligne : bouton désactivé ✓
- [x] Drag & drop réordonne les lignes ✓
- [x] Suivant → naviguer vers étape 5 stub ✓
- [x] Précédent → retour étape 3 ✓
- [x] Retour sur étape 4 (après step 5) : lignes chargées depuis Dexie ✓

---

## Dev Notes

### CRITIQUE — Deps drag & drop à installer

```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Ces packages n'existent PAS encore dans le projet. L'install est obligatoire avant d'importer.

### CRITIQUE — QuoteLineLocal et quoteLines Dexie déjà présents

```typescript
// src/lib/local-db.ts:58-72 — QuoteLineLocal a :
interface QuoteLineLocal {
  id: string;
  quoteId: string;
  designation: string;
  unitPrice: number;   // integer FCFA
  quantity: number;    // integer ≥ 1
  totalFcfa: number;   // integer, computeLineTotal(unitPrice, quantity)
  ordre: number;       // integer 0-based
  templateId?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

// src/lib/local-db.ts:160 — table Dexie :
quoteLines!: EntityTable<QuoteLineLocal, "id">;
// Index : "id, quoteId, ordre, companyId, pays, revision"
```

**INTERDIT :** modifier local-db.ts. Toutes les colonnes sont déjà présentes.

### CRITIQUE — quoteLine dans push/route.ts déjà opérationnel (NE PAS MODIFIER)

```typescript
// src/app/api/v1/sync/push/route.ts:320-343 — déjà géré :
case "quoteLine": {
  if (op.type === "delete") {
    await db.delete(quoteLineTable).where(eq(quoteLineTable.id, op.entityId));
  } else {
    const lineValues = {
      quoteId: str(p.quoteId),
      designation: str(p.designation),
      unitPrice: intN(p.unitPrice) ?? 0,
      quantity: intN(p.quantity) ?? 1,
      totalFcfa: intN(p.totalFcfa) ?? 0,
      ordre: intN(p.ordre) ?? 0,
      templateId: strN(p.templateId),
      // ...
    };
    await db.insert(quoteLineTable)...onConflictDoUpdate(...)
  }
}
// quote.totalFcfa → ligne 306 : totalFcfa: intN(p.totalFcfa) ?? 0
```

**INTERDIT :** toute modification de push/route.ts.

### CRITIQUE — Fonctions calc déjà dans src/lib/calc/totaux.ts

```typescript
// src/lib/calc/totaux.ts
export function computeLineTotal(unitPrice: number, qty: number): number
// → roundFcfa(unitPrice * qty) — throw CalcError si négatif ou non fini

export function computeQuoteTotal(lines: { totalFcfa: number }[]): number
// → reduce avec roundFcfa
```

Ces fonctions sont exportées depuis `src/lib/calc/index.ts` :
```typescript
export { computeLineTotal, computeQuoteTotal } from "./totaux";
```

**INTERDIT :** inline `unitPrice * qty` ou `lines.reduce((s,l) => s + l.totalFcfa, 0)` sans passer par ces fonctions.

### CRITIQUE — calc index.ts exports complets

```typescript
// src/lib/calc/index.ts exports :
export { CalcError } from "./error";
export { computeCamions, MIN_TONNAGE, MAX_TONNAGE, MIN_CAPACITY, MAX_CAPACITY } from "./camions";
export { computeValeurMarchandise, MIN_PRICE, MAX_PRICE, MIN_RATE } from "./valeur";
export { computeLineTotal, computeQuoteTotal } from "./totaux";
```

### CRITIQUE — Pattern applyLocalMutation pour quoteLine

Entity `"quoteLine"` est un SyncOpEntity valide (src/lib/local-db.ts:122-126).

```typescript
// CORRECT — nouvelle ligne
await applyLocalMutation(
  "quoteLine",
  lineId,
  "create",
  payload,          // Record<string, unknown>
  0,                // baseRevision = 0 pour nouvelle entité
  async () => { await db.quoteLines.put(lineRecord); },
  userId
);

// CORRECT — ligne existante
await applyLocalMutation(
  "quoteLine",
  lineId,
  "update",
  payload,
  dbLine.revision,  // revision lue depuis Dexie
  async () => { await db.quoteLines.put(updatedRecord); },
  userId
);

// CORRECT — suppression
await applyLocalMutation(
  "quoteLine",
  lineId,
  "delete",
  {},
  dbLine.revision,
  async () => { await db.quoteLines.delete(lineId); },
  userId
);
```

### CRITIQUE — Ordre de persistance

1. D'abord : supprimer les lignes marquées (`deletedLineIds`)
2. Ensuite : créer/mettre à jour les lignes restantes
3. Enfin : mettre à jour `quote.totalFcfa`
4. Après tout : `db.auditMirror.add(...)` (hors transaction)
5. Dernier : `void triggerSync()` + `useWizardStore.getState().setStep(5)`

**INTERDIT :** `db.auditMirror.add` dans le dexieWriteFn (intérieur de la transaction).

### CRITIQUE — Calcul du total depuis l'état (pas depuis DB)

```typescript
// CORRECT — utiliser parsedLines calculés dans le render
const newTotal = computeQuoteTotal(
  parsedLines.map((l) => ({ totalFcfa: l.totalFcfa }))
);

// INCORRECT — re-requêter Dexie après mutations (race condition possible)
const dbLinesAfter = await db.quoteLines.where("quoteId").equals(quoteId).toArray();
const newTotal = computeQuoteTotal(dbLinesAfter);
```

### CRITIQUE — unitPrice stocké en integer

```typescript
// CORRECT
const parsedPrice = Math.round(parseFloat(line.unitPrice) || 0);
unitPrice: parsedPrice,
totalFcfa: computeLineTotal(parsedPrice, line.quantity),

// INCORRECT — float
unitPrice: parseFloat(line.unitPrice),
```

### CRITIQUE — exactOptionalPropertyTypes

TS config a `exactOptionalPropertyTypes: true`. Champs optionnels ne peuvent pas être `undefined` explicitement.

```typescript
// CORRECT — spread conditionnel pour champs optionnels
const record: QuoteLineLocal = {
  id: line.id,
  quoteId,
  designation: ...,
  unitPrice: parsedPrice,
  quantity: line.quantity,
  totalFcfa: total,
  ordre: line.ordre,
  pays: line.pays,
  revision: 0,
  updatedAt: now,
  createdAt: line.createdAt,
  ...(line.companyId != null ? { companyId: line.companyId } : {}),
  // templateId intentionnellement absent = aucune ligne de template ici
};

// INCORRECT
{ ..., companyId: line.companyId ?? undefined }
```

### CRITIQUE — Composant SortableLineRow avec @dnd-kit

```tsx
// Pattern useSortable — défini dans le même fichier wizard-step-services.tsx
function SortableLineRow({ line, ... }: SortableLineRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-surface p-4">
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab text-text-muted"
        aria-label={t("dragHandle")}
      >
        ⠿
      </button>
      {/* ... inputs, stepper, total */}
    </div>
  );
}
```

**IMPORTANT :** `touch-none` sur le drag handle est obligatoire pour éviter que le scroll mobile soit capturé par le drag.

### CRITIQUE — DndContext dans WizardStepServices

```tsx
return (
  <div className="space-y-4 px-5 pb-6">
    <h2 className="font-serif text-xl font-semibold text-text-primary">{t("heading")}</h2>

    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={lines.map(l => l.id)} strategy={verticalListSortingStrategy}>
        {parsedLines.map((pl) => (
          <SortableLineRow
            key={pl.id}
            line={pl}
            parsedPrice={pl.parsedPrice}
            totalFcfa={pl.totalFcfa}
            errors={errors[pl.id] ?? {}}
            onUpdate={updateLine}
            onRemove={removeLine}
            isOnly={lines.length === 1}
            isPending={isPending}
            t={t}
          />
        ))}
      </SortableContext>
    </DndContext>

    {/* Ajouter une ligne */}
    <button ...>+ {t("addLine")}</button>

    {/* Total devis - live region */}
    <div aria-live="polite" aria-atomic="true" ...>
      <p className="font-serif text-2xl font-semibold text-brand-navy">{formatFcfa(quoteTotal)}</p>
    </div>

    {/* Erreur globale */}
    {globalError && <p className="text-xs text-destructive">{globalError}</p>}

    {/* Navigation */}
    <div className="flex gap-3">
      <button type="button" onClick={() => setStep(3)} disabled={isPending}
        className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60">
        {tW("previous")}
      </button>
      <button type="button" onClick={handleNext} disabled={isPending}
        className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60">
        {isPending ? t("saving") : tW("next")}
      </button>
    </div>
  </div>
);
```

### CRITIQUE — WizardStep5Stub utilise les clés i18n existantes

```tsx
// fr-NE.json contient déjà (src/messages/fr-NE.json:111-112) :
// "previous": "Précédent"
// "finish": "Terminer"
// "stubStep": "Étape {step} — {label} (à venir)"

// CORRECT
const tW = useTranslations("devis.wizard");
tW("stubStep", { step: 5, label: "Conditions" })
tW("previous")
tW("finish")

// INCORRECT — hardcoder les strings
"Étape 5 — Conditions (à venir)"
```

### CRITIQUE — Navigation inter-étapes via Zustand (jamais router.push pour les étapes)

```typescript
// CORRECT
useWizardStore.getState().setStep(5);  // dans callback async
setStep(3);                             // dans handler sync (Précédent)

// INTERDIT
router.push("/devis/nouveau?step=5");
```

### CRITIQUE — quoteId depuis le wizard store

```typescript
const { quoteId, setStep } = useWizardStore();
if (!quoteId) { setGlobalError(t("errorNoQuote")); return; }
```

### CRITIQUE — Pattern `db.quotes.put()` (pas `.update()`) pour quote total

```typescript
// CORRECT
const updatedQuote: QuoteLocal = { ...currentQuote, totalFcfa: newTotal, updatedAt: now };
await db.quotes.put(updatedQuote);

// INCORRECT
await db.quotes.update(quoteId, { totalFcfa: newTotal });
```

### CRITIQUE — Payload pour delete : objet vide `{}`

```typescript
// CORRECT — delete n'a pas besoin de payload
await applyLocalMutation("quoteLine", lineId, "delete", {}, dbLine.revision, ...);

// INCORRECT
await applyLocalMutation("quoteLine", lineId, "delete", { id: lineId }, ...);
```

### Design tokens (DESIGN.md)

```tsx
// Card ligne prestation
className="rounded-xl border border-border bg-surface p-4"

// Input standard
className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"

// Label
className="text-xs font-semibold text-text-muted"

// Erreur inline
className="text-xs text-destructive"

// Hero card total
className="rounded-xl border border-border bg-surface p-4"
// Valeur : className="font-serif text-2xl font-semibold text-brand-navy"

// Bouton Précédent
className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60"

// Bouton Suivant / Primaire
className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"

// Bouton Ajouter ligne (dashed border)
className="flex items-center gap-2 h-10 rounded-xl border border-dashed border-border px-4 text-sm text-text-secondary hover:bg-surface disabled:opacity-60"

// Bouton supprimer (icon only, ≥44×44px, destructive)
className="flex h-11 w-11 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 disabled:opacity-30"
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `unitPrice * qty` inline | `computeLineTotal(unitPrice, qty)` |
| `lines.reduce((s,l) => s + l.totalFcfa, 0)` | `computeQuoteTotal(lines)` |
| `applyLocalMutation("quoteLine", id, "create", payload, 0, ...)` avec baseRevision ≠ 0 | baseRevision = 0 pour nouvelle ligne |
| `db.quoteLines.update(id, partialFields)` | `db.quoteLines.put(completeRecord)` |
| `db.quotes.update(quoteId, { totalFcfa })` | `db.quotes.put({ ...currentQuote, totalFcfa, updatedAt })` |
| `companyId: undefined` dans le record | `...(companyId != null ? { companyId } : {})` |
| `db.auditMirror.add` dans dexieWriteFn | Après tous les `await applyLocalMutation(...)` |
| `router.push("/devis/nouveau?step=5")` | `useWizardStore.getState().setStep(5)` |
| Modifier push/route.ts | quoteLine déjà lignes 320-343 |
| Modifier local-db.ts | QuoteLineLocal déjà lignes 58-72 |
| Modifier src/lib/calc/ | computeLineTotal/computeQuoteTotal déjà dans totaux.ts |
| Importer @dnd-kit sans `pnpm add` | Installer avant d'importer |
| `touch-action: pan-y` sur drag handle | `touch-none` CSS class obligatoire |
| Hardcoder strings UI | Utiliser `src/messages/fr-NE.json` + `useTranslations` |

### Héritage des stories précédentes

**Story 3.3 (wizard-step-goods.tsx) — patron direct :**
- Pattern `useTranslations("devis.wizard.X")` + `tW = useTranslations("devis.wizard")`
- Pattern `handleNext` avec `isPending + setErrors + try/catch/finally`
- Pattern `applyLocalMutation "update" + db.quotes.put + auditMirror hors tx + triggerSync`
- Pattern `useWizardStore.getState().setStep(n)` dans callback async
- Pattern d'erreurs inline avec `aria-describedby` + `aria-invalid`
- Pattern skeleton loading (attente chargement)

**Story 3.2 (wizard-step-route.tsx) — patron pour WizardStep5Stub :**
- WizardStep4Stub (quote-wizard.tsx:18-53) → modèle direct pour WizardStep5Stub

**Architecture §Calc & money :**
- "All monetary math through money.ts; never inline float arithmetic"
- "All quote calculations through src/lib/calc/; never recompute totals inline"
- "unitPrice stored as integer (FCFA). Round before persisting: Math.round(parsedFloat)"

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Installer @dnd-kit (OBLIGATOIRE avant d'importer)
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# 3. Aucune migration — quoteLine déjà dans schema.ts et local-db.ts
#    Vérifier migrations si besoin :
pnpm db:migrate

# 4. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 5. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.4] — FR-21 (ajout ligne prestation), FR-22 (modif/suppression/drag), FR-23 (total devis)
- [src/lib/local-db.ts:58-72] — `QuoteLineLocal` (toutes les colonnes)
- [src/lib/local-db.ts:50] — `QuoteLocal.totalFcfa: number` (non-optional)
- [src/lib/schema.ts:248-275] — table `quote_line` Drizzle (toutes les colonnes)
- [src/lib/schema.ts:209] — `totalFcfa: integer("total_fcfa").notNull().default(0)`
- [src/app/api/v1/sync/push/route.ts:320-343] — persistance quoteLine au sync (déjà opérationnel)
- [src/app/api/v1/sync/push/route.ts:306] — `totalFcfa` quote au sync (déjà opérationnel)
- [src/lib/calc/totaux.ts:16-31] — `computeLineTotal`, `computeQuoteTotal`
- [src/lib/calc/index.ts] — exports calc engine
- [src/lib/money.ts] — `formatFcfa`, `roundFcfa`
- [src/lib/sync/outbox.ts:29-60] — `applyLocalMutation` (entity, id, type, payload, revision, dexieWriteFn, createdBy)
- [src/stores/wizard-store.ts] — `quoteId`, `step`, `setStep`, `resetWizard`
- [src/components/quote/quote-wizard.tsx:18-53] — WizardStep4Stub (à remplacer)
- [src/components/quote/quote-wizard.tsx:137] — `{step === 4 && <WizardStep4Stub />}` (à remplacer)
- [src/messages/fr-NE.json:108-169] — structure wizard actuelle (ajouter `prestations` après `marchandise`)
- [UX-DR6] — Hero card (font-serif, navy, montant)
- [UX-DR10] — Qty stepper prestations (−/+, min 1, ≥44×44px)
- [UX-DR19] — Calculs live (recompute chaque keystroke, total, live region)
- [UX-DR20] — Wizard 5 étapes, étape 4 = Prestations
- [UX-DR22] — Cibles ≥44×44px (steppers)
- [Architecture §Naming Patterns] — `"use client"`, kebab-case files, PascalCase components, `@/` alias
- [Architecture §Process Patterns] — auditMirror hors transaction, triggerSync void, calculs via calc/
- [Architecture §Data Architecture] — Money integer FCFA, calc engine partagé client/serveur

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- T1 : @dnd-kit/core@6.3.1, @dnd-kit/sortable@10.0.0, @dnd-kit/utilities@3.2.2 installés via pnpm
- T2 : `WizardStepServices` créé avec `SortableLineRow` (même fichier). Imports réordonnés pour import/order ESLint. `ParsedLine extends WorkingLine` pour typage strict. `errors["designation"]` / `errors["unitPrice"]` avec noUncheckedIndexedAccess. `as WorkingLine` assertion dans updateLine pour computed property. `exactOptionalPropertyTypes` respecté partout (spread conditionnel pour companyId).
- T3 : `WizardStep4Stub` supprimé, `WizardStep5Stub` ajouté avec i18n, `useTranslations` importé dans quote-wizard.tsx, étapes 4 et 5 câblées.
- T4 : section `prestations` ajoutée dans fr-NE.json avec ICU plural pour quoteTotalCaption.
- T5 : typecheck ✓ lint ✓ (0 erreurs, 5 warnings pré-existants dans tests) build ✓ 206 tests passent sans régression.

### File List

- `src/components/quote/wizard-step-services.tsx` (créé)
- `src/components/quote/quote-wizard.tsx` (modifié)
- `src/messages/fr-NE.json` (modifié)
- `package.json` (modifié — @dnd-kit deps)
- `pnpm-lock.yaml` (modifié automatiquement par pnpm)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
- `_bmad-output/implementation-artifacts/3-4-service-lines-quotation-total.md` (modifié)

### Change Log

- Story 3-4 implémentée — WizardStepServices (étape 4 prestations + DnD + calculs live + persistance) + WizardStep5Stub — 2026-06-25
