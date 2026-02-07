import { rmSync } from "node:fs";
import { join } from "node:path";
import { runTournament } from "../../src/tournament/runTournament.js";
import { writeTournamentArtifacts } from "../../src/tournament/artifacts.js";
import type { TournamentConfig } from "../../src/tournament/types.js";

const outDir = join(
  process.cwd(),
  "tests",
  "redaction-audit",
  "fixtures",
  "resource-rivals-tournament",
);

rmSync(outDir, { recursive: true, force: true });

const config: TournamentConfig = {
  seed: 42,
  maxTurns: 30,
  rounds: 2,
  scenarioKey: "resourceRivals",
  agentKeys: ["randomBidder", "conservative", "randomBidder", "conservative"],
  includeEventLogs: true,
};

const result = runTournament(config);
await writeTournamentArtifacts(result, outDir);

// eslint-disable-next-line no-console -- fixture generator emits useful status
console.log(`Wrote Resource Rivals fixture to ${outDir}`);
