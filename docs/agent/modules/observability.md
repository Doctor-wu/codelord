# Observability Module

## Purpose

This module owns the stable vocabulary for seeing what the agent did.
It covers:
- lifecycle events
- reasoning and tool-call semantic objects
- structured trace schema
- trace diagnostics
- redaction rules
- trace recording and storage

Use this module when the question is "what happened?" or "why did the operator see that?".

## Owns

- `AssistantReasoningState`
- `ToolCallLifecycle`
- lifecycle-event schema
- usage aggregate semantics
- `TraceRunV2` schema and ledgers
- trace checking / diagnostics
- secret redaction for trace-safe previews
- recording provider, agent, and lifecycle layers into a unified run ledger
- workspace-aware trace persistence and listing

## Does Not Own

- renderer layout
- CLI text formatting beyond trace display helpers
- runtime truth itself
- session persistence for resume

## Key Files

| Path | Role |
| --- | --- |
| `packages/agent-core/src/events.ts` | lifecycle objects and event shapes |
| `packages/agent-core/src/trace.ts` | trace schema |
| `packages/agent-core/src/trace-check.ts` | structural and behavioral diagnostics |
| `packages/agent-core/src/redact.ts` | preview and redaction pipeline |
| `agents/coding-agent/src/trace-recorder.ts` | 3-layer ledger recorder |
| `agents/coding-agent/src/trace-store.ts` | local trace persistence and CLI formatting |

## Trajectory Fields

`LifecycleTraceEvent` carries trajectory-grade data so the default trace mode shows a useful agent narrative without requiring `rawMode`:

| Field | Populated on | Source |
| --- | --- | --- |
| `textPreview` | `assistant_turn_end` | Accumulated from provider stream `text_delta` events (always, regardless of rawMode) |
| `thinkingPreview` | `assistant_turn_end` | Accumulated from provider stream `thinking_delta` events |
| `stopReason` | `assistant_turn_end` | From provider stream `done` event |
| `reasoningIntent` | `assistant_turn_start`, `assistant_turn_end` | From `AssistantReasoningState.intent` |
| `reasoningWhy` | `assistant_turn_start`, `assistant_turn_end` | From `AssistantReasoningState.why` |
| `argsPreview` | `tool_call_completed` | From `ToolCallLifecycle.args` (JSON, redacted) |
| `resultPreview` | `tool_call_completed` | From `ToolCallLifecycle.result` (redacted) |
| `isError` | `tool_call_completed` | From `ToolCallLifecycle.isError` |

The recorder accumulates text/thinking from provider stream events into per-turn buffers. These buffers are flushed (via `safePreview` for redaction + truncation) into the lifecycle trace event when `assistant_turn_end` fires. This decouples trajectory visibility from `rawMode`, which controls whether individual provider stream delta events are also recorded.

## Invariants

- Lifecycle events are product semantics, not renderer-private implementation detail.
- Trace should be able to explain operator-visible behavior, not only model-internal activity.
- Default trace mode must show a useful agent trajectory: user prompt, reasoning, tool calls with args/results, and text output.
- Trajectory data lives in lifecycle trace events, not in provider stream events — rawMode controls verbosity, not visibility.
- Redaction is part of trace correctness once traces hit disk.
- Trace presentation is downstream of trace schema; formatting must not redefine facts.
- If a concept matters across layers, prefer a first-class event or object over string parsing.

## Common Edit Entry Points

- Change reasoning/tool lifecycle semantics → `packages/agent-core/src/events.ts`.
- Change trace schema → `packages/agent-core/src/trace.ts`.
- Add or tighten diagnostics → `packages/agent-core/src/trace-check.ts`.
- Change redaction behavior → `packages/agent-core/src/redact.ts`.
- Change how traces are recorded from live runs → `agents/coding-agent/src/trace-recorder.ts`.
- Change trace storage or CLI display → `agents/coding-agent/src/trace-store.ts`.

## High-Risk Changes

- changing lifecycle event names or meaning
- changing trace version or ledger structure
- changing what is redacted before disk
- changing how interrupt, queue, or operator actions are represented
- adding diagnostics that depend on renderer-specific assumptions

## Required Doc Follow-Through

- Trace or event semantics changed → update `docs/system/ARCHITECTURE.md` and this file.
- If an observability compromise is truly unavoidable, write its target state and remaining gap directly into the owning `docs/planning/RoadMap.md` section and `docs/planning/Sprint.md`.
- Current proof standard changed → update `docs/system/EVALS.md`.
- Current focus shifted because of trace findings → update `docs/planning/DecisionLog.md` or `docs/planning/Sprint.md` as appropriate.
