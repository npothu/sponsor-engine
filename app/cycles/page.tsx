import {
  getCurrentCycle,
  listCycles,
  revenueSummary,
  type RevenueSummary,
} from "@/lib/data";
import type { Cycle, DealStage } from "@/lib/schema";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CycleCreateForm } from "./cycle-create-form";
import { SetActiveButton } from "./set-active-button";
import { RolloverPanel } from "./rollover-panel";
import {
  cycleLabelsFromDeals,
  dealCountsByCycle,
  previewRollover,
  type RolloverPreview,
} from "./data";

const STAGE_LABELS: Record<DealStage, string> = {
  prospect: "Prospect",
  outreach: "Outreach",
  conversation: "Conversation",
  pitched: "Pitched",
  negotiating: "Negotiating",
  committed: "Committed",
  fulfilling: "Fulfilling",
  renewed: "Renewed",
  lapsed: "Lapsed",
  rejected: "Rejected",
};

const STAGE_ORDER: readonly DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
  "renewed",
  "lapsed",
  "rejected",
];

function formatDollars(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function formatDateRange(startsOn: string | null, endsOn: string | null): string {
  if (!startsOn && !endsOn) return "No dates set";
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  if (startsOn && endsOn) return `${fmt(startsOn)} - ${fmt(endsOn)}`;
  if (startsOn) return `From ${fmt(startsOn)}`;
  return `Until ${fmt(endsOn as string)}`;
}

/** Format an ISO date-only anchor date in local time (no UTC day-shift). */
function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function CyclesPage() {
  const cycles = await listCycles();
  const activeCycle = await getCurrentCycle();
  const dealCounts = await dealCountsByCycle();

  // Selectable labels for rollover = cycle rows plus any label seen on a deal.
  const labelSet = new Set<string>([
    ...cycles.map((c) => c.label),
    ...(await cycleLabelsFromDeals()),
  ]);
  const selectableLabels = Array.from(labelSet).sort((a, b) =>
    b.localeCompare(a),
  );

  // Per-cycle revenue summaries keyed by label (only for cycles we render).
  const summaries = new Map<string, RevenueSummary>();
  for (const label of labelSet) {
    summaries.set(label, await revenueSummary(label));
  }

  // Precompute every source/target rollover preview so the client panel can
  // switch selections without a round-trip.
  const previews: Record<string, RolloverPreview> = {};
  for (const from of selectableLabels) {
    for (const to of selectableLabels) {
      if (from === to) continue;
      previews[`${from}|${to}`] = await previewRollover(from, to);
    }
  }

  // Sensible defaults: newest label as source, active cycle as target.
  const defaultFrom =
    selectableLabels.find((l) => l !== activeCycle) ?? "";
  const defaultTo = selectableLabels.includes(activeCycle)
    ? activeCycle
    : selectableLabels[0] ?? "";

  return (
    <div>
      <PageHeader
        title="Cycles"
        subtitle="Manage sponsorship cycles and roll the warm cohort - renewals and warm re-approaches - into the next cycle."
        actions={<CycleCreateForm />}
      />

      <div className="space-y-6">
        <section className="space-y-3">
          <SectionHeading>All cycles</SectionHeading>

          {cycles.length === 0 ? (
            <Card className="border-dashed items-center px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No cycles defined yet. Create one - for example{" "}
                <strong className="text-foreground">2026-27</strong> - to
                anchor deals, revenue, and renewals.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
              {cycles.map((cycle) => (
                <CycleCard
                  key={cycle.id}
                  cycle={cycle}
                  isActive={cycle.label === activeCycle}
                  dealCount={dealCounts.get(cycle.label) ?? 0}
                  summary={summaries.get(cycle.label)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeading>Warm-cohort rollover</SectionHeading>
          {selectableLabels.length < 1 ? (
            <Card className="border-dashed items-center px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Create a cycle and engage some companies before rolling the warm
                cohort forward.
              </p>
            </Card>
          ) : (
            <RolloverPanel
              cycleLabels={selectableLabels}
              previews={previews}
              defaultFrom={defaultFrom}
              defaultTo={defaultTo}
            />
          )}
        </section>
      </div>
    </div>
  );
}

interface CycleCardProps {
  cycle: Cycle;
  isActive: boolean;
  dealCount: number;
  summary: RevenueSummary | undefined;
}

function CycleCard({ cycle, isActive, dealCount, summary }: CycleCardProps) {
  const committed = summary?.committedTotal ?? 0;
  const byStage = new Map<DealStage, number>();
  for (const s of summary?.byStage ?? []) {
    byStage.set(s.stage as DealStage, s.count);
  }
  const stagesWithDeals = STAGE_ORDER.filter((s) => (byStage.get(s) ?? 0) > 0);

  return (
    <Card
      className={
        isActive
          ? "ring-1 ring-primary/40 border-primary/40 px-5"
          : "px-5"
      }
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-foreground">
            {cycle.label}
          </h2>
          <SetActiveButton cycleId={cycle.id} isActive={isActive} />
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-foreground">
            {cycle.anchorEvent ? (
              <>
                <span className="text-muted-foreground">Anchor:</span>{" "}
                {cycle.anchorEvent}
                {cycle.anchorEventDate ? (
                  <span className="text-muted-foreground">
                    {" "}
                    &middot; {formatEventDate(cycle.anchorEventDate)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">No anchor event set</span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDateRange(cycle.startsOn, cycle.endsOn)}
          </span>
        </div>
      </div>

      <div className="flex gap-6 border-y py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-xl font-bold text-foreground">
            {formatDollars(committed)}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Committed
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-xl font-bold text-foreground">
            {dealCount}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Deal{dealCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          By stage
        </span>
        {stagesWithDeals.length === 0 ? (
          <span className="block text-sm text-muted-foreground">No deals yet</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {stagesWithDeals.map((stage) => (
              <Badge key={stage} variant="secondary" className="gap-1.5">
                {STAGE_LABELS[stage]}
                <span className="font-bold text-foreground">
                  {byStage.get(stage)}
                </span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
