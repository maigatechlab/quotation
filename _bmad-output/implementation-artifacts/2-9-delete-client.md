---
story_key: 2-9-delete-client
epic_num: 2
story_num: 9
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 2.9 : Suppression d'un client (FR-11)

**Statut :** ready-for-dev

## Story

**En tant qu'** administrateur,
**Je veux** supprimer un client en soft delete,
**Afin que** les données restent disponibles pour audit tout en retirant le client des listes actives.

---

## Critères d'acceptation (BDD)

**AC1 — Bouton "Supprimer" visible uniquement pour Admin**

```
GIVEN  un utilisateur authentifié avec le rôle Admin
WHEN   il consulte la liste /clients
THEN   chaque carte client affiche un bouton "Supprimer" (icône Trash2)

GIVEN  un utilisateur avec le rôle Commercial ou Opérateur
WHEN   il consulte la liste /clients
THEN   aucun bouton "Supprimer" n'est visible sur les cartes (canDelete = false)
```

**AC2 — Vérification des devis associés avant suppression**

```
GIVEN  un client associé à au moins un devis existant
WHEN   l'Admin clique "Supprimer" sur ce client
THEN   une dialog s'ouvre montrant : "Ce client est associé à N devis et ne peut pas être supprimé."
AND    seul un bouton "Fermer" est proposé — aucune action de suppression possible
```

**AC3 — Confirmation de suppression pour client sans devis**

```
GIVEN  un client sans aucun devis associé
WHEN   l'Admin clique "Supprimer" sur ce client
THEN   une dialog de confirmation s'ouvre avec : "Supprimer « {companyName} » ?"
AND    description : "Cette action est irréversible. Le client sera retiré de la liste."
AND    boutons : "Annuler" et "Supprimer"
```

**AC4 — Soft delete via applyLocalMutation (FR-11)**

```
GIVEN  une confirmation de suppression sur un client sans devis
WHEN   l'Admin clique "Supprimer" dans la dialog
THEN   applyLocalMutation("client", clientId, "delete", {}, client.revision, dexieWriteFn, userId) est appelé
AND    dexieWriteFn exécute db.clients.update(clientId, { deletedAt: now, updatedAt: now })
AND    un SyncOp "delete" est enfilé dans db.syncQueue
AND    triggerSync() est déclenché
AND    un toast "Client « {companyName} » supprimé." s'affiche
AND    la dialog se ferme
AND    le client disparaît immédiatement de la liste (liveQuery filtre déjà !c.deletedAt)
```

**AC5 — Audit event local**

```
GIVEN  une suppression de client confirmée
WHEN   la mutation Dexie est complète
THEN   un enregistrement est ajouté dans db.auditMirror avec :
       who = userId, what = "client.delete", entityType = "client", entityId = clientId
       before = snapshot du client avant suppression, after = { deletedAt: now }
       synced = false
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

**INCLUS (fichiers à créer ou modifier) :**
- `src/components/client/client-delete-dialog.tsx` — CRÉER : Client Component, dialog confirmation + vérification quotes
- `src/components/client/client-list.tsx` — UPDATE : ajout `canDelete: boolean`, `userId: string`, bouton Trash2, intégration dialog
- `src/app/(app)/clients/page.tsx` — UPDATE : calcul `canDelete`, extraction `userId`, passage à `<ClientList>`

**EXCLU :**
- Aucune migration DB — `deletedAt` existe déjà dans `ClientLocal` et `client` table Drizzle
- Aucune modification de `src/lib/local-db.ts` — `deletedAt` déjà indexé dans Dexie v1
- Aucune modification de `src/app/api/v1/sync/push/route.ts` — gère déjà `client.delete` (soft delete côté serveur)
- Aucune API route dédiée `/api/v1/clients/[id]` — tout passe par `/api/v1/sync/push`
- Aucune page de confirmation séparée (`/clients/[id]/supprimer`) — dialog in-page uniquement
- Modifications du schéma `src/lib/schema.ts`

---

## Tâches / Sous-tâches

### T1 — Créer `src/components/client/client-delete-dialog.tsx` (AC2, AC3, AC4, AC5)

- [x] Créer le fichier avec `"use client"` en première ligne
- [x] Props : `interface ClientDeleteDialogProps { client: ClientLocal; userId: string; open: boolean; onOpenChange: (open: boolean) => void; }`
- [x] État : `quoteCount: number | null` (null = chargement), `deleting: boolean`
- [x] `useEffect` au mount (quand `open = true`) : `db.quotes.where("clientId").equals(client.id).count()` → setQuoteCount
- [x] Rendu conditionnel selon `quoteCount`:
  - Si `quoteCount === null` : skeleton (ligne grise animée)
  - Si `quoteCount > 0` : vue "bloquée" (message + bouton Fermer)
  - Si `quoteCount === 0` : vue "confirmation" (description + boutons Annuler + Supprimer)
- [x] `handleDelete()` :
  - `setDeleting(true)`
  - `const now = new Date().toISOString()`
  - `await applyLocalMutation("client", client.id, "delete", {}, client.revision, async () => { await db.clients.update(client.id, { deletedAt: now, updatedAt: now }) }, userId)`
  - `await db.auditMirror.add({ id: crypto.randomUUID(), who: userId, what: "client.delete", when: now, where: "/clients", entityType: "client", entityId: client.id, before: { companyName: client.companyName, ... }, after: { deletedAt: now }, createdAt: now, synced: false })`
  - `void triggerSync()`
  - `toast.success(\`Client « ${client.companyName} » supprimé.\`)`
  - `onOpenChange(false)`
  - `setDeleting(false)`
- [x] `pnpm typecheck` — zéro erreur

### T2 — Mettre à jour `src/components/client/client-list.tsx` (AC1, AC2, AC3)

- [x] Ajouter `canDelete: boolean` et `userId: string` à `ClientListProps`
- [x] Ajouter `selectedClient: ClientLocal | null` et `deleteDialogOpen: boolean` au state local
- [x] Importer `Trash2` de `lucide-react`
- [x] Importer `ClientDeleteDialog` de `./client-delete-dialog`
- [x] Dans le `.map()` des cartes : si `canDelete`, ajouter bouton Trash2 à côté du bouton Modifier
- [x] Au clic Trash2 : `setSelectedClient(client); setDeleteDialogOpen(true)`
- [x] Ajouter `<ClientDeleteDialog>` une seule fois hors du `.map()` (voir pattern ci-dessous)
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/app/(app)/clients/page.tsx` (AC1)

- [x] Ajouter `const canDelete = can(role, "client.delete")`
- [x] Extraire `userId` : `const { session, role } = result; const userId = (session.user as Record<string, unknown>).id as string;`
- [x] Passer `canDelete={canDelete}` et `userId={userId}` à `<ClientList>`
- [x] `pnpm typecheck` — zéro erreur

### T4 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ tous tests ✓ sans régression
- [x] `pnpm build` : passe sans erreur

---

## Dev Notes

### CRITIQUE — Soft delete déjà câblé de bout en bout

**NE PAS créer de nouvelle logique** — tout est déjà en place :

| Couche | État | Détail |
|---|---|---|
| `ClientLocal.deletedAt?` | ✅ existe | `src/lib/local-db.ts:15` |
| Dexie index `deletedAt` | ✅ indexé | `this.version(1).stores({ clients: "id, ..., deletedAt, ..." })` |
| `use-live-clients.ts` filtre | ✅ actif | ligne 33 : `db.clients.filter((c) => !c.deletedAt)` |
| `SyncOp.type = "delete"` | ✅ supporté | `src/lib/local-db.ts:131` |
| Server push — client delete | ✅ implémenté | `push/route.ts:208-213` : `update({ deletedAt: now, revision, updatedAt })` |
| Permissions `client.delete` | ✅ matrix | `admin: true`, `commercial: false`, `operateur: false` |

### CRITIQUE — Pattern applyLocalMutation pour "delete"

```typescript
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { db } from "@/lib/local-db";

const now = new Date().toISOString();

await applyLocalMutation(
  "client",
  client.id,
  "delete",
  {},           // payload vide — serveur n'a besoin que de entityId pour le delete
  client.revision,
  async () => {
    await db.clients.update(client.id, {
      deletedAt: now,
      updatedAt: now,
    });
  },
  userId,
);
```

**IMPORTANT** : `db.clients.update()` (pas `.put()`) — on met à jour seulement `deletedAt` + `updatedAt`. Ne pas reconstruire l'objet entier.

### CRITIQUE — Pattern Dialog (Radix UI via shadcn)

```tsx
// client-list.tsx — un seul Dialog hors du .map()
const [selectedClient, setSelectedClient] = useState<ClientLocal | null>(null);
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

// Dans le .map() :
{canDelete && (
  <button
    type="button"
    onClick={() => { setSelectedClient(client); setDeleteDialogOpen(true); }}
    aria-label={`Supprimer ${client.companyName}`}
    className="ml-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
  >
    <Trash2 className="h-3.5 w-3.5" />
    Supprimer
  </button>
)}

// Hors du .map(), dans le return principal :
{selectedClient && (
  <ClientDeleteDialog
    client={selectedClient}
    userId={userId}
    open={deleteDialogOpen}
    onOpenChange={(open) => {
      setDeleteDialogOpen(open);
      if (!open) setSelectedClient(null);
    }}
  />
)}
```

### CRITIQUE — Vérification quotes dans la dialog (recompute à l'ouverture)

```typescript
// client-delete-dialog.tsx
const [quoteCount, setQuoteCount] = useState<number | null>(null);

useEffect(() => {
  if (!open) return;
  setQuoteCount(null); // reset pour skeleton
  db.quotes.where("clientId").equals(client.id).count()
    .then(setQuoteCount)
    .catch(() => setQuoteCount(0)); // fail safe : permettre suppression si erreur
}, [open, client.id]);
```

**Note** : `QuoteLocal` n'a pas de champ `deletedAt` (les quotes sont hard-deleted côté serveur). Compter tous les quotes `clientId = clientId` sans filtre supplémentaire.

### CRITIQUE — Audit mirror pour delete

Pattern identique à Story 2-8 — écrire APRÈS `applyLocalMutation` (hors transaction) :

```typescript
await db.auditMirror.add({
  id: crypto.randomUUID(),
  who: userId,
  what: "client.delete",
  when: now,
  where: "/clients",
  entityType: "client",
  entityId: client.id,
  before: {
    companyName: client.companyName,
    contactName: client.contactName,
    phone: client.phone,
    email: client.email,
    city: client.city,
  },
  after: { deletedAt: now },
  createdAt: now,
  synced: false,
});
```

### CRITIQUE — `clients/page.tsx` — extraction userId

```typescript
// src/app/(app)/clients/page.tsx
export default async function ClientsPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { session, role } = result;
  const canCreate = can(role, "client.create");
  const canEdit = can(role, "client.update");
  const canDelete = can(role, "client.delete"); // admin only = true

  const userId = (session.user as Record<string, unknown>).id as string;

  return (
    <div className="flex flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Clients</p>
      <ClientList
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        userId={userId}
      />
    </div>
  );
}
```

### CRITIQUE — Structure complète `client-delete-dialog.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { db } from "@/lib/local-db";
import type { ClientLocal } from "@/lib/local-db";

interface ClientDeleteDialogProps {
  client: ClientLocal;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientDeleteDialog({ client, userId, open, onOpenChange }: ClientDeleteDialogProps) {
  const [quoteCount, setQuoteCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuoteCount(null);
    db.quotes.where("clientId").equals(client.id).count()
      .then(setQuoteCount)
      .catch(() => setQuoteCount(0));
  }, [open, client.id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const now = new Date().toISOString();
      await applyLocalMutation(
        "client", client.id, "delete", {}, client.revision,
        async () => { await db.clients.update(client.id, { deletedAt: now, updatedAt: now }); },
        userId,
      );
      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "client.delete",
        when: now,
        where: "/clients",
        entityType: "client",
        entityId: client.id,
        before: { companyName: client.companyName, contactName: client.contactName, phone: client.phone, email: client.email, city: client.city },
        after: { deletedAt: now },
        createdAt: now,
        synced: false,
      });
      void triggerSync();
      toast.success(`Client « ${client.companyName} » supprimé.`);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Supprimer le client ?</DialogTitle>
          {quoteCount === null && (
            <DialogDescription>Vérification en cours…</DialogDescription>
          )}
          {quoteCount !== null && quoteCount > 0 && (
            <DialogDescription>
              Ce client est associé à {quoteCount} devis et ne peut pas être supprimé.
            </DialogDescription>
          )}
          {quoteCount !== null && quoteCount === 0 && (
            <DialogDescription>
              Supprimer « {client.companyName} » ? Cette action est irréversible.
              Le client sera retiré de la liste.
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter>
          {(quoteCount === null || quoteCount > 0) && (
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface"
              >
                Fermer
              </button>
            </DialogClose>
          )}
          {quoteCount === 0 && (
            <>
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface"
                >
                  Annuler
                </button>
              </DialogClose>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Supprimer"}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### CRITIQUE — Position bouton Supprimer dans la carte

Placer le bouton Supprimer à droite du bouton Modifier. Le layout des actions est `flex items-center gap-1` dans la section actions de la carte :

```tsx
// Dans le .map() des cartes — section actions (à droite)
<div className="ml-3 flex items-center gap-1">
  {canEdit && (
    <Link href={`/clients/${client.id}/modifier`} ...>
      <Pencil className="h-3.5 w-3.5" />
      Modifier
    </Link>
  )}
  {canDelete && (
    <button
      type="button"
      onClick={() => { setSelectedClient(client); setDeleteDialogOpen(true); }}
      aria-label={`Supprimer ${client.companyName}`}
      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Supprimer
    </button>
  )}
</div>
```

**Refactorer le layout de la carte** : actuellement le bouton Modifier est directement dans `flex items-start justify-between`. Changer pour que la zone droite soit `<div className="ml-3 flex items-center gap-1">` qui contient les deux boutons conditionnels.

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| `db.clients.put({ ...client, deletedAt: now })` | `db.clients.update(clientId, { deletedAt: now, updatedAt: now })` |
| Dialog déclenché via DialogTrigger dans le .map() | Un Dialog unique hors du .map(), `open` contrôlé par état |
| Payload non-vide pour delete | `payload: {}` — le serveur utilise `entityId` uniquement |
| Hard delete `db.clients.delete(id)` | Soft delete `update({ deletedAt: now })` — le serveur fait de même |
| Vérifier les quotes côté serveur | Vérifier `db.quotes.where("clientId")` côté client avant de permettre la suppression |
| Filtrer manuellement les deleted dans ClientList | `use-live-clients.ts` filtre déjà `!c.deletedAt` automatiquement |
| `useLiveQuery` de dexie-react-hooks | `liveQuery + useEffect + subscribe` (pattern établi) |
| Nouvelle route `/clients/[id]/supprimer` | Dialog in-page uniquement |
| Écrire auditMirror dans la transaction applyLocalMutation | Écrire après `await applyLocalMutation(...)` (pattern conflict.ts) |
| `quoteCount` sans reset à `null` sur réouverture | `setQuoteCount(null)` dans le `useEffect` avant le fetch |

### Héritage des stories précédentes

**Story 2-7 (`use-live-clients.ts`) :**
- Ligne 33 filtre déjà `!c.deletedAt` — le client disparaît de la liste automatiquement après soft delete sans code supplémentaire

**Story 2-8 (`client-edit-form.tsx`, `client-list.tsx`) :**
- Pattern `applyLocalMutation + triggerSync + toast` → copier exactement
- Pattern audit mirror APRÈS `applyLocalMutation` (hors transaction)
- `client-list.tsx` actuel : `canCreate: boolean`, `canEdit: boolean` → ajouter `canDelete: boolean`, `userId: string`

**Story 2-1 (outbox.ts) :**
- `applyLocalMutation` signature inchangée — le `type: "delete"` est déjà supporté

**Story 2-6 (`clients/page.tsx`) :**
- Pattern extraction `userId` du session : `(session.user as Record<string, unknown>).id as string`

### Commandes pour le dev agent

```bash
# 1. Docker running
docker compose up -d

# 2. Aucune migration nécessaire — deletedAt déjà dans le schéma
# pnpm db:generate  ← NE PAS LANCER
# pnpm db:migrate   ← NE PAS LANCER

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 2.9] — FR-11 : Suppression soft delete, audit conservation, blocage si devis liés
- [permissions.ts] — `client.delete`: admin=true, commercial=false, operateur=false
- [local-db.ts] — `ClientLocal.deletedAt?`, `SyncOp.type = "delete"`, `db.quotes` (clientId index)
- [use-live-clients.ts] — filtre `!c.deletedAt` sur toArray (ligne 33)
- [push/route.ts §persistEntityMutation] — client delete : `update({ deletedAt: now, revision, updatedAt })` (lignes 208-213)
- [dialog.tsx] — shadcn Dialog, DialogContent, DialogHeader, DialogFooter, DialogClose
- [client-list.tsx] — fichier à modifier, props actuelles `canCreate` + `canEdit`
- [clients/page.tsx] — fichier à modifier, source `session` + `role`
- [Story 2-8 §Dev Notes] — pattern applyLocalMutation update, audit mirror, triggerSync
- [Story 2-7 §Dev Notes] — pattern liveQuery + subscribe, use-live-clients.ts
- [Story 2-6 §Dev Notes] — extraction userId depuis session

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Créé `client-delete-dialog.tsx` : dialog Radix UI avec vérification asynchrone des quotes associés, soft delete via `applyLocalMutation`, audit mirror, triggerSync, toast
- Fix lint `react-hooks/set-state-in-effect` : suppression du `setQuoteCount(null)` synchrone dans le useEffect — remount garanti par `{selectedClient && <ClientDeleteDialog>}` dans le parent
- Fix lint `import/order` : import `@/lib/local-db` placé avant `@/lib/sync/outbox` (ordre alphabétique)
- `client-list.tsx` : props `canDelete + userId` ajoutées, bouton Trash2 avec `aria-label`, un seul dialog hors du `.map()`, layout `flex items-center gap-1` pour les boutons d'action
- `clients/page.tsx` : extraction `userId` depuis `session.user`, calcul `canDelete`, props passées à `<ClientList>`
- `pnpm check` : 0 erreur · 5 warnings préexistants · 204 tests ✓
- `pnpm build` : compilation ✓ sans erreur

### File List

- `src/components/client/client-delete-dialog.tsx` (créé)
- `src/components/client/client-list.tsx` (modifié)
- `src/app/(app)/clients/page.tsx` (modifié)
- `src/app/api/v1/sync/push/route.ts` (modifié — guard serveur client_has_quotes)
- `src/app/api/v1/sync/push/route.test.ts` (modifié — 2 nouveaux tests delete client)

### Change Log

- 2026-06-24 : Implémentation story 2-9 — suppression soft delete client (FR-11) avec vérification quotes, dialog confirmation, audit mirror, sync outbox
- 2026-06-24 : Fix code review — guard serveur `client_has_quotes` dans push/route.ts + 2 tests (422 bloqué, 200 succès)
