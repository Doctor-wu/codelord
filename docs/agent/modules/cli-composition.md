# CLI And Composition Module

## Purpose

This module owns the concrete `codelord` application shell.
It takes stable lower-level pieces and turns them into a runnable product.

It covers:
- CLI command surface
- REPL startup and run loop
- model resolution and runtime assembly
- system prompt assembly
- tool kernel assembly in the app shell

## Owns

- command parsing and entrypoints
- `sessions` and `trace` command UX
- REPL startup and main loop
- wiring renderer, runtime, stores, auth, recorder, and checkpoint manager
- contract-driven system prompt assembly
- choosing what concrete built-in tools the product exposes

## Does Not Own

- config schema itself
- runtime state machine semantics
- tool handler logic
- trace schema semantics
- renderer source-of-truth rules

## Key Files

| Path | Role |
| --- | --- |
| `agents/coding-agent/src/bin.ts` | package executable entry |
| `agents/coding-agent/src/cli/index.ts` | CLI parsing and subcommand dispatch |
| `agents/coding-agent/src/cli/repl.ts` | REPL orchestration |
| `agents/coding-agent/src/cli/run.ts` | model resolution and run helpers |
| `agents/coding-agent/src/cli/tool-kernel.ts` | tool-kernel assembly |
| `agents/coding-agent/src/cli/system-prompt.ts` | system prompt builder |
| `agents/coding-agent/src/cli/init.ts` | config init UX |

## Invariants

- The product shell composes core; it does not redefine core semantics.
- `buildSystemPrompt()` is the single system-prompt assembly point.
- `createToolKernel()` is the single tool-kernel assembly point for the product shell.
- REPL is the main product path.
- Trace subcommands consume trace data; they do not invent trace facts.

## Common Edit Entry Points

- Add or change a command → `agents/coding-agent/src/cli/index.ts`.
- Change REPL control flow → `agents/coding-agent/src/cli/repl.ts`.
- Change model resolution → `agents/coding-agent/src/cli/run.ts`.
- Change prompt composition → `agents/coding-agent/src/cli/system-prompt.ts`.
- Change available tool set → `agents/coding-agent/src/cli/tool-kernel.ts`.

## Boundary Rules

- Do not duplicate prompt assembly in multiple places.
- Do not move runtime truth into CLI flags or renderer state.
- Do not bypass the tool kernel by hand-wiring per-command tool sets unless the product requirement is explicit.
- Do not put provider auth resolution into config loading.
