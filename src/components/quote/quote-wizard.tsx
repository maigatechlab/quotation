"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { BackLink } from "@/components/nav/back-link";
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
  const { step, setStep, resetWizard } = useWizardStore();
  const company = useLiveCompany();
  const router = useRouter();

  useEffect(() => {
    resetWizard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = Math.round((step / TOTAL_STEPS) * 100);
  const currentLabel = STEP_LABELS[step - 1] ?? "";

  return (
    <div className="flex flex-col lg:mx-auto lg:w-full lg:max-w-3xl">
      {/* Header */}
      <div className="px-5 pt-8 pb-4 lg:px-0 lg:pt-0">
        <BackLink
          label="Retour"
          onClick={() => (step === 1 ? router.push("/") : setStep(step - 1))}
        />
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Devis
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-text-primary lg:text-[27px]">
          Nouveau devis
        </h1>
      </div>

      {/* Progress bar — mobile uniquement (le stepper prend le relais à lg+) */}
      <div className="px-5 pb-4 lg:hidden">
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

      {/* Stepper desktop — cercles + connecteurs (design brief §4) */}
      <ol
        className="mb-7 mt-1 hidden items-start lg:flex"
        aria-label={`Progression du wizard: étape ${step} sur ${TOTAL_STEPS}`}
      >
        {STEP_LABELS.map((label, i) => {
          const num = i + 1;
          const isDone = num < step;
          const isCurrent = num === step;
          return (
            <li key={label} className="contents">
              {i > 0 && (
                <div
                  aria-hidden="true"
                  className={`mt-[14px] h-0.5 flex-1 ${isDone || isCurrent ? "bg-brand-navy" : "bg-border"}`}
                />
              )}
              <div className="flex w-[92px] shrink-0 flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => isDone && setStep(num)}
                  disabled={!isDone}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-[13px] font-bold transition-colors ${
                    isCurrent
                      ? "bg-brand-navy text-text-on-dark ring-4 ring-surface-tint-navy"
                      : isDone
                        ? "cursor-pointer bg-brand-navy text-text-on-dark"
                        : "border-[1.5px] border-border bg-surface font-semibold text-text-muted"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    num
                  )}
                </button>
                <span
                  className={`text-center text-xs ${
                    isCurrent
                      ? "font-semibold text-brand-navy"
                      : isDone
                        ? "font-medium text-text-secondary"
                        : "font-medium text-text-muted"
                  }`}
                >
                  {label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

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
