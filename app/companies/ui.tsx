import type {
  CompanyPriority,
  ContactType,
  ContactWarmth,
  ContactCategory,
  EmailStatus,
  DealLostReason,
  DealSatisfaction,
  DealStage,
  TouchpointChannel,
  TouchpointDirection,
} from "@/lib/schema";
import { Badge } from "@/components/ui/badge";

/**
 * Shared presentational helpers for the companies feature: stage/warmth/channel
 * labels, badge styling, and small formatters. Kept local to the feature so it
 * owns its own visual vocabulary while leaning on the design-system Badge.
 */

export const CONTACT_CATEGORIES = [
  "university_relations",
  "erg_lead",
  "erg_officer",
  "alum_early_career",
  "channel_fallback",
] as const satisfies readonly ContactCategory[];

export const EMAIL_STATUSES = [
  "verified",
  "inferred",
  "role_inbox",
  "bounced",
] as const satisfies readonly EmailStatus[];

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

export const DEAL_STAGES: DealStage[] = [
  "prospect",
  "outreach",
  "conversation",
  "pitched",
  "negotiating",
  "committed",
  "fulfilling",
  "renewed",
  "lapsed",
  "rejected",
];

export const STAGE_LABEL: Record<DealStage, string> = {
  prospect: "Prospect",
  outreach: "Outreach",
  conversation: "Conversation",
  pitched: "Pitched",
  negotiating: "Negotiating",
  committed: "Committed",
  fulfilling: "Fulfilling",
  renewed: "Renewed",
  lapsed: "Lapsed",
  rejected: "Rejected",
};

/** Badge variant per stage - maps the pipeline to the design-system palette. */
const STAGE_VARIANT: Record<DealStage, BadgeVariant> = {
  prospect: "outline",
  outreach: "info",
  conversation: "info",
  pitched: "warning",
  negotiating: "warning",
  committed: "lime",
  fulfilling: "lime",
  renewed: "lime",
  lapsed: "destructive",
  rejected: "destructive",
};

export function StageBadge({ stage }: { stage: string }) {
  const s = stage as DealStage;
  const variant = STAGE_VARIANT[s] ?? "outline";
  return <Badge variant={variant}>{STAGE_LABEL[s] ?? stage}</Badge>;
}

export const WARMTH_LABEL: Record<ContactWarmth, string> = {
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
};

const WARMTH_VARIANT: Record<ContactWarmth, BadgeVariant> = {
  cold: "info",
  warm: "warning",
  hot: "destructive",
};

export function WarmthBadge({ warmth }: { warmth: string }) {
  const w = (["cold", "warm", "hot"].includes(warmth) ? warmth : "cold") as ContactWarmth;
  return <Badge variant={WARMTH_VARIANT[w]}>{WARMTH_LABEL[w]}</Badge>;
}

export const CONTACT_TYPES: ContactType[] = [
  "unknown",
  "gatekeeper",
  "influencer",
  "champion",
  "budget_holder",
];

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  unknown: "Unknown role",
  gatekeeper: "Gatekeeper",
  influencer: "Influencer",
  champion: "Champion",
  budget_holder: "Budget holder",
};

/**
 * Badge variant per contact type - the decision-maker map. A budget_holder (can
 * sign) reads as the strongest signal (solid), a champion is positive (lime),
 * influencer is neutral-informative (info), gatekeeper is cautionary (warning),
 * and unknown is muted (outline). Distinct from the warmth palette and legible
 * in both Heritage light and Evergreen dark.
 */
const CONTACT_TYPE_VARIANT: Record<ContactType, BadgeVariant> = {
  unknown: "outline",
  gatekeeper: "warning",
  influencer: "info",
  champion: "lime",
  budget_holder: "solid",
};

export function ContactTypeBadge({ contactType }: { contactType: string }) {
  const t = (
    CONTACT_TYPES.includes(contactType as ContactType) ? contactType : "unknown"
  ) as ContactType;
  // 'unknown' carries no useful signal - render nothing rather than a muted chip.
  if (t === "unknown") return null;
  return (
    <Badge variant={CONTACT_TYPE_VARIANT[t]}>{CONTACT_TYPE_LABEL[t]}</Badge>
  );
}

export const CONTACT_CATEGORY_LABEL: Record<ContactCategory, string> = {
  university_relations: "University relations",
  erg_lead: "ERG lead",
  erg_officer: "ERG officer",
  alum_early_career: "GT alum",
  channel_fallback: "Channel",
};

const CONTACT_CATEGORY_VARIANT: Record<ContactCategory, BadgeVariant> = {
  university_relations: "info",
  erg_lead: "lime",
  erg_officer: "lime",
  alum_early_career: "warning",
  channel_fallback: "secondary",
};

export function ContactCategoryBadge({ category }: { category: string | null }) {
  if (!category || !(CONTACT_CATEGORIES as readonly string[]).includes(category)) {
    return null;
  }
  const c = category as ContactCategory;
  return (
    <Badge variant={CONTACT_CATEGORY_VARIANT[c]}>
      {CONTACT_CATEGORY_LABEL[c]}
    </Badge>
  );
}

export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  verified: "Verified email",
  inferred: "Inferred email",
  role_inbox: "Role inbox",
  bounced: "Bounced",
};

const EMAIL_STATUS_VARIANT: Record<EmailStatus, BadgeVariant> = {
  verified: "lime",
  inferred: "warning",
  role_inbox: "secondary",
  bounced: "destructive",
};

export function EmailStatusBadge({ status }: { status: string | null }) {
  if (!status || !(EMAIL_STATUSES as readonly string[]).includes(status)) {
    return null;
  }
  const s = status as EmailStatus;
  return (
    <Badge variant={EMAIL_STATUS_VARIANT[s]}>{EMAIL_STATUS_LABEL[s]}</Badge>
  );
}

export const PRIORITIES: CompanyPriority[] = ["high", "medium", "low"];

export const PRIORITY_LABEL: Record<CompanyPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/**
 * Badge variant per priority - high reads urgent (destructive red), medium is
 * amber (warning), low is muted (secondary). Distinct from the stage/warmth
 * palettes and legible in both Heritage light and Evergreen dark.
 */
const PRIORITY_VARIANT: Record<CompanyPriority, BadgeVariant> = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const p = (["high", "medium", "low"].includes(priority)
    ? priority
    : "medium") as CompanyPriority;
  return <Badge variant={PRIORITY_VARIANT[p]}>{PRIORITY_LABEL[p]}</Badge>;
}

export const RELATIONSHIP_LABEL: Record<string, string> = {
  do_not_contact_yet: "Do not contact yet",
  prior_relationship: "Prior relationship",
  cold: "Cold",
};

/**
 * Badge variant per cross-cycle relationship: a prior relationship reads warm
 * (lime), a do-not-contact-yet deferral is cautionary (warning), and a genuinely
 * cold company is muted (outline). Legible in both Heritage light and Evergreen
 * dark. 'cold' renders nothing - the absence of a warm signal is the default.
 */
const RELATIONSHIP_VARIANT: Record<string, BadgeVariant> = {
  do_not_contact_yet: "warning",
  prior_relationship: "lime",
  cold: "outline",
};

export function RelationshipBadge({
  relationship,
}: {
  relationship: string;
}) {
  if (relationship === "cold" || !(relationship in RELATIONSHIP_LABEL)) {
    return null;
  }
  return (
    <Badge
      variant={RELATIONSHIP_VARIANT[relationship]}
      title={
        relationship === "prior_relationship"
          ? "This company has a prior relationship (a past-cycle deal or one that reached an engaged stage) - re-approach it warmly, not cold"
          : "This company asked to be contacted later - it resurfaces on its re-ask date, do not cold-email it before then"
      }
    >
      {RELATIONSHIP_LABEL[relationship]}
    </Badge>
  );
}

/**
 * Loss-reason list + labels, mirrored here (client-safe) so client components
 * like the deal panel can render the lapse prompt without importing the
 * server-only data layer. The data layer owns validation; this is display only.
 */
export const DEAL_LOST_REASONS: DealLostReason[] = [
  "budget",
  "timing",
  "no_response",
  "no_fit",
  "chose_competitor",
  "wrong_contact",
  "other",
];

export const DEAL_LOST_REASON_LABEL: Record<DealLostReason, string> = {
  budget: "Budget",
  timing: "Timing",
  no_response: "No response",
  no_fit: "No fit",
  chose_competitor: "Chose competitor",
  wrong_contact: "Wrong contact",
  other: "Other",
};

/**
 * Sponsor-satisfaction list + labels, mirrored here (client-safe) so client
 * components like the deal panel and the fulfillment card can render the control
 * and badge without importing the server-only data layer. The data layer owns
 * validation (normalizeDealSatisfaction); this is display only.
 */
export const DEAL_SATISFACTIONS: DealSatisfaction[] = [
  "happy",
  "neutral",
  "at_risk",
];

export const DEAL_SATISFACTION_LABEL: Record<DealSatisfaction, string> = {
  happy: "Happy",
  neutral: "Neutral",
  at_risk: "At risk",
};

/**
 * Badge variant per satisfaction: a happy sponsor reads positive (lime), neutral
 * is muted (secondary), at-risk is urgent (destructive). Legible in both
 * Heritage light and Evergreen dark.
 */
const SATISFACTION_VARIANT: Record<DealSatisfaction, BadgeVariant> = {
  happy: "lime",
  neutral: "secondary",
  at_risk: "destructive",
};

export function SatisfactionBadge({
  satisfaction,
}: {
  satisfaction: string | null | undefined;
}) {
  if (
    satisfaction == null ||
    !DEAL_SATISFACTIONS.includes(satisfaction as DealSatisfaction)
  ) {
    return null;
  }
  const s = satisfaction as DealSatisfaction;
  return <Badge variant={SATISFACTION_VARIANT[s]}>{DEAL_SATISFACTION_LABEL[s]}</Badge>;
}

export function TypeBadge({ type }: { type: string }) {
  const isCorporate = type === "corporate";
  return (
    <Badge variant={isCorporate ? "default" : "secondary"}>
      {isCorporate ? "Corporate" : "Community"}
    </Badge>
  );
}

export const CHANNEL_LABEL: Record<TouchpointChannel, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  career_fair: "Career fair",
  linkedin: "LinkedIn",
  discord: "Discord",
  other: "Other",
};

/** Simple glyph per channel - keeps the timeline scannable without an icon lib. */
export const CHANNEL_ICON: Record<TouchpointChannel, string> = {
  email: "✉", // envelope
  call: "☎", // phone
  meeting: "◈", // diamond
  career_fair: "⚑", // flag
  linkedin: "■", // square
  discord: "◉", // fisheye
  other: "•", // bullet
};

export const CHANNELS: TouchpointChannel[] = [
  "email",
  "call",
  "meeting",
  "career_fair",
  "linkedin",
  "discord",
  "other",
];

export const DIRECTION_LABEL: Record<TouchpointDirection, string> = {
  outbound: "Outbound",
  inbound: "Inbound",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMoney(amount: number | null): string {
  if (amount == null) return "—";
  return "$" + amount.toLocaleString("en-US");
}

/** YYYY-MM-DD for date inputs, defaulting to today. */
export function todayInputValue(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Local YYYY-MM-DDTHH:mm for datetime-local inputs, defaulting to now. Used
 * where the stored timestamp carries a meaningful time of day, so round-tripping
 * a row through an edit form does not silently reset it to midnight.
 */
export function dateTimeInputValue(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return dateTimeInputValue();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

/** Relative-day helper: negative = overdue, 0 = today. */
export function dueTone(dueDate: string): "overdue" | "today" | "future" {
  const due = new Date(dueDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(due.getTime())) return "future";
  if (due.getTime() < today.getTime()) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "future";
}
