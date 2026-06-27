"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { db } from "@/lib/local-db";
import type { QuoteLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { useWizardStore } from "@/stores/wizard-store";

interface Corridor {
  label: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
}

const CORRIDORS: Corridor[] = [
  { label: "Niamey → Ouagadougou", originCountry: "NE", originCity: "Niamey", destinationCountry: "BF", destinationCity: "Ouagadougou" },
  { label: "Niamey → Bamako",      originCountry: "NE", originCity: "Niamey", destinationCountry: "ML", destinationCity: "Bamako" },
  { label: "Niamey → Cotonou",     originCountry: "NE", originCity: "Niamey", destinationCountry: "BJ", destinationCity: "Cotonou" },
  { label: "Niamey → Lagos",       originCountry: "NE", originCity: "Niamey", destinationCountry: "NG", destinationCity: "Lagos" },
  { label: "Niamey → Lomé",        originCountry: "NE", originCity: "Niamey", destinationCountry: "TG", destinationCity: "Lomé" },
  { label: "Niamey → Agadez",      originCountry: "NE", originCity: "Niamey", destinationCountry: "NE", destinationCity: "Agadez" },
  { label: "Niamey → Zinder",      originCountry: "NE", originCity: "Niamey", destinationCountry: "NE", destinationCity: "Zinder" },
  { label: "Agadez → Niamey",      originCountry: "NE", originCity: "Agadez", destinationCountry: "NE", destinationCity: "Niamey" },
  { label: "Zinder → Niamey",      originCountry: "NE", originCity: "Zinder", destinationCountry: "NE", destinationCity: "Niamey" },
];

interface Country {
  code: string;
  label: string;
}

const COUNTRIES: Country[] = [
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

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  NE: ["Niamey", "Agadez", "Zinder", "Maradi", "Tahoua", "Dosso", "Diffa", "Tillabéri"],
  BF: ["Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Banfora", "Dori"],
  ML: ["Bamako", "Mopti", "Sikasso", "Gao", "Kayes", "Tombouctou"],
  NG: ["Lagos", "Kano", "Abuja", "Kaduna", "Maiduguri", "Sokoto"],
  BJ: ["Cotonou", "Porto-Novo", "Parakou", "Natitingou"],
  TG: ["Lomé", "Sokodé", "Kpalimé", "Atakpamé"],
  CI: ["Abidjan", "Bouaké", "Yamoussoukro", "Korhogo"],
  GH: ["Accra", "Kumasi", "Tamale", "Takoradi"],
  SN: ["Dakar", "Thiès", "Kaolack", "Ziguinchor"],
};

interface WizardStepRouteProps {
  userId: string;
}

export function WizardStepRoute({ userId }: WizardStepRouteProps) {
  const t = useTranslations("devis.wizard.trajet");
  const tW = useTranslations("devis.wizard");
  const { quoteId, setStep } = useWizardStore();
  const [selectedCorridorIdx, setSelectedCorridorIdx] = useState<number | null>(null);
  const [originCountry, setOriginCountry] = useState("NE");
  const [originCity, setOriginCity] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("NE");
  const [destinationCity, setDestinationCity] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [isPending, setIsPending] = useState(false);

  function handleCorridorSelect(idx: number) {
    const corridor = CORRIDORS[idx];
    if (!corridor) return;
    setOriginCountry(corridor.originCountry);
    setOriginCity(corridor.originCity);
    setDestinationCountry(corridor.destinationCountry);
    setDestinationCity(corridor.destinationCity);
    setSelectedCorridorIdx(idx);
    setErrors({});
  }

  function handleOriginCountryChange(code: string) {
    setOriginCountry(code);
    setOriginCity("");
    setSelectedCorridorIdx(null);
  }

  function handleDestinationCountryChange(code: string) {
    setDestinationCountry(code);
    setDestinationCity("");
    setSelectedCorridorIdx(null);
  }

  function handleOriginCityChange(v: string) {
    setOriginCity(v);
    setSelectedCorridorIdx(null);
  }

  function handleDestinationCityChange(v: string) {
    setDestinationCity(v);
    setSelectedCorridorIdx(null);
  }

  async function handleNext() {
    setErrors({});
    if (!originCity.trim()) {
      setErrors({ originCity: t("originCityRequired") });
      return;
    }
    if (!destinationCity.trim()) {
      setErrors({ destinationCity: t("destinationCityRequired") });
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
        originCountry,
        originCity: originCity.trim(),
        destinationCountry,
        destinationCity: destinationCity.trim(),
        updatedAt: now,
      };
      const payload: Record<string, unknown> = {
        ...current,
        originCountry,
        originCity: originCity.trim(),
        destinationCountry,
        destinationCity: destinationCity.trim(),
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
        what: "quote.route_update",
        when: now,
        where: "/devis/nouveau",
        entityType: "quote",
        entityId: quoteId,
        before: {
          originCountry: current.originCountry,
          originCity: current.originCity,
          destinationCountry: current.destinationCountry,
          destinationCity: current.destinationCity,
        },
        after: {
          originCountry,
          originCity: originCity.trim(),
          destinationCountry,
          destinationCity: destinationCity.trim(),
        },
        createdAt: now,
        synced: false,
      });
      void triggerSync();
      useWizardStore.getState().setStep(3);
    } catch {
      setErrors({ global: t("errorGeneric") });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-6 px-5 pb-6">
      {/* Step heading */}
      <h2 className="font-serif text-xl font-semibold text-text-primary">
        {t("heading")}
      </h2>

      {/* Corridors chips */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t("corridors")}
        </p>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {CORRIDORS.map((corridor, idx) => (
            <button
              key={corridor.label}
              type="button"
              aria-pressed={selectedCorridorIdx === idx}
              onClick={() => handleCorridorSelect(idx)}
              className={
                selectedCorridorIdx === idx
                  ? "shrink-0 rounded-[20px] bg-brand-navy px-4 py-2 text-sm font-medium text-text-on-dark"
                  : "shrink-0 rounded-[20px] border border-border-input bg-surface px-4 py-2 text-sm font-medium text-text-secondary"
              }
            >
              {corridor.label}
            </button>
          ))}
        </div>
      </div>

      {/* Manual form */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="origin-country" className="text-xs font-semibold text-text-muted">
              {t("originCountryLabel")}
            </label>
            <select
              id="origin-country"
              value={originCountry}
              onChange={(e) => handleOriginCountryChange(e.target.value)}
              disabled={isPending}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="origin-city" className="text-xs font-semibold text-text-muted">
              {t("originCityLabel")} *
            </label>
            <input
              id="origin-city"
              list="origin-cities-list"
              value={originCity}
              onChange={(e) => handleOriginCityChange(e.target.value)}
              placeholder={t("originCityPlaceholder")}
              disabled={isPending}
              aria-describedby={errors.originCity ? "origin-city-error" : undefined}
              aria-invalid={!!errors.originCity}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
            />
            <datalist id="origin-cities-list">
              {(CITIES_BY_COUNTRY[originCountry] ?? []).map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
            {errors.originCity && (
              <p id="origin-city-error" role="alert" className="text-xs text-destructive">
                {errors.originCity}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="dest-country" className="text-xs font-semibold text-text-muted">
              {t("destinationCountryLabel")}
            </label>
            <select
              id="dest-country"
              value={destinationCountry}
              onChange={(e) => handleDestinationCountryChange(e.target.value)}
              disabled={isPending}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dest-city" className="text-xs font-semibold text-text-muted">
              {t("destinationCityLabel")} *
            </label>
            <input
              id="dest-city"
              list="dest-cities-list"
              value={destinationCity}
              onChange={(e) => handleDestinationCityChange(e.target.value)}
              placeholder={t("destinationCityPlaceholder")}
              disabled={isPending}
              aria-describedby={errors.destinationCity ? "dest-city-error" : undefined}
              aria-invalid={!!errors.destinationCity}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted"
            />
            <datalist id="dest-cities-list">
              {(CITIES_BY_COUNTRY[destinationCountry] ?? []).map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
            {errors.destinationCity && (
              <p id="dest-city-error" role="alert" className="text-xs text-destructive">
                {errors.destinationCity}
              </p>
            )}
          </div>
        </div>
      </div>

      {errors.global && (
        <p role="alert" className="text-xs text-destructive">
          {errors.global}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep(1)}
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
