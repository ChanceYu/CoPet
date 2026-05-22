use copet_lib::{
    diagnostics::RotatingLog,
    runtime_server::{handle_http_request, RuntimeCore, RuntimeServerError, RuntimeToken},
    runtime_state::{PetStateId, RuntimeEvent},
};
use serde_json::json;
use std::fs;

#[test]
fn rotate_writes_a_fresh_runtime_token() {
    let temp = tempfile::tempdir().unwrap();
    let runtime_dir = temp.path().join("runtime");

    let first = RuntimeToken::rotate(&runtime_dir).unwrap();
    let second = RuntimeToken::rotate(&runtime_dir).unwrap();
    let on_disk = fs::read_to_string(runtime_dir.join("event-token")).unwrap();

    assert!(first.len() >= 32);
    assert_ne!(first, second);
    assert_eq!(on_disk, second);
}

#[test]
fn invalidate_removes_runtime_token_when_present() {
    let temp = tempfile::tempdir().unwrap();
    let runtime_dir = temp.path().join("runtime");
    RuntimeToken::rotate(&runtime_dir).unwrap();

    RuntimeToken::invalidate(&runtime_dir).unwrap();

    assert!(!runtime_dir.join("event-token").exists());
}

#[test]
fn write_endpoint_persists_current_event_endpoint() {
    let temp = tempfile::tempdir().unwrap();
    let runtime_dir = temp.path().join("runtime");

    RuntimeToken::write_endpoint(&runtime_dir, "http://127.0.0.1:1234/v1/events").unwrap();

    assert_eq!(
        fs::read_to_string(runtime_dir.join("event-endpoint")).unwrap(),
        "http://127.0.0.1:1234/v1/events"
    );
}

#[test]
fn runtime_core_accepts_authorized_events_and_updates_status() {
    let mut core = RuntimeCore::new("secret".to_string());

    let state = core
        .handle_event(
            Some("Bearer secret"),
            RuntimeEvent {
                agent: "codex".to_string(),
                kind: "tool.before".to_string(),
                tool: Some("Read".to_string()),
                tool_input: None,
                session_id: None,
                timestamp: None,
            },
            10,
        )
        .unwrap();

    assert_eq!(state.state, PetStateId::Review);
    assert_eq!(core.status().accepted_events, 1);
    assert_eq!(core.status().rejected_events, 0);
}

#[test]
fn runtime_core_tracks_latest_message_per_agent() {
    let mut core = RuntimeCore::new("secret".to_string());

    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "codex".to_string(),
            kind: "tool.before".to_string(),
            tool: Some("Read".to_string()),
            tool_input: Some(json!({ "file_path": "/repo/src/App.tsx" })),
            session_id: None,
            timestamp: None,
        },
        100,
    )
    .unwrap();
    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "claude-code".to_string(),
            kind: "tool.before".to_string(),
            tool: Some("Bash".to_string()),
            tool_input: Some(json!({ "command": "pnpm test:frontend" })),
            session_id: None,
            timestamp: None,
        },
        200,
    )
    .unwrap();

    let status = core.status();
    let codex = status
        .messages
        .iter()
        .find(|message| message.agent == "codex")
        .unwrap();
    let claude = status
        .messages
        .iter()
        .find(|message| message.agent == "claude-code")
        .unwrap();

    assert_eq!(codex.display_name, "Codex");
    assert_eq!(codex.text, "Reading App.tsx");
    assert_eq!(codex.updated_at_ms, 100);
    assert_eq!(claude.display_name, "Claude Code");
    assert_eq!(claude.text, "Running pnpm test:frontend");
    assert_eq!(claude.updated_at_ms, 200);
}

#[test]
fn runtime_core_keeps_antigravity_tool_detail_when_post_tool_lacks_payload() {
    let mut core = RuntimeCore::new("secret".to_string());

    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "antigravity".to_string(),
            kind: "tool.before".to_string(),
            tool: Some("run_command".to_string()),
            tool_input: Some(json!({
                "command": "pnpm test:frontend src/tests/settings-workflows.spec.ts"
            })),
            session_id: None,
            timestamp: None,
        },
        100,
    )
    .unwrap();
    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "antigravity".to_string(),
            kind: "tool.after".to_string(),
            tool: None,
            tool_input: None,
            session_id: None,
            timestamp: None,
        },
        200,
    )
    .unwrap();

    let status = core.status();
    let message = status
        .messages
        .iter()
        .find(|message| message.agent == "antigravity")
        .unwrap();

    assert_eq!(message.display_name, "Antigravity");
    assert_eq!(
        message.text,
        "Running pnpm test:frontend src/tests/settings-workflows.spec.ts"
    );
    assert_eq!(message.updated_at_ms, 100);
}

#[test]
fn runtime_core_normalizes_agent_aliases_and_raw_cli_event_kinds_for_messages() {
    let mut core = RuntimeCore::new("secret".to_string());

    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "claude".to_string(),
            kind: "PreToolUse".to_string(),
            tool: Some("Bash".to_string()),
            tool_input: Some(json!({ "command": "pnpm build" })),
            session_id: None,
            timestamp: None,
        },
        100,
    )
    .unwrap();
    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "open-code".to_string(),
            kind: "tool.execute.before".to_string(),
            tool: Some("Read".to_string()),
            tool_input: Some(json!({ "filePath": "/repo/src/App.tsx" })),
            session_id: None,
            timestamp: None,
        },
        200,
    )
    .unwrap();
    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "gemini".to_string(),
            kind: "BeforeTool".to_string(),
            tool: Some("Read".to_string()),
            tool_input: Some(json!({ "file_path": "/repo/src/lib.rs" })),
            session_id: None,
            timestamp: None,
        },
        300,
    )
    .unwrap();
    core.handle_event(
        Some("Bearer secret"),
        RuntimeEvent {
            agent: "gemini".to_string(),
            kind: "BeforeAgent".to_string(),
            tool: None,
            tool_input: None,
            session_id: None,
            timestamp: None,
        },
        400,
    )
    .unwrap();

    let status = core.status();
    let claude = status
        .messages
        .iter()
        .find(|message| message.agent == "claude-code")
        .unwrap();
    let opencode = status
        .messages
        .iter()
        .find(|message| message.agent == "opencode")
        .unwrap();
    let gemini = status
        .messages
        .iter()
        .find(|message| message.agent == "gemini")
        .unwrap();

    assert_eq!(claude.display_name, "Claude Code");
    assert_eq!(claude.text, "Running pnpm build");
    assert_eq!(opencode.display_name, "OpenCode");
    assert_eq!(opencode.text, "Reading App.tsx");
    assert_eq!(gemini.display_name, "Gemini");
    assert_eq!(gemini.text, "Thinking...");
    assert_eq!(status.current_state.state, PetStateId::Jumping);
}

#[test]
fn runtime_core_rejects_missing_or_wrong_bearer_token() {
    let mut core = RuntimeCore::new("secret".to_string());

    let result = core.handle_event(
        Some("Bearer nope"),
        RuntimeEvent {
            agent: "codex".to_string(),
            kind: "tool.before".to_string(),
            tool: None,
            tool_input: None,
            session_id: None,
            timestamp: None,
        },
        10,
    );

    assert_eq!(result, Err(RuntimeServerError::Unauthorized));
    assert_eq!(core.status().accepted_events, 0);
    assert_eq!(core.status().rejected_events, 1);
}

#[test]
fn http_handler_accepts_event_posts() {
    let mut core = RuntimeCore::new("secret".to_string());
    let request = concat!(
        "POST /v1/events HTTP/1.1\r\n",
        "Host: 127.0.0.1\r\n",
        "Authorization: Bearer secret\r\n",
        "Content-Type: application/json\r\n",
        "Content-Length: 52\r\n",
        "\r\n",
        r#"{"agent":"codex","kind":"tool.before","tool":"Read"}"#
    );

    let response = handle_http_request(&mut core, request.as_bytes(), 100);

    assert_eq!(response.status_code, 202);
    assert!(response.body.contains("review"));
}

#[test]
fn http_handler_accepts_cli_style_snake_case_event_payloads() {
    let mut core = RuntimeCore::new("secret".to_string());
    let body = r#"{"agent":"opencode","kind":"tool.before","tool":"Read","tool_input":{"filePath":"/repo/src/App.tsx"},"session_id":"session-1"}"#;
    let request = format!(
        "POST /v1/events HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         Authorization: Bearer secret\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         \r\n\
         {}",
        body.len(),
        body
    );

    let response = handle_http_request(&mut core, request.as_bytes(), 100);

    assert_eq!(response.status_code, 202);
    assert!(response.body.contains("review"));
    let status = core.status();
    let message = status.messages.first().unwrap();
    assert_eq!(message.agent, "opencode");
    assert_eq!(message.text, "Reading App.tsx");
}

#[test]
fn http_handler_rejects_large_bodies_before_parsing() {
    let mut core = RuntimeCore::new("secret".to_string());
    let request = concat!(
        "POST /v1/events HTTP/1.1\r\n",
        "Host: 127.0.0.1\r\n",
        "Authorization: Bearer secret\r\n",
        "Content-Type: application/json\r\n",
        "Content-Length: 16385\r\n",
        "\r\n"
    );

    let response = handle_http_request(&mut core, request.as_bytes(), 100);

    assert_eq!(response.status_code, 413);
}

#[test]
fn runtime_event_log_rotates_under_synthetic_event_stream() {
    let temp = tempfile::tempdir().unwrap();
    let log_path = temp.path().join("agent-events.log");
    let logger = RotatingLog::new(&log_path, 512, 2);
    let mut core = RuntimeCore::new("secret".to_string()).with_logger(logger);

    for index in 0..200 {
        let _ = core.handle_event(
            Some("Bearer secret"),
            RuntimeEvent {
                agent: "codex".to_string(),
                kind: "tool.before".to_string(),
                tool: Some(format!("Tool{index}")),
                tool_input: None,
                session_id: Some("synthetic-session".to_string()),
                timestamp: Some(index),
            },
            1_000 + index,
        );
    }

    let current_size = fs::metadata(&log_path).unwrap().len();
    let rotated_size = fs::metadata(temp.path().join("agent-events.log.1"))
        .unwrap()
        .len();

    assert!(current_size <= 512);
    assert!(rotated_size <= 512);
    assert!(core.status().accepted_events > 0);
}
