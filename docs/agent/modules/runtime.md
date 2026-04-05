# Runtime Module

## Purpose

The runtime module owns session-scoped execution semantics.
It is the authoritative control plane for:
- multi-turn execution
- burst boundaries
- queue injection
- blocked states
- pending questions
- interrupt handling
- snapshot export and resume hydration

## Owns

- `RuntimeState` and valid transitions
- `RunOutcome` for each burst
- session message history
- pending inbound queue
- pending and resolved questions
- interrupt request / observation flow
- current assistant turn identity
- usage aggregate, route records, and safety records as observability side channels
- snapshot export and hydration via `SessionSnapshot`

## Does Not Own

- CLI argument parsing
- system prompt wording
- filesystem storage layout for sessions
- Ink layout or component design
- provider credential resolution

## Key Files

| Path | Role |
| --- | --- |
| `packages/agent-core/src/runtime.ts` | canonical runtime implementation |
| `packages/agent-core/src/react-loop.ts` | compatibility facade around runtime behavior |
| `packages/agent-core/src/session-snapshot.ts` | snapshot shape, session meta, resume-state resolution |
| `packages/agent-core/src/checkpoint.ts` | checkpoint record types used by undo/persistence |
| `packages/agent-core/src/index.ts` | public exports |

## Invariants

- Runtime state and burst outcome are different concepts; outcomes are not states.
- Queue messages enter only at safe boundaries.
- `AskUserQuestion` answers return as normal user messages, not fake tool results.
- In-flight resume is downgraded into a safe state through snapshot reconciliation.
- Runtime snapshot is the source of truth across resume.
- Renderer state must never redefine runtime truth.

## Common Edit Entry Points

- Change state machine or burst semantics → `packages/agent-core/src/runtime.ts`.
- Change resume downgrade behavior → `packages/agent-core/src/session-snapshot.ts` and runtime hydration.
- Change what becomes part of a session snapshot → runtime export/hydrate + `session-snapshot.ts`.
- Change queue/question semantics → `packages/agent-core/src/runtime.ts`.

## High-Risk Changes

These need extra care and usually require doc updates:
- adding a new runtime state
- changing safe-boundary injection rules
- changing interrupt semantics
- changing what counts as resumable state
- changing snapshot schema

## Required Doc Follow-Through

- Runtime semantics changed → update `docs/system/ARCHITECTURE.md`.
- Current-focus control behavior changed → update `docs/planning/Sprint.md`.
- Temporary runtime workaround introduced → update `docs/planning/ClosureLedger.md`.
- Trace-visible runtime behavior changed → update `docs/agent/modules/observability.md`.
