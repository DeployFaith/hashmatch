<!-- TODO(terminology-alignment): "fixture" here means "static test data file"
     (a golden JSONL snapshot), not a scripted agent. This usage is standard
     testing terminology and is fine to keep. The noop agents used in generation
     are scripted baselines — see noopAgent.ts for their policy-alignment note.
     No rename needed for this file. -->

# Heist fixture

This fixture was generated from a real Heist match using the built engine and a
preset scenario file that includes guards.

## Regenerate

```bash
npm run build:engine
node --input-type=module - <<'NODE'
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHeistScenario } from "./dist/scenarios/heist/index.js";
import { runMatch } from "./dist/engine/runMatch.js";
import { createNoopAgent } from "./dist/agents/noopAgent.js";
import { toStableJsonl } from "./dist/core/json.js";

const scenarioFile = JSON.parse(
  readFileSync("scenarios/heist/museum_night_seed15.scenario.json", "utf-8"),
);
const scenario = createHeistScenario(scenarioFile.params);
const agents = [createNoopAgent("noop-0"), createNoopAgent("noop-1")];
const result = await runMatch(scenario, agents, { seed: 15, maxTurns: 6 });
const outPath = "tests/fixtures/heist/heist.museum_night_seed15.match.jsonl";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, toStableJsonl(result.events), "utf-8");
console.log(`Wrote ${result.events.length} events to ${outPath}`);
NODE
```
