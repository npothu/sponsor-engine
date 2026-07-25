import {
  listProspectPool,
  getCurrentCycle,
  listCadences,
  listTiers,
  prospectOutreachStatusBulk,
} from "@/lib/data";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { SOURCE_CATALOG, listSourcePerformance } from "./sources";
import { IntakeForm } from "./intake-form";
import { BulkImport } from "./bulk-import";
import type { PoolRowData } from "./pool-row";
import { ProspectPool } from "./prospect-pool";

/**
 * /prospects - the aggressive sourcing pool. Intake (single + bulk), a ranked
 * fit-scored queue with inline signal toggling and notes, and a per-source
 * conversion strip. Everything top-of-funnel lives here.
 */
export default async function ProspectsPage() {
  const cycle = await getCurrentCycle();
  const pool = await listProspectPool();
  const performance = await listSourcePerformance();
  const cadenceOptions = (await listCadences()).map((c) => ({ id: c.id, name: c.name }));
  const tierOptions = (await listTiers(true)).map((t) => ({
    id: t.id,
    name: t.name,
    price: t.price,
  }));

  // Resolve outreach status for all prospects in one bulk call (4 queries total
  // instead of 5 queries per prospect).
  const statusByDeal = await prospectOutreachStatusBulk(
    pool.map((e) => e.newestDeal?.id ?? null),
  );

  const rows: PoolRowData[] = pool.map((entry) => {
    const signals = entry.signals.map((s) => ({
      key: s.key,
      label: s.label,
      weight: s.weight,
      checked: s.checked,
    }));
    const status = statusByDeal.get(entry.newestDeal?.id ?? null)!;
    return {
      companyId: entry.company.id,
      companyName: entry.company.name,
      companyType: entry.company.type,
      priority: entry.priority,
      relationship: entry.relationship,
      compositeRank: entry.compositeRank,
      needsResearch: entry.needsResearch,
      expectedTierId: entry.expectedTier?.id ?? null,
      expectedTierName: entry.expectedTier?.name ?? null,
      canHitAnchor: entry.canHitAnchor,
      website: entry.company.website,
      source: entry.source,
      fitScore: entry.fitScore,
      fitNotes: entry.company.fitNotes,
      signals,
      dealId: entry.newestDeal?.id ?? null,
      dealStage: entry.newestDeal?.stage ?? null,
      cadenceName: status.cadenceName,
      cadenceStep: status.cadenceStep,
      cadenceStepsTotal: status.cadenceStepsTotal,
      lastTouchAt: status.lastTouchAt,
      nextDueDate: status.nextDueDate,
      noTouchYet: status.noTouchYet,
      lastResponsibleStart: entry.lastResponsibleStart,
    };
  });

  const poolSize = rows.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Prospects"
        subtitle={`Top-of-funnel sourcing pool ranked by fit score. Add companies, score their signals, and push the strongest into outreach for ${cycle}.`}
        actions={
          <>
            <BulkImport sources={SOURCE_CATALOG} />
            <IntakeForm sources={SOURCE_CATALOG} />
          </>
        }
      />

      {/* Source-performance strip */}
      <SourceStrip performance={performance} />

      {/* The pool */}
      {poolSize === 0 ? (
        <EmptyPool />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <SectionHeading>Ranked pool</SectionHeading>
            <span className="text-sm text-muted-foreground">
              {poolSize} {poolSize === 1 ? "prospect" : "prospects"}, ranked by
              priority and fit
            </span>
          </div>
          <ProspectPool
            rows={rows}
            sources={SOURCE_CATALOG}
            cadences={cadenceOptions}
            tierOptions={tierOptions}
          />
        </div>
      )}
    </div>
  );
}

function SourceStrip({
  performance,
}: {
  performance: Awaited<ReturnType<typeof listSourcePerformance>>;
}) {
  return (
    <Card className="px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between px-5">
        <SectionHeading>Source performance</SectionHeading>
        <span className="text-sm text-muted-foreground">
          Companies advanced past outreach, per source
        </span>
      </div>

      {performance.length === 0 ? (
        <p className="px-5 text-sm text-muted-foreground">
          No sourced companies yet. As you attribute prospects to a source, their
          conversion shows up here.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 px-5">
          {performance.map((p) => {
            const rate = p.total > 0 ? Math.round((p.advanced / p.total) * 100) : 0;
            return (
              <div
                key={p.key}
                className="rounded-lg border border-border bg-muted p-3"
              >
                <div
                  className="mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground"
                  title={p.label}
                >
                  {p.label}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-xl font-bold text-primary dark:text-lime">
                    {p.advanced}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    / {p.total} advanced
                  </span>
                </div>
                <div className="mt-2 h-[5px] overflow-hidden rounded-full border border-border bg-card">
                  <div
                    className="h-full bg-primary dark:bg-lime"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function EmptyPool() {
  return (
    <Card className="mt-2 items-center border-dashed px-6 py-12 text-center">
      <p className="font-display text-base font-semibold text-foreground">
        The pool is empty
      </p>
      <p className="text-sm text-muted-foreground">
        Add a prospect or bulk-import a list to start building the top of your
        funnel. Companies stay here until you push them into outreach.
      </p>
    </Card>
  );
}
