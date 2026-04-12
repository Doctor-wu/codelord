# Terminal-Bench 2.0 — Codelord Harbor Adapter

Run [Terminal-Bench 2.0](https://github.com/terminal-bench/terminal-bench) via Harbor with codelord as the agent.

## Prerequisites

- Python 3.12+, `pipx install harbor`
- Node.js 22+, pnpm
- Docker

## Quick Start

```bash
# 1. Build the codelord bundle
./scripts/build-bundle.sh

# 2. Copy .env.example to .env and fill in your API key
cp .env.example .env

# 3. Run (defaults: 4 concurrent, anthropic/claude-sonnet-4-6)
./scripts/run.sh

# Or run directly with harbor:
PYTHONPATH=. harbor run -d terminal-bench@2.0 \
  --agent-import-path codelord_agent:CodelordAgent \
  -m anthropic/claude-sonnet-4-6 \
  --n-tasks 1 \
  --ae CODELORD_API_KEY=$CODELORD_API_KEY
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `CODELORD_API_KEY` | Provider API key | (required) |
| `MODEL` | Harbor model format `provider/model` | `anthropic/claude-sonnet-4-6` |
| `N_CONCURRENT` | Parallel tasks | `4` |
| `LIMIT` | Max tasks to run (empty = all) | (empty) |
| `CODELORD_REASONING_LEVEL` | Reasoning level | `low` |

## Architecture

- `scripts/build-bundle.sh` — Builds codelord monorepo into a standalone tarball
- `codelord_agent.py` — Harbor `BaseInstalledAgent` that installs Node.js + codelord bundle in the container
- `scripts/run.sh` — Convenience wrapper around `harbor run`
