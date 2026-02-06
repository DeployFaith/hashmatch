import { writeFileSync } from "node:fs";
import { runMatch } from "../engine/runMatch.js";
import { getScenarioFactory, getAgentFactory } from "../tournament/runTournament.js";
import { resolveEngineProvenance } from "./provenance.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface MatchCliArgs {
  scenario: string;
  seed: number;
  turns: number;
  out?: string;
  agentA: string;
  agentB: string;
  emitProvenance: boolean;
  engineCommit?: string;
  engineVersion?: string;
}

function parseArgs(argv: string[]): MatchCliArgs {
  let scenario = "numberGuess";
  let seed = 42;
  let turns = 20;
  let out: string | undefined;
  let agentA = "random";
  let agentB = "baseline";
  let emitProvenance = false;
  let engineCommit: string | undefined;
  let engineVersion: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario" && i + 1 < argv.length) {
      scenario = argv[++i];
    } else if (arg === "--seed" && i + 1 < argv.length) {
      seed = parseInt(argv[++i], 10);
    } else if (arg === "--turns" && i + 1 < argv.length) {
      turns = parseInt(argv[++i], 10);
    } else if (arg === "--out" && i + 1 < argv.length) {
      out = argv[++i];
    } else if (arg === "--agentA" && i + 1 < argv.length) {
      agentA = argv[++i];
    } else if (arg === "--agentB" && i + 1 < argv.length) {
      agentB = argv[++i];
    } else if (arg === "--emit-provenance") {
      emitProvenance = true;
    } else if (arg === "--engine-commit" && i + 1 < argv.length) {
      engineCommit = argv[++i];
    } else if (arg === "--engine-version" && i + 1 < argv.length) {
      engineVersion = argv[++i];
    }
  }

  return { scenario, seed, turns, out, agentA, agentB, emitProvenance, engineCommit, engineVersion };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  // Validate scenario (getScenarioFactory throws with available options on unknown key)
  let scenarioFactory;
  try {
    scenarioFactory = getScenarioFactory(args.scenario);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Validate agents
  let agentAFactory;
  let agentBFactory;
  try {
    agentAFactory = getAgentFactory(args.agentA);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  try {
    agentBFactory = getAgentFactory(args.agentB);
  } catch (err: unknown) {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const scenario = scenarioFactory();
  const agents = [agentAFactory(`${args.agentA}-0`), agentBFactory(`${args.agentB}-1`)];
  const provenance = resolveEngineProvenance(
    { engineCommit: args.engineCommit, engineVersion: args.engineVersion },
    args.emitProvenance,
  );

  const result = runMatch(scenario, agents, {
    seed: args.seed,
    maxTurns: args.turns,
    ...(provenance && { provenance }),
  });

  const lines = result.events.map((e) => JSON.stringify(e)).join("\n") + "\n";

  if (args.out) {
    writeFileSync(args.out, lines, "utf-8");
    // eslint-disable-next-line no-console
    console.error(`Wrote ${result.events.length} events to ${args.out}`);
  } else {
    process.stdout.write(lines);
  }
}

main();
