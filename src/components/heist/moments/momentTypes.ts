export type MomentRegister = "failure" | "tension" | "progress";

export type HeistMomentId =
  | "misnavigation"
  | "locked_door"
  | "interaction_snag"
  | "premature_extraction"
  | "schema_fumble"
  | "terminal_hacked"
  | "terminal_progress"
  | "item_acquired"
  | "clean_extraction"
  | "guard_closing"
  | "stalled_objective"
  | "noise_creep"
  | "near_miss"
  | "fm17_stall";

export interface HeistMomentCandidate {
  id: HeistMomentId;
  register: MomentRegister;
  priority: number;
  turn: number;
  agentId: string;
  seqRange?: { start: number; end: number };
  context: Record<string, unknown>;
}
