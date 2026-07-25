import {
  listDueActions,
  composeForAction,
  type DueAction,
} from "@/lib/data";
import { ActionRow } from "./action-row";
import { SectionHeading } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDueDate(dueDate: string): Date {
  // dueDate is stored as an ISO date/datetime string; normalize to local midnight
  // for the string's date portion so day-boundary comparisons are stable.
  const datePart = dueDate.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

interface Grouped {
  overdue: DueAction[];
  dueToday: DueAction[];
  dueThisWeek: DueAction[];
}

/** high -> medium -> low; unknown priorities sort last, matching the data layer. */
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority] ?? 3;
}

/** Days a due date is overdue relative to local midnight today (0 if not past). */
function daysOverdue(dueDate: string): number {
  const due = parseDueDate(dueDate).getTime();
  const today = startOfToday().getTime();
  if (due >= today) return 0;
  return Math.floor((today - due) / 86_400_000);
}

/**
 * An overdue action escalates when it is high priority AND at least this many
 * days overdue - the "past a threshold" flag the roadmap calls for.
 */
const ESCALATE_OVERDUE_DAYS = 7;

function isEscalated(action: DueAction): boolean {
  return (
    action.company.priority === "high" &&
    daysOverdue(action.dueDate) >= ESCALATE_OVERDUE_DAYS
  );
}

/**
 * Order a group by company priority first, then by due date within a priority
 * band, so the most-wanted companies rise to the top of each bucket. Actions
 * arrive already sorted by due date, so the compare stays stable on ties.
 */
function byPriorityThenDue(actions: DueAction[]): DueAction[] {
  return [...actions].sort(
    (a, b) =>
      priorityRank(a.company.priority) - priorityRank(b.company.priority) ||
      a.dueDate.localeCompare(b.dueDate),
  );
}

function groupActions(actions: DueAction[]): Grouped {
  const today = startOfToday();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const overdue: DueAction[] = [];
  const dueToday: DueAction[] = [];
  const dueThisWeek: DueAction[] = [];

  for (const action of actions) {
    const due = parseDueDate(action.dueDate);
    if (due < today) {
      overdue.push(action);
    } else if (due.getTime() === today.getTime()) {
      dueToday.push(action);
    } else if (due < weekEnd) {
      dueThisWeek.push(action);
    }
  }

  return {
    overdue: byPriorityThenDue(overdue),
    dueToday: byPriorityThenDue(dueToday),
    dueThisWeek: byPriorityThenDue(dueThisWeek),
  };
}

function ActionGroup({
  title,
  actions,
  emptyLabel,
  tone,
  composableIds,
}: {
  title: string;
  actions: DueAction[];
  emptyLabel: string;
  tone?: "danger";
  composableIds: Set<number>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SectionHeading
          className={cn(tone === "danger" && "text-destructive dark:text-destructive")}
        >
          {title}
        </SectionHeading>
        <Badge variant={tone === "danger" ? "destructive" : "default"}>
          {actions.length}
        </Badge>
      </div>
      {actions.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              composable={composableIds.has(action.id)}
              escalated={isEscalated(action)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export async function ActionGroups() {
  const actions = await listDueActions();
  const { overdue, dueToday, dueThisWeek } = groupActions(actions);

  // Precompute which actions have a cadence-step template to compose from, so
  // each row only shows the Compose button when there is something to render.
  const composableResults = await Promise.all(
    actions.map(async (a) => [a.id, (await composeForAction(a.id)) != null] as const),
  );
  const composableIds = new Set(
    composableResults.filter(([, has]) => has).map(([id]) => id),
  );

  return (
    <div className="flex flex-col gap-6">
      <ActionGroup
        title="Overdue"
        actions={overdue}
        emptyLabel="Nothing overdue. Nice."
        tone="danger"
        composableIds={composableIds}
      />
      <ActionGroup
        title="Due today"
        actions={dueToday}
        emptyLabel="Nothing due today."
        composableIds={composableIds}
      />
      <ActionGroup
        title="Due this week"
        actions={dueThisWeek}
        emptyLabel="Nothing else due this week."
        composableIds={composableIds}
      />
    </div>
  );
}

export default ActionGroups;
