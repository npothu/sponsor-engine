import Link from "next/link";
import { formatISO, parseISO, differenceInCalendarDays } from "date-fns";
import {
  listCadences,
  listDealsWithCompany,
  listDueActions,
  listTemplates,
  type CadenceWithSteps,
  type DueAction,
} from "@/lib/data";
import type { DealStage } from "@/lib/schema";
import { createCadenceAction, updateCadenceAction } from "./actions";
import { StepsEditor } from "./steps-editor";
import { AssignPanel, type AssignableDeal } from "./assign-panel";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

/** Stages whose deals are eligible to be driven by a cadence. */
const ASSIGNABLE_STAGES: DealStage[] = ["prospect", "outreach", "conversation"];

function todayIso(): string {
  return formatISO(new Date(), { representation: "date" });
}

function formatDate(iso: string): string {
  try {
    return parseISO(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function dueLabel(dueDate: string): { text: string; overdue: boolean } {
  const days = differenceInCalendarDays(parseISO(dueDate), parseISO(todayIso()));
  if (days < 0) {
    const n = Math.abs(days);
    return { text: `${n} day${n === 1 ? "" : "s"} overdue`, overdue: true };
  }
  if (days === 0) return { text: "Due today", overdue: false };
  return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, overdue: false };
}

export default async function CadencesPage() {
  const cadences = await listCadences();
  const templates = await listTemplates();

  const assignableDeals: AssignableDeal[] = (await listDealsWithCompany())
    .filter((d) => (ASSIGNABLE_STAGES as string[]).includes(d.stage))
    .map((d) => ({
      dealId: d.id,
      companyId: d.company.id,
      companyName: d.company.name,
      cycle: d.cycle,
      stage: d.stage,
      cadenceId: d.cadenceId,
      cadenceName:
        d.cadenceId != null
          ? (cadences.find((c) => c.id === d.cadenceId)?.name ?? null)
          : null,
    }));

  const cadenceActions = (await listDueActions()).filter(
    (a) => a.createdBy === "cadence",
  );
  const today = todayIso();
  const overdue = cadenceActions.filter((a) => a.dueDate < today);
  const upcoming = cadenceActions.filter((a) => a.dueDate >= today);

  return (
    <div>
      <PageHeader
        title="Cadences"
        subtitle="Follow-up sequences that keep deals moving and next actions scheduled."
      />

      <div className="space-y-8">
        <section className="space-y-3">
          <SectionHeading>Cadence queue</SectionHeading>
          <QueueColumns overdue={overdue} upcoming={upcoming} />
        </section>

        <section className="space-y-3">
          <SectionHeading>Assign to active deals</SectionHeading>
          <Card>
            <CardContent>
              <AssignPanel deals={assignableDeals} cadences={cadences} />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionHeading>Cadences &amp; steps</SectionHeading>

          <Card>
            <CardContent>
              <form
                action={createCadenceAction}
                className="flex flex-wrap items-end gap-4"
              >
                <div className="min-w-0 flex-1">
                  <Label htmlFor="new-cadence-name">New cadence name</Label>
                  <Input
                    id="new-cadence-name"
                    name="name"
                    placeholder="e.g. Corporate cold outreach"
                    required
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Label htmlFor="new-cadence-desc">Description</Label>
                  <Input
                    id="new-cadence-desc"
                    name="description"
                    placeholder="Optional"
                  />
                </div>
                <Button type="submit" className="shrink-0">
                  Create cadence
                </Button>
              </form>
            </CardContent>
          </Card>

          {cadences.length === 0 ? (
            <Card className="border-dashed">
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  No cadences yet. Create one above, then add steps to schedule
                  automatic follow-ups.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {cadences.map((c) => (
                <CadenceCard key={c.id} cadence={c} templates={templates} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function QueueColumns({
  overdue,
  upcoming,
}: {
  overdue: DueAction[];
  upcoming: DueAction[];
}) {
  if (overdue.length === 0 && upcoming.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No cadence-scheduled follow-ups right now. Assign a cadence to a deal
            and log an outbound touchpoint to start the sequence.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-3 rounded-xl bg-muted p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Overdue</span>
          <Badge variant="destructive">{overdue.length}</Badge>
        </div>
        {overdue.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing overdue.</p>
        ) : (
          <ul className="space-y-2">
            {overdue.map((a) => (
              <QueueItem key={a.id} action={a} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-xl bg-muted p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Upcoming</span>
          <Badge>{upcoming.length}</Badge>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing upcoming.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => (
              <QueueItem key={a.id} action={a} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function QueueItem({ action }: { action: DueAction }) {
  const { text, overdue } = dueLabel(action.dueDate);
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{action.title}</span>
        <Link
          href={`/companies/${action.company.id}`}
          className="text-sm text-primary underline-offset-4 hover:underline dark:text-lime"
        >
          {action.company.name}
        </Link>
      </div>
      <div className="flex flex-col items-end gap-0.5 whitespace-nowrap text-xs">
        <span
          className={
            overdue
              ? "font-semibold text-destructive"
              : "text-muted-foreground"
          }
        >
          {text}
        </span>
        <span className="text-muted-foreground">{formatDate(action.dueDate)}</span>
      </div>
    </li>
  );
}

function CadenceCard({
  cadence,
  templates,
}: {
  cadence: CadenceWithSteps;
  templates: Awaited<ReturnType<typeof listTemplates>>;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <form
          action={updateCadenceAction}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="cadenceId" value={cadence.id} />
          <div className="flex min-w-0 flex-1 flex-wrap gap-3">
            <Input
              className="flex-[0_0_40%] min-w-40 font-semibold"
              name="name"
              defaultValue={cadence.name}
              aria-label="Cadence name"
            />
            <Input
              className="min-w-0 flex-1"
              name="description"
              defaultValue={cadence.description ?? ""}
              placeholder="Description"
              aria-label="Cadence description"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="shrink-0">
            Save
          </Button>
        </form>

        <Separator />

        <StepsEditor
          cadenceId={cadence.id}
          steps={cadence.steps}
          templates={templates}
        />
      </CardContent>
    </Card>
  );
}
