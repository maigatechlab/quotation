"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useLiveClauses } from "@/hooks/use-live-clauses";
import { db } from "@/lib/local-db";
import type { CompanyLocal, QuoteClauseLocal } from "@/lib/local-db";
import { applyLocalMutation, triggerSync } from "@/lib/sync/outbox";
import { useWizardStore } from "@/stores/wizard-store";

interface WizardStepConditionsProps {
  userId: string;
  company: CompanyLocal;
}

/**
 * Sentinelle utilisée dans `clauseOrder` pour représenter la clause spécifique
 * (texte libre). Les IDs réels étant des UUIDs, ce marqueur ne peut jamais
 * collisionner avec un `clauseId` existant (Dev Notes — CRITIQUE).
 */
const SPECIFIC_CLAUSE_KEY = "__specific__";

/**
 * Étape 5 du wizard de création de devis — Conditions de paiement + clauses.
 *
 * Conditions de paiement (Story 3.6) :
 *  - pré-remplit depuis `QuoteLocal.conditionsPaiement`, à défaut depuis
 *    `CompanyLocal.conditionsPaiementDefaut` ;
 *  - persistées via `applyLocalMutation("quote", ...)` (offline-capable).
 *
 * Clauses contractuelles (Story 3.8 / FR-27 + FR-28) :
 *  - sélection multi-checkbox de clauses standards issues de `db.clauses`
 *    (UX-DR11, groupées par catégorie) ;
 *  - clause spécifique (texte libre), avec option « Enregistrer comme modèle »
 *    qui crée une nouvelle clause dans `db.clauses` via `applyLocalMutation` ;
 *  - réordonnancement ↑/↓ avant persistance (MVP-0, pas de drag & drop) ;
 *  - au clic sur « Terminer », chaque clause sélectionnée est figée comme un
 *    snapshot `QuoteClauseLocal` dans `db.quoteClauses` (indépendant des
 *    modifications futures de la bibliothèque — AC2).
 *
 * Les `QuoteClauseLocal` sont local-only en MVP-0 (Dev Notes) ; elles seront
 * incluses au rendu PDF côté client et synchronisées au serveur dans une story
 * ultérieure.
 */
export function WizardStepConditions({ userId, company }: WizardStepConditionsProps) {
  const t = useTranslations("devis.wizard.conditions");
  const tW = useTranslations("devis.wizard");
  const router = useRouter();
  const { quoteId, setStep, resetWizard } = useWizardStore();

  const [conditions, setConditions] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // --- Clauses (Story 3.8) -------------------------------------------------
  const clauses = useLiveClauses();

  // Ordre de sélection : liste de `clauseId` ou de la sentinelle SPECIFIC_CLAUSE_KEY.
  const [clauseOrder, setClauseOrder] = useState<string[]>([]);
  // Pour distinguer clauses standards cochées vs clause spécifique ajoutée.
  const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set());
  const [specificClause, setSpecificClause] = useState("");
  const [hasSpecific, setHasSpecific] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);

  // Charge le devis courant depuis Dexie et pré-remplit :
  // QuoteLocal.conditionsPaiement en priorité, sinon CompanyLocal.conditionsPaiementDefaut.
  useEffect(() => {
    let cancelled = false;
    const fallback = company.conditionsPaiementDefaut ?? "";

    const load = async () => {
      try {
        if (!quoteId) {
          // Pas de devis courant → défaut société uniquement.
          if (!cancelled) setConditions(fallback);
          return;
        }
        const dbQuote = await db.quotes.get(quoteId);
        if (cancelled) return;
        if (dbQuote) {
          // Devis existant → conditions du devis (ou défaut société si vide)
          setConditions(dbQuote.conditionsPaiement ?? fallback);
        } else {
          // Devis absent → défaut société uniquement
          setConditions(fallback);
        }
      } catch {
        if (!cancelled) setConditions(fallback);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  // --- Helpers clauses -----------------------------------------------------

  /**
   * Ajoute/retire une clause standard de la sélection.
   * L'ordre suit l'ordre de clic (ajout en fin de `clauseOrder`).
   */
  function toggleClause(clauseId: string) {
    setSelectedClauseIds((prev) => {
      const next = new Set(prev);
      if (next.has(clauseId)) {
        next.delete(clauseId);
        setClauseOrder((order) => order.filter((k) => k !== clauseId));
      } else {
        next.add(clauseId);
        setClauseOrder((order) => [...order, clauseId]);
      }
      return next;
    });
  }

  /**
   * Ajoute la clause spécifique saisie à la sélection (après les standards).
   * Remplace toute clause spécifique précédemment ajoutée : une seule clause
   * spécifique est gérée à la fois en MVP-0.
   */
  function addSpecificClause() {
    const trimmed = specificClause.trim();
    if (!trimmed) return;
    setHasSpecific(true);
    setClauseOrder((order) => {
      const withoutSpecific = order.filter((k) => k !== SPECIFIC_CLAUSE_KEY);
      return [...withoutSpecific, SPECIFIC_CLAUSE_KEY];
    });
  }

  /** Retire la clause spécifique de la sélection. */
  function removeSpecificClause() {
    setHasSpecific(false);
    setClauseOrder((order) => order.filter((k) => k !== SPECIFIC_CLAUSE_KEY));
  }

  /** Remonte l'élément à l'index `idx` dans l'ordre des clauses. */
  function moveUp(idx: number) {
    if (idx <= 0) return;
    setClauseOrder((order) => {
      const a = order[idx];
      const b = order[idx - 1];
      if (a === undefined || b === undefined) return order;
      const next = [...order];
      next[idx] = b;
      next[idx - 1] = a;
      return next;
    });
  }

  /** Descend l'élément à l'index `idx` dans l'ordre des clauses. */
  function moveDown(idx: number) {
    setClauseOrder((order) => {
      if (idx >= order.length - 1) return order;
      const a = order[idx];
      const b = order[idx + 1];
      if (a === undefined || b === undefined) return order;
      const next = [...order];
      next[idx] = b;
      next[idx + 1] = a;
      return next;
    });
  }

  // Index rapide clauseId → ClauseLocal pour le rendu de la liste ordonnée.
  const clauseById = useMemo(() => {
    const map = new Map<string, (typeof clauses)[number]>();
    for (const c of clauses) map.set(c.id, c);
    return map;
  }, [clauses]);

  // Clauses groupées par catégorie (ordre alpha des catégories puis ordre naturel).
  const clausesByCategory = useMemo(() => {
    const groups = new Map<string, typeof clauses>();
    for (const c of clauses) {
      const cat = c.categorie?.trim() || "Autres";
      const list = groups.get(cat) ?? [];
      list.push(c);
      groups.set(cat, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [clauses]);

  // Nombre total de clauses sélectionnées (standards + spécifique éventuelle).
  const selectedCount = clauseOrder.length;

  async function handleFinish() {
    if (!quoteId) {
      setGlobalError(t("errorNoQuote"));
      return;
    }

    setIsPending(true);
    setGlobalError(null);

    try {
      const now = new Date().toISOString();
      const trimmed = conditions.trim();

      // Re-read latest quote AVANT mutation to capture current revision.
      const dbQuote = await db.quotes.get(quoteId);
      if (!dbQuote) {
        setGlobalError(t("errorNoQuote"));
        return;
      }

      await applyLocalMutation(
        "quote",
        quoteId,
        "update",
        { ...dbQuote, conditionsPaiement: trimmed, updatedAt: now },
        dbQuote.revision, // revision lue AVANT la mutation
        async () => {
          await db.quotes.put({
            ...dbQuote,
            conditionsPaiement: trimmed,
            updatedAt: now,
            revision: dbQuote.revision + 1,
          });
        },
        userId,
      );

      // --- Persistance des QuoteClauses (Story 3.8 AC2 / AC3) ---------------
      // 1. Si une clause spécifique est sélectionnée ET que l'option
      //    « Enregistrer comme modèle » est cochée, on crée d'abord une clause
      //    dans la bibliothèque et on récupère son id.
      let savedSpecificClauseId: string | undefined;
      if (hasSpecific && saveAsTemplate && specificClause.trim()) {
        savedSpecificClauseId = crypto.randomUUID();
        const specificTitle = t("specificClauseTitle");
        await applyLocalMutation(
          "clause",
          savedSpecificClauseId,
          "create",
          {
            titre: specificTitle,
            contenu: specificClause.trim(),
            pays: "NE",
            updatedAt: now,
            createdAt: now,
          },
          0,
          async () => {
            await db.clauses.put({
              id: savedSpecificClauseId as string,
              titre: specificTitle,
              contenu: specificClause.trim(),
              pays: "NE",
              revision: 0,
              updatedAt: now,
              createdAt: now,
            });
          },
          userId,
        );
      }

      // 2. Bulk insert des QuoteClauseLocal — snapshot figé au moment de l'enreg.
      // exactOptionalPropertyTypes : les champs optionnels ne sont jamais passés
      // explicitement à `undefined` ; on les ajoute conditionnellement.
      if (clauseOrder.length > 0) {
        const records: QuoteClauseLocal[] = clauseOrder.map((key, idx) => {
          const base = {
            id: crypto.randomUUID(),
            quoteId,
            ordre: idx,
            pays: dbQuote.pays,
            revision: 0,
            updatedAt: now,
            createdAt: now,
          };

          if (key === SPECIFIC_CLAUSE_KEY) {
            // Clause spécifique : clauseId + titre présents si enregistrée comme modèle.
            const record: QuoteClauseLocal = {
              ...base,
              contenu: specificClause.trim(),
            };
            if (dbQuote.companyId !== undefined) {
              record.companyId = dbQuote.companyId;
            }
            if (savedSpecificClauseId) {
              record.clauseId = savedSpecificClauseId;
              record.titre = t("specificClauseTitle");
            }
            return record;
          }

          // Clause standard : fige le titre + contenu (indépendance bibliothèque — AC2).
          const src = clauseById.get(key);
          const record: QuoteClauseLocal = {
            ...base,
            clauseId: key,
            contenu: src?.contenu ?? "",
          };
          if (dbQuote.companyId !== undefined) {
            record.companyId = dbQuote.companyId;
          }
          if (src?.titre !== undefined) {
            record.titre = src.titre;
          }
          return record;
        });
        await db.quoteClauses.bulkPut(records);
      }

      // AuditMirror AFTER applyLocalMutation (convention établie Story 3.5).
      await db.auditMirror.add({
        id: crypto.randomUUID(),
        who: userId,
        what: "quote.conditions_update",
        when: now,
        where: "/devis/nouveau",
        entityType: "quote",
        entityId: quoteId,
        before: { conditionsPaiement: dbQuote.conditionsPaiement ?? null },
        after: { conditionsPaiement: trimmed || null },
        createdAt: now,
        synced: false,
      });

      void triggerSync();
      toast.success(t("successToast"));
      resetWizard();
      router.push("/devis");
    } catch {
      setGlobalError(t("errorGeneric"));
    } finally {
      setIsPending(false);
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-3 px-5 pb-6 pt-4">
        <div className="h-24 animate-pulse rounded-xl bg-border" />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 pb-6">
      <h2 className="font-serif text-xl font-semibold text-text-primary">
        {t("heading")}
      </h2>

      <div className="space-y-1.5">
        <label
          htmlFor="conditionsPaiement"
          className="text-xs font-semibold text-text-muted"
        >
          {t("label")}
        </label>
        <textarea
          id="conditionsPaiement"
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          disabled={isPending}
          placeholder={t("placeholder")}
          className="min-h-[100px] w-full resize-none rounded-xl border border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="mt-1 text-xs text-text-muted">{t("helpText")}</p>
      </div>

      {/* --- Clauses contractuelles (Story 3.8 / FR-27 + FR-28) -------------- */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("clausesHeading")}
        </h3>

        {clauses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface-alt px-3 py-2 text-xs text-text-muted">
            {t("clausesEmpty")}
          </p>
        ) : (
          <div className="space-y-3">
            {clausesByCategory.map(([category, items]) => (
              <div key={category} className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {category}
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {items.map((clause) => {
                    const isSelected = selectedClauseIds.has(clause.id);
                    const excerpt = clause.contenu.slice(0, 80);
                    return (
                      <button
                        key={clause.id}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        aria-label={clause.titre}
                        onClick={() => toggleClause(clause.id)}
                        disabled={isPending}
                        className={`w-full text-left rounded-xl border p-3 transition-colors disabled:opacity-60 ${
                          isSelected
                            ? "border-brand-navy bg-brand-navy/5"
                            : "border-border bg-surface hover:bg-surface-alt"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center ${
                              isSelected
                                ? "border-brand-navy bg-brand-navy"
                                : "border-border"
                            }`}
                          >
                            {isSelected && (
                              <span className="text-white text-xs">✓</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-text-primary">
                              {clause.titre}
                            </p>
                            <p className="text-xs text-text-muted line-clamp-2">
                              {excerpt}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-text-muted">
          {t("clauseSelected", { count: selectedCount })}
        </p>
      </section>

      {/* --- Clause spécifique (FR-28) --------------------------------------- */}
      <section className="space-y-1.5">
        <label
          htmlFor="specificClause"
          className="text-xs font-semibold text-text-muted"
        >
          {t("specificClauseLabel")}
        </label>
        <textarea
          id="specificClause"
          value={specificClause}
          onChange={(e) => setSpecificClause(e.target.value)}
          disabled={isPending}
          placeholder={t("specificClausePlaceholder")}
          className="min-h-[80px] w-full resize-none rounded-xl border border-input bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addSpecificClause}
            disabled={isPending || specificClause.trim().length === 0}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-alt disabled:opacity-60"
          >
            Ajouter
          </button>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input
              id="saveAsTemplate"
              type="checkbox"
              checked={saveAsTemplate}
              onChange={(e) => setSaveAsTemplate(e.target.checked)}
              disabled={isPending}
              className="h-3.5 w-3.5"
            />
            {t("saveAsTemplate")}
          </label>
        </div>
      </section>

      {/* --- Ordre des clauses sélectionnées (réordonnancement ↑/↓) ---------- */}
      {selectedCount > 0 && (
        <section className="space-y-1.5" data-testid="clause-order">
          <h3 className="text-sm font-semibold text-text-primary">
            {t("orderHeading")}
          </h3>
          <ol className="space-y-1.5">
            {clauseOrder.map((key, idx) => {
              const isSpecific = key === SPECIFIC_CLAUSE_KEY;
              const label = isSpecific
                ? t("specificClauseChip")
                : clauseById.get(key)?.titre ?? key;
              return (
                <li
                  key={key}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <span className="text-xs font-semibold text-text-muted">
                    {idx + 1}.
                  </span>
                  <span className="flex-1 truncate text-sm text-text-primary">
                    {label}
                  </span>
                  <button
                    type="button"
                    aria-label={t("moveUp")}
                    onClick={() => moveUp(idx)}
                    disabled={isPending || idx === 0}
                    className="h-7 w-7 rounded-lg border border-border text-xs hover:bg-surface-alt disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown")}
                    onClick={() => moveDown(idx)}
                    disabled={isPending || idx === clauseOrder.length - 1}
                    className="h-7 w-7 rounded-lg border border-border text-xs hover:bg-surface-alt disabled:opacity-40"
                  >
                    ↓
                  </button>
                  {isSpecific && (
                    <button
                      type="button"
                      aria-label="Retirer"
                      onClick={removeSpecificClause}
                      disabled={isPending}
                      className="h-7 w-7 rounded-lg border border-border text-xs text-destructive hover:bg-surface-alt disabled:opacity-40"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {globalError && (
        <p role="alert" className="text-xs text-destructive">
          {globalError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setStep(4)}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-medium text-text-secondary hover:bg-surface disabled:opacity-60"
        >
          {tW("previous")}
        </button>
        <button
          type="button"
          onClick={handleFinish}
          disabled={isPending}
          className="h-11 flex-1 rounded-xl bg-brand-navy text-sm font-semibold text-text-on-dark hover:bg-brand-navy-deep disabled:opacity-60"
        >
          {isPending ? t("finishing") : t("finish")}
        </button>
      </div>
    </div>
  );
}
