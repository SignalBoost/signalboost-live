from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Dict, List

SENSITIVE_KEYS = {"password", "secret", "token", "api_key", "authorization", "ssn"}


def redact_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    redacted: Dict[str, Any] = {}
    for key, value in payload.items():
        if key.lower() in SENSITIVE_KEYS:
            redacted[key] = "[REDACTED]"
        elif isinstance(value, dict):
            redacted[key] = redact_payload(value)
        else:
            redacted[key] = value
    return redacted


def build_audit_event(role: str, action: str, payload: Dict[str, Any], controls: List[str]) -> Dict[str, Any]:
    safe_payload = redact_payload(payload)
    evidence_hash = sha256(repr(sorted(safe_payload.items())).encode("utf-8")).hexdigest()
    return {
        "role": role,
        "action": action,
        "controls": controls,
        "payload": safe_payload,
        "evidence_hash": evidence_hash,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def assess_compliance(controls: List[str], payload: Dict[str, Any]) -> Dict[str, Any]:
    missing_evidence = [control for control in controls if control not in payload.get("evidence", [])]
    return {
        "status": "approved" if not missing_evidence else "needs_review",
        "required_controls": controls,
        "missing_evidence": missing_evidence,
    }
