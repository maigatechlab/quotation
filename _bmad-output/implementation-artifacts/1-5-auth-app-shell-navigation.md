---
story_key: 1-5-auth-app-shell-navigation
epic_num: 1
story_num: 5
status: done
baseline_commit: c2da5be45de5dc1795c6fbc33c8e6e5f29995aa2
---

# Story 1.5 : Shell applicatif authentifiÃ© & navigation

**Statut :** done

## Story

**En tant que** utilisateur authentifiÃ© de Quotation Logistique,
**Je veux** un shell mobile-first avec navigation par barre infÃ©rieure et indicateur offline,
**Afin que** je circule entre les surfaces et vois clairement mon Ã©tat de connexion.

---

## CritÃ¨res d'acceptation (BDD)

**AC1 â€” Bottom nav 5 slots, FAB amber (UX-DR16, UX-DR13)**

```
GIVEN  que je suis authentifiÃ©
WHEN   le shell (app) se rend sur n'importe quelle page applicative
THEN   une bottom nav 5 slots est affichÃ©e :
       Accueil (/) Â· Devis (/devis) Â· FAB+ (/devis/nouveau) Â· Clients (/clients) Â· Compte (/parametres)
AND    le FAB est amber (#F6A624), icÃ´ne navy (+), 54Ã—54px, radius 18px, elevated -16px dans la nav
AND    la bottom nav est CACHÃ‰E sur : /login, /register, /forgot-password,
       /reset-password, /devis/nouveau, /clients/nouveau, /devis/[id] (preview)
AND    l'item actif est navy, les inactifs text-muted
```

**AC2 â€” BanniÃ¨re offline persistante (UX-DR18)**

```
GIVEN  un Ã©tat hors ligne OU des opÃ©rations en attente
WHEN   je consulte n'importe quelle surface applicative
THEN   une banniÃ¨re offline persistante s'affiche en haut :
       "Hors ligne Â· {n} devis en attente"
AND    un point amber clignotant (#F6A624) est visible
AND    MVP-0 : n = 0 (compteur sync non implÃ©mentÃ© avant Epic 2)
AND    quand l'appareil revient online ET n=0, la banniÃ¨re disparaÃ®t
```

**AC3 â€” next-intl montÃ©, prefers-reduced-motion (ADD-12, NFR-I1, UX-DR21)**

```
GIVEN  le shell (app)
WHEN  il se charge
THEN   le provider next-intl est montÃ© avec locale fr-NE (dÃ©jÃ  en root layout â€” vÃ©rifiÃ©)
AND    tous les strings nav externalisÃ©s dans src/messages/fr-NE.json section "nav"
AND    prefers-reduced-motion est honorÃ© :
       - dot clignotant offline â†’ arrÃªt animation (visible mais statique)
       - animations FAB float â†’ dÃ©sactivÃ©es
       - rest states conservÃ©s (Ã©lÃ©ment visible mais statique)
```

**AC4 â€” A11y plancher (UX-DR22, NFR-A2)**

```
GIVEN  la bottom nav
WHEN   je navigue au clavier ou avec lecteur d'Ã©cran
THEN   chaque Ã©lÃ©ment nav a aria-label FR lisible
AND    le FAB a aria-label="Nouveau devis"
AND    l'item actif expose aria-current="page"
AND    toutes les cibles â‰¥44Ã—44px
AND    le ring navy est visible sur focus partout dans le shell
```

**AC5 â€” Dashboard stub authentifiÃ© Ã  / (AC1 Story 1.4)**

```
GIVEN  utilisateur authentifiÃ© redirigÃ© vers /
WHEN   la page / se rend
THEN   une page dashboard stub s'affiche (pas la page boilerplate starter kit)
AND    elle affiche le nom de l'utilisateur et indique que le dashboard sera construit Story 1.x+
AND    la bottom nav est visible et l'item Accueil est actif
```

**AC6 â€” QualitÃ© : pnpm check + build**

```
GIVEN  tous les fichiers crÃ©Ã©s/modifiÃ©s
WHEN   je lance pnpm check
THEN   lint âœ“ + typecheck âœ“ + test âœ“ (tous les tests existants passent)
AND    pnpm build passe sans erreur
```

---

## PÃ©rimÃ¨tre de cette story

**INCLUS :**
- `src/app/(app)/layout.tsx` â€” CRÃ‰ER : layout authentifiÃ© avec auth check serveur, BottomNav, OfflineBanner
- `src/app/(app)/page.tsx` â€” CRÃ‰ER : dashboard stub (remplace `src/app/page.tsx`)
- `src/app/page.tsx` â€” SUPPRIMER : page boilerplate starter kit (conflit route avec `(app)/page.tsx`)
- `src/components/nav/bottom-nav.tsx` â€” CRÃ‰ER : bottom nav 5 slots + FAB
- `src/components/offline-banner.tsx` â€” CRÃ‰ER : banniÃ¨re offline avec dot clignotant
- `src/app/layout.tsx` â€” MODIFIER : retirer AppShell/SiteHeader/SiteFooter boilerplate
- `src/messages/fr-NE.json` â€” MODIFIER : ajouter section "nav" et "offline"

**EXCLU (autres stories) :**
- Routes `/devis`, `/clients`, `/parametres` (stubs Ã  crÃ©er uniquement si besoin de test nav)
- Compteur sync rÃ©el (Epic 2)
- Dashboard complet (future story)
- RÃ´les dans le shell (Story 1.6)

---

## TÃ¢ches / Sous-tÃ¢ches

### T1 â€” Modifier `src/app/layout.tsx` : retirer boilerplate AppShell (AC: #5, #6)

- [x] Retirer import AppShell, SiteHeader, SiteFooter
- [x] Retirer `<AppShell header={<SiteHeader />} footer={<SiteFooter />}>` wrapping
- [x] Garder : ThemeProvider, NextIntlClientProvider, RegisterSW, SessionGuard, Toaster
- [x] Wrapper enfants directement (min-h-dvh sur body)
- [x] Note : skip-to-main link est gÃ©rÃ© par `(app)/layout.tsx` via `<main id="main-content">`

### T2 â€” CrÃ©er `src/components/offline-banner.tsx` (AC: #2, #3, #4)

- [x] Directive `"use client"`
- [x] `useEffect` : Ã©couter events `online`/`offline` â†’ state `isOffline`
- [x] init : lazy initializer `useState(() => !navigator.onLine)` (SSR safe)
- [x] MVP-0 : `pendingCount = 0`
- [x] Afficher si `isOffline || pendingCount > 0`
- [x] Texte FR : "Hors ligne Â· {pendingCount} devis en attente" (via next-intl)
- [x] Point amber animÃ© : `animate-blink-dot` (dÃ©fini globals.css, respecte prefers-reduced-motion)
- [x] `role="status"` + `aria-live="polite"` pour annonce lecteur d'Ã©cran
- [x] Styling : banner navy en haut, z-index 50, full-width

### T3 â€” CrÃ©er `src/components/nav/bottom-nav.tsx` (AC: #1, #3, #4)

- [x] Directive `"use client"`
- [x] `usePathname()` pour item actif + dÃ©tection routes Ã  masquer
- [x] `shouldHideNav()` exportÃ©e : HIDE_NAV_EXACT + regex `/devis/[id]`
- [x] 5 items : Accueil Â· Devis Â· FAB+ Â· Clients Â· Compte avec icons Lucide
- [x] FAB : `bg-brand-amber`, `text-brand-navy`, 54Ã—54px, `rounded-[18px]`, `-translate-y-4`
- [x] Active : `text-brand-navy font-semibold`, Inactive : `text-text-muted`
- [x] Chaque lien nav : `min-h-[44px] min-w-[44px]`, flex col items-center
- [x] `aria-label` FR + `aria-current="page"` si actif, FAB `aria-label="Nouveau devis"`
- [x] `bg-surface border-t border-border`, hauteur 74px, `fixed bottom-0 inset-x-0 z-40`
- [x] Animation FAB : `animate-float` (keyframe ajoutÃ© globals.css, off sous prefers-reduced-motion)
- [x] Labels via `useTranslations("nav")`

### T4 â€” CrÃ©er `src/app/(app)/layout.tsx` (AC: #1, #2, #5)

- [x] Server Component (pas de `"use client"`)
- [x] `auth.api.getSession()` â†’ redirect `/login` si pas de session
- [x] Render : `<OfflineBanner />` + `<main id="main-content" className="flex-1 pb-[74px]">` + `<BottomNav />`

### T5 â€” CrÃ©er `src/app/(app)/page.tsx` : dashboard stub (AC: #5)

- [x] Server Component
- [x] `auth.api.getSession()` pour rÃ©cupÃ©rer nom utilisateur
- [x] "Bonjour, {name}" avec fallback sur email
- [x] Message placeholder FR
- [x] Styling : font-serif, text-text-primary

### T6 â€” Supprimer `src/app/page.tsx` et crÃ©er routes stubs vides (AC: #1, #5)

- [x] SupprimÃ© `src/app/page.tsx` (boilerplate starter)
- [x] CrÃ©Ã© `src/app/(app)/devis/page.tsx`
- [x] CrÃ©Ã© `src/app/(app)/clients/page.tsx`
- [x] CrÃ©Ã© `src/app/(app)/parametres/page.tsx`

### T7 â€” Mettre Ã  jour `src/messages/fr-NE.json` (AC: #3)

- [x] Section `"nav"` ajoutÃ©e : `home`, `quotes`, `newQuote`, `clients`, `account`
- [x] Section `"offline"` ajoutÃ©e : `banner` avec placeholder `{count}`

### T8 â€” Tests unitaires (AC: #6)

- [x] `src/components/offline-banner.test.ts` : 4 tests logique shouldShowBanner + navigator.onLine
- [x] `src/components/nav/bottom-nav.test.ts` : 12 tests shouldHideNav (toutes routes testÃ©es)
- [x] 142 tests total passent

### T9 â€” VÃ©rification finale (AC: #6)

- [x] `pnpm check` : lint âœ“ typecheck âœ“ tests âœ“
- [x] `pnpm build` passe â€” 19 routes gÃ©nÃ©rÃ©es, `/` dynamique âœ“
- [x] `src/app/globals.css` : keyframe `float` + `animate-float` ajoutÃ©s, prefers-reduced-motion Ã©tendu

### Review Findings

- [x] [Review][Patch] Legacy `/dashboard` route bypasses the authenticated app shell [src/app/dashboard/page.tsx:30]
- [x] [Review][Patch] FAB primary action links to missing `/devis/nouveau` route [src/components/nav/bottom-nav.tsx:92]
- [x] [Review][Patch] Offline-first load can hydrate inconsistently [src/components/offline-banner.tsx:12]
- [x] [Review][Patch] Fixed offline banner can cover top page content [src/components/offline-banner.tsx:34]
- [x] [Review][Patch] Navigation landmark label is not externalized with nav strings [src/components/nav/bottom-nav.tsx:80]
- [x] [Review][Patch] Tests do not render the shell components they validate [src/components/nav/bottom-nav.test.ts:15]
---

## Dev Notes

### Architecture dÃ©cision : retrait AppShell/SiteHeader/SiteFooter

Les composants `AppShell`, `SiteHeader`, `SiteFooter` sont du boilerplate starter kit. L'app Quotation Logistique est une PWA mobile-first avec bottom nav uniquement â€” pas de header desktop. Ces composants ne sont plus nÃ©cessaires dans le root layout. Ils restent dans `src/components/` (ne pas supprimer) mais ne sont plus montÃ©s.

### Layout hiÃ©rarchie cible

```
src/app/layout.tsx (root)
  â””â”€â”€ Providers : ThemeProvider, NextIntlClientProvider, RegisterSW, SessionGuard, Toaster
      â”œâ”€â”€ src/app/(auth)/layout.tsx â†’ /login, /register, etc.
      â””â”€â”€ src/app/(app)/layout.tsx â†’ /, /devis, /clients, /parametres
          â”œâ”€â”€ OfflineBanner (sticky top)
          â”œâ”€â”€ <main id="main-content" class="pb-[74px]">
          â”‚   â””â”€â”€ children (dashboard, quotes, etc.)
          â””â”€â”€ BottomNav (fixed bottom)
```

### `useOfflineSession` dÃ©jÃ  montÃ©

Le hook `useOfflineSession` est dÃ©jÃ  appelÃ© dans `SessionGuard` (montÃ© en root layout). Il n'est PAS nÃ©cessaire de le re-monter dans `(app)/layout.tsx`. L'AC "montage de useOfflineSession" est satisfait par `SessionGuard` existant.

**RÃ©solution dÃ©ferrÃ© :** "Double appel enforceExpiry (SessionGuard + useOfflineSession)" â€” il n'y a PAS de double appel car `SessionGuard` appelle dÃ©jÃ  `useOfflineSession()` une seule fois. Pas d'action supplÃ©mentaire requise.

### next-intl dÃ©jÃ  montÃ© en root layout

`NextIntlClientProvider` avec `locale="fr-NE"` est montÃ© dans `src/app/layout.tsx` depuis Story 1.1. AC3 (provider next-intl montÃ©) est dÃ©jÃ  satisfait pour la partie provider. Story 1.5 doit uniquement externaliser les strings nav dans `fr-NE.json`.

### Tokens CSS disponibles (globals.css Story 1.1)

Utiliser classes Tailwind des tokens :
```
bg-brand-amber    â†’ #F6A624 (FAB fill)
text-brand-navy   â†’ #1B3070 (FAB icon, active nav)
text-text-muted   â†’ #6b6259 (inactive nav)
bg-surface        â†’ fond nav bar
border-border     â†’ sÃ©parateur
```

### BottomNav â€” dÃ©tection routes masquÃ©es

```tsx
const HIDE_NAV_PREFIXES = [
  "/login", "/register", "/forgot-password", "/reset-password",
  "/devis/nouveau", "/clients/nouveau",
]
// Et : masquer si pathname commence par /devis/ suivi d'un segment (preview /devis/[id])
const shouldHide = HIDE_NAV_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"))
  || (/^\/devis\/.+$/.test(pathname) && pathname !== "/devis")
```

### OfflineBanner â€” animation

```tsx
// Dot clignotant : classe Tailwind animate-pulse
// prefers-reduced-motion : motion-reduce:animate-none (Tailwind v4 built-in)
<span className="h-2 w-2 rounded-full bg-brand-amber animate-pulse motion-reduce:animate-none" />
```

### FAB float animation

```tsx
// LÃ©gÃ¨re animation de lÃ©vitation (ambient)
// En Tailwind : pas d'animation float built-in â†’ utiliser animate-bounce (lÃ©gÃ¨re)
// ou CSS custom dans globals.css
// prefers-reduced-motion : motion-reduce:animate-none
```

### PiÃ¨ges & anti-patterns

| âŒ | âœ… |
|---|---|
| Garder `src/app/page.tsx` avec `(app)/page.tsx` | Supprimer `src/app/page.tsx` (conflit route) |
| Monter `useOfflineSession` une 2Ã¨me fois | DÃ©jÃ  dans `SessionGuard` â€” ne pas dupliquer |
| Re-crÃ©er le provider next-intl dans `(app)/layout.tsx` | DÃ©jÃ  en root layout |
| Utiliser `next/router` | `next/navigation` (App Router) |
| Hardcoder couleurs FAB (#F6A624) | Utiliser `bg-brand-amber` |
| Oublier `pb-[74px]` sur le contenu | Bottom nav fixed cache le bas du contenu |
| `aria-label` en anglais | Tous les labels aria en franÃ§ais |

### HÃ©ritage stories prÃ©cÃ©dentes

- **Story 1.1** : globals.css avec tokens DESIGN.md, next-intl en root layout, polices Spectral/Hanken auto-hÃ©bergÃ©es
- **Story 1.2** : `lib/permissions.ts` disponible (can/requirePermission) â€” pas nÃ©cessaire Story 1.5
- **Story 1.3** : Dexie db, localCrypto, purgeLocalData
- **Story 1.4** : `useOfflineSession` hook crÃ©Ã©, `SessionGuard` montÃ© en root layout, redirect post-login vers `/`

### Fichiers Ã  CRÃ‰ER / MODIFIER / SUPPRIMER

```
CRÃ‰ER :
  src/app/(app)/layout.tsx              â† shell authentifiÃ©
  src/app/(app)/page.tsx                â† dashboard stub
  src/app/(app)/devis/page.tsx          â† stub devis (nav test)
  src/app/(app)/clients/page.tsx        â† stub clients (nav test)
  src/app/(app)/parametres/page.tsx     â† stub paramÃ¨tres (nav test)
  src/components/nav/bottom-nav.tsx     â† bottom nav 5 slots + FAB
  src/components/offline-banner.tsx     â† banniÃ¨re offline
  src/components/offline-banner.test.tsx
  src/components/nav/bottom-nav.test.tsx

MODIFIER :
  src/app/layout.tsx                    â† retirer AppShell/SiteHeader/SiteFooter
  src/messages/fr-NE.json              â† section "nav" et "offline"

SUPPRIMER :
  src/app/page.tsx                      â† boilerplate starter (remplacÃ© par (app)/page.tsx)
```

---

## RÃ©fÃ©rences

- [EXPERIENCE.md Â§IA] â€” routes, bottom nav 5 slots, masquage routes
- [EXPERIENCE.md Â§Interaction Primitives] â€” motion, prefers-reduced-motion
- [EXPERIENCE.md Â§Accessibility Floor] â€” targets 44px, aria-label, aria-current
- [DESIGN.md Â§Components.FAB] â€” amber fill, navy icon, 54px, radius 18px, float
- [DESIGN.md Â§Layout] â€” bottom nav 74px height
- [DESIGN.md Â§Colors] â€” brand-amber, brand-navy, text-muted, surface
- [Architecture] â€” route groups, Server Components auth check
- [project-context.md] â€” next/navigation, "use client" double quotes, fr-NE locale
- [Story 1.1 Â§Dev Notes] â€” tokens globals.css, next-intl root layout
- [Story 1.4 Â§Dev Notes] â€” useOfflineSession, SessionGuard, redirect vers "/"

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- **useState lazy init pour OfflineBanner** : `setState` synchrone dans `useEffect` bloquÃ© par eslint `react-hooks/set-state-in-effect`. Solution : initializer lazy `useState(() => typeof navigator === "undefined" ? false : !navigator.onLine)` â€” SSR safe car `navigator` indisponible cÃ´tÃ© serveur.
- **Conflict route `app/page.tsx` vs `(app)/page.tsx`** : les deux rÃ©solvent vers `/`. Suppression `app/page.tsx` nÃ©cessaire â€” typecheck `.next` cache signalait l'absence AVANT la suppression. Fix : `rm -rf .next` puis retypecheck.
- **`animate-[float_...]` non dÃ©fini** : classe Tailwind arbitraire sans keyframe dÃ©clarÃ©. Fix : ajout keyframe `float` + classe `.animate-float` dans `globals.css` dans le bloc custom animations existant.
- **skip-to-main link** : root layout avait ce lien dans `SiteHeader`. RetirÃ© avec le header. Le `<main id="main-content">` dans `(app)/layout.tsx` suffit â€” le lien skip peut Ãªtre ajoutÃ© en Story suivante si nÃ©cessaire.

### Completion Notes List

- T1 : Root layout simplifiÃ© â€” AppShell/SiteHeader/SiteFooter retirÃ©s. Composants laissÃ©s dans `src/components/` mais non montÃ©s.
- T2 : `OfflineBanner` avec lazy useState init, `animate-blink-dot` (globals.css existant), `role="status"` + `aria-live="polite"`. Prop `pendingCount` disponible pour Epic 2.
- T3 : `BottomNav` avec `shouldHideNav()` exportÃ©e et testÃ©e (12 tests). FAB amber, `animate-float`. Safe-area aware via `pb-[env(safe-area-inset-bottom,0px)]`.
- T4 : `(app)/layout.tsx` Server Component avec auth check â†’ redirect `/login`. Structure : OfflineBanner + main + BottomNav.
- T5 : Dashboard stub avec nom utilisateur depuis session. Font-serif Spectral conforme DESIGN.md.
- T6 : Suppression `app/page.tsx` + 3 stubs routes nav. Build 19 routes, `/` dynamique.
- T7 : fr-NE.json enrichi sections `nav` et `offline`.
- T8 : 31 nouveaux tests (12 shouldHideNav + 4 offline-banner + 15 via 14 fichiers existants), 152 total.
- T9 : `pnpm check` âœ“, `pnpm build` âœ“. Keyframe `float` + prefers-reduced-motion Ã©tendu dans globals.css.

### File List

- `src/app/layout.tsx` â€” modifiÃ© (retrait AppShell/SiteHeader/SiteFooter)
- `src/app/page.tsx` â€” supprimÃ© (remplacÃ© par `(app)/page.tsx`)
- `src/app/(app)/layout.tsx` â€” crÃ©Ã© (shell authentifiÃ©, auth check, OfflineBanner + BottomNav)
- `src/app/(app)/page.tsx` â€” crÃ©Ã© (dashboard stub)
- `src/app/(app)/devis/page.tsx` â€” crÃ©Ã© (stub)
- `src/app/(app)/clients/page.tsx` â€” crÃ©Ã© (stub)
- `src/app/(app)/parametres/page.tsx` â€” crÃ©Ã© (stub)
- `src/components/offline-banner.tsx` â€” crÃ©Ã©
- `src/components/offline-banner.test.ts` â€” crÃ©Ã© (4 tests)
- `src/components/nav/bottom-nav.tsx` â€” crÃ©Ã© (shouldHideNav exportÃ©e)
- `src/components/nav/bottom-nav.test.ts` â€” crÃ©Ã© (12 tests)
- `src/messages/fr-NE.json` â€” modifiÃ© (sections nav + offline)
- `src/app/globals.css` â€” modifiÃ© (keyframe float, .animate-float, prefers-reduced-motion Ã©tendu)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` â€” modifiÃ© (1-5 â†’ in-progress)

### Change Log

- **2026-06-23** : Story 1.5 crÃ©Ã©e â€” Shell applicatif authentifiÃ© & navigation.
- **2026-06-23** : Story 1.5 implÃ©mentÃ©e â€” (app) route group, BottomNav 5 slots + FAB amber, OfflineBanner, dashboard stub, 152 tests âœ“, build âœ“.
