use super::helpers::{
    manager_with_fake_agent_names, manager_with_fake_agents, read_json, with_opencode_config_dir,
};
use copet_lib::{agents::AgentManager, config_store::ConfigStore, run_agent_auto_install_once};
use std::fs;

#[test]
fn list_exposes_each_platform_adapter() {
    let temp = tempfile::tempdir().unwrap();
    let manager = AgentManager::new(temp.path().join(".copet"), temp.path().join("home"));

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
            ("antigravity".to_string(), "Antigravity".to_string()),
            ("opencode".to_string(), "OpenCode".to_string()),
            ("gemini".to_string(), "Gemini".to_string()),
        ]
    );
}

#[test]
fn adapters_install_repair_and_uninstall_real_config_files() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join(".copet");
        let home = temp.path().join("home");
        let manager = manager_with_fake_agents(&root, &home);

        for adapter_id in ["codex", "claude-code", "antigravity", "gemini", "opencode"] {
            let installed = manager.install(adapter_id).unwrap();
            assert!(installed.adapter.installed, "{adapter_id} should install");
            assert!(
                root.join("adapters")
                    .join(format!("{adapter_id}.json"))
                    .exists(),
                "{adapter_id} should write adapter metadata"
            );
            assert!(
                root.join("hooks/copet-hook.sh").exists(),
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
            assert!(value.to_string().contains("copet-hook.sh"));
            assert!(value.to_string().contains("codex"));
            let config = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
            assert!(config.contains("hooks = true"));
        }
        "claude-code" => {
            let value = read_json(home.join(".claude/settings.json"));
            assert!(value.to_string().contains("copet-hook.sh"));
            assert!(value.to_string().contains("claude-code"));
        }
        "gemini" => {
            let value = read_json(home.join(".gemini/settings.json"));
            assert!(value.to_string().contains("copet-hook.sh"));
            assert!(value.to_string().contains("gemini"));
        }
        "antigravity" => {
            let value = read_json(home.join(".gemini/config/hooks.json"));
            assert!(value.to_string().contains("copet-hook.sh"));
            assert!(value.to_string().contains("antigravity"));
            assert!(value.to_string().contains("copet-antigravity"));
        }
        "opencode" => {
            let content = fs::read_to_string(opencode_config_dir.join("plugins/copet.js")).unwrap();
            assert!(content.contains("copet-managed-hook"));
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
        "antigravity" => {
            let content =
                fs::read_to_string(home.join(".gemini/config/hooks.json")).unwrap_or_default();
            assert!(!content.contains("copet-antigravity"));
        }
        "opencode" => assert!(!opencode_config_dir.join("plugins/copet.js").exists()),
        _ => unreachable!("unknown adapter"),
    }
}

fn assert_json_file_lacks_marker(path: impl AsRef<std::path::Path>) {
    let content = fs::read_to_string(path).unwrap_or_default();
    assert!(!content.contains("copet-hook.sh"));
}

#[test]
fn auto_install_detected_agents_installs_only_available_cli_adapters() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    let home = temp.path().join("home");
    let manager = manager_with_fake_agent_names(&root, &home, &["codex", "agy", "gemini"]);

    let summary = manager.auto_install_detected_agents();

    assert_eq!(
        summary.installed,
        vec![
            "codex".to_string(),
            "antigravity".to_string(),
            "gemini".to_string()
        ]
    );
    assert_eq!(
        summary.skipped,
        vec!["claude-code".to_string(), "opencode".to_string()]
    );
    assert!(summary.failed.is_empty());
    assert!(home.join(".codex/hooks.json").exists());
    assert!(home.join(".gemini/config/hooks.json").exists());
    assert!(home.join(".gemini/settings.json").exists());
    assert!(!home.join(".claude/settings.json").exists());
    assert!(!home.join(".config/opencode/plugins/copet.js").exists());
}

#[test]
fn auto_install_detected_agents_skips_already_installed_hooks_without_rewriting() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    let home = temp.path().join("home");
    let manager = manager_with_fake_agent_names(&root, &home, &["codex"]);

    manager.install("codex").unwrap();
    let hooks_path = home.join(".codex/hooks.json");
    let config_path = home.join(".codex/config.toml");
    let hooks_before = fs::read_to_string(&hooks_path).unwrap();
    let config_before = fs::read_to_string(&config_path).unwrap();

    let summary = manager.auto_install_detected_agents();

    assert!(summary.installed.is_empty());
    assert!(summary.failed.is_empty());
    assert!(summary.skipped.contains(&"codex".to_string()));
    assert_eq!(fs::read_to_string(&hooks_path).unwrap(), hooks_before);
    assert_eq!(fs::read_to_string(&config_path).unwrap(), config_before);
}

#[test]
fn auto_install_detected_agents_continues_after_adapter_failure() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    let home = temp.path().join("home");
    let claude_settings = home.join(".claude/settings.json");
    fs::create_dir_all(claude_settings.parent().unwrap()).unwrap();
    fs::write(&claude_settings, "{not valid json").unwrap();
    let manager = manager_with_fake_agent_names(&root, &home, &["claude", "codex", "agy"]);

    let summary = manager.auto_install_detected_agents();

    assert_eq!(
        summary.installed,
        vec!["codex".to_string(), "antigravity".to_string()]
    );
    assert_eq!(summary.failed.len(), 1);
    assert_eq!(summary.failed[0].adapter_id, "claude-code");
    assert!(summary.failed[0].error.contains("invalid JSON"));
    assert!(home.join(".codex/hooks.json").exists());
    assert!(home.join(".gemini/config/hooks.json").exists());
}

#[test]
fn run_agent_auto_install_once_sets_completion_marker_and_preserves_later_uninstall() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    let home = temp.path().join("home");
    let store = ConfigStore::new(&root);
    store.ensure_ready().unwrap();
    let manager = manager_with_fake_agent_names(&root, &home, &["codex"]);

    let first = run_agent_auto_install_once(&store, &manager).unwrap();

    assert_eq!(first.installed, vec!["codex".to_string()]);
    assert!(store.agent_auto_install_complete().unwrap());
    assert!(home.join(".codex/hooks.json").exists());

    manager.uninstall("codex").unwrap();
    let second = run_agent_auto_install_once(&store, &manager).unwrap();

    assert!(second.installed.is_empty());
    assert!(second.skipped.is_empty());
    assert!(second.failed.is_empty());
    let hooks = fs::read_to_string(home.join(".codex/hooks.json")).unwrap_or_default();
    assert!(!hooks.contains("copet-hook.sh"));
}

#[test]
fn run_agent_auto_install_once_marks_complete_even_when_adapter_fails() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join(".copet");
    let home = temp.path().join("home");
    let store = ConfigStore::new(&root);
    store.ensure_ready().unwrap();
    let claude_settings = home.join(".claude/settings.json");
    fs::create_dir_all(claude_settings.parent().unwrap()).unwrap();
    fs::write(&claude_settings, "{not valid json").unwrap();
    let manager = manager_with_fake_agent_names(&root, &home, &["claude"]);

    let summary = run_agent_auto_install_once(&store, &manager).unwrap();

    assert!(summary.installed.is_empty());
    assert_eq!(summary.failed.len(), 1);
    assert_eq!(summary.failed[0].adapter_id, "claude-code");
    assert!(store.agent_auto_install_complete().unwrap());
}
