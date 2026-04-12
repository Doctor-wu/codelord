# Sprint Archive: M3-S1 — 外部 Benchmark Fast Bootstrap

> 归档时间：2026-04-12
> 状态：✅ 已关闭

---

## Before / After

**Before（冲刺开始时）：**
- codelord 从未被量化评估过
- 没有任何 benchmark adapter
- 没有 web search/fetch 工具
- 工具系统硬编码在 agent-core
- headless CLI 只有 `codelord run` subcommand
- trace 是 per-burst 碎片化的

**After（冲刺关闭时）：**
- 四套外部 benchmark 端到端可用：SWE-bench / Aider Polyglot / BrowseComp / Terminal-Bench 2.0
- 第一批基线数据：Polyglot 100%/93.3% | SWE-bench 20% | BrowseComp 40% | Terminal-Bench 33%
- 结构化失败模式分析：context 不够 36% → M4 | 推理错误 27% → M5 | 环境问题 36% → infra
- `@codelord/tools` 可插拔工具包 + web_search(Tavily) + web_fetch(原生 fetch)
- `codelord -p` headless CLI 对齐 Claude Code / Codex
- trace per-session（TraceSegment）
- 后续 roadmap 优先级明确：M4 > M5 > Infra

---

## 基线数据

| Benchmark | Model | 子集 | 指标 | 值 |
|-----------|-------|------|------|----|
| Polyglot Python | Sonnet 4.6 | 20 题 | pass@1 | 100% |
| Polyglot Rust | Sonnet 4.6 | 30 题 | pass@1 / pass@2 | 93.3% / 96.7% |
| SWE-bench Verified | Sonnet 4.6 | 5 题 | pass@1 | 20%（1/5）|
| BrowseComp | Sonnet 4.6 | 5 题 | accuracy | 40%（2/5）|
| Terminal-Bench 2.0 | Sonnet 4.6 | 3 题 | resolution rate | 33%（1/3）|

---

## Top 3 Unknown Unknowns

1. **Tool 选择偏好比预期更强**：agent 在有 web_search 工具的情况下仍然偏好 bash curl，需要在 bash contract + system prompt 中显式禁止才能矫正。Tool contract 的引导力不是"建议"级别，而是"必须显式阻断"级别。
2. **代理 API 超时是 BrowseComp 的主要失败源**：3/5 失败不是能力问题而是基础设施问题。reasoning level 对超时有巨大影响（high→low 消除了首次 thinking 超时）。eval 的"假阴性"比预期严重。
3. **Terminal-Bench 的容器内安装是非平凡问题**：Node.js monorepo 打包为独立可执行件的工程复杂度超预期。`pnpm deploy` + nvm install 的组合在容器内安装耗时可达 6 分钟，容易触发 Harbor 的 360 秒 setup timeout。

---

## 未完成但延期的基线运行

以下基线运行在本冲刺中未完成，延期到 M3-S6（全量运行）：
- SWE-bench Verified 扩大到 20 题子集
- Aider Polyglot 其他语言（Go/JS/C++/Java）基线
- BrowseComp 跑 50 题子集
- Terminal-Bench 2.0 跑 20 题子集

这些不影响冲刺完成条件——四套 benchmark 都已有基线数字和失败模式分析。

---

## 关键文件

- 失败模式分析：`docs/planning/research/failure-analysis-m3s1.md`
- Eval 立场文件：`docs/planning/research/eval-position.md`
- SWE-bench adapter：`evals/swe-bench/`
- Polyglot adapter：`evals/polyglot/`
- BrowseComp adapter：`evals/browsecomp/`
- Terminal-Bench adapter：`evals/terminal-bench/`
- 可插拔工具包：`packages/tools/`
