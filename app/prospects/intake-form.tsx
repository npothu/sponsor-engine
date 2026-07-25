"use client";

import { useRef, useState } from "react";
import { addProspectAction } from "./actions";
import type { SourceDef } from "./sources";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SectionHeading } from "@/components/page-header";

/**
 * Single-add prospect intake. Collapsed to a button by default; expands into a
 * compact form that creates a company + a prospect-stage deal in one submit.
 */
export function IntakeForm({ sources }: { sources: readonly SourceDef[] }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>+ Add prospect</Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await addProspectAction(fd);
        formRef.current?.reset();
      }}
      className="w-full"
    >
      <Card className="px-5 py-4">
        <div className="flex items-center justify-between px-5">
          <SectionHeading>Add prospect</SectionHeading>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3.5 px-5 pt-4">
          <div>
            <Label htmlFor="ap-name">Name</Label>
            <Input
              id="ap-name"
              name="name"
              placeholder="Acme Corp"
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="ap-source">Source</Label>
            <Select id="ap-source" name="source" defaultValue="cold_research">
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ap-website">Website</Label>
            <Input
              id="ap-website"
              name="website"
              placeholder="https://acme.com"
            />
          </div>
          <div>
            <Label htmlFor="ap-notes">Notes</Label>
            <Input
              id="ap-notes"
              name="notes"
              placeholder="Why they fit, warm path, ..."
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 px-5 pt-4">
          <Button type="submit">Add to pool</Button>
          <span className="text-sm text-muted-foreground">
            Creates a prospect-stage deal in the current cycle.
          </span>
        </div>
      </Card>
    </form>
  );
}
