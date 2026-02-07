import type { Agent, Scenario } from "../contract/interfaces.js";
import type { AgentId, MatchEvent, Seed } from "../contract/types.js";
import { runMatch } from "../engine/runMatch.js";
import { createNumberGuessScenario } from "../scenarios/numberGuess/index.js";
import { createResourceRivalsScenario } from "../scenarios/resourceRivals/index.js";
import { createRandomAgent } from "../agents/randomAgent.js";
import { createBaselineAgent } from "../agents/baselineAgent.js";
import { createRandomBidderAgent } from "../agents/resourceRivals/randomBidder.js";
import { createConservativeAgent } from "../agents/resourceRivals/conservativeAgent.js";
import type {
  MatchKey,
  MatchSpec,
  MatchSummary,
  StandingsRow,
  TournamentConfig,
  TournamentResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Registries (v0.1 — built-in only)
// ---------------------------------------------------------------------------

type ScenarioFactory = () => Scenario<any, any, any>;
type AgentFactory = (id: AgentId) => Agent<any, any>;

const scenarioRegistry: Record<string, ScenarioFactory> = {
  numberGuess: createNumberGuessScenario,
  resourceRivals: createResourceRivalsScenario,
};

const agentRegistry: Record<string, AgentFactory> = {
  random: createRandomAgent,
  baseline: createBaselineAgent,
  randomBidder: createRandomBidderAgent,
  conservative: createConservativeAgent,
};

/** Resolve a scenario factory by key. Throws if unknown. */
export function getScenarioFactory(key: string): ScenarioFactory {
  const factory = scenarioRegistry[key];
  if (!factory) {
    const available = Object.keys(scenarioRegistry).join(", ");
    throw new Error(`Unknown scenario "${key}". Available: ${available}`);
  }
  return factory;
}

/** Resolve an agent factory by key. Throws if unknown. */
export function getAgentFactory(key: string): AgentFactory {
  const factory = agentRegistry[key];
  if (!factory) {
    const available = Object.keys(agentRegistry).join(", ");
    throw new Error(`Unknown agent "${key}". Available: ${available}`);
  }
  return factory;
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

const POINTS_WIN = 3;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

// ---------------------------------------------------------------------------
// Deterministic seeding
// ---------------------------------------------------------------------------

/** 32-bit FNV-1a hash. */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Derive a deterministic match seed from tournament seed + match key. */
export function deriveMatchSeed(tournamentSeed: Seed, matchKey: MatchKey): Seed {
  const combined = `${tournamentSeed}:${matchKey}`;
  return fnv1a32(combined);
}

// ---------------------------------------------------------------------------
// Tournament runner
// ---------------------------------------------------------------------------

/**
 * Run a complete round-robin tournament.
 *
 * Deterministic: given the same config, produces identical results.
 */
export function runTournament(config: TournamentConfig): TournamentResult {
  const {
    seed,
    maxTurns,
    rounds,
    scenarioKey,
    agentKeys,
    includeEventLogs,
    modeProfile,
    harnessVersion,
  } = config;

  // Validate
  const scenarioFactory = getScenarioFactory(scenarioKey);
  const agentFactories = agentKeys.map((key) => ({
    key,
    factory: getAgentFactory(key),
  }));

  const matches: MatchSummary[] = [];
  const matchSpecs: MatchSpec[] = [];
  const matchLogs: Record<MatchKey, MatchEvent[]> = {};
  const agentIds = agentFactories.map((a, i) => `${a.key}-${i}`);
  const scenarioName = scenarioFactory().name;

  // Round-robin: for every unordered pair (i, j) with i < j, play `rounds` matches
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < agentFactories.length; i++) {
      for (let j = i + 1; j < agentFactories.length; j++) {
        // Stable competitor IDs (index-based, independent of seat order)
        const agentAId = `${agentFactories[i].key}-${i}`;
        const agentBId = `${agentFactories[j].key}-${j}`;
        const matchKey = `RR:${agentAId}-vs-${agentBId}:round${round + 1}`;
        const matchSeed = deriveMatchSeed(seed, matchKey);
        const scenario = scenarioFactory();

        // Fresh agent instances per match (agents can be stateful)
        const agentA = agentFactories[i].factory(agentAId);
        const agentB = agentFactories[j].factory(agentBId);

        // Deterministic seat-order swap to avoid first-move bias:
        // incorporates round and pair indices so order alternates across rounds
        const swap = (round + i + j) % 2 === 1;
        const orderedAgents = swap ? [agentB, agentA] : [agentA, agentB];

        const result = runMatch(scenario, orderedAgents, {
          seed: matchSeed,
          maxTurns,
        });

        if (includeEventLogs) {
          matchLogs[matchKey] = result.events;
        }

        // Determine winner (uses stable IDs, independent of seat order)
        const scoreA = result.scores[agentAId] ?? 0;
        const scoreB = result.scores[agentBId] ?? 0;
        let winner: AgentId | null = null;
        if (scoreA > scoreB) {
          winner = agentAId;
        } else if (scoreB > scoreA) {
          winner = agentBId;
        }

        const lastEvent = result.events[result.events.length - 1];
        const reason = lastEvent.type === "MatchEnded" ? lastEvent.reason : "unknown";

        matches.push({
          matchId: result.matchId,
          matchKey,
          seed: matchSeed,
          agentIds: [agentAId, agentBId],
          scores: result.scores,
          winner,
          turns: result.turns,
          reason,
        });

        matchSpecs.push({
          matchKey,
          seed: matchSeed,
          scenarioName,
          agentIds: [agentAId, agentBId],
          maxTurns,
        });
      }
    }
  }

  const standings = computeStandings(agentIds, matches);

  const tournamentResult: TournamentResult = {
    config,
    tournament: {
      tournamentSeed: seed,
      scenarioName,
      agents: agentIds,
      matches: matchSpecs,
      ...(modeProfile !== undefined && { modeProfile }),
      ...(harnessVersion !== undefined && { harnessVersion }),
    },
    matchSummaries: matches,
    standings,
  };
  if (includeEventLogs) {
    tournamentResult.matchLogs = matchLogs;
  }
  return tournamentResult;
}

// ---------------------------------------------------------------------------
// Standings computation
// ---------------------------------------------------------------------------

function computeStandings(agentIds: AgentId[], matches: MatchSummary[]): StandingsRow[] {
  const map = new Map<AgentId, StandingsRow>();

  for (const id of agentIds) {
    map.set(id, {
      agentId: id,
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      scoreDiff: 0,
    });
  }

  for (const m of matches) {
    const [idA, idB] = m.agentIds;
    const rowA = map.get(idA)!;
    const rowB = map.get(idB)!;
    const scoreA = m.scores[idA] ?? 0;
    const scoreB = m.scores[idB] ?? 0;

    rowA.matches++;
    rowB.matches++;
    rowA.scoreFor += scoreA;
    rowA.scoreAgainst += scoreB;
    rowB.scoreFor += scoreB;
    rowB.scoreAgainst += scoreA;

    if (m.winner === idA) {
      rowA.wins++;
      rowA.points += POINTS_WIN;
      rowB.losses++;
      rowB.points += POINTS_LOSS;
    } else if (m.winner === idB) {
      rowB.wins++;
      rowB.points += POINTS_WIN;
      rowA.losses++;
      rowA.points += POINTS_LOSS;
    } else {
      rowA.draws++;
      rowA.points += POINTS_DRAW;
      rowB.draws++;
      rowB.points += POINTS_DRAW;
    }
  }

  // Update scoreDiff
  for (const row of map.values()) {
    row.scoreDiff = row.scoreFor - row.scoreAgainst;
  }

  // Sort: points desc, then scoreDiff desc, then agentId asc
  return Array.from(map.values()).sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (b.scoreDiff !== a.scoreDiff) {
      return b.scoreDiff - a.scoreDiff;
    }
    return a.agentId.localeCompare(b.agentId);
  });
}
