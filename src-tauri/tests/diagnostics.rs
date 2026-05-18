use pethover_lib::diagnostics::RotatingLog;
use std::fs;

#[test]
fn rotating_log_moves_oversized_file_to_backup() {
    let temp = tempfile::tempdir().unwrap();
    let log = RotatingLog::new(temp.path().join("agent-events.log"), 48, 2);

    log.append_line("first line with enough bytes").unwrap();
    log.append_line("second line triggers rotation").unwrap();

    let current = fs::read_to_string(temp.path().join("agent-events.log")).unwrap();
    let rotated = fs::read_to_string(temp.path().join("agent-events.log.1")).unwrap();

    assert!(current.contains("second line"));
    assert!(!current.contains("first line"));
    assert!(rotated.contains("first line"));
}
