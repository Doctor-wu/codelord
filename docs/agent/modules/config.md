# Config Module

## Purpose

The config module resolves the effective `CodelordConfig` from defaults, TOML, environment variables, and CLI overrides.

It answers:
- what config fields exist
- what the defaults are
- how layered precedence works
- what counts as an invalid final config

## Owns

- `CodelordConfig` shape
- default values
- field-level deep merge behavior
- `~/.codelord/config.toml` parsing
- generic validation rules
- provider-specific environment-variable fallback for API keys

## Does Not Own

- OAuth login or refresh flow
- CLI command parsing
- runtime/session semantics
- renderer behavior
- trace or persistence layout

## Key Files

| Path | Role |
| --- | --- |
| `packages/config/src/schema.ts` | config type, defaults, validation |
| `packages/config/src/load.ts` | layered loading and merge precedence |
| `packages/config/src/toml.ts` | TOML file loading |
| `packages/config/src/index.ts` | package exports |

## Invariants

- Load order is: defaults → TOML → env → CLI flags.
- Merge behavior is field-level, not whole-object replacement.
- Validation happens after all layers merge.
- OAuth-capable providers may validate differently from static-key providers.
- Config loading may resolve provider-specific env keys, but it must not perform login UX.

## Common Edit Entry Points

- Add a new config field → `packages/config/src/schema.ts` then `packages/config/src/load.ts`.
- Change precedence rules → `packages/config/src/load.ts`.
- Change default values → `packages/config/src/schema.ts`.
- Change config-file format behavior → `packages/config/src/toml.ts`.

## Edit Rules

- Do not wire CLI-specific behavior into config loading.
- Do not pull auth or provider session state into `packages/config`.
- If a new field affects runtime behavior, also update `docs/system/ARCHITECTURE.md` or the relevant module doc.
- If a new field changes evidence or budget policy, update `docs/system/EVALS.md`.
