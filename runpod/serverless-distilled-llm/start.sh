#!/usr/bin/env bash
set -euo pipefail

BASE_MODEL_ID="${ITMOUNTS_BASE_MODEL_ID:-Qwen/Qwen3-4B}"
BASE_MODEL_REVISION="${ITMOUNTS_BASE_MODEL_REVISION:-1cfa9a7208912126459214e8b04321603b3df60c}"
ADAPTER_MODEL_ID="${ITMOUNTS_ADAPTER_MODEL_ID:-cadomos/itmounts-student-f993a365a01e}"
ADAPTER_MODEL_REVISION="${ITMOUNTS_ADAPTER_MODEL_REVISION:-9f03387d87de550b96d973f9f30a3f02e783997e}"
SERVED_ADAPTER_NAME="${ITMOUNTS_DISTILLED_MODEL_NAME:-itmounts-distilled-reasoning-v1}"
BASE_DIR=/models/base
ADAPTER_DIR=/models/adapter

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo '[itmounts-distilled] HF_TOKEN is required for the private adapter' >&2
  exit 1
fi

mkdir -p "$BASE_DIR" "$ADAPTER_DIR" "${HF_HOME:-/models/hf-cache}"

python3 - <<'PY'
import os
from huggingface_hub import snapshot_download

token = os.environ['HF_TOKEN']
snapshot_download(
    repo_id=os.environ.get('ITMOUNTS_BASE_MODEL_ID', 'Qwen/Qwen3-4B'),
    revision=os.environ.get('ITMOUNTS_BASE_MODEL_REVISION', '1cfa9a7208912126459214e8b04321603b3df60c'),
    local_dir='/models/base',
    token=token,
)
snapshot_download(
    repo_id=os.environ.get('ITMOUNTS_ADAPTER_MODEL_ID', 'cadomos/itmounts-student-f993a365a01e'),
    revision=os.environ.get('ITMOUNTS_ADAPTER_MODEL_REVISION', '9f03387d87de550b96d973f9f30a3f02e783997e'),
    local_dir='/models/adapter',
    token=token,
)
PY

LORA_JSON="{\"name\":\"${SERVED_ADAPTER_NAME}\",\"path\":\"${ADAPTER_DIR}\",\"base_model_name\":\"${BASE_MODEL_ID}\"}"

echo "[itmounts-distilled] serving ${SERVED_ADAPTER_NAME} on exact base ${BASE_MODEL_ID}@${BASE_MODEL_REVISION} with adapter ${ADAPTER_MODEL_ID}@${ADAPTER_MODEL_REVISION}"

exec vllm serve "$BASE_DIR" \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --served-model-name "$BASE_MODEL_ID" \
  --enable-lora \
  --max-lora-rank 16 \
  --max-loras 1 \
  --max-cpu-loras 1 \
  --lora-modules "$LORA_JSON" \
  --gpu-memory-utilization 0.85 \
  --max-model-len 16384 \
  --dtype auto
