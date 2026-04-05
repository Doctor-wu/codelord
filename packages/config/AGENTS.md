# Config Package Rules

Scope: `packages/config/**`

## Read First

- Root `AGENTS.md`
- `docs/system/ARCHITECTURE.md`
- `docs/agent/modules/config.md`

## What This Package Owns

- config schema
- defaults
- layered loading
- validation
- TOML parsing

## What This Package Must Not Own

- OAuth flow
- CLI UX
- runtime state
- renderer behavior

## Local Rules

- Keep precedence explicit: defaults → TOML → env → CLI.
- Keep merge behavior field-level unless there is an explicit design change.
- Do not let config loading become the owner of provider login flow.
- If a field changes evidence or budget policy, update `docs/system/EVALS.md`.
