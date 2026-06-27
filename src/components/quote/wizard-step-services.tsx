"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { computeLineTotal, computeQuoteTotal } from "@/lib/calc";
import { db } from "@/lib/local-db";
import type { QuoteLocal, TemplateLocal } from "@/lib/local-db";
import { useLiveTemplates } from "@/hooks/use-live-templates";
import { formatFcfa } from "@/lib/money";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { useWizardStore } from "@/stores/wizard-store";

interface WorkingLine {
  id: string;
  designation: string;
  unitPrice: string;
  quantity: number;
  ordre: number;
  isNew: boolean;
  dbRevision: number;
  createdAt: string;
  pays: string;
  companyId?: string;
}

interface ParsedLine extends WorkingLine {
  parsedPrice: number;
  totalFcfa: number;
}

interface WizardStepServicesProps {
  userId: string;
}

interface SortableLineRowProps {
  line: ParsedLine;
  errors: Record<string, string>;
  onUpdate: (id: string, field: keyof WorkingLine, value: unknown) => void;
  onRemove: (id: string, isNew: boolean) => void;
  isOnly: boolean;
  isPending: boolean;
}

function SortableLineRow({
  line,
  errors,
  onUpdate,
  onRemove,
  isOnly,
  isPending,
}: SortableLineRowProps) {
  const t = useTranslations("devis.wizard.prestations");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: line.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="space-y-3 rounded-xl border border-border bg-surface p-4">
      {/* Header: drag handle + delete */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="touch-none cursor-grab text-text-muted"
          aria-label={t("dragHandle")}
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={() => onRemove(line.id, line.isNew)}
          disabled={isOnly || isPending}
          aria-disabled={isOnly}
          aria-label={isOnly ? t("removeLineDisabled") : t("removeLine")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-destructive hover:bg-destructive/10 disabled:opacity-30"
        >
          ×
        </button>
      </div>

      {/* Designation */}
      <div className="space-y-1.5">
        <label
          htmlFor={`designation-${line.id}`}
          className="text-xs font-semibold text-text-muted"
        >
          {t("designationLabel")} *
        </label>
        <input
          id={`designation-${line.id}`}
          type="text"
          value={line.designation}
          onChange={(e) => onUpdate(line.id, "designation", e.target.value)}
          placeholder={t("designationPlaceholder")}
          disabled={isPending}
          aria-describedby={errors["designation"] ? `designation-error-${line.id}` : undefined}
          aria-invalid={!!errors["designation"]}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
        />
        {errors["designation"] && (
          <p
            id={`designation-error-${line.id}`}
            role="alert"
            className="text-xs text-destructive"
          >
            {errors["designation"]}
          </p>
        )}
      </div>

      {/* Unit price + quantity row */}
      <div className="flex items-start gap-3">
        {/* Unit price */}
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor={`unit-price-${line.id}`}
            className="text-xs font-semibold text-text-muted"
          >
            {t("unitPriceLabel")} *
          </label>
          <input
            id={`unit-price-${line.id}`}
            type="number"
            min="1"
            step="1"
            value={line.unitPrice}
            onChange={(e) => onUpdate(line.id, "unitPrice", e.target.value)}
            placeholder={t("unitPricePlaceholder")}
            disabled={isPending}
            aria-describedby={errors["unitPrice"] ? `unit-price-error-${line.id}` : undefined}
            aria-invalid={!!errors["unitPrice"]}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors["unitPrice"] && (
            <p
              id={`unit-price-error-${line.id}`}
              role="alert"
              className="text-xs text-destructive"
            >
              {errors["unitPrice"]}
            </p>
          )}
        </div>

        {/* Quantity stepper */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-text-muted">{t("quantityLabel")}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("decreaseQty")}
              onClick={() => onUpdate(line.id, "quantity", Math.max(1, line.quantity - 1))}
              disabled={line.quantity <= 1 || isPending}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-input bg-surface text-text-primary disabled:opacity-40"
            >
              −
            </button>
            <span className="w-8 text-center text-sm font-semibold text-text-primary">
              {line.quantity}
            </span>
            <button
              type="button"
              aria-label={t("increaseQty")}
              onClick={() => onUpdate(line.id, "quantity", line.quantity + 1)}
              disabled={isPending}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-input bg-surface text-text-primary disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Line total */}
      <p className="text-xs text-text-muted">
        {t("lineTotal")} :{" "}
        <span className="font-semibold text-text-primary">
          {line.parsedPrice > 0 ? formatFcfa(line.totalFcfa) : "—"}
        </span>
      </p>
    </div>
  );
}

export function WizardStepServices({ userId }: WizardStepServicesProps) {
  const t = useTranslations("devis.wizard.prestations");
  const tW = useTranslations("devis.wizard");
  const { quoteId, setStep } = useWizardStore();

  const [lines, setLines] = useState<WorkingLine[]>([]);
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { templates } = useLiveTemplates();
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  function newEmptyLine(): WorkingLine {
    return {
      id: crypto.randomUUID(),
      designation: "",
      unitPrice: "",
      quantity: 1,
      ordre: lines.length,
      isNew: true,
      dbRevision: 0,
      createdAt: new Date().toISOString(),
      pays: "NE",
    };
  }

  useEffect(() => {
    if (!quoteId) return;
    db.quoteLines
      .where("quoteId")
      .equals(quoteId)
      .sortBy("ordre")
      .then((dbLines) => {
        if (dbLines.length === 0) {
          setLines([newEmptyLine()]);
        } else {
          setLines(
            dbLines.map((l) => ({
              id: l.id,
              designation: l.designation,
              unitPrice: String(l.unitPrice),
              quantity: l.quantity,
              ordre: l.ordre,
              isNew: false,
              dbRevision: l.revision,
              createdAt: l.createdAt,
              pays: l.pays,
              ...(l.companyId != null ? { companyId: l.companyId } : {}),
            })),
          );
        }
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  // Live derived calculations — inline in render, no useEffect
  const parsedLines: ParsedLine[] = lines.map((l) => {
    const raw = parseFloat(l.unitPrice) || 0;
    const price = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
    const totalFcfa =
      price > 0 && l.quantity > 0 ? computeLineTotal(price, l.quantity) : 0;
    return { ...l, parsedPrice: price, totalFcfa };
  });
  const quoteTotal = computeQuoteTotal(parsedLines.map((l) => ({ totalFcfa: l.totalFcfa })));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLines((prev) => {
      const oldIdx = prev.findIndex((l) => l.id === active.id);
      const newIdx = prev.findIndex((l) => l.id === over.id);
      return arrayMove(prev, oldIdx, newIdx).map((l, i) => ({ ...l, ordre: i }));
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { ...newEmptyLine(), ordre: prev.length }]);
  }

  function updateLine(id: string, field: keyof WorkingLine, value: unknown) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? ({ ...l, [field]: value } as WorkingLine) : l)),
    );
    setErrors((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      const lineErrors = { ...existing };
      delete lineErrors[field as string];
      return { ...prev, [id]: lineErrors };
    });
  }

  function applyTemplate(tpl: TemplateLocal) {
    const now = new Date().toISOString();
    setLines((prev) => {
      const newLines: WorkingLine[] = tpl.lines.map((tl, idx) => ({
        id: crypto.randomUUID(),
        designation: tl.designation,
        unitPrice: String(tl.unitPrice),
        quantity: tl.quantity,
        ordre: prev.length + idx,
        isNew: true,
        dbRevision: 0,
        createdAt: now,
        pays: "NE",
      }));
      return [...prev, ...newLines];
    });
    setShowTemplatePicker(false);
  }

  function removeLine(id: string, isNew: boolean) {
    if (lines.length <= 1) return;
    setLines((prev) =>
      prev.filter((l) => l.id !== id).map((l, i) => ({ ...l, ordre: i })),
    );
    if (!isNew) {
      setDeletedLineIds((prev) => [...prev, id]);
    }
  }

  async function handleNext() {
    if (!quoteId) {
      setGlobalError(t("errorNoQuote"));
      return;
    }

    const lineErrors: Record<string, Record<string, string>> = {};
    for (const line of parsedLines) {
      if (!line.designation.trim()) {
        const existing = lineErrors[line.id] ?? {};
        lineErrors[line.id] = { ...existing, designation: t("designationRequired") };
      }
      if (line.parsedPrice <= 0) {
        const existing = lineErrors[line.id] ?? {};
        lineErrors[line.id] = { ...existing, unitPrice: t("unitPriceRequired") };
      }
    }
    if (Object.keys(lineErrors).length > 0) {
      setErrors(lineErrors);
      return;
    }

    setIsPending(true);
    try {
      const now = new Date().toISOString();

      // 1. Delete removed lines
      for (const lineId of deletedLineIds) {
        const dbLine = await db.quoteLines.get(lineId);
        if (dbLine) {
          await applyLocalMutation(
            "quoteLine",
            lineId,
            "delete",
            {},
            dbLine.revision,
            async () => {
              await db.quoteLines.delete(lineId);
            },
            userId,
          );
        }
      }

      // 2. Create/update remaining lines
      for (const line of lines) {
        const rawPrice = parseFloat(line.unitPrice) || 0;
        const parsedPrice = Number.isFinite(rawPrice) ? Math.round(rawPrice) : 0;
        const total = computeLineTotal(parsedPrice, line.quantity);
        const payload: Record<string, unknown> = {
          quoteId,
          designation: line.designation.trim(),
          unitPrice: parsedPrice,
          quantity: line.quantity,
          totalFcfa: total,
          ordre: line.ordre,
          pays: line.pays,
          updatedAt: now,
          createdAt: line.createdAt,
        };
        if (line.companyId != null) payload.companyId = line.companyId;

        if (line.isNew) {
          await applyLocalMutation(
            "quoteLine",
            line.id,
            "create",
            payload,
            0,
            async () => {
              await db.quoteLines.put({
                id: line.id,
                quoteId,
                designation: line.designation.trim(),
                unitPrice: parsedPrice,
                quantity: line.quantity,
                totalFcfa: total,
                ordre: line.ordre,
                pays: line.pays,
                revision: 0,
                updatedAt: now,
                createdAt: line.createdAt,
                ...(line.companyId != null ? { companyId: line.companyId } : {}),
              });
            },
            userId,
          );
        } else {
          const dbLine = await db.quoteLines.get(line.id);
          if (dbLine) {
            await applyLocalMutation(
              "quoteLine",
              line.id,
              "update",
              payload,
              dbLine.revision,
              async () => {
                await db.quoteLines.put({
                  ...dbLine,
                  designation: line.designation.trim(),
                  unitPrice: parsedPrice,
                  quantity: line.quantity,
                  totalFcfa: total,
                  ordre: line.ordre,
                  updatedAt: now,
                });
              },
              userId,
            );
          }
        }
      }

      // 3. Update quote.totalFcfa
      const currentQuote = await db.quotes.get(quoteId);
      if (!currentQuote) {
        setGlobalError(t("errorNoQuote"));
        return;
      }
      const newTotal = computeQuoteTotal(parsedLines.map((l) => ({ totalFcfa: l.totalFcfa })));
      const updatedQuote: QuoteLocal = {
        ...currentQuote,
        totalFcfa: newTotal,
        updatedAt: now,
      };
      await applyLocalMutation(
        "quote",
        quoteId,
        "update",
        { ...currentQuote, totalFcfa: newTotal, updatedAt: now },
        currentQuote.revision,
        async () => {
          await db.quotes.put(updatedQuote);
        },
        userId,
      );

      // 4. AuditMirror AFTER all applyLocalMutation
      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "quote.services_update",
        when: now,
        where: "/devis/nouveau",
        entityType: "quote",
        entityId: quoteId,
        before: {
          lineCount:
            deletedLineIds.length + lines.filter((l) => !l.isNew).length,
        },
        after: { lineCount: lines.length, totalFcfa: newTotal },
        createdAt: now,
        synced: false,
      });

      void triggerSync();
      useWizardStore.getState().setStep(5);
    } catch {
      setGlobalError(t("errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-3 px-5 pb-6 pt-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-border" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 pb-6">
      <h2 className="font-serif text-xl font-semibold text-text-primary">{t("heading")}</h2>

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
            <div className="absolute top-10 left-0 z-10 w-64 rounded-xl border border-border bg-surface shadow-lg">
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="flex w-full flex-col px-4 py-3 text-left hover:bg-surface first:rounded-t-xl last:rounded-b-xl border-b border-border last:border-b-0"
                >
                  <span className="text-sm font-semibold text-text-primary">{tpl.nom}</span>
                  <span className="text-xs text-text-muted">
                    {t("lineCount", { count: tpl.lines.length })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {parsedLines.map((pl) => (
            <SortableLineRow
              key={pl.id}
              line={pl}
              errors={errors[pl.id] ?? {}}
              onUpdate={updateLine}
              onRemove={removeLine}
              isOnly={lines.length === 1}
              isPending={isPending}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add line button */}
      <button
        type="button"
        onClick={addLine}
        disabled={isPending}
        className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm text-text-secondary hover:bg-surface disabled:opacity-60"
      >
        + {t("addLine")}
      </button>

      {/* Quote total live region */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="mt-4 rounded-xl border border-border bg-surface p-4"
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("quoteTotalLabel")}
        </p>
        <p className="font-serif text-2xl font-semibold text-brand-navy">
          {formatFcfa(quoteTotal)}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          {t("quoteTotalCaption", { count: lines.length })}
        </p>
      </div>

      {globalError && (
        <p role="alert" className="text-xs text-destructive">
          {globalError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep(3)}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
        >
          {tW("previous")}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
        >
          {isPending ? t("saving") : tW("next")}
        </button>
      </div>
    </div>
  );
}
