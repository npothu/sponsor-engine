"use client";

import { useState } from "react";
import type { NextAction } from "@/lib/schema";
import type { DealWithTier } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate, dueTone, todayInputValue } from "../ui";
import {
  createNextActionAction,
  completeNextActionAction,
  snoozeNextActionAction,
} from "../actions";

/**
 * Open next actions for the company's deals. Enforces (visually) the next-action
 * invariant by warning when an active deal has no open action.
 */
export function ActionsSection({
  companyId,
  openActions,
  deals,
  activeDealMissingAction,
}: {
  companyId: number;
  openActions: NextAction[];
  deals: DealWithTier[];
  activeDealMissingAction: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const primaryDealId = deals[0]?.id ?? "";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Open next actions</CardTitle>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            + Add action
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {activeDealMissingAction && openActions.length === 0 && (
          <div className="rounded-lg bg-(--tier-gold-bg) px-3 py-2.5 text-xs text-(--tier-gold-fg)">
            This active deal has no open next action. Add one to keep it moving.
          </div>
        )}

        {adding && (
          <form
            action={async (fd) => {
              await createNextActionAction(fd);
              setAdding(false);
            }}
            className="rounded-lg border bg-muted/40 p-4"
          >
            <input type="hidden" name="companyId" value={companyId} />
            <div className="grid gap-3">
              <div>
                <Label htmlFor="na-title">Action</Label>
                <Input
                  id="na-title"
                  name="title"
                  required
                  placeholder="Follow up on proposal"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="na-due">Due date</Label>
                  <Input
                    id="na-due"
                    name="dueDate"
                    type="date"
                    required
                    defaultValue={todayInputValue()}
                  />
                </div>
                <div>
                  <Label htmlFor="na-deal">Deal</Label>
                  <Select
                    id="na-deal"
                    name="dealId"
                    defaultValue={primaryDealId}
                    required
                  >
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.cycle} · {d.stage}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="na-owner">Owner (optional)</Label>
                <Input
                  id="na-owner"
                  name="owner"
                  placeholder="Who is doing this, e.g. Alex"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit" size="sm">
                Add action
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {openActions.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No open actions.</p>
        ) : (
          <div className="grid gap-2.5">
            {openActions.map((a) => (
              <ActionRow key={a.id} companyId={companyId} action={a} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionRow({
  companyId,
  action,
}: {
  companyId: number;
  action: NextAction;
}) {
  const tone = dueTone(action.dueDate);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{action.title}</div>
        <div
          className={
            "mt-0.5 text-xs " +
            (tone === "overdue"
              ? "text-destructive"
              : tone === "today"
                ? "text-info"
                : "text-muted-foreground")
          }
        >
          {tone === "overdue"
            ? "Overdue · "
            : tone === "today"
              ? "Due today · "
              : "Due "}
          {formatDate(action.dueDate)}
          {action.owner && (
            <span className="text-muted-foreground"> · {action.owner}</span>
          )}
          {action.createdBy === "cadence" && (
            <span className="text-muted-foreground"> · from cadence</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <form action={snoozeNextActionAction}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="actionId" value={action.id} />
          <input type="hidden" name="days" value="3" />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            title="Push due date out 3 days"
          >
            Snooze 3d
          </Button>
        </form>
        <form action={completeNextActionAction}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="actionId" value={action.id} />
          <Button type="submit" size="sm">
            Complete
          </Button>
        </form>
      </div>
    </div>
  );
}
