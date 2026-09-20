# COS RunPod llama-server recovery

Use this only when the RunPod endpoint and model list are reachable but a real completion fails with an error such as `llama-server process has terminated: signal: killed`.

The repair script installs the current standard reasoner bootstrap, persists conservative Ollama runtime guardrails under `/workspace`, restarts the reasoner, and performs a real authenticated completion smoke test before reporting success. It never prints the API key.

From a RunPod terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/SignalBoost/signalboost-live/main/saas/scripts/repair-cos-runpod-runner.sh -o /workspace/repair-cos-runpod-runner.sh \
  && chmod 700 /workspace/repair-cos-runpod-runner.sh \
  && COS_REASONER_MODEL=qwen2.5-coder:32b /workspace/repair-cos-runpod-runner.sh
```

Default guardrails:

- context length: 16384
- parallel model requests: 1
- maximum loaded models: 2
- flash attention: enabled

The persistent wrapper is `/workspace/cos-runpod-reasoner.sh`, which the existing RunPod cold-start contract already prefers. The settings therefore survive future container restarts.

A successful repair ends with:

```text
[cos-runpod-repair] SUCCESS: the reasoner completed a real generation request.
```

If the smoke test still fails, the script prints the HTTP response, `ollama ps`, `nvidia-smi`, and the last Ollama log lines so the remaining failure can be diagnosed from evidence rather than from the model-list health check.
