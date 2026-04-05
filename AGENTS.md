# Codelord Agent Rules

## Identity & Boundaries

- This repo is a `pnpm` monorepo with three stable code layers:
  - `packages/config` — config schema, defaults, validation, layered loading
  - `packages/agent-core` — reusable engine semantics
  - `agents/coding-agent` — `codelord` product shell, CLI, REPL, renderer, persistence, auth
- Keep the layering clean:
  - Don't move product-shell concerns into `packages/agent-core` unless they change reusable execution semantics.
  - Don't move engine invariants into renderer, stores, or CLI glue.
  - Don't move auth or provider login flow into config loading.
- Treat event, trace, queue, interrupt, resume, and checkpoint semantics as product-critical. They are not refactor noise.
- Do not change dependency versions, `pnpm-lock.yaml`, or root tooling config unless the task explicitly requires it.

## Authority Order

Use the most local and most authoritative source first.

1. Code and tests
2. Nearest scoped `AGENTS.md`
3. Root `AGENTS.md`
4. `Now.md`
5. `ClosureLedger.md`
6. `ARCHITECTURE.md`
7. `DesignPrinciples.md`
8. `EVALS.md`
9. `RoadMap.md`
10. `DecisionLog.md`
11. `README.md`

If two docs disagree, prefer the higher item in this order.

## Read Order By Task

| Task | Read first |
| --- | --- |
| Repo-wide design / prioritization | `Now.md` → `ARCHITECTURE.md` → `DesignPrinciples.md` → `EVALS.md` |
| Current-focus subsystem work | `Now.md` → `ClosureLedger.md` |
| Runtime / queue / interrupt / resume | `packages/agent-core/AGENTS.md` → `docs/agent/modules/runtime.md` |
| Tool contracts / router / safety | `packages/agent-core/AGENTS.md` → `docs/agent/modules/tool-platform.md` |
| Event / trace / redaction / diagnostics | `packages/agent-core/AGENTS.md` → `docs/agent/modules/observability.md` |
| CLI / REPL / system prompt wiring | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/cli-composition.md` |
| Ink renderer / timeline projection | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/renderer.md` |
| Session store / trace store / undo | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/persistence.md` |
| Config schema / loading | `packages/config/AGENTS.md` → `docs/agent/modules/config.md` |
| Provider credentials / OAuth | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/auth.md` |
| Long-range roadmap reasoning | `RoadMap.md` → `DecisionLog.md` |

## Document Map

| File | Owns | Must stay out |
| --- | --- | --- |
| `AGENTS.md` | Agent entry rules, read order, authority order, doc routing | Long philosophy essays, ephemeral battle plan, module internals |
| `README.md` | Human/operator quickstart, workspace map, command entrypoints | Fine-grained agent instructions |
| `ARCHITECTURE.md` | Stable layering, dependency directions, source-of-truth rules, system flow | Temporary workarounds, current sprint ordering |
| `DesignPrinciples.md` | Cross-cutting design rules and non-negotiable tradeoffs | Directory-specific edit instructions |
| `EVALS.md` | Evidence requirements, metrics, eval posture, proof standard | Historical decision diary |
| `Now.md` | Current priority, non-goals, next gate | Long-term milestone map |
| `ClosureLedger.md` | Temporary mechanisms, exit criteria, required evidence | Generic TODOs without closure logic |
| `RoadMap.md` | Long-range capability map and milestone intent | Short-half-life execution sequencing |
| `DecisionLog.md` | Why priorities or framing changed | Normative execution rules |
| `docs/agent/modules/*.md` | Stable module summaries, ownership boundaries, edit entrypoints | Historical debate, daily progress |

## Repo Map

| Path | Meaning |
| --- | --- |
| `packages/config` | Config schema and layered loading |
| `packages/agent-core` | Reusable engine, tools, event spine, trace schema |
| `agents/coding-agent` | CLI app shell, REPL, renderer, auth, stores, checkpoints |
| `docs/agent/modules` | Agent-facing module summaries |

## Mandatory Update Rules

When behavior changes, update the matching docs in the same task.

- Layer or ownership boundary changed → update `ARCHITECTURE.md` and the affected module doc.
- Cross-cutting design rule changed → update `DesignPrinciples.md`.
- Evidence bar or metrics changed → update `EVALS.md`.
- Current priority changed → update `Now.md`.
- Temporary workaround introduced, extended, or retired → update `ClosureLedger.md`.
- Long-range milestone intent changed → update `RoadMap.md`; if the why matters, also update `DecisionLog.md`.
- Package-local rules changed → update the nearest scoped `AGENTS.md`.

## Change Hygiene

- Before editing code in a scoped area, read the nearest `AGENTS.md` plus the matching module doc.
- Before changing event or trace schema, read both `ARCHITECTURE.md` and `EVALS.md`.
- Before changing current-focus subsystems, read `Now.md` and `ClosureLedger.md` first.
- Do not put short-half-life execution notes back into `RoadMap.md`.
- Do not put module-level internals into root `AGENTS.md`; add or update a module doc instead.

## Verification Commands

- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`

Run the narrowest relevant verification first. Expand only after the touched surface is stable.
