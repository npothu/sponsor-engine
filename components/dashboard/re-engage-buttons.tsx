"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  reEngageDealAction,
  reEngageHighPriorityStalledAction,
} from "@/app/actions";

/**
 * Per-row Re-engage: create a dated next action (and re-arm the default cadence
 * when the deal has none) so a stalled deal stops being a read-only badge and
 * becomes worked again.
 */
export function ReEngageButton({ dealId }: { dealId: number }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          await reEngageDealAction(dealId);
          setDone(true);
        })
      }
      title="Create a dated next action and re-arm the default cadence"
    >
      {done ? "Re-engaged ✓" : pending ? "…" : "Re-engage"}
    </Button>
  );
}

/**
 * Bulk "Re-engage all high-priority stalled": one submit re-engages every
 * high-priority stalled deal. Shows how many were touched.
 */
export function ReEngageAllHighPriority({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<number | null>(null);

  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await reEngageHighPriorityStalledAction());
          })
        }
      >
        {pending
          ? "Re-engaging…"
          : `Re-engage all ${count} high-priority stalled`}
      </Button>
      {result != null && (
        <span className="text-sm text-muted-foreground">
          Re-engaged <strong>{result}</strong>.
        </span>
      )}
    </div>
  );
}
