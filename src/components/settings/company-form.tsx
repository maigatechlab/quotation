"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveCompany } from "@/hooks/use-live-company";
import { db } from "@/lib/local-db";
import type { CompanyLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { companySchema } from "@/lib/validation/company";

interface CompanyFormProps {
  company: CompanyLocal | null;
  canEdit: boolean;
  userId: string;
  companyId: string | null;
}

type FieldErrors = Partial<Record<string, string>>;

const FORME_JURIDIQUE_OPTIONS = ["SARL", "SA", "SAS", "SUNE", "EI", "Autre"];

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-text-muted">{label}</p>
      <p className="text-sm text-text-primary">{value}</p>
    </div>
  );
}

/**
 * Exported wrapper — subscribes to Dexie via useLiveCompany and re-mounts the
 * inner form whenever the company's id or revision changes. This ensures that
 * after a background sync pull the inner form's controlled-field state is always
 * in sync with the latest Dexie record (React remount resets useState to the new
 * company prop), without calling setState inside a useEffect.
 */
export function CompanyForm(props: CompanyFormProps) {
  const liveCompany = useLiveCompany();
  // undefined = Dexie still loading → fall back to SSR prop
  // null      = Dexie confirmed no company → fall back to SSR prop (SSR seed wins over empty Dexie)
  // CompanyLocal = Dexie has company → use it
  const effectiveCompany: CompanyLocal | null =
    liveCompany !== undefined
      ? (liveCompany ?? props.company)
      : props.company;

  // Derive companyId from Dexie record after bootstrap so SSR-stale prop doesn't cause 409
  const effectiveCompanyId = effectiveCompany?.id ?? props.companyId;

  const formKey = effectiveCompany
    ? `${effectiveCompany.id}:${effectiveCompany.revision}`
    : "bootstrap";

  return <CompanyFormInner key={formKey} {...props} company={effectiveCompany} companyId={effectiveCompanyId} />;
}

/** Inner form — pure, controlled by props at mount time. Re-keyed by wrapper on revision change. */
function CompanyFormInner({ company, canEdit, userId, companyId }: CompanyFormProps) {
  const router = useRouter();

  const [raisonSociale, setRaisonSociale] = useState(company?.raisonSociale ?? "");
  const [formeJuridique, setFormeJuridique] = useState(company?.formeJuridique ?? "");
  const [capital, setCapital] = useState(company?.capital != null ? String(company.capital) : "");
  const [rccm, setRccm] = useState(company?.rccm ?? "");
  const [nif, setNif] = useState(company?.nif ?? "");
  const [adresse, setAdresse] = useState(company?.adresse ?? "");
  const [bp, setBp] = useState(company?.bp ?? "");
  const [phones, setPhones] = useState<string[]>(
    company?.phones?.length ? company.phones : [""]
  );
  const [emails, setEmails] = useState<string[]>(company?.emails ?? []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isPending, setIsPending] = useState(false);

  function addPhone() {
    setPhones((prev) => [...prev, ""]);
  }

  function removePhone(idx: number) {
    setPhones((prev) => prev.filter((_, i) => i !== idx));
  }

  function setPhone(idx: number, val: string) {
    setPhones((prev) => prev.map((p, i) => (i === idx ? val : p)));
  }

  function addEmail() {
    setEmails((prev) => [...prev, ""]);
  }

  function removeEmail(idx: number) {
    setEmails((prev) => prev.filter((_, i) => i !== idx));
  }

  function setEmail(idx: number, val: string) {
    setEmails((prev) => prev.map((e, i) => (i === idx ? val : e)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const raw = {
      raisonSociale: raisonSociale.trim(),
      formeJuridique: formeJuridique.trim() || undefined,
      capital: capital !== "" ? Math.round(Number(capital)) : undefined,
      rccm: rccm.trim().toUpperCase(),
      nif: nif.trim(),
      adresse: adresse.trim() || undefined,
      bp: bp.trim() || undefined,
      phones: phones.map((p) => p.trim()).filter(Boolean),
      emails: emails.map((e) => e.trim()).filter(Boolean),
    };

    const parsed = companySchema.safeParse(raw);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldErrors: FieldErrors = {};
      for (const [key, msgs] of Object.entries(flat.fieldErrors)) {
        const msgArr = msgs as string[] | undefined;
        if (msgArr && msgArr.length > 0) fieldErrors[key] = msgArr[0];
      }
      if (flat.formErrors.length > 0) {
        fieldErrors._form = flat.formErrors[0];
      }
      setErrors(fieldErrors);
      return;
    }

    const data = parsed.data;
    setIsPending(true);

    try {
      if (company && companyId) {
        // UPDATE — via applyLocalMutation (offline-capable).
        // `company` here is the value at mount time — the wrapper re-keys on revision
        // change, so this is always the latest revision when the form was last mounted.
        const payload: Record<string, unknown> = {
          raisonSociale: data.raisonSociale,
          rccm: data.rccm,
          nif: data.nif,
          phones: data.phones,
          emails: data.emails ?? [],
          // Preserve fields managed by other stories
          logoUrl: company.logoUrl ?? null,
          signataireNom: company.signataireNom ?? null,
          signataireFonction: company.signataireFonction ?? null,
          conditionsPaiementDefaut: company.conditionsPaiementDefaut ?? null,
          companyId: company.companyId ?? null,
          pays: company.pays,
          updatedAt: new Date().toISOString(),
          createdAt: company.createdAt,
          ...(data.formeJuridique !== undefined && { formeJuridique: data.formeJuridique }),
          ...(data.capital !== undefined && { capital: data.capital }),
          ...(data.adresse !== undefined && { adresse: data.adresse }),
          ...(data.bp !== undefined && { bp: data.bp }),
        };

        await applyLocalMutation(
          "company",
          company.id,
          "update",
          payload,
          company.revision,
          async () => {
            const putObj: CompanyLocal = {
              ...company,
              raisonSociale: data.raisonSociale,
              rccm: data.rccm,
              nif: data.nif,
              phones: data.phones,
              emails: data.emails ?? [],
              updatedAt: new Date().toISOString(),
              revision: company.revision + 1,
            };
            if (data.formeJuridique !== undefined) putObj.formeJuridique = data.formeJuridique;
            else delete putObj.formeJuridique;
            if (data.capital !== undefined) putObj.capital = data.capital;
            else delete putObj.capital;
            if (data.adresse !== undefined) putObj.adresse = data.adresse;
            else delete putObj.adresse;
            if (data.bp !== undefined) putObj.bp = data.bp;
            else delete putObj.bp;
            await db.company.put(putObj);
          },
          userId
        );

        void triggerSync();
        toast.success("Informations société enregistrées");
      } else {
        // BOOTSTRAP — POST direct (companyId null → sync push blocked)
        const res = await fetch("/api/v1/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raisonSociale: data.raisonSociale,
            rccm: data.rccm,
            nif: data.nif,
            phones: data.phones,
            emails: data.emails ?? [],
            ...(data.formeJuridique !== undefined && { formeJuridique: data.formeJuridique }),
            ...(data.capital !== undefined && { capital: data.capital }),
            ...(data.adresse !== undefined && { adresse: data.adresse }),
            ...(data.bp !== undefined && { bp: data.bp }),
          }),
        });

        if (!res.ok) {
          if (res.status === 409) {
            // Server already committed (network timeout on prior attempt) — refresh to sync state
            toast.success("Société déjà créée. Rechargement en cours…");
            router.refresh();
            return;
          }
          const body = (await res.json()) as { error?: { message?: string } };
          setErrors({ _form: body.error?.message ?? "Erreur lors de la création de la société." });
          return;
        }

        const created = (await res.json()) as CompanyLocal;
        const localEntry: CompanyLocal = {
          id: created.id,
          raisonSociale: created.raisonSociale,
          rccm: created.rccm,
          nif: created.nif,
          phones: created.phones ?? [],
          emails: created.emails ?? [],
          pays: created.pays ?? "NE",
          revision: created.revision,
          updatedAt: created.updatedAt,
          createdAt: created.createdAt,
        };
        if (created.formeJuridique !== undefined) localEntry.formeJuridique = created.formeJuridique;
        if (created.capital !== undefined) localEntry.capital = created.capital;
        if (created.adresse !== undefined) localEntry.adresse = created.adresse;
        if (created.bp !== undefined) localEntry.bp = created.bp;
        if (created.logoUrl !== undefined) localEntry.logoUrl = created.logoUrl;
        if (created.signataireNom !== undefined) localEntry.signataireNom = created.signataireNom;
        if (created.signataireFonction !== undefined) localEntry.signataireFonction = created.signataireFonction;
        if (created.conditionsPaiementDefaut !== undefined) localEntry.conditionsPaiementDefaut = created.conditionsPaiementDefaut;
        if (created.companyId !== undefined) localEntry.companyId = created.companyId;

        await db.company.put(localEntry);

        toast.success("Société créée. Synchronisation en cours…");
        router.refresh();
        void triggerSync();
      }
    } catch {
      setErrors({ _form: "Une erreur est survenue. Veuillez réessayer." });
    } finally {
      setIsPending(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-text-muted italic">
          Vous n&apos;avez pas les droits pour modifier ces informations.
        </p>
        <ReadOnlyField label="Raison sociale" value={company?.raisonSociale} />
        <ReadOnlyField label="Forme juridique" value={company?.formeJuridique} />
        <ReadOnlyField
          label="Capital social (FCFA)"
          value={company?.capital != null ? company.capital.toLocaleString("fr-FR") : undefined}
        />
        <ReadOnlyField label="RCCM" value={company?.rccm} />
        <ReadOnlyField label="NIF" value={company?.nif} />
        <ReadOnlyField label="Adresse" value={company?.adresse} />
        <ReadOnlyField label="Boîte postale" value={company?.bp} />
        <ReadOnlyField label="Téléphones" value={company?.phones?.join(" · ")} />
        <ReadOnlyField label="Emails" value={company?.emails?.join(" · ")} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Formulaire infos société" noValidate>
      {/* Raison sociale */}
      <div className="space-y-1.5">
        <Label htmlFor="raisonSociale" className="text-xs font-semibold text-text-muted">
          Raison sociale <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="raisonSociale"
          value={raisonSociale}
          onChange={(e) => setRaisonSociale(e.target.value)}
          disabled={isPending}
          aria-required="true"
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: Maiga Transport SARL"
        />
        <FieldError message={errors.raisonSociale} />
      </div>

      {/* Forme juridique */}
      <div className="space-y-1.5">
        <Label htmlFor="formeJuridique" className="text-xs font-semibold text-text-muted">
          Forme juridique
        </Label>
        <select
          id="formeJuridique"
          value={formeJuridique}
          onChange={(e) => setFormeJuridique(e.target.value)}
          disabled={isPending}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">— Sélectionner —</option>
          {FORME_JURIDIQUE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* Capital */}
      <div className="space-y-1.5">
        <Label htmlFor="capital" className="text-xs font-semibold text-text-muted">
          Capital social (FCFA)
        </Label>
        <Input
          id="capital"
          type="number"
          min={0}
          step={1}
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          disabled={isPending}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: 1000000"
        />
        <FieldError message={errors.capital} />
      </div>

      {/* RCCM */}
      <div className="space-y-1.5">
        <Label htmlFor="rccm" className="text-xs font-semibold text-text-muted">
          RCCM <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="rccm"
          value={rccm}
          onChange={(e) => setRccm(e.target.value)}
          disabled={isPending}
          aria-required="true"
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: NE-NIA-2023-B-1234"
        />
        <FieldError message={errors.rccm} />
      </div>

      {/* NIF */}
      <div className="space-y-1.5">
        <Label htmlFor="nif" className="text-xs font-semibold text-text-muted">
          NIF <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="nif"
          value={nif}
          onChange={(e) => setNif(e.target.value)}
          disabled={isPending}
          aria-required="true"
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: 12345678"
        />
        <FieldError message={errors.nif} />
      </div>

      {/* Adresse */}
      <div className="space-y-1.5">
        <Label htmlFor="adresse" className="text-xs font-semibold text-text-muted">
          Adresse
        </Label>
        <Input
          id="adresse"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          disabled={isPending}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: Avenue de l'Indépendance, Niamey"
        />
      </div>

      {/* Boîte postale */}
      <div className="space-y-1.5">
        <Label htmlFor="bp" className="text-xs font-semibold text-text-muted">
          Boîte postale
        </Label>
        <Input
          id="bp"
          value={bp}
          onChange={(e) => setBp(e.target.value)}
          disabled={isPending}
          className="rounded-xl border-input bg-surface"
          placeholder="Ex: BP 1234"
        />
      </div>

      {/* Téléphones */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-text-muted">
          Téléphones <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <div className="space-y-2">
          {phones.map((phone, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => setPhone(idx, e.target.value)}
                disabled={isPending}
                placeholder="Ex: +227 90 00 00 00"
                className="rounded-xl border-input bg-surface"
                aria-label={`Téléphone ${idx + 1}`}
              />
              {phones.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePhone(idx)}
                  disabled={isPending}
                  aria-label={`Supprimer téléphone ${idx + 1}`}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt hover:text-destructive transition-colors"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>
        <FieldError message={errors.phones} />
        <button
          type="button"
          onClick={addPhone}
          disabled={isPending}
          className="mt-1 flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:underline"
        >
          <Plus size={14} aria-hidden="true" />
          Ajouter un téléphone
        </button>
      </div>

      {/* Emails */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-text-muted">
          Emails
        </Label>
        <div className="space-y-2">
          {emails.map((email, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(idx, e.target.value)}
                disabled={isPending}
                placeholder="Ex: contact@entreprise.ne"
                className="rounded-xl border-input bg-surface"
                aria-label={`Email ${idx + 1}`}
              />
              <button
                type="button"
                onClick={() => removeEmail(idx)}
                disabled={isPending}
                aria-label={`Supprimer email ${idx + 1}`}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-border text-text-muted hover:bg-surface-alt hover:text-destructive transition-colors"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <FieldError message={errors.emails} />
        <button
          type="button"
          onClick={addEmail}
          disabled={isPending}
          className="mt-1 flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:underline"
        >
          <Plus size={14} aria-hidden="true" />
          Ajouter un email
        </button>
      </div>

      {/* Erreur globale */}
      {errors._form && (
        <p role="alert" className="text-sm text-destructive">
          {errors._form}
        </p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="h-11 w-full rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep"
      >
        {isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
