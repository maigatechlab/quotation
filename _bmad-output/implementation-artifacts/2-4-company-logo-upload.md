---
story_key: 2-4-company-logo-upload
epic_num: 2
story_num: 4
status: done
baseline_commit: 95c49335d0c4abaf532babe2b8d49643c32e7782
---

# Story 2.4 : Upload du logo société (FR-6)

**Statut :** done

## Story

**En tant que** administrateur,
**Je veux** uploader le logo de ma société,
**Afin que** il apparaisse en en-tête des PDF de devis.

---

## Critères d'acceptation (BDD)

**AC1 — Contrôle d'accès et disponibilité**

```
GIVEN  un utilisateur authentifié accède à /parametres
WHEN   la page se charge
THEN   la section "Logo société" est visible pour tous les rôles
AND    le bouton d'upload est affiché uniquement si l'utilisateur est Admin ET si companyId est défini
AND    un utilisateur Commercial ou Opérateur voit le logo actuel en lecture seule (ou le placeholder si absent)
AND    un Admin sans companyId (bootstrap non effectué) voit le bouton désactivé avec le message
       "Enregistrez d'abord les informations société"
```

**AC2 — Validation côté client avant envoi**

```
GIVEN  un Admin clique sur "Changer le logo" et sélectionne un fichier
WHEN  le fichier sélectionné n'est pas PNG ou JPG
THEN  une erreur française s'affiche immédiatement : "Format non supporté. PNG ou JPG uniquement."
AND   aucune requête réseau n'est effectuée

GIVEN  un Admin sélectionne un fichier PNG ou JPG
WHEN  le fichier dépasse 2 Mo
THEN  une erreur française s'affiche : "Fichier trop volumineux (max 2 Mo)."
AND   aucune requête réseau n'est effectuée
```

**AC3 — Redimensionnement client-side & upload (FR-6)**

```
GIVEN  un Admin sélectionne un fichier PNG/JPG valide (≤2 Mo)
WHEN  il confirme la sélection
THEN  l'image est redimensionnée client-side via Canvas API à max 300 px de largeur
      (la hauteur est proportionnelle ; si l'image fait déjà ≤300 px de large, aucun redimensionnement)
AND   le Blob redimensionné est envoyé en FormData à POST /api/v1/companies/logo
AND   un indicateur "Chargement…" s'affiche pendant l'upload
AND   le serveur stocke l'image dans @vercel/blob (ou local filesystem en dev)
      via la fonction upload() existante dans src/lib/storage.ts
AND   le serveur met à jour company.logo_url dans PostgreSQL (colonne déjà présente)
AND   le serveur retourne { logoUrl: string }
AND   le client met à jour db.company (Dexie) directement : db.company.put({ ...company, logoUrl })
AND   un toast "Logo mis à jour" s'affiche
AND   la prévisualisation du logo se rafraîchit immédiatement (via useLiveCompany liveQuery)
```

**AC4 — Validation côté serveur**

```
GIVEN  une requête POST /api/v1/companies/logo
WHEN  elle arrive au serveur
THEN  le serveur vérifie l'authentification (401 si absent)
AND   vérifie le rôle Admin (403 si Commercial/Opérateur)
AND   vérifie que session.user.companyId est défini (403 si absent)
AND   vérifie le Content-Type = multipart/form-data avec champ "logo" (400 si absent)
AND   vérifie MIME type = image/jpeg ou image/png (400 VALIDATION_FAILED)
AND   vérifie la taille ≤2 Mo (400 VALIDATION_FAILED)
AND   en cas de succès : 200 { logoUrl: string }
```

**AC5 — Prévisualisation et UX**

```
GIVEN  un logo déjà uploadé (company.logoUrl défini)
WHEN  la page /parametres se charge
THEN  l'image du logo s'affiche dans une zone de prévisualisation (max 100 px de large)
AND   un bouton "Changer le logo" est visible pour l'Admin

GIVEN  aucun logo uploadé
WHEN  la page se charge
THEN  un placeholder ("Aucun logo") s'affiche à la place
```

**AC6 — Qualité**

```
GIVEN  les fichiers modifiés/créés
WHEN  je lance pnpm check
THEN  lint ✓ + typecheck ✓ + tous les tests existants passent sans régression
AND   pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/app/api/v1/companies/logo/route.ts` — CRÉER : POST upload logo
- `src/components/settings/logo-upload.tsx` — CRÉER : composant upload logo
- `src/app/(app)/parametres/page.tsx` — UPDATE : intégrer `<LogoUpload>`

**EXCLU :**
- Suppression de l'ancien logo sur le blob lors du remplacement → MVP-0 accepte les orphelins
- Affichage du logo dans le PDF → Story 4.1
- Configuration signataire → Story 2.5
- Tests Vitest pour le composant client → hors scope MVP-0 (AC6 = pnpm check + build)
- Modification de src/lib/schema.ts → `logo_url` existe déjà dans la table `company`
- Modification de src/lib/local-db.ts → `logoUrl?: string` existe déjà dans `CompanyLocal`
- Modification de src/messages/fr-NE.json → les messages sont inline dans les composants (pattern accepté pour ce composant simple)

---

## Tâches / Sous-tâches

### T1 — Créer la route API logo (AC3, AC4)

- [x] Créer `src/app/api/v1/companies/logo/route.ts`
- [x] Implémenter `POST` :
  - [x] `auth.api.getSession()` → 401 si absent
  - [x] Cast `userRole` → `requirePermission(userRole, "company.update")` → 403 si échec
  - [x] Extraire `companyId` depuis `session.user` → 403 si null/absent
  - [x] `req.formData()` → extraire champ `"logo"` → 400 si absent ou pas un `File`
  - [x] Valider `file.type` ∈ `["image/jpeg", "image/png"]` → 400 VALIDATION_FAILED
  - [x] Valider `file.size ≤ 2 * 1024 * 1024` → 400 VALIDATION_FAILED
  - [x] `Buffer.from(await file.arrayBuffer())` → appel `upload(buffer, filename, "logos")` depuis `@/lib/storage`
  - [x] `db.update(companyTable).set({ logoUrl: result.url }).where(eq(companyTable.id, companyId))`
  - [x] `emitAuditEvent(createAuditEvent({ who: userId, what: "company.logo_updated", ... }))`
  - [x] Retourner `NextResponse.json({ logoUrl: result.url }, { status: 200 })`
- [x] Vérifier `pnpm typecheck` — aucune régression

### T2 — Créer le composant LogoUpload (AC1, AC2, AC3, AC5)

- [x] Créer `src/components/settings/logo-upload.tsx` (Client Component — `"use client"` en première ligne)
- [x] Props : `companyId: string | null`, `canEdit: boolean`
- [x] Utiliser `useLiveCompany()` de `@/hooks/use-live-company` pour l'URL courante (réactif)
- [x] `useRef<HTMLInputElement>(null)` pour le `<input type="file" hidden>`
- [x] `useState` : `error`, `isPending`
- [x] Fonction `resizeImage(file: File, maxWidth: number): Promise<Blob>` (Canvas API, voir Dev Notes)
- [x] Fonction `handleFileChange` :
  - [x] Valider type (PNG/JPG) → setError si invalide
  - [x] Valider taille (≤2 Mo) → setError si invalide
  - [x] Appel `resizeImage(file, 300)` → obtenir Blob redimensionné
  - [x] Construire `FormData` avec `formData.append("logo", resizedBlob, file.name)`
  - [x] `fetch("/api/v1/companies/logo", { method: "POST", body: formData })`
  - [x] Si erreur serveur → setError avec message français
  - [x] Si succès → `db.company.put({ ...company, logoUrl: data.logoUrl })`
  - [x] `toast.success("Logo mis à jour")`
  - [x] Réinitialiser `fileInputRef.current.value = ""` (permet re-upload du même fichier)
- [x] Afficher :
  - [x] Logo actuel si `liveCompany?.logoUrl` (img max-w-24)
  - [x] Placeholder "Aucun logo" sinon
  - [x] Bouton "Changer le logo" / "Chargement…" pour Admin avec companyId
  - [x] Message désactivé "Enregistrez d'abord les informations société" si Admin sans companyId
  - [x] FieldError si `error` défini
- [x] Vérifier `pnpm typecheck`

### T3 — Intégrer dans la page /parametres (AC1, AC5)

- [x] Ouvrir `src/app/(app)/parametres/page.tsx`
- [x] Importer `LogoUpload` depuis `@/components/settings/logo-upload`
- [x] Ajouter `<LogoUpload companyId={companyId} canEdit={canEdit} />` dans le JSX,
      au-dessus ou en dessous du `<CompanyForm>` (recommandé : en dessous, section séparée)
- [x] Vérifier `pnpm typecheck`

### T4 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ 201+ tests ✓ (aucune régression)
- [x] `pnpm build` : passe sans erreur (route `/api/v1/companies/logo` visible comme `ƒ`)

---

## Dev Notes

### CRITIQUE — Colonne et type déjà en place, aucune migration

La colonne `logo_url` existe déjà dans la table `company` (schema.ts ligne 138) :
```typescript
logoUrl: text("logo_url"),
```
`CompanyLocal.logoUrl?: string` existe déjà dans `local-db.ts` (ligne 106).

**Ne pas modifier `src/lib/schema.ts` ni `src/lib/local-db.ts`. Aucune migration Drizzle.**

---

### CRITIQUE — Redimensionnement client-side via Canvas API

`sharp` est en devDependencies uniquement (pas disponible en production sur Vercel). Ne pas l'utiliser dans l'API route.

Algorithme de resize côté client (à coller dans `logo-upload.tsx`) :
```typescript
async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          resolve(blob);
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de charger l'image."));
    };
    img.src = url;
  });
}
```

---

### CRITIQUE — Route API logo : FormData parsing dans Next.js App Router

```typescript
// src/app/api/v1/companies/logo/route.ts
export async function POST(req: Request): Promise<NextResponse> {
  // 1. Auth
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return apiError("UNAUTHORIZED", "Non authentifié.", HTTP_STATUS.UNAUTHORIZED);

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  try {
    requirePermission(userRole, "company.update");
  } catch (err) {
    if (err instanceof PermissionError) return apiError("FORBIDDEN", "Action non autorisée.", HTTP_STATUS.FORBIDDEN);
    throw err;
  }

  const rawCid = (session.user as Record<string, unknown>).companyId;
  const companyId: string | null = typeof rawCid === "string" && rawCid !== "" ? rawCid : null;
  if (!companyId) return apiError("FORBIDDEN", "Aucune société associée à ce compte.", HTTP_STATUS.FORBIDDEN);
  const userId = (session.user as Record<string, unknown>).id as string;

  // 2. Parse FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return apiError("VALIDATION_FAILED", "Corps de requête invalide.", HTTP_STATUS.BAD_REQUEST);
  }

  const fileField = formData.get("logo");
  if (!fileField || !(fileField instanceof File)) {
    return apiError("VALIDATION_FAILED", "Fichier logo requis.", HTTP_STATUS.BAD_REQUEST, { logo: "Fichier logo requis." });
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png"];
  if (!ALLOWED_TYPES.includes(fileField.type)) {
    return apiError("VALIDATION_FAILED", "Format non supporté. PNG ou JPG uniquement.", HTTP_STATUS.BAD_REQUEST, { logo: "Format non supporté. PNG ou JPG uniquement." });
  }

  const MAX_SIZE = 2 * 1024 * 1024;
  if (fileField.size > MAX_SIZE) {
    return apiError("VALIDATION_FAILED", "Fichier trop volumineux (max 2 Mo).", HTTP_STATUS.BAD_REQUEST, { logo: "Fichier trop volumineux (max 2 Mo)." });
  }

  // 3. Upload via storage.ts
  const ext = fileField.type === "image/png" ? "png" : "jpg";
  const filename = `logo-${companyId}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await fileField.arrayBuffer());

  const result = await upload(buffer, filename, "logos", {
    maxSize: MAX_SIZE,
    allowedTypes: ALLOWED_TYPES,
  });

  // 4. Update DB
  await db.update(companyTable)
    .set({ logoUrl: result.url, updatedAt: new Date() })
    .where(eq(companyTable.id, companyId));

  // 5. Audit
  await emitAuditEvent(createAuditEvent({
    who: userId,
    what: "company.logo_updated",
    where: "api/v1/companies/logo",
    entity: { type: "company", id: companyId },
    after: { logoUrl: result.url },
  }));

  return NextResponse.json({ logoUrl: result.url }, { status: HTTP_STATUS.OK });
}
```

**Imports nécessaires :**
```typescript
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { apiError, HTTP_STATUS } from "@/lib/api/envelope";
import { createAuditEvent, emitAuditEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PermissionError, requirePermission, type Role } from "@/lib/permissions";
import { company as companyTable } from "@/lib/schema";
import { upload } from "@/lib/storage";
```

---

### CRITIQUE — Mise à jour Dexie après upload (pas d'outbox)

L'upload logo est une opération **réseau obligatoire** (fichier binaire, ne peut pas être mis en queue offline). Après succès serveur :

```typescript
// Dans le composant — NE PAS utiliser applyLocalMutation pour le logo
const company = await db.company.toCollection().first();
if (company) {
  await db.company.put({ ...company, logoUrl: data.logoUrl });
}
// useLiveCompany() va propager l'update automatiquement via liveQuery
```

**Pourquoi pas applyLocalMutation ?** L'outbox ne peut pas rejouer un upload de fichier (le File/Blob n'est pas sérialisable pour l'outbox). La source de vérité est déjà sur le serveur après l'upload. On met à jour Dexie directement = cohérence immédiate sans sync nécessaire.

---

### CRITIQUE — Pattern upload : récupérer le bon company depuis Dexie

Dans le handleFileChange du composant, le `company` Dexie est accessible depuis `useLiveCompany()`. Cependant, la mise à jour doit se faire après la réponse serveur :

```typescript
// Approche recommandée — lire Dexie au moment de la mise à jour
const current = await db.company.toCollection().first();
if (current) {
  await db.company.put({ ...current, logoUrl: data.logoUrl });
}
```

Ne pas capturer le `company` dans une closure au moment du render (il peut être stale si une autre mutation a eu lieu pendant l'upload).

---

### CRITIQUE — Page /parametres : SSR initialCompany passe déjà logoUrl

La page `parametres/page.tsx` construit déjà `initialCompany` avec `logoUrl` (ligne 50) :
```typescript
...(row.logoUrl != null ? { logoUrl: row.logoUrl } : {}),
```

Donc `CompanyForm` reçoit déjà `company.logoUrl` dans `props.company`. Le `<LogoUpload>` n'a pas besoin de recevoir `currentLogoUrl` en prop car il utilise `useLiveCompany()` directement.

---

### CRITIQUE — Comportement storage.ts : Vercel Blob vs local

`src/lib/storage.ts` gère les deux modes automatiquement :
- **`BLOB_READ_WRITE_TOKEN` défini** → Vercel Blob (production)
- **`BLOB_READ_WRITE_TOKEN` absent** → fichiers locaux dans `public/uploads/` (dev)

En développement sans token, les logos sont servis depuis `/uploads/logos/`. Aucune configuration supplémentaire nécessaire pour le dev local.

---

### CRITIQUE — exactOptionalPropertyTypes : manipulation du Blob

```typescript
// ❌ INTERDIT — undefined dans put()
await db.company.put({ ...company, logoUrl: undefined });

// ✅ CORRECT — ne pas inclure logoUrl si absent
const putObj = { ...company };
if (newLogoUrl) putObj.logoUrl = newLogoUrl;
await db.company.put(putObj);

// ✅ Ou plus simplement (logoUrl est string, jamais undefined après upload réussi)
await db.company.put({ ...company, logoUrl: data.logoUrl });
```

---

### CRITIQUE — CompanyForm préserve déjà logoUrl

Story 2-3 a implémenté la préservation du `logoUrl` dans `company-form.tsx` (ligne 161) :
```typescript
logoUrl: company.logoUrl ?? null,
```
**Ne pas modifier `company-form.tsx`** — le logo uploadé par Story 2.4 sera préservé lors des updates d'infos société.

---

### Héritage des stories précédentes

**Story 2-3 :**
- `useLiveCompany()` hook : `src/hooks/use-live-company.ts` — utiliser directement
- `CompanyLocal.logoUrl?: string` — champ déjà présent dans local-db.ts
- Pattern exactOptionalPropertyTypes pour les puts Dexie
- Pattern auth : cast `session.user as Record<string, unknown>` — copier depuis companies/route.ts

**Story 2-2 (SW) :**
- Les assets blob Vercel (`*.vercel-storage.com`) ne sont pas dans le matcher NetworkFirst du SW
- Le logo sera servi directement depuis le CDN Vercel Blob, pas depuis le cache SW
- Pas de modification de `sw.ts` requise (logos = assets statiques CDN, pas des données sync)

**Story 2-1 (outbox) :**
- `applyLocalMutation` = obligatoire pour toutes les mutations texte/données
- Exception documentée ici : upload de fichier binaire → mise à jour Dexie directe après confirmation serveur

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Utiliser `sharp` dans l'API route | Canvas API client-side pour le resize |
| `sharp` en import côté serveur (devDep uniquement) | `upload()` de storage.ts uniquement côté serveur |
| `applyLocalMutation` pour l'upload logo | Mise à jour Dexie directe après réponse serveur |
| `formData.append("logo", resizedBlob)` sans nom de fichier | `formData.append("logo", resizedBlob, file.name)` (3e arg requis) |
| Afficher le bouton upload si `companyId` est null | Désactiver + message explicatif si pas de companyId |
| Modifier schema.ts ou local-db.ts | Ces fichiers sont déjà complets pour cette story |
| Créer une migration Drizzle | `logo_url` existe déjà dans la table company |
| Stocker le File/Blob dans IndexedDB | Non sérialisable ; upload direct au serveur |
| Capturer `liveCompany` en closure stale pour le put | `db.company.toCollection().first()` au moment du put |
| Ne pas réinitialiser `fileInputRef.current.value` | Reset après upload pour permettre re-sélection du même fichier |

---

### Fichiers à modifier/créer — récapitulatif

| Fichier | Action | Description |
|---|---|---|
| `src/app/api/v1/companies/logo/route.ts` | CRÉER | POST upload + validation + blob + DB update |
| `src/components/settings/logo-upload.tsx` | CRÉER | Composant client : resize Canvas + upload + Dexie update |
| `src/app/(app)/parametres/page.tsx` | UPDATE | Ajouter `<LogoUpload companyId={companyId} canEdit={canEdit} />` |

---

### Commandes pour le dev agent

```bash
# 1. Docker running
docker compose up -d

# 2. Aucune migration — schema complet depuis Story 1.3

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ 201+ tests ✓

# 4. Build
pnpm build   # /api/v1/companies/logo route ƒ visible
```

---

## Références

- [Epics §Story 2.4] — FR-6 : Upload logo société
- [Architecture §Infrastructure] — `@vercel/blob` pour logos/signatures
- [Architecture §Structure Patterns] — `components/settings/` pour composants settings
- [Architecture §Naming] — `logo-upload.tsx` (kebab-case), `LogoUpload` (PascalCase)
- [Story 2-3 §Dev Notes] — Pattern exactOptionalPropertyTypes pour Dexie put
- [Story 2-3 §Dev Notes] — useLiveCompany hook + CompanyForm préservation logoUrl
- [Schema §company] — `src/lib/schema.ts` ligne 138 : `logoUrl: text("logo_url")`
- [CompanyLocal] — `src/lib/local-db.ts` ligne 106 : `logoUrl?: string`
- [storage.ts] — `src/lib/storage.ts` : `upload(buffer, filename, folder, config)`
- [companies/route.ts] — Pattern auth/permission à copier pour la nouvelle route

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- T1 : Route POST `/api/v1/companies/logo` créée avec auth, permission, validation MIME/taille, upload via `storage.ts`, update DB, audit event.
- T2 : Composant `LogoUpload` client créé avec resize Canvas (max 300px), validation client-side, upload fetch, mise à jour Dexie directe, toast, reset input.
- T3 : `<LogoUpload>` intégré dans `/parametres` page en section séparée sous `<CompanyForm>`.
- T4 : Lint ✓, TypeScript ✓, 201 tests ✓, build ✓ (route `ƒ /api/v1/companies/logo` visible).
- Fix annexe : suppression de `cleanupOutdatedCaches: true` dans `sw.ts` (propriété absente de `SerwistOptions` dans la version installée — erreur pré-existante de story 2-2 bloquant le build).

### File List

- `src/app/api/v1/companies/logo/route.ts` — CRÉÉ
- `src/components/settings/logo-upload.tsx` — CRÉÉ
- `src/app/(app)/parametres/page.tsx` — MODIFIÉ (import + intégration `<LogoUpload>`)
- `src/app/sw.ts` — MODIFIÉ (suppression `cleanupOutdatedCaches` non typé)

### Change Log

- 2026-06-24 : Implémentation story 2-4 — upload logo société (AC1–AC6). Création route API, composant client, intégration page /parametres. Fix pré-existant sw.ts.
- 2026-06-24 : Fix review blocker — prop `initialCompany` ajoutée à `LogoUpload` comme fallback preview + fallback put Dexie sur IndexedDB vide.

### Review Findings

- [x] [Review][Blocker] Rafraichissement immediat du logo non garanti si Dexie local est vide. — RÉSOLU : prop `initialCompany` ajoutée à `LogoUpload`; preview utilise `liveCompany ?? initialCompany`; put Dexie utilise `(await db.company.toCollection().first()) ?? initialCompany` comme fallback. Page passe `initialCompany={initialCompany}`. [src/components/settings/logo-upload.tsx] [src/app/(app)/parametres/page.tsx]
