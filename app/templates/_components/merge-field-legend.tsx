import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MERGE_FIELDS: { token: string; description: string }[] = [
  { token: "{{company}}", description: "Company name" },
  { token: "{{contact_name}}", description: "Full contact name" },
  { token: "{{contact_first_name}}", description: "Contact's first name" },
  { token: "{{tier_name}}", description: "Target tier on the company's latest deal" },
  { token: "{{tier_price}}", description: "Price of the target tier, e.g. $2,000" },
  { token: "{{your_name}}", description: "Your name" },
  { token: "{{org_name}}", description: "Your organization's name (settings)" },
  { token: "{{member_count}}", description: "Member-count proof point (settings)" },
  { token: "{{hackathon_reach}}", description: "Hackathon reach proof point (settings)" },
  {
    token: "{{current_sponsors}}",
    description: "Current sponsors (settings override, else live committed deals)",
  },
  {
    token: "{{anchor_event}}",
    description: "Anchor event (settings override, else active cycle)",
  },
  { token: "{{fit_notes}}", description: "This company's fit notes" },
  {
    token: "{{personalization_hook}}",
    description:
      "Clause from checked fit signals, e.g. \"since your team already hires students from our campus\"",
  },
  { token: "{{deck_link}}", description: "Shareable link on the current deck version" },
  { token: "{{days_to_event}}", description: "Days remaining until the anchor event" },
  { token: "{{event_date}}", description: "Anchor event date, e.g. April 12, 2027" },
];

export function MergeFieldLegend() {
  return (
    <Card className="p-3">
      <CardContent className="px-0">
        <p className="mb-2 font-display text-sm font-semibold text-primary dark:text-foreground">
          Merge fields
        </p>
        <div className="flex flex-col gap-1.5">
          {MERGE_FIELDS.map((f) => (
            <div key={f.token} className="flex items-baseline gap-2">
              <Badge variant="info" asChild>
                <code className="font-mono text-[0.72rem] font-medium normal-case tracking-normal">
                  {f.token}
                </code>
              </Badge>
              <span className="text-xs text-muted-foreground">{f.description}</span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          Unknown or unavailable fields render as empty text. Whitespace inside
          the braces is fine, e.g. <code className="font-mono">{"{{ company }}"}</code>.
        </p>
      </CardContent>
    </Card>
  );
}

export default MergeFieldLegend;
