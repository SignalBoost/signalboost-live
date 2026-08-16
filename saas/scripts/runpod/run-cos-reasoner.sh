#!/usr/bin/env bash
set -euo pipefail

REASONER_MODEL="${COS_REASONER_MODEL:-qwen2.5-coder:32b}"
EMBEDDING_MODEL="${COS_EMBEDDING_MODEL:-nomic-embed-text}"
OLLAMA_HOST_VALUE="${OLLAMA_HOST:-0.0.0.0:8000}"
OLLAMA_MODELS_VALUE="${OLLAMA_MODELS:-/workspace/.ollama/models}"
OLLAMA_LOG="${COS_OLLAMA_LOG:-/workspace/cos-ollama.log}"

export OLLAMA_HOST="$OLLAMA_HOST_VALUE"
export OLLAMA_MODELS="$OLLAMA_MODELS_VALUE"

mkdir -p "$OLLAMA_MODELS" "$(dirname "$OLLAMA_LOG")"

if ! command -v curl >/dev/null 2>&1; then
  echo "COS RunPod bootstrap requires curl" >&2
  exit 69
fi

if ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama for the COS local reasoner"
  curl -fsSL https://ollama.com/install.sh | sh
fi

if ! pgrep -f '[o]llama serve' >/dev/null 2>&1; then
  echo "Starting Ollama on $OLLAMA_HOST"
  nohup ollama serve >"$OLLAMA_LOG" 2>&1 &
fi

health_url="http://127.0.0.1:${OLLAMA_HOST##*:}/api/tags"
for _ in $(seq 1 90); do
  if curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
  echo "COS local reasoner did not become healthy" >&2
  tail -n 100 "$OLLAMA_LOG" >&2 || true
  exit 70
fi

ensure_model() {
  local model="$1"
  if ollama list | awk 'NR > 1 { print $1 }' | grep -Fxq "$model"; then
    return 0
  fi
  echo "Pulling COS model $model"
  ollama pull "$model"
}

ensure_model "$REASONER_MODEL"
ensure_model "$EMBEDDING_MODEL"

echo "COS RunPod reasoner ready: reasoner=$REASONER_MODEL embedding=$EMBEDDING_MODEL host=$OLLAMA_HOST"
