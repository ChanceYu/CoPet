import { useEffect, useRef, useState } from "react";

import type { AgentState, EmotionState, InputState } from "../lib/petAnimation";

const SPARKLE_DURATION_MS = 600;
const SMOKE_DURATION_MS = 800;
const SURPRISED_OVERLAY_DURATION_MS = 800;
// Keep in sync with PETTED_SLOW_DURATION_MS in src/hooks/useInteractionState.ts.
const HEART_PETTED_SLOW_DURATION_MS = 1500;
// Keep in sync with PETTED_DURATION_MS in src/hooks/useInteractionState.ts.
const HEART_PETTED_DURATION_MS = 900;

export function useEmotionState(agent: AgentState, input: InputState): EmotionState {
  const [state, setState] = useState<EmotionState>({ kind: "none" });
  const previousAgentKindRef = useRef<AgentState["kind"]>(agent.kind);
  const previousInputKindRef = useRef<InputState["kind"]>(input.kind);
  const timerRef = useRef<number | null>(null);
  const emotionStateRef = useRef<EmotionState>({ kind: "none" });

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const previousKind = previousAgentKindRef.current;
    previousAgentKindRef.current = agent.kind;

    if (agent.kind === "thinking") {
      clearTimer();
      setState({ kind: "loadingBubble" });
      return;
    }

    if (agent.kind === "celebrating" && previousKind !== "celebrating") {
      clearTimer();
      setState({ kind: "sparkle" });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState({ kind: "none" });
      }, SPARKLE_DURATION_MS);
      return;
    }

    if (agent.kind === "hurt" && previousKind !== "hurt") {
      clearTimer();
      setState({ kind: "smoke" });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState({ kind: "none" });
      }, SMOKE_DURATION_MS);
      return;
    }

    // For any other agent kind, ensure the persistent loading bubble does not
    // outlive the thinking phase. Sparkle/smoke fall through their own timers.
    if (previousKind === "thinking") {
      setState((current) => (current.kind === "loadingBubble" ? { kind: "none" } : current));
    }
  }, [agent.kind]);

  // Keep emotionStateRef in sync so the input effect can read the latest
  // emotion state without adding `state` to its dependency array.
  useEffect(() => {
    emotionStateRef.current = state;
  }, [state]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const previousInputKind = previousInputKindRef.current;
    previousInputKindRef.current = input.kind;

    if (input.kind === "surprised" && previousInputKind !== "surprised") {
      // Do not preempt a persistent agent overlay (loadingBubble).
      // Transient overlays (sparkle, smoke) will time out on their own; replacing
      // them with questionMark/sparkle for a brief interaction acknowledgment is OK.
      if (emotionStateRef.current.kind === "loadingBubble") {
        return;
      }
      clearTimer();
      const overlayKind: EmotionState["kind"] =
        input.source === "drag" ? "sparkle" : "questionMark";
      setState({ kind: overlayKind });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState({ kind: "none" });
      }, SURPRISED_OVERLAY_DURATION_MS);
      return;
    }

    if (input.kind === "pettedSlow" && previousInputKind !== "pettedSlow") {
      if (emotionStateRef.current.kind === "loadingBubble") return;
      clearTimer();
      setState({ kind: "heart" });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState({ kind: "none" });
      }, HEART_PETTED_SLOW_DURATION_MS);
      return;
    }

    if (input.kind === "petted" && previousInputKind !== "petted") {
      if (emotionStateRef.current.kind === "loadingBubble") return;
      clearTimer();
      setState({ kind: "heart" });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setState({ kind: "none" });
      }, HEART_PETTED_DURATION_MS);
      return;
    }
  }, [input.kind]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return state;
}
