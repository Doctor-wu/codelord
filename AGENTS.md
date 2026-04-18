# Codelord Agent 规则

## 身份与边界

- 本仓库是一个 `pnpm` monorepo，包含三个稳定代码层：
  - `packages/config` — config schema、默认值、校验、分层加载
  - `packages/agent-core` — 可复用的 engine 语义
  - `agents/coding-agent` — `codelord` product shell：CLI、REPL、renderer、persistence、auth
- 根级文档保持精简，详细文档放在 `docs/` 下。
- 保持分层清晰：
  - 不要把 product-shell 关注点移入 `packages/agent-core`，除非它改变了可复用的执行语义。
  - 不要把 engine 不变量移入 renderer、stores 或 CLI 胶水层。
  - 不要把 auth 或 provider 登录流程移入 config 加载。
- 将 event、trace、queue、interrupt、resume 和 checkpoint 语义视为产品关键语义，而非重构噪音。
- 除非任务明确要求，不要修改依赖版本、`pnpm-lock.yaml` 或根级工具配置。

## 权威顺序

优先使用最局部、最权威的来源。

1. 代码和测试
2. 最近的 scoped `AGENTS.md`
3. 根 `AGENTS.md`
4. `docs/planning/Sprint.md`
5. `docs/system/ARCHITECTURE.md`
6. `docs/system/DesignPrinciples.md`
7. `docs/system/EVALS.md`
8. `docs/planning/RoadMap.md`
9. `docs/adr/NNNN-*.md`
10. `docs/planning/DecisionLog.md`
11. `README.md`

如果两份文档冲突，以此列表中排位更高的为准。
当前 sprint 排序优先于 roadmap 排序。

## 按任务类型的阅读顺序

| 任务                                    | 先读                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| 全仓设计 / 优先级决策                   | `docs/planning/Sprint.md` → `docs/planning/RoadMap.md` → `docs/system/ARCHITECTURE.md` |
| current-focus 子系统工作                | `docs/planning/Sprint.md` → `docs/planning/RoadMap.md` 中对应章节                      |
| Runtime / queue / interrupt / resume    | `packages/agent-core/AGENTS.md` → `docs/agent/modules/runtime.md`                      |
| Tool contracts / router / safety        | `packages/agent-core/AGENTS.md` → `docs/agent/modules/tool-platform.md`                |
| Event / trace / redaction / diagnostics | `packages/agent-core/AGENTS.md` → `docs/agent/modules/observability.md`                |
| CLI / REPL / system prompt 组装         | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/cli-composition.md`              |
| Ink renderer / timeline projection      | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/renderer.md`                     |
| Session store / trace store / undo      | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/persistence.md`                  |
| Config schema / 加载                    | `packages/config/AGENTS.md` → `docs/agent/modules/config.md`                           |
| Provider 凭证 / OAuth                   | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/auth.md`                         |
| 长期 roadmap 推演                       | `docs/planning/RoadMap.md` → `docs/planning/DecisionLog.md`                            |

## 文档地图

| 路径                                 | 职责                                               | 不应包含                                    |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------- |
| `README.md`                          | 面向人类/operator 的入口、快速上手、文档索引       | 细粒度 agent 指令                           |
| `AGENTS.md`                          | Agent 入口规则、阅读顺序、权威顺序、文档路由       | 长篇哲学论述、sprint 内部细节、模块内部细节 |
| `docs/planning/RoadMap.md`           | 长期能力地图、里程碑意图、硬性门槛                 | 短半衰期的执行排序                          |
| `docs/planning/Sprint.md`            | 当前 sprint 合约、进度、未关闭缺口、下一切片       | 完整历史归档                                |
| `docs/planning/DecisionLog.md`       | 路线/框架级变更的原因记录（"为什么 roadmap 改了"） | 具体字段边界/迁移方案（写进 ADR）           |
| `docs/adr/NNNN-*.md`                 | 具体技术决策：字段边界、迁移路径、接口形状         | 路线级变更；sprint 内部进度；跨领域设计原则 |
| `docs/planning/archive/sprints/*.md` | 已完成 sprint 的历史归档                           | 当前活跃 sprint                             |
| `docs/system/ARCHITECTURE.md`        | 稳定分层、依赖方向、source-of-truth 规则、系统流程 | 临时 workaround、当前 sprint 排序           |
| `docs/system/DesignPrinciples.md`    | 跨领域设计规则与权衡                               | 目录级别的编辑指令                          |
| `docs/system/EVALS.md`               | 证据要求、metrics、证明标准                        | 历史决策日记                                |
| `docs/agent/modules/*.md`            | 稳定的模块摘要、所有权边界、编辑入口               | 历史讨论、每日进度                          |

## Sprint 生命周期

从 `docs/planning/Sprint.md` 出发工作，不要直接从 `docs/planning/RoadMap.md` 出发。

当一个 sprint 关闭时：

- 更新 `docs/planning/RoadMap.md`
- 如果不可避免地做了妥协，将其目标状态和剩余缺口直接写入 `docs/planning/RoadMap.md` 对应章节和 `docs/planning/Sprint.md`
- 如果路线或框架发生变更，更新 `docs/planning/DecisionLog.md`
- 将已完成的 sprint 归档到 `docs/planning/archive/sprints/`
- 从 `docs/planning/RoadMap.md` 加载下一个 sprint 到 `docs/planning/Sprint.md`

## 仓库地图

| 路径                  | 含义                                                     |
| --------------------- | -------------------------------------------------------- |
| `packages/config`     | Config schema 与分层加载                                 |
| `packages/agent-core` | 可复用 engine、tools、event spine、trace schema          |
| `agents/coding-agent` | CLI app shell、REPL、renderer、auth、stores、checkpoints |
| `docs/planning`       | 面向 owner 的规划与 sprint 控制                          |
| `docs/system`         | 稳定的设计与架构规则                                     |
| `docs/agent/modules`  | 面向 agent 的模块摘要                                    |

## 强制更新规则

当行为发生变更时，在同一任务中更新对应文档。

- 层级或所有权边界变更 → 更新 `docs/system/ARCHITECTURE.md` 及受影响的模块文档。
- 跨领域设计规则变更 → 更新 `docs/system/DesignPrinciples.md`。
- 证据标准或 metrics 变更 → 更新 `docs/system/EVALS.md`。
- 当前 sprint 范围/进度变更 → 更新 `docs/planning/Sprint.md`。
- 如果不可避免的妥协影响了产品化计划，直接更新 `docs/planning/RoadMap.md` 对应章节和 `docs/planning/Sprint.md`。
- 长期里程碑意图变更 → 更新 `docs/planning/RoadMap.md`；如果原因重要，同时更新 `docs/planning/DecisionLog.md`。
- 具体技术决策（字段边界、接口形状、迁移方案）→ 新起一份 `docs/adr/NNNN-*.md`；若同时触发路线变更，在 `docs/planning/DecisionLog.md` 也写一条指向该 ADR 的指针。
- 包级局部规则变更 → 更新最近的 scoped `AGENTS.md`。

## 变更卫生

- 编辑某个 scoped 区域的代码前，先读最近的 `AGENTS.md` 和对应的模块文档。
- 修改 event 或 trace schema 前，先读 `docs/system/ARCHITECTURE.md` 和 `docs/system/EVALS.md`。
- 修改 current-focus 子系统前，先读 `docs/planning/Sprint.md` 和 `docs/planning/RoadMap.md` 中对应章节。
- 不要把短半衰期的执行笔记放回 `docs/planning/RoadMap.md`。
- 不要把模块级内部细节放入根 `AGENTS.md`；应新增或更新模块文档。

## 验证命令

- 构建：`pnpm build`
- 类型检查：`pnpm typecheck`
- 测试：`pnpm test`

先运行最窄的相关验证，待触及面稳定后再扩大范围。
