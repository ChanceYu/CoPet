import antigravityIconUrl from "../assets/agents/antigravity.svg";
import claudeCodeIconUrl from "../assets/agents/claude-code.svg";
import copilotIconUrl from "../assets/agents/copilot.svg";
import codexIconUrl from "../assets/agents/codex.svg";
import cursorIconUrl from "../assets/agents/cursor.svg";
import geminiIconUrl from "../assets/agents/gemini.svg";
import openCodeIconUrl from "../assets/agents/opencode.svg";
import piIconUrl from "../assets/agents/pi.svg";

const agentIconUrls: Record<string, string> = {
  antigravity: antigravityIconUrl,
  "claude-code": claudeCodeIconUrl,
  copilot: copilotIconUrl,
  codex: codexIconUrl,
  cursor: cursorIconUrl,
  gemini: geminiIconUrl,
  opencode: openCodeIconUrl,
  pi: piIconUrl,
};

export function agentIconUrl(agentId: string): string | null {
  return agentIconUrls[agentId] ?? null;
}
