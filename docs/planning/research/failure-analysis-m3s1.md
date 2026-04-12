# M3-S1 失败模式分析

> 本文档是 M3-S1（外部 Benchmark Fast Bootstrap）冲刺的核心产出之一。
> 目标不是分数本身，而是"为什么失败"的结构化分析，直接指导后续 roadmap 优先级。

---

## 基线数据总览

| Benchmark | Model | 子集 | 指标 | 值 |
|-----------|-------|------|------|----|
| Polyglot Python | Sonnet 4.6 | 20 题 | pass@1 | 100% |
| Polyglot Rust | Sonnet 4.6 | 30 题 | pass@1 / pass@2 | 93.3% / 96.7% |
| SWE-bench Verified | Sonnet 4.6 | 5 题 | pass@1 | 20%（1/5）|
| BrowseComp | Sonnet 4.6 | 5 题 | accuracy | 40%（2/5）|
| Terminal-Bench 2.0 | Sonnet 4.6 | 3 题 | resolution rate | 33%（1/3）|

---

## 失败 Case 逐一分析

### Polyglot Rust（2 失败 / 30 题）

**rust/decimal — 两次均失败（pass@2 仍失败）**
- 失败原因：缺少必要的 trait implementation
- 归类：**推理错误** — 模型看到了 Exercism 的题目要求，但没有正确推理出需要实现哪些 trait
- 指向：M5 Skill（语言 best practice skill 可以提示 "Rust Exercism 题目通常需要实现 Display/FromStr 等 trait"）

**rust/ocr-numbers — 第一次失败，retry 成功**
- 失败原因：第一次留了 `todo!()` 未完成
- 归类：**执行不完整** — 模型开始了正确方向但没有完成
- 指向：M5 Skill（self-verification skill：改完后跑测试确认，而不是留 todo 就提交）

### SWE-bench Verified（4 失败 / 5 题）

所有失败 case 来自 astropy 项目。

**astropy-13033 — unresolved**
- 产出 patch 但未通过测试
- 归类：**context 不够 + 推理错误** — astropy 是大型 repo，agent 没有足够的 codebase 理解来做出正确修改
- 指向：M4（Context Engineering — codebase indexing + working set）

**astropy-13236 — unresolved**
- 产出 patch 但未通过测试
- 归类：**context 不够** — 同上
- 指向：M4

**astropy-13398 — unresolved**
- 产出 patch 但未通过测试
- 归类：**context 不够** — 同上
- 指向：M4

**astropy-13453 — empty patch**
- 没有产出任何修改
- 归类：**context 不够** — agent 在大型 repo 中迷路，找不到需要修改的文件
- 指向：M4（codebase 探索策略 + 项目地图）

### BrowseComp（3 失败 / 5 题）

**#2 — agent response 为空（error: terminated）**
- trace 分析：0 LLM calls，0 tokens，314 秒纯 thinking → 代理断连
- 归类：**环境问题（代理 API 超时）** — 首次 LLM 调用的 extended thinking 超过代理超时限制
- 指向：adapter/infra（已通过 reasoning=low 缓解）

**#3 — agent response 为空（error: terminated）**
- trace 分析：41 步，68×web_search + 12×web_fetch，$2.03。最后一步写答案时 307 秒 text streaming → 代理断连
- 归类：**环境问题（代理 API 超时）** — 所有搜索工作完成但最终答案输出被超时截断
- 指向：adapter/infra
- 附注：这道题暴露了一个架构问题——agent 做了 $2 的搜索但 text 为空，如果能从 trace 中降级提取部分 thinking 内容，可以挽救部分结果

**#4 — agent response 为空**
- 与 #2/#3 相同模式
- 归类：**环境问题（代理 API 超时）**

**BrowseComp 额外发现——工具选择问题（已修复）：**
- 初始运行中 agent 用 37 次 bash curl 代替 web_search/web_fetch，导致 209K tokens / $0.73 / 439 秒
- 修复 bash contract + system prompt 后，同一题用 4×web_search + 4×web_fetch，25K tokens / $0.10 / 63 秒（7x 提速）
- 归类：**tool 选错** — bash contract 缺少 curl/wget 禁用规则
- 指向：Tool Router / Contract 改进（已完成）

### Terminal-Bench 2.0（2 失败 / 3 题）

**gpt2-codegolf — AgentSetupTimeoutError**
- 安装环节超时：环境搭建 11 分钟 + agent 安装（nvm + Node.js）6 分钟 → 超过 360 秒限制
- 归类：**环境问题（安装超时）** — Node.js 在容器内安装太慢
- 指向：adapter/infra（优化安装方式：预编译 Node 二进制 / 减小 bundle 体积 / 使用 Harbor 的 agent_setup_timeout_multiplier）

**llm-inference-batching-scheduler — NonZeroAgentExitCodeError + reward=0.0**
- agent 实际执行了 130 秒，使用了 ls、file_read、bash 工具
- codelord 退出码 = 1（error outcome）
- verifier 运行并打分 0.0：agent 未产出满足阈值的 plan 文件
- 归类：**推理错误 + 任务复杂度超出当前能力** — 这是一个需要算法设计 + 数值优化的复杂任务
- 指向：M5 Skill（planning skill — 复杂任务先分析再实现）+ 模型能力

---

## 失败模式归类分布

| 失败模式 | 出现次数 | 占比 | 涉及 Benchmark | 指向 |
|----------|---------|------|----------------|------|
| **环境问题（代理 API 超时）** | 3 | 27% | BrowseComp ×3 | adapter/infra |
| **Context 不够** | 4 | 36% | SWE-bench ×4 | **M4** |
| **推理错误** | 2 | 18% | Polyglot ×1, Terminal-Bench ×1 | M5 |
| **执行不完整** | 1 | 9% | Polyglot ×1 | M5 |
| **环境问题（安装超时）** | 1 | 9% | Terminal-Bench ×1 | adapter/infra |

> Tool 选错问题（BrowseComp 初始运行）已在本冲刺中修复，不计入失败统计。

---

## 关键发现

### 1. Context Engineering 是当前最大瓶颈（指向 M4）

SWE-bench 4/4 失败全部归因于 context 不足。在真实大型 repo（astropy）上，agent 缺少：
- **项目地图**：不知道 repo 的整体结构，无法快速定位相关文件
- **Working Set**：没有持续跟踪当前任务相关的文件集合
- **Context 组装策略**：不知道 bug fix 类任务应该先看什么（error message → test → source）

这是 codelord 当前分数与行业领先 scaffold（如 SWE-agent、OpenHands）的核心差距所在。行业数据表明同一模型不同 scaffold 可以产生 22+ 分差距，而这个差距主要来自 context engineering。

### 2. Skill System 有明确的改进空间（指向 M5）

3 个失败涉及推理错误或执行不完整：
- Rust trait 实现遗漏 → 语言最佳实践 skill
- 留 todo 未完成 → self-verification skill（改完跑测试）
- 复杂优化任务无法解决 → planning skill（先分析 cost model 再实现）

这些都是可以通过 prompt fragment 注入的行为改进，不需要改 agent core。

### 3. 环境问题是噪音，不是能力问题

4 个失败（BrowseComp ×3 + Terminal-Bench ×1）是环境配置问题：
- 代理 API 超时：reasoning=low 已缓解，但长任务仍有风险
- 容器安装超时：可通过预编译 / 减小 bundle / 增加 timeout 解决

这些不反映 agent 的真实能力，应该在 infra 层面解决而不是在 M4/M5 中。

### 4. Polyglot 满分证明裸模型能力不是瓶颈

Python 100% + Rust 93.3% 说明 Sonnet 4.6 在单文件编程题上碾压。scaffold 在这类任务上几乎不构成差异。这进一步印证：**codelord 的改进空间在 context engineering 和 skill，不在模型选择**。

### 5. BrowseComp 工具选择修复效果显著

bash curl → web_search/web_fetch 的切换带来 7x 提速、8x token 降低。这证明了：
- Tool contract + system prompt 对 agent 行为有显著引导作用
- 后续 M5 的 skill 系统有很大的优化空间

---

## 后续 Roadmap 优先级建议

基于失败模式分布，建议后续优先级：

### 优先级 1：M4 Context Engineering（36% 失败归因）

这是最高 ROI 的改进方向。具体建议：
1. **Codebase Indexing**：进入新 repo 时建立基础索引（目录结构、关键入口、依赖文件）
2. **Task-Aware Context Assembler**：根据任务类型（bug fix / feature / refactor）自动装配相关 context
3. **Working Set Builder**：维护当前任务的活跃文件集合，避免每轮重新探索

预期影响：SWE-bench pass@1 从 20% 提升到 30-40%（保守估计），与行业入门水平对齐。

### 优先级 2：M5 Skill System（27% 失败归因）

具体建议的首批 skill：
1. **self-verification** — 改完后跑测试确认（消除 Polyglot "留 todo" 类失败）
2. **planning** — 复杂任务先分析再实现（消除 Terminal-Bench 复杂任务类失败）
3. **language best practice** — 语言特定的 trait/pattern 提示（消除 Polyglot Rust trait 遗漏类失败）

预期影响：Polyglot pass@1 从 93% 提升到 97%+，Terminal-Bench 复杂任务成功率提升。

### 优先级 3：Infra 优化（36% 失败但均为环境问题）

这些不需要 M4/M5 就能修复：
1. **Terminal-Bench 安装优化**：预编译 Node 二进制 / 使用 Alpine + 静态链接 / 增加 setup timeout
2. **BrowseComp 代理超时缓解**：reasoning=low 已初步缓解，考虑加 retry / 分段输出 / 直连 API

预期影响：消除环境相关的假阴性，让基线数据更准确反映真实能力。

---

## 与行业对标

| 指标 | codelord (当前) | 行业 SOTA | 差距原因 |
|------|----------------|-----------|----------|
| SWE-bench Verified | ~20% (5题) | ~65% (Codex CLI + GPT-5.2) | Context Engineering |
| Terminal-Bench 2.0 | ~33% (3题) | ~63% (Codex CLI + GPT-5.2) | Context + Skill + 环境优化 |
| Aider Polyglot | ~93% (Rust) | ~95%+ (frontier) | 已接近上限 |

**核心差距在 scaffold，不在模型。** codelord 用的是 Sonnet 4.6（与 frontier 相当的模型），但 scaffold 还处于 M2 阶段（可观测性刚完成）。M4 + M5 是弥补这个差距的关键。

---

*本分析基于 M3-S1 的子集基线数据。样本量较小（5-30 题），结论需要在后续全量运行（M3-S6）中验证。*
