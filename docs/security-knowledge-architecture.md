# Public security knowledge: IPLD + shared claim vocabulary

The public source of truth is an immutable IPLD DAG, served as HTTPS CID blocks.
Datomic and ontology are complementary projections, not competing address formats.

| Layer | Role | Public representation |
| --- | --- | --- |
| IPLD | Exact bytes, source archive and snapshot identity | DAG-JSON / raw CIDv1, SHA-256 |
| Ontology | Meaning of item classes, properties and sourced statements | RDFS vocabulary + JSON-LD statements |
| Datom plane | Joins, source filtering and future temporal queries | Hyakka-shaped EAV export + Datomic schema |
| Human UI | Search, source navigation, related entities | Chat `#security` view and `/ja/security/` permalink |

The importer follows the live Hyakka schema's item/prop/claim/source/corpus
separation, colon-prefixed attribute strings and subject/value-item join columns.
It does not assert this snapshot was signed, accepted by Hyakka, or transacted
into its single ref. Source attribution and public redistribution permissions
remain distinct. All source rights survive; the normalized claims alone are CC0.

Do not use a Datomic numeric entity ID or transaction ID as a public identity:
those belong to a particular database. Stable CVE/STIX/item IDs identify the topic;
a CID identifies a precise version. Both JSON-LD and EAV export link back to the
same source-backed IPLD records. Named graph/statement provenance prevents an
ontology edge from silently becoming a confirmed fact.

## Current release

241 items and 915 deterministic extracted claims. CISA KEV: latest 50 entries by
dateAdded, then CVE ID (full downloaded feed is archived). ATT&CK: G0007, G0016,
G0032 and their non-deprecated technique associations, plus T1018. OTRF: the
published SDLIN-201110074812 lab audit log and publisher mapping. SCAP: NIST
overview/catalog entry, not imported XCCDF/OVAL evaluation content. One explicitly
authored, non-observational scenario template with assumptions and unknowns.

All graph claims require a source; published attribution is secondary-reported.
The log-line count is an observation about the archive, not a number of attacks.
CVE joins to individual assets, CVE-to-technique attribution, likelihood estimates
and automatic attack-path planning are not invented by this importer.

The original response bodies are gzip-compressed in raw CID blocks; the source
record carries decoded SHA-256. The OTRF log is the unchanged member extracted
from the publisher's ZIP, explicitly identified in its source record. The ZIP
container itself is not claimed to be mirrored. License notices accompany data.

## Reproduce and verify

`node scripts/build-security-data.mjs` rebuilds from the committed source lock and
archived inputs, without network access. `node test/security-data.mjs` verifies
all CIDs, decompressed source digests, claim evidence, edge endpoints, projection
schema coverage and the distinction between evidence and a scenario template.
An intentional refresh uses `--source-dir PATH` with the named downloaded inputs;
review sources/licenses and changes before publishing a new immutable head.
Retain prior immutable blocks. The index is a mutable discovery pointer.

Next integrations are a qualified signed Hyakka submission, shared-ref ingestion,
SCAP content import and verified asset-specific analysis. This release has no
automatic refresh scheduler, IPFS provider/DHT publication or live Datomic query
endpoint. Model access gates do not block public knowledge reads.
