use std::{
    collections::HashMap,
    fs, io,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::{
    diagnostics::RotatingLog,
    runtime_state::{
        BoundedEventQueue, DerivedPetState, EventStateEngine, RuntimeEvent, TokenBucket,
    },
};

const MAX_EVENT_BODY_BYTES: usize = 16 * 1024;

pub struct RuntimeToken;

impl RuntimeToken {
    pub fn rotate(runtime_dir: &Path) -> io::Result<String> {
        fs::create_dir_all(runtime_dir)?;
        let mut bytes = [0_u8; 32];
        getrandom::getrandom(&mut bytes)
            .map_err(|error| io::Error::new(io::ErrorKind::Other, error.to_string()))?;
        let token = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        fs::write(runtime_dir.join("event-token"), &token)?;
        Ok(token)
    }

    pub fn invalidate(runtime_dir: &Path) -> io::Result<()> {
        match fs::remove_file(runtime_dir.join("event-token")) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }

    pub fn write_endpoint(runtime_dir: &Path, endpoint: &str) -> io::Result<()> {
        fs::create_dir_all(runtime_dir)?;
        fs::write(runtime_dir.join("event-endpoint"), endpoint)?;
        Ok(())
    }
}

pub struct HttpResponse {
    pub status_code: u16,
    pub body: String,
}

pub fn handle_http_request(core: &mut RuntimeCore, request: &[u8], now_ms: u64) -> HttpResponse {
    match parse_http_request(request) {
        Ok(request) => {
            if request.method != "POST" || request.path != "/v1/events" {
                return response(404, r#"{"error":"not_found"}"#);
            }

            if request.content_length > MAX_EVENT_BODY_BYTES {
                return response(413, r#"{"error":"body_too_large"}"#);
            }

            if request.body.len() < request.content_length {
                return response(400, r#"{"error":"incomplete_body"}"#);
            }

            let event = match serde_json::from_slice::<RuntimeEvent>(&request.body) {
                Ok(event) => event,
                Err(_) => return response(400, r#"{"error":"invalid_json"}"#),
            };

            dev_log_runtime(
                "http.event.received",
                serde_json::json!({
                    "agent": &event.agent,
                    "kind": &event.kind,
                    "tool": &event.tool,
                    "sessionId": &event.session_id,
                    "authorized": request.authorization.is_some(),
                }),
            );

            match core.handle_event(request.authorization.as_deref(), event, now_ms) {
                Ok(state) => response_json(202, &state),
                Err(RuntimeServerError::Unauthorized) => {
                    response(401, r#"{"error":"unauthorized"}"#)
                }
                Err(RuntimeServerError::RateLimited) => {
                    response(429, r#"{"error":"rate_limited"}"#)
                }
            }
        }
        Err(status) => response(status, r#"{"error":"bad_request"}"#),
    }
}

pub struct RuntimeManager {
    core: Arc<Mutex<RuntimeCore>>,
    port: u16,
    runtime_dir: std::path::PathBuf,
    shutdown: Arc<AtomicBool>,
}

impl RuntimeManager {
    pub fn start(
        runtime_dir: &Path,
        on_state: impl Fn(RuntimeUpdate) + Send + Sync + 'static,
    ) -> io::Result<Self> {
        let token = RuntimeToken::rotate(runtime_dir)?;
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        let endpoint = format!("http://127.0.0.1:{port}/v1/events");
        RuntimeToken::write_endpoint(runtime_dir, &endpoint)?;
        let logger = RotatingLog::new(runtime_dir.join("agent-events.log"), 64 * 1024, 3);
        let core = Arc::new(Mutex::new(RuntimeCore::new(token).with_logger(logger)));
        dev_log_runtime(
            "server.started",
            serde_json::json!({
                "endpoint": endpoint,
                "runtimeDir": runtime_dir.to_string_lossy(),
                "eventLog": runtime_dir.join("agent-events.log").to_string_lossy(),
            }),
        );
        let server_core = Arc::clone(&core);
        let on_state = Arc::new(on_state);
        let tick_core = Arc::clone(&core);
        let tick_on_state = Arc::clone(&on_state);
        let shutdown = Arc::new(AtomicBool::new(false));
        let server_shutdown = Arc::clone(&shutdown);
        let tick_shutdown = Arc::clone(&shutdown);

        thread::Builder::new()
            .name("copet-runtime-event-server".to_string())
            .spawn(move || {
                for stream in listener.incoming().flatten() {
                    if server_shutdown.load(Ordering::Relaxed) {
                        // Drop closes the listener and releases the TCP port.
                        break;
                    }
                    let core = Arc::clone(&server_core);
                    let on_state = Arc::clone(&on_state);
                    handle_connection(stream, core, on_state.as_ref());
                }
            })?;

        thread::Builder::new()
            .name("copet-runtime-state-tick".to_string())
            .spawn(move || loop {
                if tick_shutdown.load(Ordering::Relaxed) {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
                let mut core = tick_core.lock().expect("runtime core poisoned");
                let previous = core.status().current_state;
                let next = core.advance_time(now_ms());
                if next != previous {
                    let messages = core.status().messages;
                    tick_on_state(RuntimeUpdate {
                        current_state: next,
                        messages,
                    });
                }
            })?;

        Ok(Self {
            core,
            port,
            runtime_dir: runtime_dir.to_path_buf(),
            shutdown,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Signal both worker threads to stop, wake the blocking accept() via a
    /// self-connect, and clean up the on-disk endpoint and token files.
    ///
    /// Safe to call multiple times. Drop calls this automatically, but the
    /// quit handlers invoke it BEFORE `app.exit(0)` because Tauri 2 on macOS
    /// does not always reach `std::process::exit` after the tray fires the
    /// exit event — `NSApplication` can intercept the terminate and leave the
    /// process alive. Releasing the listener up front guarantees the OS port
    /// is freed even if the process lingers, so the next launch is not
    /// blocked by "address already in use".
    pub fn shutdown(&self) {
        if self.shutdown.swap(true, Ordering::Relaxed) {
            return; // already shut down by a prior call
        }
        let addr = SocketAddr::from(([127, 0, 0, 1], self.port));
        let _ = TcpStream::connect_timeout(&addr, Duration::from_millis(50));
        let _ = RuntimeToken::invalidate(&self.runtime_dir);
        let _ = fs::remove_file(self.runtime_dir.join("event-endpoint"));
    }

    pub fn snapshot(&self) -> RuntimeSnapshot {
        let status = self.core.lock().expect("runtime core poisoned").status();
        RuntimeSnapshot {
            port: self.port,
            endpoint: format!("http://127.0.0.1:{}/v1/events", self.port),
            current_state: status.current_state,
            messages: status.messages,
            accepted_events: status.accepted_events,
            rejected_events: status.rejected_events,
        }
    }
}

impl Drop for RuntimeManager {
    fn drop(&mut self) {
        // Idempotent: if the quit handler already called shutdown(), this is
        // a no-op. Otherwise the same cleanup path runs here.
        self.shutdown();
    }
}

pub struct RuntimeCore {
    token: String,
    engine: EventStateEngine,
    queue: BoundedEventQueue,
    bucket: TokenBucket,
    messages: Vec<AgentMessage>,
    logger: Option<RotatingLog>,
    accepted_events: u64,
    rejected_events: u64,
}

impl RuntimeCore {
    pub fn new(token: String) -> Self {
        Self {
            token,
            engine: EventStateEngine::new(),
            queue: BoundedEventQueue::new(50),
            bucket: TokenBucket::new(30, 60),
            messages: Vec::new(),
            logger: None,
            accepted_events: 0,
            rejected_events: 0,
        }
    }

    pub fn with_logger(mut self, logger: RotatingLog) -> Self {
        self.logger = Some(logger);
        self
    }

    pub fn handle_event(
        &mut self,
        authorization: Option<&str>,
        event: RuntimeEvent,
        now_ms: u64,
    ) -> Result<DerivedPetState, RuntimeServerError> {
        if authorization != Some(format!("Bearer {}", self.token).as_str()) {
            self.rejected_events += 1;
            self.log_event("rejected_unauthorized", &event, now_ms, None, None);
            dev_log_runtime(
                "event.rejected",
                serde_json::json!({
                    "reason": "unauthorized",
                    "agent": &event.agent,
                    "kind": &event.kind,
                    "tool": &event.tool,
                    "rejectedEvents": self.rejected_events,
                }),
            );
            return Err(RuntimeServerError::Unauthorized);
        }

        if !self.bucket.allow(now_ms) {
            self.rejected_events += 1;
            self.log_event("rejected_rate_limited", &event, now_ms, None, None);
            dev_log_runtime(
                "event.rejected",
                serde_json::json!({
                    "reason": "rate_limited",
                    "agent": &event.agent,
                    "kind": &event.kind,
                    "tool": &event.tool,
                    "rejectedEvents": self.rejected_events,
                }),
            );
            return Err(RuntimeServerError::RateLimited);
        }

        let event = normalize_runtime_event(event);
        let message = agent_message_for_event(&event, now_ms);
        if let Some(message) = message.clone() {
            self.upsert_message(message);
        }
        self.queue.push(event.clone());
        let mut latest = self.engine.current();
        while let Some(event) = self.queue.pop_front() {
            latest = self.engine.apply_event(event, now_ms);
            self.accepted_events += 1;
        }
        self.log_event("accepted", &event, now_ms, message.as_ref(), Some(&latest));
        dev_log_runtime(
            "event.accepted",
            serde_json::json!({
                "agent": &event.agent,
                "kind": &event.kind,
                "tool": &event.tool,
                "message": &message,
                "currentState": latest,
                "messages": &self.messages,
                "acceptedEvents": self.accepted_events,
                "rejectedEvents": self.rejected_events,
            }),
        );

        Ok(latest)
    }

    pub fn status(&self) -> RuntimeStatus {
        RuntimeStatus {
            current_state: self.engine.current(),
            messages: self.messages.clone(),
            accepted_events: self.accepted_events,
            rejected_events: self.rejected_events,
        }
    }

    pub fn advance_time(&mut self, now_ms: u64) -> DerivedPetState {
        self.engine.advance_time(now_ms)
    }

    fn log_event(
        &self,
        outcome: &str,
        event: &RuntimeEvent,
        now_ms: u64,
        message: Option<&AgentMessage>,
        state: Option<&DerivedPetState>,
    ) {
        let Some(logger) = &self.logger else {
            return;
        };

        let line = serde_json::json!({
            "timestampMs": now_ms,
            "outcome": outcome,
            "agent": &event.agent,
            "kind": &event.kind,
            "tool": &event.tool,
            "sessionId": &event.session_id,
            "message": message,
            "currentState": state,
        })
        .to_string();
        let _ = logger.append_line(&line);
    }

    fn upsert_message(&mut self, message: AgentMessage) {
        if let Some(existing) = self
            .messages
            .iter_mut()
            .find(|existing| existing.agent == message.agent)
        {
            *existing = message;
            return;
        }

        self.messages.push(message);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeServerError {
    Unauthorized,
    RateLimited,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub current_state: DerivedPetState,
    pub messages: Vec<AgentMessage>,
    pub accepted_events: u64,
    pub rejected_events: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessage {
    pub agent: String,
    pub display_name: String,
    pub text: String,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeUpdate {
    pub current_state: DerivedPetState,
    pub messages: Vec<AgentMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSnapshot {
    pub port: u16,
    pub endpoint: String,
    pub current_state: DerivedPetState,
    pub messages: Vec<AgentMessage>,
    pub accepted_events: u64,
    pub rejected_events: u64,
}

fn agent_message_for_event(event: &RuntimeEvent, now_ms: u64) -> Option<AgentMessage> {
    let text = format_agent_message(event)?;
    Some(AgentMessage {
        agent: event.agent.clone(),
        display_name: agent_display_name(&event.agent).to_string(),
        text,
        updated_at_ms: now_ms,
    })
}

fn normalize_runtime_event(mut event: RuntimeEvent) -> RuntimeEvent {
    if let Some(agent) = canonical_agent_id(&event.agent) {
        event.agent = agent.to_string();
    }
    if let Some(kind) = canonical_event_kind(&event.kind) {
        event.kind = kind.to_string();
    }
    event
}

fn canonical_agent_id(agent: &str) -> Option<&'static str> {
    match agent.trim().to_ascii_lowercase().as_str() {
        "claude" | "claude_code" | "claudecode" => Some("claude-code"),
        "open-code" | "open_code" => Some("opencode"),
        _ => None,
    }
}

fn canonical_event_kind(kind: &str) -> Option<&'static str> {
    match kind.trim().to_ascii_lowercase().as_str() {
        "user.prompt" | "userpromptsubmit" | "beforeagent" | "tui.prompt.append" => {
            Some("user.prompt")
        }
        "tool.before" | "pretooluse" | "beforetool" | "tool.execute.before" => Some("tool.before"),
        "tool.after" | "posttooluse" | "aftertool" | "tool.execute.after" => Some("tool.after"),
        "permission.waiting" | "session.waiting" | "permissionrequest" | "notification"
        | "permission.asked" => Some("permission.waiting"),
        "session.stop" | "session.end" | "stop" | "sessionend" | "session.idle" => {
            Some("session.stop")
        }
        "session.error" => Some("session.error"),
        _ => None,
    }
}

fn agent_display_name(agent: &str) -> &str {
    match agent {
        "antigravity" => "Antigravity",
        "codex" => "Codex",
        "claude-code" => "Claude Code",
        "gemini" => "Gemini",
        "opencode" => "OpenCode",
        _ => agent,
    }
}

fn format_agent_message(event: &RuntimeEvent) -> Option<String> {
    match event.kind.as_str() {
        "user.prompt" => Some("Thinking...".to_string()),
        "permission.waiting" | "session.waiting" => Some("Waiting for you...".to_string()),
        "session.stop" | "session.end" => Some("Done.".to_string()),
        "session.error" => Some("Error.".to_string()),
        "tool.after" if event.tool.is_none() && event.tool_input.is_none() => None,
        "tool.before" | "tool.after" => {
            let tool_name = event.tool.as_deref().unwrap_or("tool");
            Some(format_tool_message(
                tool_name,
                event.tool_input.as_ref(),
                event.kind == "tool.after",
            ))
        }
        _ => None,
    }
}

fn format_tool_message(
    tool_name: &str,
    tool_input: Option<&serde_json::Value>,
    past: bool,
) -> String {
    match canonical_tool_kind(tool_name) {
        "read" => {
            if let Some(name) = path_subject(tool_input) {
                return if past {
                    format!("Read {name}")
                } else {
                    format!("Reading {name}")
                };
            }
            if past {
                "Read file".to_string()
            } else {
                "Reading file".to_string()
            }
        }
        "edit" | "write" => {
            if let Some(name) = path_subject(tool_input) {
                return if past {
                    format!("Edited {name}")
                } else {
                    format!("Editing {name}")
                };
            }
            if past {
                "Edited file".to_string()
            } else {
                "Editing file".to_string()
            }
        }
        "bash" => {
            if let Some(command) = string_field(tool_input, "command") {
                let command = compact_whitespace(command);
                let command = clip(&command, 56);
                return if past {
                    format!("Ran {command}")
                } else {
                    format!("Running {command}")
                };
            }
            if past {
                "Ran command".to_string()
            } else {
                "Running command".to_string()
            }
        }
        "grep" => {
            if let Some(pattern) = string_field(tool_input, "pattern") {
                let pattern = clip(pattern, 28);
                return if past {
                    format!("Searched \"{pattern}\"")
                } else {
                    format!("Searching \"{pattern}\"")
                };
            }
            if past {
                "Searched files".to_string()
            } else {
                "Searching files".to_string()
            }
        }
        "glob" => {
            if let Some(pattern) = string_field(tool_input, "pattern") {
                let pattern = clip(pattern, 28);
                return if past {
                    format!("Listed {pattern}")
                } else {
                    format!("Listing {pattern}")
                };
            }
            if let Some(name) = path_subject(tool_input) {
                return if past {
                    format!("Listed {name}")
                } else {
                    format!("Listing {name}")
                };
            }
            if past {
                "Listed files".to_string()
            } else {
                "Listing files".to_string()
            }
        }
        "webfetch" => {
            if let Some(url) = string_field(tool_input, "url") {
                if let Some(host) = url_host(url) {
                    let host = clip(&host, 28);
                    return if past {
                        format!("Fetched {host}")
                    } else {
                        format!("Fetching {host}")
                    };
                }
            }
            if past {
                "Fetched web".to_string()
            } else {
                "Searching web".to_string()
            }
        }
        "task" => {
            if !past {
                if let Some(description) = string_field(tool_input, "description")
                    .or_else(|| string_field(tool_input, "subject"))
                {
                    return format!("Spawning {}", clip(description, 28));
                }
            }
            if past {
                "Subagent done".to_string()
            } else {
                "Spawning subagent".to_string()
            }
        }
        _ => {
            let name = clip(tool_name, 28);
            if past {
                format!("Called {name}")
            } else {
                format!("Calling {name}")
            }
        }
    }
}

fn canonical_tool_kind(tool_name: &str) -> &'static str {
    match tool_name.to_ascii_lowercase().as_str() {
        "read" | "view_file" => "read",
        "edit" | "multiedit" | "replace_file_content" | "multi_replace_file_content" => "edit",
        "write" | "write_to_file" => "write",
        "bash" | "shell" | "run_command" => "bash",
        "grep" | "grep_search" => "grep",
        "glob" | "list_dir" | "find_by_name" => "glob",
        "webfetch" | "websearch" | "search_web" | "read_url_content" => "webfetch",
        "task" | "agent" | "invoke_subagent" | "define_subagent" | "manage_subagents"
        | "send_message" => "task",
        _ => "unknown",
    }
}

fn path_subject(tool_input: Option<&serde_json::Value>) -> Option<String> {
    string_field(tool_input, "file_path")
        .or_else(|| string_field(tool_input, "filePath"))
        .or_else(|| string_field(tool_input, "path"))
        .map(|path| clip(&basename(path), 40))
}

fn string_field<'a>(value: Option<&'a serde_json::Value>, key: &str) -> Option<&'a str> {
    value?.get(key)?.as_str()
}

fn compact_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn basename(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

fn clip(text: &str, max: usize) -> String {
    let mut chars = text.chars();
    let clipped: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() {
        let mut shortened: String = clipped.chars().take(max.saturating_sub(1)).collect();
        shortened.push('…');
        shortened
    } else {
        clipped
    }
}

fn url_host(url: &str) -> Option<String> {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    without_scheme
        .split(['/', '?', '#'])
        .next()
        .filter(|host| !host.is_empty())
        .map(ToString::to_string)
}

struct ParsedHttpRequest {
    method: String,
    path: String,
    authorization: Option<String>,
    content_length: usize,
    body: Vec<u8>,
}

fn parse_http_request(request: &[u8]) -> Result<ParsedHttpRequest, u16> {
    let header_end = request
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or(400_u16)?;
    let headers = std::str::from_utf8(&request[..header_end]).map_err(|_| 400_u16)?;
    let mut lines = headers.lines();
    let request_line = lines.next().ok_or(400_u16)?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().ok_or(400_u16)?.to_string();
    let path = request_parts.next().ok_or(400_u16)?.to_string();
    let mut header_map = HashMap::new();

    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        header_map.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
    }

    let content_length = header_map
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let body_start = header_end + 4;
    let body_end = (body_start + content_length).min(request.len());
    let body = request[body_start..body_end].to_vec();

    Ok(ParsedHttpRequest {
        method,
        path,
        authorization: header_map.get("authorization").cloned(),
        content_length,
        body,
    })
}

fn handle_connection(
    mut stream: TcpStream,
    core: Arc<Mutex<RuntimeCore>>,
    on_state: &(dyn Fn(RuntimeUpdate) + Send + Sync),
) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(750)));
    let mut buffer = Vec::with_capacity(4096);
    let mut chunk = [0_u8; 4096];

    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(count) => {
                buffer.extend_from_slice(&chunk[..count]);
                if request_is_complete(&buffer) || buffer.len() > MAX_EVENT_BODY_BYTES + 4096 {
                    break;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) =>
            {
                break;
            }
            Err(_) => break,
        }
    }

    let mut core = core.lock().expect("runtime core poisoned");
    let response = handle_http_request(&mut core, &buffer, now_ms());
    if response.status_code == 202 {
        let status = core.status();
        let update = RuntimeUpdate {
            current_state: status.current_state,
            messages: status.messages,
        };
        dev_log_runtime(
            "tauri.emit.pet-state-changed",
            serde_json::json!({
                "currentState": &update.current_state,
                "messages": &update.messages,
            }),
        );
        on_state(update);
    }
    let _ = stream.write_all(&response.into_bytes());
}

fn request_is_complete(buffer: &[u8]) -> bool {
    let Some(header_end) = buffer.windows(4).position(|window| window == b"\r\n\r\n") else {
        return false;
    };
    let Ok(headers) = std::str::from_utf8(&buffer[..header_end]) else {
        return true;
    };
    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(0);

    buffer.len() >= header_end + 4 + content_length
}

impl HttpResponse {
    fn into_bytes(self) -> Vec<u8> {
        let reason = match self.status_code {
            202 => "Accepted",
            400 => "Bad Request",
            401 => "Unauthorized",
            404 => "Not Found",
            413 => "Payload Too Large",
            429 => "Too Many Requests",
            _ => "OK",
        };
        format!(
            "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            self.status_code,
            reason,
            self.body.len(),
            self.body
        )
        .into_bytes()
    }
}

fn response(status_code: u16, body: &str) -> HttpResponse {
    HttpResponse {
        status_code,
        body: body.to_string(),
    }
}

fn response_json(status_code: u16, body: &impl serde::Serialize) -> HttpResponse {
    HttpResponse {
        status_code,
        body: serde_json::to_string(body).unwrap_or_else(|_| r#"{"error":"json"}"#.to_string()),
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(debug_assertions)]
fn dev_log_runtime(stage: &str, payload: serde_json::Value) {
    eprintln!("[copet:runtime:{stage}] {payload}");
}

#[cfg(not(debug_assertions))]
fn dev_log_runtime(_stage: &str, _payload: serde_json::Value) {}
