#!/usr/bin/env python3
"""Governed iTMounts Hugging Face Jobs worker wrapper.

The canonical worker keeps the proven preparation/training implementation in an immutable sibling
module and overrides only teacher generation. The override improves GPU throughput without changing
rights, callback, quality-floor, dataset-minimum, model identity, or spend authority.
"""

from __future__ import annotations

import importlib.util
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


def _generate_batch(base, torch, tokenizer, model, items: list[tuple[str, str]], system: str, max_new_tokens: int) -> list[tuple[str, str, str]]:
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
        output: list[tuple[str, str, str]] = []
        for index, (prompt_id, prompt) in enumerate(items):
            new_tokens = generated[index][input_width:]
            answer = base.strip_hidden_reasoning(tokenizer.decode(new_tokens, skip_special_tokens=True))
            output.append((prompt_id, prompt, answer))
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


def _batched_generate(base, torch, tokenizer, model, items: list[tuple[str, str]], system: str, max_new_tokens: int) -> list[tuple[str, str, str]]:
    output: list[tuple[str, str, str]] = []
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
    answers = {prompt_id: answer for prompt_id, _, answer in first_pass}

    terse = [(prompt_id, prompt) for prompt_id, prompt, answer in first_pass if len(answer) < TEACHER_MIN_RESPONSE_CHARS]
    if terse:
        retry_system = (
            system
            + " Your previous response to this case was too terse for supervised training. "
              "Give a complete self-contained answer in at least two substantive sentences while remaining concise."
        )
        second_pass = _batched_generate(
            base, torch, tokenizer, model, terse, retry_system, TEACHER_RETRY_MAX_NEW_TOKENS
        )
        for prompt_id, _, answer in second_pass:
            answers[prompt_id] = answer

    rows: list[dict[str, Any]] = []
    item_hashes: list[str] = []
    for prompt_id, prompt in normalized_prompts:
        answer = answers.get(prompt_id, "")
        if len(answer) < TEACHER_MIN_RESPONSE_CHARS:
            continue
        text = f"<user>\n{prompt}\n\n<assistant>\n{answer}"
        digest = base.sha256(text)
        if digest in item_hashes:
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

    if len(rows) < TEACHER_MIN_DATASET_ITEMS:
        raise RuntimeError("worker_teacher_dataset_too_small")

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


def main() -> int:
    base = _load_base_worker()
    base.generate_teacher_dataset = lambda envelope: generate_teacher_dataset(base, envelope)
    return int(base.main())


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"itmounts_hf_worker_error:{type(exc).__name__}:{exc}", file=sys.stderr, flush=True)
        raise
