# Coding Agent App Shell Rules

Scope: `agents/coding-agent/**`

## Read First

- Root `AGENTS.md`
- `docs/planning/Sprint.md`
- `docs/system/ARCHITECTURE.md`
- `docs/system/DesignPrinciples.md`
- `docs/agent/modules/cli-composition.md`
- `docs/agent/modules/renderer.md`
- `docs/agent/modules/persistence.md`
- `docs/agent/modules/auth.md`

If the task touches current operator UX or streaming behavior, also read `docs/planning/ClosureLedger.md`.

## What This Package Owns

- CLI commands and REPL flow
- app-shell assembly of runtime, renderer, stores, auth, prompt, tool kernel
- terminal UI and timeline projection
- session and trace persistence
- checkpoint manager and `/undo`
- auth dispatch and provider login flow

## What This Package Must Not Own

- reusable runtime truth
- trace schema truth
- config schema
- core tool semantics

## Local Rules

- Compose core; do not redefine it.
- Keep `buildSystemPrompt()` as the single prompt assembly point.
- Keep `createToolKernel()` as the single tool-kernel assembly point.
- Remember that renderer timeline is a derived cache, not the source of truth.
- When changing resume or undo behavior, verify snapshot truth and timeline reconciliation together.

## Mandatory Follow-Through

- CLI/REPL composition change → update `docs/agent/modules/cli-composition.md`
- Renderer semantics change → update `docs/agent/modules/renderer.md`
- Persistence or undo change → update `docs/agent/modules/persistence.md`
- Auth change → update `docs/agent/modules/auth.md`
- Current operator UX workaround changed → update `docs/planning/ClosureLedger.md` or `docs/planning/Sprint.md`
