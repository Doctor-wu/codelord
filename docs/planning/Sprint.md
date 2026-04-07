# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：专项治理：方案重构 + 质量治理
- **目标**：在推进下一个 milestone 之前，把当前代码的架构债务、交互缺陷和产品表面问题系统性清理一遍。不是 polish，是还债。
- **状态**：进行中

## 为什么有这一轮冲刺

上一轮冲刺完成了 trace 立场、reasoning level、command system。但在 dogfooding 过程中暴露了大量质量问题——不是功能缺失，而是已有功能的实现方案有问题：runtime 语义不对、渲染代码没设计、交互细节粗糙、代码组织混乱。

如果不在这里停下来治理，后续每一个 milestone（trace schema v2、eval、context engineering）都会在烂地基上盖楼。

## 完成条件

以下条件全部满足后，这轮冲刺才算完成：

- [ ] Runtime 语义修正全部完成（interrupt、queue）
- [ ] 代码组织重构完成（manager 提取、职责划分）
- [ ] 渲染层重构完成（组件拆分、reasoning 显示修正、header/footer 重做）
- [ ] 交互体验修正完成（command 补全、首屏信息）
- [ ] README 重写完成
- [ ] `pnpm typecheck` 和 `pnpm test` 全部通过
- [ ] dogfooding 确认关键痛点已消除

---

## A. Runtime 语义修正

### A1. Interrupt 简化 — 去掉多余的 PAUSED 状态

**问题**：interrupt 后进入 `BLOCKED(interrupted)` 并在 UI 显示 "PAUSED" 状态，但用户期望的是中断后直接可以继续交互——输入下一条消息即可，不需要一个额外的 "PAUSED" 中间态。

**期望行为**：interrupt 后 runtime 进入 READY 而不是 BLOCKED。用户的下一条输入直接开始新的 burst，不需要先"恢复"。PAUSED 状态从 UI 中去掉，interrupt 后直接回到 idle 态。

**涉及文件**：`runtime.ts` 的 interrupt 处理逻辑、`App.tsx` / `InputComposer.tsx` 的 mode 派生、`timeline-projection.ts` 的 status item 生成。

### A2. Queue 入队时机修正

**问题**：`drainPending()` 在每次 LLM call 前和每次 tool batch 后都会被调用，导致用户在 agent 运行中输入的消息会在下一个安全边界就被注入上下文。用户的心理模型是"我发的消息应该在当前 burst 结束后才被处理"。

**期望行为**：queue 中的消息只在以下两个时机被 drain：
1. 当前 burst 正常结束（所有 steps 跑完，LLM 返回 stop）
2. 当前 burst 被 interrupt

在 burst 内部的 step 之间不 drain。这意味着删掉 `run()` 主循环内的 `drainPending()` 调用，只在 burst 退出路径上 drain。

**涉及文件**：`runtime.ts` 的 `run()` 方法。

---

## B. 代码组织重构

### B3. 从 runtime 中提取 manager 层

**问题**：`runtime.ts` 近 1000 行，把 FSM 状态管理、消息调度、tool execution、usage tracking、checkpoint 协调、reasoning state 管理全摊在一个 class 里。没有任何内部模块化。

**期望**：至少提取以下 manager：
- `MessageManager` — 消息队列、drain、注入逻辑
- `UsageTracker` — token/cost 累计、per-call snapshot
- `InterruptController` — interrupt flag、abort controller、consumeInterrupt
- `ReasoningManager` — reasoning state 创建、更新、投影（和 A1/A7 联动）

每个 manager 是纯逻辑类，runtime 持有并委托。manager 不直接 emit 事件，通过回调或返回值让 runtime emit。

### B4. 从 ink-renderer 中提取更清晰的架构

**问题**：`ink-renderer.tsx` 里混了 `TimelineStore`（状态管理）、`InputBridge`（输入协调）、`Bridge`（React 组件）和 `InkRenderer`（公共 API）四个不同职责的东西。`InputBridge` 自己实现了一套 pub/sub 来协调状态，对单进程 TUI 来说过度设计。

**期望**：
- `TimelineStore` 独立为文件（它是纯状态逻辑，不依赖 React）
- `InputBridge` 简化为回调模式，去掉 subscribe/listener 机制
- `Bridge` 组件逻辑合并进 `App`（或作为 thin wrapper），减少一层间接
- 修复 `onLifecycleEvent` 里的死代码（第 361-364 行空函数体 + 注释）

### B5. 渲染组件拆分

**问题**：`App.tsx` 里内联了 `UserItemView`、`AssistantItemView`、`StatusItemView` 等组件。`AssistantItemView` 特别复杂——两种 display mode、reasoning viewport、live proxy fallback——全部塞在一个函数里。

**期望**：
- `UserItemView` → `UserCard.tsx`
- `AssistantItemView` → `AssistantCard.tsx`（内部再拆 `ReasoningViewport` 和 `ReasoningProxy`）
- `StatusItemView` → `StatusCard.tsx`
- `App.tsx` 只保留布局和分发逻辑

---

## C. 交互体验修正

### C6. 首屏 header 重做

**问题**：启动 codelord 后首屏只有一行 "codelord v0.x.x · model" 和一条分割线。没有 logo，没有工作区信息，没有 reasoning level，视觉冲击力为零。

**期望**：
- 设计一个简单的 ASCII logo（不需要很大，3-5 行即可）
- 首屏 header 显示：logo + 版本、当前工作区路径、provider + model、reasoning level
- header 是一次性展示，不随滚动消失（或者用更小的 sticky 版本）

### C7. Reasoning 显示修正

**问题**：当 reasoning level 设为 `off` 时，UI 仍然显示 "Thinking" 加载态。原因是 `runtime.ts` 第 484 行每个 step 都无条件创建 `ReasoningState`，而 UI 只要看到 reasoning state 存在就渲染 thinking indicator。

**期望**：
- 当 `reasoningLevel === 'off'` 时，不创建 `ReasoningState`
- UI 只在真正有 thinking 事件（`thinking_start`/`thinking_delta`）时才显示 reasoning lane
- 没有 reasoning 事件时，assistant item 直接从 text 开始渲染，不留空白的 thinking 占位

### C8. Footer 重做

**问题**：当前 `TimelineStatusBar` 显示 steps/maxSteps（没人关心）、tool category counts（太细碎）、tokens/cost（有用但排版差）。而 model、reasoning level、状态 indicator 这些更有用的信息没有在 footer 里。另外 header 里的状态 indicator 在长对话时会被挤到不可见。

**期望**：
- Footer 显示：状态 indicator（IDLE/LIVE/PAUSED/YOUR TURN）、model、reasoning level、tokens、cost、elapsed time
- 去掉 steps/maxSteps 和 tool category counts
- 状态 indicator 从 header 移到 footer（因为 footer 始终可见）
- header 只保留 logo/版本和首屏信息，不再承担运行时状态展示

### C9. Command 补全和选择升级

**问题**：当前 command 联想只是显示匹配列表，不能用上下键选择，不能 Tab 补全。和"可发现的一等交互面"还有差距。

**期望**：
- 输入 `/` 后显示命令列表，支持上下键高亮选择
- Tab 或 Enter 补全选中的命令
- 补全后如果命令有参数（如 `/reasoning`），光标停在命令后面等待输入参数
- 没有匹配时不显示列表

### C10. README 重写

**问题**：当前 README 是面向开发者的技术文档（工作区布局、常用命令、文档入口），不是面向用户的产品介绍。用户打开 GitHub 看不出 codelord 是什么、有什么特别、怎么用。

**期望**：README 重写为面向用户的产品页面：
- 一句话说清 codelord 是什么
- 3-5 个核心特性（用简短描述，不是技术实现细节）
- Quick Start（安装 + 第一次使用）
- 一个简单的 demo/截图/gif（如果可能的话）
- 然后才是开发者文档链接

---

## D. 额外发现的问题

### D11. `onLifecycleEvent` 死代码

**位置**：`ink-renderer.tsx` 第 361-364 行。注释写着要 "trigger a queue re-read" 但函数体是空的。

**修复**：要么实现它（如果确实需要），要么删掉注释和空代码块。

### D12. Trace 记录对 currentStep 的不必要依赖

**问题**：trace 记录逻辑里有些地方会检查 "是否有 currentStep" 才记录事件，但有些事件（如 lifecycle 级别的 control-plane 事件）天然发生在 step 之外。这导致 step 外的事件丢失。

**修复**：trace 记录应该独立于 step 概念。任何 event spine 事件都应该被记录，不管当前是否在某个 step 内。

### D13. Reasoning state 应由事件驱动而非预创建

**问题**（和 C7 相关但更深层）：当前每个 assistant turn 开始时就预创建 `AssistantReasoningState`（`createReasoningState()`），状态为 `'thinking'`。这意味着即使 LLM 根本不支持 reasoning，UI 也会看到一个 `thinking` 状态的 reasoning state。

**修复**：`_currentReasoning` 初始为 `null`。只有在收到 `thinking_start` 事件时才创建。`AssistantItemView` 只在 reasoning state 非 null 时才渲染 reasoning lane。这从根本上修复了"reasoning 关了还显示 Thinking"的问题。

---

## 实施顺序建议

建议按以下顺序执行，因为后面的改动依赖前面的：

1. **B3** — runtime manager 提取（最大的结构性改动，先做了后面改 runtime 逻辑更安全）
2. **A1 + A2** — interrupt 和 queue 语义修正（在新的 manager 结构上改）
3. **D13 + C7** — reasoning state 改为事件驱动（修复显示问题的根因）
4. **B4 + B5** — renderer 架构清理和组件拆分
5. **C8** — footer 重做（依赖组件拆分完成）
6. **C6** — 首屏 header / logo
7. **C9** — command 补全升级
8. **D11 + D12** — 死代码和 trace 小修
9. **C10** — README 重写（最后做，因为改完产品行为后才知道该怎么描述）

---

## 范围外

- 不推进 trace schema v2 实现（那是下一个 sprint）
- 不推进 M3 eval
- 不推进 M4 context engineering
- 不新增功能——本轮只修已有的东西
- 不做大的 event spine 重构——只修 bug 和提取 manager

## 证据标准

- 每项改动必须通过 `pnpm typecheck` 和 `pnpm test`
- runtime 语义修正（A1/A2）需要手动验证：interrupt 后直接输入能工作、queue 消息在 burst 结束后才被处理
- reasoning 修正（C7/D13）需要手动验证：`/reasoning off` 后完全没有 thinking 态
- 首屏和 footer 需要截图确认视觉效果
- README 需要从"第一次看到这个项目的人"视角审阅

## 风险与提醒

- B3（runtime manager 提取）是最大风险项——动 runtime 内部结构容易引入回归。建议频繁跑测试。
- A2（queue 时机修正）可能影响"运行中纠偏"的交互模式。需要想清楚用户运行中发的消息到底什么时候该生效。
- 不要在重构过程中顺手加新功能。本轮的目标是"把已有的东西做对做好"。

## 冲刺关闭时要回写什么

- `docs/planning/RoadMap.md`（如果某些 M1/M1X/M2 的完成状态因重构发生变化）
- `docs/planning/DecisionLog.md`（如果 interrupt/queue 语义修正改变了产品行为的定义）
- 如有必要：相关 module 文档
