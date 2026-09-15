# shinkansen Co-Scientist Iteration 02 — UI/UX kaizen

> Seed: kotoba.cloud emitted documents under public
>
> Judge: `shinkansen.audit` (deterministic, no LLM, no browser) over 102 emitted document(s). Overall **99 / 100**.

## Findings (weight × shortfall, heaviest first)

| axis | documents | weight | finding |
|---|---|---|---|
| `locale-path-links` | 7 | 0.05 | locale-forked links: /ja/security/, /ja/security/compliance/ — one locale-free URL per document; the edge negotiates (shinkansen.locale). A forked link is a redirect hop at best and a dead link at worst |
| `note-density` | 9 | 0.05 | 3 paragraphs over 120 characters visible in <main> — the idle screen is for the next action; put the explanation under <details> or a linked guide |
| `repeated-actions` | 5 | 0.06 | the same action repeated: "サービス詳細"×4 — one page-level action; each fact has one home |
| `idle-disabled` | 4 | 0.06 | 2 disabled control(s) visible in the idle document — a greyed button tells the person nothing they can act on; hide it until its state is known, or enable it with the reason beside it |

## Roadmap (Elo-ranked)

| # | id | owner | effort | Elo | +pts | change |
|---|---|---|---|---|---|---|
| 1 | `sk-h1` | consumer | S | 1246 | +31.8 | emit locale-free hrefs (/#…, /billing/) and let the edge negotiate by cookie (shinkansen.locale) |
| 2 | `sk-h2` | consumer | S | 1215 | +23.9 | keep one sentence beside each action; move explanation under <details> or link the guide |
| 3 | `sk-h3` | consumer | S | 1185 | +21.8 | one page-level action for refresh/retry; per-panel repeats are removed |
| 4 | `sk-h4` | consumer | S | 1154 | +20.1 | hide a control until its state is known, or enable it with the reason beside it — never a bare disabled button in the idle document |

## Batch shipped this iteration

`sk-kaizen-batch` = `sk-h1`, `sk-h2`, `sk-h3`, `sk-h4` — projected 99 → **100 / 100**. Deferred: none.

## Seed for next iteration

Re-run the audit after the batch lands and record `shinkansen.coscientist/delta` — the roadmap is a prediction, the delta is the proof. Then the deferred rows.

## Delta from iteration 01 (the measurement)

overall 82.9 → **99.0** (+16.1)

| axis | before | after |
|---|---|---|
| `viewport` | 1.000 | 1.000 |
| `assets-resolve` | 1.000 | 1.000 |
| `unique-ids` | 0.990 | 1.000 |
| `nav-one-home` | 0.627 | 1.000 |
| `nav-before-content` | 0.694 | 1.000 |
| `skip-link` | 0.373 | 1.000 |
| `idle-pending` | 0.990 | 1.000 |
| `idle-disabled` | 0.954 | 0.964 |
| `repeated-actions` | 0.956 | 0.961 |
| `plain-labels` | 0.990 | 1.000 |
| `note-density` | 0.946 | 0.949 |
| `locale-path-links` | 0.314 | 0.931 |
| `fixed-anchor` | 0.137 | 1.000 |

closed: fixed-anchor, idle-pending, nav-before-content, nav-one-home, plain-labels, skip-link, unique-ids
opened: none
