import { describe, expect, it } from "vitest";
import { parseBotPause } from "./discord-bot-control";

const AT = "2026-07-26T12:00:00.000Z";

describe("parseBotPause", () => {
  it("round-trips a written pause record", () => {
    const pause = { paused: true, at: AT };
    expect(parseBotPause(JSON.stringify(pause))).toEqual(pause);
  });

  it("round-trips a resume record", () => {
    const pause = { paused: false, at: AT };
    expect(parseBotPause(JSON.stringify(pause))).toEqual(pause);
  });

  it("returns null for missing, malformed, or non-object values", () => {
    expect(parseBotPause(null)).toBeNull();
    expect(parseBotPause("")).toBeNull();
    expect(parseBotPause("{oops")).toBeNull();
    expect(parseBotPause('"a string"')).toBeNull();
    expect(parseBotPause("{}")).toBeNull();
    expect(parseBotPause('{"paused":"yes"}')).toBeNull();
  });

  it("keeps the paused flag but epoch-defaults an unparseable timestamp", () => {
    // A garbled timestamp must not flip a paused bot back on - the flag is the
    // safety-relevant half of the record.
    expect(parseBotPause('{"paused":true,"at":"not a date"}')).toEqual({
      paused: true,
      at: new Date(0).toISOString(),
    });
  });
});
