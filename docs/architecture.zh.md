# CoPet 架构

[English](./architecture.md)

CoPet 是基于 Tauri 的桌面电子宠物客户端，面向 Claude Code、Codex、Gemini、OpenCode 等 Agent CLI 工作流。应用首次启动可使用内置宠物；首次启动时，CoPet 会检查受支持 Agent CLI 的可执行文件，并为检测到的 Agent 自动写入 hooks；之后设置页仍是启用、关闭和修复 hooks 的手动入口。CoPet 会把 Agent 生命周期事件映射为分层宠物状态。

## 总体结构

```text
Tauri Web UI (React 18 + Vite + TypeScript)
  ├── pet window      透明、置顶、不可聚焦
  └── settings window 常规可调整尺寸、关闭即隐藏
        │ Tauri commands / events
        ▼
Rust Core (copet_lib)
  ├── 配置与持久化 (app_state, config_store)
  ├── 宠物包 (pet_package, pet_registry)
  ├── Agent adapters (Claude / Codex / Gemini / OpenCode)
  ├── Runtime server   本机 HTTP endpoint + token + 事件队列
  ├── Runtime state    事件 → 宠物状态映射
  ├── 窗口与托盘、i18n、诊断
        │ localhost event posts (短生命周期 hook 命令)
        ▼
Agent CLI Hooks
```

Tauri 应用是唯一长期运行的进程；Agent CLI hooks 只是短生命周期命令，CoPet 未运行时必须静默退出，不阻塞 Agent 会话。

仓库主要目录：`src-tauri/src/`（Rust Core）、`src/`（React UI）、`docs/`（含本文档）。具体文件命名见 [AGENTS.md](../AGENTS.md)。

## 进程与窗口

应用注册两个 webview：

- **`pet`** — 桌面悬浮宠物，透明、无装饰、不可聚焦，关闭即退出。
- **`settings`** — 设置中心，关闭仅隐藏。

macOS 通过 `tauri_nspanel` 把 `pet` 转为 accessory NSPanel，并由 `window_placement` 模块维持 z-order。托盘菜单提供项目主页、设置、退出，文案随 locale 切换。

## 数据目录

CoPet 所有自有数据放在 `~/.copet`：

```text
~/.copet/
  config.json          # 偏好与一次性迁移标记
  runtime/             # 易变运行时（token、日志、诊断快照），可重建
  pets/                # 用户安装的宠物（含从 ~/.codex/pets 导入的副本）
  backups/<adapter>/   # 修改 CLI 配置前的原始字节快照
  adapters/<id>.json   # CoPet 已写入的 hook 元数据
```

**内置宠物不写入 `~/.copet/pets`**，而是直接从 bundle 资源 `assets/pets` 解析；删除 `~/.copet` 不会损坏内置宠物。`tauri.conf.json` 的 `assetProtocol.scope` 将 webview 可读路径限制为 `~/.copet/pets`、`~/.codex/pets`、bundle 资源目录。

## 宠物包

CoPet 使用 Codex 兼容包：`pet.json` + `spritesheet.webp`（或 `.png`），默认 8×9 网格。九行状态：`idle`、`running-right`、`running-left`、`waving`、`jumping`、`failed`、`waiting`、`running`、`review`。

校验：`pet.json` 必须为合法 JSON 且受大小上限约束；spritesheet 上限 16 MB；损坏宠物包从列表隐藏并出现在诊断页，不能导致启动崩溃。

宠物来源：内置（bundle 资源、不可卸载）、从 `~/.codex/pets` 导入、本地文件夹/文件导入。

## Runtime 事件模型

`RuntimeManager` 在 `127.0.0.1:<port>` 绑定 HTTP endpoint，hooks 通过 bearer token 发送紧凑事件：

```json
{ "agent": "codex", "kind": "tool.before", "tool": "Read", "timestamp": 1778834400000 }
```

`runtime_state::EventStateEngine` 将事件映射为宠物状态（如 `user.prompt → jumping`、`tool.before → running`/`review`、`tool.after → idle`、`permission.waiting → waiting`、`session.stop → waving`、`session.error → failed`），通过 `pet-state-changed` 广播给两个窗口。状态映射属于 Rust Core，hooks 只负责传递元数据。

## 分层宠物状态

前端把若干并发维度合成为 spritesheet 行（`src/lib/petAnimation.ts` 的 `composeLayers`），优先级：

1. `motion`（拖拽）
2. `input`（用户即时输入）
3. `agent`（Agent CLI 派生状态）
4. `base`（默认 idle 回落）
5. 任一层之上叠加 `emotion` 贴纸

这样宠物可以同时反映 Agent 状态和用户即时交互，避免互相覆盖。

## Agent Adapter 契约

每个 adapter 实现统一 trait（`src-tauri/src/agents/mod.rs`）：

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

Adapter 负责：解析平台相关配置路径、解析已有配置且不丢弃用户设置、只写入带稳定 id 的 CoPet 条目、修改前备份到 `~/.copet/backups/<adapter-id>/`、记录元数据到 `~/.copet/adapters/<id>.json`。Core 负责：生成 hook command、提供 runtime endpoint/token、事件状态映射、错误本地化。

启动期自动安装基于可执行文件检测，而不是配置文件检测：CoPet 对每个配置目录只检查一次 adapter 的 `executable_names()`，为检测到且尚未安装 CoPet hook 的 CLI 写入 hooks，在 `config.json` 记录完成状态，并且不会在用户手动关闭某个 adapter 后再次自动写回。

各 adapter 默认配置位置：Claude Code → `~/.claude/settings.json`；Codex → `~/.codex/hooks.json` + `config.toml`；Gemini 按官方文档解析；OpenCode 尊重 `OPENCODE_CONFIG_DIR` / `XDG_CONFIG_HOME`。

## 长期运行性能

Agent CLI 可能持续运行数小时。约束：

- Hook 命令：超时 500–1000 ms、不等待 UI、CoPet 未运行时静默退出、避免重量级解释器。
- Runtime：只绑定 `127.0.0.1`；每次启动生成 `RuntimeToken`；`TokenBucket` 限流（30/s sustained, 60 burst）；`BoundedEventQueue` 有界队列（50 条）；合并高频抖动；最小停留时间 200–300 ms；日志按大小轮转，内存不随会话时长增长。
- UI：sprite 动画由 CSS/canvas 驱动，UI 订阅派生层而非原始事件流；尊重系统 reduced motion。

## 安全模型

- Event server 只绑定 `127.0.0.1`；写事件必须携带 bearer token；body 上限 16 KB；未知事件类型忽略；event payload 绝不当命令执行。
- Hooks 配置写入仅允许 adapter 已知路径；写入前读取与解析；格式损坏拒绝覆盖（除非用户明确修复）；首次写入前备份；卸载只移除匹配 CoPet 元数据的条目；尽量原子写。
- `assetProtocol.scope` 白名单严格限制 webview 可读资源。
- `pet.json` 视为不可信输入；不执行宠物包脚本；图片走浏览器/native 安全解码。

## 国际化

`Locale::EnUs` / `Locale::ZhCn`，用户可显式选或跟随系统。Rust 端的 `MessageKey` 与前端 `src/lib/i18n.ts` 镜像同一组 key；`copet-app-state-changed` 事件触发即时刷新。

## 多平台

- 路径：用 Rust path API，不字符串拼接；`dirs` crate 解析 home；OpenCode 尊重 `OPENCODE_CONFIG_DIR` / `XDG_CONFIG_HOME`。
- 窗口：macOS 用 `tauri_nspanel` + `macos-private-api`；Windows 用 `windows` crate；Linux 透明/置顶受 compositor 影响，不可用时降级并在诊断中说明。
- Hook 命令打包后优先使用 CoPet helper 的绝对路径，正确处理空格。

## 测试

- **Rust 集成测试** 在 `src-tauri/tests/`：配置持久化、runtime HTTP/状态机、agent adapters、窗口/诊断/i18n。
- **前端 Playwright** 在 `src/tests/`：分层动画、手势、跨窗口事件、设置流程，共享 `app-harness.ts` 工厂。

验证命令：

```sh
pnpm test:frontend
pnpm test:rust
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
pnpm verify:hardening   # 完整冒烟：build + cargo test + tauri build --bundles app
```

## 参考

- Tauri: https://tauri.app/
- tauri-nspanel: https://github.com/ahkohd/tauri-nspanel
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Codex hooks: https://developers.openai.com/codex/hooks
- OpenCode: https://opencode.ai/docs/config/ · https://opencode.ai/docs/plugins/
