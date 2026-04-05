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

## Invariants

- Lifecycle events are product semantics, not renderer-private implementation detail.
- Trace should be able to explain operator-visible behavior, not only model-internal activity.
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

- Trace or event semantics changed → update `ARCHITECTURE.md` and this file.
- Current observability gap or workaround added → update `ClosureLedger.md`.
- Current proof standard changed → update `EVALS.md`.
- Current focus shifted because of trace findings → update `DecisionLog.md` or `Now.md` as appropriate.
