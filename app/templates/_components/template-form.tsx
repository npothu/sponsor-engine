"use client";

import { useState } from "react";
import type { Template } from "@/lib/schema";
import { MergeFieldLegend } from "./merge-field-legend";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TemplateFormProps {
  template?: Template;
  action: (formData: FormData) => Promise<void>;
  onDone?: () => void;
  submitLabel: string;
}

export function TemplateForm({
  template,
  action,
  onDone,
  submitLabel,
}: TemplateFormProps) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    try {
      await action(formData);
      onDone?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
      <form action={handleSubmit} className="flex flex-col gap-3">
        <div>
          <Label htmlFor="tpl-name">Name</Label>
          <Input
            id="tpl-name"
            name="name"
            required
            defaultValue={template?.name ?? ""}
            placeholder="e.g. Cold intro"
          />
        </div>

        <div>
          <Label htmlFor="tpl-scenario">Scenario</Label>
          <Input
            id="tpl-scenario"
            name="scenario"
            defaultValue={template?.scenario ?? ""}
            placeholder="e.g. cold intro, follow-up, renewal"
          />
        </div>

        <div>
          <Label htmlFor="tpl-subject">Subject</Label>
          <Input
            id="tpl-subject"
            name="subject"
            defaultValue={template?.subject ?? ""}
            placeholder="Email subject line (optional)"
          />
        </div>

        <div>
          <Label htmlFor="tpl-body">Body</Label>
          <Textarea
            id="tpl-body"
            name="body"
            required
            defaultValue={template?.body ?? ""}
            className="min-h-40 font-mono text-sm leading-relaxed"
            rows={14}
            placeholder="Hi {{contact_first_name}}, ..."
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving..." : submitLabel}
          </Button>
          {onDone && (
            <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-3">
        <MergeFieldLegend />
        <Card className="p-3">
          <CardContent className="px-0">
            <p className="mb-1.5 font-display text-sm font-semibold text-primary dark:text-foreground">
              AI-assisted drafting
            </p>
            <p className="text-xs text-muted-foreground">
              Coming soon: generate a first draft from a company profile and
              scenario. For now, write and refine templates by hand.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default TemplateForm;
