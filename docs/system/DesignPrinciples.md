# Codelord Design Principles

## Purpose

This document records the design rules that should survive roadmap rewrites, implementation churn, and UI iteration.

Use this document when the question is "what kind of system are we trying to preserve?".

## Principles

### 1. Production over demo

- Prioritize traceability, recovery, rollback, secret hygiene, and regression control over flashy one-off demos.
- If a change makes the product look better but makes operator trust worse, reject it.

### 2. Agent core stays minimal

- Hardcode only the mechanics the agent cannot function without.
- Put behavior policy, task strategy, and opinionated work style outside the core whenever possible.
- Core should answer "can it run?"; higher layers answer "how should it behave?".

### 3. Stable primitives before clever prompts

- Prefer kernel / contract / router / safety style primitives over free-form prompt tricks.
- Use prompts to express policy, not to fake missing architecture.

### 4. Make implicit semantics first-class

- If the product depends on an idea repeatedly, give it an explicit object or event shape.
- `AssistantReasoningState`, `ToolCallLifecycle`, queue lifecycle, checkpoints, and trace ledgers are examples of this rule.
- Do not leave product-critical semantics buried in raw text deltas or renderer heuristics.

### 5. Runtime truth before presentation truth

- Runtime and snapshot state are authoritative.
- UI, timeline, summaries, and formatted trace output are projections.
- Resume and undo must reconcile from truth, not from what the UI last showed.

### 6. UI is a control surface, not a skin

- The terminal UI is part of the control plane.
- Status visibility, blocked states, queue visibility, and progressive tool feedback are product semantics, not polish.
- A capability the operator cannot perceive or control is not a real product capability.

### 7. Trace first, then explanation

- When behavior is hard to reason about, improve the trace and event model before adding stories around it.
- Product debugging should be able to answer both:
  - what the agent did
  - why the operator saw what they saw

### 8. Eval before claims

- Do not claim an improvement without a hypothesis, observable signal, or regression fixture.
- Product improvements need operator-facing evidence.
- Research improvements need repeatable comparison, not vibes.

### 9. Temporary first is allowed only with explicit closure

- Temporary solutions are valid only if they come with:
  - stated limits
  - target proper solution
  - exit condition
  - required evidence
- If a workaround has no closure path, it is not temporary; it is accidental architecture.

### 10. Layering over cleverness

- Prefer clear package and boundary ownership over cross-cutting magic.
- If a faster implementation punches through multiple layers, write down the tradeoff or redesign it.

### 11. Roadmap is rewritable; architecture is not casual

- Strategy may change with dogfooding and data.
- Stable boundaries should not churn casually.
- Rewriting the roadmap does not mean dissolving the system's semantic structure.

## Design Review Questions

Before landing a meaningful change, answer these questions:

1. Which layer owns this behavior?
2. What is the source of truth?
3. Is this a stable primitive or a temporary workaround?
4. What trace or eval evidence will prove it helped?
5. Which document must change so the next agent does not have to rediscover this logic?
