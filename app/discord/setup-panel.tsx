import { formatDistanceToNow } from "date-fns";
import type { BotStatus } from "./bot-status";
import { setBotPausedAction } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/page-header";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

function Item({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-snug">
      <StatusDot ok={ok} />
      <span>{children}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-accent px-1.5 py-0.5 text-[0.82em] text-foreground">
      {children}
    </code>
  );
}

const SUMMARY = {
  online: { label: "Running", variant: "lime" },
  offline: { label: "Not running", variant: "warning" },
  unconfigured: { label: "Not configured", variant: "destructive" },
} as const;

export function SetupPanel({ status }: { status: BotStatus }) {
  const { state, heartbeat, localEnv, pause } = status;
  const paused = pause?.paused ?? false;
  // A paused-but-running bot is deliberately idle, which trumps "Running"; a
  // stopped or never-seen bot keeps its more urgent label either way.
  const summary =
    paused && state === "online"
      ? ({ label: "Paused", variant: "warning" } as const)
      : SUMMARY[state];
  const ago = heartbeat
    ? formatDistanceToNow(new Date(heartbeat.at), { addSuffix: true })
    : null;
  const pausedAgo = pause
    ? formatDistanceToNow(new Date(pause.at), { addSuffix: true })
    : null;

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading>Bot status</SectionHeading>
          <Badge variant={summary.variant}>{summary.label}</Badge>
        </div>

        <ul className="space-y-2.5">
          {state === "unconfigured" ? (
            <Item ok={false}>
              The bot has never checked in to this database - start it with{" "}
              <Code>npm -C discord-bot run bot</Code> on the machine that hosts
              it
            </Item>
          ) : (
            <Item ok={state === "online"}>
              {state === "online" ? "Checked in " : "Last checked in "}
              {ago}
              {heartbeat?.botTag ? ` as ${heartbeat.botTag}` : null}
              {heartbeat?.host ? ` on ${heartbeat.host}` : null}
              {state === "offline"
                ? " - the bot process looks stopped, restart it to resume capture"
                : null}
            </Item>
          )}

          {paused ? (
            <Item ok={false}>
              Paused from this app {pausedAgo} - the bot stays logged in but
              ignores commands, captures no messages, and posts no digests until
              resumed
            </Item>
          ) : null}

          {heartbeat ? (
            <Item ok={heartbeat.channelCount > 0}>
              {heartbeat.channelCount > 0
                ? `Watching ${heartbeat.channelCount} sponsorship channel${
                    heartbeat.channelCount === 1 ? "" : "s"
                  }`
                : "SPONSORSHIP_CHANNEL_IDS is empty - nothing will be scraped or captured"}
            </Item>
          ) : null}

          {/* Only this machine's own config is worth reporting on. Once the bot
              has checked in its heartbeat is the better source, and a server
              that hosts no config (localEnv null) knows nothing either way. */}
          {!heartbeat && localEnv ? (
            <>
              <Item ok={localEnv.tokenConfigured}>
                {localEnv.tokenConfigured
                  ? "Bot token is set"
                  : "DISCORD_BOT_TOKEN is not set - the bot will print setup help and exit"}
              </Item>
              <Item ok={localEnv.channelsConfigured}>
                {localEnv.channelsConfigured
                  ? "Sponsorship channel IDs are configured"
                  : "SPONSORSHIP_CHANNEL_IDS is empty - nothing will be scraped or captured"}
              </Item>
            </>
          ) : null}

          {localEnv ? (
            <Item ok={localEnv.exists}>
              {localEnv.exists ? (
                <>
                  Config file found on this server at{" "}
                  <Code>discord-bot/.env</Code>
                </>
              ) : (
                <>
                  No <Code>discord-bot/.env</Code> on this server - copy{" "}
                  <Code>discord-bot/.env.example</Code> to create it
                </>
              )}
            </Item>
          ) : null}
        </ul>

        {state !== "unconfigured" ? (
          <form
            action={setBotPausedAction}
            className="flex items-center gap-3"
          >
            <input type="hidden" name="paused" value={paused ? "0" : "1"} />
            <Button type="submit" variant="outline" size="sm">
              {paused ? "Resume bot" : "Pause bot"}
            </Button>
            <p className="text-sm text-muted-foreground">
              {paused
                ? "The bot picks the switch up within about half a minute."
                : "Pausing works from anywhere - the bot checks this switch through the shared database."}
            </p>
          </form>
        ) : null}

        {!localEnv ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            This server has no bot config of its own - the{" "}
            <Code>discord-bot/.env</Code>{" "}
            file lives on the machine that runs the bot and is never deployed,
            so everything above comes from the bot&apos;s own check-ins to the
            shared database.
          </p>
        ) : null}

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
            <Code>npm -C discord-bot install</Code>. Use <Code>/scrape</Code> in
            Discord to pull recent messages into the inbox below, or let passive
            capture collect them as they are posted.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
