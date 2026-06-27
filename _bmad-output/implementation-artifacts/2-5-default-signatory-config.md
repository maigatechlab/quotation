---
story_key: 2-5-default-signatory-config
epic_num: 2
story_num: 5
status: done
baseline_commit: 95c49335d0c4abaf532babe2b8d49643c32e7782
---

# Story 2.5 : Configuration du signataire par défaut (FR-7)

**Statut :** done

## Story

**En tant que** administrateur,
**Je veux** définir un signataire par défaut (nom et fonction),
**Afin que** il soit pré-rempli automatiquement sur chaque nouveau devis.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage et contrôle d'accès**

```
GIVEN  un utilisateur authentifié accède à /parametres
WHEN   la page se charge
THEN   une section "Signataire par défaut" est visible pour tous les rôles
AND    un Admin avec companyId peut modifier les champs nom et fonction
AND    un Commercial ou Opérateur voit les valeurs actuelles en lecture seule
AND    un Admin sans companyId (bootstrap non effectué) voit les champs désactivés
       avec le message "Enregistrez d'abord les informations société"
```

**AC2 — Sauvegarde offline-capable (FR-7)**

```
GIVEN  un Admin a rempli les champs "Nom du signataire" et/ou "Fonction"
WHEN   il clique sur "Enregistrer le signataire"
THEN   les valeurs sont écrites dans Dexie (db.company) via applyLocalMutation
AND    un SyncOp est enqueued dans db.syncQueue (même transaction Dexie)
AND    un toast "Signataire enregistré" s'affiche
AND   la prévisualisation se met à jour immédiatement (via useLiveCompany liveQuery)

GIVEN  l'appareil est offline
WHEN   l'Admin enregistre le signataire
THEN   la mutation est persistée dans l'outbox et synchronisée au prochain retour réseau
```

**AC3 — Champs facultatifs, valeurs vides**

```
GIVEN  l'Admin efface le nom et/ou la fonction
WHEN   il sauvegarde
THEN   les champs sont mis à null dans Dexie et sur le serveur (vidage autorisé)
AND    aucune erreur de validation n'est déclenchée (les deux champs sont optionnels)
```

**AC4 — Cohérence avec les autres mutations company**

```
GIVEN  un signataire enregistré par SignatoryConfig
WHEN   l'Admin modifie ensuite les infos société via CompanyForm
THEN   le signataire est préservé (CompanyForm passe signataireNom/signataireFonction
       tels quels dans son payload)

GIVEN  CompanyForm enregistre les infos société
WHEN   SignatoryConfig enregistre ensuite le signataire
THEN   les infos société sont préservées (SignatoryConfig inclut tous les champs company
       dans son payload applyLocalMutation)
```

**AC5 — Pré-remplissage sur devis (hors scope Story 2.5)**

```
NOTE   La consommation du signataire sur les nouveaux devis (pré-remplissage wizard
       étape "Conditions") est implémentée en Story 3.1.
       Story 2.5 se limite au stockage de ces valeurs sur l'entité company.
```

**AC6 — Qualité**

```
GIVEN  les fichiers modifiés/créés
WHEN   je lance pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/settings/signatory-config.tsx` — CRÉER : composant Client Component
- `src/app/(app)/parametres/page.tsx` — UPDATE : ajouter `<SignatoryConfig>` section

**EXCLU :**
- Modification de `src/lib/schema.ts` → `signataire_nom` et `signataire_fonction` existent déjà dans la table `company` (lignes 138–139)
- Modification de `src/lib/local-db.ts` → `signataireNom?` et `signataireFonction?` existent déjà dans `CompanyLocal` (lignes 109–110)
- Modification de `src/lib/validation/company.ts` → champs déjà présents dans `companySchema` (lignes 22–23)
- Modification de `src/components/settings/company-form.tsx` → préserve déjà ces champs (lignes 162–163)
- Migration Drizzle → colonnes déjà présentes depuis Story 1.3
- Nouvel endpoint API → la mutation passe par `applyLocalMutation` → `sync/push` existant
- Pré-remplissage du signataire dans le wizard devis → Story 3.1
- Messages i18n dans `fr-NE.json` → inline dans le composant (pattern accepté, cf. Story 2-4)

---

## Tâches / Sous-tâches

### T1 — Créer le composant SignatoryConfig (AC1, AC2, AC3, AC4)

- [x] Créer `src/components/settings/signatory-config.tsx` (`"use client"` première ligne)
- [x] Props : `companyId: string | null`, `canEdit: boolean`, `userId: string`, `initialCompany: CompanyLocal | null`
- [x] Utiliser `useLiveCompany()` pour la valeur réactive de la company
- [x] Résolution effective : `liveCompany ?? initialCompany` (même pattern que CompanyForm)
- [x] `useState` : `signataireNom: string`, `signataireFonction: string`, `isPending: boolean`, `error: string | null`
- [x] Initialiser les états depuis `effectiveCompany?.signataireNom ?? ""` et `effectiveCompany?.signataireFonction ?? ""`
- [x] Implémenter `handleSubmit` :
  - [x] Guard : si `!effectiveCompany || !companyId` → return early
  - [x] Construire `payload` complet (TOUS les champs company) — voir Dev Notes
  - [x] Appeler `applyLocalMutation("company", effectiveCompany.id, "update", payload, effectiveCompany.revision, dexieWriteFn, userId)`
  - [x] `dexieWriteFn` : `db.company.put(...)` avec valeurs mises à jour (exactOptionalPropertyTypes)
  - [x] `triggerSync()` après mutation
  - [x] `toast.success("Signataire enregistré")`
- [x] Afficher en lecture seule si `!canEdit` (ReadOnly view)
- [x] Afficher message désactivé si `canEdit && !companyId`
- [x] `pnpm typecheck` — aucune régression

### T2 — Intégrer dans la page /parametres (AC1)

- [x] Ouvrir `src/app/(app)/parametres/page.tsx`
- [x] Importer `SignatoryConfig` depuis `@/components/settings/signatory-config`
- [x] Passer `userId` à `SignatoryConfig` (déjà extrait ligne 17)
- [x] Ajouter section `<SignatoryConfig companyId={companyId} canEdit={canEdit} userId={userId} initialCompany={initialCompany} />`
- [x] Position recommandée : après `<LogoUpload>`, dans son propre `div` avec `className="mt-6 rounded-2xl border border-border bg-surface p-5"`
- [x] `pnpm typecheck`

### T3 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ (201+ tests ✓ sans régression)
- [x] `pnpm build` : passe sans erreur (Next.js ✓ ; db:migrate échoue car Docker éteint — aucune migration requise)

---

## Dev Notes

### CRITIQUE — Colonnes déjà en place, zéro migration

`signataire_nom` et `signataire_fonction` existent dans `src/lib/schema.ts` (lignes 138–139) :
```typescript
signataireNom: text("signataire_nom"),
signataireFonction: text("signataire_fonction"),
```

`CompanyLocal.signataireNom?: string` et `CompanyLocal.signataireFonction?: string` existent dans `src/lib/local-db.ts` (lignes 109–110).

**Ne pas modifier `src/lib/schema.ts` ni `src/lib/local-db.ts`. Aucune migration Drizzle.**

---

### CRITIQUE — Payload complet obligatoire dans applyLocalMutation

Le endpoint `POST /api/v1/sync/push` fait un **upsert complet** de l'entité company (voir `src/app/api/v1/sync/push/route.ts` case "company", lignes 309–338). Il n'existe pas de patch partiel. Si le payload ne contient que `signataireNom`/`signataireFonction`, les autres champs (raisonSociale, rccm, nif, phones, emails, logoUrl, etc.) seront réinitialisés à null/vide sur le serveur.

**Le payload DOIT inclure TOUS les champs de l'entité company** (copiés depuis `effectiveCompany`) :

```typescript
const payload: Record<string, unknown> = {
  // Champs gérés par CompanyForm — passer tels quels
  raisonSociale: effectiveCompany.raisonSociale,
  rccm: effectiveCompany.rccm,
  nif: effectiveCompany.nif,
  phones: effectiveCompany.phones,
  emails: effectiveCompany.emails,
  formeJuridique: effectiveCompany.formeJuridique ?? null,
  capital: effectiveCompany.capital ?? null,
  adresse: effectiveCompany.adresse ?? null,
  bp: effectiveCompany.bp ?? null,
  // Géré par LogoUpload — préserver
  logoUrl: effectiveCompany.logoUrl ?? null,
  // Géré par cette story — nouvelles valeurs
  signataireNom: signataireNom.trim() || null,
  signataireFonction: signataireFonction.trim() || null,
  // Géré par Story 3.x — préserver
  conditionsPaiementDefaut: effectiveCompany.conditionsPaiementDefaut ?? null,
  // Seams sync
  companyId: effectiveCompany.companyId ?? null,
  pays: effectiveCompany.pays,
  updatedAt: new Date().toISOString(),
  createdAt: effectiveCompany.createdAt,
};
```

---

### CRITIQUE — exactOptionalPropertyTypes : Dexie put

TypeScript strict (`exactOptionalPropertyTypes`) interdit `undefined` dans `put()`. Utiliser la suppression de propriété ou le spread conditionnel :

```typescript
// dexieWriteFn dans applyLocalMutation :
async () => {
  const putObj: CompanyLocal = {
    ...effectiveCompany,
    revision: effectiveCompany.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  // Signatory : null → supprimer la clé optionnelle
  const newNom = signataireNom.trim() || null;
  const newFonction = signataireFonction.trim() || null;
  if (newNom !== null) {
    putObj.signataireNom = newNom;
  } else {
    delete putObj.signataireNom;
  }
  if (newFonction !== null) {
    putObj.signataireFonction = newFonction;
  } else {
    delete putObj.signataireFonction;
  }
  await db.company.put(putObj);
}
```

---

### CRITIQUE — Pattern Props + useLiveCompany (héritage Story 2-4)

Copier le pattern exact de `LogoUpload` (`src/components/settings/logo-upload.tsx`) :
- Recevoir `initialCompany: CompanyLocal | null` en prop (SSR seed)
- `const liveCompany = useLiveCompany();`
- `const effectiveCompany = liveCompany ?? initialCompany;`
- Le formulaire se met à jour automatiquement si un autre composant (ex: CompanyForm) modifie la company dans Dexie

Ne pas utiliser de `useEffect` pour synchroniser l'état des champs avec `effectiveCompany`. Utiliser une `key` sur le composant interne ou initialiser les `useState` depuis `effectiveCompany` et accepter que la réactivité passe par la page (re-key au niveau du wrapper `SignatoryConfig`).

**Approche recommandée :** Composant simple sans re-key — les champs sont contrôlés par state local. La liveQuery permet la mise à jour si `liveCompany` change et que les états locaux ne sont pas encore "sales" (l'utilisateur n'a pas encore tapé). Suffisant pour MVP-0.

---

### CRITIQUE — Pattern Auth pour applyLocalMutation

`applyLocalMutation` ne fait pas appel au serveur directement — pas besoin d'auth dans le composant. `userId` est passé uniquement comme `createdBy` dans le `SyncOp` pour le tracking. Il vient de la page SSR (session.user.id, ligne 17 de `parametres/page.tsx`).

---

### CRITIQUE — Comportement disabled si companyId null

Si `canEdit && !companyId` (admin sans société bootstrappée), afficher les champs désactivés avec le message :
```
"Enregistrez d'abord les informations société"
```
Même pattern que `LogoUpload` (AC1 de Story 2-4).

---

### CRITIQUE — CompanyForm préserve déjà signataireNom/signataireFonction

`src/components/settings/company-form.tsx` (lignes 162–163) :
```typescript
signataireNom: company.signataireNom ?? null,
signataireFonction: company.signataireFonction ?? null,
```
Ces valeurs sont déjà incluses dans le payload de `CompanyForm` lors d'un `applyLocalMutation`. **Ne pas modifier `company-form.tsx`** — la cohabitation est déjà gérée.

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Payload partiel (uniquement signataireNom/signataireFonction) | Payload complet avec tous les champs company |
| `db.company.put({ ...company, signataireNom: undefined })` | `delete putObj.signataireNom` puis `db.company.put(putObj)` |
| Appel API direct au lieu d'`applyLocalMutation` | `applyLocalMutation` → sync engine (offline-capable) |
| Modifier `src/lib/schema.ts` ou `src/lib/local-db.ts` | Colonnes déjà présentes depuis Story 1.3 |
| Créer une migration Drizzle | Aucune migration nécessaire |
| Oublier `triggerSync()` après mutation | Appeler `void triggerSync()` après `applyLocalMutation` |
| `signataireNom: ""` (chaîne vide) dans le payload | `signataireNom: signataireNom.trim() \|\| null` (null si vide) |
| Modifier `company-form.tsx` pour ajouter les champs signataire | Composant `SignatoryConfig` indépendant |
| Utiliser `useEffect` pour sync state ↔ liveCompany | Laisser le state local ; rekey si nécessaire |

---

### Skeleton du composant SignatoryConfig

```typescript
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveCompany } from "@/hooks/use-live-company";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

interface SignatoryConfigProps {
  companyId: string | null;
  canEdit: boolean;
  userId: string;
  initialCompany: CompanyLocal | null;
}

export function SignatoryConfig({ companyId, canEdit, userId, initialCompany }: SignatoryConfigProps) {
  const liveCompany = useLiveCompany();
  const effectiveCompany = liveCompany ?? initialCompany;

  const [signataireNom, setSignataireNom] = useState(effectiveCompany?.signataireNom ?? "");
  const [signataireFonction, setSignataireFonction] = useState(effectiveCompany?.signataireFonction ?? "");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveCompany || !companyId) return;

    setError(null);
    setIsPending(true);

    try {
      const payload: Record<string, unknown> = {
        // ... tous les champs effectiveCompany + nouvelles valeurs signataire
        // (voir Dev Notes — payload complet obligatoire)
      };

      await applyLocalMutation(
        "company",
        effectiveCompany.id,
        "update",
        payload,
        effectiveCompany.revision,
        async () => {
          // dexieWriteFn avec exactOptionalPropertyTypes (voir Dev Notes)
        },
        userId,
      );

      void triggerSync();
      toast.success("Signataire enregistré");
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsPending(false);
    }
  }

  // Read-only view (non-admin)
  if (!canEdit) {
    // Afficher signataireNom + signataireFonction en lecture seule
  }

  // Disabled (admin sans société)
  if (!companyId) {
    // Champs désactivés + message
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Nom du signataire */}
      {/* Fonction du signataire */}
      {/* Bouton Enregistrer */}
      {/* Erreur globale */}
    </form>
  );
}
```

---

### Fichiers à modifier/créer — récapitulatif

| Fichier | Action | Description |
|---|---|---|
| `src/components/settings/signatory-config.tsx` | CRÉER | Composant Client : 2 champs texte, applyLocalMutation, offline-capable |
| `src/app/(app)/parametres/page.tsx` | UPDATE | Import + `<SignatoryConfig companyId={} canEdit={} userId={} initialCompany={} />` |

---

### Héritage des stories précédentes

**Story 2-4 (LogoUpload) :**
- Pattern `liveCompany ?? initialCompany` pour le seed SSR → copier directement
- Pattern props `companyId: string | null`, `canEdit: boolean`, `initialCompany: CompanyLocal | null` → même structure (ajouter `userId`)
- Pattern message désactivé "Enregistrez d'abord les informations société"

**Story 2-3 (CompanyForm) :**
- Pattern `applyLocalMutation` pour company update (lignes 175–203)
- Pattern payload complet avec tous les champs company
- Pattern exactOptionalPropertyTypes Dexie put (delete clé vs spread conditionnel)
- `company-form.tsx` préserve déjà `signataireNom`/`signataireFonction` → pas de modification

**Story 2-1 (Sync Engine) :**
- `applyLocalMutation` + `triggerSync` — pattern standard pour toutes mutations offline
- `sync/push` : case "company" supporte déjà `signataireNom`/`signataireFonction` (lignes 324–325)

---

### Commandes pour le dev agent

```bash
# 1. Docker running
docker compose up -d

# 2. Aucune migration — colonnes présentes depuis Story 1.3
# pnpm db:generate  ← NE PAS LANCER
# pnpm db:migrate   ← NE PAS LANCER

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ 201+ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 2.5] — FR-7 : Configuration signataire par défaut
- [Architecture §Data Architecture] — Entity company : champs signataireNom/signataireFonction
- [Architecture §Communication Patterns] — applyLocalMutation pattern (une seule fonction pour Dexie write + outbox enqueue)
- [Schema §company] — `src/lib/schema.ts` lignes 138–139
- [CompanyLocal] — `src/lib/local-db.ts` lignes 109–110
- [companySchema] — `src/lib/validation/company.ts` lignes 22–23
- [sync/push] — `src/app/api/v1/sync/push/route.ts` case "company" lignes 309–338 (upsert complet)
- [Story 2-3 §Dev Notes] — Pattern applyLocalMutation company update + exactOptionalPropertyTypes
- [Story 2-4 §Dev Notes] — Pattern useLiveCompany + initialCompany fallback + disabled state
- [CompanyForm ligne 162–163] — Préservation signataireNom/signataireFonction dans CompanyForm

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Composant `SignatoryConfig` créé avec pattern outer-wrapper + inner re-key identique à `CompanyForm`.
- Outer wrapper : subscribe `useLiveCompany()`, re-key inner sur `id:revision` — empêche l'état stale d'écraser des valeurs plus récentes après un pull sync.
- Inner form : pur, contrôlé par props au mount. Utilise `initialCompany` (valeur courante au mount) pour le payload et le Dexie put.
- Payload complet obligatoire respecté — tous les champs `initialCompany` préservés, signataireNom/signataireFonction mis à jour.
- `exactOptionalPropertyTypes` géré via `delete putObj.signataireNom` / `delete putObj.signataireFonction` quand valeur nulle.
- 3 états UI : lecture seule (non-admin), désactivé (admin sans companyId), formulaire éditable.
- Message "Enregistrez d'abord les informations société" identique à LogoUpload.
- `triggerSync()` appelé après chaque mutation réussie.
- **[Blocker résolu]** `POST /api/v1/sync/push` : deux niveaux de garde — fast-fail `can()` dans la boucle for (bloque `false` perms sans DB call), puis `requirePermission` avec `entityOwnerId` réel dans `applyOp` après `fetchCurrentEntity` (enforce "own" perm par user réel).
- **[Follow-up résolu]** `resolveEntityOwner` : retourne le vrai ownerId de l'entité ; pour `quoteLine`, remonte au parent quote via SELECT. Commercial ne peut plus mettre à jour les entités d'un autre utilisateur du même tenant.
- **[Test gap résolu]** 3 tests ajoutés dans `sync/push/route.test.ts` : commercial company op → 403, operateur company op → 403, commercial cross-user client.update → 403.
- Aucune migration Drizzle — colonnes déjà présentes depuis Story 1.3.
- `pnpm check` : 0 erreurs, 204 tests ✓ (+3). Next.js build ✓.

### File List

- `src/components/settings/signatory-config.tsx` (CRÉÉ, refactorisé suite review)
- `src/app/(app)/parametres/page.tsx` (MODIFIÉ — import + section SignatoryConfig)
- `src/app/api/v1/sync/push/route.ts` (MODIFIÉ — resolveEntityAction, resolveEntityOwner, fast-fail can(), "own" perm dans applyOp)
- `src/app/api/v1/sync/push/route.test.ts` (MODIFIÉ — 3 tests régressifs ajoutés)

### Change Log

- 2026-06-24 : Implémentation story 2.5 — composant SignatoryConfig + intégration page /parametres
- 2026-06-24 : Résolution review findings — re-key outer/inner (Major) + guard company.update sur sync/push (Blocker)
- 2026-06-24 : Résolution follow-up — resolveEntityOwner pour "own" perm réel + 3 tests régressifs (204 tests total)
### Re-Review Findings

- [x] [Review][Blocker resolved] `sync/push` now maps `company` ops to `company.update` before `applyOp`, so Commercial/Operateur forged company ops are blocked by permission policy. [src/app/api/v1/sync/push/route.ts]
- [x] [Review][Major resolved] `SignatoryConfig` now uses an outer liveQuery wrapper and re-keys the inner form on `id:revision`, matching the `CompanyForm` stale-state pattern. [src/components/settings/signatory-config.tsx]
- [ ] [Review][Major follow-up] The new per-entity auth helper still passes `userId` as both `ownerId` and `currentUserId` for every op, so actions with an `own` permission (`client.update`, `client.delete`, `quote.update`, etc.) are always authorized at this layer. `assertOwnership` checks tenant companyId, not row ownerId. Fix by checking the fetched entity owner (or parent quote owner for quoteLine) before calling `requirePermission`, and add route tests for cross-owner same-tenant client/quote updates. [src/app/api/v1/sync/push/route.ts]
- [ ] [Review][Minor test gap] Add a direct regression test for forged `company` sync ops from Commercial/Operateur returning 403. Current sync push tests cover no companyId and cross-company ownership, but not the new `company.update` permission gate. [src/app/api/v1/sync/push/route.test.ts]

### Re-Review Verification

- 2026-06-24 : `pnpm check` passed (lint 0 errors / 5 warnings, typecheck OK, 201 tests OK).
- 2026-06-24 : `pnpm build:ci` passed (`next build --webpack` OK).
### Final Re-Review

- [x] [Review][Major follow-up resolved] `sync/push` now fast-fails roles with false entity permissions before DB access, resolves the real entity owner for `own` permissions, and checks `requirePermission(userRole, action, entityOwnerId, userId)` after fetching the current entity. Cross-owner same-tenant `client.update` is covered by test. [src/app/api/v1/sync/push/route.ts]
- [x] [Review][Minor test gap resolved] Added direct regression tests for Commercial and Operateur forged `company` sync ops returning 403 with zero DB calls. [src/app/api/v1/sync/push/route.test.ts]

### Final Verification

- 2026-06-24 : `pnpm test -- src/app/api/v1/sync/push/route.test.ts` passed (12 tests).
- 2026-06-24 : `pnpm check` passed (lint 0 errors / 5 warnings, typecheck OK, 204 tests OK).
- 2026-06-24 : `pnpm build:ci` passed (`next build --webpack` OK).

**Review decision:** Approved for Story 2.5.

