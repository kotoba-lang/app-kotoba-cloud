# Model-to-Humanity Risk Index (MHRI) v0.1 — Design & Research Report

**kotoba.cloud research · 2026-09-14 · draft v0.1**

## 1. Executive Summary

Artificial Analysis の Intelligence Index は、言語モデルの知能を 4 カテゴリ (Agents 30% / Coding 20% / Scientific Reasoning 20% / General 30%) の重み付き平均として標準化・透明に公開する[1]。これは「モデルがどこまでできるか」の縦軸を最良の形で与えるが、「人類にとって危険か」の縦軸は直接測らない。本レポートは、この能力軸の上に**人類へのリスク・影響を評価する Model-to-Humanity Risk Index (MHRI)** を設計するものである。

設計原則は Artificial Analysis の 4 原則 (Standardized / Unbiased / Zero-Shot / Transparent) を踏襲する[1]。

既存のリスク評価をモデル単位の指標に再構成する。

第一に、METR の時間地平 (タスク完遂長) と rogue deployment 評価[4]。

さらに METR は同じく手段・動機・機会 (means/motive/opportunity) の枠組みを提供する[5]。

第二に、FLI AI Safety Index の企業グレーディング (37 indicators × 6 domains)[7]。

第三に、jailbreak robustness の 1–5 スコアリング[9]。

これらをモデル単位に合成するのが本レポートの目的である。

**MHRI = Capable (能力) × Exposed (曝露) × Governed (統制欠如) の合成スコア 0–100**。
危険性は「能力」単独ではなく「能力 × 世界への接続 × 統制の弱さ」の積として定式化する。

## 2. 既存指標のスキャンとギャップ

| 指標 | 測定対象 | 単位 | 人類リスクへの寄与 | ギャップ |
|---|---|---|---|---|
| AA Intelligence Index [1] | 知能 (agents/coding/science/general) | モデル | 危険性の「能力」項 | リスク非測定 |
| AA Openness Index [2] | 重み・データ・手法の開示度 | モデル | 統制可能性・拡散リスクの代理 | リスク直接非測定 |
| AA Cost per Task [3] | タスクあたりコスト | モデル×provider | 攻撃コスト (低コスト=低参入障壁) | 悪用コスト非測定 |
| METR Time Horizon [4] | 完遂可能なタスク長 (指数的伸長, ~7ヶ月で倍増) | モデル | 自律実行能力の代理指標 | 意図・統制を含まない |
| METR Frontier Risk Report [5] | means/motive/opportunity (rogue deployment) | エンティティ | 「自律暴走」評価の枠組み | 非公開情報依存, 企業単位 |
| FLI AI Safety Index [7] | 37 indicators × 6 domains の企業グレード | 企業 | リスク評価・安全保障・ existential safety の評価項 | モデル単位でない |
| Open LLM Safety Index [9] | jailbreak robustness 1–5 | モデル (open weights) | ガードレール強度 | 1 次元のみ |

ギャップ: **モデル単位で、能力と統制と曝露を 1 つの合成値に落とした公開 index は存在しない。** MHRI はこの隙間を埋める。CAIS が指摘する通り、AI は社会に利益をもたらすと同時に「potentially catastrophic」な固有のリスクを担う[8] — 能力指標だけではこの裏面が見えない。

## 3. MHRI の構造

### 3.1 定式化

```
MHRI(m) = 100 × [ 0.4·R_cap(m) + 0.3·R_exp(m) + 0.3·R_gov(m) ]
```

- **R_cap — Capability Risk (能力リスク, 0–1)**: モデルが「何をできるか」
- **R_exp — Exposure Risk (曝露リスク, 0–1)**: モデルが「世界にどう繋がるか」
- **R_gov — Governance Gap (統制欠如, 0–1)**: 「どれだけ統制が弱いか」(スコアは低いほど良い)

### 3.2 R_cap: Capability Risk (能力)

Artificial Analysis Intelligence Index のカテゴリ構成[1]と METR の時間地平[4]を流用する。

| サブ項目 | ソース | 重み (R_cap 内) | 根拠 |
|---|---|---|---|
| Agentic capability | AA Intelligence Index Agents 30% (AA-Briefcase, GDPval-AA v2, AutomationBench-AA) [1] | 0.35 | agent は実世界アクション経路 |
| Long-horizon autonomy | METR Time Horizon (50% success) を log スケールで正規化 [4] | 0.25 | 自律完遂能力の趨勢的代理[4] |
| Cyber/coding | AA Coding 20% (Terminal-Bench, SciCode) [1] | 0.15 | サイバー攻撃・自動化の足場 |
| Scientific uplift | AA Scientific Reasoning 20% (HLE, CritPt) [1] | 0.15 | 生物・化学・材料の uplfit |
| Deception/persuasion proxy | AA General (AA-Omniscience: accuracy − hallucination) [1] + 対話型 red-team | 0.10 | 誤情報・説得の基礎能力 |

正規化: 各値を現行 frontier の最大値で 0–1 線形スケール (AA と同様、standardized 条件・温度規定を踏襲[1])。

### 3.3 R_exp: Exposure Risk (曝露)

| サブ項目 | 重み | 測定 |
|---|---|---|
| Availability | 0.25 | API 公開 / open weights / distill 制約。AA Openness Index の weights access 0–3 を反転利用[2] |
| Cost floor | 0.15 | Cost per Task の逆数 (安いほど悪用しやすい) [3] |
| Deployed agents | 0.30 | 実運用のエージェント数・権限 (web, shell, 決済) — 公開 API ドキュメント・system card から監査 |
| Multimodal reach | 0.15 | 画像・音声・動画入出力 (拡散・なりすまし経路) |
| Language coverage | 0.15 | 多言語性能 (AA Multilingual Index の 17 言語を参照) |

### 3.4 R_gov: Governance Gap (統制欠如)

FLI の 6 domains[7]のうちモデル単位に落とせるものを採用する。

| サブ項目 | 重み | 測定 |
|---|---|---|
| Safety evaluations published | 0.30 | system card / 第三者評価 (METR 型[6]) の有無・深度 |
| Refusal robustness | 0.25 | jailbreak robustness (Open LLM Safety Index 方式の 1–5 を 0–1 化[9]) |
| Guardrail violation zero-credit | 0.15 | AutomationBench-AA の「guardrail violation でゼロ点」をリスク側に転用[1] |
| Misalignment evidence | 0.15 | means/motive/opportunity の公開評価[5] |
| Whistleblower / info sharing | 0.15 | FLI Information Sharing indicators をモデルレベルに圧縮[7] |

### 3.5 解釈バンド

| MHRI | バンド | 解釈 |
|---|---|---|
| 0–24 | Low | 通常運用で人類規模影響なし |
| 25–49 | Elevated | 悪用・事故の影響が組織規模を超えうる |
| 50–74 | High | フロンティア監視対象。第三者評価必須 |
| 75–100 | Critical | 産業・政府レベルの緩和策要求 |

## 4. 測定プロトコル

1. **Standardized**: 全モデル同一条件 (温度 0 / reasoning 0.6、max tokens 規定は AA を踏襲[1])。
2. **Zero-shot**: 例示なしの指示プロンプト[1]。
3. **Evidence-gated**: 各スコアには system card・公開ベンチ・第三者評価の出典 URL を要求。出典のない主観項は 0 ではなく「unknown」とし、MHRI を計算せず unknown として公開する (FLI の survey-based ギャップ設計[7]を踏襲)。
4. **第三者性**: 能力項は公開ベンチ引用でよいが、R_gov は少なくとも 1 つの外部評価 (METR 型 red-team[6]等) を要求する。
5. **反復性**: 四半期ごとに再計算し、トレンド (FLI の grade trend[7]や METR の時系列[4]のような) を公開。
6. **独立性**: kotoba.cloud はモデル提供者ではないため、conflict of interest を毎版開示する。

## 5. 限界 (Limitations)

- **r ≠ 能力**: R_cap は「危険性の能力項」の代理でしかない。知能が高い ≠ 危険 (逆も然り)。AA 自身が「all evaluation metrics … may not apply directly to every use case」と明記している[1]。
- **エンティティ効果の丸め込み**: METR Frontier Risk Report が示す rogue deployment リスク[5]は開発者企業の運用に依存し、モデル単位への分解は原理的に不完全。
- **公開情報バイアス**: R_gov は開示に依存する。開示が少ないほど R_gov が上がる (罰則) が、これは FLI が認める「非開示 ≒ 弱い統制」の近似[7]であり、偽陽性を生みうる。
- **重みの恣意性**: 0.4/0.3/0.3 とサブ重みは v0.1 の判断である。感度分析 (重み±10% で順位が変わらないか) を毎版公開する。
- **英語中心**: AA も「primarily text-based, English-language evaluation suite」であることを明示[1]。多言語リスク (日本語・中国語圏の悪用) は別途 Multilingual Index[1]を参照して補う。

## 6. ロードマップ

- **v0.1 (本レポート)**: 設計と理論的根拠。採点対象モデルの実測は含まない。
- **v0.2**: 10 モデル (frontier 4 + open weights 4 + 中間 2) の pilot 採点。R_cap は AA 公開値から、R_gov は system card から構成。
- **v0.3**: jailbreak red-team を自前実施し R_gov/refusal を一次データ化。
- **v1.0**: 四半期更新・感度分析・history (grade trend) 公開。

## 7. References

## Sources

[1] https://artificialanalysis.ai/methodology/intelligence-benchmarking — Artificial Analysis Intelligence Benchmarking Methodology
    > "Intelligence Index is calculated as a weighted average across four categories: Agents (30%), Coding (20%), Scientific Reasoning (20%) and General (30%)."
    > "Our methodology emphasizes fairness and real-world applicability. We estimate a 95% confidence interval for Artificial Analysis Intelligence Index of less than ±1%"
    > "AutomationBench-AA 657 tasks 1 SaaS workflow automation with REST API tools Objective completion, with zero credit for tasks that trigger a guardrail violation"
    > "Standardized: All models are evaluated under identical conditions with consistent prompting strategies, temperature settings, and evaluation criteria."
    > "AA-Omniscience 6,000 1 Open Answer Accuracy (10%) and 1 - Hallucination Rate (5%) as separate components"
    > "General (30%) AA-Omniscience 6,000 1 Open Answer Accuracy (10%) and 1 - Hallucination Rate (5%) as separate components 15%"
    > "Zero-Shot Instruction Prompted: We evaluate using clear instructions without examples or demonstrations, testing models' ability to follow directions without few-shot learning."
[2] https://artificialanalysis.ai/methodology/openness-index — Artificial Analysis Openness Index Methodology
    > "The Artificial Analysis Openness Index is a composite metric that measures the degree to which AI models are openly available and transparently documented."
    > "Each component is scored on a 0–3 qualitative scale based on the best-fitting openness archetype, with each model assessed based on the full set of public first-party information available."
[3] https://artificialanalysis.ai/methodology — Artificial Analysis Benchmarking Methodology
    > "Cost per Task: The weighted-average cost (USD) to complete one Artificial Analysis Intelligence Index task."
    > "To enable easier comparison, we calculate a blended price assuming a 7:2:1 ratio of cache hit, input, and output tokens."
[4] https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks — METR: Measuring AI Ability to Complete Long Software Tasks
    > "We propose measuring AI performance in terms of the length of tasks AI agents can complete. We show that this metric has been consistently exponentially increasing over the past 6 years, with a doubling time of around 7 months."
    > "We show that this metric has been consistently exponentially increasing over the past 6 years, with a doubling time of around 7 months. Extrapolating this trend predicts that, in under a decade, we will see AI agents that can independently complete a large fraction of software tasks that currently take humans days or weeks."
[5] https://metr.org/blog/2026-05-19-frontier-risk-report — METR Frontier Risk Report (Feb–Mar 2026)
    > "we present six key facts that inform our assessment"
    > "means (what harmful actions agents could take), motive (whether they might attempt harmful actions) and opportunity (whether attempts could succeed, given safeguards)"
    > "a pilot exercise to assess misalignment risks from AI agents used inside frontier AI developers, with participation from Anthropic, Google, Meta, and OpenAI"
    > "Second, we present six key facts that inform our assessment"
    > "Finally, we provide an assessment of whether internal AI agents in Feb–Mar 2026 had the means, motive , and opportunity to start a “ rogue deployment ” — a set of agents running autonomously without human knowledge or permission"
[6] https://metr.org/risk-assessment — METR Risk Assessment
    > "Frontier Risk Report (February to March 2026)"
    > "We conduct evaluations of the autonomous capabilities of frontier AI models, with some in partnership with AI developers such as Anthropic and OpenAI."
[7] https://futureoflife.org/index — FLI AI Safety Index Summer 2026
    > "The Summer 2026 Index evaluates nine leading AI companies on 37 indicators spanning six critical domains."
    > "An independent panel of seven leading AI researchers and governance experts reviewed company-specific evidence and assigned domain-level grades (A–F) based on absolute performance standards with discretionary weights."
    > "Overall Grade C+ C C D+ D- D- F F F"
    > "Data Collection The Index collected evidence up until June 3, 2026, combining publicly available materials—including model cards, research papers, and benchmark results—with responses from a targeted company survey designed to address specific transparency gaps in the industry, such as transparency on whistleblower protections and external model evaluations."
    > "Existential Safety 4 indicators D+ D+ D F F F F F F"
[8] https://www.safe.ai — Center for AI Safety
    > "Artificial Intelligence (AI) possesses the potential to benefit and advance society. Like any other powerful technology, AI also carries inherent risks, including some which are potentially catastrophic"
[9] https://aisafetyindex.org — Open LLM Safety Index
    > "Today the score measures jailbreak robustness — how well a model holds its safety guardrails when someone actively tries to break them. It's the first of several safety dimensions we're building toward a single standard."
    > "Anyone can download an open-weight language model and build on it — but almost no one can tell you how easily that model can be talked into doing harm. We test each one and give it a plain safety score from 1 to 5 . Higher is safer."
