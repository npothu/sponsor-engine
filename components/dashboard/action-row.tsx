"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  completeActionAction,
  snoozeActionAction,
  composeForActionAction,
  logSentForActionAction,
  gotReplyForDealAction,
} from "@/app/actions";
import type { DueAction } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/app/companies/ui";
import { cn } from "@/lib/utils";

function formatDueDate(dueDate: string): string {
  // dueDate is a naive date string (e.g. "2026-07-03"). Parse the date portion
  // as local midnight so it is not shifted a day earlier in negative-offset
  // timezones by `new Date(...)`'s UTC parsing of date-only strings.
  const datePart = dueDate.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  const local = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (Number.isNaN(local.getTime())) return dueDate;
  return local.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ActionRow({
  action,
  composable = false,
  escalated = false,
}: {
  action: DueAction;
  /** true when the action's cadence step has a template to render into an email */
  composable?: boolean;
  /** true for a high-priority item overdue 7+ days - gets an escalate treatment */
  escalated?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [composing, setComposing] = useState(false);

  function compose() {
    setComposing(true);
    startTransition(async () => {
      const res = await composeForActionAction(action.id);
      setComposing(false);
      if (res?.gmailUrl) window.open(res.gmailUrl, "_blank", "noopener");
    });
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(28,55,32,0.04)]",
        escalated &&
          "border-destructive/60 ring-1 ring-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 truncate text-sm font-medium">
          {action.title}
          {escalated && (
            <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-destructive-foreground">
              Escalate
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={`/companies/${action.company.id}`}
            className="text-primary underline-offset-4 hover:underline dark:text-lime"
          >
            {action.company.name}
          </Link>
          <PriorityBadge priority={action.company.priority} />
          <span className="text-muted-foreground">
            due {formatDueDate(action.dueDate)}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {composable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={compose}
            title="Open a prefilled Gmail draft from this step's template"
          >
            {composing ? "Rendering…" : "Compose"}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              snoozeActionAction(action.id, 3);
            })
          }
        >
          Snooze +3d
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              completeActionAction(action.id);
            })
          }
          title="Just mark this action done, without logging a touch"
        >
          Complete
        </Button>
        <Button
          type="button"
          variant="gradient"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              gotReplyForDealAction(action.deal.id);
            })
          }
          title="Log an inbound reply, detach the cadence, and advance to conversation"
        >
          Got a reply
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              logSentForActionAction(action.id);
            })
          }
          title="Log the outbound touch, complete this action, and schedule the next step"
        >
          Log sent
        </Button>
      </div>
    </div>
  );
}

export default ActionRow;
