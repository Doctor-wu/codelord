# GitHub Actions Secrets

本仓库的 eval workflows 通过 `workflow_dispatch` 手动触发。
所有 workflow 都依赖 GitHub Actions secrets；未配置时会直接导致运行失败或能力缺失。

## 通用 Secrets

| Secret | 必填 | 用途 | 使用的 workflow |
| --- | --- | --- | --- |
| `CODELORD_API_KEY` | 是 | 主 agent provider 的 API key | 全部 |
| `CODELORD_BASE_URL` | 否 | 自定义 provider base URL | 全部 |

## BrowseComp 额外 Secrets

| Secret | 必填 | 用途 |
| --- | --- | --- |
| `TAVILY_API_KEY` | 是 | `web_search` 检索能力 |
| `GRADER_PROVIDER` | 否 | 独立 grader provider |
| `GRADER_MODEL` | 否 | 独立 grader model |
| `GRADER_API_KEY` | 否 | 独立 grader API key |
| `GRADER_BASE_URL` | 否 | 独立 grader base URL |

如果没有配置 `GRADER_*`，BrowseComp 默认使用和主 agent 相同的 provider / model。

## 默认运行模型

当前 workflow 默认使用：

- provider: `anthropic`
- model: `claude-sonnet-4-6`
- reasoning level: `low`

如果需要调整默认模型，可以直接修改对应 workflow 的 job `env`。

## Workflow 对应关系

| Workflow | 额外依赖 |
| --- | --- |
| `eval-polyglot.yml` | Docker |
| `eval-swe-bench.yml` | Docker |
| `eval-browsecomp.yml` | Docker + Tavily |
| `eval-terminal-bench.yml` | Docker + Python + Harbor |

## 配置位置

GitHub 仓库地址：[`Doctor-wu/codelord`](https://github.com/Doctor-wu/codelord)

在仓库 Settings 中配置：

1. `Settings`
2. `Secrets and variables`
3. `Actions`
4. 新建对应 `Repository secrets`
