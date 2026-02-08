// Contract types
export type {
  CommentaryEntry,
  MomentBoundEntry,
  RangeBoundEntry,
  CommentarySeverity,
  CommentaryWarning,
  CommentaryFile,
  CommentaryLoadStatus,
} from "./lib/replay/commentary.js";

export type {
  HeistRoomType,
  HeistDoor,
  HeistRoom,
  HeistMap,
  HeistEntity,
  HeistItem,
  HeistRules,
  HeistScoring,
  HeistWinCondition,
  HeistSkin,
  HeistScenarioParams,
  HeistScenarioParamsSchemaType,
} from "./games/heist/types.js";

export {
  HeistScenarioParamsSchema,
  validateHeistScenarioParams,
  assertHeistScenarioParams,
} from "./games/heist/types.js";

export type {
  HeistValidationCode,
  ValidationError,
  ValidationResult,
} from "./games/heist/validation.js";

export { validateHeistScenario } from "./games/heist/validator.js";

export type {
  HeistDifficultyPreset,
  HeistGeneratorConfig,
  HeistGeneratorSecurityDensity,
  HeistRoomCountConfig,
} from "./games/heist/generatorTypes.js";

export { generateHeistScenario, HEIST_PRESETS } from "./games/heist/generator.js";
export { generateDescription, generatePreview } from "./games/heist/preview.js";
export { generateHeistDebugView } from "./games/heist/debugView.js";
export { generateLayoutReport } from "./games/heist/layoutReport.js";

export type {
  HeistSceneState,
  HeistMapState,
  RoomVisual,
  DoorVisual,
  AgentVisual,
  GuardVisual,
  EntityVisual,
  ItemVisual,
} from "./arena/heist/types.js";
export { initSceneFromScenario } from "./arena/heist/initSceneFromScenario.js";
export { reduceHeistEvent } from "./arena/heist/reducer.js";
export { foldEvents, foldOne } from "./arena/heist/foldEvents.js";

export type {
  AgentAdapter,
  GatewayActionResponse,
  GatewayConfig,
  GatewayObservationRequest,
  GatewayTimeoutEvent,
  GatewayTranscriptEntry,
} from "./gateway/types.js";
