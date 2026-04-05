# Agent Core Rules

Scope: `packages/agent-core/**`

## Read First

- Root `AGENTS.md`
- `ARCHITECTURE.md`
- `DesignPrinciples.md`
- `docs/agent/modules/runtime.md`
- `docs/agent/modules/tool-platform.md`
- `docs/agent/modules/observability.md`

If the task touches current-focus semantics, also read `Now.md` and `ClosureLedger.md`.

## What This Package Owns

- reusable runtime semantics
- tool primitives, contracts, router, safety
- lifecycle/event vocabulary
- trace schema and diagnostics
- snapshot and checkpoint types

## What This Package Must Not Own

- CLI command surface
- Ink layout or component presentation
- session/trace disk layout
- auth UX or provider login flow

## Local Rules

- Treat lifecycle events and trace schema as stable product semantics, not private internals.
- Do not put renderer-only assumptions into core types without a cross-layer reason.
- Do not move product-shell glue into this package for convenience.
- When changing source-of-truth objects, update docs in the same task.

## Mandatory Follow-Through

- Runtime change → update `docs/agent/modules/runtime.md`
- Tool/router/safety change → update `docs/agent/modules/tool-platform.md`
- Event/trace/redaction change → update `docs/agent/modules/observability.md`
- Cross-layer boundary change → update `ARCHITECTURE.md`
- Temporary workaround in current-focus area → update `ClosureLedger.md`
