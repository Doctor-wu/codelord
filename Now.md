# Codelord — 当前阶段焦点

> 这份文档回答"现在到底先打哪几件事，为什么"。
> 长期战略见 [RoadMap.md](./RoadMap.md)。临时方案收口见 [ClosureLedger.md](./ClosureLedger.md)。

---

## 当前主矛盾

M1 的执行骨架已经立起来，但 **operator 感知不到这些能力**。

具体表现：
- provider trace 里长期没有 `thinking_*`，但 `toolcall_delta` 已经非常密集——partial 事件没有被投影为连续体验
- reasoning lane 在无 provider thought 时像是饿死的空壳
- tool card 在 `tool_call_created` 之前完全不可见，大参数工具长时间空窗
- trace 能记录发生了什么，但还不能解释"为什么 operator 看到的是这样"

**一句话：不是 event spine 没有数据，而是数据没有变成 operator 信任。**

---

## 当前优先顺序

1. **Streaming operator feedback 收口（M1X）**
   - reasoning 可见性：有 provider thought 时展示 live viewport，没有时展示 derived proxy
   - provisional tool build：tool card 在 `tool_call_created` 之前即可出现
   - partial args progressive preview：大参数工具的构建过程可见
   - 高频 `toolcall_delta` 节流合并：避免 Ink 被刷坏

2. **Operator UX polish（M1X）**
   - recovery UX / queue visibility / progressive disclosure
   - composer polish
   - tool batch / tool card 视觉层级：正在构建 / 正在执行 / 已完成一眼可分
   - built-in tool 即使没有 stdout，也要有可感知的流式 phase feedback

3. **Trace 解释闭环（M2）**
   - user input / operator action 成为一等 trace 事实
   - "为什么看不见 thought / 为什么 tool 突然出现"变成可诊断事实
   - `visible_tool_latency` 等贴近产品感知的诊断补齐
   - `trace check` 从"查结构"推进到"查 control-plane handoff 与 event propagation anomaly"

4. **在 trace 与 streaming UX 足够可信之后**，再推进 replay / compare / eval bootstrap

---

## 当前收口目标

- [ ] 用户在无 `thinking_*` 的 provider 上，仍能连续感知 agent 处于 thinking / deciding / acting 的哪一阶段
- [ ] 大参数工具的 build 过程能被看见，而不是长时间空窗后突然落地
- [ ] built-in tool 即使没有 stdout，也要有可感知的流式 phase feedback
- [ ] TUI 本身成为强正反馈的 operator console，而不是仅仅"结构正确"
- [ ] user input / operator action 成为一等 trace 事实
- [ ] `visible_tool_latency` 诊断可用
- [ ] Reasoning v2 的临时方案有明确收口路径（见 [ClosureLedger.md](./ClosureLedger.md)）

---

## 当前明确不做

- **不推进 M3 eval 框架**：trace 和 streaming UX 还没稳定到值得建 eval 的程度
- **不推进 M4 context engineering / RAG**：执行引擎的 operator 体验还没收口
- **不推进 M5 skill 系统**：skill 的价值依赖 context 和 eval，现在上太早
- **不做 replay / compare**：trace 事实还不够完整，replay 出来的东西不可信
- **不做 Router v2**：当前 Router v1 的保守路由够用，更强的语义路由等 eval 数据驱动

---

## 进入下一阶段前的门槛

以下条件全部满足后，才从"M1X + M2 收口"进入"M3 eval bootstrap"：

1. streaming UX 在有/无 `thinking_*` 的 provider 上都能提供连续 operator feedback
2. tool card 从 provisional build 到 lifecycle settled 的全过程可见
3. user input / operator action 已经是一等 trace 事实
4. `trace check` 能诊断 streaming UX 的典型异常（thinking absent / delta density / visible latency）
5. 至少 2 个 dogfooding session 的 trace 能完整回答"operator 看到了什么、为什么"

---

## Done when

- operator 在日常 dogfooding 中不再需要猜"agent 现在在干嘛"
- trace 能解释任何一次"UI 看起来卡住了"的根因
- 临时方案都有收口路径，不再是开放式 TODO
