# Deferred Work

## Deferred from: code review de 1-4-user-login (2026-06-23)

- **Commentaire SQL CASE trompeur** [`src/lib/lockout.ts:22`] — Indique "atomic" alors que le flux global ne l'est pas. Qualité de commentaire uniquement.
- **`selectedRole` cosmétique uniquement** [`src/components/auth/login-form.tsx:27`] — Intentionnel MVP-0. Story 1.6 câblera la vérification de rôle.
- **Énumération d'emails via lockout** [`src/lib/lockout.ts`] — Un attacker peut déduire qu'un email est enregistré si le compte finit par se verrouiller. Acceptable MVP-0, durcissement Story 1.6.
- **Rate limiting réseau non implémenté** — NFR-S6 spécifie 10 req/min/IP au niveau passerelle. Hors scope Story 1.4, Story 1.6 ou infrastructure.
- **`enforceExpiry` retourne false si LAST_ONLINE_KEY absent** [`src/hooks/use-offline-session.ts:35`] — Comportement intentionnel pour nouveaux utilisateurs sans historique offline. Documenter si comportement doit changer.
- **Double appel `enforceExpiry` (SessionGuard + useOfflineSession)** — SessionGuard est pré-existant. Hook non monté avant Story 1.5. Réévaluer l'interaction en Story 1.5 lors du montage.
