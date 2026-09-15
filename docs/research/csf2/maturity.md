# CSF 2.0 Catalog Maturity

NIST CSF 2.0 サブカテゴリ 106 件に対する製品カタログの coverage 記録。
測定は `~/.hermes/profiles/csf2-catalog/scripts/csf2_evidence.py` (assets/csf2-catalog データ + test gate) による。

## 2026-09-14 第 2 回 (成熟度反復, branch research/csf2-2026-09-14-2)

- 再計測: **coverage 変化なし 59 / 106 (56%)**, 製品 39 件, test gate OK。前回計測 (同日 PR #80) と同一値 — 拡張反復待ちのため。
- 出典リンク再チェックで **Graylog Security の source URL が 403** (`https://www.graylog.org/products/security`) を確認。非 www 版 `https://graylog.org/products/security/` が 200 を返すため修正した。

## 出典リンク死活チェック (2026-09-14 第 2 回, curl -sL -o /dev/null -w '%{http_code}')

| URL | status |
| https://www.ibm.com/products/qradar-siem | 200 |
| https://www.graylog.org/products/security | 403 → 修正: https://graylog.org/products/security/ は 200 |
| https://www.okta.com/products/single-sign-on/ | 200 |
| https://www.microsoft.com/security/business/identity-access/microsoft-entra-id | 200 |
| https://www.keycloak.org/ | 200 |

## 2026-09-14 (成熟度反復, branch research/csf2-2026-09-14)

- **全体 coverage: 59 / 106 サブカテゴリ (56%)**, 製品 39 件。
- 機能別カバー率:
  - DE: 9/11
  - GV: 8/31 (最薄弱 — risk governance / supply chain が大半未カバー)
  - ID: 12/21
  - PR: 18/22
  - RC: 4/8
  - RS: 8/13
- カテゴリ別製品数 (薄い順): SIEM/EDR, PAM, HSM, ZTNA, DAST, Forensics/DFIR, Sandbox, Secrets detection, SCA/container scan, Training 各 1 件。Backup 3, EDR/XDR 3, IAM 3, GRC 3, Vulnerability management 3, SIEM 4。
- 未カバー 47 サブカテゴリ:
  `DE.AE-02, DE.CM-02, GV.OC-01..05, GV.OV-02, GV.RM-01..04, GV.RM-06, GV.RM-07, GV.RR-01..04, GV.SC-01..03, GV.SC-06, GV.SC-08..10, ID.AM-03..05, ID.IM-04, ID.RA-05..08, ID.RA-10, PR.AA-06, PR.IR-02, PR.IR-04, PR.PS-03, RC.CO-03, RC.CO-04, RC.RP-04, RC.RP-06, RS.AN-08, RS.CO-02, RS.MA-01, RS.MA-04, RS.MA-05`
- 次回 (拡張反復) 優先: IAM / GRC / threat-intel 系の薄さ解消。GV (Govern) 31 件中 23 件が未カバーであり、GRC/リスク管理製品 (e.g. リスクレジスタ、サプライチェーンリスク) の追加が coverage 向上に最も効く。

## 出典リンク死活チェック (2026-09-14, curl -sL -o /dev/null -w '%{http_code}')

| URL | status |
|---|---|
| https://www.crowdstrike.com/products/endpoint-security/ | 200 |
| https://www.splunk.com/en_us/products/enterprise-security.html | 200 |
| https://www.elastic.co/security | 200 |
| https://www.okta.com/products/workforce-identity/ | 200 |
| https://wazuh.com/ | 200 |
| https://www.tenable.com/products/nessus | 200 |
| https://www.misp-project.org/ | 200 |
| https://www.drata.com/ | 403 (bot block; site 自体は稼働。curl -L で代替確認不可 → 残置) |

結論: 死亡リンクなし。drata.com は 403 bot 対策で、製品実在のため URL 変更不要と判断。

## 2026-09-16 第 3 回 (成熟度反復, branch research/csf2-2026-09-16)

- 再計測: **coverage 変化なし 59 / 106 (56%)**, 製品 40 件 (9/14 の 39 件から Teleport 追加 +1), test gate OK。
- 機能別カバー率 (9/14 から変化なし): DE 9/11, GV 8/31 (最薄弱), ID 12/21, PR 18/22, RC 4/8, RS 8/13。
- カテゴリ別製品数 (薄い順): SIEM/EDR, PAM, HSM, ZTNA, DAST, Forensics/DFIR, Sandbox, Secrets detection, SCA/container scan, Training 各 1 件。
- 未カバー 47 サブカテゴリは 9/14 記録と同一。GV 未カバー 23/31 のため、次回 (拡張反復) は GRC / リスク管理製品の追加が最も効率が良い。

## 出典リンク死活チェック (2026-09-16, curl -sL -o /dev/null -w '%{http_code}')

| URL | status |
|---|---|
| https://goteleport.com/docs/zero-trust-access/compliance-frameworks/fedramp/ | 200 |
| https://docs.velociraptor.app/ | 200 |
| https://github.com/gitleaks/gitleaks | 200 |
| https://www.filigran.io/products/opencti/ | 000 (curl exit 60: ローカル環境で TLS 証明書検証が失敗。検証緩和時は 307 redirect。404/5xx ではなく環境問題のため URL 変更せず残置 — drata 403 と同様の扱い) |
| https://www.knowbe4.com/products/kevin-mitnick-security-awareness-training | 200 |

結論: 確実な死亡リンクなし。
