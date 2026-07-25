"use client";

import { useState } from "react";
import type { Addon } from "@/lib/schema";
import { updateAddonAction } from "./actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface AddonRowProps {
  addon: Addon;
}

export function AddonRow({ addon }: AddonRowProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Card className="px-4 py-4">
        <form
          className="flex flex-col gap-4"
          action={async (form) => {
            await updateAddonAction(addon.id, form);
            setEditing(false);
          }}
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            <div>
              <Label htmlFor={`addon-name-${addon.id}`}>Name</Label>
              <Input
                id={`addon-name-${addon.id}`}
                name="name"
                defaultValue={addon.name}
                required
              />
            </div>
            <div>
              <Label htmlFor={`addon-price-${addon.id}`}>Price note</Label>
              <Input
                id={`addon-price-${addon.id}`}
                name="priceNote"
                defaultValue={addon.priceNote ?? ""}
                placeholder="e.g. quote, included, $250"
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`addon-description-${addon.id}`}>Description</Label>
            <Textarea
              id={`addon-description-${addon.id}`}
              name="description"
              defaultValue={addon.description ?? ""}
              rows={2}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex-row items-start justify-between gap-4 px-4 py-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {addon.name}
          {addon.priceNote && <Badge variant="secondary">{addon.priceNote}</Badge>}
        </div>
        {addon.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{addon.description}</p>
        )}
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </Card>
  );
}
