from __future__ import annotations

from typing import Dict, List

ROLE_CONFIGS: Dict[str, dict] = {
    "ml-engineer": {
        "title": "ML Engineer",
        "mission": "Train, evaluate, package, and serve COS machine-learning models.",
        "capabilities": ["model-training", "model-evaluation", "feature-store-integration", "model-registry"],
        "compliance_controls": ["model-card-required", "dataset-lineage-required", "bias-evaluation-required"],
    },
    "ai-engineer": {
        "title": "AI Engineer",
        "mission": "Build production AI workflows, agent tools, retrieval pipelines, and model integrations.",
        "capabilities": ["agent-orchestration", "rag-pipelines", "prompt-management", "tool-calling"],
        "compliance_controls": ["prompt-audit-log", "pii-redaction", "human-approval-for-high-risk-actions"],
    },
    "architect": {
        "title": "Architect",
        "mission": "Govern COS AI platform topology, integration contracts, and reliability standards.",
        "capabilities": ["system-design", "api-contracts", "capacity-planning", "resilience-review"],
        "compliance_controls": ["architecture-decision-record", "threat-model-review", "slo-review"],
    },
    "data-scientist": {
        "title": "Data Scientist",
        "mission": "Generate insights, experiments, forecasts, and decision support for COS operations.",
        "capabilities": ["experimentation", "forecasting", "causal-analysis", "notebook-to-pipeline"],
        "compliance_controls": ["experiment-registry", "statistical-validity-check", "data-minimization"],
    },
    "data-engineer": {
        "title": "Data Engineer",
        "mission": "Operate ingestion, transformation, quality, and lineage pipelines for AI-ready data.",
        "capabilities": ["etl", "stream-processing", "data-quality", "lineage"],
        "compliance_controls": ["schema-contracts", "retention-policy", "access-control-review"],
    },
    "research": {
        "title": "Research",
        "mission": "Evaluate emerging models, methods, papers, and prototypes for COS adoption.",
        "capabilities": ["literature-review", "benchmarking", "prototype-design", "technical-recommendations"],
        "compliance_controls": ["source-attribution", "reproducibility-notes", "license-review"],
    },
    "ethics": {
        "title": "Ethics",
        "mission": "Review AI risks, fairness, transparency, privacy, and acceptable-use alignment.",
        "capabilities": ["risk-assessment", "fairness-review", "policy-review", "incident-escalation"],
        "compliance_controls": ["risk-tiering", "appeals-path", "audit-evidence-retention"],
    },
}


def get_role_config(role: str) -> dict:
    normalized = role.strip().lower()
    if normalized not in ROLE_CONFIGS:
        supported = ", ".join(sorted(ROLE_CONFIGS))
        raise ValueError(f"Unsupported COS AI role '{role}'. Supported roles: {supported}")
    return ROLE_CONFIGS[normalized]


def supported_roles() -> List[str]:
    return sorted(ROLE_CONFIGS)
