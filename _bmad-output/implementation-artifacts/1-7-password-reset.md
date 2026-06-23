---
story_key: 1-7-password-reset
epic_num: 1
story_num: 7
status: done
baseline_commit: c2da5be45de5dc1795c6fbc33c8e6e5f29995aa2
---

# Story 1.7 : RÃ©initialisation du mot de passe (FR-4)

**Statut :** done

## Story

**En tant que** utilisateur ayant oubliÃ© son mot de passe,
**Je veux** demander un lien de rÃ©initialisation par email,
**Afin que** je rÃ©cupÃ¨re l'accÃ¨s Ã  mon compte en autonomie.

---

## CritÃ¨res d'acceptation (BDD)

**AC1 â€” Demande de rÃ©initialisation rÃ©ussie**

```
GIVEN  l'Ã©cran /forgot-password avec le formulaire FR
WHEN   je saisis un email valide enregistrÃ© et je soumets
THEN   Better Auth gÃ©nÃ¨re un token sÃ©curisÃ© 24h et appelle sendResetPassword
AND    un email rÃ©el est envoyÃ© Ã  l'adresse (SMTP/Resend)
AND    un toast/message FR s'affiche : "Lien de rÃ©initialisation envoyÃ©."
AND    ce message s'affiche que l'email soit enregistrÃ© ou non (pas d'Ã©numÃ©ration)
```

**AC2 â€” Consommation unique du token**

```
GIVEN  un lien de rÃ©initialisation reÃ§u par email (token valide 24h)
WHEN   je l'utilise une premiÃ¨re fois pour dÃ©finir un nouveau mot de passe
THEN   le mot de passe est mis Ã  jour et le token est invalidÃ© par Better Auth
AND    la page redirige vers /login avec ?reset=success

GIVEN  le mÃªme lien de rÃ©initialisation (token dÃ©jÃ  consommÃ©)
WHEN   je l'utilise une seconde fois
THEN   Better Auth retourne une erreur et le formulaire affiche :
       "Ce lien est invalide ou a dÃ©jÃ  Ã©tÃ© utilisÃ©."
```

**AC3 â€” Token expirÃ© (24h)**

```
GIVEN  un token de rÃ©initialisation gÃ©nÃ©rÃ© il y a plus de 24h
WHEN   j'accÃ¨de Ã  /reset-password?token=...
THEN   Better Auth retourne une erreur d'expiration
AND    le formulaire affiche : "Ce lien a expirÃ©. Demandez un nouveau lien."
AND    un bouton "Demander un nouveau lien" redirige vers /forgot-password
```

**AC4 â€” Rate limiting (3 demandes / heure / email)**

```
GIVEN  un utilisateur ayant dÃ©jÃ  soumis 3 demandes de rÃ©initialisation
       pour le mÃªme email dans la mÃªme heure glissante
WHEN   il soumet une 4e demande
THEN   la demande est bloquÃ©e cÃ´tÃ© serveur avant envoi d'email
AND    l'API retourne une erreur indiquant de rÃ©essayer dans une heure
AND    le formulaire affiche : "Trop de demandes. RÃ©essayez dans une heure."
```

**AC5 â€” Feedback succÃ¨s sur la page de connexion**

```
GIVEN  un utilisateur venant de rÃ©initialiser son mot de passe avec succÃ¨s
       (reset-password-form redirige vers /login?reset=success)
WHEN   la page /login se charge avec ?reset=success
THEN   une banniÃ¨re FR s'affiche : "Mot de passe rÃ©initialisÃ© avec succÃ¨s. Reconnectez-vous."
AND    cette banniÃ¨re est accessible (role="alert")
```

**AC6 â€” Texte entiÃ¨rement en franÃ§ais**

```
GIVEN  les pages /forgot-password et /reset-password
WHEN   je les consulte
THEN   tous les titres, descriptions, labels, boutons, messages d'erreur sont en FR
AND    aucun texte en anglais n'est visible par l'utilisateur
```

**AC7 â€” Validation du nouveau mot de passe**

```
GIVEN  le formulaire /reset-password
WHEN   je saisis un mot de passe < 8 caractÃ¨res
THEN   une erreur inline FR s'affiche : "Le mot de passe doit contenir au moins 8 caractÃ¨res."

WHEN   les deux champs ne correspondent pas
THEN   une erreur inline FR s'affiche : "Les mots de passe ne correspondent pas."
```

**AC8 â€” QualitÃ© : pnpm check + build**

```
GIVEN  tous les fichiers crÃ©Ã©s/modifiÃ©s
WHEN   je lance pnpm check
THEN   lint âœ“ + typecheck âœ“ + tous les tests existants passent
AND    pnpm build passe sans erreur
```

---

## PÃ©rimÃ¨tre de cette story

**INCLUS :**

- `src/app/(auth)/forgot-password/page.tsx` â€” MODIFIER : traduire titres/descriptions en FR
- `src/app/(auth)/reset-password/page.tsx` â€” MODIFIER : traduire titres/descriptions en FR
- `src/components/auth/forgot-password-form.tsx` â€” MODIFIER : tout le texte en FR + afficher les messages d'erreur cÃ´tÃ© serveur
- `src/components/auth/reset-password-form.tsx` â€” MODIFIER : tout le texte en FR + messages d'erreur FR
- `src/app/(auth)/login/page.tsx` â€” MODIFIER : gÃ©rer `?reset=success` â†’ banniÃ¨re FR
- `src/lib/auth.ts` â€” MODIFIER : configurer `resetPasswordTokenExpiresIn: 86400` + implÃ©menter `sendResetPassword` avec email rÃ©el + plugin rate limiting
- `src/lib/email.ts` â€” CRÃ‰ER : utilitaire `sendEmail()` (Resend ou nodemailer)
- `src/messages/fr-NE.json` â€” MODIFIER : ajouter sections `forgotPassword` + `resetPassword`
- `env.example` â€” MODIFIER : ajouter les variables SMTP/email

**EXCLU (autres stories ou MVP-1) :**

- Purge du store local Dexie aprÃ¨s reset (Story 6.1 â€” seam LocalCrypto no-op en MVP-0)
- Reconstruction de l'index FlexSearch aprÃ¨s reset (Story 6.1 â€” MVP-1)
- Rate limiting au niveau middleware/gateway (infrastructure)
- Page de gestion mot de passe depuis /compte/profil (Epic 2+)
- Email de confirmation de changement de mot de passe (non requis FR-4)

---

## TÃ¢ches / Sous-tÃ¢ches

### T1 â€” CrÃ©er `src/lib/email.ts` : utilitaire d'envoi d'email (AC: #1)

- [x] ImplÃ©menter `sendEmail({ to, subject, html, text })` via Resend (prioritÃ©) ou nodemailer (fallback)
- [x] Lire `RESEND_API_KEY` depuis env (ou `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`)
- [x] En dev sans clÃ© : logger l'email dans la console (comportement actuel conservÃ© comme fallback)
- [x] Template HTML minimaliste pour le reset (logo + lien bouton)

### T2 â€” Modifier `src/lib/auth.ts` : config password reset + rate limiting (AC: #1, #2, #3, #4)

- [x] Ajouter `resetPasswordTokenExpiresIn: 86400` dans `emailAndPassword` (24h en secondes)
- [x] Remplacer le stub console.log de `sendResetPassword` par un appel Ã  `sendEmail()`
- [x] CrÃ©er `passwordResetRateLimitPlugin` (in-memory Map, fenÃªtre horaire glissante, max 3/h/email)
- [x] Ajouter le plugin dans la liste `plugins: [accountLockoutPlugin, passwordResetRateLimitPlugin]`

### T3 â€” Modifier `src/components/auth/forgot-password-form.tsx` : traduction FR (AC: #1, #4, #6)

- [x] Tous les textes en FR (placeholder, bouton, lien retour, message succÃ¨s)
- [x] Traduire le message de succÃ¨s : "Si un compte correspond Ã  cet email, vous recevrez un lien de rÃ©initialisation."
- [x] Mapper l'erreur rate-limit â†’ "Trop de demandes. RÃ©essayez dans une heure."
- [x] GÃ©rer les erreurs gÃ©nÃ©riques â†’ "Une erreur est survenue. Veuillez rÃ©essayer."

### T4 â€” Modifier `src/components/auth/reset-password-form.tsx` : traduction FR (AC: #2, #3, #6, #7)

- [x] Tous les textes en FR (labels, placeholders, bouton, erreurs inline)
- [x] Erreur token invalide/consommÃ© â†’ "Ce lien est invalide ou a dÃ©jÃ  Ã©tÃ© utilisÃ©."
- [x] Erreur token absent â†’ "Aucun lien de rÃ©initialisation fourni."
- [x] Erreur mot de passe court â†’ "Le mot de passe doit contenir au moins 8 caractÃ¨res."
- [x] Erreur mots de passe diffÃ©rents â†’ "Les mots de passe ne correspondent pas."
- [x] Erreur Better Auth sur token expirÃ© â†’ "Ce lien a expirÃ©. Demandez un nouveau lien."

### T5 â€” Modifier `src/app/(auth)/forgot-password/page.tsx` : FR (AC: #6)

- [x] Titre : "Mot de passe oubliÃ© ?"
- [x] Description : "Saisissez votre email pour recevoir un lien de rÃ©initialisation."
- [x] Redirect vers "/" si session (au lieu de "/dashboard" â€” l'app n'a pas de /dashboard, elle a "/")

### T6 â€” Modifier `src/app/(auth)/reset-password/page.tsx` : FR (AC: #6)

- [x] Titre : "Nouveau mot de passe"
- [x] Description : "Choisissez un mot de passe sÃ©curisÃ© pour votre compte."
- [x] Redirect vers "/" si session (cohÃ©rence avec les autres pages auth)

### T7 â€” Modifier `src/app/(auth)/login/page.tsx` : banniÃ¨re reset=success (AC: #5)

- [x] Lire `reason` ET `reset` depuis `searchParams` (dÃ©structurer les deux)
- [x] Si `reset === "success"` : afficher banniÃ¨re FR avec role="alert"
- [x] Style de la banniÃ¨re : cohÃ©rent avec les banniÃ¨res session-expired/session-revoked existantes

### T8 â€” Modifier `src/messages/fr-NE.json` : nouvelles sections (AC: #1â€“#7)

- [x] Ajouter section `"forgotPassword"` (voir Dev Notes)
- [x] Ajouter section `"resetPassword"` (voir Dev Notes)

### T9 â€” Modifier `env.example` : variables email (AC: #1)

- [x] Ajouter bloc SMTP/Resend avec commentaires

### T10 â€” VÃ©rification finale (AC: #8)

- [x] `pnpm check` : lint âœ“ typecheck âœ“ tests existants âœ“
- [x] `pnpm build` : passe sans erreur

### Review Findings

- [x] [Review][Patch] Le rate limiting password reset cible le mauvais endpoint Better Auth [`src/lib/auth.ts:61`]
- [x] [Review][Patch] Les erreurs de callback `INVALID_TOKEN` ne sont pas reconnues par le formulaire reset [`src/components/auth/reset-password-form.tsx:23`]
- [x] [Review][Patch] Une panne d'envoi email peut réintroduire l'énumération de comptes [`src/lib/auth.ts:94`]
- [x] [Review][Patch] Le rate limiting utilise l'email brut sans normalisation [`src/lib/auth.ts:65`]
- [x] [Review][Patch] La production peut accepter le reset sans envoyer d'email réel si `RESEND_API_KEY` manque [`src/lib/email.ts:11`]
- [x] [Review][Patch] `env.example` annonce un fallback SMTP que `sendEmail()` n'implémente pas [`env.example:24`]
- [x] [Review][Patch] Le template email interpole `email` et `resetUrl` sans échappement HTML/attribut [`src/lib/email.ts:45`]
- [x] [Review][Patch] La configuration Better Auth ne définit pas `baseURL` / `BETTER_AUTH_URL` malgré des liens de reset dépendants de l'origine [`src/lib/auth.ts:86`]
- [x] [Review][Patch] Aucun test ne couvre le flow reset, le rate limit ou `error=INVALID_TOKEN` [`src/components/auth/reset-password-form.tsx:23`]

---

## Dev Notes

### CRITIQUE â€” Ce qui existe dÃ©jÃ  dans le starter (ne pas recrÃ©er)

Le starter `agentic-coding-starter-kit` a dÃ©jÃ  scaffoldÃ© toutes les routes et composants pour le password reset. **Ne rien crÃ©er Ã  partir de zÃ©ro** â€” modifier ce qui existe.

| Fichier | Ã‰tat actuel | Ce qui manque |
|---------|-------------|---------------|
| `src/app/(auth)/forgot-password/page.tsx` | Existe, English | Titres FR + redirect "/" |
| `src/app/(auth)/reset-password/page.tsx` | Existe, English | Titres FR + redirect "/" |
| `src/components/auth/forgot-password-form.tsx` | Existe, functional, English | Tout le texte en FR |
| `src/components/auth/reset-password-form.tsx` | Existe, functional, English | Tout le texte en FR |
| `src/lib/auth.ts` | Existe, stub console.log | 24h config + email rÃ©el + rate limit |
| `src/lib/auth-client.ts` | `requestPasswordReset` + `resetPassword` dÃ©jÃ  exportÃ©s | Rien Ã  faire |
| `src/app/(auth)/login/page.tsx` | Existe, gÃ¨re session-expired/revoked | Ajouter `?reset=success` |

**`requestPasswordReset` et `resetPassword` sont dÃ©jÃ  exportÃ©s depuis `@/lib/auth-client`** â€” les formulaires les importent dÃ©jÃ . Pas de changement d'import nÃ©cessaire sur les formulaires cÃ´tÃ© client.

### CRITIQUE â€” redirect vers "/" pas "/dashboard"

Le starter redirige vers `/dashboard` quand un utilisateur dÃ©jÃ  authentifiÃ© accÃ¨de Ã  `/forgot-password` ou `/reset-password`. **Ce projet n'a pas de route `/dashboard`** (voir architecture Â§Structure, route `(app)/page.tsx` = `/`). Corriger en `redirect("/")`.

### Configuration Better Auth â€” Token 24h

```typescript
// src/lib/auth.ts â€” dans emailAndPassword
emailAndPassword: {
  enabled: true,
  resetPasswordTokenExpiresIn: 86400, // 24 heures (FR-4)
  sendResetPassword: async ({ user, url }) => {
    await sendEmail({
      to: user.email,
      subject: "RÃ©initialisation de votre mot de passe â€” Quotation Logistique",
      html: buildResetPasswordHtml(user.email, url),
      text: `RÃ©initialisez votre mot de passe : ${url}\nCe lien expire dans 24h.`,
    });
  },
},
```

**Note :** Better Auth gÃ¨re nativement le token single-use et l'expiration. Ne pas implÃ©menter cette logique manuellement.

### Plugin rate limiting password reset â€” ImplÃ©mentation exacte

```typescript
// Ajouter dans src/lib/auth.ts, AVANT l'export `auth`

// In-memory rate limiter â€” acceptable MVP-0 (instance unique)
// MVP-1 : migrer vers Redis ou table DB si multi-instance
const passwordResetAttempts = new Map<string, number[]>();

const passwordResetRateLimitPlugin = {
  id: "password-reset-rate-limit",
  hooks: {
    before: [
      {
        matcher(context: Record<string, unknown>) {
          return context["path"] === "/forget-password";
        },
        async handler(context: Record<string, unknown>) {
          const body = context["body"] as Record<string, unknown> | undefined;
          const email = typeof body?.["email"] === "string" ? body["email"] : undefined;
          if (!email) return;

          const now = Date.now();
          const windowMs = 3_600_000; // 1 heure glissante
          const attempts = (passwordResetAttempts.get(email) ?? []).filter(
            (t) => now - t < windowMs
          );

          if (attempts.length >= 3) {
            // Better Auth intercepte les erreurs levÃ©es dans les hooks
            throw new Error("RESET_RATE_LIMIT_EXCEEDED");
          }

          attempts.push(now);
          passwordResetAttempts.set(email, attempts);
        },
      },
    ],
  },
};

export const auth = betterAuth({
  // ...
  plugins: [accountLockoutPlugin, passwordResetRateLimitPlugin],
  // ...
});
```

**Comportement de l'erreur :** Better Auth transforme les erreurs levÃ©es dans les hooks en rÃ©ponses HTTP 500 ou dans `result.error`. CÃ´tÃ© client, `requestPasswordReset` retournera `result.error.message === "RESET_RATE_LIMIT_EXCEEDED"`. Le formulaire doit mapper cette chaÃ®ne vers le message FR.

### Utilitaire email `src/lib/email.ts` â€” ImplÃ©mentation

Utiliser **Resend** en prioritÃ© (REST API, recommandÃ© sur Vercel, pas de config SMTP) :

```typescript
// src/lib/email.ts

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev fallback : log console (comportement existant conservÃ©)
    // eslint-disable-next-line no-console
    console.log(`\n${"=".repeat(60)}\nEMAIL (dev mode â€” configure RESEND_API_KEY for real sending)\nTo: ${to}\nSubject: ${subject}\nContent: ${text}\n${"=".repeat(60)}\n`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Quotation Logistique <noreply@quotation.app>",
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Email send failed: ${error}`);
  }
}

export function buildResetPasswordHtml(email: string, resetUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px">
      <h2 style="color:#1a2744">RÃ©initialisation de votre mot de passe</h2>
      <p>Bonjour,</p>
      <p>Vous avez demandÃ© la rÃ©initialisation du mot de passe pour le compte <strong>${email}</strong>.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}"
           style="background:#1a2744;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          RÃ©initialiser mon mot de passe
        </a>
      </p>
      <p style="color:#6b7280;font-size:14px">Ce lien est valable 24 heures et ne peut Ãªtre utilisÃ© qu'une seule fois.</p>
      <p style="color:#6b7280;font-size:14px">Si vous n'avez pas demandÃ© cette rÃ©initialisation, ignorez cet email.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
      <p style="color:#9ca3af;font-size:12px">Quotation Logistique â€” Ne pas rÃ©pondre Ã  cet email.</p>
    </div>
  `;
}
```

### Textes FR exacts pour les formulaires

**`forgot-password-form.tsx` â€” Ã©tats et messages :**

| Ã‰tat | Texte FR |
|------|----------|
| Label email | `Adresse e-mail` |
| Placeholder | `vous@exemple.com` |
| Bouton submit (idle) | `Envoyer le lien` |
| Bouton submit (pending) | `Envoi en coursâ€¦` |
| Message succÃ¨s | `Si un compte correspond Ã  cet email, vous recevrez un lien de rÃ©initialisation.` |
| Bouton retour | `Retour Ã  la connexion` |
| Lien bas de page | `Vous vous souvenez de votre mot de passe ?` + lien `Se connecter` |
| Erreur rate limit | `Trop de demandes. RÃ©essayez dans une heure.` |
| Erreur gÃ©nÃ©rique | `Une erreur est survenue. Veuillez rÃ©essayer.` |

**`reset-password-form.tsx` â€” Ã©tats et messages :**

| Ã‰tat | Texte FR |
|------|----------|
| Label nouveau mdp | `Nouveau mot de passe` |
| Placeholder nouveau mdp | `Au moins 8 caractÃ¨res` |
| Label confirmation | `Confirmer le mot de passe` |
| Placeholder confirmation | `Confirmer votre nouveau mot de passe` |
| Bouton submit (idle) | `RÃ©initialiser le mot de passe` |
| Bouton submit (pending) | `RÃ©initialisationâ€¦` |
| Erreur mdp court | `Le mot de passe doit contenir au moins 8 caractÃ¨res.` |
| Erreur mdp diffÃ©rents | `Les mots de passe ne correspondent pas.` |
| Erreur token invalide/consommÃ© | `Ce lien est invalide ou a dÃ©jÃ  Ã©tÃ© utilisÃ©.` |
| Erreur token absent | `Aucun lien de rÃ©initialisation fourni.` |
| Erreur Better Auth expirÃ©e | `Ce lien a expirÃ©. Demandez un nouveau lien.` |
| Bouton nouveau lien | `Demander un nouveau lien` |
| Erreur gÃ©nÃ©rique | `Une erreur est survenue. Veuillez rÃ©essayer.` |

**DÃ©tection de l'expiration du token dans `reset-password-form.tsx` :**
Better Auth retourne `result.error` avec un message contenant "expired" ou un code spÃ©cifique. VÃ©rifier `result.error.message?.toLowerCase().includes("expired")` OU `result.error.code === "EXPIRED_TOKEN"` pour mapper vers le message FR d'expiration.

### `login/page.tsx` â€” Ajout de la banniÃ¨re reset=success

```typescript
// src/app/(auth)/login/page.tsx
// searchParams doit inclure 'reset' en plus de 'reason'
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; reset?: string }>
}) {
  const { reason, reset } = await searchParams;
  const isForced = reason === "session-expired" || reason === "session-revoked";
  // ... (logique existante)

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
      {/* BanniÃ¨res existantes pour session-expired et session-revoked â€” NE PAS MODIFIER */}
      {reason === "session-expired" && ( /* ... existant ... */ )}
      {reason === "session-revoked" && ( /* ... existant ... */ )}

      {/* NOUVEAU : banniÃ¨re reset=success */}
      {reset === "success" && (
        <div
          role="alert"
          className="mb-4 w-full max-w-sm rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          Mot de passe rÃ©initialisÃ© avec succÃ¨s. Reconnectez-vous.
        </div>
      )}

      <LoginForm />
    </div>
  );
}
```

**Note :** Ne pas utiliser les tokens de couleur `status-expire-*` pour la banniÃ¨re de succÃ¨s â€” elles sont rÃ©servÃ©es aux Ã©tats d'erreur/expiration. Utiliser `green-50/200/800` directement pour cet Ã©tat positif unique.

### `fr-NE.json` â€” Sections Ã  ajouter

```json
"forgotPassword": {
  "title": "Mot de passe oubliÃ© ?",
  "description": "Saisissez votre email pour recevoir un lien de rÃ©initialisation.",
  "emailLabel": "Adresse e-mail",
  "emailPlaceholder": "vous@exemple.com",
  "submitIdle": "Envoyer le lien",
  "submitPending": "Envoi en coursâ€¦",
  "successMessage": "Si un compte correspond Ã  cet email, vous recevrez un lien de rÃ©initialisation.",
  "backToLogin": "Retour Ã  la connexion",
  "rememberPassword": "Vous vous souvenez de votre mot de passe ?",
  "signIn": "Se connecter",
  "errorRateLimit": "Trop de demandes. RÃ©essayez dans une heure.",
  "errorGeneric": "Une erreur est survenue. Veuillez rÃ©essayer."
},
"resetPassword": {
  "title": "Nouveau mot de passe",
  "description": "Choisissez un mot de passe sÃ©curisÃ© pour votre compte.",
  "newPasswordLabel": "Nouveau mot de passe",
  "newPasswordPlaceholder": "Au moins 8 caractÃ¨res",
  "confirmPasswordLabel": "Confirmer le mot de passe",
  "confirmPasswordPlaceholder": "Confirmer votre nouveau mot de passe",
  "submitIdle": "RÃ©initialiser le mot de passe",
  "submitPending": "RÃ©initialisationâ€¦",
  "errorMinLength": "Le mot de passe doit contenir au moins 8 caractÃ¨res.",
  "errorMismatch": "Les mots de passe ne correspondent pas.",
  "errorInvalidToken": "Ce lien est invalide ou a dÃ©jÃ  Ã©tÃ© utilisÃ©.",
  "errorNoToken": "Aucun lien de rÃ©initialisation fourni.",
  "errorExpiredToken": "Ce lien a expirÃ©. Demandez un nouveau lien.",
  "errorGeneric": "Une erreur est survenue. Veuillez rÃ©essayer.",
  "requestNewLink": "Demander un nouveau lien"
},
"login": {
  "resetSuccess": "Mot de passe rÃ©initialisÃ© avec succÃ¨s. Reconnectez-vous."
}
```

**Note :** La clÃ© `"login"` existe dÃ©jÃ  dans `fr-NE.json` sous `"auth"`. Ajouter `resetSuccess` dans `auth.login`.

### `env.example` â€” Variables Ã  ajouter

```bash
# Email (password reset)
# Option 1 â€” Resend (recommandÃ© pour Vercel) : https://resend.com
RESEND_API_KEY=re_...
EMAIL_FROM="Quotation Logistique <noreply@votre-domaine.com>"
# Option 2 â€” SMTP classique (nodemailer)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=user@example.com
# SMTP_PASS=password
```

### PiÃ¨ges & anti-patterns

| âŒ INTERDIT | âœ… CORRECT |
|---|---|
| CrÃ©er nouvelles routes ou composants auth | Modifier ceux qui existent dans le starter |
| Redirect vers `/dashboard` | Redirect vers `/` â€” ce projet n'a pas /dashboard |
| ImplÃ©menter la logique token single-use | Better Auth gÃ¨re Ã§a nativement |
| Text anglais dans les composants | Tout en FR (sauf code/variables) |
| `import type { ... }` pour `sendEmail` server-only dans un client component | `email.ts` est server-only â€” n'importer que dans `auth.ts`, jamais dans un composant client |
| `float` pour les mots de passe ou tokens | Pas de calcul monÃ©taire ici â€” sans objet |
| `router` importÃ© depuis `next/router` | Toujours `next/navigation` |

### HÃ©ritage stories prÃ©cÃ©dentes â€” Ã€ LIRE

**Story 1.4 â€” Lockout pattern :**
- `src/lib/lockout.ts` â€” pattern de rate limiting existant basÃ© sur la table `user`
- La story 1-7 crÃ©e un plugin sÃ©parÃ© (in-memory) car les resets ne sont pas des logins
- Ne pas modifier `lockout.ts` â€” garder les deux systÃ¨mes indÃ©pendants

**Story 1.6 â€” Convention exports `auth-client.ts` :**
- `requestPasswordReset` et `resetPassword` dÃ©jÃ  exportÃ©s depuis `@/lib/auth-client`
- **Ne jamais importer directement depuis `better-auth/react`**

**Styles de banniÃ¨res existants dans `login/page.tsx` :**
- `border border-status-expire-bg bg-status-expire-bg text-status-expire-text`
- La banniÃ¨re reset-success utilise les classes Tailwind `green-*` directement (pas de token sÃ©mantique pour un Ã©tat positif one-off)

**Convention `"use client"` :**
- Les deux formulaires (`forgot-password-form.tsx`, `reset-password-form.tsx`) ont dÃ©jÃ  `"use client"` â€” conserver en premiÃ¨re ligne
- `email.ts` et les modifications de `auth.ts` sont server-only â€” pas de directive

**Gestion des erreurs Better Auth cÃ´tÃ© client :**
Le pattern est `result.error?.message` ou `result.error?.code`. Better Auth v1.6 peut retourner :
- `result.error.code` â€” code machine lisible si Better Auth le fournit
- `result.error.message` â€” message anglais par dÃ©faut de Better Auth

Pour le rate limit custom (plugin hook), Better Auth transforme `throw new Error("RESET_RATE_LIMIT_EXCEEDED")` â†’ `result.error.message === "RESET_RATE_LIMIT_EXCEEDED"`. Mapper cÃ´tÃ© formulaire :

```typescript
if (result.error) {
  if (result.error.message === "RESET_RATE_LIMIT_EXCEEDED") {
    setError("Trop de demandes. RÃ©essayez dans une heure.");
  } else {
    setError("Une erreur est survenue. Veuillez rÃ©essayer.");
  }
}
```

---

## RÃ©fÃ©rences

- `src/components/auth/forgot-password-form.tsx` â€” formulaire existant Ã  modifier
- `src/components/auth/reset-password-form.tsx` â€” formulaire existant Ã  modifier
- `src/app/(auth)/forgot-password/page.tsx` â€” page existante Ã  modifier
- `src/app/(auth)/reset-password/page.tsx` â€” page existante Ã  modifier
- `src/app/(auth)/login/page.tsx` â€” ajouter banner reset=success
- `src/lib/auth.ts` â€” configurer token 24h + email + rate limit plugin
- `src/lib/auth-client.ts` â€” requestPasswordReset + resetPassword dÃ©jÃ  exportÃ©s (ne pas modifier)
- `src/lib/lockout.ts` â€” pattern de rÃ©fÃ©rence pour rate limiting (ne pas modifier)
- `src/messages/fr-NE.json` â€” ajouter forgotPassword + resetPassword + auth.login.resetSuccess
- [Architecture Â§Auth] â€” token JWT 7j, Better Auth email/password, SMTP external dep
- [Architecture Â§Security] â€” NFR-S6 reset 3/h/email
- [FR-4] â€” lien email, token 24h, consommÃ© aprÃ¨s usage

---

## Dev Agent Record

### Completion Notes

- **T1** : `src/lib/email.ts` crÃ©Ã© â€” `sendEmail()` via Resend (fallback console en dev), `buildResetPasswordHtml()` template FR.
- **T2** : `auth.ts` mis Ã  jour â€” `resetPasswordTokenExpiresIn: 86400`, `sendResetPassword` appelle `sendEmail()`, plugin `passwordResetRateLimitPlugin` (in-memory Map, fenÃªtre 1h, max 3/email) ajoutÃ© aux plugins.
- **T3** : `forgot-password-form.tsx` entiÃ¨rement en FR â€” mapping `RESET_RATE_LIMIT_EXCEEDED` â†’ message FR, erreur gÃ©nÃ©rique FR.
- **T4** : `reset-password-form.tsx` entiÃ¨rement en FR â€” dÃ©tection expiration via `message.includes("expired")` || `code === "EXPIRED_TOKEN"`, Ã©tat `isExpired` affiche Ã©cran dÃ©diÃ© avec bouton "Demander un nouveau lien".
- **T5** : `forgot-password/page.tsx` â€” titres FR, redirect vers `/` (pas `/dashboard`).
- **T6** : `reset-password/page.tsx` â€” titres FR, redirect vers `/`, fallback Suspense en FR.
- **T7** : `login/page.tsx` â€” `searchParams` dÃ©structure `reason` + `reset`, banniÃ¨re `green-50/200/800` avec `role="alert"`.
- **T8** : `fr-NE.json` â€” sections `forgotPassword` + `resetPassword` + `auth.login.resetSuccess` ajoutÃ©es.
- **T9** : `env.example` â€” bloc email Resend/SMTP ajoutÃ©.
- **T10** : `pnpm check` âœ“ (lint 0 erreurs, typecheck âœ“, 163 tests âœ“) + `pnpm build` âœ“ (exit 0).

---

## File List

- `src/lib/email.ts` â€” CRÃ‰Ã‰
- `src/lib/auth.ts` â€” MODIFIÃ‰
- `src/components/auth/forgot-password-form.tsx` â€” MODIFIÃ‰
- `src/components/auth/reset-password-form.tsx` â€” MODIFIÃ‰
- `src/app/(auth)/forgot-password/page.tsx` â€” MODIFIÃ‰
- `src/app/(auth)/reset-password/page.tsx` â€” MODIFIÃ‰
- `src/app/(auth)/login/page.tsx` â€” MODIFIÃ‰
- `src/messages/fr-NE.json` â€” MODIFIÃ‰
- `env.example` â€” MODIFIÃ‰
- `_bmad-output/implementation-artifacts/1-7-password-reset.md` â€” MODIFIÃ‰
- `_bmad-output/implementation-artifacts/sprint-status.yaml` â€” MODIFIÃ‰

---

## Change Log

- 2026-06-23 : ImplÃ©mentation complÃ¨te story 1-7 â€” utilitaire email, config Better Auth 24h + rate limit, traduction FR de tous les composants auth, banniÃ¨re reset=success sur /login, sections i18n fr-NE.json, variables env email. Tous les ACs satisfaits. pnpm check âœ“ + pnpm build âœ“.
