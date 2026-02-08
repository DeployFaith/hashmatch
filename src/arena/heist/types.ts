export type RoomId = string;
export type AgentId = string;
export type GuardId = string;
export type EntityId = string;
export type ItemId = string;

export type HeistSceneState = {
  matchId: string;
  scenarioName: string;
  status: "idle" | "running" | "ended" | "error";
  terminationReason?: "completed" | "capture" | "lockdown" | "maxTurns" | "error" | string;
  turn: { current: number; maxTurns?: number };
  map: HeistMapState;
  agents: Record<AgentId, AgentVisual>;
  guards: Record<GuardId, GuardVisual>;
  entities: Record<EntityId, EntityVisual>;
  items: Record<ItemId, ItemVisual>;
  sceneFacts?: {
    alertLevel?: number;
    noise?: number;
  };
  /** Scenario params needed by HUD selectors (win condition, extraction room, etc.). */
  scenarioParams?: {
    extractionRoomId?: string;
    requiredObjectives?: string[];
    maxAlertLevel?: number;
    alertThresholds?: number[];
  };
  lastEventSeq?: number;
  unknownEvents?: Array<{ type: string; seq?: number }>;
};

export type HeistMapState = {
  rooms: Record<RoomId, RoomVisual>;
  doors: Record<string, DoorVisual>;
};

export type RoomVisual = {
  roomId: RoomId;
  label?: string;
  /**
   * Optional during construction, but always populated after scene init.
   */
  positionHint?: { x: number; y: number };
};

export type DoorVisual = {
  doorId: string;
  from: RoomId;
  to: RoomId;
  isLocked?: boolean;
};

export type ActionLike = { type: string; [key: string]: unknown };
export type AdjudicationLike = { type: string; [key: string]: unknown };

export type AgentVisual = {
  agentId: AgentId;
  roomId?: RoomId;
  visibleRooms?: RoomId[];
  lastAction?: ActionLike;
  lastAdjudication?: AdjudicationLike;
  error?: string;
};

export type GuardVisual = {
  guardId: GuardId;
  roomId?: RoomId;
  patrolRoomIds: RoomId[];
};

export type EntityVisual = {
  entityId: EntityId;
  kind: string;
  roomId?: RoomId;
  label?: string;
  state?: Record<string, unknown>;
};

export type ItemVisual = {
  itemId: ItemId;
  kind: string;
  roomId?: RoomId;
  label?: string;
  state?: Record<string, unknown>;
  /** Agent who currently holds this item (set by pickup adjudication). */
  heldBy?: AgentId;
};
