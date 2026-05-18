use pethover_lib::{runtime_server::RuntimeManager, runtime_state::PetStateId};
use std::{
    fs,
    io::{Read, Write},
    net::TcpStream,
    sync::{Arc, Mutex},
    time::Duration,
};

#[test]
fn runtime_manager_accepts_authorized_http_events_and_rejects_bad_tokens() {
    let temp = tempfile::tempdir().unwrap();
    let runtime_dir = temp.path().join("runtime");
    let observed_states = Arc::new(Mutex::new(Vec::new()));
    let observed_for_callback = Arc::clone(&observed_states);
    let manager = RuntimeManager::start(&runtime_dir, move |update| {
        observed_for_callback
            .lock()
            .unwrap()
            .push(update.current_state.state);
    })
    .unwrap();
    let endpoint = fs::read_to_string(runtime_dir.join("event-endpoint")).unwrap();
    let token = fs::read_to_string(runtime_dir.join("event-token")).unwrap();

    assert_eq!(
        endpoint,
        format!("http://127.0.0.1:{}/v1/events", manager.port())
    );

    let accepted = post_runtime_event(
        manager.port(),
        &token,
        r#"{"agent":"codex","kind":"tool.before","tool":"Read"}"#,
    );
    assert!(accepted.starts_with("HTTP/1.1 202 Accepted"));
    assert!(accepted.contains("\"state\":\"review\""));

    let rejected = post_runtime_event(
        manager.port(),
        "wrong-token",
        r#"{"agent":"codex","kind":"tool.before","tool":"Read"}"#,
    );
    assert!(rejected.starts_with("HTTP/1.1 401 Unauthorized"));

    let snapshot = manager.snapshot();
    assert_eq!(snapshot.accepted_events, 1);
    assert_eq!(snapshot.rejected_events, 1);
    assert_eq!(snapshot.current_state.state, PetStateId::Review);
    assert!(observed_states
        .lock()
        .unwrap()
        .iter()
        .any(|state| *state == PetStateId::Review));

    drop(manager);
    assert!(!runtime_dir.join("event-token").exists());
    assert!(!runtime_dir.join("event-endpoint").exists());
}

fn post_runtime_event(port: u16, token: &str, body: &str) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let request = format!(
        "POST /v1/events HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         Authorization: Bearer {token}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n\
         {body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).unwrap();

    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();
    response
}
