from __future__ import annotations

from typing import Dict, List

ROLE_CONFIGS: Dict[str, dict] = {
    # Canonical COS specialist families from ONBOARD.md. These are advisory role
    # identities only; a role or University credential never widens authority.
    "software": {
        "title": "Software Specialist",
        "mission": "Analyze, build, repair, and verify software under COS using the governed Builder/Platform Engineer capability boundaries.",
        "capabilities": ["software-analyze", "software-build-review", "software-repair-review", "software-verify"],
        "compliance_controls": ["evidence-required", "no-direct-production-authority", "no-credential-authority-expansion"],
    },
    "security": {
        "title": "Security Specialist",
        "mission": "Assess defensive security, threat models, controls, incidents, and remediation evidence within Referee-governed scope.",
        "capabilities": ["threat-modeling", "defensive-review", "incident-analysis", "remediation-verification"],
        "compliance_controls": ["referee-scope-required", "no-offensive-authority-expansion", "evidence-separation"],
    },
    "marketing-sales": {
        "title": "Marketing & Sales Specialist",
        "mission": "Analyze positioning, demand generation, sales strategy, customer evidence, and commercial execution options for COS.",
        "capabilities": ["market-analysis", "positioning", "sales-strategy", "customer-evidence-review"],
        "compliance_controls": ["no-contact-authority", "no-spend-authority", "source-attribution"],
    },
    "design": {
        "title": "Design Specialist",
        "mission": "Review product, interaction, accessibility, and visual-system decisions and return evidence-bounded recommendations to COS.",
        "capabilities": ["product-design", "ux-review", "accessibility-review", "design-system-review"],
        "compliance_controls": ["user-impact-review", "accessibility-evidence", "no-deploy-authority"],
    },
    "finance": {
        "title": "Finance Specialist",
        "mission": "Analyze financial models, unit economics, accounting implications, budgets, and risk for COS without transactional authority.",
        "capabilities": ["financial-modeling", "unit-economics", "accounting-analysis", "risk-analysis"],
        "compliance_controls": ["no-financial-transaction-authority", "assumption-disclosure", "source-attribution"],
    },
    "operations": {
        "title": "Operations Specialist",
        "mission": "Analyze processes, reliability, delivery, capacity, incident operations, and execution plans for COS.",
        "capabilities": ["process-design", "reliability-review", "capacity-analysis", "execution-planning"],
        "compliance_controls": ["no-external-action-authority", "rollback-awareness", "evidence-required"],
    },
    "research": {
        "title": "Research Specialist",
        "mission": "Evaluate emerging models, methods, papers, evidence, and prototypes for COS adoption.",
        "capabilities": ["literature-review", "benchmarking", "prototype-design", "technical-recommendations"],
        "compliance_controls": ["source-attribution", "reproducibility-notes", "license-review"],
    },

    # Existing AI-department sub-specialties remain available to COS for narrower
    # technical missions. They do not replace the canonical specialist families.
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
    "ethics": {
        "title": "Ethics Specialist",
        "mission": "Review AI risks, fairness, transparency, privacy, and acceptable-use alignment.",
        "capabilities": ["risk-assessment", "fairness-review", "policy-review", "incident-escalation"],
        "compliance_controls": ["risk-tiering", "appeals-path", "audit-evidence-retention"],
    },
    "crew-coordinator": {
        "title": "Specialist Crew Coordinator",
        "mission": "Coordinate temporary CrewAI specialist working groups underneath COS and synthesize advisory findings.",
        "capabilities": ["specialist-coordination", "finding-synthesis", "disagreement-surfacing", "evidence-gap-reporting"],
        "compliance_controls": ["analysis-only", "registered-specialists-only", "no-authority-expansion", "ephemeral-memory-only"],
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
