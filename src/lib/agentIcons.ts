import antigravityIconUrl from "../assets/agents/antigravity.svg";
import claudeCodeIconUrl from "../assets/agents/claude-code.svg";
import copilotIconUrl from "../assets/agents/copilot.svg";
import codexIconUrl from "../assets/agents/codex.svg";
import geminiIconUrl from "../assets/agents/gemini.svg";
import openCodeIconUrl from "../assets/agents/opencode.svg";

export const agentIconUrls: Record<string, string> = {
  antigravity: antigravityIconUrl,
  "claude-code": claudeCodeIconUrl,
  copilot: copilotIconUrl,
  codex: codexIconUrl,
  gemini: geminiIconUrl,
  opencode: openCodeIconUrl,
};

export function agentIconUrl(agentId: string): string | null {
  return agentIconUrls[agentId] ?? null;
}
