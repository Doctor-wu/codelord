# Config 包规则

作用域：`packages/config/**`

## 先读

- 根 `AGENTS.md`
- `docs/system/ARCHITECTURE.md`
- `docs/agent/modules/config.md`

## 本包职责

- config schema
- 默认值
- 分层加载
- 校验
- TOML 解析

## 本包不应拥有

- OAuth 流程
- CLI UX
- runtime 状态
- renderer 行为

## 局部规则

- 保持优先级显式：defaults → TOML → env → CLI。
- 保持合并行为为字段级，除非有显式的设计变更。
- 不要让 config 加载成为 provider 登录流程的 owner。
- 如果某个字段变更了证据或 budget 策略，更新 `docs/system/EVALS.md`。
