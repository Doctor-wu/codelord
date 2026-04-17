# Codelord Eval 与证据规则

## 目的

本文档定义 codelord 中"什么算作证据"。
它不是 eval 框架的技术手册，而是**在 codelord 内部区分 test / 差分 eval / dogfood 三类证据，并为"差分 eval"这一类施加硬约束**。

## 核心立场

**只有差分 eval 是 agent eval。**

绝大多数被习惯性称为 "agent 指标" 的东西，实际上属于下列三个更基础的学科，而不是 agent eval：

1. **Test（确定性不变量）** — 状态机契约、perf 上界、schema 完备性、router 规则命中。能用 fixture / property test 固化的，就不该伪装成 eval。
2. **模型评测** — 推理质量、rationale 清晰度、code style 等由模型能力决定的维度。model lab 的 model card 会覆盖这些；codelord 只负责在模型切换时按需监测，不负责"优化模型"。
3. **Dogfood / UX 研究** — operator 信任、是否需要猜、交互顺不顺手这类定性信号。走访谈 / 录屏 / 定性归纳，不要硬装成数字指标。

剩下真正属于 agent eval 的、不能被上面三类吃掉的内核是：
**在开放、长 horizon、多步任务上，scaffold 和模型交互产生的涌现行为，且该行为只能通过在任务语料库上的 A/B 差分被观测。**

这意味着：

- 绝对分数对比（"codelord 在 SWE-Bench 得 X%"）不是 agent eval，是在**评估模型 + 公共 harness**。
- 差分对比（"同一模型、同一 dataset、scaffold-A 相对 scaffold-B 的 delta"）才是 agent eval，因为它唯一能隔离的变量就是 codelord 这一层。
- 没有受控基线的数字不构成证据。**Leaderboard 形状的陈述默认不被本仓库视为 eval 产出。**

## 证据三分法

面对任何"我们要度量 X"的主张，第一步是判定它属于哪一类，然后用该类对应的工具而不是硬塞进 eval。

| 类别          | 形态                              | 工具                                                           | 何时用                                                       |
| ------------- | --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| **Test**      | 确定性不变量 / perf 上界 / schema | `packages/*/test/` 下的 unit / integration / property fixtures | 能被 fixture 精确断言；运行时 <秒级；应进 CI 每次触发        |
| **差分 Eval** | 在任务语料库上的 A/B + 置信区间   | `codelord eval compare`（M3-S4）+ 四轴 fingerprint（M3-S3）    | 行为需要开放任务、依赖模型输出、改动涉及 scaffold 的多个模块 |
| **Dogfood**   | 定性 UX 信号 + trace 人工审阅     | `docs/planning/dogfood-playbook.md`（待建）+ 真实使用          | 信号是"operator 的主观体验"，样本稀、维度连续、无法写 rubric |

**迁移默认方向：** 一个度量项如果能被写成 test，就必须写成 test；写不成 test 且依赖模型行为的，才考虑是否属于差分 eval；既不是 test 又不是差分 eval 的，归入 dogfood，不在指标表里占位。

### 归类示例（来自老版 EVALS metric 表）

| 老指标                                                | 新归类         | 理由                                                            |
| ----------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `provisional_to_stable_handoff_correctness`           | Test           | 纯状态机不变量，给定 event 序列断言 timeline                    |
| `queue_trace_completeness`                            | Test           | Schema 完备性，每个 queue transition 必须 emit 对应 trace event |
| `first_tool_visible_latency` / `visible_tool_latency` | Test (perf)    | Perf 不变量，N ms 内 renderer 必须产出 provisional tile         |
| `reasoning_visible_rate`                              | Test + Model   | 渲染链路是 test；provider 吐不吐 thought 归模型评测             |
| `reason_quality_coverage`                             | Model + Prompt | 模型能力 + prompt 写法，不是 scaffold 独立维度                  |
| `interrupt_recovery_clarity`                          | Test + Dogfood | 状态恢复正确性是 test；"清晰度"是 dogfood                       |
| `operator_trust_signal`                               | Dogfood        | 本质是 UX research，不要伪 metric 化                            |

## 四轴 Fingerprint（差分 eval 的物理基础）

任何一次 eval run 的结果**必须**被四个正交轴 pin 住，否则 delta 不具可比性。

| 轴           | 记录什么                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scaffold** | code git SHA、system-prompt builder 静态指纹、tool registry 指纹、router 规则指纹、safety policy 指纹、context strategy 指纹、（未来）skill set / retrieval config 指纹 |
| **Model**    | provider、model id（精确到 snapshot）、generation params（temperature / top-p / thinking budget）、prompt caching 开关                                                  |
| **Harness**  | eval adapter 的 timeout / max_steps / retries、挂接的 MCP server 版本、容器镜像 SHA、外部工具（rg / git）版本                                                           |
| **Dataset**  | suite id + version、case id 列表（不是"抽了 N 个"，是**具体哪 N 个**）、随机种子、trial 数 N                                                                            |

**关键区分：**

- **静态 scaffold 指纹** 对"codelord 这个二进制"取 hash，不含 cwd / 用户输入 / 当前 session 上下文。跨 run 稳定，**差分比较的唯一合法依据**。
- **有效 prompt 指纹** 包含 runtime 输入。仅用于 debug 具体 run，不进入差分计算。

两者分开记录。实现细节见 M3-S3。

### 命名 Profile

四个轴的内容以可版本化的 profile 文件形式存在（`evals/profiles/scaffold/*.yaml`、`evals/profiles/model/*.yaml` 等）。一次 experiment 引用三元组 + dataset：

```
experiment:
  scaffold: minimal-baseline@<sha>
  model:    claude-sonnet-4-6
  harness:  swe-bench-docker-v3
  dataset:  swe-bench-verified-subset-30@seed=42
```

叙事强制变成机械形式：**"scaffold: minimal-baseline → with-router-v2，其他三轴固定，delta = +3.2% [95% CI: +1.1, +5.3]"**。一眼能看出在测哪一维。

## 差分规则（硬门禁）

`codelord eval compare A B` **必须**在实现中强制执行：

1. A 和 B 的 Scaffold / Model / Harness / Dataset 四轴 fingerprint 差**不超过一项**，否则拒绝给结论，只输出 raw numbers + 警告"不是一个合法的差分"。
2. Delta 必须带置信区间（trials ≥ 3，否则标注 "insufficient trials, not a differential claim"）。
3. Dataset 不足以支撑结论时（case 数 <20 或跨 seed 方差过大），标注 "underpowered"。
4. 四轴指纹 + trials + CI 必须一同出现在结论里；缺一者不算结论。

这些规则的目的：**把 hygiene 烧进工具本身**，不给"顺手改了 router 又改了 prompt"把 delta 误归因的机会。

## 证据阶梯

对你正在做的变更，使用可用的最强级别。

| 级别 | 证据                                          | 适用场景                                                      |
| ---- | --------------------------------------------- | ------------------------------------------------------------- |
| 0    | 仅设计论证                                    | 永远不足以支撑行为声明                                        |
| 1    | 本地 trace 检查                               | 当场 debug；**不是** 合并门禁                                 |
| 2    | Fixture / property test                       | current-focus 区域的确定性回归，first-class 合并门禁          |
| 3    | Dogfood session 证据                          | 定性 UX 信号；配合 playbook 做结构化归纳                      |
| 4    | 差分 eval（带四轴 fingerprint + trials + CI） | scaffold 改动的默认证据形式；M4/M5/M6/M7 所有改动都落在这一级 |
| 5    | 事件驱动的全量外部 benchmark run              | 仅在模型切换或重大 scaffold 变更时触发，**只作差分使用**      |

级别 5 明确**不**作为"codelord 当前水位"的陈述依据。它只在成对的 A/B 框架下发言。

## Product Eval vs Research Eval

两条轨保持分离，但它们都走差分，不走绝对分数。

### Product Eval

用于判定"能不能合并 / 能不能发布"。

- 形态：小而稳定的内部 golden set（10–20 个开放任务），deterministic grader
- 问题："本次改动有没有 regress 已有行为？"
- 输出：相对上一个锁定 baseline 的 delta，带 CI；跨阈值即阻断

### Research Eval

用于判定"这个方向值不值得继续"。

- 形态：A/B 两套 scaffold profile，多次 trials，可大可小的 dataset
- 问题："scaffold 改动 X 是否在任务类型 T 上带来可量化收益？"
- 输出：per-case pass rate、delta、置信区间、p-value

**不要用 research 胜利作为发布证明。**
**不要用发布门禁阻止所有探索。**

## 证明规则

- 没有四轴 fingerprint 的数字，不构成 eval 结论。
- 没有 baseline 的"delta"，不构成差分。
- 没有 trials ≥ 3 的 pass rate，不构成稳定度量。
- Trace 只解释 model events 而不解释 operator 操作，不声称"可追踪"。
- 没有退出条件，不声称"临时"。
- 没有指出之前的失败模式，不声称"更好"。

## Scoreboard 的语义

`docs/scores.md` **不是** codelord 的"当前绝对水位看板"。
它的语义是：**在一个受控 scaffold profile 下，相对上一锁定 baseline 的差分快照**。

每一行必须携带：

- scaffold profile 名称 + 版本
- model id + generation params
- harness version
- dataset subset id + 具体 case 列表或种子
- 相对 baseline 的 delta（不是当期绝对分数）或明确标注为 baseline 本身

任何看起来在做 leaderboard 的陈述，都要在同一表格内明确写"与 model lab 公布数字不可比，harness 与 scaffold 均不同"。

## 何时更新本文档

- 三分法归类边界调整（某类 metric 从 test 归到 differential eval 或反向）
- 四轴定义变更（新增轴、某轴细化）
- 差分硬门禁规则变化
- 新 eval CLI 能力上线（`eval compare`、`eval experiment`、`fingerprint diff`）

相关文件：

- `docs/planning/research/eval-position.md` — 研究冲刺产出（含后续 addendum）
- `docs/planning/RoadMap.md` M3 — 实现节奏
- `docs/planning/dogfood-playbook.md`（待建）— dogfood 类证据的结构化流程
