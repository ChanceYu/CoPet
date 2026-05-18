use super::helpers::{manager_with_fake_agents, read_json};
use pethover_lib::agents::AgentManager;
use std::{
    fs,
    process::{Command, Stdio},
};

#[test]
fn gemini_install_writes_user_settings_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = manager_with_fake_agents(&root, &home);

    let result = manager.install("gemini").unwrap();
    let settings = fs::read_to_string(home.join(".gemini/settings.json")).unwrap();

    assert!(result.adapter.installed);
    assert!(settings.contains("\"BeforeAgent\""));
    assert!(settings.contains("\"BeforeTool\""));
    assert!(settings.contains("\"AfterTool\""));
    assert!(settings.contains("pethover-hook.sh"));
    assert!(settings.contains("gemini"));
    assert!(settings.contains("user.prompt"));
    assert!(settings.contains("tool.before"));
}

#[test]
fn gemini_hook_command_exits_successfully_when_helper_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("gemini").unwrap();
    fs::remove_file(root.join("hooks/pethover-hook.sh")).unwrap();

    let settings = read_json(home.join(".gemini/settings.json"));
    let command = settings["hooks"]["BeforeAgent"][0]["hooks"][0]["command"]
        .as_str()
        .unwrap();
    let output = Command::new("sh")
        .args(["-c", command])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap()
        .wait_with_output()
        .unwrap();

    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout), "{}\n");
}

#[test]
fn gemini_legacy_install_without_before_agent_is_not_current() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let settings = home.join(".gemini/settings.json");
    fs::create_dir_all(settings.parent().unwrap()).unwrap();
    fs::write(
        &settings,
        r#"{
  "hooks": {
    "BeforeTool": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "if [ -f '/tmp/pethover-hook.sh' ]; then '/tmp/pethover-hook.sh' gemini tool.before; else echo \"{}\"; fi"
      }]
    }],
    "AfterTool": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "if [ -f '/tmp/pethover-hook.sh' ]; then '/tmp/pethover-hook.sh' gemini tool.after; else echo \"{}\"; fi"
      }]
    }]
  }
}"#,
    )
    .unwrap();

    let manager = AgentManager::new(temp.path().join(".pethover"), home);

    let summary = manager.inspect("gemini").unwrap();

    assert!(!summary.installed);
}
