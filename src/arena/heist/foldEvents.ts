import type { MatchEvent } from "../../contract/types.js";
import type { HeistSceneState } from "./types.js";
import { reduceHeistEvent } from "./reducer.js";

export function foldOne(
  state: HeistSceneState | undefined,
  event: MatchEvent,
): HeistSceneState {
  return reduceHeistEvent(state, event);
}

export function foldEvents(
  events: Iterable<MatchEvent>,
  reducer: (state: HeistSceneState | undefined, event: MatchEvent) => HeistSceneState =
    reduceHeistEvent,
): HeistSceneState {
  let state: HeistSceneState | undefined;
  for (const event of events) {
    state = reducer(state, event);
  }
  if (!state) {
    throw new Error("No events provided to foldEvents.");
  }
  return state;
}
