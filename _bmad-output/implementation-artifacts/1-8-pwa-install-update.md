---
story_key: 1-8-pwa-install-update
epic_num: 1
story_num: 8
status: done
baseline_commit: c2da5be45de5dc1795c6fbc33c8e6e5f29995aa2
---

# Story 1.8 : Installation & mise Ã  jour PWA (FR-38, FR-39)

**Statut :** done

## Story

**En tant que** utilisateur de Quotation Logistique,
**Je veux** installer l'application sur mon appareil et Ãªtre notifiÃ© des mises Ã  jour disponibles,
**Afin que** je l'utilise en plein Ã©cran sans barre d'URL et que je reste toujours sur la derniÃ¨re version.

---

## CritÃ¨res d'acceptation (BDD)

**AC1 â€” Invite d'installation PWA (FR-38)**

```
GIVEN  les critÃ¨res navigateur rÃ©unis (HTTPS/localhost, SW enregistrÃ©, manifest standalone)
       ET l'app n'est pas encore installÃ©e
WHEN   je charge l'app pour la premiÃ¨re fois
THEN   une invite d'installation personnalisÃ©e s'affiche (banner ou bouton flottant)
AND    un clic sur le bouton dÃ©clenche la native browser install prompt
AND   l'app installÃ©e se lance en plein Ã©cran (display: standalone) sans barre d'URL
```

**AC2 â€” Disparition de l'invite aprÃ¨s installation (FR-38)**

```
GIVEN  l'invite d'installation visible
WHEN   l'utilisateur accepte ou refuse l'installation
THEN   l'invite d'installation disparaÃ®t et ne rÃ©apparaÃ®t pas
```

**AC3 â€” DÃ©tection mise Ã  jour et notification (FR-39)**

```
GIVEN  l'app ouverte avec un SW actif
WHEN   une nouvelle version est dÃ©ployÃ©e (nouveau SW installÃ© automatiquement)
THEN   une notification FR s'affiche : "Mise Ã  jour disponible. L'application va se recharger."
AND    la page se recharge automatiquement dÃ¨s que le nouveau SW prend le contrÃ´le
```

**AC4 â€” Aucune notification de mise Ã  jour au premier chargement**

```
GIVEN  la premiÃ¨re visite de l'app (aucun SW prÃ©cÃ©dent actif)
WHEN   le SW s'enregistre pour la premiÃ¨re fois
THEN   aucune notification de mise Ã  jour n'est affichÃ©e (pas de "fausse" mise Ã  jour)
```

**AC5 â€” Textes entiÃ¨rement en franÃ§ais**

```
GIVEN  le banner d'installation et la notification de mise Ã  jour
WHEN   je les consulte
THEN   tous les textes sont en franÃ§ais
AND    aucun texte en anglais n'est visible par l'utilisateur
```

**AC6 â€” QualitÃ© : pnpm check + build**

```
GIVEN  tous les fichiers crÃ©Ã©s/modifiÃ©s
WHEN   je lance pnpm check
THEN   lint âœ“ + typecheck âœ“ + tous les tests existants passent
AND    pnpm build passe sans erreur
```

---

## PÃ©rimÃ¨tre de cette story

**INCLUS :**

- `src/hooks/use-pwa-install.ts` â€” CRÃ‰ER : hook gÃ©rant `beforeinstallprompt` + Ã©tat d'installation
- `src/hooks/use-pwa-update.ts` â€” CRÃ‰ER : hook gÃ©rant la dÃ©tection mise Ã  jour SW + rechargement
- `src/components/pwa/register-sw.tsx` â€” MODIFIER : utiliser les deux hooks, rendre le banner d'installation + dÃ©clencher le toast de mise Ã  jour
- `src/messages/fr-NE.json` â€” MODIFIER : ajouter section `pwa` (messages install + update)

**EXCLU :**

- Modification de `src/app/sw.ts` â€” la stratÃ©gie de cache par type de ressource = Story 2.2. Ne pas toucher `sw.ts`.
- Modification de `next.config.ts` â€” la config Serwist est dÃ©jÃ  en place (Story 1.1). Ne pas modifier.
- Modification de `src/app/manifest.ts` â€” manifest dÃ©jÃ  complet (Story 1.1). Ne pas modifier.
- Background Sync API (Story 6.4, MVP-1)
- Push notifications (hors scope MVP-0)
- Tests e2e Playwright pour l'install prompt (non testable automatiquement sans Chromium headful + engagement heuristics)

---

## TÃ¢ches / Sous-tÃ¢ches

### T1 â€” CrÃ©er `src/hooks/use-pwa-install.ts` (AC: #1, #2)

- [x] DÃ©clarer l'interface `BeforeInstallPromptEvent extends Event` (non standard, absent de `lib.dom.d.ts`)
- [x] Hook `usePWAInstall()` :
  - Ã‰tat `deferredPrompt: BeforeInstallPromptEvent | null` (stocke l'Ã©vÃ©nement)
  - Ã‰tat `canInstall: boolean` (dÃ©rivÃ© : `deferredPrompt !== null`)
  - `useEffect` : Ã©couter `beforeinstallprompt` â†’ `e.preventDefault()` + stocker l'Ã©vÃ©nement
  - `useEffect` : Ã©couter `appinstalled` â†’ effacer `deferredPrompt` (app installÃ©e)
  - Fonction `promptInstall(): Promise<void>` â€” appelle `deferredPrompt.prompt()`, attend `deferredPrompt.userChoice`, efface le deferred prompt aprÃ¨s (quelque soit le choix)
  - Retourner `{ canInstall, promptInstall }`

### T2 â€” CrÃ©er `src/hooks/use-pwa-update.ts` (AC: #3, #4)

- [x] Hook `usePWAUpdate(registration: ServiceWorkerRegistration | null)` :
  - Prend la `registration` en paramÃ¨tre (passÃ©e depuis `register-sw.tsx`)
  - `useEffect` sur `registration` :
    - **Guard "premiÃ¨re visite"** : `previousController = navigator.serviceWorker.controller` au moment de l'effet. Si `null` au moment du premier enregistrement â†’ ne pas dÃ©clencher la notification de mise Ã  jour.
    - Ã‰couter `registration.addEventListener('updatefound', ...)` :
      - RÃ©cupÃ©rer `registration.installing`
      - Ã‰couter `installingWorker.statechange` :
        - Quand `installingWorker.state === 'installed'` ET `navigator.serviceWorker.controller` existait â†’ appeler `onUpdateFound()`
    - Ã‰couter `navigator.serviceWorker.addEventListener('controllerchange', ...)` pour recharger si une mise Ã  jour est en cours : `window.location.reload()`
  - Retourner `{ checkForUpdate: () => registration?.update() }` (optionnel, pour test manuel)

> **Note skipWaiting:** `sw.ts` dÃ©clare `skipWaiting: true` â€” le nouveau SW passe directement de `installing` Ã  `activated` sans attendre. La sÃ©quence est donc : `updatefound` â†’ `installing.statechange = installed` (court-circuitÃ© possible) â†’ `controllerchange`. Utiliser `controllerchange` comme signal fiable de rechargement. Voir section Dev Notes pour le dÃ©tail.

### T3 â€” Modifier `src/components/pwa/register-sw.tsx` (AC: #1, #2, #3, #4, #5)

- [x] Importer `usePWAInstall`, `usePWAUpdate` depuis `@/hooks/`
- [x] Importer `toast` depuis `sonner` (dÃ©jÃ  prÃ©sent dans le projet)
- [x] Importer `Button` depuis `@/components/ui/button`
- [x] Importer icÃ´ne `Download` depuis `lucide-react`
- [x] Ajouter Ã©tat `registration: ServiceWorkerRegistration | null` dans le composant
- [x] Modifier l'enregistrement SW :
  - Stocker le rÃ©sultat de `navigator.serviceWorker.register()` dans `registration`
  - **Supprimer le `console.warn("SW registered:", registration)`** existant â€” log inappropriÃ© en production
- [x] Utiliser `usePWAInstall()` â†’ `{ canInstall, promptInstall }`
- [x] Utiliser `usePWAUpdate(registration)` avec callback `onUpdateFound`:
  - Quand mise Ã  jour dÃ©tectÃ©e â†’ `toast.info("Mise Ã  jour disponible. L'application va se recharger.")`
- [x] **Rendre le banner d'installation** (quand `canInstall === true`) :
  - Div fixe en bas de l'Ã©cran (ou bouton flottant)
  - Texte FR : "Installer Quotation Logistique sur votre appareil"
  - Bouton avec icÃ´ne `Download` : "Installer"
  - Bouton fermer (Ã—) pour rejeter sans installer (efface `deferredPrompt` via `promptInstall` ou Ã©tat)
  - Classes : `fixed bottom-0 left-0 right-0 z-50 ... ` â€” design cohÃ©rent avec les banners existants (voir Dev Notes)
- [x] Retourner le banner ou `null` si `!canInstall`

### T4 â€” Modifier `src/messages/fr-NE.json` (AC: #5)

- [x] Ajouter section `"pwa"` Ã  la racine du JSON :
  ```json
  "pwa": {
    "installTitle": "Installer l'application",
    "installDescription": "Installer Quotation Logistique sur votre appareil",
    "installButton": "Installer",
    "installDismiss": "Plus tard",
    "updateAvailable": "Mise Ã  jour disponible. L'application va se recharger."
  }
  ```
- [ ] **Note :** `register-sw.tsx` est un `"use client"` qui s'exÃ©cute cÃ´tÃ© client. Il n'a pas accÃ¨s direct Ã  `next-intl` via `useTranslations` au niveau du layout root sans un provider intl dÃ©jÃ  montÃ©. VÃ©rifier si `NextIntlClientProvider` est rendu avant `<RegisterSW />` dans `layout.tsx` â€” si oui, `useTranslations('pwa')` est utilisable. Sinon, utiliser les textes littÃ©raux FR directement dans le composant (approche safe).

> **DÃ©cision recommandÃ©e :** Utiliser les textes FR **littÃ©raux** directement dans `register-sw.tsx` (pas de `useTranslations`). La section `pwa` dans `fr-NE.json` est ajoutÃ©e pour cohÃ©rence et futur (quand i18n multi-locale activÃ© en Epic 2+). Ne pas bloquer l'implÃ©mentation sur l'intÃ©gration next-intl dans les composants layout.

### T5 â€” VÃ©rification finale (AC: #6)

- [x] `pnpm check` : lint âœ“ typecheck âœ“ tests existants âœ“ (169 tests passent)
- [x] `pnpm build` : passe sans erreur (Serwist gÃ©nÃ¨re `public/sw.js`)

### Review Findings

- [x] [Review][Patch] Le hook annonce une mise à jour dès `updatefound`, avant installation confirmée [src/hooks/use-pwa-update.ts:20]
- [x] [Review][Patch] Les erreurs de `prompt()` ou `userChoice` peuvent laisser une invite d'installation périmée [src/hooks/use-pwa-install.ts:37]
- [x] [Review][Patch] Le bouton d'installation peut réutiliser deux fois le même `beforeinstallprompt` [src/hooks/use-pwa-install.ts:37]
- [x] [Review][Patch] Une mise à jour déjà `waiting` avant l'attachement du listener n'est jamais signalée [src/hooks/use-pwa-update.ts:17]
- [x] [Review][Patch] `controllerchange` peut déclencher plusieurs rechargements sans garde anti-répétition [src/hooks/use-pwa-update.ts:27]
- [x] [Review][Patch] Le rejet "Plus tard" n'est pas conservé si le layout remonte pendant la session [src/components/pwa/register-sw.tsx:12]
---

## Dev Notes

### CRITIQUE â€” Ce qui existe dÃ©jÃ  (NE PAS recrÃ©er)

| Fichier | Ã‰tat actuel | Action requise |
|---------|-------------|----------------|
| `src/app/sw.ts` | Serwist avec `skipWaiting: true`, `clientsClaim: true`, `defaultCache` | **NE PAS TOUCHER** â€” Story 2.2 |
| `src/app/manifest.ts` | Complet : name, icons 192/512/maskable, display standalone, theme_color #1B3070 | **NE PAS TOUCHER** |
| `next.config.ts` | `withSerwist` configurÃ© : swSrc, swDest, disable en dev, reloadOnOnline, cacheOnNavigation | **NE PAS TOUCHER** |
| `src/components/pwa/register-sw.tsx` | Enregistrement SW basique + `console.warn` Ã  supprimer | **MODIFIER** |
| `src/messages/fr-NE.json` | Sections auth, forgotPassword, resetPassword | **MODIFIER : ajouter `pwa`** |

### CRITIQUE â€” SÃ©quence d'Ã©vÃ©nements SW avec skipWaiting: true

Avec `skipWaiting: true` + `clientsClaim: true` dans `sw.ts`, la sÃ©quence lors d'une mise Ã  jour est :

```
1. registration.updatefound â†’ registration.installing = nouveau SW
2. installing.statechange: "installing" â†’ "installed"  
   (avec skipWaiting: true, peut passer Ã  "activating" sans rester "installed")
3. controllerchange â†’ navigator.serviceWorker.controller = nouveau SW
```

**Pattern fiable pour dÃ©tecter une mise Ã  jour (pas une premiÃ¨re installation) :**

```typescript
// Capture le controller au moment du render initial
const hadController = useRef(!!navigator.serviceWorker.controller);

// Dans l'effet updatefound :
registration.addEventListener('updatefound', () => {
  if (!hadController.current) return; // premiÃ¨re installation, pas une mise Ã  jour
  const installing = registration.installing;
  if (!installing) return;
  installing.addEventListener('statechange', () => {
    if (installing.state === 'installed') {
      onUpdateReady(); // afficher toast
    }
  });
});

// Rechargement quand nouveau SW prend le contrÃ´le :
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (hadController.current) {
    window.location.reload();
  }
});
```

**Alternative plus robuste** (si `statechange: installed` est court-circuitÃ© par skipWaiting) :

```typescript
// Utiliser uniquement controllerchange pour le rechargement
// Utiliser updatefound pour la notification anticipÃ©e
registration.addEventListener('updatefound', () => {
  if (!hadController.current) return;
  onUpdateReady(); // toast immÃ©diat dÃ¨s que l'update commence
});

navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (!hadController.current) {
    hadController.current = true; // dÃ©sormais on a un controller
    return;
  }
  window.location.reload(); // vraie mise Ã  jour â†’ reload
});
```

### CRITIQUE â€” beforeinstallprompt : typage TypeScript

`BeforeInstallPromptEvent` n'est pas dans `lib.dom.d.ts` (TypeScript 5.x). DÃ©clarer localement :

```typescript
// src/hooks/use-pwa-install.ts
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

// Augmenter le type Window pour l'Ã©vÃ©nement
declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
```

Cela Ã©vite les `as any` et satisfait TypeScript strict.

### CRITIQUE â€” SW dÃ©sactivÃ© en dÃ©veloppement

`next.config.ts` : `disable: process.env.NODE_ENV !== "production"` â†’ en `pnpm dev`, le SW n'est pas enregistrÃ©, `beforeinstallprompt` ne se dÃ©clenche jamais.

**En consÃ©quence :**
- L'install banner et les toast de mise Ã  jour ne sont pas visibles en dev
- Pour tester : `pnpm build && pnpm start` (production locale)
- **Ne pas modifier la config `disable`** â€” c'est voulu (Ã©vite les conflits HMR Turbopack)

### Design du banner d'installation

CohÃ©rence avec les banners existants dans `login/page.tsx` (session-expired, reset-success) et le style neobrutalism du design system. Banner en bas de l'Ã©cran :

```tsx
// Pattern banner â€” Ã  adapter aux tokens DESIGN.md
<div
  role="banner"
  className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 
             border-t border-border bg-card px-4 py-3 shadow-raised"
>
  <div className="flex items-center gap-2 text-sm text-foreground">
    <Download className="size-4 shrink-0 text-brand-navy" />
    <span>Installer Quotation Logistique sur votre appareil</span>
  </div>
  <div className="flex items-center gap-2">
    <Button size="sm" variant="default" onClick={handleInstall}>
      Installer
    </Button>
    <Button size="sm" variant="ghost" onClick={handleDismiss}>
      Plus tard
    </Button>
  </div>
</div>
```

Tokens disponibles : `bg-card`, `border-border`, `text-foreground`, `text-brand-navy`, `shadow-raised` (dÃ©finis Story 1.1 dans `globals.css`).

### Toast de mise Ã  jour â€” Sonner dÃ©jÃ  configurÃ©

`sonner` `<Toaster>` est montÃ© dans `layout.tsx` avec `richColors position="top-right"`. Utiliser :

```typescript
import { toast } from "sonner";

toast.info("Mise Ã  jour disponible. L'application va se recharger.");
// ou
toast("Mise Ã  jour disponible", {
  description: "L'application va se recharger automatiquement.",
  duration: 4000,
});
```

### PiÃ¨ges & anti-patterns

| âŒ INTERDIT | âœ… CORRECT |
|---|---|
| Modifier `sw.ts` (cache strategy) | `sw.ts` = Story 2.2, ne pas toucher |
| `console.warn("SW registered:", registration)` | Supprimer ce log â€” dÃ©jÃ  dans le fichier existant |
| DÃ©clencher la notification de mise Ã  jour Ã  la premiÃ¨re visite | Guard avec `hadController.current` |
| `import { toast } from "@/components/ui/sonner"` | `import { toast } from "sonner"` (package direct, pas le wrapper composant) |
| Augmentation globale de Window sans `declare global` | Toujours utiliser `declare global { interface WindowEventMap { ... } }` |
| `router` depuis `next/router` | Toujours `next/navigation` pour App Router |
| Tenter d'utiliser `useTranslations` avant montage du provider | Utiliser textes FR littÃ©raux dans `register-sw.tsx` |

### HÃ©ritage stories prÃ©cÃ©dentes â€” Ã€ LIRE

**Story 1.1 :**
- `register-sw.tsx` crÃ©Ã© avec `RegisterSW` component â€” modifier ce fichier, ne pas recrÃ©er
- `manifest.ts` complet avec icons 192/512/maskable â€” ne pas modifier
- SW dÃ©sactivÃ© en dev intentionnellement

**Story 1.5 (auth app shell + navigation) :**
- Le shell applicatif `(app)/layout.tsx` et la navigation bottom ont Ã©tÃ© implÃ©mentÃ©s
- `<RegisterSW />` est montÃ© dans `src/app/layout.tsx` (niveau racine), avant le contenu de l'app
- Le banner d'installation doit utiliser `z-50` ou plus pour passer au-dessus du bottom nav (vÃ©rifier le z-index de la nav)

**Convention `"use client"` :**
- `register-sw.tsx` a dÃ©jÃ  `"use client"` en premiÃ¨re ligne â€” conserver
- Les hooks `use-pwa-install.ts` et `use-pwa-update.ts` sont des modules client â€” **pas de directive** (modules, pas composants)

**Pattern hooks existants :**
- Voir `src/hooks/use-diagnostics.ts` pour le pattern des hooks personnalisÃ©s du projet

### Checklist d'acceptation technique

- [ ] `beforeinstallprompt` Ã©coutÃ© et prompt natif dÃ©clenchÃ© au clic
- [ ] `appinstalled` efface le deferred prompt â†’ banner disparaÃ®t
- [ ] "Plus tard" ferme le banner (sans re-dÃ©clencher Ã  la prochaine navigation de la mÃªme session)
- [ ] Premier chargement : aucun toast de mise Ã  jour
- [ ] Mise Ã  jour dÃ©tectÃ©e : toast FR + rechargement automatique
- [ ] Aucun `console.warn` / `console.log` non intentionnel
- [ ] TypeScript strict : pas de `any`, `BeforeInstallPromptEvent` typÃ©
- [ ] `pnpm check` âœ“ + `pnpm build` âœ“

---

## RÃ©fÃ©rences

- `src/components/pwa/register-sw.tsx` â€” composant existant Ã  modifier
- `src/app/sw.ts` â€” configuration SW Serwist (NE PAS MODIFIER, Story 2.2)
- `src/app/manifest.ts` â€” manifest PWA complet (NE PAS MODIFIER)
- `next.config.ts` â€” config Serwist (NE PAS MODIFIER)
- `src/messages/fr-NE.json` â€” ajouter section `pwa`
- `src/hooks/use-diagnostics.ts` â€” pattern hook existant (rÃ©fÃ©rence)
- [Epic 1 Â§Story 1.8] â€” FR-38 (installation PWA), FR-39 (mise Ã  jour PWA)
- [Architecture Â§M10] â€” Offline/PWA module, `public/sw.js`, `next.config.ts`
- [ADD-15] â€” PWA shell strategy (story 2.2 implÃ©mente la stratÃ©gie SW complÃ¨te)
- [@serwist/next v9.5.11] â€” installÃ©, `withSerwistInit` dÃ©jÃ  configurÃ©

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- CrÃ©Ã© `use-pwa-install.ts` : hook `usePWAInstall()` avec typage strict `BeforeInstallPromptEvent` (augmentation `WindowEventMap`), Ã©coute `beforeinstallprompt` + `appinstalled`, retourne `{ canInstall, promptInstall }`.
- CrÃ©Ã© `use-pwa-update.ts` : hook `usePWAUpdate(registration, { onUpdateFound })` avec guard `hadController` (ref initialisÃ©e au mount) pour Ã©viter fausse notification au premier chargement. Rechargement via `controllerchange`. StratÃ©gie robuste pour `skipWaiting: true`.
- ModifiÃ© `register-sw.tsx` : Ã©tat `registration` stockÃ© aprÃ¨s `navigator.serviceWorker.register()`, `console.warn` supprimÃ©, banner installation FR avec Ã©tat `dismissed` local (bouton "Plus tard" masque le banner sans dÃ©clencher la dialog native), toast Sonner pour mise Ã  jour.
- ModifiÃ© `fr-NE.json` : section `pwa` ajoutÃ©e avec 5 clÃ©s de traduction FR.
- `pnpm check` : 0 erreurs, 3 warnings prÃ©-existants dans fichiers test, 169 tests âœ“.
- `pnpm build` : compilÃ© sans erreur, Serwist gÃ©nÃ¨re `public/sw.js`.

### File List

- `src/hooks/use-pwa-install.ts` â€” CRÃ‰Ã‰
- `src/hooks/use-pwa-update.ts` â€” CRÃ‰Ã‰
- `src/components/pwa/register-sw.tsx` â€” MODIFIÃ‰
- `src/messages/fr-NE.json` â€” MODIFIÃ‰
- `_bmad-output/implementation-artifacts/1-8-pwa-install-update.md` â€” CE FICHIER
- `_bmad-output/implementation-artifacts/sprint-status.yaml` â€” MODIFIÃ‰ (status â†’ review)

