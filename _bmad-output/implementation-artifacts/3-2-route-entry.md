---
story_key: 3-2-route-entry
epic_num: 3
story_num: 2
status: ready-for-dev
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 3.2 : Saisie du trajet (FR-17)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** saisir le trajet (pays/ville départ → arrivée) avec des corridors prédéfinis,
**Afin que** je renseigne l'itinéraire en un geste.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage wizard étape 2 (Trajet)**

```
GIVEN  un devis créé en étape 1 (quoteId défini dans wizard store)
WHEN   le commercial passe à l'étape 2
THEN   WizardStepRoute s'affiche avec :
         - un en-tête "Trajet" (labels step 2/5 dans la progress bar)
         - la section chips de corridors prédéfinis
         - le formulaire manuel pays/ville départ + pays/ville arrivée
         - bouton "Précédent" → setStep(1)
         - bouton "Suivant" → validation + update + setStep(3)

GIVEN  bouton "Précédent" cliqué à l'étape 2
WHEN   l'utilisateur revient
THEN   setStep(1) — la progress bar affiche l'étape 1
AND    le devis créé en étape 1 reste intact dans Dexie (pas de suppression)
```

**AC2 — Corridors prédéfinis (chips)**

```
GIVEN  la section corridors affichée
WHEN   le commercial tape un chip corridor (ex: "Niamey → Ouagadougou")
THEN   originCountry = "NE", originCity = "Niamey" se remplissent
AND    destinationCountry = "BF", destinationCity = "Ouagadougou" se remplissent
AND    le chip sélectionné s'affiche avec le style actif (navy fill + text blanc)
AND    les champs du formulaire manuel reflètent la sélection immédiatement

GIVEN  un corridor sélectionné
WHEN   le commercial tape un autre corridor
THEN   les 4 champs sont remplacés par le nouveau corridor (pas d'accumulation)

GIVEN  un corridor sélectionné puis un champ modifié manuellement
WHEN   le commercial change originCity manuellement
THEN   le chip n'est plus actif (sélection désactivée)
```

**AC3 — Saisie manuelle pays/ville**

```
GIVEN  les selects pays départ et arrivée
WHEN   affichés initialement
THEN   pays départ = "NE" (Niger) par défaut
AND    pays arrivée = "NE" (Niger) par défaut

GIVEN  un pays sélectionné dans le dropdown
WHEN   le pays change
THEN   la liste des villes disponibles pour ce pays est filtrée (datalist/select)
AND    originCity ou destinationCity est réinitialisé à "" si le pays change

GIVEN  les champs de saisie ville
WHEN   le commercial saisit une ville
THEN   un datalist affiche les villes majeures du pays sélectionné (filtrées par saisie)
AND    le champ accepte aussi une ville hors datalist (input libre)
```

**AC4 — Validation**

```
GIVEN  le bouton "Suivant" cliqué sans originCity
WHEN   le champ originCity est vide
THEN   une erreur inline française s'affiche : "La ville de départ est requise"
AND    la navigation vers l'étape 3 est bloquée

GIVEN  le bouton "Suivant" cliqué sans destinationCity
WHEN   le champ destinationCity est vide
THEN   une erreur inline française s'affiche : "La ville d'arrivée est requise"
AND    la navigation est bloquée

GIVEN  pays départ sélectionné (select never empty — has default "NE")
WHEN   le commercial soumet
THEN   originCountry et destinationCountry sont toujours définis (pas de validation required)
```

**AC5 — Sauvegarde & navigation vers étape 3**

```
GIVEN  originCity et destinationCity saisis, quoteId non null dans wizard store
WHEN   le commercial clique "Suivant"
THEN   db.quotes.get(quoteId) appelé pour obtenir currentRevision
AND    applyLocalMutation("quote", quoteId, "update", payload, current.revision, dexieWriteFn, userId)
AND    dans dexieWriteFn : db.quotes.put(updatedQuote) avec les 4 champs route
AND    db.auditMirror.add({ what: "quote.route_update", entityId: quoteId, ... }) APRÈS applyLocalMutation
AND    void triggerSync()
AND    useWizardStore.getState().setStep(3)

GIVEN  le devis mis à jour
WHEN   sync automatique s'exécute
THEN   push/route.ts (lignes 293-298) persiste originCountry, originCity, destinationCountry, destinationCity
AND    aucune modification de push/route.ts nécessaire (déjà opérationnel)
```

**AC6 — Stub étape 3**

```
GIVEN  l'étape 3 (Marchandise) non encore implémentée (Story 3.3)
WHEN   le commercial arrive à l'étape 3
THEN   WizardStep3Stub s'affiche : "Étape 3 — Marchandise (à venir)"
AND    bouton "Précédent" → setStep(2)
AND    bouton "Terminer" → resetWizard() + router.push("/devis")
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
- `src/components/quote/wizard-step-route.tsx` — CRÉER : étape 2 (corridors chips + formulaire pays/ville)
- `src/components/quote/quote-wizard.tsx` — UPDATE : remplacer WizardStep2Stub par WizardStepRoute, ajouter WizardStep3Stub
- `src/messages/fr-NE.json` — UPDATE : ajouter section `devis.wizard.trajet`

**EXCLU :**
- Aucune migration — colonnes `originCountry`, `originCity`, `destinationCountry`, `destinationCity` **déjà dans** schema.ts et local-db.ts (Epic 2)
- Aucune modification `src/lib/local-db.ts` — `QuoteLocal` a déjà les 4 champs route
- Aucune modification `src/lib/schema.ts`
- Aucune modification `src/app/api/v1/sync/push/route.ts` — gère déjà les 4 champs (lignes 293-298)
- Étape 3 marchandise + calculs (Story 3.3)
- Étape 4 prestations (Story 3.4)
- Étape 5 conditions/clauses (Story 3.8)

---

## Tâches / Sous-tâches

### T1 — Créer `src/components/quote/wizard-step-route.tsx` (AC1, AC2, AC3, AC4, AC5)

- [x] `"use client"` première ligne
- [x] Imports : `useState`, `useWizardStore`, `db`, `QuoteLocal`, `applyLocalMutation`, `triggerSync`, `toast`
- [x] Définir constantes corridors + pays + villes (voir Dev Notes)
- [x] Props : `interface WizardStepRouteProps { userId: string }`
- [x] État local :
  ```ts
  const { quoteId, setStep } = useWizardStore();
  const [selectedCorridorIdx, setSelectedCorridorIdx] = useState<number | null>(null);
  const [originCountry, setOriginCountry] = useState("NE");
  const [originCity, setOriginCity] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("NE");
  const [destinationCity, setDestinationCity] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);
  ```
- [x] `handleCorridorSelect(idx)` : set all 4 fields + setSelectedCorridorIdx(idx)
- [x] `handleOriginCountryChange(code)` : setOriginCountry(code) + setOriginCity("") + setSelectedCorridorIdx(null)
- [x] `handleDestinationCountryChange(code)` : idem destinataire + setSelectedCorridorIdx(null)
- [x] `handleOriginCityChange(v)` : setOriginCity(v) + setSelectedCorridorIdx(null)
- [x] `handleDestinationCityChange(v)` : setDestinationCity(v) + setSelectedCorridorIdx(null)
- [x] `handleNext()` : applyLocalMutation "update" + auditMirror + triggerSync + setStep(3)
- [x] Rendu corridors : chips horizontaux scrollables, chip actif = fond navy + texte blanc, chip inactif = bord border-input
- [x] Rendu formulaire : select pays départ + input/datalist ville départ → pays arrivée + input/datalist ville arrivée
- [x] Affichage erreurs inline (`aria-describedby`)
- [x] Boutons "Précédent" (`setStep(1)`) + "Suivant" (disabled quand `isPending`)
- [x] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `src/components/quote/quote-wizard.tsx` (AC1, AC6)

- [x] Importer `WizardStepRoute` : `import { WizardStepRoute } from "./wizard-step-route";`
- [x] Remplacer `{step === 2 && <WizardStep2Stub />}` par `{step === 2 && <WizardStepRoute userId={userId} />}`
- [x] Renommer la fonction `WizardStep2Stub` en `WizardStep3Stub` (ou créer une nouvelle)
- [x] Ajouter `{step === 3 && <WizardStep3Stub />}` (stub pour Story 3.3)
- [x] WizardStep3Stub : message "Étape 3 — Marchandise (à venir)" + bouton Précédent (setStep(2)) + bouton Terminer (resetWizard + router.push("/devis"))
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/messages/fr-NE.json` (labels UI)

- [x] Ajouter sous `devis.wizard` :
  ```json
  "trajet": {
    "heading": "Trajet",
    "corridors": "Corridors fréquents",
    "originCountryLabel": "Pays de départ",
    "originCityLabel": "Ville de départ",
    "originCityPlaceholder": "Ex : Niamey",
    "destinationCountryLabel": "Pays d'arrivée",
    "destinationCityLabel": "Ville d'arrivée",
    "destinationCityPlaceholder": "Ex : Ouagadougou",
    "originCityRequired": "La ville de départ est requise",
    "destinationCityRequired": "La ville d'arrivée est requise"
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T4 — Vérification finale (AC7)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests 206/206 ✓
- [x] `pnpm build` : passe sans erreur
- [x] Navigation complète : étape 1 → étape 2 → Précédent → étape 1 ✓
- [x] Navigation complète : étape 1 → étape 2 → corridor chip → Suivant → étape 3 stub ✓
- [x] Navigation complète : étape 1 → étape 2 → saisie manuelle → Suivant → étape 3 stub ✓

---

## Dev Notes

### CRITIQUE — Champs route déjà dans le schéma Dexie ET Drizzle

```typescript
// src/lib/local-db.ts:39-41 — QuoteLocal a déjà :
originCountry?: string;
originCity?: string;
destinationCountry?: string;
destinationCity?: string;
```

```typescript
// src/lib/schema.ts:196-200 — table quote Drizzle a déjà :
originCountry: text("origin_country"),
originCity: text("origin_city"),
destinationCountry: text("destination_country"),
destinationCity: text("destination_city"),
```

**INTERDIT :** toute migration. Ces colonnes existent depuis Epic 2. Toute tentative de `pnpm db:generate` sur ce sujet casserait le journal de migration.

### CRITIQUE — push/route.ts déjà opérationnel (NE PAS MODIFIER)

```typescript
// src/app/api/v1/sync/push/route.ts:293-298 — déjà géré :
originCountry: strN(p.originCountry),
originCity: strN(p.originCity),
destinationCountry: strN(p.destinationCountry),
destinationCity: strN(p.destinationCity),
```

**INTERDIT :** toute modification de push/route.ts pour cette story.

### CRITIQUE — Pattern UPDATE (pas create) pour applyLocalMutation

Story 3.1 a créé le devis avec `applyLocalMutation("quote", quoteId, "create", ...)`.
Story 3.2 DOIT utiliser `"update"` car le devis existe déjà.

```typescript
// CORRECT — update le devis existant
const current = await db.quotes.get(quoteId);   // récupérer revision courante
await applyLocalMutation(
  "quote", quoteId, "update",
  { ...current, originCountry, originCity, destinationCountry, destinationCity, updatedAt: now },
  current.revision,   // baseRevision = revision actuelle (0 si jamais syncé)
  async () => { await db.quotes.put(updatedQuote); },  // .put() remplace tout
  userId,
);

// INTERDIT — NE PAS recréer avec "create"
applyLocalMutation("quote", quoteId, "create", ...)
```

### CRITIQUE — db.quotes.put() (pas .update()) pour l'écriture Dexie

Dexie `.update()` ne supprime pas les clés absentes — les champs optionnels précédemment définis resteraient. `.put()` remplace l'enregistrement entier.

```typescript
// CORRECT
const updatedQuote: QuoteLocal = { ...current, originCountry, originCity, destinationCountry, destinationCity, updatedAt: now };
await db.quotes.put(updatedQuote);

// INCORRECT (ne nettoie pas les optionnels)
await db.quotes.update(quoteId, { originCountry, originCity, ... });
```

### CRITIQUE — quoteId depuis le wizard store (ne pas le passer en prop)

```typescript
// CORRECT — lire depuis le store dans le composant
const { quoteId, setStep } = useWizardStore();

// PUIS dans handleNext :
if (!quoteId) { setErrors({ global: "Devis introuvable..." }); return; }
```

`quoteId` est défini par Story 3.1 à la fin de l'étape 1 via `useWizardStore.getState().setQuoteId(quoteId)`.

### CRITIQUE — AuditMirror APRÈS applyLocalMutation (hors transaction)

```typescript
// CORRECT — pattern établi (client-edit-form.tsx:211, client-delete-dialog.tsx:125)
await applyLocalMutation(...);   // transaction Dexie
await db.auditMirror.add({...}); // APRÈS — hors transaction
void triggerSync();
```

**INTERDIT :** placer `db.auditMirror.add` dans le dexieWriteFn (intérieur de la transaction).

### CRITIQUE — Navigation inter-étapes via Zustand (jamais router.push)

```typescript
// CORRECT
useWizardStore.getState().setStep(3);  // ou const { setStep } = useWizardStore(); setStep(3);

// INTERDIT
router.push("/devis/nouveau?step=3");
```

L'URL reste `/devis/nouveau` pendant tout le wizard. C'est un pattern SPA géré par Zustand.

### Constantes à définir dans wizard-step-route.tsx

```typescript
interface Corridor {
  label: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
}

const CORRIDORS: Corridor[] = [
  { label: "Niamey → Ouagadougou", originCountry: "NE", originCity: "Niamey",    destinationCountry: "BF", destinationCity: "Ouagadougou" },
  { label: "Niamey → Bamako",      originCountry: "NE", originCity: "Niamey",    destinationCountry: "ML", destinationCity: "Bamako" },
  { label: "Niamey → Cotonou",     originCountry: "NE", originCity: "Niamey",    destinationCountry: "BJ", destinationCity: "Cotonou" },
  { label: "Niamey → Lagos",       originCountry: "NE", originCity: "Niamey",    destinationCountry: "NG", destinationCity: "Lagos" },
  { label: "Niamey → Lomé",        originCountry: "NE", originCity: "Niamey",    destinationCountry: "TG", destinationCity: "Lomé" },
  { label: "Niamey → Agadez",      originCountry: "NE", originCity: "Niamey",    destinationCountry: "NE", destinationCity: "Agadez" },
  { label: "Niamey → Zinder",      originCountry: "NE", originCity: "Niamey",    destinationCountry: "NE", destinationCity: "Zinder" },
  { label: "Agadez → Niamey",      originCountry: "NE", originCity: "Agadez",    destinationCountry: "NE", destinationCity: "Niamey" },
  { label: "Zinder → Niamey",      originCountry: "NE", originCity: "Zinder",    destinationCountry: "NE", destinationCity: "Niamey" },
];

interface Country {
  code: string;
  label: string;
}

const COUNTRIES: Country[] = [
  { code: "NE", label: "Niger" },
  { code: "BF", label: "Burkina Faso" },
  { code: "ML", label: "Mali" },
  { code: "NG", label: "Nigéria" },
  { code: "BJ", label: "Bénin" },
  { code: "TG", label: "Togo" },
  { code: "CI", label: "Côte d'Ivoire" },
  { code: "GH", label: "Ghana" },
  { code: "SN", label: "Sénégal" },
];

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  NE: ["Niamey", "Agadez", "Zinder", "Maradi", "Tahoua", "Dosso", "Diffa", "Tillabéri"],
  BF: ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Banfora", "Dori"],
  ML: ["Bamako", "Mopti", "Sikasso", "Gao", "Kayes", "Tombouctou"],
  NG: ["Lagos", "Kano", "Abuja", "Kaduna", "Maiduguri", "Sokoto"],
  BJ: ["Cotonou", "Porto-Novo", "Parakou", "Natitingou"],
  TG: ["Lomé", "Sokodé", "Kpalimé", "Atakpamé"],
  CI: ["Abidjan", "Bouaké", "Yamoussoukro", "Korhogo"],
  GH: ["Accra", "Kumasi", "Tamale", "Takoradi"],
  SN: ["Dakar", "Thiès", "Kaolack", "Ziguinchor"],
};
```

### Chip UX (design tokens DESIGN.md)

```tsx
// Chip actif (selectedCorridorIdx === idx)
className="rounded-[20px] px-4 py-2 text-sm font-medium bg-brand-navy text-text-on-dark"

// Chip inactif
className="rounded-[20px] px-4 py-2 text-sm font-medium border border-border-input bg-surface text-text-secondary"

// Container chips — scroll horizontal
className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5"
```

### Input datalist pour les villes

```tsx
// Utiliser <input> + <datalist> pour l'autocomplétion des villes
// (compatible PWA offline, sans composant shadcn supplémentaire)
const datalistId = "origin-cities";

<input
  id="origin-city"
  list={datalistId}
  value={originCity}
  onChange={(e) => handleOriginCityChange(e.target.value)}
  placeholder="Ex : Niamey"
  aria-describedby={errors.originCity ? "origin-city-error" : undefined}
  aria-invalid={!!errors.originCity}
  className="..."
/>
<datalist id={datalistId}>
  {(CITIES_BY_COUNTRY[originCountry] ?? []).map((city) => (
    <option key={city} value={city} />
  ))}
</datalist>
```

### Structure de WizardStep3Stub dans quote-wizard.tsx

```tsx
// Renommer l'actuelle WizardStep2Stub en WizardStep3Stub (ou copier le pattern)
function WizardStep3Stub() {
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
          Étape 3 — Marchandise (à venir)
        </p>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setStep(2)}
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

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `applyLocalMutation("quote", id, "create", ...)` | `applyLocalMutation("quote", id, "update", ...)` (devis existe déjà) |
| `db.quotes.update(quoteId, partialFields)` | `db.quotes.put(updatedQuote)` (full record replacement) |
| Passer `quoteId` en prop | `const { quoteId } = useWizardStore()` |
| `router.push("/devis/nouveau?step=3")` | `useWizardStore.getState().setStep(3)` |
| `db.auditMirror.add` dans dexieWriteFn | Appeler APRÈS `await applyLocalMutation(...)` |
| Créer une migration ou toucher schema.ts | Colonnes route déjà présentes (Epic 2) |
| Modifier push/route.ts | Déjà opérationnel (lignes 293-298) |
| Importer depuis `dexie-react-hooks` | Non utilisé dans ce projet |
| Hardcoder les strings UI dans le composant | Utiliser `src/messages/fr-NE.json` (next-intl) |
| Stocker corridors/pays/villes dans Zustand | Constantes statiques dans wizard-step-route.tsx |
| Utiliser `toast.error` pour erreurs de formulaire | `setErrors({field: "message"})` inline |

### Héritage des stories précédentes

**Story 3.1 (wizard-step-client.tsx) :**
- Pattern `handleNext` avec `isPending + setErrors + try/catch/finally` — copier la structure
- Pattern `useWizardStore.getState().setStep(n)` (pas `const { setStep } = useWizardStore()` directement depuis handleNext asynchrone — les deux marchent, mais `getState()` est plus sûr dans les callbacks async)
- Pattern `applyLocalMutation + auditMirror + triggerSync` — adapter pour "update"
- Pattern QuoteLocal construction — ici `{...current, ...newFields}` pour le .put()

**Story 2.8 (client-edit-form.tsx) :**
- Pattern `db.quotes.get(quoteId)` pour obtenir la revision courante
- Pattern `db.quotes.put(updatedRecord)` (full replacement)
- Pattern `before/after` snapshot dans auditMirror

**Story 3.1 (quote-wizard.tsx:16-51) :**
- WizardStep2Stub à renommer WizardStep3Stub (changer message + setStep(2) pour Précédent)
- Import WizardStepRoute + routing `{step === 2 && <WizardStepRoute userId={userId} />}`

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration — colonnes route déjà dans schema.ts (0006/0007)
#    Vérifier si pas encore appliquées :
pnpm db:migrate

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.2] — FR-17 (saisie trajet, pays/ville, dropdown Niger défaut, autocomplete villes, corridors chips)
- [src/lib/local-db.ts:39-41] — `QuoteLocal.originCountry`, `.originCity`, `.destinationCountry`, `.destinationCity` (déjà définis)
- [src/lib/schema.ts:196-200] — colonnes route dans table `quote` Drizzle (déjà présentes)
- [src/app/api/v1/sync/push/route.ts:293-298] — persistance route au sync (déjà opérationnel)
- [src/lib/sync/outbox.ts:29-60] — `applyLocalMutation` (entity "quote" supporté)
- [src/components/quote/quote-wizard.tsx:16-51] — WizardStep2Stub à remplacer + ajouter step routing
- [src/stores/wizard-store.ts] — `quoteId`, `step`, `setStep`, `resetWizard`
- [src/components/client/client-edit-form.tsx:198-234] — pattern applyLocalMutation "update" + db.clients.put + auditMirror
- [src/components/quote/wizard-step-client.tsx] — pattern handleNext (isPending, setErrors, try/catch, triggerSync)
- [EXPERIENCE.md §Flow 1 step 4] — "Taps the Niamey→Ouagadougou corridor chip — both ends fill at once"
- [UX-DR20] — Wizard 5 étapes, presets corridors chips
- [Architecture §Naming Patterns] — `"use client"`, kebab-case files, PascalCase components, `@/` alias
- [Architecture §Process Patterns] — auditMirror hors transaction, triggerSync void
- [DESIGN.md §Shapes] — chips/pills radius 20px, chip actif navy fill, inactif bord border-input

---

## Review Findings

### Décision requise

- [x] [Review][Decision] **Approche révision dans handleNext** — Décision : Option A retenue. Supprimer le bloc `pendingOpsCount` et utiliser `current.revision` directement (conforme AC5). → converti en patch P5.

### À corriger (Patches)

- [x] [Review][Patch] ~~Typo `font-semibond` → `font-semibold`~~ — faux positif, fichier avait déjà `font-semibold` (artifact du diff tronqué)
- [x] [Review][Patch] **Bouton "Précédent" non désactivé pendant `isPending`** — ajout `disabled={isPending}` + `disabled:opacity-60` [wizard-step-route.tsx: bouton Précédent] ✓
- [x] [Review][Patch] **Strings UI hardcodées** — ajout `tW = useTranslations("devis.wizard")` ; boutons → `tW("previous")`/`tW("next")` ; état chargement → `t("saving")` ; erreurs globales → `t("errorNoQuote")`/`t("errorGeneric")` ; 3 nouvelles clés dans fr-NE.json [wizard-step-route.tsx, fr-NE.json] ✓
- [x] [Review][Patch] **`aria-pressed` manquant sur les chips corridor** — ajout `aria-pressed={selectedCorridorIdx === idx}` [wizard-step-route.tsx: boutons chips] ✓
- [x] [Review][Patch] **Supprimer `pendingOpsCount`/`effectiveRevision` → `current.revision`** — bloc pendingOpsCount supprimé, `effectiveRevision` → `current.revision` [wizard-step-route.tsx] ✓

### Différés

- [x] [Review][Defer] **`auditMirror.add` hors transaction Dexie** [wizard-step-route.tsx: ~ligne 163] — deferred, pre-existing — pattern explicitement prescrit par la spec (pattern établi dans client-edit-form.tsx), INTERDIT de le mettre dans dexieWriteFn
- [x] [Review][Defer] **`catch {}` sans logging** [wizard-step-route.tsx: bloc catch] — deferred, pre-existing — pattern cohérent avec le reste du projet
- [x] [Review][Defer] **Spread `{ ...current, ...routeFields }` dans payload** [wizard-step-route.tsx: payload construction] — deferred, pre-existing — pattern design offline-first établi dans client-edit-form.tsx
- [x] [Review][Defer] **`useEffect(resetWizard, [])` sans deps** [quote-wizard.tsx:59] — deferred, pre-existing — introduit en story 3-1, hors périmètre

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Créé `wizard-step-route.tsx` : 9 corridors prédéfinis, 9 pays, villes par pays. Chips scroll horizontal avec style actif/inactif. Select pays + input/datalist ville. handleNext avec applyLocalMutation "update" + db.quotes.put (full replacement) + auditMirror APRÈS + triggerSync.
- Mis à jour `quote-wizard.tsx` : WizardStep2Stub renommée WizardStep3Stub (Précédent → setStep(2)), import WizardStepRoute, routing step 2 → WizardStepRoute, step 3 → WizardStep3Stub.
- Mis à jour `fr-NE.json` : section `devis.wizard.trajet` ajoutée.
- Validation : pnpm check (0 erreurs, 5 warnings pré-existants), 206/206 tests, pnpm build ✓.

### File List

- `src/components/quote/wizard-step-route.tsx` (créé)
- `src/components/quote/quote-wizard.tsx` (modifié)
- `src/messages/fr-NE.json` (modifié)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)

### Change Log

- 2026-06-24 : Story 3.2 implémentée — WizardStepRoute (étape 2 trajet) + WizardStep3Stub (étape 3 stub) + labels fr-NE.json. Tous ACs satisfaits. pnpm check ✓ pnpm build ✓.
