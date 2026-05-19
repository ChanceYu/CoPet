import { useMemo, useRef } from "react";

import { useAppData } from "./useAppData";
import { useAgentState } from "./useAgentState";
import { useBaseState } from "./useBaseState";
import { useEmotionState } from "./useEmotionState";
import { useInteractionQuip } from "./useInteractionQuip";
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
import type { Locale } from "../lib/i18n";

export type UseLayeredPetStateResult = {
  layers: PetLayers;
  composed: ComposedView;
  bindInput: () => InteractionHandlers;
  bindMotion: () => MotionHandlers;
  quipText: string | null;
};

export function useLayeredPetState(): UseLayeredPetStateResult {
  const { petState, agentMessages, loadState } = useAppData();
  // The harness AppState type makes `locale` optional; the runtime can therefore
  // produce `undefined`. The fallback keeps `useInteractionQuip` from crashing.
  const locale: Locale = (loadState.status === "ready" ? loadState.data.locale : "en-US") ?? "en-US";
  const quipsEnabled = true; // v1: always on; Task 14 wires the setting

  const { text: quipText, emit: emitQuip } = useInteractionQuip(locale, quipsEnabled);

  const agent = useAgentState({ petState, agentMessages });
  const interaction = useInteractionState({ onQuip: emitQuip });
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
    quipText,
  };
}
