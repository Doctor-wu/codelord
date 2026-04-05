# Agent Module Index

Use this directory when you need a stable summary of a concrete code area.
These docs are for fast orientation, boundary checks, and safe edit entrypoints.

## Module Map

| Doc | Read when |
| --- | --- |
| `docs/agent/modules/config.md` | changing config schema, defaults, env overrides, TOML loading |
| `docs/agent/modules/runtime.md` | changing runtime state, bursts, queue, pending questions, resume semantics |
| `docs/agent/modules/tool-platform.md` | changing built-in tools, contracts, router, safety, or tool kernel assembly |
| `docs/agent/modules/observability.md` | changing lifecycle events, trace schema, redaction, diagnostics, or trace recording |
| `docs/agent/modules/cli-composition.md` | changing CLI commands, REPL assembly, system prompt wiring, or command flow |
| `docs/agent/modules/renderer.md` | changing timeline projection, Ink UI, input bridge, or tool/reasoning presentation |
| `docs/agent/modules/persistence.md` | changing session storage, trace storage, checkpointing, or undo |
| `docs/agent/modules/auth.md` | changing API key resolution, OAuth login/refresh, or auth dispatch |

## How To Use These Docs

- Start from the closest module doc before editing a non-trivial area.
- Use `docs/system/ARCHITECTURE.md` for cross-module boundary questions.
- Use `docs/planning/ClosureLedger.md` if the module is in a temporary or current-focus state.
- Update the relevant module doc when ownership, invariants, or edit entrypoints change.
