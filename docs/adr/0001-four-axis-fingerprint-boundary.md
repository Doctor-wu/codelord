# ADR-0001: 四轴指纹边界 — 静态 vs 有效

## Status

Accepted — 2026-04-18

## Context

`docs/planning/DecisionLog.md` 2026-04-17 条目确立了"差分 eval 需要四轴 fingerprint 硬门禁"的立场，Sprint M3-S3 以此为目标展开。Sprint.md T2 开放问题之一是：

> 静态 system prompt 指纹的边界不是物理定义。system prompt builder 里哪些算"静态"、哪些算"runtime"……错分会污染所有后续差分。

在此之前若无一次明确决策，T1（schema）和 T2（各 core 模块 `.fingerprint()`）的实现口径会漂移，`codelord eval compare` 的"N 轴同时变化"计数会失去意义。

### 现状观察

- `agents/coding-agent/src/trace-recorder.ts:72` 已存在 `systemPromptHash`：
  ```ts
  this.systemPromptHash = createHash('sha256').update(opts.systemPrompt).digest('hex').slice(0, 16)
  ```
  输入是 `buildSystemPrompt({ cwd, contracts })` 的完整拼接结果，既含 `cwd`（runtime）又含 `contracts` 内容（与未来 `toolRegistryHash` 重复）。作为差分依据不合格。
- `packages/agent-core/src/tool-safety.ts` 的 `SENSITIVE_PREFIXES` 嵌入 `homedir()` 调用结果。如果原样 hash，同一份 safety policy 在不同机器上 hash 不同，跨机器差分会失败。
- `packages/agent-core/src/tool-router.ts` 的规则集合是源码硬编码（没有版本号常量），需要先定一个"够稳定、不至于每次格式化都抖动"的 hash 口径。
- `packages/agent-core/src/context-window.ts` 既有 `DEFAULT_CONTEXT_WINDOW` 常量，又允许 `CodelordConfig` 注入覆盖——哪一份值进入指纹需要明确。
- `agents/coding-agent/src/cli/system-prompt.ts` 当前唯一的 runtime 变量是 `cwd`；没有 git branch / 项目名 / 时间戳注入。边界相对干净，适合一次定死。

## Decision

将 scaffold 静态指纹与有效 prompt 指纹 **物理分离**，各自承担不重叠的信息载体。两者并列记录到 trace v2 ledger 的 run header，不互相覆盖。

### 总体原则

**静态指纹**（进 `FourAxisFingerprint.scaffold`，参与差分门禁）：

- 来源：源码常量、构建产物 SHA、`CodelordConfig` 里的策略性字段
- 跨机器、跨时间、跨 run 稳定
- 不含任何机器路径、用户名、会话输入、当前时刻信息

**有效 prompt 指纹**（进 trace per-run diagnostics 的 `effectivePromptHash`，**不**参与差分）：

- 来源：静态部分 + `cwd` + 当次 merged config + 当前环境可观察字段的 allowlist
- 仅用于在单次 run 内定位问题

### 按字段分配

#### `scaffold.codeGitSha`

- 构建时优先读 `process.env.CODELORD_BUILD_SHA`（CI 以 `git rev-parse HEAD` 注入）
- dev 环境 fallback 到运行时 `git rev-parse HEAD`
- 工作树 dirty 时后缀 `-dirty`；**不** hash 未提交 diff 的内容，只做告警信号

#### `scaffold.systemPromptStaticHash`

- 计算：`sha256(buildSystemPrompt({ cwd: '<STATIC>', contracts: [] })).slice(0, 16)`
- 入 hash 的实际内容：`buildRoleSection()` 字面量 + `buildToolGuidanceSection` 的 `IMPORTANT` 条款文字 + `renderContract` 的 label 模板骨架
- 不含 `cwd`（被常量占位符替代）、不含 contracts 具体内容（由 `toolRegistryHash` 承担）

#### `scaffold.toolRegistryHash`

hash 输入（规范化 JSON stringify 后 sha256 取前 16 字符）：

- 每个 contract 的 `{ toolName, whenToUse, whenNotToUse, preconditions, failureSemantics, fallbackHints }`，**按 `toolName` 字典序排列**
- tool `name` 集合，排序后去重

**不 hash** 注册顺序：当前 router 行为与注册顺序解耦，把顺序进 hash 只会引入脆性。

#### `scaffold.routerRulesHash`

hash 输入：

- 源码中导出的 rule `id` 数组，按 id 字典序
- `packages/agent-core/src/tool-router.ts` 文件内容的 sha256（粗粒度但稳定）

这是过渡方案。长期需要拆分出"规则版本号常量表"，但 S3 不做（在 Consequences 里留口）。

**2026-04-18 addendum**：实现采纳 `TOOL_ROUTER_RULES_VERSION` 手动 bump 常量方案，而非"hash 文件内容"。理由：文件内容 hash 会被无关的格式化抖动触发，让 `eval compare` 拒绝合法差分。常量 bump 的代价是开发者手动纪律，好处是脆性可控。未来若需自动化，候选是"对 router 规则 AST 取结构 hash"，独立 ADR 处理。

#### `scaffold.safetyPolicyHash`

hash 输入：

- **merged riskMap**（`DEFAULT_RISK` ⊕ 构造时传入的 `options.riskMap` ⊕ `AskUserQuestion:control` 强制覆盖，按 key 排序后 JSON stringify）
- `SENSITIVE_PREFIXES`，**归一化后** hash：以 `homedir()` 返回值开头的路径替换为 `~/` 前缀；非 HOME 路径（如 `/etc`）原样保留
- `SAFE_COMMAND_PREFIXES` 数组（排序后）

归一化规则必须单测覆盖：两次 mock `homedir()` 返回不同值时，最终 hash 相等。

**2026-04-18 addendum**：初版实现只 hash 模块级 `DEFAULT_RISK`，不覆盖 plugin 通过 `ToolSafetyPolicyOptions.riskMap` 注入的 per-instance 条目。复盘发现这会让"换了 plugin 集合 / 改了 plugin 的 `riskLevel`"这类实质 scaffold 变动逃过差分门禁 —— 违背"scaffold 含策略性字段"的原则（见 §总体原则）。现口径改为 hash merged riskMap：plugin 注入的 riskMap 被视作"在运维侧选择了哪些 plugin + 它们各自声明的风险分级"的结果，属 scaffold 的一部分。`cwd` 不进 hash（它是 runtime 状态，归 `effectivePromptHash`）。`AskUserQuestion:control` clamp 被并入 merged map，因此"试图把 AskUserQuestion 降级为 dangerous"等 bogus 注入不会导致指纹漂移 —— 反映真实策略稳定性。

#### `scaffold.contextStrategyHash`

hash 输入：

- 最终生效的 `maxTokens / reservedOutputTokens`，取 `CodelordConfig.contextWindow` 覆盖 `DEFAULT_CONTEXT_WINDOW` 之后的 merged 值
- 截断算法版本常量（新增 `CONTEXT_STRATEGY_VERSION = "v1"`），未来截断语义变更时 bump

不含当次会话的 messages / token 估算结果。

#### `effectivePromptHash`（per-run，不进差分）

计算：`sha256(buildSystemPrompt({ cwd, contracts }) + "\n" + gitBranch + "\n" + JSON.stringify(mergedConfig)).slice(0, 16)`

只进 trace v2 ledger 的 run header 作为 diagnostic。

### 拒绝进静态指纹的边界案例

- 当前时间 / 随机 seed → 进 `DatasetFingerprint.seed`，不进 scaffold
- 用户名 / 机器 hostname → 既不进静态也不进 effective，避免 trace 对比被污染
- 未提交源码 diff 内容 → 由 `codeGitSha` 的 `-dirty` 后缀告警承担
- `HOME` 的具体值 → 归一化掉
- 进程级环境变量 → 非必要不进 effective；如需，维护显式 allowlist

## Consequences

### 正面

- 每个 hash 载体正交：改一条 router 规则只动 `routerRulesHash`；改一行 role prompt 只动 `systemPromptStaticHash`。`codelord eval compare` 的"N 轴同时变化"计数有了物理意义。
- 跨机器差分合法：剔除 HOME / hostname 后，同一份 safety policy 在不同开发机上 hash 一致。
- 未来 skill / retrieval 接入时，新增 `skillSetHash` / `retrievalConfigHash` 字段不会回过头动已有 5 项的计算口径——字段空间已经在 schema 里预留。

### 负面 / 迁移成本

- 现有 trace v2 文件的 `systemPromptHash` 字段语义实际等同于本 ADR 的 `effectivePromptHash`。迁移方案：
  - 新增 `effectivePromptHash` 字段，与旧 `systemPromptHash` 并存一个 S3 内的窗口；trace-store 渲染时优先读新字段
  - Sprint 结束前把旧字段从 schema 里移除，trace-store 加 fallback 兼容读
  - trace v1 文件（如仍存在）不受影响
- `routerRulesHash` 依赖 `tool-router.ts` 文件内容 hash，无关的格式化改动（如 prettier 重排）会让 hash 变化并触发 `eval compare` 拒绝差分。短期靠 lint / format 稳定化缓解，长期靠规则版本号常量替代。

### Open issues（延后处理，不阻塞 S3）

- Safety policy 里 `HOME` 归一化的**跨平台**行为（Windows 下的 `USERPROFILE`、CI runner 的 HOME）需要在 T2 实现时补充测试矩阵。
- BrowseComp / Terminal-Bench 容器 SHA 的抽取方式待 T3 落地时确认；拿不到就 fallback 为"镜像 tag + 构建日期"并记入 new open issue。
- 规则版本号常量表（替代 `tool-router.ts` 文件 hash）是独立 ADR 的候选议题，S3 内不做。

## Alternatives considered

1. **单一 `systemPromptHash` 全包（维持现状）**
   - 拒绝理由：作为差分依据会被 `cwd` / 机器信息污染，`eval compare` 门禁会把"换了台机器跑"误认为"scaffold 变了"，hygiene 立刻失效。
2. **把 contracts 内容塞进 `systemPromptStaticHash`**
   - 拒绝理由：与 `toolRegistryHash` 双重计量。一次 tool contract 改动会让两个 hash 同时变，虚增"变化轴数"，让"只动一个轴"的差分门禁形同虚设。
3. **Safety policy 原样 hash（含 HOME）**
   - 拒绝理由：跨机器差分直接失败。违背"scaffold 静态指纹跨机器一致"的承诺。
4. **`contextStrategyHash` 只 hash `DEFAULT_CONTEXT_WINDOW` 常量**
   - 拒绝理由：config 注入的覆盖值是**运维选择的策略**，属于 scaffold 的一部分。只 hash 常量会让"改了 config 的 maxTokens"这种实质 scaffold 变动逃过指纹。
5. **把 `codeGitSha` 放进 `harness` 轴而不是 `scaffold`**
   - 拒绝理由：`codeGitSha` 反映的是 codelord 自己的代码版本，对应"scaffold"（我们可控、我们改造的部分）；harness 轴专指外部 benchmark adapter / 容器 / 工具版本。混淆会让差分归因错位。

## References

- `docs/planning/Sprint.md` §"T2 风险与开放问题" — 本决策的触发点
- `docs/planning/DecisionLog.md` 2026-04-17 条目 — 父决策（差分立场 + 四轴立场）
- `docs/planning/research/eval-position.md` §"选择 4" 2026-04-17 addendum — 四轴 profile 版本化
- `agents/coding-agent/src/cli/system-prompt.ts` — 静态边界的实现口径
- `packages/agent-core/src/trace.ts:146,252` — 现有 `systemPromptHash` 字段位置
- `agents/coding-agent/src/trace-recorder.ts:72` — 现有 hash 计算点（将在迁移窗口后重命名为 `effectivePromptHash`）
- `packages/agent-core/src/tool-safety.ts` `SENSITIVE_PREFIXES` — HOME 归一化的作用位置
- `packages/agent-core/src/context-window.ts` `DEFAULT_CONTEXT_WINDOW` — merged 值计算起点
