import { useMemo, useRef } from "react";

import { useAppData } from "./useAppData";
import { useAgentState } from "./useAgentState";
import { useBaseState } from "./useBaseState";
import { useEmotionState } from "./useEmotionState";
import { useInteractionState } from "./useInteractionState";
import { useMotionState } from "./useMotionState";
import { composeLayers } from "../lib/petAnimation";
import type {
  ComposedView,
  InputState,
  MotionState,
  PetLayers,
} from "../lib/petAnimation";
import type { InteractionHandlers } from "./useInteractionState";
import type { MotionHandlers } from "./useMotionState";

export type UseLayeredPetStateResult = {
  layers: PetLayers;
  composed: ComposedView;
  bindInput: () => InteractionHandlers;
  bindMotion: () => MotionHandlers;
};

export function useLayeredPetState(): UseLayeredPetStateResult {
  const { petState, agentMessages } = useAppData();
  const agent = useAgentState({ petState, agentMessages });
  const interaction = useInteractionState();
  const motion = useMotionState({
    onDragLand: () => interaction.notifyDragLand(),
  });
  const emotion = useEmotionState(agent, interaction.state as InputState);

  const agentActivityRef = useRef(Date.now());
  if (agent.kind !== "none") {
    agentActivityRef.current = Date.now();
  }

  const lastActivityAtMs = Math.max(
    agentActivityRef.current,
    interaction.lastActivityAtMs,
    motion.lastActivityAtMs,
  );

  const base = useBaseState({ lastActivityAtMs });

  const layers: PetLayers = useMemo(
    () => ({
      base,
      agent,
      input: interaction.state as InputState,
      motion: motion.state as MotionState,
      emotion,
    }),
    [base, agent, interaction.state, motion.state, emotion],
  );

  const composed = useMemo(() => composeLayers(layers), [layers]);

  return {
    layers,
    composed,
    bindInput: () => interaction.handlers,
    bindMotion: () => motion.handlers,
  };
}
