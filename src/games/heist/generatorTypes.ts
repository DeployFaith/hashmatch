import type { HeistSkin } from "./types.js";

export type HeistDifficultyPreset = "easy" | "normal" | "hard";

export type HeistRoomCountConfig = { exact: number } | { min: number; max: number };

export interface HeistGeneratorSecurityDensity {
  guards?: number;
  cameras?: number;
}

export interface HeistGeneratorConfig {
  rooms: HeistRoomCountConfig;
  branchingFactor?: number;
  loopCount?: number;
  securityDensity?: HeistGeneratorSecurityDensity;
  hazardsEnabled?: boolean;
  maxTurns?: number;
  timeLimit?: number;
  difficultyPreset?: HeistDifficultyPreset;
  skin?: HeistSkin;
}
