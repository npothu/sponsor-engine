"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import type { Addon, Contact, Tier } from "@/lib/schema";
import type { DealWithTier } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_LABEL,
  DEAL_SATISFACTIONS,
  DEAL_SATISFACTION_LABEL,
  DEAL_STAGES,
  STAGE_LABEL,
  formatMoney,
} from "../ui";
import { GotReplyButton } from "./got-reply-button";
import { ProposalButton } from "./proposal-button";
import {
  updateDealStageAction,
  updateDealTermsAction,
  setDealAddonsAction,
  setDealSatisfactionAction,
  recycleDealAction,
  removeDealFromCycleAction,
} from "../actions";

/**
 * The deal panel on a company profile: stage selector (auto-submits), plus
 * editable ask/tier/cycle/custom-terms and a la carte add-on checkboxes.
 */
export function DealPanel({
  companyId,
  companyName,
  deal,
  tiers,
  addons,
  contacts,
  selectedAddonIds,
}: {
  companyId: number;
  companyName: string;
  deal: DealWithTier;
  tiers: Tier[];
  addons: Addon[];
  contacts: Contact[];
  selectedAddonIds: number[];
}) {
  const [editing, setEditing] = useState(false);
  const [pendingRemove, startRemove] = useTransition();
  // Track the stage selection so a move to 'lapsed' can prompt for a loss reason
  // inline before submitting (the reason is what powers next-cycle re-approach).
  const [stage, setStage] = useState(deal.stage);
  // The chosen loss reason; a timing/budget loss additionally offers a dated
  // re-ask so the loss becomes a scheduled future re-approach.
  const [lostReason, setLostReason] = useState(deal.lostReason ?? "");
  const selected = new Set(selectedAddonIds);
  const offersReAsk = lostReason === "timing" || lostReason === "budget";

  function removeFromCycle() {
    if (pendingRemove) return;
    if (
      !window.confirm(
        `Remove this company from the ${deal.cycle} cycle? This deletes the ${deal.stage} deal.`,
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("companyId", String(companyId));
    fd.set("dealId", String(deal.id));
    startRemove(() => removeDealFromCycleAction(fd));
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Deal · {deal.cycle}</CardTitle>
        <div className="flex items-center gap-2">
          <ProposalButton
            dealId={deal.id}
            companyName={companyName}
            cycle={deal.cycle}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Done" : "Edit terms"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendingRemove}
            onClick={removeFromCycle}
            aria-label={`Remove from ${deal.cycle}`}
            title={`Remove from ${deal.cycle}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Stage selector - submits on change, except a move to 'lapsed' first
            prompts for a structured loss reason (see below). */}
        {(() => {
          const lapsing = stage === "lapsed" && deal.stage !== "lapsed";
          return (
            <form action={updateDealStageAction} id="stage-form">
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="dealId" value={deal.id} />
              <Label htmlFor="deal-stage">Stage</Label>
              <Select
                id="deal-stage"
                name="stage"
                value={stage}
                onChange={(e) => {
                  const next = e.target.value;
                  setStage(next);
                  // Defer submit when lapsing so the reason prompt can appear.
                  if (!(next === "lapsed" && deal.stage !== "lapsed")) {
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </Select>

              {lapsing && (
                <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <Label htmlFor="deal-lost-reason">Why did it lapse?</Label>
                  <Select
                    id="deal-lost-reason"
                    name="lostReason"
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                  >
                    <option value="">No reason given</option>
                    {DEAL_LOST_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {DEAL_LOST_REASON_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Recording why a deal died lets a successor re-approach timing
                    and budget losses next cycle with context.
                  </p>

                  {offersReAsk && (
                    <div className="mt-3">
                      <Label htmlFor="deal-reask-on">
                        Ask again on (arms a dated re-ask)
                      </Label>
                      <Input id="deal-reask-on" name="reAskOn" type="date" />
                      <Input
                        className="mt-2"
                        name="reAskReason"
                        placeholder="Re-ask reason (optional)"
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        A {lostReason} loss is a deferral, not a dead end - set a
                        date and this company resurfaces on Today when the window
                        reopens.
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Button type="submit" size="sm" variant="destructive">
                      Mark lapsed
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStage(deal.stage);
                        setLostReason(deal.lostReason ?? "");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </form>
          );
        })()}

        {/* Got-a-reply shortcut: logs inbound, detaches cadence, offers advance. */}
        <div className="mt-3">
          <GotReplyButton
            companyId={companyId}
            dealId={deal.id}
            stage={deal.stage}
          />
        </div>

        {/* Sponsor-satisfaction signal - orders the rollover renewal queue and
            badges this deal on the fulfillment card. Auto-submits on change. */}
        <div className="mt-3">
          <Label htmlFor="deal-satisfaction">Sponsor satisfaction</Label>
          <Select
            id="deal-satisfaction"
            value={deal.satisfaction ?? ""}
            onChange={(e) =>
              setDealSatisfactionAction(companyId, deal.id, e.target.value)
            }
          >
            <option value="">Not assessed</option>
            {DEAL_SATISFACTIONS.map((s) => (
              <option key={s} value={s}>
                {DEAL_SATISFACTION_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>

        {/* Recycle a lapsed deal into the active cycle: clones its context into a
            fresh prospect deal so a timing/budget loss gets re-approached. */}
        {deal.stage === "lapsed" && (
          <div className="mt-3 rounded-lg border border-border bg-muted p-3">
            <p className="text-sm font-semibold text-foreground">
              Recycle to the next cycle
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clone this lapsed deal&apos;s context into a fresh prospect deal in
              the active cycle, with a re-approach action. The lapsed deal stays
              intact.
            </p>
            <form
              action={recycleDealAction.bind(null, companyId, deal.id)}
              className="mt-2"
            >
              <Button type="submit" size="sm" variant="outline">
                Recycle to active cycle
              </Button>
            </form>
          </div>
        )}

        {!editing ? (
          <dl className="mt-4 grid gap-3">
            <Row label="Ask amount">{formatMoney(deal.askAmount)}</Row>
            <Row label="Target tier">
              {deal.tier ? (
                <span>
                  {deal.tier.name}
                  <span className="ml-1.5 text-muted-foreground">
                    {formatMoney(deal.tier.price)}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="Custom terms">
              {deal.customTerms ? (
                deal.customTerms
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="Champion">
              {(() => {
                const champion = contacts.find(
                  (c) => c.id === deal.championContactId,
                );
                return champion ? (
                  champion.name
                ) : (
                  <span className="text-muted-foreground">—</span>
                );
              })()}
            </Row>
            {deal.lostReason && (
              <Row label="Lost reason">
                {DEAL_LOST_REASON_LABEL[
                  deal.lostReason as keyof typeof DEAL_LOST_REASON_LABEL
                ] ?? deal.lostReason}
              </Row>
            )}
          </dl>
        ) : (
          <form action={updateDealTermsAction} className="mt-4">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="dealId" value={deal.id} />
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="deal-cycle">Cycle</Label>
                  <Input
                    id="deal-cycle"
                    name="cycle"
                    defaultValue={deal.cycle}
                  />
                </div>
                <div>
                  <Label htmlFor="deal-ask">Ask amount</Label>
                  <Input
                    id="deal-ask"
                    name="askAmount"
                    inputMode="numeric"
                    placeholder="3000"
                    defaultValue={deal.askAmount ?? ""}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="deal-tier">Target tier</Label>
                <Select
                  id="deal-tier"
                  name="targetTierId"
                  defaultValue={deal.targetTierId ?? ""}
                >
                  <option value="">No tier</option>
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {formatMoney(t.price)}
                      {t.active ? "" : " (legacy)"}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="deal-champion">Champion</Label>
                <Select
                  id="deal-champion"
                  name="championContactId"
                  defaultValue={deal.championContactId ?? ""}
                >
                  <option value="">No champion</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="deal-terms">Custom terms</Label>
                <Textarea
                  id="deal-terms"
                  name="customTerms"
                  rows={3}
                  defaultValue={deal.customTerms ?? ""}
                  placeholder="Anything negotiated outside the standard tier"
                />
              </div>
            </div>
            <div className="mt-4">
              <Button type="submit" size="sm">
                Save terms
              </Button>
            </div>
          </form>
        )}

        {/* A la carte add-ons - checkboxes that replace the full set on submit. */}
        <Separator className="my-5" />
        <form action={setDealAddonsAction}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="dealId" value={deal.id} />
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-base font-semibold text-primary dark:text-foreground">
              A la carte add-ons
            </span>
            <Button type="submit" variant="outline" size="sm">
              Save add-ons
            </Button>
          </div>
          {addons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No add-ons defined yet.
            </p>
          ) : (
            <div className="grid gap-2">
              {addons.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-start gap-2.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="addonId"
                    value={a.id}
                    defaultChecked={selected.has(a.id)}
                    className="mt-0.5 size-4 accent-primary"
                  />
                  <span>
                    <span className="font-medium">{a.name}</span>
                    {a.priceNote && (
                      <span className="ml-1.5 text-muted-foreground">
                        {a.priceNote}
                      </span>
                    )}
                    {a.description && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {a.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm">{children}</dd>
    </div>
  );
}
