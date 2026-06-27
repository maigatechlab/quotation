---
story_key: 3-3-goods-automatic-calculations
epic_num: 3
story_num: 3
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 3.3 : Marchandise & calculs automatiques (FR-18, FR-19, FR-20)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** saisir la marchandise et voir les calculs de camions et de valeur se mettre à jour en direct,
**Afin que** j'obtienne un chiffrage correct sans calcul manuel.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage wizard étape 3 (Marchandise)**

```
GIVEN  un devis créé en étape 1 + trajet saisi en étape 2
WHEN   le commercial arrive à l'étape 3 (Marchandise)
THEN   WizardStepGoods s'affiche avec :
         - en-tête "Marchandise" (step 3/5 dans la progress bar)
         - champ nature de la marchandise (obligatoire)
         - champ tonnage (obligatoire)
         - champ capacité camion (obligatoire)
         - result card camions (live)
         - champ prix unitaire
         - select devise source (défaut XOF/FCFA)
         - champ taux de change (affiché seulement si devise ≠ XOF)
         - result card valeur marchandise (live)
         - bouton "Précédent" → setStep(2)
         - bouton "Suivant" → validation + update + setStep(4)
```

**AC2 — Champ taux conditionnel**

```
GIVEN  le select devise source
WHEN   devise = "XOF" (FCFA)
THEN   le champ taux de change est masqué
AND    exchangeRate = 1 est utilisé en interne (non modifiable)

GIVEN  le select devise source
WHEN   devise ≠ "XOF" (ex : EUR, USD, NGN)
THEN   le champ taux de change s'affiche
AND    le commercial saisit le taux de conversion (combien de FCFA pour 1 unité)
AND    les bornes taux (MIN_RATE = 0.001, négatif bloqué) s'appliquent
```

**AC3 — Calcul live du nombre de camions (FR-19)**

```
GIVEN  les champs tonnage et capacité camion
WHEN   le commercial modifie l'un ou l'autre
THEN   la card "Nombre de camions" affiche computeCamions(tonnage, capacité) en temps réel
AND    la formule "⌈{tonnage} / {capacité}⌉ = {result}" est affichée
AND    les bornes sont appliquées :
         MIN_TONNAGE = 0.1, MAX_TONNAGE = 10 000
         MIN_CAPACITY = 1, MAX_CAPACITY = 100
AND    si capacité = 0 → la card affiche un message d'erreur "Capacité invalide" (pas de crash)
AND    si les valeurs sont hors bornes → la card affiche un message d'erreur guard

GIVEN  la card nombre de camions
WHEN   la valeur est calculée avec succès
THEN   le résultat est annoncé via aria-live="polite" (live region, NFR-A3)
```

**AC4 — Surcharge possible (FR-19, UX-DR7)**

```
GIVEN  la card nombre de camions affichant la valeur calculée
WHEN   le commercial veut ajuster manuellement le nombre de camions
THEN   un champ "Surcharge (optionnel)" optionnel est disponible
AND    si rempli, sa valeur est utilisée comme truckCount au lieu du calcul automatique
AND    si vide, c'est la valeur calculée qui est utilisée

GIVEN  une surcharge saisie
WHEN   le commercial modifie tonnage ou capacité
THEN   la card affiche le calcul mis à jour mais la surcharge reste inchangée
AND    un lien/bouton "Réinitialiser" permet de vider la surcharge et revenir au calcul auto
```

**AC5 — Calcul live de la valeur marchandise (FR-20)**

```
GIVEN  les champs tonnage, prix unitaire, taux de change (ou 1 si XOF)
WHEN   le commercial modifie l'un d'eux
THEN   la card "Valeur marchandise" affiche computeValeurMarchandise(tonnage, prix, taux) live
AND    la valeur est affichée en FCFA formaté via formatFcfa() (ex : "1 500 000 XOF")
AND    si devise ≠ XOF, le montant en devise source est aussi affiché (ex : "2 273 EUR")
AND    les bornes prix (MIN_PRICE = 0, MAX_PRICE = 1e10) et taux (MIN_RATE = 0.001) s'appliquent
AND    le résultat est annoncé via aria-live="polite" (live region, NFR-A3)
```

**AC6 — Validation avant navigation vers étape 4**

```
GIVEN  le bouton "Suivant"
WHEN  tonnage est vide ou invalide
THEN   erreur inline "Le tonnage est requis" (si vide) ou message de borne (si hors limites)
AND    la navigation est bloquée

GIVEN  le bouton "Suivant"
WHEN   capacité camion est vide ou invalide
THEN   erreur inline "La capacité est requise" (si vide) ou message d'erreur guard
AND    la navigation est bloquée

GIVEN  le bouton "Suivant"
WHEN   nature de la marchandise est vide
THEN   erreur inline "La nature de la marchandise est requise"
AND    la navigation est bloquée

GIVEN  tous les champs obligatoires valides
WHEN   le commercial clique "Suivant"
THEN   la validation passe et la navigation vers l'étape 4 est déclenchée
```

**AC7 — Sauvegarde & navigation vers étape 4**

```
GIVEN  tonnage, capacité, nature valides, quoteId non null dans wizard store
WHEN   le commercial clique "Suivant"
THEN   db.quotes.get(quoteId) appelé pour obtenir current (et sa revision)
AND    applyLocalMutation("quote", quoteId, "update", payload, current.revision, dexieWriteFn, userId)
AND    dans dexieWriteFn : db.quotes.put(updatedQuote) — PUT complet, pas .update()
AND    db.auditMirror.add({ what: "quote.goods_update", ... }) APRÈS applyLocalMutation (hors tx)
AND    void triggerSync()
AND    useWizardStore.getState().setStep(4)

Payload inclut tous les champs goods :
  goodsNature, tonnage, truckCapacity, truckCount (calculé ou surcharge), unitPrice,
  sourceCurrency, exchangeRate, goodsValueFcfa (calculé)
```

**AC8 — Stub étape 4**

```
GIVEN  l'étape 4 (Prestations) non encore implémentée (Story 3.4)
WHEN   le commercial arrive à l'étape 4
THEN   WizardStep4Stub s'affiche : "Étape 4 — Prestations (à venir)"
AND    bouton "Précédent" → setStep(3)
AND    bouton "Terminer" → resetWizard() + router.push("/devis")
```

**AC9 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/quote/wizard-step-goods.tsx` — CRÉER : étape 3 (formulaire marchandise + calculs live)
- `src/components/quote/quote-wizard.tsx` — UPDATE : remplacer WizardStep3Stub par WizardStepGoods, ajouter WizardStep4Stub
- `src/messages/fr-NE.json` — UPDATE : ajouter section `devis.wizard.marchandise`

**EXCLU :**
- Aucune migration — colonnes goods (`goodsNature`, `tonnage`, `truckCapacity`, `truckCount`, `unitPrice`, `sourceCurrency`, `exchangeRate`, `goodsValueFcfa`) **déjà dans** schema.ts (Drizzle) et local-db.ts (Dexie)
- Aucune modification de `src/lib/schema.ts`
- Aucune modification de `src/lib/local-db.ts`
- Aucune modification de `src/app/api/v1/sync/push/route.ts` — gère déjà tous les champs goods (lignes 298-305)
- Aucune modification de `src/lib/calc/` — les fonctions existent déjà, correctement testées
- Étape 4 prestations (Story 3.4)
- Étape 5 conditions/clauses (Story 3.8)

---

## Tâches / Sous-tâches

### T1 — Créer `src/components/quote/wizard-step-goods.tsx` (AC1–AC7)

- [x] `"use client"` première ligne
- [x] Imports :
  ```ts
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { QuoteLocal } from "@/lib/local-db";
  import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
  import { useWizardStore } from "@/stores/wizard-store";
  import {
    computeCamions, computeValeurMarchandise,
    MIN_TONNAGE, MAX_TONNAGE, MIN_CAPACITY, MAX_CAPACITY,
    MIN_PRICE, MAX_PRICE, MIN_RATE,
    CalcError,
  } from "@/lib/calc";
  import { formatFcfa } from "@/lib/money";
  ```
- [x] Props : `interface WizardStepGoodsProps { userId: string }`
- [x] État local :
  ```ts
  const t = useTranslations("devis.wizard.marchandise");
  const tW = useTranslations("devis.wizard");
  const { quoteId, setStep } = useWizardStore();
  const [goodsNature, setGoodsNature] = useState("");
  const [tonnage, setTonnage] = useState("");
  const [truckCapacity, setTruckCapacity] = useState("");
  const [truckCountOverride, setTruckCountOverride] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState("XOF");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);
  ```
- [x] Calculs live derivés (inline dans le render — pas de useEffect) :
  ```ts
  const parsedTonnage = parseFloat(tonnage);
  const parsedCapacity = parseFloat(truckCapacity);
  const parsedPrice = parseFloat(unitPrice) || 0;
  const effectiveRate = sourceCurrency === "XOF" ? 1 : (parseFloat(exchangeRate) || 1);

  let computedTruckCount: number | null = null;
  let camionsError: string | null = null;
  if (Number.isFinite(parsedTonnage) && Number.isFinite(parsedCapacity)) {
    try { computedTruckCount = computeCamions(parsedTonnage, parsedCapacity); }
    catch (e) { camionsError = e instanceof CalcError ? e.message : t("calcError"); }
  }
  const effectiveTruckCount = truckCountOverride.trim()
    ? parseInt(truckCountOverride, 10)
    : computedTruckCount;

  let computedGoodsValue: number | null = null;
  let valeurError: string | null = null;
  if (Number.isFinite(parsedTonnage) && Number.isFinite(parsedPrice) && Number.isFinite(effectiveRate)) {
    try { computedGoodsValue = computeValeurMarchandise(parsedTonnage, parsedPrice, effectiveRate); }
    catch (e) { valeurError = e instanceof CalcError ? e.message : t("calcError"); }
  }
  ```
- [x] `handleNext()` :
  - Validation séquentielle : goodsNature, tonnage (requis + bornes), truckCapacity (requis + bornes)
  - Si CalcError lors du calcul camions/valeur → setErrors + return (ne pas naviguer)
  - `applyLocalMutation("quote", quoteId, "update", payload, current.revision, dexieWriteFn, userId)`
  - `db.auditMirror.add({...})` APRÈS `applyLocalMutation` (hors transaction)
  - `void triggerSync()`
  - `useWizardStore.getState().setStep(4)`
- [x] Payload de sauvegarde :
  ```ts
  const payload: Record<string, unknown> = {
    ...current,
    goodsNature: goodsNature.trim(),
    tonnage: parsedTonnage,
    truckCapacity: parsedCapacity,
    truckCount: effectiveTruckCount ?? null,
    unitPrice: Math.round(parsedPrice),   // integer FCFA/source-currency
    sourceCurrency,
    exchangeRate: effectiveRate,
    goodsValueFcfa: computedGoodsValue ?? null,
    updatedAt: now,
  };
  ```
- [x] Rendu :
  - `<h2>` en-tête "{t("heading")}"
  - Section formulaire : nature, tonnage, capacité (labels, inputs, erreurs inline avec `aria-describedby`)
  - Card résultat camions (voir ci-dessous)
  - Section prix : unitPrice + select devise + champ taux conditionnel
  - Card résultat valeur marchandise (voir ci-dessous)
  - Boutons Précédent / Suivant (disabled quand `isPending`)
- [x] Live region pour camions :
  ```tsx
  <div aria-live="polite" aria-atomic="true" className="rounded-xl border border-border bg-surface p-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
      {t("truckCountLabel")}
    </p>
    {camionsError ? (
      <p className="text-sm text-destructive">{camionsError}</p>
    ) : computedTruckCount !== null ? (
      <p className="font-serif text-2xl font-semibold text-brand-navy">
        {effectiveTruckCount ?? computedTruckCount}
        <span className="ml-2 text-xs text-text-muted font-sans">
          ⌈{tonnage || "?"} / {truckCapacity || "?"}⌉
        </span>
      </p>
    ) : (
      <p className="text-sm text-text-muted">{t("enterTonnageAndCapacity")}</p>
    )}
  </div>
  ```
- [x] Champ surcharge :
  ```tsx
  <div className="space-y-1.5">
    <label htmlFor="truck-count-override" className="text-xs font-semibold text-text-muted">
      {t("truckCountOverrideLabel")}
    </label>
    <div className="flex gap-2 items-center">
      <input
        id="truck-count-override"
        type="number" min="1" step="1"
        value={truckCountOverride}
        onChange={(e) => setTruckCountOverride(e.target.value)}
        placeholder={computedTruckCount != null ? String(computedTruckCount) : "—"}
        disabled={isPending}
        className="h-10 w-24 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
      />
      {truckCountOverride && (
        <button type="button" onClick={() => setTruckCountOverride("")}
          className="text-xs text-text-secondary underline">
          {t("resetOverride")}
        </button>
      )}
    </div>
  </div>
  ```
- [x] Live region pour valeur marchandise :
  ```tsx
  <div aria-live="polite" aria-atomic="true" className="rounded-xl border border-border bg-surface p-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
      {t("goodsValueLabel")}
    </p>
    {valeurError ? (
      <p className="text-sm text-destructive">{valeurError}</p>
    ) : computedGoodsValue !== null ? (
      <div>
        <p className="font-serif text-2xl font-semibold text-brand-navy">
          {formatFcfa(computedGoodsValue)}
        </p>
        {sourceCurrency !== "XOF" && parsedPrice > 0 && (
          <p className="text-xs text-text-muted mt-0.5">
            {parsedPrice.toLocaleString("fr-FR")} {sourceCurrency} × {effectiveRate} FCFA
          </p>
        )}
      </div>
    ) : (
      <p className="text-sm text-text-muted">{t("enterPriceAndTonnage")}</p>
    )}
  </div>
  ```
- [x] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `src/components/quote/quote-wizard.tsx` (AC8)

- [x] Importer `WizardStepGoods` : `import { WizardStepGoods } from "./wizard-step-goods";`
- [x] Renommer / remplacer `WizardStep3Stub` par `WizardStep4Stub` (ou créer la nouvelle)
- [x] `WizardStep4Stub` : message "Étape 4 — Prestations (à venir)" + bouton Précédent (setStep(3)) + bouton Terminer (resetWizard + router.push("/devis"))
- [x] Remplacer `{step === 3 && <WizardStep3Stub />}` par `{step === 3 && <WizardStepGoods userId={userId} />}`
- [x] Ajouter `{step === 4 && <WizardStep4Stub />}`
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/messages/fr-NE.json` (labels UI)

- [x] Ajouter sous `devis.wizard` (après la section `trajet`) :
  ```json
  "marchandise": {
    "heading": "Marchandise",
    "goodsNatureLabel": "Nature de la marchandise",
    "goodsNaturePlaceholder": "Ex : Céréales, Ciment, Carburant…",
    "goodsNatureRequired": "La nature de la marchandise est requise",
    "tonnageLabel": "Tonnage (t)",
    "tonnagePlaceholder": "Ex : 30",
    "tonnageRequired": "Le tonnage est requis",
    "truckCapacityLabel": "Capacité camion (t)",
    "truckCapacityPlaceholder": "Ex : 30",
    "truckCapacityRequired": "La capacité est requise",
    "truckCountLabel": "Nombre de camions",
    "truckCountOverrideLabel": "Surcharge (optionnel)",
    "resetOverride": "Réinitialiser",
    "enterTonnageAndCapacity": "Saisir tonnage et capacité pour calculer",
    "unitPriceLabel": "Prix unitaire (par tonne)",
    "unitPricePlaceholder": "Ex : 50000",
    "sourceCurrencyLabel": "Devise",
    "exchangeRateLabel": "Taux de change (FCFA par unité)",
    "exchangeRatePlaceholder": "Ex : 660",
    "goodsValueLabel": "Valeur marchandise",
    "enterPriceAndTonnage": "Saisir tonnage et prix pour calculer",
    "calcError": "Valeurs invalides pour le calcul",
    "saving": "Enregistrement…",
    "errorNoQuote": "Devis introuvable. Recommencez depuis l'étape 1.",
    "errorGeneric": "Une erreur est survenue. Veuillez réessayer."
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T4 — Vérification finale (AC9)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests 206/206 ✓ (pas de régression)
- [x] `pnpm build` : passe sans erreur
- [x] Navigation : étape 2 → Suivant → étape 3 affichée ✓
- [x] Navigation : étape 3 → Précédent → étape 2 ✓
- [x] Navigation : étape 3 → calcul live camions et valeur ✓
- [x] Navigation : étape 3 → Suivant → étape 4 stub ✓
- [x] Devise XOF : taux masqué ✓, calcul valeur correct ✓
- [x] Devise EUR : taux visible ✓, valeur FCFA + montant EUR affiché ✓

### Review Findings

- [x] [Review][Patch] Taux non-XOF vide ou a 0 remplace silencieusement par 1 [src/components/quote/wizard-step-goods.tsx:53]
- [x] [Review][Patch] Prix nul, invalide ou negatif contourne le calcul/validation de valeur marchandise [src/components/quote/wizard-step-goods.tsx:70]
- [x] [Review][Patch] Surcharge camion peut persister `NaN`, 0 ou une valeur negative [src/components/quote/wizard-step-goods.tsx:64]
- [x] [Review][Patch] `db.quotes.put(updatedQuote)` peut conserver d'anciennes valeurs `truckCount` / `goodsValueFcfa` quand le nouveau payload vaut `null` [src/components/quote/wizard-step-goods.tsx:135]
- [x] [Review][Patch] Prix decimal calcule tel quel puis arrondi a la sauvegarde, creant une incoherence valeur/source [src/components/quote/wizard-step-goods.tsx:136]

---
## Dev Notes

### CRITIQUE — Colonnes goods déjà dans le schéma Dexie ET Drizzle

```typescript
// src/lib/local-db.ts:42-51 — QuoteLocal a déjà :
goodsNature?: string;
tonnage?: number;
truckCapacity?: number;
truckCount?: number;
unitPrice?: number;
sourceCurrency?: string;
exchangeRate?: number;
goodsValueFcfa?: number;
```

```typescript
// src/lib/schema.ts:201-208 — table quote Drizzle a déjà :
goodsNature: text("goods_nature"),
tonnage: real("tonnage"),
truckCapacity: real("truck_capacity"),
truckCount: integer("truck_count"),
unitPrice: integer("unit_price"),
sourceCurrency: text("source_currency").default("XOF"),
exchangeRate: real("exchange_rate").default(1),
goodsValueFcfa: integer("goods_value_fcfa"),
```

**INTERDIT :** toute migration. Toute tentative de `pnpm db:generate` sur ces colonnes casserait le journal.

### CRITIQUE — push/route.ts déjà opérationnel (NE PAS MODIFIER)

```typescript
// src/app/api/v1/sync/push/route.ts:298-305 — déjà géré :
goodsNature: strN(p.goodsNature),
tonnage: floatN(p.tonnage),
truckCapacity: floatN(p.truckCapacity),
truckCount: intN(p.truckCount),
unitPrice: intN(p.unitPrice),
sourceCurrency: strN(p.sourceCurrency) ?? "XOF",
exchangeRate: floatN(p.exchangeRate) ?? 1,
goodsValueFcfa: intN(p.goodsValueFcfa),
```

**INTERDIT :** toute modification de push/route.ts pour cette story.

### CRITIQUE — lib/calc/ et money.ts déjà opérationnels (NE PAS DUPLIQUER)

```typescript
// src/lib/calc/index.ts — exports disponibles :
export { CalcError } from "./error";
export { computeCamions, MIN_TONNAGE, MAX_TONNAGE, MIN_CAPACITY, MAX_CAPACITY } from "./camions";
export { computeValeurMarchandise, MIN_PRICE, MAX_PRICE, MIN_RATE } from "./valeur";
export { computeLineTotal, computeQuoteTotal } from "./totaux";

// src/lib/money.ts — exports disponibles :
export function formatFcfa(n: number): string  // Intl.NumberFormat fr-FR XOF
export function roundFcfa(n: number): number   // Math.round
export function toFcfa(amount: number, exchangeRate: number): number
```

**INTERDIT :** recalculer `Math.ceil(tonnage/capacité)` ou `tonnage*prix*taux` inline dans un composant. Toujours appeler `computeCamions` et `computeValeurMarchandise`.

### CRITIQUE — computeValeurMarchandise attend `(quantity, unitPrice, exchangeRate)`

Dans le contexte de cette story :
- `quantity` = **tonnage** (poids de la marchandise en tonnes)
- `unitPrice` = prix par tonne en devise source
- `exchangeRate` = taux source → FCFA (= 1 si XOF)

```typescript
// CORRECT
const goodsValueFcfa = computeValeurMarchandise(parsedTonnage, parsedPrice, effectiveRate);

// INTERDIT — ne pas dupliquer la formule
const goodsValueFcfa = Math.round(parsedTonnage * parsedPrice * effectiveRate);
```

### CRITIQUE — Pattern UPDATE (pas create) pour applyLocalMutation

Story 3.1 a créé le devis avec `"create"`. Stories 3.2 et 3.3 utilisent `"update"` (devis déjà existant).

```typescript
// CORRECT
const current = await db.quotes.get(quoteId);
await applyLocalMutation(
  "quote", quoteId, "update",
  { ...current, goodsNature, tonnage: parsedTonnage, ... },
  current.revision,
  async () => { await db.quotes.put(updatedQuote); },
  userId,
);

// INTERDIT
applyLocalMutation("quote", quoteId, "create", ...)
```

### CRITIQUE — db.quotes.put() (pas .update())

```typescript
// CORRECT — remplace l'enregistrement entier
const updatedQuote: QuoteLocal = { ...current, goodsNature: goodsNature.trim(), tonnage: parsedTonnage, ... };
await db.quotes.put(updatedQuote);

// INCORRECT — ne nettoie pas les optionnels
await db.quotes.update(quoteId, { goodsNature, tonnage: parsedTonnage, ... });
```

### CRITIQUE — quoteId depuis le wizard store

```typescript
// CORRECT
const { quoteId, setStep } = useWizardStore();

// Dans handleNext :
if (!quoteId) { setErrors({ global: t("errorNoQuote") }); return; }
```

### CRITIQUE — AuditMirror APRÈS applyLocalMutation

```typescript
// CORRECT — pattern établi (wizard-step-route.tsx:155-177)
await applyLocalMutation(...);
await db.auditMirror.add({
  id: crypto.randomUUID(),
  who: userId,
  what: "quote.goods_update",
  when: now,
  where: "/devis/nouveau",
  entityType: "quote",
  entityId: quoteId,
  before: {
    goodsNature: current.goodsNature,
    tonnage: current.tonnage,
    truckCapacity: current.truckCapacity,
    unitPrice: current.unitPrice,
    sourceCurrency: current.sourceCurrency,
    exchangeRate: current.exchangeRate,
  },
  after: {
    goodsNature: goodsNature.trim(),
    tonnage: parsedTonnage,
    truckCapacity: parsedCapacity,
    truckCount: effectiveTruckCount,
    unitPrice: Math.round(parsedPrice),
    sourceCurrency,
    exchangeRate: effectiveRate,
    goodsValueFcfa: computedGoodsValue,
  },
  createdAt: now,
  synced: false,
});
void triggerSync();
useWizardStore.getState().setStep(4);
```

**INTERDIT :** placer `db.auditMirror.add` dans le dexieWriteFn (intérieur de la transaction).

### CRITIQUE — Calculs live dans le render (pas de useEffect)

Les calculs sont purement dérivés des states. Les exécuter inline dans le render body garantit la fraîcheur à chaque keystroke, sans besoin de `useEffect` ni `useMemo` (formules légères, pas de performance issue).

```typescript
// CORRECT — dans le corps du composant (avant le return)
let computedTruckCount: number | null = null;
let camionsError: string | null = null;
if (Number.isFinite(parsedTonnage) && Number.isFinite(parsedCapacity)) {
  try { computedTruckCount = computeCamions(parsedTonnage, parsedCapacity); }
  catch (e) { camionsError = e instanceof CalcError ? e.message : t("calcError"); }
}
```

### CRITIQUE — unitPrice stocké en entier

La colonne `unitPrice: integer("unit_price")` et le type `QuoteLocal.unitPrice?: number` exigent une valeur entière. Arrondir à `Math.round(parsedPrice)` avant de sauvegarder.

```typescript
// CORRECT
unitPrice: Math.round(parsedPrice),
// pas : unitPrice: parsedPrice (float potentiel)
```

### CRITIQUE — exchangeRate forcé à 1 quand XOF

```typescript
const effectiveRate = sourceCurrency === "XOF" ? 1 : (parseFloat(exchangeRate) || 1);
```

Ne jamais utiliser le state `exchangeRate` directement si `sourceCurrency === "XOF"`.

### CRITIQUE — Navigation inter-étapes via Zustand (jamais router.push)

```typescript
// CORRECT
useWizardStore.getState().setStep(4);

// INTERDIT
router.push("/devis/nouveau?step=4");
```

### Structure des currencies disponibles

```typescript
const CURRENCIES = [
  { code: "XOF", label: "FCFA (XOF)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dollar US (USD)" },
  { code: "NGN", label: "Naira (NGN)" },
];
```

### WizardStep4Stub dans quote-wizard.tsx

```tsx
function WizardStep4Stub() {
  const router = useRouter();
  const { setStep, resetWizard } = useWizardStore();

  function handleFinish() {
    resetWizard();
    router.push("/devis");
  }

  return (
    <div className="space-y-6 px-5 pb-6">
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-text-secondary">
          Étape 4 — Prestations (à venir)
        </p>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setStep(3)}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface">
          Précédent
        </button>
        <button type="button" onClick={handleFinish}
          className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep">
          Terminer
        </button>
      </div>
    </div>
  );
}
```

### Design tokens (DESIGN.md)

```tsx
// Champ input standard
className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"

// Label
className="text-xs font-semibold text-text-muted"

// Card résultat (live region)
className="rounded-xl border border-border bg-surface p-4"

// Valeur résultat principale
className="font-serif text-2xl font-semibold text-brand-navy"

// Sous-texte résultat
className="text-xs text-text-muted mt-0.5"

// Erreur inline
className="text-xs text-destructive"

// Bouton Précédent
className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface"

// Bouton Suivant / Primaire
className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `Math.ceil(tonnage / capacity)` inline | `computeCamions(parsedTonnage, parsedCapacity)` |
| `tonnage * prix * taux` inline | `computeValeurMarchandise(parsedTonnage, parsedPrice, effectiveRate)` |
| `parseFloat(exchangeRate)` direct quand XOF | `effectiveRate = sourceCurrency === "XOF" ? 1 : parseFloat(exchangeRate)` |
| `unitPrice: parsedPrice` (float) | `unitPrice: Math.round(parsedPrice)` (integer) |
| `applyLocalMutation("quote", id, "create", ...)` | `applyLocalMutation("quote", id, "update", ...)` |
| `db.quotes.update(quoteId, partialFields)` | `db.quotes.put(updatedQuote)` (full record) |
| Passer `quoteId` en prop | `const { quoteId } = useWizardStore()` |
| `router.push("/devis/nouveau?step=4")` | `useWizardStore.getState().setStep(4)` |
| `db.auditMirror.add` dans dexieWriteFn | Appeler APRÈS `await applyLocalMutation(...)` |
| Créer une migration | Colonnes déjà présentes dans schema.ts |
| Modifier push/route.ts | Déjà opérationnel lignes 298-305 |
| Modifier src/lib/calc/ | Fonctions testées, opérationnelles, NE PAS TOUCHER |
| useEffect pour les calculs live | Calculs inline dans le render body |
| Hardcoder les strings UI | Utiliser `src/messages/fr-NE.json` + `useTranslations` |

### Héritage des stories précédentes

**Story 3.2 (wizard-step-route.tsx) — patron direct à copier/adapter :**
- Pattern `useTranslations("devis.wizard.X")` + `tW = useTranslations("devis.wizard")` pour previous/next
- Pattern `handleNext` avec `isPending + setErrors + try/catch/finally`
- Pattern `applyLocalMutation "update" + db.quotes.put + auditMirror hors tx + triggerSync`
- Pattern `useWizardStore.getState().setStep(n)` dans callback async
- Pattern d'affichage d'erreur inline avec `aria-describedby` + `aria-invalid`
- Pattern boutons disabled avec `disabled={isPending}` + `disabled:opacity-60`

**Story 3.1 (wizard-step-client.tsx) :**
- Pattern `WizardStep4Stub` (même structure que WizardStep3Stub mais step 4)
- Pattern global error display (`errors.global`)

**Architecture §Calc & money :**
- "All monetary math through money.ts; never inline float arithmetic"
- "All quote calculations through src/lib/calc/; never recompute totals inline"

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration — colonnes goods déjà dans schema.ts (0006/0007)
#    Vérifier si besoin :
pnpm db:migrate

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.3] — FR-18 (saisie marchandise), FR-19 (calcul camions), FR-20 (calcul valeur)
- [src/lib/local-db.ts:42-51] — `QuoteLocal.goodsNature`, `.tonnage`, `.truckCapacity`, `.truckCount`, `.unitPrice`, `.sourceCurrency`, `.exchangeRate`, `.goodsValueFcfa`
- [src/lib/schema.ts:201-208] — colonnes goods dans table `quote` Drizzle
- [src/app/api/v1/sync/push/route.ts:298-305] — persistance goods au sync (déjà opérationnel)
- [src/lib/calc/camions.ts] — `computeCamions`, bornes `MIN_TONNAGE`, `MAX_TONNAGE`, `MIN_CAPACITY`, `MAX_CAPACITY`
- [src/lib/calc/valeur.ts] — `computeValeurMarchandise`, bornes `MIN_PRICE`, `MAX_PRICE`, `MIN_RATE`
- [src/lib/calc/error.ts] — `CalcError` (field + message)
- [src/lib/money.ts] — `formatFcfa`, `roundFcfa`
- [src/lib/sync/outbox.ts] — `applyLocalMutation`, `triggerSync`
- [src/stores/wizard-store.ts] — `quoteId`, `step`, `setStep`, `resetWizard`
- [src/components/quote/quote-wizard.tsx:17-51] — WizardStep3Stub à remplacer par WizardStepGoods + ajouter WizardStep4Stub
- [src/components/quote/wizard-step-route.tsx] — patron direct pour le composant (handleNext, auditMirror, erreurs inline)
- [UX-DR19] — Calculs live (chaque keystroke, guard capacité=0, Intl.NumberFormat fr-FR, live region)
- [UX-DR20] — Wizard 5 étapes, étape 3 = Marchandise
- [Architecture §Naming Patterns] — `"use client"`, kebab-case files, PascalCase components, `@/` alias
- [Architecture §Process Patterns] — auditMirror hors transaction, triggerSync void, calculs via calc/
- [Architecture §Data Architecture] — Money integer FCFA, calc engine partagé client/serveur

---

## Dev Agent Record

### Completion Notes List

- Créé `wizard-step-goods.tsx` : composant WizardStepGoods avec calculs live inline (no useEffect), live regions aria-live="polite", champ taux conditionnel (XOF masqué), surcharge manuelle truckCount avec reset, pattern applyLocalMutation "update" + db.quotes.put() + auditMirror hors tx + triggerSync.
- Corrigé erreur TS2375 (exactOptionalPropertyTypes) : utilisé spread conditionnel `...(val != null ? { key: val } : {})` pour `truckCount` et `goodsValueFcfa`.
- Mis à jour `quote-wizard.tsx` : renommé WizardStep3Stub → WizardStep4Stub (Précédent → setStep(3), Terminer → resetWizard + router.push("/devis")), ajouté WizardStepGoods à step 3, WizardStep4Stub à step 4.
- Ajouté section `devis.wizard.marchandise` dans `fr-NE.json` avec 23 clés.
- pnpm check : lint ✓ (0 erreurs, 5 warnings préexistants) + typecheck ✓ + 206/206 tests ✓ sans régression.
- pnpm build : ✓ sans erreur.

### File List

- `src/components/quote/wizard-step-goods.tsx` (à créer)
- `src/components/quote/quote-wizard.tsx` (à modifier)
- `src/messages/fr-NE.json` (à modifier)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (à modifier)

### Change Log

- 2026-06-25 : Corrections code review - validation stricte taux/prix/surcharge, coherence updatedQuote/payload, prix entier sans arrondi silencieux. pnpm check OK + pnpm build:ci OK. Statut -> done.
- 2026-06-25 : Story 3.3 implémentée — WizardStepGoods (T1), quote-wizard mis à jour avec WizardStep4Stub (T2), fr-NE.json section marchandise (T3). pnpm check ✓ + pnpm build ✓. Statut → review.
