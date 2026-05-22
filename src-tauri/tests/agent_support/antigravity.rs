use super::helpers::{manager_with_fake_agent_names, manager_with_fake_agents, read_json};
use copet_lib::agents::AgentManager;
use std::{
    fs,
    process::{Command, Stdio},
};

#[test]
fn antigravity_install_writes_global_hooks_entry() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    let result = manager.install("antigravity").unwrap();
    let hooks = read_json(home.join(".gemini/config/hooks.json"));
    let copet = &hooks["copet-antigravity"];

    assert!(result.adapter.installed);
    assert_eq!(result.adapter.id, "antigravity");
    assert_eq!(result.adapter.display_name, "Antigravity");
    assert_eq!(
        result.adapter.config_path,
        home.join(".gemini/config/hooks.json").display().to_string()
    );
    assert!(copet["PreToolUse"][0]["matcher"].as_str().unwrap() == "*");
    assert!(copet["PostToolUse"][0]["matcher"].as_str().unwrap() == "*");
    assert!(copet["PreToolUse"][0]["hooks"][0]["command"]
        .as_str()
        .unwrap()
        .contains("antigravity tool.before"));
    assert!(copet["PostToolUse"][0]["hooks"][0]["command"]
        .as_str()
        .unwrap()
        .contains("antigravity tool.after"));
    assert!(copet["PostInvocation"][0]["command"]
        .as_str()
        .unwrap()
        .contains("antigravity user.prompt"));
    assert!(copet["Stop"][0]["command"]
        .as_str()
        .unwrap()
        .contains("antigravity session.stop"));
}

#[test]
fn antigravity_install_preserves_user_owned_global_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let hooks_path = home.join(".gemini/config/hooks.json");
    fs::create_dir_all(hooks_path.parent().unwrap()).unwrap();
    fs::write(
        &hooks_path,
        r#"{
  "user-linter": {
    "PostToolUse": [{
      "matcher": "run_command",
      "hooks": [{
        "type": "command",
        "command": "./scripts/lint.sh",
        "timeout": 10
      }]
    }]
  }
}"#,
    )
    .unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("antigravity").unwrap();

    let hooks = read_json(&hooks_path);
    assert!(hooks.get("copet-antigravity").is_some());
    assert_eq!(
        hooks["user-linter"]["PostToolUse"][0]["hooks"][0]["command"],
        "./scripts/lint.sh"
    );
}

#[test]
fn antigravity_uninstall_removes_only_copet_entry() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);
    manager.install("antigravity").unwrap();
    let hooks_path = home.join(".gemini/config/hooks.json");
    let mut hooks = read_json(&hooks_path);
    hooks.as_object_mut().unwrap().insert(
        "user-reminder".to_string(),
        serde_json::json!({
            "PreInvocation": [{
                "type": "command",
                "command": "./scripts/reminder.sh"
            }]
        }),
    );
    fs::write(&hooks_path, serde_json::to_vec_pretty(&hooks).unwrap()).unwrap();

    let result = manager.uninstall("antigravity").unwrap();

    assert!(!result.adapter.installed);
    let hooks = read_json(&hooks_path);
    assert!(hooks.get("copet-antigravity").is_none());
    assert_eq!(
        hooks["user-reminder"]["PreInvocation"][0]["command"],
        "./scripts/reminder.sh"
    );
}

#[test]
fn antigravity_partial_entry_is_not_current_install() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let hooks_path = home.join(".gemini/config/hooks.json");
    fs::create_dir_all(hooks_path.parent().unwrap()).unwrap();
    fs::write(
        &hooks_path,
        r#"{
  "copet-antigravity": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }]
  }
}"#,
    )
    .unwrap();
    let manager = AgentManager::new(temp.path().join(".copet"), home);

    let summary = manager.inspect("antigravity").unwrap();

    assert!(!summary.installed);
}

#[test]
fn antigravity_marker_from_unrelated_adapter_is_not_current_install() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let hooks_path = home.join(".gemini/config/hooks.json");
    fs::create_dir_all(hooks_path.parent().unwrap()).unwrap();
    fs::write(
        &hooks_path,
        r##"{
  "copet-antigravity": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' codex tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' codex tool.after; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostInvocation": [{
      "type": "command",
      "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' codex user.prompt; else echo \"{}\"; fi",
      "timeout": 1
    }],
    "Stop": [{
      "type": "command",
      "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' codex session.stop; else echo \"{}\"; fi",
      "timeout": 1
    }]
  }
}"##,
    )
    .unwrap();
    let manager = AgentManager::new(temp.path().join(".copet"), home);

    let summary = manager.inspect("antigravity").unwrap();

    assert!(!summary.installed);
}

#[test]
fn antigravity_marker_with_stale_kind_is_not_current_install() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let hooks_path = home.join(".gemini/config/hooks.json");
    fs::create_dir_all(hooks_path.parent().unwrap()).unwrap();
    fs::write(
        &hooks_path,
        r##"{
  "copet-antigravity": {
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostInvocation": [{
      "type": "command",
      "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity user.prompt; else echo \"{}\"; fi",
      "timeout": 1
    }],
    "Stop": [{
      "type": "command",
      "command": "# copet-managed-hook\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity session.stop; else echo \"{}\"; fi",
      "timeout": 1
    }]
  }
}"##,
    )
    .unwrap();
    let manager = AgentManager::new(temp.path().join(".copet"), home);

    let summary = manager.inspect("antigravity").unwrap();

    assert!(!summary.installed);
}

#[test]
fn antigravity_hook_command_exits_successfully_when_helper_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("antigravity").unwrap();
    fs::remove_file(root.join("hooks/copet-hook.sh")).unwrap();

    let hooks = read_json(home.join(".gemini/config/hooks.json"));
    let command = hooks["copet-antigravity"]["Stop"][0]["command"]
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
fn antigravity_install_requires_antigravity_executable() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agent_names(&root, &home, &["codex"]);

    let error = manager.install("antigravity").unwrap_err();

    assert_eq!(
        error.to_string(),
        "Antigravity is not installed or not available on PATH"
    );
}
