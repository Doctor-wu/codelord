# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：M1/M1X/M2 尾部收口 — 为 M3 (Eval) 扫清地基
- **目标**：关闭 M3 之前所有 milestone 的剩余缺口，使 agent 基础足够稳固，可以开始搭建 eval 实验平台
- **状态**：进行中

## 完成条件

### 第一批（已全部达成）

- [x] Context Window 管理 v1 可用（token 粗估 + 截断 + system prompt 占比基线）
- [x] 工具成功率有基础计数数据
- [x] Operator console 有最小可发现的命令体验
- [x] trace check 已下掉（代码和 CLI 注册全部清除）
- [x] headless trace 输出可用（eval runner 前置依赖）

### 第二批（剩余任务覆盖）

- [x] Reasoning 提取与投影：raw thought 能提取 intent/why，tool schema reason 参数作为主路径，正则提取作为 fallback
- [x] Reasoning v2 策略：capability 从 pi-ai Model 读取，settled 呈现策略已定义（keep/collapse/hide），tool-scoped rationale 边界明确
- [x] 会话管理闭环：sessions show/prune CLI 可用，元数据含 git branch/title/summary
- [x] Undo 补齐：git-aware checkpoint 可用（stash/hybrid/file_snapshot 三策略），checkpoint 事件进入 trace
- [x] Router v2：任务语义路由（Rule E/F）+ contracts routeHints 联动
- [ ] Trace 补齐：visible_tool_latency 诊断事实 + queue lifecycle 完整建模
- [ ] `pnpm typecheck` 和 `pnpm test` 全部通过

---

## A. M1 剩余

### A1. Context Window 管理 v1 ✅

- [x] Messages 的 token 计数（粗估，按字符数 / 4）
- [x] 达到阈值时的截断策略：保留 system prompt + 最近 N 轮对话
- [x] 记录 system prompt 占总 context 的比例（为后续 budget 控制提供基线）
- [x] System prompt 的 token 数记录，建立预算基线

### A2. 工具成功率轻量追踪 ✅

- [x] 每个工具的 attempts / successes / failures counter
- [x] 重点关注 file_edit 的匹配成功率
- [x] 记录 tool router 的命中规则与后续结果，建立最小 router precision 数据

### A3. 会话管理补齐 ✅

- [x] 会话元数据补齐：git branch、标题、摘要
- [x] 会话管理闭环：`sessions show/prune`

### A4. Undo / Checkpoint 补齐 ✅

- [x] git-aware checkpoint：git repo 中自动 stash，支持 git_stash / hybrid / file_snapshot 三策略
- [x] Checkpoint 信息与 undo 事件接入 trace（checkpoint_created / checkpoint_undone lifecycle events）

### A5. Tool Router 补强 ✅

- [x] 基于任务语义的路由：Rule E（file_read glob → search）+ Rule F（search exact path → file_read）+ contract-based 规则生成
- ~~route quality 指标、trace 对齐、可解释 fallback~~ → 移交 M3
- [x] contracts 与 router 联动：ToolContract.routeHints.argMisusePatterns 自动生成路由规则

---

## B. M1X 剩余

### B1. Event Spine ✅

- [x] `AssistantReasoningState` 从"phase shell"升级为可渲染的 live operator signal：liveProxy 在无 provider thought 时显示 derived proxy，AssistantCard 有 Mode A（rolling viewport）和 Mode B（derived proxy）
- [x] raw `toolcall_start / toolcall_delta / toolcall_end` 进入 projection 主路径：`applyToolCallStart/Delta/End` 从 raw stream 创建 provisional tool call
- [x] 为 provisional tool draft 提供稳定 identity：`prov-raw-{contentIndex}` → `handoffProvisionalToStable` 无缝接管
- [x] 从 raw thought 稳定提取 `intent / why / expectedObservation / uncertainty / risk`（正则启发式提取 + tool schema reason 参数双路径）
- [x] tool reason / blocked reason 与 reasoning state 的高质量投影（displayReason 优先链：model-declared reason > extraction > null）
- ~~reasoning quality eval 与 trace 可观测性~~ → 移交 M3
- [x] 判断哪些 reasoning 该给用户看，哪些只留给系统（resolveReasoningVisibility 按 level 分策略）

### B2. Reasoning v2 ✅

- [x] 从 pi-ai Model 对象直接读取 capabilities（reasoning/contextWindow/maxTokens），不硬编码 matrix
- [x] 定义 settled reasoning 呈现策略：high+thought=keep viewport / high+no thought=collapse / low/medium=collapse / minimal/off=hide
- [x] 明确 tool-scoped rationale 边界：tool schema reason 参数为主路径，正则提取 fallback，不污染 generic thought
- ~~为 reasoning 建立 eval 与 regression 套件~~ → 移交 M3
- ~~把 reasoning diagnostics 接入 trace compare / eval compare~~ → 移交 M3

### B3. Ink Shell & Operator Console ✅

- [x] operator-console 级 progressive disclosure、tool card streaming 体验和 composer polish：breathing animation、phase icons、command suggestions with keyboard nav
- [x] tool batch / tool card 视觉层级打磨：generating/executing/completed/blocked 有独立 icon + color + label，一眼可分
- [x] reasoning 至少支持 operator 可设置的等级 / 预算基线：`/reasoning` 命令 + Footer 显示 level
- [x] operator command 成为一等交互面：有可发现的命令入口
- [x] composer 对 commands 提供最小联想 / 提示
- [x] command 可用性与当前状态的关系清楚

### B4. UX 验收 ✅

- [x] 用户在无 `thinking_*` 的 provider 上，仍能连续感知 agent 处于哪一阶段：liveProxy 连续更新
- [x] 大参数工具的 build 过程能被看见：provisional tool call + progressive args preview + "building…" phase
- [x] TUI 本身成为强正反馈的 operator console：Header/Footer/command system/reasoning viewport/tool cards 全套

---

## C. M2 剩余

### C1. Trace 补齐 ✅ 部分完成

- [x] 下掉 `trace check` 命令及相关代码
- [ ] `visible_tool_latency` 成为一等诊断事实（timestamp 数据在 trace 里有，但无专门诊断指标）
- [ ] queue message lifecycle 完整建模：创建 → 排队 → 注入 → 消费 → 确认 全链路
- [x] 提供 trace-native headless 输出 / replay 视图
- [x] tool 执行耗时实时展示：ToolCallCard 完成时显示 duration

### C2. Redaction & Caching（有外部依赖项）

- ~~对 memory 候选写入复用 redaction~~ → 依赖 M6，跳过
- ~~把 redaction 误伤率纳入 safety eval~~ → 依赖 M8，跳过
- ~~skill fragments cacheability~~ → 依赖 M5，跳过

---

## 明确不做

- M5 依赖项（skill fragments cacheability）
- M6 依赖项（memory redaction）
- M8 依赖项（redaction 误伤率 eval）
- Eval 框架本身（那是 M3 的事）

## 移交 M3 的任务

- reasoning quality eval 与 trace 可观测性（原 B1）
- 为 reasoning 建立 eval 与 regression 套件（原 B2）
- 把 reasoning diagnostics 接入 trace compare / eval compare（原 B2）
- route quality 指标、trace 对齐、可解释 fallback（原 A5）

---
