"use client";

import { useState } from "react";
import type { Template } from "@/lib/schema";
import { deleteTemplateAction, updateTemplateAction } from "../actions";
import { TemplateForm } from "./template-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface TemplateRowProps {
  template: Template;
  selected: boolean;
  onSelect: () => void;
}

export function TemplateRow({ template, selected, onSelect }: TemplateRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Edit template</CardTitle>
        </CardHeader>
        <CardContent>
          <TemplateForm
            template={template}
            action={(fd) => updateTemplateAction(template.id, fd)}
            onDone={() => setEditing(false)}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "cursor-pointer flex-row items-start justify-between gap-3 py-3 transition-colors",
        selected && "border-primary/50",
      )}
      onClick={onSelect}
    >
      <CardContent className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{template.name}</span>
          {template.subject && (
            <span className="truncate text-xs text-muted-foreground">
              {template.subject}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
          {template.body}
        </p>
      </CardContent>
      <CardContent
        className="flex shrink-0 items-center gap-1.5 pl-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {confirmingDelete ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await deleteTemplateAction(template.id);
              }}
            >
              Confirm delete
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default TemplateRow;
