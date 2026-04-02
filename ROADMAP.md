# Codelord — Production Coding Agent Roadmap V2

> 不是 demo，不是玩具，是正儿八经的 coding agent。
> **也不是 mini Claude Code 或 mini Codex——这是我自己的 agent，有自己的哲学。**

---

## 哲学

**Agent Core 极简，智能来自 Context Engineering + Skill。**

Agent 内部只做执行引擎该做的事——ReAct loop、tool 执行、消息调度、tracing、安全拦截。
所有"聪明"的行为全部通过两个可实验、可度量的层注入：

- **Context Engineering（地基）：** 构造什么样的 context 给 LLM，决定了 LLM 能做出什么质量的决策。包括 codebase 理解、任务相关信息检索、context 空间分配。
- **Skill（上层建筑）：** 在好的 context 基础上，教 agent 用什么行为模式去完成任务。Planning、self-verification、编辑策略、错误恢复——全部是可组合、可开关、可 A/B eval 的 prompt fragment。

**这意味着 codelord 的天花板不取决于 agent core 写得多好，而取决于 context 构造得多好、skill 写得多好。Roadmap 的重心反映这一点。**

**Tool 哲学：** 最小有效工具集。内置少量高可靠工具覆盖核心操作，MCP 作为扩展通道按需接入。
但内置 tool 不只是“让 LLM 自由调用的函数”，而是 **分层稳定原语**：
- Tool Kernel：执行、参数校验、风险标签、标准错误码、结果归一化
- Tool Contract：`when_to_use` / `when_not_to_use` / 前置条件 / 失败语义 / fallback hint
- Tool Router：优先走内置 tool 的稳定路由，必要时才交给更开放的 LLM/skill 策略层
- Skill Policy：决定工具调用顺序、组合方式、验证方式

**Eval 哲学：** Eval 不是某个 milestone 的附属品，而是贯穿全程的基础设施。每一个改动——context 策略、skill 内容、工具增减、memory 机制——都必须能被度量。没有 eval 数据支撑的改动就是在赌博。

**协作模式：** 在本对话中讨论设计与策略 → 产出高质量 Claude Code prompt → 在 Claude Code 中执行实现。

---

## Roadmap Operating Principles

> 这不是装饰性的价值观，而是 roadmap 的硬门禁。

- **Eval-first**：没有 eval 假设的改动，不进 roadmap 主线
- **Dogfooding-first**：每个 milestone 必须产出可真实使用的东西，而不是只完成内部抽象
- **Positive Feedback Loop**：每个 milestone 都要有清晰、可感知的正反馈，不堆大而全阶段
- **Production-over-Demo**：trace、rollback、secret hygiene、regression gate 这类“看起来不炫”的能力优先级高于 demo 特性
- **Unknown-Unknowns Recovery**：每个 milestone 结束必须沉淀 `top 3 unknown unknowns`，驱动 roadmap 重写
- **Roadmap Is Rewritable**：里程碑服务原则，不反过来绑架设计。数据或 dogfooding 证明方向不对，就重写
- **Layering Over Cleverness**：优先做清晰分层和稳定接口，不迷信“一层 prompt 搞定一切”

---

## 任何 Coding Agent 都在解决的五个根本问题

| 问题 | 本质 | Codelord 的回答 |
|------|------|-----------------|
| **理解** — codebase 是什么？用户要什么？ | Context Engineering | 动态构造最有效的 context（M4） |
| **规划** — 该做什么？什么顺序？ | 决策策略 | Skill 层注入，不硬编码（M5） |
| **执行** — 怎么可靠地改代码？ | 工具可靠性 | 最小有效工具集（M1） |
| **恢复** — 出错了怎么办？ | 容错机制 | Core 提供机械层，Skill 提供策略层（M1/M5） |
| **进化** — 怎么越来越好？ | 度量 + 迭代 | Eval 驱动一切（M3，贯穿全程） |

---

## Core vs Skill 边界

这条边界是 codelord 的灵魂。每加一个新功能前先问：**这属于执行引擎，还是属于"怎么做好任务"的 opinion？**

| 属于 Agent Core（硬编码） | 属于 Skill 层（prompt fragment 注入） |
|---|---|
| ReAct loop + FSM + 消息调度 | Planning 行为（先列计划再执行） |
| 内置工具内核 + Tool Contracts + Tool Router + 超时 + 截断 | 工具使用策略（什么场景用哪个工具、怎么组合、按什么顺序调用） |
| Context window 管理（截断、压缩、溢出） | Self-verification（改完文件后 read 确认） |
| Codebase indexing 基础设施 | 项目探索模式（先看什么文件、怎么建立心智模型） |
| Memory 存储与检索基础设施 | Memory 写入策略（什么值得记住、怎么组织） |
| Tracing & cost 追踪 | 语言/框架最佳实践 |
| Eval runner & 指标收集 | Git 工作流（commit 规范、PR 描述） |
| 安全拦截（声明式风险标签） | Error recovery 的具体策略 |
| MCP client 协议实现 | Agent 角色定义 |
| Multi-agent orchestration | 具体的 skill 内容本身 |
| Skill 加载/激活/组装机制 | |

**判断原则：** 如果把这个行为去掉，agent 还能跑（只是跑得没那么好）→ 它是 skill。如果去掉后 agent 直接跑不了 → 它是 core。

---

## 已完成的基础

### 理论学习

- [x] **Phase 0 — LLM Fundamentals：** Transformer 全组件 / Pre-training 闭环 / SFT / RLHF-DPO 骨架（via minimind 源码阅读）
- [x] **Phase 1 — LLM → Agent Bridge：** 推理策略（temperature / top-k / top-p）/ KV Cache / Function Calling（LLM 输出意图、harness 执行）/ Structured Output（Constrained Decoding）
- [x] **Phase 2 — Agent Core Concepts：** Agent vs Chatbot（谁控制循环）/ ReAct 骨架（Thought 写进 context）/ Workflow vs Agent 选型 / 多 Agent 协调（Supervisor vs Handoff）/ Memory 两层（短期 context + 长期外部存储）

### 代码实现

- [x] Monorepo 结构（`packages/agent-core` + `agents/coding-agent`）
- [x] ReAct loop + FSM 状态机（IDLE → STREAMING → TOOL_EXEC → DONE/ERROR）
- [x] Tool handler 注册机制 + bash tool（execFile + timeout + truncation）
- [x] 事件系统（AgentEvent stream，支持 step_start / text_delta / toolcall_end / tool_result / done / error）
- [x] pi-tui 集成（Markdown 渲染 + 状态栏）
- [x] OAuth 凭证管理（OpenAI Codex login + refresh + persistence）

---

## 全景图

```
M0  骨架         ──→ ✅ 已完成（架构 + CLI）
M1  执行引擎     ──→ 交互 + 工具集 + 消息调度 + 安全 + 持久化 + undo
M2  可观测性     ──→ Tracing + Cost + Prompt Caching
M3  度量能力     ──→ Eval 框架（从轻到重，贯穿全程进化）
M4  理解力       ──→ Context Engineering + Codebase Indexing + Project Memory
M5  行为智能     ──→ Skill 系统（基础设施 → 内容打磨 → 条件激活）
M6  长期记忆     ──→ Behavioral Memory（用户偏好 + 错误 pattern + 任务 pattern）
M7  生态扩展     ──→ MCP + Model Routing + Thinking Budget
M8  安全加固     ──→ 生产级安全体系
M9  多体协作     ──→ Multi-Agent
```

## ~~M0 — 骨架~~ ✅ 已完成

> 把原型代码重构为可分发的生产级架构。

- [x] 包结构：`packages/agent-core`（纯引擎）+ `packages/config`（配置解析）+ `agents/coding-agent`（composition root）
- [x] CLI 骨架：`codelord "message"` single-shot / `codelord init` / `codelord config`
- [x] Output 抽象：`TUIRenderer` + `PlainTextRenderer`，CLI flag `--plain` 切换
- [x] Auth 泛化：API key 类 + OAuth 类，按 provider 分策略

**✅ 完成标志：** `codelord "explain this project"` 在任意目录下跑通。

---

## M1 — 执行引擎

> 把 agent 从 single-shot 升级为可交互、可中断、可恢复的执行引擎。
> 这是 agent 的"四肢"——能动手干活的基础。
>
> **M1 的核心设计决策：ReAct loop 的消息调度架构。**
> 现有 FSM 是线性的（IDLE → STREAMING → TOOL_EXEC → DONE），没有外部输入的入口。
> M1 必须从架构层面支持两种消息注入模式，否则后续所有交互能力都是补丁。

### ReAct Loop 升级：消息调度

> 这是 M1 最重要的架构工作。不是"加个功能"，而是重新设计 FSM 的状态转换。

- [ ] **Interrupt（中断当前 step）：**
  - 用户在 agent 执行过程中发送消息（Ctrl+C 或直接输入）
  - 如果当前是 LLM streaming → 中止 stream，已生成的部分保留为 partial assistant message
  - 如果当前是 tool 执行 → 等待当前 tool 完成（tool 不能半截停），然后中断
  - 用户消息作为新的 user message 注入 context
  - Agent 基于更新后的 context 重新决策
  - FSM 新增状态转换：`STREAMING → INTERRUPTED → STREAMING`、`TOOL_EXEC → TOOL_DONE → INTERRUPTED → STREAMING`
  - 典型场景："不对，别改那个文件，改这个"、"停一下，我先看看你改了什么"
- [ ] **Queue（排队到下个 tick）：**
  - 用户输入不打断当前执行
  - 消息进入队列，当前 step 完成后、下一个 LLM call 之前注入
  - FSM 在每个 step 间隙检查消息队列
  - 典型场景："顺便把测试也跑一下"、"记得用 pnpm 不要用 npm"
- [ ] **Agent 主动提问：**
  - Agent 在不确定时可以输出一个特殊的 `ask_user` action，暂停执行等待用户回复
  - 不是 tool call，而是 FSM 的一个状态：`STREAMING → WAITING_USER → (user reply) → STREAMING`
  - 通过 system prompt 教 agent 什么时候该问（"如果任务有歧义，先问清楚再动手"）
  - 典型场景："这个函数有两个同名的，你要改哪个？"

### 多轮对话 REPL

- [ ] `codelord` 无参数启动时进入交互模式（REPL）
- [ ] `codelord "message"` 保留为 single-shot 模式（执行完退出）
- [ ] 会话历史在多轮间保持（messages 数组持续积累）
- [ ] TUI 中区分 user / assistant / tool 消息的视觉呈现
- [ ] 优雅退出（Ctrl+C 双击 / `/exit` 命令）

### 内置工具系统 v1

> 最小有效工具集，但不是“让 LLM 自己随便挑函数”。
> 内置工具应该形成一套 **稳定的内核 + 合同 + 路由** 体系，先保证核心路径稳定，再把更开放的策略空间留给 skill。

#### Tool Kernel

- [ ] **bash** — 通用命令执行（最灵活的兜底工具）
- [ ] **file_read** — 读取文件内容（支持行范围、大文件分块）
- [ ] **file_write** — 创建/覆盖文件（全量写入）
- [ ] **file_edit** — search-and-replace 编辑（old_string → new_string）
- [ ] **search** — 代码搜索（ripgrep 风格，支持 glob、正则、上下文行数）
- [ ] **ls** — 目录列表（支持 glob、递归、类型过滤）
- [ ] 统一 Tool 接口：`{ name, description, inputSchema, execute() → ToolResult }`
- [ ] 每个工具声明 `riskLevel: 'safe' | 'write' | 'dangerous'`
- [ ] Tool result 统一格式：`{ output, isError, duration, metadata }`
- [ ] 标准错误码：`NO_MATCH` / `MULTI_MATCH` / `TIMEOUT` / `PERMISSION_DENIED` / `INVALID_ARGS`

#### Tool Contracts

- [ ] 每个内置工具声明：`when_to_use` / `when_not_to_use` / `preconditions` / `failure_semantics` / `fallback_hints`
- [ ] `file_edit` 明确 0 次匹配、多次匹配、上下文不足时的失败语义
- [ ] `search` 与 `file_read` 的职责边界明确，避免“已知路径还去 search”这类低效行为
- [ ] `bash` 被定义为兜底原语，而不是默认首选

#### Tool Router v1

> 核心路径优先走确定性路由，而不是每次都让模型自己想“该用哪个工具”。

- [ ] 已知文件路径且需要读内容 → 默认 `file_read`
- [ ] 未知定义位置 / 需要全局定位 → 默认 `search`
- [ ] 已知目标文件且有精确 old_string → 默认 `file_edit`
- [ ] 新建完整文件 / 全量重写小文件 → 默认 `file_write`
- [ ] shell pipeline / git / build / test / 复杂命令 → 默认 `bash`
- [ ] Router 产出理由和命中规则，写入 trace，方便后续评估路由质量
- [ ] Skill 不直接替代 router，而是在 router 之上决定调用顺序、重试策略和验证动作

### System Prompt v1（手写，够用就行）

- [ ] 基础角色定义 + 工具使用规范 + 输出格式约定
- [ ] 每个内置工具的使用场景说明
- [ ] 项目上下文注入（cwd、git branch、目录结构摘要）
- [ ] 这版 prompt 是**临时的手写版**，后续被 skill 系统替代
- [ ] **记录 system prompt 的 token 数**，建立基线

### Context Window 管理 v1

- [ ] Messages 的 token 计数（粗估，按字符数 / 4）
- [ ] 达到阈值时的截断策略：保留 system prompt + 最近 N 轮对话
- [ ] 记录 system prompt 占总 context 的比例（为后续 budget 控制提供基线）

### 会话持久化

- [ ] 会话历史序列化到磁盘（`~/.codelord/sessions/`），退出 REPL 后可恢复
- [ ] `codelord` 启动时检测上次未完成的会话，提示是否恢复
- [ ] `codelord --new` 强制开启新会话
- [ ] 会话元数据：cwd、git branch、开始时间、最后活跃时间

### Undo / Rollback

- [ ] 每次 agent run 开始前自动创建 git checkpoint（如果在 git repo 内）
- [ ] `/undo` REPL 命令：回滚到上一个 checkpoint
- [ ] 非 git 目录的 fallback：备份被修改的文件到 `~/.codelord/checkpoints/`
- [ ] Checkpoint 信息记入 trace

### 基础安全网

- [ ] 声明式工具风险标签：每个工具自带 `riskLevel`，bash 命令额外通过 pattern matching 细分
- [ ] `dangerous` 操作拦截，`safe` 静默放行，`write` 放行但记录
- [ ] 敏感路径保护（`~/.ssh`、`/etc` 等）
- [ ] Git 高危操作保护（force push / branch delete / reset --hard）
- [ ] max_steps 硬上限

### 工具成功率轻量追踪

- [ ] 每个工具的 attempts / successes / failures counter
- [ ] 重点关注 file_edit 的匹配成功率
- [ ] 记录 tool router 的命中规则与后续结果，建立最小 router precision 数据

### 轻量 Tracing（从 M2 前置）

- [ ] 最小 Trace 数据模型：`{ runId, timestamp, steps: [{ type, ... }] }`
- [ ] 每个 LLM call 记录：model / stop reason / latency
- [ ] 每个 tool call 记录：tool name / args（截断）/ exit code / duration / is_error
- [ ] Trace 写入 `~/.codelord/traces/`，dogfooding 时 `cat` / `jq` 看

> **🧠 你不知道你不知道的：**
>
> - **消息注入是 ReAct loop 的架构问题，不是 UI 功能。** 如果一开始不把 interrupt / queue / ask_user 设计进 FSM，后面每加一种交互都会变成 hack。
> - **tool 不能被可靠地“半截停掉”。** LLM streaming 可以 cancel，外部进程很难安全 cancel。所以 interrupt 的语义应该是“尽快中断”，不是“立刻杀掉一切”。
> - **file_edit 的边界处理直接决定可用性。** old_string 0 次匹配、匹配多次、跨行匹配失败，都是高频真实场景。
> - **会话持久化和 undo 是心理安全网。** 没有它们，你会不自觉地只给 agent 小任务，不敢真的 dogfood。
> - **system prompt token 占比是隐藏约束。** 现在先记基线，后面 skill / memory / context assembler 一上来就会膨胀。
>
> **✅ 完成标志：** `codelord` 启动进入 REPL，多轮对话、interrupt、queue、ask_user 都能跑通。内置工具内核 + contracts + router 端到端工作。会话可恢复，`/undo` 可回滚。危险操作被拦截。每次 run 自动产出最小 trace。Dogfooding 一天，记录 3 个最大痛点。

---

## M2 — 可观测性

> 先让 agent 对自己“透明”。
> M2 回答的问题不是“agent 做得好不好”，而是“agent 到底做了什么、花了多少钱、哪里出错了”。
> 没有这一层，后面的 eval、context 优化、skill 打磨都会变成盲飞。

### 结构化 Trace v1

- [ ] 从 M1 的 flat JSON 升级为层次化 trace：`Run → Step → (LLMCall | ToolExecution | UserInterrupt | QueueMessage | AskUser)`
- [ ] 每个 LLM call 记录：model / input tokens / output tokens / latency / stop reason
- [ ] 每个 tool call 记录：tool name / args / result preview / duration / is_error
- [ ] 每次消息注入都进 trace：interrupt 的来源、queue 的排队时间、ask_user 的等待时长
- [ ] 记录当前 system prompt 版本、active skills（M5 后）和 active memory sources（M6 后）
- [ ] Trace 文件写入 `~/.codelord/traces/`

### 成本追踪

- [ ] 按 provider / model 的价格规则统计 input / output / cached tokens 成本
- [ ] 每次 run 的 cost breakdown（按 step）
- [ ] cost ceiling：单次 run 超预算自动停止
- [ ] 在 trace 中保留估算成本和真实账单口径的差异字段（为后续对账预留）

### Trace Hygiene / Secret Redaction（最小版，前移）

> 安全不等到 M8 才开始。只要从 M2 开始落盘 trace，就必须做最小脱敏。

- [ ] 对 trace 中的工具输出做基础 secret redaction（API key、token、cookie、private key pattern）
- [ ] 对 memory 候选写入内容复用同一套 redaction 管线
- [ ] 区分“原始输出只在进程内短暂存在”和“允许落盘的脱敏输出”
- [ ] 为 redaction 命中写 trace metadata，方便后续调试误杀/漏杀
- [ ] 把 redaction 误伤率纳入后续 M8 的 safety eval

### Prompt Caching

- [ ] 调研 provider 的 prompt caching 支持并在 `pi-ai` 层抽象出来
- [ ] system prompt / 常驻 context / skill fragments 标记为 cacheable
- [ ] trace 中记录 cache hit / miss / cached token 数
- [ ] cost tracking 区分 cached vs uncached input token

### TUI / CLI 可视化

- [ ] 状态栏展示：当前 step / token usage / estimated cost / active model
- [ ] tool 执行耗时实时展示
- [ ] `codelord trace list`：列历史 trace
- [ ] `codelord trace show <id>`：查看单次 trace 详情
- [ ] PlainTextRenderer 可渲染 trace（为 headless 调试和 M3 eval 复用）

> **🧠 你不知道你不知道的：**
>
> - **可观测性是 agent 世界里的 debugger。** reasoning 是自然语言，你没法打断点，只能靠 trace 回放。
> - **不记录 interrupt / queue / ask_user，后面就没法分析交互式 UX。** 这是 codelord 和单次 agent 的重要区别。
> - **prompt caching 不是优化项，是经济可行性的前提。** 多轮 REPL 没有 caching，input cost 会非常难看。
> - **只要 trace 开始落盘，最小 secret hygiene 就必须同步上线。** 否则你会在 M8 之前先把脏数据写进 trace 和 memory，后面再补安全已经来不及。
>
> **✅ 完成标志：** 每次 run 自动产出结构化 trace。`trace list/show` 可用。状态栏能看到 token 和 cost。prompt caching 命中率可观测。trace 与 memory 候选写入都具备最小 redaction。

---

## M3 — 度量能力（Eval）

> Eval 是单独的大 milestone，而且要非常认真做。
> 它不是“跑几个 case 看看”，而是 codelord 的实验平台。
> 后续每一个变化——context 策略、skill prompt、memory 写入、model routing——都通过 M3 验证，不靠感觉。

### M3a — Eval 基础设施

- [ ] 定义 eval case 格式：`{ id, description, setup, input, expected, tools, maxSteps, judge }`
- [ ] 实现 eval runner：headless 运行 agent，复用 PlainTextRenderer 和 trace 管线
- [ ] 每次 eval run 产出：结果、trace、prompt version、model version、active config
- [ ] 支持 fixture 项目初始化 / 清理 / 隔离运行
- [ ] `codelord eval run` 基础可用

### M3b — Product Eval（产品门禁）

> 回答“这个版本对真实用户是不是更好用了”。

- [ ] 设计 10-20 个基础 case，覆盖：
  - 读文件回答问题
  - 搜索代码定位定义
  - 精确修改一处代码
  - 多文件改动
  - 跑测试并解释失败
  - 简单 bug fix
  - 理解项目结构并回答架构问题
  - 处理用户中途纠偏（interrupt / queue）
  - ask_user 正确触发
- [ ] 每个 case 明确 pass criteria
- [ ] 支持 deterministic judge（文件 diff / 测试通过 / 关键输出匹配）优先
- [ ] 记录用户体验导向指标：pass@1 / avg_steps / avg_cost / ask_user precision / interruption recovery
- [ ] 建立 `smoke` / `core` 两层产品套件，作为日常开发和回归门禁

### M3c — Research Eval（研究实验）

> 回答“某个机制在理论上是否真的提升了 agent 能力”。

- [ ] 单独评估 context strategy / skill variant / memory policy / model routing 这些实验变量
- [ ] 每个 research case 跑 N 次（N ≥ 5），记录 pass rate 而不是单次结果
- [ ] 记录研究指标：step efficiency / cost / recovery success rate / tool routing precision / memory hit quality
- [ ] `codelord eval compare <run1> <run2>`：支持新旧实验结果对比
- [ ] 报告格式：`case | pass_rate | avg_steps | avg_cost | delta`
- [ ] 明确：research eval 可以探索激进想法，但不直接充当发布门禁

### M3d — LLM-as-Judge 与外部 Benchmark

- [ ] 在 deterministic judge 不够的 case 上引入 LLM-as-judge
- [ ] 校准 rubric：task completion / reasoning quality / code quality / user-alignment
- [ ] 对接外部 benchmark 的 adapter（如 SWE-bench 风格任务、repo-level coding task）
- [ ] 区分“内部 golden set”与“行业 benchmark”两类信号：前者优化产品方向，后者提供绝对坐标

### M3e — 实验平台化

- [ ] 每个 experiment 绑定：prompt version / skill set / context strategy / model / memory policy
- [ ] 支持 A/B test：同一 case 在两套配置上对比
- [ ] 把 M3 设计成后续所有 milestone 的共用实验底座

> **🧠 你不知道你不知道的：**
>
> - **没有 eval，所有“优化”都只是意见。**
> - **Product Eval 和 Research Eval 是两条轨。** 前者决定能不能发布，后者决定值不值得继续研究。混在一起会把门禁和探索都做坏。
> - **pass@1 和 pass@5 回答的是不同问题。** pass@1 是用户体验，pass@5 是能力上限。
> - **ask_user 也需要被 eval。** 问太多打断体验，问太少就会瞎猜。它本身是一个可优化对象。
> - **行业 benchmark 不是产品真相。** 它给你绝对坐标，但不代表你的用户最在意什么。内部 golden set 同样重要。
>
> **✅ 完成标志：** `eval run/compare` 可用。拥有一套稳定的 golden dataset。可以用数据比较不同 prompt / skill / context / memory 策略的优劣。

---

## M4 — 理解力（Context Engineering + Codebase Indexing + Project Memory）

> 这是 codelord 的第一核心 milestone。
> 不是“怎么不把 context 撑爆”，而是“怎么构造最有价值的 context”。
>
> **Context Engineering 才是 agent 的真正智力杠杆。**

### Codebase Indexing

- [ ] 首次进入项目时建立基础索引：目录结构、关键入口文件、依赖文件、测试文件、配置文件
- [ ] 识别语言 / 框架 / 包管理器 / monorepo 形态
- [ ] 提取项目约定：测试命令、lint 命令、build 命令、常见路径模式
- [ ] 支持增量更新（文件变化后局部刷新，不全量重扫）
- [ ] 索引结果存储到 `~/.codelord/indexes/` 或项目内 cache

### Task-Aware Context Assembler

- [ ] 根据任务类型构造 context：
  - bug fix：错误信息 + 相关源文件 + 测试
  - feature：架构概览 + 相邻模块 + API 契约
  - code question：目录图 + 关键文件摘要
  - refactor：调用链 + 测试覆盖面 + 风险点
- [ ] 定义 context budget 分配：system prompt / project summary / relevant files / recent history / user overrides
- [ ] 动态注入相关信息，而不是把所有东西都塞进 context
- [ ] 允许用户显式 pin 某些信息进 context（如“永远记住这个约束”）

### Working Set Builder

> working set = 当前任务真正持续需要盯住的文件、摘要、约束、错误信息集合。
> 它比“临时 retrieval 结果”更稳定，也比“整个 context”更工程化。

- [ ] 为每个活跃任务维护 working set：相关文件、关键片段、当前假设、必须遵守的约束
- [ ] 区分 `retrieved once` 和 `keep in working set`，不是所有检索结果都值得长期占位
- [ ] working set 可随任务推进增删：定位 bug 后加入测试和源文件，修复完成后移除噪音文件
- [ ] 在 trace 中记录 working set 的演化，方便分析 agent 为什么在某步看到了这些信息
- [ ] 让 context assembler 优先从 working set 取材，而不是每轮重新拼接一切

### Context Window 管理 v2

- [ ] 分层保留策略：system prompt → pinned constraints → current task context → working set → recent turns → compressed history
- [ ] tool result overflow：完整结果写文件，context 只放摘要 + 路径
- [ ] 大文件分块读取策略
- [ ] context 质量日志：哪些信息被注入了、哪些被裁掉了

### Project Memory

> 这是 memory 的第一层：对某个项目形成持续记忆。
> 和 M6 的 behavioral memory 不同，这里记的是“项目是什么样”。

- [ ] 为每个项目维护持久化记忆：架构摘要、关键模块、编码约定、常见命令、已知坑点
- [ ] 项目记忆来自两部分：
  - 索引自动提取的结构化事实
  - agent 在任务中总结出的高价值结论
- [ ] 定义写入策略：只有高置信、跨任务可复用的信息才写入 project memory
- [ ] 在新 session 进入项目时自动加载 project memory 的摘要版

### Context Quality Eval 接入 M3

- [ ] 把 context strategy 当成 eval 变量：比较不同 assembler 策略的分数差异
- [ ] 记录每次 run 的 context composition，支持事后分析“这次为什么选错”
- [ ] 用 M3 数据驱动 context assembler 的迭代

> **🧠 你不知道你不知道的：**
>
> - **context engineering 和 context window 管理不是一回事。** 后者是防爆，前者是提智。
> - **陌生 repo 的第一步不是搜索，而是建立地图。** 没地图的搜索会让 agent 在局部细节里迷路。
> - **working set 是 coding agent 很关键的一层。** 没有它，agent 每一轮都像失忆后重新找线索；有了它，agent 才像真的在“盯住当前问题”工作。
> - **project memory 不能什么都记。** 记得太多就是噪音，记得太少就没有价值。写入策略比存储本身更重要。
> - **context 质量可以被 eval。** 这正是 codelord 的差异化：把“怎么喂 context”做成实验对象。
>
> **✅ 完成标志：** agent 进入一个新 repo 后，能快速建立项目地图。针对不同任务类型自动装配 context，并维持可观测的 working set。跨 session 保留项目理解，不必每次从零开始。

---

## M5 — 行为智能（Skill System）

> 这是 codelord 的第二核心 milestone。
> core 解决“能不能运行”，skill 解决“能不能优雅地完成任务”。
>
> **重点：Skill 的价值 70% 来自内容质量，30% 来自基础设施。**

### M5a — Skill 基础设施

- [ ] Skill 格式：`skills/<name>/SKILL.md`
- [ ] frontmatter：`name` / `description` / `when_to_use` / `allowed_tools` / `priority`
- [ ] Markdown 正文 = prompt fragment
- [ ] 启动时扫描全局 `~/.codelord/skills/` + 项目内 `.codelord/skills/`
- [ ] Prompt 组装引擎 v1：多 skill 按固定顺序注入 system prompt
- [ ] Skill 开关机制：按实验配置启停

### M5b — Skill Content Engineering

> 这是最容易被低估、实际上最费时间的部分。

- [ ] 为每个内置 skill 设计初版 prompt fragment
- [ ] 通过 dogfooding + M3 eval 反复改写 skill 内容
- [ ] 对同一个 skill 维护多个 prompt 变体并做 A/B test
- [ ] 抽象“好 skill prompt”的写作模式：结构、语气、约束方式、示例密度

### M5c — 条件激活 & 动态发现

- [ ] frontmatter 支持 `paths` / `languages` / `frameworks`
- [ ] 按当前任务和项目类型条件激活 skill
- [ ] 文件操作时向上遍历查找新的 `.codelord/skills/`
- [ ] 参考文件按需读取，不默认塞进 context
- [ ] context budget 不足时的 skill 降级策略

### 首批内置 Skills

- [ ] **planning** — 复杂任务先列计划
- [ ] **self-verification** — 改完先验证
- [ ] **tool-usage-strategies** — 在 core router 之上定义工具调用顺序、组合方式、验证动作与 fallback 模式
- [ ] **error-recovery-strategies** — 遇错后的 fallback 手法
- [ ] **typescript-project** — TS 项目实践
- [ ] **node-project** — Node 项目实践
- [ ] **python-project** — Python 项目实践
- [ ] **git-workflow** — Git 工作流与提交规范

### Skill Eval

- [ ] skill 开 / 关的 A/B eval
- [ ] 单个 skill ROI：占多少 token，换来多少分数
- [ ] skill activation 准确率 eval
- [ ] skill prompt 变体之间的对比实验

> **🧠 你不知道你不知道的：**
>
> - **skill 不是 feature 开关，是认知模式。**
> - **条件激活解决的是 context 浪费，不是 skill 质量。** skill 写得烂，再聪明地激活也没用。
> - **项目内 skill 是 codelord 的重要差异化。** 团队可以把自己模块的“隐性知识”写成 skill 交给 agent。
>
> **✅ 完成标志：** skill 系统端到端工作。至少 4 个内置 behavior skill 和 2 个技术栈 skill 经过 M3 验证带来稳定收益。项目内 skill 可被动态发现。

---

## M6 — 长期记忆（Behavioral Memory）

> M4 解决“记住项目是什么样”，M6 解决“记住怎么更好地服务这个用户、这个项目、这类任务”。
> 这是让 agent 真的“越用越好”的关键 milestone。

### Memory 分层清晰化

- [ ] **Session Memory：** 当前会话内的对话与操作历史（M1/M4 已覆盖）
- [ ] **Project Memory：** 对项目的持续理解（M4 已覆盖）
- [ ] **Behavioral Memory：** 用户偏好、常见错误模式、成功任务路径、环境习惯（M6）

### Behavioral Memory 类型

- [ ] **User Preference Memory：**
  - 例如：偏好 `pnpm`、不喜欢大改、喜欢先解释再改
- [ ] **Error Pattern Memory：**
  - 例如：某项目里的 ESLint 很严格；某测试命令很慢；某目录下经常有生成文件
- [ ] **Task Pattern Memory：**
  - 例如：修这一类 bug 最有效的路径通常是“先看 test → 再看 source → 再跑 test”
- [ ] **Environment Memory：**
  - 例如：某 provider 配额紧张；某 machine 上某命令有已知坑

### Memory 写入策略

- [ ] 定义“什么值得记住”：必须跨任务可复用、且有较高置信度
- [ ] 区分自动写入 vs 需用户确认写入
- [ ] 记忆要有来源和时间戳，支持过期与修正
- [ ] 防止 memory 污染：错误结论不能永久污染后续行为

### Memory 检索与注入

- [ ] 根据当前任务类型检索相关行为记忆
- [ ] 只把相关摘要注入 context，不全量塞入
- [ ] trace 中记录使用了哪些 memory 片段
- [ ] eval 中比较“有无 memory”的性能差异

### Memory Hygiene / Compaction / Decay

> 长期记忆如果没有维护机制，几个月后一定会变成垃圾堆。

- [ ] 周期性 memory compaction：合并重复记忆，提炼公共模式
- [ ] 低置信、长期未命中的记忆自动降权或归档
- [ ] 冲突记忆检测：同一主题出现相反结论时要求重新确认
- [ ] 记忆保留来源、置信度、最后命中时间，作为 compaction / decay 的依据
- [ ] 为 memory hygiene 建立最小观测指标：总量、命中率、误命中率、衰减率

### Memory 管理体验

- [ ] `codelord memory list/search/show`
- [ ] 用户可手动纠正或删除错误记忆
- [ ] agent 可在高价值时机主动提议“这条偏好要不要记住？”

> **🧠 你不知道你不知道的：**
>
> - **memory 的难点不是存，而是写。** 写入错误记忆的代价比“没记住”更高。
> - **长期记忆默认会腐烂。** 没有 compaction / decay / conflict resolution，几个月后它一定会变成高置信垃圾堆。
> - **behavioral memory 不能替代 skill。** memory 是经验，skill 是方法论。
> - **memory 也必须进 eval。** 否则你根本不知道它是在帮忙还是在制造偏见。
>
> **✅ 完成标志：** agent 能跨任务记住用户偏好和高价值经验，并且这些记忆能通过 M3 证明对完成率或成本有正向影响；memory hygiene / compaction / decay 可以稳定运行。

---

## M7 — 生态扩展（MCP + Model Routing + Thinking Budget）

> 先把 core、context、skill、memory 这套内功练好，再去接外部生态。
> M7 解决的是“让 agent 拥有更丰富的资源”，但不动摇 core 哲学。

### MCP Client

- [ ] 学习 MCP 协议：transport / capability negotiation / tool schema / resource / prompt
- [ ] 支持 stdio transport
- [ ] MCP server 配置管理
- [ ] 工具动态注册与断连恢复
- [ ] deferred tool loading：避免工具过多淹没 LLM
- [ ] Skill 可声明依赖特定 MCP 工具
- [ ] 明确优先级：**内置 tool 是核心路径默认首选，MCP tool 是扩展路径，不与内置 tool 抢默认路由**
- [ ] 定义 MCP fallback 场景：只有当内置 tool 无法高质量完成时，才提升 MCP 工具优先级

### Model Routing

- [ ] REPL 中运行时切换模型：`/model ...`
- [ ] config 中配置默认模型和候选模型池
- [ ] fallback 策略：主模型失败时自动降级
- [ ] 基于任务类型的模型选择策略
- [ ] 用 M3 比较不同 model routing 的效果与成本

### Thinking Budget

> 现代模型的 extended thinking 改变了 agent 的设计空间。

- [ ] 抽象 thinking budget 配置：关闭 / 轻量 / 深度
- [ ] 不同步骤使用不同预算：探索阶段高，执行阶段低
- [ ] 记录 reasoning cost 与收益
- [ ] 比较“更多 thinking”带来的收益是否值得成本

> **🧠 你不知道你不知道的：**
>
> - **工具越多，不一定越强。** LLM 的选择准确率会下降。
> - **内置 tool 和 MCP tool 不该平权竞争。** 内置 tool 负责核心稳定路径，MCP tool 负责扩展能力；如果让它们一起抢默认调用权，系统会变脆。
> - **model routing 和 tool routing 本质相似：** 都是在给 agent 分配有限资源。
> - **thinking budget 不是越大越好。** 有些步骤多想只会更贵，不会更准。
>
> **✅ 完成标志：** agent 可稳定接入 MCP 工具。不同模型和不同 thinking budget 能作为实验变量被评估，而不是拍脑袋切换。

---

## M8 — 安全加固

> M1 解决“不要裸奔”，M8 解决“足够接近生产级”。
> 这是 codelord 从可用到可信的重要一步。

### 命令与工具风险分级

- [ ] 细化 `safe / write / dangerous` 规则
- [ ] 加入更强的意图识别（静态规则 + 可选 LLM 辅助）
- [ ] 人类审批流：真正危险的操作必须确认

### Loop / Stuck 检测

- [ ] 检测重复 tool call / 重复错误模式
- [ ] 检测长时间无进展
- [ ] 注入“换思路”提示或升级为 ask_user / human intervention

### Prompt Injection / Output Sanitization

- [ ] tool result 中的潜在 prompt injection 检测
- [ ] 敏感信息过滤
- [ ] agent 读取外部内容时的防御层
- [ ] 最终输出的基本校验

### 可信执行

- [ ] approval UX 设计
- [ ] 风险事件写入 trace
- [ ] 把安全机制接入 eval：既要安全，也不能把正常任务都卡死

> **🧠 你不知道你不知道的：**
>
> - **最危险的不是恶意用户，而是高置信地做错事。**
> - **安全机制也要做产品设计。** 太烦人，用户会关掉；太宽松，又没有意义。
> - **prompt injection 是 agent 特有的问题。** 传统 CLI 工具没有这个攻击面。
>
> **✅ 完成标志：** 高危行为可拦截、loop 能检测、prompt injection 有基础防御，且不会明显破坏正常使用流畅度。

---

## M9 — 多体协作（Multi-Agent）

> 最后才上 multi-agent。
> 因为没有 M2/M3/M4/M5/M6 的底座，多 agent 只会把复杂度翻倍。

### 进入条件（Hard Gate）

- [ ] single-agent 在 `core` eval 套件上达到稳定基线，且 regression 可控
- [ ] 已识别出明确的“可并行、可分工、上下文耦合不高”的任务类型
- [ ] 已有足够好的 trace / eval / skill 基础，否则 multi-agent 只会更难 debug
- [ ] 只有当单 agent 的瓶颈被证明来自“分工与并行”而不是“context/skill/tool 还没做好”时，才进入 M9

### 协作模式选择

- [ ] 优先实现 supervisor → worker
- [ ] 明确 handoff 协议与终止条件
- [ ] worker 结果结构化返回：`task_id / status / summary / artifacts / usage`

### 专业分工

- [ ] 不同 worker 加载不同 skill 集
- [ ] coordinator 本身也有专属 skill（如何拆任务、何时并行、如何综合）
- [ ] 并行修改不同文件时的冲突检测

### Multi-Agent Trace / Eval

- [ ] trace 支持嵌套子任务
- [ ] eval 比较单 agent vs multi-agent 的完成率 / 成本 / 时延
- [ ] 识别 multi-agent 真正带来价值的任务类型，而不是盲目上 swarm

> **🧠 你不知道你不知道的：**
>
> - **多 agent 不是升级版单 agent，它是新的分布式系统。**
> - **coordinator 的核心是 synthesis，不是甩锅。**
> - **没有结构化 worker 输出，coordinator 会被自然语言噪音淹没。**
>
> **✅ 完成标志：** 在复杂 repo 任务上，multi-agent 在某些任务类型上相对 single-agent 呈现清晰优势，并且这种优势能被 M3 量化。

---

## 正反馈节奏

```
M0  骨架         ──→ ✅ 已完成，CLI 跑起来了
M1  执行引擎     ──→ 🎉 真正能日常用，能打断、能恢复、能回滚
M2  可观测性     ──→ 🔍 看清 agent 每一步在干嘛、花了多少钱
M3  度量能力     ──→ 📊 终于能科学做实验，而不是靠感觉优化
M4  理解力       ──→ 🧠 agent 进入陌生 repo 不再像无头苍蝇
M5  行为智能     ──→ ✨ agent 开始呈现“有方法论”的工作风格
M6  长期记忆     ──→ 🗂️ agent 开始跨任务变得更懂你、更懂项目
M7  生态扩展     ──→ 🔌 工具、模型、thinking 能按需调度
M8  安全加固     ──→ 🛡️ 从可用走向可信
M9  多体协作     ──→ 🤝 真正具备团队级分工能力
```

---

## 持续贯穿的工程实践

| 实践 | 首次建立 | 持续应用 |
|------|---------|---------|
| CLI 可用 | M0 | 每个 milestone 都要有可运行产物 |
| Roadmap Governance | V2 | 每个 milestone 结束回收 `top 3 unknown unknowns` 并允许重写路线 |
| 内置工具系统（kernel/contract/router） | M1 | 按 dogfooding 和 M3 数据调整 |
| 消息调度（interrupt/queue/ask_user） | M1 | 贯穿所有交互式体验 |
| 会话持久化 & Undo | M1 | 全程 |
| Tracing | M1/M2 | 每次改动都有 trace |
| Secret Hygiene / Redaction | M2 | trace 和 memory 落盘前先过脱敏 |
| Cost 监控 | M2 | 全程 |
| Prompt Caching | M2 | 全程，持续监控 hit rate |
| Eval（Product + Research） | M3 | 所有优化都通过 eval 验证 |
| Prompt / Skill / Context 版本管理 | M3 | 每次实验绑定版本 |
| Working Set / Context Engineering | M4 | 之后持续实验与优化 |
| Memory 管理 | M4/M6 | 持续调优写入、检索、compaction 与 decay |
| Dogfooding | M1 | 每个 milestone 完成后记录 UX 痛点 |
| Regression Check | M3 | 作为质量门禁 |

---

## 这版 Roadmap 最重要的取舍

- **把 Eval 从 tracing 里独立出来，抬升为第一等公民，并显式拆成 Product Eval / Research Eval 两条轨。**
- **把 Context Engineering 从“context 不要爆”升级为 agent 的核心智能层，并引入 working set 作为中间工程层。**
- **把 Tool 从“函数列表”升级为内置稳定原语：kernel / contract / router 分层。**
- **把 Skill 的内容质量和基础设施分开看，避免只做框架不做效果。**
- **把 Memory 拆清楚：Project Memory 属于理解力，Behavioral Memory 属于长期进化，并补上 hygiene / compaction / decay。**
- **把 message injection 提前到 M1 架构层解决，而不是后面打补丁。**
- **把 governance 写成硬规则：每个 milestone 回收 unknown unknowns，roadmap 允许被数据重写。**
- **把最小 secret hygiene 前移到 M2，而不是等安全大 milestone 才开始。**
- **坚持“这是我自己的 agent”，所以 roadmap 追求的是有哲学的一致性，而不是功能对齐别家产品。**

---

*这份 roadmap 会随着 dogfooding、eval 数据和设计认知升级而持续重写。目标不是“按计划完成”，而是“用数据和体验把真正有价值的路线收敛出来”。*
