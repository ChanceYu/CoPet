use pethover_lib::agents::AgentManager;
use serde_json::Value;
use std::{
    env,
    ffi::OsString,
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{mpsc, Mutex},
    time::{Duration, Instant},
};

static OPENCODE_ENV_LOCK: Mutex<()> = Mutex::new(());
static PROXY_ENV_LOCK: Mutex<()> = Mutex::new(());

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

#[test]
fn codex_install_writes_hooks_json_and_enables_hooks_feature() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = manager_with_fake_agents(&root, &home);

    let result = manager.install("codex").unwrap();
    let hooks = fs::read_to_string(home.join(".codex/hooks.json")).unwrap();
    let config = fs::read_to_string(home.join(".codex/config.toml")).unwrap();

    assert!(result.adapter.installed);
    assert!(hooks.contains("\"PreToolUse\""));
    assert!(hooks.contains("pethover-hook.sh"));
    assert!(hooks.contains("codex"));
    assert!(hooks.contains("tool.before"));
    assert!(config.contains("[features]"));
    assert!(config.contains("hooks = true"));
}

#[test]
fn codex_install_omits_notification_event_unknown_to_codex() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();
    let hooks = fs::read_to_string(home.join(".codex/hooks.json")).unwrap();

    assert!(
        !hooks.contains("\"Notification\""),
        "Codex does not recognize Notification; hooks.json must omit it: {hooks}"
    );
    for event in [
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PermissionRequest",
        "Stop",
    ] {
        assert!(
            hooks.contains(&format!("\"{event}\"")),
            "missing expected event {event}: {hooks}"
        );
    }
}

#[test]
fn codex_helper_bypasses_loopback_proxy_when_posting_runtime_events() {
    let _guard = PROXY_ENV_LOCK.lock().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let runtime = temp.path().join("runtime");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

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

    let helper = root.join("hooks/pethover-hook.sh");
    let mut child = Command::new(helper)
        .args(["codex", "tool.before"])
        .env("PETHOVER_RUNTIME_DIR", &runtime)
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
        .write_all(br#"{"tool_name":"Read","tool_input":{"file_path":"/repo/src/App.tsx"}}"#)
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(String::from_utf8_lossy(&output.stdout), "{}\n");

    let request = receiver
        .recv_timeout(Duration::from_secs(3))
        .unwrap()
        .expect("runtime server should receive the Codex hook event despite proxy env");
    assert!(request.contains("POST /v1/events"));
    assert!(request.contains("Authorization: Bearer secret"));
    assert!(request.contains(r#""agent":"codex""#));
    assert!(request.contains(r#""kind":"tool.before""#));
}

#[test]
fn codex_helper_outputs_schema_neutral_json_when_runtime_is_unavailable() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let runtime = temp.path().join("missing-runtime");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

    let output = Command::new(root.join("hooks/pethover-hook.sh"))
        .args(["codex", "session.stop"])
        .env("PETHOVER_RUNTIME_DIR", &runtime)
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
fn codex_install_preserves_existing_config_while_enabling_hooks_feature() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let config = home.join(".codex/config.toml");
    fs::create_dir_all(config.parent().unwrap()).unwrap();
    fs::write(
        &config,
        r#"
model = "gpt-5.1-codex"

[features]
codex_hooks = false
experimental = true

[profiles.default]
approval_policy = "on-request"
"#,
    )
    .unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

    let config = fs::read_to_string(config).unwrap();
    assert!(config.contains(r#"model = "gpt-5.1-codex""#));
    assert!(config.contains("hooks = true"));
    assert!(config.contains("codex_hooks = true"));
    assert!(!config.contains("codex_hooks = false"));
    assert!(config.contains("experimental = true"));
    assert!(config.contains("[profiles.default]"));
}

#[test]
fn codex_install_places_pethover_hooks_before_existing_matching_groups() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let hooks = home.join(".codex/hooks.json");
    fs::create_dir_all(hooks.parent().unwrap()).unwrap();
    fs::write(
        &hooks,
        r#"{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"echo existing"}]}]}}"#,
    )
    .unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

    let value = read_json(&hooks);
    let pre_tool_use = value["hooks"]["PreToolUse"].as_array().unwrap();
    let first_command = pre_tool_use[0]["hooks"][0]["command"].as_str().unwrap();
    let second_command = pre_tool_use[1]["hooks"][0]["command"].as_str().unwrap();
    assert!(first_command.contains("pethover-hook.sh"));
    assert!(first_command.contains(" codex tool.before"));
    assert_eq!(second_command, "echo existing");
}

#[test]
fn opencode_install_and_uninstall_manage_only_pethover_plugin_file() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let manager = manager_with_fake_agents(&root, &home);
        let plugin = opencode_config_dir.join("plugins/pethover.js");
        let config = opencode_config_dir.join("opencode.json");

        manager.install("opencode").unwrap();
        assert!(fs::read_to_string(&plugin)
            .unwrap()
            .contains("pethover-managed-hook"));
        assert!(read_json(&config)["plugin"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry.as_str() == Some("./plugins/pethover.js")));

        manager.uninstall("opencode").unwrap();
        assert!(!plugin.exists());
        assert!(!read_json(&config)["plugin"]
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry.as_str() == Some("./plugins/pethover.js")));
    });
}

#[test]
fn opencode_plugin_posts_runtime_events_without_proxy_sensitive_fetch() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let manager = manager_with_fake_agents(&root, &home);

        manager.install("opencode").unwrap();
        let plugin = fs::read_to_string(opencode_config_dir.join("plugins/pethover.js")).unwrap();

        assert!(plugin.contains("node:http"));
        assert!(plugin.contains("http.request"));
        assert!(plugin.contains("event: async"));
        assert!(plugin.contains("event.event.type"));
        assert!(plugin.contains("\"chat.message\""));
        assert!(plugin.contains("tui.prompt.append"));
        assert!(plugin.contains("session.idle"));
        assert!(!plugin.contains("fetch(endpoint"));
    });
}

#[test]
fn opencode_install_preserves_existing_config_plugins() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let manager = manager_with_fake_agents(&root, &home);
        let config = opencode_config_dir.join("opencode.json");
        fs::create_dir_all(config.parent().unwrap()).unwrap();
        fs::write(
            &config,
            r#"{"$schema":"https://opencode.ai/config.json","plugin":["@scope/existing"]}"#,
        )
        .unwrap();

        manager.install("opencode").unwrap();
        let installed = read_json(&config);
        let plugins = installed["plugin"].as_array().unwrap();

        assert!(plugins
            .iter()
            .any(|entry| entry.as_str() == Some("@scope/existing")));
        assert!(plugins
            .iter()
            .any(|entry| entry.as_str() == Some("./plugins/pethover.js")));
    });
}

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

#[test]
fn uninstall_removes_hooks_and_adapter_metadata() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();
    assert!(root.join("adapters/codex.json").exists());

    let result = manager.uninstall("codex").unwrap();
    let hooks = fs::read_to_string(home.join(".codex/hooks.json")).unwrap();

    assert!(!result.adapter.installed);
    assert!(!hooks.contains("pethover-hook.sh"));
    assert!(!root.join("adapters/codex.json").exists());
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

#[test]
fn install_rejects_missing_local_agent_cli_without_writing_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = AgentManager::new_with_executable_search_paths(&root, &home, Vec::new());

    let error = manager.install("codex").unwrap_err().to_string();

    assert!(error.contains("Codex"));
    assert!(error.contains("not installed"));
    assert!(!home.join(".codex/hooks.json").exists());
    assert!(!root.join("adapters/codex.json").exists());
}

#[test]
fn install_finds_agent_cli_in_common_user_bin_paths_when_process_path_is_sparse() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let local_bin = home.join(".local/bin");
    fs::create_dir_all(&local_bin).unwrap();
    let codex = local_bin.join("codex");
    fs::write(&codex, "#!/bin/sh\nexit 0\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&codex).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&codex, permissions).unwrap();
    }
    let manager = AgentManager::new_with_executable_search_paths(&root, &home, Vec::new());

    let result = manager.install("codex").unwrap();

    assert!(result.adapter.installed);
    assert!(home.join(".codex/hooks.json").exists());
}

#[test]
fn install_finds_codex_in_macos_pnpm_global_bin_when_process_path_is_sparse() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let pnpm_bin = home.join("Library/pnpm");
    fs::create_dir_all(&pnpm_bin).unwrap();
    let codex = pnpm_bin.join("codex");
    fs::write(&codex, "#!/bin/sh\nexit 0\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(&codex).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&codex, permissions).unwrap();
    }
    let manager = AgentManager::new_with_executable_search_paths(&root, &home, Vec::new());

    let result = manager.install("codex").unwrap();

    assert!(result.adapter.installed);
    assert!(home.join(".codex/hooks.json").exists());
}

#[test]
fn install_finds_opencode_cli_in_official_user_bin_when_process_path_is_sparse() {
    with_opencode_config_dir(|opencode_config_dir| {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let root = temp.path().join(".pethover");
        let opencode_bin = home.join(".opencode/bin");
        fs::create_dir_all(&opencode_bin).unwrap();
        let opencode = opencode_bin.join("opencode");
        fs::write(&opencode, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&opencode).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&opencode, permissions).unwrap();
        }
        let manager = AgentManager::new_with_executable_search_paths(&root, &home, Vec::new());

        let result = manager.install("opencode").unwrap();

        assert!(result.adapter.installed);
        assert!(opencode_config_dir.join("plugins/pethover.js").exists());
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

fn read_json(path: impl AsRef<std::path::Path>) -> Value {
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}

fn manager_with_fake_agents(root: impl Into<PathBuf>, home: impl Into<PathBuf>) -> AgentManager {
    let temp = tempfile::tempdir().unwrap();
    let bin = temp.keep().join("bin");
    fs::create_dir_all(&bin).unwrap();
    for executable in ["claude", "codex", "gemini", "opencode"] {
        let path = bin.join(executable);
        fs::write(&path, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&path).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&path, permissions).unwrap();
        }
    }
    AgentManager::new_with_executable_search_paths(root, home, vec![bin])
}

#[test]
fn codex_install_preserves_user_comments_and_unrelated_keys_in_config_toml() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let config = home.join(".codex/config.toml");
    fs::create_dir_all(config.parent().unwrap()).unwrap();
    fs::write(
        &config,
        "# user comment line one\n\
         model = \"gpt-5.1-codex\"  # inline comment\n\
         \n\
         [profiles.default]\n\
         approval_policy = \"on-request\"\n",
    )
    .unwrap();
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();
    let after = fs::read_to_string(&config).unwrap();

    assert!(
        after.contains("# user comment line one"),
        "leading comment lost: {after}"
    );
    assert!(
        after.contains("# inline comment"),
        "inline comment lost: {after}"
    );
    assert!(
        after.contains("model = \"gpt-5.1-codex\""),
        "model line lost: {after}"
    );
    assert!(
        after.contains("[profiles.default]"),
        "profile table lost: {after}"
    );
    assert!(
        after.contains("approval_policy = \"on-request\""),
        "profile field lost: {after}"
    );
    assert!(
        after.contains("hooks = true"),
        "[features] hooks=true not written: {after}"
    );
}

#[test]
fn codex_install_writes_trusted_hashes_for_all_pethover_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

    let config = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
    let hooks_path = home.join(".codex/hooks.json");
    let hooks_abs = hooks_path.display().to_string();
    let sha_re = regex_lite_match_sha256;

    for event_label in [
        "user_prompt_submit",
        "pre_tool_use",
        "post_tool_use",
        "permission_request",
        "stop",
    ] {
        let header = format!("[hooks.state.\"{hooks_abs}:{event_label}:0:0\"]");
        assert!(
            config.contains(&header),
            "missing trust entry header `{header}` in:\n{config}",
        );
        let trusted_hash = config
            .lines()
            .skip_while(|line| !line.contains(&header))
            .find(|line| line.trim_start().starts_with("trusted_hash"))
            .unwrap_or_else(|| panic!("trusted_hash not found under {header} in:\n{config}"));
        assert!(
            sha_re(trusted_hash),
            "trusted_hash line not shaped like `trusted_hash = \"sha256:<64 hex>\"`: {trusted_hash}",
        );
    }
}

fn regex_lite_match_sha256(line: &str) -> bool {
    // Match: trusted_hash = "sha256:<64 lowercase hex>"
    let Some(rest) = line.trim_start().strip_prefix("trusted_hash") else {
        return false;
    };
    let Some(rest) = rest.trim_start().strip_prefix('=') else {
        return false;
    };
    let trimmed = rest.trim().trim_matches('"');
    let Some(hex) = trimmed.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64 && hex.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
}

fn with_opencode_config_dir(test: impl FnOnce(&std::path::Path)) {
    let _guard = OPENCODE_ENV_LOCK.lock().unwrap();
    let temp = tempfile::tempdir().unwrap();
    let opencode_config_dir = temp.path().join("opencode-config");
    let previous = env::var_os("OPENCODE_CONFIG_DIR");

    env::set_var("OPENCODE_CONFIG_DIR", &opencode_config_dir);
    test(&opencode_config_dir);
    restore_env_var("OPENCODE_CONFIG_DIR", previous);
}

fn restore_env_var(key: &str, value: Option<OsString>) {
    if let Some(value) = value {
        env::set_var(key, value);
    } else {
        env::remove_var(key);
    }
}

#[test]
fn codex_install_idempotent_trusted_hashes_stable_across_runs() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".pethover");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();
    let first = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
    manager.install("codex").unwrap();
    let second = fs::read_to_string(home.join(".codex/config.toml")).unwrap();

    assert_eq!(first, second, "config.toml diverged between two consecutive installs");
}
