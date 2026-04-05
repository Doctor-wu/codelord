# Renderer Module

## Purpose

The renderer module turns lifecycle semantics into an operator console.
It is responsible for what the operator sees and when they can act.

The renderer is important, but it is still a projection layer.
Its job is to make control-plane truth visible, not to become the truth.

## Owns

- Ink rendering
- timeline projection from lifecycle events
- input bridge and composer behavior
- tool-card and batch presentation
- reasoning viewport and live proxy presentation
- queue/status/question visibility inside the terminal UI

## Does Not Own

- runtime truth
- trace schema
- session persistence truth
- auth or config

## Key Files

| Path | Role |
| --- | --- |
| `agents/coding-agent/src/renderer/index.ts` | renderer surface |
| `agents/coding-agent/src/renderer/ink-renderer.tsx` | Ink bridge |
| `agents/coding-agent/src/renderer/types.ts` | renderer-facing types |
| `agents/coding-agent/src/renderer/ink/timeline-projection.ts` | lifecycle → timeline reducer |
| `agents/coding-agent/src/renderer/ink/App.tsx` | top-level layout |
| `agents/coding-agent/src/renderer/ink/InputComposer.tsx` | input UX |
| `agents/coding-agent/src/renderer/ink/ToolCallCard.tsx` | individual tool rendering |
| `agents/coding-agent/src/renderer/ink/ToolBatchCard.tsx` | batch rendering |
| `agents/coding-agent/src/renderer/ink/QuestionCard.tsx` | question rendering |
| `agents/coding-agent/src/renderer/ink/TimelineStatusBar.tsx` | status bar |

## Invariants

- Timeline items are derived from lifecycle events.
- Renderer state is a cache; runtime snapshot is the source of truth.
- Provisional-to-stable tool handoff must preserve identity.
- UI feedback must reflect real state transitions, not fake progress.
- Generic assistant-level reasoning must not be mislabeled as tool-scoped rationale.
- Built-in tools in active phase without stdout/stderr display derived phase feedback (e.g. `reading src/foo.ts…`) based on tool type and args. Real stdout/stderr/result always takes priority over derived feedback.
- After resume, the Header and InputComposer reflect the reconciled session mode (`YOUR TURN` / `PAUSED` / queue count) derived from `TimelineState.resumeContext`, not just timeline item inspection. Resume context is populated by `reconcileTimelineForResume` from runtime snapshot truth.

## Common Edit Entry Points

- Change lifecycle reduction or grouping → `timeline-projection.ts`.
- Change layout or fixed regions → `App.tsx`.
- Change input behavior → `InputComposer.tsx`.
- Change tool-card presentation → `ToolCallCard.tsx` and `ToolBatchCard.tsx`.
- Change status display → `TimelineStatusBar.tsx`.

## Boundary Rules

- Do not make the timeline the authority for resume or undo.
- Do not fabricate thought content to make the UI look alive.
- Do not solve trace gaps purely with presentation code if the semantic object is missing upstream.
- Do not stuff renderer-only assumptions back into core event types without a cross-layer reason.

## Required Doc Follow-Through

- Current operator-feedback workaround added or retired → update `docs/planning/ClosureLedger.md`.
- Operator-visibility proof standard changed → update `docs/system/EVALS.md`.
- Cross-layer rendering semantics changed → update `docs/system/ARCHITECTURE.md` and `docs/agent/modules/observability.md`.
