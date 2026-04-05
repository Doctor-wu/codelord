# Persistence Module

## Purpose

This module owns local disk persistence for sessions, traces, and undo checkpoints.
It answers:
- what gets written to disk
- where it is stored
- what is needed to resume a session
- how undo snapshots are collected and restored

## Owns

- session snapshot storage
- timeline snapshot storage as renderer cache
- trace file storage
- trace lookup/listing helpers
- lazy checkpoint creation for mutating tool bursts
- `/undo` restore behavior

## Does Not Own

- runtime semantics themselves
- trace schema itself
- renderer layout
- config or auth

## Key Files

| Path | Role |
| --- | --- |
| `agents/coding-agent/src/session-store.ts` | session snapshot + timeline persistence |
| `agents/coding-agent/src/trace-store.ts` | trace persistence and lookup |
| `agents/coding-agent/src/trace-recorder.ts` | live trace capture into persisted trace shape |
| `agents/coding-agent/src/checkpoint-manager.ts` | lazy checkpointing and undo restore |
| `packages/agent-core/src/session-snapshot.ts` | snapshot shape and resume-state logic |
| `packages/agent-core/src/checkpoint.ts` | checkpoint record types |

## Storage Layout

### Sessions

`~/.codelord/sessions/{sessionId}/`
- `meta.json`
- `snapshot.json`
- `timeline.json`

### Traces

`~/.codelord/traces/<workspaceSlug>-<workspaceId>/{runId}.json`

## Invariants

- Runtime snapshot is the authoritative persisted state.
- Timeline snapshot exists to hydrate UI faster; it is not the truth source.
- Checkpoints are created lazily on the first mutation in a burst.
- A checkpoint protects a burst of mutating tool calls, not an arbitrary UI moment.
- Undo is best-effort restoration against saved file snapshots.

## Common Edit Entry Points

- Change session layout or listing behavior → `session-store.ts`.
- Change trace directory or lookup behavior → `trace-store.ts`.
- Change what gets recorded live → `trace-recorder.ts`.
- Change checkpoint strategy or undo semantics → `checkpoint-manager.ts`.
- Change snapshot schema or resume downgrade semantics → `packages/agent-core/src/session-snapshot.ts`.

## Boundary Rules

- Do not let persistence logic redefine runtime state meaning.
- Do not treat cached timeline data as authoritative after resume.
- Do not expand checkpoint scope casually without updating restore and doc assumptions.
- Do not write unredacted trace content to disk.

## Required Doc Follow-Through

- Snapshot schema changed → update `docs/system/ARCHITECTURE.md` and `docs/agent/modules/runtime.md`.
- New temporary resume or undo workaround → update `docs/planning/ClosureLedger.md`.
- New trace visibility metric or diagnostic persisted → update `docs/system/EVALS.md` and `docs/agent/modules/observability.md`.
