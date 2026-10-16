#!/usr/bin/env python3
"""Import an iTMounts customer holdout summary into the REAL open-source MLflow engine.

Default is an explicitly selected local filesystem tracking store. No paid service,
no customer credentials, no raw prompts or answers, no automatic external upload.
For remote MLflow, operator MUST pass --allow-remote and choose URI themselves.
"""
import argparse
import json
import math
import re
from pathlib import Path
from urllib.parse import urlsplit

SCHEMA = "itmounts.customer_holdout_exact_match.v1"
FIELDS = ("count", "baseCorrect", "trainedCorrect", "baseAccuracy", "trainedAccuracy", "delta")
RUN_RE = re.compile(r"^[a-zA-Z0-9_.:-]{1,128}$")

def validated_evidence(payload):
    if not isinstance(payload, dict) or payload.get("schema") != SCHEMA:
        raise ValueError("unsupported evidence schema")
    if payload.get("provenance") != "customer_supplied_not_independently_verified":
        raise ValueError("evidence provenance is not a customer-supplied holdout")
    if payload.get("execution") != "no_provider_inference_performed":
        raise ValueError("unsupported evaluation execution")
    run_id = payload.get("trainingRunId")
    if not isinstance(run_id, str) or not RUN_RE.fullmatch(run_id):
        raise ValueError("invalid training run identifier")
    models = payload.get("models")
    if not isinstance(models, dict) or any(not isinstance(models.get(k), str) or not models[k].strip() or len(models[k]) > 240 for k in ("base", "trained")):
        raise ValueError("invalid model evidence")
    if not isinstance(payload.get("count"), int) or isinstance(payload["count"], bool) or not (1 <= payload["count"] <= 100000):
        raise ValueError("invalid sample count")
    for key in ("baseCorrect", "trainedCorrect"):
        v = payload.get(key)
        if not isinstance(v, int) or isinstance(v, bool) or not (0 <= v <= payload["count"]):
            raise ValueError("invalid correct count")
    for key in ("baseAccuracy", "trainedAccuracy", "delta"):
        v = payload.get(key)
        if not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v):
            raise ValueError("invalid metric")
    if abs(payload["baseAccuracy"] - payload["baseCorrect"] / payload["count"]) > 1e-6 or abs(payload["trainedAccuracy"] - payload["trainedCorrect"] / payload["count"]) > 1e-6:
        raise ValueError("inconsistent accuracy evidence")
    if abs(payload["delta"] - (payload["trainedAccuracy"] - payload["baseAccuracy"])) > 1e-6:
        raise ValueError("inconsistent delta evidence")
    return payload

def import_evidence(payload, tracking_uri, experiment, allow_remote=False, mlflow_module=None):
    data = validated_evidence(payload)
    parsed = urlsplit(tracking_uri)
    if parsed.scheme not in ("file", "http", "https"):
        raise ValueError("tracking URI must be file, https or explicitly approved http")
    remote = parsed.scheme in ("http", "https")
    if remote and not allow_remote:
        raise ValueError("remote transmission requires --allow-remote")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("credentials and query data must not appear in tracking URI")
    if remote and (not parsed.hostname or parsed.hostname in ("localhost", "127.0.0.1") and parsed.scheme != "http"):
        raise ValueError("invalid tracking host")
    if not experiment.strip() or len(experiment) > 100:
        raise ValueError("invalid experiment")
    if mlflow_module is None:
        try:
            import mlflow as mlflow_module
        except ImportError as error:
            raise RuntimeError("Install the actual engine: python -m pip install -r scripts/lab-mlflow-requirements.txt") from error
    mlflow_module.set_tracking_uri(tracking_uri)
    mlflow_module.set_experiment(experiment)
    with mlflow_module.start_run(run_name="itmounts-holdout-" + data["trainingRunId"][:48]):
        mlflow_module.set_tags({
            "itmounts.evidence_schema": SCHEMA,
            "itmounts.provenance": data["provenance"],
            "itmounts.verification": "self_reported_not_independently_verified",
            "itmounts.training_run_id": data["trainingRunId"],
            "itmounts.base_model": data["models"]["base"],
            "itmounts.trained_model": data["models"]["trained"],
        })
        mlflow_module.log_metrics({
            "holdout_count": float(data["count"]),
            "holdout_base_exact_match": float(data["baseAccuracy"]),
            "holdout_trained_exact_match": float(data["trainedAccuracy"]),
            "holdout_delta_exact_match": float(data["delta"]),
        })

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--evidence", required=True, type=Path)
    p.add_argument("--tracking-uri", default="file:./mlruns")
    p.add_argument("--experiment", default="iTMounts Customer LAB")
    p.add_argument("--allow-remote", action="store_true", help="I explicitly approve export of model identifiers and metrics to the specified MLflow server")
    args = p.parse_args()
    if args.evidence.stat().st_size > 65536:
        p.error("evidence exceeds 64KB")
    payload = json.loads(args.evidence.read_text(encoding="utf-8"))
    import_evidence(payload, args.tracking_uri, args.experiment, args.allow_remote)
    print("Imported self-reported holdout metrics into MLflow. No independent model evaluation was performed.")

if __name__ == "__main__":
    main()
