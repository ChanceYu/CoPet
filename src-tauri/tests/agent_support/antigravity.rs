use super::helpers::{manager_with_fake_agent_names, manager_with_fake_agents, read_json};
use copet_lib::agents::AgentManager;
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    process::{Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};

static PROXY_ENV_LOCK: Mutex<()> = Mutex::new(());

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
fn antigravity_marker_comment_and_prefix_kind_are_not_current_install() {
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
        "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "# copet-managed-hook antigravity tool.after\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.afterward; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostInvocation": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity user.prompt; else echo \"{}\"; fi",
      "timeout": 1
    }],
    "Stop": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity session.stop; else echo \"{}\"; fi",
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
fn antigravity_helper_comment_does_not_mask_prefix_kind_invocation() {
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
        "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "# /tmp/copet-hook.sh antigravity tool.after;\nif [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.afterward; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostInvocation": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity user.prompt; else echo \"{}\"; fi",
      "timeout": 1
    }],
    "Stop": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity session.stop; else echo \"{}\"; fi",
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
fn antigravity_helper_comment_does_not_mask_other_invocation() {
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
        "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "if [ -f '/tmp/copet-hook.sh' ]; then # /tmp/copet-hook.sh\n'/tmp/other.sh' antigravity tool.after; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostInvocation": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity user.prompt; else echo \"{}\"; fi",
      "timeout": 1
    }],
    "Stop": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity session.stop; else echo \"{}\"; fi",
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
fn antigravity_helper_name_must_match_exactly() {
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
        "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity tool.before; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/not-copet-hook.sh' antigravity tool.after; else echo \"{}\"; fi",
        "timeout": 1
      }]
    }],
    "PostInvocation": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity user.prompt; else echo \"{}\"; fi",
      "timeout": 1
    }],
    "Stop": [{
      "type": "command",
      "command": "if [ -f '/tmp/copet-hook.sh' ]; then '/tmp/copet-hook.sh' antigravity session.stop; else echo \"{}\"; fi",
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
fn antigravity_stop_command_allows_stop_when_helper_is_missing() {
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
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "{\"decision\":\"allow\"}\n"
    );
}

#[test]
fn antigravity_helper_extracts_tool_call_details_from_official_payload() {
    let _guard = PROXY_ENV_LOCK.lock().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let runtime = temp.path().join("runtime");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("antigravity").unwrap();

    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!(
        "http://127.0.0.1:{}/v1/events",
        listener.local_addr().unwrap().port()
    );
    fs::create_dir_all(&runtime).unwrap();
    fs::write(runtime.join("event-endpoint"), &endpoint).unwrap();
    fs::write(runtime.join("event-token"), "secret").unwrap();

    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match listener.accept() {
                Ok((mut stream, _addr)) => {
                    let mut buffer = [0_u8; 4096];
                    let size = stream.read(&mut buffer).unwrap();
                    let request = String::from_utf8_lossy(&buffer[..size]).to_string();
                    let _ =
                        stream.write_all(b"HTTP/1.1 202 Accepted\r\nContent-Length: 2\r\n\r\n{}");
                    sender.send(Some(request)).unwrap();
                    return;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        sender.send(None).unwrap();
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => {
                    sender.send(None).unwrap();
                    return;
                }
            }
        }
    });

    let helper = root.join("hooks/copet-hook.sh");
    let mut child = Command::new(helper)
        .args(["antigravity", "tool.before"])
        .env("COPET_RUNTIME_DIR", &runtime)
        .env("HTTP_PROXY", "http://127.0.0.1:9")
        .env("HTTPS_PROXY", "http://127.0.0.1:9")
        .env("http_proxy", "http://127.0.0.1:9")
        .env("https_proxy", "http://127.0.0.1:9")
        .env_remove("NO_PROXY")
        .env_remove("no_proxy")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(
            br#"{
  "toolCall": {
    "args": {
      "CommandLine": "pnpm test:frontend src/tests/settings-workflows.spec.ts",
      "Cwd": "/repo"
    },
    "name": "run_command"
  },
  "stepIdx": 19,
  "conversationId": "ec33ebf9-0cba-4100-8142-c61503f6c587",
  "workspacePaths": ["/repo"]
}"#,
        )
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "{\"decision\":\"allow\"}\n"
    );

    let request = receiver
        .recv_timeout(Duration::from_secs(3))
        .unwrap()
        .expect("runtime server should receive the Antigravity hook event");
    assert!(request.contains("POST /v1/events"));
    assert!(request.contains("Authorization: Bearer secret"));
    assert!(request.contains(r#""agent":"antigravity""#));
    assert!(request.contains(r#""kind":"tool.before""#));
    assert!(request.contains(r#""tool":"run_command""#));
    assert!(request.contains(
        r#""toolInput":{"command":"pnpm test:frontend src/tests/settings-workflows.spec.ts"}"#
    ));
}

#[test]
fn antigravity_helper_omits_empty_tool_name_from_payload() {
    let _guard = PROXY_ENV_LOCK.lock().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let runtime = temp.path().join("runtime");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("antigravity").unwrap();

    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!(
        "http://127.0.0.1:{}/v1/events",
        listener.local_addr().unwrap().port()
    );
    fs::create_dir_all(&runtime).unwrap();
    fs::write(runtime.join("event-endpoint"), &endpoint).unwrap();
    fs::write(runtime.join("event-token"), "secret").unwrap();

    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match listener.accept() {
                Ok((mut stream, _addr)) => {
                    let mut buffer = [0_u8; 4096];
                    let size = stream.read(&mut buffer).unwrap();
                    let request = String::from_utf8_lossy(&buffer[..size]).to_string();
                    let _ =
                        stream.write_all(b"HTTP/1.1 202 Accepted\r\nContent-Length: 2\r\n\r\n{}");
                    sender.send(Some(request)).unwrap();
                    return;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        sender.send(None).unwrap();
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(10));
                }
                Err(_) => {
                    sender.send(None).unwrap();
                    return;
                }
            }
        }
    });

    let helper = root.join("hooks/copet-hook.sh");
    let mut child = Command::new(helper)
        .args(["antigravity", "tool.after"])
        .env("COPET_RUNTIME_DIR", &runtime)
        .env("HTTP_PROXY", "http://127.0.0.1:9")
        .env("HTTPS_PROXY", "http://127.0.0.1:9")
        .env("http_proxy", "http://127.0.0.1:9")
        .env("https_proxy", "http://127.0.0.1:9")
        .env_remove("NO_PROXY")
        .env_remove("no_proxy")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();

    child.stdin.as_mut().unwrap().write_all(b"{}").unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout), "{}\n");

    let request = receiver
        .recv_timeout(Duration::from_secs(3))
        .unwrap()
        .expect("runtime server should receive the Antigravity hook event");
    assert!(request.contains(r#""agent":"antigravity""#));
    assert!(request.contains(r#""kind":"tool.after""#));
    assert!(!request.contains(r#""tool":"""#));
}

#[test]
fn antigravity_pre_tool_command_allows_tool_when_helper_is_missing() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("antigravity").unwrap();
    fs::remove_file(root.join("hooks/copet-hook.sh")).unwrap();

    let hooks = read_json(home.join(".gemini/config/hooks.json"));
    let command = hooks["copet-antigravity"]["PreToolUse"][0]["hooks"][0]["command"]
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
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "{\"decision\":\"allow\"}\n"
    );
}

#[test]
fn antigravity_helper_allows_stop_when_runtime_is_unavailable() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("antigravity").unwrap();

    let helper = root.join("hooks/copet-hook.sh");
    let output = Command::new(helper)
        .args(["antigravity", "session.stop"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap()
        .wait_with_output()
        .unwrap();

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout),
        "{\"decision\":\"allow\"}\n"
    );
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
