import type { BotStatus } from "./bot-status";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/page-header";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={
        ok
          ? "mt-1.5 size-2.5 shrink-0 rounded-full bg-lime shadow-[0_0_0_3px_color-mix(in_srgb,var(--lime)_25%,transparent)]"
          : "mt-1.5 size-2.5 shrink-0 rounded-full bg-muted-foreground/40"
      }
    />
  );
}

export function SetupPanel({ status }: { status: BotStatus }) {
  const ready = status.envExists && status.tokenConfigured && status.channelsConfigured;
  const summaryVariant = !status.envExists ? "destructive" : ready ? "lime" : "warning";
  const summaryLabel = !status.envExists
    ? "Not configured"
    : ready
      ? "Ready"
      : "Needs setup";

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading>Bot status</SectionHeading>
          <Badge variant={summaryVariant}>{summaryLabel}</Badge>
        </div>

        <ul className="space-y-2.5">
          <li className="flex items-start gap-2.5 text-sm leading-snug">
            <StatusDot ok={status.envExists} />
            <span>
              {status.envExists ? (
                <>
                  Config file found at{" "}
                  <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.82em] text-foreground">
                    discord-bot/.env
                  </code>
                </>
              ) : (
                <>
                  No{" "}
                  <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.82em] text-foreground">
                    discord-bot/.env
                  </code>{" "}
                  yet - copy{" "}
                  <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.82em] text-foreground">
                    discord-bot/.env.example
                  </code>{" "}
                  to create it
                </>
              )}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm leading-snug">
            <StatusDot ok={status.tokenConfigured} />
            <span>
              {status.tokenConfigured
                ? "Bot token is set"
                : "DISCORD_BOT_TOKEN is not set - the bot will print setup help and exit"}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-sm leading-snug">
            <StatusDot ok={status.channelsConfigured} />
            <span>
              {status.channelsConfigured
                ? "Sponsorship channel IDs are configured"
                : "SPONSORSHIP_CHANNEL_IDS is empty - nothing will be scraped or captured"}
            </span>
          </li>
        </ul>

        <Separator />

        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Run the bot as a separate process (shares this database):
          </p>
          <code className="inline-block rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground">
            npm -C discord-bot run bot
          </code>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            The bot is a standalone package - install its deps once with{" "}
            <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.82em] text-foreground">
              npm -C discord-bot install
            </code>
            . Use{" "}
            <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.82em] text-foreground">
              /scrape
            </code>{" "}
            in Discord to pull recent messages into the inbox below, or let
            passive capture collect them as they are posted.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
