use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde_json::{json, Value};

use super::super::{
    ensure_parent, read_json_object_optional, read_json_object_required, write_atomic,
    write_json_atomic, AdapterError, AgentManager, CliAdapter, PETHOVER_MARKER,
};

pub(super) static ADAPTER: OpenCodeAdapter = OpenCodeAdapter;
const PLUGIN_ENTRY: &str = "./plugins/pethover.js";

/// OpenCode 适配器
///
/// 该适配器采用插件注入的方式与 OpenCode 集成：
/// - 修改文件: `~/.config/opencode/plugins/pethover.js` (路径受环境变量影响)
/// - 改动内容: 创建一个独立的 JavaScript 插件文件。
///   该插件通过 OpenCode 的插件系统导出 `PetHoverPlugin`，监听 TUI 提示、工具执行、
///   权限询问及会话状态等事件，并通过 `fetch` 直接将事件发送到 PetHover 的运行时服务器。
pub(super) struct OpenCodeAdapter;

impl CliAdapter for OpenCodeAdapter {
    fn id(&self) -> &'static str {
        "opencode"
    }

    fn display_name(&self) -> &'static str {
        "OpenCode"
    }

    fn config_path(&self, home: &Path) -> PathBuf {
        opencode_config_dir(home)
            .join("plugins")
            .join("pethover.js")
    }

    fn is_installed(&self, config_path: &Path) -> Result<bool, AdapterError> {
        let plugin_installed = config_path
            .is_file()
            .then(|| fs::read_to_string(config_path).ok())
            .flatten()
            .is_some_and(|content| content.contains(PETHOVER_MARKER));
        Ok(plugin_installed
            && opencode_config_has_plugin(&opencode_json_path_for_plugin(config_path))?)
    }

    fn install(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        let path = self.config_path(manager.home());
        let config_path = opencode_json_path(manager.home());
        manager.backup_file(self.id(), &path)?;
        manager.backup_file(self.id(), &config_path)?;
        ensure_parent(&path)?;
        write_atomic(&path, plugin_source().as_bytes())?;
        install_opencode_plugin_entry(&config_path)?;
        Ok(())
    }

    fn uninstall(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        let path = self.config_path(manager.home());
        if !path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&path)?;
        if content.contains(PETHOVER_MARKER) {
            manager.backup_file(self.id(), &path)?;
            fs::remove_file(&path)?;
        }
        let config_path = opencode_json_path(manager.home());
        if config_path.exists() {
            manager.backup_file(self.id(), &config_path)?;
            remove_opencode_plugin_entry(&config_path)?;
        }
        Ok(())
    }

    fn executable_names(&self) -> &'static [&'static str] {
        &["opencode"]
    }
}

fn opencode_config_dir(home: &Path) -> PathBuf {
    if let Some(path) = env::var_os("OPENCODE_CONFIG_DIR") {
        return PathBuf::from(path);
    }
    if let Some(path) = env::var_os("XDG_CONFIG_HOME") {
        return PathBuf::from(path).join("opencode");
    }
    home.join(".config").join("opencode")
}

fn opencode_json_path(home: &Path) -> PathBuf {
    opencode_config_dir(home).join("opencode.json")
}

fn opencode_json_path_for_plugin(plugin_path: &Path) -> PathBuf {
    plugin_path
        .parent()
        .and_then(Path::parent)
        .map(|config_dir| config_dir.join("opencode.json"))
        .unwrap_or_else(|| PathBuf::from("opencode.json"))
}

fn opencode_config_has_plugin(path: &Path) -> Result<bool, AdapterError> {
    Ok(read_json_object_optional(path)?.is_some_and(|value| {
        value
            .get("plugin")
            .and_then(Value::as_array)
            .is_some_and(|plugins| plugins.iter().any(is_pethover_plugin_entry))
    }))
}

fn install_opencode_plugin_entry(path: &Path) -> Result<(), AdapterError> {
    let mut value = read_json_object_optional(path)?.unwrap_or_else(|| json!({}));
    let object = value.as_object_mut().expect("config must be JSON object");
    let plugins = object.entry("plugin").or_insert_with(|| json!([]));
    if !plugins.is_array() {
        *plugins = json!([]);
    }
    let plugins = plugins.as_array_mut().expect("plugins must be array");
    if !plugins.iter().any(is_pethover_plugin_entry) {
        plugins.push(json!(PLUGIN_ENTRY));
    }
    write_json_atomic(path, &value)
}

fn remove_opencode_plugin_entry(path: &Path) -> Result<(), AdapterError> {
    let mut value = read_json_object_required(path)?;
    if let Some(plugins) = value.get_mut("plugin").and_then(Value::as_array_mut) {
        plugins.retain(|entry| !is_pethover_plugin_entry(entry));
    }
    write_json_atomic(path, &value)
}

fn is_pethover_plugin_entry(value: &Value) -> bool {
    value.as_str() == Some(PLUGIN_ENTRY)
}

fn plugin_source() -> &'static str {
    r#"// pethover-managed-hook
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

function postJson(endpoint, token, payload) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(endpoint);
    } catch {
      resolve();
      return;
    }
    if (url.protocol !== "http:") {
      resolve();
      return;
    }

    const body = JSON.stringify(payload);
    const request = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      timeout: 800,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (response) => {
      response.resume();
      response.on("end", resolve);
    });
    request.on("error", resolve);
    request.on("timeout", () => {
      request.destroy();
      resolve();
    });
    request.end(body);
  });
}

async function post(kind, tool, toolInput) {
  const runtime = process.env.PETHOVER_RUNTIME_DIR || path.join(os.homedir(), ".pethover", "runtime");
  let endpoint = "";
  let token = "";
  try {
    endpoint = fs.readFileSync(path.join(runtime, "event-endpoint"), "utf8").trim();
    token = fs.readFileSync(path.join(runtime, "event-token"), "utf8").trim();
  } catch {
    return;
  }
  if (!endpoint || !token) return;
  await postJson(endpoint, token, { agent: "opencode", kind, tool: tool || "", toolInput: toolInput || undefined });
}

export const PetHoverPlugin = async () => ({
  event: async (event) => {
    const type = event.event.type;
    if (type === "tui.prompt.append") await post("user.prompt", "");
    else if (type === "permission.asked") await post("permission.waiting", "");
    else if (type === "session.idle") await post("session.stop", "");
    else if (type === "session.error") await post("session.error", "");
  },
  "chat.message": async () => post("user.prompt", ""),
  "tool.execute.before": async (input, output) => post("tool.before", input?.tool, output?.args),
  "tool.execute.after": async (input) => post("tool.after", input?.tool, input?.args),
  "permission.ask": async () => post("permission.waiting", "")
});
"#
}
