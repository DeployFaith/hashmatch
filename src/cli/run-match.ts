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
import { writeMatchArtifacts } from "../server/matchArtifacts.js";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface MatchCliArgs {
  scenario: string;
  seed: number;
  turns: number;
  out?: string;
  outDir?: string;
  matchId?: string;
  agents?: string[];
  agentA: string;
  agentB: string;
  agentAProvided: boolean;
  agentBProvided: boolean;
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
  --outDir <path>          Write match artifacts to a directory
  --matchId <id>           Override match id (default: derived from seed)
  --agents <list>          Comma-separated agent keys (overrides agentA/B)
  --agentA <name>          Agent A id (default: scenario-specific)
  --agentB <name>          Agent B id (default: scenario-specific)
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
  let outDir: string | undefined;
  let matchId: string | undefined;
  let agents: string[] | undefined;
  let agentA = "random";
  let agentB = "baseline";
  let agentAProvided = false;
  let agentBProvided = false;
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
    } else if ((arg === "--outDir" || arg === "--out-dir") && i + 1 < argv.length) {
      outDir = argv[++i];
    } else if (arg === "--matchId" && i + 1 < argv.length) {
      matchId = argv[++i];
    } else if (arg === "--agents" && i + 1 < argv.length) {
      agents = argv[++i]
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    } else if (arg === "--agentA" && i + 1 < argv.length) {
      agentA = argv[++i];
      agentAProvided = true;
    } else if (arg === "--agentB" && i + 1 < argv.length) {
      agentB = argv[++i];
      agentBProvided = true;
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
    agentAProvided,
    agentBProvided,
    outDir,
    matchId,
    agents,
    gateway,
    agentUrls,
    emitProvenance,
    engineCommit,
    engineVersion,
  };
}

const SCENARIO_AGENT_DEFAULTS: Record<string, { agentA: string; agentB: string }> = {
  numberGuess: { agentA: "random", agentB: "baseline" },
  resourceRivals: { agentA: "randomBidder", agentB: "conservative" },
  heist: { agentA: "noop", agentB: "noop" },
};

export function resolveAgentDefaults(args: MatchCliArgs): {
  agentA: string;
  agentB: string;
  warning?: string;
} {
  const defaults = SCENARIO_AGENT_DEFAULTS[args.scenario];
  let agentA = args.agentA;
  let agentB = args.agentB;
  let warning: string | undefined;

  if (!args.agentAProvided || !args.agentBProvided) {
    if (defaults) {
      if (!args.agentAProvided) {
        agentA = defaults.agentA;
      }
      if (!args.agentBProvided) {
        agentB = defaults.agentB;
      }
    } else if (!args.agentAProvided && !args.agentBProvided) {
      agentA = "noop";
      agentB = "noop";
      warning = `Warning: No default agents for scenario \"${args.scenario}\". Using noop agents.\nSpecify --agentA and --agentB for meaningful results.`;
    } else {
      if (!args.agentAProvided) {
        agentA = "noop";
      }
      if (!args.agentBProvided) {
        agentB = "noop";
      }
    }
  }

  return { agentA, agentB, warning };
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
  const resolvedAgents = resolveAgentDefaults(args);
  const agentKeys = args.agents?.length
    ? args.agents
    : [resolvedAgents.agentA, resolvedAgents.agentB];

  if (args.agents?.length === 0) {
    // eslint-disable-next-line no-console
    console.error("Error: --agents must include at least one agent key.");
    process.exit(1);
  }

  if (resolvedAgents.warning && !args.agents?.length) {
    // eslint-disable-next-line no-console
    console.warn(resolvedAgents.warning);
  }

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
  const agentFactories = new Map<string, ReturnType<typeof getAgentFactory>>();
  for (const key of agentKeys) {
    try {
      agentFactories.set(key, getAgentFactory(key));
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  const scenario = scenarioFactory();
  const agents = agentKeys.map((key, index) => {
    const factory = agentFactories.get(key);
    if (!factory) {
      throw new Error(`Missing agent factory for "${key}"`);
    }
    return factory(`${key}-${index}`);
  });

  // Opt-in provenance: only include if explicitly requested AND at least one field resolves.
  let provenance: { engineCommit?: string; engineVersion?: string } | undefined;

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
  const matchConfig = {
    seed: args.seed,
    maxTurns: args.turns,
    ...(provenance ? { provenance } : {}),
    ...(args.matchId ? { matchId: args.matchId } : {}),
  };
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

    result = await runMatchWithGateway(scenario, agents, matchConfig, gatewayConfig);
  } else {
    result = await runMatch(scenario, agents, matchConfig);
  }

  const lines = toStableJsonl(result.events);
  const lastEvent = result.events[result.events.length - 1];
  const reason = lastEvent?.type === "MatchEnded" ? lastEvent.reason : "unknown";

  if (args.outDir) {
    await writeMatchArtifacts({
      matchId: result.matchId,
      scenarioName: scenario.name,
      scenarioKey: args.scenario,
      agentKeys,
      seed: args.seed,
      maxTurns: args.turns,
      maxTurnTimeMs: result.maxTurnTimeMs,
      events: result.events,
      scores: result.scores,
      timeoutsPerAgent: result.timeoutsPerAgent,
      ...(result.forfeitedBy ? { forfeitedBy: result.forfeitedBy } : {}),
      turns: result.turns,
      reason,
      matchDir: args.outDir,
    });
  }

  if (args.out) {
    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, lines, "utf-8");
    // eslint-disable-next-line no-console
    console.error(`Wrote ${result.events.length} events to ${args.out}`);
  } else if (!args.outDir) {
    process.stdout.write(lines);
  }
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isMain) {
  void main();
}
