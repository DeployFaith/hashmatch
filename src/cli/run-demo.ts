import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runMatch } from "../engine/runMatch.js";
import { createNumberGuessScenario } from "../scenarios/numberGuess/index.js";
import { createRandomAgent } from "../agents/randomAgent.js";
import { createBaselineAgent } from "../agents/baselineAgent.js";

interface CliArgs {
  seed: number;
  turns: number;
  out?: string;
  scenario: string;
}

function parseArgs(argv: string[]): CliArgs {
  let seed = 42;
  let turns = 20;
  let out: string | undefined;
  let scenario = "numberGuess";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed" && i + 1 < argv.length) {
      seed = parseInt(argv[++i], 10);
    } else if (arg === "--turns" && i + 1 < argv.length) {
      turns = parseInt(argv[++i], 10);
    } else if (arg === "--out" && i + 1 < argv.length) {
      out = argv[++i];
    } else if (arg === "--scenario" && i + 1 < argv.length) {
      scenario = argv[++i];
    }
  }

  return { seed, turns, out, scenario };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const outPath = args.out ?? "public/replays/number-guess-latest.jsonl";

  if (args.scenario !== "numberGuess") {
    // eslint-disable-next-line no-console
    console.error(`Unknown scenario: ${args.scenario}. Available: numberGuess`);
    process.exit(1);
  }

  const scenario = createNumberGuessScenario();
  const agents = [createRandomAgent("random-1"), createBaselineAgent("baseline-1")];

  const result = runMatch(scenario, agents, {
    seed: args.seed,
    maxTurns: args.turns,
  });

  const lines = result.events.map((e) => JSON.stringify(e)).join("\n") + "\n";

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, lines, "utf-8");
    // eslint-disable-next-line no-console
    console.error(`Wrote ${result.events.length} events to ${outPath}`);
  } else {
    process.stdout.write(lines);
  }
}

main();
