# COS RunPod llama-server recovery

Use this only when the RunPod endpoint and model list are reachable but a real completion fails with an error such as `llama-server process has terminated: signal: killed`.

The governed RunPod startup contract delivers both the standard reasoner bootstrap and the recovery tool through the authenticated iTMounts application route. Recovery never depends on anonymous GitHub access and never overwrites the governed bootstrap.

From a RunPod terminal:

```bash
COS_REASONER_MODEL=qwen3:30b /workspace/repair-cos-runpod-runner.sh
```

If the recovery tool is missing, reapply the Production RunPod startup contract. Do not download repository scripts directly onto the pod.

Default guardrails:

- context length: 16384
- parallel model requests: 1
- maximum loaded models: 2
- flash attention: enabled

The standard bootstrap at `/workspace/cos-runpod-reasoner.sh` now applies the same bounded Ollama guardrails itself, so cold starts and manual recovery use one governed configuration.

A successful repair ends with:

```text
[cos-runpod-repair] SUCCESS: the reasoner completed a real generation request.
```

If the smoke test still fails, the script prints the HTTP response, `ollama ps`, `nvidia-smi`, and the last Ollama log lines so the remaining failure can be diagnosed from evidence rather than from the model-list health check.
