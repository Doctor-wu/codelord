# Codelord Eval Scores

> 由 CI 自动更新。手动更新请运行 `pnpm update-scores`。

## 总览

| Benchmark | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Polyglot | claude-sonnet-4-6 | pass_rate_1 | 2.2% | 225 | full | 2026-04-15 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24442793080) |
| Polyglot (Rust) | claude-sonnet-4-6 | pass_rate_1 | 93.3% | 30 | subset | 2026-04-12 | M3-S1 manual |
| SWE-bench | claude-sonnet-4-6 | patch_rate | 84.0% | 25 | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377293858) |
| BrowseComp | claude-sonnet-4-6 | accuracy | 40.0% | 5 | subset | 2026-04-12 | M3-S1 manual |
| Terminal-Bench | claude-sonnet-4-6 | resolution_rate | 0.0% | 8 | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24385862648) |

## Polyglot

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Polyglot | claude-sonnet-4-6 | pass_rate_1 | 2.2% | 225 | full | 2026-04-15 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24442793080) |
| Polyglot (Rust) | claude-sonnet-4-6 | pass_rate_1 | 93.3% | 30 | subset | 2026-04-12 | M3-S1 manual |

### History

| Date | Label | Model | pass_rate_1 | pass_rate_2 | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-04-15 | Polyglot | claude-sonnet-4-6 | 2.2% | 2.2% | 225 | full | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24442793080) |
| 2026-04-14 | Polyglot | claude-sonnet-4-6 | 88.3% | 96.7% | 60 | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377267309) |
| 2026-04-12 | Polyglot | claude-sonnet-4-6 | 100.0% | - | 20 | subset | M3-S1 manual |
| 2026-04-12 | Polyglot (Rust) | claude-sonnet-4-6 | 93.3% | 96.7% | 30 | subset | M3-S1 manual |

## SWE-bench

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SWE-bench | claude-sonnet-4-6 | patch_rate | 84.0% | 25 | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377293858) |

### History

| Date | Model | patch_rate | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- |
| 2026-04-14 | claude-sonnet-4-6 | 84.0% | 25 | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377293858) |
| 2026-04-12 | claude-sonnet-4-6 | 20.0% | 5 | subset | M3-S1 manual |

## BrowseComp

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BrowseComp | claude-sonnet-4-6 | accuracy | 40.0% | 5 | subset | 2026-04-12 | M3-S1 manual |

### History

| Date | Model | accuracy | avg_confidence | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-04-12 | claude-sonnet-4-6 | 40.0% | - | 5 | subset | M3-S1 manual |

## Terminal-Bench

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Terminal-Bench | claude-sonnet-4-6 | resolution_rate | 0.0% | 8 | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24385862648) |

### History

| Date | Model | resolution_rate | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- |
| 2026-04-14 | claude-sonnet-4-6 | 0.0% | 8 | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24385862648) |
| 2026-04-12 | claude-sonnet-4-6 | 33.3% | 3 | subset | M3-S1 manual |

---

*Last updated: 2026-04-15*

<!-- SCORES_STATE_V1
{
  "version": 1,
  "lastUpdated": "2026-04-15",
  "history": {
    "polyglot": [
      {
        "label": "Polyglot",
        "timestamp": "2026-04-15T08:45:59.775Z",
        "date": "2026-04-15",
        "model": "claude-sonnet-4-6",
        "mode": "full",
        "cases": 225,
        "primaryMetricKey": "pass_rate_1",
        "metrics": {
          "pass_rate_1": 0.022222222222222223,
          "pass_rate_2": 0.022222222222222223,
          "total": 225,
          "pass_attempt_1": 5,
          "pass_attempt_2": 5
        },
        "sourceLabel": "CI run",
        "runUrl": "https://github.com/Doctor-wu/codelord/actions/runs/24442793080"
      },
      {
        "label": "Polyglot",
        "timestamp": "2026-04-14T03:09:52.054Z",
        "date": "2026-04-14",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 60,
        "primaryMetricKey": "pass_rate_1",
        "metrics": {
          "pass_rate_1": 0.8833333333333333,
          "pass_rate_2": 0.9666666666666667,
          "total": 60,
          "pass_attempt_1": 53,
          "pass_attempt_2": 58
        },
        "sourceLabel": "CI run",
        "runUrl": "https://github.com/Doctor-wu/codelord/actions/runs/24377267309"
      },
      {
        "label": "Polyglot",
        "timestamp": "2026-04-12T00:00:00Z",
        "date": "2026-04-12",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 20,
        "primaryMetricKey": "pass_rate_1",
        "metrics": {
          "pass_rate_1": 1
        },
        "sourceLabel": "M3-S1 manual"
      },
      {
        "label": "Polyglot (Rust)",
        "timestamp": "2026-04-12T00:00:00Z",
        "date": "2026-04-12",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 30,
        "primaryMetricKey": "pass_rate_1",
        "metrics": {
          "pass_rate_1": 0.933,
          "pass_rate_2": 0.967
        },
        "sourceLabel": "M3-S1 manual"
      }
    ],
    "swe-bench": [
      {
        "label": "SWE-bench",
        "timestamp": "2026-04-14T03:11:00.690Z",
        "date": "2026-04-14",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 25,
        "primaryMetricKey": "patch_rate",
        "metrics": {
          "patch_rate": 0.84,
          "total": 25,
          "patched_count": 21,
          "error_count": 0,
          "avg_duration_ms": 134193.76
        },
        "sourceLabel": "CI run",
        "runUrl": "https://github.com/Doctor-wu/codelord/actions/runs/24377293858"
      },
      {
        "label": "SWE-bench",
        "timestamp": "2026-04-12T00:00:00Z",
        "date": "2026-04-12",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 5,
        "primaryMetricKey": "patch_rate",
        "metrics": {
          "patch_rate": 0.2
        },
        "sourceLabel": "M3-S1 manual"
      }
    ],
    "browsecomp": [
      {
        "label": "BrowseComp",
        "timestamp": "2026-04-12T00:00:00Z",
        "date": "2026-04-12",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 5,
        "primaryMetricKey": "accuracy",
        "metrics": {
          "accuracy": 0.4
        },
        "sourceLabel": "M3-S1 manual"
      }
    ],
    "terminal-bench": [
      {
        "label": "Terminal-Bench",
        "timestamp": "2026-04-14T07:12:21.561Z",
        "date": "2026-04-14",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 8,
        "primaryMetricKey": "resolution_rate",
        "metrics": {
          "resolution_rate": 0,
          "total": 8,
          "passed_count": 0,
          "error_count": 8,
          "setup_timeout_count": 0,
          "cancelled_count": 0
        },
        "sourceLabel": "CI run",
        "runUrl": "https://github.com/Doctor-wu/codelord/actions/runs/24385862648"
      },
      {
        "label": "Terminal-Bench",
        "timestamp": "2026-04-12T00:00:00Z",
        "date": "2026-04-12",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 3,
        "primaryMetricKey": "resolution_rate",
        "metrics": {
          "resolution_rate": 0.3333333333333333
        },
        "sourceLabel": "M3-S1 manual"
      }
    ]
  }
}
-->
