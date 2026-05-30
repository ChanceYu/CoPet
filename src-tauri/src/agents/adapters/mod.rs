mod antigravity;
mod claude_code;
mod codex;
mod copilot;
mod cursor;
mod gemini;
mod opencode;
mod pi;

pub(super) static ANTIGRAVITY: &dyn super::CliAdapter = &antigravity::ADAPTER;
pub(super) static CLAUDE_CODE: &dyn super::CliAdapter = &claude_code::ADAPTER;
pub(super) static CODEX: &dyn super::CliAdapter = &codex::ADAPTER;
pub(super) static COPILOT: &dyn super::CliAdapter = &copilot::ADAPTER;
pub(super) static CURSOR: &dyn super::CliAdapter = &cursor::ADAPTER;
pub(super) static GEMINI: &dyn super::CliAdapter = &gemini::ADAPTER;
pub(super) static OPENCODE: &dyn super::CliAdapter = &opencode::ADAPTER;
pub(super) static PI: &dyn super::CliAdapter = &pi::ADAPTER;
