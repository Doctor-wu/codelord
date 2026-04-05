# Agent Core 规则

作用域：`packages/agent-core/**`

## 先读

- 根 `AGENTS.md`
- `docs/system/ARCHITECTURE.md`
- `docs/system/DesignPrinciples.md`
- `docs/agent/modules/runtime.md`
- `docs/agent/modules/tool-platform.md`
- `docs/agent/modules/observability.md`

如果任务涉及 current-focus 语义，还需阅读 `docs/planning/Sprint.md` 和 `docs/planning/RoadMap.md` 中对应章节。

## 本包职责

- 可复用的 runtime 语义
- tool primitives、contracts、router、safety
- lifecycle/event 词汇表
- trace schema 和 diagnostics
- snapshot 和 checkpoint 类型

## 本包不应拥有

- CLI 命令面
- Ink 布局或组件展示
- session/trace 磁盘布局
- auth UX 或 provider 登录流程

## 局部规则

- 将 lifecycle events 和 trace schema 视为稳定的产品语义，而非私有内部实现。
- 没有跨层理由时，不要将 renderer-only 假设放入 core 类型。
- 不要为了方便而将 product-shell 胶水移入本包。
- 修改 source-of-truth 对象时，在同一任务中更新文档。

## 强制跟进

- Runtime 变更 → 更新 `docs/agent/modules/runtime.md`
- Tool/router/safety 变更 → 更新 `docs/agent/modules/tool-platform.md`
- Event/trace/redaction 变更 → 更新 `docs/agent/modules/observability.md`
- 跨层边界变更 → 更新 `docs/system/ARCHITECTURE.md`
- 如果在 current-focus 区域的妥协确实不可避免，将其目标状态和剩余缺口直接写入 `docs/planning/RoadMap.md` 对应章节和 `docs/planning/Sprint.md`
