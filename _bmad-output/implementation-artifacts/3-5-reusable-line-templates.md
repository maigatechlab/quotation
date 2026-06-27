---
story_key: 3-5-reusable-line-templates
epic_num: 3
story_num: 5
status: done
baseline_commit: "95c49335d0c4abaf532babe2b8d49643c32e7782"
---

# Story 3.5 : Modèles de lignes réutilisables (FR-24)

**Statut :** done

## Story

**En tant que** commercial,
**Je veux** appliquer des lignes standards depuis un modèle,
**Afin que** je remplis les prestations courantes sans ressaisie.

**Et en tant qu'** administrateur,
**Je veux** définir des modèles de lignes réutilisables,
**Afin que** les commerciaux disposent de prestations pré-remplies cohérentes.

---

## Critères d'acceptation (BDD)

**AC1 — Admin : CRUD des modèles (Paramètres)**

```
GIVEN  la page /parametres (accès Admin, role = "admin")
WHEN   l'admin consulte la section "Modèles de prestations"
THEN   TemplateManager s'affiche avec la liste des modèles depuis db.templates (liveQuery)
AND    chaque carte affiche : nom du modèle + nombre de lignes
AND    un bouton "Ajouter un modèle" est visible
```

**AC2 — Admin : Créer un modèle**

```
GIVEN  le formulaire de création de modèle
WHEN   l'admin saisit le nom + les lignes (désignation, prix unitaire, quantité)
THEN   nom obligatoire, au moins 1 ligne, désignation + prix obligatoires par ligne
AND    unitPrice stocké en integer FCFA (Math.round(parseFloat(input)))
AND    quantity défaut 1, min 1

WHEN   l'admin soumet
THEN   applyLocalMutation("template", id, "create", payload, 0, dexieWriteFn, userId) appelé
AND    db.templates.put({ id, nom, lines, pays, revision: 0, updatedAt, createdAt }) dans dexieWriteFn
AND    void triggerSync() appelé après
AND    le nouveau modèle apparaît dans la liste (liveQuery)
```

**AC3 — Admin : Modifier un modèle**

```
GIVEN  un modèle existant
WHEN   l'admin clique Modifier
THEN   le formulaire pré-rempli avec nom + lignes existantes
WHEN   il soumet les modifications
THEN   dbTemplate = await db.templates.get(id)
AND    applyLocalMutation("template", id, "update", payload, dbTemplate.revision, dexieWriteFn, userId)
AND    db.templates.put({ ...dbTemplate, nom, lines, updatedAt }) dans dexieWriteFn
AND    void triggerSync() après
```

**AC4 — Admin : Supprimer un modèle**

```
GIVEN  un modèle existant
WHEN   l'admin clique Supprimer
THEN   dbTemplate = await db.templates.get(id)
AND    applyLocalMutation("template", id, "delete", {}, dbTemplate.revision, dexieWriteFn, userId)
AND    db.templates.delete(id) dans dexieWriteFn
AND    void triggerSync() après
AND    le modèle disparaît de la liste (liveQuery)
```

**AC5 — Commercial : Appliquer un modèle dans l'étape Prestations**

```
GIVEN  le wizard étape 4 (Prestations) — WizardStepServices
WHEN   des modèles existent dans db.templates (liveQuery)
THEN   un bouton "Appliquer un modèle" est visible au-dessus de la liste de lignes

WHEN   le commercial clique "Appliquer un modèle"
THEN   un sélecteur (liste inline ou bottom sheet) affiche les modèles disponibles
AND    chaque modèle montre : nom + nombre de lignes

WHEN   le commercial sélectionne un modèle
THEN   toutes les lignes du modèle sont ajoutées à la liste existante (append)
       en tant que WorkingLine : isNew=true, dbRevision=0, id=crypto.randomUUID()
AND    unitPrice converti : String(tl.unitPrice) (déjà integer dans TemplateLocal.lines)
AND    quantity repris tel quel du modèle
AND    ordre ajusté à la suite des lignes existantes (existingLines.length + idx)
AND    le sélecteur se ferme
AND    les totaux ligne + total devis se recalculent immédiatement
AND    les lignes importées restent modifiables individuellement
```

**AC6 — Aucun modèle disponible**

```
GIVEN  db.templates est vide
WHEN   le commercial arrive à l'étape Prestations
THEN   le bouton "Appliquer un modèle" n'est PAS affiché
       (ou affiché mais désactivé avec tooltip "Aucun modèle défini")
```

**AC7 — Disponibilité offline**

```
GIVEN  une synchronisation précédente qui a ramené les templates
WHEN   l'utilisateur est hors ligne
THEN   les modèles sont disponibles dans db.templates (Dexie)
AND    l'Admin peut créer/modifier/supprimer (via outbox, sync au retour réseau)
AND    le Commercial peut appliquer un modèle
```

**AC8 — Qualité**

```
GIVEN  fichiers créés/modifiés
WHEN   pnpm check
THEN   lint ✓ + typecheck ✓ + tous tests existants passent sans régression
AND    pnpm build passe sans erreur
```

---

## Périmètre de cette story

**INCLUS :**
- `src/components/settings/template-manager.tsx` — CRÉER : CRUD modèles (Admin)
- `src/hooks/use-live-templates.ts` — CRÉER : liveQuery Dexie sur templates
- `src/components/quote/wizard-step-services.tsx` — UPDATE : ajouter application modèle
- `src/app/(app)/parametres/page.tsx` — UPDATE : importer TemplateManager (admin only)
- `src/messages/fr-NE.json` — UPDATE : ajouter keys

**EXCLU (déjà implémenté — NE PAS MODIFIER) :**
- `src/lib/schema.ts` — table `template` déjà définie (lignes 228-246)
- `src/lib/local-db.ts` — `TemplateLocal` + `templates` Dexie déjà présents (lignes 86-95, 162, 175)
- `src/lib/sync/push.ts` et `src/app/api/v1/sync/push/route.ts` — `case "template"` opérationnel (push/route.ts:366-388)
- `src/app/api/v1/sync/pull/route.ts` — templates déjà retournés (ligne 83-85)
- `src/lib/sync/pull.ts` — templates déjà hydratés dans Dexie (lignes 83-87)
- `src/lib/permissions.ts` — `template.create/read/update/delete` déjà définis
- Aucune migration DB — table `template` existe déjà dans le schema

---

## Tâches / Sous-tâches

### T1 — Créer `src/hooks/use-live-templates.ts`

- [x] Créer le fichier (pattern : `use-live-company.ts`)
  ```ts
  "use client";

  import { useState, useEffect } from "react";
  import { liveQuery } from "dexie";
  import { db } from "@/lib/local-db";
  import type { TemplateLocal } from "@/lib/local-db";

  export function useLiveTemplates(): TemplateLocal[] {
    const [templates, setTemplates] = useState<TemplateLocal[]>([]);

    useEffect(() => {
      const subscription = liveQuery(() =>
        db.templates.toArray()
      ).subscribe({
        next: (items) => setTemplates(items),
        error: () => setTemplates([]),
      });

      return () => subscription.unsubscribe();
    }, []);

    return templates;
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T2 — Créer `src/components/settings/template-manager.tsx`

- [x] `"use client"` première ligne
- [x] Imports :
  ```ts
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { db } from "@/lib/local-db";
  import type { TemplateLocal } from "@/lib/local-db";
  import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
  import { useLiveTemplates } from "@/hooks/use-live-templates";
  ```
- [x] Interface `TemplateLine` :
  ```ts
  interface TemplateLine {
    designation: string;
    unitPrice: string;  // string pour l'input, parsé en integer à la sauvegarde
    quantity: number;
  }
  ```
- [x] Props :
  ```ts
  interface TemplateManagerProps {
    userId: string;
  }
  ```
- [x] État local :
  ```ts
  const templates = useLiveTemplates();
  const t = useTranslations("parametres.modeles");
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingTemplate, setEditingTemplate] = useState<TemplateLocal | null>(null);
  const [nom, setNom] = useState("");
  const [formLines, setFormLines] = useState<TemplateLine[]>([{ designation: "", unitPrice: "", quantity: 1 }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<number, Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);
  ```
- [x] Fonction `openCreate()` :
  ```ts
  function openCreate() {
    setNom("");
    setFormLines([{ designation: "", unitPrice: "", quantity: 1 }]);
    setErrors({});
    setLineErrors({});
    setEditingTemplate(null);
    setMode("create");
  }
  ```
- [x] Fonction `openEdit(tpl: TemplateLocal)` :
  ```ts
  function openEdit(tpl: TemplateLocal) {
    setNom(tpl.nom);
    setFormLines(tpl.lines.map(l => ({
      designation: l.designation,
      unitPrice: String(l.unitPrice),
      quantity: l.quantity,
    })));
    setErrors({});
    setLineErrors({});
    setEditingTemplate(tpl);
    setMode("edit");
  }
  ```
- [x] Fonction `addFormLine()` :
  ```ts
  function addFormLine() {
    setFormLines(prev => [...prev, { designation: "", unitPrice: "", quantity: 1 }]);
  }
  ```
- [x] Fonction `updateFormLine(idx, field, value)` :
  ```ts
  function updateFormLine(idx: number, field: keyof TemplateLine, value: string | number) {
    setFormLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
    setLineErrors(prev => {
      const copy = { ...prev };
      if (copy[idx]) {
        const lineCopy = { ...copy[idx] };
        delete lineCopy[field as string];
        copy[idx] = lineCopy;
      }
      return copy;
    });
  }
  ```
- [x] Fonction `removeFormLine(idx)` :
  ```ts
  function removeFormLine(idx: number) {
    if (formLines.length <= 1) return;
    setFormLines(prev => prev.filter((_, i) => i !== idx));
  }
  ```
- [x] Validation `validateForm()` :
  ```ts
  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};
    const newLineErrors: Record<number, Record<string, string>> = {};
    if (!nom.trim()) newErrors["nom"] = t("nomRequired");
    formLines.forEach((l, idx) => {
      const le: Record<string, string> = {};
      if (!l.designation.trim()) le["designation"] = t("designationRequired");
      const price = Math.round(parseFloat(l.unitPrice) || 0);
      if (price <= 0) le["unitPrice"] = t("unitPriceRequired");
      if (Object.keys(le).length > 0) newLineErrors[idx] = le;
    });
    setErrors(newErrors);
    setLineErrors(newLineErrors);
    return Object.keys(newErrors).length === 0 && Object.keys(newLineErrors).length === 0;
  }
  ```
- [x] Fonction `handleSubmit()` :
  ```ts
  async function handleSubmit() {
    if (!validateForm()) return;
    setIsPending(true);
    try {
      const now = new Date().toISOString();
      const parsedLines = formLines.map(l => ({
        designation: l.designation.trim(),
        unitPrice: Math.round(parseFloat(l.unitPrice) || 0),
        quantity: l.quantity,
      }));

      if (mode === "create") {
        const id = crypto.randomUUID();
        await applyLocalMutation(
          "template", id, "create",
          { nom: nom.trim(), lines: parsedLines, pays: "NE", updatedAt: now, createdAt: now },
          0,
          async () => {
            await db.templates.put({
              id,
              nom: nom.trim(),
              lines: parsedLines,
              pays: "NE",
              revision: 0,
              updatedAt: now,
              createdAt: now,
            });
          },
          userId
        );
      } else if (mode === "edit" && editingTemplate) {
        await applyLocalMutation(
          "template", editingTemplate.id, "update",
          { nom: nom.trim(), lines: parsedLines, pays: editingTemplate.pays, updatedAt: now },
          editingTemplate.revision,
          async () => {
            await db.templates.put({
              ...editingTemplate,
              nom: nom.trim(),
              lines: parsedLines,
              updatedAt: now,
            });
          },
          userId
        );
      }
      void triggerSync();
      setMode("list");
    } catch {
      setErrors(prev => ({ ...prev, global: t("errorGeneric") }));
    } finally {
      setIsPending(false);
    }
  }
  ```
- [x] Fonction `handleDelete(tpl: TemplateLocal)` :
  ```ts
  async function handleDelete(tpl: TemplateLocal) {
    setIsPending(true);
    try {
      const dbTemplate = await db.templates.get(tpl.id);
      if (dbTemplate) {
        await applyLocalMutation(
          "template", tpl.id, "delete", {},
          dbTemplate.revision,
          async () => { await db.templates.delete(tpl.id); },
          userId
        );
        void triggerSync();
      }
    } catch {
      // silently ignore — liveQuery will reflect actual state
    } finally {
      setIsPending(false);
    }
  }
  ```
- [x] Rendu "list" :
  ```tsx
  if (mode === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{t("heading")}</h2>
          <button type="button" onClick={openCreate} disabled={isPending}
            className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60">
            {t("addTemplate")}
          </button>
        </div>

        {templates.length === 0 && (
          <p className="text-sm text-text-muted">{t("empty")}</p>
        )}

        {templates.map(tpl => (
          <div key={tpl.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">{tpl.nom}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {t("lineCount", { count: tpl.lines.length })}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => openEdit(tpl)} disabled={isPending}
                  className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-text-secondary hover:bg-surface-alt disabled:opacity-60">
                  {t("edit")}
                </button>
                <button type="button" onClick={() => handleDelete(tpl)} disabled={isPending}
                  className="h-8 rounded-lg px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60">
                  {t("delete")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  ```
- [x] Rendu "create" / "edit" (formulaire partagé) :
  ```tsx
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setMode("list")} disabled={isPending}
          className="text-xs text-text-secondary hover:text-text-primary">
          ← {t("backToList")}
        </button>
        <h2 className="text-sm font-semibold text-text-primary">
          {mode === "create" ? t("createHeading") : t("editHeading")}
        </h2>
      </div>

      {/* Nom */}
      <div>
        <label className="text-xs font-semibold text-text-muted">{t("nomLabel")}</label>
        <input
          type="text"
          value={nom}
          onChange={e => { setNom(e.target.value); setErrors(p => ({ ...p, nom: "" })); }}
          placeholder={t("nomPlaceholder")}
          disabled={isPending}
          aria-invalid={!!errors["nom"]}
          aria-describedby={errors["nom"] ? "nom-error" : undefined}
          className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
        />
        {errors["nom"] && <p id="nom-error" className="mt-0.5 text-xs text-destructive">{errors["nom"]}</p>}
      </div>

      {/* Lignes */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-text-muted">{t("linesLabel")}</p>
        {formLines.map((line, idx) => (
          <div key={idx} className="rounded-xl border border-border bg-surface p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={line.designation}
                  onChange={e => updateFormLine(idx, "designation", e.target.value)}
                  placeholder={t("designationPlaceholder")}
                  disabled={isPending}
                  aria-invalid={!!lineErrors[idx]?.["designation"]}
                  className="h-9 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
                />
                {lineErrors[idx]?.["designation"] && (
                  <p className="mt-0.5 text-xs text-destructive">{lineErrors[idx]["designation"]}</p>
                )}
              </div>
              <button type="button" onClick={() => removeFormLine(idx)} disabled={isPending || formLines.length <= 1}
                aria-label={t("removeLine")}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 disabled:opacity-30">
                ✕
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="number"
                  value={line.unitPrice}
                  onChange={e => updateFormLine(idx, "unitPrice", e.target.value)}
                  placeholder={t("unitPricePlaceholder")}
                  min="1"
                  disabled={isPending}
                  aria-invalid={!!lineErrors[idx]?.["unitPrice"]}
                  className="h-9 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
                />
                {lineErrors[idx]?.["unitPrice"] && (
                  <p className="mt-0.5 text-xs text-destructive">{lineErrors[idx]["unitPrice"]}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => updateFormLine(idx, "quantity", Math.max(1, line.quantity - 1))}
                  disabled={line.quantity <= 1 || isPending}
                  aria-label={t("decreaseQty")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-surface text-text-primary disabled:opacity-40">
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold text-text-primary">{line.quantity}</span>
                <button type="button" onClick={() => updateFormLine(idx, "quantity", line.quantity + 1)}
                  disabled={isPending}
                  aria-label={t("increaseQty")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-surface text-text-primary disabled:opacity-40">
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addFormLine} disabled={isPending}
          className="flex items-center gap-2 h-9 rounded-xl border border-dashed border-border px-4 text-xs text-text-secondary hover:bg-surface disabled:opacity-60">
          + {t("addLine")}
        </button>
      </div>

      {errors["global"] && <p className="text-xs text-destructive">{errors["global"]}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <button type="button" onClick={() => setMode("list")} disabled={isPending}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60">
          {t("cancel")}
        </button>
        <button type="button" onClick={handleSubmit} disabled={isPending}
          className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60">
          {isPending ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
  ```
- [x] `pnpm typecheck` — zéro erreur

### T3 — Mettre à jour `src/components/quote/wizard-step-services.tsx`

- [x] Ajouter import `liveQuery` depuis dexie :
  ```ts
  import { liveQuery } from "dexie";
  import type { TemplateLocal } from "@/lib/local-db";
  ```
- [x] Ajouter état `templates` dans le composant :
  ```ts
  const [templates, setTemplates] = useState<TemplateLocal[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  ```
- [x] Ajouter `useEffect` pour liveQuery templates :
  ```ts
  useEffect(() => {
    const sub = liveQuery(() => db.templates.toArray()).subscribe({
      next: (items) => setTemplates(items),
      error: () => setTemplates([]),
    });
    return () => sub.unsubscribe();
  }, []);
  ```
- [x] Ajouter fonction `applyTemplate(tpl: TemplateLocal)` :
  ```ts
  function applyTemplate(tpl: TemplateLocal) {
    const now = new Date().toISOString();
    const newLines: WorkingLine[] = tpl.lines.map((tl, idx) => ({
      id: crypto.randomUUID(),
      designation: tl.designation,
      unitPrice: String(tl.unitPrice),  // TemplateLocal.lines.unitPrice est déjà integer
      quantity: tl.quantity,
      ordre: lines.length + idx,
      isNew: true,
      dbRevision: 0,
      createdAt: now,
      pays: "NE",
    }));
    setLines(prev => [...prev, ...newLines]);
    setShowTemplatePicker(false);
  }
  ```
- [x] Ajouter le bouton "Appliquer un modèle" dans le rendu (au-dessus du DndContext, visible seulement si templates.length > 0) :
  ```tsx
  {templates.length > 0 && (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowTemplatePicker(prev => !prev)}
        disabled={isPending}
        className="flex items-center gap-2 h-9 rounded-xl border border-border px-4 text-xs font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
      >
        {t("applyTemplate")}
      </button>
      {showTemplatePicker && (
        <div className="absolute top-10 left-0 z-10 w-64 rounded-xl border border-border bg-white shadow-lg">
          {templates.map(tpl => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="flex w-full flex-col px-4 py-3 text-left hover:bg-surface first:rounded-t-xl last:rounded-b-xl border-b border-border last:border-b-0"
            >
              <span className="text-sm font-semibold text-text-primary">{tpl.nom}</span>
              <span className="text-xs text-text-muted">
                {tpl.lines.length} {tpl.lines.length === 1 ? "ligne" : "lignes"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )}
  ```
- [x] Fermer le picker si clic en dehors (optionnel MVP — acceptable de le laisser ouvert)
- [x] Ajouter `t("applyTemplate")` depuis les traductions `devis.wizard.prestations`
- [x] `pnpm typecheck` — zéro erreur

### T4 — Mettre à jour `src/app/(app)/parametres/page.tsx`

- [x] Ajouter import :
  ```ts
  import { TemplateManager } from "@/components/settings/template-manager";
  ```
- [x] Ajouter section TemplateManager (visible uniquement si admin) après la section SignatoryConfig :
  ```tsx
  {can(role, "template.create") && (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <TemplateManager userId={userId} />
    </div>
  )}
  ```
- [x] `pnpm typecheck` — zéro erreur

### T5 — Mettre à jour `src/messages/fr-NE.json`

- [x] Ajouter sous `devis.wizard.prestations` :
  ```json
  "applyTemplate": "Appliquer un modèle"
  ```
- [x] Ajouter section `parametres.modeles` :
  ```json
  "modeles": {
    "heading": "Modèles de prestations",
    "addTemplate": "Ajouter un modèle",
    "createHeading": "Nouveau modèle",
    "editHeading": "Modifier le modèle",
    "backToList": "Retour à la liste",
    "empty": "Aucun modèle défini.",
    "nomLabel": "Nom du modèle",
    "nomPlaceholder": "Ex : Transport Niger-Burkina",
    "nomRequired": "Le nom est requis",
    "linesLabel": "Lignes du modèle",
    "designationPlaceholder": "Ex : Transport routier",
    "designationRequired": "La désignation est requise",
    "unitPricePlaceholder": "Ex : 250000",
    "unitPriceRequired": "Le prix est requis",
    "decreaseQty": "Diminuer la quantité",
    "increaseQty": "Augmenter la quantité",
    "addLine": "Ajouter une ligne",
    "removeLine": "Supprimer la ligne",
    "lineCount": "{count, plural, one {# ligne} other {# lignes}}",
    "edit": "Modifier",
    "delete": "Supprimer",
    "cancel": "Annuler",
    "save": "Enregistrer",
    "saving": "Enregistrement…",
    "errorGeneric": "Une erreur est survenue. Veuillez réessayer."
  }
  ```
- [x] `pnpm typecheck` — zéro erreur

### T6 — Vérification finale (AC8)

- [x] `pnpm check` : lint ✓ typecheck ✓ tests existants ✓ (pas de régression)
- [x] `pnpm build` : passe sans erreur
- [x] Admin : page /parametres affiche section "Modèles de prestations" ✓
- [x] Admin : créer un modèle avec 2 lignes → apparaît dans la liste ✓
- [x] Admin : modifier un modèle → changements persistés ✓
- [x] Admin : supprimer un modèle → disparaît de la liste ✓
- [x] Commercial : étape 4 avec des modèles → bouton "Appliquer un modèle" visible ✓
- [x] Commercial : appliquer un modèle → lignes ajoutées à la liste + totaux recalculés ✓
- [x] Sans modèle : bouton "Appliquer un modèle" absent ✓
- [x] Lignes importées modifiables individuellement ✓

---

## Dev Notes

### CRITIQUE — TemplateLocal.lines.unitPrice est déjà un integer

```typescript
// src/lib/local-db.ts:86-95
interface TemplateLocal {
  id: string;
  nom: string;
  lines: { designation: string; unitPrice: number; quantity: number }[];
  // ...
}
```

`unitPrice` dans `TemplateLocal.lines` est `number` (integer FCFA, comme `QuoteLineLocal.unitPrice`).
Lors de l'application d'un modèle dans le wizard : `unitPrice: String(tl.unitPrice)` (conversion en string pour l'état `WorkingLine`).

**INTERDIT :** `parseFloat(tl.unitPrice)` — c'est déjà un nombre.
**INTERDIT :** arrondir à nouveau — déjà un integer.

### CRITIQUE — Pattern applyLocalMutation pour "template"

`"template"` est un `SyncOpEntity` valide (`src/lib/local-db.ts:119-125`).

```typescript
// CORRECT — créer un template
await applyLocalMutation(
  "template",
  id,           // crypto.randomUUID() pré-généré
  "create",
  payload,      // { nom, lines, pays, updatedAt, createdAt }
  0,            // baseRevision = 0 pour nouvelle entité
  async () => { await db.templates.put(templateRecord); },
  userId
);

// CORRECT — update
await applyLocalMutation(
  "template",
  tpl.id,
  "update",
  payload,
  dbTemplate.revision,  // lu depuis Dexie AVANT le call
  async () => { await db.templates.put({ ...dbTemplate, nom, lines, updatedAt }); },
  userId
);

// CORRECT — delete
await applyLocalMutation(
  "template",
  tpl.id,
  "delete",
  {},                     // payload vide pour delete
  dbTemplate.revision,
  async () => { await db.templates.delete(tpl.id); },
  userId
);
```

### CRITIQUE — push/route.ts case "template" déjà opérationnel

```typescript
// src/app/api/v1/sync/push/route.ts:366-388
case "template": {
  if (op.type === "delete") {
    await db.delete(templateTable).where(eq(templateTable.id, op.entityId));
  } else {
    type TemplateLine = { designation: string; unitPrice: number; quantity: number };
    const lines: TemplateLine[] = Array.isArray(p.lines) ? (p.lines as TemplateLine[]) : [];
    const templateValues = {
      nom: str(p.nom),
      lines,
      companyId: tenantId,
      pays: strN(p.pays) ?? "NE",
      revision: newRevision,
      updatedAt: now,
    };
    // insert or update (upsert)
  }
  break;
}
```

**INTERDIT :** toute modification de push/route.ts. Le handler est complet.

### CRITIQUE — Permission : Admin seul crée/modifie/supprime

```typescript
// src/lib/permissions.ts
commercial: {
  "template.create": false,
  "template.read": true,
  "template.update": false,
  "template.delete": false,
}
admin: {
  "template.create": true,
  "template.read": true,
  "template.update": true,
  "template.delete": true,
}
```

Le Commercial peut **lire** les templates (pour les appliquer) mais pas les CRUD.
- `TemplateManager` visible seulement si `can(role, "template.create")` dans parametres/page.tsx
- `applyLocalMutation("template", ..., "create")` accessible uniquement à l'Admin (double-enforced côté serveur)

### CRITIQUE — Pattern liveQuery dans composants Client

```typescript
// Pattern de src/hooks/use-live-company.ts
import { liveQuery } from "dexie";
import { db } from "@/lib/local-db";

useEffect(() => {
  const subscription = liveQuery(() => db.templates.toArray()).subscribe({
    next: (items) => setTemplates(items),
    error: () => setTemplates([]),
  });
  return () => subscription.unsubscribe();  // cleanup obligatoire
}, []);
```

**Pattern impératif :** Le hook `useLiveTemplates` suit exactement `useLiveCompany` — ne pas utiliser `useLiveQuery` (wrapper tiers), utiliser `liveQuery(...).subscribe(...)` natif Dexie.

### CRITIQUE — exactOptionalPropertyTypes dans TemplateManager

`TemplateLine` dans le formulaire n'a pas de champs optionnels → pas de spread conditionnel nécessaire.

Pour `TemplateLocal` en Dexie : `companyId?` est optionnel. Ne pas l'inclure explicitement dans le put — le serveur le stampe au sync.

```typescript
// CORRECT — put sans companyId (server stampe companyId = tenantId au sync)
await db.templates.put({
  id,
  nom: nom.trim(),
  lines: parsedLines,
  pays: "NE",
  revision: 0,
  updatedAt: now,
  createdAt: now,
});

// INCORRECT
await db.templates.put({ id, ..., companyId: undefined });
```

### CRITIQUE — auditMirror pour les mutations template

Pour les mutations template depuis le CRUD Admin, **PAS** besoin d'`auditMirror.add` explicite — le sync push émet déjà l'audit event serveur (`what: "sync.create"/"sync.update"/"sync.delete"`). Le pattern `auditMirror.add` dans les stories précédentes était pour les mutations quote (entités à haute visibilité audit côté client). Pour les templates, l'audit serveur suffit.

### CRITIQUE — Application modèle : append, pas replace

La spec dit "toutes les lignes définies sont importées et restent modifiables individuellement". Comportement : **append** (ajout aux lignes existantes), pas remplacement. Si le commercial avait 2 lignes et applique un modèle de 3 lignes → il a maintenant 5 lignes.

```typescript
// CORRECT
function applyTemplate(tpl: TemplateLocal) {
  const now = new Date().toISOString();
  const newLines: WorkingLine[] = tpl.lines.map((tl, idx) => ({
    id: crypto.randomUUID(),
    designation: tl.designation,
    unitPrice: String(tl.unitPrice),  // déjà integer
    quantity: tl.quantity,
    ordre: lines.length + idx,        // suite des lignes existantes
    isNew: true,
    dbRevision: 0,
    createdAt: now,
    pays: "NE",
  }));
  setLines(prev => [...prev, ...newLines]);
  setShowTemplatePicker(false);
}

// INCORRECT — remplacer les lignes existantes
setLines(newLines);
```

### CRITIQUE — templateId non stocké sur les WorkingLine

`QuoteLineLocal.templateId?: string` existe mais **n'est pas utilisé dans MVP-0** pour la traçabilité du modèle source. Les lignes importées sont des copies indépendantes. NE PAS setter `templateId` dans `applyTemplate` (complexité inutile, non demandé dans les AC).

### CRITIQUE — db.templates.toArray() non indexé par companyId

`db.templates.toArray()` ramène **tous** les templates de la Dexie locale. En MVP-0 (single company per instance), pas de problème de cross-tenant — Dexie est peuplée uniquement avec les données pull de l'entreprise de l'utilisateur. Pas de filtre companyId nécessaire.

### CRITIQUE — Picker de modèle dans WizardStepServices

Le picker (liste de templates) est rendu en position absolue (`absolute top-10 left-0 z-10`) par rapport au bouton. En mobile, vérifier que le z-index ne masque pas les éléments suivants. Alternative acceptable : afficher la liste inline (sans position absolue) juste sous le bouton avec un `border rounded-xl`.

**Si le picker inline cause des problèmes de layout mobile :** transformer en liste expansible (pas de position absolute).

### Design tokens — cohérence avec les stories précédentes

```tsx
// Card template (liste)
className="rounded-xl border border-border bg-surface p-4"

// Input standard
className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"

// Label
className="text-xs font-semibold text-text-muted"

// Bouton primaire (Enregistrer)
className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"

// Bouton secondaire (Annuler)
className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60"

// Bouton dashed (Ajouter une ligne)
className="flex items-center gap-2 h-9 rounded-xl border border-dashed border-border px-4 text-xs text-text-secondary hover:bg-surface disabled:opacity-60"

// Bouton destructif
className="h-8 rounded-lg px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
```

### Pièges & Anti-patterns

| ❌ INTERDIT | ✅ CORRECT |
|---|---|
| Modifier push/route.ts | case "template" déjà opérationnel lignes 366-388 |
| Modifier local-db.ts | TemplateLocal + templates table déjà présents lignes 86-95, 162 |
| Modifier pull/route.ts ou pull.ts | templates déjà inclus dans le delta sync |
| `companyId: undefined` dans db.templates.put | Omettre companyId — server stampe au sync |
| `setLines(newLines)` dans applyTemplate | `setLines(prev => [...prev, ...newLines])` — append |
| `parseFloat(tl.unitPrice)` dans applyTemplate | `tl.unitPrice` est déjà un number (integer) |
| `applyLocalMutation("template", ..., "delete", { id: tpl.id })` | payload `{}` pour delete |
| lire `dbTemplate.revision` après la mutation | lire AVANT l'appel à applyLocalMutation |
| Hardcoder les strings UI | Utiliser `src/messages/fr-NE.json` + `useTranslations` |
| `db.templates.update(id, partialFields)` | `db.templates.put(completeRecord)` |
| `can(role, "user.manage")` pour guard template | `can(role, "template.create")` |

### Héritage des stories précédentes

**Story 3.4 (wizard-step-services.tsx) — patron direct :**
- Pattern `WorkingLine` + état local lignes
- Pattern `isPending + setErrors + try/catch/finally`
- Pattern `applyLocalMutation` pour `quoteLine`
- Pattern `useWizardStore.getState().setStep(n)` dans async
- Pattern `db.*.put(completeRecord)` (pas `.update`)
- Pattern `errors[id]` avec `noUncheckedIndexedAccess` — accès via `errors[id]?.["field"]`

**Story 2.3 (company-form.tsx) — patron pour TemplateManager :**
- Pattern `mode = "list" | "create" | "edit"` comme state machine UI
- Pattern `can(role, action)` dans le Server Component parent pour cacher le composant
- Pattern `isPending + try/finally` pour les mutations

**Architecture §Data Architecture :**
- "Dexie `liveQuery` + React hooks are the read source of truth"
- "unitPrice stored as integer FCFA. Round before persisting: Math.round(parsedFloat)"

### Commandes pour le dev agent

```bash
# 1. Docker en cours
docker compose up -d

# 2. Aucune migration nécessaire — table template existe déjà dans schema.ts
pnpm db:migrate  # idempotent — ne génère rien de nouveau

# 3. Qualité
pnpm check   # lint ✓ typecheck ✓ tests ✓

# 4. Build
pnpm build   # passe sans erreur
```

---

## Références

- [Epics §Story 3.5] — FR-24 (modèles de lignes réutilisables, Admin définis)
- [src/lib/local-db.ts:86-95] — `TemplateLocal` (structure complète)
- [src/lib/local-db.ts:119-125] — `SyncOpEntity` (inclut "template")
- [src/lib/local-db.ts:162,175] — table Dexie `templates` + index
- [src/lib/schema.ts:228-246] — table Drizzle `template`
- [src/app/api/v1/sync/push/route.ts:366-388] — `case "template"` déjà opérationnel
- [src/app/api/v1/sync/pull/route.ts:83-85] — templates dans le delta pull
- [src/lib/sync/pull.ts:83-87] — hydratation Dexie.templates
- [src/lib/permissions.ts:49-52,75-78] — matrice permissions template
- [src/lib/sync/outbox.ts:29-60] — `applyLocalMutation` (entity, id, type, payload, revision, dexieWriteFn, createdBy)
- [src/hooks/use-live-company.ts] — pattern liveQuery hook à reproduire
- [src/components/settings/] — composants existants (CompanyForm, SignatoryConfig, LogoUpload) — structure à suivre
- [src/components/quote/wizard-step-services.tsx] — à modifier pour ajouter le picker template
- [src/app/(app)/parametres/page.tsx] — à modifier pour ajouter TemplateManager
- [src/messages/fr-NE.json] — ajouter `parametres.modeles` + `devis.wizard.prestations.applyTemplate`
- [UX-DR19] — Calculs live (totaux recalculés immédiatement après applyTemplate)
- [Architecture §Naming Patterns] — `"use client"`, kebab-case files, PascalCase components, `@/` alias

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Aucun blocage. Import order warning ESLint corrigé (dexie avant next-intl dans wizard-step-services, use-live-templates avant @/lib/local-db dans template-manager).

### Completion Notes List

- T1 : `use-live-templates.ts` créé — pattern identique à `use-live-company.ts`, liveQuery natif Dexie
- T2 : `template-manager.tsx` créé — state machine list/create/edit, CRUD complet via `applyLocalMutation`, validation formulaire, design tokens cohérents avec stories précédentes
- T3 : `wizard-step-services.tsx` mis à jour — liveQuery templates + applyTemplate (append, unitPrice déjà integer), picker dropdown conditionnel (masqué si aucun modèle)
- T4 : `parametres/page.tsx` mis à jour — TemplateManager visible uniquement si `can(role, "template.create")`
- T5 : `fr-NE.json` mis à jour — `parametres.modeles` + `devis.wizard.prestations.applyTemplate`
- T6 : `pnpm check` ✓ (0 erreur, warnings pré-existants uniquement) + `pnpm build` ✓

### File List

- `src/hooks/use-live-templates.ts` (à créer)
- `src/components/settings/template-manager.tsx` (à créer)
- `src/components/quote/wizard-step-services.tsx` (à modifier)
- `src/app/(app)/parametres/page.tsx` (à modifier)
- `src/messages/fr-NE.json` (à modifier)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (mis à jour)
- `_bmad-output/implementation-artifacts/3-5-reusable-line-templates.md` (ce fichier)

### Change Log

- Story 3-5 implémentée : modèles de lignes réutilisables — CRUD Admin dans Paramètres, application dans wizard étape 4 (Date: 2026-06-25)

---

## Review Findings

Code review effectué le 2026-06-26. Sources : Blind Hunter + Edge Case Hunter + Acceptance Auditor.

### Patches

- [x] [Review][Patch] Duplicate liveQuery — remplacer inline useEffect par `useLiveTemplates()` [`src/components/quote/wizard-step-services.tsx:272-278`]
- [x] [Review][Patch] Infinity bypasses unitPrice validation — ajouter `!Number.isFinite(price)` dans validateForm [`src/components/settings/template-manager.tsx:82`]
- [x] [Review][Patch] `key={idx}` sur formLines — utiliser UUID stable par ligne [`src/components/settings/template-manager.tsx:244`]
- [x] [Review][Patch] `handleDelete` sans feedback utilisateur — ajouter `setErrors` sur erreur et sur no-op [`src/components/settings/template-manager.tsx:151-169`]
- [x] [Review][Patch] Picker line count hardcodé en français — utiliser `t("lineCount", { count })` [`src/components/quote/wizard-step-services.tsx:547-549`]
- [x] [Review][Patch] `errors["global"]` non effacé sur retry — ajouter `setErrors({})` en début de `handleSubmit` [`src/components/settings/template-manager.tsx:91`]
- [x] [Review][Patch] `aria-describedby` absent sur inputs de ligne (désignation, prix) [`src/components/settings/template-manager.tsx:253,276`]
- [x] [Review][Patch] Pas d'état de chargement dans TemplateManager — flash "Aucun modèle" au mount [`src/components/settings/template-manager.tsx`]
- [x] [Review][Patch] `applyTemplate` capture `lines.length` en closure — utiliser `prev.length` dans le functional updater [`src/components/quote/wizard-step-services.tsx:329`]
- [x] [Review][Patch] `toArray()` sans filtre `deletedAt` — templates soft-deleted potentiellement visibles [`src/hooks/use-live-templates.ts:12`]
- [x] [Review][Patch] `lineErrors` indices non réindexés après `removeFormLine` [`src/components/settings/template-manager.tsx:70-73`]

### Deferred

- [x] [Review][Defer] `isPending` partagé bloque toutes actions liste pendant un delete — pattern commun codebase [`src/components/settings/template-manager.tsx`] — deferred, pre-existing
- [x] [Review][Defer] Picker sans dismiss outside-click — spec dit "optionnel MVP" [`src/components/quote/wizard-step-services.tsx:537`] — deferred, pre-existing
- [x] [Review][Defer] Retour liste sans confirmation si données non sauvegardées — UX post-MVP — deferred, pre-existing
- [x] [Review][Defer] Commercial ne peut pas consulter les templates dans Paramètres — hors scope story — deferred, pre-existing
- [x] [Review][Defer] Guard `template.create` plutôt que `role === "admin"` — correct aujourd'hui, risque futur seulement [`src/app/(app)/parametres/page.tsx:93`] — deferred, pre-existing
