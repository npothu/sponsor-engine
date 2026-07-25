"use client";

import { useState, useTransition } from "react";
import type { DeliverableTemplate, Tier } from "@/lib/schema";
import { saveTierTemplatesAction } from "../actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TierTemplatesEditorProps {
  tier: Tier;
  templates: DeliverableTemplate[];
}

interface Row {
  title: string;
  defaultOwner: string;
}

function toRows(templates: DeliverableTemplate[]): Row[] {
  return templates.map((t) => ({
    title: t.title,
    defaultOwner: t.defaultOwner ?? "",
  }));
}

/** Editable list of deliverable templates for a single active tier. */
export function TierTemplatesEditor({
  tier,
  templates,
}: TierTemplatesEditorProps) {
  const [rows, setRows] = useState<Row[]>(toRows(templates));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<Row>) {
    setSaved(false);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setSaved(false);
    setRows((prev) => [...prev, { title: "", defaultOwner: "" }]);
  }

  function removeRow(i: number) {
    setSaved(false);
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    const items = rows
      .filter((r) => r.title.trim().length > 0)
      .map((r) => ({ title: r.title, defaultOwner: r.defaultOwner }));
    startTransition(async () => {
      await saveTierTemplatesAction(tier.id, items);
      setSaved(true);
    });
  }

  return (
    <Card className="gap-3 px-5 py-5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-base font-semibold text-primary dark:text-foreground">
          {tier.name}
        </span>
        <Badge>${tier.price.toLocaleString("en-US")}</Badge>
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates. Add deliverables that auto-generate for this tier.
          </p>
        ) : (
          rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.title}
                placeholder="Deliverable title"
                onChange={(e) => update(i, { title: e.target.value })}
              />
              <Input
                className="w-[110px] shrink-0"
                value={row.defaultOwner}
                placeholder="Owner"
                onChange={(e) => update(i, { defaultOwner: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => removeRow(i)}
                title="Remove"
              >
                {"✕"}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          Add row
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving..." : "Save templates"}
        </Button>
        {saved && !pending && (
          <span className="text-xs text-muted-foreground">Saved</span>
        )}
      </div>
    </Card>
  );
}

export default TierTemplatesEditor;
