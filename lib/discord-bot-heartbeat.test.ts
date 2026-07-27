import { describe, expect, it } from "vitest";
import {
  DISCORD_BOT_HEARTBEAT_STALE_MS,
  deriveBotState,
  parseBotHeartbeat,
  type BotHeartbeat,
} from "./discord-bot-heartbeat";

const NOW = Date.parse("2026-07-25T18:00:00.000Z");

function beatAt(msAgo: number): BotHeartbeat {
  return {
    at: new Date(NOW - msAgo).toISOString(),
    botTag: "Sponsor Engine#4821",
    channelCount: 2,
    guildId: "123",
    digestChannelId: null,
    host: "bot-host",
  };
}

describe("deriveBotState", () => {
  it("reports a recent check-in as online", () => {
    expect(deriveBotState(beatAt(60_000), NOW)).toEqual({
      state: "online",
      sinceLastSeenMs: 60_000,
    });
  });

  it("treats the staleness window boundary as still online", () => {
    expect(
      deriveBotState(beatAt(DISCORD_BOT_HEARTBEAT_STALE_MS), NOW).state,
    ).toBe("online");
  });

  it("reports a stale check-in as offline, not unconfigured", () => {
    // The regression this whole heartbeat exists for: a configured bot must
    // never be described as unconfigured just because it is not checking in.
    expect(
      deriveBotState(beatAt(DISCORD_BOT_HEARTBEAT_STALE_MS + 1), NOW).state,
    ).toBe("offline");
  });

  it("reports no heartbeat at all as unconfigured", () => {
    expect(deriveBotState(null, NOW)).toEqual({
      state: "unconfigured",
      sinceLastSeenMs: null,
    });
  });

  it("clamps a bot clock running ahead of the app to zero", () => {
    expect(deriveBotState(beatAt(-30_000), NOW)).toEqual({
      state: "online",
      sinceLastSeenMs: 0,
    });
  });

  it("falls back to unconfigured on an unparseable timestamp", () => {
    expect(
      deriveBotState({ ...beatAt(0), at: "not a date" }, NOW).state,
    ).toBe("unconfigured");
  });
});

describe("parseBotHeartbeat", () => {
  it("round-trips a written heartbeat", () => {
    const beat = beatAt(0);
    expect(parseBotHeartbeat(JSON.stringify(beat))).toEqual(beat);
  });

  it("returns null for missing, malformed, or non-object values", () => {
    expect(parseBotHeartbeat(null)).toBeNull();
    expect(parseBotHeartbeat("")).toBeNull();
    expect(parseBotHeartbeat("{oops")).toBeNull();
    expect(parseBotHeartbeat('"a string"')).toBeNull();
    expect(parseBotHeartbeat("{}")).toBeNull();
  });

  it("defaults fields an older bot version did not write", () => {
    const at = new Date(NOW).toISOString();
    expect(parseBotHeartbeat(JSON.stringify({ at }))).toEqual({
      at,
      botTag: null,
      channelCount: 0,
      guildId: null,
      digestChannelId: null,
      host: null,
    });
  });
});
