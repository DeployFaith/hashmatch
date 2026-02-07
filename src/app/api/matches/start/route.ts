import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentFactory, getScenarioFactory } from "@/tournament/runTournament";
import { startMatchRun } from "@/server/matchRunner";

const requestSchema = z
  .object({
    scenarioKey: z.string().min(1),
    agentKeys: z.array(z.string().min(1)).min(2),
    seed: z.number().int().nonnegative().optional(),
    turns: z.number().int().positive().optional(),
    modeKey: z.string().min(1).optional(),
  })
  .strict();

function validateScenarioKey(scenarioKey: string): string | null {
  try {
    getScenarioFactory(scenarioKey);
    return null;
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "Invalid scenario key";
  }
}

function validateAgentKeys(agentKeys: string[]): string | null {
  for (const key of agentKeys) {
    try {
      getAgentFactory(key);
    } catch (error: unknown) {
      return error instanceof Error ? error.message : "Invalid agent key";
    }
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const scenarioError = validateScenarioKey(parsed.data.scenarioKey);
  if (scenarioError) {
    return NextResponse.json({ error: scenarioError }, { status: 400 });
  }

  const agentError = validateAgentKeys(parsed.data.agentKeys);
  if (agentError) {
    return NextResponse.json({ error: agentError }, { status: 400 });
  }

  try {
    const { matchId, matchPath, runPromise } = await startMatchRun(parsed.data);
    void runPromise;
    return NextResponse.json({ matchId, status: "started", matchPath });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to start match";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
