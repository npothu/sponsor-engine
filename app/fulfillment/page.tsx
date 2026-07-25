import Link from "next/link";
import {
  listDealsWithCompany,
  listDealDeliverables,
  listAllOpenDeliverables,
  listTiers,
  listDeliverableTemplates,
  getCurrentCycle,
} from "@/lib/data";
import type {
  DealWithCompany,
  DealDeliverable,
  DeliverableWithContext,
} from "@/lib/data";
import type { DealStage } from "@/lib/schema";
import { DeliverableItem } from "./_components/deliverable-item";
import { AddDeliverable } from "./_components/add-deliverable";
import { GenerateButton } from "./_components/generate-button";
import { RecapButton } from "./_components/recap-button";
import { TierTemplatesEditor } from "./_components/tier-templates-editor";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SatisfactionBadge } from "@/app/companies/ui";

/** Stages that represent an in-fulfillment or closed-won commitment. */
const FULFILLING_STAGES: readonly DealStage[] = [
  "committed",
  "fulfilling",
  "renewed",
];

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export default async function FulfillmentPage() {
  const cycle = await getCurrentCycle();
  const today = todayIso();

  const deals = (await listDealsWithCompany(cycle)).filter((d) =>
    FULFILLING_STAGES.includes(d.stage as DealStage),
  );

  const deliverablesByDeal = new Map<number, DealDeliverable[]>();
  for (const deal of deals) {
    deliverablesByDeal.set(deal.id, await listDealDeliverables(deal.id));
  }

  // Overdue = open/blocked deliverables with a due date strictly before today.
  const overdue = (await listAllOpenDeliverables())
    .filter((d) => d.dueDate != null && d.dueDate < today)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));

  const activeTiers = await listTiers(true);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fulfillment"
        subtitle={`Track deliverables for every committed sponsor so nothing slips and renewals stay warm. Cycle ${cycle}.`}
      />

      {overdue.length > 0 && <OverduePanel items={overdue} today={today} />}

      {deals.length === 0 ? (
        <Card className="items-center border-dashed py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            No sponsors in fulfillment yet
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Deals move here once they reach committed, fulfilling, or renewed.
            Advance a deal on the{" "}
            <Link
              href="/board"
              className="text-primary underline-offset-4 hover:underline dark:text-lime"
            >
              board
            </Link>{" "}
            to start tracking its deliverables.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 [grid-template-columns:repeat(auto-fill,minmax(380px,1fr))]">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              deliverables={deliverablesByDeal.get(deal.id) ?? []}
              today={today}
            />
          ))}
        </div>
      )}

      <TemplatesSection tiers={activeTiers} />
    </div>
  );
}

function OverduePanel({
  items,
  today,
}: {
  items: DeliverableWithContext[];
  today: string;
}) {
  return (
    <section
      aria-label="Overdue deliverables"
      className="rounded-xl border border-destructive/45 bg-destructive/8 px-5 py-4"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="text-sm font-semibold text-destructive">
          {items.length} overdue deliverable{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((item) => {
          const late = daysBetween(item.dueDate ?? today, today);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-destructive/20 bg-destructive/6 px-2.5 py-2 text-sm"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                <Link
                  href={`/companies/${item.company.id}`}
                  className="text-primary underline-offset-4 hover:underline dark:text-lime"
                >
                  {item.company.name}
                </Link>
                <span className="font-medium text-foreground">
                  {item.title}
                </span>
                {item.owner && (
                  <span className="text-xs text-muted-foreground">
                    {item.owner}
                  </span>
                )}
                {item.status === "blocked" && (
                  <Badge variant="warning">Blocked</Badge>
                )}
              </div>
              <span className="whitespace-nowrap text-xs font-semibold text-destructive">
                {late}d late
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function DealCard({
  deal,
  deliverables,
  today,
}: {
  deal: DealWithCompany;
  deliverables: DealDeliverable[];
  today: string;
}) {
  const total = deliverables.length;
  const doneCount = deliverables.filter((d) => d.status === "done").length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const complete = total > 0 && doneCount === total;
  const templates = deal.tier ? await listDeliverableTemplates(deal.tier.id) : [];

  return (
    <Card className="gap-3.5 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/companies/${deal.company.id}`}
            className="font-display text-base font-semibold text-primary underline-offset-4 hover:underline dark:text-foreground"
          >
            {deal.company.name}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {deal.tier ? (
              <Badge>{deal.tier.name}</Badge>
            ) : (
              <Badge variant="secondary">No tier</Badge>
            )}
            <Badge variant="outline" className="capitalize">
              {deal.stage}
            </Badge>
            <SatisfactionBadge satisfaction={deal.satisfaction} />
          </div>
        </div>
        <RecapButton
          dealId={deal.id}
          companyName={deal.company.name}
          cycle={deal.cycle}
        />
      </div>

      {total > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {doneCount} of {total} done
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                complete
                  ? "gradient-brand h-full rounded-full transition-[width]"
                  : "h-full rounded-full bg-lime transition-[width]"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {total === 0 ? (
        <GenerateButton
          dealId={deal.id}
          companyId={deal.company.id}
          tierName={deal.tier?.name ?? null}
          hasTemplates={templates.length > 0}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {deliverables.map((item) => (
            <DeliverableItem key={item.id} item={item} todayIso={today} />
          ))}
        </div>
      )}

      <AddDeliverable dealId={deal.id} />
    </Card>
  );
}

function TemplatesSection({ tiers }: { tiers: Awaited<ReturnType<typeof listTiers>> }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <SectionHeading>Deliverable templates per tier</SectionHeading>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Define the default checklist each tier generates. Editing templates
          does not change deliverables already generated on a deal.
        </p>
      </div>

      {tiers.length === 0 ? (
        <Card className="px-5 py-5">
          <p className="text-sm text-muted-foreground">
            No active tiers. Activate a tier under{" "}
            <Link
              href="/settings/tiers"
              className="text-primary underline-offset-4 hover:underline dark:text-lime"
            >
              Tiers
            </Link>{" "}
            to define its deliverable templates.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {tiers.map((tier) => (
            <TierTemplatesEditorAsync key={tier.id} tier={tier} />
          ))}
        </div>
      )}
    </section>
  );
}

async function TierTemplatesEditorAsync({
  tier,
}: {
  tier: Awaited<ReturnType<typeof listTiers>>[number];
}) {
  const templates = await listDeliverableTemplates(tier.id);
  return <TierTemplatesEditor tier={tier} templates={templates} />;
}
