# Tool Platform Module

## Purpose

The tool platform turns raw tool calls into stable execution primitives.
It is not just a list of functions.

It owns four layers:
- tool handlers
- tool contracts
- deterministic router
- safety policy

The product shell then assembles these into a `ToolKernel`.

## Owns

- built-in tool schemas and handlers
- per-tool contracts
- deterministic bash-to-built-in routing rules
- risk classification and blocking
- standard tool error semantics
- product-shell assembly of tools, handlers, contracts, router, and safety policy

## Does Not Own

- long-range planning strategy
- skill policy
- CLI command parsing
- renderer presentation
- auth or config loading

## Key Files

| Path | Role |
| --- | --- |
| `packages/agent-core/src/tools/bash.ts` | bash tool |
| `packages/agent-core/src/tools/file-read.ts` | file read tool |
| `packages/agent-core/src/tools/file-write.ts` | file write tool |
| `packages/agent-core/src/tools/file-edit.ts` | precise edit tool |
| `packages/agent-core/src/tools/search.ts` | code/document search tool |
| `packages/agent-core/src/tools/ls.ts` | directory listing tool |
| `packages/agent-core/src/tools/ask-user.ts` | blocking question primitive |
| `packages/agent-core/src/tools/contracts.ts` | colocated contract export surface |
| `packages/agent-core/src/tool-router.ts` | deterministic routing rules |
| `packages/agent-core/src/tool-safety.ts` | risk classification and blocking |
| `agents/coding-agent/src/cli/tool-kernel.ts` | app-shell assembly of tool kernel |
| `agents/coding-agent/src/cli/system-prompt.ts` | contract rendering into system prompt |

## Invariants

- Contracts describe intended use; they are not the enforcement layer.
- Router rewrites obvious misuse conservatively; it is not a semantic planner.
- Safety decides whether execution is allowed.
- `bash` is the fallback primitive, not the default preferred path.
- `AskUserQuestion` is a control primitive, not a generic escape hatch for model uncertainty.

## Common Edit Entry Points

- Change a tool's handler behavior → matching file in `packages/agent-core/src/tools/`.
- Change contract wording or boundaries → tool file + `contracts.ts` surface if needed.
- Add a new router rule → `packages/agent-core/src/tool-router.ts`.
- Change risk rules or sensitive paths → `packages/agent-core/src/tool-safety.ts`.
- Change which tools are assembled in the app shell → `agents/coding-agent/src/cli/tool-kernel.ts`.
- Change how contracts are shown to the model → `agents/coding-agent/src/cli/system-prompt.ts`.

## Boundary Rules

- Do not put product-specific UI text into core tool handlers.
- Do not move router or safety policy into prompt-only guidance.
- Do not turn router into a probabilistic planner.
- Do not make contracts lie about failure semantics.

## Required Doc Follow-Through

- Tool ownership or layering changed → update `docs/system/ARCHITECTURE.md`.
- Current router/safety workaround added → update `docs/planning/ClosureLedger.md` if temporary.
- Evidence claims about better routing or visibility changed → update `docs/system/EVALS.md`.
