# shinkansen Co-Scientist Iteration 07 — UI/UX kaizen

> Seed: kotoba.cloud emitted documents under public
>
> Judge: `shinkansen.audit` (deterministic, no LLM, no browser) over 116 emitted document(s). Overall **99.7 / 100**.

## Findings (weight × shortfall, heaviest first)

| axis | documents | weight | finding |
|---|---|---|---|
| `note-density` | 14 | 0.05 | 3 paragraphs over 120 characters visible in <main> — the idle screen is for the next action; put the explanation under <details> or a linked guide |
| `repeated-actions` | 2 | 0.06 | the same action repeated: "サービス詳細"×4 — one page-level action; each fact has one home |
| `idle-disabled` | 1 | 0.06 | 2 disabled control(s) visible in the idle document — a greyed button tells the person nothing they can act on; hide it until its state is known, or enable it with the reason beside it |

## Roadmap (Elo-ranked)

| # | id | owner | effort | Elo | +pts | change |
|---|---|---|---|---|---|---|
| 1 | `sk-h1` | consumer | S | 1231 | +25.9 | keep one sentence beside each action; move explanation under <details> or link the guide |
| 2 | `sk-h2` | consumer | S | 1200 | +4.1 | one page-level action for refresh/retry; per-panel repeats are removed |
| 3 | `sk-h3` | consumer | S | 1169 | +2.8 | hide a control until its state is known, or enable it with the reason beside it — never a bare disabled button in the idle document |

## Batch shipped this iteration

`sk-kaizen-batch` = `sk-h1`, `sk-h2`, `sk-h3` — projected 99.7 → **100 / 100**. Deferred: none.

## Seed for next iteration

Re-run the audit after the batch lands and record `shinkansen.coscientist/delta` — the roadmap is a prediction, the delta is the proof. Then the deferred rows.

## Delta from iteration 06 (the measurement)

overall 99.7 → **99.7** (+0.0)

| axis | before | after |
|---|---|---|
| `viewport` | 1.000 | 1.000 |
| `assets-resolve` | 1.000 | 1.000 |
| `unique-ids` | 1.000 | 1.000 |
| `nav-one-home` | 1.000 | 1.000 |
| `nav-before-content` | 1.000 | 1.000 |
| `skip-link` | 1.000 | 1.000 |
| `idle-pending` | 1.000 | 1.000 |
| `idle-disabled` | 0.994 | 0.994 |
| `repeated-actions` | 0.991 | 0.991 |
| `plain-labels` | 1.000 | 1.000 |
| `note-density` | 0.935 | 0.935 |
| `locale-path-links` | 1.000 | 1.000 |
| `fixed-anchor` | 1.000 | 1.000 |
| `links-resolve` | 1.000 | 1.000 |
| `csp-allows-assets` | 1.000 | 1.000 |
| `pre-overflow` | 1.000 | 1.000 |
| `chrome-layers` |  | 1.000 |

closed: 
opened: none
