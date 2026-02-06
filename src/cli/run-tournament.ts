import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runTournament } from "../tournament/runTournament.js";
import type { TournamentConfig } from "../tournament/types.js";
import type { StandingsRow } from "../tournament/types.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  seed: number | undefined;
  rounds: number;
  maxTurns: number;
  scenario: string;
  agents: string[];
  outDir?: string;
  writeLogs: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let seed: number | undefined;
  let rounds = 1;
  let maxTurns = 20;
  let scenario = "numberGuess";
  let agents: string[] = ["random", "baseline"];
  let outDir: string | undefined;
  let writeLogs = false;

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
    } else if (arg === "--outDir" && i + 1 < argv.length) {
      outDir = argv[++i];
    } else if (arg === "--writeLogs") {
      writeLogs = true;
    }
  }

  return { seed, rounds, maxTurns, scenario, agents, outDir, writeLogs };
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.seed === undefined) {
    // eslint-disable-next-line no-console
    console.error("Error: --seed <number> is required");
    process.exit(1);
  }

  const config: TournamentConfig = {
    seed: args.seed,
    maxTurns: args.maxTurns,
    rounds: args.rounds,
    scenarioKey: args.scenario,
    agentKeys: args.agents,
    ...(args.writeLogs && { includeEventLogs: true }),
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
  console.log(`Completed ${result.matches.length} matches.\n`);

  printStandings(result.standings);

  // Write output files if requested
  if (args.outDir) {
    mkdirSync(args.outDir, { recursive: true });
    const summaryPath = join(args.outDir, "tournament.json");
    // Write summary without event logs (those go into per-match JSONL files)
    const summary = { config: result.config, matches: result.matches, standings: result.standings };
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf-8");
    // eslint-disable-next-line no-console
    console.log(`\nWrote tournament summary to ${summaryPath}`);

    if (args.writeLogs && result.matchLogs) {
      const matchesDir = join(args.outDir, "matches");
      mkdirSync(matchesDir, { recursive: true });
      for (const m of result.matches) {
        const events = result.matchLogs[m.matchId];
        if (events) {
          const logPath = join(matchesDir, `${m.matchId}.jsonl`);
          const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
          writeFileSync(logPath, lines, "utf-8");
        }
      }
      // eslint-disable-next-line no-console
      console.log(`Wrote ${result.matches.length} match logs to ${join(args.outDir, "matches")}`);
    }
  }
}

main();
