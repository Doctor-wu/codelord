# Codelord

Codelord is a production-oriented coding agent monorepo.
It is not organized as "one big app"; it is organized as a reusable engine plus a concrete product shell.

## Workspace Layout

| Path | Role |
| --- | --- |
| `packages/config` | Config schema, defaults, validation, layered loading |
| `packages/agent-core` | Runtime, tools, event spine, trace schema, safety, router |
| `agents/coding-agent` | `codelord` CLI, REPL, Ink renderer, persistence, auth |
| `docs/agent/modules` | Agent-facing module summaries |
| `RoadMap.md` | Long-range roadmap |
| `Now.md` | Current priority |
| `ClosureLedger.md` | Temporary-state ledger |
| `DecisionLog.md` | Why the route changed |

## Common Commands

- Install: `pnpm install`
- Build all packages: `pnpm build`
- Typecheck: `pnpm typecheck`
- Run tests: `pnpm test`

## Doc Entry Points

### For Humans

- Start here: `README.md`
- Current focus: `Now.md`
- Long-range direction: `RoadMap.md`
- Stable structure: `ARCHITECTURE.md`

### For Agents

- Entry rules: `AGENTS.md`
- Stable boundaries: `ARCHITECTURE.md`
- Design constraints: `DesignPrinciples.md`
- Evidence bar: `EVALS.md`
- Module summaries: `docs/agent/modules/README.md`

## Product Posture

Codelord is optimized for:
- production-first layering
- operator trust over demo polish
- eval-first claims
- rewritable roadmap, stable architecture

That means current-focus details live outside the roadmap, and temporary solutions must carry explicit closure conditions.
