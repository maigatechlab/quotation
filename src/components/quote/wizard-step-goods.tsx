"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  computeCamions,
  computeValeurMarchandise,
  MIN_TONNAGE,
  MAX_TONNAGE,
  MIN_CAPACITY,
  MAX_CAPACITY,
  MIN_PRICE,
  MAX_PRICE,
  MIN_RATE,
  CalcError,
} from "@/lib/calc";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";
import { formatFcfa } from "@/lib/money";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { useWizardStore } from "@/stores/wizard-store";

const CURRENCIES = [
  { code: "XOF", label: "FCFA (XOF)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "Dollar US (USD)" },
  { code: "NGN", label: "Naira (NGN)" },
];

interface WizardStepGoodsProps {
  userId: string;
}

export function WizardStepGoods({ userId }: WizardStepGoodsProps) {
  const t = useTranslations("devis.wizard.marchandise");
  const tW = useTranslations("devis.wizard");
  const { quoteId, setStep } = useWizardStore();

  const [goodsNature, setGoodsNature] = useState("");
  const [tonnage, setTonnage] = useState("");
  const [truckCapacity, setTruckCapacity] = useState("");
  const [truckCountOverride, setTruckCountOverride] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [sourceCurrency, setSourceCurrency] = useState("XOF");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);

  // Live-derived calculations — inline in render body, no useEffect needed
  const parsedTonnage = parseFloat(tonnage);
  const parsedCapacity = parseFloat(truckCapacity);
  const hasUnitPrice = unitPrice.trim().length > 0;
  const parsedPrice = hasUnitPrice ? parseFloat(unitPrice) : 0;
  const parsedExchangeRate = exchangeRate.trim().length > 0 ? parseFloat(exchangeRate) : Number.NaN;
  const effectiveRate = sourceCurrency === "XOF" ? 1 : parsedExchangeRate;

  let computedTruckCount: number | null = null;
  let camionsError: string | null = null;
  if (Number.isFinite(parsedTonnage) && Number.isFinite(parsedCapacity)) {
    try {
      computedTruckCount = computeCamions(parsedTonnage, parsedCapacity);
    } catch (e) {
      camionsError = e instanceof CalcError ? e.message : t("calcError");
    }
  }
  const hasTruckCountOverride = truckCountOverride.trim().length > 0;
  const parsedTruckCountOverride = hasTruckCountOverride
    ? Number(truckCountOverride)
    : null;
  const validTruckCountOverride =
    parsedTruckCountOverride != null &&
    Number.isInteger(parsedTruckCountOverride) &&
    parsedTruckCountOverride >= 1
      ? parsedTruckCountOverride
      : null;
  const effectiveTruckCount = validTruckCountOverride ?? computedTruckCount;

  let computedGoodsValue: number | null = null;
  let valeurError: string | null = null;
  if (hasUnitPrice && Number.isFinite(parsedTonnage) && Number.isFinite(parsedPrice) && Number.isFinite(effectiveRate)) {
    try {
      computedGoodsValue = computeValeurMarchandise(parsedTonnage, parsedPrice, effectiveRate);
    } catch (e) {
      valeurError = e instanceof CalcError ? e.message : t("calcError");
    }
  }

  async function handleNext() {
    setErrors({});

    if (!goodsNature.trim()) {
      setErrors({ goodsNature: t("goodsNatureRequired") });
      return;
    }
    if (!tonnage.trim()) {
      setErrors({ tonnage: t("tonnageRequired") });
      return;
    }
    if (!Number.isFinite(parsedTonnage) || parsedTonnage < MIN_TONNAGE || parsedTonnage > MAX_TONNAGE) {
      setErrors({ tonnage: `Tonnage invalide (${MIN_TONNAGE}–${MAX_TONNAGE} t)` });
      return;
    }
    if (!truckCapacity.trim()) {
      setErrors({ truckCapacity: t("truckCapacityRequired") });
      return;
    }
    if (!Number.isFinite(parsedCapacity) || parsedCapacity < MIN_CAPACITY || parsedCapacity > MAX_CAPACITY) {
      setErrors({ truckCapacity: `Capacité invalide (${MIN_CAPACITY}–${MAX_CAPACITY} t)` });
      return;
    }
    if (camionsError) {
      setErrors({ truckCapacity: camionsError });
      return;
    }
    if (hasTruckCountOverride && validTruckCountOverride == null) {
      setErrors({ truckCountOverride: "La surcharge doit etre un entier superieur ou egal a 1" });
      return;
    }
    if (hasUnitPrice && (!Number.isFinite(parsedPrice) || parsedPrice < MIN_PRICE || parsedPrice > MAX_PRICE)) {
      setErrors({ unitPrice: `Prix invalide (0-${MAX_PRICE})` });
      return;
    }
    if (hasUnitPrice && !Number.isInteger(parsedPrice)) {
      setErrors({ unitPrice: "Le prix unitaire doit etre un entier" });
      return;
    }
    if (sourceCurrency !== "XOF" && (!Number.isFinite(effectiveRate) || effectiveRate < MIN_RATE)) {
      setErrors({ exchangeRate: `Taux invalide (min ${MIN_RATE})` });
      return;
    }
    if (valeurError) {
      setErrors({ unitPrice: valeurError });
      return;
    }
    if (!quoteId) {
      setErrors({ global: t("errorNoQuote") });
      return;
    }

    setIsPending(true);
    try {
      const current = await db.quotes.get(quoteId);
      if (!current) throw new Error("Devis introuvable dans Dexie");
      const now = new Date().toISOString();

      const updatedQuote: QuoteLocal = {
        ...current,
        goodsNature: goodsNature.trim(),
        tonnage: parsedTonnage,
        truckCapacity: parsedCapacity,
        unitPrice: parsedPrice,
        sourceCurrency,
        exchangeRate: effectiveRate,
        updatedAt: now,
      };
      if (effectiveTruckCount == null) {
        delete updatedQuote.truckCount;
      } else {
        updatedQuote.truckCount = effectiveTruckCount;
      }
      if (computedGoodsValue == null) {
        delete updatedQuote.goodsValueFcfa;
      } else {
        updatedQuote.goodsValueFcfa = computedGoodsValue;
      }

      const payload: Record<string, unknown> = {
        ...current,
        goodsNature: goodsNature.trim(),
        tonnage: parsedTonnage,
        truckCapacity: parsedCapacity,
        truckCount: effectiveTruckCount ?? null,
        unitPrice: parsedPrice,
        sourceCurrency,
        exchangeRate: effectiveRate,
        goodsValueFcfa: computedGoodsValue ?? null,
        updatedAt: now,
      };

      await applyLocalMutation(
        "quote",
        quoteId,
        "update",
        payload,
        current.revision,
        async () => {
          await db.quotes.put(updatedQuote);
        },
        userId,
      );

      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "quote.goods_update",
        when: now,
        where: "/devis/nouveau",
        entityType: "quote",
        entityId: quoteId,
        before: {
          goodsNature: current.goodsNature,
          tonnage: current.tonnage,
          truckCapacity: current.truckCapacity,
          unitPrice: current.unitPrice,
          sourceCurrency: current.sourceCurrency,
          exchangeRate: current.exchangeRate,
        },
        after: {
          goodsNature: goodsNature.trim(),
          tonnage: parsedTonnage,
          truckCapacity: parsedCapacity,
          truckCount: effectiveTruckCount,
          unitPrice: parsedPrice,
          sourceCurrency,
          exchangeRate: effectiveRate,
          goodsValueFcfa: computedGoodsValue,
        },
        createdAt: now,
        synced: false,
      });

      void triggerSync();
      useWizardStore.getState().setStep(4);
    } catch {
      setErrors({ global: t("errorGeneric") });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6 px-5 pb-6">
      <h2 className="font-serif text-xl font-semibold text-text-primary">
        {t("heading")}
      </h2>

      {/* Goods nature */}
      <div className="space-y-1.5">
        <label htmlFor="goods-nature" className="text-xs font-semibold text-text-muted">
          {t("goodsNatureLabel")} *
        </label>
        <input
          id="goods-nature"
          type="text"
          value={goodsNature}
          onChange={(e) => setGoodsNature(e.target.value)}
          placeholder={t("goodsNaturePlaceholder")}
          disabled={isPending}
          aria-describedby={errors.goodsNature ? "goods-nature-error" : undefined}
          aria-invalid={!!errors.goodsNature}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
        />
        {errors.goodsNature && (
          <p id="goods-nature-error" role="alert" className="text-xs text-destructive">
            {errors.goodsNature}
          </p>
        )}
      </div>

      {/* Tonnage + Capacity */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="tonnage" className="text-xs font-semibold text-text-muted">
            {t("tonnageLabel")} *
          </label>
          <input
            id="tonnage"
            type="number"
            min={MIN_TONNAGE}
            max={MAX_TONNAGE}
            step="0.1"
            value={tonnage}
            onChange={(e) => setTonnage(e.target.value)}
            placeholder={t("tonnagePlaceholder")}
            disabled={isPending}
            aria-describedby={errors.tonnage ? "tonnage-error" : undefined}
            aria-invalid={!!errors.tonnage}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors.tonnage && (
            <p id="tonnage-error" role="alert" className="text-xs text-destructive">
              {errors.tonnage}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="truck-capacity" className="text-xs font-semibold text-text-muted">
            {t("truckCapacityLabel")} *
          </label>
          <input
            id="truck-capacity"
            type="number"
            min={MIN_CAPACITY}
            max={MAX_CAPACITY}
            step="1"
            value={truckCapacity}
            onChange={(e) => setTruckCapacity(e.target.value)}
            placeholder={t("truckCapacityPlaceholder")}
            disabled={isPending}
            aria-describedby={errors.truckCapacity ? "truck-capacity-error" : undefined}
            aria-invalid={!!errors.truckCapacity}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors.truckCapacity && (
            <p id="truck-capacity-error" role="alert" className="text-xs text-destructive">
              {errors.truckCapacity}
            </p>
          )}
        </div>
      </div>

      {/* Truck count live result card */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("truckCountLabel")}
        </p>
        {camionsError ? (
          <p className="text-sm text-destructive">{camionsError}</p>
        ) : computedTruckCount !== null ? (
          <p className="font-serif text-2xl font-semibold text-brand-navy">
            {effectiveTruckCount ?? computedTruckCount}
            <span className="ml-2 font-sans text-xs text-text-muted">
              ⌈{tonnage || "?"} / {truckCapacity || "?"}⌉
            </span>
          </p>
        ) : (
          <p className="text-sm text-text-muted">{t("enterTonnageAndCapacity")}</p>
        )}
      </div>

      {/* Truck count override */}
      <div className="space-y-1.5">
        <label htmlFor="truck-count-override" className="text-xs font-semibold text-text-muted">
          {t("truckCountOverrideLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="truck-count-override"
            type="number"
            min="1"
            step="1"
            value={truckCountOverride}
            onChange={(e) => setTruckCountOverride(e.target.value)}
            placeholder={computedTruckCount != null ? String(computedTruckCount) : "—"}
            disabled={isPending}
            aria-describedby={errors.truckCountOverride ? "truck-count-override-error" : undefined}
            aria-invalid={!!errors.truckCountOverride}
            className="h-10 w-24 rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {truckCountOverride && (
            <button
              type="button"
              onClick={() => setTruckCountOverride("")}
              className="text-xs text-text-secondary underline"
            >
              {t("resetOverride")}
            </button>
          )}
        </div>
        {errors.truckCountOverride && (
          <p id="truck-count-override-error" role="alert" className="text-xs text-destructive">
            {errors.truckCountOverride}
          </p>
        )}
      </div>

      {/* Unit price + currency */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="unit-price" className="text-xs font-semibold text-text-muted">
            {t("unitPriceLabel")}
          </label>
          <input
            id="unit-price"
            type="number"
            min="0"
            step="1"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder={t("unitPricePlaceholder")}
            disabled={isPending}
            aria-describedby={errors.unitPrice ? "unit-price-error" : undefined}
            aria-invalid={!!errors.unitPrice}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors.unitPrice && (
            <p id="unit-price-error" role="alert" className="text-xs text-destructive">
              {errors.unitPrice}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="source-currency" className="text-xs font-semibold text-text-muted">
            {t("sourceCurrencyLabel")}
          </label>
          <select
            id="source-currency"
            value={sourceCurrency}
            onChange={(e) => setSourceCurrency(e.target.value)}
            disabled={isPending}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Exchange rate — shown only when currency ≠ XOF */}
      {sourceCurrency !== "XOF" && (
        <div className="space-y-1.5">
          <label htmlFor="exchange-rate" className="text-xs font-semibold text-text-muted">
            {t("exchangeRateLabel")}
          </label>
          <input
            id="exchange-rate"
            type="number"
            min={MIN_RATE}
            step="0.001"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
            placeholder={t("exchangeRatePlaceholder")}
            disabled={isPending}
            aria-describedby={errors.exchangeRate ? "exchange-rate-error" : undefined}
            aria-invalid={!!errors.exchangeRate}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
          />
          {errors.exchangeRate && (
            <p id="exchange-rate-error" role="alert" className="text-xs text-destructive">
              {errors.exchangeRate}
            </p>
          )}
        </div>
      )}

      {/* Goods value live result card */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="rounded-xl border border-border bg-surface p-4"
      >
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("goodsValueLabel")}
        </p>
        {valeurError ? (
          <p className="text-sm text-destructive">{valeurError}</p>
        ) : computedGoodsValue !== null ? (
          <div>
            <p className="font-serif text-2xl font-semibold text-brand-navy">
              {formatFcfa(computedGoodsValue)}
            </p>
            {sourceCurrency !== "XOF" && Number.isFinite(parsedPrice) && (
              <p className="mt-0.5 text-xs text-text-muted">
                {parsedPrice.toLocaleString("fr-FR")} {sourceCurrency} × {effectiveRate} FCFA
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted">{t("enterPriceAndTonnage")}</p>
        )}
      </div>

      {errors.global && (
        <p role="alert" className="text-xs text-destructive">
          {errors.global}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep(2)}
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
