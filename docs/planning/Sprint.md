# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：CORE-R1 — Event System Refactor
- **目标**：把当前三层混杂的事件系统（AgentEvent + LifecycleEvent + ProviderStreamTraceEvent）重构为干净的两层模型（Raw Events + Agent Lifecycle Callbacks with Pipeable），统一所有消费者的接入方式
- **状态**：🟡 规划完成，待实施

---

## 为什么现在做

当前事件系统的问题已经成为多个方向的阻塞因素：

1. **AgentEvent 和 LifecycleEvent 大面积语义重复**：`toolcall_start/delta/end` vs `tool_call_streaming_start/delta/end`，`tool_result` vs `tool_call_completed` 等 6 处完全冗余
2. **消费者被迫跨流拼接**：TimelineStore 从 AgentEvent 拿 `thinking_delta/text_delta`，从 LifecycleEvent 拿其余所有状态；Headless 的 tool call "开始"和"完成"来自不同事件流
3. **Trace 记录了大量不必要的中间态**：每个 `text_delta`、`thinking_delta` 都作为 AgentTraceEvent 落盘，默认 trace 应该只记 trajectory
4. **AgentEvent 18 个变体中，UI 只消费 2 个**（`thinking_delta`, `text_delta`），其余只被 TraceRecorder 消费——这套事件存在的唯一理由是 trace 的 agent_event ledger

这不是新功能开发，而是为后续 M3-S2（Eval CI）、M4（Context Engineering）、以及任何涉及事件消费的改动扫清架构债务。

---

## 目标架构

### Layer 0 — LLM Raw Events（source of truth）

原始 provider stream events。保持不变，作为 `trace --raw` 的数据来源。

### Layer 1 — Agent Lifecycle Callbacks（唯一上层抽象）

从 raw events 聚合投射出的语义回调，每个回调带 **Pipeable** 值：

| Callback | Pipeable 内容 | 完成态 |
|----------|--------------|--------|
| `onStart` | — | — |
| `onText(event)` | `text_delta` | full text |
| `onThinking(event)` | `thinking_delta` | full thinking |
| `onToolCall(event)` | `executing → result` 状态流 | ToolCallResult |
| `onError(event)` | — | error info |
| `onAbort(event)` | — | abort info |
| `onDone(event)` | — | final outcome |

### Pipeable 原语

```ts
interface Pipeable<T> {
  subscribe(handler: (event: T) => void): Unsubscribe
  done(): Promise<FinalValue>
}
```

### 消费者接入方式

| 消费者 | 接入方式 |
|--------|---------|
| **Streaming UI** | subscribe pipeable → 拿 delta 驱动渲染 |
| **Headless** | await `.done()` 拿完成态 |
| **Trace 默认** | 监听 lifecycle 完成态 → 按时间序记录 trajectory |
| **Trace --raw** | 默认 trace + Layer 0 raw events |

### 关键设计决策

1. `onToolCall` 每个 tool call 独立触发，event 带 `toolCallId`
2. Pipeable 终止信号 + 独立 `onError`/`onAbort` 回调共存
3. 用户操作（input / abort）不进入 core lifecycle，由消费者自行注入
4. Pipeable 是轻量自封实现，不用 RxJS

---

## Task 分解

按依赖顺序，每个 task 可独立验证。

### Task 1 — Pipeable 原语 🔴 Not Started

**范围**：纯新增，零破坏

- 实现 `Pipeable<T>` 类
- 支持 `subscribe(handler)` / `done()` / 内部 `push(value)` / `complete(finalValue)` / `error(err)`
- error / abort 时 pipe 到达终态，通知所有 subscriber
- 单测覆盖：正常流、完成、错误、late subscribe、多 subscriber

**产出文件**：
- `packages/agent-core/src/pipeable.ts`（新增）
- `packages/agent-core/test/pipeable.test.ts`（新增）

---

### Task 2 — Agent Lifecycle Callback 类型定义 🔴 Not Started

**范围**：新增类型，保留现有 LifecycleEvent 暂不删

- 定义 lifecycle callback 接口：`AgentLifecycleCallbacks`
- 定义每个 callback 的 event 结构（含 Pipeable 泛型）
- 定义 `RuntimeOptions` 中新的 callbacks 字段（与旧 `onEvent` / `onLifecycleEvent` 并存，过渡期）

**产出文件**：
- `packages/agent-core/src/lifecycle.ts`（新增）
- 修改 `packages/agent-core/src/index.ts`（re-export）

---

### Task 3 — Runtime 重构（核心） 🔴 Not Started

**范围**：Heavy — 这是整个 sprint 的主战场

- `RuntimeOptions` 新增 lifecycle callbacks 字段
- streaming loop 中创建 Pipeable 实例，把 delta push 进去
- 用 lifecycle callbacks 替代所有 `this.emit(AgentEvent)` 调用
- 保留 `onProviderStreamEvent` 给 trace --raw
- 过渡期可同时支持 old/new 接口，但 AgentEvent 标记 deprecated

**改动文件**：
- `packages/agent-core/src/runtime.ts`（Heavy）
- `packages/agent-core/test/runtime.test.ts`（Heavy）

---

### Task 4 — react-loop.ts 适配 🔴 Not Started

**范围**：Medium

- `runAgent()` facade 的 options 适配新的 callback 接口
- `AgentEvent` 类型标记 `@deprecated` 或直接移除
- `RunAgentOptions.onEvent` → `RunAgentOptions.lifecycle`

**改动文件**：
- `packages/agent-core/src/react-loop.ts`（Heavy）
- `packages/agent-core/test/react-loop.test.ts`（Medium）
- `packages/agent-core/test/event-spine.test.ts`（Heavy）

---

### Task 5 — Streaming UI 迁移 🔴 Not Started

**范围**：Heavy — timeline-store 是第二大改动点

- `timeline-store.ts`：删除 `onRawEvent()`，在 lifecycle callback 的 pipeable subscribe 中调用 `applyThinkingDelta` / `applyTextDelta`
- `ink-renderer.tsx`：删除 `onEvent()` 方法
- `renderer/types.ts`：删除 `Renderer.onEvent` 接口
- `timeline-projection.ts`：保留 reducer 逻辑，调用方式变化

**改动文件**：
- `agents/coding-agent/src/renderer/ink/timeline-store.ts`（Heavy）
- `agents/coding-agent/src/renderer/ink/timeline-projection.ts`（Medium）
- `agents/coding-agent/src/renderer/ink-renderer.tsx`（Medium）
- `agents/coding-agent/src/renderer/types.ts`（Medium）
- `agents/coding-agent/test/timeline-projection.test.ts`（Heavy）
- `agents/coding-agent/test/ink-rendering.test.tsx`（Medium）

---

### Task 6 — Headless 迁移 + Eval 接口适配 🔴 Not Started

**范围**：Medium

- 删除 `onEvent` 接线，用 lifecycle callbacks + pipeable 重写 progress event 生成
- `HeadlessProgressEvent` 默认只发射终态事件（`step_start`, `tool_call`, `done`）
- 新增 `HeadlessRunOptions.streaming?: boolean`，为 `true` 时额外发射 `text_delta` 和 `thinking`
- `cli/index.ts` 的 `buildProgressCallback()` 适配新的 event 类型
- `stream-json` 格式保留 `result` 事件的 `text` 字段（terminal-bench fallback 依赖）
- `HeadlessRunResult` 接口不变（四个 eval runner 零改动）

**改动文件**：
- `agents/coding-agent/src/cli/headless.ts`（Medium）
- `agents/coding-agent/src/cli/index.ts`（Light — `buildProgressCallback` 适配）
- `agents/coding-agent/test/headless.test.ts`（Medium）

---

### Task 7 — Trace 重构 🔴 Not Started

**范围**：Heavy

- `trace-recorder.ts`：
  - `onAgentEvent()` 移除（默认 trace 不再记录每个 delta）
  - `onLifecycleEvent()` 重构为 trajectory 模式：只记录 user_turn, assistant_turn_end(with text), tool_call_completed, session_done 等终态
  - `onProviderStreamEvent()` 仅 `--raw` 模式启用
- `trace.ts`：简化 `AgentTraceEvent`；调整 `eventCounts`；可能新增 trajectory entry 类型
- `trace-store.ts`：`formatTraceShow()` 适配新结构

**改动文件**：
- `agents/coding-agent/src/trace-recorder.ts`（Heavy）
- `packages/agent-core/src/trace.ts`（Medium）
- `agents/coding-agent/src/trace-store.ts`（Medium）
- `agents/coding-agent/test/trace.test.ts`（Heavy）

---

### Task 8 — Repl 接线层 + 全局清理 🔴 Not Started

**范围**：Heavy — 最终收口

- `repl.ts`：移除 `onEvent` 接线，`fanOutLifecycle` 改为 callback 注册
- 全局清理：删除 `AgentEvent` 类型、旧的 LifecycleEvent 中被 callback 替代的变体、相关 re-export
- 测试文件批量适配

**改动文件**：
- `agents/coding-agent/src/cli/repl.ts`（Heavy）
- `packages/agent-core/src/react-loop.ts`（清理 AgentEvent 定义）
- `packages/agent-core/src/events.ts`（清理旧类型）
- `packages/agent-core/src/index.ts`（调整 re-export）
- 残余测试适配

---

## 爆炸半径

| 类别 | 数量 |
|------|------|
| Heavy 改动源文件 | 8 |
| Medium 改动源文件 | 5 |
| Heavy 改动测试文件 | 5 |
| Medium 改动测试文件 | 3 |
| **完全不受影响** | 16 源文件 + 12 测试文件 |

### Eval 侧影响（已确认）

**结论：四个 eval runner 均不需要改动。** 变更集中在 `headless.ts`（Heavy，已在 Task 6 覆盖）和 `cli/index.ts`（Light）。

关键发现：
- 没有任何 eval runner 读取 trace 内部事件数据，全部只用 `trace.runId`
- 没有任何 eval runner 使用 `onProgress` callback
- Terminal-bench 的 `_parse_stream_json()` 已有 `result.text` fallback 路径，去掉 `text_delta` 后功能不受影响
- `HeadlessRunResult` 接口不变（保留 `text` 和 `trace.runId`）
- 默认 eval trace 体积预计减少 ~90-95%（从 ~95-330 条事件降至 ~10-20 条 trajectory entries）

| Eval Runner | 改动 | 理由 |
|---|---|---|
| polyglot | None | 只用 `trace.runId` |
| swe-bench | None | 只用 `trace.runId` |
| browsecomp | None | 只用 `r.text` + `trace.runId` |
| terminal-bench | None | `result.text` fallback 已覆盖 |

`HeadlessProgressEvent` 新定义默认只发射终态事件，`streaming?: boolean` 选项可按需开启 delta 发射。这个改动并入 Task 6（Headless 迁移）一起做。

**核心链路**：`runtime.ts → events.ts → trace-recorder.ts → timeline-store.ts`

**完全不受影响的模块**：session-snapshot、checkpoint、reasoning-manager、usage-tracker、interrupt-controller、tool-router、tool-safety、tool-stats、message-manager、context-window、redact、model-capabilities、tool-registry、auth、config、tool-kernel、system-prompt。

---

## 完成标志

- [ ] `AgentEvent` 类型已删除（或仅作为 deprecated alias）
- [ ] runtime 只通过 lifecycle callbacks 向外通信（不再有 `onEvent` 回调）
- [ ] 所有消费者（UI / headless / trace）只消费 lifecycle callbacks
- [ ] Streaming UI 的 delta 来自 pipeable subscribe，不再来自 AgentEvent
- [ ] 默认 trace 只记录 trajectory（终态事件），不记录中间 delta
- [ ] `trace --raw` 能在默认 trace 基础上叠加 Layer 0 raw events
- [ ] 全部现有测试通过或已适配
- [ ] `pnpm build && pnpm typecheck && pnpm test` 绿灯

---

## 上一个冲刺回顾

M3-S1（外部 Benchmark Fast Bootstrap）已关闭。

**关键产出**：
- 四套外部 benchmark 端到端可用（SWE-bench / Polyglot / BrowseComp / Terminal-Bench）
- 基线数据：Polyglot 100%/93.3% | SWE-bench 20% | BrowseComp 40% | Terminal-Bench 33%
- 失败模式分析 → M4 Context Engineering 是最高 ROI 改进方向

详见 [RoadMap.md](./RoadMap.md) 和 [failure-analysis-m3s1.md](./research/failure-analysis-m3s1.md)。
