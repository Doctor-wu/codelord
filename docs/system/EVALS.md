# Codelord Eval 与证据规则

## 目的

本文档定义行为变更的证明标准。
它比未来的 `M3` eval 框架更广：它也涵盖在完整 eval 平台存在之前，什么算作证据。

## 当前姿态

仓库仍处于 `M1X + M2` closure 阶段。
这意味着当前的证据标准是：

1. current-focus 行为必须变得更可观测、更可信赖
2. trace 必须能解释 operator 可见的结果
3. 临时机制必须朝显式 closure 方向推进

不要假装完整的 eval 平台已经存在。

## 证据阶梯

对你正在做的变更，使用可用的最强级别。

| 级别 | 证据 | 适用场景 |
| --- | --- | --- |
| 0 | 仅设计论证 | 永远不足以支撑行为声明 |
| 1 | 本地 trace 检查 | 检查 events、ledgers 和可见性事实是否存在 |
| 2 | 固定回归 fixture | 防止 current-focus 区域的重复回归 |
| 3 | Dogfooding session 证据 | 验证 operator 信任和感知行为 |
| 4 | Product Eval 套件 | 未来的发布门槛，用于稳定的用户可见行为 |
| 5 | Research Eval 对比 | 未来的机制对比，跨 prompt/context/model 变体 |

对于当前 M1X/M2 工作，级别 1–3 是最低有用标准。

## 当前必须证明的内容

### Streaming / operator 反馈工作

必须在 trace 或 dogfooding 中展示以下至少一项改进：
- 当 provider thought 存在时，reasoning 可见
- 当 provider thought 不存在时，存在诚实的 live proxy
- provisional tool 构建在 stable tool lifecycle 确定之前出现
- 大参数 tools 不再有长时间的不可见间隙
- 没有 stdout 的内置 tools 仍然暴露可见的阶段变化

### Trace 解释工作

必须展示 trace 能回答以下问题之一：
- 为什么没有 thought 可见
- 为什么某个 tool 出现得晚
- UI 看起来冻结是因为 provider 行为还是 projection 行为
- 什么 operator 操作改变了 runtime 路径

### 临时状态工作

如果妥协确实不可避免，在以下时机更新 `docs/planning/RoadMap.md` 对应章节和 `docs/planning/Sprint.md`：
- 引入妥协时
- 妥协形态变化时
- 产品目标变得更清晰时
- 妥协退役时

## M1X + M2 期间优先的 Metrics

| Metric | 含义 | 来源 |
| --- | --- | --- |
| `reasoning_visible_rate` | operator 看到 provider thought 或诚实 proxy 的频率 | trace + dogfooding |
| `first_tool_visible_latency` | tool 变为 operator 可见所需时间 | trace diagnostics |
| `visible_tool_latency` | 从不可见到可见 tool 状态的产品级间隙 | trace diagnostics |
| `provisional_to_stable_handoff_correctness` | provisional tool 对象是否干净地协调为 stable lifecycle 对象 | trace + UI fixture |
| `queue_trace_completeness` | queue 的创建、注入、消费和状态转换是否全部被表示 | trace |
| `interrupt_recovery_clarity` | interrupt / blocked / resumed 状态对 operator 是否可理解 | dogfooding + trace |
| `reason_quality_coverage` | 带有有意义的 tool-scoped rationale 的 tool calls 占比 | trace + 人工审查 |
| `operator_trust_signal` | operator 是否不再需要猜测正在发生什么 | dogfooding |

## 证明规则

- 如果只是原始 events 改善了而 operator 可见行为没有改善，不要声称"已修复"。
- 如果可见性仅在 stable tool lifecycle 已创建之后才开始，不要声称"streaming"。
- 如果 trace 解释了 model events 但没有解释 operator 操作，不要声称"可追踪"。
- 没有退出条件，不要声称"临时"。
- 没有指出之前的失败模式，不要声称"更好"。

## Product Eval vs Research Eval

保持两条赛道分离。

### Product Eval

用于发布信心。
问题：
- agent 是否更易理解？
- operator 体验是否更安全、更少困惑？
- 是否回归了 current-focus 行为？

### Research Eval

用于机制对比。
问题：
- 新策略是否改善了 pass rate、latency、cost 或 trust signal？
- context/skill/model/routing 变更是否值得其复杂度？

不要用 research 胜利作为发布证明。
不要用发布门槛来阻止所有探索。

## 何时更新本文档

在以下情况更新 `EVALS.md`：
- 仓库开始默认使用更强的证据级别
- 新的 metric 成为 first-class
- 发布证明标准变更
- `M3` 活跃到足以添加具体的 eval 命令流程和 fixture 位置
