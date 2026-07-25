"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/app/companies/ui";
import { startProspectOutreachAction } from "@/app/actions";

/** One top-of-funnel prospect row, precomputed on the server. */
export interface TopProspectRow {
  companyId: number;
  companyName: string;
  priority: string;
  fitScore: number;
  compositeRank: number;
  dealId: number;
}

function StartButton({ dealId }: { dealId: number }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending || done}
      onClick={() =>
        startTransition(async () => {
          await startProspectOutreachAction(dealId);
          setDone(true);
        })
      }
    >
      {done ? "Started ✓" : pending ? "…" : "Start outreach"}
    </Button>
  );
}

/**
 * Today card surfacing the top untouched prospects (by composite fit x priority
 * rank) with inline start-outreach, so the daily work order can be pulled
 * top-down without leaving Today.
 */
export function TopProspectsCard({ rows }: { rows: TopProspectRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        No prospects waiting to be started. The pool is worked through.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div
          key={row.companyId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(28,55,32,0.04)]"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <Link
                href={`/companies/${row.companyId}`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-lime"
              >
                {row.companyName}
              </Link>
              <PriorityBadge priority={row.priority} />
            </div>
            <span className="text-sm text-muted-foreground">
              fit {row.fitScore} &middot; rank {row.compositeRank}
            </span>
          </div>
          <StartButton dealId={row.dealId} />
        </div>
      ))}
    </div>
  );
}
