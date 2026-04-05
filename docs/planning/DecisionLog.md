# Codelord — Decision Log

> 这里只记录"为什么路线改了"。
> 每条记录对应一次 roadmap 重写或增补，说明触发信号、改变了什么判断、以及注意力被推向了哪里。
> 日常 TODO 和当前焦点不在这里——见 [Sprint.md](./Sprint.md)。

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
strap
