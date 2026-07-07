import { sql } from "drizzle-orm";
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
  uniqueIndex,
  date,
  unique,
  check,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Multi-tenant SaaS enums (Epic 7)
// ---------------------------------------------------------------------------

export const tenantStatusEnum = pgEnum("tenant_status", ["active", "trial", "suspended", "cancelled"]);
export const tenantPlanEnum = pgEnum("tenant_plan", ["free", "pro", "enterprise"]);
export const paymentMethodEnum = pgEnum("payment_method", ["nitta", "wave", "amana", "stripe", "cash", "virement"]);
export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);

// ---------------------------------------------------------------------------
// Subscription / Quota enums
// ---------------------------------------------------------------------------

export const tierEnum = pgEnum("tier", ["starter", "pro", "entreprise"]);
export const quotaStatusEnum = pgEnum("quota_status", ["ok", "warning", "exceeded", "readonly"]);

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
  "superadmin",
]);

// ---------------------------------------------------------------------------
// Tenants table — root of SaaS multi-tenancy (must be declared before user)
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: tenantStatusEnum("status").notNull().default("trial"),
    plan: tenantPlanEnum("plan").notNull().default("free"),
    subscriptionStart: date("subscription_start", { mode: "date" }),
    subscriptionEnd: date("subscription_end", { mode: "date" }),
    trialEndsAt: date("trial_ends_at", { mode: "date" }),
    gracePeriodEndsAt: date("grace_period_ends_at", { mode: "date" }),
    maxUsers: integer("max_users").notNull().default(3),
    notes: text("notes"),
    // Stripe integration (story 7-10). NULL for tenants created manually /
    // paid via mobile money. stripeCustomerId is the idempotent lookup key
    // for renewal checkouts (AC6) — no stripeSubscriptionId since Stripe is
    // used in mode "payment", not "subscription".
    stripeCustomerId: text("stripe_customer_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    unique("tenants_slug_unique").on(t.slug),
    index("idx_tenants_status").on(t.status),
    uniqueIndex("idx_tenants_stripe_customer_id")
      .on(t.stripeCustomerId)
      .where(sql`${t.stripeCustomerId} IS NOT NULL`),
  ]
);

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
    companyId: uuid("company_id"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    // Soft-disable for tenant user revocation (story 7-9).
    // Null = active; non-null = revoked (excluded from quota count, can't log in).
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("user_email_idx").on(table.email),
    index("user_tenant_id_idx").on(table.tenantId),
    index("user_tenant_disabled_idx").on(table.tenantId, table.disabledAt),
  ]
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
    // Accord client (FR-30) — rempli lors de la transition Envoyé → Accepté
    clientAccordNom: text("client_accord_nom"),
    clientAccordFonction: text("client_accord_fonction"),
    clientAccordDate: timestamp("client_accord_date"),
    clientAccordScanUrl: text("client_accord_scan_url"),
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
    deletedAt: timestamp("deleted_at"),
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

export const routeTemplate = pgTable(
  "route_template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nom: text("nom").notNull(),
    originCountry: text("origin_country").notNull(),
    originCity: text("origin_city").notNull(),
    destinationCountry: text("destination_country").notNull(),
    destinationCity: text("destination_city").notNull(),
    distanceKm: real("distance_km"),
    tarifFcfa: integer("tarif_fcfa"),
    deletedAt: timestamp("deleted_at"),
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
    index("idx_route_template_company_id").on(t.companyId),
    index("idx_route_template_deleted_at").on(t.deletedAt),
  ]
);

// Idempotency log for server-side sync ops
export const syncOpLog = pgTable(
  "sync_op_log",
  {
    opId: text("op_id").primaryKey(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    type: text("type").notNull(),
    result: text("result").notNull(), // "applied" | "conflict" | "noop"
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (t) => [index("idx_sync_op_log_entity").on(t.entity, t.entityId)]
);

// ---------------------------------------------------------------------------
// Subscription table — 1 per company, tracks tier + quota usage
// ---------------------------------------------------------------------------

export const companySubscription = pgTable(
  "company_subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().unique(),
    tier: tierEnum("tier").notNull().default("starter"),
    quotaStatus: quotaStatusEnum("quota_status").notNull().default("ok"),
    quotaUsedQuotes: integer("quota_used_quotes").notNull().default(0),
    quotaUsedUsers: integer("quota_used_users").notNull().default(0),
    quotaResetAt: timestamp("quota_reset_at").notNull(),
    graceExpiresAt: timestamp("grace_expires_at"),
    exceededAt: timestamp("exceeded_at"),
    notified80pct: boolean("notified_80pct").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [index("idx_company_sub_company_id").on(t.companyId)]
);

// append-only — no revision, no updatedAt
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: text("company_id"),
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
    index("idx_audit_event_when").on(t.when),
    index("idx_audit_event_company").on(t.companyId),
  ]
);

// ---------------------------------------------------------------------------
// Tenant SaaS payments + events (Epic 7)
// ---------------------------------------------------------------------------

export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // FCFA integer, never float
    currency: text("currency").notNull().default("XOF"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentReference: text("payment_reference"),
    paidAt: timestamp("paid_at").notNull(),
    periodStart: date("period_start", { mode: "date" }).notNull(),
    periodEnd: date("period_end", { mode: "date" }).notNull(),
    billingCycle: billingCycleEnum("billing_cycle").notNull(),
    confirmedBy: text("confirmed_by").notNull(), // superadmin user_id (text, no FK — allows SYSTEM sentinel)
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_subscription_payments_tenant_id").on(t.tenantId),
    index("idx_subscription_payments_paid_at").on(t.paidAt),
  ]
);

// append-only — no revision, no updatedAt (pattern: audit_event story 6-3)
export const tenantEvents = pgTable(
  "tenant_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorId: text("actor_id").notNull(), // superadmin user_id or "SYSTEM" sentinel (text, no FK)
    before: jsonb("before"),
    after: jsonb("after"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_tenant_events_tenant_id").on(t.tenantId),
    index("idx_tenant_events_created_at").on(t.createdAt),
    // DB-level idempotence guard for cron-generated rows (actorId = CRON_SYSTEM_ACTOR_ID,
    // see src/lib/cron/constants.ts): concurrent cron runs can both pass the
    // check-then-insert idempotence check before either commits, so the app-level guard
    // alone can't prevent duplicates. Scoped to actor_id='system' so it never collides
    // with legitimate repeatable admin actions (suspend/reactivate/cancel) that reuse notes.
    uniqueIndex("idx_tenant_events_cron_idempotent")
      .on(t.tenantId, t.eventType, t.note)
      .where(sql`${t.actorId} = 'system'`),
  ]
);

// Stripe webhook idempotence (story 7-10) — a dedicated table because the
// event id must be checked BEFORE the tenant is known (tenant_events is
// tenantId NOT NULL / scoped, so it can't record a pre-tenant event).
// Append-only, no updatedAt.
export const stripeProcessedEvents = pgTable(
  "stripe_processed_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("idx_stripe_events_event_id").on(t.eventId)]
);

// ---------------------------------------------------------------------------
// Platform settings — owner-editable config (Epic 7, story 7-12)
// ---------------------------------------------------------------------------

export interface PlatformNotificationSettings {
  senderAddress: string;
  trialWelcome: boolean;
  reminderJ7: boolean;
  reminderJ3: boolean;
  reminderJ1: boolean;
  expiryNotification: boolean;
  suspensionNotification: boolean;
  reactivationNotification: boolean;
}

// Singleton: exactly one row (id = 1), enforced by CHECK. Exception to the
// project's uuid()-for-custom-tables rule — justified for a config singleton
// (see story 7-12 Dev Notes).
export const platformSettings = pgTable(
  "platform_settings",
  {
    id: integer("id").primaryKey().notNull(),
    // Plans & tarifs (FCFA — entiers non-négatifs, référence commerciale XOF)
    priceFreeMonthly: integer("price_free_monthly").notNull().default(0),
    priceFreeAnnual: integer("price_free_annual").notNull().default(0),
    priceProMonthly: integer("price_pro_monthly").notNull().default(25000),
    priceProAnnual: integer("price_pro_annual").notNull().default(250000),
    priceEnterpriseMonthly: integer("price_enterprise_monthly").notNull().default(75000),
    priceEnterpriseAnnual: integer("price_enterprise_annual").notNull().default(750000),
    // Quotas maxUsers par plan
    maxUsersFree: integer("max_users_free").notNull().default(1),
    maxUsersPro: integer("max_users_pro").notNull().default(5),
    maxUsersEnterprise: integer("max_users_enterprise").notNull().default(20),
    // Cycle de vie (jours)
    trialDays: integer("trial_days").notNull().default(14),
    gracePeriodDays: integer("grace_period_days").notNull().default(7),
    // Contenu tenant
    suspendedContactEmail: text("suspended_contact_email")
      .notNull()
      .default("contact@maigatechlab.com"),
    suspendedContactWhatsapp: text("suspended_contact_whatsapp").notNull().default(""),
    expiryMessage: text("expiry_message").notNull().default(""),
    // Notifications (bloc jsonb — toggles + sender address)
    notifications: jsonb("notifications").$type<PlatformNotificationSettings>().notNull().default({
      // Empty on purpose — live-derived from EMAIL_FROM when unset. See story 8-2.
      senderAddress: "",
      trialWelcome: true,
      reminderJ7: true,
      reminderJ3: true,
      reminderJ1: true,
      expiryNotification: true,
      suspensionNotification: true,
      reactivationNotification: true,
    }),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  () => [
    // Singleton enforcement — literal SQL string (Drizzle #4661: CHECK does not
    // support bound params; sql`id = ${1}` would emit invalid `CHECK (id = $1)`).
    check("platform_settings_singleton_check", sql`id = 1`),
  ]
);

export type PlatformSettings = typeof platformSettings.$inferSelect;
