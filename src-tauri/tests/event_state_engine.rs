use pethover_lib::runtime_state::{EventStateEngine, PetStateId, RuntimeEvent};
use serde_json::json;

fn tool_before_with_command(command: &str) -> RuntimeEvent {
    RuntimeEvent {
        agent: "claude-code".into(),
        kind: "tool.before".into(),
        tool: Some("Bash".into()),
        tool_input: Some(json!({ "command": command })),
        session_id: None,
        timestamp: None,
    }
}

#[test]
fn bash_cargo_test_maps_to_review() {
    let mut engine = EventStateEngine::new();
    let derived = engine.apply_event(tool_before_with_command("cargo test --workspace"), 0);
    assert_eq!(derived.state, PetStateId::Review);
}

#[test]
fn bash_pnpm_test_maps_to_review() {
    let mut engine = EventStateEngine::new();
    let derived = engine.apply_event(tool_before_with_command("pnpm test"), 0);
    assert_eq!(derived.state, PetStateId::Review);
}

#[test]
fn bash_pytest_maps_to_review() {
    let mut engine = EventStateEngine::new();
    let derived = engine.apply_event(tool_before_with_command("pytest -q"), 0);
    assert_eq!(derived.state, PetStateId::Review);
}

#[test]
fn bash_vitest_run_maps_to_review() {
    let mut engine = EventStateEngine::new();
    let derived = engine.apply_event(tool_before_with_command("vitest run"), 0);
    assert_eq!(derived.state, PetStateId::Review);
}

#[test]
fn bash_non_test_command_maps_to_running() {
    let mut engine = EventStateEngine::new();
    let derived = engine.apply_event(tool_before_with_command("ls -la"), 0);
    assert_eq!(derived.state, PetStateId::Running);
}

#[test]
fn tool_before_without_command_maps_to_running() {
    let mut engine = EventStateEngine::new();
    let event = RuntimeEvent {
        agent: "claude-code".into(),
        kind: "tool.before".into(),
        tool: Some("Edit".into()),
        tool_input: None,
        session_id: None,
        timestamp: None,
    };
    let derived = engine.apply_event(event, 0);
    assert_eq!(derived.state, PetStateId::Running);
}

#[test]
fn read_tool_still_maps_to_review() {
    let mut engine = EventStateEngine::new();
    let event = RuntimeEvent {
        agent: "claude-code".into(),
        kind: "tool.before".into(),
        tool: Some("Read".into()),
        tool_input: None,
        session_id: None,
        timestamp: None,
    };
    let derived = engine.apply_event(event, 0);
    assert_eq!(derived.state, PetStateId::Review);
}
