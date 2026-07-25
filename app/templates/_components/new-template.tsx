"use client";

import { useState } from "react";
import { createTemplateAction } from "../actions";
import { TemplateForm } from "./template-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function NewTemplate() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New template</Button>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New template</CardTitle>
      </CardHeader>
      <CardContent>
        <TemplateForm
          action={createTemplateAction}
          onDone={() => setOpen(false)}
          submitLabel="Create template"
        />
      </CardContent>
    </Card>
  );
}

export default NewTemplate;
