import { describe, expect, it } from "vitest";
import type { ActionAdjudicatedEvent } from "../src/contract/types.js";
import type { HeistSceneState } from "../src/arena/heist/types.js";
import {
  adjudicationToMomentCandidate,
  createMomentDetectorState,
  runHeistStatefulDetectors,
} from "../src/components/heist/hud/selectors.js";
import { HEIST_ERROR_CODES, HEIST_RESULT_CODES } from "../src/scenarios/heist/feedbackCodes.js";
import type { HeistMomentCandidate } from "../src/components/heist/moments/momentTypes.js";

const createBaseState = (overrides?: Partial<HeistSceneState>): HeistSceneState => ({
  matchId: "match-1",
  scenarioName: "heist",
  status: "running",
  turn: { current: 1 },
  map: { rooms: {}, doors: {} },
  agents: {},
  guards: {},
  entities: {},
  items: {},
  ...overrides,
});

const createAdjudicatedEvent = (
  overrides?: Partial<ActionAdjudicatedEvent>,
): ActionAdjudicatedEvent => ({
  type: "ActionAdjudicated",
  seq: 1,
  matchId: "match-1",
  agentId: "agent-1",
  turn: 1,
  valid: false,
  feedback: {},
  method: "direct-json",
  warnings: [],
  errors: null,
  fallbackReason: null,
  chosenAction: { type: "move", toRoomId: "room-b" },
  ...overrides,
});

describe("heist moment mapping", () => {
  it("maps no-door move failure to misnavigation", () => {
    const state = createBaseState({
      agents: { "agent-1": { agentId: "agent-1", roomId: "room-a" } },
      map: {
        rooms: { "room-a": { roomId: "room-a" }, "room-b": { roomId: "room-b" } },
        doors: {},
      },
    });
    const event = createAdjudicatedEvent({
      feedback: { error: HEIST_ERROR_CODES.no_door_between_rooms },
    });
    const candidate = adjudicationToMomentCandidate(event, state);
    expect(candidate?.id).toBe("misnavigation");
    expect(candidate?.register).toBe("failure");
  });

  it("maps premature extraction to premature_extraction", () => {
    const state = createBaseState();
    const event = createAdjudicatedEvent({
      feedback: { error: HEIST_ERROR_CODES.not_in_extraction_room },
    });
    const candidate = adjudicationToMomentCandidate(event, state);
    expect(candidate?.id).toBe("premature_extraction");
    expect(candidate?.register).toBe("failure");
  });

  it("maps decoder fallback to schema_fumble", () => {
    const state = createBaseState();
    const event = createAdjudicatedEvent({
      feedback: { error: HEIST_ERROR_CODES.invalid_action_payload },
      fallbackReason: "schema-validation-failed",
    });
    const candidate = adjudicationToMomentCandidate(event, state);
    expect(candidate?.id).toBe("schema_fumble");
    expect(candidate?.register).toBe("failure");
  });

  it("maps terminal completion to terminal_hacked", () => {
    const state = createBaseState();
    const event = createAdjudicatedEvent({
      valid: true,
      feedback: { result: HEIST_RESULT_CODES.hack_complete },
    });
    const candidate = adjudicationToMomentCandidate(event, state);
    expect(candidate?.id).toBe("terminal_hacked");
    expect(candidate?.register).toBe("progress");
  });
});

describe("heist moment detectors", () => {
  it("fires guard_closing with a cooldown", () => {
    const detectorState = createMomentDetectorState();
    const state = createBaseState({
      map: {
        rooms: { "room-a": { roomId: "room-a" }, "room-b": { roomId: "room-b" } },
        doors: {
          "door-1": { doorId: "door-1", from: "room-a", to: "room-b" },
        },
      },
      agents: { "agent-1": { agentId: "agent-1", roomId: "room-a" } },
      guards: { "guard-1": { guardId: "guard-1", roomId: "room-b", patrolRoomIds: [] } },
    });

    const first = runHeistStatefulDetectors({
      state,
      turn: 1,
      seq: 10,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(first.some((candidate) => candidate.id === "guard_closing")).toBe(true);

    const second = runHeistStatefulDetectors({
      state: { ...state, turn: { current: 2 } },
      turn: 2,
      seq: 11,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(second.some((candidate) => candidate.id === "guard_closing")).toBe(false);

    const third = runHeistStatefulDetectors({
      state: { ...state, turn: { current: 4 } },
      turn: 4,
      seq: 12,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(third.some((candidate) => candidate.id === "guard_closing")).toBe(true);
  });

  it("fires stalled_objective at 3 turns and resets on progress", () => {
    const detectorState = createMomentDetectorState();
    const state = createBaseState();

    runHeistStatefulDetectors({
      state,
      turn: 1,
      seq: 1,
      candidatesThisTurn: [],
      detectorState,
    });
    runHeistStatefulDetectors({
      state,
      turn: 2,
      seq: 2,
      candidatesThisTurn: [],
      detectorState,
    });
    const third = runHeistStatefulDetectors({
      state,
      turn: 3,
      seq: 3,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(third.some((candidate) => candidate.id === "stalled_objective")).toBe(true);

    const progressCandidate: HeistMomentCandidate = {
      id: "item_acquired",
      register: "progress",
      priority: 10,
      turn: 4,
      agentId: "agent-1",
      seqRange: { start: 4, end: 4 },
      context: {},
    };
    const afterProgress = runHeistStatefulDetectors({
      state,
      turn: 4,
      seq: 4,
      candidatesThisTurn: [progressCandidate],
      detectorState,
    });
    expect(afterProgress.some((candidate) => candidate.id === "stalled_objective")).toBe(false);

    runHeistStatefulDetectors({
      state,
      turn: 5,
      seq: 5,
      candidatesThisTurn: [],
      detectorState,
    });
    runHeistStatefulDetectors({
      state,
      turn: 6,
      seq: 6,
      candidatesThisTurn: [],
      detectorState,
    });
    const seventh = runHeistStatefulDetectors({
      state,
      turn: 7,
      seq: 7,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(seventh.some((candidate) => candidate.id === "stalled_objective")).toBe(true);
  });



  it("fires fm17_stall once when no-progress same-room same-action streak reaches 6", () => {
    const detectorState = createMomentDetectorState();
    let previousState: HeistSceneState | undefined;

    for (let turn = 1; turn <= 5; turn += 1) {
      const state = createBaseState({
        turn: { current: turn },
        agents: {
          "agent-1": {
            agentId: "agent-1",
            roomId: "room-a",
            lastAction: { type: "wait" },
          },
        },
      });
      const candidates = runHeistStatefulDetectors({
        state,
        turn,
        seq: turn,
        candidatesThisTurn: [],
        detectorState,
        previousState,
      });
      expect(candidates.some((candidate) => candidate.id === "fm17_stall")).toBe(false);
      previousState = state;
    }

    const sixthState = createBaseState({
      turn: { current: 6 },
      agents: {
        "agent-1": {
          agentId: "agent-1",
          roomId: "room-a",
          lastAction: { type: "wait" },
        },
      },
    });

    const sixth = runHeistStatefulDetectors({
      state: sixthState,
      turn: 6,
      seq: 6,
      candidatesThisTurn: [],
      detectorState,
      previousState,
    });
    expect(sixth.some((candidate) => candidate.id === "fm17_stall")).toBe(false);

    const seventhState = createBaseState({
      turn: { current: 7 },
      agents: {
        "agent-1": {
          agentId: "agent-1",
          roomId: "room-a",
          lastAction: { type: "wait" },
        },
      },
    });

    const seventh = runHeistStatefulDetectors({
      state: seventhState,
      turn: 7,
      seq: 7,
      candidatesThisTurn: [],
      detectorState,
      previousState: sixthState,
    });
    expect(seventh.some((candidate) => candidate.id === "fm17_stall")).toBe(true);

    const eighthState = createBaseState({
      turn: { current: 8 },
      agents: {
        "agent-1": {
          agentId: "agent-1",
          roomId: "room-a",
          lastAction: { type: "wait" },
        },
      },
    });

    const eighth = runHeistStatefulDetectors({
      state: eighthState,
      turn: 8,
      seq: 8,
      candidatesThisTurn: [],
      detectorState,
      previousState: seventhState,
    });
    expect(eighth.some((candidate) => candidate.id === "fm17_stall")).toBe(false);
  });

  it("fires noise_creep at 50% and 75% without re-firing on decay", () => {
    const detectorState = createMomentDetectorState();
    const baseState = createBaseState({
      sceneFacts: { alertLevel: 0, noise: 0 },
      scenarioParams: { alertThresholds: [0, 10, 20] },
    });

    const first = runHeistStatefulDetectors({
      state: { ...baseState, sceneFacts: { alertLevel: 0, noise: 5 } },
      turn: 1,
      seq: 1,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(first.some((candidate) => candidate.id === "noise_creep")).toBe(true);

    const second = runHeistStatefulDetectors({
      state: { ...baseState, sceneFacts: { alertLevel: 0, noise: 8 } },
      turn: 2,
      seq: 2,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(second.filter((candidate) => candidate.id === "noise_creep").length).toBe(1);

    const third = runHeistStatefulDetectors({
      state: { ...baseState, sceneFacts: { alertLevel: 0, noise: 4 } },
      turn: 3,
      seq: 3,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(third.some((candidate) => candidate.id === "noise_creep")).toBe(false);

    const fourth = runHeistStatefulDetectors({
      state: { ...baseState, sceneFacts: { alertLevel: 0, noise: 6 } },
      turn: 4,
      seq: 4,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(fourth.some((candidate) => candidate.id === "noise_creep")).toBe(false);
  });

  it("fires near_miss only when guards share or cross agent rooms", () => {
    const detectorState = createMomentDetectorState();
    const baseState = createBaseState({
      map: {
        rooms: { "room-a": { roomId: "room-a" } },
        doors: {},
      },
      agents: { "agent-1": { agentId: "agent-1", roomId: "room-a" } },
      guards: { "guard-1": { guardId: "guard-1", roomId: "room-a", patrolRoomIds: [] } },
    });

    const first = runHeistStatefulDetectors({
      state: baseState,
      turn: 1,
      seq: 1,
      candidatesThisTurn: [],
      detectorState,
    });
    expect(first.some((candidate) => candidate.id === "near_miss")).toBe(true);

    const freshDetectorState = createMomentDetectorState();
    const second = runHeistStatefulDetectors({
      state: {
        ...baseState,
        guards: { "guard-1": { guardId: "guard-1", roomId: "room-b", patrolRoomIds: [] } },
      },
      turn: 2,
      seq: 2,
      candidatesThisTurn: [],
      detectorState: freshDetectorState,
    });
    expect(second.some((candidate) => candidate.id === "near_miss")).toBe(false);
  });
});
