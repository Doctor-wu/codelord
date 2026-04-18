# Architecture Decision Records

这里记录 **具体的技术决策**：某个字段怎么分、某个边界怎么定、某个迁移路径怎么走。

与 [`docs/planning/DecisionLog.md`](../planning/DecisionLog.md) 的分工：

| 文档                           | 角色                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `docs/planning/DecisionLog.md` | 路线 / 框架级变更："为什么 roadmap 改了"                       |
| `docs/adr/NNNN-*.md`           | 具体技术决策："这个字段边界 / 迁移方案 / 接口形状为什么这么定" |

当一个技术决策同时影响了路线时，两边都写：DecisionLog 记"为什么改线"，ADR 记"改线之后具体怎么落"。

## 格式

每份 ADR 一个文件，命名 `NNNN-kebab-case-title.md`（`NNNN` 为 4 位数字顺序编号，从 `0001` 起）。

标准骨架：

```markdown
# ADR-NNNN: 标题

## Status

{Proposed | Accepted | Superseded by ADR-XXXX} — YYYY-MM-DD

## Context

触发这次决策的背景、现状、约束。

## Decision

最终做什么。按字段 / 接口 / 算法逐项说清，让读者不用推测。

## Consequences

正面收益、负面成本、遗留的 open issues。

## Alternatives considered

考虑过但被拒绝的方案，附拒绝理由。

## References

关联的 Sprint、DecisionLog、代码位置。
```

## 索引

| 编号 | 标题                                                                    | 状态     |
| ---- | ----------------------------------------------------------------------- | -------- |
| 0001 | [四轴指纹边界 — 静态 vs 有效](./0001-four-axis-fingerprint-boundary.md) | Accepted |

## 规则

- ADR 一旦 `Accepted` 不再重写——有新决策就起一份新 ADR，把旧的标记为 `Superseded by ADR-XXXX`。
- 短半衰期的执行排序、sprint 内部进度不写进 ADR（它们属于 `Sprint.md`）。
- 稳定的跨领域设计原则写进 `docs/system/DesignPrinciples.md`，不写进 ADR。
