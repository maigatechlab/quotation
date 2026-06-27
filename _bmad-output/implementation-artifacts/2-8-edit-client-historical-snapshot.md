---
story_key: 2-8-edit-client-historical-snapshot
epic_num: 2
story_num: 8
status: done
baseline_commit: 95c49335d0c4abaf532babe2b8d49643c32e7782
---

# Story 2.8 : Modification d'un client & snapshot historique (FR-10)

**Statut :** done

## Story

**En tant que** commercial (ou administrateur),
**Je veux** modifier une fiche client sans altérer les devis historiques,
**Afin que** les anciens devis conservent les données client figées au moment de leur création.

---

## Critères d'acceptation (BDD)

**AC1 — Accès à la page de modification**

```
GIVEN  un utilisateur authentifié avec le rôle Admin ou Commercial
WHEN   il clique sur "Modifier" sur une carte client dans /clients
THEN   il est redirigé vers /clients/[id]/modifier avec le formulaire pré-rempli

GIVEN  un utilisateur avec le rôle Opérateur
WHEN   il accède à /clients/[id]/modifier directement
THEN   il est redirigé vers /clients (pas de bouton "Modifier" visible dans la liste)

GIVEN  un Commercial
WHEN   il accède à /clients/[id]/modifier pour un client dont il n'est pas ownerId
THEN   un message "Vous n'avez pas la permission de modifier ce client." s'affiche
AND    un lien "Retour aux clients" est proposé
```

**AC2 — Formulaire pré-rempli (FR-10)**

```
GIVEN  un client existant avec toutes ses données
WHEN   le formulaire de modification s'affiche
THEN   tous les champs sont pré-remplis avec les valeurs actuelles (companyName, contactName, phone, email, city, address, notes)
AND    les champs obligatoires (companyName, phone) sont marqués *
AND    la validation Zod s'applique identiquement à la création
```

**AC3 — Sauvegarde via applyLocalMutation (FR-10)**

```
GIVEN  un formulaire de modification valide
WHEN   l'utilisateur clique "Enregistrer les modifications"
THEN   applyLocalMutation("client", clientId, "update", payload, client.revision, dexieWriteFn, userId) est appelé
AND    Dexie db.clients.update(clientId, updatedFields) est exécuté dans la transaction
AND    un SyncOp "update" est enfilé dans db.syncQueue
AND   triggerSync() est déclenché
AND    un toast "Client « {companyName} » mis à jour" s'affiche
AND    l'utilisateur est redirigé vers /clients
```

**AC4 — Snapshot figé (FR-10)**

```
GIVEN  un client modifié qui est référencé sur des devis existants
WHEN   la modification est sauvegardée
THEN   les quotes existants dans db.quotes gardent leur clientSnapshot intact
AND    seul db.clients est mis à jour
AND    (note : le snapshot est figé lors de la création du devis — Story 3.1 — pas ici)
```

**AC5 — Audit event local (FR-10, O1)**

```
GIVEN  une modification de client sauvegardée
WHEN   la mutation Dexie est complète
THEN   un enregistrement est ajouté dans db.auditMirror avec :
       who = userId, what = "client.update", entityType = "client", entityId = clientId
       before = snapshot avant modification (toutes les valeurs actuelles des champs)
       after = snapshot après modification, synced = false
AND    cet audit est transmis au serveur lors du prochain triggerSync via /api/v1/sync/push
```

**AC6 — Timeline consultable (FR-10/M7)**

```
GIVEN  un client ayant été modifié au moins une fois
WHEN   la page /clients/[id]/modifier s'affiche
THEN   une section "Historique des modifications" liste les entrées de db.auditMirror
       pour ce client (entityType = "client", entityId = clientId)
AND    chaque entrée montre : date, auteur (who), et un résumé des champs modifiés
AND    la liste est triée par date décroissante (plus récent en premier)
AND    si aucune modification n'existe, la section n'est pas affichée
```

**AC7 — Qualité**

```
GIVEN  les fichiers modifiés/créés
WHEN  je lance pnpm check
THEN  lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND   pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS (fichiers à créer ou modifier) :**
- `src/app/(app)/clients/[id]/modifier/page.tsx` — CRÉER : Server Component (auth + permission gate)
- `src/components/client/client-edit-form.tsx` — CRÉER : Client Component (formulaire pré-rempli + audit timeline)
- `src/components/client/client-list.tsx` — UPDATE : ajout bouton "Modifier" sur chaque carte, prop `canEdit`
- `src/app/(app)/clients/page.tsx` — UPDATE : calcul `canEdit`, passage à `<ClientList>`

**EXCLU :**
- Toute modification de `src/lib/schema.ts` ou migrations — aucune colonne à ajouter
- Toute modification de `src/lib/local-db.ts` — db.clients et auditMirror déjà définis
- Modification des `clientSnapshot` dans les quotes existants — figé à la création (Story 3.1)
- API Route `/api/v1/clients/[id]` — la mise à jour passe par le sync push existant (`/api/v1/sync/push`)
- Suppression client — Story 2.9
- Validation de l'ownership côté serveur — déjà géré dans `/api/v1/sync/push/route.ts` via `requirePermission`

---

## Tâches / Sous-tâches

### T1 — Mettre à jour `clients/page.tsx` (AC1 permission gate)

- [x] Ouvrir `src/app/(app)/clients/page.tsx`
- [x] Ajouter `canEdit = can(role, "client.update")` après `canCreate`
- [x] Passer `canEdit={canEdit}` à `<ClientList>`
- [x] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `client-list.tsx` (AC1 bouton Modifier)

- [x] Ouvrir `src/components/client/client-list.tsx`
- [x] Ajouter `canEdit: boolean` à `interface ClientListProps`
- [x] Destructurer `canEdit` dans la fonction
- [x] Sur chaque carte client (dans le `.map()`), ajouter un `<Link>` "Modifier" vers `/clients/${client.id}/modifier` conditionnel à `canEdit`
- [x] Icône `<Pencil className="h-3.5 w-3.5" />` de lucide-react pour le bouton
- [x] Mise en page : bouton "Modifier" aligné à droite de la carte, sous les infos client
- [x] `pnpm typecheck` — zéro erreur

### T3 — Créer `src/app/(app)/clients/[id]/modifier/page.tsx` (AC1)

- [x] Créer le répertoire `src/app/(app)/clients/[id]/modifier/`
- [x] Créer `page.tsx` avec `"use server"` (Server Component par défaut dans App Router)
- [x] Auth : `getSessionWithRole()`, redirect vers `/login` si null
- [x] Permission : `can(role, "client.update")` → redirect vers `/clients` si false
- [x] Extraire `params.id` en tant que `clientId`
- [x] Extraire `userId` depuis `session.user`
- [x] Rendre `<ClientEditForm clientId={clientId} userId={userId} role={role} />`
- [x] Layout identique à `clients/nouveau/page.tsx` (breadcrumb "Clients" + titre)
- [x] `pnpm typecheck` — zéro erreur

### T4 — Créer `src/components/client/client-edit-form.tsx` (AC2, AC3, AC5, AC6)

- [x] Créer `src/components/client/client-edit-form.tsx` avec `"use client"` en première ligne
- [x] Props : `interface ClientEditFormProps { clientId: string; userId: string; role: Role }`
- [x] `liveQuery(() => db.clients.get(clientId))` via `useEffect + subscribe` (pattern use-live-company)
- [x] États : `client: ClientLocal | undefined`, `loading: boolean`
- [x] Si loading : skeleton (3 lignes grises animées, identique au pattern existant)
- [x] Si `!client` après chargement : message "Client introuvable" + lien retour `/clients`
- [x] Check ownership : si `role === "commercial" && client.ownerId !== userId` → message "Vous n'avez pas la permission de modifier ce client." + lien retour
- [x] Formulaire pré-rempli : tous les champs de `ClientForm` avec valeurs initiales depuis `client`
- [x] Validation Zod : réutiliser `clientSchema` de `@/lib/validation/client`
- [x] On submit :
  - [x] Valider via `clientSchema.safeParse(formData)`
  - [x] Snapshot `before` = copier toutes les valeurs actuelles de `client`
  - [x] Construire `payload` (camelCase, null pour les optionnels vides — voir Dev Notes)
  - [x] `await applyLocalMutation("client", clientId, "update", payload, client.revision, dexieWriteFn, userId)`
  - [x] `dexieWriteFn` = `async () => { await db.clients.update(clientId, updatedFields) }`
  - [x] Après `applyLocalMutation` : écrire dans `db.auditMirror` (hors transaction — voir Dev Notes)
  - [x] `void triggerSync()`
  - [x] `toast.success(`Client « ${data.companyName} » mis à jour`)`
  - [x] `router.push("/clients")`
- [x] Section "Historique des modifications" (AC6) : `liveQuery` sur `db.auditMirror` filtré sur `entityId = clientId`
- [x] `pnpm typecheck` — zéro erreur

### T5 — Vérification finale (AC7)

- [x] `pnpm check` : lint ✓ typecheck ✓ 204+ tests ✓ sans régression
- [x] `pnpm build` : passe sans erreur

---

## Dev Notes

### CRITIQUE — Pattern liveQuery (NE PAS utiliser useLiveQuery)

Suivre le pattern établi dans `use-live-company.ts` (Story 2-3) et `use-live-clients.ts` (Story 2-7) :

```typescript
"use client";

import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";
import type { ClientLocal } from "@/lib/local-db";

// Dans ClientEditForm :
const [client, setClient] = useState<ClientLocal | undefined>(undefined);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const subscription = liveQuery(() => db.clients.get(clientId)).subscribe({
    next: (c) => { setClient(c); setLoading(false); },
    error: () => setLoading(false),
  });
  return () => subscription.unsubscribe();
}, [clientId]);
```

**NE PAS** utiliser `useLiveQuery` de `dexie-react-hooks` — non utilisé dans le codebase.

---

### CRITIQUE — Pattern applyLocalMutation pour "update"

```typescript
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

// Snapshot before
const beforeSnapshot = {
  companyName: client.companyName,
  contactName: client.contactName,
  phone: client.phone,
  email: client.email,
  country: client.country,
  city: client.city,
  address: client.address,
  notes: client.notes,
};

// Payload pour le sync (camelCase, null pour les champs optionnels vides)
const payload: Record<string, unknown> = {
  companyName: data.companyName,
  contactName: data.contactName ?? null,
  phone: data.phone,
  email: data.email ?? null,
  country: data.country ?? "NE",
  city: data.city ?? null,
  address: data.address ?? null,
  notes: data.notes ?? null,
  pays: "NE",
  ownerId: client.ownerId ?? null,
  companyId: client.companyId ?? null,
  updatedAt: now,
};

// Champs à mettre à jour dans Dexie (seulement les champs modifiés + updatedAt)
const updatedFields: Partial<ClientLocal> = {
  companyName: data.companyName,
  phone: data.phone,
  country: data.country ?? "NE",
  updatedAt: now,
  // Champs optionnels — IMPORTANT : ne pas utiliser undefined car exactOptionalPropertyTypes
  ...(data.contactName ? { contactName: data.contactName } : { contactName: undefined }),
  ...(data.email ? { email: data.email } : { email: undefined }),
  ...(data.city ? { city: data.city } : { city: undefined }),
  ...(data.address ? { address: data.address } : { address: undefined }),
  ...(data.notes ? { notes: data.notes } : { notes: undefined }),
};

await applyLocalMutation(
  "client",
  clientId,
  "update",
  payload,
  client.revision, // baseRevision — revision actuelle du client
  async () => {
    await db.clients.update(clientId, updatedFields);
  },
  userId,
);
```

**IMPORTANT — `db.clients.update()` vs `db.clients.put()`** :
- Utiliser `.update(clientId, updatedFields)` (seulement les champs modifiés), PAS `.put(newClient)` (remplacement complet)
- La `revision` est gérée côté serveur lors du sync, pas incrémentée localement
- `updatedAt` doit être mis à jour localement avec l'heure ISO courante

---

### CRITIQUE — Écriture audit mirror HORS transaction

`applyLocalMutation` crée une transaction Dexie sur `[entityTable, syncQueue]`. Le `auditMirror` n'est pas dans cette transaction. Écrire dans `auditMirror` APRÈS `applyLocalMutation` :

```typescript
const now = new Date().toISOString();

// 1. Mutation principale (atomique avec syncQueue)
await applyLocalMutation(...);

// 2. Audit mirror (non-atomique mais acceptable pour MVP-0)
await db.auditMirror.add({
  id: crypto.randomUUID(),
  who: userId,
  what: "client.update",
  when: now,
  where: typeof window !== "undefined" ? window.location.pathname : "client",
  entityType: "client",
  entityId: clientId,
  before: beforeSnapshot,
  after: {
    companyName: data.companyName,
    contactName: data.contactName,
    phone: data.phone,
    email: data.email,
    country: data.country ?? "NE",
    city: data.city,
    address: data.address,
    notes: data.notes,
  },
  createdAt: now,
  synced: false,
});
```

Ce pattern est établi dans `src/lib/sync/conflict.ts` (ligne 29–30).

---

### CRITIQUE — Snapshot figé (AC4)

**AUCUNE action sur les quotes.** Le `clientSnapshot` dans `db.quotes` (et la table `quote` Drizzle) est figé lors de la création du devis (Story 3.1). Story 2.8 modifie uniquement `db.clients`. Les devis historiques conservent automatiquement leurs données figées.

Vérifier mentalement : après `db.clients.update(clientId, ...)`, faire un `db.quotes.where("clientId").equals(clientId).toArray()` dans devtools confirme que `clientSnapshot` reste intact (il est `undefined` dans Dexie pour l'instant car aucun devis n'existe encore).

---

### CRITIQUE — Permission "own" pour Commercial

Le matrix de permissions (`src/lib/permissions.ts`) :
```
commercial: { "client.update": "own" }
```

Côté **serveur** : `requirePermission` dans `/api/v1/sync/push/route.ts` vérifie déjà `ownerId === currentUserId` lors du push. Pas besoin de répliquer cette logique serveur.

Côté **client (Dexie)** : dans `ClientEditForm`, vérifier après chargement :
```typescript
if (role === "commercial" && client?.ownerId !== userId) {
  // Afficher message d'erreur, pas le formulaire
  return (
    <div>
      <p>Vous n'avez pas la permission de modifier ce client.</p>
      <Link href="/clients">Retour aux clients</Link>
    </div>
  );
}
```

L'admin (`role === "admin"`) peut modifier n'importe quel client sans cette restriction.

---

### CRITIQUE — Page Server Component `/clients/[id]/modifier/page.tsx`

```typescript
// src/app/(app)/clients/[id]/modifier/page.tsx
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";
import { ClientEditForm } from "@/components/client/client-edit-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ModifierClientPage({ params }: Props) {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;

  if (!can(role, "client.update")) redirect("/clients");

  const { id: clientId } = await params;
  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Clients
      </p>
      <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
        Modifier le client
      </h1>
      <div className="mt-6">
        <ClientEditForm clientId={clientId} userId={userId} role={role} />
      </div>
    </div>
  );
}
```

**IMPORTANT** : Next.js 16 App Router — `params` est une `Promise<{ id: string }>`, utiliser `await params` (voir `nouveau/page.tsx` pour référence si elle utilise `params` sync — sinon ajuster selon la version).

---

### CRITIQUE — Bouton "Modifier" dans `client-list.tsx`

Ajouter `canEdit: boolean` à `ClientListProps` et mettre à jour le `.map()` des cartes :

```typescript
import { Pencil } from "lucide-react"; // ajouter cet import

// Dans ClientListProps :
interface ClientListProps {
  canCreate: boolean;
  canEdit: boolean; // NOUVEAU
}

// Dans le .map() des cartes client :
clients.map((client) => (
  <div
    key={client.id}
    className="rounded-xl border border-border bg-surface p-4"
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <p className="font-medium text-text-primary">{client.companyName}</p>
        <p className="mt-0.5 text-sm text-text-secondary">{client.phone}</p>
        {client.contactName && (
          <p className="mt-0.5 text-xs text-text-muted">{client.contactName}</p>
        )}
        {client.city && (
          <p className="mt-0.5 text-xs text-text-muted">{client.city}</p>
        )}
      </div>
      {canEdit && (
        <Link
          href={`/clients/${client.id}/modifier`}
          aria-label={`Modifier ${client.companyName}`}
          className="ml-3 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <Pencil className="h-3.5 w-3.5" />
          Modifier
        </Link>
      )}
    </div>
  </div>
))
```

---

### CRITIQUE — Timeline audit dans `ClientEditForm`

La section "Historique" lit `db.auditMirror` via `liveQuery` :

```typescript
// Deuxième subscription dans ClientEditForm
const [auditLog, setAuditLog] = useState<AuditEventLocal[]>([]);

useEffect(() => {
  const sub = liveQuery(() =>
    db.auditMirror
      .where("entityId")
      .equals(clientId)
      .reverse()
      .sortBy("when")
  ).subscribe({
    next: (events) => setAuditLog(events),
    error: () => setAuditLog([]),
  });
  return () => sub.unsubscribe();
}, [clientId]);

// Rendu conditionnel (seulement si des modifications existent)
{auditLog.length > 0 && (
  <section className="mt-8">
    <h2 className="text-sm font-semibold text-text-primary">
      Historique des modifications
    </h2>
    <ul className="mt-3 space-y-2">
      {auditLog.map((entry) => (
        <li key={entry.id} className="rounded-xl border border-border bg-surface p-3 text-xs text-text-secondary">
          <p className="font-medium text-text-primary">
            Modifié le {new Date(entry.when).toLocaleDateString("fr-NE", { dateStyle: "medium" })}
          </p>
          <p className="mt-0.5">Par : {entry.who}</p>
          {entry.before && entry.after && (
            <p className="mt-0.5 text-text-muted">
              {/* Résumé des champs modifiés */}
              {Object.keys(entry.after as Record<string, unknown>)
                .filter((k) => (entry.before as Record<string, unknown>)[k] !== (entry.after as Record<string, unknown>)[k])
                .join(", ")}
            </p>
          )}
        </li>
      ))}
    </ul>
  </section>
)}
```

**Note** : `db.auditMirror` a un index sur `entityId`, donc `.where("entityId").equals(clientId)` fonctionne.

---

### CRITIQUE — Piège `exactOptionalPropertyTypes` dans Dexie update

```typescript
// ❌ INTERDIT (exactOptionalPropertyTypes strict)
await db.clients.update(clientId, { contactName: undefined });

// ✅ CORRECT — spreader conditionnel ou supprimer la clé
const updatedFields: Partial<ClientLocal> = {
  companyName: data.companyName,
  phone: data.phone,
  updatedAt: now,
};
// Ajouter les champs optionnels seulement s'ils ont une valeur
if (data.contactName) updatedFields.contactName = data.contactName;
if (data.city) updatedFields.city = data.city;
// etc.
```

Ou utiliser le spread conditionnel comme dans `client-form.tsx` (Story 2.6).

---

### Héritage des stories précédentes

**Story 2-6 (`client-form.tsx`) :**
- Référence directe pour le formulaire de création → copier la structure form, fields, validation
- `ClientForm` et `ClientEditForm` partagent les mêmes champs et la même validation Zod (`clientSchema`)
- Différence clé : `ClientEditForm` fait un `update` (pas un `create`), pre-fill les fields, et passe `client.revision` comme `baseRevision`
- NE PAS modifier `client-form.tsx` — laisser tel quel

**Story 2-7 (`use-live-clients.ts`, `client-list.tsx`) :**
- `client-list.tsx` existant = modifier uniquement pour ajouter `canEdit` et bouton "Modifier"
- Pattern `liveQuery + subscribe` = référence pour `ClientEditForm`
- NE PAS modifier `use-live-clients.ts`

**Story 2-1 (sync engine) :**
- `applyLocalMutation` : signature existante, utiliser avec `type: "update"`, `baseRevision: client.revision`
- `triggerSync()` : appeler après la mutation (pattern identique à story 2-6)
- Le sync push serveur (`/api/v1/sync/push/route.ts`) gère déjà les ops "update" pour les clients via `resolveEntityAction` → `"client.update"`

**Story 2-3 (`use-live-company.ts`) :**
- Pattern `useEffect + liveQuery + subscribe` à suivre pour lire le client depuis Dexie

---

### Fichiers à modifier/créer — récapitulatif

| Fichier | Action | Description |
|---|---|---|
| `src/app/(app)/clients/[id]/modifier/page.tsx` | CRÉER | Server Component : auth + permission gate + render ClientEditForm |
| `src/components/client/client-edit-form.tsx` | CRÉER | Client Component : formulaire pré-rempli, update via applyLocalMutation, audit mirror, timeline |
| `src/components/client/client-list.tsx` | UPDATE | Ajout prop `canEdit`, bouton "Modifier" sur chaque carte |
| `src/app/(app)/clients/page.tsx` | UPDATE | Calcul `canEdit`, passage à `<ClientList canEdit={canEdit} />` |

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

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `db.clients.put(newClient)` (remplacement complet) | `db.clients.update(clientId, updatedFields)` (champs modifiés seulement) |
| Écrire `auditMirror` dans la transaction `applyLocalMutation` | Écrire `auditMirror` APRÈS `applyLocalMutation` (pattern conflict.ts) |
| Mettre à jour `clientSnapshot` dans les quotes | Ne pas toucher les quotes — snapshot figé à la création (Story 3.1) |
| `{ contactName: undefined }` dans `updatedFields` | Spreader conditionnel ou ne pas inclure la clé |
| Passer `baseRevision: 0` pour un update | Passer `baseRevision: client.revision` (la revision actuelle du client) |
| `useLiveQuery` de dexie-react-hooks | `liveQuery + useEffect + subscribe` (pattern établi) |
| Dupliquer `requirePermission` serveur dans le composant | Vérifier `role === "commercial" && ownerId !== userId` côté client seulement |
| Appeler une API REST pour fetch le client avant l'edit | Lire depuis `db.clients.get(clientId)` via liveQuery |
| `await params.id` sans `await params` | `const { id } = await params` (Next.js 16 App Router) |

---

## Références

- [Epics §Story 2.8] — FR-10 : Modification client, snapshot figé, event log
- [Architecture §Client snapshot] — client data frozen onto quote at creation (FR-10)
- [Architecture §Audit log] — append-only event log, Dexie auditMirror mirror
- [Architecture §Communication Patterns] — Mutations via `applyLocalMutation` uniquement
- [Architecture §M3 Clients] — `app/(app)/clients/**`, `components/client/`
- [Architecture §RBAC] — `client.update`: admin=true, commercial="own", operateur=false
- [permissions.ts] — `can(role, "client.update")` et PERMISSION_MATRIX
- [local-db.ts] — `AuditEventLocal`, `ClientLocal`, `db.auditMirror` (index: entityId)
- [client-form.tsx] — référence pour structure formulaire et `applyLocalMutation` "create"
- [client-list.tsx] — modifier pour ajouter `canEdit` + bouton "Modifier"
- [conflict.ts §auditMirror] — pattern d'écriture auditMirror hors transaction
- [outbox.ts §applyLocalMutation] — signature : `(entity, entityId, type, payload, baseRevision, dexieWriteFn, createdBy?)`
- [Story 2-6 §Dev Notes] — `applyLocalMutation` "create" + exactOptionalPropertyTypes
- [Story 2-7 §Dev Notes] — pattern `liveQuery + subscribe`, `use-live-clients.ts`
- [Story 2-3] — pattern `use-live-company.ts` pour liveQuery single entity

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- T1: `clients/page.tsx` — `canEdit = can(role, "client.update")` calculé et passé à `<ClientList>`
- T2: `client-list.tsx` — prop `canEdit: boolean` ajoutée, bouton "Modifier" conditionnel avec icône `Pencil` sur chaque carte, layout `flex items-start justify-between`
- T3: `src/app/(app)/clients/[id]/modifier/page.tsx` créé — Server Component, auth + permission gate, `await params` (Next.js 16 App Router)
- T4: `src/components/client/client-edit-form.tsx` créé — Client Component, `liveQuery` double subscription (client + auditMirror), pré-remplissage des champs, `applyLocalMutation("update", ..., client.revision, ...)`, audit hors transaction, timeline historique conditionnelle
- AC4 respecté : aucun quote modifié — `clientSnapshot` figé à la création (Story 3.1)
- Correction TS : `!!entry.before && !!entry.after` pour éviter `unknown` non assignable à `ReactNode`
- pnpm check : lint ✓ typecheck ✓ 204 tests ✓ | pnpm build ✓
- [Post-revue] Fix 1 : `db.clients.update()` → `db.clients.put(updatedClient)` — reconstruction complète du record pour vider les champs optionnels effacés (Dexie `.update()` ignore les clés `undefined`)
- [Post-revue] Fix 2 : `auditMirror.synced` mis à `true` seulement si `triggerSync()` retourne `status === "applied" | "noop"` pour l'opId exact — `triggerSync` expose désormais `PushResult | null` via `processQueue`
- [Post-revue] Fix 3 : `persistEntityMutation` reçoit `currentEntity`; `ownerId` préservé de l'entité existante sur les ops `update` (client + quote) — admin ne réassigne plus la propriété

### File List

- `src/app/(app)/clients/page.tsx` (modifié)
- `src/app/(app)/clients/[id]/modifier/page.tsx` (créé)
- `src/components/client/client-list.tsx` (modifié)
- `src/components/client/client-edit-form.tsx` (créé)
- `src/lib/sync/outbox.ts` (modifié — `triggerSync`/`processQueue` retournent `PushResult | null`)
- `src/app/api/v1/sync/push/route.ts` (modifié — preservation `ownerId` sur updates)

### Change Log

- 2026-06-24: Story 2-8 implémentée — modification client avec snapshot historique (FR-10). Page `/clients/[id]/modifier`, formulaire pré-rempli, `applyLocalMutation` update, audit mirror, timeline des modifications.
- 2026-06-24: Post-revue — 3 findings High corrigés : vidage optionnels (put), synced guard (opId status), ownerId preservation (currentEntity). Revue close sans bloqueur.
