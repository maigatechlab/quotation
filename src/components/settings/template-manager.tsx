"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveTemplates } from "@/hooks/use-live-templates";
import { db } from "@/lib/local-db";
import type { TemplateLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

interface TemplateLine {
  id: string;
  designation: string;
  unitPrice: string;
  quantity: number;
}

interface TemplateManagerProps {
  userId: string;
}

function emptyLine(): TemplateLine {
  return { id: crypto.randomUUID(), designation: "", unitPrice: "", quantity: 1 };
}

export function TemplateManager({ userId }: TemplateManagerProps) {
  const { templates, loaded } = useLiveTemplates();
  const t = useTranslations("parametres.modeles");
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingTemplate, setEditingTemplate] = useState<TemplateLocal | null>(null);
  const [nom, setNom] = useState("");
  const [formLines, setFormLines] = useState<TemplateLine[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lineErrors, setLineErrors] = useState<Record<string, Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);

  function openCreate() {
    setNom("");
    setFormLines([emptyLine()]);
    setErrors({});
    setLineErrors({});
    setEditingTemplate(null);
    setMode("create");
  }

  function openEdit(tpl: TemplateLocal) {
    setNom(tpl.nom);
    setFormLines(tpl.lines.map((l) => ({
      id: crypto.randomUUID(),
      designation: l.designation,
      unitPrice: String(l.unitPrice),
      quantity: l.quantity,
    })));
    setErrors({});
    setLineErrors({});
    setEditingTemplate(tpl);
    setMode("edit");
  }

  function addFormLine() {
    setFormLines((prev) => [...prev, emptyLine()]);
  }

  function updateFormLine(id: string, field: keyof TemplateLine, value: string | number) {
    setFormLines((prev) => prev.map((l) => l.id === id ? { ...l, [field]: value } : l));
    setLineErrors((prev) => {
      const copy = { ...prev };
      if (copy[id]) {
        const lineCopy = { ...copy[id] };
        delete lineCopy[field as string];
        copy[id] = lineCopy;
      }
      return copy;
    });
  }

  function removeFormLine(id: string) {
    if (formLines.length <= 1) return;
    setFormLines((prev) => prev.filter((l) => l.id !== id));
    setLineErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};
    const newLineErrors: Record<string, Record<string, string>> = {};
    if (!nom.trim()) newErrors["nom"] = t("nomRequired");
    formLines.forEach((l) => {
      const le: Record<string, string> = {};
      if (!l.designation.trim()) le["designation"] = t("designationRequired");
      const price = Math.round(parseFloat(l.unitPrice) || 0);
      if (!Number.isFinite(price) || price <= 0) le["unitPrice"] = t("unitPriceRequired");
      if (Object.keys(le).length > 0) newLineErrors[l.id] = le;
    });
    setErrors(newErrors);
    setLineErrors(newLineErrors);
    return Object.keys(newErrors).length === 0 && Object.keys(newLineErrors).length === 0;
  }

  async function handleSubmit() {
    setErrors({});
    if (!validateForm()) return;
    setIsPending(true);
    try {
      const now = new Date().toISOString();
      const parsedLines = formLines.map((l) => ({
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
        const dbTemplate = await db.templates.get(editingTemplate.id);
        if (!dbTemplate) {
          setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
          return;
        }
        await applyLocalMutation(
          "template", dbTemplate.id, "update",
          { nom: nom.trim(), lines: parsedLines, pays: dbTemplate.pays, updatedAt: now },
          dbTemplate.revision,
          async () => {
            await db.templates.put({
              ...dbTemplate,
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
      setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(tpl: TemplateLocal) {
    setIsPending(true);
    try {
      const dbTemplate = await db.templates.get(tpl.id);
      if (!dbTemplate) {
        setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
        return;
      }
      await applyLocalMutation(
        "template", tpl.id, "delete", {},
        dbTemplate.revision,
        async () => { await db.templates.delete(tpl.id); },
        userId
      );
      void triggerSync();
    } catch {
      setErrors((prev) => ({ ...prev, global: t("errorGeneric") }));
    } finally {
      setIsPending(false);
    }
  }

  if (mode === "list") {
    if (!loaded) {
      return (
        <div className="space-y-4">
          <div className="h-6 w-48 animate-pulse rounded bg-border" />
          <div className="h-16 animate-pulse rounded-xl bg-border" />
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{t("heading")}</h2>
          <button type="button" onClick={openCreate} disabled={isPending}
            className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60">
            {t("addTemplate")}
          </button>
        </div>

        {errors["global"] && (
          <p role="alert" className="text-xs text-destructive">{errors["global"]}</p>
        )}

        {templates.length === 0 && (
          <p className="text-sm text-text-muted">{t("empty")}</p>
        )}

        {templates.map((tpl) => (
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
          onChange={(e) => { setNom(e.target.value); setErrors((p) => ({ ...p, nom: "" })); }}
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
        {formLines.map((line) => (
          <div key={line.id} className="rounded-xl border border-border bg-surface p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  id={`designation-${line.id}`}
                  type="text"
                  value={line.designation}
                  onChange={(e) => updateFormLine(line.id, "designation", e.target.value)}
                  placeholder={t("designationPlaceholder")}
                  disabled={isPending}
                  aria-invalid={!!lineErrors[line.id]?.["designation"]}
                  aria-describedby={lineErrors[line.id]?.["designation"] ? `designation-error-${line.id}` : undefined}
                  className="h-9 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
                />
                {lineErrors[line.id]?.["designation"] && (
                  <p id={`designation-error-${line.id}`} className="mt-0.5 text-xs text-destructive">
                    {lineErrors[line.id]?.["designation"]}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => removeFormLine(line.id)} disabled={isPending || formLines.length <= 1}
                aria-label={t("removeLine")}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 disabled:opacity-30">
                ✕
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  id={`unit-price-${line.id}`}
                  type="number"
                  value={line.unitPrice}
                  onChange={(e) => updateFormLine(line.id, "unitPrice", e.target.value)}
                  placeholder={t("unitPricePlaceholder")}
                  min="1"
                  disabled={isPending}
                  aria-invalid={!!lineErrors[line.id]?.["unitPrice"]}
                  aria-describedby={lineErrors[line.id]?.["unitPrice"] ? `unit-price-error-${line.id}` : undefined}
                  className="h-9 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
                />
                {lineErrors[line.id]?.["unitPrice"] && (
                  <p id={`unit-price-error-${line.id}`} className="mt-0.5 text-xs text-destructive">
                    {lineErrors[line.id]?.["unitPrice"]}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => updateFormLine(line.id, "quantity", Math.max(1, line.quantity - 1))}
                  disabled={line.quantity <= 1 || isPending}
                  aria-label={t("decreaseQty")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-surface text-text-primary disabled:opacity-40">
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold text-text-primary">{line.quantity}</span>
                <button type="button" onClick={() => updateFormLine(line.id, "quantity", line.quantity + 1)}
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

      {errors["global"] && <p role="alert" className="text-xs text-destructive">{errors["global"]}</p>}

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
}
