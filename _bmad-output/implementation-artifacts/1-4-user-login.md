---
story_key: 1-4-user-login
epic_num: 1
story_num: 4
status: done
baseline_commit: c2da5be45de5dc1795c6fbc33c8e6e5f29995aa2
---

# Story 1.4 : Connexion utilisateur (FR-1)

**Statut :** done

## Story

**En tant que** utilisateur (Commercial / Admin / Opérateur) de l'équipe Maiga Tech Lab,
**Je veux** me connecter avec email et mot de passe et conserver ma session pendant 7 jours sans réseau,
**Afin que** j'accède à l'application même en zone à faible connectivité Sahel.

---

## Critères d'acceptation (BDD)

**AC1 — Écran de connexion conforme à EXPERIENCE.md Flow 3**

```
GIVEN  un utilisateur non authentifié à /login
WHEN   la page se rend
THEN   le logo mark "Q" + le nom "Quotation · Logistique" en Spectral sont visibles
AND    le formulaire contient : champ Email, champ Mot de passe, bouton "Se connecter"
AND    un segmented control 3 rôles (Administrateur | Commercial | Opérateur) est affiché,
       Commercial sélectionné par défaut
AND    le footer affiche : point vert · "Fonctionne hors ligne · session 7 jours"
AND    un lien "Mot de passe oublié ?" est visible (→ /forgot-password, périmètre Story 1.7)
AND    tous les textes sont en français (aucun mot anglais visible à l'utilisateur)
```

**AC2 — Connexion réussie**

```
GIVEN  un utilisateur avec credentials valides
WHEN   je soumets le formulaire
THEN   Better Auth authenticate (bcrypt, NFR-S1), une session JWT 7 jours est créée (NFR-S3)
AND    je suis redirigé vers /   (Dashboard — shell construit en Story 1.5)
AND    le timestamp lastOnlineAt est sauvegardé dans localStorage
```

**AC3 — Credentials invalides**

```
GIVEN  un email ou mot de passe incorrect
WHEN   je soumets le formulaire
THEN   HTTP 401 est retourné par Better Auth
AND   un message d'erreur français inline s'affiche sous le formulaire :
       "Email ou mot de passe incorrect."
AND   aucune info technique n'est exposée à l'utilisateur (jamais de stack trace)
```

**AC4 — Verrouillage après 5 échecs (NFR-S6)**

```
GIVEN  5 tentatives de connexion échouées consécutives depuis le même compte
WHEN   la 6ème tentative est soumise
THEN   le compte est verrouillé (Better Auth maxLoginAttempts=5)
AND   un message français s'affiche : "Compte temporairement verrouillé.
       Contactez l'administrateur pour déverrouiller."
AND   le déverrouillage est possible uniquement par un Admin via la page utilisateurs
       (Story 1.6 — périmètre gestion des rôles)
```

**AC5 — Session offline 7 jours (FR-1)**

```
GIVEN  une session active avec lastOnlineAt enregistré
WHEN   l'utilisateur est hors ligne et revient dans les 7 jours
THEN   l'accès est maintenu sans re-authentification réseau

GIVEN  une session active et lastOnlineAt > 7 jours dans localStorage
WHEN  n'importe quelle page (app) est chargée
THEN   useOfflineSession hook détecte le dépassement
AND    l'utilisateur est redirigé vers /login?reason=session-expired
AND    un message s'affiche : "Session expirée. Reconnectez-vous pour continuer."
```

**AC6 — Vérification de révocation au reconnect (FR-1)**

```
GIVEN  une session active en mode offline
WHEN   le réseau est restauré (événement "online")
THEN   useOfflineSession appelle authClient.getSession() pour rafraîchir + vérifier côté serveur
AND    si la session est valide → lastOnlineAt est mis à jour dans localStorage
AND    si la session est révoquée (résultat null / 401) → purgeLocalData() est appelé
AND    l'utilisateur est redirigé vers /login?reason=session-revoked
AND    un message s'affiche : "Session révoquée. Reconnectez-vous."
```

**AC7 — Conformité a11y (NFR-A1/A2/A3)**

```
GIVEN  la page de login
WHEN  je navigue au clavier ou avec un lecteur d'écran
THEN   chaque champ est labellisé (htmlFor/id), ring navy visible sur focus
AND    le segmented control expose aria-pressed / role="tab"+aria-selected
AND    les erreurs sont associées aux champs via aria-describedby
AND    les cibles sont ≥44×44px (boutons, liens, segmented control)
```

**AC8 — Qualité : pnpm check + tests**

```
GIVEN  tous les fichiers modifiés/créés
WHEN   je lance pnpm check
THEN   lint ✓ + typecheck ✓ + test ✓ (113 tests existants + nouveaux 1.4)
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/auth/login-form.tsx` — CRÉER : nouveau composant formulaire login (remplace sign-in-button dans /login)
- `src/app/(auth)/login/page.tsx` — MODIFIER : utiliser LoginForm, corriger redirect `/dashboard` → `/`, ajouter gestion query param `reason`
- `src/lib/auth.ts` — MODIFIER : ajouter `maxLoginAttempts: 5`
- `src/hooks/use-offline-session.ts` — CRÉER : hook gestion offline 7j + révocation
- `src/lib/local-purge.ts` — CRÉER : helper purge Dexie + localStorage
- `src/messages/fr-NE.json` — MODIFIER : ajouter clés i18n pour la page login
- Tests unitaires/intégration pour le hook useOfflineSession

**EXCLU (autres stories) :**
- App shell + bottom nav → **Story 1.5**
- RBAC complet (can/requirePermission sur routes API) → **Story 1.6**
- Fonctionnalité réinitialisation mot de passe (UI + token) → **Story 1.7**
- PWA install/update prompt → **Story 1.8**
- Déverrouillage admin du compte → **Story 1.6**
- Nettoyage des routes starter kit (/dashboard, /chat, /profile, /register) → périmètre non défini, ne pas toucher pour l'instant
- `src/components/auth/sign-in-button.tsx` → NE PAS SUPPRIMER (utilisé peut-être ailleurs), mais la page /login n'utilisera plus ce composant

---

## Tâches / Sous-tâches

### T1 — Configurer le verrouillage de compte dans Better Auth (AC: #4)

- [x] Ouvrir `src/lib/auth.ts`
- [x] Better Auth v1.6 n'a pas `maxLoginAttempts` natif — plugin custom + champs DB (`loginAttempts`, `lockedAt`)
- [x] Migration `0005_huge_wallop.sql` générée et appliquée
- [x] Plugin `accountLockoutPlugin` avec hooks `before` (check lockout) et `after` (incrément/reset)

### T2 — Créer `src/lib/local-purge.ts` (AC: #6)

- [x] Implémenter `purgeLocalData(): Promise<void>`
- [x] Supprimer la base Dexie `db` entière via `db.delete()` (reset + suppression IndexedDB)
- [x] Retirer la clé `quotation_last_online_at` du localStorage
- [x] Module "use client" compatible (Web APIs uniquement, pas de Node.js)

### T3 — Créer `src/hooks/use-offline-session.ts` (AC: #5, #6)

- [x] Importer : `useSession` depuis `@/lib/auth-client`, `getSession`/`authClient`, `useRouter`
- [x] Constante `LAST_ONLINE_KEY = "quotation_last_online_at"` et `SESSION_MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000`
- [x] Effect 1 — mise à jour lastOnlineAt : si `session && navigator.onLine` → `localStorage.setItem(LAST_ONLINE_KEY, Date.now().toString())`; écoute événement "online"
- [x] Effect 2 — vérification durée offline : calculer `Date.now() - parseInt(lastOnlineAt)` ; si > 7j → `router.push("/login?reason=session-expired")`; vérifier à l'init + `setInterval` 60s
- [x] Effect 3 — vérification révocation au reconnect : écoute événement "online" → appelle `getSession()` → si session null → `purgeLocalData()` puis `router.push("/login?reason=session-revoked")`
- [x] Exporter `export function useOfflineSession(): void`
- [x] NE PAS appeler le hook si `!session` (guard en début de hook)

### T4 — Créer `src/components/auth/login-form.tsx` (AC: #1, #2, #3, #4, #7)

- [x] Directive `"use client"` en première ligne
- [x] Props: aucune (standalone)
- [x] States: `email`, `password`, `selectedRole` (default `"commercial"`), `error`, `isPending`
- [x] Rôles disponibles: `["admin", "commercial", "operateur"]` avec labels FR `["Administrateur", "Commercial", "Opérateur"]`
- [x] Segmented control : 3 boutons role, `aria-pressed`, ring navy sur focus ; MVP-0 : la sélection est UX uniquement, n'affecte pas l'auth (role vient de user.role en DB)
- [x] handleSubmit : `signIn.email({ email, password, callbackURL: "/" })`
- [x] Gestion erreur : détecter `"ACCOUNT_LOCKED"` ou `"TOO_MANY_ATTEMPTS"` → message verrouillage ; sinon → "Email ou mot de passe incorrect."
- [x] Bouton "Se connecter" : inline spinner `isPending`, full-width, navy fill (classe `btn-primary`)
- [x] Lien "Mot de passe oublié ?" → `/forgot-password` (Story 1.7)
- [x] Footer : `<p>` point vert + "Fonctionne hors ligne · session 7 jours"
- [x] Erreur associée au formulaire via `aria-describedby`
- [x] Toutes cibles ≥44×44px
- [x] Zéro texte anglais visible utilisateur

### T5 — Modifier `src/app/(auth)/login/page.tsx` (AC: #1, #2, #5)

- [x] Importer `LoginForm` depuis `@/components/auth/login-form`
- [x] Changer redirect authed user : `redirect("/dashboard")` → `redirect("/")`
- [x] Lire `searchParams.reason` : si `"session-expired"` ou `"session-revoked"` → afficher message FR correspondant au-dessus du formulaire
- [x] Remplacer `<SignInButton />` par `<LoginForm />`
- [x] Ajouter logo mark (img `/logo-mark.svg` ou SVG inline) + titre "Quotation · Logistique" en Spectral au-dessus du formulaire
- [x] Garder la vérification de session existante (Server Component check → redirect si déjà auth)

### T6 — Mettre à jour `src/messages/fr-NE.json` (AC: #1)

- [x] Ajouter section `"auth"` avec clés : `login.title`, `login.email`, `login.password`, `login.submit`, `login.forgotPassword`, `login.offlineSession`, `login.errorInvalid`, `login.errorLocked`, `login.errorRevoked`, `login.errorExpired`, `login.role.admin`, `login.role.commercial`, `login.role.operateur`
- [x] Note : si next-intl n'est pas encore branché dans layout.tsx (Story 1.5 finalise ça), les strings peuvent être hardcodées en FR dans le composant pour l'instant — noter ce TODO explicitement dans le code avec un commentaire `// TODO(1.5): migrer vers next-intl useTranslations()`

### T7 — Créer tests (AC: #8)

- [x] `src/hooks/use-offline-session.test.ts` : mocker `useSession`, `localStorage`, `Date.now()`, événements "online"
  - Test : lastOnlineAt mis à jour quand session active + online
  - Test : redirect vers `/login?reason=session-expired` si > 7j offline
  - Test : `purgeLocalData` appelé si session révoquée au reconnect
- [x] NE PAS tester le formulaire lui-même via jsdom (test manuel E2E ou Playwright — hors scope MVP-0)

### T8 — Vérification finale (AC: #8)

- [x] `pnpm check` : lint ✓ + typecheck ✓ + test ✓ (121 tests, 8 nouveaux 1.4)
- [x] `pnpm build` passe
- [x] Vérifier manuellement : page /login affiche correctement en français
- [x] Vérifier : après login → redirect vers `/`
- [x] Vérifier : credentials invalides → message FR affiché

---

## Dev Notes

### Fichiers à MODIFIER vs CRÉER

```
MODIFIER :
  src/lib/auth.ts                           ← ajouter maxLoginAttempts: 5
  src/app/(auth)/login/page.tsx             ← utiliser LoginForm, fix redirect, handle reason param
  src/messages/fr-NE.json                   ← ajouter clés section "auth"

CRÉER :
  src/components/auth/login-form.tsx        ← nouveau formulaire login complet
  src/hooks/use-offline-session.ts          ← gestion session offline 7j + révocation
  src/lib/local-purge.ts                    ← purge Dexie + localStorage
  src/hooks/use-offline-session.test.ts     ← tests du hook

NE PAS TOUCHER :
  src/components/auth/sign-in-button.tsx    ← conserver (ne pas supprimer)
  src/lib/auth-client.ts                    ← déjà correct
  src/lib/local-db.ts                       ← déjà créé Story 1.3
  src/lib/crypto/local-crypto.ts            ← déjà créé Story 1.3
  src/lib/audit.ts                          ← déjà modifié Story 1.3
```

### `src/lib/auth.ts` — configuration Better Auth avec lockout

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
    maxLoginAttempts: 5,          // verrouille après 5 échecs (NFR-S6)
    // loginAttemptWindow: 3600,  // optionnel : fenêtre 1h en secondes, vérifier API v1.6
    sendResetPassword: async ({ user, url }) => {
      // CONSERVER tel quel — console.log pour dev (Story 1.7 câblera SMTP)
      console.log(`...`);
    },
  },
  emailVerification: {
    // CONSERVER tel quel
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`...`);
    },
  },
});
```

**ATTENTION Better Auth v1.6 :** Vérifier le nom exact de l'option lockout dans la source/doc Better Auth v1.6 (`node_modules/better-auth`). Si `maxLoginAttempts` n'existe pas, chercher `loginAttempts`, `accountLockout`, ou similaire dans `better-auth/plugins`. Ne pas inventer une API.

**Code d'erreur de verrouillage :** Quand le compte est verrouillé, Better Auth retourne une erreur. Vérifier `result.error.code` pour détecter le verrouillage (ex: `"ACCOUNT_LOCKED"`, `"TOO_MANY_REQUESTS"` selon la version). Adapter le message FR en conséquence.

### `src/lib/local-purge.ts` — purge locale

```ts
// src/lib/local-purge.ts
// NE PAS ajouter "use client" — importé aussi potentiellement en server (SSR safe)

import { db } from "@/lib/local-db";

const LAST_ONLINE_KEY = "quotation_last_online_at";

export async function purgeLocalData(): Promise<void> {
  await db.delete();                                    // supprime toute l'IndexedDB Dexie
  if (typeof window !== "undefined") {
    localStorage.removeItem(LAST_ONLINE_KEY);
  }
}
```

**Pourquoi `db.delete()` ?** En MVP-0, la purge complète est plus sûre que la purge sélective pour les cas de révocation (remote wipe, NFR-S7). En MVP-1, affiner si nécessaire. Dexie `db.delete()` = supprime la base entière + la recréera à la prochaine instanciation.

### `src/hooks/use-offline-session.ts` — hook complet

```ts
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession, useSession } from "@/lib/auth-client";
import { purgeLocalData } from "@/lib/local-purge";

const LAST_ONLINE_KEY = "quotation_last_online_at";
const SESSION_MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export function useOfflineSession(): void {
  const { data: session } = useSession();
  const router = useRouter();

  // Effect 1 : mettre à jour lastOnlineAt quand online + session active
  useEffect(() => {
    if (!session) return;

    const markOnline = () => {
      if (navigator.onLine) {
        localStorage.setItem(LAST_ONLINE_KEY, Date.now().toString());
      }
    };

    markOnline(); // init immédiat
    window.addEventListener("online", markOnline);
    return () => window.removeEventListener("online", markOnline);
  }, [session]);

  // Effect 2 : vérifier dépassement 7 jours hors ligne
  useEffect(() => {
    if (!session) return;

    const checkExpiry = () => {
      const stored = localStorage.getItem(LAST_ONLINE_KEY);
      if (!stored) return;
      const elapsed = Date.now() - parseInt(stored, 10);
      if (elapsed > SESSION_MAX_OFFLINE_MS) {
        router.push("/login?reason=session-expired");
      }
    };

    checkExpiry();
    const id = setInterval(checkExpiry, 60_000);
    return () => clearInterval(id);
  }, [session, router]);

  // Effect 3 : vérification de révocation au reconnect
  useEffect(() => {
    if (!session) return;

    const handleOnline = async () => {
      try {
        const result = await getSession();
        if (!result.data) {
          await purgeLocalData();
          router.push("/login?reason=session-revoked");
        } else {
          localStorage.setItem(LAST_ONLINE_KEY, Date.now().toString());
        }
      } catch {
        // erreur réseau — rester offline, ne rien faire
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [session, router]);
}
```

**OÙ utiliser ce hook :** Dans le layout de la zone `(app)` — Story 1.5 le câblera dans `src/app/(app)/layout.tsx`. Pour l'instant ce hook est créé mais pas encore monté (attendu Story 1.5). Le créer maintenant pour que Story 1.5 puisse simplement l'importer.

### `src/components/auth/login-form.tsx` — structure du composant

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { signIn } from "@/lib/auth-client";

type Role = "admin" | "commercial" | "operateur";

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "Administrateur" },
  { value: "commercial", label: "Commercial" },
  { value: "operateur", label: "Opérateur" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("commercial");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsPending(true);

    try {
      const result = await signIn.email({
        email,
        password,
        callbackURL: "/",
      });

      if (result.error) {
        // Détecter le verrouillage de compte (vérifier exact code Better Auth v1.6)
        const code = result.error.code ?? "";
        if (code === "ACCOUNT_LOCKED" || code === "TOO_MANY_REQUESTS") {
          setError(
            "Compte temporairement verrouillé. Contactez l'administrateur pour déverrouiller."
          );
        } else {
          setError("Email ou mot de passe incorrect.");
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-7">
      {/* Logo + titre */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <Image src="/logo-mark.svg" alt="Quotation Logistique" width={48} height={48} />
        <h1 className="font-spectral text-2xl font-semibold text-[#1B3070]">
          Quotation · Logistique
        </h1>
      </div>

      {/* Segmented control rôle (MVP-0 : UX uniquement, n'affecte pas l'auth) */}
      {/* TODO(1.6): câbler la vérification du rôle sélectionné côté serveur */}
      <div className="mb-6 flex w-full max-w-sm gap-1 rounded-[11px] border border-[#e3dcce] bg-[#faf8f3] p-1">
        {ROLES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={selectedRole === value}
            onClick={() => setSelectedRole(value)}
            className={cn(
              "flex-1 rounded-[8px] py-2 text-xs font-semibold transition-colors",
              selectedRole === value
                ? "bg-[#1B3070] text-white"
                : "text-[#57534e] hover:bg-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Formulaire */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4"
        aria-label="Formulaire de connexion"
      >
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-semibold text-[#6b6259]">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPending}
            aria-describedby={error ? "login-error" : undefined}
            className="rounded-[11px] border-[#e3dcce] bg-white focus:border-[#1B3070]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-semibold text-[#6b6259]">
            Mot de passe
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Votre mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isPending}
            className="rounded-[11px] border-[#e3dcce] bg-white focus:border-[#1B3070]"
          />
        </div>

        {error && (
          <p id="login-error" role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="h-11 w-full rounded-[11px] bg-[#1B3070] text-sm font-semibold text-white"
          disabled={isPending}
        >
          {isPending ? "Connexion…" : "Se connecter"}
        </Button>

        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-[#1B3070] underline-offset-4 hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
      </form>

      {/* Footer offline */}
      <p className="mt-8 flex items-center gap-1.5 text-xs text-[#6b6259]">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />
        Fonctionne hors ligne · session 7 jours
      </p>
    </div>
  );
}
```

**ATTENTION :** Les couleurs inline (`#1B3070`, `#e3dcce`, etc.) correspondent aux tokens DESIGN.md. Si les tokens CSS sont disponibles dans globals.css (Story 1.1), utiliser les classes Tailwind correspondantes plutôt que les valeurs hardcodées. Vérifier globals.css avant de hardcoder.

### `src/app/(auth)/login/page.tsx` — modifications

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/");   // ← WAS "/dashboard", NOW "/"
  }

  const { reason } = await searchParams;

  return (
    <div>
      {reason === "session-expired" && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 ...">
          Session expirée. Reconnectez-vous pour continuer.
        </div>
      )}
      {reason === "session-revoked" && (
        <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 ...">
          Session révoquée. Reconnectez-vous.
        </div>
      )}
      <LoginForm />
    </div>
  );
}
```

### Pièges & anti-patterns

| ❌ À éviter | ✅ À faire |
|---|---|
| Garder redirect vers `/dashboard` | Changer pour `redirect("/")` |
| Texte anglais dans l'UI ("Sign in", "Password") | Tout en français : "Se connecter", "Mot de passe" |
| Inventer l'API Better Auth lockout | Lire `node_modules/better-auth` pour trouver le bon nom d'option |
| Hardcoder les couleurs si déjà dans globals.css | Vérifier d'abord globals.css (tokens Story 1.1) |
| Appeler `db.delete()` sans `typeof window !== "undefined"` | Toujours guard pour SSR safety |
| Utiliser `text-faint` (#a39d92) pour texte visible | Utiliser `text-muted` (#6b6259) minimum (DESIGN.md D2) |
| `float` pour le timer de session | `parseInt(stored, 10)` + comparaison entière |
| Monter `useOfflineSession` dans ce composant | Ce hook appartient au shell `(app)/layout.tsx` — Story 1.5 |
| Supprimer `sign-in-button.tsx` | Laisser en place pour l'instant |
| `amber` pour texte | Amber = UX décoratif uniquement (FAB icon, glow) |
| Utiliser `next/router` | Utiliser `next/navigation` (App Router) |

### Héritage des stories précédentes

**Story 1.1 (done):** globals.css contient les tokens DESIGN.md (`--brand-navy`, `--border-input`, etc.). Logo SVGs dans `public/` (`logo-mark.svg`, `logo-mark-light.svg`, `logo-full.svg`). Vérifier les noms de classe Tailwind disponibles avant de hardcoder des couleurs. Polices Spectral + Hanken Grotesk auto-hébergées via `next/font/local` dans `src/app/fonts.ts`.

**Story 1.2 (done):** `lib/permissions.ts` expose `can()` et `requirePermission()` — NE PAS recréer la logique de rôle. Le segmented control du login est purement UX MVP-0 ; la vraie vérification de rôle s'appuiera sur ces helpers en Story 1.6.

**Story 1.3 (done, post-review):** `db` Dexie disponible dans `src/lib/local-db.ts`. `purgeLocalData()` appelle `db.delete()`. `localCrypto` no-op. 113 tests passent. `emitAuditEvent` est async — ne pas oublier `await` si on émet un audit au login (hors scope Story 1.4 mais note pour future).

**Review 1.3 :** exactOptionalPropertyTypes — utiliser `?? null` sur les optionals dans les inserts Drizzle. Même pattern si ajout d'audit au login.

### Structure des fichiers créés/modifiés

```
src/
├── lib/
│   ├── auth.ts                      ← MODIFIER (maxLoginAttempts: 5)
│   └── local-purge.ts               ← CRÉER (purge Dexie + localStorage)
├── hooks/
│   ├── use-offline-session.ts       ← CRÉER (hook offline 7j + révocation)
│   └── use-offline-session.test.ts  ← CRÉER (tests du hook)
├── components/
│   └── auth/
│       └── login-form.tsx           ← CRÉER (formulaire login FR conforme EXPERIENCE.md)
├── app/
│   └── (auth)/
│       └── login/
│           └── page.tsx             ← MODIFIER (LoginForm, redirect /, reason param)
└── messages/
    └── fr-NE.json                   ← MODIFIER (section "auth")

# NE PAS MODIFIER :
src/components/auth/sign-in-button.tsx  # laisser en place
src/lib/auth-client.ts                  # déjà correct
src/lib/local-db.ts                     # Story 1.3
src/lib/crypto/local-crypto.ts          # Story 1.3
```

### Note sur le segmented control rôle (MVP-0)

Le design EXPERIENCE.md Flow 3 montre un segmented control 3 rôles sur la page login. En MVP-0 :
- Le contrôle est affiché et fonctionnel visuellement
- La valeur sélectionnée **ne modifie pas** l'authentification Better Auth
- Le rôle réel de l'utilisateur provient de `user.role` en base (ajouté Story 1.3, type `text`, default `"commercial"`)
- En Story 1.6, si la vérification de rôle au login est souhaitée, ce sera câblé

Si des erreurs de type strict sur `selectedRole` (ex: `noUncheckedIndexedAccess` sur array access), définir explicitement le type `Role` et utiliser `satisfies` ou type guard.

### Note sur les fonts

Spectral est la police des titres/montants. Pour `"Quotation · Logistique"`, utiliser la classe font appropriée. Story 1.1 a configuré `next/font/local` et l'a exposée via `src/app/fonts.ts`. Chercher dans `src/app/fonts.ts` ou `src/app/layout.tsx` comment appliquer `font-spectral` (probablement via une variable CSS ou une classe Tailwind). Ne pas importer Google Fonts — les polices sont auto-hébergées.

---

## Références

- [EXPERIENCE.md §Flow 3] — Login UX : logo, segmented control, footer offline, redirect → Dashboard
- [EXPERIENCE.md §Accessibility Floor] — targets ≥44px, aria-describedby erreurs, aria-pressed segmented
- [DESIGN.md §Colors] — brand-navy #1B3070, border-input #e3dcce, text-muted #6b6259, amber = UX déco
- [DESIGN.md §Typography] — Spectral = titres/montants, Hanken = UI ; D2 : text-faint jamais pour texte utile
- [Architecture §Authentication & Security] — Better Auth email/password, JWT 7j (S3), revocation check, local purge, bcrypt (S1)
- [Architecture §API Patterns] — NFR-S6 : rate limiting auth 10/min/IP, lockout 5 échecs
- [Epic 1 §Story 1.4] — AC source FR-1
- [project-context.md] — redirect post-login = "/" (pas "/dashboard"), `"use client"` double quotes, next/navigation
- [Story 1.3 §Dev Notes] — Dexie db singleton, `db.delete()` pour purge, LocalCrypto seam
- [Story 1.3 §Review Findings] — exactOptionalPropertyTypes → `?? null`

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- Better Auth v1.6 n'a pas `maxLoginAttempts` natif dans `emailAndPassword`. Vérifié via grep sur `node_modules/better-auth/dist`. Solution : plugin custom `accountLockoutPlugin` avec `hooks.before` (check lockout) + `hooks.after` (incrément/reset) + champs `loginAttempts`/`lockedAt` ajoutés à la table `user`.
- `react-dom/test-utils` dans React 19 n'exporte que `act`. Tests de hook via `createRoot` + `await act(async()=>{})` ne flushent pas les effects correctement avec Vitest + jsdom. Solution retenue : extraire la logique métier du hook en fonctions exportables (`markOnline`, `checkSessionExpiry`, `handleRevocationCheck`) et tester ces fonctions directement.
- `globalThis.IS_REACT_ACT_ENVIRONMENT = true` causait une erreur TypeScript (`no index signature`) dans le build Next.js. Fixé via cast `(globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true`.

### Completion Notes List

- T1 : lockout implémenté via plugin Better Auth custom. Champs `loginAttempts` (int, default 0) et `lockedAt` (timestamp, nullable) ajoutés à `user`. Migration `0005_huge_wallop.sql` générée et appliquée.
- T2 : `purgeLocalData()` avec guard SSR. Pas de directive `"use client"` explicite — implicite via import `local-db.ts`.
- T3 : hook `useOfflineSession` + fonctions testables exportées. Monté dans Story 1.5 (`(app)/layout.tsx`).
- T4 : `LoginForm` utilise tokens CSS design plutôt que couleurs hardcodées (`bg-brand-navy`, `font-serif`, etc.).
- T5 : `login/page.tsx` simplifié, redirect vers `/` au lieu de `/dashboard`.
- T6 : section `auth.login` ajoutée dans `fr-NE.json`, TODOs(1.5) dans composants.
- T7 : 8 nouveaux tests, 121 total.
- T8 : lint ✓ typecheck ✓ 121 tests ✓ build ✓.

### File List

- `src/lib/schema.ts` — modifié (ajout `loginAttempts`, `lockedAt` à table `user`)
- `drizzle/0005_huge_wallop.sql` — créé (migration)
- `drizzle/meta/_journal.json` — modifié
- `src/lib/auth.ts` — modifié (plugin lockout custom)
- `src/lib/local-purge.ts` — créé
- `src/hooks/use-offline-session.ts` — créé
- `src/components/auth/login-form.tsx` — créé
- `src/app/(auth)/login/page.tsx` — modifié
- `src/messages/fr-NE.json` — modifié
- `src/hooks/use-offline-session.test.ts` — créé
- `src/test/setup.ts` — modifié (IS_REACT_ACT_ENVIRONMENT)

### Review Findings

#### Décisions requises

- [x] [Review][Decision] **Verrouillage permanent — aucune voie de déverrouillage automatique** — `lockedAt` n'est effacé que sur succès de connexion, mais `checkAccountLockout` empêche toute tentative → boucle infinie. Pas de TTL, pas de déverrouillage admin (Story 1.6). Décider : TTL temporel ? Ou attendre Story 1.6 ?
- [x] [Review][Decision] **`useOfflineSession` non monté en Story 1.4 — AC5 et AC6 invérifiables** — différé Story 1.5 — Le hook est créé mais monté en Story 1.5. Les AC5/AC6 sont listés sous Story 1.4. Décider : accepter comme dette intentionnelle ou monter le hook ici ?
- [x] [Review][Decision] **Label "Email" en anglais** — AC1 exige "aucun mot anglais visible". "Email" est dans `<Label>`. Décider : conserver (usage courant en français) ou changer en "Adresse e-mail" ?

#### Patches

- [x] [Review][Patch] **Race TOCTOU dans le lockout — requêtes concurrentes contournent la limite** [`src/lib/lockout.ts`] — `checkAccountLockout` (SELECT) et `recordLoginAttempt` (UPDATE) sont deux round-trips séparés. N requêtes concurrentes passent toutes le SELECT avant tout UPDATE. Fix : `SELECT ... FOR UPDATE` dans une transaction, ou logique purement côté UPDATE.
- [x] [Review][Patch] **Heuristique `failed` fragile dans l'after-hook** [`src/lib/auth.ts`] — Si `ctx.returned` est absent ou de forme inattendue, `failed = false` → `recordLoginAttempt(email, true)` remet le compteur à 0 après un échec. Désactive le lockout silencieusement.
- [x] [Review][Patch] **`purgeLocalData` sans directive `"use client"`** [`src/lib/local-purge.ts`] — Le fichier importe Dexie sans `"use client"`. Import serveur accidentel = crash au chargement du module. Ajouter `"use client"` en première ligne.
- [x] [Review][Patch] **Handler `online` non protégé contre appels concurrents** [`src/hooks/use-offline-session.ts:98`] — Reconnexions rapides déclenchent plusieurs `handleOnline` en parallèle → double `signOut()`, double `router.push()`. Ajouter un flag `isHandling` ou debounce.
- [x] [Review][Patch] **`enforceExpiry` ne purge pas les données locales IndexedDB** [`src/hooks/use-offline-session.ts:34`] — Sur expiry 7j, `signOut()` est appelé mais `purgeLocalData()` ne l'est pas. L'utilisateur suivant sur le même appareil hérite des données offline. Appeler `purgeLocalData()` dans `enforceExpiry` après `signOut()`.
- [x] [Review][Patch] **`LAST_ONLINE_KEY` dupliqué dans deux fichiers** [`src/hooks/use-offline-session.ts:8`, `src/lib/local-purge.ts:3`] — Même constante définie deux fois. Si une change, l'autre diverge silencieusement. Exporter depuis `use-offline-session.ts`, importer dans `local-purge.ts`.
- [x] [Review][Patch] **Pas de guard NaN sur `parseInt` du timestamp localStorage** [`src/hooks/use-offline-session.ts:22,36`] — Valeur corrompue → `NaN > SESSION_MAX_OFFLINE_MS` = false → expiry jamais déclenchée. Ajouter `if (isNaN(elapsed)) { localStorage.removeItem(LAST_ONLINE_KEY); return false }`.
- [x] [Review][Patch] **`purgeLocalData` sans try/finally — `removeItem` jamais atteint si `db.delete()` échoue** [`src/lib/local-purge.ts:7`] — Utiliser try/finally pour garantir le nettoyage localStorage même en cas d'erreur Dexie.
- [x] [Review][Patch] **Segmented control manque `aria-controls` / `tabpanel` — AC7 incomplet** [`src/components/auth/login-form.tsx:82`] — `role="tab"` exige des `role="tabpanel"` associés via `aria-controls`. Alternativement, utiliser `role="group"` + `aria-pressed` (également permis par la spec).
- [x] [Review][Patch] **`db.delete()` peut bloquer indéfiniment en multi-onglet** [`src/lib/local-purge.ts:7`] — Si un autre onglet tient la DB ouverte, Dexie bloque jusqu'à fermeture. `router.push` après ne s'exécute jamais. Ajouter un timeout ou utiliser `indexedDB.deleteDatabase()` directement avec un événement `blocked`.

#### Différés

- [x] [Review][Defer] **Commentaire SQL CASE trompeur** [`src/lib/lockout.ts:22`] — Indique "atomic" alors que le flux global ne l'est pas. Qualité commentaire. — deferred, pré-existant
- [x] [Review][Defer] **`selectedRole` cosmétique uniquement** [`src/components/auth/login-form.tsx:27`] — Intentionnel MVP-0, documenté dans la story. — deferred, pré-existant
- [x] [Review][Defer] **Énumération d'emails via lockout** [`src/lib/lockout.ts`] — Acceptable pour ce contexte, durcissement Story 1.6. — deferred, hors scope
- [x] [Review][Defer] **Rate limiting réseau non implémenté** — NFR-S6 niveau passerelle/middleware, hors scope Story 1.4. — deferred, Story 1.6
- [x] [Review][Defer] **`enforceExpiry` retourne false si LAST_ONLINE_KEY absent** [`src/hooks/use-offline-session.ts:35`] — Comportement intentionnel (nouvel utilisateur sans historique). — deferred, conception
- [x] [Review][Defer] **Double appel `enforceExpiry` SessionGuard + useOfflineSession** — Hook non monté, SessionGuard est pré-existant. Réévaluer en Story 1.5. — deferred, Story 1.5

### Change Log

- **2026-06-22** : Story 1.4 créée — Connexion utilisateur (FR-1), login form FR conforme EXPERIENCE.md Flow 3, lockout 5 échecs, offline session hook 7j + révocation, purge locale.
- **2026-06-23** : Story 1.4 implémentée — plugin lockout Better Auth custom, login form, hook offline session, tests 121/121, build ✓.
- **2026-06-23** : Code review — 3 décisions, 10 patches, 6 différés, 13 rejetés.
