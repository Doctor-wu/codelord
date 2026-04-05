# Codelord — 临时方案收口台账

> 这里只追踪"现在先这么做，但不是最终方案"的内容。
> 每条记录必须能回答"什么时候不再算临时"。
> 体现 Roadmap Operating Principle：**Temporary-First Requires Explicit Closure**。
>
> 长期战略见 [RoadMap.md](./RoadMap.md)。当前 sprint 见 [Sprint.md](./Sprint.md)。

---

## 收口台账

| # | 项目 | 当前临时方案 | 为什么只是临时 | 目标正式方案 | 退出条件 | 需要的证据/指标 | 关联章节 |
|---|------|-------------|---------------|-------------|---------|----------------|---------|
| 1 | **Reasoning request policy** | `reasoning: low` 硬编码，能出 thought 就行 | 没有按 provider/model 区分能力，没有成本控制，没有降级策略 | 产品级 reasoning 策略：何时开、何时关、何时降级到 derived proxy、成本预算 | 建立 provider/model capability matrix，reasoning 开关有产品策略而非硬编码 | reasoning cost vs operator trust 的 eval 数据 | RoadMap M1X — Reasoning v2 |
| 2 | **Derived live proxy 兜底** | 无 `thinking_*` 时显示 `thinking / deciding / acting / blocked` + 下一动作意图 | 只是 phase shell，不携带真实 thought 内容，operator 信任度有限 | 从 raw/provider thought 稳定提取 `intent / why / expectedObservation / uncertainty / risk` | structured reasoning extraction 质量达到可用水平，eval 证明比 phase shell 有显著信任提升 | reasoning extraction accuracy、operator trust survey / A-B eval | RoadMap M1X — Event Spine |
| 3 | **Settled reasoning 呈现** | turn settled 后保持 streaming 末态，没有折叠/摘要/trace-only 策略 | 长 thought 会占据大量视觉空间，没有信息密度分层 | 定义 settled 呈现策略：保留 viewport / 折叠摘要 / 进入 trace-only，按 thought 长度和重要性分层 | 有明确的分层规则，不再靠临时 UI 分支硬编码 | dogfooding 中 settled thought 的视觉噪音投诉归零 | RoadMap M1X — Reasoning v2 |
| 4 | **Tool-scoped rationale 边界** | 只在 provider/agent 明确给出 per-tool justification 时写入 `displayReason`；否则不显示 | 正确但消极——大量 tool call 没有 reason，operator 只能猜 | 明确 rationale 的事实来源与注入边界：provider thought extraction / agent explicit annotation / skill-injected justification | rationale 覆盖率达到可接受水平（>50% 的 tool call 有 meaningful reason） | tool reason coverage rate、reason quality eval | RoadMap M1X — Reasoning v2 |
| 5 | **`visible_tool_latency` 诊断缺失** | `trace check` 只诊断 raw→lifecycle gap 和 delta density，没有贴近产品感知的 visible latency 指标 | operator 关心的是"tool 从不可见到可见花了多久"，不是 raw event 时序 | `visible_tool_latency` 作为一等诊断事实进入 `trace check` | `trace check` 输出包含 visible_tool_latency，且有合理阈值告警 | 至少 5 个 dogfooding trace 验证诊断准确性 | RoadMap M2 — TUI / Trace 可视化 |
| 6 | **User input / operator action 不是一等 trace 事实** | trace 记录了 LLM call 和 tool call，但 user input / operator action 还没有 fully 建模 | 没有这一层，很多产品级 bug 无法从 trace 回溯——只能解释模型行为，解释不了产品行为 | user input / operator action / queue message lifecycle 全部成为一等 trace 事实 | trace 能完整回答"operator 做了什么、agent 因此改变了什么" | 至少 3 个 dogfooding session 的 trace 能完整回溯 operator 交互链 | RoadMap M2 — 结构化 Trace |
| 7 | **Queue message lifecycle 未完整建模** | queue message 的注入点已有，但 atomic lifecycle（创建→排队→注入→消费→确认）没有 fully 建模 | 并发输入、恢复后的 queue 状态、trace 中的 queue 事件都依赖完整 lifecycle | queue message 有完整的 atomic lifecycle，trace 中可追踪每条 queue message 的全生命周期 | queue lifecycle 事件进入 trace，恢复后 queue 状态可审计 | trace 中 queue event 覆盖率 100% | RoadMap M2 — 结构化 Trace |
