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
  dateTimeInputValue,
  formatDateTime,
} from "../ui";
import { logTouchpointAction, updateTouchpointAction } from "../actions";
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
          <div className="mb-6 rounded-lg border bg-muted/40 p-4">
            <TouchpointForm
              companyId={companyId}
              deals={deals}
              contacts={contacts}
              deckVersions={deckVersions}
              defaultDealId={primaryDealId}
              currentDeck={currentDeck}
              action={logTouchpointAction}
              submitLabel="Log touchpoint"
              onDone={() => setLogging(false)}
            />
          </div>
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
                companyId={companyId}
                deals={deals}
                contacts={contacts}
                deckVersions={deckVersions}
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Shared create/edit form. `touchpoint` switches it into edit mode: every field
 * prefills from the row and the hidden id routes the submit to the update action.
 */
function TouchpointForm({
  companyId,
  deals,
  contacts,
  deckVersions,
  defaultDealId,
  currentDeck,
  touchpoint,
  action,
  submitLabel,
  onDone,
}: {
  companyId: number;
  deals: DealWithTier[];
  contacts: Contact[];
  deckVersions: DeckVersion[];
  defaultDealId?: number | "";
  currentDeck?: DeckVersion;
  touchpoint?: TouchpointDetail;
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  onDone: () => void;
}) {
  // Field ids must be unique per rendered form - several can be open at once.
  const uid = touchpoint ? `tp-${touchpoint.id}` : "tp-new";

  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      {touchpoint && (
        <input type="hidden" name="touchpointId" value={touchpoint.id} />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${uid}-channel`}>Channel</Label>
          <Select
            id={`${uid}-channel`}
            name="channel"
            defaultValue={touchpoint?.channel ?? "email"}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c as TouchpointChannel]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${uid}-direction`}>Direction</Label>
          <Select
            id={`${uid}-direction`}
            name="direction"
            defaultValue={touchpoint?.direction ?? "outbound"}
          >
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${uid}-date`}>Date</Label>
          <Input
            id={`${uid}-date`}
            name="occurredAt"
            type="datetime-local"
            defaultValue={dateTimeInputValue(touchpoint?.occurredAt)}
          />
        </div>
        <div>
          <Label htmlFor={`${uid}-contact`}>Contact</Label>
          <Select
            id={`${uid}-contact`}
            name="contactId"
            defaultValue={touchpoint?.contactId ?? ""}
          >
            <option value="">— none —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${uid}-deal`}>Deal</Label>
          <Select
            id={`${uid}-deal`}
            name="dealId"
            defaultValue={
              touchpoint ? touchpoint.dealId ?? "" : defaultDealId ?? ""
            }
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
          <Label htmlFor={`${uid}-deck`}>Deck shared</Label>
          <Select
            id={`${uid}-deck`}
            name="deckVersionId"
            defaultValue={touchpoint?.deckVersionId ?? ""}
          >
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
          <Label htmlFor={`${uid}-summary`}>Summary</Label>
          <Input
            id={`${uid}-summary`}
            name="summary"
            placeholder="What happened"
            defaultValue={touchpoint?.summary ?? ""}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor={`${uid}-outcome`}>Outcome</Label>
          <Input
            id={`${uid}-outcome`}
            name="outcome"
            placeholder="Result, next step, sentiment"
            defaultValue={touchpoint?.outcome ?? ""}
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
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TimelineItem({
  tp,
  isLast,
  companyId,
  deals,
  contacts,
  deckVersions,
}: {
  tp: TouchpointDetail;
  isLast: boolean;
  companyId: number;
  deals: DealWithTier[];
  contacts: Contact[];
  deckVersions: DeckVersion[];
}) {
  const [editing, setEditing] = useState(false);
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
        {editing ? (
          <div className="rounded-lg border bg-muted/40 p-4">
            <TouchpointForm
              companyId={companyId}
              deals={deals}
              contacts={contacts}
              deckVersions={deckVersions}
              touchpoint={tp}
              action={updateTouchpointAction}
              submitLabel="Save"
              onDone={() => setEditing(false)}
            />
          </div>
        ) : (
          <>
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-my-1 h-auto px-2 py-1 text-xs"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            </div>
            {tp.summary && <p className="mt-1.5 text-sm">{tp.summary}</p>}
            {tp.outcome && (
              <p className="mt-1 text-sm text-muted-foreground">
                → {tp.outcome}
              </p>
            )}
          </>
        )}
      </div>
    </li>
  );
}
