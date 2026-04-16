# Codelord

> 生产级终端编程 Agent。Core 极简，智能来自 Context Engineering + Skill。

## ✦ 核心特性

- **Operator Control** — 运行时可中断、纠偏、排队注入消息。你始终是操控者，不是旁观者。
- **Three-Layer Trace** — Provider → Runtime → Operator action，三层事件统一时间线。`codelord trace show` 5 秒定位问题出在哪。
- **Reasoning Control** — 实时调节 reasoning 强度（off / minimal / low / medium / high / xhigh），在速度和深度之间随时切换。
- **Multi-Provider** — 通过 pi-ai 统一接入 OpenAI、Anthropic、Bedrock、Google 等 provider，切换只需改一行配置。
- **Checkpoint & Undo** — 每次 tool 执行自动快照文件状态，`/undo` 一键回退。

## ⚡ Quick Start

```bash
# 安装 & 构建
pnpm install
pnpm build

# 配置（二选一）
export CODELORD_API_KEY=your-key-here
# 或编辑 ~/.codelord/config.toml

# 启动
cd your-project
codelord
```

## 🔧 Commands

在 REPL 中可用的 slash commands：

| 命令                 | 说明                      |
| -------------------- | ------------------------- |
| `/reasoning [level]` | 查看或切换 reasoning 强度 |
| `/undo`              | 回退上一次文件变更        |
| `/exit`              | 退出会话                  |

CLI 子命令：

```bash
codelord init              # 初始化配置
codelord config            # 查看当前配置
codelord sessions          # 列出已保存的 session
codelord trace list        # 列出 trace 记录
codelord trace show <id>   # 查看 trace 详情（支持前缀匹配）
codelord trace check <id>  # 对 trace 做结构化校验
```

## 📐 架构简介

```
packages/config        — 配置 schema、校验、分层加载
packages/agent-core    — 可复用 engine：runtime、tools、event spine、trace、safety
agents/coding-agent    — 产品 shell：CLI、REPL、Ink renderer、persistence、auth
```

设计哲学：Agent Core 只做执行语义，保持极简。智能不靠 core 堆功能，而是靠 Context Engineering（system prompt 组装、session 上下文管理）和 Skill 扩展来实现。

更多技术细节见 [`docs/`](./docs/) 目录。

## 📄 License

暂未指定开源协议。
