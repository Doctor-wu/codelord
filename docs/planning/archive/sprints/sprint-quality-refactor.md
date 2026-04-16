# Codelord — 已关闭冲刺：专项治理（方案重构 + 质量治理）

> 关闭时间：2026-04-07
> 状态：✅ 完成条件已满足（F15 延期除外）

---

## 冲刺身份

- **阶段**：专项治理：方案重构 + 质量治理
- **目标**：在推进下一个 milestone 之前，系统性清理代码架构债务、交互缺陷和产品表面问题

## 完成条件（达成情况）

- [x] Runtime 语义修正全部完成（interrupt、queue）
- [x] 代码组织重构完成（manager 提取、职责划分）
- [x] 渲染层重构完成（组件拆分、reasoning 显示修正、header/footer 重做）
- [x] 交互体验修正完成（command 补全、首屏信息）
- [x] Trace 存储结构改为时间线排序
- [x] README 重写完成
- [x] `pnpm typecheck` 和 `pnpm test` 全部通过

## 交付物

### A. Runtime 语义修正

**A1. Interrupt 简化** ✅ — interrupt 后 runtime 进入 READY（不是 BLOCKED），返回 `{ type: 'interrupted' }` outcome。去掉了 PAUSED UI 状态。添加了 "⏸ Interrupted — ready for your next input" info 提示。

**A2. Queue 入队时机修正** ✅ — 删掉 mid-burst 的 `drainPending()` + `consumeInterrupt()` 调用。queue 只在 burst 正常结束时 drain。

### B. 代码组织重构

**B3. Runtime Manager 提取** ✅

- `message-manager.ts` (56行)、`usage-tracker.ts` (68行)、`interrupt-controller.ts` (34行)、`reasoning-manager.ts` (66行)
- runtime.ts: 997→756 行
- 同时修复 D13：`ReasoningManager.beginTurn()` 在 `level=off` 时返回 null

**B4. Renderer 架构清理** ✅

- `TimelineStore` → `timeline-store.ts` (121行)
- `InputBridge` → `input-bridge.ts` (65行)，简化为单个 `setOnChange` 回调
- Bridge 组件合并进 App
- 死代码（D11）清理
- ink-renderer.tsx: 412→93 行

**B5. 组件拆分** ✅ — `UserCard.tsx` (22行)、`AssistantCard.tsx` (75行)、`StatusCard.tsx` (26行)。App.tsx: 251→128 行。

### C. 交互体验修正

**C6. 首屏 Header** ✅ — 6 行 block-character CODELORD ASCII logo + 版本 + `~/path · ◎ model · reasoning:level` 信息行。

**C7. Reasoning 显示修正** ✅ — `liveProxy` 改为 `event.reasoning ? 'Thinking…' : null`。`/reasoning off` 后完全没有 Thinking 态。

**C8. Footer 重做** ✅ — 新 `Footer.tsx`：左=状态 indicator（IDLE/LIVE/YOUR TURN），中=model · reasoning level，右=tokens · cost · elapsed。去掉 steps/maxSteps 和 tool category counts。状态 indicator 从 Header 移到 Footer。ReasoningLevel 通过 InputBridge onChange 支持动态更新。

**C9. Command 补全** ✅ — 上下键导航、Tab/Enter 补全、Esc 关闭。选中项 bold 高亮。完整命令直接提交。

**C10. README 重写** ✅ — 从面向开发者的技术文档重写为面向用户的产品介绍（标语 + 特性 + Quick Start + 架构简介）。

### D. 额外发现的问题

**D11** ✅ 随 B4 修复（死代码删除）。
**D12** ✅ 随 E14 修复（agent event 在无 currentStep 时不再丢失）。
**D13** ✅ 随 B3 修复（reasoning state 事件驱动）。

### E. Trace 存储结构改造

**E14. 统一时间线** ✅ — `TraceStepV2.events: TraceEventEntry[]` 替代三个分桶数组。`TraceRunV2.runEvents` 替代 `runLifecycleEvents`。TraceRecorder 所有层事件 push 到同一个数组。`normalizeTrace` 支持旧格式自动转换。

**trace show 展示优化**（bonus）✅ — 三层展示策略：

- 默认 summary：每 step 压缩到 2-3 行（activity digest + token/cost）
- `--detail`：合并 P/A 同类型事件对为 `[P+A]`，消除 1:1 镜像冗余
- `--raw`：完整输出作为 debug escape hatch

### F. 渲染架构升级

**F15. 混合渲染** ⏸ 延期

尝试了两种方案均失败：

1. stdout flush — Ink 覆盖 stdout 内容
2. Ink `<Static>` — 渲染效果差

根因：vanilla Ink 的 cursor-up-then-redraw 模式。Claude Code 通过 fork Ink 实现 cell-level diff 解决了这个问题。

决定：暂时接受 running 时不能滚动的限制。未来路径：fork Ink / 换 TUI 框架 / 等 Ink 社区修复。

## 这轮冲刺学到了什么

1. **Runtime 提取 manager 是高杠杆操作。** 997→756 行不只是减少行数，而是让后续的语义修正（interrupt、queue、reasoning）有了安全的着力点。应该更早做。
2. **P/A 事件 1:1 镜像是 trace 的噪声主因。** 统一时间线后如果不做 P/A 合并，输出更难看。三层展示策略（summary/detail/raw）是必须的。
3. **Vanilla Ink 不支持 running 时滚动是硬限制。** `<Static>` 和 stdout flush 都不行。这不是代码问题，是框架架构决定的。Claude Code fork Ink 是有道理的。
4. **Footer 里的动态数据需要额外的通知机制。** reasoningLevel 作为 prop 传给 App 后不会响应运行时变化。通过 InputBridge 的 onChange 回调解决。这种"初始 prop + 运行时更新"的场景在 Ink 里会反复出现。
5. **trace show 的默认视图应该极度压缩。** 6696 个事件的 trace 按行展示根本不可用。默认 summary 模式是正确选择。

## 回收到 RoadMap 的长期项

1. **F15 混合渲染** — Running 时不能滚动。需要 fork Ink 或换框架。
2. **trace P/A 去重可能应该在 recorder 层做** — 当前在 display 层合并 P/A 对，但如果 agent event 真的只是 provider event 的转发，也许 recorder 层就不该重复记录。
3. **InputBridge 的 onChange 模式可能需要泛化** — 后续如果有更多运行时动态值需要推给 UI，现在的逐字段 setter 方式会不够用。
