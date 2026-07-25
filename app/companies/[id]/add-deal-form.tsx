"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DEAL_STAGES, STAGE_LABEL } from "../ui";
import { createDealAction } from "../actions";

/** Compact "start another deal" form (e.g. a renewal in a new cycle). */
export function AddDealForm({ companyId }: { companyId: number }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        + New deal / cycle
      </Button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await createDealAction(fd);
        setOpen(false);
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <div className="grid gap-3">
        <div>
          <Label htmlFor="ad-cycle">Cycle</Label>
          <Input id="ad-cycle" name="cycle" placeholder="2027-28" required />
        </div>
        <div>
          <Label htmlFor="ad-stage">Stage</Label>
          <Select id="ad-stage" name="stage" defaultValue="prospect">
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm">
          Create deal
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
