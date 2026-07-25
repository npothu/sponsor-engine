"use client";

import { useState } from "react";
import { saveStepsAction } from "./actions";
import type { CadenceStep, Template, TouchpointChannel } from "@/lib/schema";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CHANNELS: TouchpointChannel[] = [
  "email",
  "call",
  "meeting",
  "career_fair",
  "linkedin",
  "discord",
  "other",
];

interface RowState {
  key: string;
  waitDays: string;
  channel: TouchpointChannel;
  templateId: string;
  note: string;
}

let rowSeq = 0;
function newRow(): RowState {
  return {
    key: `row-${rowSeq++}`,
    waitDays: "3",
    channel: "email",
    templateId: "",
    note: "",
  };
}

function fromStep(step: CadenceStep): RowState {
  return {
    key: `step-${step.id}`,
    waitDays: String(step.waitDays),
    channel: (CHANNELS as string[]).includes(step.channel)
      ? (step.channel as TouchpointChannel)
      : "email",
    templateId: step.templateId != null ? String(step.templateId) : "",
    note: step.note ?? "",
  };
}

export function StepsEditor({
  cadenceId,
  steps,
  templates,
}: {
  cadenceId: number;
  steps: CadenceStep[];
  templates: Template[];
}) {
  const [rows, setRows] = useState<RowState[]>(() =>
    steps.length ? steps.map(fromStep) : [newRow()],
  );

  function update(key: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function remove(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  return (
    <form action={saveStepsAction} className="space-y-3">
      <input type="hidden" name="cadenceId" value={cadenceId} />

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No steps yet. Add one to start scheduling follow-ups.
        </p>
      )}

      {rows.length > 0 && (
        <div className="relative space-y-3">
          {rows.length > 1 && (
            <div
              aria-hidden
              className="absolute left-3.5 top-4 bottom-4 w-px bg-border"
            />
          )}
          {rows.map((row, i) => (
            <div key={row.key} className="relative flex items-start gap-3">
              <span className="relative z-10 mt-1.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[5rem_auto_1fr_1.4fr_auto] sm:items-center">
                <Input
                  className="w-20"
                  name="waitDays"
                  type="number"
                  min={0}
                  aria-label="Wait days"
                  value={row.waitDays}
                  onChange={(e) => update(row.key, { waitDays: e.target.value })}
                />
                <Badge variant="secondary" className="w-fit">
                  {row.waitDays || "0"}d wait
                </Badge>
                <Select
                  name="channel"
                  value={row.channel}
                  onChange={(e) =>
                    update(row.key, {
                      channel: e.target.value as TouchpointChannel,
                    })
                  }
                >
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
                <Select
                  name="templateId"
                  value={row.templateId}
                  onChange={(e) => update(row.key, { templateId: e.target.value })}
                >
                  <option value="">No template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Input
                  name="note"
                  placeholder="Optional note"
                  value={row.note}
                  onChange={(e) => update(row.key, { note: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="justify-self-end text-muted-foreground hover:text-destructive"
                  onClick={() => remove(row.key)}
                  aria-label="Remove step"
                >
                  &times;
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRows((prev) => [...prev, newRow()])}
        >
          + Add step
        </Button>
        <Button type="submit" size="sm">
          Save steps
        </Button>
      </div>
    </form>
  );
}
