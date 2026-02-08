import { z } from "zod";

export type HeistRoomType =
  | "spawn"
  | "vault"
  | "extraction"
  | "security"
  | "utility"
  | "hallway"
  | "decoy";

export interface HeistDoor {
  id: string;
  roomA: string;
  roomB: string;
  locked?: boolean;
  requiredItem?: string;
  alarmed?: boolean;
  noiseOnForce?: number;
}

export interface HeistRoom {
  id: string;
  type: HeistRoomType;
  properties?: Record<string, unknown>;
}

export interface HeistMap {
  rooms: HeistRoom[];
  doors: HeistDoor[];
}

export interface HeistGuardEntity {
  id: string;
  type: "guard";
  patrolRoute: string[];
  detectionRange: number;
  alertResponse?: string;
}

export interface HeistCameraEntity {
  id: string;
  type: "camera";
  roomId: string;
  range: number;
  disabled?: boolean;
}

export interface HeistTerminalEntity {
  id: string;
  type: "terminal";
  roomId: string;
  hackTurns: number;
  alarmOnFail?: boolean;
  successGrants?: string[];
}

export interface HeistVaultEntity {
  id: string;
  type: "vault";
  roomId: string;
  requiredItems: string[];
}

export type HeistEntity =
  | HeistGuardEntity
  | HeistCameraEntity
  | HeistTerminalEntity
  | HeistVaultEntity;

export interface HeistKeycardItem {
  id: string;
  type: "keycard";
  roomId: string;
  level?: number;
}

export interface HeistToolItem {
  id: string;
  type: "tool";
  roomId: string;
  toolType: string;
  uses?: number;
}

export interface HeistLootItem {
  id: string;
  type: "loot";
  roomId: string;
  scoreValue: number;
}

export interface HeistIntelItem {
  id: string;
  type: "intel";
  label?: string;
}

export type HeistItem = HeistKeycardItem | HeistToolItem | HeistLootItem | HeistIntelItem;

export type HeistAction =
  | { type: "move"; toRoomId: string }
  | { type: "pickup"; itemId: string }
  | { type: "use_terminal"; terminalId: string }
  | { type: "extract" }
  | { type: "wait" };

export interface HeistRules {
  noiseTable: Record<string, number>;
  alertThresholds: number[];
  noiseDecayRate: number;
  guardDetectionRange?: number;
  maxAlertLevel: number;
  captureOnMaxAlert: boolean;
  invalidActionFallback?: HeistAction;
}

export interface HeistScoring {
  objectiveSecured: number;
  extractionBonus: number;
  turnsRemainingMultiplier: number;
  lootMultiplier: number;
  alertPenaltyPerLevel: number;
  invalidActionPenalty: number;
}

export interface HeistWinCondition {
  requiredObjectives: string[];
  extractionRoomId: string;
  maxTurns: number;
  maxAlertLevel: number;
}

export interface HeistSkin {
  themeName?: string;
  roomDisplayNames?: Record<string, string>;
  entityDisplayNames?: Record<string, string>;
  flavorText?: string;
}

export interface HeistScenarioParams {
  map: HeistMap;
  entities: HeistEntity[];
  items: HeistItem[];
  rules: HeistRules;
  scoring: HeistScoring;
  winCondition: HeistWinCondition;
  skin?: HeistSkin;
}

const HeistRoomSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["spawn", "vault", "extraction", "security", "utility", "hallway", "decoy"]),
    properties: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const HeistDoorSchema = z
  .object({
    id: z.string().min(1),
    roomA: z.string().min(1),
    roomB: z.string().min(1),
    locked: z.boolean().optional(),
    requiredItem: z.string().min(1).optional(),
    alarmed: z.boolean().optional(),
    noiseOnForce: z.number().nonnegative().optional(),
  })
  .strict();

const HeistGuardEntitySchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("guard"),
    patrolRoute: z.array(z.string().min(1)).min(1),
    detectionRange: z.number().int().nonnegative(),
    alertResponse: z.string().optional(),
  })
  .strict();

const HeistCameraEntitySchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("camera"),
    roomId: z.string().min(1),
    range: z.number().int().nonnegative(),
    disabled: z.boolean().optional(),
  })
  .strict();

const HeistTerminalEntitySchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("terminal"),
    roomId: z.string().min(1),
    hackTurns: z.number().int().positive(),
    alarmOnFail: z.boolean().optional(),
    successGrants: z.array(z.string().min(1)).optional(),
  })
  .strict();

const HeistVaultEntitySchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("vault"),
    roomId: z.string().min(1),
    requiredItems: z.array(z.string().min(1)).min(1),
  })
  .strict();

const HeistEntitySchema = z.discriminatedUnion("type", [
  HeistGuardEntitySchema,
  HeistCameraEntitySchema,
  HeistTerminalEntitySchema,
  HeistVaultEntitySchema,
]);

const HeistKeycardItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("keycard"),
    roomId: z.string().min(1),
    level: z.number().int().nonnegative().optional(),
  })
  .strict();

const HeistToolItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("tool"),
    roomId: z.string().min(1),
    toolType: z.string().min(1),
    uses: z.number().int().positive().optional(),
  })
  .strict();

const HeistLootItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("loot"),
    roomId: z.string().min(1),
    scoreValue: z.number(),
  })
  .strict();

const HeistIntelItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.literal("intel"),
    label: z.string().optional(),
  })
  .strict();

const HeistItemSchema = z.discriminatedUnion("type", [
  HeistKeycardItemSchema,
  HeistToolItemSchema,
  HeistLootItemSchema,
  HeistIntelItemSchema,
]);

export const HeistActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), toRoomId: z.string().min(1) }),
  z.object({ type: z.literal("pickup"), itemId: z.string().min(1) }),
  z.object({ type: z.literal("use_terminal"), terminalId: z.string().min(1) }),
  z.object({ type: z.literal("extract") }),
  z.object({ type: z.literal("wait") }),
]);

const HeistRulesSchema = z
  .object({
    noiseTable: z.record(z.string(), z.number()),
    alertThresholds: z.array(z.number()),
    noiseDecayRate: z.number(),
    guardDetectionRange: z.number().int().nonnegative().optional(),
    maxAlertLevel: z.number().int().nonnegative(),
    captureOnMaxAlert: z.boolean(),
    invalidActionFallback: HeistActionSchema.optional(),
  })
  .strict();

const HeistScoringSchema = z
  .object({
    objectiveSecured: z.number(),
    extractionBonus: z.number(),
    turnsRemainingMultiplier: z.number(),
    lootMultiplier: z.number(),
    alertPenaltyPerLevel: z.number(),
    invalidActionPenalty: z.number(),
  })
  .strict();

const HeistWinConditionSchema = z
  .object({
    requiredObjectives: z.array(z.string().min(1)),
    extractionRoomId: z.string().min(1),
    maxTurns: z.number().int().positive(),
    maxAlertLevel: z.number().int().nonnegative(),
  })
  .strict();

const HeistSkinSchema = z
  .object({
    themeName: z.string().optional(),
    roomDisplayNames: z.record(z.string(), z.string()).optional(),
    entityDisplayNames: z.record(z.string(), z.string()).optional(),
    flavorText: z.string().optional(),
  })
  .strict();

const HeistMapSchema = z
  .object({
    rooms: z.array(HeistRoomSchema).min(1),
    doors: z.array(HeistDoorSchema).min(1),
  })
  .strict();

export const HeistScenarioParamsSchema = z
  .object({
    map: HeistMapSchema,
    entities: z.array(HeistEntitySchema),
    items: z.array(HeistItemSchema),
    rules: HeistRulesSchema,
    scoring: HeistScoringSchema,
    winCondition: HeistWinConditionSchema,
    skin: HeistSkinSchema.optional(),
  })
  .strict()
  .superRefine((params, ctx) => {
    const roomIds = new Set<string>();
    const doorIds = new Set<string>();
    const entityIds = new Set<string>();
    const itemIds = new Set<string>();
    const itemTypes = new Map<string, HeistItem["type"]>();

    const addDuplicateIssue = (scope: string, id: string) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate ${scope} id: ${id}`,
      });
    };

    for (const room of params.map.rooms) {
      if (roomIds.has(room.id)) {
        addDuplicateIssue("room", room.id);
      }
      roomIds.add(room.id);
    }

    for (const door of params.map.doors) {
      if (doorIds.has(door.id)) {
        addDuplicateIssue("door", door.id);
      }
      doorIds.add(door.id);
      if (!roomIds.has(door.roomA)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Door ${door.id} references unknown roomA: ${door.roomA}`,
        });
      }
      if (!roomIds.has(door.roomB)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Door ${door.id} references unknown roomB: ${door.roomB}`,
        });
      }
    }

    for (const item of params.items) {
      if (itemIds.has(item.id)) {
        addDuplicateIssue("item", item.id);
      }
      itemIds.add(item.id);
      itemTypes.set(item.id, item.type);

      if (item.type !== "intel" && !roomIds.has(item.roomId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Item ${item.id} references unknown roomId: ${item.roomId}`,
        });
      }
    }

    for (const entity of params.entities) {
      if (entityIds.has(entity.id)) {
        addDuplicateIssue("entity", entity.id);
      }
      entityIds.add(entity.id);

      if (entity.type === "guard") {
        for (const roomId of entity.patrolRoute) {
          if (!roomIds.has(roomId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Guard ${entity.id} patrolRoute references unknown roomId: ${roomId}`,
            });
          }
        }
        continue;
      }

      if (!roomIds.has(entity.roomId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Entity ${entity.id} references unknown roomId: ${entity.roomId}`,
        });
      }

      if (entity.type === "terminal") {
        for (const grant of entity.successGrants ?? []) {
          const itemType = itemTypes.get(grant);
          if (!itemType) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Terminal ${entity.id} grants unknown item: ${grant}`,
            });
          } else if (itemType !== "intel") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Terminal ${entity.id} grants non-intel item: ${grant}`,
            });
          }
        }
      }

      if (entity.type === "vault") {
        for (const requiredId of entity.requiredItems) {
          if (!itemIds.has(requiredId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Vault ${entity.id} requires unknown item: ${requiredId}`,
            });
          }
        }
      }
    }

    for (const door of params.map.doors) {
      if (door.requiredItem && !itemIds.has(door.requiredItem)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Door ${door.id} requires unknown item: ${door.requiredItem}`,
        });
      }
    }

    for (const objective of params.winCondition.requiredObjectives) {
      if (!itemIds.has(objective)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Win condition references unknown item: ${objective}`,
        });
      }
    }

    if (!roomIds.has(params.winCondition.extractionRoomId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Win condition references unknown extractionRoomId: ${params.winCondition.extractionRoomId}`,
      });
    }
  });

export type HeistScenarioParamsSchemaType = z.infer<typeof HeistScenarioParamsSchema>;

function formatZodIssue(issue: z.ZodIssue): string {
  if (issue.path.length === 0) {
    return issue.message;
  }
  return `${issue.path.join(".")}: ${issue.message}`;
}

export function validateHeistScenarioParams(
  params: unknown,
): { ok: true; value: HeistScenarioParamsSchemaType } | { ok: false; errors: string[] } {
  const result = HeistScenarioParamsSchema.safeParse(params);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, errors: result.error.issues.map(formatZodIssue) };
}

export function assertHeistScenarioParams(params: unknown): HeistScenarioParamsSchemaType {
  const result = validateHeistScenarioParams(params);
  if (!result.ok) {
    const message = [`Invalid HeistScenarioParams:`]
      .concat(result.errors.map((error) => `- ${error}`))
      .join("\n");
    throw new Error(message);
  }
  return result.value;
}
