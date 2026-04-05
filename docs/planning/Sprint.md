# Codelord — 当前冲刺

> 这不是长期 roadmap，也不是静态状态页。
> 这是当前唯一主战场。
>
> 冲刺关闭时：更新 `docs/planning/RoadMap.md`，如有必要更新 `docs/planning/DecisionLog.md`，然后把本文件归档到 `docs/planning/archive/sprints/`，再从 roadmap 抽下一个冲刺进来。未收口但必须产品化完成的缺口，直接写进 owning roadmap section 与 active sprint。

---

## 冲刺身份

- **阶段**：方向校准：`M1X / M2` 转折点
- **目标**：停止沿着局部痛点继续补 trace 字段，先完成整个 trace 主题的研究与立场；同时补齐两个已经暴露在 operator 面前、但仍处于半悬挂状态的基础能力：reasoning 等级控制、command + 联想
- **状态**：方向校准中

## 为什么有这一轮冲刺

我们已经拥有一批真实能力：REPL、runtime、queue、resume、timeline、tool lifecycle、trace、recovery UX。
问题不再是“能不能跑”，而是“我们是不是沿着对的生产路线在收敛”。

这轮冲刺的出发点有 3 个：

1. **trace 缺的不是某一小块研究，而是整个 trace 主题的研究**
   - 如果继续直接补 `visible_tool_latency`、`operator action`、`queue lifecycle` 这种局部字段，trace 很容易继续长成补丁堆
2. **我们已经有一些半悬挂的产品表面，不能再假装它们算产品化**
   - reasoning lane 已经暴露给 operator，但甚至还不支持最基本的等级 / 预算设置
   - operator 已经在用 composer，但 command 仍不是一等交互面，也没有最小联想 / 提示
3. **正反馈的定义要改**
   - 正反馈不再来自“先做个浅版本看看”
   - 正反馈必须来自“选一个窄切片，把它做到最小生产闭环”

## 完成条件

以下条件全部满足后，这轮冲刺才算完成：

- [ ] 完成 **trace 全量研究**，而不是只研究局部 diagnostics
- [ ] 输出 **trace 立场说明**：明确 codelord 的 trace 北极星、一等事实、消费面边界
- [ ] 明确 **实时投影 / 持久化账本 / 回放 / 评测 / 审计** 的边界关系
- [ ] 明确 trace 后续实现顺序：哪些先做、哪些后做、哪些明确暂不做
- [ ] reasoning 至少支持 **operator 可设置的等级 / 预算基线**
- [ ] operator command 成为 **可发现的一等交互面**，而不是只靠知道 `/undo`、`/exit` 的人才会用
- [ ] composer 提供 **最小 command 联想 / 提示**
- [ ] 当前 sprint 改写后的方向已经在 `docs/planning/RoadMap.md` 中反映为稳定路线，而不是只停留在本页

## 范围内

### A. Trace 全量研究

- 研究领先系统在 trace 上真正解决的是什么问题，而不是只看它们 UI 长什么样
- 研究以下关系：
  - 实时操作台
  - 持久化 trace 账本
  - 回放
  - 评测
  - 审计 / 调试
- 研究哪些事实应该是一等公民：
  - assistant turn
  - tool lifecycle
  - operator action
  - queue lifecycle
  - question / answer
  - interrupt / resume
  - command
- 输出 codelord 自己的 trace 立场，而不是默认采用别家产品的表面做法

### B. 半悬挂产品表面收口

- reasoning 等级 / 预算设置的最小闭环
- operator command 系统的最小闭环
- composer 的 command 联想 / 提示最小闭环

### C. 文档对齐

- `docs/planning/RoadMap.md`
- `docs/planning/Sprint.md`
- 如有必要：`docs/planning/DecisionLog.md`

## 范围外

- 不直接继续补新的 trace 局部字段，除非它们是 trace 全量研究后明确排在第一位的结果
- 不推进 `M3` eval harness
- 不推进 `M4` context engineering / RAG
- 不推进 `M5` skill system
- 不做 replay / compare 实现
- 不做 `Router v2`
- 不做与当前冲刺无关的大范围 UI 美化

## 我们已经拥有的基础

这些不是这轮冲刺要从 0 开始做的，而是已经存在的底座：

- provider thought viewport / live proxy 的二选一兜底已经成立
- provisional tool build / partial args preview / delta throttling 已进入产品主路径
- built-in tool 无 `stdout/stderr` 的 executing phase feedback 已成立
- recovery UX / queue visibility 已显式进入主界面
- `single-shot` / `PlainTextRenderer` 已退出主产品路径
- 结构化 trace、trace CLI、基础 redaction、prompt caching 基线已经存在

## 当前最关键的开放缺口

### 方向层缺口

- 我们没有完成整个 trace 主题的研究
- 我们还没有写出一份足够硬的 trace 立场说明
- 所以现在继续补 trace 具体字段，很容易又走回“哪里疼补哪里”

### 产品层缺口

- reasoning 已经暴露到 UI，却没有最小控制面
- command 已经以 `/undo`、`/exit` 这种隐式形式存在，却没有成为可发现的一等交互面
- composer 已经是一等输入面，却没有最小命令联想 / 提示

### 现有 M1X 缺口

- 大参数工具的 build 过程还要继续验证是否已经足够稳定、足够可感
- `TUI` 离“强正反馈 operator console”还有一段距离

## 下一刀

当前最优先的下一刀不是某个单独字段，而是：

- **开启 Trace 全量研究冲刺，并同步定义 reasoning level / command 系统的最小产品合同**

顺序上应是：

1. trace 全量研究
2. trace 立场说明
3. roadmap 重写
4. 再决定 trace 实现的具体第一刀
5. 与此同时，把 reasoning level / command 作为最小产品闭环补上

## 证据标准

### 这轮冲刺需要什么证据

- trace 研究不是资料堆砌，而要能产出：
  - 我们的北极星（north star）
  - 我们的一等事实（first-class facts）
  - 我们的边界划分
  - 我们的明确不做项
- reasoning level / command 不是“看起来有了”，而要满足：
  - operator 可发现
  - operator 可控制
  - 状态清楚
  - 与当前 runtime / UI 语义不冲突

### 这轮冲刺不接受什么证据

- 不接受“参考了某家产品截图，所以我们也这么做”
- 不接受“局部问题被修掉了，所以方向就对了”
- 不接受“先做个浅版本，以后再慢慢补”的自我安慰

## 风险与提醒

- 不要把 trace 研究做成“只研究 `visible_tool_latency`”
- 不要把 reasoning level 推迟到 `M7 thinking budget`，当前就已经是产品面缺口
- 不要把 command system 当成纯交互 polish，它是 operator control 的一部分
- 不要再引入新的半悬挂产品表面

## 冲刺关闭时要回写什么

- `docs/planning/RoadMap.md`
- `docs/planning/DecisionLog.md`（如果方向判断被重写）
- 如有必要：相关 system / module 文档
