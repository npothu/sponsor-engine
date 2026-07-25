"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { logTouchAction, type LogTouchFormState } from "./actions";
import type {
  CompanyOption,
  ContactOption,
  DealOption,
  TemplateOption,
} from "./queries";
import type { DeckVersion } from "@/lib/schema";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const CHANNELS: { value: string; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "career_fair", label: "Career fair" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "discord", label: "Discord" },
  { value: "other", label: "Other" },
];

const DIRECTIONS: { value: string; label: string }[] = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];

function nowForInput(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

const initialState: LogTouchFormState = { ok: false };

export interface LogFormProps {
  companies: CompanyOption[];
  contacts: ContactOption[];
  deals: DealOption[];
  deckVersions: DeckVersion[];
  templates: TemplateOption[];
  /** "modal" keeps the compact QuickLog layout; "inline" is the Backfill full-page layout with a prominent date field. */
  variant?: "modal" | "inline";
  /** Called after a successful submit (e.g. to close the modal). Inline form ignores this and just resets/stays open. */
  onSuccess?: () => void;
}

/**
 * Shared touchpoint logging form, used by both the QuickLog header modal and
 * the /backfill rapid-entry page. Renders a small "logged!" confirmation and
 * resets itself on every successful submit so it's ready for the next entry.
 */
export function LogForm({
  companies,
  contacts,
  deals,
  deckVersions,
  templates,
  variant = "modal",
  onSuccess,
}: LogFormProps) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    logTouchAction,
    initialState,
  );

  const [companyId, setCompanyId] = useState<string>("");
  const [companySearch, setCompanySearch] = useState("");
  const [dealId, setDealId] = useState<string>("");
  const [direction, setDirection] = useState<string>("outbound");
  const [occurredAt, setOccurredAt] = useState(nowForInput());
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, companySearch]);

  const companyContacts = useMemo(
    () => contacts.filter((c) => String(c.companyId) === companyId),
    [contacts, companyId],
  );

  const companyDeals = useMemo(
    () => deals.filter((d) => String(d.companyId) === companyId),
    [deals, companyId],
  );

  // Reset the form (but not the company, for inline rapid entry) after a
  // successful submit so you can log the next touch immediately. Adjusting
  // state during render (rather than in an effect) avoids an extra render
  // pass; see https://react.dev/learn/you-might-not-need-an-effect.
  const [lastHandledSuccessId, setLastHandledSuccessId] = useState<
    number | undefined
  >(undefined);
  if (state.ok && state.touchpointId !== lastHandledSuccessId) {
    setLastHandledSuccessId(state.touchpointId);
    setShowConfirmation(true);
    setOccurredAt(nowForInput());
    setShowFollowUp(false);
    setDirection("outbound");
    if (variant === "modal") {
      setCompanyId("");
      setCompanySearch("");
      setDealId("");
    }
    // Keep companyId for inline backfill entry so consecutive imports for
    // the same thread don't require re-picking the company every time.
  }

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onSuccess?.();
    }
    // Only re-run this imperative cleanup when a new successful submission
    // comes in, identified by touchpointId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, state.touchpointId]);

  useEffect(() => {
    if (!showConfirmation) return;
    const t = setTimeout(() => setShowConfirmation(false), 3500);
    return () => clearTimeout(t);
  }, [showConfirmation]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3.5">
      {variant === "inline" && (
        <div>
          <Label htmlFor={`${formId}-occurredAt`}>Date &amp; time</Label>
          <Input
            id={`${formId}-occurredAt`}
            name="occurredAt"
            type="datetime-local"
            className="text-base font-semibold"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
      )}

      <div>
        <Label htmlFor={`${formId}-companySearch`}>Company</Label>
        <Input
          id={`${formId}-companySearch`}
          type="text"
          placeholder="Search companies..."
          value={companySearch}
          onChange={(e) => setCompanySearch(e.target.value)}
        />
        <select
          name="companyId"
          className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm text-foreground shadow-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 outline-none disabled:cursor-not-allowed disabled:opacity-50"
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            setDealId("");
          }}
          size={variant === "inline" ? 5 : undefined}
          required
        >
          <option value="" disabled>
            Select a company...
          </option>
          {filteredCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {filteredCompanies.length === 0 && (
            <option value="" disabled>
              No companies match &quot;{companySearch}&quot;
            </option>
          )}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${formId}-channel`}>Channel</Label>
          <Select id={`${formId}-channel`} name="channel" defaultValue="email">
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${formId}-direction`}>Direction</Label>
          <Select
            id={`${formId}-direction`}
            name="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            {DIRECTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {variant === "modal" && (
        <div>
          <Label htmlFor={`${formId}-occurredAt`}>Date &amp; time</Label>
          <Input
            id={`${formId}-occurredAt`}
            name="occurredAt"
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            required
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${formId}-contactId`}>
            Contact <span className="text-muted-foreground/80">(optional)</span>
          </Label>
          <Select id={`${formId}-contactId`} name="contactId" disabled={!companyId}>
            <option value="">No specific contact</option>
            {companyContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` - ${c.role}` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${formId}-dealId`}>
            Deal <span className="text-muted-foreground/80">(optional)</span>
          </Label>
          <Select
            id={`${formId}-dealId`}
            name="dealId"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            disabled={!companyId}
          >
            <option value="">No specific deal</option>
            {companyDeals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.cycle} - {d.stage}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor={`${formId}-summary`}>Summary</Label>
        <Textarea
          id={`${formId}-summary`}
          name="summary"
          rows={2}
          placeholder="What happened..."
        />
      </div>

      <div>
        <Label htmlFor={`${formId}-outcome`}>
          Outcome <span className="text-muted-foreground/80">(optional)</span>
        </Label>
        <Input
          id={`${formId}-outcome`}
          name="outcome"
          type="text"
          placeholder="e.g. Asked for a call next week"
        />
      </div>

      <div>
        <Label htmlFor={`${formId}-deckVersionId`}>
          Deck version sent <span className="text-muted-foreground/80">(optional)</span>
        </Label>
        <Select id={`${formId}-deckVersionId`} name="deckVersionId" defaultValue="">
          <option value="">No deck sent</option>
          {deckVersions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.isCurrent ? " (current)" : ""}
            </option>
          ))}
        </Select>
      </div>

      {direction === "outbound" && templates.length > 0 && (
        <div>
          <Label htmlFor={`${formId}-templateId`}>
            Template used{" "}
            <span className="text-muted-foreground/80">(optional)</span>
          </Label>
          <Select id={`${formId}-templateId`} name="templateId" defaultValue="">
            <option value="">No template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.scenario ? ` - ${t.scenario}` : ""}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            Attributes this send to a template so the Templates page can show its
            response rate.
          </p>
        </div>
      )}

      <Card className="bg-muted/60 px-3 py-2.5 shadow-none border-dashed">
        <CardContent className="px-0">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={showFollowUp}
              onChange={(e) => setShowFollowUp(e.target.checked)}
              disabled={!dealId}
              className="size-4 rounded border-input accent-primary"
            />
            Create follow-up next action
          </label>
          {!dealId && (
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a deal above to attach a follow-up next action.
            </p>
          )}
          {showFollowUp && dealId && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Due in</span>
              <Input
                name="followUpDays"
                type="number"
                min={1}
                max={90}
                defaultValue={3}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
          )}
        </CardContent>
      </Card>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {showConfirmation && (
        <p className="text-sm text-lime" role="status">
          Touchpoint logged.
        </p>
      )}

      <Button type="submit" className="justify-center" disabled={pending}>
        {pending ? "Logging..." : "Log touch"}
      </Button>
    </form>
  );
}

export default LogForm;
