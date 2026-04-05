# Coding Agent App Shell 规则

作用域：`agents/coding-agent/**`

## 先读

- 根 `AGENTS.md`
- `docs/planning/Sprint.md`
- `docs/system/ARCHITECTURE.md`
- `docs/system/DesignPrinciples.md`
- `docs/agent/modules/cli-composition.md`
- `docs/agent/modules/renderer.md`
- `docs/agent/modules/persistence.md`
- `docs/agent/modules/auth.md`

如果任务涉及当前 operator UX 或 streaming 行为，还需阅读 `docs/planning/RoadMap.md` 中对应章节。

## 本包职责

- CLI 命令和 REPL 流程
- app-shell 组装：runtime、renderer、stores、auth、prompt、tool kernel
- 终端 UI 和 timeline projection
- session 和 trace persistence
- checkpoint manager 和 `/undo`
- auth dispatch 和 provider 登录流程

## 本包不应拥有

- 可复用的 runtime truth
- trace schema truth
- config schema
- core tool 语义

## 局部规则

- 组合 core；不要重新定义它。
- 保持 `buildSystemPrompt()` 作为唯一的 prompt 组装点。
- 保持 `createToolKernel()` 作为唯一的 tool-kernel 组装点。
- 记住 renderer timeline 是派生缓存，不是 source of truth。
- 修改 resume 或 undo 行为时，同时验证 snapshot truth 和 timeline 协调。

## 强制跟进

- CLI/REPL 组合变更 → 更新 `docs/agent/modules/cli-composition.md`
- Renderer 语义变更 → 更新 `docs/agent/modules/renderer.md`
- Persistence 或 undo 变更 → 更新 `docs/agent/modules/persistence.md`
- Auth 变更 → 更新 `docs/agent/modules/auth.md`
- 如果当前 operator UX 需要不可避免的妥协，将其目标状态和剩余缺口直接写入 `docs/planning/RoadMap.md` 对应章节和 `docs/planning/Sprint.md`
