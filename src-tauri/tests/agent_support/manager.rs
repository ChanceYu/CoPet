use super::helpers::{manager_with_fake_agents, read_json, with_opencode_config_dir};
use pethover_lib::agents::AgentManager;
use std::fs;

#[test]
fn list_exposes_each_platform_adapter() {
    let temp = tempfile::tempdir().unwrap();
    let manager = AgentManager::new(temp.path().join(".pethover"), temp.path().join("home"));

    let adapters = manager
        .list()
        .unwrap()
        .into_iter()
        .map(|adapter| (adapter.id, adapter.display_name))
        .collect::<Vec<_>>();

    assert_eq!(
        adapters,
        [
            ("claude-code".to_string(), "Claude Code".to_string()),
            ("codex".to_string(), "Codex".to_string()),
            ("opencode".to_string(), "OpenCode".to_string()),
            ("gemini".to_string(), "Gemini".to_string()),
        ]
    );
}

#[test]
fn adapters_install_repair_and_uninstall_real_config_files() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join(".pethover");
        let home = temp.path().join("home");
        let manager = manager_with_fake_agents(&root, &home);

        for adapter_id in ["codex", "claude-code", "gemini", "opencode"] {
            let installed = manager.install(adapter_id).unwrap();
            assert!(installed.adapter.installed, "{adapter_id} should install");
            assert!(
                root.join("adapters")
                    .join(format!("{adapter_id}.json"))
                    .exists(),
                "{adapter_id} should write adapter metadata"
            );
            assert!(
                root.join("hooks/pethover-hook.sh").exists(),
                "{adapter_id} should ensure the shared helper"
            );
            assert_adapter_config_contains_marker(adapter_id, &home, opencode_config_dir);

            let repaired = manager.repair(adapter_id).unwrap();
            assert!(repaired.adapter.installed, "{adapter_id} should repair");
            assert_adapter_config_contains_marker(adapter_id, &home, opencode_config_dir);

            let uninstalled = manager.uninstall(adapter_id).unwrap();
            assert!(
                !uninstalled.adapter.installed,
                "{adapter_id} should report uninstalled"
            );
            assert!(
                !root
                    .join("adapters")
                    .join(format!("{adapter_id}.json"))
                    .exists(),
                "{adapter_id} should remove adapter metadata"
            );
            assert_adapter_config_does_not_contain_marker(adapter_id, &home, opencode_config_dir);
        }
    });
}

fn assert_adapter_config_contains_marker(
    adapter_id: &str,
    home: &std::path::Path,
    opencode_config_dir: &std::path::Path,
) {
    match adapter_id {
        "codex" => {
            let value = read_json(home.join(".codex/hooks.json"));
            assert!(value.to_string().contains("pethover-hook.sh"));
            assert!(value.to_string().contains("codex"));
            let config = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
            assert!(config.contains("hooks = true"));
        }
        "claude-code" => {
            let value = read_json(home.join(".claude/settings.json"));
            assert!(value.to_string().contains("pethover-hook.sh"));
            assert!(value.to_string().contains("claude-code"));
        }
        "gemini" => {
            let value = read_json(home.join(".gemini/settings.json"));
            assert!(value.to_string().contains("pethover-hook.sh"));
            assert!(value.to_string().contains("gemini"));
        }
        "opencode" => {
            let content =
                fs::read_to_string(opencode_config_dir.join("plugins/pethover.js")).unwrap();
            assert!(content.contains("pethover-managed-hook"));
        }
        _ => unreachable!("unknown adapter"),
    }
}

fn assert_adapter_config_does_not_contain_marker(
    adapter_id: &str,
    home: &std::path::Path,
    opencode_config_dir: &std::path::Path,
) {
    match adapter_id {
        "codex" => assert_json_file_lacks_marker(home.join(".codex/hooks.json")),
        "claude-code" => assert_json_file_lacks_marker(home.join(".claude/settings.json")),
        "gemini" => assert_json_file_lacks_marker(home.join(".gemini/settings.json")),
        "opencode" => assert!(!opencode_config_dir.join("plugins/pethover.js").exists()),
        _ => unreachable!("unknown adapter"),
    }
}

fn assert_json_file_lacks_marker(path: impl AsRef<std::path::Path>) {
    let content = fs::read_to_string(path).unwrap_or_default();
    assert!(!content.contains("pethover-hook.sh"));
}
