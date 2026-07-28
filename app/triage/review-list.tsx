"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  keepAndMessageContactAction,
  keepContactAction,
  rejectContactAction,
  reopenContactAction,
} from "./actions";
import { REJECT_REASONS } from "@/lib/contact-inbox";
import type { TriagePendingRow } from "./queries";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/**
 * Keyboard-driven review of pending scraped contacts. One card is active at a
 * time; decisions are optimistic (the card leaves the list immediately) and the
 * server round-trip runs in a transition.
 *
 * Keys: ↑/↓ move - K keep - M keep + DM'd (logs the LinkedIn touchpoint,
 * assigns the LinkedIn cadence, nudges the deal to outreach) - R reject
 * (selected reason) - 1-6 reject with that reason - Enter/O open LinkedIn -
 * U skip - Z undo the last rejection.
 */
export function ReviewList({ rows }: { rows: TriagePendingRow[] }) {
  const [decidedIds, setDecidedIds] = useState<ReadonlySet<number>>(new Set());
  const [activeId, setActiveId] = useState<number | null>(null);
  const [reason, setReason] = useState<string>("no_campus_presence");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lastRejectedId, setLastRejectedId] = useState<number | null>(null);
  const [companyFilter, setCompanyFilter] = useState("");
  const [sortByCompany, setSortByCompany] = useState(false);
  const [onlyNoContact, setOnlyNoContact] = useState(false);
  const [onlyNoOutreach, setOnlyNoOutreach] = useState(false);
  const [, startTransition] = useTransition();
  const [seenRows, setSeenRows] = useState(rows);
  const router = useRouter();
  const activeCardRef = useRef<HTMLDivElement | null>(null);

  // A decided row is hidden optimistically by id. When the server hands one
  // back as pending - undo keep in the Decided section does exactly that - stop
  // hiding it, and drop the stale "Kept X" line that described the decision.
  // Adjusting state during render (rather than in an effect) so the row never
  // paints as missing; `rows` only changes identity once a refresh lands, so
  // this cannot fire during the optimistic window.
  if (rows !== seenRows) {
    setSeenRows(rows);
    if (rows.some((r) => decidedIds.has(r.row.id))) {
      setDecidedIds((prev) => {
        const next = new Set(prev);
        for (const r of rows) next.delete(r.row.id);
        return next;
      });
      setFeedback(null);
    }
  }

  const undecided = useMemo(
    () => rows.filter((r) => !decidedIds.has(r.row.id)),
    [rows, decidedIds],
  );
  const visible = useMemo(() => {
    const q = companyFilter.trim().toLowerCase();
    const list = undecided.filter(
      (r) =>
        (!q || (r.row.companyName ?? "").toLowerCase().includes(q)) &&
        (!onlyNoContact || r.companyContactCount === 0) &&
        (!onlyNoOutreach || !r.companyContacted),
    );
    if (!sortByCompany) return list;
    return [...list].sort(
      (a, b) =>
        (a.row.companyName ?? "").localeCompare(b.row.companyName ?? "") ||
        a.row.id - b.row.id,
    );
  }, [undecided, companyFilter, sortByCompany, onlyNoContact, onlyNoOutreach]);
  const filtered =
    companyFilter.trim() !== "" || onlyNoContact || onlyNoOutreach;
  const activeIndex = Math.max(
    0,
    visible.findIndex((r) => r.row.id === activeId),
  );
  const active = visible[activeIndex] ?? null;

  const move = useCallback(
    (delta: number) => {
      if (!visible.length) return;
      const next = Math.min(
        visible.length - 1,
        Math.max(0, activeIndex + delta),
      );
      setActiveId(visible[next]!.row.id);
    },
    [visible, activeIndex],
  );

  const decide = useCallback(
    (
      target: TriagePendingRow,
      kind: "keep" | "keep_message" | "reject",
      rejectReason?: string,
    ) => {
      const id = target.row.id;
      // Advance selection before the row disappears from `visible`.
      const idx = visible.findIndex((r) => r.row.id === id);
      const successor = visible[idx + 1] ?? visible[idx - 1] ?? null;
      setActiveId(successor ? successor.row.id : null);
      setDecidedIds((prev) => new Set(prev).add(id));
      setLastRejectedId(kind === "reject" ? id : null);

      const fd = new FormData();
      fd.set("inboxId", String(id));
      if (kind === "reject") fd.set("reason", rejectReason ?? reason);
      startTransition(async () => {
        const res =
          kind === "keep"
            ? await keepContactAction(fd)
            : kind === "keep_message"
              ? await keepAndMessageContactAction(fd)
              : await rejectContactAction(fd);
        setFeedback(res.summary);
        if (!res.ok) {
          // Roll the optimistic removal back so the row is not silently lost.
          setDecidedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        router.refresh();
      });
    },
    [visible, reason, router],
  );

  const undoLastReject = useCallback(() => {
    if (lastRejectedId == null) return;
    const id = lastRejectedId;
    setLastRejectedId(null);
    const fd = new FormData();
    fd.set("inboxId", String(id));
    startTransition(async () => {
      const res = await reopenContactAction(fd);
      setFeedback(res.summary);
      if (res.ok) {
        setDecidedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setActiveId(id);
      }
      router.refresh();
    });
  }, [lastRejectedId, router]);

  // The LinkedIn button is a real <a target="_blank"> (window.open with a
  // features string counts as a popup and gets blocked); the keyboard path
  // clicks that anchor so both share the never-blocked link behavior.
  const openLinkedin = useCallback(() => {
    activeCardRef.current
      ?.querySelector<HTMLAnchorElement>("a[data-linkedin-link]")
      ?.click();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Ignore while typing in the company filter (or any text field). SELECT
      // and the filter checkboxes are left alone so K/M/R/1-6 still fire after
      // you pick a reject reason or toggle a filter.
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "TEXTAREA" ||
        (tag === "INPUT" && (el as HTMLInputElement).type !== "checkbox")
      )
        return;
      if (!active) return;

      if (e.key === "ArrowDown" || e.key === "u" || e.key === "U") move(1);
      else if (e.key === "ArrowUp") move(-1);
      else if (e.key === "k" || e.key === "K") {
        if (active.row.companyName) decide(active, "keep");
      } else if (e.key === "m" || e.key === "M") {
        if (active.row.companyName) decide(active, "keep_message");
      } else if (e.key === "r" || e.key === "R") decide(active, "reject");
      else if (e.key === "Enter" || e.key === "o" || e.key === "O") openLinkedin();
      else if (e.key === "z" || e.key === "Z") undoLastReject();
      else if (/^[1-6]$/.test(e.key)) {
        const r = REJECT_REASONS[Number(e.key) - 1];
        if (r) decide(active, "reject", r.key);
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, move, decide, openLinkedin, undoLastReject]);

  useEffect(() => {
    activeCardRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  if (!undecided.length) {
    return (
      <Card className="border-dashed">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nothing pending. Paste a scrape above to stage contacts for review.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          className="w-56"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          placeholder="Filter by company..."
          aria-label="Filter by company"
        />
        <Select
          wrapperClassName="w-auto"
          value={sortByCompany ? "company" : "scrape"}
          onChange={(e) => setSortByCompany(e.target.value === "company")}
          aria-label="Sort order"
        >
          <option value="scrape">Scrape order</option>
          <option value="company">Company A-Z</option>
        </Select>
        <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyNoContact}
            onChange={(e) => setOnlyNoContact(e.target.checked)}
            aria-label="Only companies with no contact yet"
            className="size-4 accent-primary dark:accent-lime"
          />
          No contact yet
        </label>
        <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyNoOutreach}
            onChange={(e) => setOnlyNoOutreach(e.target.checked)}
            aria-label="Only companies not reached out to yet"
            className="size-4 accent-primary dark:accent-lime"
          />
          Not reached out yet
        </label>
        {filtered && (
          <span className="text-xs text-muted-foreground">
            {visible.length} of {undecided.length} pending
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <kbd className="rounded border border-border bg-muted px-1">↑↓</kbd> move{" "}
          <kbd className="rounded border border-border bg-muted px-1">K</kbd> keep{" "}
          <kbd className="rounded border border-border bg-muted px-1">M</kbd> keep +
          DM&apos;d{" "}
          <kbd className="rounded border border-border bg-muted px-1">R</kbd> reject{" "}
          <kbd className="rounded border border-border bg-muted px-1">1-6</kbd> reject
          with reason{" "}
          <kbd className="rounded border border-border bg-muted px-1">Enter</kbd> open
          LinkedIn{" "}
          <kbd className="rounded border border-border bg-muted px-1">U</kbd> skip{" "}
          <kbd className="rounded border border-border bg-muted px-1">Z</kbd> undo
          reject
        </p>
        {feedback && (
          <p className="text-xs font-medium text-muted-foreground">{feedback}</p>
        )}
      </div>

      {!visible.length && (
        <p className="text-sm text-muted-foreground">
          {companyFilter.trim()
            ? `No pending contacts match “${companyFilter.trim()}”.`
            : "No pending contacts match the selected filters."}
        </p>
      )}

      {visible.map((r) => {
        const isActive = r.row.id === active?.row.id;
        return (
          <div
            key={r.row.id}
            ref={isActive ? activeCardRef : null}
            onClick={() => setActiveId(r.row.id)}
          >
            <ReviewCard
              item={r}
              active={isActive}
              reason={reason}
              onReasonChange={setReason}
              onKeep={() => decide(r, "keep")}
              onKeepAndMessage={() => decide(r, "keep_message")}
              onReject={() => decide(r, "reject")}
            />
          </div>
        );
      })}
    </div>
  );
}

function ReviewCard({
  item,
  active,
  reason,
  onReasonChange,
  onKeep,
  onKeepAndMessage,
  onReject,
}: {
  item: TriagePendingRow;
  active: boolean;
  reason: string;
  onReasonChange: (r: string) => void;
  onKeep: () => void;
  onKeepAndMessage: () => void;
  onReject: () => void;
}) {
  const {
    row,
    companyMatch,
    companyRejected,
    companyContactCount,
    activeDealStage,
    suggestion,
  } = item;
  return (
    <Card
      className={cn(
        "cursor-pointer transition-shadow",
        active && "ring-2 ring-primary",
      )}
    >
      <CardContent className={cn("space-y-2", !active && "py-2.5")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {row.name}
          </span>
          {row.title && (
            <span className="text-sm text-muted-foreground">{row.title}</span>
          )}
          <span className="text-sm text-foreground">
            @ {row.companyName ?? "(no company)"}
          </span>
          {companyMatch ? (
            <>
              <Badge variant="secondary">In tracker: {companyMatch.name}</Badge>
              {companyContactCount > 0 ? (
                <Badge variant="info">
                  {companyContactCount} contact
                  {companyContactCount === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge variant="outline">No contact yet</Badge>
              )}
            </>
          ) : row.companyName ? (
            <Badge>New company</Badge>
          ) : null}
          {companyRejected && (
            <Badge variant="destructive">Company rejected earlier</Badge>
          )}
          {activeDealStage && (
            <Badge variant="warning">
              Active deal: {activeDealStage} - check before DMing
            </Badge>
          )}
          {suggestion && (
            <Badge
              variant={suggestion.suggestion === "keep" ? "default" : "outline"}
            >
              Suggest {suggestion.suggestion}: {suggestion.reason}
            </Badge>
          )}
        </div>

        {active && (
          <div
            className="flex flex-wrap items-center gap-2.5 pt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              onClick={onKeep}
              disabled={!row.companyName}
              title={
                row.companyName
                  ? "Create the contact (K)"
                  : "No company name scraped - cannot keep"
              }
            >
              Keep
            </Button>
            <Button
              size="sm"
              variant="gradient"
              onClick={onKeepAndMessage}
              disabled={!row.companyName}
              title={
                row.companyName
                  ? "Keep AND log the LinkedIn DM you just sent: outbound touchpoint, LinkedIn cadence, deal to outreach (M)"
                  : "No company name scraped - cannot keep"
              }
            >
              Keep + DM&apos;d
            </Button>
            <Select
              wrapperClassName="w-auto"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              aria-label="Reject reason"
            >
              {REJECT_REASONS.map((r, i) => (
                <option key={r.key} value={r.key}>
                  {i + 1}. {r.label}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="secondary" onClick={onReject}>
              Reject
            </Button>
            {row.linkedin ? (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={row.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-linkedin-link
                >
                  Open LinkedIn
                </a>
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">No LinkedIn</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
