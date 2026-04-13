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

M3-S2（Eval 规范化 + CI + 成绩看板）已关闭。

**关键产出**：
- `@codelord/evals-shared` 包：统一 `EvalResult` schema + `writeResult`/`exitWithResult`/`renderSummaryMarkdown`/`registerBenchmarkRenderer`
- 四个 adapter 全部规范化：统一输出格式、退出码 0/1/2、标准 `scripts/run.sh`
- BrowseComp Docker 化补齐
- Terminal-Bench Harbor 输出转换器（`convert-results.ts`）
- 四个 GitHub Actions eval workflow（workflow_dispatch）+ Job Summary
- `docs/scores.md` 成绩看板 + `scripts/update-scores.ts` + Auto-PR workflow
- `docs/ci/SECRETS.md` CI 配置文档

详见 [归档](./archive/sprints/sprint-m3s2-eval-ci-scoreboard.md)。

---
