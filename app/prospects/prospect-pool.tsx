"use client";

import { useMemo, useState, useTransition } from "react";
import {
  bulkStartOutreachAction,
  type BulkOutreachResult,
} from "./actions";
import { PoolRow, type PoolRowData } from "./pool-row";
import type { SourceDef } from "./sources";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

type Triage = "all" | "needs_research" | "researched" | "no_touch";

/** A cadence option for the bulk-advance picker. */
export interface CadenceOption {
  id: number;
  name: string;
}

/** An active-tier option for tagging a prospect's expected/target tier. */
export interface TierOption {
  id: number;
  name: string;
  price: number;
}

/**
 * Client controller for the ranked pool. Owns multi-select state and the
 * bulk-advance toolbar (select top N + optional default cadence), then renders
 * each PoolRow with a selection checkbox. Only prospect-stage deals are
 * selectable - already-in-outreach and deal-less rows cannot be advanced.
 */
export function ProspectPool({
  rows,
  sources,
  cadences,
  tierOptions,
}: {
  rows: PoolRowData[];
  sources: readonly SourceDef[];
  cadences: CadenceOption[];
  tierOptions: TierOption[];
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [cadenceId, setCadenceId] = useState("");
  const [result, setResult] = useState<BulkOutreachResult | null>(null);
  const [triage, setTriage] = useState<Triage>("all");
  const [pending, startTransition] = useTransition();

  const needsResearchCount = useMemo(
    () => rows.filter((r) => r.needsResearch).length,
    [rows],
  );
  const noTouchCount = useMemo(
    () => rows.filter((r) => r.noTouchYet).length,
    [rows],
  );

  const visibleRows = useMemo(() => {
    if (triage === "needs_research") return rows.filter((r) => r.needsResearch);
    if (triage === "researched") return rows.filter((r) => !r.needsResearch);
    if (triage === "no_touch") return rows.filter((r) => r.noTouchYet);
    return rows;
  }, [rows, triage]);

  // A row is advanceable when it has a deal still in the prospect stage.
  // Bulk actions operate on the currently visible (filtered) rows.
  const selectableDealIds = useMemo(
    () =>
      visibleRows
        .filter((r) => r.dealId != null && r.dealStage === "prospect")
        .map((r) => r.dealId as number),
    [visibleRows],
  );
  const selectableSet = useMemo(
    () => new Set(selectableDealIds),
    [selectableDealIds],
  );

  function toggle(dealId: number, next: boolean) {
    setResult(null);
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(dealId);
      else copy.delete(dealId);
      return copy;
    });
  }

  function selectTop(n: number) {
    setResult(null);
    setSelected(new Set(selectableDealIds.slice(0, n)));
  }

  function clearSelection() {
    setResult(null);
    setSelected(new Set());
  }

  function advance() {
    const ids = [...selected].filter((id) => selectableSet.has(id));
    if (ids.length === 0) return;
    const fd = new FormData();
    fd.set("dealIds", ids.join(","));
    if (cadenceId) fd.set("cadenceId", cadenceId);
    startTransition(async () => {
      const res = await bulkStartOutreachAction(fd);
      setResult(res);
      setSelected(new Set());
    });
  }

  const selectedCount = [...selected].filter((id) =>
    selectableSet.has(id),
  ).length;

  const TABS: Array<{ key: Triage; label: string; count: number }> = [
    { key: "all", label: "All", count: rows.length },
    {
      key: "needs_research",
      label: "Needs research",
      count: needsResearchCount,
    },
    {
      key: "researched",
      label: "Researched",
      count: rows.length - needsResearchCount,
    },
    { key: "no_touch", label: "No touch yet", count: noTouchCount },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div
        className="inline-flex w-fit gap-0.5 rounded-lg border border-input bg-muted p-0.5"
        role="tablist"
        aria-label="Triage prospects"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={triage === tab.key}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              triage === tab.key &&
                "bg-card text-primary font-semibold shadow-[0_1px_2px_rgba(28,55,32,0.08)] dark:text-lime",
            )}
            onClick={() => {
              setTriage(tab.key);
              setSelected(new Set());
              setResult(null);
            }}
          >
            {tab.label}{" "}
            <span className="text-xs text-muted-foreground">({tab.count})</span>
          </button>
        ))}
      </div>

      {selectableDealIds.length > 0 && (
        <Card className="gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3 px-5">
            <span className="text-sm font-semibold text-foreground">
              Bulk advance
            </span>
            <span className="text-sm text-muted-foreground">
              {selectedCount} selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {[10, 25, 50].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || selectableDealIds.length === 0}
                  onClick={() => selectTop(n)}
                >
                  Top {Math.min(n, selectableDealIds.length)}
                </Button>
              ))}
              {selectedCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={clearSelection}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 px-5">
            <Select
              aria-label="Default cadence for advanced prospects"
              wrapperClassName="w-auto min-w-[200px]"
              value={cadenceId}
              onChange={(e) => setCadenceId(e.target.value)}
              disabled={pending || cadences.length === 0}
            >
              <option value="">No cadence</option>
              {cadences.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              disabled={pending || selectedCount === 0}
              onClick={advance}
            >
              {pending
                ? "Advancing..."
                : `Start outreach on ${selectedCount || ""}`.trim()}
            </Button>
            {result && (
              <span className="text-sm text-muted-foreground">
                Advanced <strong>{result.advanced}</strong> into outreach.
              </span>
            )}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {visibleRows.length === 0 && (
          <Card className="items-center border-dashed px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {triage === "needs_research"
                ? "Every prospect has been scored. Nothing left to research."
                : triage === "no_touch"
                  ? "Every prospect has at least one logged touch. Nothing untouched."
                  : "No researched prospects yet. Score some fit signals to populate this tab."}
            </p>
          </Card>
        )}
        {visibleRows.map((row) => {
          const selectable =
            row.dealId != null && row.dealStage === "prospect";
          return (
            <PoolRow
              key={row.companyId}
              row={row}
              sources={sources}
              tierOptions={tierOptions}
              selectable={selectable}
              selected={row.dealId != null && selected.has(row.dealId)}
              onSelectChange={
                selectable && row.dealId != null
                  ? (next) => toggle(row.dealId as number, next)
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}
