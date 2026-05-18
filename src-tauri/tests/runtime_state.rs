use pethover_lib::runtime_state::{
    BoundedEventQueue, EventStateEngine, PetStateId, RuntimeEvent, TokenBucket,
};

#[test]
fn maps_runtime_events_to_pet_states() {
    let mut engine = EventStateEngine::new();

    assert_eq!(
        engine.apply_event(event("user.prompt", None), 10).state,
        PetStateId::Jumping
    );
    assert_eq!(
        engine
            .apply_event(event("tool.before", Some("Read")), 400)
            .state,
        PetStateId::Review
    );
    assert_eq!(
        engine
            .apply_event(event("tool.before", Some("Bash")), 800)
            .state,
        PetStateId::Running
    );
    assert_eq!(
        engine
            .apply_event(event("permission.waiting", None), 1_200)
            .state,
        PetStateId::Waiting
    );
    assert_eq!(
        EventStateEngine::new()
            .apply_event(event("session.waiting", None), 1_400)
            .state,
        PetStateId::Waiting
    );
    assert_eq!(
        engine.apply_event(event("session.stop", None), 1_600).state,
        PetStateId::Waving
    );
    assert_eq!(
        EventStateEngine::new()
            .apply_event(event("session.end", None), 1_800)
            .state,
        PetStateId::Waving
    );
    assert_eq!(
        engine
            .apply_event(event("session.error", None), 2_000)
            .state,
        PetStateId::Failed
    );
}

#[test]
fn coalesces_tool_after_until_minimum_dwell_then_falls_back_to_idle() {
    let mut engine = EventStateEngine::new();

    engine.apply_event(event("tool.before", Some("Bash")), 1_000);
    let after = engine.apply_event(event("tool.after", Some("Bash")), 1_050);

    assert_eq!(after.state, PetStateId::Running);
    assert_eq!(after.idle_after_ms, Some(1_250));
    assert_eq!(engine.advance_time(1_249).state, PetStateId::Running);
    assert_eq!(engine.advance_time(1_250).state, PetStateId::Idle);
}

#[test]
fn token_bucket_allows_burst_then_refills_at_sustained_rate() {
    let mut bucket = TokenBucket::new(30, 60);

    for _ in 0..60 {
        assert!(bucket.allow(0));
    }

    assert!(!bucket.allow(0));
    assert!(bucket.allow(1_000));
    for _ in 0..29 {
        assert!(bucket.allow(1_000));
    }
    assert!(!bucket.allow(1_000));
}

#[test]
fn bounded_queue_keeps_latest_events_with_fixed_capacity() {
    let mut queue = BoundedEventQueue::new(3);

    queue.push(event_with_agent("first"));
    queue.push(event_with_agent("second"));
    queue.push(event_with_agent("third"));
    queue.push(event_with_agent("fourth"));

    assert_eq!(queue.len(), 3);
    assert_eq!(queue.pop_front().unwrap().agent, "second");
    assert_eq!(queue.pop_front().unwrap().agent, "third");
    assert_eq!(queue.pop_front().unwrap().agent, "fourth");
}

#[test]
fn unknown_events_do_not_change_current_state() {
    let mut engine = EventStateEngine::new();

    engine.apply_event(event("tool.before", Some("Bash")), 1_000);
    let state = engine.apply_event(event("unexpected.kind", None), 1_100);

    assert_eq!(state.state, PetStateId::Running);
    assert_eq!(engine.advance_time(1_300).state, PetStateId::Running);
}

fn event(kind: &str, tool: Option<&str>) -> RuntimeEvent {
    RuntimeEvent {
        agent: "codex".to_string(),
        kind: kind.to_string(),
        tool: tool.map(ToString::to_string),
        tool_input: None,
        session_id: None,
        timestamp: None,
    }
}

fn event_with_agent(agent: &str) -> RuntimeEvent {
    RuntimeEvent {
        agent: agent.to_string(),
        kind: "tool.before".to_string(),
        tool: None,
        tool_input: None,
        session_id: None,
        timestamp: None,
    }
}
