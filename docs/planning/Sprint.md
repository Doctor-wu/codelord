# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：待定 — 从 RoadMap 中选取下一个冲刺
- **目标**：待定
- **状态**：🔵 待规划

---

## 上一个冲刺回顾

CORE-R1（Event System Refactor）已关闭。

**关键产出**：
- 事件系统从三层混杂（AgentEvent + LifecycleEvent + ProviderStreamTraceEvent）重构为两层模型（Raw Events + Agent Lifecycle Callbacks with Pipeable）
- AgentEvent 彻底删除（18 变体 + 27 处发射点）
- Pipeable 原语：流式消费者 subscribe 拿 delta，完成态消费者 await done()
- 默认 trace 从全量记录改为 trajectory 模式，预计体积减少 60-70%
- 所有消费者（Streaming UI / Headless / Trace）统一通过 lifecycle callbacks 接入

详见 [归档](./archive/sprints/sprint-core-r1-event-refactor.md) 和 [RoadMap.md](./RoadMap.md)。
