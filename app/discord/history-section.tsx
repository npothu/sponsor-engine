import Link from "next/link";
import type { Company, DiscordInboxMessage } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";

function formatWhen(iso: string | null): string {
  if (!iso) return "Unknown date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function HistoryRow({
  message,
  companyName,
}: {
  message: DiscordInboxMessage;
  companyName: string | null;
}) {
  return (
    <div className="border-t border-border py-2.5 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {message.author ?? "Unknown"}
        </span>
        {message.channelName && <Badge>#{message.channelName}</Badge>}
        <span className="text-xs text-muted-foreground">
          {formatWhen(message.postedAt)}
        </span>
        {message.status === "attached" ? (
          <Badge variant="lime">
            {companyName ? `Attached: ${companyName}` : "Attached"}
          </Badge>
        ) : (
          <Badge variant="secondary">Dismissed</Badge>
        )}
      </div>
      {message.content && (
        <p className="mt-1.5 break-words text-sm text-muted-foreground">
          {message.content}
        </p>
      )}
    </div>
  );
}

export function HistorySection({
  messages,
  companies,
}: {
  messages: DiscordInboxMessage[];
  companies: Company[];
}) {
  if (messages.length === 0) return null;

  const nameById = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="cursor-pointer list-none select-none px-4 py-3 text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mr-2 inline-block text-muted-foreground transition-transform group-open:rotate-90">
          &#9656;
        </span>
        Processed history ({messages.length})
      </summary>
      <div className="space-y-1 px-4 pb-3">
        {messages.map((m) => (
          <HistoryRow
            key={m.id}
            message={m}
            companyName={
              m.attachedCompanyId != null
                ? (nameById.get(m.attachedCompanyId) ?? null)
                : null
            }
          />
        ))}
      </div>
      <p className="px-4 pb-3.5 text-xs text-muted-foreground">
        Attached messages log a Discord touchpoint on the{" "}
        <Link
          href="/board"
          className="text-primary underline-offset-4 hover:underline dark:text-lime"
        >
          company
        </Link>{" "}
        when the box was checked.
      </p>
    </details>
  );
}
