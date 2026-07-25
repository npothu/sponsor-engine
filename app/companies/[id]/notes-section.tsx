"use client";

import { useState } from "react";
import type { Company } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { updateCompanyNotesAction } from "../actions";

/** Editable free-form company notes. */
export function NotesSection({ company }: { company: Company }) {
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Notes</CardTitle>
        {!editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {editing ? (
          <form
            action={async (fd) => {
              await updateCompanyNotesAction(fd);
              setEditing(false);
            }}
          >
            <input type="hidden" name="companyId" value={company.id} />
            <Textarea
              name="notes"
              rows={5}
              defaultValue={company.notes ?? ""}
              placeholder="Context, relationship history, internal reminders..."
              autoFocus
            />
            <div className="mt-3 flex gap-2">
              <Button type="submit" size="sm">
                Save notes
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : company.notes ? (
          <p className="whitespace-pre-wrap text-sm">{company.notes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
