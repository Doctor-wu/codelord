# Codelord — Eval 立场说明

> 日期：2026-04-08
> 阶段：M3 全局研究冲刺产出
> 状态：✅ 立场已确立，等待进入实现冲刺

---

## 我们研究了什么

- Anthropic "Demystifying evals for AI agents"（2026-01-09）— agent eval 的系统性方法论
- SWE-bench 系列（Verified / Pro / Multilingual）的设计哲学、接入方式和评判机制
- Aider Polyglot Benchmark 的设计（225 题 / 6 语言 / 两次机会）
- Eval-driven development 在 Claude Code、Codex、Bolt、Descript、v0 (Vercel)、AWS DevOps Agent 等产品中的实践
- LLM-as-Judge 的能力边界（G-Eval / DAG / CourtEval）和校准方法
- 行业 eval 框架生态（DeepEval、Braintrust、LangSmith、Harbor、promptfoo）
- ezyang 的个人 coding benchmark 实践（codebase tasks vs transcript tasks）
- Agent scaffolding 对 benchmark 分数的影响（同一模型不同 scaffold 可产生 22+ 分差距）

---

## 共性规律

以下是生产级 coding agent 团队都在遵循的 eval 实践，我们视为行业共识：

1. **Deterministic grader 优先**：能用测试通过 / 文件 diff / 输出匹配判定的，绝不用 LLM judge。Coding agent 天然适合 deterministic grader——代码能不能跑、测试过不过就是最好的判定。

2. **评结果不评路径**：不检查具体 tool call 序列。Agent 经常找到 eval 设计者没想到的有效方案，检查路径会让 eval 变脆并惩罚创造性。

3. **环境隔离**：每次 trial 从干净环境开始（Docker / sandbox），防止状态泄漏导致相关失败或虚假成功。

4. **多次运行取统计量**：单次 pass/fail 不可靠。至少 N≥3 次取 pass rate，非确定性系统必须靠统计。

5. **pass@k 与 pass^k 区分体验和一致性**：pass@k 衡量"至少一次成功"（能力上限），pass^k 衡量"每次都成功"（可靠性）。k=1 时两者相同。

6. **Eval 分层运行**：smoke（每次改动，分钟级）→ core（每次 release，小时级）→ full（大改动，数小时）→ research（A/B 实验，按需）。

7. **外部 benchmark 给绝对坐标，内部 golden set 指导产品方向**：两者互补不替代。SWE-bench 分数告诉你行业水位，内部 case 告诉你产品该往哪改。

8. **Capability eval 毕业为 regression eval**：pass rate 稳定后，capability eval 转为回归门禁。

9. **Eval 飞轮**：observe（trace 记录一切）→ analyze（发现失败模式）→ evaluate（失败转为 case）→ improve（hillclimb against eval）→ 重复。

---

## 产品选择

以下是各家做法不同的地方，codelord 需要做出自己的选择：

### 1. 测模型裸能力 vs 测产品能力

SWE-bench 官方用 bash-only harness（mini-SWE-agent）评估模型裸能力。产品团队（Claude Code、Codex、Verdent）用自己的完整 scaffold 跑同一 benchmark，评估产品能力。

**codelord 选择**：两者都做。先用 codelord 完整 scaffold 跑获取产品基线，这是更优先的信号。未来可以用 mini-SWE-agent 对比，分离"模型贡献 vs scaffold 贡献"。

### 2. 先做内部 golden set 还是先对接外部 benchmark

行业共识是内部 golden set 更优先。但 codelord 当前处于没有任何量化数据的状态，也没有足够的 dogfooding 失败积累。

**codelord 选择**：先用 SWE-bench + Aider Polyglot fast bootstrap 获取第一批基线数据和失败模式分析，再基于这些分析 + dogfooding 经验建立内部 golden set。外部 benchmark 是 bootstrap 手段，不是最终产品目标。

### 3. LLM-as-Judge 的使用边界

Coding agent 社区共识：能 deterministic 就不 LLM judge。LLM judge 主要用在 reasoning quality、code style、instruction following 等没有硬判定标准的维度。LLM judge 非确定性且更贵，需要和人类判断校准。

**codelord 选择**：M3 前期不引入 LLM-as-Judge。先用 deterministic grader 覆盖所有能覆盖的维度。LLM judge 属于 M3 后期，用于 reasoning quality / tool reason quality / code quality 评估。

### 4. 是否自建 eval 平台

行业有大量 eval 框架（DeepEval、Braintrust、LangSmith 等），但也有很多团队用简单脚本开始。

**codelord 选择**：不自建平台，不依赖外部框架。Eval 是 codelord CLI 的内置命令（`codelord eval run / compare / experiment`），和 trace、session 一样是一等公民。保持轻量，按需扩展。

---

## Codelord 继承什么

- **Anthropic 的 eval 术语体系**：task / trial / grader / transcript / outcome / eval suite — 直接采用，不另起术语
- **Deterministic grader 优先原则**
- **评结果不评路径原则**
- **Capability eval + regression eval 双轨制**
- **pass@k / pass^k 双指标**
- **Eval-driven development 工作流**：改动 → 跑 eval → 看分数 → 决策
- **Eval 飞轮模型**：observe → analyze → evaluate → improve

## Codelord 拒绝什么

- **不做 "eval 框架先行"**：不先花两周搭完美的 eval 基础设施再开始跑第一个 case。用临时脚本先跑出数据，再规范化框架
- **不做 "自研 eval 平台"**：不重造 Braintrust / DeepEval。codelord 的 eval 是内置 CLI 命令
- **不在 M3 前期引入 LLM-as-Judge**：先用 deterministic grader 把基础打好
- **不把外部 benchmark 分数作为产品优化目标**：SWE-bench / Aider Polyglot 分数是参考坐标，不是 KPI。产品目标由内部 golden set 定义
- **不检查 tool call 序列**：eval 评判最终 outcome，不评判 agent 走了什么路径

---

## Codelord 的 Eval 北极星

**Eval 的存在是为了让每一个改动（prompt / skill / context / tool / model）都有可量化的判定：是变好了还是变差了。**

不是为了证明 codelord "有多强"，而是为了让后续开发从 "感觉" 变成 "证据"。

---

## Eval 如何驱动后续开发

### 1. Eval 失败模式指导 roadmap 优先级

跑完 SWE-bench / Aider Polyglot 后，对失败 case 做 trace 分析，归类失败模式：

- 大部分失败因为 context 不够 / 不知道去哪找代码 → 优先 M4（Context Engineering）
- 大部分失败因为 tool 选错 / tool 用法有误 → 优先 router / contract 改进
- 大部分失败因为推理链断裂 / 规划不足 → 优先 M5（Skill System）
- 大部分失败因为模型能力不够 → 等更好的模型，或优先 M7（Model Routing / Thinking Budget）

### 2. Eval 分数作为改动的 gate

prompt 改了 → 跑 smoke eval → 分数没降才合并。这是最基础的 eval-driven development 循环。

### 3. Eval case 就是产品定义

codelord 应该能做什么，写成可执行的 case，不是模糊的文字描述。两个工程师对同一个 spec 可能有不同理解，eval suite 消除这种歧义。

### 4. 新模型上线的快速验证

换 model → 跑 eval → 几小时内知道该不该切，不再需要数周手动测试。

### 5. Capability eval 标记未来押注

为 codelord 当前做不到但未来可能做到的任务写 eval case，起始 pass rate 低。新模型或新 skill 上线后跑一遍，快速揭示哪些押注成功了。

---

## Trace 在 Eval 中的角色

Anthropic 文章中的 transcript / trace / trajectory 是同一个东西的三个同义词。codelord 的 Trace v2 三层模型已经覆盖了 eval 所需的 transcript 数据。

Trace 在 eval 中的消费方式：

- **诊断失败原因**：eval 失败时，trace 告诉你问题出在 provider 层（模型没生成正确内容）、agent core 层（runtime 没正确调度）、还是 user 层（task spec 有歧义）
- **归类失败模式**：从 trace 中提取 tool usage pattern、reasoning chain、error recovery 行为，归类为系统性问题
- **Eval grader 的输入**：deterministic grader 检查 outcome，但 LLM judge 评估 trace 中的推理质量和行为模式

Trace 不需要额外改造来服务 eval。Eval harness 需要做的是：捕获 outcome（环境最终状态），这是 eval runner 的职责，不是 trace 的职责。

---

## 外部 Benchmark 接入策略

### SWE-bench Verified

- **测什么**：repo 级理解力、bug 定位、代码修复、回归防护
- **怎么接**：codelord adapter 把 issue description 作为输入 → `runHeadless()` 在 Docker 容器里运行 → 提取 git diff → 交给 SWE-bench eval harness 评判
- **评判标准**：fail-to-pass 测试通过 + pass-to-pass 测试不回归
- **预期基线**：< 20%（没有 M4 codebase indexing / M5 skill system）
- **价值**：暴露 codelord 在 repo 级任务上的系统性短板

### Aider Polyglot

- **测什么**：多语言编辑能力、错误修复能力（给两次机会，第二次能看测试失败信息）
- **怎么接**：codelord adapter 把 Exercism 题目作为输入 → `runHeadless()` → 修改代码 → 运行测试判定
- **评判标准**：Exercism 单元测试通过
- **预期基线**：待定，取决于 codelord 的 file_edit 可靠性和多语言支持
- **价值**：测试 codelord 工具链的基本编辑能力，与模型裸能力对比

### 两者的互补关系

SWE-bench 测 "在复杂 repo 里定位和修复问题" 的能力（更贴近真实使用）。Aider Polyglot 测 "根据 spec 写/改代码" 的基础能力（更纯粹的编辑能力基线）。前者更能指导 M4/M5 方向，后者更能指导工具链改进方向。

---

_这份立场说明会随着 M3 实施过程中的数据和发现持续更新。_
