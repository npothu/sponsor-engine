"use client";

import { useMemo, useState, useTransition } from "react";
import type { RolloverSummary } from "@/lib/data";
import { runRolloverAction } from "./actions";
import type { RolloverPreview } from "./data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SatisfactionBadge } from "@/app/companies/ui";

interface RolloverPanelProps {
  /** All selectable cycle labels (from cycles table + deals), newest first. */
  cycleLabels: string[];
  /** Server-computed previews keyed by "from|to". */
  previews: Record<string, RolloverPreview>;
  defaultFrom: string;
  defaultTo: string;
}

function previewKey(from: string, to: string): string {
  return `${from}|${to}`;
}

export function RolloverPanel({
  cycleLabels,
  previews,
  defaultFrom,
  defaultTo,
}: RolloverPanelProps) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [confirming, setConfirming] = useState(false);
  const [summary, setSummary] = useState<RolloverSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const sameCycle = from !== "" && from === to;
  const preview = useMemo<RolloverPreview | null>(() => {
    if (!from || !to || sameCycle) return null;
    return previews[previewKey(from, to)] ?? null;
  }, [from, to, sameCycle, previews]);

  const createCount = preview?.willCreate.length ?? 0;
  const skipCount = preview?.willSkip.length ?? 0;
  const renewalCount =
    preview?.willCreate.filter((c) => c.kind === "renewal").length ?? 0;
  const reapproachCount =
    preview?.willCreate.filter((c) => c.kind === "reapproach").length ?? 0;

  const reset = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setConfirming(false);
    setSummary(null);
  };

  const execute = () => {
    startTransition(async () => {
      const result = await runRolloverAction(from, to);
      setSummary(result);
      setConfirming(false);
    });
  };

  return (
    <Card className="gap-5 px-6 py-6">
      <div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Rollover seeds a new cycle from the whole warm cohort of a prior one.
          A{" "}
          <strong className="font-semibold text-foreground">renewal</strong> is a
          company whose deal reached{" "}
          <strong className="font-semibold text-foreground">committed</strong>,{" "}
          <strong className="font-semibold text-foreground">fulfilling</strong>, or{" "}
          <strong className="font-semibold text-foreground">renewed</strong>; a{" "}
          <strong className="font-semibold text-foreground">re-approach</strong> is
          a warm company that reached{" "}
          <strong className="font-semibold text-foreground">conversation</strong>,{" "}
          <strong className="font-semibold text-foreground">pitched</strong>,{" "}
          <strong className="font-semibold text-foreground">negotiating</strong>, or{" "}
          <strong className="font-semibold text-foreground">lapsed</strong> but did
          not sign. Each gets a fresh{" "}
          <strong className="font-semibold text-foreground">prospect</strong>-stage
          deal in the target cycle - carrying its target tier, a note recording the
          prior stage, and an open next action due in 14 days. The original deal
          and its history stay intact. Companies that already have any deal in the
          target cycle are skipped. Renewals lead the preview ordered by sponsor
          satisfaction, so the happiest sponsors are the first to re-approach.
        </p>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex-1 min-w-0">
          <Label htmlFor="rollover-from">Source cycle</Label>
          <Select
            id="rollover-from"
            value={from}
            onChange={(e) => reset(e.target.value, to)}
          >
            <option value="">Select...</option>
            {cycleLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <span className="pb-2 text-lg text-muted-foreground" aria-hidden>
          &rarr;
        </span>

        <div className="flex-1 min-w-0">
          <Label htmlFor="rollover-to">Target cycle</Label>
          <Select
            id="rollover-to"
            value={to}
            onChange={(e) => reset(from, e.target.value)}
          >
            <option value="">Select...</option>
            {cycleLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {sameCycle && (
        <Badge variant="warning" className="w-fit rounded-lg px-3 py-2 text-sm font-normal normal-case">
          Source and target must be different cycles.
        </Badge>
      )}

      {summary ? (
        <RolloverResult summary={summary} onDone={() => reset(from, to)} />
      ) : (
        preview && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-lg font-semibold text-primary dark:text-foreground">
                Preview
              </span>
              <span className="text-sm text-muted-foreground">
                {renewalCount} renewal{renewalCount === 1 ? "" : "s"} +{" "}
                {reapproachCount} re-approach
                {reapproachCount === 1 ? "" : "es"} to create, {skipCount} skipped
              </span>
            </div>

            {createCount === 0 && skipCount === 0 ? (
              <div className="py-2 text-sm text-muted-foreground">
                No warm companies in {from} to roll over into {to}.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 rounded-lg border bg-muted px-3.5 py-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span>Will create</span>
                    <Badge variant="default">{createCount}</Badge>
                  </div>
                  {createCount === 0 ? (
                    <div className="text-sm text-muted-foreground">None</div>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {preview.willCreate.map((c) => (
                        <li
                          key={c.companyId}
                          className="flex items-center justify-between gap-2.5"
                        >
                          <span className="min-w-0 truncate text-sm text-foreground">
                            {c.companyName}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <Badge
                              variant={c.kind === "renewal" ? "lime" : "info"}
                              className="normal-case"
                            >
                              {c.kind === "renewal" ? "Renewal" : "Re-approach"}
                            </Badge>
                            {c.kind === "renewal" && (
                              <SatisfactionBadge satisfaction={c.satisfaction} />
                            )}
                            <Badge variant="secondary" className="normal-case">
                              was {c.sourceStage}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col gap-2 rounded-lg border bg-muted px-3.5 py-3">
                  <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span>Will skip</span>
                    <Badge variant="secondary">{skipCount}</Badge>
                  </div>
                  {skipCount === 0 ? (
                    <div className="text-sm text-muted-foreground">None</div>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {preview.willSkip.map((c) => (
                        <li
                          key={c.companyId}
                          className="flex items-center justify-between gap-2.5"
                        >
                          <span className="min-w-0 truncate text-sm text-foreground">
                            {c.companyName}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            already in {to}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {createCount > 0 && (
              <div className="flex flex-wrap items-center gap-2.5">
                {confirming ? (
                  <>
                    <span className="mr-1 text-sm text-foreground">
                      Create {createCount} deal{createCount === 1 ? "" : "s"} in{" "}
                      {to}?
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={execute}
                    >
                      {pending ? "Rolling over..." : "Confirm rollover"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" onClick={() => setConfirming(true)}>
                    Roll over {from} &rarr; {to}
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      )}
    </Card>
  );
}

function RolloverResult({
  summary,
  onDone,
}: {
  summary: RolloverSummary;
  onDone: () => void;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-lg font-semibold text-primary dark:text-foreground">
          Rollover complete
        </span>
        <span className="text-sm text-muted-foreground">
          {summary.created.length} created, {summary.skipped.length} skipped
        </span>
      </div>

      {summary.created.length === 0 ? (
        <div className="py-2 text-sm text-muted-foreground">
          No new renewal deals were created for {summary.toLabel}.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {summary.created.map((c) => (
            <li key={c.dealId} className="flex items-center justify-between gap-2.5">
              <span className="text-sm text-foreground">{c.companyName}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Badge variant={c.kind === "renewal" ? "lime" : "info"}>
                  {c.kind === "renewal" ? "Renewal" : "Re-approach"}
                </Badge>
                <Badge variant="default">new deal in {summary.toLabel}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      {summary.skipped.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Skipped (already had a {summary.toLabel} deal):{" "}
          {summary.skipped.map((s) => s.companyName).join(", ")}
        </p>
      )}

      <div className="flex items-center gap-2.5">
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
