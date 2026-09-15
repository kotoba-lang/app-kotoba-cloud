# shinkansen Co-Scientist Iteration 05 — UI/UX kaizen

> Seed: kotoba.cloud emitted documents under public
>
> Judge: `shinkansen.audit` (deterministic, no LLM, no browser) over 111 emitted document(s). Overall **99.8 / 100**.

## Findings (weight × shortfall, heaviest first)

| axis | documents | weight | finding |
|---|---|---|---|
| `note-density` | 10 | 0.05 | 3 paragraphs over 120 characters visible in <main> — the idle screen is for the next action; put the explanation under <details> or a linked guide |
| `repeated-actions` | 2 | 0.06 | the same action repeated: "サービス詳細"×4 — one page-level action; each fact has one home |
| `locale-path-links` | 1 | 0.05 | locale-forked links: /ja/#knowledge/overview — one locale-free URL per document; the edge negotiates (shinkansen.locale). A forked link is a redirect hop at best and a dead link at worst |
| `idle-disabled` | 1 | 0.06 | 2 disabled control(s) visible in the idle document — a greyed button tells the person nothing they can act on; hide it until its state is known, or enable it with the reason beside it |

## Roadmap (Elo-ranked)

| # | id | owner | effort | Elo | +pts | change |
|---|---|---|---|---|---|---|
| 1 | `sk-h1` | consumer | S | 1246 | +15.5 | keep one sentence beside each action; move explanation under <details> or link the guide |
| 2 | `sk-h2` | consumer | S | 1215 | +4.4 | one page-level action for refresh/retry; per-panel repeats are removed |
| 3 | `sk-h3` | consumer | S | 1185 | +3.6 | emit locale-free hrefs (/#…, /billing/) and let the edge negotiate by cookie (shinkansen.locale) |
| 4 | `sk-h4` | consumer | S | 1154 | +3 | hide a control until its state is known, or enable it with the reason beside it — never a bare disabled button in the idle document |

## Batch shipped this iteration

`sk-kaizen-batch` = `sk-h1`, `sk-h2`, `sk-h3`, `sk-h4` — projected 99.8 → **100 / 100**. Deferred: none.

## Seed for next iteration

Re-run the audit after the batch lands and record `shinkansen.coscientist/delta` — the roadmap is a prediction, the delta is the proof. Then the deferred rows.

## Delta from iteration 04 (the measurement)

overall 99.2 → **99.8** (+0.5)

| axis | before | after |
|---|---|---|
| `viewport` | 1.000 | 1.000 |
| `assets-resolve` | 1.000 | 1.000 |
| `unique-ids` | 1.000 | 1.000 |
| `nav-one-home` | 1.000 | 1.000 |
| `nav-before-content` | 1.000 | 1.000 |
| `skip-link` | 1.000 | 1.000 |
| `idle-pending` | 1.000 | 1.000 |
| `idle-disabled` | 0.965 | 0.994 |
| `repeated-actions` | 0.962 | 0.991 |
| `plain-labels` | 1.000 | 1.000 |
| `note-density` | 0.940 | 0.962 |
| `locale-path-links` | 0.933 | 0.991 |
| `fixed-anchor` | 1.000 | 1.000 |
| `links-resolve` | 1.000 | 1.000 |
| `csp-allows-assets` | 1.000 | 1.000 |
| `pre-overflow` | 1.000 | 1.000 |

closed: 
opened: none

## Console IA coverage (this round's second measurement — `console-coverage.edn`)

Reference: the owner-supplied reference console (15 screens). Coverage is
counted per destination as document / live data / action; a destination
without a backend surface is recorded as a gap with its owner, never as a
placeholder view.

| destination | before | after |
|---|---|---|
| shell: top bar, credit chip, setup progress, resume banner, account chip, nav badges | none | all present, hydrated from the session, hidden until known |
| Guardrails / Firewall / Compliance | 5 cells on /account | `/secure/` — three views, tables from the enforced policy, live version check + observe mode |
| Models | a section on the home page | `/models/` — admitted models, limits, conditions, live availability |
| Billing | marketing shell, 10 greyed buttons, balance only after scripting | `/billing/` console — balance tiles, monthly / one-time plans, catalog-gated buttons (audit 84.5 → 100) |
| Members, Apps, API tokens (create), Settings (profile) | present | unchanged |
| Dashboard, Requests, Logs, Insights | gap: no usage / jobs-list endpoint | gap (backend) |
| BYOK, Routing, Prompts | gap: no such surface | gap (backend) |
| API token list/revoke, transaction history, sign-in & security rows | gap (backend / auth.kotoba.cloud) | gap (backend) |

Site-wide audit: 99.2 → 99.8 over 111 documents (all four hard axes clean);
`/secure/`, `/models/`, `/billing/` at 100. The first-request setup step is
deliberately absent: its state cannot be read without a jobs-list endpoint.
