# Codelord Eval Scores

> 由 CI 自动更新。手动更新请运行 `pnpm update-scores`。

## 总览

| Benchmark       | Model             | Primary Metric  | Value | Cases | Mode   | Date       | Source                                                                   |
| --------------- | ----------------- | --------------- | ----- | ----- | ------ | ---------- | ------------------------------------------------------------------------ |
| Polyglot        | claude-sonnet-4-6 | pass_rate_1     | 88.3% | 60    | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377267309) |
| Polyglot (Rust) | claude-sonnet-4-6 | pass_rate_1     | 93.3% | 30    | subset | 2026-04-12 | M3-S1 manual                                                             |
| SWE-bench       | claude-sonnet-4-6 | patch_rate      | 84.0% | 25    | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377293858) |
| BrowseComp      | claude-sonnet-4-6 | accuracy        | 40.0% | 5     | subset | 2026-04-12 | M3-S1 manual                                                             |
| Terminal-Bench  | claude-sonnet-4-6 | resolution_rate | 0.0%  | 8     | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24385862648) |

## Polyglot

### Latest

| Label           | Model             | Primary Metric | Value | Cases | Mode   | Date       | Source                                                                   |
| --------------- | ----------------- | -------------- | ----- | ----- | ------ | ---------- | ------------------------------------------------------------------------ |
| Polyglot        | claude-sonnet-4-6 | pass_rate_1    | 88.3% | 60    | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377267309) |
| Polyglot (Rust) | claude-sonnet-4-6 | pass_rate_1    | 93.3% | 30    | subset | 2026-04-12 | M3-S1 manual                                                             |

### History

| Date       | Label           | Model             | pass_rate_1 | pass_rate_2 | Cases | Mode   | Source                                                                   |
| ---------- | --------------- | ----------------- | ----------- | ----------- | ----- | ------ | ------------------------------------------------------------------------ |
| 2026-04-14 | Polyglot        | claude-sonnet-4-6 | 88.3%       | 96.7%       | 60    | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377267309) |
| 2026-04-12 | Polyglot        | claude-sonnet-4-6 | 100.0%      | -           | 20    | subset | M3-S1 manual                                                             |
| 2026-04-12 | Polyglot (Rust) | claude-sonnet-4-6 | 93.3%       | 96.7%       | 30    | subset | M3-S1 manual                                                             |

## SWE-bench

### Latest

| Label     | Model             | Primary Metric | Value | Cases | Mode   | Date       | Source                                                                   |
| --------- | ----------------- | -------------- | ----- | ----- | ------ | ---------- | ------------------------------------------------------------------------ |
| SWE-bench | claude-sonnet-4-6 | patch_rate     | 84.0% | 25    | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377293858) |

### History

| Date       | Model             | patch_rate | Cases | Mode   | Source                                                                   |
| ---------- | ----------------- | ---------- | ----- | ------ | ------------------------------------------------------------------------ |
| 2026-04-14 | claude-sonnet-4-6 | 84.0%      | 25    | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24377293858) |
| 2026-04-12 | claude-sonnet-4-6 | 20.0%      | 5     | subset | M3-S1 manual                                                             |

## BrowseComp

### Latest

| Label      | Model             | Primary Metric | Value | Cases | Mode   | Date       | Source       |
| ---------- | ----------------- | -------------- | ----- | ----- | ------ | ---------- | ------------ |
| BrowseComp | claude-sonnet-4-6 | accuracy       | 40.0% | 5     | subset | 2026-04-12 | M3-S1 manual |

### History

| Date       | Model             | accuracy | avg_confidence | Cases | Mode   | Source       |
| ---------- | ----------------- | -------- | -------------- | ----- | ------ | ------------ |
| 2026-04-12 | claude-sonnet-4-6 | 40.0%    | -              | 5     | subset | M3-S1 manual |

## Terminal-Bench

### Latest

| Label          | Model             | Primary Metric  | Value | Cases | Mode   | Date       | Source                                                                   |
| -------------- | ----------------- | --------------- | ----- | ----- | ------ | ---------- | ------------------------------------------------------------------------ |
| Terminal-Bench | claude-sonnet-4-6 | resolution_rate | 0.0%  | 8     | subset | 2026-04-14 | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24385862648) |

### History

| Date       | Model             | resolution_rate | Cases | Mode   | Source                                                                   |
| ---------- | ----------------- | --------------- | ----- | ------ | ------------------------------------------------------------------------ |
| 2026-04-14 | claude-sonnet-4-6 | 0.0%            | 8     | subset | [CI run](https://github.com/Doctor-wu/codelord/actions/runs/24385862648) |
| 2026-04-12 | claude-sonnet-4-6 | 33.3%           | 3     | subset | M3-S1 manual                                                             |

---

_Last updated: 2026-04-14_
