import claudeCodeIconUrl from "../assets/agents/claude-code.svg";
import codexIconUrl from "../assets/agents/codex.svg";
import geminiIconUrl from "../assets/agents/gemini.svg";
import openCodeIconUrl from "../assets/agents/opencode.svg";

export const agentIconUrls: Record<string, string> = {
  "claude-code": claudeCodeIconUrl,
  codex: codexIconUrl,
  gemini: geminiIconUrl,
  opencode: openCodeIconUrl,
};

export function agentIconUrl(agentId: string): string | null {
  return agentIconUrls[agentId] ?? null;
}
