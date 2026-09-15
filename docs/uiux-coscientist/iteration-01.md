# shinkansen Co-Scientist Iteration 01 — UI/UX kaizen

> Seed: kotoba.cloud emitted documents under public
>
> Judge: `shinkansen.audit` (deterministic, no LLM, no browser) over 102 emitted document(s). Overall **82.9 / 100**.

## Findings (weight × shortfall, heaviest first)

| axis | documents | weight | finding |
|---|---|---|---|
| `fixed-anchor` | 88 | 0.05 | position:fixed without left/right/inset-inline on: .kc-sb — the element floats at its static position (inside the body padding), leaving a dead gutter and pushing the content over twice |
| `nav-one-home` | 75 | 0.1 | the same destination appears more than once in the nav: /account×3, /docs/reference/quickstart/×2 — one fact, one home: a person cannot tell which entry is the page they are on |
| `locale-path-links` | 70 | 0.05 | locale-forked links: /ja/#research-models, /ja/#research-register, /ja/legal/, /ja/legal/tokushoho/ — one locale-free URL per document; the edge negotiates (shinkansen.locale). A forked link is a redirect hop at best and a dead link at worst |
| `skip-link` | 64 | 0.05 | nav precedes <main> but there is no a[href=#main] skip link — keyboard and screen-reader users tab through every nav item on every page |
| `nav-before-content` | 75 | 0.1 | 13 nav links precede <main> in document order — on the phone band that is screens of navigation before the first content; collapse the nav into a disclosure below the lg band, or place it after main |
| `idle-disabled` | 5 | 0.06 | 3 disabled control(s) visible in the idle document — a greyed button tells the person nothing they can act on; hide it until its state is known, or enable it with the reason beside it |
| `note-density` | 10 | 0.05 | 3 paragraphs over 120 characters visible in <main> — the idle screen is for the next action; put the explanation under <details> or a linked guide |
| `repeated-actions` | 6 | 0.06 | the same action repeated: "サービス詳細"×4 — one page-level action; each fact has one home |
| `unique-ids` | 1 | 0.12 | duplicate ids: account-org-create×2, account-refresh×4 — only the first element with each id receives its listener; the others are dead controls |
| `idle-pending` | 1 | 0.12 | 12 pending-state cells visible in the idle document — that is fabricated progress, not readiness: the person sees a wall of 'loading…' and no action; render one status region + the one next action, reveal the console when its state is known |
| `plain-labels` | 1 | 0.1 | 7 label(s) in implementation language: 本人確認（カード認証 / Stripe Identity） | セキュリティ管理 (Guardrails / Firewall / Compliance) | USERNAME | STABLE PRINCIPAL | PROVIDER | FREE TIER — name the person's task; protocol names and field identifiers go under details |

## Roadmap (Elo-ranked)

| # | id | owner | effort | Elo | +pts | change |
|---|---|---|---|---|---|---|
| 1 | `sk-h1` | consumer | S | 1331 | +400 | declare inset-inline-start:0 on the fixed nav and offset the content once (body padding OR main margin, not both) |
| 2 | `sk-h2` | consumer | S | 1306 | +345.5 | one nav entry per destination and one data-current; a second label for the same page is a duplicate fact, not a shortcut |
| 3 | `sk-h3` | consumer | S | 1280 | +318.2 | emit locale-free hrefs (/#…, /billing/) and let the edge negotiate by cookie (shinkansen.locale) |
| 4 | `sk-h4` | consumer | S | 1254 | +290.9 | emit a[href=#main] as the first focusable element of every document that puts a nav before main |
| 5 | `sk-h5` | consumer | M | 1228 | +284.1 | below the lg band collapse the nav into a <details> disclosure (summary = menu) so the first screen is content; keep it as a fixed column on desktop |
| 6 | `sk-h6` | consumer | S | 1201 | +25.5 | hide a control until its state is known, or enable it with the reason beside it — never a bare disabled button in the idle document |
| 7 | `sk-h7` | consumer | S | 1175 | +25 | keep one sentence beside each action; move explanation under <details> or link the guide |
| 8 | `sk-h8` | consumer | S | 1148 | +24.5 | one page-level action for refresh/retry; per-panel repeats are removed |
| 9 | `sk-h9` | consumer | S | 1120 | +10.9 | give each id one element: page-level actions (refresh) render once, per-panel controls get per-panel ids |
| 10 | `sk-h10` | consumer | M | 1093 | +10.9 | render the idle document as one role=status line plus the one next action (sign in); keep the console body hidden until the session is known and reveal it with each cell already mapped to a state |
| 11 | `sk-h11` | consumer | S | 1065 | +9.1 | headings and labels name the person's task (本人確認 / 組織 / チーム); protocol names, provider hosts and field identifiers move under <details> or the guide |

## Batch shipped this iteration

`sk-kaizen-batch` = `sk-h1`, `sk-h2`, `sk-h3`, `sk-h4`, `sk-h6`, `sk-h7`, `sk-h8`, `sk-h9`, `sk-h11` — projected 82.9 → **97.1 / 100**. Deferred: `sk-h5`, `sk-h10`.

## Seed for next iteration

Re-run the audit after the batch lands and record `shinkansen.coscientist/delta` — the roadmap is a prediction, the delta is the proof. Then the deferred rows.
