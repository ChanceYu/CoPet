use super::helpers::{
    manager_with_fake_agent_names, manager_with_fake_agents, read_json, with_cleared_copilot_home,
    with_copilot_home, with_empty_copilot_home,
};
use copet_lib::agents::AgentManager;
use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    process::{Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

const EVENTS: &[(&str, &str)] = &[
    ("userPromptSubmitted", "user.prompt"),
    ("preToolUse", "tool.before"),
    ("postToolUse", "tool.after"),
    ("permissionRequest", "permission.waiting"),
    ("agentStop", "session.stop"),
    ("errorOccurred", "session.error"),
];

#[test]
fn copilot_install_writes_user_hook_file() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let manager = manager_with_fake_agents(&root, &home);

        let result = manager.install("copilot").unwrap();
        let hooks = read_json(home.join(".copilot/hooks/copet.json"));

        assert!(result.adapter.installed);
        assert_eq!(result.adapter.id, "copilot");
        assert_eq!(result.adapter.display_name, "Copilot CLI");
        assert_eq!(hooks["version"], 1);
        for (event, kind) in EVENTS {
            let hook = single_event_hook(&hooks, event);
            assert_eq!(hook["type"], "command");
            assert_eq!(hook["timeoutSec"], 1);
            let bash = hook["bash"].as_str().unwrap();
            assert!(
                bash.contains("copet-hook.sh"),
                "{event} missing helper: {bash}"
            );
            assert!(
                bash.contains(&format!(" copilot {kind}")),
                "{event} missing mapped kind {kind}: {bash}"
            );
        }
    });
}

#[test]
fn copilot_home_overrides_default_user_hook_path() {
    with_copilot_home(|copilot_home| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let manager = manager_with_fake_agents(&root, &home);

        manager.install("copilot").unwrap();

        assert!(copilot_home.join("hooks/copet.json").exists());
        assert!(!home.join(".copilot/hooks/copet.json").exists());
    });
}

#[test]
fn empty_copilot_home_falls_back_to_default_user_hook_path() {
    with_empty_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let manager = manager_with_fake_agents(&root, &home);

        manager.install("copilot").unwrap();

        assert!(home.join(".copilot/hooks/copet.json").exists());
        assert!(!temp.path().join("hooks/copet.json").exists());
    });
}

#[test]
fn copilot_uninstall_removes_only_copet_hook_file_and_metadata() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let manager = manager_with_fake_agents(&root, &home);
        let hooks_dir = home.join(".copilot/hooks");
        let user_hook = hooks_dir.join("user-owned.json");

        manager.install("copilot").unwrap();
        fs::write(&user_hook, r#"{"version":1,"hooks":{}}"#).unwrap();
        assert!(root.join("adapters/copilot.json").exists());

        let result = manager.uninstall("copilot").unwrap();

        assert!(!result.adapter.installed);
        assert!(!hooks_dir.join("copet.json").exists());
        assert!(user_hook.exists());
        assert!(!root.join("adapters/copilot.json").exists());
    });
}

#[test]
fn copilot_agent_stop_bash_command_outputs_empty_json_when_helper_is_missing() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let manager = manager_with_fake_agents(&root, &home);

        manager.install("copilot").unwrap();
        fs::remove_file(root.join("hooks/copet-hook.sh")).unwrap();

        let hooks = read_json(home.join(".copilot/hooks/copet.json"));
        let command = single_event_hook(&hooks, "agentStop")["bash"]
            .as_str()
            .unwrap();
        let output = Command::new("bash")
            .args(["-c", command])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap()
            .wait_with_output()
            .unwrap();

        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout), "{}\n");
    });
}

#[test]
fn copilot_pre_tool_command_posts_camel_case_tool_payload() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let runtime = temp.path().join("runtime");
        let manager = manager_with_fake_agents(&root, &home);

        manager.install("copilot").unwrap();

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
            let deadline = Instant::now() + Duration::from_secs(10);
            loop {
                match listener.accept() {
                    Ok((mut stream, _addr)) => {
                        let mut buffer = [0_u8; 4096];
                        let size = stream.read(&mut buffer).unwrap();
                        let request = String::from_utf8_lossy(&buffer[..size]).to_string();
                        let _ = stream
                            .write_all(b"HTTP/1.1 202 Accepted\r\nContent-Length: 2\r\n\r\n{}");
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

        let hooks = read_json(home.join(".copilot/hooks/copet.json"));
        let command = single_event_hook(&hooks, "preToolUse")["bash"]
            .as_str()
            .unwrap();
        let mut child = Command::new("bash")
            .args(["-c", command])
            .env("COPET_RUNTIME_DIR", &runtime)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();

        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(
                br#"{"sessionId":"s1","timestamp":1,"cwd":"/repo","toolName":"bash","toolArgs":{"command":"pnpm test:rust"}}"#,
            )
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout), "{}\n");

        let request = receiver
            .recv_timeout(Duration::from_secs(11))
            .unwrap()
            .expect("runtime server should receive the Copilot hook event");
        assert!(request.contains("POST /v1/events"));
        assert!(request.contains("Authorization: Bearer secret"));
        assert!(request.contains(r#""agent":"copilot""#));
        assert!(request.contains(r#""kind":"tool.before""#));
        assert!(request.contains(r#""tool":"bash""#));
        assert!(request.contains(r#""toolInput":{"command":"pnpm test:rust"}"#));
    });
}

#[test]
fn forged_copilot_helper_mentions_are_not_current_install() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let hooks = home.join(".copilot/hooks/copet.json");
        fs::create_dir_all(hooks.parent().unwrap()).unwrap();

        let mut events = serde_json::Map::new();
        for (event, kind) in EVENTS {
            events.insert(
                event.to_string(),
                serde_json::json!([{
                    "type": "command",
                    "bash": format!("if [ -f '/tmp/not-helper' ]; then echo copet-hook.sh copilot {kind}; else echo \"{{}}\"; fi"),
                    "timeoutSec": 1
                }]),
            );
        }
        fs::write(
            &hooks,
            serde_json::to_vec_pretty(&serde_json::json!({
                "version": 1,
                "hooks": events
            }))
            .unwrap(),
        )
        .unwrap();
        let manager = AgentManager::new(temp.path().join(".copet"), home);

        let summary = manager.inspect("copilot").unwrap();

        assert!(!summary.installed);
    });
}

#[test]
fn commented_copilot_helper_mentions_are_not_current_install() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let hooks = home.join(".copilot/hooks/copet.json");
        fs::create_dir_all(hooks.parent().unwrap()).unwrap();

        let mut events = serde_json::Map::new();
        for (event, kind) in EVENTS {
            events.insert(
                event.to_string(),
                serde_json::json!([{
                    "type": "command",
                    "bash": format!("if [ -f '/tmp/not-helper' ]; then '/tmp/not-helper' # copet-hook.sh copilot {kind}; else echo \"{{}}\"; fi"),
                    "timeoutSec": 1
                }]),
            );
        }
        fs::write(
            &hooks,
            serde_json::to_vec_pretty(&serde_json::json!({
                "version": 1,
                "hooks": events
            }))
            .unwrap(),
        )
        .unwrap();
        let manager = AgentManager::new(temp.path().join(".copet"), home);

        let summary = manager.inspect("copilot").unwrap();

        assert!(!summary.installed);
    });
}

#[test]
fn mismatched_guard_and_invocation_paths_are_not_current_install() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let hooks = home.join(".copilot/hooks/copet.json");
        fs::create_dir_all(hooks.parent().unwrap()).unwrap();

        let mut events = serde_json::Map::new();
        for (event, kind) in EVENTS {
            events.insert(
                event.to_string(),
                serde_json::json!([{
                    "type": "command",
                    "bash": format!("if [ -f '/tmp/not-helper' ]; then '/tmp/copet-hook.sh' copilot {kind}; else echo \"{{}}\"; fi"),
                    "timeoutSec": 1
                }]),
            );
        }
        fs::write(
            &hooks,
            serde_json::to_vec_pretty(&serde_json::json!({
                "version": 1,
                "hooks": events
            }))
            .unwrap(),
        )
        .unwrap();
        let manager = AgentManager::new(temp.path().join(".copet"), home);

        let summary = manager.inspect("copilot").unwrap();

        assert!(!summary.installed);
    });
}

#[test]
fn copilot_install_detection_tolerates_semicolon_in_helper_path() {
    assert_copilot_install_detection_for_root_dir_name("co;pet");
}

#[test]
fn copilot_install_detection_tolerates_then_delimiter_in_helper_path() {
    assert_copilot_install_detection_for_root_dir_name("co; then pet");
}

#[test]
fn copilot_install_detection_tolerates_else_delimiter_in_helper_path() {
    assert_copilot_install_detection_for_root_dir_name("co; else pet");
}

#[test]
fn copilot_install_detection_tolerates_single_quote_in_helper_path() {
    assert_copilot_install_detection_for_root_dir_name("co'pet");
}

fn assert_copilot_install_detection_for_root_dir_name(root_dir_name: &str) {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(root_dir_name);
        let manager = manager_with_fake_agents(&root, &home);

        manager.install("copilot").unwrap();
        let summary = manager.inspect("copilot").unwrap();

        assert!(summary.installed);
    });
}

#[test]
fn copilot_install_rejects_invalid_existing_hook_file_without_overwriting() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let hooks = home.join(".copilot/hooks/copet.json");
        fs::create_dir_all(hooks.parent().unwrap()).unwrap();
        fs::write(&hooks, "{not valid json").unwrap();
        let manager = manager_with_fake_agents(&root, &home);

        let error = manager.install("copilot").unwrap_err().to_string();

        assert!(error.contains("invalid JSON"));
        assert_eq!(fs::read_to_string(&hooks).unwrap(), "{not valid json");
        assert!(!root.join("adapters/copilot.json").exists());
    });
}

#[test]
fn copilot_install_rejects_missing_cli_without_writing_hooks() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let manager =
            AgentManager::new_with_exact_executable_search_paths(&root, &home, Vec::new());

        let error = manager.install("copilot").unwrap_err().to_string();

        assert!(error.contains("Copilot CLI"));
        assert!(error.contains("not installed"));
        assert!(!home.join(".copilot/hooks/copet.json").exists());
        assert!(!root.join("adapters/copilot.json").exists());
    });
}

#[test]
fn copilot_install_finds_fake_copilot_executable() {
    with_cleared_copilot_home(|| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".copet");
        let manager = manager_with_fake_agent_names(&root, &home, &["copilot"]);

        let result = manager.install("copilot").unwrap();

        assert!(result.adapter.installed);
        assert!(home.join(".copilot/hooks/copet.json").exists());
    });
}

fn single_event_hook<'a>(hooks: &'a Value, event: &str) -> &'a Value {
    let entries = hooks["hooks"][event].as_array().unwrap();
    assert_eq!(entries.len(), 1, "{event} should have one CoPet hook");
    &entries[0]
}
