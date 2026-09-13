# A-2: worker.cljk を amu guest 面へ — upstream capability 提案（測定付き）

2026-09-12、app-kotoba-cloud `bot/https-redirect-cyber-catalog` branch で実測。
kbb cutover (1257af8) 後、worker bundle (`build/worker.js`) を出す経路が存在しない:
amu compile は guest reader が js interop を拒否し、shadow-cljs は `.cljk` を解決しない。

## 実測された拒否（最小再現）

```
$ amu compile tmpamu/mini2.cljk --target wasm32-browser --output tmpamu/mini2.js
:name "named operation js/Headers. is not a registered capability"
```

## interop census（13 file、合計 111 形）

worker.cljk とその依存 (locale, session, profile, boot, rootkey, pqc,
identity-gateway, research-gateway, funnel, attribution, research, site) の
測定値。4 グループに分解できる:

| group | forms | count |
|---|---|---|
| http | js/URL. / js/Headers. / js/Response. / js/Request. / js/fetch | 16 |
| json | js/JSON.stringify / js/JSON.parse / clj->js / js->clj | 39 |
| time | js/Date.parse / js/Date.now / js/Date. / js/Date | 13 |
| crypto | js/crypto | 3 |
| misc | js-invoke, gobj/get, js/Promise.*, TextEncoder/Decoder, atob, Blob, AbortSignal.timeout, encodeURIComponent など | 40 |

## 必要な capability 面（提案: Workers-runtime surface）

1. `http/request-shape` — URL parse / Headers map / method / body (wire 26x 台)
2. `http/response-build` — status + headers + body → Response
3. `http/fetch` — outbound (session viewer, kotobase publish, PQ registry)
4. `data/json` は既に landed (id 246) — これで json group 39 形の大半を置換できる
5. `time/clock` — ms epoch / ISO parse（fail-closed: 検証系は epoch 注入）
6. `crypto/subtle` + `crypto/random` — PQ approval 検証（@noble に寄せれば
   pure guest になる可能性。要検討）

## 順序（skill kotoba-capability-extension の 3-repo chain を 1 op ずつ）

- json → time → http (shape) → http (fetch) → crypto
- 1 op = 3 PR (core-contracts → kotoba-lang → kotoba) + vendored resync
- amu sema pin の bump は murakumo oracle coupling を調べてから

## 代替（単純に早いが mirror になる）

shadow-cljs 用に .cljk → .cljc 生成 mirror を build step に組む。
rename commit 9432493 が明示的に禁止した形。撤去条件を書けば一時許容は可能だが、
恒久にしない。

## 判定

A-2 完了の定義は「worker bundle が amu/kbb 経由で JVM-free に出ること」。
見積り: 上記 5 波、1 波あたり 3 PR。本 branch では発行するものを作り、
実装は capability wave 側で行う。
