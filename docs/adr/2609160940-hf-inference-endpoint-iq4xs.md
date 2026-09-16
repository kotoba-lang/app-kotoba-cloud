# ADR 2609160940: The dedicated research deployment is an Inference Endpoint serving the IQ4_XS build of Qwen3.8-Flash-Next (uncensored)

**Status:** Accepted (2026-09-16). Supersedes the *host* and *model* of
ADR 260914 (direct inference); keeps its secret names and its contract.

## Context

ADR 260914 moved the red-team route off the Murakumo relay onto a dedicated
`.modal.run` deployment of `dealignai/Qwen3.8-Flash-Next-CYBERSECURITY-NVFP4`
(vLLM, NVFP4 → Blackwell only). The owner asked (2026-09-16) for the route to
be served instead from a Hugging Face Inference Endpoint running
`orcarouter/Qwen3.8-Flash-Next-Uncensored-GGUF` on llama.cpp, and for the
most cost-efficient configuration of that endpoint to be researched first.

This record holds the research (what was measured, how), the configuration
that was deployed, and what is still unmeasured. Public surfaces (the
catalog, `/models/`, the research page) keep naming no provider and no
derivative build (owner direction 2026-09-15); the exact repo and revision
live here.

## What was measured (reproduce before trusting)

1. **The model is a 177 B-parameter MoE** (`qwen4exp`: 512 experts, 10 routed
   + 1 shared, 48 layers, 12 full-attention layers with 2 KV heads × 256
   head-dim, 36 Gated-DeltaNet layers, QSA sparse attention, 262,144 context).
   `curl https://huggingface.co/api/models/orcarouter/Qwen3.8-Flash-Next-Uncensored-GGUF?blobs=true`
   → `gguf.total = 176943899520`; `Qwen/Qwen3.8-Flash-Next` `config.json`
   `text_config` (`full_attention_interval 4`, `num_key_value_heads 2`,
   `head_dim 256`, `layer_types`).
2. **26.8 GiB of every quant is a single CPU-resident tensor.** The GGUF
   header of shard 1 (range request, bytes 0–16 MB, parsed by hand) lists
   `per_layer_token_embd.weight [160, 320001536]` — the PLE n-gram hash
   table (51.2 B params) — as `IQ4_NL` (IQ quants) / `Q5_0` (Q4_K_M):
   26.82 GiB / 32.8 GiB. In llama.cpp master that tensor is
   `LLM_TENSOR_LAYER_INPUT` (`src/llama-arch.cpp`, line with
   `LLM_TENSOR_PER_LAYER_TOKEN_EMBD`) and the input layer is always placed on
   the CPU (`src/llama-model.cpp`: "there is very little benefit to
   offloading the input layer, so always keep it on the CPU"). PR #27742
   says the same: "host-side row indices in a `set_input`, then
   `ggml_get_rows`". The platform's "Memory requirements: 97 GB" is the file
   size, not the GPU need.

   | quant | files | GPU-resident (files − PLE) |
   |---|---:|---:|
   | IQ2_XXS | 69.7 GiB | 42.9 GiB |
   | IQ3_M | 83.4 GiB | 56.6 GiB |
   | **IQ4_XS** (card: "best low-bit pick, ≈ Q4_K_S quality") | 90.8 GiB | **64.0 GiB** |
   | Q4_K_M | 111.0 GiB | 78.2 GiB (does not fit 80/96 GB) |

3. **KV cache is small.** Only the 12 full-attention layers hold KV:
   12 × 2 × 2 × 256 × 2 B = 24 KiB/token (f16) → 6 GiB at the model's
   262,144 maximum. The recurrent state of the 36 GDN layers is ≈ 113 MB per
   sequence slot.
4. **The engine image can load it.** `qwen4exp` merged into llama.cpp master
   on 2026-08-27 (PR #27742, follow-up #27880 merged 2026-08-28). The
   platform's llama.cpp engine is "the latest image built from the `master`
   branch" (`ghcr.io/ggml-org/llama.cpp:server-cuda`), built with CUDA 12.8.1
   and the default architecture list, which includes `120a-real` (Blackwell)
   (`.devops/cuda.Dockerfile`, `ggml/src/ggml-cuda/CMakeLists.txt`).
5. **MTP speculative decoding is not available yet.** PR #27836 and #28243
   are open (checked 2026-09-16 via `gh api`), so the platform's
   "Speculative Decoding File: Not applicable" is correct. When they merge,
   the master image carries them; then `LLAMA_ARG_SPEC_TYPE=draft-mtp` + the
   `…-MTP-draft.gguf` (card: 1.3–2× decode) can be added.
6. **Attribution:** llama-server answers `model` = the model *file path*
   unless `--alias` is set (`tools/server/README.md`). The authority's
   strict attribution compares `model` with the upstream id, so the alias is
   mandatory.
7. **Sampling defaults come from the file.** The GGUF carries
   `general.sampling.temp 1.0 / top_p 0.95 / top_k 20`, which llama.cpp
   master reads (`LLM_KV_GENERAL_SAMPLING_*`); `--jinja` is on by default.
8. **Instances and prices** (platform form, 2026-09-16, account
   `com-kotobalabs`): AWS A100 ×1 80 GB / 11 vCPU / 145 GB — $2.50/h
   (us-east-1); **RTX PRO 6000 Blackwell ×1 96 GB / 23 vCPU / 256 GB —
   $2.75/h (us-east-2)**; H200 ×1 141 GB / 23 vCPU / 256 GB — $5/h
   (us-west-2); L40S has no ×2 size. Billing is per minute, initialising
   time included; scale-to-zero counts against quota, paused does not.
   `GET /v2/provider` on the endpoints API gives the same table
   (`nvidia-rtx-pro-6000`, size `x1`, `us-east-2`, `available`).
9. **The platform answers 503 while a scaled-to-zero endpoint starts**
   (autoscaling guide; optional `X-Scale-Up-Timeout: <s>` header holds the
   request instead). The authority already treats 503 as not-ready and polls
   for up to `dispatch-budget-ms` (13 min).

## Decision

One endpoint, created 2026-09-16 00:40:21Z through the platform's form:

| field | value | why |
|---|---|---|
| namespace / name | `com-kotobalabs` / `qwen38-flash-next-unc-iq4xs` | |
| URL | `https://obnct428kmjxul06.us-east-2.aws.endpoints.huggingface.cloud` (+ `/v1/chat/completions`) | the value of `MODAL_INFERENCE_URL` |
| model | `orcarouter/Qwen3.8-Flash-Next-Uncensored-GGUF` @ `0434906af7b5202b676d43f108cf4f73d25691ef`, file `Qwen3.8-Flash-Next-Uncensored-IQ4_XS-00001-of-00003.gguf` (+ 2 shards, mmproj F16) | revision pinned so a re-upload cannot change the weights silently |
| instance | AWS us-east-2 · Nvidia RTX PRO 6000 Blackwell ×1 (96 GB, 23 vCPU, 256 GB) · $2.75/h | 64 GiB GPU-resident + 6 GiB KV + buffers fits; the PLE table's 27 GiB sits in the 256 GB host RAM; +10 % over A100 for +16 GB VRAM and ~1.6× FP16 compute (prefill of 128k prompts) |
| engine | llama.cpp, `ghcr.io/ggml-org/llama.cpp:server-cuda` (master) | measured fact 4 |
| Max Tokens (per request) | 131072 | the edge's contract: `prompt + max_tokens ≤ 131,072` (`research.cljk`) |
| Max Concurrent Requests | 2 | total context 262,144 = the model's maximum; two 128k slots |
| layers on GPU | all (blank) | |
| mmproj | `mmproj-Qwen3.8-Flash-Next-Uncensored-F16.gguf` | the only choice the form offers; 0.85 GiB |
| authentication | Private | the authority sends `Authorization: Bearer <token>` |
| autoscaling | scale-to-zero after 15 min, min 0 / max 1 | per-minute billing; the authority absorbs the 503s |
| `LLAMA_ARG_ALIAS` | `qwen3.8-flash-next-uncensored-iq4-xs` | measured fact 6; equals `upstream-models` in the authority and `:upstream` in `research.cljk` |
| `LLAMA_ARG_THINK_BUDGET` | `1024` | thinking is on by default; agents send `max_tokens 2048` (`research.cljk`), an unbounded trace leaves `content` empty → `inference-result-empty` |
| `LLAMA_ARG_CACHE_RAM` | `65536` | prompt cache of idle slots in host RAM (default 8 GiB): agent loops resend the growing conversation; a hybrid model cannot KV-shift, so prefix reuse is checkpoints + this cache |
| `LLAMA_ARG_UBATCH` / `LLAMA_ARG_BATCH` | `2048` / `4096` (since 02:00Z; `1024` / `2048` at creation) | prefill measured +22 % at 14k and +13 % at 60k tokens against 1024 with ~18 GB of VRAM still free (tuning section) |
| `LLAMA_ARG_THREADS` | `16` (since 01:43Z) | the container reports the host's 96 cores to llama.cpp (`n_threads = 96` in the log) on a 23-vCPU instance; 16 measured neutral for decode (103 vs 104 tok/s) and prefill, and stops the oversubscription |

Not set (defaults measured to be right): flash attention `auto`, `--jinja`
on, sampling from the file, reasoning format `deepseek` (the trace lands in
`reasoning_content`, `content` holds the answer the authority checks).

### Code

- `research_authority.cljk`: `red-route-host-suffix` = `.endpoints.huggingface.cloud`
  (was `.modal.run`); a secret still holding the previous host fails as
  `red-route-url-invalid` before any fetch (pinned by
  `test/research-authority-local.mjs`). `upstream-models` maps the public
  `qwen3.8-flash-next-whitehacker` to `qwen3.8-flash-next-uncensored-iq4-xs`.
- `research.cljk`: `:upstream` likewise; `:source` is the base model's
  publisher page (`https://huggingface.co/Qwen/Qwen3.8-Flash-Next`).
- `research_site.cljk`: the public model card names the base model and its
  publisher only; the stale relay name is gone from the copy.
- Secret names stay `MODAL_INFERENCE_URL` / `MODAL_INFERENCE_TOKEN` (a stored
  secret cannot be renamed without its value, ADR 260914); their *values*
  are now the endpoint URL and a Hugging Face token of an organisation
  member (fine-grained, endpoint calls only).

## Measured on the endpoint (2026-09-16)

- **Cold start, create → serving: 24 s.** Created 00:40:21Z (form submit);
  the replica's log shows `load_model: loading model '/repository/…IQ4_XS-00001-of-00003.gguf'`
  at 00:40:35Z and `llama_server: listening on http://0.0.0.0:80` at
  00:40:45Z (10 s of model load, `n_threads = 96`, `n_slots = 2,
  n_ctx_slot = 131072, kv_unified = 'false'`). The 91 GiB were on the node
  before the container started; the platform's download is not in the
  container log.
- **Scale-from-zero → serving: ~36 s.** The endpoint scaled to zero at
  ~00:56Z (15 min without an accepted request; a 403 at the proxy does not
  count as activity). "Wake Up" pressed at 00:57:50Z; the new replica
  listens at 00:58:26Z; the status badge read Running by 00:59:13Z. Both are
  far inside the authority's 13-minute dispatch budget, so scale-to-zero
  stays on.
- **Reproduce:** Logs tab of the endpoint (UTC toggle), the
  `llama_server: listening` line of the newest replica against the time of
  the wake-up.

- **Token and end-to-end (01:18–01:27Z).** A fine-grained token (org
  `com-kotobalabs`, endpoint calls) probed directly: 503 at 01:18:35Z and
  01:18:56Z (scaling from zero), **200 at 01:19:17Z** (~42 s), `model` =
  the alias, `object` = `chat.completion`, `usage` present. Stored as
  `MODAL_INFERENCE_TOKEN` on `kotoba-research-authority` (piped, never
  displayed). Then the launch condition of ADR 260914: an **admitted
  end-to-end job** through `api.kotoba.cloud` (browser session, red model,
  `code-review` / `owned`, `max_tokens 2048`) answered **200 in 4.3 s** with
  a three-sentence IDOR finding, `billing: free`, a `receiptId`, and the
  provider's usage (`prompt 102 / completion 354 / total 456` — the 354
  include the ≤ 1024-token reasoning budget; `content` was non-empty at
  `max_tokens 2048`). The job was the one that had failed with the previous
  token (`red-route-unavailable`, 401): it re-dispatched on the identical
  request (`inference-job-requeued … prior=failed upstreamStatus=401`),
  spending no second quota unit.
- **Auth failure shapes at the endpoint** (measured for the runbook): no
  header, an empty bearer and an unknown token all answer **401
  `UNAUTHORIZED`**; a real token without the endpoint permission answers
  **403** `missing permissions: inference.endpoints.infer.write`. The
  authority surfaces both as `red-route-unavailable` (retryable), with the
  upstream body in `inference-run-failed`.

## Tuning measurements (2026-09-16 01:19–02:01Z)

Probe (reproduce with curl, no tooling landed): direct
`POST /v1/chat/completions` with the stored token, `stream: false`, numbers
read from llama-server's own `timings` object in the response (`prompt_n`,
`prompt_per_second`, `cache_n`, `predicted_per_second`) and `usage`
(`prompt_tokens_details.cached_tokens`). Prompts are llama.cpp source text;
`POST /tokenize` gave 56,000 chars = 14.4k tokens, 230,000 = 60.1k,
430,000 = 116.5k. Prefix reuse = the same prompt with a different last
line. Long output = `ignore_eos: true` (a llama.cpp request field). **Single tenant until ~01:35Z; from
then on a production agent session (≈110 requests/hour, 29k–53k-token
contexts, both slots busy at 35–39 tok/s each — the endpoint log) shared
the GPU, so later numbers are contended and say so.**

| what | value | when / condition |
|---|---|---|
| decode, 64-token prompt | **102–104 tok/s** | clean, both thread settings |
| decode at 14k / 60k / 116k context | 74–87 / 60–68 / 52 tok/s | clean (single stream) |
| prefill, cold, 14k prompt | 2,913 tok/s → **3,543 tok/s** | ubatch 1024 → 2048 (+22 %), clean |
| prefill, 47k new tokens on a 13k cached prefix | 2,503 → **2,838 tok/s** | ubatch 1024 → 2048 (+13 %), clean |
| prefill, cold, 116k prompt | 1,580–2,090 tok/s (56–72 s) | both ubatch values; the later runs contended |
| prefix reuse (same prefix, new tail) | **93–99 % cached** (`cache_n` 13,470 / 59,132 / 115,584 of 14.5k / 60k / 116.6k), tail re-prefill ≤ 2 s | `LLAMA_ARG_CACHE_RAM=65536` (checkpoints + host prompt cache) |
| prefix reuse with `LLAMA_ARG_CACHE_RAM=0` | **0 %** — the 116k prompt re-prefilled in full (55 s) on the very next call | measured 01:49Z; the host cache is mandatory on this hybrid model |
| two concurrent 14k prompts | 35 + 44 tok/s per stream ≈ one stream's 74–79 tok/s; prefills serialised | clean |
| 32,768-token answer, `stream: false` (`ignore_eos`) | **200 after 460 s**, 71.4 tok/s, 129k chars; the platform proxy did not cut it | clean; the authority's `stream: false` and the edge's 14-minute wait hold for 32k output |
| GPU memory (Analytics) | ≈ 76 GB at ubatch 1024, ≈ 78 GB at 2048, of 96 GB | matches measured fact 2 (≈ 64 GiB weights on the GPU + 6 GiB KV + buffers; the 27 GiB PLE table is not on the GPU) |
| host memory (Analytics) | 2–15 GB RSS | the PLE table is memory-mapped; the prompt cache grows RSS |
| `--reasoning-budget 1024` | caps thinking, does not reserve answer tokens: `content` empty at `max_tokens` 16–256, present at 2048 | clients must send `max_tokens` well above 1024; the edge's default 2048 does |
| replica update (env change) | ≈ 50 s rolling, 503 at the proxy meanwhile | four updates 01:38–02:00Z |

Not a config effect: after ~01:45Z short requests took 15–35 s wall for
128 tokens with decode at 8–50 tok/s. The endpoint log shows they were
queued behind and then interleaved with the production session's tasks
(`selected slot by LRU`, two slots generating). Config changes made in that
window (ubatch 2048, threads 16, cache 0) were each reverted and
re-measured before being blamed; the contention explains all of it.

Knobs left as they are, with the reason: `nParallel 2` (a third concurrent
agent queues; raising it costs per-stream speed, not aggregate — the
aggregate is ≈ 75–80 tok/s either way, and 4 slots would set the total
context above the model's 262,144); flash attention `auto`; KV in f16 (no
VRAM pressure); scale-to-zero 15 min (36–42 s to serve again).

## Not measured yet (fill in, do not infer)

- Prefill/decode with the MTP draft once PR #28243 lands in the master
  image (card: 1.3–2× decode).
- Whether `nParallel 3–4` is wanted: measure the queue (Analytics → pending
  requests) against the number of concurrent agent sessions first.

## Cost

$2.75/h × 730 h ≈ $2,007/month always-on. With scale-to-zero: active minutes
+ per burst (initialising minutes + a 15-minute idle tail). A100 ×1 is −9 %
for less VRAM and compute; H200 ×1 ($5/h) only for Q4_K_M or four 262k
slots.

## Sources

- https://huggingface.co/docs/inference-endpoints/engines/llama_cpp
- https://huggingface.co/docs/inference-endpoints/en/guides/autoscaling
- https://huggingface.co/docs/inference-endpoints/pricing
- https://huggingface.co/docs/inference-endpoints/main/en/guides/configuration
- https://github.com/ggml-org/llama.cpp/pull/27742 · /pull/27836 · /pull/28243
- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- https://huggingface.co/orcarouter/Qwen3.8-Flash-Next-Uncensored-GGUF (gated; model card)
- https://huggingface.co/Qwen/Qwen3.8-Flash-Next (`config.json`)
