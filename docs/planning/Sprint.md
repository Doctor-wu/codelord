# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：待加载
- **目标**：上一轮冲刺（专项治理：方案重构 + 质量治理）已关闭并归档。下一轮冲刺待确定。
- **状态**：空窗期

## 上一轮冲刺总结

归档位置：`docs/planning/archive/sprints/sprint-quality-refactor.md`

关键产出：
- Runtime 语义修正：interrupt 简化（去掉 PAUSED）、queue 只在 burst 结束时 drain
- 代码组织：4 个 manager 从 runtime 提取、renderer 架构清理（ink-renderer 412→93行）、组件拆分（App 251→128行）
- 交互体验：首屏 logo + 信息、footer 重做、reasoning 显示修正、command 补全升级
- Trace 改造：统一时间线排序、三层展示策略（summary/detail/raw）、修复事件丢失
- README 重写为面向用户的产品介绍

延期项：
- F15 混合渲染架构（vanilla Ink 限制，需要 fork Ink 或换框架才能解决 running 时滚动问题）
