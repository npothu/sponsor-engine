"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { quickAddNextActionAction } from "@/app/actions";
import type { DealWithCompany } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function QuickAddForm({ deal }: { deal: DealWithCompany }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add next action
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-wrap items-center gap-2"
      action={(formData) =>
        startTransition(async () => {
          await quickAddNextActionAction(formData);
          setOpen(false);
        })
      }
    >
      <input type="hidden" name="dealId" value={deal.id} />
      <Input
        type="text"
        name="title"
        placeholder="Next action..."
        required
        className="w-[220px]"
      />
      <Input
        type="date"
        name="dueDate"
        required
        defaultValue={todayIso()}
        className="w-[150px]"
      />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </form>
  );
}

function NagRow({ deal }: { deal: DealWithCompany }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(28,55,32,0.04)]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/companies/${deal.company.id}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline dark:text-lime"
        >
          {deal.company.name}
        </Link>
        <span className="text-sm text-muted-foreground">
          {deal.stage} &middot; {deal.cycle}
        </span>
      </div>
      <QuickAddForm deal={deal} />
    </div>
  );
}

export function NagList({ deals }: { deals: DealWithCompany[] }) {
  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Every active deal has an open next action.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {deals.map((deal) => (
        <NagRow key={deal.id} deal={deal} />
      ))}
    </div>
  );
}

export default NagList;
