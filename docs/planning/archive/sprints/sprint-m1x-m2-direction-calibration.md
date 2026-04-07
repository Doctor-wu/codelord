# Codelord — 已关闭冲刺：方向校准（M1X / M2 转折点）

> 关闭时间：2026-04-07
> 状态：✅ 全部完成条件已满足

---

## 冲刺身份

- **阶段**：方向校准：`M1X / M2` 转折点
- **目标**：停止沿着局部痛点继续补 trace 字段，先完成整个 trace 主题的研究与立场；同时补齐两个已经暴露在 operator 面前、但仍处于半悬挂状态的基础能力：reasoning 等级控制、command + 联想

## 完成条件（全部达成）

- [x] 完成 **trace 全量研究**，而不是只研究局部 diagnostics
- [x] 输出 **trace 立场说明**：明确 codelord 的 trace 北极星、一等事实、消费面边界
- [x] 明确 **实时投影 / 持久化账本 / 回放 / 评测 / 审计** 的边界关系
- [x] 明确 trace 后续实现顺序：哪些先做、哪些后做、哪些明确暂不做
- [x] reasoning 至少支持 **operator 可设置的等级 / 预算基线**
- [x] operator command 成为 **可发现的一等交互面**
- [x] composer 提供 **最小 command 联想 / 提示**
- [x] 当前 sprint 改写后的方向已经在 `docs/planning/RoadMap.md` 中反映为稳定路线

## 交付物

### Trace 研究与立场

- 产出：`docs/planning/research/trace-position.md`
- 核心结论：三层 trace 模型（Provider / Agent Core / User）、跨层稳定 identity、5 个消费面分层投影
- Trace 与 hooks 关系辨析：平级消费者，不是谁建在谁之上
- RoadMap M2 section 已更新，trace 实现顺序已写入

### Reasoning Level

- `packages/config/src/schema.ts` — 新增 `ReasoningLevel` 类型和 `reasoningLevel` config 字段
- `packages/agent-core/src/runtime.ts` — 替换硬编码为动态 reasoning level，暴露 get/set
- `agents/coding-agent/src/cli/repl.ts` — 新增 `/reasoning` 命令
- 复用 pi-ai 的 `ThinkingLevel` 兼容层，不自己做 provider 适配

### Command System

- 新建 `agents/coding-agent/src/cli/commands.ts` — 结构化 Command Registry
- `InputComposer.tsx` — 新增 `CommandSuggestions` 组件（输入 `/` 时显示匹配命令）
- `HintBar` 改为 "/ for commands · Enter to send"
- `repl.ts` 命令匹配改用 registry

## 这轮冲刺学到了什么

1. **"哪里疼补哪里"是 trace 最大的反模式。** 如果不先定义三层模型和一等事实，每加一个 trace 字段都是在堆补丁。先停下来做整题研究的决定是正确的。
2. **pi-ai 已经是 reasoning 的兼容层。** 不需要自己做 provider 适配，直接暴露 pi-ai 的 ThinkingLevel 就行。
3. **Trace 和 hooks 的依赖方向容易搞反。** 直觉是"基于 hooks 做 trace"，但 hooks 只暴露 agent core 层的外部切面，看不到 provider 层和 runtime 内部状态。正确方向是两者都消费 event spine。
4. **Agent core 层的 trace 是行业空白。** Claude Code 生态的 trace 方案都不记录 runtime 如何组装 tool call、如何做 routing/safety decision。这是 codelord 的差异化机会。
5. **命令可发现性不是 UI polish，是 operator control 的一部分。** 没有联想提示的隐式命令等于不存在。

## Top 3 Unknown Unknowns（回收到 roadmap）

1. **三层 trace 模型在实际 schema 设计时是否会遇到数据冗余或性能问题？** 当前只定义了概念模型，还没写过真实的 trace schema v2。provider 层事件如果全量记录，trace 体积可能显著增大。
2. **command registry 后续是否需要支持插件注册的命令？** 当前是静态的 3 个命令，但如果 MCP 或 skill 系统需要注册自己的命令，registry 的设计可能需要扩展。
3. **reasoning level 对任务完成质量的实际影响有多大？** 当前只做了控制面，还没有 eval 数据证明不同 level 的效果差异。这需要 M3 eval 来回答。
