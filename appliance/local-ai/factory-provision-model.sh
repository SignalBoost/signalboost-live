#!/usr/bin/env bash
set -euo pipefail

# Factory-only model provisioning. The customer appliance runtime is configured offline.
# Required:
#   MODEL_REPO       Hugging Face model repository
#   MODEL_REVISION   immutable commit SHA or approved tag
# Optional:
#   MODEL_DIR        destination (default /opt/signalboost/models/primary)
#   HF_TOKEN         required for gated repositories such as Meta Llama
#   INCLUDE_GLOB     download only matching files (for an approved GGUF artifact, for example)

MODEL_REPO="${MODEL_REPO:?MODEL_REPO is required}"
MODEL_REVISION="${MODEL_REVISION:?MODEL_REVISION is required; pin an immutable revision}"
MODEL_DIR="${MODEL_DIR:-/opt/signalboost/models/primary}"
INCLUDE_GLOB="${INCLUDE_GLOB:-}"

if ! command -v hf >/dev/null 2>&1; then
  echo "ERROR: Hugging Face 'hf' CLI is required during factory provisioning." >&2
  exit 1
fi

install -d -m 0750 "$MODEL_DIR"

args=(download "$MODEL_REPO" --revision "$MODEL_REVISION" --local-dir "$MODEL_DIR")
if [[ -n "$INCLUDE_GLOB" ]]; then
  args+=(--include "$INCLUDE_GLOB")
fi

# hf automatically consumes HF_TOKEN when provided. Never write it into the appliance image.
hf "${args[@]}"

# Remove Hub metadata that is unnecessary for air-gapped inference.
rm -rf "$MODEL_DIR/.cache/huggingface" || true

# Produce a factory integrity manifest. Verification can be repeated before shipment/boot.
(
  cd "$MODEL_DIR"
  find . -type f ! -name SHA256SUMS -print0 \
    | sort -z \
    | xargs -0 sha256sum > SHA256SUMS
)

cat > "$MODEL_DIR/SIGNALBOOST_MODEL_MANIFEST" <<EOF
repo=$MODEL_REPO
revision=$MODEL_REVISION
provisioned_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

chmod -R go-w "$MODEL_DIR"

echo "Provisioned $MODEL_REPO@$MODEL_REVISION into $MODEL_DIR"
echo "Runtime may now operate with HF_HUB_OFFLINE=1 and TRANSFORMERS_OFFLINE=1."
