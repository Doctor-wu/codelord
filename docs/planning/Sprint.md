# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：M3-S1 — 外部 Benchmark Fast Bootstrap
- **目标**：让 codelord 第一次被量化评估。拿到 SWE-bench + Aider Polyglot 的基线分数，建立第一批结构化的失败模式分析，直接指导后续 roadmap 优先级。
- **状态**：🟢 进行中

---

## 为什么是这个冲刺

M0/M1/M1X/M2 全部完成。codelord 已经有了可运行的执行引擎、工具系统、event spine、三层 trace、cost tracking。但从未被量化评估过——所有关于"codelord 表现如何"的判断都是感觉。

**没有 eval 数据，后续 M4（Context Engineering）和 M5（Skill System）的设计决策全部是赌博。**

M3-S1 的价值不是"证明 codelord 有多强"（预期分数会很难看，因为还没有 M4/M5），而是：
1. 建立基线——知道起点在哪
2. 结构化失败模式——知道接下来该做什么
3. 建立 eval 飞轮的起点——让后续每次改动都能被度量

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

### 3. 基线运行

- [x] SWE-bench Verified 跑 5 题子集，记录 pass@1 = 1/5（20%）— 用 Sonnet 4.6
- [ ] SWE-bench Verified 扩大到 20 题子集
- [x] Aider Polyglot Python 20 题 + Rust 30 题基线已有
- [ ] Aider Polyglot 其他语言（Go/JS/C++/Java）基线
- [x] 每个 trial 保留完整 trace 数据

### 4. Trace 粒度修正：从 per-burst 升级为 per-session

> 当前 REPL 模式下每次 burst 都创建独立的 TraceRecorder，一个 5 轮对话的 session 会产生 5 个碎片化 trace。应该是一个 session 一个 trace，包含所有 burst 的完整时间线。

- [ ] TraceRecorder 生命周期从 per-burst 改为 per-session：在 REPL 启动时创建，session 结束时 finalize
- [ ] 每个 burst 作为 trace 内的一个 step group / segment，而非独立 trace
- [ ] `runHeadless()` 保持当前行为（单 burst = 单 trace，对 eval 场景是正确的）
- [ ] trace CLI（`trace list/show`）适配新的 session-level trace 结构
- [ ] 验证：REPL 多轮对话后 `trace list` 只显示一条 session trace，`trace show` 能看到所有 burst

### 5. 失败模式分析

> 这是本冲刺最有价值的产出——不是分数本身，而是"为什么失败"的结构化分析。

- [ ] 对 SWE-bench 失败 case 逐一做 trace 分析（3 个 unresolved + 1 个 empty patch）
- [ ] 对 Polyglot Rust 失败 case 做 trace 分析（rust/decimal 两次失败——缺 trait impl；rust/ocr-numbers 第一次留 todo!）
- [ ] 归类失败模式：
  - context 不够（没看到关键文件/信息）→ 指向 M4
  - tool 选错（用 bash 而不是 file_edit，或反过来）→ 指向 router 改进
  - 推理错误（看到了信息但判断错）→ 指向 M5 skill
  - 环境问题（Docker 兼容、超时、工具执行失败）→ 指向 adapter/infra
  - 模型能力不够 → 记录但暂不处理
- [ ] 基于失败模式分布，输出后续 roadmap 优先级建议

### 6. 基础设施改进（本冲刺期间发现并完成的）

- [x] 包 scope 从 `@agent/*` 迁移到 `@codelord/*`
- [x] evals 升级为顶层目录（`evals/polyglot/`、`evals/swe-bench/`）
- [x] `CodelordConfig` 支持 `baseUrl`（第三方 API 代理），支持 `CODELORD_BASE_URL` 环境变量
- [x] `.env` + `--env-file` 机制：本地用 `.env` 配置，CI 用 GitHub Secrets
- [x] `resolveApiKey` 优先级修正：显式 API key 优先于 OAuth（修复 Docker 容器内无法 OAuth 的问题）
- [x] `coding-agent/src/index.ts` 移除副作用 `import './cli/index.js'`（修复 evals 包 import 时意外启动 CLI）
- [x] `coding-agent` 导出 `resolveModel` 和 `resolveApiKey` 到 public API

---

## 初步基线数据（2026-04-09）

| Benchmark | Model | 子集 | 指标 | 值 |
|-----------|-------|------|------|----|
| Polyglot Python | Sonnet 4.6 | 20 题 | pass@1 | 100% |
| Polyglot Rust | Sonnet 4.6 | 30 题 | pass@1 / pass@2 | 93.3% / 96.7% |
| SWE-bench Verified | Sonnet 4.6 | 5 题 | pass@1 | 20%（1/5）|

**关键观察：** Polyglot 几乎满分说明 Sonnet 4.6 的裸模型编码能力碾压单文件编程题，scaffold 不构成瓶颈。SWE-bench 20% 才是真正反映 scaffold 能力的基线——没有 M4（Context Engineering）和 M5（Skill），agent 在真实 codebase 上的表现符合预期。

---

## 不在本冲刺范围

- eval 框架（M3-S2）— 本冲刺用一次性脚本跑，S2 再迁移为正式框架
- 内部 golden set（M3-S3）— 先用外部 benchmark 建基线
- LLM-as-judge（M3-S5）— 先用 deterministic 判定
- OTel 导出（M3-S2）— 等 eval 基础设施阶段
- 全量 benchmark 运行（M3-S6）— 先子集验证

---

## 完成条件

1. 两个 adapter 端到端可用（SWE-bench + Aider Polyglot）
2. 有至少一组基线数字（哪怕很难看）
3. 有一份结构化的失败模式分析文档
4. 有一份基于失败模式的后续优先级建议

---

## 预期风险

- **SWE-bench Docker 环境复杂度**：可能需要处理依赖安装、Python 版本、测试框架差异等环境问题。如果 adapter 搭建时间超预期，可以先只跑 Aider Polyglot（环境更简单）。
- **分数很难看**：完全预期且已验证。SWE-bench pass@1 = 20%（5 题样本），符合预期范围。Polyglot 接近满分但这反映模型能力而非 scaffold 能力。
- **headless 模式可能有未发现的 bug**：第一次大规模使用 `runHeadless()`，可能暴露之前 dogfooding 没碰到的问题。

---

## 行业对标参考

> 来自 roadmap 与行业框架对比分析（2026-04-08）

- Claude Agent SDK 无内置 eval，可接 promptfoo
- LangGraph 依赖 LangSmith 做 eval + trace + compare
- codelord 的三层 trace 模型是独特优势，但 eval 是当前最大的落后项
- Agent scaffold 对 benchmark 分数的影响可能大于模型选择——同一模型不同 scaffold 可以产生 22+ 分差距
- 后续 M3-S2 将包含 OTel 兼容导出，作为 trace 对外输出的标准通道（可接 LangSmith / Langfuse / Arize）
- M3-S3 的 dogfooding → eval case 转化工作流借鉴了 LangSmith 的 "trace → dataset" 模式
