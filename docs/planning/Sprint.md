# Codelord — Current Sprint

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> Sprint 关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/ClosureLedger.md` / `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个 sprint 进来。

---

## Sprint Identity

- **Phase**：`M1X` 收口，给 `M2` 做进入条件准备
- **Sprint Goal**：把 operator console 从“语义大体正确”推进到“日常 dogfooding 时不需要靠猜”
- **Status**：进行中

## Why This Sprint Exists

M1 的执行骨架已经立起来，但 operator 对这些能力的感知和掌控还不够稳定。
这轮 sprint 不扩新阶段，只收口当前主路径上的 operator trust：
- streaming operator feedback
- recovery UX
- queue visibility
- 当前阶段足够明确的非目标

## Done When

以下条件全部满足后，当前 sprint 才算收口：

- [x] built-in tool 在没有 `stdout/stderr` 的 active phase 里，仍有诚实的 derived phase feedback
- [x] resume 后的 `waiting_user / interrupted / queued input` 状态成为主界面显式状态，而不是藏在 timeline 里让人猜
- [ ] 大参数工具的 build 过程在 dogfooding 中持续可感，不再出现长时间空窗后突然落地的感觉
- [ ] `TUI` 本身成为强正反馈的 operator console，而不是只有“结构正确”
- [ ] 当前 sprint 的未收口项已经明确分流：该继续留在 `M1X` 的继续留在 sprint；该转入 `M2` 的转入 roadmap 的下一 sprint

## In Scope

- `M1X` 主线上的 operator-visible feedback
- `M1X` 主线上的 recovery UX / queue visibility / progressive disclosure
- renderer / reconciliation 层面的当前主路径收口
- 与当前主线直接相关的 focused tests 和最小必要文档更新

## Out Of Scope

- `M3` eval harness
- `M4` context engineering / RAG
- `M5` skill system
- replay / compare
- `Router v2`
- trace schema 扩张式重做
- 与当前 sprint 无关的大范围 UI 美化

## Completed Slices

### Already Landed Before This Checkpoint

- provider thought viewport / live proxy 的二选一兜底已经成立
- provisional tool build / partial args preview / delta throttling 已进入产品主路径
- `single-shot` / `PlainTextRenderer` 已退出主产品路径

### Landed In This Sprint

- **Built-in tool phase feedback**
  - `file_read / file_write / file_edit / search / ls` 在 `executing` 且无 `stdout/stderr` 时，tool card 不再只显示泛泛的 `executing…`
  - 现在会显示带目标对象的 derived feedback，例如 `reading …/src/foo.ts…`、`writing …/b/c.ts…`、`searching "TODO"…`、`listing .…`
  - 一旦真实 `stdout/stderr/result` 到来，derived feedback 自动退后

- **Recovery UX / queue visibility**
  - Header 不再只有 `LIVE / IDLE`，而是能显式显示 `YOUR TURN / PAUSED / ERROR` + queue count
  - `deriveSessionMode` 现在感知 resume reconciliation 的结果，即使 timeline items 看起来像 idle，也能从 `resumeContext` 正确派生 `waiting_answer / interrupted`
  - `reconcileTimelineForResume` 现在把 `isResumed / wasDowngraded / interruptedDuring / hasPendingQuestion / pendingInboundCount` 写进 `TimelineState.resumeContext`
  - `InputComposer` 在 idle + queue 的场景也显示 `StatusStrip`
  - REPL 在 hydrate 后立即把 queue info push 到 renderer

## Open Gaps

### Still Inside This Sprint

- 大参数工具的 build 过程虽然可见，但还需要继续验证“是否已经足够稳定、足够可感”
- tool batch / tool card / header / composer 之间的层级虽比之前清楚，但离“强正反馈 operator console”还有差距

### Likely Next Sprint Candidates

- `visible_tool_latency`：把“operator 何时真正看见 tool”变成可诊断事实
- `user input / operator action` first-class trace facts：让 trace 不只解释模型行为，也能解释产品行为

## Next Slice Candidate

如果当前 sprint 再往前推一刀，优先候选是：

- **`visible_tool_latency` 诊断补齐**

原因：
- 它直接承接当前 sprint 已做完的 operator-visible feedback
- 它是 `M2` 进入条件里最贴近产品感知的一项
- 它能把“看起来像卡住”从感觉问题推进成可诊断事实

## Evidence

### Landed Evidence

- built-in tool phase feedback：`pnpm test` 全量通过 + `pnpm typecheck` 通过
- recovery UX / queue visibility：`pnpm test` 全量通过 + `pnpm typecheck` 通过

### Proof Standard For Remaining Work

- 继续沿用 `docs/system/EVALS.md` 的当前 `M1X + M2` 证据标准
- 当前 sprint 里的改动，至少要能提升 operator-visible clarity，而不只是让 raw events 更漂亮

## Risks / Watchouts

- 不要把 renderer 的 convenience state 倒灌成 runtime truth
- 不要为了让 UI“更活”而伪造 reasoning
- 不要因为 sprint 在收口期，就把短半衰期执行细节重新塞回 `docs/planning/RoadMap.md`

## Docs To Update On Close

Sprint 关闭时，至少检查这些文档：

- `docs/planning/RoadMap.md`
- `docs/planning/ClosureLedger.md`
- `docs/planning/DecisionLog.md`
- `docs/system/ARCHITECTURE.md`（如果稳定边界变了）
- `docs/agent/modules/renderer.md`（如果 renderer 稳定语义变了）
