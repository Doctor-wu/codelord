# Codelord Architecture

## Purpose

This document is the stable source of truth for repository layering, dependency direction, module ownership, and system-wide source-of-truth rules.

Use this document when the question is "where should this behavior live?".
Do not use it for short-half-life priority ordering — that belongs in `docs/planning/Sprint.md`.

## Repository Layers

| Layer | Path | Owns | Must not own |
| --- | --- | --- | --- |
| Config | `packages/config` | config schema, defaults, validation, layered loading | auth flow, runtime state, UI |
| Core engine | `packages/agent-core` | runtime semantics, tool primitives, router, safety, event spine, trace schema | CLI UX, renderer layout, persistence file paths |
| Product shell | `agents/coding-agent` | command surface, REPL flow, system prompt assembly, Ink UI, auth, local stores, checkpoints | reusable engine invariants |

## Dependency Direction

The allowed direction is one-way.

- `packages/config` depends on external libraries only.
- `packages/agent-core` depends on external libraries only.
- `agents/coding-agent` may depend on `@agent/config` and `@agent/core`.
- `packages/agent-core` must not import from `agents/coding-agent`.
- `packages/config` must not import from `packages/agent-core` or `agents/coding-agent`.

If a change would reverse these arrows, stop and redesign.

## System Map

| Area | Key files | Owns |
| --- | --- | --- |
| Config loading | `packages/config/src/schema.ts`, `packages/config/src/load.ts`, `packages/config/src/toml.ts` | config shape, defaults, validation, load precedence |
| Runtime | `packages/agent-core/src/runtime.ts`, `packages/agent-core/src/react-loop.ts`, `packages/agent-core/src/session-snapshot.ts` | session state, bursts, queue, blocking, resume semantics |
| Tool platform | `packages/agent-core/src/tools/*`, `packages/agent-core/src/tool-router.ts`, `packages/agent-core/src/tool-safety.ts` | tool handlers, contracts, routing, safety classification |
| Event & trace model | `packages/agent-core/src/events.ts`, `packages/agent-core/src/trace.ts`, `packages/agent-core/src/trace-check.ts`, `packages/agent-core/src/redact.ts` | lifecycle semantics, trace schema, diagnostics, redaction |
| CLI composition | `agents/coding-agent/src/cli/index.ts`, `agents/coding-agent/src/cli/repl.ts`, `agents/coding-agent/src/cli/system-prompt.ts`, `agents/coding-agent/src/cli/tool-kernel.ts` | command surface, REPL wiring, prompt assembly, tool assembly |
| Renderer | `agents/coding-agent/src/renderer/index.ts`, `agents/coding-agent/src/renderer/ink-renderer.tsx`, `agents/coding-agent/src/renderer/ink/timeline-projection.ts` | timeline projection, Ink UI, input bridge |
| Persistence | `agents/coding-agent/src/session-store.ts`, `agents/coding-agent/src/trace-store.ts`, `agents/coding-agent/src/trace-recorder.ts`, `agents/coding-agent/src/checkpoint-manager.ts` | local session/trace persistence, trace recording, undo checkpoints |
| Auth | `agents/coding-agent/src/auth/index.ts`, `agents/coding-agent/src/auth/api-key.ts`, `agents/coding-agent/src/auth/oauth.ts` | provider credential resolution |

## Source Of Truth Rules

| Concern | Source of truth | Derived / secondary |
| --- | --- | --- |
| Session control state | `AgentRuntime` + `SessionSnapshot` | renderer timeline cache |
| Resume reconciliation | `resolveResumeState()` + runtime snapshot | previously rendered timeline |
| Tool usage guidance | tool contracts rendered by `buildSystemPrompt()` | ad hoc prompt wording elsewhere |
| Tool execution permission | router + safety policy | UI badges or trace formatting |
| Lifecycle semantics | `LifecycleEvent` / `ToolCallLifecycle` / `AssistantReasoningState` | renderer-specific view objects |
| Trace facts | `TraceRunV2` recorded by `TraceRecorder` | CLI pretty-print output |
| Local persistence layout | `SessionStore` / `TraceStore` / `CheckpointManager` | docs and examples |

If a renderer view or formatted string disagrees with the runtime or trace object, the runtime/trace object wins.

## End-To-End Control Flow

1. `agents/coding-agent/src/cli/index.ts` parses command-line intent.
2. Config loads through `packages/config`.
3. Auth resolves provider credentials in `agents/coding-agent/src/auth`.
4. `createToolKernel()` assembles tools, handlers, contracts, router, and safety policy.
5. `buildSystemPrompt()` renders stable tool guidance into the system prompt.
6. `startRepl()` creates `AgentRuntime`, renderer, stores, recorder, and checkpoint manager.
7. `AgentRuntime` emits raw agent events plus lifecycle events.
8. Renderer projects lifecycle events into a timeline; `TraceRecorder` records provider, agent, and lifecycle ledgers.
9. `SessionStore` persists session snapshot + timeline; `TraceStore` persists structured traces.
10. On resume, runtime snapshot is reconciled first; timeline is hydrated as a derived cache.

## Architectural Boundaries That Matter Most

### Core vs product shell

- Put reusable execution semantics in `packages/agent-core`.
- Put app-specific command UX, terminal rendering, and filesystem layout in `agents/coding-agent`.
- If a change only matters for the `codelord` product shell, keep it out of core.

### Contracts vs enforcement

- Tool contracts describe intended use.
- Router applies deterministic rewrites.
- Safety policy decides whether execution is allowed.
- Prompt rendering can surface the contracts, but the prompt is not the enforcement layer.

### Runtime truth vs UI cache

- The runtime owns truth.
- The timeline is a projection for operator visibility.
- Session resume must reconcile from snapshot truth, not from old rendered artifacts.

### Trace schema vs trace presentation

- `TraceRunV2` is the factual ledger.
- `trace show` and `trace check` are consumers.
- Do not bake presentation assumptions back into the trace schema without a schema-level reason.

## Change Rules

- New cross-layer concept → define ownership first, then add code.
- New persistent state → specify source of truth and resume behavior.
- New lifecycle event → update trace semantics and relevant module docs.
- New temporary workaround in current-focus areas → record it in `docs/planning/ClosureLedger.md`.
- New long-range architectural direction → update `docs/planning/RoadMap.md`; if it changes existing reasoning, record the why in `docs/planning/DecisionLog.md`.
