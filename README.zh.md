# PetHover 🐾

**PetHover** 是一款为 AI Agent 工作流设计的桌面电子宠物。它在你的桌面上提供一个像素风格的小宠物，能够根据你在 **Claude Code**、**Codex**、**Gemini** 和 **OpenCode** 等工具中的操作实时做出反应。

基于 **Tauri**、**Rust** 和 **React** 构建，PetHover 追求轻量、安全和本地优先（Local-first）。

---

## ✨ 功能特性

- **实时互动**：宠物会根据 AI Agent 事件（思考中、工具使用、等待输入、完成等）做出对应的动作。
- **多 Agent 支持**：内置 **Claude Code**, **Codex**, **Gemini** 和 **OpenCode** 的适配器。
- **像素美学**：精美的像素动画，支持自定义宠物包。
- **本地优先 & 私密**：所有数据存储在本地 `~/.pethover`。不依赖云服务，保护隐私。
- **安全钩子管理**：自动备份和恢复你的 CLI 配置文件，防止配置损坏。
- **轻量化运行**：极低的 CPU 和内存占用，内置限速和日志轮转。
- **双语支持**：完整支持中英文界面。

## 🚀 支持的 Agent

| Agent | 集成方式 | 配置文件路径 |
| --- | --- | --- |
| **Claude Code** | JSON Hooks | `~/.claude/settings.json` |
| **Codex** | JSON Hooks | `~/.codex/hooks.json` |
| **Gemini** | JSON Hooks | `~/.gemini/settings.json` |
| **OpenCode** | JS 插件 | `~/.config/opencode/plugins/pethover.js` |

## 🛠️ 快速开始

### 环境准备

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/) (推荐使用 pnpm)
- 操作系统：macOS (主要开发目标), Windows, 或 Linux。

### 安装步骤

1. 克隆仓库：
   ```bash
   git clone https://github.com/ChanceYu/pethover.git
   cd pethover
   ```

2. 安装依赖：
   ```bash
   pnpm install
   ```

3. 运行开发模式：
   ```bash
   pnpm tauri dev
   ```

4. 构建发行版：
   ```bash
   pnpm tauri build
   ```

## 📂 项目结构

- `src-tauri/`: Rust 核心代码、Agent 适配器及事件服务器。
- `src/`: React 前端界面（桌面宠物 UI 与设置中心）。
- `pets/`: 内置的像素宠物包。
- `docs/architecture.md`: 详细的技术架构设计文档。
- `AGENTS.md`: Agent 测试与验证指南。

## 🛡️ 安全性

PetHover 优先保证您的系统安全：
- **本地运行时**：事件服务器仅绑定到 `127.0.0.1`。
- **Token 验证**：所有事件上报均需携带运行时生成的 Token。
- **原子化写入**：配置文件修改采用原子化操作，确保数据完整。
- **自动备份**：在修改任何 CLI 配置前，均会自动创建备份。

## 🤝 参与贡献

欢迎任何形式的贡献！深入了解系统设计请阅读 [docs/architecture.md](docs/architecture.md)。

## 📄 开源协议

私有 / 版权所有 (请咨询 PetHover 贡献者)。
