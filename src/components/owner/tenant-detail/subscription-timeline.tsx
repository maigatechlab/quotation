import { getTranslations } from "next-intl/server";
import { formatFcfa } from "@/lib/money";
import { formatDateFr } from "@/lib/owner/format";
import { buildSubscriptionTimeline, type TimelinePaymentInput } from "@/lib/owner/subscription-timeline";

interface Props {
  payments: TimelinePaymentInput[];
}

function diffDays(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

export async function SubscriptionTimeline({ payments }: Props) {
  const t = await getTranslations("owner.tenants.detail.abonnement.timeline");
  const timeline = buildSubscriptionTimeline(payments);

  if (timeline.segments.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-text-muted">{t("noPayments")}</p>
        <p className="text-xs text-text-muted">{t("noPaymentsSuggestion")}</p>
      </div>
    );
  }

  const totalDays = timeline.totalPaidDays + timeline.totalGapDays;

  // min-width floor of 2% per segment, then re-normalize so widths always sum to 100%
  const rawPcts = timeline.segments.map((seg) => {
    const segDays = seg.kind === "paid" ? diffDays(seg.start, seg.end) : (seg.durationDays ?? 0);
    return totalDays === 0 ? 0 : Math.max(2, (segDays / totalDays) * 100);
  });
  const pctSum = rawPcts.reduce((acc, p) => acc + p, 0);

  return (
    <div className="space-y-2">
      <div className="flex h-8 w-full overflow-hidden rounded-lg border border-border">
        {timeline.segments.map((seg, i) => {
          const raw = rawPcts[i] ?? 0;
          const widthPct = pctSum === 0 ? 0 : (raw / pctSum) * 100;
          const cls =
            seg.kind === "paid"
              ? "bg-status-accepte-bg hover:bg-status-accepte-bg/80"
              : "bg-status-annule-bg hover:bg-status-annule-bg/80";
          const title =
            seg.kind === "paid"
              ? t("segmentTooltip", {
                  method: seg.paymentMethod ?? "",
                  amount: formatFcfa(seg.amount ?? 0),
                  start: formatDateFr(seg.start),
                  end: formatDateFr(seg.end),
                })
              : t("gapTooltip", {
                  days: seg.durationDays ?? 0,
                  start: formatDateFr(seg.start),
                  end: formatDateFr(seg.end),
                });
          return <div key={i} className={cls} style={{ width: `${widthPct}%` }} title={title} />;
        })}
      </div>
      <div className="flex justify-between text-xs text-text-muted">
        <span>{formatDateFr(timeline.axisStart)}</span>
        <span>{formatDateFr(timeline.axisEnd)}</span>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-status-accepte-bg" />
          {t("paid", { days: timeline.totalPaidDays })}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-status-annule-bg" />
          {t("gap", { days: timeline.totalGapDays })}
        </span>
      </div>
    </div>
  );
}
