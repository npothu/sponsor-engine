"use client";

import { useState } from "react";
import type { Contact } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABEL,
  EMAIL_STATUSES,
  EMAIL_STATUS_LABEL,
  ContactTypeBadge,
  ContactCategoryBadge,
  EmailStatusBadge,
  WarmthBadge,
} from "../ui";
import {
  createContactAction,
  updateContactAction,
  deleteContactAction,
} from "../actions";

const WARMTHS = ["cold", "warm", "hot"] as const;

/** Contacts list with inline add and per-row edit/delete. */
export function ContactsSection({
  companyId,
  contacts,
}: {
  companyId: number;
  contacts: Contact[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Contacts</CardTitle>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            + Add contact
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {adding && (
          <ContactForm
            companyId={companyId}
            contacts={contacts}
            onDone={() => setAdding(false)}
            submitLabel="Add contact"
            action={createContactAction}
          />
        )}

        {contacts.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">
            No contacts yet. Add the person you are pitching.
          </p>
        ) : (
          <div className="grid gap-2.5">
            {contacts.map((c) => (
              <ContactRow
                key={c.id}
                companyId={companyId}
                contact={c}
                contacts={contacts}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContactRow({
  companyId,
  contact,
  contacts,
}: {
  companyId: number;
  contact: Contact;
  contacts: Contact[];
}) {
  const [editing, setEditing] = useState(false);
  const referredBy = contact.referredByContactId
    ? contacts.find((c) => c.id === contact.referredByContactId) ?? null
    : null;

  if (editing) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4">
        <ContactForm
          companyId={companyId}
          contact={contact}
          contacts={contacts}
          onDone={() => setEditing(false)}
          submitLabel="Save"
          action={updateContactAction}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{contact.name}</span>
          <WarmthBadge warmth={contact.warmth} />
          <ContactTypeBadge contactType={contact.contactType} />
          <ContactCategoryBadge category={contact.category} />
        </div>
        {contact.role && (
          <div className="mt-0.5 text-sm text-muted-foreground">
            {contact.role}
          </div>
        )}
        {referredBy && (
          <div className="mt-0.5 text-sm text-muted-foreground">
            referred by {referredBy.name}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
          {contact.email && (
            <span className="inline-flex flex-wrap items-center gap-2">
              <a
                className="text-primary underline-offset-4 hover:underline dark:text-lime"
                href={`mailto:${contact.email}`}
              >
                {contact.email}
              </a>
              <EmailStatusBadge status={contact.emailStatus} />
            </span>
          )}
          {contact.phone && (
            <span className="text-muted-foreground">{contact.phone}</span>
          )}
          {contact.linkedin && (
            <a
              className="text-primary underline-offset-4 hover:underline dark:text-lime"
              href={contact.linkedin}
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          )}
          {contact.sourcedFrom && (
            <span className="text-muted-foreground">
              via {contact.sourcedFrom}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        <form action={deleteContactAction}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="contactId" value={contact.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            Delete
          </Button>
        </form>
      </div>
    </div>
  );
}

function ContactForm({
  companyId,
  contact,
  contacts,
  onDone,
  submitLabel,
  action,
}: {
  companyId: number;
  contact?: Contact;
  contacts: Contact[];
  onDone: () => void;
  submitLabel: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  // Referral options are the company's OTHER contacts (never a self-reference).
  const referralOptions = contacts.filter((c) => c.id !== contact?.id);
  return (
    <form
      action={async (fd) => {
        await action(fd);
        onDone();
      }}
      className={contact ? undefined : "rounded-lg border bg-muted/40 p-4"}
    >
      <input type="hidden" name="companyId" value={companyId} />
      {contact && <input type="hidden" name="contactId" value={contact.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="cf-name">Name</Label>
          <Input
            id="cf-name"
            name="name"
            required
            defaultValue={contact?.name ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="cf-role">Role</Label>
          <Input
            id="cf-role"
            name="role"
            defaultValue={contact?.role ?? ""}
            placeholder="University Recruiter"
          />
        </div>
        <div>
          <Label htmlFor="cf-email">Email</Label>
          <Input
            id="cf-email"
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="cf-phone">Phone</Label>
          <Input
            id="cf-phone"
            name="phone"
            defaultValue={contact?.phone ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="cf-linkedin">LinkedIn</Label>
          <Input
            id="cf-linkedin"
            name="linkedin"
            defaultValue={contact?.linkedin ?? ""}
            placeholder="https://linkedin.com/in/..."
          />
        </div>
        <div>
          <Label htmlFor="cf-sourced">Sourced from</Label>
          <Input
            id="cf-sourced"
            name="sourcedFrom"
            defaultValue={contact?.sourcedFrom ?? ""}
            placeholder="Career fair, referral, ..."
          />
        </div>
        <div>
          <Label htmlFor="cf-warmth">Warmth</Label>
          <Select
            id="cf-warmth"
            name="warmth"
            defaultValue={contact?.warmth ?? "cold"}
          >
            {WARMTHS.map((w) => (
              <option key={w} value={w}>
                {w[0].toUpperCase() + w.slice(1)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cf-type">Decision-maker role</Label>
          <Select
            id="cf-type"
            name="contactType"
            defaultValue={contact?.contactType ?? "unknown"}
          >
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTACT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cf-category">Sourcing category</Label>
          <Select
            id="cf-category"
            name="category"
            defaultValue={contact?.category ?? ""}
          >
            <option value="">— none —</option>
            {CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CONTACT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cf-email-status">Email trust</Label>
          <Select
            id="cf-email-status"
            name="emailStatus"
            defaultValue={contact?.emailStatus ?? ""}
          >
            <option value="">— none —</option>
            {EMAIL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EMAIL_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="cf-email-source">Email source</Label>
          <Input
            id="cf-email-source"
            name="emailSource"
            defaultValue={contact?.emailSource ?? ""}
            placeholder="URL or pattern note"
          />
        </div>
        {referralOptions.length > 0 && (
          <div>
            <Label htmlFor="cf-referred-by">Referred by</Label>
            <Select
              id="cf-referred-by"
              name="referredByContactId"
              defaultValue={
                contact?.referredByContactId != null
                  ? String(contact.referredByContactId)
                  : ""
              }
            >
              <option value="">No referral</option>
              {referralOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
