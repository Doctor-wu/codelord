# Codelord Eval Scores

> 由 CI 自动更新。手动更新请运行 `pnpm update-scores`。

## 总览

| Benchmark | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Polyglot | claude-sonnet-4-6 | pass_rate_1 | 100.0% | 20 | subset | 2026-04-12 | M3-S1 manual |
| Polyglot (Rust) | claude-sonnet-4-6 | pass_rate_1 | 93.3% | 30 | subset | 2026-04-12 | M3-S1 manual |
| SWE-bench | claude-sonnet-4-6 | patch_rate | 20.0% | 5 | subset | 2026-04-12 | M3-S1 manual |
| BrowseComp | claude-sonnet-4-6 | accuracy | 16.7% | 6 | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377246964) |
| Terminal-Bench | claude-sonnet-4-6 | resolution_rate | 33.3% | 3 | subset | 2026-04-12 | M3-S1 manual |

## Polyglot

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Polyglot | claude-sonnet-4-6 | pass_rate_1 | 100.0% | 20 | subset | 2026-04-12 | M3-S1 manual |
| Polyglot (Rust) | claude-sonnet-4-6 | pass_rate_1 | 93.3% | 30 | subset | 2026-04-12 | M3-S1 manual |

### History

| Date | Label | Model | pass_rate_1 | pass_rate_2 | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-04-12 | Polyglot | claude-sonnet-4-6 | 100.0% | - | 20 | subset | M3-S1 manual |
| 2026-04-12 | Polyglot (Rust) | claude-sonnet-4-6 | 93.3% | 96.7% | 30 | subset | M3-S1 manual |

## SWE-bench

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SWE-bench | claude-sonnet-4-6 | patch_rate | 20.0% | 5 | subset | 2026-04-12 | M3-S1 manual |

### History

| Date | Model | patch_rate | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- |
| 2026-04-12 | claude-sonnet-4-6 | 20.0% | 5 | subset | M3-S1 manual |

## BrowseComp

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BrowseComp | claude-sonnet-4-6 | accuracy | 16.7% | 6 | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377246964) |

### History

| Date | Model | accuracy | avg_confidence | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-04-14 | claude-sonnet-4-6 | 16.7% | 30.0% | 6 | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377246964) |
| 2026-04-12 | claude-sonnet-4-6 | 40.0% | - | 5 | subset | M3-S1 manual |

## Terminal-Bench

### Latest

| Label | Model | Primary Metric | Value | Cases | Mode | Date | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Terminal-Bench | claude-sonnet-4-6 | resolution_rate | 33.3% | 3 | subset | 2026-04-12 | M3-S1 manual |

### History

| Date | Model | resolution_rate | Cases | Mode | Source |
| --- | --- | --- | --- | --- | --- |
| 2026-04-12 | claude-sonnet-4-6 | 33.3% | 3 | subset | M3-S1 manual |

---

*Last updated: 2026-04-14*

<!-- SCORES_STATE_V1
{
  "version": 1,
  "lastUpdated": "2026-04-14",
  "history": {
    "polyglot": [
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
        "timestamp": "2026-04-14T02:48:03.106Z",
        "date": "2026-04-14",
        "model": "claude-sonnet-4-6",
        "mode": "subset",
        "cases": 6,
        "primaryMetricKey": "accuracy",
        "metrics": {
          "accuracy": 0.16666666666666666,
          "total": 6,
          "correct_count": 1,
          "incorrect_count": 5,
          "error_count": 0,
          "avg_confidence": 30,
          "avg_duration_ms": 344003.3333333333
        },
        "sourceLabel": "CI run",
        "runUrl": "https://github.com/Doctor-wu/codelord/actions/runs/24377246964"
      },
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
