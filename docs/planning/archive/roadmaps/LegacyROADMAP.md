# Codelord — Production Coding Agent Roadmap

> 不是 demo，不是玩具，是正儿八经的 coding agent。
> **也不是 mini Claude Code 或 mini Codex——这是我自己的 agent，有自己的哲学。**
>
> **核心哲学：Agent Core 极简，智能来自 Context Engineering。**
> Agent 内部只做执行引擎该做的事（ReAct loop、tool 执行、context 管理、tracing、安全）。
> 所有"聪明"的行为——planning、self-verification、编辑策略、项目理解——全部通过 Skill 层的 prompt fragment 注入。
> Agent core 不对"怎么做好一个 coding 任务"有任何 opinion，Skill 层才有。
>
> **Tool 哲学：** 最小有效工具集——内置少量高可靠工具（bash、文件读写、搜索），覆盖 coding agent 的核心操作。
> 工具层只解决"可靠执行"，不包含任何策略 opinion。"什么时候该用哪个工具、怎么组合"由 Skill 层通过 prompt fragment 注入。
> MCP 作为扩展通道，按需接入外部工具生态。
>
> **底层依赖：** pi-ai（LLM provider 适配）、pi-tui（终端 UI，后续可能自研）
>
> **协作模式：** 在本对话中讨论设计与策略 → 产出高质量 Claude Code prompt → 在 Claude Code 中执行实现。

---

## Core vs Skill 边界

这条边界是 codelord 的灵魂。每加一个新功能前先问：**这属于执行引擎，还是属于"怎么做好任务"的 opinion？**

| 属于 Agent Core（硬编码）                                      | 属于 Skill 层（prompt fragment 注入）        |
| -------------------------------------------------------------- | -------------------------------------------- |
| ReAct loop + FSM 状态机                                        | Planning 行为（先列计划再执行）              |
| 内置工具集（bash、file_read、file_write、search）+ 超时 + 截断 | 工具使用策略（什么场景用哪个工具、怎么组合） |
| Context window 管理（截断、压缩）                              | Self-verification（改完文件后 read 确认）    |
| Tracing & cost 追踪                                            | 语言/框架最佳实践（TS / Python / Rust）      |
| Eval runner & 指标收集                                         | Git 工作流（commit 规范、PR 描述）           |
| 安全拦截（声明式风险标签、风险分级）                           | Error recovery 的具体策略（怎么换思路）      |
| MCP client 协议实现                                            | 项目结构探索模式（先看什么文件）             |
| Multi-agent orchestration                                      | Agent 角色定义（你是一个 coding expert...）  |
| Skill 加载/激活/组装机制                                       | 具体的 skill 内容本身                        |

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

## ~~M0 — 架构重整 & CLI 骨架~~ ✅ 已完成

> 把原型代码重构为可分发的生产级架构。
> **这个 milestone 之后，每个后续 milestone 的产出都是一个可直接 `codelord "xxx"` 运行的 CLI。**
>
> 核心原则：每个包各管各的事，通过明确的接口组合，不互相知道对方的实现细节。

### 目标架构

```
packages/
  agent-core/        → 纯引擎：ReAct loop + FSM + events + tool execution
                       基于 pi-ai 做 LLM 调用，不知道 config 在哪、不知道怎么渲染
                       接口：接收 model + tools + system prompt → 产出 AgentEvent stream

  config/            → 配置解析：CLI flags > env vars > ~/.codelord/config.toml
                       不知道谁在消费配置，只管解析和验证

agents/
  coding-agent/      → 最终产物：人格定义 + CLI 入口 + 输出渲染
                       bin: "codelord"
                       这是唯一知道"怎么把所有东西接在一起"的 composition root
```

### agent-core 清理

设计决策：pi-ai 作为基建保留在 agent-core 中。pi-ai 本身已是 LLM provider 适配层，不再引入额外的 LLMCaller 抽象。测试时 mock streamSimple 即可。

- [x] 删除 `playground.ts`（测试代码不属于核心包）
- [x] 移除 `@mariozechner/pi-tui` 依赖（core 不负责渲染）
- [x] 确认导出和编译通过

### packages/config

- [x] 统一配置解析，优先级：CLI flags > 环境变量 > `~/.codelord/config.toml` > 内置默认值
- [x] 核心配置项：
  - `provider`：LLM provider 选择（openai / anthropic / openai-codex / ...）
  - `model`：模型名称
  - `apiKey`：API key（支持从环境变量读取，如 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY`）
  - `maxSteps`：agent 单次 run 的最大步数
  - `bash.timeout`：bash 命令超时
  - `bash.maxOutput`：bash 输出截断长度
- [x] 配置验证：缺少必填项时给出清晰的错误提示（"请设置 OPENAI_API_KEY 或在 ~/.codelord/config.toml 中配置 apiKey"）
- [x] `codelord init`：交互式引导用户创建 `~/.codelord/config.toml`（选择 provider → 输入 API key → 选择默认 model）

### coding-agent CLI 化

- [x] 添加 `bin` 字段到 package.json，注册 `codelord` 命令
- [x] CLI 命令结构（使用 `cac` 轻量 CLI 库）：
  - `codelord "message"` — 主命令，启动 agent 执行任务（后续 M1 升级为交互式 REPL）
  - `codelord init` — 初始化配置
  - `codelord config` — 查看当前配置
  - （M2 加入）`codelord trace list / show`
  - （M2 加入）`codelord eval run / compare`
- [x] CLI 入口负责：解析参数 → 加载 config → 构造 model → 创建 agent → 选择 output renderer → 运行
- [x] `pnpm link` 后能直接在任意目录下 `codelord "xxx"` 使用

### Output 抽象

- [x] 定义 `Renderer` 接口：消费 `AgentEvent` stream，负责渲染
- [x] 实现两个 renderer：
  - `TUIRenderer`：pi-tui 渲染逻辑，提取为独立模块（Markdown 渲染 + 状态栏）
  - `PlainTextRenderer`：纯文本输出到 stdout，用于非交互场景（CI / eval / pipe）
- [x] CLI flag 控制：`--plain` 强制使用 PlainTextRenderer，默认检测 TTY 自动选择
- [x] 后续 M2 的 trace 查看、eval 报告都通过 renderer 输出，不用重新造轮子

### Auth 去重 & 泛化

- [x] Auth 逻辑收归 coding-agent 的 `auth/` 模块（不放 agent-core，auth 不是引擎的事）
- [x] 按 provider 分策略：
  - API key 类（Anthropic / OpenAI 标准）：从 config 读取，无需 OAuth
  - OAuth 类（OpenAI Codex）：保持 OAuth flow，credential 存 `~/.codelord/credentials.json`
- [x] config 中配置 provider 后，auth 模块自动选择对应策略
- [x] 所有 credential 文件统一存储在 `~/.codelord/` 下，不再散落在项目目录里

> **🧠 你不知道你不知道的：**
>
> - **Config 优先级很重要。** 开发时用 env var（方便 CI），日常用 config.toml（持久化），临时覆盖用 CLI flag。三层叠加，高优先级覆盖低优先级。
> - **`codelord init` 是用户第一印象。** 它决定了新用户从安装到第一次成功运行的体验。做好引导能省掉大量"怎么配置"的问题。
> - **PlainTextRenderer 不是可选的。** Eval runner 需要 headless 运行 agent（没有 TUI），trace viewer 需要格式化输出到 stdout。没有 plain text output，M2 就做不了。
> - **bin 入口意味着你可以 `npm link` 后全局使用。** 从这个 milestone 开始，codelord 不再是"cd 到项目目录跑 tsx"，而是在任何目录下 `codelord "help me fix this bug"`。

**✅ 完成标志：** 在任意目录下 `codelord "explain this project"` 能跑通，config 从 `~/.codelord/config.toml` 读取，TUI 正常渲染。`codelord --plain "explain this project"` 纯文本输出。`codelord init` 能引导完成首次配置。

---

## M1 — 交互式 Agent + 基础安全

> 把执行引擎从 single-shot 升级为交互式。
> 这个 milestone 只做 **core 层** 的事——REPL、context 管理、安全网。
> 还不涉及 skill 系统，system prompt 先手写一版够用的。
>
> M0 已经建好了 CLI 骨架，这里升级 `codelord` 主命令为交互式 REPL。

### 多轮对话 REPL

- [ ] `codelord` 无参数启动时进入交互模式（REPL）
- [ ] `codelord "message"` 保留为 single-shot 模式（执行完退出）
- [ ] 会话历史在多轮间保持（messages 数组持续积累）
- [ ] TUI 中区分 user / assistant / tool 消息的视觉呈现
- [ ] 优雅退出（Ctrl+C / `/exit` 命令）

### 内置工具集 v1

> 从 bash-only 升级为最小有效工具集。每个工具解决一类 bash 做不好或不可靠的操作。
> 工具层只负责"可靠执行"，"什么时候用哪个工具"的策略由 Skill 层注入。

- [ ] **bash** — 通用命令执行（保留，仍然是最灵活的工具）
- [ ] **file_read** — 读取文件内容（支持行范围、大文件分块读取）
- [ ] **file_write** — 创建/覆盖文件（全量写入，适合新建文件或小文件重写）
- [ ] **file_edit** — search-and-replace 编辑（指定 old_string → new_string，解决 sed 对特殊字符脆弱的问题）
- [ ] **search** — 代码搜索（ripgrep 风格，支持 glob 过滤、正则、上下文行数）
- [ ] **ls** — 目录列表（支持 glob pattern、递归、文件类型过滤）
- [ ] 统一的 Tool 接口：`{ name, description, inputSchema, execute() → ToolResult }`
- [ ] 每个工具声明 `riskLevel: 'safe' | 'write' | 'dangerous'`（为安全网提供基础）
- [ ] Tool result 统一格式：`{ output, isError, duration }`

### System Prompt v1（手写，够用就行）

- [ ] 基础角色定义 + 工具使用规范 + 输出格式约定
- [ ] 每个内置工具的使用场景说明（什么时候用 file_edit vs bash sed，什么时候用 search vs bash grep）
- [ ] 项目上下文注入（cwd、git branch、目录结构摘要）
- [ ] 这版 prompt 是**临时的手写版**，后续会被 skill 系统替代
- [ ] **记录 system prompt 的 token 数**，建立基线（为后续 skill 注入的 budget 控制提供参考）

### Context Window 管理 v1

- [ ] Messages 的 token 计数（粗估即可，按字符数 / 4 近似）
- [ ] 达到阈值时的截断策略：保留 system prompt + 最近 N 轮对话
- [ ] **记录 system prompt 占总 context 的比例**（M4 skill 注入后这个比例会膨胀，需要基线数据）

### 会话持久化

- [ ] 会话历史序列化到磁盘（`~/.codelord/sessions/`），退出 REPL 后可恢复
- [ ] `codelord` 启动时检测上次未完成的会话，提示是否恢复
- [ ] `codelord --new` 强制开启新会话
- [ ] 会话元数据：cwd、git branch、开始时间、最后活跃时间

### Undo / Rollback

> Agent 改错文件是必然事件。越早有回滚能力，dogfooding 越安心。

- [ ] 每次 agent run 开始前自动创建 git stash 或 checkpoint（如果在 git repo 内）
- [ ] `/undo` REPL 命令：回滚到上一个 checkpoint
- [ ] 非 git 目录的 fallback：在 `~/.codelord/checkpoints/` 备份被修改的文件
- [ ] Checkpoint 信息记入 trace（方便事后定位"从哪一步开始改坏的"）

### 基础安全网

- [ ] **声明式工具风险标签**：每个工具自带 `riskLevel` 声明。bash 命令额外通过 pattern matching 细分（`safe` 如 ls/cat/find、`write` 如 sed/tee/cp、`dangerous` 如 rm -rf/fork bomb）。为 M6 的 LLM 辅助分级预留接口
- [ ] `dangerous` 操作拦截（M6 升级为人类审批），`safe` 操作静默放行，`write` 操作默认放行但记录
- [ ] 敏感路径保护（`~/.ssh`、`/etc` 等关键目录写入需确认）
- [ ] Git 高危操作保护（force push / branch delete / reset --hard 需确认）
- [ ] max_steps 硬上限（防止 agent loop 失控）

### 工具成功率轻量追踪

- [ ] 对每个工具的执行结果做简单 counter：attempts / successes / failures（按工具 + 操作类型分）
- [ ] 重点关注 **file_edit 的成功率**——search-and-replace 的 old_string 匹配失败是最常见的编辑失败模式

### 轻量 Tracing（从 M2 前置）

> 从 M2 前置到 M1 的最小 tracing。目的：M1 dogfooding 时有 trace 可看，不靠肉眼盯 TUI。
> M2 在此基础上加 cost tracking、trace CLI、eval 框架等更重的能力。

- [ ] 定义最小 Trace 数据模型：每次 run 产出一个 JSON 文件，记录 `{ runId, timestamp, steps: [{ type: 'llm_call' | 'tool_exec', ... }] }`
- [ ] 每个 LLM call 记录：model / stop reason / latency（token 计数暂不做，M2 补上）
- [ ] 每个 tool call 记录：tool name / args（截断）/ exit code / duration / is_error
- [ ] Trace 自动写入 `~/.codelord/traces/` 目录，按 run 存储
- [ ] 不做 trace CLI 查看（M2 做），dogfooding 时直接 `cat` / `jq` 看 JSON

> **🧠 你不知道你不知道的：**
>
> - **System prompt v1 会很粗糙，这是对的。** 你现在还不知道 prompt 里哪些模式真正有效。手写一版先跑起来，积累体感，为后续 skill 系统提供设计直觉。
> - **不要在 v1 的 prompt 里塞太多"聪明"的行为。** Planning、self-verification 这些后面由 skill 提供。v1 保持简单——告诉 agent 它有哪些工具、怎么用就够了。
> - **安全不能等。** 从 M1 起每天用 agent 执行工具调用，一次 `rm -rf` typo 损失几小时工作。
> - **从 M1 起就用声明式风险标签而不是黑名单。** Claude Code 的安全模型是分层的——每个 tool 声明 `isReadOnly()` / `isDestructive()`，再叠加全局 permission rules。如果 M1 用黑名单，M6 就得推翻重来。声明式标签是可叠加的：M1 只做 pattern matching，M6 加 LLM 辅助分类，结构不变。
> - **file_edit 的 search-and-replace 看起来简单，但有很多边界情况。** old_string 在文件中出现多次怎么办？出现 0 次（匹配失败）怎么办？Claude Code 的做法是：0 次 → 报错让 LLM 重试，多次 → 要求 LLM 提供更多上下文行来消歧。这些边界处理直接影响编辑成功率。
> - **工具数量和 LLM 选择准确率负相关。** 工具越多，LLM 越容易选错。6 个内置工具是一个合理的起点——覆盖核心操作，但不至于让 LLM 困惑。后续通过 eval 验证是否需要增减。
> - **Observability 不能等到出问题再加。** Agent 的"调用栈"是自然语言推理，你没法用 debugger 设断点。有了 trace JSON，你可以事后回溯"第 3 步它看到了什么 tool result，为什么第 4 步选了错误的工具"。
> - **M1 的 trace 故意做得很粗糙，这是对的。** 先跑起来，dogfooding 一周后你会发现"缺了 token count"、"tool result 截断太狠看不到关键信息"——这些发现正好驱动 M2 的 trace 升级。
> - **会话持久化看起来是小功能，但影响巨大。** 没有它，每次关终端就丢失所有上下文，agent 变成金鱼记忆。有了它，你可以跨天持续处理一个复杂任务。这是 dogfooding 体验的分水岭。
> - **Undo 是心理安全网。** 有了回滚能力，你才敢让 agent 大胆操作。没有它，你会不自觉地只给 agent 安全的小任务，限制了 dogfooding 的深度。
> - **System prompt 的 token 占比是一个隐藏的约束。** Claude Code 的 system prompt 约 10k-15k tokens。如果用 128k context 的模型，system prompt 就占了 10-15%。M4 加入 skill fragments 后这个比例会膨胀。从 M1 开始记录基线，后续才能做 budget 控制。

**✅ 完成标志：** `codelord` 启动进入交互式 REPL，多轮对话读代码、改代码、搜索代码。内置工具集（bash + file_read/write/edit + search + ls）端到端工作。危险命令被拦截（声明式风险标签），loop 有硬上限。每次 run 自动产出 trace JSON。会话可持久化和恢复。`/undo` 能回滚 agent 的文件修改。Dogfooding 一天，记录 3 个最大痛点。

---

## M2 — Tracing, Observability & Eval

> 能看清 agent 每一步在干什么、花了多少钱、哪里出了问题。
> 同时建立可重复的评估能力。
> Tracing 和 Eval 天然耦合——合并推进，避免往返浪费。
>
> CLI 命令扩展：`codelord trace list/show` + `codelord eval run/compare`。

### 结构化 Trace

> M1 已建立最小 tracing（per-run JSON）。此阶段升级为生产级结构化 trace。

- [ ] 从 M1 的 flat JSON 升级为层次化数据模型：`Run → Step → (LLMCall | ToolExecution)`，支持嵌套（为 M7 subagent trace 预留）
- [ ] 每个 LLM call 记录：model / input tokens / output tokens / latency / stop reason
- [ ] 每个 tool call 记录：tool name / args / result (truncated) / duration / is_error
- [ ] **记录当前 system prompt 版本**（hash 或 tag），让 trace 与 prompt 版本绑定
- [ ] Trace 持久化为 JSON 文件（按 run 存储，`~/.codelord/traces/`）

### 成本追踪

- [ ] 按模型的 token 计费统计（input / output 分开计）
- [ ] 每次 run 的 cost breakdown（哪一步花了多少钱）
- [ ] cost ceiling：单次 run 的 token 上限，超过自动停止

### Prompt Caching

> System prompt + skill fragments 在多轮对话中基本不变，是 prompt caching 的理想场景。
> Anthropic 和 OpenAI 都已支持 prompt caching，开了能省 90% 的 input token cost。

- [ ] 调研当前使用的 provider 的 prompt caching 支持（Anthropic: cache_control / OpenAI: automatic caching）
- [ ] 在 LLM 调用层（pi-ai）启用 prompt caching（标记 system prompt 为 cacheable）
- [ ] Cost tracking 区分 cached vs uncached input tokens（cached 通常 0.1x 价格）
- [ ] 验证 caching 命中率：在 trace 中记录每次 LLM call 的 cache hit/miss

### TUI 集成

- [ ] 状态栏展示当前 run 的 step count / token usage / estimated cost
- [ ] tool 执行耗时实时展示

### Trace 查看（CLI 命令）

- [ ] `codelord trace list` — 列出历史 trace（时间、task 摘要、cost、pass/fail）
- [ ] `codelord trace show <id>` — 查看单个 trace 的详细步骤（通过 PlainTextRenderer 渲染）

### Eval 框架搭建

- [ ] 设计 eval case 格式：`{ id, description, setup, input, expected, tools, maxSteps }`
- [ ] 实现 eval runner：批量执行 agent（headless，使用 PlainTextRenderer），收集 trace
- [ ] 结果存储：每次 eval run 的结果 + trace 持久化，**关联 prompt 版本**
- [ ] 结果对比：两次 eval run 的 diff（哪些 case 变好了 / 变差了）

### CLI 命令

- [ ] `codelord eval run` — 执行 eval suite，输出 score 报告
- [ ] `codelord eval compare <run1> <run2>` — 对比两次 eval 的结果差异

### Golden Dataset v0

- [ ] 编写 5-10 个基础 coding 任务 eval case：
  - 读文件回答问题
  - 找到并修复一个简单 bug
  - 在指定位置添加代码
  - 运行测试并报告结果
  - 理解项目结构并回答架构问题
- [ ] 每个 case 定义 pass criteria（文件内容匹配 / 测试通过 / 关键信息包含）
- [ ] 为每个 case 准备 fixture（临时项目目录 + 预设文件）

### 评估指标 v1

- [ ] **Task Completion** — 最终是否完成任务（binary pass/fail）
- [ ] **Step Efficiency** — 完成任务用了多少步（越少越好）
- [ ] **Error Recovery** — 遇到工具执行失败时是否合理恢复

### LLM-as-Judge 初探

- [ ] 实现简单 LLM judge：用另一个 LLM 对 agent trace 打分
- [ ] 定义评分 rubric（task completion / reasoning quality / code quality）
- [ ] 跑几轮对比 LLM judge 分数和人工判断的一致性

### Eval 统计方案（处理非确定性）

> LLM 输出非确定性意味着 eval 天然 flaky。这里建立统计方法来区分"真的变好了"和"方差波动"。

- [ ] 每个 eval case 跑 N 次（N ≥ 5），记录 pass rate 而不是 single pass/fail
- [ ] **pass@k 指标**：k 次里至少 1 次成功的概率。用于衡量 agent 的"能力上限"（能不能做到）vs "可靠性"（每次都做到）
- [ ] **Prompt 版本对比**：同一组 eval case 在新旧两个 prompt 版本下各跑 N 次，用 paired difference 判断是否有显著提升
  - 简单方案：每个 case 的 pass rate 差值，看平均差值是否大于某个阈值（如 10%）
  - 进阶方案：用 bootstrap resampling 或 paired t-test（如果 N 够大）
- [ ] **结果报告格式**：`case_name | pass_rate_v1 | pass_rate_v2 | delta | significant?`
- [ ] 明确定义"显著提升"的门槛：总体 pass rate 提升 ≥ 10% 且没有任何 case 的 pass rate 下降 > 20%（避免"总分提了但某个场景崩了"）

### Trace ↔ Eval 闭环验证

- [ ] 用 2-3 个手写 eval case 端到端跑通：执行 agent → 产出 trace → eval 消费 trace → 输出 score
- [ ] 验证 trace 数据模型是否满足 eval 需求
- [ ] 验证 failure replay：从失败 trace 中定位"agent 在第 N 步做了错误决策"

> **🧠 你不知道你不知道的：**
>
> - **Tracing 是 debug 非确定性系统的唯一办法。** Agent 的"调用栈"就是 trace——reasoning 是自然语言，不能用 debugger 追。
> - **Cost 感知不是可选的。** 一个死循环的 agent loop 可以在几分钟内烧 $50+。
> - **Trajectory eval vs Outcome eval。** Outcome 只看结果对不对；Trajectory 还看过程。Agent 可能"蒙对了"。
> - **Eval 的 flaky 问题。** LLM 输出非确定性，同一个 case 跑 5 次可能 3 pass 2 fail。成熟 eval 会跑多次取统计量（pass@k）。
> - **Prompt 版本追踪是隐藏刚需。** System prompt + skill fragments 就是 agent 的能力天花板。每次 eval run 绑定 prompt 版本，才能回答"是改好了还是改坏了"。
> - **Prompt caching 是 cost 优化的最大杠杆。** 多轮对话中 system prompt 每轮都重复发送，占 input tokens 的大头。Anthropic 的 prompt caching 对 cached tokens 只收 0.1x 价格，一个 10k token 的 system prompt 在 20 轮对话中能省约 180k input tokens 的费用。这不是锦上添花，是日常 dogfooding 的经济可行性问题。
> - **PlainTextRenderer 在这里拿到第一个非 trivial 消费者。** Eval runner 需要 headless 运行 agent、trace viewer 需要格式化输出——这些都走 PlainTextRenderer，验证 M0 的抽象是否到位。
> - **M1 的粗糙 trace 和 M2 的结构化 trace 之间有一次 schema migration。** 不要试图向后兼容 M1 的 JSON 格式。M1 的 trace 是 throwaway 的探索数据，M2 是正式格式。直接换掉，旧 trace 保留但不做自动迁移。
> - **Eval 的 flaky 不是 bug，是 LLM 的本质特性。** 同一个 prompt + 同一个 input，temperature > 0 时每次输出不同。即使 temperature = 0，不同 provider 的实现也可能有微小差异。所以 eval 的基本单位不是 pass/fail，而是 pass rate。
> - **pass@k 和 pass rate 衡量的是不同东西。** pass@1 ≈ 可靠性（用户跑一次就成功的概率），pass@5 ≈ 能力上限（给 5 次机会至少成功一次）。一个 skill 可能把 pass@1 从 40% 提到 60%（可靠性提升），同时 pass@5 保持 95%（能力上限没变）。这意味着 skill 的价值是"让 agent 更稳定"而不是"让 agent 能做新的事"。
> - **统计检验不需要很复杂。** 在 eval case 数量少（5-10 个）、每个跑 5 次的情况下，不需要 p-value 和假设检验这些重型工具。看 paired pass rate difference 的分布就够了——如果 8 个 case 里有 6 个提升、2 个持平，这就是一个清晰的信号。正式的统计检验等 eval suite 扩大到 50+ case 后再引入。

**✅ 完成标志：** 每次 run 自动产出 trace JSON。`codelord trace list/show` 可用。`codelord eval run` 一行命令跑完 eval suite 输出 score 报告。改了 prompt 后 `codelord eval compare` 能看到分数变化。

---

## M3 — Agent Core 加固

> 加固**执行引擎本身**的能力——context 管理、error handling、tool result 处理。
> 这些是 core 层的基础设施，不是"怎么做好 coding 任务"的 opinion。
> 所有"变聪明"的工作留给 M4 的 skill 系统。

### Context Window 管理 v2

- [ ] 从 M1 的简单截断升级为 **分层保留策略**：system prompt（永不截断）→ 重要操作摘要 → 最近对话
- [ ] Tool result 智能压缩：长输出的截断 + 摘要（保留关键信息，不粗暴砍断）
- [ ] Token 使用统计接入 trace，追踪 context 利用率
- [ ] 大文件输出处理（超长 stdout 的分块截断策略）

### Error Recovery（机械层）

- [ ] Tool 执行失败时的重试机制（区分 transient error vs permanent error）
- [ ] LLM 输出解析失败时的 retry with feedback（把 parse error 信息喂回去）
- [ ] 连续失败的 circuit breaker（N 次连续失败后停止重试，报告给用户）
- [ ] **注意：** "怎么从错误中恢复"的具体策略（换一种编辑方式试试、换个思路）属于 skill，不属于 core。Core 只负责"检测到错误 → 给 LLM 一次重新决策的机会"。

### Tool Result 处理管线

- [ ] 定义 tool result 的处理管线：raw output → truncation → structured extraction → injection to context
- [ ] 错误输出的结构化提取（从长 stack trace 中提取关键错误信息）
- [ ] 管线可配置（不同 skill 可以定义自己的 result 处理规则——为 M4 预留接口）
- [ ] **溢出到磁盘 + context 摘要指针**：tool result 超过阈值时，完整输出写入临时文件（`~/.codelord/tool-outputs/`），context 里只放截断预览 + 文件路径。agent 需要详细信息时可以 `cat` 回来。信息不丢失，context 不浪费。

> **🧠 你不知道你不知道的：**
>
> - **Context 管理的质量直接决定 agent 能处理的任务复杂度上限。** 截断做得不好，agent 在第 8 轮后"失忆"，重复做已经做过的事，cost 爆炸。这是 core 层最重要的基础设施之一。
> - **Tool result 处理管线是 skill 系统的前置依赖。** 不同 skill 对 tool result 的处理需求不同（TS 的 type error 和 Python 的 traceback 需要不同的结构化提取）。先在 core 建好可扩展的管线，M4 的 skill 才能插入自己的处理逻辑。
> - **Error recovery 的"机械层 vs 策略层"区分很重要。** Core 负责：检测到 tool 失败 → 把错误信息放回 context → 让 LLM 重新决策。Skill 负责：在 prompt 里教 LLM "如果 file_edit 匹配失败了，试试扩大 old_string 的上下文行数"。前者是基础设施，后者是 opinion。
> - **"截断"和"溢出到磁盘"是两种完全不同的策略。** 截断意味着信息丢失——agent 永远看不到被砍掉的部分。溢出到磁盘意味着信息还在，agent 按需取回。Claude Code 用的就是后者：tool result 超过 `maxResultSizeChars` 时写文件，context 里留 preview + path。这对长 stack trace、大文件 ls 输出这些场景非常关键。

**✅ 完成标志：** Context 不再粗暴截断。Error recovery 机制端到端工作。Tool result 有可扩展的处理管线。Eval 分数相比 M2 基线有提升（纯 core 加固带来的提升）。

---

## M4 — Skills System（分两阶段）

> **这是 codelord 的灵魂 milestone。**
>
> Skill = prompt fragment + tool usage patterns + activation condition + （可选）tool result 处理规则。
> Agent 的所有"聪明"行为都通过 skill 注入，core 保持干净。
>
> 经过 M1-M3 的手写 prompt 和 dogfooding，你已经积累了足够的直觉来设计好的 skill 抽象。

> **分阶段策略：** M4 拆为两个子阶段。M4a 验证核心抽象——skill 能加载、能注入 prompt、能 A/B eval。M4b 加入复杂机制——条件激活、动态发现、参考文件按需加载。这样 M4a 结束时就能回答"skill 系统这条路走得通吗"，不用等所有机制就位。

### M4a — Skill 核心抽象

> 验证文件驱动 skill 的核心假设：SKILL.md 能被正确解析、注入 prompt、通过 eval 证明价值。

- [ ] Skill 格式定义：每个 skill 是一个目录 `skills/<skill-name>/SKILL.md`
  - Frontmatter 声明：`name`、`description`、`when_to_use`、`allowed_tools`
  - Markdown 正文 = prompt fragment
- [ ] Skill 注册表：agent 启动时扫描 `~/.codelord/skills/` + 项目目录 `.codelord/skills/` 并注册所有 skill（此阶段全部无条件加载）
- [ ] **Prompt 组装引擎 v1**：多个 skill 的 prompt fragment 按固定顺序拼接到 system prompt。context budget 上限控制（超出时警告，不自动裁剪）
- [ ] Frontmatter 解析器（YAML frontmatter + markdown body 分离）
- [ ] **A/B eval 验证**：同一组 eval case，skill 开启 vs 关闭，对比 pass rate 差异。这是 M4a 的核心产出——用数据证明 skill 系统有价值。

### M4b — 条件激活 & 动态发现

> 在 M4a 证明 skill 有价值后，加入复杂的激活和发现机制。

- [ ] Frontmatter 扩展：加入 `paths` 字段（gitignore 风格 glob pattern）
- [ ] **条件激活引擎**：有 `paths` 的 skill 存入待激活池，当 agent 操作匹配路径的文件时才激活
- [ ] **文件操作触发的动态发现**：agent 读/写文件时，向上遍历目录查找 `.codelord/skills/`，发现新 skill 目录后动态加载
- [ ] **参考文件按需加载**：skill 目录下的额外文件不注入 context，prompt 前加 `Base directory for this skill: <dir>`，agent 需要时自己 Read/Grep
- [ ] Skill 间依赖声明（如 typescript-project 依赖 node-project）
- [ ] **Prompt 组装引擎 v2**：context budget 智能分配——优先级高的 skill 先占 budget，低优先级的在 budget 不足时降级（只注入 description，不注入完整 prompt）
- [ ] Skill activation 准确率 eval（是否在正确的项目类型下激活了正确的 skill）

> 以下内置 skills 在 M4a 阶段以无条件加载方式引入，M4b 阶段加入条件激活。

### 内置 Skills——行为模式类

这些 skill 不绑定特定技术栈，而是定义 agent 的**行为模式**：

- [ ] **planning** — 收到复杂任务时先列出步骤计划再执行。prompt fragment 教 agent "在修改代码前先列出需要改哪些文件、为什么、以什么顺序"。这不是 agent core 的硬编码行为，而是一个可开关的 skill。
- [ ] **self-verification** — 关键操作后自行检查结果。prompt fragment 教 agent "改完文件后 file_read 确认 / 跑 lint / typecheck"。
- [ ] **tool-usage-strategies** — 工具选择与组合策略。prompt fragment 教 agent 什么场景用 file_edit（精确修改）、什么用 file_write（全量重写）、什么用 bash（复杂管道操作）、file_edit 匹配失败时怎么 fallback。
- [ ] **error-recovery-strategies** — 遇到错误时的应对策略。prompt fragment 教 agent "如果 file_edit 匹配失败了扩大上下文重试，如果 test 失败了先看 error message 再改"。

### 内置 Skills——技术栈类

- [ ] **typescript-project** — tsc / vitest / eslint 的工具使用模式，TS 项目最佳实践
- [ ] **node-project** — npm/pnpm/yarn 的工具使用模式、package.json 解读
- [ ] **git-workflow** — commit 规范、branch 策略、PR 描述生成
- [ ] **python-project** — pytest / pip / venv 的工具使用模式（验证 skill 系统的语言无关性）

### Skill 的 Eval

- [ ] **A/B eval（M4a 核心产出）：** 同一组 eval case，skill 开启 vs 关闭，对比 pass rate 差异（使用 M2 的统计方案）
- [ ] 验证单个 skill 的 ROI（它占了多少 context budget，带来了多少 eval 分数提升）
- [ ] Skill activation 准确率 eval（是否在正确的项目类型下激活了正确的 skill）

> **🧠 你不知道你不知道的：**
>
> - **行为模式 skill 和技术栈 skill 是两个维度。** Planning 是行为模式，typescript-project 是技术栈。它们正交组合：在 TS 项目里同时激活 planning + typescript-project + self-verification。设计 skill 系统时要支持这种组合。
> - **Skill 的粒度很关键。** 太粗 → context 浪费。太细 → 管理复杂。经验上"一个行为模式"或"一个技术栈"是合适的粒度。
> - **Prompt 组装顺序影响效果。** 多个 skill fragment 放在 system prompt 的什么位置、以什么顺序，会影响 LLM 的注意力分配。这需要实验验证。
> - **Skill A/B eval 是验证 skill 价值的关键。** 如果一个 skill 占了 500 token 的 context 但 eval 分数只提升了 1%，它可能不值得。
> - **Skill activation 误判。** 项目里有个 `requirements.txt` 但其实是 Node 项目——需要考虑 false positive 和优先级仲裁。
> - **这是你的 agent 区别于 Claude Code 的核心。** Claude Code 把 planning、self-verification 硬编码在 agent 里。你把它们做成可组合、可开关、可 eval 的 skill。这是一个更灵活、更可实验的架构。
> - **Skill 是文件不是代码，这个决策影响深远。** 创建/编辑 skill 不需要写 TS、不需要重新编译——改个 markdown 文件就行。用户可以在项目里放自己的 `.codelord/skills/`。eval 的 prompt 版本追踪天然绑定文件 hash。
> - **条件激活解决了 context 浪费问题。** 一个 monorepo 里可能有 20 个技术栈的 skill，但一次任务只涉及 2-3 个目录。paths 条件激活让 skill 只在真正需要时才占用 context budget。
> - **参考文件按需加载是 context budget 的杠杆。** Skill 的 prompt fragment 只放核心指令（几百 token），详细的 best practices、示例代码放在参考文件里。agent 自行判断是否需要读。这比把所有内容塞进 system prompt 高效得多。
> - **动态发现让 skill 可以是项目内嵌的。** 团队可以在 `src/payments/.codelord/skills/payment-patterns/SKILL.md` 放一个支付模块专用的 skill。agent 第一次操作 `src/payments/` 下的文件时自动发现。这是 Claude Code 实际在用的模式。
> - **M4a 的 A/B eval 结果决定了 M4b 是否值得做。** 如果 M4a 的无条件 skill 加载已经带来了显著的 eval 提升，那条件激活只是优化 context budget 的问题（值得做但不急）。如果 M4a 的提升不明显，你需要先回头审视 skill 的内容质量，而不是急着加复杂的激活机制。
> - **拆分的另一个好处是降低 debug 难度。** M4a 出问题时，原因只有三个：frontmatter 解析错了、prompt 组装顺序不对、skill 内容写得不好。M4b 出问题时，还要额外考虑激活条件是否正确、动态发现是否触发、依赖是否解析对。分开做意味着分开 debug。

**✅ 完成标志：** Skill 系统端到端工作。在 TS 和 Python 项目目录下 agent 自动加载不同 skill 集。Planning、self-verification 作为 skill 可开关。A/B eval 证明 skill 带来了 eval 分数提升。

---

## M5 — MCP Client 集成 + Model Routing

> 让 codelord 能连接外部 MCP server，消费第三方工具。
> 同时加入 model routing——运行时切换模型、fallback 策略。
> 这两个能力都是"扩展 agent 的可用资源"，放在一起推进。
> **注意：MCP 工具的引入不改变核心哲学——内置工具仍然是默认选择，MCP 工具是补充。**

### MCP 协议基础

- [ ] 学习 MCP 协议：transport（stdio / HTTP SSE）、tool schema、resource、prompt
- [ ] 理解 MCP 的 capability negotiation 和 lifecycle

### MCP Client 实现

- [ ] 实现 MCP client：连接 MCP server、获取工具列表、调用工具、接收结果
- [ ] 支持 stdio transport（最常见的本地 MCP server 模式）
- [ ] MCP 工具自动注册到 agent 的 tool handler 中
- [ ] MCP server 配置管理（`~/.codelord/config.toml` 中配置 MCP servers）

### 对接验证

- [ ] 对接一个现成的 MCP server 验证端到端（比如 filesystem MCP server / GitHub MCP server）
- [ ] MCP 工具和内置 bash tool 的共存与优先级处理

### 动态工具管理

- [ ] 运行时添加/移除 MCP server 连接
- [ ] MCP 工具的 tool description 自动注入 agent context
- [ ] 处理 MCP server 断连 / 超时的错误恢复
- [ ] **Tool 数量控制**：接入多个 MCP server 后工具可能爆炸，需要按需加载或 tool routing 策略
- [ ] **Deferred tool loading**：MCP tool 默认不暴露 schema 到 agent context，标记为 deferred。agent 需要时通过 tool discovery 机制（类似搜索）按需加载 schema。避免 tool 数量爆炸导致 LLM 选择准确率下降。

### MCP 与 Skill 系统的集成

- [ ] Skill 可以声明依赖特定 MCP 工具（如 `github-workflow` skill 依赖 GitHub MCP server）
- [ ] MCP 工具的 result 接入 M3 的 tool result 处理管线
- [ ] 评估 MCP Resource 和 Prompt 的使用场景（先做 Tool，按需再加）

### Model Routing

> 从 M3 拆出。Model routing 是"扩展 agent 可用资源"的一部分，和 MCP 同属"让 agent 能力更丰富"的范畴。

- [ ] 支持运行时切换模型（REPL 中 `/model sonnet` / `/model opus` 命令）
- [ ] config 中配置默认模型 + 可选模型列表
- [ ] Fallback 策略：主模型失败时自动降级到备选模型
- [ ] Model routing 效果纳入 eval：对比不同模型在同一 eval suite 上的 score / cost trade-off

> **🧠 你不知道你不知道的：**
>
> - **MCP 不只是 tool call。** 它还有 Resource（给 LLM 提供上下文数据）和 Prompt（预定义的 prompt 模板）。先把 Tool 做通。
> - **MCP server 的质量参差不齐。** 你的 client 需要对 MCP 工具的输出做防御性处理。
> - **Tool 数量爆炸问题。** LLM 面对太多工具选择时准确率下降——需要 tool routing 或按需加载。
> - **MCP 引入后要审视内置工具和 MCP 工具的边界。** 需要想清楚：哪些 MCP 工具是内置工具做不好的事（如 API 调用、数据库查询），哪些只是内置工具的替代（如 filesystem MCP）。避免工具功能重叠导致 LLM 选择困难。
> - **Deferred loading 是 tool 数量控制的关键范式。** Claude Code 有 30+ tools 但不全部塞进 system prompt——大部分标记为 `shouldDefer: true`，只有 ToolSearch 被调用后才加载 schema。这让 initial context 保持精简，LLM 面对少量核心 tool 时准确率更高。对 codelord 来说，内置工具永远在场，MCP tools 按需浮现。
> - **Model routing 是 cost 控制的杠杆。** 一直用 Opus 级别 cost 受不了，一直用 Sonnet 级别能力不够。简单任务用小模型，复杂任务用大模型，是最直接的 cost/quality trade-off。

**✅ 完成标志：** `~/.codelord/config.toml` 中配置 MCP server 后，codelord 能连接并使用 MCP 工具完成任务。Skill 能声明 MCP 工具依赖。Model 可在 REPL 中切换，fallback 策略生效。

---

## M6 — Guardrails & Safety（高级）

> M1 已建立基础安全网。这里升级为生产级安全体系。
> 从"拦截已知危险"升级为"检测未知风险"。

### 命令安全分级（从 M1 的黑名单升级）

- [ ] 定义命令风险等级：`safe`（读取类）/ `write`（文件修改类）/ `dangerous`（破坏性操作）
- [ ] 命令意图识别：解析 bash command 判断风险等级（静态 pattern matching + 可选 LLM 辅助）
- [ ] `dangerous` 操作需人类审批，`safe` 操作静默放行

### Loop & Stuck 检测

- [ ] Loop detection：检测连续 N 次相同 / 高度相似的 tool call
- [ ] Stuck detection：检测连续 N 步没有实质进展
- [ ] 检测到 loop/stuck 时的策略：注入提示让 agent 换思路，或升级到人类介入

### Prompt Injection 防御

- [ ] 对 tool result 内容做基本 injection detection
- [ ] 敏感文件内容的 sanitization
- [ ] Agent 读取外部内容时的防御层

### 输出验证

- [ ] Agent 最终输出的基本校验
- [ ] Tool call 参数校验（类型检查、必填项检查）

> **🧠 你不知道你不知道的：**
>
> - **Defense-in-depth 思维。** 每层防线独立生效。
> - **Prompt injection 是 agent 特有的安全问题。** 恶意文件内容可能包含"忽略之前的指令"类攻击。
> - **Human-in-the-loop 的 UX 很重要。** 每步都弹确认用户会关掉。只在真正危险时打断。

**✅ 完成标志：** 死循环被自动检测停止。Prompt injection 有基本防御。安全机制不影响正常使用的流畅度。

---

## M7 — A2A & Multi-Agent

> 从单 agent 升级为多 agent 协作。
> **核心问题：多个 agent 各自加载不同 skill，通过 orchestrator 协作。**

### Multi-Agent 基础

- [ ] 学习主流 multi-agent 模式：supervisor / worker / swarm / handoff
- [ ] 选择初始模式：supervisor → worker（最容易理解和调试）

### Orchestrator 实现

- [ ] Supervisor agent：接收用户任务，拆解为子任务，分发给 worker agent
- [ ] Worker agent：接收子任务，执行并返回结果
- [ ] **每个 worker 可以加载不同的 skill 集**（架构 agent 加载 planning skill，编码 agent 加载技术栈 skill）
- [ ] Supervisor 对 worker 结果的汇总与质量检查
- [ ] Agent 间通信协议（内部先用简单的函数调用，后续可对接 A2A 标准）
- [ ] **Worker result 结构化格式**：worker 完成/失败时，结果以结构化格式（XML 或 JSON）注入 coordinator context，包含 task-id / status / summary / response / usage。coordinator 据此决策后续动作。
- [ ] **Coordinator prompt engineering 作为 skill**：coordinator 的行为指令（task workflow phases、concurrency rules、prompt writing 规范、synthesis vs delegation 原则）不硬编码，而是作为 coordinator 专属的 skill 提供。

### 实际场景验证

- [ ] 场景一：architect agent（带 planning skill）+ coder agent（带技术栈 skill）协作
- [ ] 场景二：并行让多个 agent 分别修改不同文件，supervisor 做 merge 和冲突检测
- [ ] Eval：multi-agent 场景的评估（总成功率、总 cost、vs 单 agent 的对比）

### A2A 协议探索

- [ ] 调研 Google A2A 协议的设计
- [ ] 评估是否采用 A2A 标准 vs 自定义协议
- [ ] 如果采用：实现 A2A agent card、task lifecycle

> **🧠 你不知道你不知道的：**
>
> - **Multi-agent 不一定比 single agent 好。** 很多场景下单 agent + 好的 skill 组合就够了。Multi-agent 的价值在于**专业分工**和**并行执行**。
> - **Skill 系统在 multi-agent 下获得新的意义。** 不同 agent 加载不同 skill = 专业分工。这是 codelord 的 skill 架构在 multi-agent 场景下的自然延伸。
> - **Agent 间的"信息损失"是核心挑战。** Supervisor 给 worker 的 instruction 不够精确时 worker 会曲解任务。
> - **Debug 难度翻倍。** Multi-agent trace 是嵌套的。M2 的 observability 在这里回报巨大。
> - **Coordinator 的核心能力是 synthesis，不是 delegation。** Claude Code 的 coordinator prompt 明确禁止"based on your findings, fix it"这种懒委托——coordinator 必须理解 worker 结果后写出包含具体文件路径、行号、修改内容的指令。这是 coordinator 和简单 dispatcher 的本质区别。
> - **Worker result 的结构化格式很重要。** 非结构化的自然语言结果让 coordinator 难以可靠地提取 status/error/output。结构化格式（如 XML tag）让 coordinator 可以精确判断 worker 是成功了、失败了、还是卡住了。
> - **Coordinator prompt engineering 本身是一个巨大的工程。** Claude Code 的 coordinator system prompt 几百行，定义了 Research → Synthesis → Implementation → Verification 的完整 workflow。在 codelord 的架构下，这些指令自然属于 skill 层——coordinator 加载 `coordinator-workflow` skill，worker 加载技术栈 skill。这正是 skill 系统在 multi-agent 场景下的价值体现。

**✅ 完成标志：** Supervisor + workers 的 multi-agent pipeline 跑通复杂 coding 任务，workers 各自加载不同 skill，有完整 trace 和 eval 覆盖。

---

## 正反馈节奏

```
M0 架构重整 & CLI 骨架         ──→ ✅ 已完成
M1 交互式Agent+工具集+安全     ──→ 🎉 日常能用了，有工具集+安全网+会话持久化+undo
M2 Tracing & Eval              ──→ 🔍📊 能看清agent + 有度量基线 + prompt caching 省钱
M3 Agent Core 加固             ──→ ⚙️  引擎本身更强了（context/error/tool result 管线）
M4a Skill 核心抽象              ──→ 🧠 skill 能加载了，A/B eval 证明有价值
M4b 条件激活 & 动态发现         ──→ 🎉 完整 skill 系统：按需激活，嵌套发现
M5 MCP Client + Model Routing  ──→ 🔌 能接外部工具生态 + 模型切换
M6 Guardrails（高级）           ──→ 🛡️ 生产级安全性
M7 A2A & Multi-Agent           ──→ 🤝 多 agent + 不同 skill = 专业分工
```

## 持续贯穿的工程实践

| 实践              | 首次建立 | 持续应用                                        |
| ----------------- | -------- | ----------------------------------------------- |
| CLI 可用          | M0       | 每个 milestone 的产出都是可用的 CLI 命令        |
| 内置工具集        | M1       | 全程，按 dogfooding 反馈增减工具                |
| 基础安全          | M1       | 全程，M6 升级为生产级                           |
| 会话持久化 & Undo | M1       | 全程                                            |
| 工具成功率追踪    | M1       | M4 的 eval 驱动决策输入                         |
| Tracing           | M2       | 每次改动都有 trace                              |
| Eval              | M2       | 每次改进跑 eval 对比                            |
| Prompt 版本管理   | M2       | 每次 prompt 变更关联 eval 结果                  |
| Prompt Caching    | M2       | 全程，持续监控 cache hit rate                   |
| Cost 监控         | M2       | 全程                                            |
| Regression check  | M2       | 作为改动前后的质量门禁                          |
| Dogfooding        | M1       | 每个 milestone 完成时 dogfooding + 记录 UX 痛点 |

---

_路线图会根据实际进展动态调整。打勾 = 已完成。每个 milestone 完成时更新此文件。_
