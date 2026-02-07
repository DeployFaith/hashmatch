import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonl } from "../../src/lib/replay/parseJsonl.js";
import { redactEvents } from "../../src/lib/replay/redaction.js";
import { DEFAULT_STARTING_RESOURCES } from "../../src/scenarios/resourceRivals/index.js";
import { findForbiddenTokens, findPrivateKeys } from "./leak-scanner.js";

const fixtureRoot = join(
  process.cwd(),
  "tests",
  "redaction-audit",
  "fixtures",
  "resource-rivals-tournament",
);

function listMatchFiles(): string[] {
  const matchesDir = join(fixtureRoot, "matches");
  const entries = readdirSync(matchesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(matchesDir, entry.name, "match.jsonl"))
    .filter((matchPath) => existsSync(matchPath));
}

function loadMatchEvents(matchPath: string) {
  const raw = readFileSync(matchPath, "utf-8");
  const parsed = parseJsonl(raw);
  if (parsed.errors.length > 0) {
    throw new Error(
      `Failed to parse ${matchPath}: ${parsed.errors.map((e) => e.message).join(", ")}`,
    );
  }
  return parsed.events;
}

const forbiddenTokens = ["_private", "remainingResources"];

describe("redaction audit (Resource Rivals fixture)", () => {
  const matchFiles = listMatchFiles();

  it("fixture includes match logs", () => {
    expect(matchFiles.length).toBeGreaterThan(0);
  });

  it("spectator mode strips private keys and spoilers", () => {
    for (const matchFile of matchFiles) {
      const events = loadMatchEvents(matchFile);
      const redacted = redactEvents(events, { mode: "spectator", revealSpoilers: false });

      for (const event of redacted) {
        expect(findPrivateKeys(event.displayRaw)).toEqual([]);
        expect(event.fullRaw).toBeNull();

        if (event.type === "MatchEnded") {
          const details = event.displayRaw.details;
          if (details !== undefined) {
            expect(typeof details).toBe("string");
          }
        }

        const tokenLeaks = findForbiddenTokens(
          { summary: event.summary, displayRaw: event.displayRaw },
          forbiddenTokens,
        );
        expect(tokenLeaks).toEqual([]);
      }
    }
  });

  it("postMatch mode avoids _private wrapper keys", () => {
    for (const matchFile of matchFiles) {
      const events = loadMatchEvents(matchFile);
      const redacted = redactEvents(events, { mode: "postMatch", revealSpoilers: false });

      for (const event of redacted) {
        expect(findPrivateKeys(event.displayRaw)).toEqual([]);
      }
    }
  });

  it("reports derivable remainingResources from public bids (informational)", () => {
    const summaries: Array<{ matchPath: string; resources: Record<string, number> }> = [];

    for (const matchFile of matchFiles) {
      const events = loadMatchEvents(matchFile);
      const matchStarted = events.find((event) => event.type === "MatchStarted");
      const agentIds = (matchStarted?.raw.agentIds ?? []) as string[];
      if (agentIds.length === 0) {
        continue;
      }

      const resources: Record<string, number> = {};
      for (const agentId of agentIds) {
        resources[agentId] = DEFAULT_STARTING_RESOURCES;
      }

      const pendingBids = new Map<string, number>();

      for (const event of events) {
        if (event.type !== "ActionAdjudicated") {
          continue;
        }

        const feedback = event.raw.feedback as Record<string, unknown> | undefined;
        const bidValue = feedback?.bid;
        const bid = typeof bidValue === "number" ? bidValue : 0;
        const effectiveBid = event.raw.valid ? bid : 0;
        if (event.agentId) {
          pendingBids.set(event.agentId, effectiveBid);
        }

        if (pendingBids.size === agentIds.length) {
          for (const [agentId, submittedBid] of pendingBids.entries()) {
            resources[agentId] = (resources[agentId] ?? 0) - submittedBid;
          }
          pendingBids.clear();
        }
      }

      summaries.push({ matchPath: matchFile, resources });
    }

    for (const summary of summaries) {
      console.info(
        `[redaction-audit] derived resources for ${summary.matchPath}`,
        summary.resources,
      );
    }

    expect(true).toBe(true);
  });
});
