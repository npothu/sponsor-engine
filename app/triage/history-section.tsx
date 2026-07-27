"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  reopenContactAction,
  undoTriageLinkedinTouchAction,
  updateTriageLinkedinTouchAction,
} from "./actions";
import { REJECT_REASONS } from "@/lib/contact-inbox";
import type { ContactInboxRow } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SectionHeading } from "@/components/page-header";

const REASON_LABEL = new Map(REJECT_REASONS.map((r) => [r.key as string, r.label]));

const SHOWN = 30;

/**
 * Collapsed history of decided rows. Kept rows link to their company; rejected
 * rows show the reason and can be reopened (sent back to pending).
 */
export function HistorySection({
  kept,
  rejected,
}: {
  kept: ContactInboxRow[];
  rejected: ContactInboxRow[];
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [touchType, setTouchType] = useState<"dm" | "connection_request">("dm");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const total = kept.length + rejected.length;
  if (!total) return null;

  function reopen(id: number) {
    const fd = new FormData();
    fd.set("inboxId", String(id));
    startTransition(async () => {
      await reopenContactAction(fd);
      router.refresh();
    });
  }

  function edit(row: ContactInboxRow) {
    setEditingId(row.id);
    setTouchType(
      row.linkedinTouchType === "connection_request"
        ? "connection_request"
        : "dm",
    );
    setNote(row.linkedinNote ?? "");
  }

  function saveLinkedinTouch(id: number) {
    const fd = new FormData();
    fd.set("inboxId", String(id));
    fd.set("touchType", touchType);
    fd.set("note", note);
    startTransition(async () => {
      const result = await updateTriageLinkedinTouchAction(fd);
      setFeedback(result.summary);
      if (result.ok) setEditingId(null);
      router.refresh();
    });
  }

  function undoLinkedinTouch(id: number) {
    if (
      !window.confirm(
        "Remove this LinkedIn touch and its triage-created follow-up? The contact will stay kept.",
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("inboxId", String(id));
    startTransition(async () => {
      const result = await undoTriageLinkedinTouchAction(fd);
      setFeedback(result.summary);
      if (result.ok) setEditingId(null);
      router.refresh();
    });
  }

  const recent = [...kept, ...rejected]
    .sort((a, b) => ((b.decidedAt ?? "") < (a.decidedAt ?? "") ? -1 : 1))
    .slice(0, SHOWN);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <SectionHeading>
          Decided ({kept.length} kept, {rejected.length} rejected)
        </SectionHeading>
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </Button>
      </div>
      {feedback && (
        <p className="text-xs font-medium text-muted-foreground">{feedback}</p>
      )}

      {open && (
        <div className="overflow-hidden rounded-lg border border-border bg-muted">
          {recent.map((row, i) => (
            <div
              key={row.id}
              className={`space-y-2 px-3.5 py-2 ${i !== 0 ? "border-t border-border" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {row.name}
                  </span>
                  {row.title && (
                    <span className="text-xs text-muted-foreground">
                      {row.title}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    @ {row.companyName ?? "?"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                {row.status === "kept" ? (
                  <>
                    <Badge variant="lime">
                      {row.decisionKind === "linkedin"
                        ? row.linkedinTouchType === "connection_request"
                          ? "Connection sent"
                          : "DM sent"
                        : "Kept"}
                    </Badge>
                    {row.decisionKind === "linkedin" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => edit(row)}
                          disabled={isPending}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => undoLinkedinTouch(row.id)}
                          disabled={isPending}
                        >
                          Undo outreach
                        </Button>
                      </>
                    )}
                    {row.companyId && (
                      <Link
                        href={`/companies/${row.companyId}`}
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        View company
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <Badge variant="destructive">
                      {REASON_LABEL.get(row.rejectReason ?? "") ?? "Rejected"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reopen(row.id)}
                    >
                      Reopen
                    </Button>
                  </>
                )}
                </span>
              </div>

              {editingId === row.id && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-2.5">
                  <label className="space-y-1 text-xs font-medium text-foreground">
                    <span>LinkedIn action</span>
                    <Select
                      value={touchType}
                      onChange={(event) =>
                        setTouchType(
                          event.target.value as "dm" | "connection_request",
                        )
                      }
                    >
                      <option value="dm">DM sent</option>
                      <option value="connection_request">
                        Connection request sent
                      </option>
                    </Select>
                  </label>
                  <label className="min-w-64 flex-1 space-y-1 text-xs font-medium text-foreground">
                    <span>Note (optional)</span>
                    <Input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="e.g. Mentioned fall career fair"
                      maxLength={500}
                    />
                  </label>
                  <Button
                    size="sm"
                    onClick={() => saveLinkedinTouch(row.id)}
                    disabled={isPending}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          ))}
          {total > SHOWN && (
            <div className="border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
              Showing the {SHOWN} most recent of {total} decisions.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
