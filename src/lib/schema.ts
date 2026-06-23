import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";

// IMPORTANT! ID fields should ALWAYS use UUID types, EXCEPT the BetterAuth tables.

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "validated",
  "sent",
  "accepted",
  "expired",
  "cancelled",
]);

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "commercial",
  "operateur",
]);

// ---------------------------------------------------------------------------
// Better Auth tables (DO NOT change IDs — they use text, not uuid)
// ---------------------------------------------------------------------------

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: text("role").notNull().default("commercial"),
    // Account lockout — Better Auth v1.6 has no built-in maxLoginAttempts
    loginAttempts: integer("login_attempts").notNull().default(0),
    lockedAt: timestamp("locked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("user_email_idx").on(table.email)]
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_token_idx").on(table.token),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    index("account_provider_account_idx").on(table.providerId, table.accountId),
  ]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// ---------------------------------------------------------------------------
// Domain tables (uuid PKs, sync seams)
// ---------------------------------------------------------------------------

export const company = pgTable("company", {
  id: uuid("id").primaryKey().defaultRandom(),
  raisonSociale: text("raison_sociale").notNull(),
  formeJuridique: text("forme_juridique"),
  capital: integer("capital"),
  rccm: text("rccm").notNull(),
  nif: text("nif").notNull(),
  adresse: text("adresse"),
  bp: text("bp"),
  phones: jsonb("phones").$type<string[]>().default([]),
  emails: jsonb("emails").$type<string[]>().default([]),
  logoUrl: text("logo_url"),
  signataireNom: text("signataire_nom"),
  signataireFonction: text("signataire_fonction"),
  conditionsPaiementDefaut: text("conditions_paiement_defaut"),
  companyId: uuid("company_id"),
  pays: text("pays").default("NE"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => /* @__PURE__ */ new Date()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const client = pgTable(
  "client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone").notNull(),
    email: text("email"),
    country: text("country").default("NE"),
    city: text("city"),
    address: text("address"),
    notes: text("notes"),
    deletedAt: timestamp("deleted_at"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    companyId: uuid("company_id"),
    pays: text("pays").default("NE"),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_client_owner_id").on(t.ownerId),
    index("idx_client_company_id").on(t.companyId),
    index("idx_client_deleted_at").on(t.deletedAt),
  ]
);

export const quote = pgTable(
  "quote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull(),
    reference: text("reference"),
    objet: text("objet"),
    status: quoteStatusEnum("status").notNull().default("draft"),
    clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
    clientSnapshot: jsonb("client_snapshot"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    dateDevis: timestamp("date_devis"),
    dateValidite: timestamp("date_validite"),
    signataireNom: text("signataire_nom"),
    signataireFonction: text("signataire_fonction"),
    conditionsPaiement: text("conditions_paiement"),
    originCountry: text("origin_country"),
    originCity: text("origin_city"),
    destinationCountry: text("destination_country"),
    destinationCity: text("destination_city"),
    goodsNature: text("goods_nature"),
    tonnage: real("tonnage"),
    truckCapacity: real("truck_capacity"),
    truckCount: integer("truck_count"),
    unitPrice: integer("unit_price"),
    sourceCurrency: text("source_currency").default("XOF"),
    exchangeRate: real("exchange_rate").default(1),
    goodsValueFcfa: integer("goods_value_fcfa"),
    totalFcfa: integer("total_fcfa").notNull().default(0),
    companyId: uuid("company_id"),
    pays: text("pays").default("NE"),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_quote_client_id").on(t.clientId),
    index("idx_quote_owner_id").on(t.ownerId),
    index("idx_quote_status").on(t.status),
    index("idx_quote_company_id").on(t.companyId),
    index("idx_quote_number").on(t.number),
  ]
);

export const template = pgTable(
  "template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nom: text("nom").notNull(),
    lines: jsonb("lines")
      .$type<{ designation: string; unitPrice: number; quantity: number }[]>()
      .default([]),
    companyId: uuid("company_id"),
    pays: text("pays").default("NE"),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_template_company_id").on(t.companyId)]
);

export const quoteLine = pgTable(
  "quote_line",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    designation: text("designation").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull().default(1),
    totalFcfa: integer("total_fcfa").notNull(),
    ordre: integer("ordre").notNull().default(0),
    templateId: uuid("template_id").references(() => template.id, { onDelete: "set null" }),
    companyId: uuid("company_id"),
    pays: text("pays").default("NE"),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_quote_line_quote_id").on(t.quoteId),
    index("idx_quote_line_company_id").on(t.companyId),
    index("idx_quote_line_template_id").on(t.templateId),
  ]
);

export const clause = pgTable(
  "clause",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titre: text("titre").notNull(),
    contenu: text("contenu").notNull(),
    categorie: text("categorie"),
    companyId: uuid("company_id"),
    pays: text("pays").default("NE"),
    revision: integer("revision").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => /* @__PURE__ */ new Date()),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_clause_company_id").on(t.companyId)]
);


export const quoteClause = pgTable(
  "quote_clause",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    clauseId: uuid("clause_id").references(() => clause.id, { onDelete: "set null" }),
    contenuOverride: text("contenu_override"),
    ordre: integer("ordre").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_quote_clause_quote_id").on(t.quoteId),
    index("idx_quote_clause_clause_id").on(t.clauseId),
  ]
);

export const quoteStatusLog = pgTable(
  "quote_status_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    fromStatus: quoteStatusEnum("from_status"),
    toStatus: quoteStatusEnum("to_status").notNull(),
    changedBy: text("changed_by").references(() => user.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
    note: text("note"),
  },
  (t) => [
    index("idx_quote_status_log_quote_id").on(t.quoteId),
    index("idx_quote_status_log_changed_by").on(t.changedBy),
  ]
);

// append-only — no revision, no updatedAt
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    who: text("who").notNull(),
    what: text("what").notNull(),
    when: timestamp("when").defaultNow().notNull(),
    where: text("where").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_audit_event_entity").on(t.entityType, t.entityId),
    index("idx_audit_event_who").on(t.who),
  ]
);
