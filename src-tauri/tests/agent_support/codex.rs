use super::helpers::{manager_with_fake_agents, read_json};
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
fn codex_install_writes_hooks_json_and_enables_hooks_feature() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    let result = manager.install("codex").unwrap();
    let hooks = fs::read_to_string(home.join(".codex/hooks.json")).unwrap();
    let config = fs::read_to_string(home.join(".codex/config.toml")).unwrap();

    assert!(result.adapter.installed);
    assert!(hooks.contains("\"PreToolUse\""));
    assert!(hooks.contains("copet-hook.sh"));
    assert!(hooks.contains("codex"));
    assert!(hooks.contains("tool.before"));
    assert!(config.contains("[features]"));
    assert!(config.contains("hooks = true"));
}

#[test]
fn codex_install_omits_notification_event_unknown_to_codex() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
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
    let root = temp.path().join(".copet");
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
                    stream.set_nonblocking(false).unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
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
        .args(["codex", "tool.before"])
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
    let root = temp.path().join(".copet");
    let runtime = temp.path().join("missing-runtime");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

    let output = Command::new(root.join("hooks/copet-hook.sh"))
        .args(["codex", "session.stop"])
        .env("COPET_RUNTIME_DIR", &runtime)
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
    let root = temp.path().join(".copet");
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
    assert!(!config.contains("codex_hooks"));
    assert!(config.contains("experimental = true"));
    assert!(config.contains("[profiles.default]"));
}

#[test]
fn codex_install_places_copet_hooks_before_existing_matching_groups() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
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
    assert!(first_command.contains("copet-hook.sh"));
    assert!(first_command.contains(" codex tool.before"));
    assert_eq!(second_command, "echo existing");
}

#[test]
fn uninstall_removes_hooks_and_adapter_metadata() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();
    assert!(root.join("adapters/codex.json").exists());

    let result = manager.uninstall("codex").unwrap();
    let hooks = fs::read_to_string(home.join(".codex/hooks.json")).unwrap();

    assert!(!result.adapter.installed);
    assert!(!hooks.contains("copet-hook.sh"));
    assert!(!root.join("adapters/codex.json").exists());
}

#[test]
fn install_rejects_missing_local_agent_cli_without_writing_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
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
    let root = temp.path().join(".copet");
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
    let root = temp.path().join(".copet");
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
fn codex_install_preserves_user_comments_and_unrelated_keys_in_config_toml() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
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
fn codex_install_writes_trusted_hashes_for_all_copet_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
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

#[test]
fn codex_uninstall_removes_only_copet_trusted_hashes() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

    // Inject an unrelated [hooks.state] entry the user might own.
    let config_path = home.join(".codex/config.toml");
    let mut config = fs::read_to_string(&config_path).unwrap();
    config.push_str("\n[hooks.state.\"/elsewhere/hooks.json:pre_tool_use:0:0\"]\ntrusted_hash = \"sha256:deadbeef\"\n");
    fs::write(&config_path, &config).unwrap();

    manager.uninstall("codex").unwrap();
    let after = fs::read_to_string(&config_path).unwrap();
    let hooks_abs = home.join(".codex/hooks.json").display().to_string();

    // CoPet's entries gone.
    for event_label in [
        "user_prompt_submit",
        "pre_tool_use",
        "post_tool_use",
        "permission_request",
        "stop",
    ] {
        let key = format!("[hooks.state.\"{hooks_abs}:{event_label}:0:0\"]");
        assert!(
            !after.contains(&key),
            "CoPet trust entry survived uninstall: {key}\n{after}"
        );
    }
    // User's entry survives.
    assert!(
        after.contains("/elsewhere/hooks.json:pre_tool_use:0:0"),
        "unrelated [hooks.state] entry was wiped: {after}",
    );
}

#[test]
fn codex_install_idempotent_trusted_hashes_stable_across_runs() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root = temp.path().join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();
    let first = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
    manager.install("codex").unwrap();
    let second = fs::read_to_string(home.join(".codex/config.toml")).unwrap();

    assert_eq!(
        first, second,
        "config.toml diverged between two consecutive installs"
    );
}

#[test]
fn codex_repair_refreshes_trusted_hashes_after_helper_path_changes() {
    let temp = tempfile::tempdir().unwrap();
    let home = temp.path().join("home");
    let root_a = temp.path().join(".copet-a");
    let root_b = temp.path().join(".copet-b");

    let manager_a = manager_with_fake_agents(&root_a, &home);
    manager_a.install("codex").unwrap();
    let config_after_a = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
    let hash_a = extract_first_trusted_hash(&config_after_a);

    let manager_b = manager_with_fake_agents(&root_b, &home);
    manager_b.repair("codex").unwrap();
    let config_after_b = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
    let hash_b = extract_first_trusted_hash(&config_after_b);

    assert_ne!(
        hash_a, hash_b,
        "trusted_hash should differ when helper path changes (command string differs):\nA: {hash_a}\nB: {hash_b}",
    );
    // No leaked entries pointing to root_a helper.
    let helper_a = root_a.join("hooks/copet-hook.sh").display().to_string();
    assert!(
        !config_after_b.contains(&helper_a),
        "stale reference to old helper path: {config_after_b}",
    );
}

fn extract_first_trusted_hash(config: &str) -> String {
    config
        .lines()
        .find_map(|line| {
            line.trim_start()
                .strip_prefix("trusted_hash")
                .and_then(|rest| rest.split_once('='))
                .map(|(_, value)| value.trim().trim_matches('"').to_string())
        })
        .expect("at least one trusted_hash should exist")
}

#[test]
#[cfg(unix)]
fn codex_trusted_hash_matches_golden_for_pinned_fixture() {
    // Goldens captured 2026-05-18 against CoPet's vendored hash algorithm
    // (replica of openai/codex command_hook_hash). If Codex changes the upstream
    // algorithm, this test fails — regenerate by running and pasting actual values.
    const FIXTURE_BASE: &str = "/tmp/copet-codex-golden-fixture";
    const GOLDEN: &[(&str, &str)] = &[
        (
            "user_prompt_submit",
            "sha256:10b08bfc16605b6199422d0cfa537add15249f517caa150f5aec9ab1a8275f9f",
        ),
        (
            "pre_tool_use",
            "sha256:e5d9933e573bc02a5bccc6c0c805d619d153dbf4da599580b2bcf443fbf6bf4a",
        ),
        (
            "post_tool_use",
            "sha256:ff7ee0b627008559dd9710876e64f3822642700d463f456fa2144233d8693cda",
        ),
        (
            "permission_request",
            "sha256:19639a89d0ee6194c730dca327234c193ae734d49c0bd14416684e4b4d3322f3",
        ),
        (
            "stop",
            "sha256:159a17cbd3dabd50826a788c0da2247589e8c0c17b6dbde13d082fd467fb230d",
        ),
    ];

    let base = std::path::PathBuf::from(FIXTURE_BASE);
    let _ = std::fs::remove_dir_all(&base);
    let home = base.join("home");
    let root = base.join(".copet");
    let manager = manager_with_fake_agents(&root, &home);

    manager.install("codex").unwrap();

    let config = fs::read_to_string(home.join(".codex/config.toml")).unwrap();
    let hooks_abs = home.join(".codex/hooks.json").display().to_string();

    for (event_label, expected_hash) in GOLDEN {
        let header = format!("[hooks.state.\"{hooks_abs}:{event_label}:0:0\"]");
        let actual = config
            .lines()
            .skip_while(|line| !line.contains(&header))
            .find_map(|line| {
                line.trim_start()
                    .strip_prefix("trusted_hash")
                    .and_then(|rest| rest.split_once('='))
                    .map(|(_, value)| value.trim().trim_matches('"').to_string())
            })
            .unwrap_or_else(|| panic!("missing trusted_hash for {event_label} in:\n{config}"));
        assert_eq!(
            &actual, expected_hash,
            "{event_label}: golden drift — Codex algorithm may have changed; rerun Task 8 procedure",
        );
    }

    // Cleanup
    let _ = std::fs::remove_dir_all(&base);
}
