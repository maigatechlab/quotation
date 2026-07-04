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
import { APEX_DOMAIN } from "@/lib/tenants/tenant-config";
import { buildOwnerContact, getTenantAdminEmail } from "@/lib/tenants/tenant-contact";
import { CRON_SYSTEM_ACTOR_ID } from "./constants";
import {
  computeReminderAction,
  GRACE_EXPIRED_NOTE,
  hasGraceExpiredEventBeenSent,
  hasPaymentCoveringPeriod,
  hasReminderBeenSent,
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

const REMINDER_STAGE_NOTIFICATION: Record<ReminderStage, NotificationType> = {
  first: "reminderJ7",
  second: "reminderJ3",
  urgent: "reminderJ1",
};

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
        // AC4 — idempotence: check before send
        if (await hasReminderBeenSent(tenant.id, decision.stage)) continue;

        // Platform toggle (story 7-12) — skip entirely, no event logged, if disabled.
        if (!(await getNotificationToggle(REMINDER_STAGE_NOTIFICATION[decision.stage]))) continue;

        const adminEmail = await getTenantAdminEmail(tenant.id);
        if (!adminEmail) {
          console.warn(`No admin user for tenant ${tenant.id}, skipping reminder`);
          continue;
        }

        const emailParams = {
          tenantName: tenant.name,
          subdomainUrl: `https://${tenant.slug}.${APEX_DOMAIN}`,
          expiryDateFormatted: formatDateFR(tenant.subscriptionEnd!),
          daysRemaining: decision.daysRemaining,
          ownerWhatsapp: contact.displayWhatsapp,
          ownerEmail: contact.displayEmail,
        };

        await sendEmail({
          to: adminEmail,
          from: await getNotificationSenderAddress(),
          subject: reminderSubject(decision.stage),
          html: buildReminderEmailHtml(decision.stage, emailParams),
          text: buildReminderEmailText(decision.stage, emailParams),
        });

        // Send-then-log: event inserted only after a successful send (AC4) —
        // a crash between send and insert would allow one duplicate email on
        // the next cycle, which is an accepted tradeoff over a distributed
        // email+DB transaction.
        await db.insert(tenantEvents).values({
          tenantId: tenant.id,
          eventType: "reminder_sent",
          actorId: CRON_SYSTEM_ACTOR_ID,
          before: null,
          after: { stage: decision.stage, daysRemaining: decision.daysRemaining },
          note: decision.stage,
        });
        result.processed.reminders++;
      } else if (decision.kind === "expired") {
        // AC5 — a renewal payment recorded via story 7-4 covers the period: skip suspension.
        if (await hasPaymentCoveringPeriod(tenant)) {
          await db.insert(tenantEvents).values({
            tenantId: tenant.id,
            eventType: "reminder_sent",
            actorId: CRON_SYSTEM_ACTOR_ID,
            before: null,
            after: null,
            note: "payment covers period, skipped suspension",
          });
          continue;
        }

        // Guard: never re-suspend a tenant already suspended by this or another path.
        // The status change and its audit event are committed atomically so a crash
        // can never leave a tenant suspended without a matching tenant_events row.
        const graceDays = await getGracePeriodDays();
        const gracePeriodEndsAt = addDays(now, graceDays);
        const suspended = await db.transaction(async (tx) => {
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
            note: "auto-suspended (J0, no payment)",
          });
          return true;
        });
        if (!suspended) continue;

        const expiryNotificationsEnabled = await getNotificationToggle("expiryNotification");
        const adminEmail = expiryNotificationsEnabled ? await getTenantAdminEmail(tenant.id) : null;
        if (adminEmail) {
          try {
            const expiryParams = {
              tenantName: tenant.name,
              subdomainUrl: `https://${tenant.slug}.${APEX_DOMAIN}`,
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
        // AC6 — idempotence: avoid logging this event every day during read-only enforcement.
        if (await hasGraceExpiredEventBeenSent(tenant.id)) continue;

        await db.insert(tenantEvents).values({
          tenantId: tenant.id,
          eventType: "suspended",
          actorId: CRON_SYSTEM_ACTOR_ID,
          before: null,
          after: null,
          note: GRACE_EXPIRED_NOTE,
        });
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
