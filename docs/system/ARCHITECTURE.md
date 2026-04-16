# Codelord 架构

## 目的

本文档是仓库分层、依赖方向、模块所有权和系统级 source-of-truth 规则的稳定权威来源。

当问题是"这个行为应该放在哪里？"时，使用本文档。
不要用它来做短半衰期的优先级排序——那属于 `docs/planning/Sprint.md`。

## 仓库层级

| 层            | 路径                  | 职责                                                                          | 不应拥有                                    |
| ------------- | --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Config        | `packages/config`     | config schema、默认值、校验、分层加载                                         | auth 流程、runtime 状态、UI                 |
| Core engine   | `packages/agent-core` | runtime 语义、tool primitives、router、safety、event spine、trace schema      | CLI UX、renderer 布局、persistence 文件路径 |
| Product shell | `agents/coding-agent` | 命令面、REPL 流程、system prompt 组装、Ink UI、auth、本地 stores、checkpoints | 可复用的 engine 不变量                      |

## 依赖方向

允许的方向是单向的。

- `packages/config` 仅依赖外部库。
- `packages/agent-core` 仅依赖外部库。
- `agents/coding-agent` 可以依赖 `@agent/config` 和 `@agent/core`。
- `packages/agent-core` 不得从 `agents/coding-agent` 导入。
- `packages/config` 不得从 `packages/agent-core` 或 `agents/coding-agent` 导入。

如果某个变更会反转这些箭头，停下来重新设计。

## 系统地图

| 区域                | 关键文件                                                                                                                                                                           | 职责                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Config 加载         | `packages/config/src/schema.ts`, `packages/config/src/load.ts`, `packages/config/src/toml.ts`                                                                                      | config 形状、默认值、校验、加载优先级                        |
| Runtime             | `packages/agent-core/src/runtime.ts`, `packages/agent-core/src/react-loop.ts`, `packages/agent-core/src/session-snapshot.ts`                                                       | session 状态、bursts、queue、blocking、resume 语义           |
| Tool platform       | `packages/agent-core/src/tools/*`, `packages/agent-core/src/tool-router.ts`, `packages/agent-core/src/tool-safety.ts`                                                              | tool handlers、contracts、routing、safety 分类               |
| Event 与 trace 模型 | `packages/agent-core/src/events.ts`, `packages/agent-core/src/trace.ts`, `packages/agent-core/src/trace-check.ts`, `packages/agent-core/src/redact.ts`                             | lifecycle 语义、trace schema、diagnostics、redaction         |
| CLI 组合            | `agents/coding-agent/src/cli/index.ts`, `agents/coding-agent/src/cli/repl.ts`, `agents/coding-agent/src/cli/system-prompt.ts`, `agents/coding-agent/src/cli/tool-kernel.ts`        | 命令面、REPL 接线、prompt 组装、tool 组装                    |
| Renderer            | `agents/coding-agent/src/renderer/index.ts`, `agents/coding-agent/src/renderer/ink-renderer.tsx`, `agents/coding-agent/src/renderer/ink/timeline-projection.ts`                    | timeline projection、Ink UI、input bridge                    |
| Persistence         | `agents/coding-agent/src/session-store.ts`, `agents/coding-agent/src/trace-store.ts`, `agents/coding-agent/src/trace-recorder.ts`, `agents/coding-agent/src/checkpoint-manager.ts` | 本地 session/trace persistence、trace 录制、undo checkpoints |
| Auth                | `agents/coding-agent/src/auth/index.ts`, `agents/coding-agent/src/auth/api-key.ts`, `agents/coding-agent/src/auth/oauth.ts`                                                        | provider 凭证解析                                            |

## Source Of Truth 规则

| 关注点                | Source of truth                                                    | 派生 / 次要                |
| --------------------- | ------------------------------------------------------------------ | -------------------------- |
| Session 控制状态      | `AgentRuntime` + `SessionSnapshot`                                 | renderer timeline 缓存     |
| Resume 协调           | `resolveResumeState()` + runtime snapshot                          | 之前渲染的 timeline        |
| Tool 使用指导         | 由 `buildSystemPrompt()` 渲染的 tool contracts                     | 其他位置的临时 prompt 措辞 |
| Tool 执行权限         | router + safety policy                                             | UI 徽章或 trace 格式化     |
| Lifecycle 语义        | `LifecycleEvent` / `ToolCallLifecycle` / `AssistantReasoningState` | renderer 专用的视图对象    |
| Trace 事实            | 由 `TraceRecorder` 录制的 `TraceRunV2`                             | CLI pretty-print 输出      |
| 本地 persistence 布局 | `SessionStore` / `TraceStore` / `CheckpointManager`                | 文档和示例                 |

如果 renderer 视图或格式化字符串与 runtime 或 trace 对象不一致，以 runtime/trace 对象为准。

## 端到端控制流

1. `agents/coding-agent/src/cli/index.ts` 解析命令行意图。
2. Config 通过 `packages/config` 加载。
3. Auth 在 `agents/coding-agent/src/auth` 中解析 provider 凭证。
4. `createToolKernel()` 组装 tools、handlers、contracts、router 和 safety policy。
5. `buildSystemPrompt()` 将稳定的 tool 指导渲染到 system prompt 中。
6. `startRepl()` 创建 `AgentRuntime`、renderer、stores、recorder 和 checkpoint manager。
7. `AgentRuntime` 发射原始 agent events 和 lifecycle events。
8. Renderer 将 lifecycle events 投影为 timeline；`TraceRecorder` 录制 provider、agent 和 lifecycle ledgers。
9. `SessionStore` 持久化 session snapshot + timeline；`TraceStore` 持久化结构化 traces。
10. Resume 时，先协调 runtime snapshot；timeline 作为派生缓存进行 hydrate。

## 最重要的架构边界

### Core vs product shell

- 将可复用的执行语义放在 `packages/agent-core`。
- 将应用专属的命令 UX、终端渲染和文件系统布局放在 `agents/coding-agent`。
- 如果一个变更只对 `codelord` product shell 有意义，就不要放进 core。

### Contracts vs enforcement

- Tool contracts 描述预期用法。
- Router 执行确定性重写。
- Safety policy 决定是否允许执行。
- Prompt 渲染可以呈现 contracts，但 prompt 不是执行层。

### Runtime truth vs UI cache

- Runtime 拥有 truth。
- Timeline 是面向 operator 可见性的投影。
- Session resume 必须从 snapshot truth 协调，而非从旧的渲染产物协调。

### Trace schema vs trace 展示

- `TraceRunV2` 是事实账本。
- `trace show` 和 `trace check` 是消费者。
- 不要在没有 schema 级理由的情况下，将展示假设烘焙回 trace schema。

## 变更规则

- 新的跨层概念 → 先定义所有权，再写代码。
- 新的持久化状态 → 指定 source of truth 和 resume 行为。
- 新的 lifecycle event → 更新 trace 语义和相关模块文档。
- 不要为 current-focus 区域制造浅层临时胜利。如果妥协确实不可避免，将目标状态和剩余缺口直接写入 `docs/planning/RoadMap.md` 对应章节和 `docs/planning/Sprint.md`。
- 新的长期架构方向 → 更新 `docs/planning/RoadMap.md`；如果它改变了已有推理，在 `docs/planning/DecisionLog.md` 中记录原因。
