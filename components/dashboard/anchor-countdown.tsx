import type { ActiveCycleAnchor } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Anchor-event countdown banner. Renders the days-remaining figure and the
 * event date for the active cycle's anchor event. Returns null when there is no
 * anchor date to count down to, so callers can drop it in unconditionally.
 *
 * `compact` renders an inline chip (for the board header); the default renders a
 * full-width card (for Today).
 */
export function AnchorCountdown({
  anchor,
  compact = false,
}: {
  anchor: ActiveCycleAnchor;
  compact?: boolean;
}) {
  const { anchorEvent, anchorEventDate, daysRemaining } = anchor;
  if (anchorEventDate == null || daysRemaining == null) return null;

  const label = anchorEvent || "Anchor event";
  const past = daysRemaining < 0;
  const soon = daysRemaining >= 0 && daysRemaining <= 30;
  const countText = past
    ? `${Math.abs(daysRemaining)} days ago`
    : daysRemaining === 0
      ? "Today"
      : `${daysRemaining} days`;

  if (compact) {
    return (
      <Badge variant={past ? "outline" : soon ? "warning" : "info"}>
        {label}: {past ? countText : `${countText} to go`}
      </Badge>
    );
  }

  return (
    <Card className="flex-row items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Anchor event
        </p>
        <p className="font-display text-lg font-semibold text-primary dark:text-foreground">
          {label}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatEventDate(anchorEventDate)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-display text-3xl font-bold text-primary dark:text-foreground">
          {countText}
        </p>
        <Badge variant={past ? "outline" : soon ? "warning" : "info"}>
          {past ? "Event has passed" : daysRemaining === 0 ? "It's today" : "to go"}
        </Badge>
      </div>
    </Card>
  );
}

export default AnchorCountdown;
