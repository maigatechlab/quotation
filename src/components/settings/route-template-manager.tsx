"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useLiveRouteTemplates } from "@/hooks/use-live-route-templates";
import { db } from "@/lib/local-db";
import type { RouteTemplateLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";

interface RouteTemplateManagerProps {
  canManage: boolean;
  canRead: boolean;
  userId?: string;
}

const COUNTRIES = [
  { code: "NE", label: "Niger" },
  { code: "BF", label: "Burkina Faso" },
  { code: "ML", label: "Mali" },
  { code: "NG", label: "Nigéria" },
  { code: "BJ", label: "Bénin" },
  { code: "TG", label: "Togo" },
  { code: "CI", label: "Côte d'Ivoire" },
  { code: "GH", label: "Ghana" },
  { code: "SN", label: "Sénégal" },
];

interface FormState {
  nom: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  distanceKm: string;
  tarifFcfa: string;
}

function emptyForm(): FormState {
  return {
    nom: "",
    originCountry: "NE",
    originCity: "",
    destinationCountry: "NE",
    destinationCity: "",
    distanceKm: "",
    tarifFcfa: "",
  };
}

export function RouteTemplateManager({ canManage, canRead, userId }: RouteTemplateManagerProps) {
  const { templates, loaded } = useLiveRouteTemplates();
  const t = useTranslations("routeTemplates");
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingTemplate, setEditingTemplate] = useState<RouteTemplateLocal | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, setIsPending] = useState(false);

  function setField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
  }

  function openCreate() {
    setForm(emptyForm());
    setErrors({});
    setEditingTemplate(null);
    setMode("create");
  }

  function openEdit(tpl: RouteTemplateLocal) {
    setForm({
      nom: tpl.nom,
      originCountry: tpl.originCountry,
      originCity: tpl.originCity,
      destinationCountry: tpl.destinationCountry,
      destinationCity: tpl.destinationCity,
      distanceKm: tpl.distanceKm != null ? String(tpl.distanceKm) : "",
      tarifFcfa: tpl.tarifFcfa != null ? String(tpl.tarifFcfa) : "",
    });
    setErrors({});
    setEditingTemplate(tpl);
    setMode("edit");
  }

  function validateForm(): boolean {
    const errs: Record<string, string> = {};
    if (!form.nom.trim()) errs["nom"] = t("formNom") + " requis";
    if (!form.originCity.trim()) errs["originCity"] = t("formOriginCity") + " requise";
    if (!form.destinationCity.trim()) errs["destinationCity"] = t("formDestinationCity") + " requise";
    if (form.distanceKm) {
      const d = parseFloat(form.distanceKm);
      if (Number.isNaN(d) || d <= 0) errs["distanceKm"] = "Distance invalide (doit être > 0)";
    }
    if (form.tarifFcfa) {
      const tarif = parseInt(form.tarifFcfa, 10);
      if (Number.isNaN(tarif) || tarif < 0) errs["tarifFcfa"] = "Tarif invalide (doit être ≥ 0)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm()) return;
    setIsPending(true);
    try {
      const now = new Date().toISOString();
      const distanceKm = form.distanceKm ? parseFloat(form.distanceKm) : undefined;
      const tarifFcfa = form.tarifFcfa ? Math.round(parseInt(form.tarifFcfa, 10)) : undefined;

      if (mode === "create") {
        const id = crypto.randomUUID();
        const record: RouteTemplateLocal = {
          id,
          nom: form.nom.trim(),
          originCountry: form.originCountry,
          originCity: form.originCity.trim(),
          destinationCountry: form.destinationCountry,
          destinationCity: form.destinationCity.trim(),
          pays: "NE",
          revision: 0,
          updatedAt: now,
          createdAt: now,
          ...(distanceKm !== undefined ? { distanceKm } : {}),
          ...(tarifFcfa !== undefined ? { tarifFcfa } : {}),
        };
        await applyLocalMutation(
          "routeTemplate", id, "create",
          { ...record } as Record<string, unknown>,
          0,
          async () => { await db.routeTemplates.add(record); },
          userId,
        );
      } else if (mode === "edit" && editingTemplate) {
        const existing = await db.routeTemplates.get(editingTemplate.id);
        if (!existing) {
          setErrors({ global: t("errorGeneric") });
          return;
        }
        // exactOptionalPropertyTypes: build object without undefined optional fields
        const updated: RouteTemplateLocal = {
          id: existing.id,
          nom: form.nom.trim(),
          originCountry: form.originCountry,
          originCity: form.originCity.trim(),
          destinationCountry: form.destinationCountry,
          destinationCity: form.destinationCity.trim(),
          pays: existing.pays,
          revision: existing.revision,
          createdAt: existing.createdAt,
          updatedAt: now,
          ...(existing.deletedAt !== undefined ? { deletedAt: existing.deletedAt } : {}),
          ...(existing.companyId !== undefined ? { companyId: existing.companyId } : {}),
          ...(distanceKm !== undefined ? { distanceKm } : {}),
          ...(tarifFcfa !== undefined ? { tarifFcfa } : {}),
        };
        await applyLocalMutation(
          "routeTemplate", existing.id, "update",
          { ...updated } as Record<string, unknown>,
          existing.revision,
          async () => { await db.routeTemplates.put(updated); },
          userId,
        );
      }

      void triggerSync();
      setMode("list");
    } catch {
      setErrors({ global: t("errorGeneric") });
    } finally {
      setIsPending(false);
    }
  }

  async function handleDelete(tpl: RouteTemplateLocal) {
    if (!confirm(t("deleteConfirm"))) return;
    setIsPending(true);
    try {
      const existing = await db.routeTemplates.get(tpl.id);
      if (!existing) {
        setErrors({ global: t("errorGeneric") });
        return;
      }
      const now = new Date().toISOString();
      const softDeleted: RouteTemplateLocal = { ...existing, deletedAt: now, updatedAt: now };
      await applyLocalMutation(
        "routeTemplate", tpl.id, "delete",
        { ...softDeleted } as Record<string, unknown>,
        existing.revision,
        async () => { await db.routeTemplates.put(softDeleted); },
        userId,
      );
      void triggerSync();
    } catch {
      setErrors({ global: t("errorGeneric") });
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
          <h2 className="text-sm font-semibold text-text-primary">{t("pageTitle")}</h2>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              disabled={isPending}
              className="h-9 rounded-xl bg-brand-navy px-4 text-xs font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
            >
              {t("addButton")}
            </button>
          )}
        </div>

        {!canRead && (
          <p className="text-sm text-text-muted">{t("proGate")}</p>
        )}

        {errors["global"] && (
          <p role="alert" className="text-xs text-destructive">{errors["global"]}</p>
        )}

        {templates.length === 0 && (
          <p className="text-sm text-text-muted">{t("emptyState")}</p>
        )}

        {templates.map((tpl) => (
          <div key={tpl.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text-primary">{tpl.nom}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {tpl.originCity} → {tpl.destinationCity}
                  {tpl.tarifFcfa != null && ` · ${tpl.tarifFcfa.toLocaleString()} FCFA`}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(tpl)}
                    disabled={isPending}
                    className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-text-secondary hover:bg-surface-alt disabled:opacity-60"
                  >
                    {t("editButton")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(tpl)}
                    disabled={isPending}
                    className="h-8 rounded-lg px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    {t("deleteButton")}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMode("list")}
          disabled={isPending}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          ← {t("cancelButton")}
        </button>
        <h2 className="text-sm font-semibold text-text-primary">
          {mode === "create" ? t("addButton") : t("editButton")}
        </h2>
      </div>

      {/* Nom */}
      <div>
        <label className="text-xs font-semibold text-text-muted">{t("formNom")} *</label>
        <input
          type="text"
          value={form.nom}
          onChange={(e) => setField("nom", e.target.value)}
          disabled={isPending}
          aria-invalid={!!errors["nom"]}
          className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
        />
        {errors["nom"] && <p className="mt-0.5 text-xs text-destructive">{errors["nom"]}</p>}
      </div>

      {/* Départ */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-muted">{t("formOriginCountry")} *</label>
          <select
            value={form.originCountry}
            onChange={(e) => setField("originCountry", e.target.value)}
            disabled={isPending}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted">{t("formOriginCity")} *</label>
          <input
            type="text"
            value={form.originCity}
            onChange={(e) => setField("originCity", e.target.value)}
            disabled={isPending}
            aria-invalid={!!errors["originCity"]}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors["originCity"] && <p className="mt-0.5 text-xs text-destructive">{errors["originCity"]}</p>}
        </div>
      </div>

      {/* Arrivée */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-muted">{t("formDestinationCountry")} *</label>
          <select
            value={form.destinationCountry}
            onChange={(e) => setField("destinationCountry", e.target.value)}
            disabled={isPending}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted">{t("formDestinationCity")} *</label>
          <input
            type="text"
            value={form.destinationCity}
            onChange={(e) => setField("destinationCity", e.target.value)}
            disabled={isPending}
            aria-invalid={!!errors["destinationCity"]}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors["destinationCity"] && <p className="mt-0.5 text-xs text-destructive">{errors["destinationCity"]}</p>}
        </div>
      </div>

      {/* Distance + Tarif */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-text-muted">{t("formDistanceKm")}</label>
          <input
            type="number"
            value={form.distanceKm}
            onChange={(e) => setField("distanceKm", e.target.value)}
            min="0"
            step="0.1"
            disabled={isPending}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors["distanceKm"] && <p className="mt-0.5 text-xs text-destructive">{errors["distanceKm"]}</p>}
        </div>
        <div>
          <label className="text-xs font-semibold text-text-muted">{t("formTarifFcfa")}</label>
          <input
            type="number"
            value={form.tarifFcfa}
            onChange={(e) => setField("tarifFcfa", e.target.value)}
            min="0"
            step="1"
            disabled={isPending}
            className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors["tarifFcfa"] && <p className="mt-0.5 text-xs text-destructive">{errors["tarifFcfa"]}</p>}
        </div>
      </div>

      {errors["global"] && (
        <p role="alert" className="text-xs text-destructive">{errors["global"]}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setMode("list")}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
        >
          {t("cancelButton")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
        >
          {isPending ? "Enregistrement…" : t("saveButton")}
        </button>
      </div>
    </div>
  );
}
