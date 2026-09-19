#!/usr/bin/env python3
"""Governed iTMounts Hugging Face Jobs worker.

This worker executes only the exact host-prepared envelope delivered by the signed COS University
training executor. It never decides that training is authorized. Host approvals, distillation rights,
privacy gates, independent evaluation, canary evidence, retention, and promotion remain outside this
worker.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

HF_REF = re.compile(r"^hf://datasets/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)(?:@([A-Za-z0-9._-]+))?#([A-Za-z0-9_.-]+)$")
HEX64 = re.compile(r"^[a-f0-9]{64}$", re.I)
HEX40 = re.compile(r"^[a-f0-9]{40}$", re.I)


def clean(value: Any, limit: int = 4000) -> str:
    return str(value or "").strip()[:limit]


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def sha256(value: bytes | str) -> str:
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def parse_request() -> dict[str, Any]:
    encoded = clean(os.environ.get("ITMOUNTS_TRAINING_REQUEST_B64"), 2_000_000)
    if not encoded:
        raise RuntimeError("worker_request_missing")
    padding = "=" * (-len(encoded) % 4)
    try:
        raw = base64.urlsafe_b64decode(encoded + padding).decode("utf-8")
        payload = json.loads(raw)
    except Exception as exc:
        raise RuntimeError("worker_request_invalid") from exc
    if not isinstance(payload, dict) or payload.get("authorityExpanded") is not False:
        raise RuntimeError("worker_authority_boundary_invalid")
    return payload


def parse_dataset_ref(value: Any) -> tuple[str, str | None, str]:
    match = HF_REF.match(clean(value, 2000))
    if not match:
        raise RuntimeError("worker_dataset_ref_invalid")
    return match.group(1), match.group(2), match.group(3)


def row_text(row: dict[str, Any]) -> str:
    text = row.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()

    messages = row.get("messages")
    if isinstance(messages, list) and messages:
        rendered = []
        for item in messages:
            if not isinstance(item, dict):
                continue
            role = clean(item.get("role"), 40) or "unknown"
            content = clean(item.get("content"), 200_000)
            if content:
                rendered.append(f"<{role}>\n{content}")
        if rendered:
            return "\n\n".join(rendered)

    prompt = next((clean(row.get(key), 100_000) for key in ("prompt", "instruction", "question", "input") if clean(row.get(key), 100_000)), "")
    answer = next((clean(row.get(key), 100_000) for key in ("response", "answer", "completion", "output", "teacher_answer") if clean(row.get(key), 100_000)), "")
    if prompt and answer:
        return f"<user>\n{prompt}\n\n<assistant>\n{answer}"
    if prompt:
        return prompt
    if answer:
        return answer
    return canonical(row)


def manifest_hash(items: list[str]) -> str:
    return sha256(json.dumps({"items": sorted(items)}, separators=(",", ":")))


def sign_callback(timestamp: str, idempotency_key: str, raw_body: str, secret: str) -> str:
    message = "\n".join((timestamp, idempotency_key, raw_body)).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def callback(payload: dict[str, Any]) -> None:
    from datetime import datetime, timezone

    url = clean(os.environ.get("ITMOUNTS_TRAINING_CALLBACK_URL"), 2000)
    key = clean(os.environ.get("ITMOUNTS_TRAINING_IDEMPOTENCY_KEY"), 256)
    secret = clean(os.environ.get("ITMOUNTS_TRAINING_CALLBACK_SECRET"), 4096)
    if not url.startswith("https://") or not key or len(secret) < 32:
        raise RuntimeError("worker_callback_configuration_invalid")

    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    signature = sign_callback(timestamp, key, raw, secret)
    request = urllib.request.Request(
        url,
        method="POST",
        data=raw.encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-itmounts-training-profile": "cos_university_training_executor_v1",
            "x-itmounts-training-timestamp": timestamp,
            "x-itmounts-training-idempotency-key": key,
            "x-itmounts-training-signature": signature,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            if response.status < 200 or response.status >= 300:
                raise RuntimeError(f"worker_callback_rejected:{response.status}")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"worker_callback_rejected:{exc.code}") from exc


def load_dataset_ref(value: str):
    from datasets import load_dataset

    repo_id, revision, split = parse_dataset_ref(value)
    return load_dataset(repo_id, revision=revision, split=split, token=os.environ["HF_TOKEN"])


def dataset_item_hashes(dataset) -> list[str]:
    return [sha256(clean(row.get("text"), 500_000)) for row in dataset]


def strip_hidden_reasoning(value: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", value, flags=re.I | re.S).strip()
    if "</think>" in text.lower():
        text = re.split(r"</think>", text, flags=re.I)[-1].strip()
    if re.search(r"<think>", text, flags=re.I):
        # An unfinished thinking block means no safe final answer was produced.
        return ""
    return text


def generate_teacher_dataset(envelope: dict[str, Any]) -> None:
    import torch
    from datasets import Dataset
    from huggingface_hub import HfApi
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    teacher = envelope.get("teacher") if isinstance(envelope.get("teacher"), dict) else {}
    student = envelope.get("student") if isinstance(envelope.get("student"), dict) else {}
    prompts = envelope.get("prompts") if isinstance(envelope.get("prompts"), list) else []
    teacher_id = clean(teacher.get("modelId"), 240)
    teacher_revision = clean(teacher.get("revision"), 40).lower()
    student_id = clean(student.get("modelId"), 240)
    student_revision = clean(student.get("revision"), 40).lower()
    prompt_set_hash = clean(envelope.get("promptSetHash"), 64).lower()
    if (
        not teacher_id
        or not student_id
        or teacher_id == student_id
        or not HEX40.match(teacher_revision)
        or not HEX40.match(student_revision)
        or clean(teacher.get("license"), 80).lower() not in {"apache-2.0", "mit"}
        or clean(student.get("license"), 80).lower() != "apache-2.0"
        or not HEX64.match(prompt_set_hash)
        or envelope.get("trainingRights") != "open_license"
        or envelope.get("studentControlledByBuyer") is not True
        or envelope.get("containsPrivateProductionData") is not False
        or len(prompts) < 20
        or len(prompts) > 256
    ):
        raise RuntimeError("worker_teacher_dataset_contract_invalid")

    normalized_prompts: list[tuple[str, str]] = []
    seen_prompt_ids: set[str] = set()
    for item in prompts:
        if not isinstance(item, dict):
            raise RuntimeError("worker_teacher_prompt_invalid")
        prompt_id = clean(item.get("id"), 160)
        prompt = clean(item.get("prompt"), 12_000)
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
    model = AutoModelForCausalLM.from_pretrained(
        teacher_id,
        revision=teacher_revision,
        token=token,
        quantization_config=quantization,
        device_map="auto",
        torch_dtype=compute_dtype,
    )
    model.eval()

    rows: list[dict[str, Any]] = []
    item_hashes: list[str] = []
    system = (
        "You are producing public synthetic supervised training examples for reasoning practice. "
        "Answer the supplied standalone case directly. Never reveal hidden chain-of-thought or internal scratch work. "
        "Use only facts supplied in the case and general reasoning principles."
    )
    for prompt_id, prompt in normalized_prompts:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        try:
            rendered = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
        except TypeError:
            rendered = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)

        encoded = tokenizer(rendered, return_tensors="pt")
        encoded = {key: value.to(model.device) for key, value in encoded.items()}
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=384,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        new_tokens = generated[0][encoded["input_ids"].shape[-1]:]
        answer = strip_hidden_reasoning(tokenizer.decode(new_tokens, skip_special_tokens=True))
        if len(answer) < 80:
            continue
        text = f"<user>\n{prompt}\n\n<assistant>\n{answer}"
        digest = sha256(text)
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
            "prompt_profile": clean(envelope.get("promptProfile"), 120),
            "prompt_set_hash": prompt_set_hash,
        })

    if len(rows) < 20:
        raise RuntimeError("worker_teacher_dataset_too_small")

    api = HfApi(token=token)
    namespace = api.whoami()["name"]
    candidate_id = clean(envelope.get("candidateId"), 200)
    job_id = clean(os.environ.get("JOB_ID"), 240)
    if not job_id:
        raise RuntimeError("worker_job_id_missing")
    output_repo = f"{namespace}/itmounts-teacher-{sha256(candidate_id + ':' + job_id)[:12]}"
    api.create_repo(output_repo, repo_type="dataset", private=True, exist_ok=True, token=token)
    Dataset.from_list(rows).push_to_hub(output_repo, split="train", private=True, token=token)
    info = api.dataset_info(output_repo, token=token)
    pinned_revision = clean(getattr(info, "sha", None), 40).lower()
    if not HEX40.match(pinned_revision):
        raise RuntimeError("worker_teacher_dataset_revision_missing")

    source_ref = f"hf://datasets/{output_repo}@{pinned_revision}#train"
    callback({
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



def materialize_teacher_dataset(envelope: dict[str, Any]) -> None:
    from datasets import Dataset
    from huggingface_hub import HfApi

    teacher = envelope.get("teacher") if isinstance(envelope.get("teacher"), dict) else {}
    student = envelope.get("student") if isinstance(envelope.get("student"), dict) else {}
    examples = envelope.get("examples") if isinstance(envelope.get("examples"), list) else []

    teacher_id = clean(teacher.get("modelId"), 240)
    teacher_revision = clean(teacher.get("revision"), 40).lower()
    teacher_provider = clean(teacher.get("provider"), 80)
    student_id = clean(student.get("modelId"), 240)
    student_revision = clean(student.get("revision"), 40).lower()
    prompt_set_hash = clean(envelope.get("promptSetHash"), 64).lower()
    provider_manifest_hash = clean(envelope.get("providerManifestHash"), 64).lower()

    if (
        not teacher_id
        or not teacher_provider
        or not HEX40.match(teacher_revision)
        or not student_id
        or not HEX40.match(student_revision)
        or clean(student.get("license"), 80).lower() != "apache-2.0"
        or not HEX64.match(prompt_set_hash)
        or not HEX64.match(provider_manifest_hash)
        or envelope.get("trainingRights") != "provider_output_contractually_authorized"
        or envelope.get("studentControlledByBuyer") is not True
        or envelope.get("containsPrivateProductionData") is not False
        or len(examples) < 20
        or len(examples) > 256
    ):
        raise RuntimeError("worker_hosted_teacher_dataset_contract_invalid")

    rows: list[dict[str, Any]] = []
    item_hashes: list[str] = []
    seen_prompt_ids: set[str] = set()
    for item in examples:
        if not isinstance(item, dict):
            raise RuntimeError("worker_hosted_teacher_example_invalid")
        prompt_id = clean(item.get("promptId"), 160)
        prompt = clean(item.get("prompt"), 12_000)
        response = clean(item.get("response"), 20_000)
        response_hash = clean(item.get("responseHash"), 64).lower()
        provider = clean(item.get("provider"), 80)
        model = clean(item.get("model"), 240)
        request_id = clean(item.get("requestId"), 240)
        if (
            not prompt_id
            or prompt_id in seen_prompt_ids
            or not prompt
            or len(response) < 80
            or provider != teacher_provider
            or model != teacher_id
            or not HEX64.match(response_hash)
            or re.search(r"</?think>", response, flags=re.I)
        ):
            raise RuntimeError("worker_hosted_teacher_example_invalid")
        text = f"<user>\n{prompt}\n\n<assistant>\n{response}"
        digest = sha256(text)
        if digest != response_hash:
            raise RuntimeError("worker_hosted_teacher_example_hash_mismatch")
        if digest in item_hashes:
            continue
        seen_prompt_ids.add(prompt_id)
        item_hashes.append(digest)
        rows.append({
            "prompt_id": prompt_id,
            "prompt": prompt,
            "response": response,
            "text": text,
            "messages": [
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": response},
            ],
            "item_hash": digest,
            "teacher_provider": teacher_provider,
            "teacher_model": teacher_id,
            "teacher_revision": teacher_revision,
            "provider_request_id": request_id or None,
            "student_model": student_id,
            "student_revision": student_revision,
            "training_rights": "provider_output_contractually_authorized",
            "contains_private_production_data": False,
            "prompt_profile": clean(envelope.get("promptProfile"), 120),
            "prompt_set_hash": prompt_set_hash,
            "provider_manifest_hash": provider_manifest_hash,
        })

    if len(rows) < 20:
        raise RuntimeError("worker_hosted_teacher_dataset_too_small")

    token = os.environ["HF_TOKEN"]
    api = HfApi(token=token)
    namespace = api.whoami()["name"]
    candidate_id = clean(envelope.get("candidateId"), 200)
    job_id = clean(os.environ.get("JOB_ID"), 240)
    if not candidate_id or not job_id:
        raise RuntimeError("worker_hosted_teacher_identity_missing")
    output_repo = f"{namespace}/itmounts-teacher-{sha256(candidate_id + ':' + job_id)[:12]}"
    api.create_repo(output_repo, repo_type="dataset", private=True, exist_ok=True, token=token)
    Dataset.from_list(rows).push_to_hub(output_repo, split="train", private=True, token=token)
    info = api.dataset_info(output_repo, token=token)
    pinned_revision = clean(getattr(info, "sha", None), 40).lower()
    if not HEX40.match(pinned_revision):
        raise RuntimeError("worker_hosted_teacher_dataset_revision_missing")

    source_ref = f"hf://datasets/{output_repo}@{pinned_revision}#train"
    callback({
        "claim": "teacher_dataset_registered",
        "candidateId": candidate_id,
        "jobId": job_id,
        "sourceRef": source_ref,
        "teacherOutputItemHashes": item_hashes,
        "promptSetHash": prompt_set_hash,
        "teacherModelId": teacher_id,
        "teacherModelRevision": teacher_revision,
        "teacherProvider": teacher_provider,
        "teacherProviderManifestHash": provider_manifest_hash,
        "studentModelId": student_id,
        "studentModelRevision": student_revision,
        "trainingRights": "provider_output_contractually_authorized",
        "studentControlledByBuyer": True,
        "containsPrivateProductionData": False,
    })


def prepare_dataset(envelope: dict[str, Any]) -> None:
    from datasets import Dataset, DatasetDict, load_dataset
    from huggingface_hub import HfApi

    candidate = envelope.get("candidate") if isinstance(envelope.get("candidate"), dict) else {}
    repo_id, revision, split = parse_dataset_ref(candidate.get("source"))
    token = os.environ["HF_TOKEN"]
    source = load_dataset(repo_id, revision=revision, split=split, token=token)
    max_items = max(20, min(20_000, int(os.environ.get("ITMOUNTS_HF_MAX_DATASET_ITEMS", "5000"))))
    source = source.select(range(min(len(source), max_items)))

    by_hash: dict[str, str] = {}
    for raw_row in source:
        if not isinstance(raw_row, dict):
            continue
        text = row_text(raw_row)
        if not text:
            continue
        by_hash.setdefault(sha256(text), text)
    if len(by_hash) < 20:
        raise RuntimeError("worker_dataset_too_small")

    ordered = sorted(by_hash.items(), key=lambda item: item[0])
    holdout_count = max(1, min(len(ordered) // 5, 500))
    holdout_pairs = ordered[:holdout_count]
    training_pairs = ordered[holdout_count:]
    if not training_pairs or not holdout_pairs:
        raise RuntimeError("worker_partition_invalid")

    training = Dataset.from_list([{"text": text, "item_hash": digest} for digest, text in training_pairs])
    holdout = Dataset.from_list([{"text": text, "item_hash": digest} for digest, text in holdout_pairs])

    api = HfApi(token=token)
    namespace = api.whoami()["name"]
    candidate_id = clean(envelope.get("candidateId"), 200)
    output_repo = f"{namespace}/itmounts-training-{sha256(candidate_id)[:12]}"
    api.create_repo(output_repo, repo_type="dataset", private=True, exist_ok=True, token=token)
    DatasetDict({"train": training, "holdout": holdout}).push_to_hub(output_repo, private=True, token=token)
    info = api.dataset_info(output_repo, token=token)
    pinned_revision = clean(getattr(info, "sha", None), 120)
    if not pinned_revision:
        raise RuntimeError("worker_dataset_revision_missing")

    job_id = clean(os.environ.get("JOB_ID"), 240)
    dataset_hash = clean(envelope.get("datasetHash"), 64).lower()
    base_model = clean(envelope.get("baseModel"), 240)
    if not HEX64.match(dataset_hash) or not base_model:
        raise RuntimeError("worker_dataset_identity_invalid")

    callback({
        "claim": "partition_manifests_registered",
        "candidateId": candidate_id,
        "jobId": job_id,
        "evidenceRef": f"hf://datasets/{output_repo}@{pinned_revision}",
        "baseModel": base_model,
        "datasetHash": dataset_hash,
        "trainingItemHashes": [digest for digest, _ in training_pairs],
        "holdoutItemHashes": [digest for digest, _ in holdout_pairs],
        "trainingDataRef": f"hf://datasets/{output_repo}@{pinned_revision}#train",
        "holdoutDataRef": f"hf://datasets/{output_repo}@{pinned_revision}#holdout",
    })


def directory_hash(path: Path) -> str:
    digest = hashlib.sha256()
    for file in sorted(p for p in path.rglob("*") if p.is_file()):
        digest.update(str(file.relative_to(path)).encode("utf-8"))
        with file.open("rb") as handle:
            while True:
                block = handle.read(1024 * 1024)
                if not block:
                    break
                digest.update(block)
    return digest.hexdigest()


def train(envelope: dict[str, Any]) -> None:
    import torch
    from huggingface_hub import HfApi
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer

    token = os.environ["HF_TOKEN"]
    revision = envelope.get("revision") if isinstance(envelope.get("revision"), dict) else {}
    base_model = clean(revision.get("baseModel"), 240)
    dataset_hash = clean(revision.get("datasetHash"), 64).lower()
    training_manifest = clean(revision.get("trainingManifestHash"), 64).lower()
    holdout_manifest = clean(revision.get("holdoutManifestHash"), 64).lower()
    if not base_model or not all(HEX64.match(value) for value in (dataset_hash, training_manifest, holdout_manifest)):
        raise RuntimeError("worker_revision_invalid")

    training = load_dataset_ref(clean(envelope.get("trainingDataRef"), 2000))
    holdout = load_dataset_ref(clean(envelope.get("holdoutDataRef"), 2000))
    observed_training = dataset_item_hashes(training)
    observed_holdout = dataset_item_hashes(holdout)
    if manifest_hash(observed_training) != training_manifest or manifest_hash(observed_holdout) != holdout_manifest:
        raise RuntimeError("worker_partition_manifest_mismatch")

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
        num_train_epochs=1,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=2e-4,
        logging_steps=10,
        save_strategy="no",
        report_to="none",
        bf16=use_bf16,
        fp16=not use_bf16,
        gradient_checkpointing=True,
        dataset_text_field="text",
        max_length=2048,
    )
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules="all-linear",
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

    api = HfApi(token=token)
    namespace = api.whoami()["name"]
    candidate_id = clean(envelope.get("candidateId"), 200)
    job_id = clean(os.environ.get("JOB_ID"), 240)
    output_repo = f"{namespace}/itmounts-student-{sha256(candidate_id + ':' + job_id)[:12]}"
    api.create_repo(output_repo, repo_type="model", private=True, exist_ok=True, token=token)
    api.upload_folder(repo_id=output_repo, folder_path=str(output_dir), repo_type="model", token=token)
    info = api.model_info(output_repo, token=token)
    model_revision = clean(getattr(info, "sha", None), 120)
    artifact_hash = directory_hash(output_dir)
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
    }
    callback({"claim": "trained_artifact_registered", **common})
    callback({
        "claim": "rollback_artifact_registered",
        **common,
        "rollbackArtifactRef": f"hf://models/{base_model}",
    })


def main() -> int:
    envelope = parse_request()
    operation = clean(envelope.get("operation"), 40)
    if operation == "generate_teacher_dataset":
        generate_teacher_dataset(envelope)
    elif operation == "materialize_teacher_dataset":
        materialize_teacher_dataset(envelope)
    elif operation == "prepare_dataset":
        prepare_dataset(envelope)
    elif operation == "train":
        train(envelope)
    else:
        raise RuntimeError("worker_operation_invalid")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"itmounts_hf_worker_error:{type(exc).__name__}:{exc}", file=sys.stderr, flush=True)
        raise
