use std::{
    fs,
    path::{Path, PathBuf},
};

use serde_json::{json, Value};

use super::super::{
    agents_now_ms_for_marker, write_atomic, write_json_atomic, AdapterError, AgentManager,
    CliAdapter,
};

pub(super) static ADAPTER: PiAdapter = PiAdapter;

const MARKER_FILE: &str = ".copet-managed.json";
const EXTENSION_FILE: &str = "index.ts";

pub(super) struct PiAdapter;

impl CliAdapter for PiAdapter {
    fn id(&self) -> &'static str {
        "pi"
    }

    fn display_name(&self) -> &'static str {
        "Pi"
    }

    fn config_path(&self, home: &Path) -> PathBuf {
        extension_dir(home).join(EXTENSION_FILE)
    }

    fn is_installed(
        &self,
        _manager: &AgentManager,
        config_path: &Path,
    ) -> Result<bool, AdapterError> {
        let Some(dir) = config_path.parent() else {
            return Ok(false);
        };
        if is_symlink(dir) {
            return Ok(false);
        }
        Ok(
            is_managed_marker(&read_json_if_present(&dir.join(MARKER_FILE)))
                && is_current_extension_source(config_path),
        )
    }

    fn install(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        let dir = extension_dir(manager.home());
        if is_symlink(&dir) {
            return Err(AdapterError::UnmanagedPiExtension(dir));
        }
        if dir.exists() && !is_managed_marker(&read_json_if_present(&dir.join(MARKER_FILE))) {
            return Err(AdapterError::UnmanagedPiExtension(dir));
        }

        fs::create_dir_all(&dir)?;
        write_atomic(&dir.join(EXTENSION_FILE), pi_extension_source().as_bytes())?;
        write_json_atomic(&dir.join(MARKER_FILE), &marker_json())?;
        Ok(())
    }

    fn uninstall(&self, manager: &AgentManager) -> Result<(), AdapterError> {
        let dir = extension_dir(manager.home());
        if is_symlink(&dir) {
            return Err(AdapterError::UnmanagedPiExtensionRemoval(dir));
        }
        if !dir.exists() {
            return Ok(());
        }
        if !is_managed_marker(&read_json_if_present(&dir.join(MARKER_FILE))) {
            return Err(AdapterError::UnmanagedPiExtensionRemoval(dir));
        }
        fs::remove_dir_all(dir)?;
        Ok(())
    }

    fn executable_names(&self) -> &'static [&'static str] {
        &["pi"]
    }
}

fn extension_dir(home: &Path) -> PathBuf {
    home.join(".pi")
        .join("agent")
        .join("extensions")
        .join("copet")
}

fn read_json_if_present(path: &Path) -> Option<Value> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn is_managed_marker(value: &Option<Value>) -> bool {
    value.as_ref().is_some_and(|value| {
        value.get("app").and_then(Value::as_str) == Some("copet")
            && value.get("integration").and_then(Value::as_str) == Some("pi")
            && value.get("managed").and_then(Value::as_bool) == Some(true)
    })
}

fn is_current_extension_source(path: &Path) -> bool {
    fs::read_to_string(path).is_ok_and(|source| source == pi_extension_source())
}

fn marker_json() -> Value {
    json!({
        "app": "copet",
        "integration": "pi",
        "managed": true,
        "version": 1,
        "installedAtMs": agents_now_ms_for_marker()
    })
}

fn pi_extension_source() -> &'static str {
    r#"// copet-managed-pi-extension
import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

const RUNTIME_DIR = path.join(os.homedir(), ".copet", "runtime");
const ENDPOINT_PATH = path.join(RUNTIME_DIR, "event-endpoint");
const TOKEN_PATH = path.join(RUNTIME_DIR, "event-token");
const EVENTS_PATH = "/v1/events";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const TIMEOUT_MS = 150;

type RuntimePayload = {
  agent: "pi";
  kind: string;
  tool?: string;
  toolInput?: Record<string, string>;
  sessionId?: string;
};

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function sessionId(ctx: ExtensionContext): string | undefined {
  const manager = (ctx as any).sessionManager;
  const id = manager && typeof manager.getSessionId === "function" ? manager.getSessionId() : "";
  return typeof id === "string" && id ? `pi:${id}` : undefined;
}

function stringField(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return undefined;
}

function payload(kind: string, nativeEvent: ExtensionEvent, ctx: ExtensionContext): RuntimePayload {
  const result: RuntimePayload = { agent: "pi", kind };
  const tool = stringField(nativeEvent, ["toolName", "tool_name", "name"]);
  if (tool) result.tool = tool;
  const detail = stringField(nativeEvent, ["command", "file_path", "filePath", "path", "url", "prompt", "message"]);
  if (detail) {
    const key = detail.startsWith("/") ? "filePath" : "command";
    result.toolInput = { [key]: detail };
  }
  const id = sessionId(ctx);
  if (id) result.sessionId = id;
  return result;
}

function endpointUrl(endpoint: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return undefined;
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (url.protocol !== "http:") return undefined;
  if (!LOOPBACK_HOSTS.has(hostname)) return undefined;
  if (url.pathname !== EVENTS_PATH) return undefined;
  return url;
}

function post(payload: RuntimePayload): Promise<boolean> {
  return new Promise((resolve) => {
    const endpoint = readText(ENDPOINT_PATH);
    const token = readText(TOKEN_PATH);
    if (!endpoint || !token) {
      resolve(false);
      return;
    }
    const url = endpointUrl(endpoint);
    if (!url) {
      resolve(false);
      return;
    }
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        timeout: TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        resolve((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end(body);
  });
}

function shouldReport(ctx: ExtensionContext): boolean {
  if (typeof (ctx as any).hasUI === "boolean") return (ctx as any).hasUI;
  return !!(process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY);
}

function send(kind: string, nativeEvent: ExtensionEvent, ctx: ExtensionContext): void {
  if (!shouldReport(ctx)) return;
  post(payload(kind, nativeEvent, ctx)).catch(() => {});
}

async function sendAndDrain(kind: string, nativeEvent: ExtensionEvent, ctx: ExtensionContext): Promise<void> {
  if (!shouldReport(ctx)) return;
  await post(payload(kind, nativeEvent, ctx));
}

export default function copetPiExtension(pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event, ctx) => {
    send("user.prompt", event, ctx);
  });
  pi.on("tool_call", (event, ctx) => {
    send("tool.before", event, ctx);
  });
  pi.on("tool_result", (event, ctx) => {
    const isError = !!(event && (event as any).isError);
    send(isError ? "session.error" : "tool.after", event, ctx);
  });
  pi.on("agent_end", (event, ctx) => {
    send("session.stop", event, ctx);
  });
  pi.on("session_shutdown", async (event, ctx) => {
    await sendAndDrain("session.stop", event, ctx);
  });
}
"#
}
