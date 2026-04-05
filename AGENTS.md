# Codelord Agent Rules

## Identity & Boundaries

- This repo is a `pnpm` monorepo with three stable code layers:
  - `packages/config` — config schema, defaults, validation, layered loading
  - `packages/agent-core` — reusable engine semantics
  - `agents/coding-agent` — `codelord` product shell, CLI, REPL, renderer, persistence, auth
- Root-level docs stay minimal. Detailed docs live under `docs/`.
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
4. `docs/planning/Sprint.md`
5. `docs/planning/ClosureLedger.md`
6. `docs/system/ARCHITECTURE.md`
7. `docs/system/DesignPrinciples.md`
8. `docs/system/EVALS.md`
9. `docs/planning/RoadMap.md`
10. `docs/planning/DecisionLog.md`
11. `README.md`

If two docs disagree, prefer the higher item in this order.
Current sprint sequencing beats roadmap sequencing.

## Read Order By Task

| Task | Read first |
| --- | --- |
| Repo-wide design / prioritization | `docs/planning/Sprint.md` → `docs/planning/RoadMap.md` → `docs/system/ARCHITECTURE.md` |
| Current-focus subsystem work | `docs/planning/Sprint.md` → `docs/planning/ClosureLedger.md` |
| Runtime / queue / interrupt / resume | `packages/agent-core/AGENTS.md` → `docs/agent/modules/runtime.md` |
| Tool contracts / router / safety | `packages/agent-core/AGENTS.md` → `docs/agent/modules/tool-platform.md` |
| Event / trace / redaction / diagnostics | `packages/agent-core/AGENTS.md` → `docs/agent/modules/observability.md` |
| CLI / REPL / system prompt wiring | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/cli-composition.md` |
| Ink renderer / timeline projection | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/renderer.md` |
| Session store / trace store / undo | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/persistence.md` |
| Config schema / loading | `packages/config/AGENTS.md` → `docs/agent/modules/config.md` |
| Provider credentials / OAuth | `agents/coding-agent/AGENTS.md` → `docs/agent/modules/auth.md` |
| Long-range roadmap reasoning | `docs/planning/RoadMap.md` → `docs/planning/DecisionLog.md` |

## Document Map

| Path | Owns | Must stay out |
| --- | --- | --- |
| `README.md` | Human/operator entrypoint, quickstart, doc map | Fine-grained agent instructions |
| `AGENTS.md` | Agent entry rules, read order, authority order, doc routing | Long philosophy essays, sprint internals, module internals |
| `docs/planning/RoadMap.md` | Long-range capability map, milestone intent, hard gates | Short-half-life execution sequencing |
| `docs/planning/Sprint.md` | Current sprint contract, progress, open gaps, next slice | Full historical archive |
| `docs/planning/ClosureLedger.md` | Temporary mechanisms, exit criteria, required evidence | Generic TODOs without closure logic |
| `docs/planning/DecisionLog.md` | Why priorities or framing changed | Normative execution rules |
| `docs/planning/archive/sprints/*.md` | Completed sprint history | Live current sprint |
| `docs/system/ARCHITECTURE.md` | Stable layering, dependency directions, source-of-truth rules, system flow | Temporary workarounds, current sprint ordering |
| `docs/system/DesignPrinciples.md` | Cross-cutting design rules and tradeoffs | Directory-specific edit instructions |
| `docs/system/EVALS.md` | Evidence requirements, metrics, proof standard | Historical decision diary |
| `docs/agent/modules/*.md` | Stable module summaries, ownership boundaries, edit entrypoints | Historical debate, daily progress |

## Sprint Lifecycle

Work from `docs/planning/Sprint.md`, not directly from `docs/planning/RoadMap.md`.

When a sprint closes:
- update `docs/planning/RoadMap.md`
- update `docs/planning/ClosureLedger.md` if temporary-state facts changed
- update `docs/planning/DecisionLog.md` if route or framing changed
- archive the finished sprint to `docs/planning/archive/sprints/`
- load the next sprint from `docs/planning/RoadMap.md` into `docs/planning/Sprint.md`

## Repo Map

| Path | Meaning |
| --- | --- |
| `packages/config` | Config schema and layered loading |
| `packages/agent-core` | Reusable engine, tools, event spine, trace schema |
| `agents/coding-agent` | CLI app shell, REPL, renderer, auth, stores, checkpoints |
| `docs/planning` | Owner-facing planning and sprint control |
| `docs/system` | Stable design and architecture rules |
| `docs/agent/modules` | Agent-facing module summaries |

## Mandatory Update Rules

When behavior changes, update the matching docs in the same task.

- Layer or ownership boundary changed → update `docs/system/ARCHITECTURE.md` and the affected module doc.
- Cross-cutting design rule changed → update `docs/system/DesignPrinciples.md`.
- Evidence bar or metrics changed → update `docs/system/EVALS.md`.
- Current sprint scope/progress changed → update `docs/planning/Sprint.md`.
- Temporary workaround introduced, extended, or retired → update `docs/planning/ClosureLedger.md`.
- Long-range milestone intent changed → update `docs/planning/RoadMap.md`; if the why matters, also update `docs/planning/DecisionLog.md`.
- Package-local rules changed → update the nearest scoped `AGENTS.md`.

## Change Hygiene

- Before editing code in a scoped area, read the nearest `AGENTS.md` plus the matching module doc.
- Before changing event or trace schema, read both `docs/system/ARCHITECTURE.md` and `docs/system/EVALS.md`.
- Before changing current-focus subsystems, read `docs/planning/Sprint.md` and `docs/planning/ClosureLedger.md` first.
- Do not put short-half-life execution notes back into `docs/planning/RoadMap.md`.
- Do not put module-level internals into root `AGENTS.md`; add or update a module doc instead.

## Verification Commands

- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Test: `pnpm test`

Run the narrowest relevant verification first. Expand only after the touched surface is stable.
