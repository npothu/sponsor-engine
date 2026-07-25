"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Company, Contact, Template } from "@/lib/schema";
import { listContactsForCompany, renderTemplatePreview } from "../preview-actions";
import { CopyButton } from "./copy-button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SectionHeading } from "@/components/page-header";

interface PreviewPanelProps {
  templates: Template[];
  companies: Company[];
  selectedTemplateId: number | null;
  onSelectTemplate: (id: number) => void;
}

export function PreviewPanel({
  templates,
  companies,
  selectedTemplateId,
  onSelectTemplate,
}: PreviewPanelProps) {
  const [companyId, setCompanyId] = useState<number | "">("");
  const [contactId, setContactId] = useState<number | "">("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rendered, setRendered] = useState<{ subject: string; body: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestRef = useRef(0);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  function handleCompanyChange(value: string) {
    const next = value ? Number(value) : "";
    setCompanyId(next);
    setContactId("");
    setContacts([]);
    setRendered(null);
    if (next === "") return;
    const requestId = ++requestRef.current;
    listContactsForCompany(next).then((rows) => {
      if (requestRef.current === requestId) setContacts(rows);
    });
  }

  function handleContactChange(value: string) {
    setContactId(value ? Number(value) : "");
  }

  function handleTemplateChange(value: string) {
    onSelectTemplate(Number(value));
  }

  useEffect(() => {
    if (!selectedTemplateId || companyId === "") {
      return;
    }
    const requestId = ++requestRef.current;
    startTransition(() => {
      renderTemplatePreview(
        selectedTemplateId,
        companyId,
        contactId === "" ? undefined : contactId,
      ).then((result) => {
        if (requestRef.current === requestId) setRendered(result);
      });
    });
  }, [selectedTemplateId, companyId, contactId]);

  return (
    <Card className="flex flex-col gap-3">
      <CardContent className="flex flex-col gap-3">
        <SectionHeading>Preview</SectionHeading>

        <div>
          <Label htmlFor="preview-template">Template</Label>
          <Select
            id="preview-template"
            value={selectedTemplateId ?? ""}
            onChange={(e) => handleTemplateChange(e.target.value)}
          >
            <option value="" disabled>
              Select a template
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="preview-company">Company</Label>
          <Select
            id="preview-company"
            value={companyId}
            onChange={(e) => handleCompanyChange(e.target.value)}
            disabled={!companies.length}
          >
            <option value="">Select a company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {!companies.length && (
            <p className="mt-1 text-xs text-muted-foreground">
              No companies yet - add one to preview a rendered template.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="preview-contact">Contact (optional)</Label>
          <Select
            id="preview-contact"
            value={contactId}
            onChange={(e) => handleContactChange(e.target.value)}
            disabled={!contacts.length}
          >
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` (${c.role})` : ""}
              </option>
            ))}
          </Select>
        </div>

        <Separator />

        {!selectedTemplate ? (
          <p className="text-sm text-muted-foreground">
            Pick a template above to preview it.
          </p>
        ) : companyId === "" ? (
          <p className="text-sm text-muted-foreground">
            Pick a company to render{" "}
            <span className="font-medium text-info">{"{{company}}"}</span>,{" "}
            <span className="font-medium text-info">{"{{tier_name}}"}</span>, and
            contact merge fields.
          </p>
        ) : isPending || !rendered ? (
          <p className="text-sm text-muted-foreground">Rendering...</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="mb-0">Subject</Label>
                <CopyButton value={rendered.subject} label="Copy subject" />
              </div>
              <div className="min-h-9 rounded-lg bg-muted/60 p-2.5 text-sm whitespace-pre-wrap">
                {rendered.subject || (
                  <span className="text-muted-foreground">(no subject)</span>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label className="mb-0">Body</Label>
                <CopyButton value={rendered.body} label="Copy body" />
              </div>
              <div className="min-h-32 rounded-lg bg-muted/60 p-2.5 text-sm whitespace-pre-wrap">
                {rendered.body}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PreviewPanel;
