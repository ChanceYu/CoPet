import type { Translator } from "./settingsTypes";

export type AgentMetaKey =
  | "antigravity"
  | "claude-code"
  | "codex"
  | "copilot"
  | "gemini"
  | "opencode";

type AgentMetaCopy = {
  vendor: string;
  descriptionKey: Parameters<Translator>[0];
};

const AGENT_META: Record<AgentMetaKey, AgentMetaCopy> = {
  antigravity: {
    vendor: "Google",
    descriptionKey: "agentAntigravityDescription",
  },
  "claude-code": {
    vendor: "Anthropic",
    descriptionKey: "agentClaudeCodeDescription",
  },
  codex: {
    vendor: "OpenAI",
    descriptionKey: "agentCodexDescription",
  },
  copilot: {
    vendor: "GitHub",
    descriptionKey: "agentCopilotDescription",
  },
  gemini: {
    vendor: "Google",
    descriptionKey: "agentGeminiDescription",
  },
  opencode: {
    vendor: "Open source",
    descriptionKey: "agentOpencodeDescription",
  },
};

export function agentMeta(agentId: string): AgentMetaCopy | null {
  return AGENT_META[agentId as AgentMetaKey] ?? null;
}
