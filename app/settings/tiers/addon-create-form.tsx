"use client";

import { useRef, useState } from "react";
import { createAddonAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function AddonCreateForm() {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        + New add-on
      </Button>
    );
  }

  return (
    <Card className="w-full px-4 py-4">
      <form
        ref={formRef}
        className="flex flex-col gap-4"
        action={async (form) => {
          await createAddonAction(form);
          formRef.current?.reset();
          setOpen(false);
        }}
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          <div>
            <Label htmlFor="new-addon-name">Name</Label>
            <Input
              id="new-addon-name"
              name="name"
              placeholder="e.g. Extra info session"
              required
            />
          </div>
          <div>
            <Label htmlFor="new-addon-price">Price note</Label>
            <Input
              id="new-addon-price"
              name="priceNote"
              placeholder="e.g. quote, included, $250"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="new-addon-description">Description</Label>
          <Textarea id="new-addon-description" name="description" rows={2} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Create add-on
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
