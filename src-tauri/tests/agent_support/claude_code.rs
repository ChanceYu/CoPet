use super::helpers::manager_with_fake_agents;
use std::fs;

#[test]
fn claude_install_merges_hooks_and_uninstall_preserves_user_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let settings = home.join(".claude/settings.json");
    fs::create_dir_all(settings.parent().unwrap()).unwrap();
    fs::write(
        &settings,
        r#"{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"echo user"}]}]}}"#,
    )
    .unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("claude-code").unwrap();
    let installed = fs::read_to_string(&settings).unwrap();
    assert!(installed.contains("echo user"));
    assert!(installed.contains("pethover-hook.sh"));
    assert!(installed.contains("claude-code"));
    assert!(installed.contains("tool.before"));
    assert!(root.join("adapters/claude-code.json").exists());
    assert!(root.join("backups/claude-code").exists());

    manager.uninstall("claude-code").unwrap();
    let uninstalled = fs::read_to_string(&settings).unwrap();
    assert!(uninstalled.contains("echo user"));
    assert!(!uninstalled.contains("pethover-hook.sh"));
    assert!(!root.join("adapters/claude-code.json").exists());
}
