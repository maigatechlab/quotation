# Security Audit Report

**Project:** Quotation Logistique  
**Date:** 2026-07-12  
**Auditor:** Codex security review  
**Framework:** OWASP Top 10:2025  
**Scope:** `src/`, `scripts/`, application configuration, dependency lockfile, and automated checks  
**Technology Stack:** Next.js 16, React 19, TypeScript, Better Auth, Drizzle/PostgreSQL, Stripe, Vercel Blob, OpenRouter

---

## Executive Summary

The application has strong foundations: server-side authorization checks, schema validation, audit events, Stripe webhook signature verification, and a passing unit-test suite. It is **not ready for production launch** in its current state.

Two high-severity release blockers were found. Tenant suspension can be bypassed through API calls because the session does not contain the `tenantId` that the write guard reads. The locked dependency tree also contains active high-severity Next.js advisories. Additional medium-severity issues expose verification links in logs, make agreement scans publicly retrievable, expose implementation details through public diagnostics, and leave the paid AI endpoint without abuse controls.

**Overall Risk Score:** 30 (**Moderate Risk**)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 2 |
| Medium | 4 |
| Low | 0 |
| Info | 0 |
| **Total** | **6** |

---

## Findings

### A01:2025 — Broken Access Control

#### HIGH — Suspended tenants can bypass write blocking through the API
- **Files:** `src/lib/auth.ts:159-177`, `src/lib/tenants/request-guard.ts:9-18`
- **CWE:** CWE-862: Missing Authorization
- **Description:** The write guard reads `session.user.tenantId`, but Better Auth is explicitly configured to expose only `role` and `companyId` as custom session fields. Consequently, `tenantId` is absent and the guard returns `null` before checking the tenant status. API routes using this guard—including sync push, company updates, user management, and file uploads—remain writable for a suspended tenant that calls the API directly.
- **Evidence:**
  ```ts
  // auth.ts: custom fields omit tenantId
  additionalFields: { role: { /* ... */ }, companyId: { /* ... */ } }

  // request-guard.ts
  const rawTenantId = user["tenantId"];
  const tenantId = readScopedTenantId(user);
  if (!tenantId) return null;
  ```
- **Recommendation:** Expose `tenantId` as a non-input custom session field, then add an integration test that signs in as a suspended tenant and asserts every mutation route returns 403. Prefer a fail-closed result when a tenant-scoped account has no tenant identifier.
  ```ts
  tenantId: { type: "string", required: false, input: false },
  ```

---

### A02:2025 — Security Misconfiguration

#### MEDIUM — Public diagnostics disclose deployment internals
- **Files:** `src/app/api/diagnostics/route.ts:34-44`, `src/app/api/v1/health/route.ts:66-69,130-168`
- **CWE:** CWE-200: Exposure of Sensitive Information to an Unauthorized Actor
- **Description:** Both endpoints are publicly callable. Diagnostics reveals which credentials and services are configured, database/schema state, and storage mode. The health endpoint returns the raw database exception message. This information helps an attacker profile the deployment and may disclose internal host or driver details on failures.
- **Recommendation:** Disable diagnostics in production or require an operator secret. Keep a public liveness endpoint minimal (`{ status: "ok" }`); log database exception details privately instead of returning them.

#### MEDIUM — Signed agreement scans are stored as public objects
- **Files:** `src/lib/storage.ts:118-126`, `src/app/api/v1/quotes/[id]/agreement-scan/route.ts:80-95`
- **CWE:** CWE-200: Exposure of Sensitive Information to an Unauthorized Actor
- **Description:** Vercel Blob uploads are explicitly created with `access: "public"`. Agreement scans can contain signatures and commercial information, yet their final URLs do not require an authenticated, tenant-scoped download path.
- **Recommendation:** Store scans privately and serve them through an authenticated route that validates the quote's tenant and role. Use a short-lived signed URL only after that authorization succeeds.

---

### A03:2025 — Software Supply Chain Failures

#### HIGH — Dependency tree contains active high-severity advisories
- **Files:** `package.json:33`, `pnpm-lock.yaml`
- **CWE:** CWE-1104: Use of Unmaintained Third Party Components
- **Description:** `pnpm audit` reports **9 high**, **10 moderate**, and **4 low** vulnerabilities. The direct `next@16.1.6` dependency is below the patched `16.2.5` release and is affected by multiple high-severity advisories, including Proxy/middleware authorization bypasses, SSRF via WebSocket upgrade, and connection-exhaustion denial of service.
- **Recommendation:** Upgrade Next.js to at least `16.2.5`, refresh the lockfile, then re-run `pnpm audit`, the full test suite, and end-to-end tests. Also update the vulnerable esbuild transitive dependency where the refreshed graph permits it.

---

### A04:2025 — Cryptographic Failures

No issues identified. Checked secret handling, password-reset expiry, Stripe webhook verification, and use of browser crypto. The ignored local environment files were not inspected for secret values.

---

### A05:2025 — Injection

No issues identified. Checked route inputs, database access, uploads, dynamic SQL patterns, command execution, HTML injection sinks, and redirects. Route payloads are generally parsed with Zod and Drizzle query builders are used.

---

### A06:2025 — Insecure Design

#### MEDIUM — AI endpoint has no rate, usage, or concurrency limit
- **File:** `src/app/api/chat/route.ts:13-22,24-75`
- **CWE:** CWE-770: Allocation of Resources Without Limits or Throttling
- **Description:** Any authenticated user can send up to 100 messages per request, with each message body allowing up to 10,000 characters, and can repeat requests without rate, token, cost, or concurrency controls. This exposes the OpenRouter account and the application to cost exhaustion and availability degradation.
- **Recommendation:** Add a server-side rate limiter keyed by user and tenant, enforce a total request/token budget, limit concurrent streams, and return 429 with retry guidance. Do not accept user-supplied `system` messages unless that capability is intentional.

---

### A07:2025 — Authentication Failures

#### MEDIUM — Email-verification bearer links are written to application logs
- **File:** `src/lib/auth.ts:206-211`
- **CWE:** CWE-532: Insertion of Sensitive Information into Log File
- **Description:** The verification callback logs the recipient email and full verification URL. Anyone with log access can use an unexpired link to verify that address. In production this should be delivered through the email provider, not emitted to stdout.
- **Recommendation:** Replace the console log with a production email sender and never log URLs, tokens, cookies, passwords, or secrets. Add a test that asserts production verification delivery is configured and logging is redacted.

---

### A08:2025 — Software or Data Integrity Failures

No issues identified. Checked webhook signature verification, request parsing, dependency lockfile presence, dynamic-code patterns, and database mutation paths.

---

### A09:2025 — Security Logging and Alerting Failures

No separate finding. Audit events exist for key business mutations and authentication events. The sensitive verification-link logging is recorded under A07.

---

### A10:2025 — Mishandling of Exceptional Conditions

No separate finding. Route handlers generally return bounded API errors. The raw database error returned by the public health endpoint is recorded under A02.

---

## Risk Score Breakdown

| Category | Critical | High | Medium | Low | Info | Points |
|----------|----------|------|--------|-----|------|--------|
| A01 — Broken Access Control | 0 | 1 | 0 | 0 | 0 | 7 |
| A02 — Security Misconfiguration | 0 | 0 | 2 | 0 | 0 | 8 |
| A03 — Supply Chain Failures | 0 | 1 | 0 | 0 | 0 | 7 |
| A04 — Cryptographic Failures | 0 | 0 | 0 | 0 | 0 | 0 |
| A05 — Injection | 0 | 0 | 0 | 0 | 0 | 0 |
| A06 — Insecure Design | 0 | 0 | 1 | 0 | 0 | 4 |
| A07 — Authentication Failures | 0 | 0 | 1 | 0 | 0 | 4 |
| A08 — Data Integrity Failures | 0 | 0 | 0 | 0 | 0 | 0 |
| A09 — Logging & Alerting Failures | 0 | 0 | 0 | 0 | 0 | 0 |
| A10 — Exceptional Conditions | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | 0 | 2 | 4 | 0 | 0 | **30** |

## Remediation Priority

1. **Fix tenant write enforcement** — this is an authorization boundary failure that defeats suspension and expiry controls.
2. **Upgrade Next.js and clear the audit findings** — nine high-severity vulnerable dependency findings remain in the locked production graph.
3. **Remove verification links from logs and implement production email delivery** — bearer links must not be visible in centralized logs.
4. **Protect agreement scans and reduce public diagnostics** — sensitive documents and deployment details should require authentication.
5. **Add AI abuse controls** — prevent account-cost and availability exhaustion before enabling chat for customers.

## Methodology and Limitations

Static review covered the OWASP Top 10:2025, code paths, configuration, environment checks, and dependency audit. `pnpm check` passed with 46 lint warnings, and `pnpm build:ci` passed. `pnpm test:e2e` did not execute its test cases because importing the Drizzle schema fails with `TypeError: context.conditions?.includes is not a function`. The local production environment validation also failed because `STRIPE_SECRET_KEY` is not configured.

This review did not access a deployed environment, production secrets, DNS, Stripe/Resend/Vercel account settings, or backup-restore controls. Those should be verified in a staging release checklist after the code blockers above are resolved.

