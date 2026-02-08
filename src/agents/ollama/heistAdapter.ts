import type { HeistAction, HeistObservation } from "../../scenarios/heist/index.js";
import { z } from "zod";
import { DEFAULT_UNWRAP_PATHS, decodeAgentAction } from "../../core/decodeAgentAction.js";
import { attachActionForensics } from "../../core/agentActionMetadata.js";
import { HeistActionSchema } from "../../games/heist/types.js";
import type { ScenarioAdapter } from "./createOllamaAgent.js";

const systemPrompt = `You are playing the Heist scenario. Each turn you must choose one action.

VALID ACTIONS (respond with exactly one JSON object):
- Move to an adjacent room: {"type":"move","toRoomId":"room-id"}
- Pick up a visible item in the current room: {"type":"pickup","itemId":"item-id"}
- Hack/use a terminal in the current room: {"type":"use_terminal","terminalId":"terminal-id"}
- Extract in the extraction room: {"type":"extract"}
- Wait/do nothing: {"type":"wait"}

RULES:
- Only move to rooms listed as adjacent and passable.
- Only pick up items that are visible in the current room.
- Only use terminals that are visible in the current room.
- Only extract if you are in the extraction room.

Example:
Game state: Turn 1. You are in room-1. Adjacent rooms: room-2 (passable). Visible items: keycard-1.
Response: {"type":"pickup","itemId":"keycard-1"}

Example:
Game state: Turn 3. You are in room-2. Adjacent rooms: room-1 (passable), room-3 (locked, requires keycard-1).
Response: {"type":"move","toRoomId":"room-1"}

Respond with ONLY a JSON object. No explanation, no markdown, no backticks.`;

const fallbackAction: HeistAction = { type: "wait" };

const moveActionSchema = z
  .object({
    type: z.literal("move"),
    toRoomId: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    targetRoomId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.toRoomId || data.target || data.targetRoomId), {
    message: "Move action requires a target room.",
  });

const pickupActionSchema = z
  .object({
    type: z.literal("pickup"),
    itemId: z.string().min(1).optional(),
    item: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.itemId || data.item), {
    message: "Pickup action requires an item id.",
  });

const useTerminalActionSchema = z
  .object({
    type: z.literal("use_terminal"),
    terminalId: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    targetEntityId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.terminalId || data.target || data.targetEntityId), {
    message: "Use terminal action requires a terminal id.",
  });

const interactActionSchema = z
  .object({
    type: z.literal("interact"),
    target: z.string().min(1).optional(),
    targetEntityId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.target || data.targetEntityId), {
    message: "Interact action requires a target entity id.",
  });

const useActionSchema = z
  .object({
    type: z.literal("use"),
    item: z.string().min(1).optional(),
    itemId: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    targetEntityId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.item || data.itemId || data.target || data.targetEntityId), {
    message: "Use action requires at least an item or target.",
  });

const useItemActionSchema = z
  .object({
    type: z.literal("use_item"),
    item: z.string().min(1).optional(),
    itemId: z.string().min(1).optional(),
    target: z.string().min(1).optional(),
    targetEntityId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.item || data.itemId || data.target || data.targetEntityId), {
    message: "Use item action requires at least an item or target.",
  });

const looseHeistActionSchema = z.discriminatedUnion("type", [
  moveActionSchema,
  pickupActionSchema,
  useTerminalActionSchema,
  interactActionSchema,
  useActionSchema,
  useItemActionSchema,
  z.object({ type: z.literal("extract") }),
  z.object({ type: z.literal("wait") }),
]);

type LooseHeistAction = z.infer<typeof looseHeistActionSchema>;

function formatItems(items: HeistObservation["visibleItems"] | undefined): string {
  if (!items || items.length === 0) {
    return "none";
  }
  return items
    .map((item) => {
      if (item.type === "loot") {
        return `${item.id} (loot, value ${item.scoreValue})`;
      }
      if (item.type === "intel") {
        return `${item.id} (intel${item.label ? `: ${item.label}` : ""})`;
      }
      if (item.type === "tool") {
        return `${item.id} (tool: ${item.toolType}${item.uses ? `, uses ${item.uses}` : ""})`;
      }
      return `${item.id} (${item.type})`;
    })
    .join(", ");
}

function formatEntities(entities: HeistObservation["visibleEntities"] | undefined): string {
  if (!entities || entities.length === 0) {
    return "none";
  }
  return entities
    .map((entity) => {
      if (entity.type === "camera") {
        return `${entity.id} (camera${entity.disabled ? ", disabled" : ""})`;
      }
      if (entity.type === "terminal") {
        return `${entity.id} (terminal, hack turns ${entity.hackTurns})`;
      }
      if (entity.type === "vault") {
        return `${entity.id} (vault, requires ${entity.requiredItems.join(", ")})`;
      }
      return `${entity.id} (${entity.type})`;
    })
    .join(", ");
}

function formatAdjacentRooms(rooms: HeistObservation["adjacentRooms"] | undefined): string {
  if (!rooms || rooms.length === 0) {
    return "none";
  }
  return rooms
    .map((room) => {
      const lockInfo = room.locked ? "locked" : "unlocked";
      const passableInfo = room.passable ? "passable" : "blocked";
      const required = room.requiredItem ? `, requires ${room.requiredItem}` : "";
      return `${room.roomId} via ${room.doorId} (${passableInfo}, ${lockInfo}${required})`;
    })
    .join("; ");
}

function formatInventory(inventory: HeistObservation["inventory"] | undefined): string {
  if (!inventory || inventory.length === 0) {
    return "none";
  }
  return inventory.map((item) => `${item.itemId} (${item.type})`).join(", ");
}

export function formatObservation(observation: unknown): string {
  const obs = observation as Partial<HeistObservation>;
  const lines: string[] = [];

  const turn = typeof obs.turn === "number" ? obs.turn : 0;
  lines.push(`Turn ${turn}.`);

  lines.push(`Current room: ${obs.currentRoomId ?? "unknown"}.`);
  lines.push(`Adjacent rooms: ${formatAdjacentRooms(obs.adjacentRooms)}.`);
  lines.push(`Visible items: ${formatItems(obs.visibleItems)}.`);
  lines.push(`Visible entities: ${formatEntities(obs.visibleEntities)}.`);
  lines.push(`Inventory: ${formatInventory(obs.inventory)}.`);

  const privateInfo = obs._private;
  if (privateInfo && typeof privateInfo === "object") {
    const alertLevel =
      typeof privateInfo.alertLevel === "number" ? privateInfo.alertLevel : undefined;
    if (alertLevel !== undefined) {
      lines.push(`Alert level: ${alertLevel}.`);
    }
    if (typeof privateInfo.extractionRoomId === "string") {
      lines.push(`Extraction room: ${privateInfo.extractionRoomId}.`);
    }
    if (privateInfo.terminalProgress && typeof privateInfo.terminalProgress === "object") {
      const terminalEntries = Object.entries(privateInfo.terminalProgress)
        .map(([terminalId, progress]) => `${terminalId}: ${progress}`)
        .join(", ");
      if (terminalEntries) {
        lines.push(`Terminal progress: ${terminalEntries}.`);
      }
    }
    if (privateInfo.terminalHacked && typeof privateInfo.terminalHacked === "object") {
      const hackedEntries = Object.entries(privateInfo.terminalHacked)
        .map(([terminalId, hacked]) => `${terminalId}: ${hacked ? "hacked" : "locked"}`)
        .join(", ");
      if (hackedEntries) {
        lines.push(`Terminal status: ${hackedEntries}.`);
      }
    }
  }

  return lines.join("\n");
}

function resolveFallbackAction(observation?: unknown): HeistAction {
  const obs = observation as Partial<HeistObservation> | undefined;
  const fallback = obs?._private?.invalidActionFallback;
  if (fallback && typeof fallback === "object" && "type" in fallback) {
    return fallback as HeistAction;
  }
  return fallbackAction;
}

function resolveString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeHeistAction(action: LooseHeistAction): HeistAction | null {
  switch (action.type) {
    case "move": {
      const toRoomId =
        resolveString(action.toRoomId) ??
        resolveString(action.target) ??
        resolveString(action.targetRoomId);
      return toRoomId ? { type: "move", toRoomId } : null;
    }
    case "pickup": {
      const itemId = resolveString(action.itemId) ?? resolveString(action.item);
      return itemId ? { type: "pickup", itemId } : null;
    }
    case "use_terminal": {
      const terminalId =
        resolveString(action.terminalId) ??
        resolveString(action.target) ??
        resolveString(action.targetEntityId);
      return terminalId ? { type: "use_terminal", terminalId } : null;
    }
    case "interact": {
      const terminalId =
        resolveString(action.target) ?? resolveString(action.targetEntityId);
      return terminalId ? { type: "use_terminal", terminalId } : null;
    }
    case "use":
    case "use_item": {
      const terminalId =
        resolveString(action.target) ?? resolveString(action.targetEntityId);
      return terminalId ? { type: "use_terminal", terminalId } : null;
    }
    case "extract":
      return { type: "extract" };
    case "wait":
      return { type: "wait" };
    default:
      return null;
  }
}

export function parseResponse(text: string, observation?: unknown): HeistAction | null {
  const rawText = typeof text === "string" ? text : "";
  const fallback = resolveFallbackAction(observation);
  const result = decodeAgentAction(rawText, looseHeistActionSchema, fallback, {
    unwrapPaths: [...DEFAULT_UNWRAP_PATHS, ["response"]],
  });
  const warnings = [...result.warnings];
  let fallbackReason = result.fallbackReason;
  let normalizedAction: HeistAction | null = null;

  if (result.action) {
    normalizedAction = normalizeHeistAction(result.action);
    if (!normalizedAction) {
      warnings.push("Action normalization failed.");
      fallbackReason ??= "normalization-failed";
    }
  }

  const validatedAction = normalizedAction
    ? HeistActionSchema.safeParse(normalizedAction)
    : null;
  if (validatedAction && !validatedAction.success) {
    warnings.push("Normalized action failed Heist schema validation.");
    fallbackReason ??= "schema-validation-failed";
    normalizedAction = null;
  }

  const chosenAction =
    (normalizedAction ?? result.fallbackAction ?? fallback) as HeistAction;
  const rawBytes = Buffer.byteLength(rawText, "utf-8");
  const actionWithForensics = { ...chosenAction };

  return attachActionForensics(actionWithForensics, {
    rawText,
    rawSha256: result.rawSha256,
    rawBytes,
    truncated: false,
    method: result.method,
    warnings,
    errors: result.errors,
    fallbackReason,
    candidateAction: result.candidate,
    chosenAction,
  });
}

export const heistAdapter: ScenarioAdapter = {
  systemPrompt,
  formatObservation,
  parseResponse,
  fallbackAction,
};
