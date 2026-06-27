---
story_key: 2-6-create-client
epic_num: 2
story_num: 6
status: done
baseline_commit: 95c49335d0c4abaf532babe2b8d49643c32e7782
---

# Story 2.6 : Création d'une fiche client (FR-8)

**Statut :** done

## Story

**En tant que** commercial (ou administrateur),
**Je veux** créer une fiche client offline via le formulaire `/clients/nouveau`,
**Afin que** je réutilise ses données lors de la création de devis, même hors ligne.

---

## Critères d'acceptation (BDD)

**AC1 — Accès à la page**

```
GIVEN  un utilisateur authentifié avec rôle Admin ou Commercial
WHEN   il accède à /clients/nouveau
THEN   le formulaire de création de client est affiché

GIVEN  un utilisateur avec rôle Opérateur
WHEN   il accède à /clients/nouveau
THEN   il est redirigé vers /clients (can("operateur", "client.create") = false)
```

**AC2 — Champs obligatoires (FR-8)**

```
GIVEN  le formulaire /clients/nouveau
WHEN   l'utilisateur soumet sans companyName ni phone
THEN   des erreurs de validation françaises s'affichent en ligne :
         "Le nom de la société est requis"
         "Le téléphone est requis"
AND    aucune mutation Dexie n'est déclenchée

GIVEN  un email saisi dans un format invalide
WHEN   l'utilisateur soumet
THEN   l'erreur "Format email invalide" s'affiche
AND    aucune mutation Dexie n'est déclenchée
```

**AC3 — Création offline-capable (FR-8, FR-36)**

```
GIVEN  un formulaire valide (companyName + phone au minimum)
WHEN   l'utilisateur soumet
THEN   un UUID est généré côté client (crypto.randomUUID()) pour le client
AND    un ClientLocal est inséré dans db.clients via db.clients.add()
AND    un SyncOp { entity: "client", type: "create", baseRevision: 0 } est enqueued
       dans db.syncQueue dans la même transaction Dexie (atomique)
AND    un toast "Client « {companyName} » créé" s'affiche
AND   l'utilisateur est redirigé vers /clients

GIVEN  l'appareil est offline
WHEN   l'utilisateur crée un client
THEN   la mutation est persistée dans l'outbox et synchronisée au prochain retour réseau
AND    le client est visible dans db.clients immédiatement (optimistic)
```

**AC4 — Données complètes du client**

```
GIVEN  l'utilisateur remplit tous les champs (nom, contact, tel, email, pays, ville, adresse, notes)
WHEN   il soumet
THEN   tous les champs sont inclus dans le payload SyncOp
AND    le serveur crée ou met à jour via upsert dans la table client
       (case "client" dans sync/push/route.ts, déjà implémenté)
AND    l'ownerId est écrasé par le userId serveur (server-authoritative)
AND    le companyId est écrasé par le tenant de la session (server-authoritative)
```

**AC5 — Navigation vers la page**

```
GIVEN  la page /clients
WHEN   un Admin ou Commercial la consulte
THEN   un lien "Nouveau client" (ou bouton) pointe vers /clients/nouveau
AND    ce lien est masqué pour un Opérateur
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
- `src/app/(app)/clients/nouveau/page.tsx` — CRÉER : Server Component (auth + RBAC + seed userId)
- `src/components/client/client-form.tsx` — CRÉER : Client Component (formulaire création)
- `src/app/(app)/clients/page.tsx` — UPDATE : ajouter bouton "Nouveau client" conditionnel

**EXCLU (déjà en place — NE PAS MODIFIER) :**
- `src/lib/schema.ts` → table `client` déjà présente avec tous les champs
- `src/lib/local-db.ts` → `ClientLocal` interface déjà présente
- `src/lib/validation/client.ts` → `clientSchema` déjà défini (companyName requis, phone requis, email validé)
- `src/app/api/v1/sync/push/route.ts` → case "client" create/update/delete déjà implémenté
- `src/lib/permissions.ts` → `client.create: true` pour admin/commercial déjà en place
- Migrations Drizzle → aucune colonne à ajouter
- FlexSearch / `use-live-clients.ts` → Story 2-7 (recherche)
- `POST /api/v1/clients` direct → non applicable (toutes mutations passent par sync)

---

## Tâches / Sous-tâches

### T1 — Créer le Server Component `/clients/nouveau` (AC1, AC3)

- [x] Créer `src/app/(app)/clients/nouveau/page.tsx`
- [x] Appeler `getSessionWithRole()` — si null, `redirect("/login")`
- [x] Vérifier `can(role, "client.create")` — si false, `redirect("/clients")`
- [x] Extraire `userId` depuis `session.user` (pattern : `(session.user as Record<string, unknown>).id as string`)
- [x] Rendre `<ClientForm userId={userId} />`
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer le composant ClientForm (AC2, AC3, AC4)

- [x] Créer `src/components/client/client-form.tsx` (`"use client"` première ligne)
- [x] Props : `interface ClientFormProps { userId: string }`
- [x] États : `isPending: boolean`, `errors: Partial<Record<keyof ClientInput, string>>`, `globalError: string | null`
- [x] Champs du formulaire :
  - `companyName` : Input, obligatoire, label "Nom de la société *"
  - `contactName` : Input, optionnel, label "Nom du contact"
  - `phone` : Input, obligatoire, label "Téléphone *", type="tel"
  - `email` : Input, optionnel, label "Email", type="email"
  - `country` : valeur par défaut "NE" (champ caché ou select simple MVP)
  - `city` : Input, optionnel, label "Ville"
  - `address` : Input, optionnel, label "Adresse"
  - `notes` : Textarea, optionnel, label "Notes"
- [x] Validation via `clientSchema.safeParse(formData)` avant mutation
- [x] Implémenter `handleSubmit` (voir Dev Notes — logique complète)
- [x] Toast `toast.success("Client « ${data.companyName} » créé")`
- [x] `router.push("/clients")` après mutation réussie
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour la page /clients (AC5)

- [x] Ouvrir `src/app/(app)/clients/page.tsx`
- [x] Convertir en Server Component avec auth : `getSessionWithRole()`, redirect si null
- [x] Importer `can` depuis `@/lib/permissions`
- [x] Afficher `<Link href="/clients/nouveau">Nouveau client</Link>` si `can(role, "client.create")`
- [x] Garder le placeholder existant
- [x] `pnpm typecheck`

### T4 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ 204 tests ✓ sans régression
- [x] `pnpm build` : passe sans erreur

---

## Dev Notes

### CRITIQUE — Aucune migration, tout est déjà en place

La table `client` et `ClientLocal` existent depuis Story 1.3. Les champs sont complets :
```
schema.ts   → client : id, companyName, contactName, phone, email, country, city, address, notes,
               deletedAt, ownerId, companyId, pays, revision, updatedAt, createdAt
local-db.ts → ClientLocal : mêmes champs (camelCase)
validation  → clientSchema : companyName min(1), phone min(1), email optional/validated
```
**Ne pas modifier ces fichiers.**

---

### CRITIQUE — Pattern handleSubmit complet pour ClientForm

```typescript
const router = useRouter();
const [isPending, setIsPending] = useState(false);
const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
const [globalError, setGlobalError] = useState<string | null>(null);

// Contrôle des champs du formulaire
const [companyName, setCompanyName] = useState("");
const [contactName, setContactName] = useState("");
const [phone, setPhone] = useState("");
const [email, setEmail] = useState("");
const [city, setCity] = useState("");
const [address, setAddress] = useState("");
const [notes, setNotes] = useState("");

async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setErrors({});
  setGlobalError(null);

  // 1. Valider via clientSchema
  const formData = {
    companyName: companyName.trim(),
    contactName: contactName.trim() || undefined,
    phone: phone.trim(),
    email: email.trim() || undefined,
    country: "NE",
    city: city.trim() || undefined,
    address: address.trim() || undefined,
    notes: notes.trim() || undefined,
  };

  const validation = clientSchema.safeParse(formData);
  if (!validation.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const [key, msgs] of Object.entries(
      validation.error.flatten().fieldErrors
    )) {
      if (msgs?.[0]) fieldErrors[key] = msgs[0];
    }
    setErrors(fieldErrors);
    return;
  }

  const data = validation.data;
  setIsPending(true);

  try {
    const clientId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 2. Payload pour le SyncOp (envoyé au serveur via sync/push)
    const payload: Record<string, unknown> = {
      companyName: data.companyName,
      phone: data.phone,
      contactName: data.contactName ?? null,
      email: data.email ?? null,
      country: data.country ?? "NE",
      city: data.city ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      deletedAt: null,
      pays: "NE",
      companyId: null,   // le serveur écrase avec le tenant de la session
      ownerId: userId,   // le serveur écrase avec le userId de la session
      createdAt: now,
      updatedAt: now,
    };

    // 3. applyLocalMutation : Dexie write + outbox enqueue atomique
    await applyLocalMutation(
      "client",
      clientId,
      "create",
      payload,
      0, // baseRevision = 0 pour une création
      async () => {
        // exactOptionalPropertyTypes : ne pas inclure les clés optionnelles si undefined/null
        const newClient: ClientLocal = {
          id: clientId,
          companyName: data.companyName,
          phone: data.phone,
          country: data.country ?? "NE",
          pays: "NE",
          revision: 0,
          updatedAt: now,
          createdAt: now,
          ...(data.contactName ? { contactName: data.contactName } : {}),
          ...(data.email ? { email: data.email } : {}),
          ...(data.city ? { city: data.city } : {}),
          ...(data.address ? { address: data.address } : {}),
          ...(data.notes ? { notes: data.notes } : {}),
          ...(userId ? { ownerId: userId } : {}),
        };
        await db.clients.add(newClient);
      },
      userId,
    );

    // 4. Déclencher la synchronisation en arrière-plan
    void triggerSync();

    // 5. Toast + redirection
    toast.success(`Client « ${data.companyName} » créé`);
    router.push("/clients");
  } catch {
    setGlobalError("Une erreur est survenue. Veuillez réessayer.");
  } finally {
    setIsPending(false);
  }
}
```

---

### CRITIQUE — exactOptionalPropertyTypes : db.clients.add()

`exactOptionalPropertyTypes` interdit d'inclure une clé avec valeur `undefined` dans un objet.
Pour `ClientLocal`, les champs optionnels (`contactName?`, `email?`, `city?`, etc.) ne doivent
exister dans l'objet que s'ils ont une valeur. Utiliser le spread conditionnel :

```typescript
// ✅ Correct
...(data.contactName ? { contactName: data.contactName } : {}),

// ❌ Interdit
contactName: data.contactName ?? undefined,  // "undefined" ≠ absent
```

Utiliser `db.clients.add(newClient)` et non `put()` pour une création (add() lance une erreur si l'id existe déjà, ce qui est un garde utile contre les doubles soumissions).

---

### CRITIQUE — Différence create vs update

Pour une **création** :
- `type: "create"`, `baseRevision: 0`
- Dexie : `db.clients.add(newClient)` (pas `put`)
- ID généré côté client : `crypto.randomUUID()`

Pour une **mise à jour** (Story 2-8) :
- `type: "update"`, `baseRevision: existingClient.revision`
- Dexie : `db.clients.put({ ...existingClient, ...changes })`
- ID = id existant de l'entité

---

### CRITIQUE — Pas de wrapper useLiveClients pour ClientForm

Contrairement aux composants d'édition company (Stories 2-3 à 2-5) qui utilisent un outer wrapper
avec `useLiveCompany` + re-key pour synchroniser l'état du formulaire avec Dexie, le formulaire de
**création** n'a pas d'entité existante à surveiller. Aucun outer wrapper ni re-key n'est nécessaire.
Pattern simple : formulaire contrôlé par state local, sans liveQuery.

---

### Sync/push côté serveur — déjà implémenté, aucun changement

`sync/push/route.ts` case "client" gère déjà create/update/delete :
```typescript
case "client": {
  if (op.type === "delete") {
    // soft delete via deletedAt
  } else {
    // upsert sur conflict(clientTable.id)
    // ownerId = userId (session)
    // companyId = tenantId (session)
  }
}
```
Le serveur écrase `ownerId` et `companyId` depuis la session — le payload client ne contrôle pas ces valeurs.

---

### Pattern page Server Component nouveau/page.tsx

```typescript
import { redirect } from "next/navigation";
import { ClientForm } from "@/components/client/client-form";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function NouveauClientPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;

  if (!can(role, "client.create")) redirect("/clients");

  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Clients
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
        Nouveau client
      </h1>
      <div className="mt-6">
        <ClientForm userId={userId} />
      </div>
    </div>
  );
}
```

---

### Pattern update clients/page.tsx

```typescript
import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";

export default async function ClientsPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { role } = result;
  const canCreate = can(role, "client.create");

  return (
    <div className="flex flex-col px-5 pt-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Clients</p>
      <div className="mt-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-text-primary">Mes clients</h1>
        {canCreate && (
          <Link
            href="/clients/nouveau"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Nouveau client
          </Link>
        )}
      </div>
      <p className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
        La liste des clients sera disponible prochainement.
      </p>
    </div>
  );
}
```

---

### Skeleton ClientForm

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/local-db";
import type { ClientLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { clientSchema } from "@/lib/validation/client";

interface ClientFormProps {
  userId: string;
}

export function ClientForm({ userId }: ClientFormProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Champs contrôlés
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    // ... voir Dev Notes — handleSubmit complet
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Nom de la société * */}
      {/* Nom du contact */}
      {/* Téléphone * */}
      {/* Email */}
      {/* Ville */}
      {/* Adresse */}
      {/* Notes */}
      {/* Erreur globale */}
      {/* Bouton Créer le client */}
    </form>
  );
}
```

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Écrire Dexie sans `applyLocalMutation` | `applyLocalMutation` toujours pour Dexie + outbox atomique |
| `db.clients.put()` pour une création | `db.clients.add()` pour une création |
| `baseRevision: existingRevision` pour create | `baseRevision: 0` pour une création |
| `contactName: undefined` dans ClientLocal | `...(data.contactName ? { contactName } : {})` |
| Oublier `void triggerSync()` | Appeler après `applyLocalMutation` réussie |
| Rediriger avant le toast | Toast puis `router.push("/clients")` |
| Créer migration Drizzle | Aucune migration — table client présente depuis Story 1.3 |
| POST direct à `/api/v1/clients` | Passer par `applyLocalMutation` → sync engine |
| Hardcoder le `companyId` dans le payload | Laisser null — le serveur l'écrase depuis la session |
| Vérification permission côté client seulement | Page SSR vérifie `can(role, "client.create")` avant rendu |

---

### Fichiers à modifier/créer — récapitulatif

| Fichier | Action | Description |
|---|---|---|
| `src/app/(app)/clients/nouveau/page.tsx` | CRÉER | Server Component : auth + RBAC + seed userId → `<ClientForm>` |
| `src/components/client/client-form.tsx` | CRÉER | Client Component : formulaire création client, applyLocalMutation, toast + redirect |
| `src/app/(app)/clients/page.tsx` | UPDATE | Ajouter auth SSR + lien conditionnel "Nouveau client" |

---

### Héritage des stories précédentes

**Story 2-3 (CompanyForm) — patterns réutilisables :**
- Validation via `schema.safeParse()` + `flatten().fieldErrors`
- `setErrors` + `setGlobalError` pattern
- `isPending` pour les états de chargement
- Structure `handleSubmit` : validate → mutate → triggerSync → toast → navigate

**Story 2-5 (SignatoryConfig) — exactOptionalPropertyTypes :**
- Spread conditionnel pour les clés optionnelles Dexie
- `delete putObj.key` vs spread (pour update) — pour create, utiliser le spread conditionnel

**Story 2-1 (Sync Engine) :**
- `applyLocalMutation` + `triggerSync` — pattern standard pour toutes les mutations offline
- `sync/push` case "client" supporte déjà create/update/delete — pas de modification

**Story 1-5 (Shell) — navigation :**
- `useRouter()` depuis `next/navigation` pour `router.push()`
- `router.refresh()` non nécessaire ici (liveQuery Dexie gère la réactivité)

---

### Commandes pour le dev agent

```bash
# 1. Docker running
docker compose up -d

# 2. Aucune migration nécessaire
# pnpm db:generate  ← NE PAS LANCER
# pnpm db:migrate   ← NE PAS LANCER

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ 204+ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 2.6] — FR-8 : Création fiche client
- [Architecture §Data Architecture] — Entity client : tous champs présents, pattern applyLocalMutation
- [Architecture §Communication Patterns] — applyLocalMutation (Dexie write + outbox atomique)
- [Architecture §API] — `/clients/nouveau` = route création client
- [Schema §client] — `src/lib/schema.ts` lignes 151–179
- [ClientLocal] — `src/lib/local-db.ts` lignes 5–22
- [clientSchema] — `src/lib/validation/client.ts`
- [sync/push §client] — `src/app/api/v1/sync/push/route.ts` case "client" lignes 200–228
- [permissions §client.create] — `src/lib/permissions.ts` : admin=true, commercial=true, operateur=false
- [Story 2-3 §Dev Notes] — Pattern applyLocalMutation + exactOptionalPropertyTypes
- [Story 2-5 §Dev Notes] — Pattern spread conditionnel pour clés optionnelles Dexie
- [getSessionWithRole] — `src/lib/session.ts` ligne 44

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- T1 : Server Component `clients/nouveau/page.tsx` créé — auth + RBAC + seed userId → `<ClientForm>`
- T2 : `ClientForm` créé — formulaire contrôlé, validation `clientSchema.safeParse`, `applyLocalMutation` + `db.clients.add()`, `triggerSync`, toast + `router.push`; exactOptionalPropertyTypes respecté via spread conditionnel sur champs optionnels
- T3 : `clients/page.tsx` converti en Server Component — auth SSR + bouton conditionnel "Nouveau client" masqué pour opérateur
- T4 : `pnpm check` ✓ (lint warnings pré-existants non liés, 204/204 tests); `pnpm build` ✓ — `/clients/nouveau` apparaît dans le bundle
- Bonus : correction régression pré-existante dans `lockout.test.ts` — mock `db.query.user.findFirst` mis à jour vers `db.select()` pour correspondre à l'implémentation actuelle

### File List

- `src/app/(app)/clients/nouveau/page.tsx` — CRÉÉ
- `src/components/client/client-form.tsx` — CRÉÉ
- `src/app/(app)/clients/page.tsx` — MODIFIÉ (auth SSR + lien conditionnel)
- `src/lib/lockout.test.ts` — MODIFIÉ (fix mock db.select())
- `src/app/api/v1/sync/push/route.ts` — MODIFIÉ (fix permission upsert + server-side client validation)

### Change Log

- 2026-06-24 : Story 2-6 implémentée — création fiche client offline avec formulaire contrôlé, applyLocalMutation, RBAC SSR, toast + redirection; correction régression lockout.test.ts
- 2026-06-24 : Review findings adressés — TS6133 corrigé, push upsert traité comme update quand entité existe, `clientSchema.safeParse` server-side (422), noValidate + aria-invalid/aria-describedby

### Deferred Hardening

- **whitespace-only values** : `clientSchema` accepte `"   "` comme `companyName`/`phone` valide. Le frontend trim les valeurs avant safeParse, donc jamais déclenché via UI. Server sync path reçoit payload déjà trimmé par le client. Hardening strict (`.trim().min(1)` dans schema) = Story 2-8 ou ticket séparé.
