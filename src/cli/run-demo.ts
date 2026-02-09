import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runMatch } from "../engine/runMatch.js";
import { toStableJsonl } from "../core/json.js";
import { createNumberGuessScenario } from "../scenarios/numberGuess/index.js";
import { createRandomAgent } from "../agents/randomAgent.js";
import { createBaselineAgent } from "../agents/baselineAgent.js";

interface CliArgs {
  seed: number;
  turns: number;
  out?: string;
  scenario: string;
  emitProvenance: boolean;
  engineCommit?: string;
  engineVersion?: string;
}

const DEFAULT_OUT_PATH = "out/replays/number-guess-latest.jsonl";

function parseArgs(argv: string[]): CliArgs {
  let seed = 42;
  let turns = 20;
  let out: string | undefined;
  let scenario = "numberGuess";
  let emitProvenance = false;
  let engineCommit: string | undefined;
  let engineVersion: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed" && i + 1 < argv.length) {
      seed = parseInt(argv[++i], 10);
    } else if ((arg === "--turns" || arg === "--maxTurns") && i + 1 < argv.length) {
      turns = parseInt(argv[++i], 10);
    } else if (arg === "--out" && i + 1 < argv.length) {
      out = argv[++i];
    } else if (arg === "--scenario" && i + 1 < argv.length) {
      scenario = argv[++i];
    } else if (arg === "--emit-provenance") {
      emitProvenance = true;
    } else if (arg === "--engine-commit" && i + 1 < argv.length) {
      engineCommit = argv[++i];
    } else if (arg === "--engine-version" && i + 1 < argv.length) {
      engineVersion = argv[++i];
    }
  }

  return {
    seed,
    turns,
    out,
    scenario,
    emitProvenance,
    engineCommit,
    engineVersion,
  };
}

function tryReadEngineCommit(): string | undefined {
  try {
    const output = execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return output === "" ? undefined : output;
  } catch {
    return undefined;
  }
}

function tryReadEngineVersion(): string | undefined {
  try {
    const packagePath = resolve(process.cwd(), "package.json");
    const raw = readFileSync(packagePath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.scenario !== "numberGuess") {
    // eslint-disable-next-line no-console
    console.error(`Unknown scenario: ${args.scenario}. Available: numberGuess`);
    process.exit(1);
  }

  const scenario = createNumberGuessScenario();
  // TODO(llm-policy-alignment): Demo uses two scripted agents (random + baseline).
  // Under the new policy this demo should optionally accept --agent-type=llm
  // and wire up an Ollama/OpenRouter agent. For now, these are scripted baselines.
  const agents = [createRandomAgent("random-1"), createBaselineAgent("baseline-1")];

  let provenance: { engineCommit?: string; engineVersion?: string } | undefined;

  if (args.emitProvenance) {
    const engineCommit = args.engineCommit ?? tryReadEngineCommit();
    const engineVersion = args.engineVersion ?? tryReadEngineVersion();
    if (engineCommit !== undefined || engineVersion !== undefined) {
      provenance = { engineCommit, engineVersion };
    }
  }

  const result = await runMatch(scenario, agents, {
    seed: args.seed,
    maxTurns: args.turns,
    ...(provenance ? { provenance } : {}),
  });

  const lines = toStableJsonl(result.events);
  const outPath = args.out ?? DEFAULT_OUT_PATH;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines, "utf-8");
  // eslint-disable-next-line no-console
  console.log(
    `Match ${result.matchId}: scenario=${scenario.name} turns=${result.turns} events=${result.events.length}`,
  );
  // eslint-disable-next-line no-console
  console.log(`Wrote ${result.events.length} events to ${outPath}`);
}

void main();
