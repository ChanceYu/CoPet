import { useEffect, useRef, useState } from "react";

import type { AgentState, EmotionState } from "../lib/petAnimation";

const SPARKLE_DURATION_MS = 600;
const SMOKE_DURATION_MS = 800;

export function useEmotionState(agent: AgentState): EmotionState {
  const [state, setState] = useState<EmotionState>({ kind: "none" });
  const previousKindRef = useRef<AgentState["kind"]>(agent.kind);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const previousKind = previousKindRef.current;
    previousKindRef.current = agent.kind;

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
