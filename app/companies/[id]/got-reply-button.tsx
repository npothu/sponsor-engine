"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { gotReplyAction } from "../actions";

/**
 * "Got a reply" for a deal on the company page. Logging an inbound touchpoint
 * detaches any running cadence (a human now drives follow-up), so we prompt to
 * advance to the conversation stage in the same gesture. Deals already at or
 * past conversation just log the reply (the data layer never regresses a stage).
 */
export function GotReplyButton({
  companyId,
  dealId,
  stage,
}: {
  companyId: number;
  dealId: number;
  stage: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // Whether advancing to conversation is a forward move for this deal.
  const canAdvance = ["prospect", "outreach"].includes(stage);

  function submit(advance: boolean) {
    const fd = new FormData();
    fd.set("companyId", String(companyId));
    fd.set("dealId", String(dealId));
    fd.set("advance", String(advance));
    startTransition(async () => {
      await gotReplyAction(fd);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="gradient"
        size="sm"
        onClick={() => setConfirming(true)}
        title="Log an inbound reply and detach the cadence"
      >
        Got a reply
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canAdvance ? (
        <>
          <Button
            type="button"
            variant="gradient"
            size="sm"
            disabled={pending}
            onClick={() => submit(true)}
          >
            Log reply + move to conversation
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => submit(false)}
          >
            Just log reply
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="gradient"
          size="sm"
          disabled={pending}
          onClick={() => submit(false)}
        >
          Log the reply
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  );
}
