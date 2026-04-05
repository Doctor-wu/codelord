# Codelord 设计原则

## 目的

本文档记录应当在 roadmap 重写、实现变动和 UI 迭代中存活下来的设计规则。

当问题是"我们试图保持什么样的系统？"时，使用本文档。

## 原则

### 1. 生产优先于 demo

- 优先考虑可追踪性、恢复、回滚、secret 卫生和回归控制，而非华丽的一次性 demo。
- 如果一个变更让产品看起来更好但让 operator 信任变差，拒绝它。

### 2. Agent core 保持最小化

- 只硬编码 agent 无法运行所必需的机制。
- 尽可能将行为策略、任务策略和有主见的工作风格放在 core 之外。
- Core 应回答"它能运行吗？"；更高层回答"它应该如何行为？"。

### 3. 稳定原语优先于巧妙 prompt

- 优先使用 kernel / contract / router / safety 风格的原语，而非自由形式的 prompt 技巧。
- 用 prompt 来表达策略，而非伪造缺失的架构。

### 4. 将隐式语义提升为 first-class

- 如果产品反复依赖某个概念，给它一个显式的对象或 event 形状。
- `AssistantReasoningState`、`ToolCallLifecycle`、queue lifecycle、checkpoints 和 trace ledgers 都是这条规则的例子。
- 不要让产品关键语义埋藏在原始文本 delta 或 renderer 启发式中。

### 5. Runtime truth 优先于展示 truth

- Runtime 和 snapshot 状态是权威的。
- UI、timeline、摘要和格式化 trace 输出是投影。
- Resume 和 undo 必须从 truth 协调，而非从 UI 上次展示的内容协调。

### 6. UI 是控制面，不是皮肤

- 终端 UI 是控制平面的一部分。
- 状态可见性、blocked 状态、queue 可见性和渐进式 tool 反馈是产品语义，不是打磨。
- operator 无法感知或控制的能力不是真正的产品能力。

### 7. 先 trace，后解释

- 当行为难以推理时，先改进 trace 和 event 模型，再围绕它添加叙事。
- 产品调试应能同时回答：
  - agent 做了什么
  - 为什么 operator 看到了他们所看到的

### 8. 先 eval，后声明

- 没有假设、可观测信号或回归 fixture，不要声称改进。
- 产品改进需要面向 operator 的证据。
- 研究改进需要可重复的对比，而非感觉。

### 9. 临时优先仅在有显式 closure 时允许

- 临时方案仅在附带以下内容时有效：
  - 声明的限制
  - 目标正式方案
  - 退出条件
  - 所需证据
- 如果一个 workaround 没有 closure 路径，它不是临时的；它是意外架构。

### 10. 分层优先于巧妙

- 优先使用清晰的包和边界所有权，而非跨层魔法。
- 如果更快的实现穿透了多个层，写下权衡或重新设计它。

### 11. Roadmap 可重写；架构不可随意

- 策略可能随 dogfooding 和数据而变。
- 稳定边界不应随意变动。
- 重写 roadmap 不意味着溶解系统的语义结构。

## 设计审查问题

在落地一个有意义的变更之前，回答以下问题：

1. 哪个层拥有这个行为？
2. Source of truth 是什么？
3. 这是稳定原语还是临时 workaround？
4. 什么 trace 或 eval 证据能证明它有帮助？
5. 哪份文档必须更新，以便下一个 agent 不必重新发现这个逻辑？
