# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：M3-S1 — 外部 Benchmark Fast Bootstrap
- **目标**：让 codelord 第一次被量化评估。拿到 SWE-bench + Aider Polyglot + BrowseComp + Terminal-Bench 2.0 的基线分数，建立第一批结构化的失败模式分析，直接指导后续 roadmap 优先级。codelord 的 coding-agent 本质上是 general agent，eval 必须覆盖 coding / browsing / terminal 三个能力面。
- **状态**：🟢 进行中

---

## 为什么是这个冲刺

M0/M1/M1X/M2 全部完成。codelord 已经有了可运行的执行引擎、工具系统、event spine、三层 trace、cost tracking。但从未被量化评估过——所有关于"codelord 表现如何"的判断都是感觉。

**没有 eval 数据，后续 M4（Context Engineering）和 M5（Skill System）的设计决策全部是赌博。**

M3-S1 的价值不是"证明 codelord 有多强"（预期分数会很难看，因为还没有 M4/M5），而是：
1. 建立基线——知道起点在哪
2. 结构化失败模式——知道接下来该做什么
3. 建立 eval 飞轮的起点——让后续每次改动都能被度量
4. 覆盖 general agent 的完整能力面——不只测 coding

---

## 前置依赖（全部已满足）

- [x] `runHeadless()` — eval runner 的 programmatic 入口，零 TUI 依赖
- [x] Tool stats tracker — per-tool attempts/successes/failures
- [x] Trace v2 — 三层模型，eval 的 transcript 数据源
- [x] Tool schema reason — 模型声明 tool call 意图
- [x] Model capabilities — 从 pi-ai Model 读取

---

## 具体任务

### 1. SWE-bench Adapter ✅

> 让 codelord 能在 SWE-bench 的 Docker 环境里跑任务，产出可被 SWE-bench eval harness 评判的 patch。

- [x] 研究 SWE-bench Verified 的评判流程：Docker 环境规范、patch 格式、eval harness 调用方式
- [x] 实现 adapter：`runHeadless()` → repo checkout → agent 解题 → `git diff` 提取 patch → predictions JSONL
- [x] Docker 化运行环境（`evals/swe-bench/`，Node 22 + git + Python 3）
- [x] 在 5 题上端到端验证 adapter 能跑通：4 题产出 patch，1 题空 patch
- [x] 接入 SWE-bench eval harness（Modal 云端评估）：5 题中 1 题 resolved（pass@1 = 20%）

### 2. Aider Polyglot Adapter ✅

> 让 codelord 能在 Aider Polyglot（Exercism）环境里跑任务，用测试通过率评判。

- [x] 研究 Aider Polyglot 的评判流程：Exercism 项目结构、测试运行方式、pass_rate 计算
- [x] 实现 adapter：`runHeadless()` → Exercism 项目环境 → 代码修改 → 测试运行评判
- [x] Docker 化运行环境（`evals/polyglot/`，Node 22 + 6 种语言工具链）
- [x] 在 1 题上端到端验证 adapter 能跑通（Python affine-cipher: PASS）
- [x] Python 20 题子集：pass@1 = 20/20（100%），Rust 30 题子集：pass@1 = 28/30（93.3%），pass@2 = 29/30（96.7%）

### 3. BrowseComp Adapter ✅

> 让 codelord 能在 BrowseComp 上跑任务，测试 general agent 的 web browsing + multi-hop reasoning 能力。
> BrowseComp 是 OpenAI 出品的 benchmark，1,266 题，答案短且唯一，"easy to verify, hard to solve"。

- [x] 研究 BrowseComp 的评判流程：数据集格式（OpenAI 公开 blob，CSV 加密）、grader 逻辑（LLM-as-judge）、Inspect Evals 实现
- [x] 实现 adapter：`runHeadless()` → web_search + web_fetch 工具 → 短答案提取 → LLM-as-judge grading
- [x] 补齐 web 工具：web_search（Tavily API）+ web_fetch（原生 fetch + turndown HTML→markdown）
- [x] 在 5 题上端到端验证 adapter 能跑通：pass@1 = 2/5（40%），3 个失败均为代理 API 超时（非能力问题）

### 4. Terminal-Bench 2.0 Adapter ✅

> 让 codelord 能在 Terminal-Bench 2.0 上跑任务，测试 general agent 的终端任务能力。
> Terminal-Bench 2.0 有 89 题，涵盖 ML 训练、Linux 编译、安全漏洞修复等真实终端任务，通过 Harbor harness 在 Docker 容器中执行。

- [x] 研究 Terminal-Bench 2.0 的评判流程：Harbor harness（Python 3.12+，`uv`）、Docker 任务格式、BaseAgent / BaseInstalledAgent 接口
- [x] 前置：CLI headless 模式增强（`codelord -p "prompt"` + stdin 管道 + streaming 进度）—— 见任务 9 ✅
- [x] 实现 Harbor BaseInstalledAgent adapter：在容器内安装 Node + codelord，用 `codelord -p` 跑任务
- [x] 在 3 题上端到端验证：1/3 成功（resolution rate = 33%）

### 5. 基线运行

- [x] SWE-bench Verified 跑 5 题子集，记录 pass@1 = 1/5（20%）— 用 Sonnet 4.6
- [ ] SWE-bench Verified 扩大到 20 题子集
- [x] Aider Polyglot Python 20 题 + Rust 30 题基线已有
- [ ] Aider Polyglot 其他语言（Go/JS/C++/Java）基线
- [ ] BrowseComp 跑 50 题子集，获取第一个 accuracy 基线
- [ ] Terminal-Bench 2.0 跑 20 题子集，获取第一个 task resolution rate 基线
- [x] 每个 trial 保留完整 trace 数据

### 6. Trace 粒度修正：从 per-burst 升级为 per-session ✅

> REPL 模式下 trace 已从 per-burst 升级为 per-session。一个 session 产生一个 trace 文件，包含所有 burst 的 segments。

- [x] TraceRecorder 生命周期从 per-burst 改为 per-session：在 REPL 启动时创建，session 结束时 finalize
- [x] 每个 burst 作为 trace 内的一个 segment（`TraceSegment`），而非独立 trace
- [x] `runHeadless()` 保持当前行为（单 burst = 单 trace，对 eval 场景是正确的）
- [x] trace CLI（`trace list/show`）适配 session-level trace 结构，summary 模式显示 segment 分隔线
- [x] 验证：REPL 多轮对话后 `trace list` 只显示一条 session trace

### 7. 失败模式分析 ✅

> 完整分析文档见 [docs/planning/research/failure-analysis-m3s1.md](../research/failure-analysis-m3s1.md)

- [x] 对 SWE-bench 失败 case 逐一分析（4/5 失败均归因于 context 不足——大型 repo 中无法定位和理解相关代码）
- [x] 对 Polyglot Rust 失败 case 分析（rust/decimal 缺 trait impl → 推理错误；rust/ocr-numbers 留 todo → 执行不完整）
- [x] 对 BrowseComp 失败 case 做 trace 分析（3/5 均为代理 API 超时，非能力问题）
- [x] 对 Terminal-Bench 失败 case 分析（1 安装超时 + 1 任务复杂度超出当前能力）
- [x] 归类失败模式：context 不够 36% → M4 | 推理错误 18% → M5 | 执行不完整 9% → M5 | 环境问题 36% → infra
- [x] 后续 roadmap 优先级建议：M4 Context Engineering > M5 Skill System > Infra 优化

### 8. 基础设施改进（本冲刺期间发现并完成的）

- [x] 包 scope 从 `@agent/*` 迁移到 `@codelord/*`
- [x] evals 升级为顶层目录（`evals/polyglot/`、`evals/swe-bench/`、`evals/browsecomp/`）
- [x] `CodelordConfig` 支持 `baseUrl`（第三方 API 代理），支持 `CODELORD_BASE_URL` 环境变量
- [x] `.env` + `--env-file` 机制：本地用 `.env` 配置，CI 用 GitHub Secrets
- [x] `resolveApiKey` 优先级修正：显式 API key 优先于 OAuth（修复 Docker 容器内无法 OAuth 的问题）
- [x] `coding-agent/src/index.ts` 移除副作用 `import './cli/index.js'`（修复 evals 包 import 时意外启动 CLI）
- [x] `coding-agent` 导出 `resolveModel` 和 `resolveApiKey` 到 public API
- [x] ToolPlugin 可插拔工具架构：`@codelord/tools` 新包，ToolPlugin 接口，6 个 core 工具迁移为 plugin，ToolSafetyPolicy 动态 riskMap
- [x] web_search 工具（Tavily API，optional plugin，需要 TAVILY_API_KEY）
- [x] web_fetch 工具（原生 fetch + turndown HTML→markdown，optional plugin，无需 API key）
- [x] bash contract + system prompt 修正：web tools 可用时禁止用 bash curl/wget，避免 agent 绕过专用工具
- [x] `CodelordConfig` 新增 `tools` 可选字段，支持 per-tool 启用/禁用和配置透传

### 9. CLI Headless 模式增强 ✅

> `codelord -p` headless 模式已对齐 Claude Code / Codex 的 CLI 体验。

- [x] `-p` flag 模式：`codelord -p "prompt"` 作为 headless 入口
- [x] stdin 管道支持：`echo "fix this" | codelord -p`
- [x] streaming 进度输出：运行中显示 step / tool call 进度
- [x] `--output-format text|json|stream-json` 输出格式控制
- [x] 退出码语义：success=0，error=1，interrupted/blocked=2
- [x] 保留 `codelord run` subcommand 向后兼容

---

## 初步基线数据（2026-04-09 ~ 04-10）

| Benchmark | Model | 子集 | 指标 | 值 |
|-----------|-------|------|------|----|
| Polyglot Python | Sonnet 4.6 | 20 题 | pass@1 | 100% |
| Polyglot Rust | Sonnet 4.6 | 30 题 | pass@1 / pass@2 | 93.3% / 96.7% |
| SWE-bench Verified | Sonnet 4.6 | 5 题 | pass@1 | 20%（1/5）|
| BrowseComp | Sonnet 4.6 | 5 题 | accuracy | 40%（2/5）|
| Terminal-Bench 2.0 | Sonnet 4.6 | 3 题 | resolution rate | 33%（1/3）|

**关键观察：**
- Polyglot 几乎满分说明 Sonnet 4.6 的裸模型编码能力碾压单文件编程题，scaffold 不构成瓶颈。
- SWE-bench 20% 才是真正反映 scaffold 能力的基线——没有 M4（Context Engineering）和 M5（Skill），agent 在真实 codebase 上的表现符合预期。
- BrowseComp 40% 的 3 个失败均为代理 API 超时（非能力问题）。使用 web_search + web_fetch 专用工具后，单题成本从 $0.73 降至 $0.10（比 bash curl 方案提升 7x）。reasoning=low 消除了 thinking 超时失败模式，提速 7 倍、token 降低 8 倍。
- Terminal-Bench 2.0 通过 Harbor 框架跑通，1/3 成功。失败模式：1 个 AgentSetupTimeoutError（Node.js 安装超时）、1 个 NonZeroAgentExitCodeError（任务执行失败）。安装环节是当前主要瓶颈。

---

## 不在本冲刺范围

- eval 框架（M3-S2）— 本冲刺用一次性脚本跑，S2 再迁移为正式框架
- 内部 golden set（M3-S3）— 先用外部 benchmark 建基线
- LLM-as-judge（M3-S5）— 先用 deterministic 判定
- OTel 导出（M3-S2）— 等 eval 基础设施阶段
- 全量 benchmark 运行（M3-S6）— 先子集验证

---

## 完成条件

1. 四个 adapter 端到端可用（SWE-bench + Aider Polyglot + BrowseComp + Terminal-Bench 2.0）
2. 四套 benchmark 都有至少一组基线数字（哪怕很难看）
3. 有一份结构化的失败模式分析文档，覆盖 coding / browsing / terminal 三个能力面
4. 有一份基于失败模式的后续 roadmap 优先级建议

---

## 预期风险

- **SWE-bench Docker 环境复杂度**：可能需要处理依赖安装、Python 版本、测试框架差异等环境问题。如果 adapter 搭建时间超预期，可以先只跑 Aider Polyglot（环境更简单）。
- **分数很难看**：完全预期且已验证。SWE-bench pass@1 = 20%（5 题样本），符合预期范围。Polyglot 接近满分但这反映模型能力而非 scaffold 能力。
- **headless 模式可能有未发现的 bug**：第一次大规模使用 `runHeadless()`，可能暴露之前 dogfooding 没碰到的问题。
- **BrowseComp 需要 web 工具**：codelord 当前可能缺少 web search/fetch 工具。如果补工具的工作量过大，BrowseComp adapter 可以延后，但至少要完成研究和 adapter 设计。
- **Terminal-Bench 2.0 的 Harbor harness 学习曲线**：需要理解 Harbor 框架的 agent 接口（支持 Claude Code / Codex CLI / OpenHands 等），可能需要实现 codelord 的 Harbor adapter。
- **BrowseComp 成本**：单次全量运行可能数百美元（参考 o1 约 $350-400/run），子集运行时注意成本控制。

---

## 行业对标参考

> 来自 roadmap 与行业框架对比分析（2026-04-08）

- Claude Agent SDK 无内置 eval，可接 promptfoo
- LangGraph 依赖 LangSmith 做 eval + trace + compare
- codelord 的三层 trace 模型是独特优势，但 eval 是当前最大的落后项
- Agent scaffold 对 benchmark 分数的影响可能大于模型选择——同一模型不同 scaffold 可以产生 22+ 分差距
- 后续 M3-S2 将包含 OTel 兼容导出，作为 trace 对外输出的标准通道（可接 LangSmith / Langfuse / Arize）
- M3-S3 的 dogfooding → eval case 转化工作流借鉴了 LangSmith 的 "trace → dataset" 模式
