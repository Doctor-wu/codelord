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

- [x] Runtime 语义修正全部完成（interrupt、queue）
- [x] 代码组织重构完成（manager 提取、职责划分）
- [x] 渲染层重构完成（组件拆分、reasoning 显示修正、header/footer 重做）
- [x] 交互体验修正完成（command 补全、首屏信息）
- [ ] Trace 存储结构改为时间线排序
- [ ] README 重写完成
- [ ] `pnpm typecheck` 和 `pnpm test` 全部通过
- [ ] dogfooding 确认关键痛点已消除

---

## A. Runtime 语义修正

### ~~A1. Interrupt 简化~~ ✅

interrupt 后 runtime 直接进入 READY，返回 `{ type: 'interrupted' }` outcome。UI 去掉了 PAUSED 状态和所有 interrupted 分支。timeline 里插入一条 "⏸ Interrupted — ready for your next input" 轻量提示。

### ~~A2. Queue 入队时机修正~~ ✅

删掉了主循环内 mid-burst 的 `drainPending()` + `consumeInterrupt()` 调用。queue 消息只在 burst 正常结束（LLM 返回 stop）时 drain。burst 开头的 drain 保持不变。

---

## B. 代码组织重构

### ~~B3. 从 runtime 中提取 manager 层~~ ✅

提取了 4 个 manager：`MessageManager`(56行)、`UsageTracker`(68行)、`InterruptController`(34行)、`ReasoningManager`(66行)。runtime.ts 从 997 行降到 756 行。同时修复了 D13（`ReasoningManager.beginTurn()` 在 `level=off` 时返回 null）。

### ~~B4. 从 ink-renderer 中提取更清晰的架构~~ ✅

`TimelineStore` 独立为文件（121行）、`InputBridge` 简化为回调模式（65行）、`Bridge` 合并进 `App`、死代码（D11）已清理。ink-renderer.tsx 从 412 行降到 93 行。

### ~~B5. 渲染组件拆分~~ ✅

拆出 `UserCard.tsx`(22行)、`AssistantCard.tsx`(75行)、`StatusCard.tsx`(26行)。App.tsx 从 251 行降到 128 行。

---

## C. 交互体验修正

### ~~C6. 首屏 header 重做~~ ✅

6 行 block-character CODELORD logo + 版本 + `~/path · ◎ model · reasoning:level` 信息行。纯首屏展示，不承担运行时状态。

### ~~C7. Reasoning 显示修正~~ ✅

`timeline-projection.ts` 中 `assistant_turn_start` 的 `liveProxy` 改为 `event.reasoning ? 'Thinking…' : null`。配合 B3 的 `ReasoningManager.beginTurn()` 返回 null，`/reasoning off` 后完全没有 Thinking 态。

### ~~C8. Footer 重做~~ ✅

新建 `Footer.tsx`：左=状态 indicator（IDLE/LIVE/YOUR TURN），中=model · reasoning level，右=tokens · cost · elapsed。去掉了 steps/maxSteps 和 tool category counts。状态 indicator 从 Header 移到 Footer。reasoningLevel 通过 InputBridge 的 onChange 机制支持动态更新。

### ~~C9. Command 补全和选择升级~~ ✅

InputComposer 增加上下键导航、Tab/Enter 补全、Esc 关闭。CommandSuggestions 组件支持高亮选中项。输入完整命令时不显示建议，Enter 直接提交。

### C10. README 重写

**问题**：当前 README 是面向开发者的技术文档，不是面向用户的产品介绍。

**期望**：README 重写为面向用户的产品页面：
- 一句话说清 codelord 是什么
- 3-5 个核心特性
- Quick Start
- 然后才是开发者文档链接

---

## D. 额外发现的问题

### ~~D11. `onLifecycleEvent` 死代码~~ ✅

随 B4 修复。

### D12. Trace 记录对 currentStep 的不必要依赖

**问题**：trace 记录逻辑里有些地方会检查 "是否有 currentStep" 才记录事件，但有些事件天然发生在 step 之外。

**修复**：trace 记录应该独立于 step 概念。任何 event spine 事件都应该被记录，不管当前是否在某个 step 内。

### ~~D13. Reasoning state 应由事件驱动而非预创建~~ ✅

随 B3 修复。

---

## E. Trace 存储结构改造

### E14. Trace 改为统一时间线排序

**问题**：当前 trace 按 source 分成三个桶（providerStream / agentEvents / lifecycleEvents），无法快速还原事件发生顺序。

**期望**：改为单一事件数组按 `seq` 排序，通过 `source` 字段区分层。TraceRecorder 去掉分桶，直接 push 到统一数组。trace show CLI 按 seq 输出，行内用 `[P]`/`[A]`/`[L]` 前缀标记层。保持旧格式向后兼容。

---

## F. 渲染架构升级

### ~~F15. 混合渲染架构~~ ⏸ 延期

**问题**：running 时 Ink 高频 re-render 导致用户无法滚动查看历史消息。

**尝试过的方案**：
1. ~~stdout flush~~ ✗ — Ink 占据整个终端输出区域，stdout 写入被 Ink 下一次 re-render 覆盖
2. ~~Ink `<Static>`~~ ✗ — 渲染效果差，不可用

**根因分析**：这是 vanilla Ink 的架构限制。Ink 使用 cursor-up-then-redraw 模式，每次 re-render 都会把 cursor 拉回输出起点重绘，打断用户的滚动位置。Claude Code 通过 fork Ink 实现了 cell-level diff 渲染来解决这个问题。

**决定**：暂时接受 running 时不能滚动的限制。真正解决需要以下路径之一，都是大工程，不属于本轮 sprint：
- Fork Ink 实现增量渲染（Claude Code 的路，工作量大）
- 换 TUI 框架（如 blessed/terminal-kit 等有增量渲染能力的框架）
- 等 Ink 社区解决这个问题

**已写入 RoadMap 待办**：作为 M1X 的长期 UX 缺口记录。

---

## 实施顺序

1. ~~**B3** — runtime manager 提取~~ ✅
2. ~~**A1 + A2** — interrupt 和 queue 语义修正~~ ✅
3. ~~**D13 + C7** — reasoning state 改为事件驱动~~ ✅
4. ~~**B4 + B5 + D11** — renderer 架构清理和组件拆分~~ ✅
5. ~~**C8** — footer 重做~~ ✅
6. ~~**C6** — 首屏 header / logo~~ ✅
7. ~~**C9** — command 补全升级~~ ✅
8. ~~**F15** — 混合渲染架构~~ ⏸ 延期（vanilla Ink 限制）
9. **D12** — trace currentStep 依赖修复
10. **E14** — trace 统一时间线排序
11. **C10** — README 重写（最后做）

---

## 范围外

- 不推进 trace schema v2 的三层模型重建（那是下一个 sprint；本轮 E14 只是把现有数据从分桶改为时间线排序）
- 不推进 M3 eval
- 不推进 M4 context engineering
- 不做 Ink fork 或 TUI 框架迁移（F15 延期）

## 证据标准

- 每项改动必须通过 `pnpm typecheck` 和 `pnpm test`
- runtime 语义修正（A1/A2）✅
- reasoning 修正（C7/D13）✅
- 首屏和 footer ✅
- command 补全 ✅
- trace 时间线排序需要验证：`codelord trace show` 按时间序输出，行内标记 source 层
- README 需要从"第一次看到这个项目的人"视角审阅

## 风险与提醒

- ~~B3（runtime manager 提取）~~ ✅
- ~~A2（queue 时机修正）~~ ✅
- F15 已延期。running 时不能滚动是已知限制，记入 RoadMap 长期待办。
- E14（trace 排序改造）需要注意旧 trace 文件的向后兼容。

## 冲刺关闭时要回写什么

- `docs/planning/RoadMap.md`（F15 延期需要写入 M1X 长期缺口；interrupt/queue 语义变化需要更新 M1 section）
- `docs/planning/DecisionLog.md`（F15 的方案探索和延期决定值得记录）
- 如有必要：相关 module 文档
