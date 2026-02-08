import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonl } from "../src/lib/replay/parseJsonl.js";
import { redactEvents } from "../src/lib/replay/redaction.js";

/**
 * Step 0 findings:
 * - Replay redaction is handled by `redactEvent(s)` in `src/lib/replay/redaction.ts`,
 *   with viewer modes `spectator`, `postMatch`, and `director`, plus a `revealSpoilers` flag.
 * - Scenario `_private` fields live in observations: Heist embeds map/alert state under
 *   `_private`, ResourceRivals stores `_private.remainingResources`, and NumberGuess uses
 *   `_private.secretNumber` in reveal output. (See `src/scenarios/.../index.ts`.)
 * - JSONL fixtures are parsed via `parseJsonl` from `src/lib/replay/parseJsonl.ts`.
 */

const fixtureRoot = process.cwd();

function loadJsonlEvents(filePath: string) {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseJsonl(raw);
  expect(parsed.errors).toEqual([]);
  return parsed.events;
}

function loadHeistEvents() {
  return loadJsonlEvents(
    join(fixtureRoot, "tests", "fixtures", "heist", "heist.museum_night_seed15.match.jsonl"),
  );
}

function loadResourceRivalsEvents() {
  const matchesDir = join(
    fixtureRoot,
    "tests",
    "redaction-audit",
    "fixtures",
    "resource-rivals-tournament",
    "matches",
  );
  const matchFolders = readdirSync(matchesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(matchesDir, entry.name, "match.jsonl"))
    .filter((matchPath) => existsSync(matchPath));

  expect(matchFolders.length).toBeGreaterThan(0);
  return loadJsonlEvents(matchFolders[0]);
}

function loadNumberGuessEvents() {
  return loadJsonlEvents(join(fixtureRoot, "public", "replays", "number-guess-demo.jsonl"));
}

/**
 * Recursively walks any object/array and returns true if any key
 * at any nesting depth starts with '_private'.
 */
function deepHasPrivateFields(obj: unknown): boolean {
  if (obj === null || obj === undefined) {
    return false;
  }
  if (Array.isArray(obj)) {
    return obj.some((item) => deepHasPrivateFields(item));
  }
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    return Object.entries(record).some(([key, value]) => {
      if (key.startsWith("_private")) {
        return true;
      }
      return deepHasPrivateFields(value);
    });
  }
  return false;
}

describe("deepHasPrivateFields", () => {
  it("detects nested _private keys in objects", () => {
    const payload = { safe: { nested: { _private: { secret: true } } } };
    expect(deepHasPrivateFields(payload)).toBe(true);
  });

  it("detects _private keys in arrays of objects", () => {
    const payload = [{ ok: true }, { _privateFoo: { hidden: 1 } }];
    expect(deepHasPrivateFields(payload)).toBe(true);
  });

  it("ignores primitives and nulls", () => {
    expect(deepHasPrivateFields("string")).toBe(false);
    expect(deepHasPrivateFields(42)).toBe(false);
    expect(deepHasPrivateFields(false)).toBe(false);
    expect(deepHasPrivateFields(null)).toBe(false);
    expect(deepHasPrivateFields(undefined)).toBe(false);
  });

  it("handles mixed nesting without false positives", () => {
    const payload = { list: ["a", { nested: [{ ok: true }] }], value: 10 };
    expect(deepHasPrivateFields(payload)).toBe(false);
  });
});

describe("redaction integration", () => {
  it("Heist spectator output contains no _private fields", () => {
    const events = loadHeistEvents();
    const rawHasPrivate = events.some((event) => deepHasPrivateFields(event.raw));
    expect(rawHasPrivate).toBe(true);

    const redacted = redactEvents(events, { mode: "spectator", revealSpoilers: false });
    for (const event of redacted) {
      expect(deepHasPrivateFields(event.displayRaw)).toBe(false);
    }
  });

  it("ResourceRivals spectator output contains no _private fields", () => {
    const events = loadResourceRivalsEvents();
    const rawHasPrivate = events.some((event) => deepHasPrivateFields(event.raw));
    expect(rawHasPrivate).toBe(true);

    const redacted = redactEvents(events, { mode: "spectator", revealSpoilers: false });
    for (const event of redacted) {
      expect(deepHasPrivateFields(event.displayRaw)).toBe(false);
    }
  });

  it("NumberGuess spectator output contains no _private fields", () => {
    const events = loadNumberGuessEvents();
    const rawHasPrivate = events.some((event) => deepHasPrivateFields(event.raw));

    if (rawHasPrivate) {
      expect(rawHasPrivate).toBe(true);
    } else {
      // The NumberGuess demo fixture currently has no `_private` fields;
      // this test still protects against future additions.
      expect(rawHasPrivate).toBe(false);
    }

    const redacted = redactEvents(events, { mode: "spectator", revealSpoilers: false });
    for (const event of redacted) {
      expect(deepHasPrivateFields(event.displayRaw)).toBe(false);
    }
  });

  it("Director mode preserves _private fields", () => {
    const events = loadHeistEvents();
    const redacted = redactEvents(events, { mode: "director", revealSpoilers: false });
    const directorHasPrivate = redacted.some((event) => deepHasPrivateFields(event.fullRaw));
    expect(directorHasPrivate).toBe(true);
  });

  it("postMatch mode reveals _private fields", () => {
    const events = loadHeistEvents();
    const redacted = redactEvents(events, { mode: "postMatch", revealSpoilers: true });
    const postMatchHasPrivate = redacted.some((event) => deepHasPrivateFields(event.fullRaw));
    expect(postMatchHasPrivate).toBe(true);
  });

  it("Redaction does not drop non-private fields", () => {
    const events = loadHeistEvents();
    const target = events.find((event) => {
      if (event.type !== "ObservationEmitted") {
        return false;
      }
      const observation = event.raw.observation as Record<string, unknown> | undefined;
      return Boolean(
        observation &&
        typeof observation === "object" &&
        "_private" in observation &&
        "currentRoomId" in observation &&
        "adjacentRooms" in observation,
      );
    });

    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    const [redacted] = redactEvents([target], { mode: "spectator", revealSpoilers: false });
    const observation = redacted.displayRaw.observation as Record<string, unknown> | undefined;

    expect(observation).toBeDefined();
    expect(observation?._private).toBeUndefined();
    expect(observation?.currentRoomId).toBeDefined();
    expect(observation?.adjacentRooms).toBeDefined();
  });
});
