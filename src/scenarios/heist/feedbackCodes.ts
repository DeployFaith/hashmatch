/** Machine-readable error codes for invalid actions */
export const HEIST_ERROR_CODES = {
  // Agent/action validation
  unknown_agent: "unknown_agent",
  invalid_action_payload: "invalid_action_payload",
  invalid_action_type: "invalid_action_type",
  agent_already_extracted: "agent_already_extracted",

  // Movement
  invalid_move_target: "invalid_move_target",
  no_door_between_rooms: "no_door_between_rooms",
  missing_required_item: "missing_required_item",
  door_locked: "door_locked",

  // Items
  invalid_item_id: "invalid_item_id",
  item_not_in_room: "item_not_in_room",
  unknown_item: "unknown_item",

  // Terminal
  invalid_terminal_id: "invalid_terminal_id",
  terminal_not_in_room: "terminal_not_in_room",

  // Extraction
  not_in_extraction_room: "not_in_extraction_room",
} as const;

export type HeistErrorCode = (typeof HEIST_ERROR_CODES)[keyof typeof HEIST_ERROR_CODES];

/** Machine-readable result codes for notable valid actions */
export const HEIST_RESULT_CODES = {
  // Movement
  moved: "moved",

  // Terminal
  hack_progress: "hack_progress",
  hack_complete: "hack_complete",

  // Items
  item_pickup: "item_pickup",

  // Extraction
  extraction_success: "extraction_success",
} as const;

export type HeistResultCode = (typeof HEIST_RESULT_CODES)[keyof typeof HEIST_RESULT_CODES];
