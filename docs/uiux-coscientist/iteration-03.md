# shinkansen Co-Scientist Iteration 03 — UI/UX kaizen

> Seed: kotoba.cloud emitted documents under public
>
> Judge: `shinkansen.audit` (deterministic, no LLM, no browser) over 102 emitted document(s). Overall **92.8 / 100**.

## Findings (weight × shortfall, heaviest first)

| axis | documents | weight | finding |
|---|---|---|---|
| `links-resolve` | 75 | 0.12 | links to nothing published: /docs/ — a person who follows them gets the 404 page; emit the document or point the link at one that exists |
| `locale-path-links` | 7 | 0.05 | locale-forked links: /ja/security/, /ja/security/compliance/ — one locale-free URL per document; the edge negotiates (shinkansen.locale). A forked link is a redirect hop at best and a dead link at worst |
| `note-density` | 12 | 0.05 | 3 paragraphs over 120 characters visible in <main> — the idle screen is for the next action; put the explanation under <details> or a linked guide |
| `repeated-actions` | 5 | 0.06 | the same action repeated: "サービス詳細"×4 — one page-level action; each fact has one home |
| `idle-disabled` | 4 | 0.06 | 2 disabled control(s) visible in the idle document — a greyed button tells the person nothing they can act on; hide it until its state is known, or enable it with the reason beside it |

## Roadmap (Elo-ranked)

| # | id | owner | effort | Elo | +pts | change |
|---|---|---|---|---|---|---|
| 1 | `sk-h1` | consumer | S | 1260 | +656.9 | emit the document the nav links (or point the link at one that exists); generate the nav from the route tree so an unpublished node cannot be linked |
| 2 | `sk-h2` | consumer | S | 1230 | +25.5 | emit locale-free hrefs (/#…, /billing/) and let the edge negotiate by cookie (shinkansen.locale) |
| 3 | `sk-h3` | consumer | S | 1200 | +22.8 | keep one sentence beside each action; move explanation under <details> or link the guide |
| 4 | `sk-h4` | consumer | S | 1170 | +17.5 | one page-level action for refresh/retry; per-panel repeats are removed |
| 5 | `sk-h5` | consumer | S | 1140 | +16.1 | hide a control until its state is known, or enable it with the reason beside it — never a bare disabled button in the idle document |

## Batch shipped this iteration

`sk-kaizen-batch` = `sk-h1`, `sk-h2`, `sk-h3`, `sk-h4`, `sk-h5` — projected 92.8 → **100 / 100**. Deferred: none.

## Seed for next iteration

Re-run the audit after the batch lands and record `shinkansen.coscientist/delta` — the roadmap is a prediction, the delta is the proof. Then the deferred rows.

## Delta from iteration 02 (the measurement)

overall 99.0 → **92.8** (-6.3)

| axis | before | after |
|---|---|---|
| `viewport` | 1.000 | 1.000 |
| `assets-resolve` | 1.000 | 1.000 |
| `unique-ids` | 1.000 | 1.000 |
| `nav-one-home` | 1.000 | 1.000 |
| `nav-before-content` | 1.000 | 1.000 |
| `skip-link` | 1.000 | 1.000 |
| `idle-pending` | 1.000 | 1.000 |
| `idle-disabled` | 0.964 | 0.964 |
| `repeated-actions` | 0.961 | 0.961 |
| `plain-labels` | 1.000 | 1.000 |
| `note-density` | 0.949 | 0.939 |
| `locale-path-links` | 0.931 | 0.931 |
| `fixed-anchor` | 1.000 | 1.000 |
| `links-resolve` |  | 0.265 |
| `csp-allows-assets` |  | 1.000 |
| `pre-overflow` |  | 1.000 |

closed: 
opened: links-resolve
