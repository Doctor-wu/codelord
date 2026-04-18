# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：M3-S3 — Scaffold Fingerprint + 差分地基
- **目标**：建立差分 eval 的物理前提。每次 eval run 绑定 **Scaffold / Model / Harness / Dataset** 四轴 fingerprint，四轴以命名 profile 形式可版本化，`codelord eval compare` 在实现层硬门禁"四轴差超过一项则拒绝结论"。
- **状态**：🟢 进行中
- **启动日期**：2026-04-17

---

## Before / After

**Before（冲刺开始时）**：

- 一次 eval run 只能回答"跑出了 X 分"，结果 JSON 里没有任何结构化记录说明是在哪个 scaffold 配置、哪个模型、哪个 harness、哪个 dataset 子集下跑出来的。
- 两次 run 的分数差距无法归因：既可能是 scaffold 改了，也可能是模型 snapshot 变了，也可能是 harness 的 retries 改了——没有任何工具能机械地判定这两次 run 是不是合法的差分对象。
- `docs/scores.md` 是"绝对水位"形状的看板，读者会脑补 leaderboard 语义，但没有 fingerprint 承诺。
- Core 模块（system prompt builder / tool registry / router / safety / context strategy）没有对外暴露的稳定 hash，trace 里也只有 system prompt 字符串 hash，不含其余轴。

**After（冲刺关闭时）**：

- 每次 `runHeadless()` / eval run 自带完整的四轴 fingerprint，写入 `results.json` 和 trace ledger。
- 四轴的静态部分以 YAML profile 形式生活在 `evals/profiles/` 下，可版本化、可跨 run 复用。
- 一次 experiment 由 `scaffold × model × harness × dataset` 四元组 + seed + trials 声明，不再是散落的 CLI flag。
- `codelord eval fingerprint diff <run_a> <run_b>` 结构化输出两次 run 的四轴差异。
- `codelord eval compare <expA> <expB>` 在实现中硬门禁：四轴差超过一项则**拒绝**给 delta 结论，只输出 raw numbers + 警告"不是一个合法的差分"。
- 静态 scaffold 指纹（跨 run 稳定，差分唯一合法依据）和有效 prompt 指纹（含 runtime 输入，仅 debug 单次 run）分离记录。

---

## 上一个冲刺回顾

M3-S2（Eval 规范化 + CI + 成绩看板）已关闭。

**关键产出**：

- `@codelord/evals-shared` 包：统一 `EvalResult` schema + `writeResult`/`exitWithResult`/`renderSummaryMarkdown`/`registerBenchmarkRenderer`
- 四个 adapter 全部规范化：统一输出格式、退出码 0/1/2、标准 `scripts/run.sh`
- BrowseComp Docker 化补齐
- Terminal-Bench Harbor 输出转换器（`convert-results.ts`）
- 四个 GitHub Actions eval workflow（workflow_dispatch）+ Job Summary
- `docs/scores.md` 成绩看板 + `scripts/update-scores.ts` + Auto-PR workflow
- `docs/ci/SECRETS.md` CI 配置文档

详见 [归档](./archive/sprints/sprint-m3s2-eval-ci-scoreboard.md)。

**S2 之后暴露的结构性问题**（见 DecisionLog 2026-04-17）：

1. `scores.md` 的"绝对分数"叙事与 Opus 4.7 model card 高度重合，在没有四轴受控的前提下等同于在复刻 leaderboard。
2. 老 `EVALS.md` metric 表里的大部分条目其实是 test / dogfood / 模型能力，硬塞进 eval 形态后信号密度极低。

这两条是本冲刺存在的理由：先把差分地基铺好，后面的 eval 才有资格谈 "delta"。

---

## Task 分解

### T1：四轴 Fingerprint JSON Schema

**状态**：✅ 完成 — 2026-04-18

**目标**：固化四轴 fingerprint 的字段边界，作为后续所有工作的 schema 基石。

**具体改动**：

1. 新建 `evals/shared/fingerprint.ts`，导出 TypeScript 类型 + zod schema：
   ```
   FourAxisFingerprint {
     scaffold: ScaffoldFingerprint
     model:    ModelFingerprint
     harness:  HarnessFingerprint
     dataset:  DatasetFingerprint
   }
   ```
2. 每轴的字段枚举（不可随意扩展，扩字段需要同时更新 EVALS.md 四轴表）：
   - `ScaffoldFingerprint`：`codeGitSha` / `systemPromptStaticHash` / `toolRegistryHash` / `routerRulesHash` / `safetyPolicyHash` / `contextStrategyHash`（预留 `skillSetHash` / `retrievalConfigHash` 字段，M5/M4 填）
   - `ModelFingerprint`：`provider` / `modelId` / `generationParams` / `promptCachingEnabled`
   - `HarnessFingerprint`：`adapterVersion` / `timeoutMs` / `maxSteps` / `retries` / `mcpServerVersions` / `containerImageSha` / `externalToolVersions`
   - `DatasetFingerprint`：`suiteId` / `suiteVersion` / `caseIds` / `seed` / `trials`
3. 每个 hash 字段固定为 16 字符前缀的 SHA-256，利于肉眼对比。
4. 从 `@codelord/evals-shared` 导出，供 `runHeadless` 和 eval adapter 复用。

**改动文件**：新建 `evals/shared/fingerprint.ts`；`evals/shared/index.ts` 导出。

**验证**：zod parse 一个完整 fingerprint 对象成功；缺任一字段时 parse 报错。

---

### T2：Core 模块 `.fingerprint()` + Scaffold 静态指纹聚合

**状态**：✅ 完成 — 2026-04-18

**目标**：让每个进入 scaffold 轴的 core 模块都暴露稳定的静态 hash，再聚合为 `ScaffoldFingerprint`。静态指纹**不包含** cwd、用户输入、session 上下文。

**具体改动**：

1. `agents/coding-agent/src/cli/system-prompt.ts`：新增 `buildSystemPromptStaticFingerprint()`，对 system prompt builder 的**静态模板 + 固定片段**取 hash，不含 runtime 变量（cwd、项目名、git branch 这些进入"有效 prompt 指纹"）。
2. `packages/agent-core/src/tool-registry.ts`：`ToolRegistry.fingerprint()` = hash(tool 集合 + 每个 tool 的 contract 稳定字段 + 注册顺序)。
3. `packages/agent-core/src/tool-router.ts`：`ToolRouter.fingerprint()` = hash(规则列表 + 顺序 + 规则版本)。
4. `packages/agent-core/src/tool-safety.ts`：`SafetyPolicy.fingerprint()` = hash(risk level 映射 + 敏感路径模式 + 高危 bash 规则)。
5. `packages/agent-core/src/context-window.ts`（或 `message-manager.ts`）：`ContextStrategy.fingerprint()` = hash(token 预算 + 截断策略 + 保留窗口参数)。
6. 新建 `agents/coding-agent/src/cli/scaffold-fingerprint.ts`：聚合上述所有 `.fingerprint()` + 当前 `codeGitSha`（从构建时注入或运行时 `git rev-parse HEAD`），返回 `ScaffoldFingerprint`。
7. 明确区分**静态指纹**和**有效 prompt 指纹**：
   - 静态：跨 run 稳定，差分比较的唯一合法依据，进入 `ScaffoldFingerprint`
   - 有效：含 runtime 输入（cwd、环境变量、session 起始消息），仅用于 debug 单次 run，进入 trace 的 per-run diagnostics，**不**参与差分
8. `scaffold-fingerprint.test.ts`：断言两次构建返回同一 hash；改一行 system prompt 后只有 `systemPromptStaticHash` 变化，其余字段稳定。

**改动文件**：新增 5 个 `.fingerprint()` 方法；新建 `scaffold-fingerprint.ts` + test。

**验证**：

- 不改任何源码跑两次，`ScaffoldFingerprint` 完全相等
- 改一条 router 规则后，只有 `routerRulesHash` 变
- `runHeadless` 在同一 scaffold 下跑两次，runtime fingerprint 返回值稳定

---

### T3：`runHeadless()` 返回值扩展 + Trace v2 ledger 扩展

**状态**：🔵 未开始

**目标**：让四轴 fingerprint 成为 `runHeadless` 的一等返回字段，并进入 Trace v2 ledger，使后续所有消费者（eval adapter / scores.md writer / trace CLI）不需要自己重新计算。

**具体改动**：

1. `agents/coding-agent/src/cli/headless.ts`：`runHeadless()` 返回值增加 `fingerprint: FourAxisFingerprint`
   - `scaffold` 字段由 T2 的 `buildScaffoldFingerprint()` 提供
   - `model` 字段由当前 provider + model 配置 + generation params 组装
   - `harness` 字段允许调用方注入（eval adapter 传入），`runHeadless` 自身填 `adapterVersion="headless-cli"` 作为 default
   - `dataset` 字段 `runHeadless` 不负责，由 eval adapter 填
2. `packages/agent-core/src/trace.ts`：Trace ledger 的 run-level header 扩展为 `{ fingerprint: FourAxisFingerprint, effectivePromptHash: string, ... }`，两者并列记录，不互相覆盖。
3. `agents/coding-agent/src/trace-recorder.ts`：run 开始时写入 fingerprint，结束时不再重写——fingerprint 在 run 内不可变。
4. 四个 eval adapter（polyglot / swe-bench / browsecomp / terminal-bench）：
   - 在调用 `runHeadless` 前组装 `HarnessFingerprint`（adapter 版本 + timeout/retries/maxSteps + 容器 SHA）
   - 在结果聚合时组装 `DatasetFingerprint`（suite id + case id 列表 + seed + trials）
   - `EvalResult` schema 增加 `fingerprint: FourAxisFingerprint` 一等字段
5. `evals/shared/result-writer.ts` 的 summary renderer 在输出 Job Summary 时额外打印 fingerprint 摘要（每轴一行，短 hash）。

**改动文件**：`cli/headless.ts` 返回类型；`trace.ts` + `trace-recorder.ts`；四个 adapter 的 runner；`evals/shared/types.ts` + `result-writer.ts`。

**验证**：

- `pnpm --filter @codelord/evals-polyglot polyglot --limit 1` 产出的 `results.json` 顶部含完整四轴
- `trace show <latest>` 在 header 中打印四轴短 hash
- 同一配置跑两次，所有四轴 hash 完全相等

---

### T4：`evals/profiles/` 目录 + Experiment Config 格式

**状态**：🔵 未开始

**目标**：让四轴的**静态部分**可以以命名 profile 形式版本化，而不是每次命令行重新堆参数。一次 experiment 就是对 profile 的引用。

**具体改动**：

1. 新建目录骨架：
   ```
   evals/profiles/
     scaffold/
       minimal-baseline.yaml    # 禁用可选组件，作为差分 baseline
       current-default.yaml     # 当前生产默认
     model/
       claude-sonnet-4-6.yaml
       claude-opus-4-7.yaml
     harness/
       swe-bench-docker-v3.yaml
       polyglot-subset-v1.yaml
       browsecomp-docker-v1.yaml
       terminal-bench-harbor-v1.yaml
     dataset/
       swe-bench-verified-subset-30-seed42.yaml
       polyglot-subset-v1.yaml
       ...
     experiments/
       (experiment 引用三元组 + dataset，格式见下)
   ```
2. Scaffold profile 字段约束为**可被 `scaffold-fingerprint.ts` 计算出同一 hash 的输入**（例如 `systemPromptProfile: "default" | "minimal"` 指向 `cli/system-prompt.ts` 的某个静态配置，而不是一段 prompt 字符串）。
3. Model profile 记录 `provider / modelId / generationParams / promptCachingEnabled`，eval adapter 在运行前把这些注入到 runHeadless。
4. Harness profile 记录 `adapterVersion / timeoutMs / maxSteps / retries / containerImageSha` 等。
5. Dataset profile 记录 `suiteId / suiteVersion / caseIds(数组或 selector) / seed / trials`。
6. Experiment config 格式（YAML）：
   ```
   experiment:
     id: context-strategy-v2-vs-default
     scaffold: current-default@<sha>     # 或 minimal-baseline
     model:    claude-sonnet-4-6
     harness:  swe-bench-docker-v3
     dataset:  swe-bench-verified-subset-30-seed42
   ```
7. `evals/shared/profile-loader.ts`：加载 profile 与 experiment config，返回 typed 对象；加载时校验 profile 与当前构建产物的 `.fingerprint()` 是否匹配（profile 内可选写入 expected hash，加载时比对不一致则报错）。

**改动文件**：新建 `evals/profiles/` 目录；新建 `evals/shared/profile-loader.ts`；更新 `evals/shared/index.ts` 导出。

**验证**：

- 引用 `minimal-baseline.yaml` + `claude-sonnet-4-6.yaml` + `swe-bench-docker-v3.yaml` + `swe-bench-verified-subset-30-seed42.yaml` 能被 `profile-loader.ts` 加载为合法 experiment
- 随便改 router 一行代码后，`minimal-baseline.yaml` 的 expected hash 校验失败，提示需要 bump profile 版本

---

### T5：`codelord eval fingerprint diff` CLI

**状态**：🔵 未开始

**目标**：让人和工具都能机械地判定两次 run 的四轴差在哪。

**具体改动**：

1. 新建 `agents/coding-agent/src/cli/commands/eval-fingerprint-diff.ts`（或对应位置），子命令 `codelord eval fingerprint diff <run_a.json> <run_b.json>`。
2. 输出结构化 diff，按轴分组：
   ```
   scaffold: 2 fields differ
     systemPromptStaticHash: abc12345 → def67890
     toolRegistryHash:       xxx11111 → yyy22222
   model:   identical
   harness: identical
   dataset: 1 field differ
     seed: 42 → 43
   ```
3. 支持 `--json` flag 输出机读格式，供 CI / Auto-PR workflow 消费。
4. 支持传入 trace 文件或 results.json（两者都带 fingerprint header）。

**改动文件**：新增 CLI 子命令；注册到 `agents/coding-agent/src/cli/index.ts`。

**验证**：

- 同一 run 自身 diff 输出 "all axes identical"
- 改一条 router 规则后跑，输出只显示 `scaffold.routerRulesHash` 变化

---

### T6：`codelord eval compare` 差分硬门禁

**状态**：🔵 未开始

**目标**：把"只有四轴中不超过一项变化的两次 run 才能得出差分结论"这条规则**烧进工具本身**，不给 hygiene 失效留缝隙。

**具体改动**：

1. 新建 `agents/coding-agent/src/cli/commands/eval-compare.ts`，子命令 `codelord eval compare <run_a> <run_b>`。
2. 步骤：
   - 先调用 T5 的 fingerprint diff 逻辑
   - 统计四轴中**有差异的轴数**（而非字段数）
   - 若 > 1：拒绝给 delta 结论，只输出两侧 raw numbers + `WARN: 不是一个合法的差分 (N 轴同时变化)` + 列出变化的轴
   - 若 = 0：提示"相同配置的两次 run，请使用 `eval run --trials N` 而非 compare"
   - 若 = 1：继续往下做差分计算（delta + CI 的实际计算留到 S4 Differential Runner，本 sprint 只要求硬门禁先行；S3 的 `eval compare` 可以暂时只输出 delta 不带 CI，并标注 `CI: pending S4`）
3. 输出格式标准化：报告头写明**哪一个轴变化了**，让读者一眼看出在测哪一维。
4. 退出码：合法差分且完整 → 0；非法差分 → 2。

**改动文件**：新增 CLI 子命令；复用 T5 的 diff 模块。

**验证**：

- 同 scaffold + 不同 model 的两次 run：合法（model 轴唯一变化），输出差分
- 改 scaffold + 换 model：拒绝，输出 "2 轴同时变化"
- 完全相同的两次 run：提示使用 `eval run --trials`

---

### T7：文档对齐 + CI workflow 调整

**状态**：🔵 未开始

**目标**：让四个 eval workflow 和 `scores.md` 表头在 S3 的产出基础上给出**临时合法陈述**，过渡到 S4 完成差分改写之前不产生误导。

**具体改动**：

1. `docs/scores.md` 表头加入显式声明：
   > 本看板是 S2 遗留的"绝对分数快照"形态，将在 M3-S4 内改写为"相对锁定 baseline 的差分快照"。在改写完成之前，请勿将这些数字与 model lab 公布数字并列对比——harness 与 scaffold 均不同。
2. Auto-PR workflow 向 `scores.md` 写入时，在每行附加本次 run 的四轴短 hash 作为脚注（先能记录，到 S4 再改表格结构）。
3. `evals/profiles/` 目录下新增 `README.md`，说明 profile 的含义、如何新增、与 fingerprint hash 校验的关系。
4. 同步更新 `docs/system/EVALS.md`：把 T5/T6 的 CLI 命令从"M3-S4"标注改为"M3-S3 已落地"。
5. 同步更新 `docs/planning/RoadMap.md` M3-S3 section 的 checkbox 进度。

**改动文件**：`docs/scores.md` 表头；`scripts/update-scores.ts`；新建 `evals/profiles/README.md`；更新 `docs/system/EVALS.md`；更新 `docs/planning/RoadMap.md` M3-S3 checklist。

---

## 风险与开放问题

- **静态 system prompt 指纹的边界**：system prompt builder 里哪些算"静态"、哪些算"runtime"不是物理定义。T2 需要一次明确决策并写入 `scaffold-fingerprint.ts` 的注释——例如"cwd / 项目名 / git branch / 当前时间 → 有效指纹；工具清单 / skill 清单 / safety 规则 → 静态指纹"。错分会污染所有后续差分。
- **Profile 与代码版本的耦合**：profile 内 embed expected hash 后，任何 core 模块的改动都会让老 profile 失效。需要一套 profile bump 流程（在 DecisionLog 里记录还是在 profile 文件 changelog 里记录），S3 内先用最简单的 changelog 注释，S4 视需要再规范化。
- **T6 的差分门禁在 S3 内只覆盖"硬拒绝"逻辑**：实际的 delta + CI 计算依赖多 trials runner，那是 S4 的范围。S3 要验证的是"非法差分确实被拦下"，不是"合法差分的数字正确"。
- **四个 adapter 的 HarnessFingerprint 组装**：BrowseComp 和 Terminal-Bench 的容器 SHA 需要从构建产物里抽出来，当前是否能稳定拿到需要 T3 落地时确认；拿不到就先 fallback 为"镜像 tag + 构建日期"并记入 open issue。

---

## 完成标志

- 同一 scaffold profile 跑两次，`codelord eval fingerprint diff` 输出 "all axes identical"
- 改一行 system prompt 后跑，`fingerprint diff` 只显示 `scaffold.systemPromptStaticHash` 变化
- `codelord eval compare` 在非法差分（两轴同时变）输入下**拒绝**给结论并输出结构化警告，退出码 2
- 四个 eval adapter 最近一次 run 的 `results.json` 顶部都带上完整四轴 fingerprint
- `evals/profiles/` 下至少有 `minimal-baseline` + `current-default` 两份 scaffold profile，与当前构建产物的 `.fingerprint()` 一致
- `docs/scores.md` 表头已挂上临时声明；S3 checkbox 在 RoadMap 全部勾掉

---

## 下一个冲刺（预告，不承诺日期）

**M3-S4：Differential Runner + Experiment Config**

- `codelord eval run --trials N`：多次运行 + bootstrap/Wilson 置信区间
- `codelord eval compare` 补齐 delta + CI 计算（S3 留下的 `CI: pending S4` 在这里消掉）
- `scores.md` 语义改写为"相对 baseline 的差分快照"
- Auto-PR workflow 从"写新分数"改为"写差分快照 + CI + baseline 指针"
