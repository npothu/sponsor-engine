"use client";

import { useState, useTransition } from "react";
import type { Contact, Template } from "@/lib/schema";
import type { DealWithTier } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { composeEmailAction, type ComposeResult } from "../actions";

/**
 * One-click compose: pick a template + contact, render it (deal-aware), then
 * open a prefilled Gmail draft in a new tab. A copy-to-clipboard fallback yields
 * the same subject/body as a mailto: link for non-Gmail clients.
 */
export function ComposeSection({
  companyId,
  templates,
  contacts,
  deals,
}: {
  companyId: number;
  templates: Template[];
  contacts: Contact[];
  deals: DealWithTier[];
}) {
  const primaryDealId = deals[0]?.id ?? "";
  // Prefer the first contact that actually has an email on file.
  const defaultContactId =
    contacts.find((c) => c.email)?.id ?? contacts[0]?.id ?? "";

  const [templateId, setTemplateId] = useState(
    templates[0]?.id ? String(templates[0].id) : "",
  );
  const [contactId, setContactId] = useState(
    defaultContactId ? String(defaultContactId) : "",
  );
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (templates.length === 0) return null;

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("companyId", String(companyId));
    fd.set("templateId", templateId);
    if (contactId) fd.set("contactId", contactId);
    if (primaryDealId) fd.set("dealId", String(primaryDealId));
    return fd;
  }

  function openGmail() {
    if (!templateId) return;
    setCopied(false);
    startTransition(async () => {
      const res = await composeEmailAction(buildFormData());
      setResult(res);
      if (res?.gmailUrl) window.open(res.gmailUrl, "_blank", "noopener");
    });
  }

  function preview() {
    if (!templateId) return;
    setCopied(false);
    startTransition(async () => {
      setResult(await composeEmailAction(buildFormData()));
    });
  }

  async function copyFallback() {
    if (!result) return;
    const text = `To: ${result.to ?? ""}\nSubject: ${result.subject}\n\n${result.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const selectedContact = contacts.find((c) => String(c.id) === contactId);
  const emailStatusNote =
    selectedContact?.emailStatus === "inferred"
      ? "Inferred email — verify before sending."
      : selectedContact?.emailStatus === "role_inbox"
        ? "Role inbox — not a named person."
        : selectedContact?.emailStatus === "bounced"
          ? "Previously bounced — update before sending."
          : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compose email</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="compose-template">Template</Label>
            <Select
              id="compose-template"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setResult(null);
              }}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="compose-contact">Contact</Label>
            <Select
              id="compose-contact"
              value={contactId}
              onChange={(e) => {
                setContactId(e.target.value);
                setResult(null);
              }}
            >
              <option value="">— no recipient —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email ? ` · ${c.email}` : " · (no email)"}
                  {c.emailStatus === "inferred" ? " [inferred]" : ""}
                  {c.emailStatus === "role_inbox" ? " [inbox]" : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={openGmail} disabled={pending}>
            {pending ? "Rendering…" : "Open in Gmail"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={preview}
            disabled={pending}
          >
            Preview
          </Button>
          {result && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyFallback}
            >
              {copied ? "Copied ✓" : "Copy to clipboard"}
            </Button>
          )}
        </div>

        {emailStatusNote && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            {emailStatusNote}
          </p>
        )}

        {result && !result.to && contactId && (
          <p className="text-xs text-muted-foreground">
            This contact has no email on file - the draft opens without a
            recipient.
          </p>
        )}

        {result && (
          <div className="rounded-lg border bg-muted/40 p-3.5 text-sm">
            <div className="text-xs text-muted-foreground">
              To: {result.to ?? "—"}
            </div>
            <div className="mt-1 font-medium">{result.subject || "(no subject)"}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
              {result.body}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
