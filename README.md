# Codelord

Codelord is a production-oriented coding agent monorepo.
It is organized as a reusable engine plus a concrete product shell, not as one giant app.

## Workspace Layout

| Path | Role |
| --- | --- |
| `packages/config` | Config schema, defaults, validation, layered loading |
| `packages/agent-core` | Runtime, tools, event spine, trace schema, safety, router |
| `agents/coding-agent` | `codelord` CLI, REPL, Ink renderer, persistence, auth |
| `docs/planning` | Owner-facing roadmap, sprint, closure ledger, decision log |
| `docs/system` | Stable architecture, design principles, eval rules |
| `docs/agent/modules` | Agent-facing module summaries |

## Common Commands

- Install: `pnpm install`
- Build all packages: `pnpm build`
- Typecheck: `pnpm typecheck`
- Run tests: `pnpm test`

## Doc Entry Points

### For Humans

- Current battle: `docs/planning/Sprint.md`
- Long-range direction: `docs/planning/RoadMap.md`
- Stable structure: `docs/system/ARCHITECTURE.md`
- Temporary-state debt: `docs/planning/ClosureLedger.md`

### For Agents

- Entry rules: `AGENTS.md`
- Stable boundaries: `docs/system/ARCHITECTURE.md`
- Design constraints: `docs/system/DesignPrinciples.md`
- Evidence bar: `docs/system/EVALS.md`
- Module summaries: `docs/agent/modules/README.md`

## Planning Model

Codelord uses a sprint loop, not a static status page.

1. `docs/planning/RoadMap.md` holds the long-range route and milestone pool.
2. `docs/planning/Sprint.md` holds the current active sprint only.
3. When a sprint closes, update the roadmap, archive the sprint, and load the next sprint from the roadmap.

## Product Posture

Codelord is optimized for:
- production-first layering
- operator trust over demo polish
- eval-first claims
- rewritable roadmap, stable architecture

That means:
- current execution lives in `docs/planning/Sprint.md`
- long-range intent lives in `docs/planning/RoadMap.md`
- temporary solutions must carry explicit closure conditions in `docs/planning/ClosureLedger.md`
