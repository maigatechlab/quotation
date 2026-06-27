---
story_key: 4-5-record-client-agreement
epic_num: 4
story_num: 5
status: ready-for-dev
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 4.5 : Enregistrement de l'accord client (FR-30)

**Statut :** ready-for-dev

## Story

**En tant que** commercial,
**Je veux** enregistrer l'accord du client après réception de sa signature,
**Afin que** le devis passe au statut "Accepté" et alimente les métriques.

---

## Critères d'acceptation (BDD)

**AC1 — Formulaire d'enregistrement de l'accord (FR-30)**

```
GIVEN  un devis au statut "Envoyé" (sent) sur la page /devis/[id]
WHEN   le commercial ouvre le bottom sheet d'enregistrement d'accord
THEN   le formulaire contient les champs suivants, tous modifiables :
       — Nom et prénom du client (pré-rempli depuis clientSnapshot.contactName si disponible)
       — Fonction du client (champ vide, saisie libre)
       — Date d'accord (date picker, ≤ aujourd'hui + 7 jours, par défaut : aujourd'hui)
       — Upload scan de signature (fichier optionnel : image JPG/PNG, ≤ 5MB)
AND    les champs nom et date sont obligatoires pour soumettre
AND    un bouton "Enregistrer l'accord" est disponible
```

**AC2 — Contrainte : transition Envoyé → Accepté uniquement (FR-15)**

```
GIVEN  un devis à n'importe quel statut
WHEN   le commercial tente d'enregistrer l'accord
THEN   le formulaire est accessible UNIQUEMENT si le devis est au statut "Envoyé" (sent)
AND    si le statut est différent de "sent" → le bouton/menu d'accord est absent ou désactivé
AND    Brouillon → Accepté est impossible (contournerait la validation complète de Story 3.9)
AND    Validé → Accepté est impossible (doit passer par Envoyé en premier)
```

**AC3 — Date d'accord contrainte (FR-30)**

```
GIVEN  le formulaire d'accord
WHEN   le commercial saisit la date d'accord
THEN   la date doit être ≤ aujourd'hui + 7 jours (tolérance pour décalages de réception)
AND    une date dans le futur > aujourd'hui + 7j est refusée avec message d'erreur
AND    la date est au format ISO 8601 en stockage, affichée en français (dd/mm/yyyy ou long)
```

**AC4 — Upload scan de signature (FR-30)**

```
GIVEN  le formulaire d'accord
WHEN   le commercial sélectionne un fichier scan
THEN   le fichier est uploadé vers @vercel/blob via POST /api/v1/quotes/{id}/agreement-scan
AND    les formats acceptés : JPG, PNG uniquement
AND    la taille maximale : 5MB
AND    en cas de succès → scanUrl est stocké dans QuoteLocal et synchronisé
AND    en cas d'erreur upload → message d'erreur français, accord enregistrable sans scan
AND    l'upload scan est optionnel — l'accord peut être enregistré sans fichier
```

**AC5 — Transition Envoyé → Accepté avec log (FR-30 + FR-15)**

```
GIVEN  le formulaire d'accord valide (nom + date obligatoires, scan optionnel)
WHEN   le commercial confirme "Enregistrer l'accord"
THEN   QuoteLocal est mis à jour :
       — status: "accepted"
       — clientAccordNom: <nom saisi>
       — clientAccordFonction: <fonction saisie>
       — clientAccordDate: <date ISO>
       — clientAccordScanUrl: <scanUrl si uploadé>
       — updatedAt: maintenant
AND    la mise à jour est via applyLocalMutation("quote", ...) + triggerSync()
AND    un QuoteStatusLogLocal est ajouté : { fromStatus: "sent", toStatus: "accepted" }
AND    toast "Accord enregistré — Devis Accepté" s'affiche
AND    le bottom sheet se ferme
AND    la page /devis/[id] recharge via liveQuery → badge "Accepté" visible
```

**AC6 — Point d'entrée : bottom sheet sur la page d'aperçu**

```
GIVEN  la page /devis/[id] avec un devis au statut "Envoyé"
WHEN   le commercial consulte la barre d'action
THEN   un bouton "Enregistrer l'accord" est visible (en plus de Générer PDF / Partager)
AND    un tap sur ce bouton ouvre le bottom sheet d'enregistrement
AND    si le devis n'est PAS au statut "Envoyé" → le bouton est absent ou désactivé
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
- `src/lib/schema.ts` — UPDATE : ajouter colonnes accord client sur table `quote`
  (`client_accord_nom`, `client_accord_fonction`, `client_accord_date`, `client_accord_scan_url`)
- `pnpm db:generate` + `pnpm db:migrate` — OBLIGATOIRE après schema change
- `src/lib/local-db.ts` — UPDATE : ajouter champs optionnels dans `QuoteLocal`
  + version Dexie bump + ajouter `quoteStatusLogs` table si Story 3.9 non encore déployée
- `src/app/api/v1/quotes/[id]/agreement-scan/route.ts` — CRÉER : endpoint POST upload scan
- `src/components/quote/client-agreement-sheet.tsx` — CRÉER : bottom sheet accord client
- `src/components/pdf/quote-preview.tsx` — UPDATE : ajouter bouton "Enregistrer l'accord"
  et intégrer le bottom sheet (visible uniquement si statut = "sent")
- `src/messages/fr-NE.json` — UPDATE : ajouter keys `devis.accord.*`

**EXCLU :**
- `src/lib/sync/outbox.ts` — NON modifié (applyLocalMutation("quote", ...) gère déjà
  les updates de devis ; les nouveaux champs sont dans le payload de l'update)
- `src/app/api/v1/sync/push/route.ts` — NON modifié (case "quote" gère déjà le status
  et les nouveaux champs seront synced normalement)
- `src/components/pdf/pdf-template.tsx` — NON modifié (zone signature déjà Story 4.3)
- Stories PDF précédentes — aucune régression

**Note schema :** Les 4 nouveaux champs dans `quote` sont optionnels (nullable).
Aucune migration destructive. La migration sera `ALTER TABLE quote ADD COLUMN ...`.

**Note Story 3.9 :** Si Story 3.9 n'est pas encore déployée, Story 4.5 doit également :
- Ajouter `QuoteStatusLogLocal` + table Dexie `quoteStatusLogs` dans `local-db.ts`
- Vérifier la version Dexie actuelle et bumper au niveau correct

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `src/lib/schema.ts` : colonnes accord client

- [ ] Localiser la table `quote` dans `schema.ts` (lignes ~181-226)
- [ ] Ajouter après `totalFcfa` et avant `companyId` :
  ```typescript
  // Accord client (FR-30) — rempli lors de la transition Envoyé → Accepté
  clientAccordNom: text("client_accord_nom"),
  clientAccordFonction: text("client_accord_fonction"),
  clientAccordDate: timestamp("client_accord_date"),
  clientAccordScanUrl: text("client_accord_scan_url"),
  ```
- [ ] `pnpm typecheck` — zéro erreur sur schema.ts

### T2 — Générer et appliquer la migration DB

- [ ] `pnpm db:generate` — génère un fichier dans `drizzle/` (ex: `0008_...sql`)
- [ ] Vérifier le contenu de la migration générée :
  ```sql
  ALTER TABLE "quote" ADD COLUMN "client_accord_nom" text;
  ALTER TABLE "quote" ADD COLUMN "client_accord_fonction" text;
  ALTER TABLE "quote" ADD COLUMN "client_accord_date" timestamp;
  ALTER TABLE "quote" ADD COLUMN "client_accord_scan_url" text;
  ```
- [ ] `pnpm db:migrate` — applique la migration
- [ ] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/lib/local-db.ts` : QuoteLocal + Dexie version

- [ ] Lire le fichier entier (version Dexie actuelle, interfaces existantes)
- [ ] Ajouter dans `QuoteLocal` :
  ```typescript
  // Accord client (FR-30)
  clientAccordNom?: string;
  clientAccordFonction?: string;
  clientAccordDate?: string;  // ISO 8601
  clientAccordScanUrl?: string;
  ```
- [ ] Vérifier la version Dexie actuelle (dernier `this.version(N)`)
- [ ] Ajouter la prochaine version avec le store `quoteStatusLogs` (si Story 3.9 non déployée) :
  ```typescript
  // Si la version actuelle est 2 (stories 4.x déployées sans Story 3.9) :
  // Ajouter version 3 avec quoteStatusLogs + pas de migration pour quotes
  // (Dexie ne nécessite pas de migration pour l'ajout de champs optionnels
  //  dans IndexedDB — les nouveaux champs sont simplement absent sur les entrées existantes)
  this.version(3).stores({
    quoteStatusLogs: "id, quoteId, changedAt",
  });
  // ET si quoteStatusLogs table + interface pas encore présentes — les ajouter depuis Story 3.9

  // Si Story 3.9 déjà déployée (version 3 ou 4 existe) :
  // Aucune modification Dexie nécessaire pour les champs QuoteLocal
  // (IndexedDB ne nécessite pas de migration pour nouveaux champs dans les records existants)
  ```
- [ ] Ajouter l'interface `QuoteStatusLogLocal` si absente (voir Story 3.9 pour le patron)
- [ ] Ajouter `quoteStatusLogs!: EntityTable<QuoteStatusLogLocal, "id">` si absent
- [ ] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/app/api/v1/quotes/[id]/agreement-scan/route.ts`

Endpoint pour uploader le scan de signature vers @vercel/blob.

```typescript
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, type Role } from "@/lib/permissions";
import { quote as quoteTable } from "@/lib/schema";
import { upload } from "@/lib/storage";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  if (!can(userRole, "quote.update")) {
    return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
  }

  const { id: quoteId } = await params;

  // Vérifier que le devis existe et appartient à l'utilisateur (si commercial)
  const dbQuote = await db.query.quote.findFirst({
    where: eq(quoteTable.id, quoteId),
  });
  if (!dbQuote) {
    return apiError("NOT_FOUND", "Devis introuvable.", HTTP_STATUS.NOT_FOUND);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const fileField = formData.get("scan");
  if (!fileField || !(fileField instanceof File)) {
    return apiError(
      "VALIDATION_FAILED",
      "Fichier scan requis.",
      HTTP_STATUS.BAD_REQUEST,
      { scan: "Fichier scan requis." }
    );
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png"];
  if (!ALLOWED_TYPES.includes(fileField.type)) {
    return apiError(
      "VALIDATION_FAILED",
      "Format non supporté. PNG ou JPG uniquement.",
      HTTP_STATUS.BAD_REQUEST,
      { scan: "Format non supporté. PNG ou JPG uniquement." }
    );
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (fileField.size > MAX_SIZE) {
    return apiError(
      "VALIDATION_FAILED",
      "Fichier trop volumineux (max 5 Mo).",
      HTTP_STATUS.BAD_REQUEST,
      { scan: "Fichier trop volumineux (max 5 Mo)." }
    );
  }

  const ext = fileField.type === "image/png" ? "png" : "jpg";
  const filename = `accord-scan-${quoteId}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await fileField.arrayBuffer());

  const result = await upload(buffer, filename, "signatures", {
    maxSize: MAX_SIZE,
    allowedTypes: ALLOWED_TYPES,
  });

  return NextResponse.json({ scanUrl: result.url }, { status: HTTP_STATUS.OK });
}
```

- [ ] Créer le dossier `src/app/api/v1/quotes/[id]/agreement-scan/`
- [ ] Créer le fichier `route.ts` avec le contenu ci-dessus
- [ ] `pnpm typecheck` — zéro erreur

### T5 — Créer `src/components/quote/client-agreement-sheet.tsx`

```typescript
"use client";

import { useState } from "react";
import { db } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import type { QuoteLocal } from "@/lib/local-db";

interface ClientAgreementSheetProps {
  quoteId: string;
  quote: QuoteLocal;
  userId: string;
  onClose: () => void;
  isOpen: boolean;
}
```

**Logique du composant :**

- [ ] `"use client"` première ligne
- [ ] États locaux :
  ```typescript
  const [clientNom, setClientNom] = useState(
    (quote.clientSnapshot as Record<string, unknown> | null)?.contactName as string ?? ""
  );
  const [clientFonction, setClientFonction] = useState("");
  const [clientDate, setClientDate] = useState(new Date().toISOString().slice(0, 10));
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  ```
- [ ] Validation date (≤ aujourd'hui + 7j) :
  ```typescript
  function validateDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 7);
    return !isNaN(date.getTime()) && date <= maxDate;
  }
  ```
- [ ] Fonction `handleSubmit` :
  ```typescript
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientNom.trim()) { setError(t("accord.errorNomRequired")); return; }
    if (!validateDate(clientDate)) { setError(t("accord.errorDateFuture")); return; }
    setIsPending(true);
    setError(null);

    let scanUrl: string | undefined;

    // Upload scan si présent
    if (scanFile) {
      try {
        const formData = new FormData();
        formData.append("scan", scanFile);
        const res = await fetch(`/api/v1/quotes/${quoteId}/agreement-scan`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json() as { scanUrl: string };
          scanUrl = data.scanUrl;
        } else {
          setScanError(t("accord.errorScanUpload"));
          // Accord enregistrable sans scan — continuer
        }
      } catch {
        setScanError(t("accord.errorScanUpload"));
        // Accord enregistrable sans scan — continuer
      }
    }

    // Mise à jour locale via applyLocalMutation
    try {
      const dbQuote = await db.quotes.get(quoteId);
      if (!dbQuote) throw new Error("Quote not found");
      const now = new Date().toISOString();
      const updatedQuote: QuoteLocal = {
        ...dbQuote,
        status: "accepted",
        clientAccordNom: clientNom.trim(),
        clientAccordFonction: clientFonction.trim() || undefined,
        clientAccordDate: new Date(clientDate).toISOString(),
        clientAccordScanUrl: scanUrl,
        updatedAt: now,
      };
      await applyLocalMutation(
        "quote", quoteId, "update",
        updatedQuote,
        dbQuote.revision,
        async () => { await db.quotes.put(updatedQuote); },
        userId
      );

      // Log de transition (append-only, direct Dexie)
      await db.quoteStatusLogs?.put({
        id: crypto.randomUUID(),
        quoteId,
        fromStatus: "sent",
        toStatus: "accepted",
        changedBy: userId,
        changedAt: now,
      });

      void triggerSync();
      // Toast + fermeture
      // (toast implémenté par le composant parent ou via un hook toast)
      onClose();
    } catch {
      setError(t("accord.errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }
  ```
- [ ] Interface du sheet (bottom sheet, UX-DR12) :
  - Overlay backdrop avec `onClick={onClose}`
  - Panel slide-up avec `rounded-t-[22px]` (`{rounded.sheet-top}`)
  - Focus trap (Escape key + Tab cycle)
  - Formulaire avec les champs + bouton submit
  - Bouton "Annuler" → `onClose()`
- [ ] `pnpm typecheck` — zéro erreur

### T6 — Mettre à jour `src/components/pdf/quote-preview.tsx`

- [ ] Lire le fichier actuel (état Story 4.4)
- [ ] Ajouter état local :
  ```typescript
  const [isAgreementSheetOpen, setIsAgreementSheetOpen] = useState(false);
  ```
- [ ] Importer `ClientAgreementSheet` :
  ```typescript
  import { ClientAgreementSheet } from "@/components/quote/client-agreement-sheet";
  ```
- [ ] Dans la barre d'action : ajouter bouton "Enregistrer l'accord" visible
  UNIQUEMENT si `quote.status === "sent"` :
  ```tsx
  {quote.status === "sent" && (
    <button
      type="button"
      onClick={() => setIsAgreementSheetOpen(true)}
      className="h-11 flex-1 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
    >
      {t("accord.openSheet")}
    </button>
  )}
  ```
- [ ] Rendre le composant `ClientAgreementSheet` avec les props nécessaires :
  ```tsx
  {quote && (
    <ClientAgreementSheet
      quoteId={quote.id}
      quote={quote}
      userId={userId}
      isOpen={isAgreementSheetOpen}
      onClose={() => setIsAgreementSheetOpen(false)}
    />
  )}
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T7 — Mettre à jour `src/messages/fr-NE.json`

- [ ] Ajouter sous `devis.accord` :
  ```json
  "accord": {
    "openSheet": "Enregistrer l'accord",
    "sheetTitle": "Enregistrement de l'accord client",
    "nomLabel": "Nom et prénom du client",
    "nomPlaceholder": "Ex. Amadou Maiga",
    "fonctionLabel": "Fonction",
    "fonctionPlaceholder": "Ex. Directeur général",
    "dateLabel": "Date d'accord",
    "scanLabel": "Scan de signature (optionnel)",
    "scanHint": "JPG ou PNG, max 5 Mo",
    "scanButton": "Choisir un fichier",
    "submitButton": "Enregistrer l'accord",
    "cancelButton": "Annuler",
    "successToast": "Accord enregistré — Devis Accepté",
    "errorNomRequired": "Le nom du client est requis.",
    "errorDateFuture": "La date d'accord ne peut pas dépasser aujourd'hui + 7 jours.",
    "errorScanUpload": "Erreur lors de l'envoi du scan. L'accord sera enregistré sans scan.",
    "errorGeneric": "Erreur lors de l'enregistrement. Veuillez réessayer.",
    "statusNotSent": "L'accord ne peut être enregistré que pour un devis au statut \"Envoyé\"."
  }
  ```
- [ ] `pnpm typecheck` — zéro erreur

### T8 — Vérification finale (AC7)

- [ ] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓
- [ ] `pnpm build` : passe sans erreur
- [ ] Devis "Brouillon" → bouton "Enregistrer l'accord" absent ✓
- [ ] Devis "Validé" → bouton absent ✓
- [ ] Devis "Envoyé" → bouton "Enregistrer l'accord" visible ✓
- [ ] Tap bouton → bottom sheet s'ouvre avec nom pré-rempli (si contactName disponible) ✓
- [ ] Date par défaut = aujourd'hui ✓
- [ ] Date > aujourd'hui + 7j → message d'erreur ✓
- [ ] Nom vide → message d'erreur ✓
- [ ] Submit sans scan → accord enregistré, statut → Accepté ✓
- [ ] Submit avec scan → upload POST, scanUrl stocké ✓
- [ ] Erreur upload scan → message non-bloquant, accord enregistré sans scan ✓
- [ ] Après submit → badge "Accepté" visible via liveQuery ✓
- [ ] Toast "Accord enregistré — Devis Accepté" affiché ✓
- [ ] Devis "Accepté" → bouton "Enregistrer l'accord" disparu ✓

---

## Dev Notes

### CRITIQUE — Workflow database OBLIGATOIRE après schema change

```bash
# ORDRE STRICT — ne pas intervertir
pnpm db:generate   # 1. génère drizzle/000X_...sql
pnpm db:migrate    # 2. applique la migration
# JAMAIS pnpm db:push en production
```

La migration ajoutera 4 colonnes nullable à la table `quote`. C'est non-destructif.

### CRITIQUE — Champs optionnels Dexie : pas de migration IndexedDB nécessaire

IndexedDB (Dexie) ne requiert pas de migration pour l'ajout de champs optionnels
dans les objets stockés. Les entrées existantes dans `db.quotes` n'ont simplement
pas ces champs — TypeScript les voit comme `undefined` (conforme à `?: string`).

```typescript
// CORRECT — pas de version Dexie bump nécessaire pour les nouveaux champs QuoteLocal
// (sauf si on ajoute une nouvelle TABLE comme quoteStatusLogs)
```

Si Story 3.9 n'est pas encore déployée : bump Dexie pour ajouter `quoteStatusLogs`.
Si Story 3.9 est déjà déployée : aucun bump Dexie nécessaire.

**Vérifier la version actuelle dans `local-db.ts` avant d'écrire le code.**

### CRITIQUE — Transition Envoyé → Accepté UNIQUEMENT

```typescript
// CORRECT — guard strict dans handleSubmit
if (dbQuote.status !== "sent") {
  setError(t("accord.statusNotSent"));
  return;
}

// INTERDIT — permettre d'autres transitions vers Accepté
```

La vérification est côté client (UX guard) ET côté serveur (sync endpoint vérifie
le statut avant d'accepter un update avec status="accepted").

### CRITIQUE — applyLocalMutation pattern pour update devis

Même pattern que Story 3.9 (status change) :

```typescript
const dbQuote = await db.quotes.get(quoteId);
if (!dbQuote) return;
const now = new Date().toISOString();

await applyLocalMutation(
  "quote", quoteId, "update",
  { ...dbQuote, status: "accepted", clientAccordNom: "...", updatedAt: now },
  dbQuote.revision,
  async () => {
    await db.quotes.put({ ...dbQuote, status: "accepted", clientAccordNom: "...", updatedAt: now });
  },
  userId
);
```

### CRITIQUE — QuoteStatusLogLocal : append-only direct Dexie

Les logs de transition ne passent PAS par `applyLocalMutation` (comme Story 3.9) :

```typescript
// CORRECT — direct Dexie, append-only
await db.quoteStatusLogs.put({
  id: crypto.randomUUID(),
  quoteId,
  fromStatus: "sent",
  toStatus: "accepted",
  changedBy: userId,
  changedAt: now,
});

// Si `db.quoteStatusLogs` n'existe pas encore (Story 3.9 non déployée)
// → l'ajouter dans local-db.ts (voir T3)
```

### CRITIQUE — Upload scan : gestionnaire d'erreurs non-bloquant

L'upload scan vers @vercel/blob peut échouer (pas de réseau, timeout, etc.).
L'accord DOIT être enregistrable sans scan — le scan est optionnel (FR-30).

```typescript
// CORRECT — erreur non-bloquante
try {
  const res = await fetch(`/api/v1/quotes/${quoteId}/agreement-scan`, { ... });
  if (res.ok) scanUrl = (await res.json() as { scanUrl: string }).scanUrl;
  else setScanError(t("accord.errorScanUpload")); // affiché mais non-bloquant
} catch {
  setScanError(t("accord.errorScanUpload")); // même comportement
}
// continue même si scanUrl est undefined
```

### CRITIQUE — Date picker et validation

```typescript
// Validation date (≤ aujourd'hui + 7j)
function validateDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 7);
  maxDate.setHours(23, 59, 59, 999); // fin de journée dans 7j
  return date <= maxDate;
}

// Input date HTML5 (compatible mobile)
<input
  type="date"
  value={clientDate}
  onChange={(e) => setClientDate(e.target.value)}
  max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
  required
  className="h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm"
/>
```

### CRITIQUE — Cast clientSnapshot (type unknown)

```typescript
// Pré-remplissage du nom client depuis snapshot
const snapshot = quote.clientSnapshot as {
  contactName?: string;
  companyName?: string;
} | null;

const [clientNom, setClientNom] = useState(snapshot?.contactName ?? "");
```

### CRITIQUE — noUncheckedIndexedAccess

```typescript
// Aucun accès indexé dans ce composant — pas de risque spécifique
// Mais vérifier si ScanError est manipulé avec des tableaux
```

### CRITIQUE — Endpoint `/api/v1/quotes/[id]/agreement-scan` : sécurité

Le endpoint doit vérifier :
1. Session valide (authenticated)
2. Permission `quote.update` (commercial: "own", admin: true)
3. Le devis existe et est au statut "sent" (optionnel mais recommandé)

**Pattern exact basé sur `src/app/api/v1/companies/logo/route.ts` :**
La structure de l'upload est identique — remplacer "logo" par "scan", "logos" par "signatures",
`companyId` check par `quoteId` lookup, `company.logoUrl` update par `quote.clientAccordScanUrl`.

### CRITIQUE — `can()` vs `requirePermission()`

Utiliser `can()` (retourne boolean) pour les vérifications non-fatales côté composant,
`requirePermission()` (lance PermissionError) pour les guards côté API :

```typescript
// API route — throw + catch PermissionError
import { requirePermission, PermissionError } from "@/lib/permissions";
try { requirePermission(userRole, "quote.update"); }
catch (err) { if (err instanceof PermissionError) return apiError(...); }

// Client Component — boolean check
import { can } from "@/lib/permissions";
if (!can(role, "quote.update")) return null;
```

### CRITIQUE — Dossier API `quotes/[id]` n'existe pas encore

Vérifier si `src/app/api/v1/quotes/` existe. Si non, créer le dossier complet :
```
src/app/api/v1/quotes/
  [id]/
    agreement-scan/
      route.ts     ← à créer
```

### Bottom sheet UX (UX-DR12)

Pattern identique au StatusChangeSheet de Story 3.9 :
- `position: fixed`, `inset-0`, backdrop à 50% opacité
- Panel slide-up avec `rounded-t-[22px]` (`{rounded.sheet-top}`)
- Hauteur : `max-h-[85dvh]`, overflow-y auto
- Focus trap avec Escape key pour fermer
- Focus restauré sur le bouton déclencheur

```tsx
// Structure de base bottom sheet
<div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
  {/* Backdrop */}
  <div
    className="absolute inset-0 bg-black/50"
    onClick={onClose}
    aria-hidden="true"
  />
  {/* Panel */}
  <div className="absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-y-auto rounded-t-[22px] bg-surface p-6 pb-safe">
    {/* Contenu */}
  </div>
</div>
```

### Toast après accord enregistré

Le toast "Accord enregistré — Devis Accepté" peut être implémenté :
- Via un hook toast existant dans le projet (vérifier si `useToast` existe)
- Via un state temporaire `successMessage` affiché 2.2s puis effacé (UX-DR14)
- Via le pattern `router.refresh()` + affichage dans la page parent

Lire les stories précédentes pour identifier le pattern toast établi dans le projet.

### Héritage des stories précédentes

**Story 3.9 (lifecycle/status change) :**
- Pattern `applyLocalMutation` pour update de statut → reproduire exactement
- Pattern `QuoteStatusLogLocal` + `db.quoteStatusLogs.put()` → réutiliser
- Pattern bottom sheet + focus trap → adapter pour le formulaire d'accord

**Story 4.1 (pdf-template) :** La zone "Bon pour accord — Client" (Story 4.3) sur le PDF
est la contrepartie papier. L'accord numérique (Story 4.5) enregistre les données réelles.

**Story 2.4 (logo upload) + `src/app/api/v1/companies/logo/route.ts` :**
Pattern d'upload @vercel/blob à reproduire exactement pour le scan signature.

**Story 4.4 (quote-preview) :** Lire `quote-preview.tsx` avant de modifier
pour ne pas casser les boutons Générer/Partager ajoutés en Story 4.4.

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Schema + migration (OBLIGATOIRE pour cette story)
# Après avoir modifié src/lib/schema.ts :
pnpm db:generate   # génère drizzle/000X_...sql
pnpm db:migrate    # applique la migration

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build
```

---

## Références

- [Epics §Story 4.5] — FR-30 (champs modifiables, upload scan référence, statut → Accepté) + FR-15 (seule transition Envoyé → Accepté)
- [EXPERIENCE.md §FR-30 note] — "recording a client's accord is the Brouillon/Envoyé → Accepté transition above, performed via the status sheet on the quote's PDF preview"
- [Architecture §Storage] — `@vercel/blob` for company logos and signature scans
- [Architecture §M8] — `components/pdf/` signature block, status sheet
- [src/lib/schema.ts] — table `quote` (à modifier), `quoteStatusLog` (déjà présente), `quoteStatusEnum`
- [src/lib/local-db.ts] — `QuoteLocal` (à enrichir), `LocalDatabase` (version Dexie à bumper si besoin)
- [src/lib/sync/outbox.ts] — `applyLocalMutation`, `triggerSync`
- [src/app/api/v1/companies/logo/route.ts] — Pattern upload @vercel/blob (à reproduire)
- [src/lib/storage.ts] — `upload()`, `validateFile()`, `sanitizeFilename()`
- [src/lib/permissions.ts] — `quote.update`, `can()`, `requirePermission()`
- [src/components/pdf/quote-preview.tsx] — à modifier (bouton accord + sheet intégration)
- [src/components/quote/status-change-sheet.tsx] — Pattern bottom sheet (Story 3.9)
- [drizzle/] — fichiers migration existants pour référence style SQL généré
- [Epic 5 §Story 5.3] — devis "Acceptés" alimentent les métriques montants
- [NFR-P9] — Appareils cibles Android bas de gamme (upload scan < 10s attendu)

---

## Dev Agent Record

### Agent Model Used

<!-- À remplir par le dev agent -->

### Debug Log References

<!-- À remplir par le dev agent -->

### Completion Notes List

<!-- À remplir par le dev agent -->

### File List

- `src/lib/schema.ts` (à modifier — colonnes accord client)
- `drizzle/000X_...sql` (généré automatiquement par pnpm db:generate)
- `drizzle/meta/000X_snapshot.json` (généré automatiquement)
- `drizzle/meta/_journal.json` (mis à jour automatiquement)
- `src/lib/local-db.ts` (à modifier — champs QuoteLocal + version Dexie si besoin)
- `src/app/api/v1/quotes/[id]/agreement-scan/route.ts` (à créer)
- `src/components/quote/client-agreement-sheet.tsx` (à créer)
- `src/components/pdf/quote-preview.tsx` (à modifier — bouton accord + sheet)
- `src/messages/fr-NE.json` (à modifier — keys devis.accord)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/4-5-record-client-agreement.md` (ce fichier)

### Change Log

<!-- À remplir par le dev agent -->
