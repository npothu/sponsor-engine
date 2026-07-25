"use client";

import { useState, useTransition } from "react";
import { setDeckVersionUrlAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/app/templates/_components/copy-button";

interface DeckLinkControlsProps {
  deckVersionId: number;
  url: string | null;
}

/**
 * Deck-link row: when a link is set, shows Open/Copy plus an Edit toggle; when
 * absent, shows an "Add link" toggle. Editing reveals an inline URL field that
 * saves via the setDeckVersionUrlAction server action. Blank clears the link.
 */
export function DeckLinkControls({ deckVersionId, url }: DeckLinkControlsProps) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={(formData) => {
          startTransition(async () => {
            await setDeckVersionUrlAction(formData);
            setEditing(false);
          });
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="deckVersionId" value={deckVersionId} />
        <Input
          name="url"
          type="url"
          defaultValue={url ?? ""}
          placeholder="https://..."
          className="h-8 w-64"
          autoFocus
        />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
      </form>
    );
  }

  if (!url) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        Add link
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open
        </a>
      </Button>
      <CopyButton value={url} label="Copy link" />
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}

export default DeckLinkControls;
