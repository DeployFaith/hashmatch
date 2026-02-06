import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runTournament } from "../tournament/runTournament.js";
import { writeTournamentArtifacts, writeTournamentBundle } from "../tournament/artifacts.js";
import type { TournamentConfig, StandingsRow } from "../tournament/types.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  seed: number | undefined;
  rounds: number;
  maxTurns: number;
  scenario: string;
  agents: string[];
  outDir: string;
  bundleOut?: string;
}

function parseArgs(argv: string[]): CliArgs {
  let seed: number | undefined;
  let rounds = 1;
  let maxTurns = 20;
  let scenario = "numberGuess";
  let agents: string[] = ["random", "baseline"];
  let outDir = "out";
  let bundleOut: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed" && i + 1 < argv.length) {
      seed = parseInt(argv[++i], 10);
    } else if (arg === "--rounds" && i + 1 < argv.length) {
      rounds = parseInt(argv[++i], 10);
    } else if (arg === "--maxTurns" && i + 1 < argv.length) {
      maxTurns = parseInt(argv[++i], 10);
    } else if (arg === "--scenario" && i + 1 < argv.length) {
      scenario = argv[++i];
    } else if (arg === "--agents" && i + 1 < argv.length) {
      agents = argv[++i].split(",");
    } else if ((arg === "--outDir" || arg === "--out") && i + 1 < argv.length) {
      outDir = argv[++i];
    } else if (arg === "--bundle-out" && i + 1 < argv.length) {
      bundleOut = argv[++i];
    }
  }

  return { seed, rounds, maxTurns, scenario, agents, outDir, bundleOut };
}

// ---------------------------------------------------------------------------
// Standings table
// ---------------------------------------------------------------------------

function printStandings(rows: StandingsRow[]): void {
  const header = ["Rank", "Agent", "M", "W", "L", "D", "Pts", "SF", "SA", "Diff"];

  const data = rows.map((r, i) => [
    String(i + 1),
    r.agentId,
    String(r.matches),
    String(r.wins),
    String(r.losses),
    String(r.draws),
    String(r.points),
    String(r.scoreFor),
    String(r.scoreAgainst),
    String(r.scoreDiff),
  ]);

  // Compute column widths
  const widths = header.map((h, col) => Math.max(h.length, ...data.map((row) => row[col].length)));

  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const formatRow = (row: string[]) =>
    row.map((cell, col) => cell.padStart(widths[col])).join(" | ");

  // eslint-disable-next-line no-console
  console.log(formatRow(header));
  // eslint-disable-next-line no-console
  console.log(sep);
  for (const row of data) {
    // eslint-disable-next-line no-console
    console.log(formatRow(row));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function tryReadHarnessVersion(): string | undefined {
  try {
    const packagePath = resolve(process.cwd(), "package.json");
    const raw = readFileSync(packagePath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.seed === undefined) {
    // eslint-disable-next-line no-console
    console.error("Error: --seed <number> is required");
    process.exit(1);
  }

  const harnessVersion = tryReadHarnessVersion();
  const config: TournamentConfig = {
    seed: args.seed,
    maxTurns: args.maxTurns,
    rounds: args.rounds,
    scenarioKey: args.scenario,
    agentKeys: args.agents,
    includeEventLogs: true,
    ...(harnessVersion && { harnessVersion }),
  };

  // eslint-disable-next-line no-console
  console.log(
    `Tournament: seed=${config.seed} rounds=${config.rounds} maxTurns=${config.maxTurns} ` +
      `scenario=${config.scenarioKey} agents=[${config.agentKeys.join(", ")}]`,
  );
  // eslint-disable-next-line no-console
  console.log();

  const result = runTournament(config);

  // eslint-disable-next-line no-console
  console.log(`Completed ${result.matchSummaries.length} matches.\n`);

  printStandings(result.standings);

  writeTournamentArtifacts(result, args.outDir);
  // eslint-disable-next-line no-console
  console.log(`\nWrote tournament artifacts to ${args.outDir}`);

  if (args.bundleOut) {
    writeTournamentBundle(result, args.bundleOut);
    // eslint-disable-next-line no-console
    console.log(`Wrote tournament bundle to ${args.bundleOut}`);
  }
}

main();
