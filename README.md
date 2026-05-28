<div align="center">
  <img src="./public/pet.png" alt="CoPet logo" width="120" />
  <h1>CoPet</h1>
  <p><strong>A living desktop companion for every AI Agent CLI session.</strong></p>
  <p>Driven by Codex pet packages, CoPet reacts in real time to Claude Code, Codex, Antigravity, OpenCode, Copilot CLI, and Gemini, turning prompts, tool use, waiting, and completions into lively desktop feedback.</p>
</div>

![CoPet](./public/banner.png)

[简体中文](./README.zh.md)

Built with Tauri, Rust, and React. Lightweight, local-first, no cloud.

## Features

- Real-time pet reactions to Agent prompts, tool use, waiting, completion, and errors.
- Integrations for Claude Code, Codex, Antigravity, OpenCode, Copilot CLI, and Gemini.
- Built-in pets plus import support for Codex-compatible pet packages.
- Rich pet interactions: hover, click, double-click, rapid-click petting, long-press, drag reactions, and native context menu.
- Global and per-pet sound packs for interactions and Agent states.
- Settings and tray controls for pets, Agent hooks, sounds, language, visibility, and window position.
- Local-first data model in `~/.copet`, with safe hook backups, atomic writes, and no telemetry.
- Bilingual UI (English / 简体中文).

## Customize your pet

CoPet is not limited to built-in pets. The [CoPet Skill series](./skills/README.md) helps you turn a character idea, team mascot, or personal avatar into your own desktop companion:

- [`copet-gen`](./skills/copet-gen/SKILL.md) generates and installs custom CoPet pet packages with `pet.json` and `spritesheet.webp`, so your own character can react to Agent activity.
- [`copet-sound`](./skills/copet-sound/SKILL.md) creates matching 11-clip MP3 sound packs for clicks, gestures, waiting, success, and error states.

Install CoPet Skills for Codex with either method.

From a terminal:

```bash
npx skills add ChanceYu/CoPet --skill '*' -a codex -g -y
```

Inside Codex:

```text
$skill-installer install all CoPet skills from https://github.com/ChanceYu/CoPet/tree/main/skills
```

Restart Codex if the newly installed Skills do not appear.

## Supported agents

| Agent | Integration | Default config path |
| --- | --- | --- |
| Claude Code | JSON hooks | `~/.claude/settings.json` |
| Codex | JSON hooks + trusted hook hashes | `~/.codex/hooks.json`, `~/.codex/config.toml` |
| Antigravity | JSON hooks | `~/.gemini/config/hooks.json` |
| OpenCode | JS plugin + config entry | `~/.config/opencode/plugins/copet.js`, `~/.config/opencode/opencode.json` |
| Copilot CLI | JSON hook file | `~/.copilot/hooks/copet.json` |
| Gemini | JSON hooks | `~/.gemini/settings.json` |

## Installation

| Platform | Download |
| --- | --- |
| macOS (Universal) | [CoPet-macos-universal.dmg](https://github.com/ChanceYu/CoPet/releases/latest/download/CoPet-macos-universal.dmg) |
| Windows x64 | [CoPet-windows-x64.exe](https://github.com/ChanceYu/CoPet/releases/latest/download/CoPet-windows-x64.exe) |
| Windows arm64 | [CoPet-windows-arm64.exe](https://github.com/ChanceYu/CoPet/releases/latest/download/CoPet-windows-arm64.exe) |

[All releases](https://github.com/ChanceYu/CoPet/releases)

### macOS

Drag `CoPet.app` into `/Applications`. The build is not notarized, so run once to clear the quarantine flag:

```bash
sudo xattr -rd com.apple.quarantine /Applications/CoPet.app
```

### Windows

Windows builds are not code-signed. SmartScreen may warn on first launch — click *More info* → *Run anyway*.

## Getting started

Prerequisites: [Rust](https://www.rust-lang.org/tools/install), [Node.js](https://nodejs.org/) with pnpm. Runs on macOS (primary), Windows, and Linux.

```bash
git clone https://github.com/ChanceYu/CoPet.git
cd CoPet
pnpm install
pnpm tauri:dev          # development
pnpm tauri:build        # production bundle
```

## Project layout

- `src-tauri/` — Rust core, agent adapters, runtime server.
- `src/` — React frontend (pet window + settings center).
- `src-tauri/assets/pets/` — built-in pet packages bundled with the app.
- `src-tauri/assets/sounds/` — built-in global sound packs bundled with the app.
- `skills/` — optional CoPet Skill docs for generating pets and 11-clip sound packs.
- `docs/architecture.md` — technical architecture and design.
- `AGENTS.md` — contributor guide and testing instructions.

## Security

- Event server binds only to `127.0.0.1`, requires a bearer token, rate-limits requests, and drops unknown payloads.
- All hook config changes are backed up before write and use atomic file ops.
- Pet and sound packages are treated as untrusted data and validated before use.
- `assetProtocol.scope` whitelists exactly which pet, sound, preview, and bundled resource directories the webview can read.

## Contributing

Issues and PRs welcome. Start with [AGENTS.md](AGENTS.md) for setup and conventions, and [docs/architecture.md](docs/architecture.md) for the system design.

## License

[MIT](LICENSE) © ChanceYu
