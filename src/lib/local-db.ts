"use client";

import Dexie, { type EntityTable } from "dexie";
import { installEncryptionLayer } from "@/lib/crypto/encryption-middleware";

export interface ClientLocal {
  id: string;
  companyName: string;
  contactName?: string;
  phone: string;
  email?: string;
  country: string;
  city?: string;
  address?: string;
  notes?: string;
  deletedAt?: string;
  ownerId?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface QuoteLocal {
  id: string;
  number: string;
  reference?: string;
  objet?: string;
  status: "draft" | "validated" | "sent" | "accepted" | "expired" | "cancelled";
  clientId?: string;
  clientSnapshot?: unknown;
  ownerId?: string;
  dateDevis?: string;
  dateValidite?: string;
  signataireNom?: string;
  signataireFonction?: string;
  conditionsPaiement?: string;
  originCountry?: string;
  originCity?: string;
  destinationCountry?: string;
  destinationCity?: string;
  goodsNature?: string;
  tonnage?: number;
  truckCapacity?: number;
  truckCount?: number;
  unitPrice?: number;
  sourceCurrency?: string;
  exchangeRate?: number;
  goodsValueFcfa?: number;
  totalFcfa: number;
  // Accord client (FR-30) — rempli lors de la transition Envoyé → Accepté
  clientAccordNom?: string;
  clientAccordFonction?: string;
  clientAccordDate?: string;
  clientAccordScanUrl?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface QuoteLineLocal {
  id: string;
  quoteId: string;
  designation: string;
  unitPrice: number;
  quantity: number;
  totalFcfa: number;
  ordre: number;
  templateId?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface ClauseLocal {
  id: string;
  titre: string;
  contenu: string;
  categorie?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface TemplateLocal {
  id: string;
  nom: string;
  lines: { designation: string; unitPrice: number; quantity: number }[];
  deletedAt?: string | null;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface QuoteClauseLocal {
  id: string;
  quoteId: string;
  clauseId?: string;
  titre?: string;
  contenu: string;
  ordre: number;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface CompanyLocal {
  id: string;
  raisonSociale: string;
  formeJuridique?: string;
  capital?: number;
  rccm: string;
  nif: string;
  adresse?: string;
  bp?: string;
  phones: string[];
  emails: string[];
  logoUrl?: string;
  logoData?: string;
  signataireNom?: string;
  signataireFonction?: string;
  conditionsPaiementDefaut?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface QuoteStatusLogLocal {
  id: string;
  quoteId: string;
  fromStatus?: QuoteLocal["status"];
  toStatus: QuoteLocal["status"];
  changedBy?: string;
  changedByName?: string;
  changedAt: string;
  note: string | null;
}

export interface RouteTemplateLocal {
  id: string;
  nom: string;
  originCountry: string;
  originCity: string;
  destinationCountry: string;
  destinationCity: string;
  distanceKm?: number;
  tarifFcfa?: number;
  deletedAt?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export type SyncOpEntity =
  | "client"
  | "quote"
  | "quoteLine"
  | "clause"
  | "company"
  | "template"
  | "routeTemplate";

export interface SyncOp {
  opId: string;
  entity: SyncOpEntity;
  entityId: string;
  type: "create" | "update" | "delete";
  payload: unknown;
  baseRevision: number;
  queuedAt: string;
  // Operational fields added Story 2.1
  failed?: boolean;
  retryCount?: number;
  lastError?: string;
  createdBy?: string;
}

export interface AuditEventLocal {
  id: string;
  who: string;
  what: string;
  when: string;
  where: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  synced: boolean;
}

export class LocalDatabase extends Dexie {
  clients!: EntityTable<ClientLocal, "id">;
  quotes!: EntityTable<QuoteLocal, "id">;
  quoteLines!: EntityTable<QuoteLineLocal, "id">;
  clauses!: EntityTable<ClauseLocal, "id">;
  quoteClauses!: EntityTable<QuoteClauseLocal, "id">;
  templates!: EntityTable<TemplateLocal, "id">;
  company!: EntityTable<CompanyLocal, "id">;
  syncQueue!: EntityTable<SyncOp, "opId">;
  auditMirror!: EntityTable<AuditEventLocal, "id">;
  quoteStatusLogs!: EntityTable<QuoteStatusLogLocal, "id">;
  routeTemplates!: EntityTable<RouteTemplateLocal, "id">;

  constructor() {
    super("quotation-local");

    // Version 1 — NE PAS MODIFIER, garder pour upgrade path
    this.version(1).stores({
      clients: "id, companyName, phone, city, ownerId, companyId, deletedAt, revision",
      quotes: "id, number, status, clientId, ownerId, companyId, dateDevis, revision",
      quoteLines: "id, quoteId, ordre, companyId, pays, revision",
      clauses: "id, categorie, companyId, pays, revision",
      templates: "id, nom, companyId, pays, revision",
      company: "id, companyId, revision",
      syncQueue: "opId, entity, entityId, queuedAt",
      auditMirror: "id, entityType, entityId, who, synced",
    });

    // Version 2 — ajout index failed/retryCount sur syncQueue
    this.version(2).stores({
      syncQueue: "opId, entity, entityId, queuedAt, failed, retryCount",
    });

    // Version 3 — ajout table quoteClauses (Story 4-1)
    this.version(3).stores({
      quoteClauses: "id, quoteId, ordre, companyId, pays, revision",
    });

    // Version 4 — ajout table quoteStatusLogs (Story 4-5, préfigure Story 3-9)
    // Les champs optionnels de QuoteLocal (clientAccord*) ne nécessitent pas de migration Dexie
    this.version(4).stores({
      quoteStatusLogs: "id, quoteId, changedAt",
    });

    // Version 5 — ajout table routeTemplates (Story 6-5)
    this.version(5).stores({
      routeTemplates: "id, nom, companyId, pays, deletedAt, revision",
    });
  }
}

export const db = new LocalDatabase();

// Story 6.1 (NFR-S4): transparent at-rest encryption of classified fields.
// Installed at module load so every read/write flows through the crypto layer.
// No-op until a session key is loaded (see crypto-context.tsx) — MVP-0 records
// stay plaintext and decrypt gracefully (AC6).
installEncryptionLayer(db);
