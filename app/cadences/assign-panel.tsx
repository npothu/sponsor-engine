"use client";

import { useState } from "react";
import Link from "next/link";
import { assignCadenceAction } from "./actions";
import type { Cadence } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export interface AssignableDeal {
  dealId: number;
  companyId: number;
  companyName: string;
  cycle: string;
  stage: string;
  cadenceId: number | null;
  cadenceName: string | null;
}

export function AssignPanel({
  deals,
  cadences,
}: {
  deals: AssignableDeal[];
  cadences: Cadence[];
}) {
  const cadenceName = (id: number | null) =>
    id == null ? null : (cadences.find((c) => c.id === id)?.name ?? null);

  if (deals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No deals in the prospect, outreach, or conversation stages to assign a
        cadence to.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {deals.map((d) => (
        <AssignRow
          key={d.dealId}
          deal={d}
          cadences={cadences}
          currentCadenceName={d.cadenceName ?? cadenceName(d.cadenceId)}
        />
      ))}
    </div>
  );
}

function AssignRow({
  deal,
  cadences,
  currentCadenceName,
}: {
  deal: AssignableDeal;
  cadences: Cadence[];
  currentCadenceName: string | null;
}) {
  const [selected, setSelected] = useState<string>(
    deal.cadenceId != null ? String(deal.cadenceId) : "",
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/companies/${deal.companyId}`}
          className="text-sm text-primary underline-offset-4 hover:underline dark:text-lime"
        >
          {deal.companyName}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge>{deal.stage}</Badge>
          <span className="text-muted-foreground">{deal.cycle}</span>
          {currentCadenceName ? (
            <Badge variant="secondary">{currentCadenceName}</Badge>
          ) : (
            <span className="text-muted-foreground">No cadence</span>
          )}
        </div>
      </div>
      <form
        action={assignCadenceAction}
        className="flex shrink-0 items-center gap-2"
      >
        <input type="hidden" name="dealId" value={deal.dealId} />
        <Select
          wrapperClassName="w-auto min-w-45"
          name="cadenceId"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Unassigned</option>
          {cadences.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
      </form>
    </div>
  );
}
