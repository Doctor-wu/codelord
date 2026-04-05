# Codelord

Codelord 是一个面向生产环境的 coding agent monorepo。
它被组织为可复用 engine 加具体 product shell 的结构，而非一个巨型应用。

## 工作区布局

| 路径 | 角色 |
| --- | --- |
| `packages/config` | Config schema、默认值、校验、分层加载 |
| `packages/agent-core` | Runtime、tools、event spine、trace schema、safety、router |
| `agents/coding-agent` | `codelord` CLI、REPL、Ink renderer、persistence、auth |
| `docs/planning` | 面向 owner 的 roadmap、sprint、closure ledger、decision log |
| `docs/system` | 稳定的架构、设计原则、eval 规则 |
| `docs/agent/modules` | 面向 agent 的模块摘要 |

## 常用命令

- 安装：`pnpm install`
- 全量构建：`pnpm build`
- 类型检查：`pnpm typecheck`
- 运行测试：`pnpm test`

## 文档入口

### 面向人类

- 当前战役：`docs/planning/Sprint.md`
- 长期方向：`docs/planning/RoadMap.md`
- 稳定结构：`docs/system/ARCHITECTURE.md`
- 当前产品化缺口：`docs/planning/Sprint.md` + `docs/planning/RoadMap.md` 中对应章节

### 面向 Agent

- 入口规则：`AGENTS.md`
- 稳定边界：`docs/system/ARCHITECTURE.md`
- 设计约束：`docs/system/DesignPrinciples.md`
- 证据标准：`docs/system/EVALS.md`
- 模块摘要：`docs/agent/modules/README.md`

## 规划模型

Codelord 使用 sprint 循环，而非静态状态页。

1. `docs/planning/RoadMap.md` 持有长期路线和里程碑池。
2. `docs/planning/Sprint.md` 仅持有当前活跃 sprint。
3. 当一个 sprint 关闭时，更新 roadmap，归档该 sprint，然后从 roadmap 加载下一个 sprint。

## 产品姿态

Codelord 优化方向：
- 生产优先的分层
- operator 信任优先于 demo 光鲜度
- eval-first 的声明
- 可重写的 roadmap，稳定的架构

这意味着：
- 当前执行活在 `docs/planning/Sprint.md`
- 长期意图活在 `docs/planning/RoadMap.md`
- 未解决的产品化缺口直接写入 `docs/planning/RoadMap.md` 对应章节和活跃的 `docs/planning/Sprint.md`
