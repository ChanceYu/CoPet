use std::path::{Path, PathBuf};

use super::super::{
    install_json_hooks, json_config_has_pethover_hook, remove_json_hooks, write_atomic,
    AdapterError, AgentManager, CliAdapter, HookEvent,
};

pub(super) static ADAPTER: CodexCliAdapter = CodexCliAdapter;

/// Codex 适配器
///
/// 该适配器负责与 Codex 集成：
/// - 修改文件: `~/.codex/hooks.json`
/// - 改动内容: 在该 JSON 文件中管理 `hooks` 列表。
///   PetHover 会向其中添加自定义钩子，以便在 Codex 执行任务（如提示提交、工具调用前后等）时，
///   触发 PetHover 的事件上报逻辑。
pub(super) struct CodexCliAdapter;

const EVENTS: &[HookEvent] = &[
    HookEvent {
        cli_event: "UserPromptSubmit",
        matcher: None,
        kind: "user.prompt",
    },
    HookEvent {
        cli_event: "PreToolUse",
        matcher: Some("*"),
        kind: "tool.before",
    },
    HookEvent {
        cli_event: "PostToolUse",
        matcher: Some("*"),
        kind: "tool.after",
    },
    HookEvent {
        cli_event: "PermissionRequest",
        matcher: Some("*"),
        kind: "permission.waiting",
    },
    HookEvent {
        cli_event: "Notification",
        matcher: None,
        kind: "permission.waiting",
    },
    HookEvent {
        cli_event: "Stop",
        matcher: None,
        kind: "session.stop",
    },
];

impl CliAdapter for CodexCliAdapter {
    fn id(&self) -> &'static str {
        "codex"
    }

    fn display_name(&self) -> &'static str {
        "Codex"
    }

    fn config_path(&self, home: &Path) -> PathBuf {
        home.join(".codex").join("hooks.json")
    }

    fn is_installed(&self, config_path: &Path) -> Result<bool, AdapterError> {
        json_config_has_pethover_hook(config_path, self.id())
    }

    fn install(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        install_json_hooks(
            manager,
            self.id(),
            &self.config_path(manager.home()),
            EVENTS,
            1,
        )?;
        ensure_codex_hooks_feature(manager.home())
    }

    fn uninstall(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        remove_json_hooks(manager, self.id(), &self.config_path(manager.home()))
    }

    fn executable_names(&self) -> &'static [&'static str] {
        &["codex"]
    }
}

fn codex_config_path(home: &Path) -> PathBuf {
    home.join(".codex").join("config.toml")
}

fn ensure_codex_hooks_feature(home: &Path) -> Result<(), AdapterError> {
    let path = codex_config_path(home);
    let content = match std::fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.into()),
    };
    let next = set_codex_hooks_feature(&content);
    if next != content {
        write_atomic(&path, next.as_bytes())?;
    }
    Ok(())
}

fn set_codex_hooks_feature(content: &str) -> String {
    let mut lines = content.lines().map(ToString::to_string).collect::<Vec<_>>();
    let had_trailing_newline = content.ends_with('\n');
    let mut features_header = None;
    let mut features_end = lines.len();

    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if is_toml_table(trimmed) {
            if features_header.is_some() {
                features_end = index;
                break;
            }
            if trimmed == "[features]" {
                features_header = Some(index);
            }
        }
    }

    if let Some(header) = features_header {
        let mut has_hooks = false;
        for line in lines.iter_mut().take(features_end).skip(header + 1) {
            match toml_key(line) {
                Some("hooks") => {
                    *line = "hooks = true".to_string();
                    has_hooks = true;
                }
                Some("codex_hooks") => {
                    // Keep old configs unambiguous while writing the canonical key below.
                    *line = "codex_hooks = true".to_string();
                }
                _ => {}
            }
        }
        if has_hooks {
            return finish_toml(lines, had_trailing_newline);
        }
        lines.insert(header + 1, "hooks = true".to_string());
        return finish_toml(lines, had_trailing_newline);
    }

    if !lines.is_empty() && lines.last().is_some_and(|line| !line.is_empty()) {
        lines.push(String::new());
    }
    lines.push("[features]".to_string());
    lines.push("hooks = true".to_string());
    finish_toml(lines, true)
}

fn is_toml_table(trimmed: &str) -> bool {
    trimmed.starts_with('[') && trimmed.ends_with(']')
}

fn toml_key(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    if trimmed.starts_with('#') {
        return None;
    }
    trimmed
        .split_once('=')
        .map(|(key, _)| key.trim())
        .filter(|key| !key.is_empty())
}

fn finish_toml(lines: Vec<String>, trailing_newline: bool) -> String {
    let mut content = lines.join("\n");
    if trailing_newline && !content.ends_with('\n') {
        content.push('\n');
    }
    content
}
