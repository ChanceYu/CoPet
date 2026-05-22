mod antigravity;
mod claude_code;
mod codex;
mod gemini;
mod opencode;

pub(super) static ANTIGRAVITY: &dyn super::CliAdapter = &antigravity::ADAPTER;
pub(super) static CLAUDE_CODE: &dyn super::CliAdapter = &claude_code::ADAPTER;
pub(super) static CODEX: &dyn super::CliAdapter = &codex::ADAPTER;
pub(super) static GEMINI: &dyn super::CliAdapter = &gemini::ADAPTER;
pub(super) static OPENCODE: &dyn super::CliAdapter = &opencode::ADAPTER;
