# Codelord — Decision Log

> 这里只记录"为什么路线改了"。
> 每条记录对应一次 roadmap 重写或增补，说明触发信号、改变了什么判断、以及注意力被推向了哪里。
> 日常 TODO 和当前焦点不在这里——见 [Sprint.md](./Sprint.md)。

---

## 2026-04-12 — M3-S1 关闭：eval 数据驱动 roadmap 优先级确认

### 背景

M3-S1（外部 Benchmark Fast Bootstrap）冲刺完成。四套 benchmark 端到端可用，第一批基线数据和结构化失败模式分析已产出。

### 决策

1. **M4 Context Engineering 确认为最高优先级**：SWE-bench 4/4 失败全部归因于 context 不足（大型 repo 中无法定位和理解相关代码），占总失败的 36%。这是 codelord 与行业领先 scaffold 的核心差距。
2. **M5 Skill System 确认为第二优先级**：推理错误 + 执行不完整占总失败的 27%，均可通过 prompt fragment 注入改善。
3. **ToolPlugin 可插拔架构已落地**：从本冲刺需要补 web tools 的经验中确认，工具系统必须是可插拔的。`@codelord/tools` 包 + ToolPlugin 接口已建立，后续新工具不再侵入 agent-core。
4. **CLI headless 模式是 eval 生态的基础**：`codelord -p` 不仅服务于 Terminal-Bench Harbor 集成，也是 CI/CD eval pipeline 的入口。
5. **reasoning level 对 eval 结果有巨大影响**：BrowseComp 的 reasoning=high 导致 60% 假阴性（代理超时），切到 low 后消除。eval 配置中 reasoning level 应作为显式参数。

### 影响

roadmap 优先级确认为 M4 > M5 > Infra 优化。下一个冲刺从 M4 或 M3-S2 中选取。

### 结果

- Sprint 归档到 `docs/planning/archive/sprints/sprint-m3s1-benchmark-bootstrap.md`
- 失败模式分析写入 `docs/planning/research/failure-analysis-m3s1.md`
- Top 3 unknown unknowns：tool 选择偏好需显式阻断 / 代理 API 超时是 eval 假阴性主因 / 容器内 Node.js 安装复杂度超预期

---

## 2026-04-08 — Checkpoint 从 git stash 迁移到 shadow git repo

### 背景

M1/M1X/M2 尾部收口时选择了 git stash 作为 checkpoint 策略（"复用已有基础设施，不重新发明 bash 修改追踪"）。实际使用后发现 stash 的语义是"暂存"而不是"快照"——`git stash push` 是破坏性的（把工作区变更移走而不是复制），导致 beginBurst 后外部 agent 的改动、用户 staged 的文件全部消失。第一次修复用 stash push + 立即 stash apply 做非破坏性 copy，undo 时 checkout+clean+apply+drop。能工作但拐弯太多。

调研 Claude Code 的做法：纯 file-level snapshot，只追踪自己的 Write/Edit/MultiEdit 工具，bash 改动明确不追踪（官方文档写明 "Checkpointing does not track files modified by bash commands"）。第三方 checkpoint 插件（如 Ixe1/claude-code-checkpointing-hook、Vvkmnn/claude-vigil-mcp）用 shadow git repo 或 content-addressable storage 来解决这个问题。

### 决策

1. **从 git stash 迁移到 shadow git repo**：在 `{cwd}/.codelord/shadow/` 维护一个独立的 bare git repo，用 `git --git-dir=.codelord/shadow --work-tree=.` 操作。不碰用户自己的 `.git`（不影响 stash、staging area、HEAD）。
2. **beginBurst 时 `add -A && commit`**：非破坏性快照，一步完成。
3. **undo 时 `reset --hard <hash> && clean -fd`**：一步原子还原。
4. **endBurst 检查 working tree 是否真正有变更**：用 `status --porcelain` 判断，纯读 burst 不产生 checkpoint，避免 stack 膨胀。
5. **类型重命名**：`GitCheckpoint` → `ShadowGitCheckpoint`，`CheckpointRecord.git` → `.shadowGit`，strategy `'git_stash'` → `'shadow_git'`。

### 影响

- Checkpoint 覆盖了 bash 改动（Claude Code 选择放弃的能力），且不再依赖用户 git repo 的任何状态
- 旧 session 的 checkpoint stack 不兼容（字段名变了），但不影响产品——旧 session 不会恢复 checkpoint
- 用户项目里会多出 `.codelord/shadow/` 目录，shadow repo 的 exclude 文件已配置排除 `.codelord/` 自身

---

## 2026-04-08 — 行业对标确认方向未偏，OTel 升级为必做项，进入 M3-S1 冲刺

### 背景

对标 Claude Agent SDK / LangGraph / LangSmith 后确认：codelord 的 roadmap 覆盖了行业框架关注的所有核心能力，且在 trace 三层模型、tool contract 分层、context + skill 哲学上有独立思考。但 eval 是当前最大的落后项。

### 决策

1. **OTel 导出从“明确不做”升级为 M3-S2 必做项**：作为 trace 对外输出的标准通道，支持接入 LangSmith / Langfuse / Arize 等外部可观测性平台。设计原则：codelord 原生 trace schema 始终是主口径，OTel 是有损投影。
2. **M3-S3 dogfooding → eval case 转化工作流强化**：借鉴 LangSmith 的 "trace → dataset" 模式，让每次 dogfooding 发现的问题都能沉淀为可回归测试的 eval case。
3. **进入 M3-S1 冲刺**：用 SWE-bench + Aider Polyglot 获取第一批基线数据，建立 eval 飞轮的起点。

### 影响

M4/M5 的设计决策将由 eval 数据驱动，而不是凭感觉。

---

## 2026-04-08 — M3 Eval 全局研究完成，RoadMap M3 重构

### 背景

M1/M1X/M2 全部关闭后，按大主题推进协议对 M3（Eval）启动全局研究冲刺。研究覆盖了 Anthropic "Demystifying evals for AI agents"、SWE-bench 系列、Aider Polyglot、Eval-driven development 实践（Claude Code / Codex / Bolt / Descript / v0 / AWS DevOps Agent）、LLM-as-Judge 方法论、行业 eval 框架生态。

### 决策

1. **RoadMap M3 从 M3a-M3f 功能分块重构为 M3-S1~S6 递进式冲刺**：原版按功能类型分块（基础设施 / Product Eval / Research Eval / LLM Judge / 实验平台 / RAG Eval），新版按递进交付顺序分步（外部 benchmark bootstrap → eval 基础设施 → 内部 golden set → 研究实验平台 → LLM judge → 全量 benchmark）。每步有明确的"做之前 vs 做之后"对比。
2. **外部 Benchmark Fast Bootstrap 前置（M3-S1）**：先用 SWE-bench Verified + Aider Polyglot 获取第一批基线数据和失败模式分析，再建内部 eval 框架。理由：codelord 当前没有任何量化数据，外部 benchmark 是最快获取基线的方式。
3. **SWE-bench 和 Aider Polyglot 都做**：SWE-bench 测 repo 级理解力和修复能力（更贴近真实使用），Aider Polyglot 测多语言编辑能力（更纯粹的工具链基线）。两者互补。
4. **Eval 立场确立**：deterministic grader 优先、评结果不评路径、eval-driven development 工作流、capability eval 毕业为 regression eval。完整立场写入 `docs/planning/research/eval-position.md`。
5. **M3f (RAG Eval) 移出 M3**：RAG eval 依赖 M4 的 retrieval 基础设施，在 M3 阶段做不了。保留在 M4 的 "Context Quality Eval 接入 M3" 子节中。
6. **从上一轮移交的 4 项任务归入 M3-S5（LLM-as-Judge）**：reasoning quality eval / reasoning regression 套件 / reasoning diagnostics / route quality 指标——这些都需要 LLM judge 能力，放在 deterministic grader 基础打好之后。

### 影响

- M3 的推进顺序从"先建框架"变为"先拿数据"。第一个冲刺的产出是两个外部 benchmark 的基线数字和失败模式分析，而不是 eval 框架本身。
- Eval 失败模式分析将直接影响 M4/M5 的优先级排序——这是 eval-driven development 的第一次落地。
- 每步的"做之前 vs 做之后"格式使冲刺目标更明确，也方便归档时做前后对比。

### 结果

- 立场说明写入 `docs/planning/research/eval-position.md`
- RoadMap M3 section 重构为 M3-S1~S6 递进式冲刺
- 首次按"大主题推进协议"完整走完 Eval 主题的研究→立场流程

---

## 2026-04-08 — M1/M1X/M2 尾部收口冲刺关闭

### 决策

1. **Tool reason 作为一等 schema 参数**：模型在 tool call 时直接声明意图（`reason` 字段），而不是从 thought stream 逆向提取。
2. **从 pi-ai Model 读取 capabilities，不硬编码 matrix**：上游已有的数据不要自己再维护一份。
3. **~~Git stash 作为 checkpoint 策略~~**：已被 shadow git repo 替代（见 2026-04-08 Checkpoint 迁移决策）。
4. **Contracts 与 Router 数据联动**：ToolContract.routeHints.argMisusePatterns 自动生成路由规则。
5. **trace check 永久移除**：v1 设计被 Trace v2 淘汰，直接清除技术债。
6. **Provisional tool call 走 lifecycle**：UI 通过 `tool_call_streaming_*` lifecycle events 驱动，不直接消费 raw stream。

### 结果

M1/M1X/M2 全部关闭。46 项任务，562 → 649 测试。冲刺归档见 `docs/planning/archive/sprints/sprint-m1-m1x-m2-tail-closure.md`。

---

## 2026-04-07 — 质量治理冲刺：interrupt/queue 语义修正 + 渲染架构限制确认

### 背景

dogfooding 暴露了一系列"已有功能的实现方案有问题"的质量缺陷。停下来做了一轮专项治理。过程中两个决策值得记录：

### 决策

1. **Interrupt 语义改写**：interrupt 后 runtime 进入 READY 而非 BLOCKED。去掉 PAUSED 中间态。用户期望的是"中断后直接可以继续交互"，不需要额外的恢复步骤。新增 `OutcomeInterrupted` 类型替代 `OutcomeBlocked(interrupted)`。

2. **Queue 入队语义改写**：queue 中的消息只在 burst 结束时 drain（正常结束或 interrupt），不在 burst 内 step 之间 drain。用户心理模型是"我发的消息在当前任务结束后才被处理"，不是"在下一个安全边界就被偷偷注入上下文"。

3. **F15 Running 时滚动问题延期**：尝试了两种方案（stdout flush 被 Ink 覆盖；Ink `<Static>` 效果差）均失败。根因是 vanilla Ink 的 cursor-up-then-redraw 架构。Claude Code 通过 fork Ink 实现 cell-level diff 来解决。暂时接受限制，记入长期待办。

### 影响

- Interrupt 和 queue 的行为定义从本轮开始稳定，不再是临时方案
- Running 时不能滚动成为已知限制。后续 TUI 升级（fork Ink 或换框架）排入长期 roadmap
- Trace 从分桶存储改为统一时间线，配合三层展示策略（summary/detail/raw），这不是 schema v2（那是下一个 sprint），只是把现有数据重新组织

### 结果

质量治理冲刺完成了 15 项改动（13 完成 + 1 延期 + 1 bonus trace show 优化）。代码基础从"能跑"提升到"设计过"：runtime 有了 manager 层、renderer 有了组件化、trace 有了分层展示、交互有了补全和信息密度。下一个 sprint 可以在更干净的地基上推进 trace schema v2 或其他 milestone。

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
