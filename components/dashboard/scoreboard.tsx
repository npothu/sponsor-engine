import { format, parseISO } from "date-fns";
import { weeklyScoreboard } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * This week's outreach scoreboard. Two kinds of metrics:
 *
 * - Quota metrics (new touches, follow-ups cleared) have a target and a progress
 *   bar. These are the leading, fully-controllable numbers - the ones you protect.
 * - Signal metrics (follow-ups sent, reply rate, meetings, pipeline movement)
 *   have no target; they're lagging read-outs of whether the effort is landing.
 *
 * The week runs Monday..Sunday; "came due so far" (follow-ups cleared) is bounded
 * at today so you aren't marked down for actions not yet due this week.
 */

/** Status colour for a quota metric, by fraction of target reached. */
function quotaTone(fraction: number): {
  bar: string;
  text: string;
} {
  if (fraction >= 1) return { bar: "bg-lime", text: "text-[#4d7422] dark:text-lime" };
  if (fraction >= 0.6)
    return { bar: "bg-[#d8b64a]", text: "text-[#8a6a1d] dark:text-[#e5c877]" };
  return { bar: "bg-destructive", text: "text-destructive" };
}

/** Neutral tone for a quota metric with nothing due (target of 0). */
const NEUTRAL_TONE = { bar: "bg-muted-foreground/30", text: "text-muted-foreground" };

function QuotaMetric({
  label,
  value,
  target,
  hint,
}: {
  label: string;
  value: number;
  target: number;
  hint: string;
}) {
  // No target means nothing is due - a neutral "you're clear" state, not a
  // 0%-of-quota failure. Otherwise colour by fraction of target reached.
  const nothingDue = target === 0;
  const fraction = nothingDue ? 0 : value / target;
  const pct = Math.min(100, Math.round(fraction * 100));
  const tone = nothingDue ? NEUTRAL_TONE : quotaTone(fraction);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-xs font-semibold tabular-nums", tone.text)}>
          {nothingDue ? "none due" : `${pct}%`}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold text-foreground tabular-nums">
          {value}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">
          / {target}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", tone.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

function SignalMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-display text-2xl font-bold text-foreground tabular-nums">
        {value}
      </span>
      <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

export async function Scoreboard() {
  const s = await weeklyScoreboard();

  // parseISO reads a bare date as local midnight; new Date() would read it as
  // UTC and render a day early in western timezones.
  const weekLabel = `${format(parseISO(s.weekStart), "MMM d")} - ${format(
    parseISO(s.weekEnd),
    "MMM d",
  )}`;

  const replyPct = Math.round(s.replyRate * 100);

  return (
    <Card className="gap-5 px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-display text-lg font-semibold leading-snug text-primary dark:text-foreground">
          This week&apos;s scoreboard
        </span>
        <span className="text-xs font-medium text-muted-foreground">
          {weekLabel}
        </span>
      </div>

      {/* Quota metrics - the leading numbers you control. */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <QuotaMetric
          label="New touches"
          value={s.newTouches}
          target={s.newTouchQuota}
          hint="First outbound touch on a new thread. Protect this number - it feeds the whole funnel."
        />
        <QuotaMetric
          label="Follow-ups cleared"
          value={s.dueCompleted}
          target={s.dueTotal}
          hint="Next actions that came due Mon-today and got done. Aim for 100%."
        />
      </div>

      <div className="border-t" />

      {/* Signal metrics - lagging read-outs, no target. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <SignalMetric
          label="Follow-ups sent"
          value={String(s.followUpsSent)}
          hint="Later touches on existing threads."
        />
        <SignalMetric
          label="Reply rate"
          value={s.replyStarted > 0 ? `${replyPct}%` : "-"}
          hint={
            s.replyStarted > 0
              ? `${s.replyReplied}/${s.replyStarted} threads, trailing 30d.`
              : "No new threads in last 30d."
          }
        />
        <SignalMetric
          label="Meetings booked"
          value={String(s.meetingsBooked)}
          hint="The number that predicts revenue."
        />
        <SignalMetric
          label="Deals advanced"
          value={String(s.dealsAdvanced)}
          hint="Pipeline stage moves this week."
        />
      </div>
    </Card>
  );
}

export default Scoreboard;
