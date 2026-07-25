"use client";

import { useState } from "react";
import type { Contact, DeckVersion } from "@/lib/schema";
import type { DealWithTier, TouchpointDetail } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  CHANNEL_ICON,
  CHANNEL_LABEL,
  CHANNELS,
  DIRECTION_LABEL,
  formatDateTime,
  todayInputValue,
} from "../ui";
import { logTouchpointAction } from "../actions";
import type { TouchpointChannel } from "@/lib/schema";

/**
 * Chronological touchpoint timeline plus an inline "log touchpoint" form. Newest
 * touchpoints are first (data layer returns them descending).
 */
export function TimelineSection({
  companyId,
  touchpoints,
  deals,
  contacts,
  deckVersions,
}: {
  companyId: number;
  touchpoints: TouchpointDetail[];
  deals: DealWithTier[];
  contacts: Contact[];
  deckVersions: DeckVersion[];
}) {
  const [logging, setLogging] = useState(false);
  const primaryDealId = deals[0]?.id ?? "";
  const currentDeck = deckVersions.find((d) => d.isCurrent);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Touchpoint timeline</CardTitle>
        {!logging && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLogging(true)}
          >
            + Log touchpoint
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {logging && (
          <form
            action={async (fd) => {
              await logTouchpointAction(fd);
              setLogging(false);
            }}
            className="mb-6 rounded-lg border bg-muted/40 p-4"
          >
            <input type="hidden" name="companyId" value={companyId} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="tp-channel">Channel</Label>
                <Select id="tp-channel" name="channel" defaultValue="email">
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {CHANNEL_LABEL[c as TouchpointChannel]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tp-direction">Direction</Label>
                <Select
                  id="tp-direction"
                  name="direction"
                  defaultValue="outbound"
                >
                  <option value="outbound">Outbound</option>
                  <option value="inbound">Inbound</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="tp-date">Date</Label>
                <Input
                  id="tp-date"
                  name="occurredAt"
                  type="date"
                  defaultValue={todayInputValue()}
                />
              </div>
              <div>
                <Label htmlFor="tp-contact">Contact</Label>
                <Select id="tp-contact" name="contactId" defaultValue="">
                  <option value="">— none —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tp-deal">Deal</Label>
                <Select
                  id="tp-deal"
                  name="dealId"
                  defaultValue={primaryDealId}
                >
                  <option value="">— none —</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.cycle} · {d.stage}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="tp-deck">Deck shared</Label>
                <Select id="tp-deck" name="deckVersionId" defaultValue="">
                  <option value="">— none —</option>
                  {deckVersions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                      {d.isCurrent ? " (current)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="tp-summary">Summary</Label>
                <Input
                  id="tp-summary"
                  name="summary"
                  placeholder="What happened"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="tp-outcome">Outcome</Label>
                <Input
                  id="tp-outcome"
                  name="outcome"
                  placeholder="Result, next step, sentiment"
                />
              </div>
            </div>
            {currentDeck && (
              <p className="mt-2.5 text-xs text-muted-foreground">
                Current deck is {currentDeck.label}.
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm">
                Log touchpoint
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLogging(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {touchpoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No touchpoints logged yet.
          </p>
        ) : (
          <ol className="m-0 list-none p-0">
            {touchpoints.map((t, i) => (
              <TimelineItem
                key={t.id}
                tp={t}
                isLast={i === touchpoints.length - 1}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineItem({
  tp,
  isLast,
}: {
  tp: TouchpointDetail;
  isLast: boolean;
}) {
  const channel = tp.channel as TouchpointChannel;
  const isInbound = tp.direction === "inbound";
  return (
    <li className="relative flex gap-3.5 pb-6 last:pb-0">
      {/* Vertical connector line. */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 bottom-0 w-px bg-border"
        />
      )}
      {/* Dot marker - lime for inbound (positive) events. */}
      <div
        aria-hidden
        className={
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm text-primary-foreground " +
          (isInbound ? "bg-lime" : "bg-primary")
        }
        title={CHANNEL_LABEL[channel] ?? tp.channel}
      >
        {CHANNEL_ICON[channel] ?? "•"}
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            {CHANNEL_LABEL[channel] ?? tp.channel}
          </span>
          <Badge variant={isInbound ? "lime" : "outline"}>
            {DIRECTION_LABEL[tp.direction as "inbound" | "outbound"] ??
              tp.direction}
          </Badge>
          {tp.contact && (
            <span className="text-sm text-muted-foreground">
              with {tp.contact.name}
            </span>
          )}
          {tp.deckVersion && (
            <Badge variant="info" title="Deck shared">
              {tp.deckVersion.label}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDateTime(tp.occurredAt)}
          </span>
        </div>
        {tp.summary && <p className="mt-1.5 text-sm">{tp.summary}</p>}
        {tp.outcome && (
          <p className="mt-1 text-sm text-muted-foreground">→ {tp.outcome}</p>
        )}
      </div>
    </li>
  );
}
