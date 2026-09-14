# CSF 2.0 Catalog Maturity

NIST CSF 2.0 サブカテゴリ 106 件に対する製品カタログの coverage 記録。
測定は `~/.hermes/profiles/csf2-catalog/scripts/csf2_evidence.py` (assets/csf2-catalog データ + test gate) による。

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
