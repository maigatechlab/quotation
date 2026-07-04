import {
  ArrowLeftRight,
  Ban,
  Banknote,
  Bell,
  CheckCircle,
  Pencil,
  Plus,
  RefreshCw,
  UserPlus,
  XCircle,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { formatDateFr, formatRelativeDate } from "@/lib/owner/format";
import type { TenantEventRow } from "@/lib/owner/tenant-detail";
import { JournalEventFilter } from "./journal-event-filter";

const EVENT_ICONS: Record<string, React.ElementType> = {
  created: Plus,
  activated: CheckCircle,
  suspended: Ban,
  reactivated: RefreshCw,
  cancelled: XCircle,
  payment_recorded: Banknote,
  plan_changed: ArrowLeftRight,
  user_added: UserPlus,
  reminder_sent: Bell,
  updated: Pencil,
};

export const JOURNAL_EVENT_TYPES = [
  "all",
  "created",
  "activated",
  "suspended",
  "reactivated",
  "cancelled",
  "payment_recorded",
  "plan_changed",
  "user_added",
  "reminder_sent",
  "updated",
];

interface Props {
  events: TenantEventRow[];
  eventTypeFilter?: string | undefined;
}

export async function JournalTab({ events, eventTypeFilter }: Props) {
  const t = await getTranslations("owner.tenants.detail.journal");
  const tEvents = await getTranslations("owner.events");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-lg font-semibold text-text-primary">{t("title")}</h3>
        <JournalEventFilter
          currentEventType={eventTypeFilter ?? "all"}
          eventTypes={JOURNAL_EVENT_TYPES}
        />
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const Icon = EVENT_ICONS[ev.eventType] ?? Plus;
            let label: string;
            try {
              label = tEvents(ev.eventType);
            } catch {
              label = ev.eventType;
            }
            return (
              <li key={ev.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-alt">
                  <Icon className="h-3 w-3 text-text-muted" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{label}</p>
                  {ev.note && <p className="text-xs text-text-secondary">{ev.note}</p>}
                  <p className="text-xs text-text-muted" title={formatDateFr(ev.createdAt)}>
                    {ev.actorEmail ?? t("actorSystem")} · {formatRelativeDate(new Date(ev.createdAt))}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs italic text-text-muted">{t("appendOnly")}</p>
    </div>
  );
}
