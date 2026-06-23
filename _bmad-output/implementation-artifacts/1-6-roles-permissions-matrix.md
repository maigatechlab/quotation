---
story_key: 1-6-roles-permissions-matrix
epic_num: 1
story_num: 6
status: done
baseline_commit: c2da5be45de5dc1795c6fbc33c8e6e5f29995aa2
---

# Story 1.6 : Rôles & matrice de permissions

**Statut :** done

## Story

**En tant que** administrateur de Quotation Logistique,
**Je veux** que chaque utilisateur ait un rôle déterminant ses droits, appliqué côté UI et serveur,
**Afin que** les actions sensibles sont protégées et l'interface n'affiche que le permis.

---

## Critères d'acceptation (BDD)

**AC1 — Vérification du rôle sélectionné au login (wire TODO(1.6))**

```
GIVEN  un utilisateur avec rôle "admin" en base
WHEN   il sélectionne "Commercial" au login et soumet des credentials valides
THEN   Better Auth valide les credentials (login OK)
AND    getSession() est appelé → rôle réel extrait : "admin"
AND    "admin" ≠ "commercial" → signOut() + erreur "Rôle incorrect. Votre rôle est Administrateur."

GIVEN  un utilisateur avec rôle "commercial" en base
WHEN   il sélectionne "Commercial" et soumet des credentials valides
THEN   la vérification passe → markOnline() → router.push("/")
```

**AC2 — Enforcement serveur HTTP 403 via requirePermission**

```
GIVEN  un utilisateur Commercial ou Opérateur authentifié
WHEN   il appelle PATCH /api/v1/users/[id]
THEN   requirePermission(role, "user.manage") lève PermissionError
AND    la réponse est HTTP 403 : { "error": { "code": "FORBIDDEN", "message": "..." } }

GIVEN  un Admin authentifié
WHEN   il appelle PATCH /api/v1/users/[id] avec body { role: "commercial" }
THEN   requirePermission passe → role mis à jour → réponse 200 { id, name, email, role }
```

**AC3 — Masquage UI + redirect pour non-admin**

```
GIVEN  un utilisateur Commercial ou Opérateur connecté
WHEN   il consulte /parametres
THEN   le lien vers /parametres/utilisateurs n'est pas rendu dans le DOM

GIVEN  un Commercial naviguant directement vers /parametres/utilisateurs
WHEN   le Server Component charge
THEN   redirect("/") est appelé immédiatement (can("commercial", "user.manage") = false)
```

**AC4 — Page /parametres/utilisateurs (Admin uniquement)**

```
GIVEN  un Admin connecté à /parametres/utilisateurs
WHEN   la page se charge
THEN   la liste de tous les utilisateurs s'affiche (nom, email, rôle actuel)
AND    chaque utilisateur a un sélecteur de rôle (Admin/Commercial/Opérateur)
AND    la modification d'un rôle appelle PATCH /api/v1/users/[id]
AND    un toast "Rôle mis à jour" confirme le succès
AND    l'Admin ne peut pas changer son propre rôle (bouton désactivé sur sa propre ligne)
```

**AC5 — Contrat ownership (documentation du pattern pour Epic 2+)**

```
GIVEN  les routes quotes/clients (non créées dans cette story)
WHEN   elles seront implémentées (Epic 2+)
THEN   requirePermission(role, "quote.update", quote.ownerId, session.userId) DOIT être appelé
AND    Commercial → "own" → 403 si ownerId ≠ currentUserId
AND    Admin → true → toujours permis

NOTE: Story 1.6 implémente le mécanisme + documente le contrat.
      Les routes quotes/clients sont hors périmètre de cette story.
```

**AC6 — Qualité : pnpm check + build**

```
GIVEN  tous les fichiers créés/modifiés
WHEN   je lance pnpm check
THEN   lint ✓ + typecheck ✓ + tous les tests existants passent
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/session.ts` — MODIFIER : ajouter `getSessionWithRole()` helper server-side
- `src/hooks/use-role.ts` — CRÉER : `useRole()` + `usePermission()` hooks client
- `src/components/auth/login-form.tsx` — MODIFIER : wire vérification rôle post-login (TODO(1.6))
- `src/app/api/v1/users/route.ts` — CRÉER : GET liste utilisateurs (admin only)
- `src/app/api/v1/users/[id]/route.ts` — CRÉER : PATCH mise à jour rôle (admin only)
- `src/app/(app)/parametres/page.tsx` — MODIFIER : Server Component + lien utilisateurs si admin
- `src/app/(app)/parametres/utilisateurs/page.tsx` — CRÉER : page admin gestion utilisateurs
- `src/app/(app)/parametres/utilisateurs/components/user-role-selector.tsx` — CRÉER : client component sélecteur rôle
- `src/messages/fr-NE.json` — MODIFIER : sections "users" + clé "login.roleIncorrect"
- Tests : `src/hooks/use-role.test.ts` + tests routes API

**EXCLU (autres stories) :**
- Remote wipe admin (S7, MVP-1)
- Rate limiting au niveau gateway/middleware (NFR-S6, infrastructure)
- Enforcement ownership sur routes quotes/clients (Epic 2+ — routes non créées)
- UI masquage boutons d'action sur pages devis/clients (Epic 2+)
- Migration `user.role` de `text` vers `userRoleEnum` PG (ne PAS faire — briserait Better Auth)

---

## Tâches / Sous-tâches

### T1 — Étendre `src/lib/session.ts` : ajouter `getSessionWithRole()` (AC: #1, #2, #3, #4)

- [x] Importer `Role` depuis `@/lib/permissions`
- [x] Ajouter type `SessionWithRole = { session: NonNullable<...>, role: Role }`
- [x] Implémenter `getSessionWithRole()` : appelle `auth.api.getSession()`, extrait `role` par cast
- [x] Conserver `requireAuth()` et `getOptionalSession()` inchangés

### T2 — Créer `src/hooks/use-role.ts` : hooks client (AC: #3)

- [x] Directive `"use client"`
- [x] `useRole(): Role` — lit `useSession().data?.user`, caste `role`, fallback "commercial"
- [x] `usePermission(action: Action): boolean` — appelle `can(useRole(), action)`
- [x] Tests unitaires dans `src/hooks/use-role.test.ts` (mock `useSession`)

### T3 — Modifier `src/components/auth/login-form.tsx` : vérification rôle (AC: #1)

- [x] Importer `getSession`, `signOut` depuis `@/lib/auth-client`
- [x] Importer `Role` depuis `@/lib/permissions`
- [x] Ajouter `ROLE_LABELS: Record<Role, string>` dans le fichier
- [x] Après `signIn.email()` succès : appeler `getSession()` → extraire `actualRole`
- [x] Si `actualRole !== selectedRole` : appeler `signOut()` + `setError(roleIncorrectMsg)`
- [x] Si match : `markOnline()` → `router.push("/")` → `router.refresh()` (comportement actuel)
- [x] Retirer le commentaire `TODO(1.6)`

### T4 — Créer `src/app/api/v1/users/route.ts` : GET utilisateurs (AC: #2, #4)

- [x] Importer session, `getSessionWithRole`, `requirePermission`, `PermissionError`
- [x] `GET` : extraire session+role → `requirePermission(role, "user.read")` → query Drizzle
- [x] Colonnes exposées UNIQUEMENT : `id`, `name`, `email`, `role`, `createdAt`
- [x] Ne PAS exposer : `loginAttempts`, `lockedAt`, `password`, `image`
- [x] Mapper snake_case DB → camelCase JSON (standard architecture)
- [x] 401 si pas de session, 403 si pas la permission

### T5 — Créer `src/app/api/v1/users/[id]/route.ts` : PATCH rôle (AC: #2, #4)

- [x] `PATCH` : extraire session+role → `requirePermission(role, "user.manage")`
- [x] Valider body avec Zod : `z.object({ role: z.enum(["admin", "commercial", "operateur"]) })`
- [x] Bloquer auto-dégradation : si `id === session.userId` → 422 "Impossible de modifier son propre rôle"
- [x] Drizzle update `user.role` → réponse `{ id, name, email, role }`
- [x] 404 si utilisateur introuvable

### T6 — Créer `src/app/(app)/parametres/utilisateurs/page.tsx` : page admin (AC: #3, #4)

- [x] Server Component (pas de `"use client"`)
- [x] `getSessionWithRole()` → si null : redirect "/login" ; si `!can(role, "user.manage")` : redirect "/"
- [x] Query Drizzle : tous les utilisateurs (colonnes safe seulement)
- [x] Passer `currentUserId` + liste users au client component `UserManagementTable`
- [x] Titre FR : "Gestion des utilisateurs", sub-titre "Rôles & accès"

### T7 — Créer `src/app/(app)/parametres/utilisateurs/components/user-role-selector.tsx` (AC: #4)

- [x] Directive `"use client"`
- [x] Props : `{ userId: string; currentRole: Role; currentUserId: string; userName: string }`
- [x] Select (shadcn `Select`) avec les 3 rôles, label accessible
- [x] Désactivé si `userId === currentUserId` (admin ne change pas son propre rôle)
- [x] `onChange` → `fetch("PATCH /api/v1/users/[id]", { body: { role } })` → toast succès/erreur
- [x] `isPending` state + disabled durant l'appel
- [x] Messages FR via strings locaux (pas next-intl ici, page admin simple)

### T8 — Modifier `src/app/(app)/parametres/page.tsx` : lien utilisateurs (AC: #3)

- [x] Convertir en Server Component (retirer `"use client"` si présent — ce stub n'en a pas)
- [x] `getSessionWithRole()` → extraire role
- [x] Importer `can` depuis `@/lib/permissions`
- [x] Conditionner : `{can(role, "user.manage") && <Link href="/parametres/utilisateurs">...}}`

### T9 — Mettre à jour `src/messages/fr-NE.json` (AC: #1, #4)

- [x] Ajouter section `"users"` avec les clés listées en Dev Notes
- [x] Ajouter `"login"."roleIncorrect"` (ou vérifier si clé auth déjà présente)

### T10 — Vérification finale (AC: #6)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests ✓
- [x] `pnpm build` : passe sans erreur

---

## Dev Notes

### CRITIQUE — Accès au rôle depuis la session Better Auth

Better Auth v1.6 avec Drizzle adapter retourne TOUS les champs de la table `user` dans `session.user` à runtime (incluant `role`). Les types TypeScript Better Auth ne déclarent pas les champs custom — **caster explicitement** :

```typescript
// Pattern serveur (Server Components, Route Handlers)
import type { Role } from "@/lib/permissions";

const session = await auth.api.getSession({ headers: await headers() });
const role = ((session?.user as Record<string, unknown>)?.role ?? "commercial") as Role;
```

**`getSessionWithRole()` à ajouter dans `src/lib/session.ts` :**

```typescript
import type { Role } from "@/lib/permissions";

export type SessionWithRole = {
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
  role: Role;
};

export async function getSessionWithRole(): Promise<SessionWithRole | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;
  return { session, role };
}
```

**Ne PAS utiliser `requireAuth()` existant pour les pages qui ont besoin du rôle** — il ne retourne pas le rôle.

### CRITIQUE — Hook client `useRole()` dans `src/hooks/use-role.ts`

```typescript
"use client";

import { useSession } from "@/lib/auth-client";
import { can, type Role, type Action } from "@/lib/permissions";

export function useRole(): Role {
  const { data } = useSession();
  return ((data?.user as Record<string, unknown>)?.role ?? "commercial") as Role;
}

export function usePermission(action: Action): boolean {
  const role = useRole();
  return can(role, action);
}
```

- `useSession` est déjà exporté depuis `@/lib/auth-client` — ne PAS le réimporter autrement
- Fallback `"commercial"` = rôle le moins permissif → sûr si session non chargée

### Vérification rôle dans LoginForm — Implémentation exacte

Le `TODO(1.6)` dans `login-form.tsx` ligne 26 doit être câblé. Voici le diff précis :

```typescript
// Imports à ajouter :
import { signIn, signOut, getSession } from "@/lib/auth-client";
import type { Role } from "@/lib/permissions";

// Ajouter après la déclaration ROLES[] :
const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrateur",
  commercial: "Commercial",
  operateur: "Opérateur",
};

// Dans handleSubmit, remplacer le bloc "else" du signIn.email succès :
} else {
  // Vérifier que le rôle sélectionné correspond au rôle réel
  const sessionData = await getSession();
  const actualRole = ((sessionData?.data?.user as Record<string, unknown>)?.role ?? "commercial") as Role;

  if (actualRole !== selectedRole) {
    await signOut({ fetchOptions: { onSuccess: () => {} } });
    setError(`Rôle incorrect. Votre rôle est ${ROLE_LABELS[actualRole]}.`);
    setIsPending(false);
    return;
  }

  markOnline();
  router.push("/");
  router.refresh();
}
```

**Note :** `signOut` était déjà dans le périmètre de l'import `@/lib/auth-client` (exporté mais pas encore importé dans ce fichier). Ajouter à l'import existant.

### requirePermission dans les Route Handlers — Pattern obligatoire

```typescript
// src/app/api/v1/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requirePermission, PermissionError, type Role } from "@/lib/permissions";
import { db } from "@/lib/db";
import { user as userTable } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const patchSchema = z.object({
  role: z.enum(["admin", "commercial", "operateur"]),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Non authentifié." } }, { status: 401 });
  }

  const userRole = ((session.user as Record<string, unknown>).role ?? "commercial") as Role;

  try {
    requirePermission(userRole, "user.manage");
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Action non autorisée." } }, { status: 403 });
    }
    throw err;
  }

  const { id } = await params;

  // Bloquer auto-dégradation
  if (id === session.user.id) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Impossible de modifier son propre rôle." } }, { status: 422 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Données invalides.", fields: parsed.error.flatten().fieldErrors } }, { status: 400 });
  }

  const updated = await db.update(userTable)
    .set({ role: parsed.data.role })
    .where(eq(userTable.id, id))
    .returning({ id: userTable.id, name: userTable.name, email: userTable.email, role: userTable.role });

  if (!updated[0]) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Utilisateur introuvable." } }, { status: 404 });
  }

  return NextResponse.json(updated[0]);
}
```

### API GET /api/v1/users — Colonnes exposées

```typescript
// src/app/api/v1/users/route.ts
// Colonnes sécurisées UNIQUEMENT :
const users = await db.query.user.findMany({
  columns: {
    id: true,
    name: true,
    email: true,
    role: true,
    createdAt: true,
    // loginAttempts: false — JAMAIS exposer
    // lockedAt: false — JAMAIS exposer
  },
  orderBy: (u, { asc }) => [asc(u.createdAt)],
});
```

### Page /parametres/utilisateurs — Structure composants

```
parametres/
  utilisateurs/
    page.tsx                         ← Server Component : auth check + role guard + data fetch
    components/
      user-role-selector.tsx         ← Client Component : select rôle + PATCH fetch
```

Le `page.tsx` passe la liste `users` + `currentUserId` au composant client via props. Pas de `liveQuery` Dexie ici — les utilisateurs sont des données serveur, pas offline.

### Messages JSON à ajouter dans `src/messages/fr-NE.json`

```json
"users": {
  "title": "Utilisateurs",
  "subtitle": "Rôles & accès",
  "roleLabel": "Rôle",
  "updateRoleSuccess": "Rôle mis à jour",
  "updateRoleError": "Erreur lors de la mise à jour du rôle",
  "ownRoleDisabled": "Votre propre rôle",
  "roles": {
    "admin": "Administrateur",
    "commercial": "Commercial",
    "operateur": "Opérateur"
  }
}
```

Ajouter aussi dans `"auth"."login"` :
```json
"roleIncorrect": "Rôle incorrect. Votre rôle est {role}."
```

Note : la vérification de rôle dans `login-form.tsx` utilise `ROLE_LABELS` inline (string interpolation directe) — pas besoin d'utiliser next-intl dans ce composant `"use client"` pour cette clé. Le format avec `{role}` est fourni pour référence si next-intl est câblé plus tard.

### Pièges & anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Migrer `user.role` vers `userRoleEnum` PG | Garder `text("role")` — Better Auth gère la colonne `user`, un changement de type briserait l'adapter |
| `(session.user as any).role` | `((session.user as Record<string, unknown>).role ?? "commercial") as Role` |
| Vérifier permission seulement côté UI | Double enforcement : `requirePermission()` serveur + `can()` UI (jamais UI seul) |
| Exposer `loginAttempts` / `lockedAt` dans la réponse API | Colonnes sensibles — requête avec colonnes explicites uniquement |
| Admin change son propre rôle | Bloquer : 422 si `params.id === session.user.id` |
| Recréer la matrice RBAC | `lib/permissions.ts` est COMPLET — importer et utiliser |
| `useSession` importé depuis `better-auth/react` directement | Toujours importer depuis `@/lib/auth-client` |
| `redirect()` côté client dans un Server Component | `redirect()` de `next/navigation` s'utilise dans les Server Components — correct |
| `"use client"` sur `page.tsx` utilisateurs | La page doit être un Server Component pour le guard d'auth et le fetch initial |

### Héritage stories précédentes — À LIRE OBLIGATOIREMENT

**Story 1.2 — `lib/permissions.ts` COMPLET :**
- `can(role, action)` — UI gate : retourne `boolean` (true même si `"own"`)
- `requirePermission(userRole, action, ownerId?, currentUserId?)` — server guard, lève `PermissionError`
- `PermissionError` — statusCode 403, importable
- `PERMISSION_MATRIX` complet : admin (tout), commercial (own sur write), opérateur (read-only)
- `user.read` : admin ✓, commercial ✗, opérateur ✗
- `user.manage` : admin ✓ seulement
- **Ne PAS recréer cette logique nulle part**

**Story 1.4 — Login et lockout :**
- `loginAttempts`, `lockedAt` dans la table `user` — sensibles, jamais exposer
- `checkAccountLockout` / `recordLoginAttempt` dans `lib/lockout.ts`

**Story 1.5 — `src/lib/session.ts` existant :**
- `requireAuth()` — redirige vers "/" si pas de session (ATTENTION : redirige "/" pas "/login")
- `getOptionalSession()` — retourne null si non auth
- ÉTENDRE ce fichier, ne PAS réécrire

**Auth client exports disponibles (`@/lib/auth-client`) :**
```typescript
signIn, signOut, signUp, useSession, getSession,
requestPasswordReset, resetPassword, sendVerificationEmail
```

**Conventions projet-context.md rappel :**
- `"use client"` double quotes, première ligne, pas de blank line avant
- Import order : React/Next → external → `@/*` → relative
- Toujours `semicolons`, `100 cols max`
- Composants : PascalCase ; hooks : `use` prefix ; fichiers : kebab-case
- Props interface avant le composant

---

## Références

- `src/lib/permissions.ts` — matrice RBAC, can(), requirePermission(), PermissionError
- `src/lib/schema.ts:29-30` — `userRoleEnum` défini, `user.role` = `text` (ligne 48)
- `src/lib/session.ts` — requireAuth(), getOptionalSession() à étendre avec getSessionWithRole()
- `src/lib/auth-client.ts` — signIn, signOut, useSession, getSession exportés
- `src/components/auth/login-form.tsx:26` — TODO(1.6) câblage vérification rôle
- `_bmad-output/implementation-artifacts/deferred-work.md` — selectedRole cosmétique déféré à Story 1.6
- [Architecture §RBAC] — double enforcement, requirePermission avant toute mutation
- [Architecture §API] — enveloppe `{ error: { code, message, fields? } }`, statuts 401/403/422
- [Architecture §Structure] — routes API sous `src/app/api/v1/`, colonnes snake_case DB → camelCase JSON

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `@testing-library/react` absent → installé en devDep pour renderHook dans les tests hooks
- Avertissement ESLint `import/order` ligne 3 de `use-role.test.ts` : pattern vi.mock hoisting inévitable, 0 erreur, 0 impact build

### Completion Notes List

- T1 : `getSessionWithRole()` + `SessionWithRole` type ajoutés à `src/lib/session.ts` sans toucher `requireAuth()`/`getOptionalSession()`
- T2 : `useRole()` + `usePermission()` créés dans `src/hooks/use-role.ts` ; 9 tests unitaires tous verts
- T3 : `login-form.tsx` câblé — après login, getSession() vérifie rôle réel vs sélectionné, signOut + erreur si mismatch, TODO(1.6) retiré
- T4 : `GET /api/v1/users` — 401/403 guards, colonnes sécurisées uniquement (pas loginAttempts/lockedAt)
- T5 : `PATCH /api/v1/users/[id]` — requirePermission, Zod validation, 422 anti-self-dégradation, 404 si absent
- T6 : `/parametres/utilisateurs/page.tsx` — Server Component, double guard auth+permission, data fetch Drizzle
- T7 : `UserRoleSelector` + `UserManagementTable` — shadcn Select installé, isPending, toast succès/erreur, ligne propre désactivée pour l'admin
- T8 : `/parametres/page.tsx` converti en Server Component, lien utilisateurs conditionnel via `can(role, "user.manage")`
- T9 : `fr-NE.json` — section `users` complète + `login.roleIncorrect`
- T10 : `pnpm check` ✓ (0 erreur, 1 avertissement import/order vitest-hoisting), `pnpm build` ✓

### File List

- `src/lib/session.ts` — modifié : +`SessionWithRole`, +`getSessionWithRole()`
- `src/hooks/use-role.ts` — créé : `useRole()`, `usePermission()`
- `src/hooks/use-role.test.ts` — créé : 9 tests unitaires
- `src/components/auth/login-form.tsx` — modifié : vérification rôle post-login, ROLE_LABELS, TODO retiré
- `src/app/api/v1/users/route.ts` — créé : GET utilisateurs (admin only)
- `src/app/api/v1/users/[id]/route.ts` — créé : PATCH rôle (admin only)
- `src/app/(app)/parametres/utilisateurs/page.tsx` — créé : page admin Server Component
- `src/app/(app)/parametres/utilisateurs/components/user-role-selector.tsx` — créé : UserRoleSelector + UserManagementTable
- `src/app/(app)/parametres/page.tsx` — modifié : Server Component + lien admin conditionnel
- `src/messages/fr-NE.json` — modifié : +section `users`, +`login.roleIncorrect`
- `src/components/ui/select.tsx` — créé via shadcn CLI
- `package.json` / `pnpm-lock.yaml` — modifié : +`@testing-library/react` devDep, +shadcn Select deps

### Change Log

- **2026-06-23** : Story 1.6 créée — Rôles & matrice de permissions.
- **2026-06-23** : Story 1.6 implémentée — tous les ACs satisfaits, 151 tests verts, build ✓ — statut → review
- **2026-06-23** : Corrections code review — P1: callbackURL retiré (race condition AC1), P2: UserRoleSelector contrôlé avec revert, P2: 11 tests API routes ajoutés (401/403/422/400/404/200) — 162 tests verts
- **2026-06-23** : P3: req.json() wrappé try/catch → 400 au lieu de 500 sur JSON malformé, test ajouté — 163 tests verts — revue finale : aucun finding bloquant → statut **done**
