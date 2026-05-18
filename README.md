# PetHover 🐾

**PetHover** is a delightful desktop companion for your AI Agent workflows. It brings a pixel-art pet to your desktop that reacts in real-time to your activities in various Agent CLIs like Claude Code, Codex, and Gemini.

Built with **Tauri**, **Rust**, and **React**, PetHover is designed to be lightweight, secure, and local-first.

---

## ✨ Features

- **Real-time Interaction**: Your desktop pet reacts to AI Agent events (thinking, tool use, waiting for input, completion, etc.).
- **Multiple Agent Support**: Native adapters for **Claude Code**, **Codex**, **Gemini**, and **OpenCode**.
- **Pixel Art Aesthetics**: Beautiful pixel-art animations with customizable pet packages.
- **Local-First & Private**: All data is stored locally in `~/.pethover`. No cloud dependency.
- **Safe Hook Management**: Automatic backup and restoration of your CLI configurations.
- **Lightweight Runtime**: Minimal CPU and memory footprint, with built-in rate limiting and log rotation.
- **Bilingual Support**: Fully localized in English and Chinese.

## 🚀 Supported Agents

| Agent | Integration Method | Config Path |
| --- | --- | --- |
| **Claude Code** | JSON Hooks | `~/.claude/settings.json` |
| **Codex** | JSON Hooks | `~/.codex/hooks.json` |
| **Gemini** | JSON Hooks | `~/.gemini/settings.json` |
| **OpenCode** | JS Plugin | `~/.config/opencode/plugins/pethover.js` |

## 🛠️ Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (pnpm recommended)
- OS: macOS (Primary target), Windows, or Linux.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ChanceYu/pethover.git
   cd pethover
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run in development mode:
   ```bash
   pnpm tauri dev
   ```

4. Build for production:
   ```bash
   pnpm tauri build
   ```

## 📂 Project Structure

- `src-tauri/`: Rust core, agent adapters, and runtime server.
- `src/`: React frontend (desktop pet UI and settings center).
- `pets/`: Built-in pixel-art pet packages.
- `docs/architecture.md`: Detailed technical architecture and design.
- `AGENTS.md`: Testing and verification guide for agents.

## 🛡️ Security

PetHover prioritizes your system's integrity:
- **Local Runtime**: The event server only binds to `127.0.0.1`.
- **Token Authorization**: All event reports require a runtime-generated token.
- **Atomic Writes**: Configuration changes use atomic file operations.
- **Automatic Backups**: Your CLI configs are backed up before any modification.

## 🤝 Contributing

Contributions are welcome! Please see [docs/architecture.md](docs/architecture.md) for a deep dive into the system design.

## 📄 License

Private / All Rights Reserved (Check with PetHover contributors).

---

# PetHover 🐾 (中文说明)

**PetHover** 是一款为 AI Agent 工作流设计的桌面电子宠物。它在你的桌面上提供一个像素风格的小宠物，能够根据你在 **Claude Code**、**Codex** 和 **Gemini** 等工具中的操作实时做出反应。

基于 **Tauri**、**Rust** 和 **React** 构建，PetHover 追求轻量、安全和本地化。

## ✨ 功能特性

- **实时互动**：宠物会根据 AI Agent 事件（思考中、工具使用、等待输入、完成等）做出对应的动作。
- **多 Agent 支持**：内置 **Claude Code**, **Codex**, **Gemini** 和 **OpenCode** 的适配器。
- **像素美学**：精美的像素动画，支持自定义宠物包。
- **本地优先**：所有数据存储在 `~/.pethover`，不依赖云服务。
- **安全钩子管理**：自动备份和恢复你的 CLI 配置文件。
- **轻量化运行**：极低的 CPU 和内存占用，内置限速和日志轮转。
- **多语言支持**：支持中英文切换。

## 🚀 支持的 Agent

| Agent | 集成方式 | 配置文件路径 |
| --- | --- | --- |
| **Claude Code** | JSON Hooks | `~/.claude/settings.json` |
| **Codex** | JSON Hooks | `~/.codex/hooks.json` |
| **Gemini** | JSON Hooks | `~/.gemini/settings.json` |
| **OpenCode** | JS 插件 | `~/.config/opencode/plugins/pethover.js` |
