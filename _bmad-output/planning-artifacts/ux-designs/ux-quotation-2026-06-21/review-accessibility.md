---
review: accessibility (a11y lens)
target: WCAG 2.1 AA
scope: consumer-grade mobile PWA (fr-NE, Sahel, offline-first)
date: 2026-06-21
reviewer: a11y lens (BMad UX workflow)
files_reviewed:
  - DESIGN.md
  - EXPERIENCE.md
  - .working/dashboard-hero-improved.html
mode: findings-only (no rewrites)
---

# Revue accessibilité — Quotation Logistique

> Lentille a11y sur les contrats UX finalisés. Cible **WCAG 2.1 AA** : 4.5:1 texte normal, 3:1 texte large (≥18.66px/24px bold ou ≥14px bold) et composants UI/graphiques. Ratios calculés selon la formule de luminance relative WCAG.

---

## 1. Contraste — ratios mesurés

### Paires conformes (référence)

| Paire | Ratio | Verdict |
|---|---|---|
| text-primary `#1c1a17` sur surface `#fff` | 17.36:1 | AA/AAA |
| text-on-dark `#faf6ef` sur navy `#1B3070` | 11.44:1 | AA/AAA |
| navy `#1B3070` lien sur blanc | 12.33:1 | AA/AAA |
| text-secondary `#57534e` sur app-bg `#f7f4ee` | 6.95:1 | AA |
| text-secondary `#57534e` sur surface `#fff` | 7.63:1 | AA |
| navy `#1B3070` sur amber `#F6A624` (segment « on ») | 6.10:1 | AA |
| status Validé `#1d4e6f` sur `#e9eff3` | 7.63:1 | AA |
| status Expiré `#b91c1c` sur `#f7e8e5` | 5.43:1 | AA |
| mock eyebrow `#b9c2da` sur navy | 6.92:1 | AA |
| mock seg inactif `#b6bcd0` sur navy | 6.51:1 | AA |
| mock hero-sub `#aab3cf` sur navy | 5.90:1 | AA |
| mock offline `#92580a` sur `#fdf6e7` | 5.39:1 | AA |

### Findings

**[BLOCKER] F1 — `text-faint` #a39d92 sur contenu signifiant échoue largement AA**
- Mesuré : **2.69:1 sur surface `#fff`** / **2.45:1 sur app-bg `#f7f4ee`** (seuil 4.5:1).
- DESIGN.md assigne `text-faint` à « Captions, placeholders, meta » (l.117) ; EXPERIENCE.md microcopy place sur ce ton du contenu *porteur de sens* :
  - Mock `.meta` (« Niamey → Ouagadougou · 18 juin ») = **trajet + date**, information métier, pas décorative — 2.69:1.
  - Mock `.greet` (« Bonjour, ») = label de contexte — 2.45:1.
  - Mock `.cur` (« FCFA ») = **devise du montant**, sémantiquement nécessaire pour lire le prix — 2.69:1.
  - Mock `.note` de bas de page — 2.69:1.
- **Placeholders** en `text-faint` : un placeholder ne doit jamais porter d'info indispensable (déjà couvert si labels liés, voir F8), mais s'il sert d'indice de format il doit atteindre 4.5:1.
- **Fix :** réserver `text-faint` au décoratif pur (séparateurs textuels « · » purement visuels). Pour tout texte lisible (meta, devise, captions, placeholders signifiants) basculer sur `text-muted` *assombri* (voir F2) ou `text-secondary`. Concrètement : trajet/date/devise → `text-secondary` (#57534e, 6.95–7.63:1) ; placeholders → au minimum un ton ≥4.5:1.

**[MAJOR] F2 — `text-muted` #78716c échoue AA sur fond paper (et limite sur blanc)**
- Mesuré : **4.37:1 sur app-bg `#f7f4ee`** (< 4.5) ; 4.80:1 sur surface `#fff` (juste au-dessus).
- DESIGN.md : « Field labels » (l.116). Le mock utilise `text-muted` pour les labels de compteurs de statut (`.stat .row`) à **12px 500** sur blanc → 4.80:1 OK, mais tout usage de `text-muted` directement sur `app-bg` (le fond d'écran réel) échoue.
- Field labels à **11.5px** (DESIGN.md scale l.153) sont du texte normal (pas « large ») → 4.5:1 requis.
- **Fix :** assombrir le token `text-muted` à ~`#6b6157` (≈5.0:1 sur paper) ou interdire `text-muted` directement sur `app-bg` (n'autoriser que sur `surface`/`surface-alt`). Étant donné le contexte plein soleil Sahel (DESIGN.md D2 invoque justement le fort contraste), viser une marge confortable.

**[MAJOR] F3 — `amber-deep` #9a6a07 sur tint amber #fdf3df : marge nulle, fragile**
- Mesuré : **4.29:1** (< 4.5). DESIGN.md le présente comme « AA-safe » (l.101) et « Text/numerals on amber tint (AA-safe) » — **inexact pour le texte normal**.
- Acceptable uniquement pour le **gros numéral** Spectral de la camion-card (≥23px = texte large, seuil 3:1) → conforme en large.
- Mais la « formula caption » de la camion-card (DESIGN.md l.200 ; EXPERIENCE `ceil(60 ÷ 30)`) est du **texte petit** → 4.29:1 échoue.
- **Fix :** assombrir `amber-deep` à ~`#8a5e06` (≈4.9:1) pour couvrir caption + numéral, OU restreindre explicitement `amber-deep` au gros numéral et passer la caption sur `text-secondary`. Corriger l'affirmation « AA-safe » dans DESIGN.md pour préciser « AA en texte large uniquement ».

**[MAJOR] F4 — Badges de statut : 3 des 6 sous le seuil texte normal**
- Mesurés : Brouillon `#78716c`/`#f2efe9` **4.18:1** ; Envoyé `#b45309`/`#fbeedd` **4.39:1** ; Accepté `#15803d`/`#e8f1ea` **4.35:1** ; Annulé `#78716c`/`#f0eeea` **4.14:1**. (Validé 7.63 et Expiré 5.43 OK.)
- Le texte des badges est ~10.5px 600 (mock `.badge`, DESIGN scale) → **texte normal**, seuil 4.5:1. Les quatre ci-dessus échouent.
- **Fix :** assombrir les tons de texte des statuts en échec d'environ une marche : Brouillon/Annulé → `#6b6157`+ ; Envoyé → `#9a4708`+ ; Accepté → `#136c34`+, jusqu'à atteindre ≥4.5:1 sur leur tint respectif. (Re-mesurer après ajustement.)

**[MINOR] F5 — Dépendance de luminance des points (dots) de statut**
- Les dots colorés (`#a8a29e`, `#d97706`, `#16a34a`, `#2f6e96`…) servent d'indicateur graphique. Sur fond tint clair leur contraste est faible (non bloquant car redondant avec le label texte — voir §2), mais à noter pour SC 1.4.11 (Non-text Contrast 3:1) si jamais le label est masqué à petite taille.
- **Fix :** garder dot **toujours** accompagné du label (déjà spécifié) ; ne pas réduire le badge à un dot seul.

---

## 2. Signalisation par couleur seule — CONFORME

- **Statuts :** dot **+ libellé texte** systématique (DESIGN.md status-badge l.201 « dot + text » ; EXPERIENCE l.128 « never color-only — every status badge pairs dot + text label »). Mock confirme : `● Envoyé`, `● Accepté`. **OK**.
- **Offline :** point amber clignotant **+ texte** « Hors ligne · N devis en attente » (EXPERIENCE l.101 ; mock `.offline`). **OK** — mais le *clignotement* est la seule indication d'« en attente » dynamique ; le texte couvre l'état, donc acceptable.
- **Sélection :** segment/chip actif = remplissage navy + blanc (changement de **forme/fond**, pas seulement teinte) ; client-card sélectionnée = **filled check** (icône, EXPERIENCE l.84/143). **OK**.
- **[NIT] F6 :** le segment « on » du hero se distingue par fond amber. La différence inactif→actif repose sur couleur **et** poids identique ; un libellé d'état lecteur d'écran (`aria-pressed`/`aria-selected`) doit porter l'état (voir F11). Visuellement conforme.

---

## 3. Cibles tactiles — spécifié, à vérifier en implémentation

- EXPERIENCE l.124 : « ≥44×44px touch targets (steppers, FAB, nav, chips) ». **Intention conforme.**
- **[MINOR] F7 — risques d'implémentation à surveiller :**
  - **Stepper −/+** : viser 44×44 par bouton ; ne pas se fier au glyphe seul.
  - **Segments hero** (mock `.seg button` : `padding:7px 0`, font 12px) → hauteur effective ~28px < 44. **Sous le seuil** dans le mock. Élargir la zone tactile à 44px (padding vertical ou min-height), même si le visuel reste compact.
  - **Filter chips** (scroll horizontal) : garder hauteur ≥44 et espacement anti-mistap.
  - **« Voir tout » / liens** texte 12.5px : zone tactile à étendre à 44px.
  - **Bottom nav** 74px de haut → OK ; vérifier largeur par slot ≥44 (5 slots sur 402px ≈ 80px → OK).

---

## 4. Focus — spécifié, lacune sur l'anneau

- **Visible focus :** EXPERIENCE l.125 « visible navy focus ring everywhere » ; DESIGN focus-ring `#1B3070`.
- **[MAJOR] F8 — contraste de l'anneau de focus à valider (SC 1.4.11, 3:1 vs adjacent).**
  - Anneau navy `#1B3070` sur input blanc : ~12.3:1 → OK.
  - Mais sur **hero navy** ou contre **app-bg paper**, un anneau navy peut tomber sous 3:1 vs le fond adjacent. DESIGN ne spécifie qu'« focus border → focus-ring » pour les inputs ; aucun anneau défini pour FAB amber, segments hero, chips, nav.
  - **Fix :** définir un anneau de focus **2px + offset** garantissant ≥3:1 sur *tous* les fonds : sur surfaces sombres, doubler d'un liseré clair (anneau navy + halo `text-on-dark`), ou utiliser un anneau à double trait. Spécifier explicitement le focus visible pour FAB, segments, chips, nav (pas seulement inputs).
- **Ordre logique :** EXPERIENCE l.125 « logical top-to-bottom ». **OK** (intention).
- **Piège + restauration de focus (sheet) :** EXPERIENCE l.125 « trap focus in bottom sheet, restore on close ». **Conforme** comme contrat ; à vérifier en implémentation (focus initial sur le sheet, retour au déclencheur « ⋯ »).
- **[MINOR] F9 :** mock `.seg button` n'a aucun style `:focus-visible` (purement démonstratif) — rappel pour l'implémentation réelle.

---

## 5. Formulaires — contrat solide

- EXPERIENCE l.126 : labels Hanken 11.5 **liés** au contrôle ; requis marqué `*` accent **et announced** ; erreurs **associées au champ via `aria-describedby`, pas toast-only**. **Conforme** et bien pensé (la mention explicite « not toast-only » est exactement la bonne posture — SC 3.3.1).
- **[MINOR] F10 — précisions à verrouiller :**
  - Le `*` accent (amber ?) ne doit pas être le **seul** marqueur de « requis » : l'attribut `required`/`aria-required` doit le porter (l.126 dit « announced » — bon, à implémenter réellement). Si le `*` est amber sur fond clair, il échoue le contraste — utiliser navy ou ajouter le texte « (obligatoire) » pour le label invisible.
  - Messages d'erreur (EXPERIENCE Voice l.73 « Nom et téléphone obligatoires ») : associer au(x) champ(s) concerné(s), `aria-invalid=true`, focus déplacé sur le premier champ en erreur.

---

## 6. Régions live — spécifié

- EXPERIENCE l.127 : « calc results (camion count, totals) and toasts use polite live regions ». **Conforme** comme contrat.
- **[MINOR] F11 — granularité :**
  - Recalcul « à chaque frappe » (EXPERIENCE l.103) en `aria-live="polite"` peut **inonder** le lecteur d'écran (camion count + total + valeur marchandise sur chaque keystroke). Prévoir un **debounce** de l'annonce (annoncer le résultat stabilisé, ~300–500ms après la dernière frappe) pour éviter le bavardage.
  - **Toasts** auto-dismiss ~2.2s (EXPERIENCE l.89) : 2.2s peut être court pour une annonce + lecture ; `role="status"` (polite) OK, mais s'assurer que le message reste assez longtemps pour être vocalisé, ou fournir un historique. Ne pas mettre d'info **critique uniquement** dans un toast (cohérent avec « erreurs pas toast-only »).
  - Segment/chip actif : exposer l'état via `aria-pressed`/`aria-selected` (voir F6).

---

## 7. Motion — CONFORME

- EXPERIENCE l.118/129 : « Honor `prefers-reduced-motion` — disable ambient + entrance, keep rest states. Sahel filigrane static. » + DESIGN l.186 (filigrane statique sous reduced-motion). **Conforme**, bien spécifié (« every animated element rests visible » — pas de perte d'info).
- **[NIT] F12 :** le mock définit `@keyframes blink/glow` **sans** bloc `@media (prefers-reduced-motion: reduce)`. La note de bas indique « prefers-reduced-motion → animations off » mais ce n'est pas implémenté dans le mock. Le **dot offline clignotant** est l'animation la plus à risque (clignotement = inconfort vestibulaire/attention) — la couper sous reduced-motion (le texte porte déjà l'état). À implémenter dans le code réel.

---

## 8. Spot-check du mock HTML

- **`lang="fr-NE"`** présent (l.2). **OK.**
- **[MAJOR] F13 — hiérarchie de titres incomplète :** la page n'a **aucun `<h1>`**. Le nom « Amadou » est un `.name` en `<div>`, « Devis récents » est en `<h3>` sautant h1/h2. Aucune balise sémantique de page (pas de `<main>`, `<header>`, `<nav>`, `<section>`). Tout est en `<div>`/`<span>`. **Fix :** structure sémantique réelle dans l'app (titre de page = `<h1>`, sections `<h2>`, landmarks `<header>/<main>/<nav>`).
- **[MAJOR] F14 — boutons icône / contrôles sans nom accessible :**
  - **Avatar** « AM » (l.95) : `<div>` cliquable implicite vers Compte ? Aucun rôle/label. S'il est interactif → `<button aria-label="Compte / Profil">`.
  - **Segments 7j/30j/90j/Tout** : `<button>` sans `aria-pressed`/`aria-selected` ni regroupement `role="group"`/`tablist`. État « on » porté par couleur seule pour AT.
  - **Dots de statut** (`.dot`) : décoratifs, OK car label adjacent — mais s'assurer `aria-hidden`.
  - **« ● » dans les badges** (caractère bullet, l.124/134) : ponctuation lue par certains AT (« puce noire ») — préférer le dot CSS `aria-hidden` plutôt qu'un caractère ● dans le texte.
- **[MINOR] F15 — contraste segment « on » navy-sur-amber :** mesuré **6.10:1** → **conforme AA** (et 3:1 UI large). Pas de problème de contraste ici ; le point d'attention est l'**état** (F14), pas la lisibilité.
- **[MINOR] F16 — `.greet` / `.meta` / `.cur` en `text-faint`** : voir F1 (2.45–2.69:1). C'est le défaut de contraste le plus répandu dans le mock.
- **[NIT] F17 — montant hero `<span style="font-size:22px">F</span>`** : le « F » abrégé pour FCFA dépend du contexte visuel ; fournir le libellé complet « FCFA » au moins une fois pour les AT (le sous-titre « · FCFA » l.104 le couvre — OK).
- **[NIT] F18 — liens `href="#"`** (« Voir tout », l.117) : placeholders de mock ; cibles réelles + `<a>`/`<button>` correct selon navigation vs action.

---

## Synthèse des sévérités

| Sévérité | # | IDs |
|---|---|---|
| BLOCKER | 1 | F1 |
| MAJOR | 6 | F2, F3, F4, F8, F13, F14 |
| MINOR | 7 | F5, F7, F9, F10, F11, F15, F16 |
| NIT | 4 | F6, F12, F17, F18 |

**Note transversale :** la plupart des défauts BLOCKER/MAJOR sont des **tokens de couleur trop clairs** (`text-faint`, `text-muted`, `amber-deep`, 4 statuts) frôlant ou ratant 4.5:1. Étant donné la cible « plein soleil Sahel / haute lisibilité » revendiquée par DESIGN.md D2, ces tokens devraient être assombris d'un cran plutôt qu'au seuil exact — re-mesurer après ajustement.
