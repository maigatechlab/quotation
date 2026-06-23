"use client";

import Dexie, { type EntityTable } from "dexie";

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
  signataireNom?: string;
  signataireFonction?: string;
  conditionsPaiementDefaut?: string;
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
  | "template";

export interface SyncOp {
  opId: string;
  entity: SyncOpEntity;
  entityId: string;
  type: "create" | "update" | "delete";
  payload: unknown;
  baseRevision: number;
  queuedAt: string;
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
  templates!: EntityTable<TemplateLocal, "id">;
  company!: EntityTable<CompanyLocal, "id">;
  syncQueue!: EntityTable<SyncOp, "opId">;
  auditMirror!: EntityTable<AuditEventLocal, "id">;

  constructor() {
    super("quotation-local");

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
  }
}

export const db = new LocalDatabase();
