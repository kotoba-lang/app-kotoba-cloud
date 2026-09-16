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
| `LLAMA_ARG_UBATCH` / `LLAMA_ARG_BATCH` | `1024` / `2048` | prefill of long prompts (default 512/2048); raise to 2048/4096 after the first VRAM measurement |

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

## Not measured yet (fill in, do not infer)

- **VRAM split at load.** The container log does not carry the
  `load_tensors: … buffer size` lines (server-level verbosity only); read
  it from the Analytics tab's GPU memory or `nvidia-smi` is not exposed.
  Expected ≈ 64 GiB GPU / ≈ 27 GiB host from measured fact 2.
- **A direct request.** The operator's stored OAuth token lacks
  `inference.endpoints.infer.write`; the Playground needs a token too. A
  fine-grained token with "Make calls to Inference Endpoints" for
  `com-kotobalabs` is needed both for `MODAL_INFERENCE_TOKEN` and for the
  direct checks below.
- **Throughput**: prefill and decode tok/s at a 128k prompt (llama-server
  `/metrics`), then the ubatch decision.
- **The platform proxy's non-streaming timeout.** The authority calls with
  `stream: false` and waits up to 35 min; the platform documents no limit
  (forum reports 120–300 s). A 32k-token answer must be measured; if the
  proxy cuts it, the authority needs streaming.
- **`--reasoning-budget 1024` with `max_tokens 2048`**: `content` non-empty,
  `reasoning_content` ≤ ~1024 tokens.
- **Admitted end-to-end job** through the edge with a provider usage receipt
  (ADR 260914's launch condition, unchanged).

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
