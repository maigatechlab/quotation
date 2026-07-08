import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { tenants, tenantEvents } from "@/lib/schema";
import {
  getGracePeriodDays,
  getNotificationSenderAddress,
  getNotificationToggle,
  type NotificationType,
} from "@/lib/tenants/platform-config";
import { buildTenantUrl } from "@/lib/tenants/tenant-config";
import { buildOwnerContact, getTenantAdminEmail } from "@/lib/tenants/tenant-contact";
import { CRON_SYSTEM_ACTOR_ID } from "./constants";
import {
  autoSuspendedNote,
  computeReminderAction,
  graceExpiredNote,
  hasGraceExpiredEventBeenSent,
  hasPaymentCoverageSkipEventBeenSent,
  hasPaymentCoveringPeriod,
  hasReminderBeenSent,
  paymentCoverageSkipNote,
  reminderSentNote,
  type ReminderStage,
} from "./expiry-decisions";
import {
  buildExpiryEmailHtml,
  buildExpiryEmailText,
  buildReminderEmailHtml,
  buildReminderEmailText,
  expirySubject,
  reminderSubject,
} from "./reminder-email";

export interface ExpiryJobResult {
  processed: { reminders: number; suspended: number; graceExpired: number; errors: number };
  errorTenantIds: string[];
  at: string;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function formatDateFR(date: Date): string {
  // Format in UTC to stay consistent with calendarDaysBetween (UTC day math),
  // so the displayed expiry date never disagrees with the days-remaining count.
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function toLogMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Postgres unique_violation — thrown by the DB-level idempotence guard
// (idx_tenant_events_cron_idempotent) when two concurrent cron runs both pass
// the app-level check-then-insert race for the same tenant/stage/period.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

const REMINDER_STAGE_NOTIFICATION: Record<ReminderStage, NotificationType> = {
  first: "reminderJ7",
  second: "reminderJ3",
  urgent: "reminderJ1",
};

async function deleteCronEventClaim(params: {
  tenantId: string;
  eventType: "reminder_sent" | "suspended";
  note: string;
}): Promise<void> {
  await db
    .delete(tenantEvents)
    .where(
      and(
        eq(tenantEvents.tenantId, params.tenantId),
        eq(tenantEvents.eventType, params.eventType),
        eq(tenantEvents.actorId, CRON_SYSTEM_ACTOR_ID),
        eq(tenantEvents.note, params.note)
      )
    );
}

export async function runExpiryJob(opts: { now?: Date } = {}): Promise<ExpiryJobResult> {
  const now = opts.now ?? new Date();
  const result: ExpiryJobResult = {
    processed: { reminders: 0, suspended: 0, graceExpired: 0, errors: 0 },
    errorTenantIds: [],
    at: now.toISOString(),
  };

  const candidates = await db
    .select()
    .from(tenants)
    .where(
      and(
        inArray(tenants.status, ["active", "trial", "suspended"]),
        ne(tenants.plan, "free"),
        isNotNull(tenants.subscriptionEnd)
      )
    );

  const contact = await buildOwnerContact();

  for (const tenant of candidates) {
    try {
      const decision = computeReminderAction(tenant, now);

      if (decision.kind === "none") continue;

      if (decision.kind === "reminder") {
        // AC4 — idempotence: check before send. Scoped to this billing period
        // (subscriptionEnd) so a renewal doesn't suppress the next period's reminders.
        if (await hasReminderBeenSent(tenant.id, decision.stage, tenant.subscriptionEnd!)) continue;

        // Platform toggle (story 7-12) — skip entirely, no event logged, if disabled.
        if (!(await getNotificationToggle(REMINDER_STAGE_NOTIFICATION[decision.stage]))) continue;

        const adminEmail = await getTenantAdminEmail(tenant.id);
        if (!adminEmail) {
          console.warn(`No admin user for tenant ${tenant.id}, skipping reminder`);
          continue;
        }

        const emailParams = {
          tenantName: tenant.name,
          subdomainUrl: buildTenantUrl(tenant.slug),
          expiryDateFormatted: formatDateFR(tenant.subscriptionEnd!),
          daysRemaining: decision.daysRemaining,
          ownerWhatsapp: contact.displayWhatsapp,
          ownerEmail: contact.displayEmail,
        };

        const note = reminderSentNote(decision.stage, tenant.subscriptionEnd!);

        // Claim-before-send: the DB unique guard decides which concurrent cron
        // invocation owns this reminder. If the email send fails, remove the claim
        // so the next run can retry.
        try {
          await db.insert(tenantEvents).values({
            tenantId: tenant.id,
            eventType: "reminder_sent",
            actorId: CRON_SYSTEM_ACTOR_ID,
            before: null,
            after: { stage: decision.stage, daysRemaining: decision.daysRemaining },
            note,
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          continue;
        }

        try {
          await sendEmail({
            to: adminEmail,
            from: await getNotificationSenderAddress(),
            subject: reminderSubject(decision.stage),
            html: buildReminderEmailHtml(decision.stage, emailParams),
            text: buildReminderEmailText(decision.stage, emailParams),
          });
        } catch (err) {
          await deleteCronEventClaim({ tenantId: tenant.id, eventType: "reminder_sent", note });
          throw err;
        }
        result.processed.reminders++;
      } else if (decision.kind === "expired") {
        // AC5 — a renewal payment recorded via story 7-4 covers the period: skip suspension.
        if (await hasPaymentCoveringPeriod(tenant)) {
          // Idempotence, scoped to this billing period (subscriptionEnd) — a reactivated
          // tenant that later expires again is a new period and must be re-logged.
          if (!(await hasPaymentCoverageSkipEventBeenSent(tenant.id, tenant.subscriptionEnd!))) {
            try {
              await db.insert(tenantEvents).values({
                tenantId: tenant.id,
                eventType: "reminder_sent",
                actorId: CRON_SYSTEM_ACTOR_ID,
                before: null,
                after: null,
                note: paymentCoverageSkipNote(tenant.subscriptionEnd!),
              });
            } catch (err) {
              if (!isUniqueViolation(err)) throw err;
            }
          }
          continue;
        }

        // Guard: never re-suspend a tenant already suspended by this or another path.
        // The status change and its audit event are committed atomically so a crash
        // can never leave a tenant suspended without a matching tenant_events row.
        // A unique-violation inside the tx (concurrent cron run raced the same insert)
        // rolls the whole transaction back — the status update is undone with it, so
        // treat it the same as "another run already handled this tenant".
        const graceDays = await getGracePeriodDays();
        const gracePeriodEndsAt = addDays(now, graceDays);
        let suspended: boolean;
        try {
          suspended = await db.transaction(async (tx) => {
            const updated = await tx
              .update(tenants)
              .set({ status: "suspended", gracePeriodEndsAt })
              .where(and(eq(tenants.id, tenant.id), inArray(tenants.status, ["active", "trial"])))
              .returning();
            if (!updated[0]) return false;
            await tx.insert(tenantEvents).values({
              tenantId: tenant.id,
              eventType: "suspended",
              actorId: CRON_SYSTEM_ACTOR_ID,
              before: { status: tenant.status },
              after: { status: "suspended", gracePeriodEndsAt: gracePeriodEndsAt.toISOString() },
              note: autoSuspendedNote(tenant.subscriptionEnd!),
            });
            return true;
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          suspended = false;
        }
        if (!suspended) continue;

        const expiryNotificationsEnabled = await getNotificationToggle("expiryNotification");
        const adminEmail = expiryNotificationsEnabled ? await getTenantAdminEmail(tenant.id) : null;
        if (adminEmail) {
          try {
            const expiryParams = {
              tenantName: tenant.name,
              subdomainUrl: buildTenantUrl(tenant.slug),
              graceEndsAtFormatted: formatDateFR(gracePeriodEndsAt),
              graceDays,
              ownerWhatsapp: contact.displayWhatsapp,
              ownerEmail: contact.displayEmail,
            };
            await sendEmail({
              to: adminEmail,
              from: await getNotificationSenderAddress(),
              subject: expirySubject(graceDays),
              html: buildExpiryEmailHtml(expiryParams),
              text: buildExpiryEmailText(expiryParams),
            });
          } catch (err) {
            // Best-effort — a failed email must not block the suspension itself.
            console.error(`Expiry email failed for tenant ${tenant.id}`, toLogMessage(err));
          }
        }

        result.processed.suspended++;
      } else if (decision.kind === "grace-expired") {
        // AC6 — idempotence, scoped to this billing period: avoid logging this event
        // every day during read-only enforcement, but still re-log if the tenant was
        // reactivated and later expires+grace-expires again.
        if (await hasGraceExpiredEventBeenSent(tenant.id, tenant.subscriptionEnd!)) continue;

        try {
          await db.insert(tenantEvents).values({
            tenantId: tenant.id,
            eventType: "suspended",
            actorId: CRON_SYSTEM_ACTOR_ID,
            before: null,
            after: null,
            note: graceExpiredNote(tenant.subscriptionEnd!),
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          continue;
        }
        result.processed.graceExpired++;
      }
    } catch (err) {
      // AC8 — isolate failures per tenant so one bad tenant doesn't block the batch.
      console.error(`Expiry job error for tenant ${tenant.id}`, toLogMessage(err));
      result.processed.errors++;
      result.errorTenantIds.push(tenant.id);
    }
  }

  return result;
}


