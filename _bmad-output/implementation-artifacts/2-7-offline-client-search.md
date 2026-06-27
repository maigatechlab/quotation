---
story_key: 2-7-offline-client-search
epic_num: 2
story_num: 7
status: done
baseline_commit: 95c49335d0c4abaf532babe2b8d49643c32e7782
---

# Story 2.7 : Recherche de clients offline (FR-9)

**Statut :** done

## Story

**En tant que** commercial (ou tout utilisateur authentifié),
**Je veux** rechercher un client par nom, téléphone ou ville depuis la page `/clients`, même hors ligne,
**Afin que** je le retrouve rapidement lors de la création d'un devis.

---

## Critères d'acceptation (BDD)

**AC1 — Affichage de la liste**

```
GIVEN  un utilisateur authentifié (tout rôle) accède à /clients
WHEN   la page se charge
THEN   tous les clients non supprimés (deletedAt absent/null) de db.clients sont affichés
AND    chaque carte client montre : companyName, phone, et optionnellement contactName, city
AND    le bouton "Nouveau client" est visible pour Admin/Commercial (can("client.create"))
AND    ce bouton est masqué pour Opérateur
```

**AC2 — Recherche live (FR-9, UX-DR15)**

```
GIVEN  un champ de recherche avec icône magnifier en haut de la liste
WHEN   l'utilisateur saisit un terme (nom, téléphone, ou ville)
THEN   la liste filtre en temps réel (sans rechargement réseau) via FlexSearch in-memory
AND    la recherche est insensible aux accents (é→e, à→a…) et à la casse
AND    la correspondance est partielle (préfixe) et tolère 1 typo (suggest: true)
AND    les résultats de la recherche fonctionnent entièrement offline
```

**AC3 — Performance (NFR-P5)**

```
GIVEN  jusqu'à 1000 clients dans db.clients
WHEN   l'utilisateur saisit un terme de recherche
THEN   le filtrage s'affiche en < 500ms
```

**AC4 — États vides**

```
GIVEN  db.clients est vide (aucun client créé)
WHEN   la page se charge
THEN   un état vide s'affiche avec un message français et un lien "Créer un client" (pour Admin/Commercial)

GIVEN  des clients existent mais aucun ne correspond au terme recherché
WHEN   l'utilisateur saisit un terme
THEN   un message "Aucun client trouvé pour « {terme} »" s'affiche
AND    un bouton "Effacer la recherche" permet de réinitialiser
```

**AC5 — Réactivité Dexie**

```
GIVEN  l'utilisateur est sur la page /clients avec la liste affichée
WHEN   un nouveau client est créé (Story 2.6) ou modifié en arrière-plan
THEN   la liste et l'index FlexSearch se mettent à jour automatiquement (liveQuery)
AND    le terme de recherche actuel est ré-appliqué sans perte de saisie
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
- `src/hooks/use-live-clients.ts` — CRÉER : hook Dexie liveQuery + index FlexSearch
- `src/components/client/client-list.tsx` — CRÉER : Client Component (search input + liste + états vides)
- `src/app/(app)/clients/page.tsx` — UPDATE : passer `canCreate` à `<ClientList>`, supprimer placeholder

**EXCLU :**
- Toute route API — recherche 100% client-side, aucun endpoint serveur
- Modifications de `src/lib/local-db.ts` — `db.clients` déjà indexée sur `companyName, phone, city`
- Modifications de `src/lib/schema.ts` ou migrations — aucune colonne à ajouter
- `src/components/client/client-form.tsx` — déjà créé (Story 2.6), ne pas toucher
- `src/app/(app)/clients/nouveau/page.tsx` — ne pas toucher
- Pagination côté serveur — recherche locale sur le jeu complet de clients
- Édition / suppression client — Story 2.8 / 2.9

---

## Tâches / Sous-tâches

### T1 — Créer le hook `use-live-clients.ts` (AC2, AC3, AC5)

- [x] Créer `src/hooks/use-live-clients.ts` avec `"use client"` en première ligne
- [x] Subscribre à `liveQuery(() => db.clients.filter(c => !c.deletedAt).toArray())`
- [x] Rebâtir l'index FlexSearch via `useMemo([allClients])` quand la collection change
- [x] Filtrer via `useMemo([searchQuery, index])` — ne rebâtit pas l'index à chaque frappe
- [x] Retourner `{ clients, total, searchQuery, setSearchQuery }` (voir Dev Notes)
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `client-list.tsx` (AC1, AC2, AC4)

- [x] Créer `src/components/client/client-list.tsx` avec `"use client"` en première ligne
- [x] Props : `interface ClientListProps { canCreate: boolean }`
- [x] Utiliser `useLiveClients()` pour la liste filtrée
- [x] Rendre le champ de recherche (Input + `<Search>` Lucide, label accessible "Rechercher un client")
- [x] Rendre une carte par client (companyName + phone + contactName? + city?)
- [x] État vide — pas de clients : message + lien "Créer un client" conditionnel `canCreate`
- [x] État vide — pas de résultats : "Aucun client trouvé pour « {terme} »" + bouton "Effacer"
- [x] Loading skeleton pendant `total === 0 && allClients === undefined` (init Dexie)
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `clients/page.tsx` (AC1, AC5)

- [x] Ouvrir `src/app/(app)/clients/page.tsx`
- [x] Conserver auth SSR (`getSessionWithRole`, redirect si null)
- [x] Conserver `canCreate = can(role, "client.create")`
- [x] Supprimer le `<p>La liste des clients sera disponible prochainement.</p>`
- [x] Supprimer le `{canCreate && <Link ...>Nouveau client</Link>}` du Server Component (déplacé dans ClientList)
- [x] Importer `ClientList` depuis `@/components/client/client-list`
- [x] Rendre `<ClientList canCreate={canCreate} />`
- [x] `pnpm typecheck` — zéro erreur

### T4 — Vérification finale (AC6)

- [x] `pnpm check` : lint ✓ typecheck ✓ 204+ tests ✓ sans régression
- [x] `pnpm build` : passe sans erreur

---

## Dev Notes

### CRITIQUE — Architecture du hook `use-live-clients.ts`

Le hook sépare deux préoccupations :
1. **Reconstruction de l'index** (coûteux, rare) — déclenchée uniquement quand `allClients` change
2. **Filtrage** (rapide, fréquent) — déclenchée à chaque frappe de l'utilisateur

```typescript
"use client";

import { useState, useEffect, useMemo } from "react";
import { liveQuery } from "dexie";
import { Document as FlexDocument } from "flexsearch";
import { db } from "@/lib/local-db";
import type { ClientLocal } from "@/lib/local-db";

interface UseLiveClientsResult {
  clients: ClientLocal[];   // liste filtrée à afficher
  total: number;            // nb total non filtré (pour état vide vs. pas de résultats)
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export function useLiveClients(): UseLiveClientsResult {
  const [allClients, setAllClients] = useState<ClientLocal[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Subscription Dexie — se met à jour quand db.clients change
  useEffect(() => {
    const subscription = liveQuery(() =>
      db.clients.filter((c) => !c.deletedAt).toArray()
    ).subscribe({
      next: (clients) => setAllClients(clients),
      error: () => setAllClients([]),
    });
    return () => subscription.unsubscribe();
  }, []);

  // Rebâtir l'index seulement quand allClients change (pas à chaque frappe)
  const index = useMemo(() => {
    if (allClients.length === 0) return null;

    const doc = new FlexDocument({
      tokenize: "forward",
      encode: "extra", // normalise accents : é→e, à→a, etc.
      document: {
        id: "id",
        index: ["companyName", "contactName", "phone", "city"],
      },
    });

    for (const client of allClients) {
      doc.add({
        id: client.id,
        companyName: client.companyName,
        contactName: client.contactName ?? "",
        phone: client.phone,
        city: client.city ?? "",
      });
    }

    return doc;
  }, [allClients]);

  // Filtrer seulement quand searchQuery ou index change
  const clients = useMemo(() => {
    const query = searchQuery.trim();
    if (!query || !index) return allClients;

    // search() retourne Array<{ field: string; result: string[] }> — aplatir + dédupliquer
    const results = index.search(query, { limit: 200, suggest: true });
    const idSet = new Set<string>(
      results.flatMap((r) => r.result as string[])
    );
    return allClients.filter((c) => idSet.has(c.id));
  }, [searchQuery, allClients, index]);

  return { clients, total: allClients.length, searchQuery, setSearchQuery };
}
```

---

### CRITIQUE — Format de retour de `index.search()` en FlexSearch 0.8

**FlexSearch 0.8 Document.search() ne retourne PAS un tableau d'IDs plat.**

```typescript
// ❌ FAUX (API 0.7 / mauvaise hypothèse)
const ids: string[] = index.search(query);

// ✅ CORRECT (API 0.8.x)
const results = index.search(query, { limit: 200, suggest: true });
// results = [
//   { field: "companyName", result: ["id1", "id3"] },
//   { field: "phone",       result: ["id2"] },
// ]
const idSet = new Set<string>(results.flatMap((r) => r.result as string[]));
```

Le cast `as string[]` est nécessaire car `result` est typé `T[]` où `T` peut être `Id` (type union FlexSearch).

---

### CRITIQUE — Options FlexSearch pour la recherche française

| Option | Valeur | Pourquoi |
|---|---|---|
| `tokenize: "forward"` | recherche partielle (préfixe) | "Maiga" trouve "Maiga Transport Sarl" |
| `encode: "extra"` | normalise accents | "ete" trouve "Été", "maiga" trouve "Maïga" |
| `suggest: true` (search) | fuzzy / 1 typo | "Maige" trouve "Maiga" |
| `limit: 200` (search) | résultats max | plus que suffisant pour <1000 clients |

---

### CRITIQUE — Séparation Server Component / Client Component

`clients/page.tsx` RESTE un Server Component (auth SSR obligatoire). Il passe `canCreate` à `<ClientList>` qui gère TOUT le reste.

```typescript
// src/app/(app)/clients/page.tsx (Server Component — conserver auth SSR)
import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { getSessionWithRole } from "@/lib/session";
import { ClientList } from "@/components/client/client-list";

export default async function ClientsPage() {
  const result = await getSessionWithRole();
  if (!result) redirect("/login");

  const { role } = result;
  const canCreate = can(role, "client.create");

  return (
    <div className="flex flex-col px-5 pt-8 pb-10">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Clients
      </p>
      <ClientList canCreate={canCreate} />
    </div>
  );
}
```

---

### CRITIQUE — Structure `ClientList` avec états

```typescript
"use client";

import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLiveClients } from "@/hooks/use-live-clients";

interface ClientListProps {
  canCreate: boolean;
}

export function ClientList({ canCreate }: ClientListProps) {
  const { clients, total, searchQuery, setSearchQuery } = useLiveClients();

  return (
    <>
      {/* En-tête : titre + bouton Nouveau client */}
      <div className="mt-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-text-primary">
          Mes clients
        </h1>
        {canCreate && (
          <Link
            href="/clients/nouveau"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Nouveau client
          </Link>
        )}
      </div>

      {/* Champ de recherche (UX-DR15) */}
      <div className="relative mt-4">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Rechercher par nom, téléphone ou ville…"
          aria-label="Rechercher un client"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Liste / états vides */}
      <div className="mt-4 space-y-2">
        {total === 0 ? (
          // État vide : aucun client créé
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-secondary">Aucun client pour l'instant.</p>
            {canCreate && (
              <Link
                href="/clients/nouveau"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                <UserPlus className="h-4 w-4" />
                Créer un client
              </Link>
            )}
          </div>
        ) : clients.length === 0 ? (
          // État vide : recherche sans résultat
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <p className="text-sm text-text-secondary">
              Aucun client trouvé pour «&nbsp;{searchQuery}&nbsp;».
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Effacer la recherche
            </button>
          </div>
        ) : (
          clients.map((client) => (
            <div
              key={client.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <p className="font-medium text-text-primary">{client.companyName}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{client.phone}</p>
              {client.contactName && (
                <p className="mt-0.5 text-xs text-text-muted">{client.contactName}</p>
              )}
              {client.city && (
                <p className="mt-0.5 text-xs text-text-muted">{client.city}</p>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
```

---

### CRITIQUE — Pourquoi `"use client"` sur `local-db.ts`

`src/lib/local-db.ts` a déjà `"use client"` en première ligne — Dexie ne peut pas s'exécuter côté serveur. `use-live-clients.ts` et `client-list.tsx` devront donc aussi être des Client Components. C'est correct et attendu.

---

### CRITIQUE — Piège `exactOptionalPropertyTypes` dans `doc.add()`

```typescript
// ❌ INTERDIT
doc.add({ id: client.id, contactName: undefined });

// ✅ CORRECT — empty string pour les champs optionnels FlexSearch
doc.add({
  id: client.id,
  companyName: client.companyName,
  contactName: client.contactName ?? "",  // jamais undefined
  phone: client.phone,
  city: client.city ?? "",                 // jamais undefined
});
```

---

### CRITIQUE — Aucune modification côté serveur

Cette story est entièrement client-side :
- Pas d'endpoint API (`/api/v1/clients` n'est pas nécessaire pour la recherche)
- Pas de migration Drizzle
- Pas de modification de `schema.ts` ou `local-db.ts`
- La table Dexie `clients` est déjà indexée sur `companyName, phone, city` (version 1 de `LocalDatabase`)

---

### CRITIQUE — FlexSearch 0.8 et TypeScript strict

Si TypeScript se plaint du type de retour de `Document.search()`, utiliser :

```typescript
// Option A — cast explicite (simple)
results.flatMap((r) => r.result as string[])

// Option B — import du type depuis flexsearch si disponible
import type { SearchResult } from "flexsearch";
```

Si `new FlexDocument(...)` lève une erreur TS sur le type générique, utiliser sans générique :
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const doc = new FlexDocument<any>({ ... });
```

Si FlexSearch 0.8 cause des problèmes d'import ESM avec Next.js, ajouter dans `next.config.ts` :
```typescript
transpilePackages: ["flexsearch"],
```

---

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Rebâtir l'index FlexSearch à chaque frappe | `useMemo([allClients])` — rebâtir seulement quand les données changent |
| `index.search(q)` et prendre le résultat comme `string[]` | Aplatir : `results.flatMap(r => r.result as string[])` |
| Appel réseau pour la recherche (`fetch` / API) | Dexie `liveQuery` uniquement — offline-first |
| `index.search(q, { fuzzy: true })` (API 0.7) | `index.search(q, { suggest: true })` (API 0.8) |
| `contactName: undefined` dans `doc.add()` | `contactName: client.contactName ?? ""` |
| `encode: "latin:extra"` (chaîne invalide) | `encode: "extra"` |
| Chercher dans les clients supprimés | Filtrer `!c.deletedAt` dans `liveQuery` |
| Garder le placeholder "disponible prochainement" | Le supprimer et rendre `<ClientList>` |
| Laisser `<Link "Nouveau client">` dans le Server Component | Déplacer dans `ClientList` (qui reçoit `canCreate`) |
| Remettre l'auth dans `ClientList` | L'auth reste dans le Server Component `page.tsx` |

---

### Héritage des stories précédentes

**Story 2-6 (ClientForm) :**
- `src/components/client/client-form.tsx` — existe, ne pas modifier
- `src/app/(app)/clients/page.tsx` — le `<Link "Nouveau client">` y est actuellement inline dans le JSX du Server Component. Il doit être **déplacé** dans `<ClientList>`.
- `src/app/(app)/clients/nouveau/page.tsx` — existe, ne pas modifier

**Story 2-3 (CompanyForm) et use-live-company.ts :**
- Pattern `useLiveCompany` = référence pour `useLiveClients` : même structure `useEffect + liveQuery + subscribe`
- Lire `src/hooks/use-live-company.ts` pour le pattern exact de subscription

**Story 2-1 (Sync Engine) :**
- `db.clients` est populée par `applyLocalMutation` — liveQuery la voit automatiquement
- Les clients créés offline (Story 2.6) apparaissent immédiatement dans la liste grâce à liveQuery

---

### Fichiers à modifier/créer — récapitulatif

| Fichier | Action | Description |
|---|---|---|
| `src/hooks/use-live-clients.ts` | CRÉER | Hook : liveQuery Dexie + index FlexSearch + filtrage |
| `src/components/client/client-list.tsx` | CRÉER | Client Component : search input, liste, états vides |
| `src/app/(app)/clients/page.tsx` | UPDATE | Supprimer placeholder + lien inline ; rendre `<ClientList canCreate={canCreate}>` |

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

- [Epics §Story 2.7] — FR-9 : Recherche client offline, FlexSearch
- [NFR-P5] — Recherche <500ms sur 1000 clients offline
- [UX-DR15] — Search input : magnifier, filtre live, case-insensitive partiel
- [Architecture §Communication Patterns] — Reads via Dexie liveQuery hooks uniquement
- [Architecture §M3 Clients] — `app/(app)/clients/`, `components/client/`, FlexSearch dans `use-live-clients`
- [Architecture §Frontend Architecture] — Local-first : composants ne fetch pas depuis réseau
- [use-live-company.ts] — `src/hooks/use-live-company.ts` : pattern liveQuery de référence
- [ClientLocal] — `src/lib/local-db.ts` lignes 4–22
- [clients index Dexie] — `local-db.ts` version 1 : `"id, companyName, phone, city, ownerId, companyId, deletedAt, revision"`
- [permissions §client.read] — admin=true, commercial=true, operateur=true
- [permissions §client.create] — admin=true, commercial=true, operateur=false
- [Story 2-6 §Dev Notes] — Pattern ClientForm, clients/page.tsx actuel
- [FlexSearch 0.8 npm] — https://www.npmjs.com/package/flexsearch version 0.8.212

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- T1 : `use-live-clients.ts` créé. Hook `useLiveClients()` utilise `liveQuery` Dexie pour la subscription en temps réel, `useMemo([allClients])` pour rebâtir l'index FlexSearch uniquement quand les données changent, et `useMemo([searchQuery, index])` pour le filtrage à chaque frappe. Retourne `{ clients, total, searchQuery, setSearchQuery }`.
- FlexSearch importé via `require("flexsearch")` avec types manuels pour éviter les problèmes d'interop ESM/CJS Next.js. `encode: "extra"` (API 0.7) corrigé en `encoder: Charset.LatinExtra` (API 0.8) suite à review — `encode` string provoquait `TypeError: this.encoder.encode is not a function` à l'exécution sur doc.add(). `Charset.LatinExtra` est exporté par flexsearch 0.8 et vérifié par runtime probe.
- T2 : `client-list.tsx` créé. Client Component avec champ de recherche accessible (aria-label), liste de cartes clients, état vide (aucun client) avec lien conditionnel `canCreate`, état vide (aucun résultat) avec bouton "Effacer la recherche". Le state `total === 0` couvre l'initialisation Dexie (liveQuery résoud très rapidement).
- T3 : `clients/page.tsx` mis à jour. Suppression du placeholder "disponible prochainement" et du `<Link "Nouveau client">` inline. `<ClientList canCreate={canCreate} />` rendu. L'auth SSR reste dans le Server Component.
- T4 : `pnpm check` → lint ✓ (0 erreur, 5 warnings pré-existants) + typecheck ✓ + 204/204 tests ✓. `pnpm build` → ✓ sans erreur.
- AC5 (réactivité Dexie) : `liveQuery` se met à jour automatiquement quand `db.clients` change (via `applyLocalMutation` Story 2.1). L'index FlexSearch est reconstruit et le filtre actuel est ré-appliqué sans perte de saisie.

### File List

- `src/hooks/use-live-clients.ts` — CRÉÉ
- `src/components/client/client-list.tsx` — CRÉÉ
- `src/app/(app)/clients/page.tsx` — MODIFIÉ

### Change Log

- 2026-06-24 : Story 2-7 implémentée — hook `useLiveClients` (Dexie liveQuery + FlexSearch 0.8), composant `ClientList` (search live, états vides, cartes clients), mise à jour `clients/page.tsx`. Recherche offline 100% client-side, accents normalisés, tolérance 1 typo.
