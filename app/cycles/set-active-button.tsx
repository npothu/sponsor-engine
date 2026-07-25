"use client";

import { useTransition } from "react";
import { setActiveCycleAction } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SetActiveButtonProps {
  cycleId: number;
  isActive: boolean;
}

export function SetActiveButton({ cycleId, isActive }: SetActiveButtonProps) {
  const [pending, startTransition] = useTransition();

  if (isActive) {
    return (
      <Badge variant="solid" className="shrink-0">
        Active
      </Badge>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="shrink-0"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void setActiveCycleAction(cycleId);
        })
      }
    >
      {pending ? "Setting..." : "Set active"}
    </Button>
  );
}
