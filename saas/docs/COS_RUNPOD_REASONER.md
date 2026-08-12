# COS RunPod Independent Reasoner

This setup gives COS an independent open-model reasoner hosted on a RunPod GPU while keeping Anthropic, OpenAI, and Gemini in the explicit external-fallback layer. The same secured Ollama pod also serves the local embedding model used by COS semantic cache.

## What the startup script does

`saas/scripts/runpod-cos-reasoner.sh` is intentionally self-contained. On every RunPod container start it:

1. Reinstalls Ollama if the ephemeral container reset removed it.
2. Keeps model data under `/workspace/ollama-models` so model downloads survive container resets.
3. Generates a persistent 256-bit API key at `/workspace/cos-api-key` if one does not already exist.
4. Runs Ollama privately on `127.0.0.1:11435`.
5. Pulls `qwen2.5-coder:32b` only when it is not already present.
6. Pulls `nomic-embed-text` only when it is not already present; this is the default 768-dimension semantic-cache embedding model.
7. Starts a small authenticated gateway on `0.0.0.0:11434`.
8. Rejects unauthenticated requests with HTTP 401.
9. Verifies authenticated `/v1/models` access and confirms the configured reasoner is served.

The public RunPod HTTP proxy therefore reaches only the authenticated gateway. Ollama itself is not bound to the public interface.

## Semantic-cache model self-heal

The production semantic-cache client also protects against an older or manually-started pod that serves Qwen but does not yet have the configured embedding model.

When the secured RunPod endpoint returns HTTP 404 naming the configured embedding model as missing, `saas/lib/ai/cos/localEmbeddings.ts` performs one authenticated Ollama `/api/pull` for that exact model and retries the embedding request once. The repair is narrow and bounded:

- it triggers only for the configured missing embedding model;
- by default it is enabled only for the HTTPS `*.proxy.runpod.net/v1` endpoint shape used by COS;
- `LOCAL_AI_EMBEDDING_AUTO_REPAIR=false` disables it;
- `LOCAL_AI_EMBEDDING_PULL_TIMEOUT_MS` controls the pull budget, capped at 90 seconds;
- a failed pull enters a short process-local cooldown so every request does not stall on the same failure;
- no external AI provider is involved.

This closes the gap where a pod resumed successfully and Qwen was healthy while semantic-cache reads/writes silently failed because `nomic-embed-text` had never been pulled on that pod.

## RunPod pod configuration

Expose these HTTP ports in the pod:

```text
8888,11434
```

Port `8888` is Jupyter. Port `11434` is the authenticated COS reasoner gateway.

The persistent volume should include `/workspace`.

## One-command startup

After the script is available on `main`, run this in a RunPod Jupyter terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/SignalBoost/signalboost-live/main/saas/scripts/runpod-cos-reasoner.sh -o /workspace/run-cos-reasoner.sh \
  && chmod 700 /workspace/run-cos-reasoner.sh \
  && /workspace/run-cos-reasoner.sh
```

If the repository is not anonymously readable from RunPod, copy the script into `/workspace/run-cos-reasoner.sh` through an authenticated repository workflow instead. Do not put GitHub tokens in the command line or in this document.

The final output should contain:

```text
[cos-runpod] COS independent reasoner is READY.
```

## Vercel environment variables

For a RunPod proxy URL shaped like:

```text
https://<pod-id>-11434.proxy.runpod.net
```

configure Vercel Production and Preview with:

```text
LOCAL_AI_BASE_URL=https://<pod-id>-11434.proxy.runpod.net/v1
LOCAL_AI_MODEL=qwen2.5-coder:32b
LOCAL_AI_EMBEDDING_MODEL=nomic-embed-text
LOCAL_AI_ALLOWED_HOSTS=<pod-id>-11434.proxy.runpod.net
LOCAL_AI_API_KEY=<secret from /workspace/cos-api-key>
LOCAL_AI_TIMEOUT_MS=120000
```

`LOCAL_AI_EMBEDDING_MODEL` may be omitted when using the default `nomic-embed-text`. A different embedding model is not a drop-in configuration change unless its real output dimension matches the current `vector(768)` semantic-cache schema; otherwise the pgvector column and matching RPC must be migrated together.

Generate or read the secret only inside RunPod and paste it directly into Vercel. Never put it in chat, GitHub, source code, screenshots, or application logs.

To reveal the existing key locally in the RunPod terminal solely for copying into Vercel:

```bash
cat /workspace/cos-api-key
```

## Health verification

After Vercel redeploys, while logged in as owner open:

```text
/api/admin/cos-reasoner/health
```

The endpoint now treats COS local readiness as a two-part contract:

- `reasonerHealth.healthy` must be `true` for the configured Qwen model;
- `embedding.healthy` must be `true` for the configured semantic-cache embedding model and report 768 dimensions for the default model.

Top-level `healthy` is `true` only when both are healthy. A pod that serves Qwen but is missing `nomic-embed-text` therefore returns HTTP 503 instead of being reported as fully ready.

Only after this endpoint is healthy should the COS independence/cache benchmark be considered fully ready.

## Security properties

- Ollama listens only on loopback (`127.0.0.1:11435`).
- RunPod exposes only the authenticated gateway on port `11434`.
- The gateway accepts the same `Authorization: Bearer` and `x-api-key` headers already sent by `saas/lib/ai/local-inference.ts`.
- Automatic embedding repair uses that same authenticated gateway and only the configured embedding model.
- The API key persists under `/workspace` with mode `0600`.
- Unauthenticated requests must return HTTP 401.
- COS still requires the remote hostname to be explicitly present in `LOCAL_AI_ALLOWED_HOSTS` and HTTPS for remote inference.
