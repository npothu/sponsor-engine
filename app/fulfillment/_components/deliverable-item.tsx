"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { DealDeliverable, DeliverableStatus } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import {
  setDeliverableStatusAction,
  updateDeliverableMetaAction,
  updateDeliverableProofAction,
  deleteDeliverableAction,
} from "../actions";

interface DeliverableItemProps {
  item: DealDeliverable;
  todayIso: string;
}

/** True when a due date is strictly before today (and the item is not done). */
function isOverdue(dueDate: string | null, todayIso: string): boolean {
  if (!dueDate) return false;
  return dueDate < todayIso;
}

export function DeliverableItem({ item, todayIso }: DeliverableItemProps) {
  const [pending, startTransition] = useTransition();
  const [owner, setOwner] = useState(item.owner ?? "");
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [proofUrl, setProofUrl] = useState(item.proofUrl ?? "");
  const [metricValue, setMetricValue] = useState(item.metricValue ?? "");

  const status = item.status as DeliverableStatus;
  const done = status === "done";
  const blocked = status === "blocked";
  const overdue = !done && isOverdue(item.dueDate, todayIso);

  function cycleStatus() {
    // open/blocked -> done, done -> open
    const next: DeliverableStatus = done ? "open" : "done";
    startTransition(() => setDeliverableStatusAction(item.id, next));
  }

  function toggleBlocked() {
    const next: DeliverableStatus = blocked ? "open" : "blocked";
    startTransition(() => setDeliverableStatusAction(item.id, next));
  }

  function commitMeta(nextOwner: string, nextDue: string) {
    const ownerChanged = (nextOwner || null) !== (item.owner ?? null);
    const dueChanged = (nextDue || null) !== (item.dueDate ?? null);
    if (!ownerChanged && !dueChanged) return;
    startTransition(() =>
      updateDeliverableMetaAction(item.id, nextOwner || null, nextDue || null),
    );
  }

  function commitProof(nextProof: string, nextMetric: string) {
    const proofChanged =
      (nextProof.trim() || null) !== (item.proofUrl ?? null);
    const metricChanged =
      (nextMetric.trim() || null) !== (item.metricValue ?? null);
    if (!proofChanged && !metricChanged) return;
    startTransition(() =>
      updateDeliverableProofAction(
        item.id,
        nextProof.trim() || null,
        nextMetric.trim() || null,
      ),
    );
  }

  const deliveredAtLabel = item.deliveredAt
    ? item.deliveredAt.slice(0, 10)
    : null;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border bg-muted px-3 py-2",
        done && "border-lime/35 bg-lime/8",
        blocked && "border-(--tier-gold-fg)/45 bg-(--tier-gold-bg)/40",
      )}
    >
      <button
        type="button"
        className={cn(
          "mt-px flex size-5 shrink-0 items-center justify-center rounded-md border border-input bg-card text-[0.7rem] leading-none text-foreground transition-colors hover:border-lime cursor-pointer",
          done && "border-lime bg-lime text-lime-foreground",
          blocked && "border-(--tier-gold-fg) bg-(--tier-gold-bg) text-(--tier-gold-fg)",
        )}
        onClick={cycleStatus}
        disabled={pending}
        aria-pressed={done}
        title={done ? "Mark open" : "Mark done"}
      >
        {done ? "✓" : blocked ? "!" : ""}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "text-sm text-foreground",
              done && "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
          >
            {item.title}
          </span>
          {blocked && <Badge variant="warning">Blocked</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            <span className="text-[0.72rem] text-muted-foreground">Owner</span>
            <input
              className="max-w-[140px] rounded-md border border-input bg-card px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              value={owner}
              placeholder="-"
              onChange={(e) => setOwner(e.target.value)}
              onBlur={() => commitMeta(owner, dueDate)}
              disabled={pending}
            />
          </label>
          <label className="inline-flex items-center gap-1.5">
            <span className="text-[0.72rem] text-muted-foreground">Due</span>
            <input
              type="date"
              className={cn(
                "max-w-[140px] rounded-md border border-input bg-card px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30",
                overdue && "border-destructive/60 text-destructive",
              )}
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                commitMeta(owner, e.target.value);
              }}
              disabled={pending}
            />
          </label>
        </div>

        {done && (
          <div className="flex flex-col gap-1.5 rounded-md border border-lime/30 bg-lime/5 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex flex-1 items-center gap-1.5">
                <span className="text-[0.72rem] text-muted-foreground">
                  Proof
                </span>
                <input
                  type="url"
                  className="min-w-0 flex-1 rounded-md border border-input bg-card px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  value={proofUrl}
                  placeholder="https://link-to-evidence"
                  onChange={(e) => setProofUrl(e.target.value)}
                  onBlur={() => commitProof(proofUrl, metricValue)}
                  disabled={pending}
                />
              </label>
              <label className="inline-flex items-center gap-1.5">
                <span className="text-[0.72rem] text-muted-foreground">
                  Metric
                </span>
                <input
                  className="max-w-[150px] rounded-md border border-input bg-card px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  value={metricValue}
                  placeholder="e.g. 1.2k reach"
                  onChange={(e) => setMetricValue(e.target.value)}
                  onBlur={() => commitProof(proofUrl, metricValue)}
                  disabled={pending}
                />
              </label>
            </div>
            {deliveredAtLabel && (
              <span className="text-[0.68rem] text-muted-foreground">
                Delivered {deliveredAtLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-1 text-[0.72rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
            blocked && "border-(--tier-gold-fg) text-(--tier-gold-fg)",
          )}
          onClick={toggleBlocked}
          disabled={pending}
          title={blocked ? "Clear blocked flag" : "Flag as blocked"}
        >
          {blocked ? "Blocked" : "Block"}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-1.5 py-1 text-[0.72rem] font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive cursor-pointer"
          onClick={() =>
            startTransition(() => deleteDeliverableAction(item.id))
          }
          disabled={pending}
          title="Remove deliverable"
        >
          {"✕"}
        </button>
      </div>
    </div>
  );
}

export default DeliverableItem;
