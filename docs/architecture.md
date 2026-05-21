# CoPet Architecture

[简体中文](./architecture.zh.md)

CoPet is a Tauri-based desktop pet client for AI Agent CLI workflows including Claude Code, Codex, Gemini, and OpenCode. The app ships with a built-in pet that's available on first launch. On first startup, CoPet checks for supported Agent CLI executables and automatically writes hooks for detected agents; after that, Settings remains the manual source of truth for enabling, disabling, and repairing hooks. CoPet maps Agent lifecycle events into a layered pet state.

## Overall structure

```text
Tauri Web UI (React 18 + Vite + TypeScript)
  ├── pet window      transparent, always-on-top, non-focusable
  └── settings window resizable, hides on close
        │ Tauri commands / events
        ▼
Rust Core (copet_lib)
  ├── config & persistence (app_state, config_store)
  ├── pet packages (pet_package, pet_registry)
  ├── Agent adapters (Claude / Codex / Gemini / OpenCode)
  ├── runtime server   local HTTP endpoint + token + event queue
  ├── runtime state    event → pet state mapping
  ├── windows, tray, i18n, diagnostics
        │ localhost event posts (short-lived hook commands)
        ▼
Agent CLI Hooks
```

The Tauri app is the only long-running process; Agent CLI hooks are short-lived commands. When CoPet is not running, hooks must exit silently and never block an Agent session.

Top-level layout: `src-tauri/src/` (Rust Core), `src/` (React UI), `docs/` (this document). See [AGENTS.md](../AGENTS.md) for file-naming conventions.

## Processes and windows

The app registers two webviews:

- **`pet`** — floating desktop pet. Transparent, undecorated, non-focusable. Closing it exits the app.
- **`settings`** — settings center. Closing it only hides the window.

On macOS, `tauri_nspanel` converts `pet` into an accessory NSPanel, and the `window_placement` module keeps the z-order stable. The tray menu provides project homepage, settings, and quit, with copy that follows the active locale.

## Data layout

All CoPet-owned data lives under `~/.copet`:

```text
~/.copet/
  config.json          # preferences and one-time migration flags
  runtime/             # volatile runtime (token, logs, diagnostics) — rebuildable
  pets/                # user-installed pets (incl. copies imported from ~/.codex/pets)
  backups/<adapter>/   # original bytes captured before any CLI config edit
  adapters/<id>.json   # CoPet-owned hook metadata
```

**Built-in pets are not written to `~/.copet/pets`** — they're loaded from the bundle resource `assets/pets`, so deleting `~/.copet` cannot break them. The `assetProtocol.scope` in `tauri.conf.json` limits webview-readable paths to `~/.copet/pets`, `~/.codex/pets`, and the bundle resource dir.

## Pet packages

CoPet uses Codex-compatible pet packages: `pet.json` + `spritesheet.webp` (or `.png`), default 8×9 grid. The nine state rows are `idle`, `running-right`, `running-left`, `waving`, `jumping`, `failed`, `waiting`, `running`, `review`.

Validation: `pet.json` must be valid JSON within a size cap; spritesheet capped at 16 MB; corrupted packages are hidden from the list and surfaced in diagnostics — they must not crash startup.

Pet sources: built-in (bundle resource, cannot be uninstalled), import from `~/.codex/pets`, or import a local folder/file.

## Runtime event model

`RuntimeManager` binds an HTTP endpoint on `127.0.0.1:<port>`. Hooks send compact events with a bearer token:

```json
{ "agent": "codex", "kind": "tool.before", "tool": "Read", "timestamp": 1778834400000 }
```

`runtime_state::EventStateEngine` maps events to pet states (`user.prompt → jumping`, `tool.before → running`/`review`, `tool.after → idle`, `permission.waiting → waiting`, `session.stop → waving`, `session.error → failed`) and broadcasts the result through `pet-state-changed` to both windows. State mapping lives in the Rust Core — hooks only carry metadata.

## Layered pet state

The frontend composes several concurrent dimensions into a spritesheet row (`composeLayers` in `src/lib/petAnimation.ts`), in priority order:

1. `motion` (dragging)
2. `input` (immediate user input)
3. `agent` (Agent CLI-derived state)
4. `base` (idle fallback)
5. `emotion` sticker, overlaid on whichever layer wins

This lets the pet reflect Agent state and immediate user interaction simultaneously, without one source overwriting the other.

## Agent adapter contract

Every adapter implements the same Rust trait (`src-tauri/src/agents/mod.rs`):

```rust
trait AgentAdapter {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn detect(&self) -> DetectResult;
    fn inspect(&self) -> InspectResult;
    fn install(&self, hook: HookCommand) -> InstallResult;
    fn uninstall(&self) -> UninstallResult;
    fn repair(&self, hook: HookCommand) -> InstallResult;
}
```

Adapters are responsible for: resolving platform-specific config paths; parsing existing config without dropping user settings; writing only CoPet-owned entries (with a stable id); backing originals up to `~/.copet/backups/<adapter-id>/` before modification; and recording metadata to `~/.copet/adapters/<id>.json`. Core is responsible for: generating the hook command, providing the runtime endpoint/token, mapping events to state, and localizing errors.

Startup auto-install is executable-based, not config-file-based: CoPet checks adapter `executable_names()` once per config directory, installs hooks for detected CLIs that are not already installed, records completion in `config.json`, and does not auto-install again after a user manually disables an adapter.

Default config locations: Claude Code → `~/.claude/settings.json`; Codex → `~/.codex/hooks.json` + `config.toml`; Gemini → per the official docs; OpenCode honors `OPENCODE_CONFIG_DIR` / `XDG_CONFIG_HOME`.

## Long-running performance

Agent CLIs may run for hours. Constraints:

- Hook commands: 500–1000 ms timeout, no UI wait, exit silently when CoPet isn't running, avoid heavy interpreters.
- Runtime: bind only to `127.0.0.1`; generate a fresh `RuntimeToken` per launch; `TokenBucket` rate-limit (30/s sustained, 60 burst); `BoundedEventQueue` capped at 50; coalesce high-frequency thrash; minimum dwell time 200–300 ms; logs rotate by size, memory does not grow with session length.
- UI: sprite animation driven by CSS/canvas. The UI subscribes to derived layers, not raw event streams. Honors system reduced-motion.

## Security model

- The event server binds only to `127.0.0.1`, requires a bearer token, caps body at 16 KB, ignores unknown event kinds, and never executes event payloads as commands.
- Hook config writes only target adapter-known paths, parse before writing, refuse to overwrite malformed files (unless the user explicitly repairs), back up before first write, and on uninstall remove only entries tagged with CoPet metadata. Writes are atomic where possible.
- `assetProtocol.scope` strictly whitelists webview-readable resources.
- `pet.json` is treated as untrusted input; pet packages never execute scripts; images go through the browser or native safe decoders.

## Internationalization

`Locale::EnUs` / `Locale::ZhCn`, either explicit or system-following. The Rust-side `MessageKey` enum and the frontend `src/lib/i18n.ts` mirror the same key set; locale changes trigger immediate refresh via the `copet-app-state-changed` event.

## Cross-platform

- Paths: use Rust path APIs (no string concatenation); resolve home via the `dirs` crate; OpenCode honors `OPENCODE_CONFIG_DIR` / `XDG_CONFIG_HOME`.
- Windows: macOS uses `tauri_nspanel` + `macos-private-api`; Windows uses the `windows` crate; on Linux, transparency/always-on-top depend on the compositor — degrade and surface the limitation in diagnostics when unavailable.
- Packaged hook commands prefer absolute paths to CoPet helpers and handle spaces in install paths correctly.

## Testing

- **Rust integration tests** live under `src-tauri/tests/`: config persistence, runtime HTTP/state machine, agent adapters, windowing/diagnostics/i18n.
- **Frontend Playwright** lives under `src/tests/`: layered animation, gestures, cross-window events, settings workflows. Shared `app-harness.ts` factory.

Verification commands:

```sh
pnpm test:frontend
pnpm test:rust
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
pnpm verify:hardening   # full smoke: build + cargo test + tauri build --bundles app
```

## References

- Tauri: https://tauri.app/
- tauri-nspanel: https://github.com/ahkohd/tauri-nspanel
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Codex hooks: https://developers.openai.com/codex/hooks
- OpenCode: https://opencode.ai/docs/config/ · https://opencode.ai/docs/plugins/
