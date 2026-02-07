import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMatch } from "../engine/runMatch.js";
import { runMatchWithGateway } from "../engine/runMatchWithGateway.js";
import { toStableJsonl } from "../core/json.js";
import { createHttpAdapter } from "../gateway/httpAdapter.js";
import { createTranscriptWriter } from "../gateway/transcript.js";
import type { GatewayRuntimeConfig } from "../gateway/runtime.js";
import { getScenarioFactory, getAgentFactory } from "../tournament/runTournament.js";

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
  gateway?: "local" | "http";
  agentUrls: string[];

  // Opt-in provenance
  emitProvenance: boolean;
  engineCommit?: string;
  engineVersion?: string;
}

export const usage = `Usage: npm run match -- [options]

Options:
  --scenario <name>        Scenario to run (default: numberGuess)
  --seed <number>          RNG seed (default: 42)
  --turns <number>         Max turns (default: 20)
  --agentA <name>          Agent A id (default: random)
  --agentB <name>          Agent B id (default: baseline)
  --out <path>             Write JSONL events to a file
  --gateway <local|http>   Use gateway adapters
  --agent-urls <urls>      Comma-separated agent URLs (required for http)
  --emit-provenance        Include engine version/commit if available
  --engine-commit <sha>    Override engine commit hash
  --engine-version <ver>   Override engine version
  -h, --help               Show this help message`;

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.log(usage);
}

export function parseArgs(argv: string[]): MatchCliArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  let scenario = "numberGuess";
  let seed = 42;
  let turns = 20;
  let out: string | undefined;
  let agentA = "random";
  let agentB = "baseline";
  let gateway: "local" | "http" | undefined;
  let agentUrls: string[] = [];

  let emitProvenance = false;
  let engineCommit: string | undefined;
  let engineVersion: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--scenario" && i + 1 < argv.length) {
      scenario = argv[++i];
    } else if (arg === "--seed" && i + 1 < argv.length) {
      seed = parseInt(argv[++i], 10);
    } else if ((arg === "--turns" || arg === "--maxTurns") && i + 1 < argv.length) {
      turns = parseInt(argv[++i], 10);
    } else if (arg === "--out" && i + 1 < argv.length) {
      out = argv[++i];
    } else if (arg === "--agentA" && i + 1 < argv.length) {
      agentA = argv[++i];
    } else if (arg === "--agentB" && i + 1 < argv.length) {
      agentB = argv[++i];
    } else if (arg === "--gateway" && i + 1 < argv.length) {
      const value = argv[++i];
      if (value === "local" || value === "http") {
        gateway = value;
      }
    } else if (arg === "--agent-urls" && i + 1 < argv.length) {
      agentUrls = argv[++i]
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else if (arg === "--emit-provenance") {
      emitProvenance = true;
    } else if (arg === "--engine-commit" && i + 1 < argv.length) {
      engineCommit = argv[++i];
    } else if (arg === "--engine-version" && i + 1 < argv.length) {
      engineVersion = argv[++i];
    }
  }

  return {
    scenario,
    seed,
    turns,
    out,
    agentA,
    agentB,
    gateway,
    agentUrls,
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
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

  // Opt-in provenance: only include if explicitly requested AND at least one field resolves.
  let provenance:
    | { engineCommit?: string; engineVersion?: string }
    | undefined;

  if (args.emitProvenance) {
    const engineCommit = args.engineCommit ?? tryReadEngineCommit();
    const engineVersion = args.engineVersion ?? tryReadEngineVersion();
    if (engineCommit !== undefined || engineVersion !== undefined) {
      provenance = { engineCommit, engineVersion };
    }
  }

  if (args.gateway === "http" && args.agentUrls.length === 0) {
    // eslint-disable-next-line no-console
    console.error("Error: --agent-urls is required when --gateway http is set.");
    process.exit(1);
  }

  if (args.gateway === "http" && args.agentUrls.length !== agents.length) {
    // eslint-disable-next-line no-console
    console.error("Error: --agent-urls must have the same count as agents.");
    process.exit(1);
  }

  let result;
  if (args.gateway) {
    const outDir = args.out ? dirname(args.out) : process.cwd();
    const gatewayDefaults = {
      defaultDeadlineMs: 5000,
      maxResponseBytes: 1024 * 1024,
    };
    const gatewayConfig: GatewayRuntimeConfig = {
      mode: args.gateway,
      config: gatewayDefaults,
      transcriptWriter: createTranscriptWriter(outDir),
      gameId: scenario.name,
      gameVersion: "unknown",
      ...(args.gateway === "http"
        ? {
            adapters: new Map(
              agents.map((agent, index) => [
                agent.id,
                createHttpAdapter(args.agentUrls[index], gatewayDefaults),
              ]),
            ),
          }
        : {}),
    };

    result = await runMatchWithGateway(
      scenario,
      agents,
      {
        seed: args.seed,
        maxTurns: args.turns,
        ...(provenance ? { provenance } : {}),
      },
      gatewayConfig,
    );
  } else {
    result = runMatch(scenario, agents, {
      seed: args.seed,
      maxTurns: args.turns,
      ...(provenance ? { provenance } : {}),
    });
  }

  const lines = toStableJsonl(result.events);

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, lines, "utf-8");
    // eslint-disable-next-line no-console
    console.error(`Wrote ${result.events.length} events to ${args.out}`);
  } else {
    process.stdout.write(lines);
  }
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isMain) {
  void main();
}
