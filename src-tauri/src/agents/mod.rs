mod adapters;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) const COPET_MARKER: &str = "copet-managed-hook";
pub(crate) const HELPER_NAME: &str = "copet-hook.sh";

static ADAPTERS: [&dyn CliAdapter; 5] = [
    adapters::CLAUDE_CODE,
    adapters::CODEX,
    adapters::ANTIGRAVITY,
    adapters::OPENCODE,
    adapters::GEMINI,
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterSummary {
    pub id: String,
    pub display_name: String,
    pub config_path: String,
    pub installed: bool,
    pub healthy: bool,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterOperationResult {
    pub adapter: AdapterSummary,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AutoInstallSummary {
    pub installed: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<AutoInstallFailure>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutoInstallFailure {
    pub adapter_id: String,
    pub error: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AdapterError {
    #[error("unknown adapter '{0}'")]
    UnknownAdapter(String),
    #[error("I/O error: {0}")]
    Io(#[from] io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("refusing to overwrite invalid JSON at {0}")]
    InvalidJson(PathBuf),
    #[error("{display_name} is not installed or not available on PATH")]
    AgentExecutableMissing { display_name: String },
}

pub(crate) trait CliAdapter: Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn config_path(&self, home: &Path) -> PathBuf;
    fn is_installed(&self, config_path: &Path) -> Result<bool, AdapterError>;
    fn install(&self, manager: &AgentManager) -> Result<(), AdapterError>;
    fn uninstall(&self, manager: &AgentManager) -> Result<(), AdapterError>;
    fn executable_names(&self) -> &'static [&'static str];
}

#[derive(Debug, Clone)]
pub struct AgentManager {
    copet_root: PathBuf,
    home: PathBuf,
    executable_search_paths: Vec<PathBuf>,
}

impl AgentManager {
    pub fn from_home(copet_root: impl Into<PathBuf>) -> Result<Self, AdapterError> {
        let home = dirs::home_dir().ok_or_else(|| {
            io::Error::new(io::ErrorKind::NotFound, "home directory was not found")
        })?;
        Ok(Self::new(copet_root, home))
    }

    pub fn new(copet_root: impl Into<PathBuf>, home: impl Into<PathBuf>) -> Self {
        Self::new_with_executable_search_paths(
            copet_root,
            home,
            env::var_os("PATH")
                .map(|path| env::split_paths(&path).collect())
                .unwrap_or_default(),
        )
    }

    pub fn new_with_executable_search_paths(
        copet_root: impl Into<PathBuf>,
        home: impl Into<PathBuf>,
        executable_search_paths: Vec<PathBuf>,
    ) -> Self {
        let home = home.into();
        Self {
            copet_root: copet_root.into(),
            executable_search_paths: executable_search_paths_with_defaults(
                &home,
                executable_search_paths,
            ),
            home,
        }
    }

    pub fn new_with_exact_executable_search_paths(
        copet_root: impl Into<PathBuf>,
        home: impl Into<PathBuf>,
        executable_search_paths: Vec<PathBuf>,
    ) -> Self {
        Self {
            copet_root: copet_root.into(),
            home: home.into(),
            executable_search_paths,
        }
    }

    pub fn list(&self) -> Result<Vec<AdapterSummary>, AdapterError> {
        ADAPTERS
            .iter()
            .map(|adapter| self.inspect(adapter.id()))
            .collect()
    }

    pub fn inspect(&self, id: &str) -> Result<AdapterSummary, AdapterError> {
        let adapter = adapter_by_id(id)?;
        let config_path = adapter.config_path(&self.home);
        let installed = adapter.is_installed(&config_path)?;

        Ok(AdapterSummary {
            id: adapter.id().to_string(),
            display_name: adapter.display_name().to_string(),
            config_path: config_path.to_string_lossy().into_owned(),
            installed,
            healthy: installed,
            message: if installed {
                "CoPet hook installed".to_string()
            } else if config_path.exists() {
                "Configuration found; CoPet hook not installed".to_string()
            } else {
                "Configuration path not created yet".to_string()
            },
        })
    }

    pub fn install(&self, id: &str) -> Result<AdapterOperationResult, AdapterError> {
        let adapter = adapter_by_id(id)?;
        self.ensure_agent_executable(adapter)?;
        self.ensure_helper()?;
        adapter.install(self)?;
        self.write_metadata(adapter.id(), adapter.config_path(&self.home), true)?;
        Ok(AdapterOperationResult {
            adapter: self.inspect(adapter.id())?,
        })
    }

    pub fn uninstall(&self, id: &str) -> Result<AdapterOperationResult, AdapterError> {
        let adapter = adapter_by_id(id)?;
        adapter.uninstall(self)?;
        self.remove_metadata(adapter.id())?;
        Ok(AdapterOperationResult {
            adapter: self.inspect(adapter.id())?,
        })
    }

    pub fn repair(&self, id: &str) -> Result<AdapterOperationResult, AdapterError> {
        self.uninstall(id)?;
        self.install(id)
    }

    pub fn auto_install_detected_agents(&self) -> AutoInstallSummary {
        let mut summary = AutoInstallSummary::default();

        for adapter in ADAPTERS {
            let adapter_id = adapter.id().to_string();
            if !self.adapter_executable_available(adapter) {
                summary.skipped.push(adapter_id);
                continue;
            }

            match self.inspect(adapter.id()) {
                Ok(current) if current.installed => {
                    summary.skipped.push(adapter_id);
                    continue;
                }
                Ok(_) => {}
                Err(error) => {
                    summary.failed.push(AutoInstallFailure {
                        adapter_id,
                        error: error.to_string(),
                    });
                    continue;
                }
            }

            match self.install(adapter.id()) {
                Ok(_) => summary.installed.push(adapter_id),
                Err(error) => summary.failed.push(AutoInstallFailure {
                    adapter_id,
                    error: error.to_string(),
                }),
            }
        }

        summary
    }

    pub(crate) fn home(&self) -> &Path {
        &self.home
    }

    pub(crate) fn helper_path(&self) -> PathBuf {
        self.copet_root.join("hooks").join(HELPER_NAME)
    }

    fn adapter_executable_available(&self, adapter: &dyn CliAdapter) -> bool {
        adapter
            .executable_names()
            .iter()
            .any(|name| self.executable_exists(name))
    }

    fn ensure_agent_executable(&self, adapter: &dyn CliAdapter) -> Result<(), AdapterError> {
        if self.adapter_executable_available(adapter) {
            return Ok(());
        }

        Err(AdapterError::AgentExecutableMissing {
            display_name: adapter.display_name().to_string(),
        })
    }

    fn executable_exists(&self, name: &str) -> bool {
        executable_candidates(name).iter().any(|candidate| {
            self.executable_search_paths
                .iter()
                .any(|dir| is_executable_file(&dir.join(candidate)))
        })
    }

    pub(crate) fn backup_file(
        &self,
        adapter_id: &str,
        source_path: &Path,
    ) -> Result<(), AdapterError> {
        if !source_path.exists() {
            return Ok(());
        }

        let file_name = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("config");
        let path = self
            .copet_root
            .join("backups")
            .join(adapter_id)
            .join(format!("{}-{file_name}.bak", now_ms()));
        ensure_parent(&path)?;
        fs::copy(source_path, path)?;
        Ok(())
    }

    fn ensure_helper(&self) -> Result<(), AdapterError> {
        let path = self.helper_path();
        ensure_parent(&path)?;
        write_atomic(&path, helper_script().as_bytes())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&path)?.permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&path, permissions)?;
        }
        Ok(())
    }

    fn write_metadata(
        &self,
        adapter_id: &str,
        config_path: PathBuf,
        installed: bool,
    ) -> Result<(), AdapterError> {
        let path = self.metadata_path(adapter_id);
        ensure_parent(&path)?;
        let value = json!({
            "adapterId": adapter_id,
            "configPath": config_path,
            "installed": installed,
            "updatedAtMs": now_ms(),
        });
        write_json_atomic(&path, &value)?;
        Ok(())
    }

    fn remove_metadata(&self, adapter_id: &str) -> Result<(), AdapterError> {
        let path = self.metadata_path(adapter_id);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    fn metadata_path(&self, adapter_id: &str) -> PathBuf {
        self.copet_root
            .join("adapters")
            .join(format!("{adapter_id}.json"))
    }
}

fn adapter_by_id(id: &str) -> Result<&'static dyn CliAdapter, AdapterError> {
    ADAPTERS
        .iter()
        .copied()
        .find(|adapter| adapter.id() == id)
        .ok_or_else(|| AdapterError::UnknownAdapter(id.to_string()))
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct HookEvent {
    pub cli_event: &'static str,
    pub matcher: Option<&'static str>,
    pub kind: &'static str,
}

pub(crate) fn install_json_hooks(
    manager: &AgentManager,
    adapter_id: &str,
    path: &Path,
    events: &[HookEvent],
    timeout: u64,
) -> Result<(), AdapterError> {
    manager.backup_file(adapter_id, path)?;
    let mut value = read_json_object_optional(path)?.unwrap_or_else(|| json!({}));
    remove_copet_hooks(&mut value, adapter_id);
    merge_hook_entries(
        &mut value,
        adapter_id,
        &manager.helper_path(),
        events,
        timeout,
    );
    write_json_atomic(path, &value)?;
    Ok(())
}

pub(crate) fn remove_json_hooks(
    manager: &AgentManager,
    adapter_id: &str,
    path: &Path,
) -> Result<(), AdapterError> {
    if !path.exists() {
        return Ok(());
    }

    manager.backup_file(adapter_id, path)?;
    let mut value = read_json_object_required(path)?;
    remove_copet_hooks(&mut value, adapter_id);
    write_json_atomic(path, &value)?;
    Ok(())
}

pub(crate) fn json_config_has_copet_hook(
    path: &Path,
    adapter_id: &str,
) -> Result<bool, AdapterError> {
    Ok(read_json_object_optional(path)?.is_some_and(|value| {
        value
            .to_string()
            .split("\\\"")
            .any(|part| is_copet_command(part, adapter_id))
    }))
}

pub(crate) fn json_config_has_copet_hooks(
    path: &Path,
    adapter_id: &str,
    events: &[HookEvent],
) -> Result<bool, AdapterError> {
    let Some(value) = read_json_object_optional(path)? else {
        return Ok(false);
    };
    let Some(hooks) = value.get("hooks").and_then(Value::as_object) else {
        return Ok(false);
    };

    Ok(events.iter().all(|event| {
        hooks
            .get(event.cli_event)
            .and_then(Value::as_array)
            .is_some_and(|groups| {
                groups
                    .iter()
                    .any(|group| hook_group_matches_event(group, adapter_id, event))
            })
    }))
}

fn hook_group_matches_event(group: &Value, adapter_id: &str, event: &HookEvent) -> bool {
    if let Some(expected_matcher) = event.matcher {
        let matcher = group.get("matcher").and_then(Value::as_str);
        if matcher != Some(expected_matcher) {
            return false;
        }
    }

    group
        .get("hooks")
        .and_then(Value::as_array)
        .is_some_and(|handlers| {
            handlers.iter().any(|handler| {
                handler
                    .get("command")
                    .and_then(Value::as_str)
                    .is_some_and(|command| {
                        is_copet_command(command, adapter_id)
                            && command.contains(&format!(" {}", event.kind))
                    })
            })
        })
}

fn merge_hook_entries(
    value: &mut Value,
    adapter_id: &str,
    helper_path: &Path,
    events: &[HookEvent],
    timeout: u64,
) {
    let object = value.as_object_mut().expect("config must be JSON object");
    let hooks = object.entry("hooks").or_insert_with(|| json!({}));
    let hooks_object = hooks.as_object_mut().expect("hooks must be JSON object");

    for event in events {
        let mut group = json!({
            "hooks": [{
                "type": "command",
                "command": hook_command(adapter_id, helper_path, event.kind),
                "timeout": timeout,
                "statusMessage": "Updating CoPet"
            }]
        });
        if let Some(matcher) = event.matcher {
            group["matcher"] = json!(matcher);
        }
        hooks_object
            .entry(event.cli_event)
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .expect("event hooks must be arrays")
            .insert(0, group);
    }
}

fn remove_copet_hooks(value: &mut Value, adapter_id: &str) {
    let Some(hooks) = value.get_mut("hooks").and_then(Value::as_object_mut) else {
        return;
    };
    for groups in hooks.values_mut() {
        let Some(groups) = groups.as_array_mut() else {
            continue;
        };
        for group in groups.iter_mut() {
            if let Some(handlers) = group.get_mut("hooks").and_then(Value::as_array_mut) {
                handlers.retain(|handler| {
                    !handler
                        .get("command")
                        .and_then(Value::as_str)
                        .is_some_and(|command| is_copet_command(command, adapter_id))
                });
            }
        }
        groups.retain(|group| {
            group
                .get("hooks")
                .and_then(Value::as_array)
                .is_some_and(|handlers| !handlers.is_empty())
        });
    }
}

fn is_copet_command(command: &str, adapter_id: &str) -> bool {
    command.contains(HELPER_NAME) && command.contains(&format!(" {adapter_id} "))
}

fn hook_command(adapter_id: &str, helper_path: &Path, kind: &str) -> String {
    let path = shell_quote(&helper_path.to_string_lossy());
    let fallback_output = hook_default_output(adapter_id, kind);
    if fallback_output == "{}" {
        format!("if [ -f {path} ]; then {path} {adapter_id} {kind}; else echo \"{{}}\"; fi")
    } else {
        let fallback = shell_quote(fallback_output);
        format!(
            "if [ -f {path} ]; then {path} {adapter_id} {kind}; else printf '%s\\n' {fallback}; fi"
        )
    }
}

fn hook_default_output(adapter_id: &str, kind: &str) -> &'static str {
    if adapter_id == "antigravity" && matches!(kind, "tool.before" | "session.stop") {
        r#"{"decision":"allow"}"#
    } else {
        "{}"
    }
}

fn helper_script() -> &'static str {
    r#"#!/bin/sh
# copet-managed-hook
agent="${1:-unknown}"
kind="${2:-unknown}"
input="$(cat)"
compact_input="$(printf '%s' "$input" | tr '\n\r' '  ')"
json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}
json_string_field() {
  key="$1"
  printf '%s' "$compact_input" | sed -n 's/.*"'"$key"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}
json_string_field_after_key() {
  marker="$1"
  key="$2"
  printf '%s' "$compact_input" | sed -n 's/.*"'"$marker"'"[[:space:]]*:[[:space:]]*{.*"'"$key"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}
hook_output() {
  if [ "$agent" = "antigravity" ]; then
    case "$kind" in
      tool.before|session.stop)
        printf '{"decision":"allow"}\n'
        return
        ;;
    esac
  fi
  printf '{}\n'
}
tool="$(json_string_field tool_name)"
if [ -z "$tool" ]; then
  tool="$(json_string_field tool)"
fi
if [ -z "$tool" ]; then
  tool="$(json_string_field_after_key toolCall name)"
fi
tool_input=""
for field in file_path:file_path filePath:filePath path:path command:command CommandLine:command pattern:pattern url:url description:description subject:subject AbsolutePath:filePath TargetFile:filePath DirectoryPath:path SearchDirectory:path SearchPath:path Cwd:path Query:pattern query:pattern Pattern:pattern Url:url Description:description Instruction:subject Prompt:subject Input:subject Message:subject Reason:subject Action:subject Target:subject ImageName:subject; do
  source_key="${field%%:*}"
  output_key="${field#*:}"
  value="$(json_string_field "$source_key")"
  if [ -n "$value" ]; then
    escaped_value="$(json_escape "$value")"
    tool_input=",\"toolInput\":{\"$output_key\":\"$escaped_value\"}"
    break
  fi
done
runtime="${COPET_RUNTIME_DIR:-$HOME/.copet/runtime}"
endpoint="$(cat "$runtime/event-endpoint" 2>/dev/null)" || { hook_output ; exit 0; }
token="$(cat "$runtime/event-token" 2>/dev/null)" || { hook_output ; exit 0; }
[ -n "$endpoint" ] && [ -n "$token" ] || { hook_output ; exit 0; }
tool_field=""
if [ -n "$tool" ]; then
  escaped_tool="$(json_escape "$tool")"
  tool_field=",\"tool\":\"$escaped_tool\""
fi
payload="$(printf '{"agent":"%s","kind":"%s"%s%s}' "$(json_escape "$agent")" "$(json_escape "$kind")" "$tool_field" "$tool_input")"
curl -fsS --noproxy '*' --max-time 0.8 -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$payload" "$endpoint" >/dev/null 2>&1 || true
hook_output
exit 0
"#
}

pub(crate) fn read_json_object_optional(path: &Path) -> Result<Option<Value>, AdapterError> {
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(read_json_object_required(path)?))
}

pub(crate) fn read_json_object_required(path: &Path) -> Result<Value, AdapterError> {
    let bytes = fs::read(path)?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| AdapterError::InvalidJson(path.to_path_buf()))?;
    if !value.is_object() {
        return Err(AdapterError::InvalidJson(path.to_path_buf()));
    }
    Ok(value)
}

pub(crate) fn write_json_atomic(path: &Path, value: &Value) -> Result<(), AdapterError> {
    write_atomic(path, serde_json::to_vec_pretty(value)?.as_slice())
}

pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), AdapterError> {
    ensure_parent(path)?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(tmp, path)?;
    Ok(())
}

pub(crate) fn ensure_parent(path: &Path) -> Result<(), AdapterError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn executable_candidates(name: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        if Path::new(name).extension().is_some() {
            return vec![name.to_string()];
        }
        let extensions = env::var_os("PATHEXT")
            .and_then(|value| value.into_string().ok())
            .unwrap_or_else(|| ".COM;.EXE;.BAT;.CMD".to_string());
        return extensions
            .split(';')
            .filter(|extension| !extension.is_empty())
            .map(|extension| format!("{name}{extension}"))
            .chain(std::iter::once(name.to_string()))
            .collect();
    }

    #[cfg(not(windows))]
    {
        vec![name.to_string()]
    }
}

fn executable_search_paths_with_defaults(home: &Path, mut paths: Vec<PathBuf>) -> Vec<PathBuf> {
    for path in common_executable_search_paths(home) {
        if !paths.iter().any(|existing| existing == &path) {
            paths.push(path);
        }
    }
    paths
}

fn common_executable_search_paths(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".local/bin"),
        home.join(".cargo/bin"),
        home.join(".opencode/bin"),
        home.join(".npm/bin"),
        home.join(".npm-global/bin"),
        home.join(".pnpm-global/bin"),
        home.join("Library/pnpm"),
        home.join(".bun/bin"),
        home.join(".yarn/bin"),
        home.join(".volta/bin"),
        home.join(".asdf/shims"),
        home.join(".local/share/mise/shims"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
        PathBuf::from("/opt/local/bin"),
    ]
}

fn is_executable_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::metadata(path)
            .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }

    #[cfg(not(unix))]
    {
        true
    }
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
