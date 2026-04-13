# Codelord — M3-S2 Eval 规范化 + CI + 成绩看板（已归档）

> 归档时间：2026-04-13

---

## 冲刺身份

- **阶段**：M3-S2 — Eval 规范化 + CI + 成绩看板
- **目标**：把 M3-S1 的四个 eval adapter 从本地手动脚本升级为 CI 一键触发、结果结构化、成绩看板自动更新的完整闭环
- **状态**：✅ 已完成

---

## Before / After

**Before（冲刺开始时）**：
- 四个 eval adapter 是 M3-S1 快速搭建的一次性脚本，只能本地跑
- 结果 schema 各不相同（Polyglot 的 `BenchmarkSummary`、BrowseComp 的 `BrowseCompSummary`、SWE-bench 自己的 JSON、Terminal-Bench 的 Harbor `result.json`）
- 没有统一的入口 / 输出格式 / 退出码 / 错误处理
- 分数散落在对话记录和 Sprint 文档里，没有固定展示位置
- 无 CI，无 `.github/` 目录
- BrowseComp 无 Docker、无 scripts

**After（冲刺关闭时）**：
- 四个 adapter 遵循统一 `EvalResult` schema，退出码 0/1/2，错误结构化
- 每个 adapter 有标准 `scripts/run.sh`，接受统一环境变量
- 四个 GitHub Actions workflow（workflow_dispatch），可配置子集/全量模式
- 每次 CI 运行的 Job Summary 直接展示当次 eval 结果（Markdown 表格），不用下载 artifact
- `results.json` artifact 可下载供离线分析
- `docs/scores.md` 成绩看板展示四个 benchmark 完整数据（最新分数 + 历史趋势 + CI run 链接）
- Full mode 跑完后 CI 自动提 PR 更新成绩看板
- 整个闭环不需要本地操作

---

## 上一个冲刺回顾

CORE-R1（Event System Refactor）已关闭。详见 [归档](./archive/sprints/sprint-core-r1-event-refactor.md)。

CORE-R1 遗留项（不在本 sprint 范围）：
- `onLifecycleEvent` 仍保留（非 Pipeable 事件的消费通道），记在 RoadMap CORE-R1 section

---

## Task 分解

### T1: 统一结果 schema + Polyglot 规范化（样板）

**状态**：✅ 已完成（2026-04-13）

**目标**：建立 `evals/shared/` 公共基础，以 Polyglot 为第一个样板完成完整规范化。

**具体改动**：

1. 新建 `evals/shared/types.ts` — 统一 `EvalResult` schema：
   ```
   {
     benchmark: string           // "polyglot" | "swe-bench" | "browsecomp" | "terminal-bench"
     model: string               // e.g. "claude-sonnet-4-6"
     provider: string            // e.g. "anthropic"
     reasoningLevel: string      // e.g. "low" | "medium" | "high"
     timestamp: string           // ISO 8601
     config: {                   // 运行配置
       mode: "subset" | "full"
       limit?: number
       languages?: string[]      // polyglot 专用
       ... benchmark-specific
     }
     metrics: {                  // 核心指标（benchmark-specific）
       [key: string]: number
     }
     cases: Array<{              // 逐 case 结果
       id: string
       passed: boolean
       durationMs: number
       error?: string
       metadata?: Record<string, unknown>  // benchmark-specific 扩展
     }>
     errors?: Array<{            // 运行级错误
       type: string
       message: string
     }>
     durationMs: number          // 总耗时
   }
   ```
2. 新建 `evals/shared/result-writer.ts` — 统一结果写入：写 JSON 文件 + 打印终端 summary + 退出码（0=全部通过, 1=有失败, 2=运行错误）
3. 新建 `evals/shared/summary-renderer.ts` — 把 `EvalResult` 渲染为 Markdown 表格，供 CI Job Summary 和成绩看板复用。包含：
   - 总览行（benchmark / model / 核心指标 / 耗时 / 时间戳）
   - 逐 case 结果表（id / passed / duration / error）
   - benchmark-specific 扩展区（如 Polyglot 的 by-language breakdown、BrowseComp 的 confidence 分布）
4. 改造 `evals/polyglot/src/runners/run-polyglot.ts`：输出改为标准 `EvalResult`，退出码改为 0/1/2，超时和 API 错误结构化捕获
5. 更新 `evals/polyglot/scripts/run.sh`：统一接受 `CODELORD_PROVIDER / CODELORD_MODEL / CODELORD_API_KEY / CODELORD_BASE_URL / CODELORD_REASONING_LEVEL / LIMIT / LANGUAGES / OUTPUT_DIR` 环境变量

**改动文件**：新建 `evals/shared/*`，改 `evals/polyglot/src/runners/run-polyglot.ts`，改 `evals/polyglot/scripts/run.sh`，改 `evals/polyglot/src/types.ts`（保留内部类型，但最终输出走 shared schema）

**验证**：
- `cd evals/polyglot && pnpm polyglot --limit 1` 输出标准 `EvalResult` JSON
- 退出码正确（有失败 case → 1）
- `summary-renderer` 对 Polyglot 结果渲染出可读 Markdown

---

### T2: SWE-bench 规范化

**状态**：✅ 已完成（2026-04-13，依赖 T1）

**目标**：SWE-bench adapter 改造为标准 `EvalResult` 输出。

**具体改动**：
1. `evals/swe-bench/src/runners/run-swe-bench.ts`：输出改为标准 `EvalResult`
   - `metrics` 包含：`pass_rate`（pass@1）
   - `cases[].metadata` 包含 SWE-bench 特有字段：`instance_id`, `repo`, `patch_applied`
2. `evals/swe-bench/scripts/run.sh`：统一环境变量接口
3. `summary-renderer` 的 SWE-bench 扩展区：按 repo 分组的通过率

**改动文件**：`evals/swe-bench/src/runners/run-swe-bench.ts`，`evals/swe-bench/scripts/run.sh`

**验证**：Docker 内 `pnpm solve --limit 1` 输出标准 `EvalResult` JSON

---

### T3: BrowseComp 规范化 + Docker 化

**状态**：✅ 已完成（2026-04-13，依赖 T1）

**目标**：BrowseComp 补齐 Docker 和 scripts，改造为标准输出。

**具体改动**：
1. `evals/browsecomp/src/runners/run-browsecomp.ts`：输出改为标准 `EvalResult`
   - `metrics` 包含：`accuracy`, `avg_confidence`, `avg_duration_ms`
   - `cases[].metadata` 包含：`confidence`, `grade`, `grader_reasoning`
2. 新建 `evals/browsecomp/scripts/run.sh`：统一环境变量（额外需要 `TAVILY_API_KEY`、`GRADER_*` 系列）
3. 新建 `evals/browsecomp/Dockerfile` + `scripts/docker-build.sh` + `scripts/docker-run.sh` + `.dockerignore`
4. `summary-renderer` 的 BrowseComp 扩展区：grade 分布（CORRECT/INCORRECT/ERROR）+ confidence 分布

**改动文件**：改 `evals/browsecomp/src/runners/run-browsecomp.ts`，新建 `evals/browsecomp/scripts/*`，新建 `evals/browsecomp/Dockerfile`，新建 `evals/browsecomp/.dockerignore`

**验证**：`cd evals/browsecomp && pnpm solve --limit 1` 输出标准 `EvalResult` JSON

---

### T4: Terminal-Bench 规范化

**状态**：✅ 已完成（2026-04-13，依赖 T1）

**目标**：Terminal-Bench 的 Harbor 输出转换为标准 `EvalResult`。

**具体改动**：
1. 新建 `evals/terminal-bench/scripts/convert-results.ts`：
   - 读取 Harbor `result.json`（结构：`{ stats.evals.*.metrics, stats.evals.*.exception_stats, trial_results }`) → 转换为标准 `EvalResult`
   - `metrics` 包含：`resolution_rate`, `n_trials`, `n_errors`
   - `cases[]` 从 `trial_results` + job 子目录推断
   - 需要处理 Harbor 的错误分类（`AgentSetupTimeoutError`, `CancelledError` 等）
2. 更新 `evals/terminal-bench/scripts/run.sh`：跑完 Harbor 后自动调用 `convert-results.ts` 输出标准 JSON
3. `summary-renderer` 的 Terminal-Bench 扩展区：错误类型分布
4. 新建 `evals/terminal-bench/package.json`（当前没有，需要用来跑 tsx convert-results.ts）

**改动文件**：新建 `evals/terminal-bench/scripts/convert-results.ts`，改 `evals/terminal-bench/scripts/run.sh`，新建 `evals/terminal-bench/package.json`（如需）

**验证**：对现有 `jobs/2026-04-13__15-54-40/result.json` 运行 convert，输出标准 `EvalResult`

---

### T5: GitHub Actions 基础 + 四个 eval workflow

**状态**：✅ 已完成（2026-04-13，依赖 T1-T4）

**目标**：从零搭建 CI，四个 eval 都可以在 GitHub Actions 中 dispatch 运行。

**具体改动**：

1. `.github/actions/setup-codelord/action.yml` — 可复用 composite action：
   - checkout
   - setup Node.js 22
   - setup pnpm
   - `pnpm install`
   - `pnpm build`

2. `.github/workflows/eval-polyglot.yml`：
   - trigger: `workflow_dispatch`
   - inputs: `languages`（默认 all）, `limit`（默认空=全量）, `mode`（subset/full）
   - steps: setup-codelord → clone polyglot-benchmark repo → docker build → docker run → upload artifact → **write Job Summary**
   - Job Summary：调用 `summary-renderer` 渲染 Markdown → 写入 `$GITHUB_STEP_SUMMARY`
   - artifact: `results.json`

3. `.github/workflows/eval-swe-bench.yml`：
   - trigger: `workflow_dispatch`
   - inputs: `limit`, `mode`
   - steps: setup-codelord → docker build → docker run → upload artifact → **write Job Summary**
   - 注意：SWE-bench 需要 git clone 目标 repo，可能耗时较长

4. `.github/workflows/eval-browsecomp.yml`：
   - trigger: `workflow_dispatch`
   - inputs: `limit`, `mode`
   - secrets: `TAVILY_API_KEY`, `GRADER_API_KEY`（如果 grader 用不同 provider）
   - steps: setup-codelord → docker build → docker run → upload artifact → **write Job Summary**

5. `.github/workflows/eval-terminal-bench.yml`：
   - trigger: `workflow_dispatch`
   - inputs: `limit`, `mode`
   - steps: setup-codelord → build codelord bundle → `pip install harbor` → harbor run → convert results → upload artifact → **write Job Summary**
  - 注意：需要 Docker（GitHub ubuntu-latest 自带）、Python 3.12+（Harbor 当前已不支持 3.11）

6. `docs/ci/SECRETS.md`：Secrets 配置文档，列出每个 workflow 需要的 secrets 及获取方式

**Job Summary 格式（所有 workflow 统一）**：
```markdown
## 🧪 Eval Results: <benchmark>

| Metric | Value |
|--------|-------|
| Model | claude-sonnet-4-6 |
| Mode | subset (limit=5) |
| Pass Rate | 80.0% (4/5) |
| Duration | 3m 42s |
| Timestamp | 2026-04-15T10:30:00Z |

### Cases
| ID | Passed | Duration | Error |
|----|--------|----------|-------|
| exercise-1 | ✅ | 12.3s | |
| exercise-2 | ❌ | 45.1s | timeout |
| ... | ... | ... | ... |

### <Benchmark-specific section>
(Polyglot: by-language breakdown; BrowseComp: grade distribution; etc.)
```

**改动文件**：新建 `.github/actions/setup-codelord/action.yml`，新建 `.github/workflows/eval-*.yml` × 4，新建 `docs/ci/SECRETS.md`

**验证**：
- 在 GitHub Actions 页面 dispatch `eval-polyglot` with limit=1 → 跑完 → Job Summary 展示结果 → artifact 可下载
- 四个 workflow 都能成功 dispatch 和运行

---

### T6: 成绩看板 + Auto-PR

**状态**：✅ 已完成（2026-04-13，依赖 T5）

**目标**：建立持久化成绩看板，CI full mode 跑完自动更新。

**具体改动**：

1. `docs/scores.md` — 完整成绩看板：
   - **总览表**：四个 benchmark 的最新分数、模型、日期、子集大小、CI run 链接
   - **各 benchmark 详情 section**：
     - 最新一次运行的完整指标
     - 历史趋势表（最近 10 次运行：日期、模型、指标、mode、CI link）
     - 基线数据来源标注（M3-S1 手动 vs CI 自动）
   - **更新日志**：最近 N 次更新记录
   - **上次更新时间戳**

2. `scripts/update-scores.ts`：
   - 输入：`--benchmark <name> --results <path> --run-url <github_actions_run_url>`
   - 逻辑：读取当前 `docs/scores.md` → 解析结构 → 合并新结果到对应 benchmark section → 更新总览表 → 重新生成整个文件
   - 初始数据：把 M3-S1 的基线数据作为第一批历史记录写入

3. `.github/workflows/update-scores.yml`：
   - trigger: `workflow_run`（当 `eval-*` workflow 在 full mode 完成时触发）或 `workflow_call`
   - steps: checkout → download results artifact from triggering workflow → run `update-scores.ts` → create PR
   - 使用 `peter-evans/create-pull-request` action
   - PR 标题：`[eval] Update <benchmark> scores: <primary_metric> = <value>`
   - PR body：包含 Job Summary 的精简版

**改动文件**：新建 `docs/scores.md`，新建 `scripts/update-scores.ts`，新建 `.github/workflows/update-scores.yml`

**验证**：
- 手动运行 `scripts/update-scores.ts` 传入 M3-S1 基线数据 → `docs/scores.md` 生成正确
- dispatch eval-polyglot full mode → 跑完 → 自动提 PR → PR 内容正确

---

## 依赖关系

```
T1 (shared schema + polyglot 样板)
 ├── T2 (swe-bench 规范化)
 ├── T3 (browsecomp 规范化 + docker)
 └── T4 (terminal-bench 规范化)
      └── T5 (github actions × 4 + job summary)
           └── T6 (成绩看板 + auto-PR)
```

T2/T3/T4 之间无依赖，可按任意顺序推进。

---

## 完成标志

1. ✅ 四个 adapter 输出遵循统一 `EvalResult` schema
2. ✅ 退出码统一：0=全通过, 1=有失败, 2=运行错误
3. ✅ GitHub Actions 中 dispatch 任一 eval workflow → CI 跑完 → **Job Summary 直接展示当次结果**
4. ✅ `results.json` artifact 可下载
5. ✅ Full mode 跑完后 CI 自动提 PR 更新 `docs/scores.md`
6. ✅ `docs/scores.md` 展示四个 benchmark 的完整成绩（最新 + 历史 + CI 链接）
7. ✅ 整个闭环不需要本地操作

---

## 前置确认

- [ ] repo 已推到 GitHub 且 Actions 已启用
- [ ] GitHub repo Settings → Actions → 允许 workflow 创建 PR（`contents: write` + `pull-requests: write`）
- [ ] GitHub Secrets 已配置：`CODELORD_API_KEY` / `OPENAI_API_KEY` / `TAVILY_API_KEY` / `CODELORD_BASE_URL`（如需）

---

## 不在本 sprint 范围

- `codelord eval run/compare` CLI → 推迟到 M3-S3
- eval case 标准格式 / deterministic grader 框架 → 推迟到 M3-S3
- OTel 导出 → 推迟到真正需要接外部平台时
- CORE-R1 遗留项（`onLifecycleEvent`）→ 记在 RoadMap
