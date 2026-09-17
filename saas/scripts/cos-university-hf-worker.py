#!/usr/bin/env python3
"""Governed iTMounts Hugging Face Jobs worker wrapper.

Training profile v3 deliberately changes only the small-dataset learning recipe after Production
independent evaluation showed a 44-source Computer Science & Coding artifact tied its Qwen3-4B
baseline at 0.90 while safety, unseen transfer, and delayed retention all passed. The proven v2
teacher generation, preparation, artifact registration, rollback, rights, and hidden-reasoning
controls remain pinned and reused unchanged.

This is an experiment in model learning quality, not an authority expansion. Provider spend,
campaign authorization, independent evaluation, canary, promotion, and Production traffic remain
outside this worker exactly as before.
"""

from __future__ import annotations

import importlib.util
import sys
import urllib.request
from pathlib import Path
from typing import Any

TRAINING_PROFILE = "cos_university_small_batch_training_v3"
TRAINING_SMALL_MAX_ITEMS = 64
TRAINING_MEDIUM_MAX_ITEMS = 128
TRAINING_SMALL_EPOCHS = 4.0
TRAINING_MEDIUM_EPOCHS = 2.0
TRAINING_LARGE_EPOCHS = 1.0
TRAINING_SMALL_GRADIENT_ACCUMULATION = 4
TRAINING_DEFAULT_GRADIENT_ACCUMULATION = 8
TRAINING_SMALL_LEARNING_RATE = 7.5e-5
TRAINING_DEFAULT_LEARNING_RATE = 1e-4
TRAINING_WARMUP_RATIO = 0.10
TRAINING_LR_SCHEDULER = "cosine"
TRAINING_MAX_GRAD_NORM = 1.0
TRAINING_MAX_LENGTH = 2048
TRAINING_SMALL_LORA_R = 32
TRAINING_SMALL_LORA_ALPHA = 64
TRAINING_DEFAULT_LORA_R = 16
TRAINING_DEFAULT_LORA_ALPHA = 32
TRAINING_LORA_DROPOUT = 0.05

# Pin the previously proven wrapper so profile v3 isolates only the training recipe. Updating this
# reference is an explicit code review event rather than an implicit dependency on mutable main.
V2_WORKER_COMMIT = "46e7c753380f926a994dad07534e8f2a4273e739"
V2_WORKER_URL = (
    "https://raw.githubusercontent.com/SignalBoost/signalboost-live/"
    f"{V2_WORKER_COMMIT}/saas/scripts/cos-university-hf-worker.py"
)
V2_WORKER_PATH = Path("/tmp/itmounts_hf_worker_v2.py")


def _load_v2_worker():
    urllib.request.urlretrieve(V2_WORKER_URL, V2_WORKER_PATH)
    source = V2_WORKER_PATH.read_text(encoding="utf-8")
    required = (
        'TRAINING_PROFILE = "cos_university_small_batch_training_v2"',
        "def _training_recipe(training_items: int)",
        "def train_student(base, envelope",
        "def generate_teacher_dataset(base, envelope",
        '"trained_artifact_registered"',
        '"rollback_artifact_registered"',
    )
    if not all(marker in source for marker in required):
        raise RuntimeError("worker_v2_contract_invalid")
    spec = importlib.util.spec_from_file_location("itmounts_hf_worker_v2", V2_WORKER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("worker_v2_import_invalid")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _training_recipe(training_items: int) -> dict[str, Any]:
    if training_items <= 0:
        raise RuntimeError("worker_training_dataset_empty")
    small = training_items <= TRAINING_SMALL_MAX_ITEMS
    if small:
        epochs = TRAINING_SMALL_EPOCHS
        gradient_accumulation_steps = TRAINING_SMALL_GRADIENT_ACCUMULATION
        learning_rate = TRAINING_SMALL_LEARNING_RATE
        lora_r = TRAINING_SMALL_LORA_R
        lora_alpha = TRAINING_SMALL_LORA_ALPHA
    elif training_items <= TRAINING_MEDIUM_MAX_ITEMS:
        epochs = TRAINING_MEDIUM_EPOCHS
        gradient_accumulation_steps = TRAINING_SMALL_GRADIENT_ACCUMULATION
        learning_rate = TRAINING_DEFAULT_LEARNING_RATE
        lora_r = TRAINING_DEFAULT_LORA_R
        lora_alpha = TRAINING_DEFAULT_LORA_ALPHA
    else:
        epochs = TRAINING_LARGE_EPOCHS
        gradient_accumulation_steps = TRAINING_DEFAULT_GRADIENT_ACCUMULATION
        learning_rate = TRAINING_DEFAULT_LEARNING_RATE
        lora_r = TRAINING_DEFAULT_LORA_R
        lora_alpha = TRAINING_DEFAULT_LORA_ALPHA
    return {
        "profile": TRAINING_PROFILE,
        "trainingItems": training_items,
        "epochs": epochs,
        "perDeviceTrainBatchSize": 1,
        "gradientAccumulationSteps": gradient_accumulation_steps,
        "learningRate": learning_rate,
        "warmupRatio": TRAINING_WARMUP_RATIO,
        "lrSchedulerType": TRAINING_LR_SCHEDULER,
        "maxGradNorm": TRAINING_MAX_GRAD_NORM,
        "maxLength": TRAINING_MAX_LENGTH,
        "loraR": lora_r,
        "loraAlpha": lora_alpha,
        "loraDropout": TRAINING_LORA_DROPOUT,
        "targetModules": "all-linear",
    }


def main() -> int:
    v2 = _load_v2_worker()
    # v2 train_student resolves these globals at call time, so this preserves all surrounding worker
    # contracts while replacing only the versioned training recipe and artifact profile identifier.
    v2.TRAINING_PROFILE = TRAINING_PROFILE
    v2._training_recipe = _training_recipe
    return int(v2.main())


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"itmounts_hf_worker_error:{type(exc).__name__}:{exc}", file=sys.stderr, flush=True)
        raise
