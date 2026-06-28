---
story_key: 3-6-payment-terms
epic_num: 3
story_num: 6
status: done
baseline_commit: "f3cdc3d477c5dce39d3c32d3ced7663578779b0c"
---

# Story 3.6 : Conditions de paiement (FR-25)

**Statut :** done

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

- [x] `"use client"` première ligne
- [x] Imports :
  ```ts
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { CompanyLocal } from "@/lib/local-db";
  import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
  import { useToast } from "@/hooks/use-toast";
  ```
- [x] Props :
  ```ts
  interface PaymentTermsFormProps {
    company: CompanyLocal;
    userId: string;
  }
  ```
- [x] État local :
  ```ts
  const t = useTranslations("parametres.conditionsPaiement");
  const { toast } = useToast();
  const [terms, setTerms] = useState(company.conditionsPaiementDefaut ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState("");
  ```
- [x] Fonction `handleSubmit()` :
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
- [x] Rendu : textarea + bouton Enregistrer + message d'aide + gestion erreur inline
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/quote/wizard-step-conditions.tsx`

- [x] `"use client"` première ligne
- [x] Importer `useWizardStore` depuis `@/stores/wizard-store`
- [x] Importer `useLiveCompany` depuis `@/hooks/use-live-company`
- [x] Lire le quoteId courant depuis le wizard store
- [x] Pré-remplir `conditionsPaiement` depuis `QuoteLocal.conditionsPaiement` ou `CompanyLocal.conditionsPaiementDefaut` si vide
- [x] Textarea pour conditions de paiement (optionnel, texte libre)
- [x] Bouton "Précédent" → setStep(4)
- [x] Bouton "Terminer" → persister `conditionsPaiement` via `applyLocalMutation("quote", ...)` + `resetWizard()` + `router.push("/devis")`
- [x] Toast "Devis sauvegardé" après succès
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/components/quote/quote-wizard.tsx`

- [x] Remplacer `WizardStep5Stub` par `WizardStepConditions` :
  ```ts
  import { WizardStepConditions } from "./wizard-step-conditions";
  ```
- [x] À l'étape 5, passer `userId` et `company` :
  ```tsx
  {step === 5 && company !== undefined && (
    <WizardStepConditions userId={userId} company={company} />
  )}
  ```
- [x] Supprimer la fonction `WizardStep5Stub` (devenue obsolète)
- [x] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/app/(app)/parametres/page.tsx`

- [x] Importer `PaymentTermsForm` :
  ```ts
  import { PaymentTermsForm } from "@/components/settings/payment-terms-form";
  ```
- [x] Ajouter section conditions de paiement (visible Admin et Commercial, car relecture utile — écriture Admin uniquement via logique du composant) :
  ```tsx
  {company && can(role, "company.update") && (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <PaymentTermsForm company={company} userId={userId} />
    </div>
  )}
  ```
- [x] `pnpm typecheck` — zéro erreur

### T5 — Mettre à jour `src/messages/fr-NE.json`

- [x] Ajouter section `parametres.conditionsPaiement` :
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
- [x] Ajouter section `devis.wizard.conditions` :
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
- [x] `pnpm typecheck` — zéro erreur

### T6 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [x] `pnpm build` : passe sans erreur
- [x] Admin : section "Conditions de paiement" visible dans /parametres ✓
- [x] Admin : sauvegarder des conditions → toast + persister dans CompanyLocal ✓
- [x] Wizard : étape 5 affiche WizardStepConditions (plus de stub) ✓
- [x] Wizard étape 5 : conditions pré-remplies depuis CompanyLocal ✓
- [x] Wizard étape 5 : bouton "Terminer" sauvegarde le devis et redirige vers /devis ✓
- [x] Devis sans conditions de paiement : valide ✓

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

Claude (GLM-5.2 via claude-glm) — exécution bmad-dev-story.

### Debug Log References

Aucun debug externe. Trois allers-retours de validation internes :
1. Erreur lint `react-hooks/set-state-in-effect` sur le preload de `wizard-step-conditions.tsx` → refactor du `useEffect` pour ne plus appeler `setState` de façon synchrone (toute la logique déplacée dans une fonction `async load()`).
2. Régression de révision non incrémentée dans `wizard-step-conditions.tsx` (le `db.quotes.put` n'incrémentait pas `revision`, contrairement au pattern établi par `signatory-config.tsx` / `company-form.tsx`) → ajout de `revision: dbQuote.revision + 1`.
3. Erreurs de typage `exactOptionalPropertyTypes` dans les tests (`status: "brouillon"` hors union ; spread + delete sur `conditionsPaiementDefaut`) → fixtures reconstruites proprement.

### Completion Notes List

- **T1 (PaymentTermsForm)** : création d'un wrapper `useLiveCompany` + inner form re-keyé par `id:revision` (pattern de `signatory-config.tsx`), pour rester synchronisé après un pull sync. Adaptation importante vs. la spec : le codebase utilise `sonner` (`toast.success`) et non un hook `useToast` — implémentation alignée sur le pattern réel. `applyLocalMutation("company", …)` utilise un payload **complet** (tous les champs CompanyLocal), pas le payload partiel suggéré par la spec, conformément au contrat établi en Story 2.3 (un payload partiel écraserait les champs gérés par d'autres stories lors du sync push). La révision est lue AVANT la mutation et incrémentée dans le `put`.
- **T2 (WizardStepConditions)** : pré-remplit depuis `QuoteLocal.conditionsPaiement` puis, si vide, depuis `CompanyLocal.conditionsPaiementDefaut`. Persistance via `applyLocalMutation("quote", …)` avec incrémentation de `revision`. Ajout d'une entrée `AuditMirror` (`quote.conditions_update`) après la mutation, conformément à la convention de `wizard-step-services.tsx` (Story 3.5). `resetWizard()` + `router.push("/devis")` après succès.
- **T3 (QuoteWizard)** : `WizardStep5Stub` supprimé (ainsi que les imports `useRouter` / `useTranslations` devenus inutiles), remplacé par `<WizardStepConditions userId={userId} company={company} />`. Le guard a été resserré à `company !== undefined && company !== null` car le typage de la prop exige une `CompanyLocal` non-null (la spec écrivait `company !== undefined` ce qui laissait passer `null`).
- **T4 (ParametresPage)** : section "Conditions de paiement" ajoutée après `SignatoryConfig`, avant `TemplateManager`, gardée par `initialCompany && canEdit` (`canEdit = can(role, "company.update")` → Admin uniquement, conformément à la matrice `permissions.ts`).
- **T5 (fr-NE.json)** : clés `parametres.conditionsPaiement` (9 clés) et `devis.wizard.conditions` (9 clés, dont `errorNoQuote`/`errorGeneric` ajoutés pour la cohérence avec les autres étapes du wizard) ajoutées.
- **Tests** : 2 nouveaux fichiers couvrant AC1-AC5 — `payment-terms-form.test.tsx` (3 tests : pré-remplissage AC1, persistance+toast+SyncOp+triggerSync AC2, trim+vide) et `wizard-step-conditions.test.tsx` (5 tests : pré-remplissage priorité devis AC3, fallback défaut société AC3, persistance+toast+reset+redirect AC4, vide accepté AC5, Précédent sans persistance). Baseline 215 tests → **223 tests (28 fichiers)**, 0 régression.
- **Validation finale** : `pnpm check` = 0 erreur (12 warnings pré-existants, 0 nouveau) ; `pnpm test` = 223/223 ; `pnpm build` = succès sans erreur ni warning.

### File List

- `src/components/settings/payment-terms-form.tsx` (créé — formulaire conditions de paiement par défaut, wrapper useLiveCompany + inner form re-keyé, applyLocalMutation company payload complet, sonner toast)
- `src/components/settings/payment-terms-form.test.tsx` (créé — 3 tests d'intégration : pré-remplissage AC1, persistance AC2, trim+vide)
- `src/components/quote/wizard-step-conditions.tsx` (créé — étape 5 wizard : pré-remplissage devis→défaut société, persistance quote via applyLocalMutation avec incrémentation révision, AuditMirror, reset+redirect)
- `src/components/quote/wizard-step-conditions.test.tsx` (créé — 5 tests d'intégration : AC3 pré-remplissage, AC4 persistance+redirect, AC5 vide, Précédent)
- `src/components/quote/quote-wizard.tsx` (modifié — remplacement WizardStep5Stub par WizardStepConditions, suppression imports morts, guard resserré company !== null)
- `src/app/(app)/parametres/page.tsx` (modifié — import PaymentTermsForm + section conditions de paiement après SignatoryConfig, gardée par initialCompany && canEdit)
- `src/messages/fr-NE.json` (modifié — ajout clés parametres.conditionsPaiement + devis.wizard.conditions)
- `_bmad-output/implementation-artifacts/sprint-status.yaml (mis à jour)`
- `_bmad-output/implementation-artifacts/3-6-payment-terms.md (mis à jour)`

### Review Findings

- [x] [Review][Patch] Stale closure `company` dans `useEffect` — `fallback` capture `company.conditionsPaiementDefaut` à l'initialisation mais `company` n'est pas dans les deps ; si la prop change (sync pull), le fallback reste périmé. Ajouter `company` (ou `company.conditionsPaiementDefaut`) aux deps et supprimer le `// eslint-disable-next-line`. [src/components/quote/wizard-step-conditions.tsx:839] → Corrigé : `company.conditionsPaiementDefaut` ajouté aux deps, eslint-disable supprimé.
- [x] [Review][Defer] `conditionsPaiementDefaut: null` dans le payload outbox au lieu de champ absent — pré-existant, le serveur accepte null ; uniformisation en sprint ultérieur.
- [x] [Review][Defer] PaymentTermsForm : fallback sur prop SSR quand `useLiveCompany()` retourne null (Dexie confirm aucune société) — comportement documenté, intentionnel.

### Change Log

- 2026-06-27 : Implémentation complète Story 3.6 (FR-25 Conditions de paiement). Création de PaymentTermsForm (paramètres société, Admin) et WizardStepConditions (étape 5 wizard, remplace WizardStep5Stub). Aucune migration DB nécessaire (colonnes déjà présentes). Ajout de 8 tests d'intégration (223/223 verts). `pnpm check` 0 erreur, `pnpm build` succès. Status → review.
