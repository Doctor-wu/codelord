# Codelord Trace 立场说明（第一版草案）

> 这份文档是 trace 全量研究的产出，不是功能清单。
> 它回答的是"codelord 的 trace 应该是什么"，而不是"trace 应该记哪些字段"。

---

## 北极星

**Trace 的存在是为了让 operator 能在 5 秒内定位"问题出在哪一层"。**

Codelord 的执行链路有三层：provider → agent core → user。
任何一次 run 出了问题，operator 打开 trace 后，应该能快速判断：

- 是 provider 没生成预期输出？
- 是 agent core 没正确组装或调度？
- 是 user action 改变了执行轨迹？

**Trace 不是日志，不是 metrics dashboard，不是审计系统。**
它是 operator 理解"这次 run 到底发生了什么"的第一工具。

---

## 三层模型

这是 codelord trace 的核心设计决策。Trace 必须分层记录，而不是把所有事件打平到一个列表里。

### Layer 0 — Provider 层

**记录 provider 返回了什么原始事件。**

这一层的职责是忠实记录 LLM provider 的响应，不做任何解释或组装。

一等事实：
- 每次 LLM call 的完整元数据：model、input tokens、output tokens、cached tokens、latency、stop reason
- provider 返回的 tool call 意图（tool name、arguments、call id）
- provider 返回的 thinking/reasoning 内容（如有）
- provider 返回的 text content

设计原则：
- 这一层记录的是"provider 吐出了什么"，不是"agent 理解成了什么"
- 如果 provider 吐出了 3 个 tool call，这里就应该有 3 条记录，即使 agent core 最终只处理了 2 个
- 缺失本身就是诊断信号：如果这一层没有 tool call 记录，说明 provider 根本没生成

### Layer 1 — Agent Core 层

**记录 runtime 如何处理 provider 输出、如何调度执行。**

这是 codelord 独有的 trace 层——其他系统（Claude Code 生态、LangSmith 等）几乎都不记录这一层。

一等事实：
- Tool lifecycle：从 provider 意图 → route decision → safety check → execution → result 的完整链路
- State transition：runtime FSM 的每一次状态变化（READY → STREAMING → TOOL_EXEC → BLOCKED → ...），包括 blocked reason
- Safety decision：哪些操作被放行、哪些被拦截、理由是什么
- Route decision：tool router 做了什么修正（original tool → resolved tool、rule id、reason）
- Context composition：system prompt hash、注入了哪些信息、裁掉了哪些信息（为 M4 预留）
- Cost fact：per-turn token usage + estimated cost

设计原则：
- 每个 tool call 必须有稳定 identity，从 provider 意图到最终结果用同一个 id 串联
- route / safety / execution 是同一个 tool call 的不同阶段，不是独立事件
- state transition 是理解"agent 为什么停住了"的关键信号

### Layer 2 — User 层

**记录 operator 做了什么、这些动作如何改变了执行轨迹。**

一等事实：
- User input：用户输入的内容和时间
- Interrupt：用户中断了正在运行的 burst
- Answer question：用户回答了 agent 的 blocking question
- Operator command：用户执行的 REPL command（/undo、/exit、future commands）
- Queue injection：运行中注入的消息

设计原则：
- user action 不是附属信息，而是一等 trace 事实
- 没有 user 层，trace 只能解释模型行为，不能解释产品行为
- 每个 user action 应该能被关联到它影响了哪个 agent core 状态变化

---

## 跨层串联

三层分开记录不够，必须能对得上。

**稳定 Identity 规则：**
- 每个 tool call 从 provider 生成到 execution 完成，使用同一个 id
- 每个 turn（一次 LLM call + 后续 tool executions）有一个 turn id
- 每个 user action 关联到它影响的 turn 或 state transition

**跨层对比是 trace 的核心诊断模式：**
- provider 层有 3 个 tool call，agent core 层只有 2 个 → 组装问题
- provider 层有 tool call，agent core 层 safety 拦截了 → 安全策略触发
- agent core 层进入 BLOCKED，user 层有 interrupt 记录 → 用户主动中断
- agent core 层进入 waiting_user，user 层没有 answer → 用户没有响应

---

## 消费面与分层投影

底层 event spine 产出全量事件。不同消费面从中获取不同投影。

### 消费面 1：实时操作台（Ink UI）

- 需要：低延迟、高频、当前状态
- 消费的事实：当前 step、当前 tool、当前 state、当前 cost、reasoning viewport
- 不需要：完整历史、settled 后的稳定视图
- 特点：streaming 中间态（toolcall_delta、thinking_delta）只在这个消费面有意义

### 消费面 2：持久化账本（Trace Ledger）

- 需要：完整、有序、可追溯、settled 后的稳定视图
- 消费的事实：三层的一等事实（见上文）
- 不需要：streaming 中间态（delta 级别事件）
- 特点：这是 trace 的持久化主体，写入 `~/.codelord/traces/`
- 要求：schema 稳定性高，因为 eval runner、trace CLI、未来的 replay 都依赖它

### 消费面 3：回放（Replay）

- 需要：因果关系、时序、决策路径
- 是持久化账本的投影，不是独立数据源
- 重点：能还原"当时为什么做了这个决策"
- 当前状态：**明确暂不实现**，但账本的数据模型应该预留足够信息支持未来回放

### 消费面 4：评测（M3 Eval）

- 需要：标准化的 metrics extraction、跨 run 可对比
- 消费的事实：从持久化账本提取 pass/fail、step count、cost、tool success rate、AskUserQuestion 触发频率等
- 对 schema 稳定性要求最高：如果 trace schema 变了，eval 对比就会断裂
- 特点：eval 是账本的下游消费者，不直接消费 event spine

### 消费面 5：审计 / 调试

- 需要：最细粒度，包括 control-plane 事件
- 消费的事实：三层全量 + interrupt/queue/safety 的完整时序
- 当前状态：由 `trace show` / `trace check`（未来重构后）承载
- 特点：不需要对所有消费面可见，可以作为 verbose 模式

---

## 与 Agent Trajectory 的关系

学术界和 eval 社区常说的 agent trajectory（轨迹）指的是一次 agent 执行的完整行动序列：

```
observation₀ → action₀ → observation₁ → action₁ → ... → actionₙ → result
```

**Trajectory 是 codelord trace 的一个子集投影。**

Trajectory 基本只关心 agent core 层的"action 序列"——做了什么、看到了什么、又做了什么。它不关心 provider 层吐了什么原始事件，不关心 router 做了什么修正，不关心 safety 拦截了什么，不关心 user 什么时候 interrupt 了。

Codelord 不需要单独建一个 trajectory 概念。做好三层 trace，trajectory 自然是持久化账本的一个消费面——专门给 M3 eval 用。但因为底层记录了三层完整信息，codelord 还可以回答 trajectory 回答不了的问题，比如"这步决策失败是因为 provider 没生成正确的 tool call，还是因为 router 路由错了"。

---

## 明确不做项

以下是当前阶段明确不做的事情，以及不做的理由：

### 不做 OTEL 导出

- 理由：codelord 的 trace 是内建产品能力，不是外挂到第三方平台的遥测管道
- OTEL 的数据模型（metrics + logs + distributed traces）为运维场景设计，不是为"理解 agent 这次 run 发生了什么"设计
- 未来可以作为可选导出通道，但不是 trace 的核心路径
- 重新评估时机：当 codelord 需要企业级部署监控时

### 不做 Replay 实现

- 理由：当前没有足够的 dogfooding 数据证明 replay 是高优先级痛点
- 但持久化账本的数据模型要预留 replay 所需的因果关系和时序信息
- 重新评估时机：当 eval 需要对比"同一个 input 在不同策略下的执行路径"时

### 不做 streaming 中间态持久化

- 理由：toolcall_delta、thinking_delta 是实时操作台的消费品，不需要落盘
- 落盘这些事件会大幅增加 trace 体积，但对调试和 eval 几乎没有价值
- settled 后的结果（完整的 tool call、完整的 thinking content）才进入持久化账本
- 例外：如果某个 streaming 相关的 bug 需要调试，可以临时开 verbose 模式

### 不做 trace check（当前形态）

- 理由：trace 的数据模型还没有定稳，check 没有稳定的"正确答案"去对照
- 现有的 streaming UX 诊断（thinking_absent、partial_to_lifecycle_gap_large 等）解决的是局部问题，不是 trace 的核心痛点
- 重新评估时机：当三层模型和一等事实稳定后，trace check 可以重新设计为"检查三层完整性和跨层一致性"

### 不做跨 session 的 trace 聚合分析

- 理由：当前阶段的核心痛点是"理解单次 run"，不是"分析使用模式"
- 聚合分析（哪个 tool 用得最多、平均 cost 多少、成功率趋势）是 M3 eval 和运维的职责
- 重新评估时机：当 M3 eval runner 稳定运行后

---

## 与 Hooks 的关系

Hooks 和 trace 是 event spine 的两个平级消费者，不存在谁建在谁之上的关系。

```
provider 事件 ──┐
                 ├──→ Event Spine ──→ Trace（内建，完整，三层全量）
core 事件    ──┤                 ──→ Hooks（外部扩展，选择性暴露）
                 │                 ──→ Ink UI（实时渲染）
user 事件    ──┘
```

- **Trace** 消费 event spine 的全量事件，写入持久化账本
- **Hooks** 只暴露外部需要的切面（PreToolUse、PostToolUse、UserPromptSubmit 等）
- **Ink UI** 消费实时投影（包括 streaming 中间态）
- 三个消费者独立演进，互不拖累

---

## 与后续 Milestone 的关系

### M3（Eval）

- Eval runner 从持久化账本提取 metrics
- Trace schema 的稳定性直接约束 eval 的可行性
- 这份立场确立后，eval 的 extraction pipeline 才有稳定基础

### M4（Context Engineering）

- Context composition（注入了什么、裁掉了什么、working set 如何演化）需要作为 agent core 层的一等事实被记录
- 三层模型中 Layer 1 已经为此预留了位置

### M5（Skill）

- 哪些 skill 被激活、skill 占了多少 token、skill 对结果的影响——这些是 agent core 层的未来一等事实
- 当前不需要，但数据模型应该支持扩展

### M6（Memory）

- Memory 命中了哪些记忆、注入了哪些、对结果有什么影响——同样是 agent core 层的未来一等事实
- Memory 写入候选内容需要复用 trace 的 redaction 管线

---

## 下一步实现顺序

基于这份立场，建议的实现顺序：

1. **补齐 Provider 层记录**：让 trace 能看到 provider 吐出了什么原始事件（当前最大的诊断盲区）
2. **为 tool call 建立跨层稳定 identity**：从 provider 意图到 execution 结果用同一个 id 串联
3. **User action 进入一等事实**：user input、interrupt、answer、command 进入持久化账本
4. **定义持久化账本的 schema v2**：基于三层模型重新设计 trace 的存储结构
5. **重构 trace CLI**：`trace show` 支持分层查看和跨层对比

---

## 这份立场的有效期

这是第一版草案。以下情况发生时应该重新审视：

- Dogfooding 中发现新的"trace 帮不了我"的场景，且三层模型无法覆盖
- M3 eval runner 对 trace schema 提出了当前模型无法满足的需求
- M4 context engineering 的 trace 需求超出了当前预留的扩展点
- 外部 agent 生态出现了值得借鉴的 trace 设计范式变化

---

## 研究过程

这份立场的关键判断来自以下研究路径：

1. **从 dogfooding 痛点出发**：operator 遇到"工具调用没出来"的问题，打开 trace 发现信息不够——由此推导出 trace 需要分层记录（provider / agent core / user），每层记录输入和输出，缺失本身就是诊断信号
2. **跨层对比是核心诊断模式**：同一个 tool call 在不同层的记录之间必须有稳定 identity，否则只能看到"这层有几个、那层有几个"，没法定位到底是哪一个丢了
3. **Claude Code 生态调研**：Claude Code 自身不做完整 trace，而是通过 OTEL 导出 + hooks 系统让社区搭建。社区方案分两派——LLM 观测平台（LangSmith/Langfuse）关注 LLM call 粒度，通用 APM（Honeycomb/Datadog）关注运维指标。两派都缺 agent core 层的 trace 和跨层对比能力。这是 codelord 的差异化机会
4. **Trace 与 hooks 的关系辨析**：最初直觉是"基于 hooks 开发 trace"，但分析后发现 hooks 只暴露 agent core 层的外部切面，看不到 provider 层原始事件和 runtime 内部 state transition。正确的依赖方向是 trace 和 hooks 都消费 event spine，而不是谁建在谁之上
5. **Trace 与 trajectory 的关系**：学术界的 agent trajectory 只关心 action 序列，是 codelord 三层 trace 的一个子集投影，专门服务于 eval。不需要单独建概念
