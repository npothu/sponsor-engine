"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { DealLostReason, DealStage } from "@/lib/schema";
import { DEAL_LOST_REASONS, DEAL_LOST_REASON_LABEL } from "@/app/companies/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { X } from "lucide-react";
import { moveDealStage } from "./actions";
import { removeProspectAction } from "@/app/prospects/actions";

interface StageArrowsProps {
  dealId: number;
  prevStage: DealStage | null;
  nextStage: DealStage | null;
  prevLabel: string | null;
  nextLabel: string | null;
  isProspect?: boolean;
}

/** Left/right arrows that move a deal to the adjacent pipeline stage. */
export function StageArrows({
  dealId,
  prevStage,
  nextStage,
  prevLabel,
  nextLabel,
  isProspect = false,
}: StageArrowsProps) {
  const [pending, startTransition] = useTransition();
  // When a move targets 'lapsed' or 'rejected', collect a structured loss
  // reason first. Timing/budget lapses additionally offer a dated re-ask.
  const [lapsing, setLapsing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [lostReason, setLostReason] = useState<string>("");
  const [reAskOn, setReAskOn] = useState<string>("");
  const offersReAsk = lapsing && (lostReason === "timing" || lostReason === "budget");

  function remove() {
    if (pending) return;
    const fd = new FormData();
    fd.set("dealId", String(dealId));
    startTransition(() => removeProspectAction(fd));
  }

  function move(stage: DealStage | null) {
    if (!stage || pending) return;
    if (stage === "lapsed") { setLapsing(true); return; }
    if (stage === "rejected") { setRejecting(true); return; }
    startTransition(() => moveDealStage(dealId, stage));
  }

  function confirmLapse() {
    startTransition(async () => {
      await moveDealStage(
        dealId,
        "lapsed",
        (lostReason || null) as DealLostReason | null,
        offersReAsk ? reAskOn || null : null,
      );
      setLapsing(false);
      setLostReason("");
      setReAskOn("");
    });
  }

  function confirmReject() {
    startTransition(async () => {
      await moveDealStage(dealId, "rejected", (lostReason || null) as DealLostReason | null);
      setRejecting(false);
      setLostReason("");
    });
  }

  const arrowClass = cn(
    "inline-flex size-[26px] items-center justify-center rounded-md border border-input bg-muted text-sm leading-none text-foreground transition-colors",
    "enabled:hover:border-primary enabled:hover:bg-accent enabled:hover:text-primary dark:enabled:hover:text-lime",
    "disabled:cursor-not-allowed disabled:opacity-35",
  );

  if (lapsing) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
        <span className="text-xs font-medium text-foreground">
          Why did it lapse?
        </span>
        <Select
          className="h-8 py-1 text-xs"
          value={lostReason}
          disabled={pending}
          onChange={(e) => setLostReason(e.target.value)}
          aria-label="Loss reason"
        >
          <option value="">No reason given</option>
          {DEAL_LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {DEAL_LOST_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
        {offersReAsk && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Ask again on (arms a dated re-ask)
            </span>
            <Input
              type="date"
              className="h-8 py-1 text-xs"
              value={reAskOn}
              disabled={pending}
              onChange={(e) => setReAskOn(e.target.value)}
              aria-label="Re-ask date"
            />
          </div>
        )}
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={confirmLapse}
          >
            Mark lapsed
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setLapsing(false);
              setLostReason("");
              setReAskOn("");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
        <span className="text-xs font-medium text-foreground">
          Why did they reject?
        </span>
        <Select
          className="h-8 py-1 text-xs"
          value={lostReason}
          disabled={pending}
          onChange={(e) => setLostReason(e.target.value)}
          aria-label="Rejection reason"
        >
          <option value="">No reason given</option>
          {DEAL_LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {DEAL_LOST_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={confirmReject}
          >
            Mark rejected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setRejecting(false);
              setLostReason("");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex gap-1.5">
      {isProspect && (
        <button
          type="button"
          className={cn(
            arrowClass,
            "enabled:hover:border-destructive enabled:hover:bg-destructive/10 enabled:hover:text-destructive",
          )}
          disabled={pending}
          onClick={remove}
          title="Remove from prospects"
          aria-label="Remove from prospects"
        >
          <X className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className={arrowClass}
        disabled={!prevStage || pending}
        onClick={() => move(prevStage)}
        title={prevLabel ? `Move back to ${prevLabel}` : "Already at first stage"}
        aria-label={prevLabel ? `Move back to ${prevLabel}` : "Move back"}
      >
        &#8592;
      </button>
      <button
        type="button"
        className={arrowClass}
        disabled={!nextStage || pending}
        onClick={() => move(nextStage)}
        title={nextLabel ? `Move forward to ${nextLabel}` : "Already at last stage"}
        aria-label={nextLabel ? `Move forward to ${nextLabel}` : "Move forward"}
      >
        &#8594;
      </button>
    </div>
  );
}
