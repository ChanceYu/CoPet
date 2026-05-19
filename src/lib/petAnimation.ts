import type { PetStateId } from "./appTypes";

// ---------- Layer unions ----------

export type BaseState =
  | { kind: "daze" }
  | { kind: "blink" }
  | { kind: "sleep" };

export type AgentState =
  | { kind: "none" }
  | { kind: "thinking"; agent: string }
  | { kind: "editing"; agent: string; tool?: string }
  | { kind: "inspecting"; agent: string; tool?: string }
  | { kind: "awaitingApproval"; agent: string }
  | { kind: "celebrating"; agent: string }
  | { kind: "hurt"; agent: string };

export type InputState =
  | { kind: "idle" }
  | { kind: "looking"; direction: "left" | "right" }
  | { kind: "tilting" }
  | { kind: "happy" }
  | { kind: "surprised"; source?: "click" | "drag" }
  | { kind: "petted" }
  | { kind: "pettedSlow" }
  | { kind: "failed" };

export type EmotionState =
  | { kind: "none" }
  | { kind: "loadingBubble" }
  | { kind: "sparkle" }
  | { kind: "smoke" }
  | { kind: "heart" }
  | { kind: "questionMark" };

// "still" is reserved for the drag-land transition introduced in Task 7;
// "anchored" represents the resting state before any drag.
export type MotionState =
  | { kind: "anchored" }
  | { kind: "dragging"; direction: "left" | "right" | "still" };

export type PetLayers = {
  base: BaseState;
  agent: AgentState;
  input: InputState;
  motion: MotionState;
  emotion: EmotionState;
};

export type EmotionOverlayId = "loading-bubble" | "sparkle" | "smoke" | "heart" | "question-mark";

export type ComposedView = {
  bodySpriteRow: PetStateId;
  emotionOverlay: EmotionOverlayId | null;
  dragging: boolean;
};

// ---------- Sprite fallback maps (layer → existing 9-row vocab) ----------

function baseSpriteRow(_state: BaseState): PetStateId {
  return "idle";
}

function agentSpriteRow(state: AgentState): PetStateId {
  switch (state.kind) {
    case "thinking":
      return "waiting";
    case "editing":
      return "running";
    case "inspecting":
      return "review";
    case "awaitingApproval":
      return "waiting";
    case "celebrating":
      return "waving";
    case "hurt":
      return "failed";
    case "none":
      return "idle";
  }
}

function inputSpriteRow(state: InputState): PetStateId {
  switch (state.kind) {
    case "looking":
      return state.direction === "right" ? "running-right" : "running-left";
    case "tilting":
      return "waiting";
    case "happy":
      return "jumping";
    // Reuse the wave frames for the brief "surprised" reaction on double-click / drag-land.
    case "surprised":
      return "waving";
    case "petted":
      return "jumping";
    case "pettedSlow":
      return "waiting";
    case "failed":
      return "failed";
    case "idle":
      return "idle";
  }
}

function dragSpriteRow(direction: "left" | "right" | "still"): PetStateId {
  if (direction === "right") return "running-right";
  if (direction === "left") return "running-left";
  return "idle";
}

function emotionId(state: Exclude<EmotionState, { kind: "none" }>): EmotionOverlayId {
  switch (state.kind) {
    case "loadingBubble":
      return "loading-bubble";
    case "sparkle":
      return "sparkle";
    case "smoke":
      return "smoke";
    case "heart":
      return "heart";
    case "questionMark":
      return "question-mark";
  }
}

// ---------- Composer ----------

export function isCriticalAgent(state: AgentState): boolean {
  return state.kind === "hurt" || state.kind === "awaitingApproval";
}

export function composeLayers(layers: PetLayers): ComposedView {
  if (layers.motion.kind === "dragging") {
    return {
      bodySpriteRow: dragSpriteRow(layers.motion.direction),
      emotionOverlay: null,
      dragging: true,
    };
  }

  if (isCriticalAgent(layers.agent)) {
    return {
      bodySpriteRow: agentSpriteRow(layers.agent),
      emotionOverlay:
        layers.emotion.kind === "none" ? null : emotionId(layers.emotion),
      dragging: false,
    };
  }

  if (layers.input.kind !== "idle") {
    return {
      bodySpriteRow: inputSpriteRow(layers.input),
      emotionOverlay:
        layers.emotion.kind === "none" ? null : emotionId(layers.emotion),
      dragging: false,
    };
  }

  if (layers.agent.kind !== "none") {
    return {
      bodySpriteRow: agentSpriteRow(layers.agent),
      emotionOverlay:
        layers.emotion.kind === "none" ? null : emotionId(layers.emotion),
      dragging: false,
    };
  }

  return {
    bodySpriteRow: baseSpriteRow(layers.base),
    emotionOverlay: null,
    dragging: false,
  };
}
