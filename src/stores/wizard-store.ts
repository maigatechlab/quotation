import { create } from "zustand";

interface WizardState {
  step: number;
  quoteId: string | null;
  setStep: (step: number) => void;
  setQuoteId: (id: string) => void;
  resetWizard: () => void;
}

export const useWizardStore = create<WizardState>()((set) => ({
  step: 1,
  quoteId: null,
  setStep: (step) => set({ step }),
  setQuoteId: (quoteId) => set({ quoteId }),
  resetWizard: () => set({ step: 1, quoteId: null }),
}));
