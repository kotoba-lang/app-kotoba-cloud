#!/usr/bin/env node
// Build the NIST CSF 2.0 security-product catalog data under assets/security-data/csf2/.
// Source of truth: NIST CSWP 29 (CSF 2.0) subcategories extracted from the official PDF.
// Products are a curated, sourced catalog of representative security products mapped to
// the CSF 2.0 subcategories they help satisfy. Static output: plain JSON + IPLD-style blocks.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../assets/security-data/csf2');
mkdirSync(out + '/blocks', {recursive: true});

const digest = b => createHash('sha256').update(b).digest();
function b32(bytes) {
  let bits = 0, value = 0, result = '';
  for (const n of bytes) {
    value = (value << 8) | n; bits += 8;
    while (bits >= 5) { result += 'abcdefghijklmnopqrstuvwxyz234567'[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits) result += 'abcdefghijklmnopqrstuvwxyz234567'[(value << (5 - bits)) & 31];
  return result;
}
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const blockIndex = {};
function block(bytes, codec = 0x55) {
  const cid = 'b' + b32(Buffer.concat([Buffer.from(codec === 0x55 ? [1, 0x55, 0x12, 32] : [1, 0xa9, 2, 0x12, 32]), digest(bytes)]));
  const path = `blocks/${cid}.${codec === 0x55 ? 'bin' : 'json'}`;
  writeFileSync(out + '/' + path, bytes);
  blockIndex[cid] = {path: '/security-data/csf2/' + path, bytes: bytes.length, codec: codec === 0x55 ? 'raw' : 'dag-json'};
  return {'/': cid};
}
const dag = value => block(Buffer.from(canonical(value)), 0x129);

const generatedAt = process.env.CSF_GENERATED_AT || new Date().toISOString();

// ---- CSF 2.0 subcategories (extracted from NIST.CSWP.29.pdf, verified 106) ----
const subcategories = JSON.parse(readFileSync('/tmp/csf_subcategories_final.json', 'utf8'));
const functions = {
  GV: 'GOVERN — The organization’s cybersecurity risk management strategy, expectations, and policy are established, communicated, and monitored',
  ID: 'IDENTIFY — The organization’s cybersecurity risk is understood',
  PR: 'PROTECT — Safeguards to manage the organization’s cybersecurity risks are used',
  DE: 'DETECT — Possible cybersecurity attacks and compromises are detected and analyzed',
  RS: 'RESPOND — Actions to respond to detected cybersecurity incidents are taken',
  RC: 'RECOVER — Assets and operations affected by a cybersecurity incident are restored'
};
const categories = {
  'GV.OC': 'Organizational Context', 'GV.RM': 'Risk Management Strategy', 'GV.RR': 'Roles, Responsibilities, and Authorities',
  'GV.PO': 'Policy', 'GV.OV': 'Oversight', 'GV.SC': 'Cybersecurity Supply Chain Risk Management',
  'ID.AM': 'Asset Management', 'ID.RA': 'Risk Assessment', 'ID.IM': 'Improvement',
  'PR.AA': 'Identity Management, Authentication, and Access Control', 'PR.AT': 'Awareness and Training',
  'PR.DS': 'Data Security', 'PR.PS': 'Platform Security', 'PR.IR': 'Technology Infrastructure Resilience',
  'DE.CM': 'Continuous Monitoring', 'DE.AE': 'Adverse Event Analysis',
  'RS.MA': 'Incident Management', 'RS.AN': 'Incident Analysis', 'RS.CO': 'Incident Response Reporting and Communication',
  'RS.MI': 'Incident Mitigation',
  'RC.RP': 'Incident Recovery Plan Execution', 'RC.CO': 'Incident Recovery Communication'
};

// ---- Product catalog ----
// Every product is real, publicly documented software. `csf` lists the subcategories the
// product's primary documented capabilities support (mapped by category of capability,
// verified against each vendor's public documentation). `source` links the doc.
const P = (id, name, vendor, category, platform, summary, csf, source) =>
  ({'product/id': id, 'product/name': name, 'product/vendor': vendor, 'product/category': category,
    'product/platform': platform, 'product/summary': summary, 'product/csf': csf, 'product/source': source});

const products = [
  // --- EDR / XDR ---
  P('crowdstrike-falcon', 'CrowdStrike Falcon', 'CrowdStrike', 'EDR/XDR', 'SaaS agent',
    'Endpoint detection and response: behavioral telemetry, threat intel correlation, managed threat hunting.',
    ['DE.CM-01','DE.CM-03','DE.CM-09','DE.AE-03','DE.AE-04','DE.AE-07','DE.AE-08','ID.RA-03','ID.RA-04','PR.PS-02','PR.PS-04','PR.PS-05','RS.AN-03','RS.AN-06','RS.AN-07','RS.MA-02','RS.MA-03','RS.MI-01','RS.MI-02','ID.AM-02'],
    'https://www.crowdstrike.com/products/endpoint-security/'),
  P('microsoft-defender-endpoint', 'Microsoft Defender for Endpoint', 'Microsoft', 'EDR/XDR', 'SaaS agent',
    'Endpoint EDR with threat and vulnerability management, attack surface reduction, automated investigation.',
    ['DE.CM-01','DE.CM-03','DE.CM-09','DE.AE-03','DE.AE-04','DE.AE-07','DE.AE-08','ID.RA-01','ID.RA-03','ID.AM-02','PR.PS-02','PR.PS-04','PR.PS-05','RS.AN-03','RS.MA-02','RS.MA-03','RS.MI-01','RS.MI-02','ID.IM-03'],
    'https://www.microsoft.com/security/business/endpoint-security/microsoft-defender-endpoint'),
  P('sentinelone-singularity', 'SentinelOne Singularity', 'SentinelOne', 'EDR/XDR', 'SaaS agent',
    'Autonomous endpoint protection with AI-driven detection and automated rollback remediation.',
    ['DE.CM-01','DE.CM-03','DE.CM-09','DE.AE-03','DE.AE-04','DE.AE-07','DE.AE-08','PR.PS-04','PR.PS-05','RS.AN-03','RS.MI-01','RS.MI-02','RC.RP-05'],
    'https://www.sentinelone.com/platform/'),
  P('defender-atp-sensor-linux', 'Wazuh', 'Wazuh (open source)', 'SIEM/EDR', 'Self-hosted',
    'Open-source XDR and SIEM: log analysis, file integrity monitoring, vulnerability detection, compliance mapping.',
    ['DE.CM-01','DE.CM-03','DE.CM-06','DE.CM-09','DE.AE-03','DE.AE-06','DE.AE-08','ID.AM-01','ID.AM-02','ID.AM-07','ID.RA-01','PR.PS-04','PR.PS-01','RS.AN-03','RS.AN-06','RS.AN-07','RS.MA-02'],
    'https://wazuh.com/'),

  // --- SIEM ---
  P('splunk-enterprise-security', 'Splunk Enterprise Security', 'Splunk (Cisco)', 'SIEM', 'Self-hosted/SaaS',
    'SIEM: security monitoring, correlation search, incident review, SOAR integration.',
    ['DE.CM-01','DE.CM-03','DE.CM-06','DE.CM-09','DE.AE-03','DE.AE-06','DE.AE-07','DE.AE-08','PR.PS-04','RS.MA-02','RS.MA-03','RS.AN-03','RS.AN-06','RS.AN-07','RS.CO-03','ID.RA-02'],
    'https://www.splunk.com/en_us/products/enterprise-security.html'),
  P('elastic-security', 'Elastic Security', 'Elastic', 'SIEM', 'Self-hosted/SaaS',
    'SIEM and endpoint security on the Elastic Stack: detection rules, threat intel matching, case management.',
    ['DE.CM-01','DE.CM-03','DE.CM-09','DE.AE-03','DE.AE-06','DE.AE-07','DE.AE-08','PR.PS-04','RS.AN-03','RS.AN-06','RS.AN-07','RS.MA-02','ID.RA-02'],
    'https://www.elastic.co/security'),
  P('ibm-qradar', 'IBM QRadar Suite', 'IBM', 'SIEM', 'SaaS',
    'SIEM/SOAR: analytics over security logs, automated incident response playbooks.',
    ['DE.CM-01','DE.CM-03','DE.CM-06','DE.CM-09','DE.AE-03','DE.AE-06','DE.AE-08','PR.PS-04','RS.MA-02','RS.MA-03','RS.AN-03','RS.CO-03','ID.RA-02'],
    'https://www.ibm.com/products/qradar-siem'),
  P('graylog-security', 'Graylog Security', 'Graylog', 'SIEM', 'Self-hosted/SaaS',
    'Log management plus anomaly detection and pre-built detections mapped to MITRE ATT&CK.',
    ['DE.CM-01','DE.CM-03','DE.CM-09','DE.AE-03','DE.AE-06','DE.AE-08','PR.PS-04','RS.AN-03','RS.AN-06'],
    'https://graylog.org/products/security/'),

  // --- Identity / access ---
  P('okta-workforce-identity', 'Okta Workforce Identity', 'Okta', 'IAM', 'SaaS',
    'Identity provider: SSO, MFA, lifecycle management, access policy.',
    ['PR.AA-01','PR.AA-02','PR.AA-03','PR.AA-04','PR.AA-05','ID.AM-08','DE.CM-03','PR.DS-02'],
    'https://www.okta.com/products/single-sign-on/'),
  P('microsoft-entra-id', 'Microsoft Entra ID', 'Microsoft', 'IAM', 'SaaS',
    'Azure AD successor: SSO, conditional access, identity protection, PIM.',
    ['PR.AA-01','PR.AA-02','PR.AA-03','PR.AA-04','PR.AA-05','ID.AM-08','DE.CM-03','DE.AE-03','RS.MA-02'],
    'https://www.microsoft.com/security/business/identity-access/microsoft-entra-id'),
  P('keycloak', 'Keycloak', 'Keycloak (open source)', 'IAM', 'Self-hosted',
    'Open-source identity and access management: SSO, MFA, federation, fine-grained authorization.',
    ['PR.AA-01','PR.AA-02','PR.AA-03','PR.AA-04','PR.AA-05','PR.DS-02'],
    'https://www.keycloak.org/'),
  P('cyberark-pam', 'CyberArk Privilege Cloud', 'CyberArk', 'PAM', 'SaaS',
    'Privileged access management: vaulting, session recording, just-in-time access.',
    ['PR.AA-01','PR.AA-03','PR.AA-05','DE.CM-03','PR.DS-01','PR.PS-04','RS.AN-06'],
    'https://www.cyberark.com/products/privilege-cloud/'),
  P('yubico-yubihsm', 'YubiHSM 2', 'Yubico', 'HSM', 'Hardware',
    'Hardware security module for key storage and cryptographic operations.',
    ['PR.DS-01','PR.DS-02','ID.RA-09','PR.AA-01'],
    'https://www.yubico.com/products/yubihsm2/'),

  // --- Network security ---
  P('paloalto-ngfw', 'Palo Alto Networks NGFW', 'Palo Alto Networks', 'Firewall', 'Hardware/VM',
    'Next-generation firewall: app-ID, URL filtering, threat prevention, TLS decryption.',
    ['PR.IR-01','PR.DS-02','DE.CM-01','DE.AE-03','DE.AE-08','PR.PS-04','PR.PS-05','RS.MI-01'],
    'https://www.paloaltonetworks.com/network-security/next-generation-firewall'),
  P('pfense-plus', 'pfSense Plus', 'Netgate', 'Firewall', 'Self-hosted',
    'Open-source firewall/router: NAT, VPN, IDS/IPS integration, traffic shaping.',
    ['PR.IR-01','PR.DS-02','DE.CM-01','PR.IR-03'],
    'https://www.netgate.com/pfsense-plus-software'),
  P('cloudflare-zero-trust', 'Cloudflare Zero Trust', 'Cloudflare', 'ZTNA', 'SaaS',
    'Zero trust network access, secure web gateway, DNS filtering, WAF, DLP.',
    ['PR.IR-01','PR.DS-02','DE.CM-01','DE.AE-03','PR.AA-03','PR.AA-05','PR.DS-01','PR.DS-10','PR.PS-04'],
    'https://www.cloudflare.com/products/zero-trust/'),
  P('zeek', 'Zeek', 'Zeek (open source)', 'Network detection', 'Self-hosted',
    'Network security monitor: rich telemetry and scripted detection on network traffic.',
    ['DE.CM-01','DE.AE-03','DE.AE-07','PR.PS-04','RS.AN-03','RS.AN-07'],
    'https://zeek.org/'),
  P('suricata', 'Suricata', 'OISF (open source)', 'Network detection', 'Self-hosted',
    'IDS/IPS and network security monitoring with signature and protocol analysis.',
    ['DE.CM-01','DE.AE-03','DE.AE-08','PR.IR-01','PR.PS-04','RS.MI-01'],
    'https://suricata.io/'),

  // --- Vulnerability management ---
  P('tenable-nessus', 'Tenable Nessus', 'Tenable', 'Vulnerability management', 'Self-hosted',
    'Industry-standard vulnerability scanner with extensive plugin coverage.',
    ['ID.RA-01','ID.RA-03','ID.RA-04','ID.AM-01','ID.AM-02','PR.PS-02','ID.IM-03'],
    'https://www.tenable.com/products/nessus'),
  P('openvas-gvm', 'OpenVAS (Greenbone)', 'Greenbone (open source)', 'Vulnerability management', 'Self-hosted',
    'Open-source vulnerability scanning engine with regularly updated feed.',
    ['ID.RA-01','ID.RA-03','ID.AM-01','PR.PS-02'],
    'https://www.greenbone.net/en/products/gvm/'),
  P('qualys-vmdr', 'Qualys VMDR', 'Qualys', 'Vulnerability management', 'SaaS',
    'Cloud vulnerability management: discovery, prioritization, patch correlation.',
    ['ID.RA-01','ID.RA-03','ID.RA-04','ID.AM-01','ID.AM-02','ID.AM-08','PR.PS-02','ID.IM-03'],
    'https://www.qualys.com/apps/vulnerability-management-detection-response/'),

  // --- Secrets / config ---
  P('hashicorp-vault', 'HashiCorp Vault', 'HashiCorp', 'Secrets management', 'Self-hosted/SaaS',
    'Secrets management, encryption as a service, dynamic credentials, PKI.',
    ['PR.AA-01','PR.AA-03','PR.AA-05','PR.DS-01','PR.DS-02','ID.RA-09','PR.PS-01'],
    'https://developer.hashicorp.com/vault'),
  P('openbao', 'OpenBao', 'OpenBao (open source)', 'Secrets management', 'Self-hosted',
    'Open-source fork of Vault: secrets management and encryption as a service.',
    ['PR.AA-01','PR.AA-03','PR.AA-05','PR.DS-01','PR.DS-02'],
    'https://openbao.org/'),
  P('trivy', 'Trivy', 'Aqua Security (open source)', 'SCA/container scan', 'CLI/CI',
    'Comprehensive scanner for containers, IaC, secrets and dependencies.',
    ['ID.RA-01','ID.RA-09','PR.PS-01','PR.PS-02','PR.PS-06','GV.SC-07'],
    'https://trivy.dev/'),

  // --- Application security ---
  P('owasp-zap', 'OWASP ZAP', 'OWASP (open source)', 'DAST', 'CLI/proxy',
    'Open-source web app scanner and proxy for finding vulnerabilities dynamically.',
    ['ID.RA-01','PR.PS-06','ID.IM-02'],
    'https://www.zaproxy.org/'),
  P('semgrep', 'Semgrep', 'Semgrep', 'SAST', 'CLI/CI',
    'Fast static analysis with custom rules and supply-chain dependency scanning.',
    ['PR.PS-06','ID.RA-01','GV.SC-05','GV.SC-07'],
    'https://semgrep.dev/'),
  P('sonarqube', 'SonarQube', 'Sonar', 'SAST', 'Self-hosted/SaaS',
    'Code quality and security: static analysis with taint tracking in CI.',
    ['PR.PS-06','ID.RA-01','ID.IM-03'],
    'https://www.sonarsource.com/products/sonarqube/'),

  // --- Backup ---
  P('veeam-backup', 'Veeam Backup & Replication', 'Veeam', 'Backup', 'Self-hosted',
    'Enterprise backup, replication, immutable backups and instant recovery.',
    ['PR.DS-11','RC.RP-01','RC.RP-02','RC.RP-03','RC.RP-05','PR.IR-03'],
    'https://www.veeam.com/products/veeam-backup-replication.html'),
  P('restic', 'Restic', 'Restic (open source)', 'Backup', 'CLI',
    'Fast, secure, deduplicated backup with client-side encryption and integrity checks.',
    ['PR.DS-11','RC.RP-03','PR.DS-01'],
    'https://restic.net/'),
  P('borgbackup', 'BorgBackup', 'Borg (open source)', 'Backup', 'CLI',
    'Deduplicating backup with compression and authenticated encryption.',
    ['PR.DS-11','RC.RP-03','PR.DS-01'],
    'https://www.borgbackup.org/'),

  // --- Phishing / training ---
  P('knowbe4-ksat', 'KnowBe4 Security Awareness Training', 'KnowBe4', 'Training', 'SaaS',
    'Security awareness training and simulated phishing platform.',
    ['PR.AT-01','PR.AT-02','DE.CM-03','ID.IM-02'],
    'https://www.knowbe4.com/products/kevin-mitnick-security-awareness-training'),

  // --- Governance / GRC ---
  P('drata', 'Drata', 'Drata', 'GRC', 'SaaS',
    'Continuous compliance automation and control monitoring across frameworks.',
    ['GV.PO-01','GV.PO-02','GV.OV-01','GV.OV-03','ID.AM-02','ID.IM-01','PR.PS-04','GV.SC-04','GV.SC-05'],
    'https://www.drata.com/'),
  P('opencre', 'OpenCRE', 'OWASP (open source)', 'GRC', 'Self-hosted',
    'Common Requirement Enumeration: machine-readable security requirements linked to standards.',
    ['GV.PO-01','GV.SC-05','PR.PS-06'],
    'https://www.opencre.org/'),
  P('oscal-compass', 'OSCAL Compass', 'Compass (open source)', 'GRC', 'Self-hosted',
    'OSCAL-native policy-as-code and control cataloging (incl. NIST CSF mapping).',
    ['GV.PO-01','GV.PO-02','GV.OV-03','ID.IM-01'],
    'https://github.com/oscal-compass'),
  P('gitleaks', 'GitLeaks', 'GitLeaks (open source)', 'Secrets detection', 'CLI/CI',
    'Detect and prevent hardcoded secrets in git repositories.',
    ['PR.DS-01','ID.RA-09','PR.PS-06'],
    'https://github.com/gitleaks/gitleaks'),

  // --- Threat intel ---
  P('misp', 'MISP Threat Sharing', 'MISP (open source)', 'Threat intelligence', 'Self-hosted',
    'Open-source threat intelligence platform for sharing, correlating indicators.',
    ['ID.RA-02','ID.RA-03','DE.AE-07','RS.CO-03','GV.RM-05'],
    'https://www.misp-project.org/'),
  P('opencti', 'OpenCTI', 'Filigran (open source)', 'Threat intelligence', 'Self-hosted',
    'Open cyber threat intelligence platform with knowledge graph of threats.',
    ['ID.RA-02','ID.RA-03','DE.AE-07','RS.CO-03'],
    'https://www.filigran.io/products/opencti/'),

  // --- Sandbox / forensics ---
  P('cuckoo-sandbox', 'CAPE Sandbox', 'CAPE (open source)', 'Sandbox', 'Self-hosted',
    'Malware analysis sandbox with automated behavioral reporting.',
    ['ID.RA-03','DE.AE-07','RS.AN-03','RS.AN-07'],
    'https://capev2.readthedocs.io/'),
  P('teleport-zero-trust-access', 'Teleport Zero Trust Access', 'Gravitational (Teleport)', 'ZTNA/PAM', 'Self-hosted/SaaS',
    'Zero trust infrastructure access: certificate-based identity, RBAC, just-in-time access, session recording and audit export.',
    ['PR.AA-01','PR.AA-03','PR.AA-05','PR.PS-04','DE.CM-09','RS.AN-06'],
    'https://goteleport.com/docs/zero-trust-access/compliance-frameworks/fedramp/'),
  P('velociraptor', 'Velociraptor', 'Velocidex (open source)', 'Forensics/DFIR', 'Self-hosted',
    'Endpoint forensics and incident response: collection, hunting, timeline analysis.',
    ['DE.CM-03','DE.CM-09','RS.AN-03','RS.AN-06','RS.AN-07','ID.RA-03'],
    'https://docs.velociraptor.app/')
];

// Validate every mapping points at a real subcategory
const missing = [...new Set(products.flatMap(p => p['product/csf']))].filter(c => !subcategories[c]);
if (missing.length) { console.error('BAD MAPPINGS:', missing); process.exit(1); }

// ---- Assemble ----
const head = {
  'catalog/schema': 'kotoba.security-product-csf2.v1',
  generatedAt,
  'source/framework': {'name': 'NIST Cybersecurity Framework 2.0', 'document': 'NIST CSWP 29', 'published': '2024-02-26',
    'url': 'https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf', 'subcategoryCount': Object.keys(subcategories).length},
  productCount: products.length,
  products: products.map(p => p['product/id'])
};
const headBlock = dag(head);
const productBlocks = {};
for (const p of products) productBlocks[p['product/id']] = dag(p);

const index = {
  head: headBlock,
  headUrl: '/security-data/csf2/blocks/' + blockIndex[headBlock['/']].path.split('/').pop(),
  version: 1,
  generatedAt,
  subcategoryCount: Object.keys(subcategories).length,
  productCount: products.length,
  products: products.map(p => ({
    'product/id': p['product/id'], 'product/name': p['product/name'], 'product/vendor': p['product/vendor'],
    'product/category': p['product/category'], 'product/platform': p['product/platform'],
    'product/summary': p['product/summary'], 'product/source': p['product/source'],
    'product/csf': p['product/csf'],
    record: productBlocks[p['product/id']]
  })),
  subcategories,
  'source/framework': head['source/framework'],
  blocks: blockIndex
};
writeFileSync(out + '/index.json', JSON.stringify(index, null, 1));
writeFileSync(out + '/subcategories.json', JSON.stringify(subcategories, null, 1));
writeFileSync(out + '/functions.json', JSON.stringify(functions, null, 1));
writeFileSync(out + '/categories.json', JSON.stringify(categories, null, 1));
writeFileSync(out + '/products.json', JSON.stringify(products, null, 1));
console.log(`rendered ${products.length} products over ${Object.keys(subcategories).length} CSF 2.0 subcategories`);
