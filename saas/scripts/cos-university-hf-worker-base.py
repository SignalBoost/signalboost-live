# saas/scripts/cos-university-hf-worker-base.py
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


MASS_HOLDOUT_MAX_ITEMS = 6


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


def supervised_pair(row: dict[str, Any], text: str) -> tuple[str, str]:
    prompt = clean(row.get("prompt"), 100_000)
    response = clean(row.get("response"), 100_000)
    if not prompt or not response:
        messages = row.get("messages")
        if isinstance(messages, list):
            for message in messages:
                if not isinstance(message, dict):
                    continue
                role = clean(message.get("role"), 40).lower()
                content = clean(message.get("content"), 100_000)
                if role == "user" and content and not prompt:
                    prompt = content
                elif role == "assistant" and content:
                    response = content
    if (not prompt or not response) and text:
        user_marker = "<user>\n"
        assistant_marker = "\n\n<assistant>\n"
        user_at = 0 if text.startswith(user_marker) else text.find("\n\n" + user_marker)
        if user_at >= 0:
            candidate = text[user_at + (0 if user_at == 0 else 2):]
            assistant_at = candidate.find(assistant_marker)
            if candidate.startswith(user_marker) and assistant_at > len(user_marker):
                prompt = prompt or clean(candidate[len(user_marker):assistant_at], 100_000)
                response = response or clean(candidate[assistant_at + len(assistant_marker):], 100_000)
    return prompt, response


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
        or clean(teacher.get("license"), 80).lower() != "apache-2.0"
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
        "teacherRows": [
            {
                "promptId": row["prompt_id"],
                "prompt": row["prompt"],
                "response": row["response"],
                "text": row["text"],
                "itemHash": row["item_hash"],
            }
            for row in rows
        ],
        "promptSetHash": prompt_set_hash,
        "teacherModelId": teacher_id,
        "teacherModelRevision": teacher_revision,
        "studentModelId": student_id,
        "studentModelRevision": student_revision,
        "trainingRights": "open_license",
        "studentControlledByBuyer": True,
        "containsPrivateProductionData": False,
    })


def prepare_dataset(envelope: dict[str, Any]) -> None:
    from datasets import Dataset, DatasetDict, load_dataset
    from huggingface_hub import HfApi

    candidate = envelope.get("candidate") if isinstance(envelope.get("candidate"), dict) else {}
    token = os.environ["HF_TOKEN"]
    max_items = max(20, min(20_000, int(os.environ.get("ITMOUNTS_HF_MAX_DATASET_ITEMS", "5000"))))
    embedded_rows = candidate.get("teacherRows") if isinstance(candidate.get("teacherRows"), list) else None
    working_cos_rows = candidate.get("workingCosRows") if isinstance(candidate.get("workingCosRows"), list) else None
    if embedded_rows is not None and working_cos_rows is not None:
        raise RuntimeError("worker_embedded_source_ambiguous")
    if working_cos_rows is not None:
        if len(working_cos_rows) < 20 or len(working_cos_rows) > 384:
            raise RuntimeError("worker_working_cos_rows_invalid")
        source = working_cos_rows[:max_items]
        training_seen = 0
        holdout_seen = 0
        for raw_row in source:
            if not isinstance(raw_row, dict):
                raise RuntimeError("worker_working_cos_row_invalid")
            text = row_text(raw_row)
            declared_hash = clean(raw_row.get("itemHash"), 64).lower()
            partition = clean(raw_row.get("partition"), 20)
            if (not text or not HEX64.match(declared_hash) or sha256(text) != declared_hash
                    or partition not in ("train", "holdout")
                    or not HEX64.match(clean(raw_row.get("assetSetKey"), 64).lower())
                    or not HEX64.match(clean(raw_row.get("portableContentHash"), 64).lower())
                    or not clean(raw_row.get("subjectId"), 240)):
                raise RuntimeError("worker_working_cos_row_binding_invalid")
            if partition == "train":
                training_seen += 1
            else:
                holdout_seen += 1
        if training_seen < 8 or holdout_seen < 2:
            raise RuntimeError("worker_working_cos_partition_too_small")
    elif embedded_rows is not None:
        if len(embedded_rows) < 20 or len(embedded_rows) > 128:
            raise RuntimeError("worker_embedded_teacher_rows_invalid")
        source = embedded_rows[:max_items]
        for raw_row in source:
            if not isinstance(raw_row, dict):
                raise RuntimeError("worker_embedded_teacher_row_invalid")
            text = row_text(raw_row)
            declared_hash = clean(raw_row.get("itemHash"), 64).lower()
            if not text or not HEX64.match(declared_hash) or sha256(text) != declared_hash:
                raise RuntimeError("worker_embedded_teacher_row_hash_mismatch")
    else:
        repo_id, revision, split = parse_dataset_ref(candidate.get("source"))
        source = load_dataset(repo_id, revision=revision, split=split, token=token)
        source = source.select(range(min(len(source), max_items)))

    # Preserve prompt/response structure alongside immutable source text. Hashes and partition
    # manifests continue to bind only text, so structure cannot rewrite dataset identity or move
    # an item between train and holdout.
    by_hash: dict[str, dict[str, Any]] = {}
    for raw_row in source:
        if not isinstance(raw_row, dict):
            continue
        text = row_text(raw_row)
        if not text:
            continue
        prompt, response = supervised_pair(raw_row, text)
        # A training/holdout row without both sides of a supervised pair cannot be graded later.
        # Do not partition canonical JSON or answer-only material into a supervised dataset.
        if not prompt or not response:
            continue
        digest = sha256(text)
        by_hash.setdefault(digest, {
            "text": text,
            "item_hash": digest,
            "prompt": prompt,
            "response": response,
            # Provenance is metadata only: partition identity remains the immutable response-text hash.
            # Only the host controller may set this exact boolean from persisted curriculum source_kind.
            "failure_derived": raw_row.get("failureDerived") is True,
            "working_cos_partition": clean(raw_row.get("partition"), 20) if working_cos_rows is not None else "",
            "working_cos_subject": clean(raw_row.get("subjectId"), 240) if working_cos_rows is not None else "",
            "working_cos_asset_set_key": clean(raw_row.get("assetSetKey"), 64).lower() if working_cos_rows is not None else "",
            "working_cos_portable_content_hash": clean(raw_row.get("portableContentHash"), 64).lower() if working_cos_rows is not None else "",
        })
    if len(by_hash) < 20:
        raise RuntimeError("worker_dataset_too_small")

    ordered = sorted(by_hash.items(), key=lambda item: item[0])
    if working_cos_rows is not None:
        training_pairs = [item for item in ordered if item[1].get("working_cos_partition") == "train"]
        holdout_pairs = [item for item in ordered if item[1].get("working_cos_partition") == "holdout"]
        expected_training_manifest = clean(envelope.get("expectedTrainingManifestHash"), 64).lower()
        expected_holdout_manifest = clean(envelope.get("expectedHoldoutManifestHash"), 64).lower()
        if (not HEX64.match(expected_training_manifest)
                or not HEX64.match(expected_holdout_manifest)
                or expected_training_manifest == expected_holdout_manifest):
            raise RuntimeError("worker_working_cos_expected_manifest_invalid")
        if manifest_hash([digest for digest, _ in training_pairs]) != expected_training_manifest:
            raise RuntimeError("worker_working_cos_training_manifest_mismatch")
        if manifest_hash([digest for digest, _ in holdout_pairs]) != expected_holdout_manifest:
            raise RuntimeError("worker_working_cos_holdout_manifest_mismatch")
    else:
        # Mass-distillation holdouts are capped at MASS_HOLDOUT_MAX_ITEMS. The mass evaluator grades a
        # holdout inside a fixed call ceiling behind a ~40s serverless gateway: the baseline in at most two
        # requests (a 6-case holdout is 3+3) and the slower candidate one request per case. Larger
        # holdouts push several cases into one baseline request, where Production showed answers late in a
        # shared request degrading by position, which would bias the comparison toward the candidate.
        # Capping the holdout rather than the batch lets a full 128-item batch train on ~122 examples.
        # Single-artifact lanes keep the proportional split; their evaluator chunks larger holdouts.
        proportional = len(ordered) // 5
        if clean(envelope.get("candidateId"), 200).startswith("mass:"):
            holdout_count = max(1, min(proportional, MASS_HOLDOUT_MAX_ITEMS))
            failure_derived_pairs = [item for item in ordered if item[1].get("failure_derived") is True]
            ordinary_pairs = [item for item in ordered if item[1].get("failure_derived") is not True]
            if len(failure_derived_pairs) >= 20:
                # Remediation artifacts must preserve at least 20 verified failure-derived examples
                # in TRAINING. Prefer ordinary rows for the independent holdout; only consume
                # failure-derived rows if necessary, and never below the training floor.
                holdout_pairs = ordinary_pairs[:holdout_count]
                remaining_holdout = holdout_count - len(holdout_pairs)
                max_failure_holdout = max(0, len(failure_derived_pairs) - 20)
                if remaining_holdout > max_failure_holdout:
                    raise RuntimeError(
                        f"worker_remediation_training_floor_unreachable:{len(failure_derived_pairs)}/{holdout_count}"
                    )
                if remaining_holdout > 0:
                    holdout_pairs = holdout_pairs + failure_derived_pairs[:remaining_holdout]
                holdout_hashes = {digest for digest, _ in holdout_pairs}
                training_pairs = [item for item in ordered if item[0] not in holdout_hashes]
                replay_training_rows = sum(1 for _, row in training_pairs if row.get("failure_derived") is True)
                if replay_training_rows < 20:
                    raise RuntimeError(f"worker_remediation_training_floor_missed:{replay_training_rows}")
            else:
                holdout_pairs = ordered[:holdout_count]
                training_pairs = ordered[holdout_count:]
        else:
            holdout_count = max(1, min(proportional, 500))
            holdout_pairs = ordered[:holdout_count]
            training_pairs = ordered[holdout_count:]
    if not training_pairs or not holdout_pairs:
        raise RuntimeError("worker_partition_invalid")

    training = Dataset.from_list([row for _, row in training_pairs])
    holdout = Dataset.from_list([row for _, row in holdout_pairs])

    api = HfApi(token=token)
    namespace = api.whoami()["name"]
    candidate_id = clean(envelope.get("candidateId"), 200)

    # Reuse the buyer-owned private training-repository pool. Creating one repository per batch
    # hit Hugging Face's 300-repositories/day creation limit in Production on 2026-09-20 and
    # stopped preparation even though storage itself was healthy. Every dataset remains immutable
    # to downstream training because callbacks pin the exact Hub commit revision below.
    existing_training_repos = sorted({
        clean(getattr(dataset, "id", None), 240)
        for dataset in api.list_datasets(
            author=namespace,
            search="itmounts-training-",
            limit=500,
            token=token,
        )
        if clean(getattr(dataset, "id", None), 240).startswith(f"{namespace}/itmounts-training-")
    })
    if existing_training_repos:
        pool_index = int(sha256(candidate_id)[:8], 16) % len(existing_training_repos)
        output_repo = existing_training_repos[pool_index]
    else:
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
    base_model_revision = clean(envelope.get("baseModelRevision"), 40).lower()
    if not HEX64.match(dataset_hash) or not base_model:
        raise RuntimeError("worker_dataset_identity_invalid")
    if base_model_revision and not HEX40.match(base_model_revision):
        raise RuntimeError("worker_dataset_base_revision_invalid")

    callback({
        "claim": "partition_manifests_registered",
        "candidateId": candidate_id,
        "jobId": job_id,
        "evidenceRef": f"hf://datasets/{output_repo}@{pinned_revision}",
        "baseModel": base_model,
        "baseModelRevision": base_model_revision,
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
    base_model_revision = clean(revision.get("baseModelRevision"), 40).lower()
    dataset_hash = clean(revision.get("datasetHash"), 64).lower()
    training_manifest = clean(revision.get("trainingManifestHash"), 64).lower()
    holdout_manifest = clean(revision.get("holdoutManifestHash"), 64).lower()
    if not base_model or not all(HEX64.match(value) for value in (dataset_hash, training_manifest, holdout_manifest)):
        raise RuntimeError("worker_revision_invalid")
    if base_model_revision and not HEX40.match(base_model_revision):
        raise RuntimeError("worker_base_model_revision_invalid")

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
    tokenizer = AutoTokenizer.from_pretrained(base_model, revision=base_model_revision or None, token=token, use_fast=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        revision=base_model_revision or None,
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
        "baseModelRevision": base_model_revision,
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
