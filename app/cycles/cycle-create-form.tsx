"use client";

import { useRef, useState } from "react";
import { createCycleAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CycleCreateForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        + New cycle
      </Button>
    );
  }

  return (
    <Card className="w-full px-5">
      <form
        ref={formRef}
        className="flex flex-col gap-4"
        action={async (form) => {
          await createCycleAction(form);
          formRef.current?.reset();
          setOpen(false);
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="new-cycle-label">Label</Label>
            <Input
              id="new-cycle-label"
              name="label"
              placeholder="e.g. 2027-28"
              required
            />
          </div>
          <div>
            <Label htmlFor="new-cycle-anchor">Anchor event</Label>
            <Input
              id="new-cycle-anchor"
              name="anchorEvent"
              placeholder="e.g. Spring 2028 Hackathon"
            />
          </div>
          <div>
            <Label htmlFor="new-cycle-anchor-date">Anchor event date</Label>
            <Input
              id="new-cycle-anchor-date"
              name="anchorEventDate"
              type="date"
            />
          </div>
          <div>
            <Label htmlFor="new-cycle-starts">Starts on</Label>
            <Input id="new-cycle-starts" name="startsOn" type="date" />
          </div>
          <div>
            <Label htmlFor="new-cycle-ends">Ends on</Label>
            <Input id="new-cycle-ends" name="endsOn" type="date" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="isActive" className="accent-primary" />
          Make this the active cycle
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            Create cycle
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
