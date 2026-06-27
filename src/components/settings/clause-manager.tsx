"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useLiveClauses } from "@/hooks/use-live-clauses";
import { db } from "@/lib/local-db";
import type { ClauseLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

/**
 * Maximum length (in characters) for a clause body.
 * Enforced both in the UI (textarea maxLength + counter) and persisted value.
 */
const CONTENU_MAX_LENGTH = 2000;

/**
 * Predefined clause categories, displayed first (in this order) when present.
 * Free-text categories are still allowed and shown after these, followed by
 * uncategorized clauses ("Sans catégorie") at the end.
 */
const CATEGORIES = ["Paiement", "Responsabilité", "Exclusions"];

/** Sentinel key used to bucket clauses that have no `categorie`. */
const NO_CATEGORY_KEY = "__none__";

interface ClauseManagerProps {
  userId: string;
}

export function ClauseManager({ userId }: ClauseManagerProps) {
  const clauses = useLiveClauses();
  const t = useTranslations("parametres.clauses");
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingClause, setEditingClause] = useState<ClauseLocal | null>(null);
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [categorie, setCategorie] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  function openCreate() {
    setTitre("");
    setContenu("");
    setCategorie("");
    setErrors({});
    setEditingClause(null);
    setMode("create");
  }

  function openEdit(clause: ClauseLocal) {
    setTitre(clause.titre);
    setContenu(clause.contenu);
    setCategorie(clause.categorie ?? "");
    setErrors({});
    setEditingClause(clause);
    setMode("edit");
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};
    if (!titre.trim()) newErrors["titre"] = t("titreRequired");
    if (!contenu.trim()) newErrors["contenu"] = t("contenuRequired");
    if (contenu.length > CONTENU_MAX_LENGTH) {
      newErrors["contenu"] = t("contenuMaxLength");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    setErrors({});
    if (!validateForm()) return;
    setIsPending(true);
    try {
      const now = new Date().toISOString();
      const trimmedTitre = titre.trim();
      const trimmedContenu = contenu.trim();
      const trimmedCategorie = categorie.trim();

      if (mode === "create") {
        const id = crypto.randomUUID();
        // `categorie` is optional on ClauseLocal — only spread it when non-empty
        // so we never assign `undefined` (exactOptionalPropertyTypes).
        const record: ClauseLocal = {
          id,
          titre: trimmedTitre,
          contenu: trimmedContenu,
          ...(trimmedCategorie ? { categorie: trimmedCategorie } : {}),
          pays: "NE",
          revision: 0,
          updatedAt: now,
          createdAt: now,
        };
        await applyLocalMutation(
          "clause",
          id,
          "create",
          {
            titre: trimmedTitre,
            contenu: trimmedContenu,
            ...(trimmedCategorie ? { categorie: trimmedCategorie } : {}),
            pays: "NE",
            updatedAt: now,
            createdAt: now,
          },
          0,
          async () => {
            await db.clauses.put(record);
          },
          userId,
        );
        void triggerSync();
        toast.success(t("successCreated", { titre: trimmedTitre }), {
          duration: 2200,
        });
        setMode("list");
      } else if (mode === "edit" && editingClause) {
        const dbClause = await db.clauses.get(editingClause.id);
        if (!dbClause) {
          setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
          return;
        }
        await applyLocalMutation(
          "clause",
          dbClause.id,
          "update",
          {
            titre: trimmedTitre,
            contenu: trimmedContenu,
            ...(trimmedCategorie ? { categorie: trimmedCategorie } : {}),
            pays: dbClause.pays,
            updatedAt: now,
          },
          dbClause.revision,
          async () => {
            await db.clauses.put({
              ...dbClause,
              titre: trimmedTitre,
              contenu: trimmedContenu,
              ...(trimmedCategorie ? { categorie: trimmedCategorie } : {}),
              updatedAt: now,
            });
          },
          userId,
        );
        void triggerSync();
        toast.success(t("successUpdated"), { duration: 2200 });
        setMode("list");
      }
    } catch {
      setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(clause: ClauseLocal) {
    setIsPending(true);
    try {
      // Read revision BEFORE the mutation (base for optimistic concurrency).
      const dbClause = await db.clauses.get(clause.id);
      if (!dbClause) {
        setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
        return;
      }
      await applyLocalMutation(
        "clause",
        clause.id,
        "delete",
        {},
        dbClause.revision,
        async () => {
          // Hard delete locally — ClauseLocal has no deletedAt (unlike templates).
          await db.clauses.delete(clause.id);
        },
        userId,
      );
      void triggerSync();
      setMode("list");
    } catch {
      setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
    } finally {
      setIsPending(false);
    }
  }

  // ---- List view -----------------------------------------------------------

  if (mode === "list") {
    // Group clauses by category, preserving predefined order then free-text,
    // then uncategorized last.
    const grouped = clauses.reduce<Record<string, ClauseLocal[]>>((acc, clause) => {
      const cat = clause.categorie?.trim() ? clause.categorie!.trim() : NO_CATEGORY_KEY;
      (acc[cat] ??= []).push(clause);
      return acc;
    }, {});

    const orderedCategories = [
      ...CATEGORIES.filter((c) => grouped[c]?.length),
      ...Object.keys(grouped).filter(
        (k) => !CATEGORIES.includes(k) && k !== NO_CATEGORY_KEY,
      ),
      ...(grouped[NO_CATEGORY_KEY]?.length ? [NO_CATEGORY_KEY] : []),
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{t("heading")}</h2>
          <button
            type="button"
            onClick={openCreate}
            disabled={isPending}
            className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
          >
            {t("addClause")}
          </button>
        </div>

        {errors["global"] && (
          <p role="alert" className="text-xs text-destructive">
            {errors["global"]}
          </p>
        )}

        {clauses.length === 0 && (
          <p className="text-sm text-text-muted">{t("empty")}</p>
        )}

        {orderedCategories.map((catKey) => {
          const items = grouped[catKey] ?? [];
          const label =
            catKey === NO_CATEGORY_KEY ? t("noCategory") : catKey;
          return (
            <div key={catKey} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {label}
              </p>
              {items.map((clause) => {
                const extrait =
                  clause.contenu.length > 80
                    ? `${clause.contenu.slice(0, 80)}…`
                    : clause.contenu;
                return (
                  <div
                    key={clause.id}
                    className="rounded-xl border border-border bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">
                          {clause.titre}
                        </p>
                        <p className="mt-1 text-xs text-text-muted line-clamp-2">
                          {extrait}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(clause)}
                          disabled={isPending}
                          className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-text-secondary hover:bg-surface-alt disabled:opacity-60"
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(clause)}
                          disabled={isPending}
                          className="h-8 rounded-lg px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  // ---- Create / Edit form --------------------------------------------------

  const isNearLimit = contenu.length > CONTENU_MAX_LENGTH - 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMode("list")}
          disabled={isPending}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("backToList")}
        </button>
        <h2 className="text-sm font-semibold text-text-primary">
          {mode === "create" ? t("createHeading") : t("editHeading")}
        </h2>
      </div>

      {/* Titre */}
      <div>
        <label className="text-xs font-semibold text-text-muted" htmlFor="clause-titre">
          {t("titreLabel")}
        </label>
        <input
          id="clause-titre"
          type="text"
          value={titre}
          onChange={(e) => {
            setTitre(e.target.value);
            setErrors((p) => ({ ...p, titre: "" }));
          }}
          placeholder={t("titrePlaceholder")}
          disabled={isPending}
          aria-invalid={!!errors["titre"]}
          aria-describedby={errors["titre"] ? "clause-titre-error" : undefined}
          className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
        />
        {errors["titre"] && (
          <p id="clause-titre-error" className="mt-0.5 text-xs text-destructive">
            {errors["titre"]}
          </p>
        )}
      </div>

      {/* Contenu */}
      <div>
        <label className="text-xs font-semibold text-text-muted" htmlFor="clause-contenu">
          {t("contenuLabel")}
        </label>
        <textarea
          id="clause-contenu"
          value={contenu}
          onChange={(e) => {
            if (e.target.value.length <= CONTENU_MAX_LENGTH) {
              setContenu(e.target.value);
            }
            setErrors((p) => ({ ...p, contenu: "" }));
          }}
          placeholder={t("contenuPlaceholder")}
          maxLength={CONTENU_MAX_LENGTH}
          disabled={isPending}
          aria-invalid={!!errors["contenu"]}
          aria-describedby={
            errors["contenu"] ? "clause-contenu-error" : "clause-contenu-counter"
          }
          className="mt-1 min-h-[120px] w-full resize-none rounded-xl border border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
        <div className="mt-0.5 flex items-center justify-between">
          {errors["contenu"] ? (
            <p id="clause-contenu-error" className="text-xs text-destructive">
              {errors["contenu"]}
            </p>
          ) : (
            <span />
          )}
          <p
            id="clause-contenu-counter"
            className={`text-xs ${isNearLimit ? "text-destructive" : "text-text-muted"}`}
          >
            {t("contenuCounter", { count: contenu.length })}
          </p>
        </div>
      </div>

      {/* Catégorie (optional) */}
      <div>
        <label
          className="text-xs font-semibold text-text-muted"
          htmlFor="clause-categorie"
        >
          {t("categorieLabel")}
        </label>
        <input
          id="clause-categorie"
          type="text"
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          placeholder={t("categoriePlaceholder")}
          list="clause-categorie-options"
          disabled={isPending}
          className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
        />
        <datalist id="clause-categorie-options">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
          <option value={t("categorieAutre")} />
        </datalist>
        <p className="mt-0.5 text-xs text-text-muted">{t("noCategory")}</p>
      </div>

      {errors["global"] && (
        <p role="alert" className="text-xs text-destructive">
          {errors["global"]}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setMode("list")}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
        >
          {t("cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
        >
          {isPending ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}
