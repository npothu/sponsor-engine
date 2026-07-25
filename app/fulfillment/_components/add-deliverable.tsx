"use client";

import { useRef } from "react";
import { addDeliverableAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AddDeliverableProps {
  dealId: number;
}

/** Inline add-a-custom-deliverable row scoped to one deal. */
export function AddDeliverable({ dealId }: AddDeliverableProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="flex items-center gap-2"
      action={async (fd) => {
        await addDeliverableAction(dealId, fd);
        formRef.current?.reset();
      }}
    >
      <Input
        name="title"
        placeholder="Add a deliverable..."
        aria-label="New deliverable title"
        required
      />
      <Button type="submit" size="sm">
        Add
      </Button>
    </form>
  );
}

export default AddDeliverable;
