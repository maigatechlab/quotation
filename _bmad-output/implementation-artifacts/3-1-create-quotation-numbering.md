---
story_key: 3-1-create-quotation-numbering
epic_num: 3
story_num: 1
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 3.1 : Création d'un nouveau devis & numérotation (FR-12, FR-13)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** créer un nouveau devis en sélectionnant un client, avec un numéro et des dates attribués automatiquement,
**Afin que** je démarre rapidement un devis structuré, même hors ligne.

---

## Critères d'acceptation (BDD)

**AC1 — Wizard étape 1 : sélection du client**

```
GIVEN  le wizard /devis/nouveau étape 1 (Client)
WHEN   le commercial consulte la page
THEN   une barre de progression 5 étapes s'affiche (1/5, 20% fill, libellé "Client" actif)
AND    la liste des clients actifs s'affiche en cartes (companyName, contactName, phone, city)
AND    une barre de recherche FlexSearch filtre la liste live (réutilise useLiveClients)
AND    un lien "Créer un nouveau client" pointe vers /clients/nouveau

GIVEN  le commercial tape sur une carte client
WHEN   la carte est sélectionnée
THEN   une coche (Check icon navy) s'affiche sur la carte sélectionnée
AND    les champs Objet (required), Référence (optional), Date devis, Date validité, Signataire nom, Signataire fonction apparaissent
AND    Date devis = aujourd'hui (modifiable), Date validité = aujourd'hui +30j (modifiable)
AND    Signataire nom et fonction pré-remplis depuis useLiveCompany() si disponibles

GIVEN  un client sélectionné + objet saisi
WHEN   le commercial clique "Suivant"
THEN   validation Zod : client requis, objet min 1 char
AND    quoteId = crypto.randomUUID()
AND    number = generateTempNumber(getDeviceId(), getNextLocalSeq(deviceId))
AND    applyLocalMutation("quote", quoteId, "create", payload, 0, dexieWriteFn, userId) appelé
AND    dans dexieWriteFn : db.quotes.add(newQuote) avec status="draft", totalFcfa=0
AND    clientSnapshot = objet ClientLocal complet (snapshot figé, pas seulement clientId)
AND    triggerSync() déclenché (void)
AND    db.auditMirror.add({ what: "quote.create", entityId: quoteId, ... }) APRÈS applyLocalMutation
AND    toast.success("Devis {tempNumber} créé")
AND    useWizardStore.getState().setQuoteId(quoteId) puis setStep(2)
```

**AC2 — Numérotation TEMP offline (FR-13)**

```
GIVEN  la primitive lib/sync/numbering.ts (Story 2.1)
WHEN   je crée un devis offline
THEN   APPELER la primitive — NE PAS réimplémenter :
         deviceId = getDeviceId()              → localStorage "QUOTATION_DEVICE_ID"
         seq      = getNextLocalSeq(deviceId)  → localStorage "TEMP_SEQ_{deviceId}" incrémenté
         number   = generateTempNumber(deviceId, seq) → "TEMP-{DEVICE[0:4]}-{SEQ:04}"
AND    QuoteLocal.number stocké avec cette valeur TEMP
AND    le serveur remplacera par DEV-{YYYY}-{XXXX} au sync (responsabilité moteur sync Story 2.1)

GIVEN  deux devis créés offline sur le même device
WHEN   créés séquentiellement
THEN   SEQ différents (getNextLocalSeq incrémente chaque appel)
```

**AC3 — Permission gate (FR-3)**

```
GIVEN  utilisateur avec rôle Opérateur
WHEN   il accède à /devis/nouveau
THEN   redirect("/devis") — can(role, "quote.create") = false pour opérateur

GIVEN  Admin ou Commercial
WHEN   il accède à /devis/nouveau
THEN   wizard s'affiche normalement
```

**AC4 — Étape 2 stub (navigation wizard)**

```
GIVEN  étape 2 (Trajet) non encore implémentée (Story 3.2)
WHEN   l'utilisateur arrive à l'étape 2
THEN   contenu stub : "Étape 2 — Trajet (à venir)"
AND    bouton "Précédent" revient à l'étape 1
AND    bouton "Terminer" visible en étape stub → router.push("/devis") + resetWizard()
```

**AC5 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + 204 tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/stores/wizard-store.ts` — CRÉER : Zustand store (step + quoteId uniquement)
- `src/components/quote/quote-wizard.tsx` — CRÉER : shell wizard (progress bar + step router + footer sticky)
- `src/components/quote/wizard-step-client.tsx` — CRÉER : étape 1 (client cards + formulaire devis header)
- `src/hooks/use-live-quotes.ts` — CRÉER : liveQuery hook (même pattern que use-live-clients.ts)
- `src/app/(app)/devis/nouveau/page.tsx` — UPDATE : remplacer stub par auth + permission + `<QuoteWizard>`
- `src/messages/fr-NE.json` — UPDATE : ajouter section `devis` (wizard labels)
- **`pnpm add zustand`** — OBLIGATOIRE avant toute implémentation (absent de package.json)

**EXCLU :**
- Aucune migration — `quote` table déjà dans schema.ts, migrations 0006/0007 déjà générées (Epic 2)
- Aucune modification `src/lib/local-db.ts` — `QuoteLocal` complet depuis Epic 2
- Aucune modification `src/lib/sync/numbering.ts` — primitive CONSOMMÉE, pas réimplémentée
- Aucune modification `src/app/api/v1/sync/push/route.ts` — gère déjà `quote.create` (lignes 270-318)
- Aucune modification `src/lib/schema.ts`
- Étapes 2-5 wizard (Stories 3.2, 3.3, 3.4, 3.8)
- Page `/devis` liste (Story 3.10)

---

## Tâches / Sous-tâches

### T0 — Prérequis : installer Zustand

- [x] `pnpm add zustand`
- [x] Confirmer zustand ^5.x dans package.json (React 19 compatible)
- [x] `pnpm typecheck` — zéro erreur

### T1 — Créer `src/stores/wizard-store.ts`

- [x] Interface `WizardState` :
  ```ts
  interface WizardState {
    step: number;
    quoteId: string | null;
    setStep: (step: number) => void;
    setQuoteId: (id: string) => void;
    resetWizard: () => void;
  }
  ```
- [x] `create<WizardState>()(set => ({ step: 1, quoteId: null, setStep: (step) => set({ step }), setQuoteId: (quoteId) => set({ quoteId }), resetWizard: () => set({ step: 1, quoteId: null }) }))`
- [x] Export `useWizardStore`
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/hooks/use-live-quotes.ts`

- [x] `"use client"` première ligne
- [x] Pattern `liveQuery + useEffect + subscribe` identique à `use-live-clients.ts:31-39`
- [x] `db.quotes.orderBy("createdAt").reverse().toArray()`
- [x] State : `quotes: QuoteLocal[]`, init `[]`
- [x] Export `useLiveQuotes(): { quotes: QuoteLocal[] }`
- [x] `pnpm typecheck` — zéro erreur

### T3 — Créer `src/components/quote/wizard-step-client.tsx` (AC1, AC2)

- [x] `"use client"` première ligne

- [x] Props interface :
  ```ts
  interface WizardStepClientProps {
    userId: string;
    companyId?: string;
    defaultSignataireNom?: string;
    defaultSigFonction?: string;
    defaultConditions?: string;
  }
  ```

- [x] État local :
  - `selectedClient: ClientLocal | null = null`
  - `objet = ""`
  - `reference = ""`
  - `dateDevis = new Date().toISOString().split("T")[0]`
  - `dateValidite = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]`
  - `signataireNom = defaultSignataireNom ?? ""`
  - `signataireFonction = defaultSigFonction ?? ""`
  - `errors: Partial<Record<string, string>> = {}`
  - `isPending = false`

- [x] `useLiveClients()` pour liste + search (NE PAS recréer)

- [x] Rendu liste clients :
  - Chaque carte : `companyName`, `contactName`, `phone`, `city`
  - Tap → `setSelectedClient(client)` (remplace selection précédente)
  - Carte sélectionnée : coche `Check` (icône Lucide, navy)
  - Barre recherche : `setSearchQuery(q)` via useLiveClients
  - Lien `<Link href="/clients/nouveau">Créer un nouveau client</Link>`

- [x] Formulaire header devis (visible toujours ou après selection selon UX) :
  - Objet (required, `aria-invalid`, `aria-describedby`)
  - Référence (optional)
  - Date devis (type="date")
  - Date validité (type="date")
  - Signataire nom
  - Signataire fonction

- [x] `handleNext()` :
  ```ts
  async function handleNext() {
    setErrors({});
    if (!selectedClient) { setErrors({ client: "Sélectionnez un client" }); return; }
    if (!objet.trim()) { setErrors({ objet: "L'objet est requis" }); return; }
    setIsPending(true);
    try {
      const deviceId = getDeviceId();
      const seq = getNextLocalSeq(deviceId);
      const tempNumber = generateTempNumber(deviceId, seq);
      const quoteId = crypto.randomUUID();
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        number: tempNumber,
        reference: reference.trim() || null,
        objet: objet.trim(),
        status: "draft",
        clientId: selectedClient.id,
        clientSnapshot: selectedClient,
        ownerId: userId,
        dateDevis,
        dateValidite,
        signataireNom: signataireNom || null,
        signataireFonction: signataireFonction || null,
        conditionsPaiement: defaultConditions || null,
        totalFcfa: 0,
        pays: "NE",
        companyId: companyId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      await applyLocalMutation(
        "quote", quoteId, "create", payload, 0,
        async () => {
          const newQuote: QuoteLocal = {
            id: quoteId,
            number: tempNumber,
            status: "draft",
            clientId: selectedClient.id,
            clientSnapshot: selectedClient,
            ownerId: userId,
            objet: objet.trim(),
            dateDevis,
            dateValidite,
            totalFcfa: 0,
            pays: "NE",
            revision: 0,
            updatedAt: now,
            createdAt: now,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            ...(signataireNom ? { signataireNom } : {}),
            ...(signataireFonction ? { signataireFonction } : {}),
            ...(defaultConditions ? { conditionsPaiement: defaultConditions } : {}),
            ...(companyId ? { companyId } : {}),
          };
          await db.quotes.add(newQuote);
        },
        userId,
      );
      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "quote.create",
        when: now,
        where: "/devis/nouveau",
        entityType: "quote",
        entityId: quoteId,
        before: null,
        after: { number: tempNumber, status: "draft", clientId: selectedClient.id },
        createdAt: now,
        synced: false,
      });
      void triggerSync();
      toast.success(`Devis ${tempNumber} créé`);
      useWizardStore.getState().setQuoteId(quoteId);
      useWizardStore.getState().setStep(2);
    } catch {
      setErrors({ global: "Une erreur est survenue. Veuillez réessayer." });
    } finally {
      setIsPending(false);
    }
  }
  ```

- [x] Bouton "Suivant" disabled quand `isPending`
- [x] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/components/quote/quote-wizard.tsx` (AC1, AC4)

- [x] `"use client"` première ligne
- [x] `useWizardStore()` pour `step`
- [x] `useLiveCompany()` pour défauts société
- [x] `userId` reçu en prop depuis page.tsx (Server Component → Client Component)
- [x] Progress bar : `Math.round((step / 5) * 100)`%, libellés : `["Client", "Trajet", "Marchandise", "Prestations", "Conditions"]`
- [x] `useEffect(() => { useWizardStore.getState().resetWizard(); }, [])` au mount (reset état résiduel)
- [x] Step router :
  ```tsx
  {step === 1 && (
    <WizardStepClient
      userId={userId}
      companyId={company?.id}
      defaultSignataireNom={company?.signataireNom}
      defaultSigFonction={company?.signataireFonction}
      defaultConditions={company?.conditionsPaiementDefaut}
    />
  )}
  {step === 2 && <WizardStep2Stub />}
  {/* Steps 3-5 ajoutés par Stories 3.3, 3.4, 3.8 */}
  ```
- [x] `WizardStep2Stub` (inline dans ce fichier pour l'instant) : message + bouton Terminer + bouton Précédent
- [x] Sticky footer optionnel (bouton Précédent step=1 désactivé) — les steps gèrent leur propre Suivant
- [x] `pnpm typecheck` — zéro erreur

### T5 — Mettre à jour `src/app/(app)/devis/nouveau/page.tsx` (AC3)

- [x] Remplacer le stub par :
  ```tsx
  import { redirect } from "next/navigation";
  import { can } from "@/lib/permissions";
  import { getSessionWithRole } from "@/lib/session";
  import { QuoteWizard } from "@/components/quote/quote-wizard";

  export default async function NouveauDevisPage() {
    const result = await getSessionWithRole();
    if (!result) redirect("/login");
    const { session, role } = result;
    if (!can(role, "quote.create")) redirect("/devis");
    const userId = (session.user as Record<string, unknown>).id as string;
    return (
      <div className="flex flex-col pb-10">
        <QuoteWizard userId={userId} />
      </div>
    );
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/messages/fr-NE.json`

- [x] Ajouter sous la clé racine :
  ```json
  "devis": {
    "title": "Devis",
    "nouveau": "Nouveau devis",
    "wizard": {
      "steps": ["Client", "Trajet", "Marchandise", "Prestations", "Conditions"],
      "next": "Suivant",
      "previous": "Précédent",
      "finish": "Terminer",
      "stepLabel": "Étape {current} sur {total}",
      "clientRequired": "Sélectionnez un client",
      "objetRequired": "L'objet est requis",
      "objetLabel": "Objet du devis",
      "referenceLabel": "Référence (optionnel)",
      "dateDevisLabel": "Date du devis",
      "dateValiditeLabel": "Date de validité",
      "signataireNomLabel": "Signataire — Nom",
      "signataireFonctionLabel": "Signataire — Fonction",
      "searchClient": "Rechercher un client…",
      "newClient": "Créer un nouveau client",
      "created": "Devis {number} créé",
      "stubStep": "Étape {step} — {label} (à venir)"
    }
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T7 — Vérification finale (AC5)

- [x] `pnpm check` : lint ✓ typecheck ✓ 206 tests ✓
- [x] `pnpm build` : passe sans erreur

---

## Dev Notes

### CRITIQUE — Zustand absent de package.json

Vérifié dans package.json : Zustand **non installé**. Installer en premier.

```bash
pnpm add zustand
```

Zustand v5.x est compatible React 19. Ne pas utiliser v4.x (API légèrement différente sur les selectors).

### CRITIQUE — Consommer numbering.ts (NE PAS réinventer)

```typescript
// src/lib/sync/numbering.ts — API existante
import { getDeviceId, getNextLocalSeq, generateTempNumber } from "@/lib/sync/numbering";

// Utilisation dans handleNext() :
const deviceId = getDeviceId();          // localStorage "QUOTATION_DEVICE_ID"
const seq = getNextLocalSeq(deviceId);   // localStorage "TEMP_SEQ_{deviceId}" incrémenté
const number = generateTempNumber(deviceId, seq);
// → "TEMP-{deviceId.slice(0,4).toUpperCase()}-{String(seq).padStart(4, "0")}"
// → ex: "TEMP-A3F9-0001"
```

**INTERDIT :** toute autre génération de numéro TEMP. Cette primitive est le point de contrôle offline → DEV.

### CRITIQUE — clientSnapshot = objet complet ClientLocal

```typescript
// CORRECT — snapshot figé au moment de la création
clientSnapshot: selectedClient,  // type: ClientLocal (companyName, phone, city, etc.)

// INTERDIT — snapshot partiel
clientSnapshot: { id: selectedClient.id, name: selectedClient.companyName }
```

FR-10 exige que les devis historiques conservent les données client figées à leur création. Le snapshot doit inclure tous les champs de `ClientLocal` (companyName, contactName, phone, email, city, address, etc.).

### CRITIQUE — Pattern applyLocalMutation "create" pour quote

```typescript
// db.quotes.add() (pas .put()) pour un create
await applyLocalMutation(
  "quote",
  quoteId,
  "create",
  payload,   // Record<string, unknown> — tous champs sérialisés
  0,         // baseRevision = 0 pour create
  async () => {
    await db.quotes.add(newQuote);  // .add() lève DuplicateError si conflit
  },
  userId,
);

// APRÈS applyLocalMutation (hors transaction) :
await db.auditMirror.add({ ... });
void triggerSync();
```

Pattern établi : Story 2-6 `client-form.tsx:85-111`.

### CRITIQUE — liveQuery pattern (pas useLiveQuery de dexie-react-hooks)

```typescript
// use-live-quotes.ts — copier pattern use-live-clients.ts:31-39
useEffect(() => {
  const subscription = liveQuery(() =>
    db.quotes.orderBy("createdAt").reverse().toArray()
  ).subscribe({
    next: (quotes) => setQuotes(quotes),
    error: () => setQuotes([]),
  });
  return () => subscription.unsubscribe();
}, []);
```

`useLiveQuery` de `dexie-react-hooks` n'est pas utilisé dans ce projet.

### CRITIQUE — Dates string ISO dans Dexie (pas Date objects)

```typescript
// CORRECT
const dateDevis = new Date().toISOString().split("T")[0];       // "2026-06-24"
const dateValidite = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString().split("T")[0];                                  // "2026-07-24"

// push/route.ts dateN() convertit ces strings en Date pour Postgres — pas de problème
```

`QuoteLocal.dateDevis?: string` (interface local-db.ts:36) — stocker string ISO.

### CRITIQUE — Zustand wizard store minimal

```typescript
// wizard-store.ts — UNIQUEMENT step + quoteId
// NE PAS dupliquer dans Zustand ce qui est dans Dexie
interface WizardState {
  step: number;          // étape courante 1-5
  quoteId: string | null; // ID après création en step 1
  ...
}

// Les données du devis (objet, clientId, dates, etc.) vivent dans db.quotes après applyLocalMutation
// Zustand est ephemeral (in-memory) — pas de persist middleware
```

### CRITIQUE — push/route.ts déjà opérationnel pour quote.create

`src/app/api/v1/sync/push/route.ts` lignes 270-318 :
- Gère `entity="quote"`, `type="create"` via upsert
- Coerce `number`, `status`, `clientSnapshot`, `dateDevis`, `dateValidite`, `totalFcfa` correctement
- Stamps `companyId = tenantId` (ne pas faire confiance au payload.companyId côté client)

**Aucune modification de push/route.ts nécessaire.**

### CRITIQUE — totalFcfa = 0 (integer, pas float)

```typescript
totalFcfa: 0,  // integer XOF, pas 0.0
```

XOF n'a pas de sous-unité. Architecture exige integer FCFA partout.

### CRITIQUE — Navigation inter-étapes via Zustand (pas router)

```typescript
// CORRECT — naviguer entre étapes wizard
useWizardStore.getState().setStep(2);

// INTERDIT — router.push pour chaque étape
router.push("/devis/nouveau?step=2")  // ← maintient le même chemin URL
```

Le wizard est une SPA à `/devis/nouveau`. URL ne change pas entre étapes.

### CRITIQUE — userId extraction (Server Component)

```typescript
// devis/nouveau/page.tsx (Server Component)
const userId = (session.user as Record<string, unknown>).id as string;
// Pattern établi : clients/page.tsx:15, clients/nouveau/page.tsx:14, clients/[id]/modifier/page.tsx
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Générer numéro TEMP sans `numbering.ts` | `generateTempNumber(getDeviceId(), getNextLocalSeq(id))` |
| `clientSnapshot: { id, name }` partiel | `clientSnapshot: selectedClient` (objet complet) |
| `useLiveQuery` de `dexie-react-hooks` | `liveQuery + useEffect + subscribe` |
| Stocker objet/dates dans Zustand | Zustand = step + quoteId uniquement |
| `router.push` entre étapes wizard | `useWizardStore.getState().setStep(n)` |
| `db.quotes.put(newQuote)` | `db.quotes.add(newQuote)` pour create |
| Écrire auditMirror dans transaction | Écrire APRÈS `await applyLocalMutation(...)` |
| `totalFcfa: 0.0` (float) | `totalFcfa: 0` (integer XOF) |
| Créer `/api/v1/quotes` route | Tout passe par sync push (déjà opérationnel) |
| Date `new Date()` dans QuoteLocal | `new Date().toISOString().split("T")[0]` (string) |
| Zustand persist middleware | Zustand ephemeral in-memory (architecture mandate) |
| Réimplémenter FlexSearch client search | `useLiveClients()` déjà disponible |

### Héritage des stories précédentes

**Story 2-1 (`numbering.ts`) :**
- `getDeviceId()`, `getNextLocalSeq()`, `generateTempNumber()` — CONSOMMER, ne pas toucher

**Story 2-3/2-5 (`use-live-company.ts`) :**
- `useLiveCompany()` → `company.signataireNom`, `company.signataireFonction`, `company.conditionsPaiementDefaut`
- Pré-remplir dans wizard-step-client.tsx via props depuis quote-wizard.tsx

**Story 2-6 (`client-form.tsx`) :**
- Pattern `applyLocalMutation + triggerSync + toast` — adapter (setStep au lieu de router.push)
- Pattern construction `QuoteLocal` avec spread optionals : `...(field ? { field } : {})`

**Story 2-7 (`use-live-clients.ts`) :**
- `useLiveClients()` → réutiliser tel quel pour la grille de sélection client
- `{ clients, searchQuery, setSearchQuery }` disponibles directement

**Story 2-9 (`client-delete-dialog.tsx`) :**
- Pattern audit mirror APRÈS applyLocalMutation (hors transaction) — lignes 125-131

**Story 2-8 (`client-list.tsx`) :**
- Pattern `useState<ClientLocal | null>` pour selected state

### Commandes pour le dev agent

```bash
# 0. OBLIGATOIRE — Zustand absent de package.json
pnpm add zustand

# 1. Docker en cours
docker compose up -d

# 2. Aucune migration — quote table dans schema.ts, migrations 0006/0007 déjà générées
#    Si pas encore appliquées :
pnpm db:migrate

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.1] — FR-12 (création devis) + FR-13 (numérotation TEMP→DEV)
- [src/lib/sync/numbering.ts] — `getDeviceId`, `getNextLocalSeq`, `generateTempNumber`, `formatServerNumber`
- [src/lib/local-db.ts:24-56] — interface `QuoteLocal` complète
- [src/lib/schema.ts:181-226] — table `quote` Drizzle (tous champs, indexes)
- [src/app/api/v1/sync/push/route.ts:270-318] — `persistEntityMutation case "quote"` (opérationnel)
- [src/lib/sync/outbox.ts:29-60] — `applyLocalMutation` (entity "quote" supporté `getEntityTable`)
- [src/lib/permissions.ts:33,59] — `quote.create`: admin=true, commercial=true, operateur=false
- [src/lib/validation/quote.ts] — `quoteSchema` Zod (reference, objet, clientId, dateDevis, dateValidite)
- [src/hooks/use-live-clients.ts] — `useLiveClients()` à réutiliser (FlexSearch, filtre deleted)
- [src/hooks/use-live-company.ts] — `useLiveCompany()` (signataireNom, signataireFonction, conditionsPaiementDefaut)
- [src/components/client/client-form.tsx:65-122] — pattern applyLocalMutation create + audit + toast
- [src/app/(app)/clients/nouveau/page.tsx] — pattern page Server Component (auth + can + userId)
- [Architecture §Frontend Architecture] — Zustand stores/ (ephemeral), liveQuery hooks, local-first
- [Architecture §Naming Patterns] — `"use client"`, kebab-case files, PascalCase components, `@/` alias
- [Architecture §Process Patterns] — auditMirror hors transaction, triggerSync void
- [UX-DR20] — Wizard 5 étapes : Client → Trajet → Marchandise → Prestations → Conditions/Récap
- [UX-DR13] — FAB amber → /devis/nouveau (déjà câblé dans layout.tsx)
- [UX-DR23] — cibles ≥44×44px (boutons, cards, nav), labels aria sur icon-only

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Zustand 5.0.14 installé (React 19 compatible, ephemeral in-memory, pas de persist middleware)
- `wizard-store.ts` : store Zustand minimal (step + quoteId uniquement, pas de données devis)
- `use-live-quotes.ts` : pattern liveQuery identique à use-live-clients.ts
- `wizard-step-client.tsx` : sélection client avec FlexSearch (via useLiveClients réutilisé), formulaire header devis, handleNext avec applyLocalMutation + auditMirror + triggerSync
- Fix `exactOptionalPropertyTypes` : props optionnelles déclarées `string | undefined`, newQuote construit avec `as QuoteLocal` (conditional spreads causent widening inference en TS 5.9)
- Fix react-hooks/purity : `Date.now()` dans useState lazy initializer `() => ...`
- `quote-wizard.tsx` : progress bar 5 étapes, step router, WizardStep2Stub inline, resetWizard au mount
- `devis/nouveau/page.tsx` : auth + permission gate (AC3), userId extraction pattern établi
- `fr-NE.json` : section `devis.wizard` complète
- 206 tests passent (2 nouveaux vs 204 existants — ajout de tests dans les vagues précédentes)
- pnpm build ✓ avec migrations appliquées

### File List

- `package.json` (zustand 5.0.14 ajouté)
- `src/stores/wizard-store.ts` (créé)
- `src/hooks/use-live-quotes.ts` (créé)
- `src/components/quote/wizard-step-client.tsx` (créé)
- `src/components/quote/quote-wizard.tsx` (créé)
- `src/app/(app)/devis/nouveau/page.tsx` (mis à jour)
- `src/messages/fr-NE.json` (mis à jour — section devis ajoutée)

### Change Log

- 2026-06-24 : Story 3.1 implémentée — wizard devis étape 1, Zustand store, numérotation TEMP offline, permission gate opérateur
- 2026-06-24 : Review follow-ups — fix async company defaults (defer WizardStepClient render), fix mojibake pré-existant fr-NE.json (5 strings), ajout validation dates dans handleNext()
