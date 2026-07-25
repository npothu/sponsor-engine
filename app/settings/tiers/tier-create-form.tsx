"use client";

import { useRef, useState } from "react";
import { createTierAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface TierCreateFormProps {
  defaultPackageLabel?: string;
}

export function TierCreateForm({ defaultPackageLabel }: TierCreateFormProps) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + New tier
      </Button>
    );
  }

  return (
    <Card className="w-full px-5">
      <form
        ref={formRef}
        className="flex flex-col gap-4"
        action={async (form) => {
          await createTierAction(form);
          formRef.current?.reset();
          setOpen(false);
        }}
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          <div>
            <Label htmlFor="new-tier-name">Name</Label>
            <Input id="new-tier-name" name="name" placeholder="e.g. Bronze" required />
          </div>
          <div>
            <Label htmlFor="new-tier-price">Price ($)</Label>
            <Input
              id="new-tier-price"
              name="price"
              type="number"
              min={0}
              step={1}
              required
            />
          </div>
          <div>
            <Label htmlFor="new-tier-position">Position</Label>
            <Input id="new-tier-position" name="position" type="number" step={1} defaultValue={0} />
          </div>
          <div>
            <Label htmlFor="new-tier-package">Package label</Label>
            <Input
              id="new-tier-package"
              name="packageLabel"
              defaultValue={defaultPackageLabel ?? ""}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="new-tier-description">Description</Label>
          <Textarea id="new-tier-description" name="description" rows={2} />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="active" defaultChecked className="accent-primary" />
          Active working set
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Create tier
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
