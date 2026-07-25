import Link from "next/link";
import { channelLabel, formatDate, formatDollars, stageLabel, type RelationshipState } from "./lib";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Per-company "state of the relationship" card: status, deal history across
 * cycles, contact roster, touchpoint stats, last deck seen, what is owed, and
 * open next actions.
 */
export function CompanyCard({ state }: { state: RelationshipState }) {
  const { detail, latestTouchpoint, touchpointCount, firstTouchAt, lastTouchAt, deliverables } =
    state;
  const { company, contacts, deals, openActions } = detail;
  const primaryDeal = deals[0] ?? null;

  return (
    <Card className="px-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={`/companies/${company.id}`}
            className="font-display text-lg font-semibold text-primary hover:underline dark:text-foreground"
          >
            {company.name}
          </Link>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Badge variant="secondary">
              {company.type === "corporate" ? "Corporate" : "Community"}
            </Badge>
            {primaryDeal ? (
              <Badge variant="default">
                {stageLabel(primaryDeal.stage)} - {primaryDeal.cycle}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>{touchpointCount} touchpoints</div>
          <div className="mt-0.5">
            {firstTouchAt ? `${formatDate(firstTouchAt)} - ${formatDate(lastTouchAt)}` : "No touchpoints yet"}
          </div>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground">{statusLine(state)}</p>

      <div className="grid grid-cols-2 gap-4">
        <Section title="Deal history">
          {deals.length === 0 ? (
            <Empty text="No deals." />
          ) : (
            <div className="space-y-1.5">
              {deals.map((d) => (
                <div key={d.id} className="flex justify-between text-sm">
                  <span>
                    {d.cycle} - {stageLabel(d.stage)}
                    {d.tier ? ` (${d.tier.name})` : ""}
                  </span>
                  <span className="text-muted-foreground">{formatDollars(d.askAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Contact roster">
          {contacts.length === 0 ? (
            <Empty text="No contacts on file." />
          ) : (
            <div className="space-y-1.5">
              {contacts.map((c) => (
                <div key={c.id} className="text-sm">
                  <span>{c.name}</span>
                  {c.role ? <span className="text-muted-foreground"> - {c.role}</span> : null}
                  <span className="text-muted-foreground"> ({c.warmth})</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Deck and last touch">
          <div className="space-y-1.5 text-sm">
            <div>
              {latestTouchpoint
                ? `${channelLabel(latestTouchpoint.channel)} on ${formatDate(latestTouchpoint.occurredAt)}`
                : "No touchpoints logged"}
            </div>
            <div className="text-muted-foreground">
              {latestTouchpoint?.deckVersion
                ? `Last deck seen: ${latestTouchpoint.deckVersion.label}`
                : "No deck version on record"}
            </div>
          </div>
        </Section>

        <Section title="What is owed">
          {deliverables.length === 0 ? (
            <Empty text="No open deliverables." />
          ) : (
            <div className="space-y-1.5">
              {deliverables.map((d) => (
                <div key={d.id} className="flex justify-between text-sm">
                  <span>
                    {d.title}
                    {d.owner ? <span className="text-muted-foreground"> ({d.owner})</span> : null}
                  </span>
                  <span className="text-muted-foreground">{d.dueDate ? formatDate(d.dueDate) : d.status}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Open next actions">
        {openActions.length === 0 ? (
          <Empty text="No open next actions." />
        ) : (
          <div className="space-y-1.5">
            {openActions.map((a) => (
              <div key={a.id} className="flex justify-between text-sm">
                <span>{a.title}</span>
                <span className="text-muted-foreground">Due {formatDate(a.dueDate)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Card>
  );
}

function statusLine(state: RelationshipState): string {
  const { detail, latestTouchpoint } = state;
  const { deals } = detail;
  const primaryDeal = deals[0] ?? null;

  if (!primaryDeal) return "No deal on record for this company.";

  const stagePart = `Currently ${stageLabel(primaryDeal.stage).toLowerCase()} in ${primaryDeal.cycle}`;
  const touchPart = latestTouchpoint
    ? `, last contacted via ${channelLabel(latestTouchpoint.channel)} on ${formatDate(latestTouchpoint.occurredAt)}`
    : ", no touchpoints logged yet";
  return `${stagePart}${touchPart}.`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
