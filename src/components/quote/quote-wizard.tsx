"use client";

import { useEffect } from "react";
import { useLiveCompany } from "@/hooks/use-live-company";
import { useWizardStore } from "@/stores/wizard-store";
import { WizardStepClient } from "./wizard-step-client";
import { WizardStepConditions } from "./wizard-step-conditions";
import { WizardStepGoods } from "./wizard-step-goods";
import { WizardStepRoute } from "./wizard-step-route";
import { WizardStepServices } from "./wizard-step-services";

const STEP_LABELS = ["Client", "Trajet", "Marchandise", "Prestations", "Conditions"];
const TOTAL_STEPS = 5;

interface QuoteWizardProps {
  userId: string;
}

export function QuoteWizard({ userId }: QuoteWizardProps) {
  const { step, resetWizard } = useWizardStore();
  const company = useLiveCompany();

  useEffect(() => {
    resetWizard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.round((step / TOTAL_STEPS) * 100);
  const currentLabel = STEP_LABELS[step - 1] ?? "";

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Devis
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary">
          Nouveau devis
        </h1>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-text-secondary">
            Étape {step} sur {TOTAL_STEPS} — {currentLabel}
          </span>
          <span className="text-xs text-text-muted">{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progression du wizard: étape ${step} sur ${TOTAL_STEPS}`}
          className="h-2 w-full rounded-full bg-border"
        >
          <div
            className="h-2 rounded-full bg-brand-navy transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step labels */}
        <div className="mt-2 flex justify-between">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={`text-[10px] font-medium ${
                i + 1 === step
                  ? "text-brand-navy"
                  : i + 1 < step
                    ? "text-text-secondary"
                    : "text-text-muted"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Step content — defer until company loaded (undefined = still loading) */}
      {step === 1 && company !== undefined && (
        <WizardStepClient
          userId={userId}
          companyId={company?.id}
          defaultSignataireNom={company?.signataireNom}
          defaultSigFonction={company?.signataireFonction}
          defaultConditions={company?.conditionsPaiementDefaut}
        />
      )}
      {step === 1 && company === undefined && (
        <div className="px-5 py-4">
          <div className="h-10 animate-pulse rounded-xl bg-border" />
        </div>
      )}
      {step === 2 && <WizardStepRoute userId={userId} />}
      {step === 3 && <WizardStepGoods userId={userId} />}
      {step === 4 && <WizardStepServices userId={userId} />}
      {step === 5 && company !== undefined && company !== null && (
        <WizardStepConditions userId={userId} company={company} />
      )}
      {step === 5 && (company === undefined || company === null) && (
        <div className="px-5 py-4">
          <div className="h-10 animate-pulse rounded-xl bg-border" />
        </div>
      )}
    </div>
  );
}
