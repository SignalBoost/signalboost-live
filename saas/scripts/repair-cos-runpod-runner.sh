#!/usr/bin/env bash
set -euo pipefail

# Repairs a COS RunPod whose Ollama API is reachable but whose llama-server dies on completion.
# This persists conservative Ollama memory settings under /workspace and then proves a real
# completion works before reporting success. It never prints the COS API key.

WORKSPACE="${COS_REASONER_WORKSPACE:-/workspace}"
MODEL="${COS_REASONER_MODEL:-qwen2.5-coder:32b}"
CONTEXT_LENGTH="${COS_REASONER_CONTEXT_LENGTH:-16384}"
NUM_PARALLEL="${COS_REASONER_NUM_PARALLEL:-1}"
MAX_LOADED_MODELS="${COS_REASONER_MAX_LOADED_MODELS:-2}"
FLASH_ATTENTION="${COS_REASONER_FLASH_ATTENTION:-1}"
KEY_FILE="${COS_REASONER_KEY_FILE:-$WORKSPACE/cos-api-key}"
BOOTSTRAP="$WORKSPACE/run-cos-reasoner.sh"
WRAPPER="$WORKSPACE/cos-runpod-reasoner.sh"
OLLAMA_LOG="$WORKSPACE/cos-ollama.log"
BOOTSTRAP_URL="https://raw.githubusercontent.com/SignalBoost/signalboost-live/main/saas/scripts/runpod-cos-reasoner.sh"

for pair in \
  "COS_REASONER_CONTEXT_LENGTH:$CONTEXT_LENGTH" \
  "COS_REASONER_NUM_PARALLEL:$NUM_PARALLEL" \
  "COS_REASONER_MAX_LOADED_MODELS:$MAX_LOADED_MODELS"; do
  name="${pair%%:*}"
  value="${pair#*:}"
  if ! [[ "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "ERROR: $name must be a positive integer; got '$value'." >&2
    exit 2
  fi
done

if [[ "$FLASH_ATTENTION" != "0" && "$FLASH_ATTENTION" != "1" ]]; then
  echo "ERROR: COS_REASONER_FLASH_ATTENTION must be 0 or 1." >&2
  exit 2
fi

mkdir -p "$WORKSPACE"
umask 077

echo "[cos-runpod-repair] Installing the current repository bootstrap..."
tmp_bootstrap="$(mktemp "$WORKSPACE/run-cos-reasoner.XXXXXX")"
trap 'rm -f "$tmp_bootstrap" "${SMOKE_BODY_FILE:-}"' EXIT
curl -fsSL "$BOOTSTRAP_URL" -o "$tmp_bootstrap"
chmod 700 "$tmp_bootstrap"
mv "$tmp_bootstrap" "$BOOTSTRAP"

# The RunPod cold-start contract prefers /workspace/cos-runpod-reasoner.sh. Keep this small wrapper
# persistent so every future restart receives the same bounded-memory settings before the standard
# repository bootstrap launches Ollama.
cat > "$WRAPPER" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
export OLLAMA_CONTEXT_LENGTH="${COS_REASONER_CONTEXT_LENGTH:-16384}"
export OLLAMA_NUM_PARALLEL="${COS_REASONER_NUM_PARALLEL:-1}"
export OLLAMA_MAX_LOADED_MODELS="${COS_REASONER_MAX_LOADED_MODELS:-2}"
export OLLAMA_FLASH_ATTENTION="${COS_REASONER_FLASH_ATTENTION:-1}"
exec /workspace/run-cos-reasoner.sh
WRAPPER
chmod 700 "$WRAPPER"

export COS_REASONER_MODEL="$MODEL"
export COS_REASONER_CONTEXT_LENGTH="$CONTEXT_LENGTH"
export COS_REASONER_NUM_PARALLEL="$NUM_PARALLEL"
export COS_REASONER_MAX_LOADED_MODELS="$MAX_LOADED_MODELS"
export COS_REASONER_FLASH_ATTENTION="$FLASH_ATTENTION"

echo "[cos-runpod-repair] Restarting Ollama with model=$MODEL context=$CONTEXT_LENGTH parallel=$NUM_PARALLEL max_loaded=$MAX_LOADED_MODELS flash_attention=$FLASH_ATTENTION..."
"$WRAPPER"

if [[ ! -s "$KEY_FILE" ]]; then
  echo "ERROR: expected COS API key at $KEY_FILE after bootstrap." >&2
  exit 1
fi

auth_key="$(cat "$KEY_FILE")"
payload="$(python3 - "$MODEL" <<'PY'
import json, sys
print(json.dumps({
    "model": sys.argv[1],
    "max_tokens": 16,
    "temperature": 0,
    "messages": [{"role": "user", "content": "Reply with the single word: ready"}],
}))
PY
)"
SMOKE_BODY_FILE="$(mktemp "$WORKSPACE/cos-smoke.XXXXXX")"
status="$(curl -sS -o "$SMOKE_BODY_FILE" -w '%{http_code}' --max-time 90 \
  -H "x-api-key: $auth_key" \
  -H 'Content-Type: application/json' \
  --data "$payload" \
  http://127.0.0.1:11434/v1/chat/completions || true)"

if [[ "$status" != "200" ]]; then
  echo "[cos-runpod-repair] ERROR: real completion returned HTTP $status." >&2
  cat "$SMOKE_BODY_FILE" >&2 || true
  echo >&2
  echo "[cos-runpod-repair] Ollama process state:" >&2
  OLLAMA_HOST='127.0.0.1:11435' ollama ps >&2 || true
  echo "[cos-runpod-repair] GPU state:" >&2
  nvidia-smi >&2 || true
  echo "[cos-runpod-repair] Last Ollama log lines:" >&2
  tail -n 120 "$OLLAMA_LOG" >&2 || true
  exit 1
fi

if ! python3 - "$SMOKE_BODY_FILE" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)
text = (((payload.get('choices') or [{}])[0].get('message') or {}).get('content') or '').strip()
if not text:
    raise SystemExit(1)
PY
then
  echo "[cos-runpod-repair] ERROR: HTTP 200 returned no completion text." >&2
  cat "$SMOKE_BODY_FILE" >&2 || true
  exit 1
fi

rm -f "$SMOKE_BODY_FILE"
SMOKE_BODY_FILE=""

echo "[cos-runpod-repair] SUCCESS: the reasoner completed a real generation request."
echo "[cos-runpod-repair] The persistent wrapper is $WRAPPER and will preserve the memory guardrails on future cold starts."
