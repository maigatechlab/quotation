"use client";

import type { CompanyLocal, QuoteClauseLocal, QuoteLocal, QuoteLineLocal } from "@/lib/local-db";
import { formatFcfa } from "@/lib/money";

interface PdfTemplateProps {
  quote: QuoteLocal;
  lines: QuoteLineLocal[];
  company: CompanyLocal | null;
  clauses?: QuoteClauseLocal[];
}

const NAVY = "#1B3070";
const AMBER = "#F6A624";
const ON_DARK = "#faf6ef";
const TEXT_PRIMARY = "#1c1a17";
const TEXT_SECONDARY = "#57534e";
const BORDER = "#ece6da";
const SERIF = "'Spectral', Georgia, serif";
const SANS = "'Hanken Grotesk', Arial, sans-serif";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PdfTemplate({ quote, lines, company, clauses }: PdfTemplateProps) {
  const snapshot = quote.clientSnapshot as {
    companyName?: string;
    contactName?: string;
    phone?: string;
    city?: string;
  } | null;

  const totalFcfa = formatFcfa(quote.totalFcfa);
  const today = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date());

  return (
    <div
      style={{
        width: "794px",
        fontFamily: SANS,
        fontSize: "11px",
        color: TEXT_PRIMARY,
        background: "#ffffff",
        lineHeight: 1.5,
      }}
    >
      {/* HEADER */}
      <div
        style={{
          background: NAVY,
          color: ON_DARK,
          padding: "57px 57px 24px 57px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Filigrane Sahel SVG ~4% opacité */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            opacity: 0.04,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "120px",
            fontFamily: SERIF,
            fontWeight: 700,
            color: ON_DARK,
            userSelect: "none",
          }}
        >
          SAHEL
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: "24px", position: "relative" }}>
          {/* Logo — prefer base64 (offline-safe) over remote URL */}
          {(company?.logoData ?? company?.logoUrl) && (
            <img
              src={company.logoData ?? company.logoUrl}
              alt="Logo"
              style={{ maxWidth: "120px", maxHeight: "60px", objectFit: "contain" }}
            />
          )}

          {/* Raison sociale + coordonnées */}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>
              {company?.raisonSociale ?? "Société non configurée"}
            </div>
            {company && (
              <>
                <div style={{ fontSize: "10px", opacity: 0.85 }}>
                  RCCM : {company.rccm} — NIF : {company.nif}
                </div>
                {company.adresse && (
                  <div style={{ fontSize: "10px", opacity: 0.85, marginTop: "2px" }}>
                    {company.adresse}{company.bp ? ` — BP ${company.bp}` : ""}
                  </div>
                )}
                {company.phones?.[0] && (
                  <div style={{ fontSize: "10px", opacity: 0.85 }}>
                    Tél : {company.phones[0]}{company.emails?.[0] ? ` — ${company.emails[0]}` : ""}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Numéro de devis */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: SERIF, fontSize: "22px", fontWeight: 700 }}>
              DEVIS
            </div>
            <div style={{ fontFamily: SERIF, fontSize: "16px", fontFeatureSettings: '"tnum"' }}>
              N° {quote.number}
            </div>
          </div>
        </div>
      </div>

      {/* RULE AMBER */}
      <div style={{ height: "3px", background: AMBER, margin: 0 }} />

      {/* BODY */}
      <div style={{ padding: "24px 57px" }}>

        {/* Info devis */}
        <div style={{ display: "flex", gap: "32px", marginBottom: "20px" }}>
          <div style={{ flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <tbody>
                <tr>
                  <td style={{ color: TEXT_SECONDARY, paddingRight: "8px", paddingBottom: "4px" }}>Date :</td>
                  <td style={{ fontWeight: 500 }}>{fmtDate(quote.dateDevis)}</td>
                </tr>
                <tr>
                  <td style={{ color: TEXT_SECONDARY, paddingRight: "8px", paddingBottom: "4px" }}>Validité :</td>
                  <td>{fmtDate(quote.dateValidite)}</td>
                </tr>
                {quote.objet && (
                  <tr>
                    <td style={{ color: TEXT_SECONDARY, paddingRight: "8px" }}>Objet :</td>
                    <td>{quote.objet}</td>
                  </tr>
                )}
                {quote.reference && (
                  <tr>
                    <td style={{ color: TEXT_SECONDARY, paddingRight: "8px" }}>Réf :</td>
                    <td>{quote.reference}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Client */}
          <div style={{ flex: 1, padding: "12px", border: `1px solid ${BORDER}`, borderRadius: "6px" }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, marginBottom: "6px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: NAVY }}>
              Client
            </div>
            <div style={{ fontWeight: 600 }}>{snapshot?.companyName ?? "—"}</div>
            {snapshot?.contactName && <div style={{ color: TEXT_SECONDARY }}>{snapshot.contactName}</div>}
            {snapshot?.phone && <div style={{ color: TEXT_SECONDARY }}>{snapshot.phone}</div>}
            {snapshot?.city && <div style={{ color: TEXT_SECONDARY }}>{snapshot.city}</div>}
          </div>
        </div>

        {/* Trajet + Marchandise */}
        {(quote.originCity ?? quote.destinationCity ?? quote.goodsNature) && (
          <div
            style={{
              background: "#f9f7f4",
              border: `1px solid ${BORDER}`,
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "20px",
              fontSize: "11px",
            }}
          >
            {(quote.originCity ?? quote.destinationCity) && (
              <div style={{ marginBottom: "4px" }}>
                <span style={{ color: TEXT_SECONDARY }}>Trajet : </span>
                <span style={{ fontWeight: 500 }}>
                  {[quote.originCity, quote.originCountry].filter(Boolean).join(", ")}
                  {" → "}
                  {[quote.destinationCity, quote.destinationCountry].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
            {quote.goodsNature && (
              <div style={{ marginBottom: "4px" }}>
                <span style={{ color: TEXT_SECONDARY }}>Marchandise : </span>
                <span>{quote.goodsNature}</span>
                {quote.tonnage != null && <span style={{ marginLeft: "8px" }}>{quote.tonnage} t</span>}
                {quote.truckCount != null && <span style={{ marginLeft: "8px" }}>{quote.truckCount} camion{quote.truckCount > 1 ? "s" : ""}</span>}
              </div>
            )}
            {quote.goodsValueFcfa != null && quote.goodsValueFcfa > 0 && (
              <div>
                <span style={{ color: TEXT_SECONDARY }}>Valeur : </span>
                <span style={{ fontFamily: SERIF, fontFeatureSettings: '"tnum"' }}>{formatFcfa(quote.goodsValueFcfa)}</span>
              </div>
            )}
          </div>
        )}

        {/* Tableau Prestations */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: NAVY, marginBottom: "8px" }}>
            Prestations
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#f2ede6" }}>
                <th style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", textAlign: "left", fontWeight: 600 }}>Désignation</th>
                <th style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", textAlign: "center", fontWeight: 600, width: "50px" }}>Qté</th>
                <th style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", textAlign: "right", fontWeight: 600, width: "120px" }}>Prix unitaire</th>
                <th style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", textAlign: "right", fontWeight: 600, width: "120px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={{ border: `1px solid ${BORDER}`, padding: "8px 12px" }}>{line.designation}</td>
                  <td style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", textAlign: "center" }}>{line.quantity}</td>
                  <td style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", textAlign: "right", fontFamily: SERIF, fontFeatureSettings: '"tnum"' }}>
                    {formatFcfa(line.unitPrice)}
                  </td>
                  <td style={{ border: `1px solid ${BORDER}`, padding: "8px 12px", textAlign: "right", fontFamily: SERIF, fontFeatureSettings: '"tnum"' }}>
                    {formatFcfa(line.totalFcfa)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  style={{
                    background: NAVY,
                    color: ON_DARK,
                    padding: "10px 12px",
                    fontFamily: SERIF,
                    fontWeight: 700,
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  TOTAL DEVIS
                </td>
                <td
                  style={{
                    background: NAVY,
                    color: ON_DARK,
                    padding: "10px 12px",
                    textAlign: "right",
                    fontFamily: SERIF,
                    fontWeight: 700,
                    fontSize: "13px",
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {totalFcfa}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Conditions de paiement */}
        {quote.conditionsPaiement && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: NAVY, marginBottom: "6px" }}>
              Conditions de paiement
            </div>
            <div style={{ fontSize: "11px", color: TEXT_SECONDARY, whiteSpace: "pre-wrap" }}>
              {quote.conditionsPaiement}
            </div>
          </div>
        )}

        {/* Clauses */}
        {clauses && clauses.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: NAVY, marginBottom: "8px" }}>
              Clauses & Conditions
            </div>
            {clauses.map((clause, i) => (
              <div key={clause.id} style={{ marginBottom: i < clauses.length - 1 ? "12px" : 0 }}>
                {clause.titre && (
                  <div style={{ fontSize: "11px", fontWeight: 600, marginBottom: "3px" }}>
                    {clause.titre}
                  </div>
                )}
                <div style={{ fontSize: "10px", color: TEXT_SECONDARY, whiteSpace: "pre-wrap" }}>
                  {clause.contenu}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Section signatures ─── */}
        <div style={{
          display: "flex",
          flexDirection: "row",
          gap: "16px",
          marginTop: "32px",
          borderTop: `1px solid ${BORDER}`,
          paddingTop: "20px",
          pageBreakInside: "avoid",
          breakInside: "avoid",
          marginBottom: "24px",
        }}>

          {/* Colonne gauche — Signataire société */}
          <div style={{
            flex: 1,
            border: `1px solid ${BORDER}`,
            borderRadius: "4px",
            padding: "16px",
          }}>
            <div style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: NAVY,
              marginBottom: "12px",
              fontFamily: SANS,
            }}>
              Signataire société
            </div>
            <div style={{ fontSize: "11px", color: TEXT_PRIMARY, marginBottom: "6px", fontFamily: SANS }}>
              <strong>Nom :</strong> {company?.signataireNom ?? quote.signataireNom ?? ""}
            </div>
            <div style={{ fontSize: "11px", color: TEXT_PRIMARY, marginBottom: "6px", fontFamily: SANS }}>
              <strong>Fonction :</strong> {company?.signataireFonction ?? quote.signataireFonction ?? ""}
            </div>
            <div style={{ fontSize: "11px", color: TEXT_PRIMARY, marginBottom: "16px", fontFamily: SANS }}>
              <strong>Date :</strong> {fmtDate(quote.dateDevis)}
            </div>
            {/* Espace signature 50×20mm = 189×76px */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "9px", color: TEXT_SECONDARY, marginBottom: "4px", fontFamily: SANS }}>
                Signature
              </div>
              <div style={{
                width: "189px",
                height: "76px",
                border: `1px solid ${BORDER}`,
                borderRadius: "2px",
              }} />
            </div>
            {/* Espace cachet 30×30mm = 114×114px */}
            <div>
              <div style={{ fontSize: "9px", color: TEXT_SECONDARY, marginBottom: "4px", fontFamily: SANS }}>
                Cachet
              </div>
              <div style={{
                width: "114px",
                height: "114px",
                border: `1px solid ${BORDER}`,
                borderRadius: "2px",
              }} />
            </div>
          </div>

          {/* Colonne droite — Bon pour accord Client */}
          <div style={{
            flex: 1,
            border: `1px solid ${BORDER}`,
            borderRadius: "4px",
            padding: "16px",
          }}>
            <div style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: NAVY,
              marginBottom: "12px",
              fontFamily: SANS,
            }}>
              Bon pour accord — Client
            </div>
            <div style={{ fontSize: "11px", color: TEXT_PRIMARY, marginBottom: "6px", fontFamily: SANS }}>
              <strong>Nom et prénom :</strong>{" "}
              {snapshot?.contactName ?? ""}
            </div>
            <div style={{ fontSize: "11px", color: TEXT_PRIMARY, marginBottom: "6px", fontFamily: SANS }}>
              <strong>Fonction :</strong> {""}
            </div>
            <div style={{ fontSize: "11px", color: TEXT_PRIMARY, marginBottom: "16px", fontFamily: SANS }}>
              <strong>Date :</strong> {""}
            </div>
            {/* Espace signature 50×20mm = 189×76px */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "9px", color: TEXT_SECONDARY, marginBottom: "4px", fontFamily: SANS }}>
                Signature
              </div>
              <div style={{
                width: "189px",
                height: "76px",
                border: `1px solid ${BORDER}`,
                borderRadius: "2px",
              }} />
            </div>
            {/* Espace cachet 30×30mm = 114×114px */}
            <div>
              <div style={{ fontSize: "9px", color: TEXT_SECONDARY, marginBottom: "4px", fontFamily: SANS }}>
                Cachet
              </div>
              <div style={{
                width: "114px",
                height: "114px",
                border: `1px solid ${BORDER}`,
                borderRadius: "2px",
              }} />
            </div>
          </div>

        </div>
      </div>

      {/* FOOTER */}
      <div
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: "10px 57px 57px",
          fontSize: "9px",
          color: TEXT_SECONDARY,
          textAlign: "center",
        }}
      >
        Document généré par Quotation Logistique · {today}
      </div>
    </div>
  );
}
