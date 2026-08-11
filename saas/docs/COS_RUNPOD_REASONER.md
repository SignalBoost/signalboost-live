# COS RunPod Independent Reasoner

This setup gives COS an independent open-model reasoner hosted on a RunPod GPU while keeping Anthropic, OpenAI, and Gemini in the explicit external-fallback layer.

## What the startup script does

`saas/scripts/runpod-cos-reasoner.sh` is intentionally self-contained. On every RunPod container start it:

1. Reinstalls Ollama if the ephemeral container reset removed it.
2. Keeps model data under `/workspace/ollama-models` so the large model download survives container resets.
3. Generates a persistent 256-bit API key at `/workspace/cos-api-key` if one does not already exist.
4. Runs Ollama privately on `127.0.0.1:11435`.
5. Pulls `qwen2.5-coder:32b` only when it is not already present.
6. Starts a small authenticated gateway on `0.0.0.0:11434`.
7. Rejects unauthenticated requests with HTTP 401.
8. Verifies authenticated `/v1/models` access and confirms the configured model is served.

The public RunPod HTTP proxy therefore reaches only the authenticated gateway. Ollama itself is not bound to the public interface.

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
LOCAL_AI_ALLOWED_HOSTS=<pod-id>-11434.proxy.runpod.net
LOCAL_AI_API_KEY=<secret from /workspace/cos-api-key>
LOCAL_AI_TIMEOUT_MS=120000
```

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

Expected result:

```json
{
  "ok": true,
  "configured": true,
  "healthy": true,
  "model": "qwen2.5-coder:32b"
}
```

Only after this endpoint is healthy should the COS independence benchmark be rerun.

## Security properties

- Ollama listens only on loopback (`127.0.0.1:11435`).
- RunPod exposes only the authenticated gateway on port `11434`.
- The gateway accepts the same `Authorization: Bearer` and `x-api-key` headers already sent by `saas/lib/ai/local-inference.ts`.
- The API key persists under `/workspace` with mode `0600`.
- Unauthenticated requests must return HTTP 401.
- COS still requires the remote hostname to be explicitly present in `LOCAL_AI_ALLOWED_HOSTS` and HTTPS for remote inference.
