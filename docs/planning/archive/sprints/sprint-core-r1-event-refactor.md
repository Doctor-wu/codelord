# Codelord — CORE-R1 Event System Refactor（已归档）

> 归档时间：2026-04-13

---

## 冲刺身份

- **阶段**：CORE-R1 — Event System Refactor
- **目标**：把当前三层混杂的事件系统（AgentEvent + LifecycleEvent + ProviderStreamTraceEvent）重构为干净的两层模型（Raw Events + Agent Lifecycle Callbacks with Pipeable），统一所有消费者的接入方式
- **状态**：✅ 已完成

---

## 为什么现在做

当前事件系统的问题已经成为多个方向的阻塞因素：

1. **AgentEvent 和 LifecycleEvent 大面积语义重复**：`toolcall_start/delta/end` vs `tool_call_streaming_start/delta/end`，`tool_result` vs `tool_call_completed` 等 6 处完全冗余
2. **消费者被迫跨流拼接**：TimelineStore 从 AgentEvent 拿 `thinking_delta/text_delta`，从 LifecycleEvent 拿其余所有状态；Headless 的 tool call "开始"和"完成"来自不同事件流
3. **Trace 记录了大量不必要的中间态**：每个 `text_delta`、`thinking_delta` 都作为 AgentTraceEvent 落盘，默认 trace 应该只记 trajectory
4. **AgentEvent 18 个变体中，UI 只消费 2 个**（`thinking_delta`, `text_delta`），其余只被 TraceRecorder 消费——这套事件存在的唯一理由是 trace 的 agent_event ledger

---

## 目标架构

### Layer 0 — LLM Raw Events（source of truth）

原始 provider stream events。保持不变，作为 `trace --raw` 的数据来源。

### Layer 1 — Agent Lifecycle Callbacks（唯一上层抽象）

从 raw events 聚合投射出的语义回调，每个回调带 **Pipeable** 值：

| Callback            | Pipeable 内容               | 完成态         |
| ------------------- | --------------------------- | -------------- |
| `onStart`           | —                           | —              |
| `onText(event)`     | `text_delta`                | full text      |
| `onThinking(event)` | `thinking_delta`            | full thinking  |
| `onToolCall(event)` | `executing → result` 状态流 | ToolCallResult |
| `onError(event)`    | —                           | error info     |
| `onAbort(event)`    | —                           | abort info     |
| `onDone(event)`     | —                           | final outcome  |

### Pipeable 原语

```ts
interface Pipeable<TDelta, TFinal> {
  subscribe(handler: (delta: TDelta) => void): Unsubscribe
  done(): Promise<TFinal>
}
```

### 消费者接入方式

| 消费者           | 接入方式                                        |
| ---------------- | ----------------------------------------------- |
| **Streaming UI** | subscribe pipeable → 拿 delta 驱动渲染          |
| **Headless**     | await `.done()` 拿完成态                        |
| **Trace 默认**   | 监听 lifecycle 完成态 → 按时间序记录 trajectory |
| **Trace --raw**  | 默认 trace + Layer 0 raw events                 |

---

## Task 分解

### Task 1 — Pipeable 原语 🟢 Done

- 实现 `PipeableImpl<TDelta, TFinal>` — 双泛型，生产/消费分离
- 16 个测试覆盖：正常流、错误流、多 subscriber、late subscribe、回调中 unsubscribe 安全性

### Task 2 — Agent Lifecycle Callback 类型定义 🟢 Done

- `AgentLifecycleCallbacks` 接口 + 7 个 event 类型
- `ToolCallDelta` 联合类型（含 streaming_args、id_resolved、phase_change、stdout/stderr、route、safety）

### Task 3 — Runtime 重构（核心） 🟢 Done

- RuntimeOptions 新增 `lifecycle?: AgentLifecycleCallbacks`
- Streaming loop 为 thinking/text/toolcall 创建 Pipeable 并触发回调
- Tool execution 阶段通过 `toolCallIdToPipeable` Map 推送状态
- `_activePipeables` Set + 4 个辅助方法保障 abort/error 时 pipeable 终止
- 移除 `tool_call_streaming_start/delta/end` 三个 LifecycleEvent 变体

### Task 4 — react-loop.ts 适配 🟢 Done

- `RunAgentOptions` 新增 `lifecycle` 字段
- `AgentEvent` 和 `onEvent` 标记 deprecated

### Task 5 — Streaming UI 迁移 🟢 Done

- `TimelineStore.buildLifecycleCallbacks()` — subscribe pipeable 驱动 text/thinking delta
- `InkRenderer.buildLifecycleCallbacks()` — 委托给 TimelineStore
- `mergeLifecycleCallbacks()` 工具函数 — 合并多消费者 callbacks
- `onRawEvent` 改为 noop

### Task 6 — Headless 迁移 + Eval 接口适配 🟢 Done

- Progress event 生成全部迁移到 lifecycle callbacks
- `HeadlessProgressEvent` 精简：移除 `step_start`（改为 `turn_start`）、移除 `tool_call.step` 字段
- 新增 `HeadlessRunOptions.streaming?: boolean`
- 四个 eval runner 零改动

### Task 7 — Trace 重构 🟢 Done

- 删除 `onAgentEvent()` 和 `AgentTraceEvent`
- `onLifecycleEvent()` 过滤为 trajectory 模式（跳过 tool_call_created/updated）
- `onProviderStreamEvent()` 加 `rawMode` 门控
- 删除 `toolVisibility`、`eventCounts.agentEvents`

### Task 8 — Repl 接线层 + 全局清理 🟢 Done

- `repl.ts` 用 `mergeLifecycleCallbacks(renderer, recorder)` 接线
- 删除 `AgentEvent` 类型定义（18 变体）
- 删除 `RuntimeOptions.onEvent` 和所有 `this.emit()` 调用（27 处）
- 删除 `Renderer.onEvent`、`InkRenderer.onEvent`、`TimelineStore.onRawEvent`

---

## 完成标志

- [x] `AgentEvent` 类型已删除
- [x] runtime 只通过 lifecycle callbacks 向外通信（不再有 `onEvent` 回调）
- [x] 所有消费者（UI / headless / trace）只消费 lifecycle callbacks
- [x] Streaming UI 的 delta 来自 pipeable subscribe，不再来自 AgentEvent
- [x] 默认 trace 只记录 trajectory（终态事件），不记录中间 delta
- [x] `trace --raw` 通过 rawMode 门控实现（CLI flag 接线待后续）
- [x] 全部现有测试通过或已适配
- [x] `pnpm build && pnpm typecheck && pnpm test` 绿灯

---

## 总结

### 产出

- 新增 `Pipeable<TDelta, TFinal>` 原语（packages/agent-core/src/pipeable.ts）
- 新增 `AgentLifecycleCallbacks` 类型系统 + `mergeLifecycleCallbacks` 工具函数（packages/agent-core/src/lifecycle.ts）
- Runtime 接入 lifecycle callbacks + Pipeable，覆盖 streaming loop 和 tool execution 全生命周期
- Streaming UI（TimelineStore）通过 `buildLifecycleCallbacks()` + pipeable subscribe 获取 delta
- Headless runner 通过 lifecycle callbacks 生成 progress events，新增 `streaming?: boolean` 选项
- Trace 重构为 trajectory 模式：默认只记终态事件，`rawMode` 门控 Layer 0
- AgentEvent 类型及所有 `onEvent` 接线彻底删除（27 处 this.emit 调用清除）

### 数据

- 删除：AgentEvent（18 变体）、AgentTraceEvent、tool_call_streaming_start/delta/end（3 变体）、toolVisibility
- 新增测试：~30 个（pipeable 16 + runtime lifecycle 7 + react-loop 1 + merge 4 + headless 适配）
- 最终测试：agent-core 336 passed，coding-agent 277 passed
- 预计 trace 体积减少 60-70%（trajectory 模式 vs 全量记录）

### 未完成 / 留到后续

- `--raw` CLI flag 接线（rawMode 门控已实现，CLI 入口未接）
- `onLifecycleEvent` 回调仍保留——timeline-projection reducer 和 trace-recorder 仍消费 LifecycleEvent 中的非 Pipeable 事件（tool_call_completed, assistant_turn_start/end, usage_updated 等）。完全消除 onLifecycleEvent 需要把这些事件也迁移到 lifecycle callbacks，是一个更大的重构，不在 CORE-R1 范围内。
