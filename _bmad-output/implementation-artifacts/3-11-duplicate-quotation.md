---
story_key: 3-11-duplicate-quotation
epic_num: 3
story_num: 11
status: ready-for-dev
baseline_commit: ""
---

# Story 3.11 : Duplication d'un devis (FR-14)

**Statut :** ready-for-dev

## Story

**En tant que** commercial,
**Je veux** dupliquer un devis existant,
**Afin que** je crée rapidement une nouvelle version pour un client récurrent sans ressaisir toutes les informations (EXPERIENCE Flow 2).

---

## Critères d'acceptation (BDD)

**AC1 — Déclenchement de la duplication**

```
GIVEN  la page de détail d'un devis /devis/[id]
WHEN   le commercial tape le bouton "Dupliquer ce devis"
THEN   une confirmation est demandée ("Dupliquer ce devis ? Un nouveau devis en Brouillon sera créé.")
AND    le bouton est visible uniquement si can(role, "quote.duplicate")
```

**AC2 — Création du doublon**

```
GIVEN  confirmation de la duplication
WHEN   la duplication est exécutée
THEN   un nouveau devis est créé avec :
         - nouveau numéro TEMP-{DEVICE}-{SEQ} (via numbering.ts)
         - dateDevis = aujourd'hui
         - dateValidite = aujourd'hui + 30 jours
         - statut = "draft" (Brouillon)
         - client copié (clientId + clientSnapshot)
         - trajet copié (originCountry, originCity, destinationCountry, destinationCity)
         - marchandise copiée (goodsNature, tonnage, truckCapacity, unitPrice, sourceCurrency, exchangeRate)
         - truckCount et goodsValueFcfa recalculés via lib/calc/
         - signataire copié (signataireNom, signataireFonction)
         - conditionsPaiement copié
         - reference et objet copiés
         - ownerId = userId (le duplicateur est le propriétaire)
AND    le nouveau devis est créé en < 30 secondes (EXPERIENCE Flow 2)
```

**AC3 — Duplication des lignes de prestation**

```
GIVEN  le devis source a des lignes de prestation
WHEN   la duplication est exécutée
THEN   chaque ligne est copiée dans le nouveau devis avec de nouveaux UUIDs :
         - designation, unitPrice, quantity, ordre copiés
         - totalFcfa recalculé (unitPrice × quantity)
         - pays, companyId omis (server stampe au sync)
AND    les lignes sont persistées via applyLocalMutation("quoteLine", newLineId, "create", ...) pour chacune
```

**AC4 — Persistance et sync**

```
GIVEN  la duplication terminée
WHEN   les mutations sont persistées
THEN   applyLocalMutation("quote", newQuoteId, "create", quotePayload, 0, dexieWriteFn, userId) pour le devis
AND    une mutation applyLocalMutation("quoteLine", ...) par ligne de prestation
AND    void triggerSync() après toutes les mutations
AND    le nouveau devis est immédiatement visible dans la liste /devis (liveQuery)
AND    un toast "Devis dupliqué avec succès" confirme
```

**AC5 — Redirection après duplication**

```
GIVEN  la duplication réussie
WHEN   l'opération se termine
THEN   le commercial est redirigé vers /devis/[newQuoteId] (page détail du nouveau devis)
AND    le nouveau devis est en statut Brouillon, prêt à être modifié
```

**AC6 — Duplication offline**

```
GIVEN  l'utilisateur est hors ligne
WHEN   il duplique un devis
THEN   le doublon est créé localement (Dexie) avec numéro TEMP-
AND    la mutation est mise en queue (outbox)
AND    la synchronisation s'effectue au retour réseau
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
- `src/components/quote/duplicate-quote-button.tsx` — CRÉER : bouton + confirmation + logique de duplication
- `src/app/(app)/devis/[id]/page.tsx` — UPDATE : intégrer DuplicateQuoteButton (créé en Story 3.9)
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `devis.duplicate`

**EXCLU (déjà implémenté — NE PAS MODIFIER) :**
- `src/lib/sync/numbering.ts` — `getNextLocalSeq`, `buildTempNumber` (créés Story 2.1)
- `src/lib/calc/` — moteur de calcul réutilisé (créé Story 1.2)
- `src/lib/local-db.ts` — `QuoteLocal`, `QuoteLineLocal` existent déjà
- `src/app/api/v1/sync/push/route.ts` — case "quote" et case "quoteLine" déjà opérationnels
- Aucune migration DB nécessaire

---

## Tâches / Sous-tâches

### T1 — Créer `src/components/quote/duplicate-quote-button.tsx`

- [ ] `"use client"` première ligne
- [ ] Imports :
  ```ts
  import { useState } from "react";
  import { useRouter } from "next/navigation";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { QuoteLocal, QuoteLineLocal } from "@/lib/local-db";
  import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
  import { buildTempNumber } from "@/lib/sync/numbering";
  import { computeLineTotal, computeQuoteTotal } from "@/lib/calc/quote-calc";
  import { useToast } from "@/hooks/use-toast";
  ```
- [ ] Props :
  ```ts
  interface DuplicateQuoteButtonProps {
    quoteId: string;
    userId: string;
  }
  ```
- [ ] État local : `isPending`, `showConfirm`
- [ ] Fonction `handleDuplicate()` :
  ```ts
  async function handleDuplicate() {
    setIsPending(true);
    try {
      // 1. Lire le devis source
      const source = await db.quotes.get(quoteId);
      if (!source) throw new Error("quote_not_found");

      // 2. Lire les lignes source
      const sourceLines = await db.quoteLines
        .where("quoteId").equals(quoteId).sortBy("ordre");

      // 3. Nouveau numéro TEMP
      const newQuoteId = crypto.randomUUID();
      const now = new Date();
      const newNumber = buildTempNumber();
      const dateDevis = now.toISOString();
      const dateValidite = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // 4. Recalculer truckCount et goodsValueFcfa
      const tonnage = source.tonnage ?? 0;
      const capacity = source.truckCapacity ?? 1;
      const unitPrice = source.unitPrice ?? 0;
      const exchangeRate = source.exchangeRate ?? 1;
      const truckCount = capacity > 0 ? Math.ceil(tonnage / capacity) : 0;
      const goodsValueFcfa = Math.round(tonnage * unitPrice * exchangeRate);

      // 5. Recalculer totalFcfa depuis les lignes copiées
      const newLines = sourceLines.map((l, idx) => ({
        id: crypto.randomUUID(),
        quoteId: newQuoteId,
        designation: l.designation,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        totalFcfa: computeLineTotal(l.unitPrice, l.quantity),
        ordre: idx,
        pays: "NE",
        revision: 0,
        updatedAt: dateDevis,
        createdAt: dateDevis,
      }));
      const totalFcfa = computeQuoteTotal(newLines.map(l => l.totalFcfa));

      // 6. Créer le nouveau devis via applyLocalMutation
      const quotePayload: Omit<QuoteLocal, "id"> = {
        number: newNumber,
        reference: source.reference,
        objet: source.objet,
        status: "draft",
        clientId: source.clientId,
        clientSnapshot: source.clientSnapshot,
        ownerId: userId,
        dateDevis,
        dateValidite,
        signataireNom: source.signataireNom,
        signataireFonction: source.signataireFonction,
        conditionsPaiement: source.conditionsPaiement,
        originCountry: source.originCountry,
        originCity: source.originCity,
        destinationCountry: source.destinationCountry,
        destinationCity: source.destinationCity,
        goodsNature: source.goodsNature,
        tonnage: source.tonnage,
        truckCapacity: source.truckCapacity,
        truckCount,
        unitPrice: source.unitPrice,
        sourceCurrency: source.sourceCurrency,
        exchangeRate: source.exchangeRate,
        goodsValueFcfa,
        totalFcfa,
        pays: "NE",
        revision: 0,
        updatedAt: dateDevis,
        createdAt: dateDevis,
      };

      await applyLocalMutation(
        "quote", newQuoteId, "create",
        quotePayload,
        0,
        async () => { await db.quotes.put({ id: newQuoteId, ...quotePayload }); },
        userId
      );

      // 7. Créer chaque ligne via applyLocalMutation
      for (const line of newLines) {
        await applyLocalMutation(
          "quoteLine", line.id, "create",
          line,
          0,
          async () => { await db.quoteLines.put(line); },
          userId
        );
      }

      void triggerSync();
      toast({ title: t("successToast"), duration: 2200 });
      router.push(`/devis/${newQuoteId}`);
    } catch {
      toast({ title: t("errorGeneric"), variant: "destructive", duration: 3000 });
    } finally {
      setIsPending(false);
      setShowConfirm(false);
    }
  }
  ```
- [ ] Rendu : bouton "Dupliquer" + dialog/modale de confirmation inline
- [ ] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `src/app/(app)/devis/[id]/page.tsx`

- [ ] Importer `DuplicateQuoteButton` :
  ```ts
  import { DuplicateQuoteButton } from "@/components/quote/duplicate-quote-button";
  ```
- [ ] Ajouter dans le header du détail (visible si `can(role, "quote.duplicate")`) :
  ```tsx
  {can(role, "quote.duplicate") && (
    <DuplicateQuoteButton quoteId={id} userId={userId} />
  )}
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter section `devis.duplicate` :
  ```json
  "duplicate": {
    "button": "Dupliquer ce devis",
    "confirmTitle": "Dupliquer ce devis ?",
    "confirmDescription": "Un nouveau devis en Brouillon sera créé avec les mêmes informations.",
    "confirmAction": "Dupliquer",
    "cancel": "Annuler",
    "successToast": "Devis dupliqué avec succès",
    "errorGeneric": "Erreur lors de la duplication. Veuillez réessayer."
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Vérification finale (AC7)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] Bouton "Dupliquer" visible sur /devis/[id] pour admin et commercial ✓
- [ ] Bouton absent si role = operateur ✓
- [ ] Confirmation affichée avant duplication ✓
- [ ] Doublon créé avec nouveau numéro TEMP, status draft, dates mises à jour ✓
- [ ] Lignes de prestation copiées avec nouveaux IDs ✓
- [ ] Total recalculé ✓
- [ ] Redirection vers /devis/[newId] après duplication ✓
- [ ] Nouveau devis visible dans la liste /devis (liveQuery) ✓
- [ ] Fonctionne offline ✓

---

## Dev Notes

### CRITIQUE — buildTempNumber depuis numbering.ts

```typescript
// src/lib/sync/numbering.ts (Story 2.1)
// Importer la fonction existante :
import { buildTempNumber } from "@/lib/sync/numbering";

const newNumber = buildTempNumber();
// → "TEMP-{DEVICE_ID}-{SEQ}"
```

**NE PAS réimplémenter la logique de numérotation.** La primitive est déjà créée en Story 2.1.

### CRITIQUE — computeLineTotal et computeQuoteTotal depuis lib/calc/

```typescript
// src/lib/calc/ (Story 1.2)
import { computeLineTotal, computeQuoteTotal } from "@/lib/calc/quote-calc";
// (adapter le chemin selon l'implémentation réelle)

// computeLineTotal(unitPrice: number, quantity: number): number
// computeQuoteTotal(lineTotals: number[]): number
```

Si les noms de fonctions diffèrent légèrement, vérifier dans `src/lib/calc/` avant d'implémenter.

### CRITIQUE — QuoteLocal : champs optionnels avec exactOptionalPropertyTypes

```typescript
// CORRECT — omettre les champs undefined
const quotePayload: Record<string, unknown> = {
  number: newNumber,
  status: "draft",
  // inclure SEULEMENT les champs non-undefined
  ...(source.reference ? { reference: source.reference } : {}),
  ...(source.objet ? { objet: source.objet } : {}),
  ...(source.clientId ? { clientId: source.clientId } : {}),
  // ...
};

// INCORRECT — passer undefined explicitement
const quotePayload = { ..., reference: undefined, objet: undefined };
```

Alternative : utiliser `Omit<QuoteLocal, "id">` et s'assurer que les champs optionnels absents ne sont pas listés.

### CRITIQUE — séquence des mutations : quote avant quoteLine

L'ordre de mutation est important pour les contraintes FK côté serveur (même si Dexie n'enforce pas les FK). Toujours créer le devis parent avant les lignes :

1. `applyLocalMutation("quote", newQuoteId, "create", ...)` → `db.quotes.put(...)`
2. Pour chaque ligne : `applyLocalMutation("quoteLine", lineId, "create", ...)` → `db.quoteLines.put(...)`
3. `triggerSync()` après toutes les mutations

### CRITIQUE — `for...of` pour les mutations séquentielles

```typescript
// CORRECT — séquentiel (garantit l'ordre)
for (const line of newLines) {
  await applyLocalMutation(...);
}

// INCORRECT — parallèle (risque de désordre dans l'outbox)
await Promise.all(newLines.map(line => applyLocalMutation(...)));
```

### CRITIQUE — page /devis/[id] créée en Story 3.9

Cette story dépend de la page `/devis/[id]` créée en Story 3.9. Si la story 3.9 n'est pas encore déployée, créer un fichier minimal `src/app/(app)/devis/[id]/page.tsx` avec juste le bouton Dupliquer, sans le reste du détail.

### Confirmation inline (pas de dialog shadcn)

Pour MVP-0, implémenter la confirmation comme un état inline du bouton (pas de modal externe) :

```tsx
{!showConfirm ? (
  <button type="button" onClick={() => setShowConfirm(true)} disabled={isPending}
    className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-text-secondary hover:bg-surface-alt">
    {t("button")}
  </button>
) : (
  <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
    <p className="text-sm font-semibold text-text-primary">{t("confirmTitle")}</p>
    <p className="text-xs text-text-muted">{t("confirmDescription")}</p>
    <div className="flex gap-2">
      <button type="button" onClick={() => setShowConfirm(false)} disabled={isPending}
        className="h-9 flex-1 rounded-xl border border-border text-sm text-text-secondary">
        {t("cancel")}
      </button>
      <button type="button" onClick={handleDuplicate} disabled={isPending}
        className="h-9 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark disabled:opacity-60">
        {isPending ? "…" : t("confirmAction")}
      </button>
    </div>
  </div>
)}
```

### Héritage des stories précédentes

- **Story 2.1 (numbering.ts)** — `buildTempNumber()` : consommer la primitive
- **Story 1.2 (calc/)** — `computeLineTotal`, `computeQuoteTotal` : réutiliser
- **Story 3.1 (wizard-step-client.tsx)** — pattern `applyLocalMutation("quote", ...)` pour création
- **Story 3.4 (wizard-step-services.tsx)** — pattern `applyLocalMutation("quoteLine", ...)` pour création lignes
- **Story 3.9 (/devis/[id]/page.tsx)** — page d'accueil du bouton Dupliquer

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

- [Epics §Story 3.11] — FR-14 (duplication, nouveau numéro, dates MAJ, client/trajet/prestations copiés, montants recalculés)
- [src/lib/sync/numbering.ts] — `buildTempNumber()` (créé Story 2.1)
- [src/lib/calc/] — moteur de calcul (créé Story 1.2)
- [src/lib/local-db.ts] — `QuoteLocal`, `QuoteLineLocal`
- [src/lib/permissions.ts] — `quote.duplicate` (admin: true, commercial: true, operateur: false)
- [src/lib/sync/outbox.ts] — `applyLocalMutation`, `triggerSync`
- [src/app/(app)/devis/[id]/page.tsx] — à modifier pour intégrer DuplicateQuoteButton (créé Story 3.9)
- [src/app/api/v1/sync/push/route.ts] — case "quote" + case "quoteLine" déjà opérationnels
- [EXPERIENCE §Flow 2] — Duplication de devis pour client récurrent (< 30 secondes)

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
