---
story_key: 1-3-local-data-layer-crypto-seam
epic_num: 1
story_num: 3
status: done
baseline_commit: c2da5be45de5dc1795c6fbc33c8e6e5f29995aa2
---

# Story 1.3 : Couche de données locale & seam de chiffrement

**Statut :** done

## Story

**En tant que** développeur de l'équipe Maiga Tech Lab,
**Je veux** le schéma Drizzle domaine, le store Dexie local et le seam `LocalCrypto` (no-op) scaffoldés,
**Afin que** l'auth, les features offline et l'audit peuvent persister localement et server-side sans réécriture au palier MVP-1.

---

## Critères d'acceptation (BDD)

**AC1 — Schéma Drizzle domaine avec colonnes de sync (ADD-7)**

```
GIVEN  l'architecture data layer
WHEN   j'étends src/lib/schema.ts avec les tables domaine
THEN   les tables company, client, quote, quote_line, clause, template,
       quote_clause, quote_status_log, audit_event sont définies
AND    chaque table custom utilise uuid("id").primaryKey().defaultRandom()
AND    chaque table syncable porte les colonnes : revision (integer, default 0),
       updated_at (timestamp, auto-refresh via $onUpdate), company_id (uuid nullable),
       pays (text default "NE")
AND    le pgEnum quote_status = ['draft','validated','sent','accepted','expired','cancelled']
AND    le pgEnum user_role = ['admin','commercial','operateur']
AND    la colonne role est ajoutée à la table user Better Auth (text, default 'commercial')
AND    la table audit_event est append-only (pas de updated_at, pas de revision)
AND    les indexes idx_{table}_{column} existent sur les colonnes FK et les colonnes fréquemment filtrées
```

**AC2 — Migration Drizzle générée et appliquée (ADD-7)**

```
GIVEN  le schéma schema.ts étendu
WHEN   je lance pnpm db:generate
THEN   un fichier SQL de migration est créé dans drizzle/ (JAMAIS db:push)

GIVEN  la migration générée
WHEN   je lance pnpm db:migrate
THEN   toutes les tables sont créées dans Postgres sans erreur
```

**AC3 — Store Dexie typé (local-db.ts) avec outbox et audit mirror (ADD-8)**

```
GIVEN  l'exigence offline-first
WHEN   je définis src/lib/local-db.ts
THEN   la classe LocalDatabase (extends Dexie) expose des tables typées :
         clients: EntityTable<ClientLocal, 'id'>
         quotes: EntityTable<QuoteLocal, 'id'>
         quoteLines: EntityTable<QuoteLineLocal, 'id'>
         clauses: EntityTable<ClauseLocal, 'id'>
         templates: EntityTable<TemplateLocal, 'id'>
         company: EntityTable<CompanyLocal, 'id'>
         syncQueue: EntityTable<SyncOp, 'opId'>
         auditMirror: EntityTable<AuditEventLocal, 'id'>
AND    db.version(1).stores({...}) définit les index Dexie avec les colonnes requises
AND    un singleton db est exporté : export const db = new LocalDatabase()
AND    chaque type *Local reflète les colonnes Drizzle correspondantes (camelCase, PK = 'id')
AND    SyncOp = { opId, entity, entityId, type, payload, baseRevision, queuedAt } (forme verbatim architecture)
```

**AC4 — Seam LocalCrypto no-op (ADD-8, NFR-S4)**

```
GIVEN  le palier MVP-0 (chiffrement non requis) et le palier MVP-1 (AES-GCM)
WHEN   j'implémente src/lib/crypto/local-crypto.ts
THEN   l'interface LocalCrypto définit : encrypt(data: unknown): Promise<unknown>
       et decrypt(data: unknown): Promise<unknown>
AND    la classe NoOpCrypto implements LocalCrypto retourne data inchangé dans les deux méthodes
AND    un singleton localCrypto: LocalCrypto = new NoOpCrypto() est exporté
AND    le module est "use client" safe (zéro import Node.js/Next.js)
```

**AC5 — emitAuditEvent câblé sur Drizzle (ADD-11)**

```
GIVEN  la table audit_event dans schema.ts
WHEN   j'actualise src/lib/audit.ts
THEN   emitAuditEvent(event: AuditEvent): Promise<void> est async
AND    en server context, elle insère dans audit_event via db (Drizzle)
AND    le stub console.warn de MVP-0 est retiré
AND    createAuditEvent() et le type AuditEvent restent inchangés
```

**AC6 — pnpm check passe, 87+ tests toujours verts**

```
GIVEN  tous les nouveaux fichiers créés
WHEN   je lance pnpm check
THEN   pnpm lint && pnpm typecheck && pnpm test réussissent sans erreur
AND    les 87 tests existants (Stories 1.1 + 1.2) continuent de passer
AND    les tests de la Story 1.3 s'ajoutent (instantiation Dexie, types SyncOp, LocalCrypto no-op)
```

---

## Périmètre de cette story

**INCLUS :**
- `src/lib/schema.ts` — MODIFIER : ajouter toutes les tables domaine + colonne role sur user
- `src/lib/local-db.ts` — CRÉER : Dexie schema complet + singleton
- `src/lib/crypto/local-crypto.ts` — CRÉER : interface + NoOpCrypto + singleton
- `src/lib/audit.ts` — MODIFIER : emitAuditEvent → async + Drizzle insert
- `src/lib/local-db.test.ts` — CRÉER : tests instantiation + types

**EXCLU (autres stories) :**
- `lib/sync/outbox.ts` (applyLocalMutation, push, pull) → **Story 2.1**
- Le wiring des lectures/écritures Dexie via localCrypto dans les features → chaque feature story à partir de 2.x
- La connexion utilisateur / sessions → **Story 1.4**
- Le shell + navigation → **Story 1.5**
- Le wiring RBAC sur Better Auth sessions → **Story 1.6**
- AES-GCM réel dans LocalCrypto → **Story 6.1**

---

## Tâches / Sous-tâches

### T1 — Étendre src/lib/schema.ts avec les tables domaine (AC: #1)

- [x] Ajouter les imports manquants depuis `drizzle-orm/pg-core` : `uuid`, `integer`, `jsonb`, `pgEnum`, `real`
- [x] Définir `quoteStatusEnum` et `userRoleEnum` avec pgEnum (valeurs anglais lowercase)
- [x] Ajouter colonne `role` à la table `user` existante Better Auth
- [x] Créer table `company` (voir Dev Notes — colonnes exactes)
- [x] Créer table `client` (avec soft delete `deleted_at`, FK `owner_id → user.id`)
- [x] Créer table `quote` (status enum, `client_snapshot` jsonb, FK client/owner)
- [x] Créer table `quote_line` (FK `quote_id`, ordre, entiers FCFA)
- [x] Créer table `clause` (titre, contenu, catégorie)
- [x] Créer table `template` (modèle de ligne réutilisable)
- [x] Créer table `quote_clause` (junction quote ↔ clause, avec ordre)
- [x] Créer table `quote_status_log` (transitions FR-15 : who/from/to/timestamp)
- [x] Créer table `audit_event` (append-only, without revision/updated_at)
- [x] Ajouter index `idx_{table}_{column}` sur FK et colonnes filtrées

### T2 — Générer et appliquer la migration Drizzle (AC: #2)

- [x] `pnpm db:generate` → vérifier que le fichier SQL dans `drizzle/` est correct
- [x] `pnpm db:migrate` → vérifier que toutes les tables sont créées (docker doit être running)
- [x] **JAMAIS** `pnpm db:push` ni `drizzle-kit push` — violation des règles du projet

### T3 — Créer src/lib/crypto/local-crypto.ts (AC: #4)

- [x] Définir et exporter `LocalCrypto` interface (encrypt + decrypt)
- [x] Implémenter `NoOpCrypto` : passthrough async (data inchangé)
- [x] Exporter `export const localCrypto: LocalCrypto = new NoOpCrypto()`
- [x] Zéro import Next.js/Node.js (module partagé client + serveur)

### T4 — Créer src/lib/local-db.ts (AC: #3)

- [x] `import Dexie, { type EntityTable } from 'dexie'`
- [x] Définir interfaces locales : `ClientLocal`, `QuoteLocal`, `QuoteLineLocal`, `ClauseLocal`, `TemplateLocal`, `CompanyLocal`, `SyncOp`, `AuditEventLocal` (voir Dev Notes)
- [x] Définir classe `LocalDatabase extends Dexie` avec tables typées EntityTable
- [x] `db.version(1).stores({...})` avec index Dexie corrects
- [x] Exporter `export const db = new LocalDatabase()`
- [x] Exporter les interfaces pour consommation par les hooks et features

### T5 — Actualiser src/lib/audit.ts (AC: #5)

- [x] Changer signature : `emitAuditEvent(event: AuditEvent): Promise<void>`
- [x] Importer `db` depuis `@/lib/db` et `auditEvent` depuis `@/lib/schema`
- [x] Insérer dans `audit_event` via `await db.insert(auditEvent).values({...})`
- [x] Retirer le stub `console.warn`
- [x] Conserver `AuditEvent`, `CreateAuditEventParams`, `createAuditEvent` inchangés
- [x] Note : `emitAuditEvent` est server-only (utilise Drizzle) — les API routes l'awaiteront

### T6 — Créer src/lib/local-db.test.ts (AC: #6)

- [x] Test : `new LocalDatabase()` s'instancie sans erreur
- [x] Test : les tables `clients`, `quotes`, `syncQueue`, `auditMirror` existent
- [x] Test : `SyncOp` type valide (opId, entity, entityId, type, payload, baseRevision, queuedAt)
- [x] Test : `localCrypto.encrypt(x)` retourne `x` (no-op)
- [x] Test : `localCrypto.decrypt(x)` retourne `x` (no-op)
- [x] Note : Dexie nécessite IndexedDB → utiliser `fake-indexeddb` ou configurer jsdom

### T7 — Vérification finale (AC: #6)

- [x] `pnpm typecheck` passe (TS strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
- [x] `pnpm test` passe (87 tests existants + nouveaux tests 1.3)
- [x] `pnpm lint` : 0 erreurs, 0 warnings
- [x] `pnpm build` ou `pnpm build:ci` passe (vérification que les imports ne cassent pas le build)

---

### Review Findings

- [x] [Review][Patch] Le miroir Dexie omet `pays` pour `quoteLine`, `clause` et `template` [src/lib/local-db.ts:58]
- [x] [Review][Patch] `quote_line.template_id` est un UUID nu, sans FK ni index vers `template` [src/lib/schema.ts:236]
- [x] [Review][Patch] Les tests Dexie ne font pas de put/get ni de requete d'index representative [src/lib/local-db.test.ts:10]

---
## Dev Notes

### Fichiers à MODIFIER vs CRÉER

```
MODIFIER :
  src/lib/schema.ts        ← ajouter tables domaine + role sur user (ATTENTION : garder tables BetterAuth intactes)
  src/lib/audit.ts         ← emitAuditEvent async + Drizzle insert

CRÉER :
  src/lib/local-db.ts      ← Dexie schema + singleton
  src/lib/crypto/
  └── local-crypto.ts      ← LocalCrypto interface + NoOpCrypto + singleton
  src/lib/local-db.test.ts ← tests instantiation + types
```

### Définitions Drizzle exactes (schema.ts)

```ts
import {
  pgTable, pgEnum, text, timestamp, boolean,
  integer, uuid, jsonb, real, index
} from "drizzle-orm/pg-core";

// --- Enums ---
export const quoteStatusEnum = pgEnum("quote_status", [
  "draft", "validated", "sent", "accepted", "expired", "cancelled"
]);

export const userRoleEnum = pgEnum("user_role", [
  "admin", "commercial", "operateur"
]);

// --- Modifier la table user existante Better Auth ---
// Ajouter uniquement cette colonne à la table user existante :
// role: text("role").notNull().default("commercial"),
// ATTENTION : conserver toutes les colonnes Better Auth existantes telles quelles

// --- company ---
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
  // Sync seams
  companyId: uuid("company_id"),  // nullable : seam multi-tenant v2
  pays: text("pays").default("NE"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- client ---
export const client = pgTable("client", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone").notNull(),
  email: text("email"),
  country: text("country").default("NE"),
  city: text("city"),
  address: text("address"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at"),           // soft delete FR-11
  ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
  // Sync seams
  companyId: uuid("company_id"),
  pays: text("pays").default("NE"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_client_owner_id").on(t.ownerId),
  index("idx_client_company_id").on(t.companyId),
  index("idx_client_deleted_at").on(t.deletedAt),
]);

// --- quote ---
export const quote = pgTable("quote", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull(),             // TEMP-{DEVICE}-{SEQ} → DEV-YYYY-XXXX
  reference: text("reference"),
  objet: text("objet"),
  status: quoteStatusEnum("status").notNull().default("draft"),
  clientId: uuid("client_id").references(() => client.id, { onDelete: "set null" }),
  clientSnapshot: jsonb("client_snapshot"),     // ClientInput frozen at creation (FR-10)
  ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
  dateDevis: timestamp("date_devis"),
  dateValidite: timestamp("date_validite"),
  signataireNom: text("signataire_nom"),
  signataireFonction: text("signataire_fonction"),
  conditionsPaiement: text("conditions_paiement"),
  // Operational (Module 5)
  originCountry: text("origin_country"),
  originCity: text("origin_city"),
  destinationCountry: text("destination_country"),
  destinationCity: text("destination_city"),
  goodsNature: text("goods_nature"),
  tonnage: real("tonnage"),                     // tonnes, décimal physique (pas money)
  truckCapacity: real("truck_capacity"),        // tonnes/camion
  truckCount: integer("truck_count"),           // ceil(tonnage/capacity) — calculé
  unitPrice: integer("unit_price"),             // FCFA entier
  sourceCurrency: text("source_currency").default("XOF"),
  exchangeRate: real("exchange_rate").default(1), // rate décimal (1 si XOF)
  goodsValueFcfa: integer("goods_value_fcfa"),  // FCFA entier (tonnage×prix×taux)
  totalFcfa: integer("total_fcfa").notNull().default(0), // FCFA entier
  // Sync seams
  companyId: uuid("company_id"),
  pays: text("pays").default("NE"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_quote_client_id").on(t.clientId),
  index("idx_quote_owner_id").on(t.ownerId),
  index("idx_quote_status").on(t.status),
  index("idx_quote_company_id").on(t.companyId),
  index("idx_quote_number").on(t.number),
]);

// --- quote_line ---
export const quoteLine = pgTable("quote_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id").notNull().references(() => quote.id, { onDelete: "cascade" }),
  designation: text("designation").notNull(),
  unitPrice: integer("unit_price").notNull(),   // FCFA entier
  quantity: integer("quantity").notNull().default(1),
  totalFcfa: integer("total_fcfa").notNull(),   // unitPrice × quantity
  ordre: integer("ordre").notNull().default(0), // position drag & drop
  templateId: uuid("template_id"),              // nullable ref si issu d'un modèle
  // Sync seams
  companyId: uuid("company_id"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_quote_line_quote_id").on(t.quoteId),
]);

// --- clause ---
export const clause = pgTable("clause", {
  id: uuid("id").primaryKey().defaultRandom(),
  titre: text("titre").notNull(),
  contenu: text("contenu").notNull(),           // max 2000 chars validé par Zod
  categorie: text("categorie"),                 // "paiement" | "responsabilite" | "exclusions"
  // Sync seams
  companyId: uuid("company_id"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- template (modèles de lignes réutilisables) ---
export const template = pgTable("template", {
  id: uuid("id").primaryKey().defaultRandom(),
  nom: text("nom").notNull(),
  lines: jsonb("lines").$type<{ designation: string; unitPrice: number; quantity: number }[]>().default([]),
  // Sync seams
  companyId: uuid("company_id"),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- quote_clause (junction) ---
export const quoteClause = pgTable("quote_clause", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id").notNull().references(() => quote.id, { onDelete: "cascade" }),
  clauseId: uuid("clause_id").references(() => clause.id, { onDelete: "set null" }),
  contenuOverride: text("contenu_override"),    // clause custom (FR-28) ou null
  ordre: integer("ordre").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_quote_clause_quote_id").on(t.quoteId),
]);

// --- quote_status_log (transitions FR-15) ---
export const quoteStatusLog = pgTable("quote_status_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id").notNull().references(() => quote.id, { onDelete: "cascade" }),
  fromStatus: quoteStatusEnum("from_status"),
  toStatus: quoteStatusEnum("to_status").notNull(),
  changedBy: text("changed_by").references(() => user.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  note: text("note"),
}, (t) => [
  index("idx_quote_status_log_quote_id").on(t.quoteId),
]);

// --- audit_event (append-only — PAS de revision ni updated_at) ---
export const auditEvent = pgTable("audit_event", {
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
}, (t) => [
  index("idx_audit_event_entity").on(t.entityType, t.entityId),
  index("idx_audit_event_who").on(t.who),
]);
```

### Ajouter `role` à la table user (IMPORTANT — modifier la table existante)

```ts
// Dans la définition existante de la table user, AJOUTER uniquement :
role: text("role").notNull().default("commercial"),

// La table user devient :
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").notNull().default("commercial"), // ← AJOUTER ICI
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [index("user_email_idx").on(table.email)]);
```

**Pourquoi `text` et non `userRoleEnum` ?** Better Auth gère la table `user` — un `pgEnum` sur une table Better Auth peut compliquer les migrations futures. `text` avec validation Zod côté application est plus sûr. Convertir via `role as Role` dans `permissions.ts`.

### Définitions Dexie (local-db.ts)

```ts
"use client";

import Dexie, { type EntityTable } from "dexie";

// Types locaux (miroir des colonnes Drizzle, camelCase, primitives JSON-sérialisables)
export interface ClientLocal {
  id: string;            // UUIDv7 client-generated
  companyName: string;
  contactName?: string;
  phone: string;
  email?: string;
  country: string;
  city?: string;
  address?: string;
  notes?: string;
  deletedAt?: string;    // ISO UTC string
  ownerId?: string;
  companyId?: string;
  pays: string;
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface QuoteLocal {
  id: string;
  number: string;        // TEMP-... ou DEV-YYYY-XXXX
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
  unitPrice: number;     // FCFA entier
  quantity: number;
  totalFcfa: number;     // FCFA entier
  ordre: number;
  templateId?: string;
  companyId?: string;
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
  revision: number;
  updatedAt: string;
  createdAt: string;
}

export interface TemplateLocal {
  id: string;
  nom: string;
  lines: { designation: string; unitPrice: number; quantity: number }[];
  companyId?: string;
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

// SyncOp — forme verbatim architecture (ADD-9, consommé par Story 2.1)
export type SyncOpEntity =
  | "client" | "quote" | "quoteLine"
  | "clause" | "company" | "template";

export interface SyncOp {
  opId: string;          // UUIDv7, idempotency key
  entity: SyncOpEntity;
  entityId: string;      // UUIDv7
  type: "create" | "update" | "delete";
  payload: unknown;      // validé contre Zod schema avant enqueue (Story 2.1)
  baseRevision: number;  // révision client avant la mutation (conflict detection)
  queuedAt: string;      // ISO UTC
}

export interface AuditEventLocal {
  id: string;            // UUIDv7 local
  who: string;
  what: string;
  when: string;          // ISO UTC
  where: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  synced: boolean;       // false jusqu'à push confirmé
}

// --- LocalDatabase ---
class LocalDatabase extends Dexie {
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
      // Index Dexie : premier champ = PK, suivants = index secondaires
      clients:    "id, companyName, phone, city, ownerId, companyId, deletedAt, revision",
      quotes:     "id, number, status, clientId, ownerId, companyId, dateDevis, revision",
      quoteLines: "id, quoteId, ordre, revision",
      clauses:    "id, categorie, companyId, revision",
      templates:  "id, nom, companyId, revision",
      company:    "id, companyId, revision",
      syncQueue:  "opId, entity, entityId, queuedAt",
      auditMirror:"id, entityType, entityId, who, synced",
    });
  }
}

export const db = new LocalDatabase();
```

**Attention Dexie v4 :** le `!` (definite assignment) sur les tables est requis car Dexie les assigne au runtime via `this.version().stores()`. TypeScript strict mode accepte `!` ici.

### LocalCrypto (crypto/local-crypto.ts)

```ts
// src/lib/crypto/local-crypto.ts
// NE PAS ajouter "use client" — module partagé, pas d'imports Next.js

export interface LocalCrypto {
  encrypt(data: unknown): Promise<unknown>;
  decrypt(data: unknown): Promise<unknown>;
}

export class NoOpCrypto implements LocalCrypto {
  async encrypt(data: unknown): Promise<unknown> {
    return data;
  }

  async decrypt(data: unknown): Promise<unknown> {
    return data;
  }
}

// Singleton — swappé pour AES-GCM en Story 6.1
export const localCrypto: LocalCrypto = new NoOpCrypto();
```

**Convention d'usage (à respecter dans toutes les features suivantes) :**
```ts
// ÉCRITURE Dexie → encrypt avant put
const encrypted = await localCrypto.encrypt(record);
await db.clients.put(encrypted as ClientLocal);

// LECTURE Dexie → decrypt après get
const raw = await db.clients.get(id);
const record = await localCrypto.decrypt(raw) as ClientLocal;
```

En MVP-0, NoOpCrypto rend cela transparent. En MVP-1 (Story 6.1), l'AES-GCM s'active sans modifier les features.

### emitAuditEvent — nouvelle signature (audit.ts)

```ts
// src/lib/audit.ts
// RETIRER le stub console.warn
// AJOUTER import db + auditEvent table

import { db } from "@/lib/db";
import { auditEvent as auditEventTable } from "@/lib/schema";

// Signature devient async (les API routes l'awaiteront)
export async function emitAuditEvent(event: AuditEvent): Promise<void> {
  await db.insert(auditEventTable).values({
    who: event.who,
    what: event.what,
    when: new Date(event.when),    // string ISO → Date pour Drizzle timestamp
    where: event.where,
    entityType: event.entity.type,
    entityId: event.entity.id,
    before: event.before ?? null,
    after: event.after ?? null,
  });
}
```

**ATTENTION TS strict :** `exactOptionalPropertyTypes` — ne pas écrire `before: event.before` si `before` est `unknown | undefined` et que la colonne accepte `null`. Utiliser `event.before ?? null`.

### Tests Dexie — fake-indexeddb

Dexie nécessite IndexedDB, absent dans jsdom par défaut. Solution :

```ts
// src/lib/local-db.test.ts
import "fake-indexeddb/auto"; // ← doit être importé AVANT Dexie

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./local-db";
import { localCrypto } from "./crypto/local-crypto";
```

**IMPORTANT :** `fake-indexeddb` est une dépendance dev. Si elle n'est pas dans package.json, l'ajouter : `pnpm add -D fake-indexeddb`. Vérifier d'abord dans `node_modules/`.

**Alternative si fake-indexeddb absent :** utiliser `vi.mock('./local-db', ...)` pour mocker le module et tester uniquement les types et interfaces. Préférer fake-indexeddb si disponible.

### Pièges & anti-patterns

| ❌ À éviter | ✅ À faire |
|---|---|
| `db:push` ou `drizzle push` | `db:generate` puis `db:migrate` |
| `float` pour montants FCFA | `integer` pour tous les montants FCFA |
| `float`/`numeric` pour tonnage money | `real("tonnage")` pour quantités physiques |
| Modifier les tables Better Auth (user/session/account/verification) sauf colonne `role` | Laisser les tables BA intactes |
| `pgEnum` sur la colonne `role` de `user` (risque migration BA) | `text` + validation Zod |
| Import Drizzle/Next.js dans `local-crypto.ts` | Module pur, zéro import framework |
| `{ before: undefined }` avec exactOptionalPropertyTypes | `before: event.before ?? null` |
| Appeler `emitAuditEvent` sans `await` dans les routes | Toujours `await emitAuditEvent(...)` |
| Oublier `!` sur les tables Dexie en TS strict | `clients!: EntityTable<ClientLocal, 'id'>` |
| `new Date()` dans `$onUpdate` sans `/* @__PURE__ */` si tree-shaking | Copier le pattern de schema.ts existant |

### Héritage de Story 1.2

- **Zod 4** est en place — les Zod schemas pour client, company, clause, quote sont dans `src/lib/validation/`
- **`audit.ts`** : `AuditEvent` type et `createAuditEvent()` sont déjà corrects — NE PAS les modifier
- **TS strict** : `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` activés — prudence sur les optionals
- **87 tests** passent — ne pas les casser (money, calc, permissions, country-config)
- **`emitAuditEvent` stub** : actuellement `void`, passe à `Promise<void>` — aucun caller en production pour l'instant, changement de signature sans risque de régression

### Intelligence Stories 1.1 + 1.2

Story 1.1 a installé **Dexie `^4.4.4`** — l'API `EntityTable` est disponible.
Story 1.1 a configuré **Vitest** avec `jsdom` — ajouter `fake-indexeddb/auto` pour les tests Dexie.
Story 1.2 a défini les patterns TS strict — copier le style de `permissions.ts` pour les unions de types.
Review 1.2 : les erreurs venaient de `exactOptionalPropertyTypes` sur les spreads — utiliser `?? null` pour les champs optionnels dans les inserts Drizzle.

### Commandes pour le dev agent

```bash
# 1. Docker Postgres doit être running
docker compose up -d

# 2. Après modification de schema.ts — générer la migration
pnpm db:generate

# 3. Appliquer la migration
pnpm db:migrate

# 4. Vérification finale
pnpm check
# → lint ✓ + typecheck ✓ + test ✓ (87 existants + nouveaux 1.3)
```

### Structure des fichiers de cette story

```
src/lib/
├── schema.ts                  ← MODIFIER (+tables domaine +role user)
├── audit.ts                   ← MODIFIER (emitAuditEvent async + Drizzle)
├── local-db.ts                ← CRÉER (Dexie schema + singleton)
├── local-db.test.ts           ← CRÉER (tests instantiation)
└── crypto/
    └── local-crypto.ts        ← CRÉER (LocalCrypto interface + NoOpCrypto)

drizzle/
└── 000X_...sql                ← GÉNÉRÉ automatiquement par db:generate

# Fichiers existants — NE PAS MODIFIER :
src/lib/db.ts                  # Drizzle client (import dans audit.ts seulement)
src/lib/money.ts               # hors scope
src/lib/calc/                  # hors scope
src/lib/permissions.ts         # hors scope (wiring RBAC réel → Story 1.6)
src/lib/validation/            # hors scope
src/lib/api/                   # hors scope
src/lib/country-config.ts      # hors scope
```

---

## Références

- [Architecture §Data Architecture] — ADD-7 (Drizzle), ADD-8 (Dexie + LocalCrypto seam), ADD-9 (SyncOp shape)
- [Architecture §Authentication & Security] — NFR-S4 (AES-GCM seam), LocalCrypto interface
- [Architecture §Implementation Patterns] — uuid() PKs, sync columns, audit_event append-only
- [Architecture §Pattern Examples] — SyncOp verbatim, AuditEvent verbatim
- [Architecture §Project Structure] — `lib/crypto/`, `lib/local-db.ts`, `lib/sync/outbox.ts` (Story 2.1)
- [Epics.md §Story 1.3] — AC source: ADD-7, ADD-8, NFR-S4
- [Story 1.2 §Dev Notes] — TS strict patterns, Zod 4, audit.ts stub à remplacer
- [story 1.2 §Review Findings] — exactOptionalPropertyTypes → `?? null` sur optionals
- [project-context.md] — uuid() vs text ID, db:generate + db:migrate only, TS strict

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Corrigé : `beforeEach` importé mais non utilisé → retiré (noUnusedLocals TS strict)
- Corrigé : ordre d'import ESLint dans `local-db.test.ts` (crypto avant local-db)
- `LocalDatabase` exportée pour permettre l'instanciation dans les tests
- `pnpm db:migrate` exécuté avec succès pendant la revue après démarrage Docker

### Completion Notes List

- **T1** : `src/lib/schema.ts` étendu avec 2 enums (quoteStatusEnum, userRoleEnum) + colonne `role` sur `user` (text, default "commercial") + 9 tables domaine (company, client, quote, quoteLine, clause, template, quoteClause, quoteStatusLog, auditEvent) + tous les index FK. Tables Better Auth intactes.
- **T2** : Migrations `drizzle/0002_tan_masque.sql`, `drizzle/0003_silly_groot.sql` et `drizzle/0004_closed_blonde_phantom.sql` générées/appliquées. `0004` ajoute la FK/index `quote_line.template_id -> template.id`.
- **T3** : `src/lib/crypto/local-crypto.ts` créé — interface LocalCrypto + NoOpCrypto + singleton. Zéro import Next.js/Node.
- **T4** : `src/lib/local-db.ts` créé — 8 interfaces locales + LocalDatabase extends Dexie + version(1).stores() + singleton `db`; miroir `pays` ajouté pour quoteLine/clause/template.
- **T5** : `src/lib/audit.ts` mis à jour — emitAuditEvent devient async, insère dans `audit_event` via Drizzle. Stub console.warn retiré. AuditEvent / createAuditEvent inchangés.
- **T6** : `src/lib/local-db.test.ts` créé/renforcé — instantiation, tables, SyncOp, localCrypto no-op, put/get Dexie et index `pays`.
- **T7** : `pnpm check` ✅ (0 erreurs lint, typecheck strict, 113 tests), `pnpm build:ci` ✅.

### File List

- `src/lib/schema.ts` — modifié (tables domaine + enums + role user)
- `src/lib/audit.ts` — modifié (emitAuditEvent async + Drizzle insert)
- `src/lib/local-db.ts` — créé (Dexie schema + interfaces + singleton)
- `src/lib/crypto/local-crypto.ts` — créé (LocalCrypto interface + NoOpCrypto)
- `src/lib/local-db.test.ts` — créé (tests instantiation + types + no-op crypto)
- `drizzle/0002_tan_masque.sql` - generated (13-table migration)
- `drizzle/0003_silly_groot.sql` - generated (additional columns/indexes)
- `drizzle/0004_closed_blonde_phantom.sql` - generated (FK/index template on quote_line)
- `package.json` — modifié (ajout fake-indexeddb devDependency)
- `pnpm-lock.yaml` — modifié (lockfile mis à jour)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` - updated (1-3 -> done)
- `_bmad-output/implementation-artifacts/1-3-local-data-layer-crypto-seam.md` - updated (status done, tasks/review findings checked)
### Change Log

- **2026-06-22** : Story 1.3 implémentée puis corrigée en revue — schéma Drizzle domaine (9 tables), migrations générées/appliquées, store Dexie local avec miroir `pays`, FK/index template sur quote_line, seam LocalCrypto no-op, emitAuditEvent async Drizzle, tests Dexie renforcés. pnpm check ✅ (113 tests), pnpm build:ci ✅.
