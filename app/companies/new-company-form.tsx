"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createCompanyAction } from "./actions";

/**
 * "New company" affordance for the list page. Collapsed to a button by default;
 * expands into a form that creates the company and its opening 2026-27 deal.
 */
export function NewCompanyForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="gradient" onClick={() => setOpen(true)}>
        + New company
      </Button>
    );
  }

  return (
    <Card className="w-full basis-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New company</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </CardHeader>
      <CardContent>
        <form action={createCompanyAction}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <Label htmlFor="nc-name">Name</Label>
              <Input
                id="nc-name"
                name="name"
                placeholder="Acme Corp"
                required
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="nc-type">Type</Label>
              <Select id="nc-type" name="type" defaultValue="corporate">
                <option value="corporate">Corporate</option>
                <option value="community">Community</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="nc-priority">Priority</Label>
              <Select id="nc-priority" name="priority" defaultValue="medium">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="nc-website">Website</Label>
              <Input
                id="nc-website"
                name="website"
                placeholder="https://acme.com"
              />
            </div>
            <div>
              <Label htmlFor="nc-source">Source</Label>
              <Input
                id="nc-source"
                name="source"
                placeholder="Career fair, referral, ..."
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="nc-notes">Notes</Label>
              <Textarea
                id="nc-notes"
                name="notes"
                rows={2}
                placeholder="Anything worth remembering going in"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" size="sm">
              Create company
            </Button>
            <span className="text-xs text-muted-foreground">
              Opens a 2026-27 deal at the prospect stage.
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
