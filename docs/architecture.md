# PetHover 架构文档

PetHover 是一款基于 Tauri 的桌面电子宠物客户端，面向 Claude Code、Codex、Gemini、OpenCode 等 Agent CLI 工作流。应用内置一款默认宠物，所有用户状态、配置、宠物包、备份和运行时文件统一放在 `~/.pethover`。客户端启动时常驻系统托盘；首次安装后可在设置中启用任意一个或多个 Agent CLI，PetHover 写入对应 CLI 的 hooks 配置，并把 Agent 生命周期事件映射为分层宠物状态。

本文定义当前实现版本的目标架构、模块边界、数据目录、长期运行性能要求、进程模型、窗口模型，以及多平台适配策略。

## 目标

- 使用 Tauri 2 + Rust Core 构建长期运行的桌面客户端。
- 通过双窗口架构提供透明置顶的桌面宠物 (`pet`) 和独立的设置窗口 (`settings`)。
- 内置一款默认宠物，应用首次启动可直接显示。
- 所有 PetHover 自有数据统一放在 `~/.pethover`。
- 宠物包使用 Codex 兼容规范：`pet.json` + `spritesheet.webp`/`spritesheet.png`；支持从 `~/.codex/pets` 选择性导入。
- 支持 Claude Code、Codex、Gemini、OpenCode 的检测、启用、卸载和修复。
- hooks 写入必须可回滚，不能破坏用户已有 CLI 配置。
- Agent CLI 长时间运行时，PetHover 控制 CPU、内存、日志、队列和 hook 进程开销。
- 提供中英双语 (zh-CN / en-US) 的运行时本地化。

## 非目标

- PetHover 不直接运行、托管或监督 Claude Code、Codex、Gemini、OpenCode 会话。
- 当前版本不依赖长期运行的 Node.js sidecar。
- 不依赖云服务完成内置宠物加载、宠物选择或本地 hooks 更新。
- 第三方 CLI 的 hooks 文件格式不是核心领域模型，只在 adapter 层出现。

## 总体架构

```text
Tauri Web UI (React 18 + Vite + TypeScript)
  ├── pet window      (透明、置顶、无装饰、不可聚焦、跨工作区可见)
  └── settings window (常规可调整尺寸、隐藏式关闭)
        │
        │ Tauri commands / Tauri events
        ▼
Rust Core (pethover_lib)
  ├── app_state / config_store      持久化 PetHover 偏好
  ├── pet_package / pet_registry    宠物包发现、校验、安装、移除
  ├── agents (adapter 注册表)        Claude / Codex / Gemini / OpenCode
  ├── runtime_server                本机 HTTP event endpoint + token + 队列
  ├── runtime_state                 事件→宠物状态映射、token bucket、去抖
  ├── window_placement              pet 窗口尺寸、z-order、设置窗口交互
  ├── i18n                          MessageKey + Locale (en-US / zh-CN)
  └── diagnostics                   运行时计数、错误聚合
        │
        │ localhost event posts
        ▼
Agent CLI Hooks
  ├── Claude Code hook command
  ├── Codex hook command
  ├── Gemini hook command
  └── OpenCode plugin/hook command
```

Tauri 应用是唯一长期运行的进程族。Agent CLI hooks 只是短生命周期命令：快速发送事件、快速退出；PetHover 未运行时不能阻塞 Agent CLI，也不能让用户的 Agent 会话失败。

## 模块边界

仓库实际布局，与本文档对齐：

```text
src-tauri/
  src/
    main.rs                    # 二进制入口
    lib.rs                     # tauri::Builder 装配、所有 #[tauri::command]
    app_state.rs               # AppState、PetWindowSize
    config_store.rs            # 持久化、宠物导入、locale 持久化
    pet_package.rs             # PetManifest / PetSummary / PetPackage
    pet_registry.rs            # 宠物包发现与校验
    runtime_server.rs          # RuntimeManager / RuntimeCore / RuntimeToken
    runtime_state.rs           # EventStateEngine / TokenBucket / BoundedEventQueue
    window_placement.rs        # pet 窗口尺寸、z-order 守护
    i18n.rs                    # Locale / LocalePreference / MessageKey / t()
    diagnostics.rs             # 运行时计数与错误聚合
    commands.rs                # 独立 Tauri 命令 (例如 reset_pet_window_position)
    agents/
      mod.rs                   # AdapterSummary / AdapterError / AgentManager
      adapters/
        claude_code.rs
        codex.rs
        gemini.rs
        opencode.rs
  tests/                       # Cargo 集成测试 (repo_layout / runtime_*)
  assets/pets/                 # 打包进 bundle 的默认宠物 (resource)
  capabilities/default.json
src/
  main.tsx                     # React 入口
  App.tsx                      # 按 window label 切到 PetWindow / SettingsWindow
  PetWindow.tsx                # 桌面宠物窗口入口
  SettingsWindow.tsx           # 设置窗口入口
  components/
    AppShell.tsx
    PetSprite.tsx
    SettingsNav.tsx
    SettingsPetsSection.tsx
    SettingsAgentsSection.tsx
    SettingsPreferencesSection.tsx
    SettingsAboutSection.tsx
    SettingsSectionHost.tsx
    ui/                        # shadcn 风格基元
  hooks/
    useAppData.ts               # 订阅 pethover-app-state-changed
    useBaseState.ts
    useMotionState.ts
    useInputState.ts
    useAgentState.ts
    useEmotionState.ts
    useLayeredPetState.ts
  lib/
    appTypes.ts                 # 共享 TypeScript 类型契约
    settingsTypes.ts            # 设置面板专用类型
    petWindowUi.ts              # 宠物窗口尺寸/缩放/几何工具
    agentIcons.ts               # agent 图标映射
    petStates.ts
    petAnimation.ts            # composeLayers(...) 分层 → spritesheet 行
    i18n.ts
    devLogger.ts
    utils.ts
  tests/                       # Playwright 集成测试 + app-harness.ts
  assets/                      # 前端静态资源 (logo、agent 图标)
docs/
  architecture.md              # 本文档
  superpowers/{plans,specs}/   # 设计/实施计划归档
```

前端只调用稳定的 Tauri commands，不直接理解 Claude/Codex/Gemini/OpenCode 的配置格式。所有 `invoke` 调用集中在 `src/hooks/useAppData.ts` 和专用 hooks 内，组件层不直接调用 Tauri，方便测试用 `createAppHarness` 模拟。

## 进程与窗口模型

PetHover v1 由单一 Tauri 应用承载：

- Tauri 主进程 + webview 进程组（每个 webview 一个）。
- `RuntimeManager` 启动的事件服务器线程及内部 worker。
- 可选的宠物目录 watcher。

应用注册两个 webview 窗口（见 `src-tauri/tauri.conf.json`）：

| label      | 用途         | 关键属性                                                                                |
| ---------- | ------------ | --------------------------------------------------------------------------------------- |
| `pet`      | 桌面悬浮宠物 | 透明、无装饰、不可聚焦、`skipTaskbar`、`visibleOnAllWorkspaces`、关闭即退出应用         |
| `settings` | 设置中心     | 透明、无装饰、可调整尺寸、最小尺寸约束、关闭时仅隐藏 (`api.prevent_close` + `hide()`)   |

macOS 特殊处理：

- 启动时加载 `tauri_nspanel` 插件，把 `pet` window 转换成 `NSPanel`（accessory 风格、不抢占焦点）。
- `window_placement` 模块负责 z-order 守护：监听 `Reopen` / `Resumed` / `Focused` / 其它需要重置的事件，调用 `schedule_pet_window_z_order_reassertions` 确保宠物窗口始终位于浮层。
- 设置窗口聚焦或显示前调用 `prepare_settings_window_for_interaction`，并再次触发 z-order 重排，避免 NSPanel 行为下设置窗口被宠物窗口遮挡。

托盘 (TrayIcon)：

- 启动时由 `install_tray_menu` 安装，菜单项：项目主页（打开 `PROJECT_HOMEPAGE_URL`）、设置中心、退出。
- 托盘文案随当前 Locale 切换，使用 `MessageKey::TrayBrand` / `TraySettings` / `TrayQuit`。

启动流程：

1. 解析 `~/.pethover` 并 `ConfigStore::ensure_ready()`。
2. 解析内置宠物目录：先查 bundle 资源 `assets/pets`，回退到 `CARGO_MANIFEST_DIR/assets/pets`，写入全局 `set_builtin_pets_dir`。
3. 装配托盘菜单与 i18n。
4. `RuntimeManager::start` 绑定本机 event endpoint，注入回调把 `RuntimeUpdate` 通过 `pet-state-changed` emit 给 `pet` 与 `settings` 两个窗口。
5. 把 `pet` 窗口转 NSPanel（macOS）、应用 `PetWindowSize`、安装 z-order 守护。

退出流程：

1. 关闭 `pet` 窗口 → `app.exit(0)`。
2. 关闭 `settings` 窗口 → 不退出，仅隐藏。
3. `RuntimeManager` 在 drop 时停止接收新事件、回收 worker、失效 runtime token。

## 数据目录

PetHover 拥有 `~/.pethover`：

```text
~/.pethover/
  config.json                  # AppState 持久化
  runtime/
    state.json
    event-token
    pethover.log
    agent-events.log
    diagnostics.json
  pets/
    <pet-id>/
      pet.json
      spritesheet.webp|spritesheet.png
  backups/
    claude-code/
    codex/
    gemini/
    opencode/
  adapters/
    claude-code.json
    codex.json
    gemini.json
    opencode.json
```

- `config.json` 保存 PetHover 偏好：当前宠物、已启用 adapters、`PetWindowSize`、`LocalePreference`、首次启动状态、runtime 端口偏好等。
- `runtime/` 保存易变运行时文件；应用启动时可重建。日志按大小轮转或截断，不因 Agent 长时间运行无限增长。
- `pets/` 只保存用户安装的宠物（包括从 `~/.codex/pets` 导入的副本）。**内置宠物不写入 `~/.pethover/pets`**，而是直接从 bundle 资源 `assets/pets` 解析；这样删除 `~/.pethover` 不会损坏内置宠物。
- `backups/` 保存修改 CLI 配置前的原始文件快照，元数据包含 adapter id、源路径、时间戳、PetHover 版本、操作 id。
- `adapters/` 保存 PetHover 已写入哪些 CLI 配置，是卸载和修复的本地事实来源。

`tauri.conf.json` 的 `assetProtocol.scope` 仅允许以下宠物资源被 webview 读取：

```text
$HOME/.pethover/pets/**
$HOME/.codex/pets/**
$RESOURCE/assets/pets/**
```

## 宠物包规范

PetHover 使用 Codex 兼容宠物包：

```text
pet.json
spritesheet.webp
# 或
spritesheet.png
```

默认 spritesheet 采用 `8 x 9` 网格。状态行如下：

| 状态            | 含义                       |
| --------------- | -------------------------- |
| `idle`          | 默认待机                   |
| `running-right` | 向右移动                   |
| `running-left`  | 向左移动                   |
| `waving`        | 完成、打招呼               |
| `jumping`       | 用户输入、提示关注         |
| `failed`        | 错误、失败                 |
| `waiting`       | 等待用户批准或输入         |
| `running`       | 通用工具执行中             |
| `review`        | 阅读、搜索、检查类活动     |

`pet.json` (`PetManifest`) 至少应包含 id/slug、显示名称、帧尺寸、网格尺寸，也可以包含状态动画时长。旧包缺少时长字段时，渲染器使用默认状态表。

校验规则：

- `pet.json` 必须是合法 JSON 并受大小上限约束。
- 必须存在 `spritesheet.webp` 或 `spritesheet.png`。
- spritesheet 初始大小上限为 16 MB。
- 损坏宠物包不能导致启动崩溃；应从列表隐藏并出现在诊断页。

宠物来源：

- **内置宠物**：bundle 资源 `assets/pets`，不可卸载；缺失时启动期自动回退到 manifest 路径。
- **Codex 导入**：`list_codex_pets` 读取 `~/.codex/pets`，`install_codex_pet` 单装、`import_codex_pets` 批量导入；导入后副本落在 `~/.pethover/pets`，活动宠物始终来自 PetHover 自己的目录。
- **本地文件导入**：`import_pet_files`（前端传入 manifest JSON + sprite 字节）和 `import_pet_folder`（路径）两种方式，均写入 `~/.pethover/pets`。

## Runtime Event Model

`RuntimeManager` 在本机绑定 HTTP endpoint，hooks 通过以下方式发送紧凑事件：

```http
POST http://127.0.0.1:<port>/v1/events
Authorization: Bearer <runtime-token>
Content-Type: application/json
```

事件示例：

```json
{
  "agent": "codex",
  "kind": "tool.before",
  "tool": "Read",
  "sessionId": "optional",
  "timestamp": 1778834400000
}
```

Rust runtime 将事件映射为宠物状态（`runtime_state::EventStateEngine`）：

| 事件                  | 默认宠物状态                                  |
| --------------------- | --------------------------------------------- |
| `user.prompt`         | `jumping`                                     |
| `tool.before`         | `running`，阅读/搜索类工具映射为 `review`     |
| `tool.after`          | `idle`                                        |
| `permission.waiting`  | `waiting`                                     |
| `session.stop`        | `waving`                                      |
| `session.error`       | `failed`                                      |

派生结果以 `RuntimeUpdate { current_state, messages }` 形式回调给 Tauri 主进程，并通过 `pet-state-changed` event 同时广播到 `pet` 和 `settings` 窗口。状态映射属于 Rust Core，hooks 只负责传递 agent、事件类型、工具名、会话 id 等元数据。

## 分层宠物状态模型

前端不直接使用单一字符串状态，而是把若干并发维度合成为 spritesheet 行。`src/lib/petAnimation.ts` 中的 `composeLayers(layers: PetLayers)` 优先级如下：

1. `motion`（拖拽中 → `dragSpriteRow(direction)`）。
2. `input`（用户主动输入交互 → `inputSpriteRow(input)`）。
3. `agent`（Agent CLI 派生状态 → `agentSpriteRow(agent)`）。
4. `base`（默认待机/idle 回落 → `baseSpriteRow(base)`）。
5. 在以上任一层之上叠加 `emotion`（情绪贴纸 id），由 `emotionId(emotion)` 决定。

对应 hooks 一一对应：

- `useBaseState` — 默认动画基线。
- `useMotionState` — 由 `@use-gesture/react` 驱动的拖拽运动。
- `useInputState` — 鼠标点击/手势输入触发的瞬态。
- `useAgentState` — 订阅 `pet-state-changed`，映射 Rust 派生状态。
- `useEmotionState` — 情绪贴纸。
- `useLayeredPetState` — 顶层组合，输出 `ComposedView` 给 `PetSprite`。

层模型让宠物可以同时反映 Agent 状态（如 `running`）和用户即时交互（如拖拽 / 手势），避免不同来源互相覆盖。

## 长期运行性能

Agent CLI 可能持续运行数小时并产生密集工具事件。PetHover 必须保护 Agent 会话和桌面客户端。

hook 命令约束：

- 超时控制在 500-1000 ms。
- 不等待 UI 确认。
- PetHover 未运行或连接失败时静默退出。
- 避免每个事件启动重量级解释器。
- 不把大 payload 写进 CLI hooks 配置。
- hook 配置中优先使用 PetHover 打包出的绝对路径 helper。

Rust runtime 约束（`runtime_server` + `runtime_state`）：

- 只绑定 `127.0.0.1`。
- 每次启动生成 `RuntimeToken`，写入 `~/.pethover/runtime/event-token`，权限限制为当前用户可读。
- `TokenBucket` 限流，初始目标 30 events/sec sustained、60 burst。
- `BoundedEventQueue` 提供有界队列（初始上限 50 条），溢出按策略丢弃。
- 合并 `running -> idle -> running` 等高频抖动，避免动画闪烁。
- 每个可见状态设置最小停留时间，初始 200-300 ms。
- 临时状态自动回落到 `idle`，除非期间收到新事件。
- 内存占用不随会话时长增长。
- 日志按大小轮转，不依赖应用重启。

UI 约束：

- sprite 动画由 CSS/canvas 驱动，避免每帧触发 React 状态更新。
- UI 订阅派生后的当前层 (`ComposedView`)，不订阅原始 hook 事件流。
- 宠物列表数量较多时使用 `react-virtuoso` 虚拟列表。
- 尊重系统 reduced motion 设置。

## Tauri 命令清单

所有 `#[tauri::command]` 定义集中在 `src-tauri/src/lib.rs` 与 `commands.rs`：

| 命令                          | 用途                                                          |
| ----------------------------- | ------------------------------------------------------------- |
| `get_app_state`               | 读取 `AppState`                                               |
| `select_pet`                  | 切换当前宠物，广播 `pethover-app-state-changed`                |
| `set_pet_window_size`         | 持久化 `PetWindowSize` 并应用到 `pet` 窗口                    |
| `set_locale_preference`       | 切换 `LocalePreference`，刷新 i18n                            |
| `list_pets`                   | 列出 `~/.pethover/pets` + 内置宠物                             |
| `list_codex_pets`             | 列出 `~/.codex/pets`                                          |
| `install_codex_pet`           | 复制单个 Codex 宠物到 PetHover                                 |
| `import_codex_pets`           | 批量导入                                                      |
| `import_pet_files`            | 前端上传 manifest + sprite 字节                               |
| `import_pet_folder`           | 通过路径导入文件夹                                            |
| `remove_pet`                  | 删除用户安装的宠物（内置宠物拒绝）                            |
| `get_runtime_status`          | 读取 `RuntimeSnapshot`                                        |
| `open_settings_window`        | 显示并聚焦设置窗口                                            |
| `list_agent_adapters`         | 列出适配器状态                                                |
| `install_agent_adapter`       | 启用某个 adapter；自动 `set_onboarding_complete(true)`        |
| `uninstall_agent_adapter`     | 卸载                                                          |
| `repair_agent_adapter`        | 修复 PetHover hook 条目                                        |
| `commands::reset_pet_window_position` | 把 `pet` 窗口位置重置回默认                            |

应用通过 `Emitter::emit_to` 向 `pet` 与 `settings` 两个 window label 同步广播事件：

- `pethover-app-state-changed`（`AppState`）— 配置变更。
- `pet-state-changed`（`RuntimeUpdate`）— 派生宠物状态。

## Agent Adapter Contract

每个 adapter 实现相同 Rust trait（`src-tauri/src/agents/mod.rs`）：

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

`AgentManager::from_home` 加载 `~/.pethover/adapters/`，再调度各 adapter；命令层只暴露 `AdapterSummary`、`AdapterOperationResult`、`AdapterError`。错误通过 `localize_adapter_error` 按当前 `Locale` 翻译再回传给前端。

adapter 负责：

- 解析平台相关配置路径。
- 检测 CLI 是否存在（`AdapterError::AgentExecutableMissing` 用于报告缺失）。
- 解析已有配置，不丢弃未知用户设置。
- 只写入 PetHover 自己的 hook 条目（带稳定 id / 元数据）。
- 修改前创建备份到 `~/.pethover/backups/<adapter-id>/`。
- 记录安装元数据到 `~/.pethover/adapters/<id>.json`。
- 提供诊断和修复动作。

Core 负责：

- 生成标准 hook command。
- 提供 runtime endpoint 和 token。
- 维护事件到状态的映射。
- 根据 adapter 结果决定 UI 状态和错误展示。

### Claude Code (`claude_code.rs`)

合并 PetHover hook 进 Claude settings JSON，保留已有 hooks。通知/权限等待映射 `waiting`，停止映射 `waving`，工具前后映射 `running` / `idle`。

默认路径候选：

- macOS/Linux: `~/.claude/settings.json`
- Windows: `%USERPROFILE%\.claude\settings.json`

### Codex (`codex.rs`)

独立写入 hooks 并执行 post-install check；若 Codex 需要额外 feature flag，则在备份后提供自动设置选项。

默认路径候选：

- macOS/Linux: `~/.codex/hooks.json`, `~/.codex/config.toml`
- Windows: `%USERPROFILE%\.codex\hooks.json`, `%USERPROFILE%\.codex\config.toml`

PetHover 可以把 `~/.codex/pets` 作为可选导入来源，但自己的活动宠物包始终位于 `~/.pethover/pets`。

### Gemini (`gemini.rs`)

根据 Gemini 当前配置位置写入 PetHover hook，遵循同样的备份/卸载/修复合同。默认按官方文档解析配置目录，避免硬编码。

### OpenCode (`opencode.rs`)

遵循 OpenCode 自己的 config/plugin 机制，在 Unix-like 系统尊重 `OPENCODE_CONFIG_DIR` 和 `XDG_CONFIG_HOME`。优先使用官方文档支持的配置或插件机制。

默认路径候选：

- macOS/Linux: `$OPENCODE_CONFIG_DIR`, `$XDG_CONFIG_HOME/opencode`, `~/.config/opencode`
- Windows: 按 OpenCode 当前文档解析，不假设 Unix 路径。

OpenCode 的扩展机制可能不是 JSON hook array，因此 adapter 可以写 plugin 文件，但仍必须服从相同的 install/uninstall/repair contract。

## hooks 写入安全

PetHover 修改用户 CLI 配置时必须保守：

- 写入前先读取和解析。
- 遇到格式损坏的配置文件时拒绝覆盖，除非用户明确选择修复 (`AdapterError::InvalidJson`)。
- 每次操作第一次写入前备份原始字节。
- 目标格式支持时，为 PetHover hook 条目写入稳定 id 或元数据。
- 卸载时只移除匹配 PetHover 元数据的条目。
- 缺失配置目录是正常情况，但创建前必须经过用户操作触发。
- 尽量使用原子写：临时文件、fsync、rename。
- Windows 下处理杀毒软件或索引器导致的文件锁，提供重试和明确错误。

## 国际化 (i18n)

`src-tauri/src/i18n.rs` 定义：

- `Locale::EnUs` / `Locale::ZhCn`。
- `LocalePreference`（用户偏好，可显式或跟随系统）。
- `MessageKey` 枚举所有需要本地化的字符串（托盘菜单、设置窗口标题等）。
- `t(locale, key)` 返回静态字符串。

`ConfigStore::effective_locale` 是 runtime 的真实来源；适配器错误、托盘菜单、Tauri 命令返回的错误都通过 `current_locale()` 拿到当前值再翻译。前端 `src/lib/i18n.ts` 镜像同一组 key，订阅 `pethover-app-state-changed` 在 locale 变更时即时刷新 UI。

## 多平台适配

路径：

- 使用 Rust path API，不用字符串拼接。
- 通过平台 API 解析 home 目录（`dirs` crate）。
- OpenCode adapter 尊重 `OPENCODE_CONFIG_DIR` 和 `XDG_CONFIG_HOME`。
- v1 按需求使用 `~/.pethover`，通过 `ConfigStore` 隔离路径，后续可迁移到 OS-native app data。

窗口：

- macOS：`tauri_nspanel` 把 `pet` 转为 accessory NSPanel；启用 `macos-private-api` feature；通过 `objc2-app-kit` 设置 `visibleOnAllWorkspaces` 等行为；z-order 守护由 `window_placement` 模块统一管理。
- Windows：使用 Tauri 窗口 API 实现透明、无边框、置顶；通过 `windows` crate 处理 `Win32_UI_WindowsAndMessaging`；单独验证拖拽和点击穿透行为。
- Linux：透明和置顶受 compositor/window manager 影响，不可用时降级并在诊断中说明。

外部进程与命令：

- 不假设 shell 一定存在。
- hooks 命令按平台生成（`open` / `cmd /C start` / `xdg-open`）。
- 打包后优先使用 PetHover helper 的绝对路径。
- 正确处理包含空格的安装路径。
- CLI-specific command snippet 必须短小、确定、可诊断。

## UI 架构

UI 由两个 React 入口 (`PetWindow.tsx` / `SettingsWindow.tsx`) 组成，`App.tsx` 根据 Tauri window label 分发。设置中心采用「图标 + 文字栏 + 单一可见 section」结构（`SettingsNav` + `SettingsSectionHost`），目前包含四个 section：

1. **Pets** (`SettingsPetsSection`)：列出内置 / 已导入宠物、切换当前宠物、导入与卸载（含 `PetPackageCard`）。
2. **Agents** (`SettingsAgentsSection`)：列出 Claude / Codex / Gemini / OpenCode adapter 状态，启用 / 卸载 / 修复。
3. **Preferences** (`SettingsPreferencesSection`)：宠物窗口尺寸、语言偏好、`reset_pet_window_position`、reduced motion 等。
4. **About** (`SettingsAboutSection`)：版本、主页链接、致谢。

桌面宠物 (`PetWindow` + `AppShell` + `PetSprite`) 仅做透明置顶渲染，状态由 `useLayeredPetState` 决定；窗口大小由 `set_pet_window_size` 控制；位置由 macOS NSPanel + z-order 守护维持，可通过 `reset_pet_window_position` 手动归位。

### 组件布局约定

所有 React 组件**平铺**在 `src/components/` 下，唯一允许的子目录是 `src/components/ui/`（shadcn 风格基元）。通过文件名前缀分组（`SettingsNav.tsx`、`SettingsPetsSection.tsx` 等），不要按特性创建子目录。窗口级入口（`PetWindow.tsx`、`SettingsWindow.tsx`）放在 `src/` 顶层。详见 `AGENTS.md §Feature Module Development`。

## 安全模型

主要本地风险是其他进程或网页尝试触发 PetHover 状态变化。

防护措施：

- event server 只绑定 `127.0.0.1`。
- 写事件必须携带 bearer `RuntimeToken`。
- 不为事件写入开放宽松 CORS。
- event body 初始上限 16 KB。
- 忽略未知事件类型。
- 绝不执行 event payload 中的命令。
- hooks 配置写入只允许 adapter 已知路径。
- `tauri.conf.json` 的 `assetProtocol.scope` 白名单严格限制 webview 可读的宠物资源路径。

宠物包风险：

- `pet.json` 视为不可信输入。
- 不执行宠物包中的脚本。
- 只接受白名单文件名和内容。
- 图片通过浏览器或安全 native image 路径解码，不自写复杂解码器。

## 错误处理和诊断

PetHover 应让失败可恢复：

- onboarding 展示每个 adapter 的安装结果 (`AdapterOperationResult`)。
- event server 绑定失败时展示端口和重试建议。
- invalid token 只增加 `diagnostics` 计数，不频繁打扰 UI。
- 损坏宠物包展示具体校验错误。
- repair 动作可以重新写入 PetHover hook entries。
- 日志包含 operation id、adapter id、文件路径，但不记录 secrets 或完整 prompt 内容。
- Rust 错误通过 `StoreError::localized_message` / `localize_adapter_error` 按当前 locale 翻译。

## 测试策略

测试布局遵循 `AGENTS.md`：

- **Rust 集成测试** 放在 `src-tauri/tests/`，对应模块：
  - `config_store.rs` / `config_store_sync.rs` — 持久化与并发写。
  - `runtime_http.rs` / `runtime_server_core.rs` — HTTP endpoint + token + 队列。
  - `runtime_state.rs` / `event_state_engine.rs` — 状态机、限流、合并。
  - `agent_adapters.rs` — 各 adapter 在临时 home 下的 install/inspect/repair/uninstall。
  - `window_placement.rs` — 窗口尺寸与 z-order 决策（纯逻辑部分）。
  - `reset_pet_window_position.rs` — 命令边界行为。
  - `diagnostics.rs`、`i18n.rs`、`repo_layout.rs` — 诊断、本地化、目录布局保护。
- **前端 Playwright 测试** 放在 `src/tests/`：
  - `pet-animation-layers.spec.ts` — `composeLayers` 优先级。
  - `pet-gestures.spec.ts` — 拖拽手势行为。
  - `pet-window-sync.spec.ts` — `pet`/`settings` 跨窗口事件同步。
  - `settings-shell.spec.ts` / `settings-workflows.spec.ts` — sectioned shell 行为与配置流程。
  - `app-harness.ts` — 共享 Tauri 模拟工厂。

手动平台 QA：

- macOS、Windows、Linux 启动和透明窗口行为。
- 安装路径包含空格时的 hook command quoting。
- 长时间 synthetic event stream 下的 CPU、内存、日志大小、动画流畅度。
- macOS NSPanel z-order 与设置窗口交互。

验证命令：

```sh
pnpm test:frontend
pnpm test:rust
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
pnpm verify:hardening   # 完整冒烟：build + cargo test + tauri build --bundles app
```

## 实施阶段

### Phase 1: 本地宠物 runtime（已完成）

- Scaffold Tauri app。
- 创建 `~/.pethover`，资源化打包内置宠物。
- 实现桌面宠物窗口、设置窗口、托盘菜单。
- 持久化当前宠物、窗口尺寸、locale。

### Phase 2: Runtime Event Server（已完成基础设施）

- localhost event endpoint + runtime token。
- 事件队列、合并、限流、idle 回落。
- 派生状态接入分层 UI 模型。

### Phase 3: Agent Adapters（进行中）

- Claude Code、Codex、Gemini、OpenCode adapters。
- onboarding 与设置中的启用/卸载/修复 / 诊断。
- 备份与元数据落到 `~/.pethover/backups` 与 `~/.pethover/adapters`。

### Phase 4: Hardening

- 跨平台打包验证（`pnpm verify:hardening`）。
- 长时间运行性能测试。
- 日志轮转。
- 打磨失败提示和恢复动作。
- macOS NSPanel / Windows 透明窗口的边缘场景修复。

## 参考

- Tauri: https://tauri.app/
- tauri-nspanel: https://github.com/ahkohd/tauri-nspanel
- Claude Code hooks: https://docs.anthropic.com/en/docs/claude-code/hooks
- Codex hooks: https://developers.openai.com/codex/hooks
- Gemini: https://github.com/google/generative-ai-cli
- OpenCode configuration: https://opencode.ai/docs/config/
- OpenCode plugins: https://opencode.ai/docs/plugins/
