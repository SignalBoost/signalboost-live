#!/usr/bin/env bash
set -euo pipefail

# Converts a factory-downloaded Hugging Face model to high-precision GGUF, then quantizes it.
# This runs only during manufacturing/build preparation; customer runtime remains offline.
#
# Required:
#   SOURCE_MODEL_DIR   local Hugging Face snapshot directory
#   LLAMA_CPP_DIR      pinned llama.cpp checkout/build directory
# Optional:
#   OUTPUT_DIR         output directory (default SOURCE_MODEL_DIR/gguf)
#   QUANT_TYPE         Q4_K_M or Q8_0 (default Q4_K_M)
#   PYTHON             python executable (default python3)

SOURCE_MODEL_DIR="${SOURCE_MODEL_DIR:?SOURCE_MODEL_DIR is required}"
LLAMA_CPP_DIR="${LLAMA_CPP_DIR:?LLAMA_CPP_DIR is required}"
OUTPUT_DIR="${OUTPUT_DIR:-$SOURCE_MODEL_DIR/gguf}"
QUANT_TYPE="${QUANT_TYPE:-Q4_K_M}"
PYTHON="${PYTHON:-python3}"

case "$QUANT_TYPE" in
  Q4_K_M|Q8_0) ;;
  *) echo "ERROR: QUANT_TYPE must be Q4_K_M or Q8_0" >&2; exit 1 ;;
esac

CONVERTER="$LLAMA_CPP_DIR/convert_hf_to_gguf.py"
QUANTIZER="$LLAMA_CPP_DIR/build/bin/llama-quantize"
[[ -f "$CONVERTER" ]] || { echo "ERROR: converter not found: $CONVERTER" >&2; exit 1; }
[[ -x "$QUANTIZER" ]] || { echo "ERROR: quantizer not found: $QUANTIZER" >&2; exit 1; }

mkdir -p "$OUTPUT_DIR"
BASE_GGUF="$OUTPUT_DIR/model-bf16.gguf"
FINAL_GGUF="$OUTPUT_DIR/model-${QUANT_TYPE}.gguf"

"$PYTHON" "$CONVERTER" "$SOURCE_MODEL_DIR" --outfile "$BASE_GGUF" --outtype bf16
"$QUANTIZER" "$BASE_GGUF" "$FINAL_GGUF" "$QUANT_TYPE"

sha256sum "$FINAL_GGUF" > "$FINAL_GGUF.sha256"

# Retain the BF16 conversion only when explicitly requested; it is very large for 70B models.
if [[ "${KEEP_BF16_GGUF:-false}" != "true" ]]; then
  rm -f "$BASE_GGUF"
fi

echo "Created $FINAL_GGUF"
