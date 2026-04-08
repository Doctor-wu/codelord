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

**RAG 在 codelord 里不是一个独立的 chatbot feature，而是 retrieval substrate。**
它服务于代码检索、文档检索、project memory 检索、behavioral memory 检索，以及未来的外部知识检索。

**这意味着 codelord 的天花板不取决于 agent core 写得多好，而取决于 context 构造得多好、skill 写得多好。Roadmap 的重心反映这一点。**

**Tool 哲学：** 最小有效工具集。内置少量高可靠工具覆盖核心操作，MCP 作为扩展通道按需接入。
但内置 tool 不只是"让 LLM 自由调用的函数"，而是 **分层稳定原语**：
- Tool Kernel：执行、参数校验、风险标签、标准错误码、结果归一化
- Tool Contract：`when_to_use` / `when_not_to_use` / 前置条件 / 失败语义 / fallback hint
- Tool Router：优先走内置 tool 的稳定路由，必要时才交给更开放的 LLM/skill 策略层
- Skill Policy：决定工具调用顺序、组合方式、验证方式

**Eval 哲学：** Eval 不是某个 milestone 的附属品，而是贯穿全程的基础设施。每一个改动——context 策略、skill 内容、工具增减、memory 机制——都必须能被度量。没有 eval 数据支撑的改动就是在赌博。

**协作模式：** 在本对话中讨论设计与策略 → 产出高质量 Claude Code prompt → 在 Claude Code 中执行实现。

---

## Roadmap 硬原则

> 这不是装饰性的价值观，而是 roadmap 的硬门禁。

- **Eval-first**：没有 eval 假设的改动，不进 roadmap 主线
- **先研究后实现**：每个大主题先研究“领先系统在解决什么问题、哪些是共性规律、哪些只是产品选择”，再决定 codelord 自己的立场；不允许一边提需求一边假装这就是业内 best practice
- **先 dogfood 再扩张**：每个 milestone 必须产出可真实使用的东西，而不是只完成内部抽象
- **生产级正反馈**：正反馈来自把一个足够窄、但能真正产品化收口的切片做成可 dogfood 的能力，而不是为了尽快看到变化先落一个浅版本 / 粗版本 / 玩具版本
- **不接受半悬挂产品表面**：任何已经暴露给 operator 的能力，至少要有最小闭环的控制、状态和反馈；没有这三者，就视为尚未进入主路径
- **生产优先于 Demo**：trace、rollback、secret hygiene、regression gate 这类“看起来不炫”的能力优先级高于 demo 特性
- **回收 Unknown Unknowns**：每个 milestone 结束必须沉淀 `top 3 unknown unknowns`，驱动 roadmap 重写
- **路线允许重写**：里程碑服务原则，不反过来绑架设计。数据或 dogfooding 证明方向不对，就重写 → 历次重写记录见 [DecisionLog.md](./DecisionLog.md)
- **分层优先于小聪明**：优先做清晰分层和稳定接口，不迷信“一层 prompt 搞定一切”
- **以构建促学习，不凭冲动堆功能**：实现不是为了堆功能，而是为了验证我们对问题空间的理解。每个大主题的 build 都必须回答“这次学到了什么”、“哪些判断被证实/被推翻了”。

---

## 大主题推进协议（研究 → 立场 → 实现）

> 这条协议适用于 roadmap 后续每一个大主题，而不只适用于 trace。
> 包括但不限于：Tracing / Eval / Context Engineering / Retrieval / RAG / Skill System / Memory / MCP / Model Routing / Multi-Agent。

每个大主题默认按 5 步推进：

1. **全局研究冲刺**
   - 先研究领先系统在解决什么问题，而不是先抄它们长什么样
   - 区分：哪些是生产级 agent 的共性规律，哪些只是某家产品的实现选择
   - 必须覆盖整个主题，而不是只研究当前最疼的那一小块
   - 至少回答：first-class objects 是什么、live UI 与 ledger/trace 的关系是什么、operator control 放在哪一层、eval 与 replay 依赖什么颗粒度
2. **立场说明**
   - 明确 codelord 要继承什么、拒绝什么、为什么
   - 这一步的目标不是形成“功能清单”，而是形成我们自己的问题模型和设计立场
3. **实现冲刺**
   - 只实现最小闭环，用来验证立场，而不是把整个主题一次性铺完
   - 必须写清楚：范围内 / 范围外 / 完成条件 / 预期证据
4. **Dogfood + 证据复盘**
   - 用 trace、dogfooding、tests、eval 数据验证这次实现到底证实了什么
   - 如果只是解决了局部痛点，但没有增加问题理解，视为没有真正完成这一轮学习
5. **重写 / 继续**
   - 证据支持就继续扩展；证据不支持就重写立场或重新开研究冲刺

**硬门禁：**
- 没有全局研究，不开大主题实现
- 没有立场说明，不把外部产品做法当默认答案
- 没有证据，不宣布主题方向成立

---

## 任何 Coding Agent 都在解决的五个根本问题

| 问题 | 本质 | Codelord 的回答 |
|------|------|-----------------|
| **理解** — codebase 是什么？用户要什么？ | Context Engineering + Retrieval | 动态构造最有效的 context，并通过 retrieval / RAG 拉回真正相关的信息（M4） |
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
- [x] `AgentRuntime` 长生命周期执行会话：`READY / BLOCKED / STREAMING / TOOL_EXEC` + burst outcome 分离
- [x] 多轮 REPL：同一 runtime/session 上的 interrupt / waiting_user / resume
- [x] Tool Kernel v1：`bash + file_read + file_write + file_edit + search + ls + AskUserQuestion`
- [x] Tool Contracts v1：per-tool colocated contract + shared system prompt builder
- [x] Tool Router v1：保守的 obvious bash → built-in 路由
- [x] Safety Policy v1：`safe / write / dangerous / control` + 敏感路径写保护 + 高危 bash 拦截
- [x] Ink shell 已跑通，但当前 UX 与 event model 仍需大修
- [x] OAuth 凭证管理（OpenAI Codex login + refresh + persistence）

---

## 全景图

```
M0   骨架                ──→ ✅ 已完成（架构 + composition root）
M1   执行引擎            ──→ ✅ 已完成（runtime + tools + router v2 + safety + context window + checkpoint）
M1X  Agent UX / Event    ──→ ✅ 已完成（event spine + lifecycle streaming + operator console + reasoning v2）
M2   可观测性            ──→ ✅ 已完成（Trace v2 三层模型 + toolVisibility + queue lifecycle + Cost + Prompt Caching）
M3   度量能力            ──→ Eval 框架（从轻到重，贯穿全程进化）
M4   理解力              ──→ Context Engineering + Codebase Indexing + Hybrid Retrieval / RAG + Project Memory
M5   行为智能            ──→ Skill 系统（基础设施 → 内容打磨 → 条件激活）
M6   长期记忆            ──→ Behavioral Memory（用户偏好 + 错误 pattern + 任务 pattern，基于 retrieval）
M7   生态扩展            ──→ MCP + Model Routing + Thinking Budget + 外部知识源
M8   安全加固            ──→ 生产级安全体系
M9   多体协作            ──→ Multi-Agent
```

> 当前阶段焦点与优先顺序见 [Sprint.md](./Sprint.md)

## ~~M0 — 骨架~~ ✅ 已完成

> 把原型代码重构为可分发的生产级架构。

- [x] 包结构：`packages/agent-core`（纯引擎）+ `packages/config`（配置解析）+ `agents/coding-agent`（composition root）
- [x] CLI 骨架：`codelord init` / `codelord config` / 交互式入口已建立
- [x] Ink shell 与基础 renderer 桥接已跑通
- [x] Auth 泛化：API key 类 + OAuth 类，按 provider 分策略
- [x] 正式下线 `single-shot` 模式（CLI 位置参数不再执行，统一迁移到 REPL）
- [x] 正式下线 `PlainTextRenderer`（后续 headless / eval 改走 trace-native 输出）

**✅ 完成标志：** composition root、runtime、Ink shell 已经串起可用的交互式 agent 骨架。

---

## M1 — 执行引擎

> 把 agent 从 single-shot 升级为可交互、可中断、可恢复的执行引擎。
> 这是 agent 的"四肢"——能动手干活的基础。
>
> **M1 的核心设计决策：ReAct loop 的消息调度架构。**
> 现有 FSM 是线性的（IDLE → STREAMING → TOOL_EXEC → DONE），没有外部输入的入口。
> M1 必须从架构层面支持两种消息注入模式，否则后续所有交互能力都是补丁。

### ReAct Loop 升级：消息调度

> 这是 M1 最重要的架构工作。不是"加个功能"，而是把执行态从一次性函数调用里解放出来。

- [x] **Interrupt（中断当前 burst）**
  - LLM streaming 可中止，partial assistant output 会被保留
  - tool 执行不做粗暴 kill，而是在安全边界停住
  - interrupt 进入 `BLOCKED(interrupted)`，后续可恢复继续
- [x] **Queue（安全边界注入）**
  - runtime 已支持 pending inbound message queue
  - 消息会在安全注入点（LLM call 前 / tool batch 后 / blocked 恢复前）进入上下文
  - 当前缺的是"运行中并发输入"的成熟 UX，不是核心执行语义
- [x] **Agent 主动提问**
  - `AskUserQuestion` 已作为 control primitive 接入 runtime
  - `waiting_user` / `pendingQuestion` / `answerPendingQuestion()` 闭环已成立
  - 用户回答作为正常 `user message` 返回，而不是伪装成 `toolResult`

### 多轮对话 REPL

- [x] `codelord` 无参数启动进入 REPL
- [x] 会话历史在多轮间保持（同一 runtime/session 持续累积）
- [x] 优雅退出（`/exit` + 运行中 `Ctrl+C` interrupt / 空闲时退出）
- [x] `single-shot` 已退出产品主路径（CLI 位置参数仅给迁移提示）
- [x] Ink shell 已升级为以 `user / assistant / tool / question / status` 为一等公民的会话时间线
- [x] operator-console 级别的视觉与交互 polish 已完成

### 内置工具系统 v1

> 最小有效工具集，但不是"让 LLM 自己随便挑函数"。
> 当前已经形成 `Tool Kernel → Tool Contract → Tool Router → Safety Policy` 的稳定骨架。

#### Tool Kernel

- [x] **bash** — 通用命令执行（兜底原语）
- [x] **file_read** — 读取文件内容（支持行范围）
- [x] **file_write** — 创建/覆盖文件（全量写入）
- [x] **file_edit** — 精确 search-and-replace 编辑（0 次 / 多次匹配显式失败）
- [x] **search** — 代码搜索（rg/grep 风格）
- [x] **ls** — 目录列表（递归 / glob / 类型过滤）
- [x] **AskUserQuestion** — blocking control tool
- [x] 统一 `ToolExecutionResult`：`{ output, isError, errorCode? }`
- [x] 每个工具具备显式 `riskLevel` 语义：`safe / write / dangerous / control`
- [x] 首批标准错误码落地：`NO_MATCH` / `MULTI_MATCH` / `NOT_FOUND` / `PERMISSION_DENIED` / `INVALID_ARGS` / `RISK_BLOCKED`

#### Tool Contracts

- [x] 每个内置工具都具备 colocated contract：`whenToUse / whenNotToUse / preconditions / failureSemantics / fallbackHints`
- [x] `file_edit` 的 0 次匹配 / 多次匹配失败语义已明确
- [x] `search` 与 `file_read` 的职责边界已明确
- [x] `bash` 被定义为 fallback primitive，而不是默认首选
- [x] `AskUserQuestion` 的使用边界已明确：只在真实歧义或继续执行有风险时触发

#### Tool Router v1

> 当前 Router v1 不是"按任务语义自动选工具"，而是"在执行层保守修正 obvious bash 误用"。

- [x] obvious `bash → built-in` 路由：`cat` / `head -n` / `ls -R` / 简单 `rg` / 简单 `grep -rn`
- [x] route decision 有结构化 metadata：`ruleId / reason / original / resolved`
- [x] `AskUserQuestion` 不走普通 router
- [x] 路由后正式历史会改写为"真实执行工具"，避免 history 说谎
- [x] Router v2：Rule E/F + contract-based 规则生成
- ~~route quality 指标~~ → 移交 M3
- [x] contracts 与 router 联动

### System Prompt v1（过渡版）

- [x] 共享 `buildSystemPrompt()` 已建立
- [x] per-tool contract 已稳定渲染进 prompt
- [x] 项目上下文注入（当前至少包含 `cwd`）
- [x] 当前 prompt 作为过渡版存在，后续由 skill 系统接管
- [x] 记录 system prompt 的 token 数，建立预算基线

### Context Window 管理 v1 ✅

- [x] Messages 的 token 计数（粗估，按字符数 / 4）
- [x] 达到阈值时的截断策略：保留 system prompt + 最近 N 轮对话
- [x] 记录 system prompt 占总 context 的比例

### 会话持久化

- [x] 会话快照已落盘到本地（runtime snapshot + timeline snapshot）
- [x] `messages / pendingInbound / pendingQuestion / resolvedQuestions / lastOutcome / routeRecords / safetyRecords` 已可持久化与恢复
- [x] 默认启动已改为新会话；`--new` 已移除，不再承担主语义
- [x] 非安全状态（`STREAMING / TOOL_EXEC`）恢复时会诚实降级为 `READY`，并显式提示上次执行被中断
- [x] **session product semantics 收口**：默认 `new`，恢复改为显式 `--resume <id>` / `--resume latest`
- [x] 最小 session 管理入口：`sessions` / `--resume latest` / `--resume <id>`
- [x] 恢复后的 `queue / waiting_user / in-flight interrupted` UX 已收口到 runtime-first reconciliation
- [x] 会话元数据补齐：git branch、标题、摘要
- [x] 会话管理闭环：`sessions show/prune`

### Undo / Rollback

- [x] mutating burst 的 lazy checkpoint 已建立（首次 `file_write` / `file_edit` 前建 checkpoint）
- [x] `/undo` REPL 命令：回滚最近一个可 undo 的 checkpoint
- [x] 当前 v1 的可靠回滚范围：`file_write` / `file_edit`
- [x] checkpoint stack 已进入 session snapshot，resume 后 `/undo` 仍可用
- [x] undo 后会向 session 注入明确的语义修正事实（避免 agent 继续基于旧文件状态推理）
- [x] git-aware checkpoint
- [x] Checkpoint 信息与 undo 事件接入 trace

### 基础安全网

- [x] 声明式工具风险标签：`safe / write / dangerous / control`
- [x] `dangerous` 操作拦截，`safe` 静默放行，`write` 放行但记录
- [x] 敏感路径写保护（`~/.ssh`、`/etc`、`/System` 等）
- [x] Git 高危操作保护（`reset --hard` / `push --force` / `branch -D` / `clean -fd[x]` 等）
- [x] `max_steps` 硬上限

### 工具成功率轻量追踪 ✅

- [x] 每个工具的 attempts / successes / failures counter
- [x] 重点关注 file_edit 的匹配成功率
- [x] 记录 tool router 的命中规则与后续结果

### 轻量 Tracing（从 M2 前置）—— 已被 Trace v2 超越

- [x] 最小 Trace 数据模型：`{ runId, timestamp, steps: [{ type, ... }] }`（已升级为 TraceRunV2 三层模型）
- [x] 每个 LLM call 记录：model / stop reason / latency
- [x] 每个 tool call 记录：tool name / args（截断）/ exit code / duration / is_error
- [x] Trace 写入 `~/.codelord/traces/`，dogfooding 时 `cat` / `jq` 看（已升级为 `codelord trace list/show/check`）

> **🧠 你不知道你不知道的：**
>
> - **消息注入是 ReAct loop 的架构问题，不是 UI 功能。** 如果一开始不把 interrupt / queue / ask_user 设计进 FSM，后面每加一种交互都会变成 hack。
> - **tool 不能被可靠地"半截停掉"。** LLM streaming 可以 cancel，外部进程很难安全 cancel。所以 interrupt 的语义应该是"尽快中断"，不是"立刻杀掉一切"。
> - **file_edit 的边界处理直接决定可用性。** old_string 0 次匹配、匹配多次、跨行匹配失败，都是高频真实场景。
> - **AskUserQuestion 最怕被做成"模型一不确定就甩锅给用户"。** 它应该是高价值、低频、结构化的 blocking primitive，而不是懒惰追问器。
> - **event model 不是 renderer 的私有细节，而是产品语义本身。** 如果事件继续扁平，TUI、trace、tool UX 和恢复语义都会由外层靠猜顺序硬拼。
> - **当 runtime 进入 long-lived session 之后，single-shot 和 plain-text 很容易从"兼容层"变成"架构拖累"。** 它们会反向限制状态建模和产品 UX。
> - **会话持久化和 undo 是心理安全网。** 没有它们，你会不自觉地只给 agent 小任务，不敢真的 dogfood。
> - **system prompt token 占比是隐藏约束。** 现在先记基线，后面 skill / memory / context assembler 一上来就会膨胀。
>
> **✅ 当前状态：** M1 的 runtime / tools / contracts / router / safety 骨架已立，REPL 已跑通，会话快照也已经落地；轻量 tracing 已被 M2 的 Trace v2 三层模型完整超越；M1 全部缺口已关闭。

---

## M1X — Agent UX / Event Spine（旁路线）

> 这是从 M1 拉出的旁路线，但优先级不低。
> 目标不是"美化 Ink"，而是把 runtime 的控制权、状态和信任关系真正可视化。
> **如果 event model 继续扁平、Ink 继续只是 step viewer，后面的 trace、UX、tool 体验都会互相拖累。**

### 产品路线改写

- [x] `single-shot` 正式 sunset：不再作为产品主路径驱动设计
- [x] `PlainTextRenderer` 正式 sunset：headless / eval / trace 改走结构化输出，而不是 plain text UI
- [x] `REPL + Ink shell` 成为唯一产品主路径

### Event Spine 重构

- [x] 从 flat `AgentEvent` 升级为分层 event spine：raw stream + lifecycle + projection
- [x] `tool_call` 形成稳定生命周期对象，而不是靠 `toolcall_* / tool_exec_* / tool_result` 在外侧猜顺序
- [x] 为每次 tool call 提供稳定 identity，贯穿生成 → 路由 → safety → 执行 → 输出 → 结果
- [x] 支持 route / safety / interrupt / waiting_user 进入同一条事件时间线
- [x] `AssistantReasoningState` 已进入 core，成为 thought 的最小结构化承载面
- [x] `AssistantReasoningState` 升级为 live operator signal
- [x] raw toolcall events 通过 lifecycle 进入 projection
- [x] provisional tool draft 稳定 identity
- [x] 从 raw thought 提取 intent/why/risk
- [x] tool reason 高质量投影
- ~~reasoning quality eval~~ → 移交 M3
- [x] reasoning 可见性策略

### Streaming UX 能力定义

> 当前阶段的推进状态见 [Sprint.md](./Sprint.md)。这部分的未收口项直接留在 M1X 主线里，不再单独拆到 closure ledger。

- [x] 显式开启支持型 provider/model 的 reasoning summary 路径，验证 `thinking_*` 能稳定进入 event spine
- [x] 当 provider 没有 `thinking_*` 时，reasoning lane 仍显示 derived live proxy：`thinking / deciding / acting / blocked` + 下一动作意图
- [x] tool card 在 `tool_call_created` 之前即可出现 provisional build 状态，显式展示 tool name / partial args / build progress
- [x] 大参数工具（尤其 `file_write`）支持 partial args progressive preview，而不是长时间空窗后突然落地
- [x] 对高频 `toolcall_delta` 做节流 / 合并 / progressive disclosure，避免 50Hz+ 级别重绘把 Ink 刷坏
- [x] `work group / batch` 语义不再吞掉 progressive reveal：批次可以保留，但首个 tool 必须尽早出现
- [x] reasoning lane 从"稳定单行摘要"升级为"live rolling viewport"：默认显示最新 5 行 thought，没有 5 行就自然高度，有新 thought 时持续向下滚动
- [x] 避免 thought 的"假冻结"：只要 provider 还在持续发 `thinking_delta`，UI 就必须继续可见更新，不能因为 snapshot/summary 策略把 live stream 吃掉
- [x] 区分 `provider thought viewport` 与 `derived live proxy`：前者是原始思考流的可滚动窗口，后者只在无 `thinking_*` 时兜底
- [x] provider thought 在 turn settled 后仍保持语义连续：不要从 live viewport 退化回早期 snapshot / 单行摘要
- [x] tool card 的 `displayReason` 必须是单行、已净化的 operator hint，不能把多行 raw thought 直接塞进工具行导致布局串位
- [x] tool/batch reason 只在存在 **明确的 tool-scoped rationale** 时显示；禁止把 generic assistant thought / step-level reasoning 回退投影到工具区域
- [x] 为"有 reasoning stream 但 UI 看起来冻结"的场景建立固定 trace fixture，防止回归
- [x] 为"无 thought + 高密 toolcall_delta"建立固定 trace fixture，防止回归

### Reasoning v2 ✅

- [x] 从 pi-ai Model 读取 capabilities
- [x] settled reasoning 呈现策略
- [x] tool-scoped rationale 边界
- ~~reasoning eval 套件~~ → 移交 M3
- ~~reasoning diagnostics 接入 trace compare~~ → 移交 M3

### Ink Shell 重构

- [x] 从 `step-first viewer` 改为 `conversation timeline`
- [x] 用户输入、assistant 回复、tool 调用、question 卡片、risk/status 卡片进入同一时间线
- [x] 底部固定 composer / status 区，显式展示当前是 `Idle / Running / Waiting for you / Interrupted / Blocked by safety`
- [x] correctness 已收口：Ink 成为唯一 stdout owner，final result / question / interrupted 不再重复
- [x] 保证主时间线顺序稳定与 key 稳定，消除一批明显 UI 乱序问题
- [x] progressive disclosure、tool card streaming 体验和 composer polish
- [x] reasoning lane 在没有 provider thought 时仍保持活着，而不是只在 raw thought 存在时才有信息密度
- [x] tool batch / tool card 视觉层级已打磨

### 操作台最小产品闭环 ✅

- [x] reasoning 支持 operator 可设置的等级
- [x] operator command 成为一等交互面
- [x] composer 对 commands 提供最小联想
- [x] command 可用性与当前状态的关系清楚

### UX 验收标准

- [x] 用户能一眼分辨"信息展示"与"现在需要我行动"
- [x] 用户能看懂 agent 当前在做什么、为什么停住、是否能安全继续
- [x] `waiting_user` 已升格为主界面主状态
- [x] 中断、恢复、失败、安全阻断都已进入"可继续的状态"而不是死路
- [x] 用户在无 `thinking_*` 时仍能感知 agent 阶段
- [x] 用户在有 `thinking_*` 的 provider 上，能看到持续滚动的 thought viewport，而不是只看到一个早早固定住的摘要
- [x] reasoning viewport 默认展示最新 5 行；少于 5 行时自然收缩；新增行时自动跟随到底部
- [x] thought 在 turn settled 后不退化成单行摘要，至少保持与 streaming 末态一致的可读性
- [x] tool card 的原因提示不发生多行串位，不把 thought 文本挤进工具输出/工具主体布局
- [x] tool/batch 区域不再复用 generic assistant thought；没有明确 tool-scoped rationale 时宁可不显示 reason
- [x] 大参数工具的 build 过程能被看见
- [x] built-in tool 即使没有 stdout，也要有可感知的流式 phase feedback
- [x] TUI 本身成为强正反馈的 operator console

> **🧠 这条旁路线的 unknown unknown：**
>
> - **UI 不是皮肤，是控制语义的承载层。** runtime 里已经存在的能力，如果用户不能感知和控制，产品上等于没有。
> - **step 是内部执行单元，不该天然成为第一视图。** 真正的用户心智通常是时间线，而不是 step 列表。
> - **tool 调用如果没有稳定 identity 和 reason，用户就很难建立信任。** "它为什么读这个文件、为什么跑这个命令"需要被看见。
> - **一旦 REPL 成为主路径，输入本身就必须是一等公民。** 没有 user lane / composer / blocked state 的 TUI，本质还是日志面板。
>
> **✅ 完成标志：** Ink shell 从 step viewer 升级为 conversation timeline。event spine 提供稳定 lifecycle 语义。用户输入、question、tool、risk、status 在同一时间线上可见且顺序稳定。single-shot 和 plain text 退出产品主路径。

---

## M2 — 可观测性

> 先让 agent 对自己"透明"。
> M2 回答的问题不只是"agent 到底做了什么、花了多少钱、哪里出错了"，还包括：
> **用户和 operator 做了什么，这些动作是如何改变运行轨迹的。**
> 没有这一层，后面的 eval、context 优化、skill 打磨都会变成盲飞。

### 结构化 Trace v2（已完成）

- [x] 从 M1 的 flat JSON 升级为结构化 trace ledger：`Run → Step → (provider stream / agent event / lifecycle)`
- [x] run-level lifecycle ledger 已建立，用来承载 step 外控制面事件
- [x] 每个 LLM call 已记录：model / input tokens / output tokens / latency / stop reason
- [x] 每个 tool call 已记录：tool name / args preview / result preview / stdout/stderr preview / duration / is_error
- [x] interrupt / queue / ask_user 的关键时序已经进入 trace 基线
- [x] 当前 system prompt 版本已记录（hash）
- [x] Trace 写入 `~/.codelord/traces/`，并支持 workspace-aware 分区
- [x] `codelord trace list / show` 已可用（`trace check` 已下线）
- [x] user input / operator action 成为一等 trace 事实
- [x] queue message lifecycle 完整建模

### 成本追踪

- [x] 按 provider / model 的价格规则统计 input / output / cached tokens 成本
- [x] 每次 run 的 cost breakdown 已有基线

### Trace Hygiene / Secret Redaction（最小版，前移）

> 安全不等到 M8 才开始。只要从 M2 开始落盘 trace，就必须做最小脱敏。

- [x] 对 trace 中的工具输出做基础 secret redaction（API key、token、cookie、private key pattern）
- [ ] 对 memory 候选写入内容复用同一套 redaction 管线
- [x] 区分"原始输出只在进程内短暂存在"和"允许落盘的脱敏输出"的 trace 基线已建立
- [x] 为 redaction 命中写 trace metadata，方便后续调试误杀/漏杀
- [ ] 把 redaction 误伤率纳入后续 M8 的 safety eval

### Prompt Caching

- [x] provider 的 prompt caching 已经通过 `pi-ai` 抽象接入
- [x] system prompt / 常驻 session context 已有 cacheable 路径
- [x] trace 中已记录 cached token 数（通过 usage/cache read-write 基线）
- [x] cost tracking 已区分 cached vs uncached input token 基线
- [ ] skill fragments 的 cacheability 随 M5 进入主线后继续完善

### Trace 全局研究与立场 ✅

> 完整立场说明见 [docs/planning/research/trace-position.md](../research/trace-position.md)

- [x] 对 trace 做整题研究，而不是只研究 `visible_tool_latency`、`operator action`、`queue lifecycle` 这类局部诊断项
- [x] 研究领先系统里实时操作台、持久化 trace 账本、回放、评测、审计之间的关系
- [x] 明确 codelord 的 trace 北极星、first-class facts、消费面优先级，以及哪些消费面当前明确不做
- [x] 输出 trace 立场说明，再决定后续实现顺序

**核心研究结论：**

**北极星：** Trace 的存在是为了让 operator 能在 5 秒内定位"问题出在哪一层"。

**三层模型：** Trace 必须分层记录，而不是把所有事件打平到一个列表里。
- **Layer 0 — Provider 层：** 记录 provider 返回了什么原始事件（当前最大的诊断盲区）
- **Layer 1 — Agent Core 层：** 记录 runtime 如何处理 provider 输出、如何调度执行（codelord 独有，行业空白）
- **Layer 2 — User 层：** 记录 operator 做了什么、这些动作如何改变了执行轨迹

**跨层串联：** 同一个 tool call 在不同层的记录之间必须有稳定 identity。跨层对比是 trace 的核心诊断模式。

**Trace / Hooks / UI 的关系：** 三者是 event spine 的平级消费者，不存在谁建在谁之上的关系。Trace 消费全量事件写入持久化账本；Hooks 只暴露外部需要的切面；Ink UI 消费实时投影。

**明确不做项：** OTEL 导出（当前）、Replay 实现（当前）、streaming 中间态持久化、trace check 当前形态、跨 session 聚合分析。

**基于立场的实现顺序：**
1. ✅ 补齐 Provider 层记录（当前最大的诊断盲区）
2. ✅ 为 tool call 建立跨层稳定 identity
3. ✅ User action 进入一等事实
4. ✅ 定义持久化账本的 schema v2（基于三层模型）
5. ✅ 重构 trace CLI（支持分层查看和跨层对比）

### TUI / Trace 可视化

- [x] 状态栏展示：当前 step / token usage / estimated cost / active model 的基线已建立
- [x] tool 执行耗时实时展示
- [x] `codelord trace list`：列历史 trace
- [x] `codelord trace show <id>`：查看单次 trace 详情
- ~~[x] `codelord trace check <id>`：对 trace 做基础审计~~ → 已决定下线，待清除代码
- [x] `trace show` 已补出首批 streaming UX 诊断事实：`thinking_absent` / `partial_to_lifecycle_gap_large` / `toolcall_delta_density_high`
- [x] 已用 synthetic fixtures 建立 streaming UX regression gate：覆盖"有 reasoning 但可能冻结"和"无 thought + 高密 toolcall_delta"两类 signature
- [x] 提供 trace-native headless 输出
- ~~`trace check` 暂停当前形态~~ → 已决定永久下线，代码待清除
- [x] 补齐 Provider 层记录：让 trace 能看到 provider 吐出了什么原始事件（trace 立场实现顺序 #1）
- [x] 为 tool call 建立跨层稳定 identity：从 provider 意图到 execution 结果用同一个 id 串联（trace 立场实现顺序 #2）
- [x] user input / operator action 成为一等 trace 事实：trace 不只解释模型行为，也能解释产品行为（trace 立场实现顺序 #3）
- [x] 定义持久化账本的 schema v2：基于三层模型重新设计 trace 的存储结构（trace 立场实现顺序 #4）
- [x] 重构 trace CLI：`trace show` 支持分层查看和跨层对比（trace 立场实现顺序 #5）
- [x] `visible_tool_latency` 成为一等诊断事实
- [x] queue message lifecycle 完整建模

> 当前阶段 trace 相关的推进焦点见 [Sprint.md](./Sprint.md)。当前仍未产品化收口的 trace 缺口，直接写在 M2 主线里。

> **🧠 你不知道你不知道的：**
>
> - **可观测性是 agent 世界里的 debugger。** reasoning 是自然语言，你没法打断点，只能靠 trace 回放。
> - **不记录 interrupt / queue / ask_user，后面就没法分析交互式 UX。** 这是 codelord 和单次 agent 的重要区别。
> - **prompt caching 不是优化项，是经济可行性的前提。** 多轮 REPL 没有 caching，input cost 会非常难看。
> - **只要 trace 开始落盘，最小 secret hygiene 就必须同步上线。** 否则你会在 M8 之前先把脏数据写进 trace 和 memory，后面再补安全已经来不及。
> - **如果 user input / operator action / control-plane decision 不是一等 trace 事实，后面很多产品级 bug 根本没法 debug。** 那样你只能解释模型内部发生了什么，解释不了真实产品行为为什么变成这样。
>
> **✅ 完成标志：** 每次 run 自动产出结构化 trace。`trace list/show` 可用。状态栏能看到 token 和 cost。prompt caching 命中率可观测。trace 与 memory 候选写入都具备最小 redaction。trace v2 三层模型（provider / agent core / lifecycle）已完整落地，trace CLI 已支持 summary / detail / raw 三层展示。

---

## M3 — 度量能力（Eval）

> Eval 是单独的大 milestone，而且要非常认真做。
> 它不是"跑几个 case 看看"，而是 codelord 的实验平台。
> 后续每一个变化——context 策略、skill prompt、memory 写入、model routing——都通过 M3 验证，不靠感觉。

### M3a — Eval 基础设施

- [ ] 定义 eval case 格式：`{ id, description, setup, input, expected, tools, maxSteps, judge }`
- [ ] 实现 eval runner：headless 运行 agent，复用 trace-native / event-native 输出管线（不再依赖 `PlainTextRenderer`）
- [ ] 每次 eval run 产出：结果、trace、prompt version、model version、active config
- [ ] 支持 fixture 项目初始化 / 清理 / 隔离运行
- [ ] `codelord eval run` 基础可用

### M3b — Product Eval（产品门禁）

> 回答"这个版本对真实用户是不是更好用了"。

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
- [ ] 记录用户体验导向指标：pass@1 / avg_steps / avg_cost / AskUserQuestion precision / interruption recovery / reasoning-visible rate / first-tool-visible latency / provisional→stable handoff correctness
- [ ] 建立 `smoke` / `core` 两层产品套件，作为日常开发和回归门禁

### M3c — Research Eval（研究实验）

> 回答"某个机制在理论上是否真的提升了 agent 能力"。

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
- [ ] 区分"内部 golden set"与"行业 benchmark"两类信号：前者优化产品方向，后者提供绝对坐标

### M3e — 实验平台化

- [ ] 每个 experiment 绑定：prompt version / skill set / context strategy / model / memory policy / retrieval policy
- [ ] 支持 A/B test：同一 case 在两套配置上对比
- [ ] 把 M3 设计成后续所有 milestone 的共用实验底座

### M3 — 从当前冲刺移交的任务

> 以下任务从 M1/M1X 冲刺中移交，因为它们本质上是 eval 工作，没有 eval 框架做不了。

- [ ] reasoning quality eval 与 trace 可观测性（原 M1X B1）
- [ ] 为 reasoning 建立 eval 与 regression 套件（原 M1X B2）
- [ ] 把 reasoning diagnostics 接入 trace compare / eval compare（原 M1X B2）
- [ ] route quality 指标、trace 对齐、可解释 fallback（原 M1 A5）

### M3f — Retrieval / RAG Eval

> RAG 不是"检索看起来很高级"就算成功。它必须被单独度量。

- [ ] 定义 retrieval 指标：precision@k / recall@k / mrr / reranker win rate
- [ ] 定义 grounding 指标：最终回答或决策引用的内容是否真的来自被检索源，是否可追溯
- [ ] 定义 usefulness 指标：检回来的 chunk 到底有没有帮到任务完成，而不是只是占 context
- [ ] 对比 lexical / vector / hybrid retrieval 的效果差异
- [ ] 单独评估 memory retrieval：命中率、误召回率、false recall 对任务的伤害
- [ ] 把 retrieval 策略作为一等实验变量，而不是藏在 context assembler 里不可见

> **🧠 你不知道你不知道的：**
>
> - **没有 eval，所有"优化"都只是意见。**
> - **Product Eval 和 Research Eval 是两条轨。** 前者决定能不能发布，后者决定值不值得继续研究。混在一起会把门禁和探索都做坏。
> - **pass@1 和 pass@5 回答的是不同问题。** pass@1 是用户体验，pass@5 是能力上限。
> - **ask_user 也需要被 eval。** 问太多打断体验，问太少就会瞎猜。它本身是一个可优化对象。
> - **RAG 最大的幻觉不是答错，而是"检得很像对"。** 没有 grounding 和 usefulness 指标，retrieval 很容易看起来聪明，实际上在喂噪音。
> - **行业 benchmark 不是产品真相。** 它给你绝对坐标，但不代表你的用户最在意什么。内部 golden set 同样重要。
>
> **✅ 完成标志：** `eval run/compare` 可用。拥有一套稳定的 golden dataset。可以用数据比较不同 prompt / skill / context / memory 策略的优劣。

---

## M4 — 理解力（Context Engineering + Codebase Indexing + Hybrid Retrieval / RAG + Project Memory）

> 这是 codelord 的第一核心 milestone。
> 不是"怎么不把 context 撑爆"，而是"怎么构造最有价值的 context"。
>
> **Context Engineering 才是 agent 的真正智力杠杆。**
> 而 RAG 在这里不是一个独立问答功能，而是 retrieval spine：为代码、文档、project memory，未来也为 behavioral memory 和外部知识提供统一检索底座。

### Codebase Indexing

- [ ] 首次进入项目时建立基础索引：目录结构、关键入口文件、依赖文件、测试文件、配置文件
- [ ] 识别语言 / 框架 / 包管理器 / monorepo 形态
- [ ] 提取项目约定：测试命令、lint 命令、build 命令、常见路径模式
- [ ] 支持增量更新（文件变化后局部刷新，不全量重扫）
- [ ] 索引结果存储到 `~/.codelord/indexes/` 或项目内 cache

### Hybrid Retrieval / RAG Layer

> codelord 的 RAG 不是 FAQ chatbot 的外挂，而是统一 retrieval 层。
> 优先服务 repo 代码、repo 文档、project memory，随后再扩展到 behavioral memory 与外部知识。

- [ ] 明确 retrieval pipeline：query construction → candidate generation → rerank → grounding → injection
- [ ] 采用 hybrid retrieval，而不是只押注向量检索：
  - symbol / path / exact match
  - lexical search
  - vector retrieval
  - metadata filter
  - reranker
- [ ] 针对不同 source 设计 chunking：
  - code：按 symbol / function / class / file section
  - docs：按 heading / paragraph
  - memory：按 atomic memory card
  - external knowledge：按 source block / section
- [ ] 每个 retrieved chunk 必须带 provenance：来源、路径/URL、位置、分数、命中原因
- [ ] 检索策略遵循 internal-first：先 repo code/docs/project memory，再按需引入外部知识
- [ ] 为未来 behavioral memory 复用同一套 retrieval substrate，而不是再造一套 memory 检索系统

### Task-Aware Context Assembler

- [ ] 根据任务类型构造 context：
  - bug fix：错误信息 + 相关源文件 + 测试
  - feature：架构概览 + 相邻模块 + API 契约
  - code question：目录图 + 关键文件摘要
  - refactor：调用链 + 测试覆盖面 + 风险点
- [ ] 定义 context budget 分配：system prompt / project summary / retrieved artifacts / recent history / user overrides
- [ ] 动态注入相关信息，而不是把所有东西都塞进 context
- [ ] 允许用户显式 pin 某些信息进 context（如"永远记住这个约束"）
- [ ] assembler 显式消费 retrieval layer 的结果，而不是把 retrieval 隐藏在黑箱里

### Working Set Builder

> working set = 当前任务真正持续需要盯住的文件、摘要、约束、错误信息集合。
> 它比"临时 retrieval 结果"更稳定，也比"整个 context"更工程化。

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
> 和 M6 的 behavioral memory 不同，这里记的是"项目是什么样"。

- [ ] 为每个项目维护持久化记忆：架构摘要、关键模块、编码约定、常见命令、已知坑点
- [ ] 项目记忆来自两部分：
  - 索引自动提取的结构化事实
  - agent 在任务中总结出的高价值结论
- [ ] 项目记忆以可检索单元存储，而不是只保留一大段总结文本
- [ ] 定义写入策略：只有高置信、跨任务可复用的信息才写入 project memory
- [ ] project memory 检索复用 M4 的 retrieval / RAG layer，而不是单独做一套 ad-hoc 查找
- [ ] 在新 session 进入项目时自动加载 project memory 的摘要版

### Context Quality Eval 接入 M3

- [ ] 把 context strategy 当成 eval 变量：比较不同 assembler 策略的分数差异
- [ ] 记录每次 run 的 context composition，支持事后分析"这次为什么选错"
- [ ] 用 M3 数据驱动 context assembler 的迭代

> **🧠 你不知道你不知道的：**
>
> - **context engineering 和 context window 管理不是一回事。** 后者是防爆，前者是提智。
> - **陌生 repo 的第一步不是搜索，而是建立地图。** 没地图的搜索会让 agent 在局部细节里迷路。
> - **RAG 在 code agent 里最好做成 hybrid retrieval，不要迷信纯向量检索。** 路径、symbol、关键词、metadata、reranker 往往一起上，才稳定。
> - **working set 是 coding agent 很关键的一层。** 没有它，agent 每一轮都像失忆后重新找线索；有了它，agent 才像真的在"盯住当前问题"工作。
> - **project memory 不能什么都记。** 记得太多就是噪音，记得太少就没有价值。写入策略比存储本身更重要。
> - **context 质量可以被 eval。** 这正是 codelord 的差异化：把"怎么喂 context"做成实验对象。
>
> **✅ 完成标志：** agent 进入一个新 repo 后，能快速建立项目地图。针对不同任务类型自动装配 context，并维持可观测的 working set。retrieval / RAG 能稳定服务代码、文档和 project memory 检索。跨 session 保留项目理解，不必每次从零开始。

---

## M5 — 行为智能（Skill System）

> 这是 codelord 的第二核心 milestone。
> core 解决"能不能运行"，skill 解决"能不能优雅地完成任务"。
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
- [ ] 抽象"好 skill prompt"的写作模式：结构、语气、约束方式、示例密度

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
> - **项目内 skill 是 codelord 的重要差异化。** 团队可以把自己模块的"隐性知识"写成 skill 交给 agent。
>
> **✅ 完成标志：** skill 系统端到端工作。至少 4 个内置 behavior skill 和 2 个技术栈 skill 经过 M3 验证带来稳定收益。项目内 skill 可被动态发现。

---

## M6 — 长期记忆（Behavioral Memory，基于 Retrieval / RAG）

> M4 解决"记住项目是什么样"，M6 解决"记住怎么更好地服务这个用户、这个项目、这类任务"。
> 这是让 agent 真的"越用越好"的关键 milestone。
>
> **M6 不再单独发明一套 memory 检索逻辑，而是直接站在 M4 的 retrieval / RAG substrate 之上。**

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
  - 例如：修这一类 bug 最有效的路径通常是"先看 test → 再看 source → 再跑 test"
- [ ] **Environment Memory：**
  - 例如：某 provider 配额紧张；某 machine 上某命令有已知坑

### Memory 写入策略

- [ ] 定义"什么值得记住"：必须跨任务可复用、且有较高置信度
- [ ] 区分自动写入 vs 需用户确认写入
- [ ] 记忆要有来源和时间戳，支持过期与修正
- [ ] behavioral memory 以 atomic memory cards 形式存储，而不是堆一大段自由文本总结
- [ ] 为 memory card 增加 metadata：scope（user/project/task）、tags、source、confidence、last_hit_at
- [ ] 防止 memory 污染：错误结论不能永久污染后续行为

### Memory 检索与注入

- [ ] 根据当前任务类型检索相关行为记忆
- [ ] memory retrieval 复用 M4 的 hybrid retrieval / RAG layer，并叠加 metadata filter
- [ ] 只把相关摘要注入 context，不全量塞入
- [ ] trace 中记录使用了哪些 memory 片段
- [ ] eval 中比较"有无 memory"的性能差异
- [ ] 单独跟踪 false recall：错误或不相关记忆被注入后，对任务造成了什么伤害

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
- [ ] agent 可在高价值时机主动提议"这条偏好要不要记住？"

> **🧠 你不知道你不知道的：**
>
> - **memory 的难点不是存，而是写。** 写入错误记忆的代价比"没记住"更高。
> - **长期记忆默认会腐烂。** 没有 compaction / decay / conflict resolution，几个月后它一定会变成高置信垃圾堆。
> - **把 memory 接进 RAG 不等于 memory 自动变聪明。** retrieval 只解决"怎么找回来"，不解决"当初该不该写进去"。
> - **behavioral memory 不能替代 skill。** memory 是经验，skill 是方法论。
> - **memory 也必须进 eval。** 否则你根本不知道它是在帮忙还是在制造偏见。
>
> **✅ 完成标志：** agent 能跨任务记住用户偏好和高价值经验，并且这些记忆能通过 M3 证明对完成率或成本有正向影响；behavioral memory 通过 retrieval / RAG 稳定被检回；memory hygiene / compaction / decay 可以稳定运行。

---

## M7 — 生态扩展（MCP + Model Routing + Thinking Budget）

> 先把 core、context、skill、memory 这套内功练好，再去接外部生态。
> M7 解决的是"让 agent 拥有更丰富的资源"，但不动摇 core 哲学。

### MCP Client

- [ ] 学习 MCP 协议：transport / capability negotiation / tool schema / resource / prompt
- [ ] 支持 stdio transport
- [ ] MCP server 配置管理
- [ ] 工具动态注册与断连恢复
- [ ] deferred tool loading：避免工具过多淹没 LLM
- [ ] Skill 可声明依赖特定 MCP 工具
- [ ] 明确优先级：**内置 tool 是核心路径默认首选，MCP tool 是扩展路径，不与内置 tool 抢默认路由**
- [ ] 定义 MCP fallback 场景：只有当内置 tool 无法高质量完成时，才提升 MCP 工具优先级
- [ ] 支持把 MCP resources / 外部文档源挂到 retrieval layer，作为后续 external knowledge RAG 的来源之一

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
- [ ] 比较"更多 thinking"带来的收益是否值得成本

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

> M1 解决"不要裸奔"，M8 解决"足够接近生产级"。
> 这是 codelord 从可用到可信的重要一步。

### 命令与工具风险分级

- [ ] 细化 `safe / write / dangerous` 规则
- [ ] 加入更强的意图识别（静态规则 + 可选 LLM 辅助）
- [ ] 人类审批流：真正危险的操作必须确认

### Loop / Stuck 检测

- [ ] 检测重复 tool call / 重复错误模式
- [ ] 检测长时间无进展
- [ ] 注入"换思路"提示或升级为 ask_user / human intervention

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
- [ ] 已识别出明确的"可并行、可分工、上下文耦合不高"的任务类型
- [ ] 已有足够好的 trace / eval / skill 基础，否则 multi-agent 只会更难 debug
- [ ] 只有当单 agent 的瓶颈被证明来自"分工与并行"而不是"context/skill/tool 还没做好"时，才进入 M9

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
M1  执行引擎     ──→ ✅ 已完成
M2  可观测性     ──→ ✅ 已完成
M3  度量能力     ──→ 📊 终于能科学做实验，而不是靠感觉优化
M4  理解力       ──→ 🧠 agent 进入陌生 repo 不再像无头苍蝇
M5  行为智能     ──→ ✨ agent 开始呈现"有方法论"的工作风格
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
| 研究冲刺 / 立场说明（Research Sprint / Position Memo） | V3 | 每个大主题先研究问题模型，再形成 codelord 自己的立场，再开 build sprint |
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
| Retrieval / RAG | M4 | 持续优化 chunking、retrieval policy、rerank 与 grounding |
| Memory 管理 | M4/M6 | 持续调优写入、检索、compaction 与 decay |
| Dogfooding | M1 | 每个 milestone 完成后记录 UX 痛点 |
| Regression Check | M3 | 作为质量门禁 |

---

## 这版 Roadmap 最重要的取舍

- **把正反馈从“先做个浅版本”改成“选一个窄切片做到生产级收口”。**
- **把 Eval 从 tracing 里独立出来，抬升为第一等公民，并显式拆成 Product Eval / Research Eval 两条轨。**
- **把“大主题先研究再实现”写成 roadmap 硬规则：先学领先系统在解决什么问题，再形成 codelord 自己的 position，而不是边补需求边假装自己在做 industry best practice。**
- **把 Context Engineering 从"context 不要爆"升级为 agent 的核心智能层，并引入 working set 作为中间工程层。**
- **把 RAG 融进主线：它不是独立问答 feature，而是 code / docs / project memory / behavioral memory 的 retrieval substrate。**
- **把 Tool 从"函数列表"升级为内置稳定原语：kernel / contract / router 分层。**
- **把 Skill 的内容质量和基础设施分开看，避免只做框架不做效果。**
- **把 Memory 拆清楚：Project Memory 属于理解力，Behavioral Memory 属于长期进化，并与 retrieval / RAG 复用同一条检索主干。**
- **把 message injection 提前到 M1 架构层解决，而不是后面打补丁。**
- **把 governance 写成硬规则：每个 milestone 回收 unknown unknowns，roadmap 允许被数据重写。**
- **把最小 secret hygiene 前移到 M2，而不是等安全大 milestone 才开始。**
- **坚持“这是我自己的 agent”，所以 roadmap 追求的是有哲学的一致性，而不是功能对齐别家产品。**

---

*这份 roadmap 会随着 dogfooding、eval 数据和设计认知升级而持续重写。目标不是"按计划完成"，而是"用数据和体验把真正有价值的路线收敛出来"。*

*历次路线重写的决策记录见 [DecisionLog.md](./DecisionLog.md)。当前阶段焦点见 [Sprint.md](./Sprint.md)。*