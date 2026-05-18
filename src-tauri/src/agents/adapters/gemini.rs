use std::path::{Path, PathBuf};

use super::super::{
    install_json_hooks, json_config_has_pethover_hooks, remove_json_hooks, AdapterError,
    AgentManager, CliAdapter, HookEvent,
};

pub(super) static ADAPTER: GeminiAdapter = GeminiAdapter;

/// Gemini 适配器
///
/// 该适配器负责与 Gemini 集成：
/// - 修改文件: `~/.gemini/settings.json`
/// - 改动内容: 在配置文件中添加 JSON 钩子配置。
///   监听提示提交、工具调用前后和会话结束事件，并将其映射为宠物的状态变化。
pub(super) struct GeminiAdapter;

const EVENTS: &[HookEvent] = &[
    HookEvent {
        cli_event: "BeforeAgent",
        matcher: None,
        kind: "user.prompt",
    },
    HookEvent {
        cli_event: "BeforeTool",
        matcher: Some("*"),
        kind: "tool.before",
    },
    HookEvent {
        cli_event: "AfterTool",
        matcher: Some("*"),
        kind: "tool.after",
    },
    HookEvent {
        cli_event: "SessionEnd",
        matcher: None,
        kind: "session.stop",
    },
];

impl CliAdapter for GeminiAdapter {
    fn id(&self) -> &'static str {
        "gemini"
    }

    fn display_name(&self) -> &'static str {
        "Gemini"
    }

    fn config_path(&self, home: &Path) -> PathBuf {
        home.join(".gemini").join("settings.json")
    }

    fn is_installed(&self, config_path: &Path) -> Result<bool, AdapterError> {
        json_config_has_pethover_hooks(config_path, self.id(), EVENTS)
    }

    fn install(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        install_json_hooks(
            manager,
            self.id(),
            &self.config_path(manager.home()),
            EVENTS,
            1000,
        )
    }

    fn uninstall(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        remove_json_hooks(manager, self.id(), &self.config_path(manager.home()))
    }

    fn executable_names(&self) -> &'static [&'static str] {
        &["gemini"]
    }
}
