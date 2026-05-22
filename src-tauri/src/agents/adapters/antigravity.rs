use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use super::super::{
    hook_command, read_json_object_optional, read_json_object_required, write_json_atomic,
    AdapterError, AgentManager, CliAdapter, HELPER_NAME,
};

pub(super) static ADAPTER: AntigravityAdapter = AntigravityAdapter;

const HOOK_KEY: &str = "copet-antigravity";

struct AntigravityEvent {
    cli_event: &'static str,
    matcher: Option<&'static str>,
    kind: &'static str,
}

const EVENTS: &[AntigravityEvent] = &[
    AntigravityEvent {
        cli_event: "PreToolUse",
        matcher: Some("*"),
        kind: "tool.before",
    },
    AntigravityEvent {
        cli_event: "PostToolUse",
        matcher: Some("*"),
        kind: "tool.after",
    },
    AntigravityEvent {
        cli_event: "PostInvocation",
        matcher: None,
        kind: "user.prompt",
    },
    AntigravityEvent {
        cli_event: "Stop",
        matcher: None,
        kind: "session.stop",
    },
];

pub(super) struct AntigravityAdapter;

impl CliAdapter for AntigravityAdapter {
    fn id(&self) -> &'static str {
        "antigravity"
    }

    fn display_name(&self) -> &'static str {
        "Antigravity"
    }

    fn config_path(&self, home: &Path) -> PathBuf {
        home.join(".gemini").join("config").join("hooks.json")
    }

    fn is_installed(&self, config_path: &Path) -> Result<bool, AdapterError> {
        antigravity_config_has_copet_hooks(config_path, self.id())
    }

    fn install(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        let path = self.config_path(manager.home());
        manager.backup_file(self.id(), &path)?;
        let mut value = read_json_object_optional(&path)?.unwrap_or_else(|| json!({}));
        install_antigravity_hook_entry(&mut value, self.id(), &manager.helper_path());
        write_json_atomic(&path, &value)
    }

    fn uninstall(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        let path = self.config_path(manager.home());
        if !path.exists() {
            return Ok(());
        }

        manager.backup_file(self.id(), &path)?;
        let mut value = read_json_object_required(&path)?;
        if let Some(object) = value.as_object_mut() {
            object.remove(HOOK_KEY);
        }
        write_json_atomic(&path, &value)
    }

    fn executable_names(&self) -> &'static [&'static str] {
        &["agy"]
    }
}

fn install_antigravity_hook_entry(value: &mut Value, adapter_id: &str, helper_path: &Path) {
    let object = value.as_object_mut().expect("config must be JSON object");
    object.insert(
        HOOK_KEY.to_string(),
        antigravity_hook_entry(adapter_id, helper_path),
    );
}

fn antigravity_hook_entry(adapter_id: &str, helper_path: &Path) -> Value {
    let mut entry = serde_json::Map::new();

    for event in EVENTS {
        let command = hook_command(adapter_id, helper_path, event.kind);
        let handler = json!({
            "type": "command",
            "command": command,
            "timeout": 1
        });

        let value = if let Some(matcher) = event.matcher {
            json!([{
                "matcher": matcher,
                "hooks": [handler]
            }])
        } else {
            json!([handler])
        };

        entry.insert(event.cli_event.to_string(), value);
    }

    Value::Object(entry)
}

fn antigravity_config_has_copet_hooks(path: &Path, adapter_id: &str) -> Result<bool, AdapterError> {
    let Some(value) = read_json_object_optional(path)? else {
        return Ok(false);
    };
    let Some(entry) = value.get(HOOK_KEY).and_then(Value::as_object) else {
        return Ok(false);
    };

    Ok(EVENTS.iter().all(|event| {
        entry
            .get(event.cli_event)
            .and_then(Value::as_array)
            .is_some_and(|items| event_has_copet_command(items, adapter_id, event))
    }))
}

fn event_has_copet_command(items: &[Value], adapter_id: &str, event: &AntigravityEvent) -> bool {
    if event.matcher.is_some() {
        return items.iter().any(|group| {
            group.get("matcher").and_then(Value::as_str) == event.matcher
                && group
                    .get("hooks")
                    .and_then(Value::as_array)
                    .is_some_and(|handlers| {
                        handlers_have_copet_kind(handlers, adapter_id, event.kind)
                    })
        });
    }

    handlers_have_copet_kind(items, adapter_id, event.kind)
}

fn handlers_have_copet_kind(handlers: &[Value], adapter_id: &str, kind: &str) -> bool {
    handlers.iter().any(|handler| {
        handler
            .get("command")
            .and_then(Value::as_str)
            .is_some_and(|command| is_antigravity_copet_command(command, adapter_id, kind))
    })
}

fn is_antigravity_copet_command(command: &str, adapter_id: &str, kind: &str) -> bool {
    command.split(';').any(|segment| {
        segment
            .trim()
            .strip_prefix("then ")
            .is_some_and(|invocation| invocation_matches_copet_helper(invocation, adapter_id, kind))
    })
}

fn invocation_matches_copet_helper(invocation: &str, adapter_id: &str, kind: &str) -> bool {
    let Some(rest) = invocation.strip_prefix('\'') else {
        return false;
    };
    let Some(end_quote) = rest.find('\'') else {
        return false;
    };

    let helper_path = &rest[..end_quote];
    let helper_file_name = Path::new(helper_path)
        .file_name()
        .and_then(|name| name.to_str());
    if helper_file_name != Some(HELPER_NAME) {
        return false;
    }

    let args = rest[end_quote + 1..].trim();
    args == format!("{adapter_id} {kind}")
}
