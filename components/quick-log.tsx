"use client";

import { useEffect, useRef, useState } from "react";
import {
  getQuickLogFormData,
  type QuickLogFormData,
} from "@/app/backfill/actions";
import { LogForm } from "@/app/backfill/log-form";
import { Button } from "@/components/ui/button";

/**
 * QuickLog - global "log a touchpoint" affordance that lives in the header
 * bar. A "+ Log touch" button opens a modal dialog with the shared LogForm
 * (company, channel, direction, date/time, contact, summary, outcome, deck
 * version, optional follow-up next action).
 */
export function QuickLog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<QuickLogFormData | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getQuickLogFormData().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + Log touch
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Log a touchpoint"
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/60 pt-[6vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="max-h-[86vh] w-[480px] max-w-[92vw] overflow-y-auto rounded-xl border bg-card p-5 shadow-[0_1px_2px_rgba(28,55,32,0.04)]"
          >
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="font-display text-[1.15rem] font-bold leading-tight text-primary dark:text-foreground">
                Log a touch
              </h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                Close
              </Button>
            </div>

            {!data ? (
              <p className="text-sm text-muted-foreground">Loading companies...</p>
            ) : (
              <LogForm
                companies={data.companies}
                contacts={data.contacts}
                deals={data.deals}
                deckVersions={data.deckVersions}
                templates={data.templates}
                variant="modal"
                onSuccess={() => setOpen(false)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default QuickLog;
