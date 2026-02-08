import type { AgentId } from "../contract/types.js";
import type { MatchSummary, StandingsRow } from "./types.js";

const POINTS_WIN = 3;
const POINTS_DRAW = 1;
const POINTS_LOSS = 0;

export function computeStandings(agentIds: AgentId[], matches: MatchSummary[]): StandingsRow[] {
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

  for (const match of matches) {
    const [idA, idB] = match.agentIds;
    const rowA = map.get(idA);
    const rowB = map.get(idB);
    if (!rowA || !rowB) {
      continue;
    }
    const scoreA = match.scores[idA] ?? 0;
    const scoreB = match.scores[idB] ?? 0;

    rowA.matches += 1;
    rowB.matches += 1;
    rowA.scoreFor += scoreA;
    rowA.scoreAgainst += scoreB;
    rowB.scoreFor += scoreB;
    rowB.scoreAgainst += scoreA;

    if (match.winner === idA) {
      rowA.wins += 1;
      rowA.points += POINTS_WIN;
      rowB.losses += 1;
      rowB.points += POINTS_LOSS;
    } else if (match.winner === idB) {
      rowB.wins += 1;
      rowB.points += POINTS_WIN;
      rowA.losses += 1;
      rowA.points += POINTS_LOSS;
    } else {
      rowA.draws += 1;
      rowA.points += POINTS_DRAW;
      rowB.draws += 1;
      rowB.points += POINTS_DRAW;
    }
  }

  for (const row of map.values()) {
    row.scoreDiff = row.scoreFor - row.scoreAgainst;
  }

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
