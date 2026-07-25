"use client";

import { useTransition } from "react";
import { setCurrentDeckVersionAction } from "./actions";
import { Button } from "@/components/ui/button";

export function SetCurrentButton({ deckVersionId }: { deckVersionId: number }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => setCurrentDeckVersionAction(deckVersionId))}
    >
      {isPending ? "Setting..." : "Set current"}
    </Button>
  );
}

export default SetCurrentButton;
