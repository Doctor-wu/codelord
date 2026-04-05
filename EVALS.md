# Codelord Eval And Evidence Rules

## Purpose

This document defines the proof standard for behavior changes.
It is broader than the future `M3` eval harness: it also covers what counts as evidence right now, before the full eval platform exists.

## Current Posture

The repo is still in the `M1X + M2` closure phase.
That means the immediate evidence standard is:

1. current-focus behavior must become more observable and more trustworthy
2. trace must explain operator-visible outcomes
3. temporary mechanisms must move toward explicit closure

Do not pretend the full eval platform already exists.

## Evidence Ladder

Use the strongest level available for the change you are making.

| Level | Evidence | Use when |
| --- | --- | --- |
| 0 | Design argument only | never sufficient for behavior claims |
| 1 | Local trace inspection | checking whether events, ledgers, and visibility facts exist |
| 2 | Fixed regression fixture | preventing repeat regressions in current-focus areas |
| 3 | Dogfooding session evidence | validating operator trust and perceived behavior |
| 4 | Product eval suite | future release gate for stable user-facing behavior |
| 5 | Research eval comparison | future mechanism comparison across prompt/context/model variants |

For current M1X/M2 work, levels 1–3 are the minimum useful bar.

## What Must Be Proven Right Now

### Streaming/operator feedback work

Must show at least one of these improvements in trace or dogfooding:
- reasoning is visible when provider thought exists
- a live proxy exists when provider thought does not
- provisional tool build appears before stable tool lifecycle settles
- large-argument tools no longer have a long invisible gap
- built-in tools without stdout still expose visible phase changes

### Trace explanation work

Must show that trace can answer one of these questions:
- why no thought was visible
- why a tool appeared late
- whether the UI looked frozen because of provider behavior or projection behavior
- what operator action changed the runtime path

### Temporary-state work

Must update `ClosureLedger.md` when:
- a temporary mechanism is introduced
- a temporary mechanism changes shape
- a closure condition becomes clearer
- a temporary mechanism is retired

## Metrics To Prefer During M1X + M2

| Metric | Meaning | Source |
| --- | --- | --- |
| `reasoning_visible_rate` | how often the operator sees either provider thought or an honest proxy | trace + dogfooding |
| `first_tool_visible_latency` | how long before a tool becomes operator-visible | trace diagnostics |
| `visible_tool_latency` | product-facing gap from invisible to visible tool state | trace diagnostics |
| `provisional_to_stable_handoff_correctness` | whether provisional tool objects reconcile cleanly into stable lifecycle objects | trace + UI fixture |
| `queue_trace_completeness` | whether queue creation, injection, consumption, and state transitions are all represented | trace |
| `interrupt_recovery_clarity` | whether interrupt / blocked / resumed states are understandable to the operator | dogfooding + trace |
| `reason_quality_coverage` | share of tool calls with meaningful tool-scoped rationale | trace + manual review |
| `operator_trust_signal` | whether the operator no longer needs to guess what is happening | dogfooding |

## Proof Rules

- Do not claim "fixed" if only raw events improved and operator-visible behavior did not.
- Do not claim "streaming" if visibility begins only after the stable tool lifecycle is already created.
- Do not claim "traceable" if the trace explains model events but not operator actions.
- Do not claim "temporary" without an exit condition.
- Do not claim "better" without naming the previous failure mode.

## Product Eval vs Research Eval

Keep the two lanes separate.

### Product eval

Use for release confidence.
Questions:
- Is the agent more understandable?
- Is the operator experience safer and less confusing?
- Did we regress current focus behavior?

### Research eval

Use for mechanism comparison.
Questions:
- Did a new strategy improve pass rate, latency, cost, or trust signal?
- Is a context/skill/model/routing change worth its complexity?

Do not use research wins as release proof.
Do not use release gates to block all exploration.

## When To Update This Doc

Update `EVALS.md` when:
- the repo starts using a stronger evidence level by default
- a new metric becomes first-class
- the release proof standard changes
- `M3` becomes active enough to add concrete eval command flows and fixture locations
