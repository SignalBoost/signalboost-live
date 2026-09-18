# saas/scripts/cos-university-hf-worker.py
#!/usr/bin/env python3
"""Governed iTMounts Hugging Face Jobs worker wrapper.

The canonical worker keeps the proven preparation implementation in an immutable sibling module,
overrides teacher generation for bounded batched throughput, and overrides training with a versioned
small-batch recipe. Rights, callback signing, model identity, spend authority, independent evaluation,
canary, retention, and promotion remain outside this worker.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any

TEACHER_BATCH_SIZE = 4
TEACHER_MIN_RESPONSE_CHARS = 80
TEACHER_MIN_DATASET_ITEMS = 20
TEACHER_MAX_NEW_TOKENS = 384
TEACHER_RETRY_MAX_NEW_TOKENS = 512

TRAINING_PROFILE = "cos_university_small_batch_training_v2"
TRAINING_SMALL_MAX_ITEMS = 64
TRAINING_MEDIUM_MAX_ITEMS = 128
TRAINING_SMALL_EPOCHS = 3.0
TRAINING_MEDIUM_EPOCHS = 2.0
TRAINING_LARGE_EPOCHS = 1.0
TRAINING_SMALL_GRADIENT_ACCUMULATION = 4
TRAINING_DEFAULT_GRADIENT_ACCUMULATION = 8
TRAINING_LEARNING_RATE = 1e-4
TRAINING_WARMUP_RATIO = 0.10
TRAINING_LR_SCHEDULER = "cosine"
TRAINING_MAX_GRAD_NORM = 1.0
TRAINING_MAX_LENGTH = 2048

BASE_WORKER_FILENAME = "cos-university-hf-worker-base.py"
BASE_WORKER_PATH = Path("/tmp/itmounts_hf_worker_base.py")
BASE_CONTRACT_MARKERS = (
    "partition_manifests_registered",
    "trained_artifact_registered",
    "rollback_artifact_registered",
    "LoraConfig",
    "load_in_4bit=True",
)


def _base_worker_url() -> str:
    current = str(os.environ.get("ITMOUNTS_HF_WORKER_URL") or "").strip()
    if not current.startswith("https://") or not current.endswith("/cos-university-hf-worker.py"):
        raise RuntimeError("worker_base_url_invalid")
    return current.rsplit("/", 1)[0] + "/" + BASE_WORKER_FILENAME


def _load_base_worker():
    urllib.request.urlretrieve(_base_worker_url(), BASE_WORKER_PATH)
    source = BASE_WORKER_PATH.read_text(encoding="utf-8")
    if not all(marker in source for marker in BASE_CONTRACT_MARKERS):
        raise RuntimeError("worker_base_contract_invalid")
    spec = importlib.util.spec_from_file_location("itmounts_hf_worker_base", BASE_WORKER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("worker_base_import_invalid")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _render_chat(tokenizer, messages: list[dict[str, str]]) -> str:
    try:
        return tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except TypeError:
        return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


def _generate_batch(
    base,
    torch,
    tokenizer,
    model,
    items: list[tuple[str, str]],
    system: str,
    max_new_tokens: int,
) -> list[tuple[str, str, int, bool, str]]:
    if not items:
        return []
    rendered = [
        _render_chat(tokenizer, [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ])
        for _, prompt in items
    ]
    try:
        encoded = tokenizer(rendered, return_tensors="pt", padding=True)
        encoded = {key: value.to(model.device) for key, value in encoded.items()}
        input_width = encoded["input_ids"].shape[-1]
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        output: list[tuple[str, str, int, bool, str]] = []
        for index, (prompt_id, prompt) in enumerate(items):
            new_tokens = generated[index][input_width:]
            raw_answer = tokenizer.decode(new_tokens, skip_special_tokens=True)
            hidden_reasoning_present = "<think>" in raw_answer.lower() or "</think>" in raw_answer.lower()
            answer = base.strip_hidden_reasoning(raw_answer)
            output.append((prompt_id, prompt, len(raw_answer), hidden_reasoning_present, answer))
        return output
    except RuntimeError as exc:
        if "out of memory" not in str(exc).lower() or len(items) <= 1:
            raise
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        midpoint = max(1, len(items) // 2)
        return (
            _generate_batch(base, torch, tokenizer, model, items[:midpoint], system, max_new_tokens)
            + _generate_batch(base, torch, tokenizer, model, items[midpoint:], system, max_new_tokens)
        )


def _batched_generate(
    base,
    torch,
    tokenizer,
    model,
    items: list[tuple[str, str]],
    system: str,
    max_new_tokens: int,
) -> list[tuple[str, str, int, bool, str]]:
    output: list[tuple[str, str, int, bool, str]] = []
    for start in range(0, len(items), TEACHER_BATCH_SIZE):
        output.extend(_generate_batch(
            base,
            torch,
            tokenizer,
            model,
            items[start:start + TEACHER_BATCH_SIZE],
            system,
            max_new_tokens,
        ))
    return output


def _safe_drop_sample(
    prompt_id: str,
    reason: str,
    raw_chars: int,
    hidden_reasoning_present: bool,
    answer: str,
) -> dict[str, Any]:
    # Never log raw decoded text: it may contain hidden-reasoning tokens that are deliberately stripped.
    safe_sample = " ".join(answer.split())[:160]
    return {
        "promptId": prompt_id[:80],
        "reason": reason,
        "rawChars": raw_chars,
        "safeChars": len(answer),
        "hiddenReasoningMarker": hidden_reasoning_present,
        "safeSample": safe_sample,
    }


def generate_teacher_dataset(base, envelope: dict[str, Any]) -> None:
    import torch
    from datasets import Dataset
    from huggingface_hub import HfApi
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    teacher = envelope.get("teacher") if isinstance(envelope.get("teacher"), dict) else {}
    student = envelope.get("student") if isinstance(envelope.get("student"), dict) else {}
    prompts = envelope.get("prompts") if isinstance(envelope.get("prompts"), list) else []
    teacher_id = base.clean(teacher.get("modelId"), 240)
    teacher_revision = base.clean(teacher.get("revision"), 40).lower()
    student_id = base.clean(student.get("modelId"), 240)
    student_revision = base.clean(student.get("revision"), 40).lower()
    prompt_set_hash = base.clean(envelope.get("promptSetHash"), 64).lower()
    if (
        not teacher_id
        or not student_id
        or teacher_id == student_id
        or not base.HEX40.match(teacher_revision)
        or not base.HEX40.match(student_revision)
        or base.clean(teacher.get("license"), 80).lower() != "apache-2.0"
        or base.clean(student.get("license"), 80).lower() != "apache-2.0"
        or not base.HEX64.match(prompt_set_hash)
        or envelope.get("trainingRights") != "open_license"
        or envelope.get("studentControlledByBuyer") is not True
        or envelope.get("containsPrivateProductionData") is not False
        or len(prompts) < TEACHER_MIN_DATASET_ITEMS
        or len(prompts) > 256
    ):
        raise RuntimeError("worker_teacher_dataset_contract_invalid")

    normalized_prompts: list[tuple[str, str]] = []
    seen_prompt_ids: set[str] = set()
    for item in prompts:
        if not isinstance(item, dict):
            raise RuntimeError("worker_teacher_prompt_invalid")
        prompt_id = base.clean(item.get("id"), 160)
        prompt = base.clean(item.get("prompt"), 12_000)
        if not prompt_id or not prompt or prompt_id in seen_prompt_ids:
            raise RuntimeError("worker_teacher_prompt_invalid")
        seen_prompt_ids.add(prompt_id)
        normalized_prompts.append((prompt_id, prompt))

    token = os.environ["HF_TOKEN"]
    use_bf16 = bool(torch.cuda.is_available() and torch.cuda.is_bf16_supported())
    compute_dtype = torch.bfloat16 if use_bf16 else torch.float16
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=compute_dtype,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        teacher_id,
        revision=teacher_revision,
        token=token,
        use_fast=True,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"
    model = AutoModelForCausalLM.from_pretrained(
        teacher_id,
        revision=teacher_revision,
        token=token,
        quantization_config=quantization,
        device_map="auto",
        torch_dtype=compute_dtype,
    )
    model.eval()

    system = (
        "You are producing public synthetic supervised training examples for reasoning practice. "
        "Answer the supplied standalone case directly with a concise but complete, self-contained explanation. "
        "Use at least two substantive sentences when the case permits it. Never reveal hidden chain-of-thought or internal scratch work. "
        "Use only facts supplied in the case and general reasoning principles."
    )
    first_pass = _batched_generate(
        base, torch, tokenizer, model, normalized_prompts, system, TEACHER_MAX_NEW_TOKENS
    )
    answers = {prompt_id: answer for prompt_id, _, _, _, answer in first_pass}
    raw_chars_by_id = {prompt_id: raw_chars for prompt_id, _, raw_chars, _, _ in first_pass}
    hidden_reasoning_by_id = {
        prompt_id: hidden_reasoning_present
        for prompt_id, _, _, hidden_reasoning_present, _ in first_pass
    }

    terse = [
        (prompt_id, prompt)
        for prompt_id, prompt, _, _, answer in first_pass
        if len(answer) < TEACHER_MIN_RESPONSE_CHARS
    ]
    if terse:
        retry_system = (
            system
            + " Your previous response to this case was too terse for supervised training. "
              "Give a complete self-contained answer in at least two substantive sentences while remaining concise."
        )
        second_pass = _batched_generate(
            base, torch, tokenizer, model, terse, retry_system, TEACHER_RETRY_MAX_NEW_TOKENS
        )
        for prompt_id, _, raw_chars, hidden_reasoning_present, answer in second_pass:
            raw_chars_by_id[prompt_id] = raw_chars
            hidden_reasoning_by_id[prompt_id] = hidden_reasoning_present
            answers[prompt_id] = answer

    rows: list[dict[str, Any]] = []
    item_hashes: list[str] = []
    drop_counts = {
        "short_answer": 0,
        "empty_after_strip": 0,
        "hidden_reasoning_stripped_below_floor": 0,
        "duplicate": 0,
    }
    drop_sample: dict[str, Any] | None = None

    for prompt_id, prompt in normalized_prompts:
        answer = answers.get(prompt_id, "")
        raw_chars = int(raw_chars_by_id.get(prompt_id, 0))
        hidden_reasoning_present = bool(hidden_reasoning_by_id.get(prompt_id, False))
        if len(answer) < TEACHER_MIN_RESPONSE_CHARS:
            if hidden_reasoning_present and raw_chars >= TEACHER_MIN_RESPONSE_CHARS:
                reason = "hidden_reasoning_stripped_below_floor"
            elif len(answer) == 0:
                reason = "empty_after_strip"
            else:
                reason = "short_answer"
            drop_counts[reason] += 1
            if drop_sample is None:
                drop_sample = _safe_drop_sample(
                    prompt_id,
                    reason,
                    raw_chars,
                    hidden_reasoning_present,
                    answer,
                )
            continue

        text = f"<user>\n{prompt}\n\n<assistant>\n{answer}"
        digest = base.sha256(text)
        if digest in item_hashes:
            drop_counts["duplicate"] += 1
            if drop_sample is None:
                drop_sample = _safe_drop_sample(
                    prompt_id,
                    "duplicate",
                    raw_chars,
                    hidden_reasoning_present,
                    answer,
                )
            continue
        item_hashes.append(digest)
        rows.append({
            "prompt_id": prompt_id,
            "prompt": prompt,
            "response": answer,
            "text": text,
            "messages": [
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": answer},
            ],
            "item_hash": digest,
            "teacher_model": teacher_id,
            "teacher_revision": teacher_revision,
            "student_model": student_id,
            "student_revision": student_revision,
            "training_rights": "open_license",
            "contains_private_production_data": False,
            "prompt_profile": base.clean(envelope.get("promptProfile"), 120),
            "prompt_set_hash": prompt_set_hash,
        })

    yield_diagnostic = {
        "totalPrompts": len(normalized_prompts),
        "survivors": len(rows),
        "yieldPct": round((100.0 * len(rows)) / max(1, len(normalized_prompts)), 2),
        "initialBelowFloor": len(terse),
        "retried": len(terse),
        "drops": drop_counts,
        "sample": drop_sample,
    }
    diagnostic_json = json.dumps(yield_diagnostic, ensure_ascii=True, separators=(",", ":"))
    print(f"itmounts_teacher_yield:{diagnostic_json}", flush=True)

    if len(rows) < TEACHER_MIN_DATASET_ITEMS:
        raise RuntimeError(f"worker_teacher_dataset_too_small:{diagnostic_json}")

    api = HfApi(token=token)
    namespace = api.whoami()["name"]
    candidate_id = base.clean(envelope.get("candidateId"), 200)
    job_id = base.clean(os.environ.get("JOB_ID"), 240)
    if not job_id:
        raise RuntimeError("worker_job_id_missing")
    output_repo = f"{namespace}/itmounts-teacher-{base.sha256(candidate_id + ':' + job_id)[:12]}"
    api.create_repo(output_repo, repo_type="dataset", private=True, exist_ok=True, token=token)
    Dataset.from_list(rows).push_to_hub(output_repo, split="train", private=True, token=token)
    info = api.dataset_info(output_repo, token=token)
    pinned_revision = base.clean(getattr(info, "sha", None), 40).lower()
    if not base.HEX40.match(pinned_revision):
        raise RuntimeError("worker_teacher_dataset_revision_missing")

    source_ref = f"hf://datasets/{output_repo}@{pinned_revision}#train"
    base.callback({
        "claim": "teacher_dataset_registered",
        "candidateId": candidate_id,
        "jobId": job_id,
        "sourceRef": source_ref,
        "teacherOutputItemHashes": item_hashes,
        "promptSetHash": prompt_set_hash,
        "teacherModelId": teacher_id,
        "teacherModelRevision": teacher_revision,
        "studentModelId": student_id,
        "studentModelRevision": student_revision,
        "trainingRights": "open_license",
        "studentControlledByBuyer": True,
        "containsPrivateProductionData": False,
    })


def _training_recipe(training_items: int) -> dict[str, Any]:
    if training_items <= 0:
        raise RuntimeError("worker_training_dataset_empty")
    if training_items <= TRAINING_SMALL_MAX_ITEMS:
        epochs = TRAINING_SMALL_EPOCHS
        gradient_accumulation_steps = TRAINING_SMALL_GRADIENT_ACCUMULATION
    elif training_items <= TRAINING_MEDIUM_MAX_ITEMS:
        epochs = TRAINING_MEDIUM_EPOCHS
        gradient_accumulation_steps = TRAINING_SMALL_GRADIENT_ACCUMULATION
    else:
        epochs = TRAINING_LARGE_EPOCHS
        gradient_accumulation_steps = TRAINING_DEFAULT_GRADIENT_ACCUMULATION
    return {
        "profile": TRAINING_PROFILE,
        "trainingItems": training_items,
        "epochs": epochs,
        "perDeviceTrainBatchSize": 1,
        "gradientAccumulationSteps": gradient_accumulation_steps,
        "learningRate": TRAINING_LEARNING_RATE,
        "warmupRatio": TRAINING_WARMUP_RATIO,
        "lrSchedulerType": TRAINING_LR_SCHEDULER,
        "maxGradNorm": TRAINING_MAX_GRAD_NORM,
        "maxLength": TRAINING_MAX_LENGTH,
        "loraR": 16,
        "loraAlpha": 32,
        "loraDropout": 0.05,
        "targetModules": "all-linear",
    }


def _warmup_arguments(config_cls, recipe: dict[str, Any]) -> dict[str, Any]:
    """Keep the recipe's warmup fraction across trainer versions.

    2026-09-17 16:00 UTC: the unpinned install resolved a transformers/TRL release whose SFTConfig no longer
    accepts ``warmup_ratio`` and every training job exited. When it is absent the same fraction is converted
    to whole optimizer steps, which every release accepts, so the schedule itself is unchanged.
    """
    import inspect
    import math

    ratio = float(recipe["warmupRatio"])
    try:
        parameters = inspect.signature(config_cls.__init__).parameters
    except (TypeError, ValueError):
        parameters = {}
    if "warmup_ratio" in parameters:
        return {"warmup_ratio": ratio}
    per_step = max(1, int(recipe["perDeviceTrainBatchSize"]) * int(recipe["gradientAccumulationSteps"]))
    total_steps = math.ceil(int(recipe["trainingItems"]) / per_step) * math.ceil(float(recipe["epochs"]))
    return {"warmup_steps": max(1, math.ceil(total_steps * ratio)) if ratio > 0 else 0}


def train_student(base, envelope: dict[str, Any]) -> None:
    import torch
    from huggingface_hub import HfApi
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer

    token = os.environ["HF_TOKEN"]
    revision = envelope.get("revision") if isinstance(envelope.get("revision"), dict) else {}
    base_model = base.clean(revision.get("baseModel"), 240)
    dataset_hash = base.clean(revision.get("datasetHash"), 64).lower()
    training_manifest = base.clean(revision.get("trainingManifestHash"), 64).lower()
    holdout_manifest = base.clean(revision.get("holdoutManifestHash"), 64).lower()
    if not base_model or not all(base.HEX64.match(value) for value in (dataset_hash, training_manifest, holdout_manifest)):
        raise RuntimeError("worker_revision_invalid")

    training = base.load_dataset_ref(base.clean(envelope.get("trainingDataRef"), 2000))
    holdout = base.load_dataset_ref(base.clean(envelope.get("holdoutDataRef"), 2000))
    observed_training = base.dataset_item_hashes(training)
    observed_holdout = base.dataset_item_hashes(holdout)
    if base.manifest_hash(observed_training) != training_manifest or base.manifest_hash(observed_holdout) != holdout_manifest:
        raise RuntimeError("worker_partition_manifest_mismatch")

    recipe = _training_recipe(len(training))
    recipe["holdoutItems"] = len(holdout)
    print(f"itmounts_training_profile:{json.dumps(recipe, ensure_ascii=True, separators=(',', ':'))}", flush=True)

    use_bf16 = bool(torch.cuda.is_available() and torch.cuda.is_bf16_supported())
    compute_dtype = torch.bfloat16 if use_bf16 else torch.float16
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=compute_dtype,
    )
    tokenizer = AutoTokenizer.from_pretrained(base_model, token=token, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        token=token,
        quantization_config=quantization,
        device_map="auto",
        torch_dtype=compute_dtype,
    )
    model.config.use_cache = False

    output_dir = Path("/tmp/itmounts-trained-adapter")
    args = SFTConfig(
        output_dir=str(output_dir),
        num_train_epochs=recipe["epochs"],
        per_device_train_batch_size=recipe["perDeviceTrainBatchSize"],
        gradient_accumulation_steps=recipe["gradientAccumulationSteps"],
        learning_rate=recipe["learningRate"],
        **_warmup_arguments(SFTConfig, recipe),
        lr_scheduler_type=recipe["lrSchedulerType"],
        max_grad_norm=recipe["maxGradNorm"],
        logging_steps=10,
        save_strategy="no",
        report_to="none",
        bf16=use_bf16,
        fp16=not use_bf16,
        gradient_checkpointing=True,
        dataset_text_field="text",
        max_length=recipe["maxLength"],
    )
    peft_config = LoraConfig(
        r=recipe["loraR"],
        lora_alpha=recipe["loraAlpha"],
        lora_dropout=recipe["loraDropout"],
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=recipe["targetModules"],
    )
    trainer = SFTTrainer(
        model=model,
        args=args,
        train_dataset=training,
        processing_class=tokenizer,
        peft_config=peft_config,
    )
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    profile_path = output_dir / "itmounts_training_profile.json"
    profile_path.write_text(json.dumps(recipe, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")

    api = HfApi(token=token)
    namespace = api.whoami()["name"]
    candidate_id = base.clean(envelope.get("candidateId"), 200)
    job_id = base.clean(os.environ.get("JOB_ID"), 240)
    output_repo = f"{namespace}/itmounts-student-{base.sha256(candidate_id + ':' + job_id)[:12]}"
    api.create_repo(output_repo, repo_type="model", private=True, exist_ok=True, token=token)
    api.upload_folder(repo_id=output_repo, folder_path=str(output_dir), repo_type="model", token=token)
    info = api.model_info(output_repo, token=token)
    model_revision = base.clean(getattr(info, "sha", None), 120)
    artifact_hash = base.directory_hash(output_dir)
    evidence_ref = f"hf://models/{output_repo}@{model_revision}" if model_revision else f"hf://models/{output_repo}"

    common = {
        "candidateId": candidate_id,
        "jobId": job_id,
        "evidenceRef": evidence_ref,
        "baseModel": base_model,
        "datasetHash": dataset_hash,
        "trainingManifestHash": training_manifest,
        "holdoutManifestHash": holdout_manifest,
        "trainedArtifactId": output_repo,
        "artifactHash": artifact_hash,
        "trainingProfile": TRAINING_PROFILE,
        "trainingRecipe": recipe,
    }
    base.callback({"claim": "trained_artifact_registered", **common})
    base.callback({
        "claim": "rollback_artifact_registered",
        **common,
        "rollbackArtifactRef": f"hf://models/{base_model}",
    })


def main() -> int:
    base = _load_base_worker()
    base.generate_teacher_dataset = lambda envelope: generate_teacher_dataset(base, envelope)
    base.train = lambda envelope: train_student(base, envelope)
    return int(base.main())


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"itmounts_hf_worker_error:{type(exc).__name__}:{exc}", file=sys.stderr, flush=True)
        raise
