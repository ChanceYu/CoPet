import { useMemo } from "react";

import type { AgentMessage, PetStateId } from "../lib/appTypes";
import type { AgentState } from "../lib/petAnimation";

export type AgentStateInputs = {
  petState: PetStateId;
  agentMessages: AgentMessage[];
};

export function useAgentState({
  petState,
  agentMessages,
}: AgentStateInputs): AgentState {
  return useMemo(() => translate(petState, agentMessages), [petState, agentMessages]);
}

function translate(petState: PetStateId, agentMessages: AgentMessage[]): AgentState {
  const agent = agentMessages[0]?.agent ?? "unknown";
  switch (petState) {
    case "jumping":
      return { kind: "thinking", agent, phase: "prompt" };
    case "thinking":
      return { kind: "thinking", agent, phase: "processing" };
    case "running":
      return { kind: "editing", agent };
    case "review":
      return { kind: "inspecting", agent };
    case "waiting":
      return { kind: "awaitingApproval", agent };
    case "waving":
      return { kind: "celebrating", agent };
    case "failed":
      return { kind: "hurt", agent };
    case "idle":
    case "running-left":
    case "running-right":
      return { kind: "none" };
  }
}
