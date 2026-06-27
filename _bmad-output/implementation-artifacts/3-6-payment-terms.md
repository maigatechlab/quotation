---
story_key: 3-6-payment-terms
epic_num: 3
story_num: 6
status: ready-for-dev
baseline_commit: ""
---

# Story 3.6 : Conditions de paiement (FR-25)

**Statut :** ready-for-dev

## Story

**En tant qu'** administrateur,
**Je veux** définir des conditions de paiement par défaut pour l'entreprise,
**Afin que** chaque nouveau devis porte des modalités cohérentes, ajustables au cas par cas dans le wizard.

---

## Critères d'acceptation (BDD)

**AC1 — Paramétrage des conditions de paiement par défaut (Admin)**

```
GIVEN  la page /parametres (accès Admin, role = "admin")
WHEN   l'admin consulte la section "Conditions de paiement"
THEN   un champ texte affiche les conditions de paiement actuelles (conditionsPaiementDefaut depuis CompanyLocal)
AND    un placeholder "Ex : Paiement à 30 jours fin de mois" est visible si le champ est vide
AND    le libellé indique clairement que ces conditions seront pré-remplies sur chaque nouveau devis
```

**AC2 — Enregistrement des conditions de paiement (Admin)**

```
GIVEN  le champ conditions de paiement modifié
WHEN   l'admin soumet (bouton "Enregistrer les conditions")
THEN   applyLocalMutation("company", companyId, "update", { conditionsPaiementDefaut: texte, ... }, company.revision, dexieWriteFn, userId)
AND    db.company.put({ ...company, conditionsPaiementDefaut: texte, updatedAt }) dans dexieWriteFn
AND    void triggerSync() appelé après
AND    un toast "Conditions de paiement mises à jour" confirme
AND    les nouvelles conditions sont pré-remplies sur les prochains devis créés (wizard étape 5)
```

**AC3 — Pré-remplissage dans le wizard étape 5 (Conditions)**

```
GIVEN  des conditions de paiement par défaut définies en paramètres
WHEN   le commercial arrive à l'étape 5 (Conditions) du wizard de création de devis
THEN   le champ "Conditions de paiement" est pré-rempli avec conditionsPaiementDefaut de CompanyLocal
AND    le commercial peut modifier ce texte librement pour ce devis uniquement
AND    la modification locale n'affecte pas les conditions par défaut en paramètres
```

**AC4 — Persistance des conditions sur le devis**

```
GIVEN  un commercial a modifié les conditions de paiement dans le wizard
WHEN   il passe à l'étape suivante ou finit le wizard
THEN   conditionsPaiement est persisté dans QuoteLocal via applyLocalMutation("quote", id, "update", { conditionsPaiement: texte, ... }, revision, dexieWriteFn, userId)
AND    les conditions figurent sur l'aperçu du devis et dans le PDF (via conditionsPaiement de QuoteLocal)
```

**AC5 — Conditions vides acceptées**

```
GIVEN  aucune condition de paiement définie en paramètres (conditionsPaiementDefaut vide)
WHEN   le commercial arrive à l'étape 5
THEN   le champ est vide et le commercial peut saisir des conditions ou laisser vide
AND    un devis sans conditions de paiement est valide (champ optionnel)
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
- `src/app/(app)/parametres/page.tsx` — UPDATE : ajouter section "Conditions de paiement" (après SignatoryConfig, avant TemplateManager)
- `src/components/settings/payment-terms-form.tsx` — CRÉER : formulaire conditions de paiement
- `src/components/quote/wizard-step-conditions.tsx` — CRÉER : étape 5 du wizard (remplace WizardStep5Stub)
- `src/components/quote/quote-wizard.tsx` — UPDATE : importer WizardStepConditions à l'étape 5
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `parametres.conditionsPaiement` + `devis.wizard.conditions`

**EXCLU (déjà implémenté — NE PAS MODIFIER) :**
- `src/lib/schema.ts` — colonne `conditionsPaiement` sur `quote` et `conditionsPaiementDefaut` sur `company` existent déjà
- `src/lib/local-db.ts` — champs `conditionsPaiement` (QuoteLocal) et `conditionsPaiementDefaut` (CompanyLocal) existent déjà
- `src/app/api/v1/sync/push/route.ts` — case "company" et case "quote" gèrent déjà `conditionsPaiement`/`conditionsPaiementDefaut`
- `src/components/settings/company-form.tsx` — ne pas modifier
- Aucune migration DB nécessaire

---

## Tâches / Sous-tâches

### T1 — Créer `src/components/settings/payment-terms-form.tsx`

- [ ] `"use client"` première ligne
- [ ] Imports :
  ```ts
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { CompanyLocal } from "@/lib/local-db";
  import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
  import { useToast } from "@/hooks/use-toast";
  ```
- [ ] Props :
  ```ts
  interface PaymentTermsFormProps {
    company: CompanyLocal;
    userId: string;
  }
  ```
- [ ] État local :
  ```ts
  const t = useTranslations("parametres.conditionsPaiement");
  const { toast } = useToast();
  const [terms, setTerms] = useState(company.conditionsPaiementDefaut ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  ```
- [ ] Fonction `handleSubmit()` :
  ```ts
  async function handleSubmit() {
    setIsPending(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const dbCompany = await db.company.get(company.id);
      if (!dbCompany) { setError(t("errorNotFound")); return; }
      await applyLocalMutation(
        "company", company.id, "update",
        { ...dbCompany, conditionsPaiementDefaut: terms.trim(), updatedAt: now },
        dbCompany.revision,
        async () => {
          await db.company.put({ ...dbCompany, conditionsPaiementDefaut: terms.trim(), updatedAt: now });
        },
        userId
      );
      void triggerSync();
      toast({ title: t("successToast"), duration: 2200 });
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }
  ```
- [ ] Rendu : textarea + bouton Enregistrer + message d'aide + gestion erreur inline
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/quote/wizard-step-conditions.tsx`

- [ ] `"use client"` première ligne
- [ ] Importer `useWizardStore` depuis `@/stores/wizard-store`
- [ ] Importer `useLiveCompany` depuis `@/hooks/use-live-company`
- [ ] Lire le quoteId courant depuis le wizard store
- [ ] Pré-remplir `conditionsPaiement` depuis `QuoteLocal.conditionsPaiement` ou `CompanyLocal.conditionsPaiementDefaut` si vide
- [ ] Textarea pour conditions de paiement (optionnel, texte libre)
- [ ] Bouton "Précédent" → setStep(4)
- [ ] Bouton "Terminer" → persister `conditionsPaiement` via `applyLocalMutation("quote", ...)` + `resetWizard()` + `router.push("/devis")`
- [ ] Toast "Devis sauvegardé" après succès
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/components/quote/quote-wizard.tsx`

- [ ] Remplacer `WizardStep5Stub` par `WizardStepConditions` :
  ```ts
  import { WizardStepConditions } from "./wizard-step-conditions";
  ```
- [ ] À l'étape 5, passer `userId` et `company` :
  ```tsx
  {step === 5 && company !== undefined && (
    <WizardStepConditions userId={userId} company={company} />
  )}
  ```
- [ ] Supprimer la fonction `WizardStep5Stub` (devenue obsolète)
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/app/(app)/parametres/page.tsx`

- [ ] Importer `PaymentTermsForm` :
  ```ts
  import { PaymentTermsForm } from "@/components/settings/payment-terms-form";
  ```
- [ ] Ajouter section conditions de paiement (visible Admin et Commercial, car relecture utile — écriture Admin uniquement via logique du composant) :
  ```tsx
  {company && can(role, "company.update") && (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <PaymentTermsForm company={company} userId={userId} />
    </div>
  )}
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter section `parametres.conditionsPaiement` :
  ```json
  "conditionsPaiement": {
    "heading": "Conditions de paiement",
    "description": "Ces conditions seront pré-remplies sur chaque nouveau devis (modifiables au cas par cas).",
    "label": "Conditions de paiement par défaut",
    "placeholder": "Ex : Paiement à 30 jours fin de mois. Tout retard entraîne une pénalité de 1,5% par mois.",
    "save": "Enregistrer les conditions",
    "saving": "Enregistrement…",
    "successToast": "Conditions de paiement mises à jour",
    "errorGeneric": "Une erreur est survenue. Veuillez réessayer.",
    "errorNotFound": "Impossible de charger les données société."
  }
  ```
- [ ] Ajouter section `devis.wizard.conditions` :
  ```json
  "conditions": {
    "heading": "Conditions",
    "label": "Conditions de paiement",
    "placeholder": "Ex : Paiement à 30 jours fin de mois.",
    "helpText": "Ces conditions s'afficheront sur le devis PDF. Laissez vide si non applicable.",
    "finish": "Terminer et sauvegarder",
    "finishing": "Sauvegarde…",
    "successToast": "Devis sauvegardé"
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T6 — Vérification finale (AC6)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] Admin : section "Conditions de paiement" visible dans /parametres ✓
- [ ] Admin : sauvegarder des conditions → toast + persister dans CompanyLocal ✓
- [ ] Wizard : étape 5 affiche WizardStepConditions (plus de stub) ✓
- [ ] Wizard étape 5 : conditions pré-remplies depuis CompanyLocal ✓
- [ ] Wizard étape 5 : bouton "Terminer" sauvegarde le devis et redirige vers /devis ✓
- [ ] Devis sans conditions de paiement : valide ✓

---

## Dev Notes

### CRITIQUE — company sync : pattern identique à Story 2.3

Le pattern pour mettre à jour `CompanyLocal` est déjà validé dans Story 2.3 (`company-form.tsx`). Réutiliser exactement le même flow :

```typescript
// Lire AVANT applyLocalMutation
const dbCompany = await db.company.get(company.id);
if (!dbCompany) { /* handle */ return; }

await applyLocalMutation(
  "company", company.id, "update",
  { ...dbCompany, conditionsPaiementDefaut: terms.trim(), updatedAt: now },
  dbCompany.revision,  // revision lue AVANT la mutation
  async () => {
    await db.company.put({ ...dbCompany, conditionsPaiementDefaut: terms.trim(), updatedAt: now });
  },
  userId
);
void triggerSync();
```

**INTERDIT :** `db.company.update(id, partialFields)` — utiliser `db.company.put(completeRecord)`.
**INTERDIT :** lire `dbCompany.revision` après la mutation.

### CRITIQUE — wizard-step-conditions : lire quoteId depuis wizard store

Le wizard store (`src/stores/wizard-store.ts`) expose `quoteId`. L'étape 5 doit le récupérer pour persister `conditionsPaiement` sur le bon devis.

```typescript
// Dans WizardStepConditions
const { quoteId, step, setStep, resetWizard } = useWizardStore();
```

Pour pré-remplir, charger depuis Dexie le devis courant (`db.quotes.get(quoteId)`) puis fallback sur `company?.conditionsPaiementDefaut`.

### CRITIQUE — conditionsPaiement sur le devis : update via applyLocalMutation quote

```typescript
const dbQuote = await db.quotes.get(quoteId);
if (!dbQuote) return;

await applyLocalMutation(
  "quote", quoteId, "update",
  { ...dbQuote, conditionsPaiement: conditions.trim(), updatedAt: now },
  dbQuote.revision,
  async () => {
    await db.quotes.put({ ...dbQuote, conditionsPaiement: conditions.trim(), updatedAt: now });
  },
  userId
);
void triggerSync();
```

### CRITIQUE — WizardStep5Stub est à supprimer

`WizardStep5Stub` dans `quote-wizard.tsx` est un placeholder introduit en Story 3.5. Cette story le remplace par `WizardStepConditions`. Supprimer la fonction `WizardStep5Stub` et son import.

### CRITIQUE — company dans quote-wizard.tsx est déjà chargée

`useLiveCompany()` est déjà appelé dans `QuoteWizard` (ligne 61 de `quote-wizard.tsx`). La valeur `company` est déjà disponible — ne pas dupliquer le hook dans WizardStepConditions. Passer `company` en prop.

### CRITIQUE — PaymentTermsForm dépend d'un CompanyLocal chargé

`parametres/page.tsx` doit conditionner l'affichage de `PaymentTermsForm` à l'existence de `company` (déjà un pattern dans cette page pour `SignatoryConfig` et `CompanyForm`). Pattern existant à suivre.

### Design tokens cohérents

```tsx
// Textarea
className="min-h-[100px] w-full rounded-xl border border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted resize-none"

// Texte d'aide
className="mt-1 text-xs text-text-muted"

// Section heading dans parametres
className="text-sm font-semibold text-text-primary"

// Bouton primaire
className="h-11 rounded-xl bg-brand-navy px-6 text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
```

### Héritage des stories précédentes

- **Story 2.3 (company-form.tsx)** — pattern applyLocalMutation pour "company", toast success, try/catch/finally
- **Story 2.5 (signatory-config.tsx)** — pattern formulaire settings simple avec company prop
- **Story 3.5 (wizard-step-services.tsx / quote-wizard.tsx)** — structure wizard step, pattern WizardStep5Stub à remplacer
- **Story 3.1 (wizard-step-client.tsx)** — defaultConditions passées depuis quote-wizard → company.conditionsPaiementDefaut

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration nécessaire
pnpm db:migrate  # idempotent

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.6] — FR-25 (conditions de paiement, défaut par devis, modifiable)
- [src/lib/local-db.ts] — `CompanyLocal.conditionsPaiementDefaut`, `QuoteLocal.conditionsPaiement`
- [src/lib/schema.ts] — `company.conditionsPaiementDefaut`, `quote.conditionsPaiement`
- [src/components/settings/company-form.tsx] — pattern applyLocalMutation company
- [src/components/settings/signatory-config.tsx] — pattern formulaire settings simple
- [src/components/quote/quote-wizard.tsx] — WizardStep5Stub à remplacer, company déjà loadée
- [src/stores/wizard-store.ts] — quoteId, setStep, resetWizard
- [src/hooks/use-live-company.ts] — hook company (ne pas dupliquer dans WizardStepConditions)
- [src/app/(app)/parametres/page.tsx] — pattern can(role, action) + company guard
- [src/lib/sync/outbox.ts] — applyLocalMutation, triggerSync

---

## Dev Agent Record

### Agent Model Used

_à remplir_

### Debug Log References

_à remplir_

### Completion Notes List

_à remplir_

### File List

_à remplir_

### Change Log

_à remplir_
