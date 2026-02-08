import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { isSafeMatchId } from "@/engine/matchId";
import { findExhibitionMatchDirectory } from "@/server/exhibitionStorage";
import { getMatchStorageRoot } from "@/server/matchStorage";
import type {
  AgentProfile,
  AgentProfileType,
  MatchArtifactsIndex,
  MatchDetailResponse,
  MatchStatusRecord,
  MatchSummaryRecord,
  VerificationResult,
} from "@/lib/matches/types";
import type { ReplayMoment } from "@/lib/replay";
import type { StandingsRow } from "@/tournament/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function resolveScenarioName(manifest: Record<string, unknown> | null): string | undefined {
  if (!manifest) {
    return undefined;
  }
  const scenario = manifest.scenario;
  if (scenario && typeof scenario === "object") {
    const scenarioId = (scenario as { id?: unknown }).id;
    if (typeof scenarioId === "string") {
      return scenarioId;
    }
  }
  return undefined;
}

function resolveAgentProfileKey(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) {
    return `agent${alphabet[index]}`;
  }
  return `agent${index + 1}`;
}

function resolveAgentTypeFromMetadata(
  metadata: Record<string, unknown> | null,
): AgentProfileType | undefined {
  if (!metadata) {
    return undefined;
  }
  const rawType = metadata.agentType;
  if (typeof rawType === "string") {
    const normalized = rawType.trim().toLowerCase();
    if (normalized === "scripted" || normalized === "llm" || normalized === "http") {
      return normalized;
    }
  }
  const llmProvider = metadata.llmProvider;
  if (typeof llmProvider === "string" && llmProvider.trim().length > 0) {
    return "llm";
  }
  const gateway = metadata.gateway;
  if (typeof gateway === "string" && gateway.trim().toLowerCase() === "http") {
    return "http";
  }
  return undefined;
}

function buildAgentTypeLookup(
  manifest: Record<string, unknown> | null,
): Map<string, AgentProfileType> {
  const lookup = new Map<string, AgentProfileType>();
  if (!manifest) {
    return lookup;
  }
  const agents = manifest.agents;
  if (!Array.isArray(agents)) {
    return lookup;
  }
  for (const entry of agents) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const agentId = (entry as { id?: unknown }).id;
    if (typeof agentId !== "string") {
      continue;
    }
    const metadataRaw = (entry as { metadata?: unknown }).metadata;
    const metadata =
      metadataRaw && typeof metadataRaw === "object"
        ? (metadataRaw as Record<string, unknown>)
        : null;
    const agentType = resolveAgentTypeFromMetadata(metadata);
    if (agentType) {
      lookup.set(agentId, agentType);
    }
  }
  return lookup;
}

async function findStandings(matchDir: string): Promise<StandingsRow[] | null> {
  let currentDir = matchDir;
  while (true) {
    const standingsPath = join(currentDir, "standings.json");
    const standings = await readJsonFile<StandingsRow[]>(standingsPath);
    if (standings) {
      return standings;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return null;
}

function buildAgentProfiles(
  agentIds: string[],
  standings: StandingsRow[] | null,
  agentTypes: Map<string, AgentProfileType>,
): Record<string, AgentProfile> {
  const standingsById = new Map<string, StandingsRow>();
  if (standings) {
    for (const row of standings) {
      standingsById.set(row.agentId, row);
    }
  }

  return agentIds.reduce<Record<string, AgentProfile>>((acc, agentId, index) => {
    const key = resolveAgentProfileKey(index);
    const row = standingsById.get(agentId);
    const profile: AgentProfile = {
      agentId,
      ...(row
        ? {
            record: { wins: row.wins, losses: row.losses, draws: row.draws },
            points: row.points,
          }
        : {}),
    };
    const type = agentTypes.get(agentId);
    if (type) {
      profile.type = type;
    }
    acc[key] = profile;
    return acc;
  }, {});
}

function buildArtifactsIndex(matchDir: string): MatchArtifactsIndex {
  const entries: MatchArtifactsIndex = {
    summary: "match_summary.json",
  };

  const optionalFiles: Array<[keyof MatchArtifactsIndex, string]> = [
    ["manifest", "match_manifest.json"],
    ["log", "match.jsonl"],
    ["moments", "moments.json"],
    ["highlights", "highlights.json"],
    ["broadcastManifest", "broadcast_manifest.json"],
    ["verification", "verification_result.json"],
    ["status", "match_status.json"],
  ];

  for (const [key, filename] of optionalFiles) {
    if (existsSync(join(matchDir, filename))) {
      entries[key] = filename;
    }
  }

  return entries;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ matchId: string }> },
): Promise<Response> {
  const { matchId } = await params;
  if (!isSafeMatchId(matchId)) {
    return NextResponse.json({ error: "Match summary not found" }, { status: 404 });
  }

  let matchDir = join(getMatchStorageRoot(), matchId);
  let summary = await readJsonFile<MatchSummaryRecord>(join(matchDir, "match_summary.json"));
  if (!summary) {
    const exhibitionDir = await findExhibitionMatchDirectory(matchId);
    if (exhibitionDir) {
      matchDir = exhibitionDir;
      summary = await readJsonFile<MatchSummaryRecord>(join(matchDir, "match_summary.json"));
    }
  }
  if (!summary) {
    return NextResponse.json({ error: "Match summary not found" }, { status: 404 });
  }

  const status = await readJsonFile<MatchStatusRecord>(join(matchDir, "match_status.json"));
  const manifest = await readJsonFile<Record<string, unknown>>(
    join(matchDir, "match_manifest.json"),
  );
  const verification = await readJsonFile<VerificationResult>(
    join(matchDir, "verification_result.json"),
  );
  const moments = (await readJsonFile<ReplayMoment[]>(join(matchDir, "moments.json"))) ?? [];
  const standings = await findStandings(matchDir);
  const agentTypes = buildAgentTypeLookup(manifest);
  const agentProfiles = buildAgentProfiles(summary.agentIds, standings, agentTypes);

  const response: MatchDetailResponse = {
    matchId: summary.matchId ?? matchId,
    scenarioName: resolveScenarioName(manifest),
    status,
    summary,
    artifacts: buildArtifactsIndex(matchDir),
    verification,
    agentProfiles,
    moments,
    standings,
  };

  return NextResponse.json(response);
}
