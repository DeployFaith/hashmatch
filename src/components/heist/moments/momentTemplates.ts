import type { HeistMomentCandidate, HeistMomentId } from "./momentTypes";

// ---- Types ----

export interface HeistMomentCard {
  id: string;
  turn: number;
  seq: number;
  agentId: string;
  register: "failure" | "tension" | "progress";
  priority: number;
  icon: string;
  title: string;
  detail: string;
  category: string;
  momentId: HeistMomentId;
}

export interface CollapsedMomentCard extends HeistMomentCard {
  count: number;
  collapsedSeqs: number[];
}

type HeistMomentContext = {
  agentId?: string;
  agentLabel?: string;
  actionType?: string;
  errorCode?: string;
  resultCode?: string;
  message?: string;
  currentRoomLabel?: string;
  targetRoomLabel?: string;
  doorLabel?: string;
  requiredItemLabel?: string;
  targetLabel?: string;
  terminalLabel?: string;
  itemLabel?: string;
  itemType?: string;
  hackProgress?: number;
  hackRequired?: number;
  extractionRoomLabel?: string;
  fallbackReason?: string;
  alertLevelBefore?: number;
  alertLevelAfter?: number;
  guardLabel?: string;
  guardRoomLabel?: string;
  agentRoomLabel?: string;
  stalledTurns?: number;
  noise?: number;
  noisePercent?: number;
  thresholdRatio?: number;
  nextThreshold?: number;
};

type TemplateFn = (ctx: HeistMomentContext) => {
  icon: string;
  title: string;
  detail: string;
  category: string;
};

// ---- Template data ----

const MOMENT_TEMPLATES: Record<HeistMomentId, TemplateFn[]> = {
  misnavigation: [
    (ctx) => ({
      icon: "\u{1F9ED}",
      title: "Wrong turn",
      detail: `No door between ${ctx.currentRoomLabel ?? "here"} and ${ctx.targetRoomLabel ?? "there"}`,
      category: "navigation",
    }),
    (ctx) => ({
      icon: "\u{1F6A7}",
      title: "Blocked path",
      detail: `Move blocked near ${ctx.currentRoomLabel ?? "current room"}`,
      category: "navigation",
    }),
  ],
  locked_door: [
    (ctx) => ({
      icon: "\u{1F512}",
      title: "Door locked",
      detail: `${ctx.doorLabel ?? "Door"} needs ${ctx.requiredItemLabel ?? "a keycard"}`,
      category: "navigation",
    }),
    (ctx) => ({
      icon: "\u{1F6AA}",
      title: "Access denied",
      detail: `Couldn't pass ${ctx.doorLabel ?? "the door"}`,
      category: "navigation",
    }),
  ],
  interaction_snag: [
    (ctx) => ({
      icon: "\u26A0\uFE0F",
      title: "Interaction failed",
      detail: ctx.message ?? `No ${ctx.targetLabel ?? "target"} available here`,
      category: "interaction",
    }),
    (ctx) => ({
      icon: "\u{1F6AB}",
      title: "Nothing to use",
      detail: `Couldn't reach ${ctx.targetLabel ?? "that target"}`,
      category: "interaction",
    }),
  ],
  premature_extraction: [
    (ctx) => ({
      icon: "\u{1F6F0}\uFE0F",
      title: "Too soon to extract",
      detail: `Extraction point is ${ctx.extractionRoomLabel ?? "elsewhere"}`,
      category: "extraction",
    }),
    (ctx) => ({
      icon: "\u{1F4CD}",
      title: "Wrong exit",
      detail: `Not at ${ctx.extractionRoomLabel ?? "the extraction room"}`,
      category: "extraction",
    }),
  ],
  schema_fumble: [
    (ctx) => ({
      icon: "\u{1F9E9}",
      title: "Schema fallback",
      detail: `Decoder recovered from ${ctx.fallbackReason ?? "formatting error"}`,
      category: "decoder",
    }),
    (ctx) => ({
      icon: "\u{1F4C4}",
      title: "Format hiccup",
      detail: `Action parsed via fallback (${ctx.fallbackReason ?? "schema issue"})`,
      category: "decoder",
    }),
  ],
  terminal_hacked: [
    (ctx) => ({
      icon: "\u{1F4BB}",
      title: "Terminal hacked",
      detail: `${ctx.terminalLabel ?? "Terminal"} cracked \u2014 intel secured`,
      category: "objective",
    }),
    (ctx) => ({
      icon: "\u{1F4BB}",
      title: "Access granted",
      detail: `${ctx.terminalLabel ?? "Terminal"} is fully breached`,
      category: "objective",
    }),
  ],
  terminal_progress: [
    (ctx) => ({
      icon: "\u23F3",
      title: "Hacking progress",
      detail: `${ctx.terminalLabel ?? "Terminal"} ${ctx.hackProgress ?? "?"}/${ctx.hackRequired ?? "?"}`,
      category: "objective",
    }),
    (ctx) => ({
      icon: "\u{1F4BB}",
      title: "Working the console",
      detail: `Progress ${ctx.hackProgress ?? "?"}/${ctx.hackRequired ?? "?"}`,
      category: "objective",
    }),
  ],
  item_acquired: [
    (ctx) => ({
      icon: "\u{1F4E6}",
      title: "Item secured",
      detail: `${ctx.itemLabel ?? "Item"} collected`,
      category: "inventory",
    }),
    (ctx) => ({
      icon: "\u{1F392}",
      title: "Pickup confirmed",
      detail: `${ctx.itemLabel ?? "Item"} added to pack`,
      category: "inventory",
    }),
  ],
  clean_extraction: [
    (ctx) => ({
      icon: "\u{1F681}",
      title: "Clean extraction",
      detail: `${ctx.agentLabel ?? "Crew"} exfiltrated with the objective`,
      category: "extraction",
    }),
    (ctx) => ({
      icon: "\u2705",
      title: "Mission complete",
      detail: `${ctx.agentLabel ?? "Team"} extraction successful`,
      category: "extraction",
    }),
  ],
  guard_closing: [
    (ctx) => ({
      icon: "\u{1F6A8}",
      title: "Guard closing in",
      detail: `${ctx.guardLabel ?? "Guard"} near ${ctx.agentRoomLabel ?? "your position"}`,
      category: "stealth",
    }),
    (ctx) => ({
      icon: "\u{1F46E}",
      title: "Patrol nearby",
      detail: `${ctx.guardRoomLabel ?? "Guard"} adjacent to ${ctx.agentRoomLabel ?? "agent room"}`,
      category: "stealth",
    }),
  ],
  stalled_objective: [
    (ctx) => ({
      icon: "\u23F8\uFE0F",
      title: "Objective stalled",
      detail: `No progress for ${ctx.stalledTurns ?? 0} turns`,
      category: "tempo",
    }),
    (ctx) => ({
      icon: "\u23F8\uFE0F",
      title: "Momentum fading",
      detail: `Stalled for ${ctx.stalledTurns ?? 0} turns`,
      category: "tempo",
    }),
  ],
  noise_creep: [
    (ctx) => ({
      icon: "\u{1F50A}",
      title: "Noise rising",
      detail: `Noise at ${ctx.noisePercent ?? 0}% of next alert`,
      category: "stealth",
    }),
    (ctx) => ({
      icon: "\u{1F50A}",
      title: "Sound spike",
      detail: `Approaching threshold ${ctx.nextThreshold ?? "?"}`,
      category: "stealth",
    }),
  ],
  near_miss: [
    (ctx) => ({
      icon: "\u{1F9DF}\u200D\u2642\uFE0F",
      title: "Near miss",
      detail: `${ctx.guardLabel ?? "Guard"} crossed paths in ${ctx.agentRoomLabel ?? "the room"}`,
      category: "stealth",
    }),
    (ctx) => ({
      icon: "\u{1F441}\uFE0F",
      title: "Close call",
      detail: `Guard nearly spotted ${ctx.agentLabel ?? "agent"}`,
      category: "stealth",
    }),
  ],
};

// ---- Helpers ----

const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const pickTemplate = (candidate: HeistMomentCandidate, templates: TemplateFn[]): TemplateFn => {
  if (templates.length === 1) {
    return templates[0];
  }
  const seed = `${candidate.id}:${candidate.agentId}:${candidate.turn}:${candidate.seqRange?.start ?? 0}`;
  const index = hashString(seed) % templates.length;
  return templates[index];
};

// ---- Template Resolution ----

export function momentCandidateToCard(candidate: HeistMomentCandidate): HeistMomentCard | null {
  const templates = MOMENT_TEMPLATES[candidate.id];
  if (!templates || templates.length === 0) {
    return null;
  }

  const ctx = candidate.context as HeistMomentContext;
  const template = pickTemplate(candidate, templates);
  const content = template(ctx);
  const seq = candidate.seqRange?.start ?? 0;

  return {
    id: `moment-${candidate.id}-${seq}`,
    turn: candidate.turn,
    seq,
    agentId: candidate.agentId,
    register: candidate.register,
    priority: candidate.priority,
    icon: content.icon,
    title: content.title,
    detail: content.detail,
    category: content.category,
    momentId: candidate.id,
  };
}

// ---- Collapse Rule ----

export function collapseMomentCards(cards: HeistMomentCard[]): CollapsedMomentCard[] {
  if (cards.length === 0) {
    return [];
  }

  const result: CollapsedMomentCard[] = [];
  let current: CollapsedMomentCard = {
    ...cards[0],
    count: 1,
    collapsedSeqs: [cards[0].seq],
  };

  for (let i = 1; i < cards.length; i += 1) {
    const card = cards[i];
    if (
      card.agentId === current.agentId &&
      card.title === current.title &&
      card.category === current.category &&
      card.register === current.register
    ) {
      current.count += 1;
      current.collapsedSeqs.push(card.seq);
    } else {
      result.push(current);
      current = { ...card, count: 1, collapsedSeqs: [card.seq] };
    }
  }
  result.push(current);

  return result;
}
