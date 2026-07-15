use std::collections::VecDeque;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PetStateId {
    Idle,
    RunningRight,
    RunningLeft,
    Waving,
    Jumping,
    Failed,
    Waiting,
    Running,
    Review,
    Thinking,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeEvent {
    pub agent: String,
    pub kind: String,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default, alias = "tool_input")]
    pub tool_input: Option<Value>,
    #[serde(default, alias = "session_id")]
    pub session_id: Option<String>,
    #[serde(default)]
    pub timestamp: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedPetState {
    pub state: PetStateId,
    pub since_ms: u64,
    pub idle_after_ms: Option<u64>,
}

impl DerivedPetState {
    pub fn idle() -> Self {
        Self {
            state: PetStateId::Idle,
            since_ms: 0,
            idle_after_ms: None,
        }
    }
}

const MIN_DWELL_MS: u64 = 200;
const TEMP_STATE_IDLE_AFTER_MS: u64 = 1_500;
const THINKING_IDLE_AFTER_MS: u64 = 30_000;

impl PetStateId {
    fn automatic_idle_delay_ms(self) -> Option<u64> {
        match self {
            Self::Idle => None,
            Self::Thinking => Some(THINKING_IDLE_AFTER_MS),
            Self::RunningRight
            | Self::RunningLeft
            | Self::Waving
            | Self::Jumping
            | Self::Failed
            | Self::Waiting
            | Self::Running
            | Self::Review => Some(TEMP_STATE_IDLE_AFTER_MS),
        }
    }
}

pub struct EventStateEngine {
    current: DerivedPetState,
}

impl EventStateEngine {
    pub fn new() -> Self {
        Self {
            current: DerivedPetState {
                state: PetStateId::Idle,
                since_ms: 0,
                idle_after_ms: None,
            },
        }
    }

    pub fn current(&self) -> DerivedPetState {
        self.current.clone()
    }

    pub fn apply_event(&mut self, event: RuntimeEvent, now_ms: u64) -> DerivedPetState {
        let Some(next) = map_event_to_state(&event) else {
            return self.current();
        };
        if next == PetStateId::Idle {
            return self.request_idle(now_ms);
        }

        let idle_after_ms = next
            .automatic_idle_delay_ms()
            .map(|delay_ms| now_ms.saturating_add(delay_ms));
        self.set_state(next, now_ms, idle_after_ms)
    }

    pub fn advance_time(&mut self, now_ms: u64) -> DerivedPetState {
        if self
            .current
            .idle_after_ms
            .is_some_and(|idle_after| now_ms >= idle_after)
        {
            self.set_state(PetStateId::Idle, now_ms, None);
        }

        self.current()
    }

    fn request_idle(&mut self, now_ms: u64) -> DerivedPetState {
        if self.current.state == PetStateId::Idle {
            return self.current();
        }

        if !matches!(
            self.current.state,
            PetStateId::Running | PetStateId::Review | PetStateId::Thinking
        ) {
            return self.set_state(PetStateId::Idle, now_ms, None);
        }

        let minimum_until = self.current.since_ms + MIN_DWELL_MS;
        if now_ms < minimum_until {
            self.current.idle_after_ms = Some(minimum_until);
            return self.current();
        }

        self.set_state(PetStateId::Idle, now_ms, None)
    }

    fn set_state(
        &mut self,
        state: PetStateId,
        now_ms: u64,
        idle_after_ms: Option<u64>,
    ) -> DerivedPetState {
        if self.current.state == state {
            self.current.idle_after_ms = idle_after_ms;
            return self.current();
        }

        self.current = DerivedPetState {
            state,
            since_ms: now_ms,
            idle_after_ms,
        };
        self.current()
    }
}

impl Default for EventStateEngine {
    fn default() -> Self {
        Self::new()
    }
}

pub fn normalize_runtime_event(mut event: RuntimeEvent) -> RuntimeEvent {
    if let Some(agent) = canonical_agent_id(&event.agent) {
        event.agent = agent.to_string();
    }
    if let Some(kind) = canonical_event_kind(&event.kind) {
        event.kind = kind.to_string();
    }
    event
}

pub fn canonical_agent_id(agent: &str) -> Option<&'static str> {
    match agent.trim().to_ascii_lowercase().as_str() {
        "claude" | "claude_code" | "claudecode" => Some("claude-code"),
        "cursor-agent" | "cursor_agent" | "cursoragent" => Some("cursor"),
        "open-code" | "open_code" => Some("opencode"),
        "pi-agent" | "pi_agent" | "piagent" => Some("pi"),
        _ => None,
    }
}

pub fn canonical_event_kind(kind: &str) -> Option<&'static str> {
    match kind.trim().to_ascii_lowercase().as_str() {
        "user.prompt" | "userpromptsubmit" | "beforeagent" | "beforesubmitprompt"
        | "before_agent_start" | "tui.prompt.append" => Some("user.prompt"),
        "thinking" => Some("thinking"),
        "tool.before" | "pretooluse" | "beforetool" | "tool.execute.before" | "tool_call" => {
            Some("tool.before")
        }
        "tool.after" | "posttooluse" | "aftertool" | "tool.execute.after" | "tool_result" => {
            Some("tool.after")
        }
        "permission.waiting" | "session.waiting" | "permissionrequest" | "notification"
        | "permission.asked" => Some("permission.waiting"),
        "session.stop" | "session.end" | "stop" | "sessionend" | "session.idle" | "agent_end"
        | "session_shutdown" => Some("session.stop"),
        "session.error" | "posttoolusefailure" => Some("session.error"),
        _ => None,
    }
}

pub fn agent_display_name(agent: &str) -> &str {
    match agent {
        "antigravity" => "Antigravity",
        "codex" => "Codex",
        "claude-code" => "Claude Code",
        "copilot" => "Copilot CLI",
        "cursor" => "Cursor",
        "gemini" => "Gemini",
        "opencode" => "OpenCode",
        "pi" => "Pi",
        _ => agent,
    }
}

fn is_test_command(tool_input: Option<&Value>) -> bool {
    let Some(command) = tool_input
        .and_then(|input| input.get("command"))
        .and_then(Value::as_str)
    else {
        return false;
    };

    let lowered = command.to_ascii_lowercase();
    const TEST_NEEDLES: &[&str] = &[
        "cargo test",
        "cargo nextest",
        "pnpm test",
        "npm test",
        "yarn test",
        "pytest",
        "go test",
        "jest",
        "vitest",
        "playwright test",
        "mocha",
        "rspec",
        "phpunit",
        "dotnet test",
        "gradle test",
        "mvn test",
    ];
    TEST_NEEDLES.iter().any(|needle| lowered.contains(needle))
}

fn map_event_to_state(event: &RuntimeEvent) -> Option<PetStateId> {
    match event.kind.as_str() {
        "user.prompt" => Some(PetStateId::Jumping),
        "tool.before"
            if is_review_tool(event.tool.as_deref())
                || is_test_command(event.tool_input.as_ref()) =>
        {
            Some(PetStateId::Review)
        }
        "tool.before" => Some(PetStateId::Running),
        "tool.after" => Some(PetStateId::Idle),
        "permission.waiting" | "session.waiting" => Some(PetStateId::Waiting),
        "session.stop" | "session.end" => Some(PetStateId::Waving),
        "session.error" => Some(PetStateId::Failed),
        "thinking" => Some(PetStateId::Thinking),
        _ => None,
    }
}

fn is_review_tool(tool: Option<&str>) -> bool {
    matches!(
        tool.map(|value| value.to_ascii_lowercase()),
        Some(tool)
            if matches!(
                tool.as_str(),
                "read" | "grep" | "glob" | "ls" | "find" | "search" | "websearch"
            )
    )
}

pub struct TokenBucket {
    sustained_per_second: f64,
    burst: f64,
    tokens: f64,
    last_refill_ms: u64,
}

impl TokenBucket {
    pub fn new(sustained_per_second: u32, burst: u32) -> Self {
        let burst = burst as f64;
        Self {
            sustained_per_second: sustained_per_second as f64,
            burst,
            tokens: burst,
            last_refill_ms: 0,
        }
    }

    pub fn allow(&mut self, now_ms: u64) -> bool {
        self.refill(now_ms);
        if self.tokens < 1.0 {
            return false;
        }

        self.tokens -= 1.0;
        true
    }

    fn refill(&mut self, now_ms: u64) {
        if now_ms <= self.last_refill_ms {
            return;
        }

        let elapsed_ms = now_ms - self.last_refill_ms;
        let refill = (elapsed_ms as f64 / 1_000.0) * self.sustained_per_second;
        self.tokens = (self.tokens + refill).min(self.burst);
        self.last_refill_ms = now_ms;
    }
}

pub struct BoundedEventQueue {
    events: VecDeque<RuntimeEvent>,
    capacity: usize,
}

impl BoundedEventQueue {
    pub fn new(capacity: usize) -> Self {
        Self {
            events: VecDeque::new(),
            capacity,
        }
    }

    pub fn push(&mut self, event: RuntimeEvent) {
        if self.capacity == 0 {
            return;
        }

        while self.events.len() >= self.capacity {
            self.events.pop_front();
        }

        self.events.push_back(event);
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn pop_front(&mut self) -> Option<RuntimeEvent> {
        self.events.pop_front()
    }
}
