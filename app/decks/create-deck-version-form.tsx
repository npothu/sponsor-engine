"use client";

import { useRef, useTransition } from "react";
import { createDeckVersionAction } from "./actions";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/page-header";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function CreateDeckVersionForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card className="px-5 py-5">
      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await createDeckVersionAction(formData);
            formRef.current?.reset();
          });
        }}
      >
        <SectionHeading className="mb-1">New deck version</SectionHeading>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="deck-label">Label</Label>
            <Input
              id="deck-label"
              name="label"
              placeholder="e.g. v4 - Hackathon deck"
              required
            />
          </div>
          <div>
            <Label htmlFor="deck-released-at">Released</Label>
            <Input id="deck-released-at" name="releasedAt" type="date" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="deck-url">Deck link</Label>
            <Input
              id="deck-url"
              name="url"
              type="url"
              placeholder="https://drive.google.com/... (fills the {{deck_link}} merge field)"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="deck-description">Description</Label>
            <Textarea
              id="deck-description"
              name="description"
              rows={2}
              placeholder="What changed in this revision"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="isCurrent" />
            Mark as current
          </label>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Adding..." : "Add deck version"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default CreateDeckVersionForm;
