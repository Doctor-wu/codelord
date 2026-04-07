# Codelord — Decision Log

> 这里只记录"为什么路线改了"。
> 每条记录对应一次 roadmap 重写或增补，说明触发信号、改变了什么判断、以及注意力被推向了哪里。
> 日常 TODO 和当前焦点不在这里——见 [Sprint.md](./Sprint.md)。

---

## 2026-04-07 — Trace 立场确立：从局部字段补丁转向三层诊断模型

### 背景

M2 的 trace 一直在按"哪里疼补哪里"的模式推进：先加 tool call 记录，再加 streaming UX 诊断，再想加 `visible_tool_latency`、`operator action`、`queue lifecycle`——每次都是一个局部字段。这种模式导致 trace 缺乏稳定的问题模型，schema 无法被 eval 和 replay 可靠消费。

触发信号：dogfooding 时遇到"工具调用没出来"的问题，打开 trace 发现信息不够，但不知道问题出在 provider 没生成、agent core 没组装、还是 trace 没记录。这暴露了 trace 只有 agent core 层的单层视图。

### 决策

1. **Trace 北极星确立**：Trace 的存在是为了让 operator 能在 5 秒内定位"问题出在哪一层"，不是为了记录所有事件
2. **三层模型确立**：Trace 必须分层记录（Provider 层 / Agent Core 层 / User 层），而不是打平到一个列表。跨层对比是核心诊断模式，同一 tool call 必须有稳定 identity 串联三层
3. **Trace 与 Hooks 关系确立**：两者是 event spine 的平级消费者，不是谁建在谁之上。否定了"基于 hooks 开发 trace"的初始直觉
4. **消费面分层确立**：5 个消费面（实时操作台 / 持久化账本 / 回放 / 评测 / 审计）对 trace 数据有不同的粒度和延迟要求，不应混用
5. **明确不做项确立**：OTEL 导出、Replay 实现、streaming 中间态持久化、trace check 当前形态、跨 session 聚合分析——全部暂不做，并注明重新评估时机
6. **trace check 暂停**：当前的 trace check（查结构 + streaming UX 诊断）在三层模型稳定前没有明确的"正确答案"，暂停当前形态

### 影响

M2 的 trace 实现从"继续补字段"转向"先补齐三层模型的基础，再按优先级展开"。实现顺序改为：补齐 Provider 层记录 → 跨层稳定 identity → User action 一等事实 → schema v2 → trace CLI 重构。

### 结果

- 立场说明写入 `docs/planning/research/trace-position.md`
- RoadMap M2 section 已更新，trace 全局研究标记为 ✅，实现项按立场排序
- 首次按"大主题推进协议"完整走完研究→立场的流程，验证了这个治理模式的可行性

---

## 2026-04-05 — Streaming UX 判断更新：从 event spine 有没有数据，到 partial 事件有没有被投影为连续体验

### 背景

最新 dogfooding trace 暴露了一个新的主矛盾：provider trace 里长期没有 `thinking_*`，但 `toolcall_delta` 已经非常密集；当前问题不是"event spine 有没有数据"，而是"partial 事件有没有被投影为 operator 可感知的连续体验"。

### 决策

1. **Reasoning 判断更新**：在 `openai-codex / gpt-5.4` 当前调用链下，如果不显式请求 reasoning summary，UI 不应该期待稳定 raw thought；这不是单纯 renderer bug，而是 request semantics + UI projection 的联合缺口
2. **Tool Streaming 判断更新**：对 `file_read / file_write / ls` 这类 built-in tool，所谓"流式感"主要来自 **tool build-up + phase transition + partial args preview**，而不是 stdout streaming；如果只在 `tool_call_created` 之后才可见，产品上等同于不流式
3. **Projection 判断更新**：`AssistantReasoningState` 当前更像 phase shell，不足以单独支撑 operator trust；必须补上"真实 thought 或 derived live proxy"二选一，而不是让 reasoning lane 饿死
4. **渲染判断更新**：高频 `toolcall_delta` 不能直接逐事件全量重绘；需要节流、合并与 provisional object，否则 Ink 会在正确性和实时性之间两头都输

### 影响

M1X 的优先级进一步聚焦到 streaming operator feedback，而不是继续在 event spine 结构层打转。Reasoning v2 的未收口项已经直接并回 roadmap 主线，不再单独拆成 closure ledger。

### 结果

注意力推向更新后的优先顺序：
1. M1X-Streaming 的 operator feedback semantics：reasoning 可见性 / provisional tool build / partial args progressive preview / 节流合并策略
2. M1X 的 operator UX：recovery UX / queue visibility / progressive disclosure / composer polish
3. M2 的 trace 解释闭环：把"为什么看不见 thought / 为什么 tool 突然出现"也变成可诊断事实
4. 在 trace 与 streaming UX 足够可信之后，再推进 replay / compare / eval bootstrap

---

## 2026-04-03 — 产品主路径改写：从执行骨架转向 operator UX

### 背景

截至当前，runtime / tool kernel / contracts / router / safety 已经把 M1 的执行骨架立起来。roadmap 的主矛盾不再是"能不能跑起来"，而是"这些能力能不能以生产级 UX 被用户感知、控制、打断、恢复"。

### 决策

1. **产品主路径改写**：`REPL + Ink shell` 成为唯一产品主路径；`single-shot` 进入 sunset 轨道，不再继续驱动核心架构设计
2. **渲染策略改写**：`PlainTextRenderer` 不再作为长期产品能力维护；后续 headless / eval / trace 改走结构化事件与 trace-native 输出，而不是 plain text UI
3. **旁路线启动**：在 M1 和 M2 之间插入一条 **Agent UX / Event Spine** 旁路线（M1X），专门处理 event model、timeline、input composer、question/risk/status surfacing 和 Ink shell 重构
4. **架构判断更新**：UI 不是输出皮肤，而是 runtime 控制权的可视化载体；如果 event model 继续扁平，后续 tracing、TUI、tool UX、恢复语义都会持续互相拖累

### 影响

优先级从"继续补齐 M1 内部能力"转向"让已有能力被 operator 感知和控制"。M1X 成为 M1 和 M2 之间的必经路线。

### 结果

注意力推向四个收口方向：
1. M1 的 control-plane semantics：queue atomicity / safe-boundary contract / undo control event / resume semantics
2. M1X 的 operator UX：recovery UX / queue visibility / tool timeline progressive disclosure
3. M2 的 control-plane trace closure：把 user input / operator action / queue lifecycle 全部纳入事实账本
4. 在 trace 足够可信之后，再推进 replay / compare / eval bootstrap
