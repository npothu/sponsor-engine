"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  toggleSignalAction,
  saveFitNotesAction,
  startOutreachAction,
  setExpectedTierAction,
  removeProspectAction,
} from "./actions";
import { sourceLabelClient } from "./source-label";
import type { SourceDef } from "./sources";
import type { TierOption } from "./prospect-pool";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PriorityBadge, RelationshipBadge } from "@/app/companies/ui";

/** A signal as rendered in the pool row (catalog def + current checked state). */
export interface PoolSignal {
  key: string;
  label: string;
  weight: number;
  checked: boolean;
}

export interface PoolRowData {
  companyId: number;
  companyName: string;
  companyType: string;
  priority: string;
  /** cross-cycle relationship: 'do_not_contact_yet' | 'prior_relationship' | 'cold' */
  relationship: string;
  /** composite expected-value rank (priority + fit + tier value), in [0, 240] */
  compositeRank: number;
  /** true when no fit signals have been scored yet (fit score is meaningless) */
  needsResearch: boolean;
  /** tagged expected/target tier id, or null when untagged */
  expectedTierId: number | null;
  /** tagged expected/target tier name, or null when untagged */
  expectedTierName: string | null;
  /** true when the expected tier is the anchor (top-priced active) tier */
  canHitAnchor: boolean;
  website: string | null;
  source: string | null;
  fitScore: number;
  fitNotes: string | null;
  signals: PoolSignal[];
  /** newest deal id + stage, when the company has a deal (null = no deal yet) */
  dealId: number | null;
  dealStage: string | null;
  /** assigned cadence name, or null */
  cadenceName: string | null;
  /** 1-based step X of N within the cadence, or null */
  cadenceStep: number | null;
  cadenceStepsTotal: number | null;
  /** most recent touchpoint on the deal (ISO), or null when never touched */
  lastTouchAt: string | null;
  /** earliest open next-action due date, or null */
  nextDueDate: string | null;
  /** true when no touchpoint has ever been logged against the deal */
  noTouchYet: boolean;
  /**
   * Last date outreach can responsibly start and still close before the anchor
   * event (ISO date), or null when no anchor date is set.
   */
  lastResponsibleStart: string | null;
}

/** Compact local date (e.g. "Jul 3"), or an em dash for null. */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Fit-score color band, applied to the bar fill and score label. */
function scoreClass(score: number): string {
  if (score >= 60) return "bg-primary dark:bg-lime";
  if (score >= 30) return "bg-[#8a6a1d] dark:bg-[#e5c877]";
  return "bg-muted-foreground";
}

function scoreTextClass(score: number): string {
  if (score >= 60) return "text-primary dark:text-lime";
  if (score >= 30) return "text-[#8a6a1d] dark:text-[#e5c877]";
  return "text-muted-foreground";
}

export function PoolRow({
  row,
  sources,
  tierOptions,
  selectable = false,
  selected = false,
  onSelectChange,
}: {
  row: PoolRowData;
  sources: readonly SourceDef[];
  /** active tiers available to tag as the prospect's expected/target tier */
  tierOptions: TierOption[];
  /** whether this row can be batch-advanced (deal in prospect stage) */
  selectable?: boolean;
  /** whether the row is currently selected for a bulk action */
  selected?: boolean;
  /** called when the selection checkbox toggles; omit to hide the checkbox */
  onSelectChange?: (next: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(row.fitNotes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  function toggle(key: string, next: boolean) {
    const fd = new FormData();
    fd.set("companyId", String(row.companyId));
    fd.set("key", key);
    fd.set("checked", String(next));
    startTransition(() => toggleSignalAction(fd));
  }

  function saveNotes() {
    if (!notesDirty) return;
    const fd = new FormData();
    fd.set("companyId", String(row.companyId));
    fd.set("fitNotes", notes);
    startTransition(async () => {
      await saveFitNotesAction(fd);
      setNotesDirty(false);
    });
  }

  function startOutreach() {
    if (row.dealId == null) return;
    const fd = new FormData();
    fd.set("dealId", String(row.dealId));
    startTransition(() => startOutreachAction(fd));
  }

  function setExpectedTier(tierId: string) {
    const fd = new FormData();
    fd.set("companyId", String(row.companyId));
    fd.set("tierId", tierId);
    startTransition(() => setExpectedTierAction(fd));
  }

  function removeProspect() {
    if (row.dealId == null) return;
    const fd = new FormData();
    fd.set("dealId", String(row.dealId));
    startTransition(() => removeProspectAction(fd));
  }

  return (
    <Card className={cn("px-5 py-4 transition-opacity", pending && "opacity-70")}>
      <div className="flex items-start justify-between gap-4 px-5">
        {selectable && onSelectChange && (
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectChange(e.target.checked)}
            disabled={pending}
            aria-label={`Select ${row.companyName} for bulk outreach`}
            className="mt-1 size-4 shrink-0 accent-primary dark:accent-lime"
          />
        )}
        {/* Left: identity + fit bar */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/companies/${row.companyId}`}
              className="text-base font-semibold text-foreground hover:underline"
            >
              {row.companyName}
            </Link>
            <PriorityBadge priority={row.priority} />
            <RelationshipBadge relationship={row.relationship} />
            {row.needsResearch && (
              <Badge
                variant="outline"
                className="border-dashed"
                title="No fit signals scored yet - the fit score is not meaningful until researched"
              >
                Needs research
              </Badge>
            )}
            <Badge variant="secondary">
              {sourceLabelClient(sources, row.source)}
            </Badge>
            {row.dealStage === "outreach" && (
              <Badge>In outreach</Badge>
            )}
            {row.dealId == null && <Badge variant="secondary">No deal</Badge>}
            {row.canHitAnchor && (
              <Badge
                variant="solid"
                title="Tagged for the anchor (top) tier - highest dollar potential"
              >
                Anchor potential
              </Badge>
            )}
            {row.website && (
              <a
                href={row.website}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline-offset-4 hover:underline dark:text-lime"
              >
                site
              </a>
            )}
          </div>

          <div className="mt-2.5 flex max-w-[360px] items-center gap-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Fit
            </span>
            <div className="h-[7px] flex-1 overflow-hidden rounded-full border border-border bg-muted">
              <div
                className={cn(
                  "h-full transition-[width] duration-150 ease-out",
                  scoreClass(row.fitScore),
                )}
                style={{ width: `${row.fitScore}%` }}
              />
            </div>
            <span
              className={cn(
                "min-w-[34px] text-right text-sm font-semibold",
                scoreTextClass(row.fitScore),
              )}
            >
              {row.fitScore}
            </span>
            <span
              className="min-w-[54px] text-right text-xs text-muted-foreground"
              title="Composite rank = priority weight (high 100 / medium 50 / low 0) + fit score (0-100) + tier value (0-40)"
            >
              rank {row.compositeRank}
            </span>
          </div>

          {/* Expected tier: dollar-potential axis of the rank. */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tier
            </span>
            <Select
              wrapperClassName="w-auto min-w-[130px]"
              className="h-8 py-1 text-xs"
              value={row.expectedTierId != null ? String(row.expectedTierId) : ""}
              disabled={pending}
              onChange={(e) => setExpectedTier(e.target.value)}
              aria-label={`Expected tier for ${row.companyName}`}
            >
              <option value="">Untagged</option>
              {tierOptions.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.name} (${t.price.toLocaleString()})
                </option>
              ))}
            </Select>
          </div>

          {/* Per-prospect outreach status: cadence step, last touch, next due. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {row.cadenceName ? (
              <span title={`Cadence: ${row.cadenceName}`}>
                {row.cadenceName}
                {row.cadenceStep != null && row.cadenceStepsTotal != null && (
                  <span className="text-foreground">
                    {" "}
                    · step {row.cadenceStep} of {row.cadenceStepsTotal}
                  </span>
                )}
              </span>
            ) : (
              <span>No cadence</span>
            )}
            {row.noTouchYet ? (
              <Badge variant="outline" className="border-dashed">
                No touch yet
              </Badge>
            ) : (
              <span>Last touch {shortDate(row.lastTouchAt)}</span>
            )}
            <span>Next due {shortDate(row.nextDueDate)}</span>
            {row.lastResponsibleStart &&
              (() => {
                const overdue =
                  row.lastResponsibleStart <
                  new Date().toISOString().slice(0, 10);
                return (
                  <span
                    className={cn(overdue && "font-medium text-destructive")}
                    title="Last date to responsibly start outreach and still close before the anchor event"
                  >
                    Start by {shortDate(row.lastResponsibleStart)}
                    {overdue ? " (past due)" : ""}
                  </span>
                );
              })()}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 gap-2">
          {row.dealId != null && row.dealStage === "prospect" && (
            <Button size="sm" onClick={startOutreach} disabled={pending}>
              Start outreach
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href={`/companies/${row.companyId}`}>Profile</Link>
          </Button>
          {row.dealId != null && row.dealStage === "prospect" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={removeProspect}
              disabled={pending}
              aria-label={`Remove ${row.companyName} from prospects`}
              title="Remove from prospects"
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Signal chips */}
      <div className="flex flex-wrap gap-1.5 px-5 pt-3.5">
        {row.signals.map((sig) => (
          <button
            key={sig.key}
            type="button"
            onClick={() => toggle(sig.key, !sig.checked)}
            disabled={pending}
            title={`Weight ${sig.weight}`}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            <Badge
              variant={sig.checked ? "default" : "outline"}
              className={cn(!sig.checked && "opacity-75")}
            >
              {sig.checked ? "✓ " : ""}
              {sig.label}
            </Badge>
          </button>
        ))}
      </div>

      {/* Fit notes inline edit */}
      <div className="px-5 pt-3">
        <Textarea
          rows={notes.length > 60 ? 2 : 1}
          value={notes}
          placeholder="Fit notes - warm path, why they'd say yes, angle to lead with..."
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesDirty(true);
          }}
          onBlur={saveNotes}
          className="resize-y text-sm"
        />
        {notesDirty && (
          <span className="mt-1 block text-xs text-muted-foreground">
            Unsaved - click away to save.
          </span>
        )}
      </div>
    </Card>
  );
}
