"use client";

import { useState } from "react";
import { buildProposalAction } from "../actions";
import { Button } from "@/components/ui/button";

/**
 * Downloads a sponsor-facing proposal one-pager for a deal. Calls the server
 * action to build the Markdown, then saves it client-side as
 * <company>-proposal-<cycle>.md. Distinct from the internal handoff: this is the
 * artifact circulated for budget approval.
 */
export function ProposalButton({
  dealId,
  companyName,
  cycle,
}: {
  dealId: number;
  companyName: string;
  cycle: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const markdown = await buildProposalAction(dealId);
      if (!markdown) return;
      const blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      a.href = url;
      a.download = `${slug || "sponsor"}-proposal-${cycle}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleExport}
      disabled={busy}
    >
      {busy ? "Building..." : "Generate proposal"}
    </Button>
  );
}

export default ProposalButton;
