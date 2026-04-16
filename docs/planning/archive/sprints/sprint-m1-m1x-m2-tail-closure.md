# Codelord — 已关闭冲刺：M1/M1X/M2 尾部收口

> 关闭时间：2026-04-08
> 状态：✅ 全部完成条件达成
> 测试：562 → 649 (+87)

---

## 冲刺身份

- **阶段**：M1/M1X/M2 尾部收口 — 为 M3 (Eval) 扫清地基
- **目标**：关闭 M3 之前所有 milestone 的剩余缺口，使 agent 基础足够稳固，可以开始搭建 eval 实验平台

## 完成条件（全部达成）

- [x] Context Window 管理 v1 可用
- [x] 工具成功率有基础计数数据
- [x] Operator console 有最小可发现的命令体验
- [x] trace check 已下掉
- [x] headless trace 输出可用
- [x] Reasoning 提取与投影
- [x] Reasoning v2 策略
- [x] 会话管理闭环
- [x] Undo 补齐
- [x] Router v2
- [x] Trace 补齐
- [x] Event Spine 架构修正
- [x] typecheck + test 全部通过

## 移交 M3 的任务

- reasoning quality eval 与 trace 可观测性（原 B1）
- 为 reasoning 建立 eval 与 regression 套件（原 B2）
- 把 reasoning diagnostics 接入 trace compare / eval compare（原 B2）
- route quality 指标、trace 对齐、可解释 fallback（原 A5）

## 跳过（外部依赖）

- memory redaction 复用（依赖 M6）
- redaction 误伤率 eval（依赖 M8）
- skill fragments cacheability（依赖 M5）

---

## 交付物——逐项前后对比

### A1. Context Window 管理 v1

**做之前**：长对话时 context 直接爆掉，没有任何保护机制。system prompt 占多少 context 没有基线数据。

**做之后**：token 粗估（chars/4）+ oldest-first 截断保留最近 4 轮 + system prompt 基线 ~1410 tokens (1.1% of 128k)。长对话可以持续进行。

### A2. 工具成功率轻量追踪

**做之前**：没有任何工具级别的统计，全是黑箱。

**做之后**：per-tool attempts/successes/failures + errorCode 分类 + per-route-rule stats。eval 有了第一个量化数据源。

### A3. 会话管理补齐

**做之前**：sessions 只有 UUID 列表，没有 title/branch/summary，没有 show/prune。

**做之后**：SessionMeta 新增 gitBranch/title/summary。sessions show/prune CLI 可用。

### A4. Undo / Checkpoint 补齐

**做之前**：checkpoint 只保护 file_write/file_edit，bash 修改的文件不受保护。安全网有洞。

**做之后**：git repo 中自动 git stash。三种策略：git_stash/hybrid/file_snapshot。checkpoint events 进入 trace。

**方法论**：已有基础设施的复用优于重新发明。

### A5. Tool Router v2

**做之前**：Router v1 纯 bash 改写，contracts 和 router 分离。

**做之后**：三层规则（bash 改写 + 语义纠偏 Rule E/F + contract-driven 自动生成）。

**方法论**：数据联动优于硬编码。

### B1. Event Spine 收口

**做之前**：AssistantReasoningState 是 phase shell，displayReason 始终 null，provisional tool call 绕过 lifecycle。

**做之后**：liveProxy + Mode A/B、tool schema reason 参数（displayReason 优先链 declared > extracted > null）、tool*call_streaming*\* lifecycle events（UI 只消费 lifecycle）。

### B2. Reasoning v2

**做之前**：runtime 硬编码模型能力判断，settled 策略缺失。

**做之后**：resolveModelCapabilities 从 pi-ai Model 读取。Settled 策略 keep/collapse/hide。

### B3. Operator Console

**做之前**：3 个命令无可发现性。

**做之后**：结构化注册表 + /help + Composer 联想 + 状态感知。

### B4. UX 验收

**做之前**：无 thinking 时空白，TUI 只是"结构正确"。

**做之后**：liveProxy 阶段感知 + provisional tool call + 完整 operator console。

### C1. Trace 补齐

**做之前**：trace check 过时，无 headless，无 toolVisibility，queue 只有 drained。

**做之后**：trace check 清除、runHeadless() 落地、toolVisibility 聚合、queue_enqueued + queue_drained 全链路。

---

## 关键设计决策

1. Tool reason 作为一等 schema 参数
2. 从 pi-ai Model 读取 capabilities，不硬编码 matrix
3. Git stash 作为 checkpoint 策略
4. Contracts 与 Router 数据联动
5. trace check 永久移除
6. Provisional tool call 走 lifecycle

## 统计

| 指标     | 数值             |
| -------- | ---------------- |
| 总任务项 | 46               |
| 完成     | 46               |
| 移交 M3  | 4                |
| 跳过     | 3                |
| 新增测试 | +87（562 → 649） |
