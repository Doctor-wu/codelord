# Auth Module

## Purpose

The auth module resolves provider credentials for the running product shell.
It is the boundary between config-selected provider/model and the concrete credential material needed to call the provider.

## Owns

- dispatch between static-key providers and OAuth-capable providers
- static API key resolution from config
- OAuth login / refresh flow
- provider-specific credential persistence and refresh handling

## Does Not Own

- config schema and merge order
- runtime/session semantics
- CLI command parsing outside auth entrypoints
- renderer behavior

## Key Files

| Path | Role |
| --- | --- |
| `agents/coding-agent/src/auth/index.ts` | unified auth dispatch |
| `agents/coding-agent/src/auth/api-key.ts` | static-key resolution |
| `agents/coding-agent/src/auth/oauth.ts` | OAuth flow and refresh |

## Invariants

- Auth strategy is selected by provider.
- Config may say which provider to use; auth decides how credentials are resolved.
- OAuth handling must stay outside `packages/config`.
- Auth should return usable credentials, not mutate runtime semantics.

## Common Edit Entry Points

- Change provider dispatch → `auth/index.ts`.
- Change static-key resolution → `auth/api-key.ts`.
- Change OAuth behavior → `auth/oauth.ts`.

## Boundary Rules

- Do not leak provider-specific auth flow into config loading.
- Do not make renderer or CLI code the long-term owner of auth semantics.
- Do not write credential material into trace or agent-facing docs.
